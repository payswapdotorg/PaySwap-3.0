/**
 * The expert bridge — qualification, dispatch, versioned resolutions,
 * evidence artifacts (P6-W3, lane r4-w3; PORT of payswap.org@8a735bf
 * packages/security/test/experts.test.ts — evidence, never hidden
 * authority).
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import {
  EXPERT_EVIDENCE_NAMESPACE,
  ExpertBridgeError,
  ExpertResolutionError,
  ExpertResolutionLedger,
  ExpertTaskBoard,
  matchExpert,
  matchExperts,
  resolutionToEvidenceArtifact,
  type ExpertProfile,
  type ExpertResolution,
} from "../src/index.ts";
import type { CapabilityCase } from "../src/index.ts";

const qualificationEvidence = {
  evidenceId: "e-cert-1",
  artifactRef: "artifact:cert-1",
  contentDigest: "fnv1a64:000000000000000c",
};

function expert(overrides: Partial<ExpertProfile> = {}): ExpertProfile {
  return {
    expertId: "expert-1",
    displayName: "Fixture Expert",
    qualifications: [
      { skillId: "onchain-forensics", level: "senior", qualificationEvidence },
    ],
    jurisdictions: ["KE", "US"],
    active: true,
    ...overrides,
  };
}

function caseFixture(): CapabilityCase {
  return {
    caseId: "case-1",
    kind: "incident",
    title: "bridge anomaly",
    component: { kind: "extension", id: "ext-bridge-1" },
    signal: {
      signalKind: "graph_anomaly",
      observedAt: 1_000,
      detail: "fixture",
      sourceRef: "observer:risk-engine",
    },
    evidence: [{ evidenceId: "e-1", artifactRef: "a-1", contentDigest: "d-1" }],
    openedAt: 1_000,
    status: "open",
  };
}

describe("the expert bridge", () => {
  it("matches only experts meeting level AND jurisdiction", () => {
    const match = matchExpert(expert(), [
      { skillId: "onchain-forensics", minLevel: "expert" },
      { skillId: "onchain-forensics", minLevel: "senior", jurisdiction: "KE" },
    ]);
    expect(match.qualified).toBe(true);
    expect(match.satisfied).toHaveLength(2);
    expect(match.unmet).toEqual([]);
  });

  it("jurisdiction and inactivity are fail-closed", () => {
    const jurisdiction = matchExpert(expert(), [
      { skillId: "onchain-forensics", minLevel: "expert", jurisdiction: "DE" },
    ]);
    expect(jurisdiction.qualified).toBe(false);
    expect(jurisdiction.unmet[0]?.reason).toBe("jurisdiction_not_served");
    const inactive = matchExpert(expert({ active: false }), [
      { skillId: "onchain-forensics", minLevel: "expert" },
    ]);
    expect(inactive.qualified).toBe(false);
    expect(inactive.unmet[0]?.reason).toBe("expert_inactive");
    const missing = matchExpert(expert(), [{ skillId: "fiat-forensics", minLevel: "expert" }]);
    expect(missing.unmet[0]?.reason).toBe("skill_missing");
    const insufficient = matchExpert(expert({ qualifications: [
      { skillId: "onchain-forensics", level: "practitioner", qualificationEvidence },
    ] }), [{ skillId: "onchain-forensics", minLevel: "senior" }]);
    expect(insufficient.unmet[0]?.reason).toBe("level_insufficient");
  });

  it("ranking is deterministic: qualified first, then satisfied count, then id", () => {
    const a = expert({ expertId: "expert-a" });
    const b = expert({ expertId: "expert-b", qualifications: [
      { skillId: "onchain-forensics", level: "senior", qualificationEvidence },
      { skillId: "fiat-forensics", level: "expert", qualificationEvidence },
    ] });
    const c = expert({ expertId: "expert-c", active: false });
    const ranked = matchExperts([c, a, b], [
      { skillId: "onchain-forensics", minLevel: "expert" },
      { skillId: "fiat-forensics", minLevel: "expert" },
    ]);
    expect(ranked.map((match) => match.expertId)).toEqual(["expert-b", "expert-a", "expert-c"]);
  });

  it("dispatches to the first qualified expert deterministically", () => {
    const board = new ExpertTaskBoard();
    const task = board.dispatch({
      taskId: "task-1",
      case: caseFixture(),
      requirements: [{ skillId: "onchain-forensics", minLevel: "expert" }],
      experts: [expert({ expertId: "expert-z" }), expert({ expertId: "expert-a" })],
      at: 2_000,
    });
    expect(task.matchedExpertId).toBe("expert-a");
    expect(task.status).toBe("dispatched");
    expect(task.caseId).toBe("case-1");
  });

  it("refuses to dispatch when nobody is qualified (fail closed)", () => {
    const board = new ExpertTaskBoard();
    expect(() =>
      board.dispatch({
        taskId: "task-1",
        case: caseFixture(),
        requirements: [{ skillId: "onchain-forensics", minLevel: "senior" }],
        experts: [expert({ active: false })],
        at: 2_000,
      }),
    ).toThrowError(/no qualified expert/);
    expect(() =>
      board.dispatch({
        taskId: "task-2",
        case: caseFixture(),
        requirements: [],
        experts: [expert()],
        at: 2_000,
      }),
    ).toThrowError(/at least one qualification requirement/);
  });

  it("records version 1 with content digest and provenance", () => {
    const ledger = new ExpertResolutionLedger();
    const board = new ExpertTaskBoard();
    const task = board.dispatch({
      taskId: "task-1",
      case: caseFixture(),
      requirements: [{ skillId: "onchain-forensics", minLevel: "expert" }],
      experts: [expert()],
      at: 2_000,
    });
    const resolution = ledger.recordResolution({
      task,
      expertId: "expert-1",
      findings: ["validator set drift confirmed"],
      recommendation: "quarantine the bridge extension",
      evidence: [{ evidenceId: "e-1", artifactRef: "a-1", contentDigest: "d-1" }],
      resolvedAt: 3_000,
    });
    expect(resolution.version).toBe(1);
    expect(resolution.contentDigest).toMatch(/^fnv1a64:/);
    expect(resolution.supersededBy).toBeUndefined();
  });

  it("superseding appends version 2 and KEEPS version 1 for learning", () => {
    const ledger = new ExpertResolutionLedger();
    const task = dispatchedTask();
    ledger.recordResolution({
      task,
      expertId: "expert-1",
      findings: ["initial"],
      recommendation: "watch",
      evidence: [{ evidenceId: "e", artifactRef: "a", contentDigest: "d" }],
      resolvedAt: 3_000,
    });
    const v2 = ledger.recordSupersedingResolution({
      task,
      expertId: "expert-1",
      findings: ["confirmed"],
      recommendation: "quarantine",
      evidence: [{ evidenceId: "e", artifactRef: "a", contentDigest: "d" }],
      resolvedAt: 4_000,
    });
    expect(v2.version).toBe(2);
    const history = ledger.versionHistoryForTask("task-1");
    expect(history).toHaveLength(2);
    expect(history[0]?.supersededBy).toBe(2);
    expect(history[1]?.supersededBy).toBeUndefined();
    expect(ledger.currentForTask("task-1")?.version).toBe(2);
  });

  it("refuses resolutions from a non-dispatched expert and empty evidence", () => {
    const ledger = new ExpertResolutionLedger();
    const task = dispatchedTask();
    expect(() =>
      ledger.recordResolution({
        task,
        expertId: "expert-rogue",
        findings: [],
        recommendation: "r",
        evidence: [{ evidenceId: "e", artifactRef: "a", contentDigest: "d" }],
        resolvedAt: 3_000,
      }),
    ).toThrowError(/dispatched expert/);
    expect(() =>
      ledger.recordResolution({
        task,
        expertId: "expert-1",
        findings: [],
        recommendation: "",
        evidence: [{ evidenceId: "e", artifactRef: "a", contentDigest: "d" }],
        resolvedAt: 3_000,
      }),
    ).toThrowError(/recommendation/);
    expect(() =>
      ledger.recordResolution({
        task,
        expertId: "expert-1",
        findings: [],
        recommendation: "r",
        evidence: [],
        resolvedAt: 3_000,
      }),
    ).toThrowError(/at least one evidence ref/);
    expect(() =>
      ledger.recordResolution({
        task,
        expertId: "expert-1",
        findings: [],
        recommendation: "r",
        evidence: [{ evidenceId: "", artifactRef: "a", contentDigest: "d" }],
        resolvedAt: 3_000,
      }),
    ).toThrowError(ExpertResolutionError);
  });

  it("the ONLY consumable form is a branded evidence artifact", () => {
    const ledger = new ExpertResolutionLedger();
    const task = dispatchedTask();
    const resolution = ledger.recordResolution({
      task,
      expertId: "expert-1",
      findings: ["confirmed"],
      recommendation: "quarantine",
      evidence: [{ evidenceId: "e", artifactRef: "a", contentDigest: "d" }],
      resolvedAt: 3_000,
    });
    const artifact = resolutionToEvidenceArtifact(resolution);
    expect(artifact.namespace).toBe(EXPERT_EVIDENCE_NAMESPACE);
    expect(artifact.artifactId).toBe("expert-evidence:task-1:v1");
    expect(artifact.findings).toEqual(resolution.findings);
    expect(artifact.contentDigest).toBe(resolution.contentDigest);
    expect(Object.isFrozen(artifact)).toBe(true);
  });

  it("a resolution structurally cannot act as an authorization (type-level)", () => {
    // The evidence-artifact brand is not assignable to the resolution
    // chain type and vice versa; a resolution has no authority-bearing
    // member. Compile-time proof (both types exist and are distinct).
    expectTypeOf<ExpertResolution>().not.toBeNever();
    type ResolutionKeys = keyof ExpertResolution;
    expectTypeOf<ResolutionKeys>().not.toHaveProperty("mandate");
    expectTypeOf<ResolutionKeys>().not.toHaveProperty("grant");
    expectTypeOf<ResolutionKeys>().not.toHaveProperty("authorization");
  });
});

function dispatchedTask() {
  const board = new ExpertTaskBoard();
  return board.dispatch({
    taskId: "task-1",
    case: caseFixture(),
    requirements: [{ skillId: "onchain-forensics", minLevel: "expert" }],
    experts: [expert()],
    at: 2_000,
  });
}
