import { describe, expect, it } from "vitest";
import {
  BUILTIN_TERMINATION_CONDITIONS,
  SafetyPolicyGate,
  TerminationError,
  applyTerminationApproval,
  assessTermination,
  releaseOrganization,
} from "../src/index.ts";
import type { OrganizationRunState, SafetyViolation } from "../src/index.ts";
import { makeOrgDraft } from "./fixtures.ts";

/**
 * NET-NEW (P3-W1): organization termination and safety policy (FROZEN §7
 * "termination and safety policy"). Deterministic, fail-closed evaluation:
 * unknown conditions terminate; approval-required terminations need an
 * approval artifact; an unverifiable safety policy blocks every action.
 */

const T0 = 5_000_000;

function violation(overrides: Partial<SafetyViolation> = {}): SafetyViolation {
  return {
    violationId: "viol-1",
    constraintId: "no-unmandated-beneficiary-change",
    instanceId: "instance-payer",
    detail: "beneficiary changed without a mandate",
    occurredAt: T0,
    ...overrides,
  };
}

function runState(overrides: Partial<OrganizationRunState> = {}): OrganizationRunState {
  return {
    orgId: "org:payops-1",
    orgVersion: 1,
    exhaustedBudgetIds: [],
    violations: [],
    recordedAt: T0,
    ...overrides,
  };
}

describe("assessTermination — built-in conditions", () => {
  it("no triggered conditions => keep running", () => {
    const org = releaseOrganization(makeOrgDraft(), 4_000_000);
    const assessment = assessTermination(org, runState());
    expect(assessment.shouldTerminate).toBe(false);
    expect(assessment.triggeredConditions).toEqual([]);
    expect(assessment.humanApprovalRequired).toBe(false);
  });

  it("budget-exhausted and safety-violation trigger termination (with human approval)", () => {
    const org = releaseOrganization(makeOrgDraft(), 4_000_000);
    const byBudget = assessTermination(
      org,
      runState({ exhaustedBudgetIds: ["budget-1"] }),
    );
    expect(byBudget.shouldTerminate).toBe(true);
    expect(byBudget.triggeredConditions).toEqual(["budget-exhausted"]);
    expect(byBudget.humanApprovalRequired).toBe(true); // policy requires approval

    const byViolation = assessTermination(org, runState({ violations: [violation()] }));
    expect(byViolation.shouldTerminate).toBe(true);
    expect(byViolation.triggeredConditions).toEqual(["safety-violation"]);
  });

  it("deadline-elapsed triggers only at/after the declared deadline instant", () => {
    const org = releaseOrganization(
      makeOrgDraft({ termination: { conditions: ["deadline-elapsed"], requiresHumanApproval: false } }),
      4_000_000,
    );
    const before = assessTermination(
      org,
      runState({ recordedAt: 999, deadlineElapsedAt: 1000 }),
    );
    expect(before.shouldTerminate).toBe(false);
    const after = assessTermination(
      org,
      runState({ recordedAt: 1000, deadlineElapsedAt: 1000 }),
    );
    expect(after.shouldTerminate).toBe(true);
    expect(after.humanApprovalRequired).toBe(false);
  });

  it("an unknown condition FAILS CLOSED: the run must terminate", () => {
    const org = releaseOrganization(
      makeOrgDraft({ termination: { conditions: ["some-future-condition"], requiresHumanApproval: false } }),
      4_000_000,
    );
    const assessment = assessTermination(org, runState());
    expect(assessment.shouldTerminate).toBe(true);
    expect(assessment.triggeredConditions).toEqual(["unknown-condition:some-future-condition"]);
  });

  it("run states never cross organization versions", () => {
    const org = releaseOrganization(makeOrgDraft(), 4_000_000);
    expect(() => assessTermination(org, runState({ orgVersion: 2 }))).toThrow(
      /never crosses organization versions/,
    );
    expect(() => assessTermination(org, runState({ orgId: "org:other" }))).toThrow(
      TerminationError,
    );
  });

  it("extra registered conditions extend the built-in vocabulary deterministically", () => {
    const org = releaseOrganization(
      makeOrgDraft({ termination: { conditions: ["custom-condition"], requiresHumanApproval: false } }),
      4_000_000,
    );
    const assessment = assessTermination(
      org,
      runState(),
      { "custom-condition": () => true },
    );
    expect(assessment.shouldTerminate).toBe(true);
    expect(assessment.triggeredConditions).toEqual(["custom-condition"]);
    expect(Object.keys(BUILTIN_TERMINATION_CONDITIONS).sort()).toEqual([
      "budget-exhausted",
      "deadline-elapsed",
      "safety-violation",
    ]);
  });
});

describe("applyTerminationApproval — human approval law", () => {
  it("an approval-required termination becomes effective only with the artifact reference", () => {
    const org = releaseOrganization(makeOrgDraft(), 4_000_000);
    const assessment = assessTermination(
      org,
      runState({ violations: [violation()] }),
    );
    expect(assessment.shouldTerminate).toBe(true);
    expect(assessment.approvalArtifactRef).toBeUndefined();
    const approved = applyTerminationApproval(assessment, "approval:art-1");
    expect(approved.approvalArtifactRef).toBe("approval:art-1");
    expect(approved.shouldTerminate).toBe(true);
  });

  it("approvals are rejected for non-terminating or approval-free assessments, and empty refs", () => {
    const org = releaseOrganization(makeOrgDraft(), 4_000_000);
    const healthy = assessTermination(org, runState());
    expect(() => applyTerminationApproval(healthy, "approval:art-1")).toThrow(
      /non-terminating/,
    );
    const autoTerm = assessTermination(
      releaseOrganization(
        makeOrgDraft({ termination: { conditions: ["safety-violation"], requiresHumanApproval: false } }),
        4_000_000,
      ),
      runState({ violations: [violation()] }),
    );
    expect(() => applyTerminationApproval(autoTerm, "approval:art-1")).toThrow(
      /does not require one/,
    );
    const needsApproval = assessTermination(org, runState({ violations: [violation()] }));
    expect(() => applyTerminationApproval(needsApproval, "")).toThrow(/must not be empty/);
  });
});

describe("SafetyPolicyGate — hard constraints fail closed", () => {
  it("permits an action when every declared constraint check passes", () => {
    const org = releaseOrganization(makeOrgDraft(), 4_000_000);
    const gate = new SafetyPolicyGate(org, {
      "no-unmandated-beneficiary-change": (action) => action !== "beneficiary.change",
    });
    expect(gate.unresolvedConstraints()).toEqual([]);
    expect(gate.checkAction("payments.initiate")).toEqual([]);
    expect(gate.checkAction("beneficiary.change")).toEqual([
      "no-unmandated-beneficiary-change",
    ]);
  });

  it("an UNREGISTERED hard constraint blocks EVERY action (unverifiable policy)", () => {
    const org = releaseOrganization(
      makeOrgDraft({
        safetyPolicy: {
          hardConstraints: ["no-unmandated-beneficiary-change", "some-unknown-constraint"],
          escalationSurfaceRef: "surface:trusted-approval",
        },
      }),
      4_000_000,
    );
    const gate = new SafetyPolicyGate(org, {
      "no-unmandated-beneficiary-change": () => true,
    });
    expect(gate.unresolvedConstraints()).toEqual(["some-unknown-constraint"]);
    // fail closed: the whole declared policy is reported as violated
    expect(gate.checkAction("payments.initiate")).toEqual([
      "no-unmandated-beneficiary-change",
      "some-unknown-constraint",
    ]);
  });

  it("multiple violated constraints are all reported, in declared order", () => {
    const org = releaseOrganization(
      makeOrgDraft({
        safetyPolicy: {
          hardConstraints: ["c-a", "c-b", "c-c"],
          escalationSurfaceRef: "surface:trusted-approval",
        },
      }),
      4_000_000,
    );
    const gate = new SafetyPolicyGate(org, {
      "c-a": (action) => action !== "x",
      "c-b": () => false,
      "c-c": (action) => action !== "y",
    });
    // "x" violates c-a (excluded action) and c-b (always false); passes c-c.
    expect(gate.checkAction("x")).toEqual(["c-a", "c-b"]);
    // "y" violates c-b and c-c; passes c-a.
    expect(gate.checkAction("y")).toEqual(["c-b", "c-c"]);
    // "z" violates only the always-false c-b.
    expect(gate.checkAction("z")).toEqual(["c-b"]);
  });
});
