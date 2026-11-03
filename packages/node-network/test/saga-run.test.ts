import { describe, expect, it } from "vitest";
import {
  SAGA_LEG_OUTCOMES,
  SAGA_RUN_STATES,
  buildMultiLegSagaPlan,
  projectSagaRun,
} from "../src/index.ts";
import { SagaError } from "../src/index.ts";

/** A three-leg plan fixture: collect -> relay (node) -> payout. */
function threeLegPlan() {
  const leg = (index: number, operation: string, toKind: string, compensation: string | null) => ({
    legIndex: index,
    operation,
    lane: { kind: "PROVIDER", id: `provider-${index}` },
    operatingNodeId: index === 1 ? "node:fixture-ke-1" : null,
    plannedAmount: { currency: "KES", minorUnits: "100000" },
    destinationRef: `dest:${index}`,
    custodyTransition: { fromKind: index === 0 ? "SENDER" : "PROVIDER", toKind, evidenceRefs: [] },
    effectClass: index === 2 ? "PAYOUT" : "MOVEMENT",
    approvalTier: "OPERATOR",
    evidenceRequirements: ["RECEIPT"],
    readBackRoute: `readback:${index}`,
    compensation: { documentedMechanism: compensation, mechanismEvidenceRefs: compensation ? ["doc:x"] : [] },
  });
  return {
    missionRef: "mission:test-run-1",
    intentDigest: "fnv1a64:bbbbbbbbbbbbbbbb",
    legs: [
      leg(0, "flutterwave.collect", "PROVIDER", "flutterwave.refund"),
      leg(1, "node.relay.transfer", "PROVIDER", null),
      leg(2, "paystack.transfer.initiate", "BENEFICIARY", "paystack.transfer.reverse"),
    ],
  };
}

function outcomes(pairs: [number, string][]) {
  return pairs.map(([legIndex, outcome]) => ({
    legIndex,
    outcome,
    evidenceRef: `ev:leg-${legIndex}`,
  }));
}

describe("the saga run projection (ADR-0020 D7; ADR-0016 D6/D13)", () => {
  it("NOT_STARTED: nothing recorded, the first leg is dispatchable (once the authority mints its share)", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const run = projectSagaRun({ plan, outcomes: [] });
    expect(run.state).toBe("NOT_STARTED");
    expect(run.legs[0]!.dispatchPermitted).toBe(true);
    expect(run.legs[1]!.dispatchPermitted).toBe(true);
    expect(run.sagaRunPermitsExecution).toBe(false);
  });

  it("RUNNING: confirmed legs let the next leg proceed", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const run = projectSagaRun({ plan, outcomes: outcomes([[0, "CONFIRMED"]]) });
    expect(run.state).toBe("RUNNING");
    expect(run.legs[1]!.dispatchPermitted).toBe(true);
    expect(run.legs[2]!.dispatchPermitted).toBe(true);
  });

  it("COMPLETED: every leg confirmed", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const run = projectSagaRun({
      plan,
      outcomes: outcomes([[0, "CONFIRMED"], [1, "CONFIRMED"], [2, "CONFIRMED"]]),
    });
    expect(run.state).toBe("COMPLETED");
    expect(run.compensation).toEqual([]);
    expect(run.custodyPosition).toEqual({ afterLegIndex: 2, custodyKind: "BENEFICIARY" });
  });

  it("INV-04: an UNKNOWN leg STOPS THE DEPENDENTS and goes to pending reconciliation — never a blind retry", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const run = projectSagaRun({
      plan,
      outcomes: outcomes([[0, "CONFIRMED"], [1, "UNKNOWN"]]),
    });
    expect(run.state).toBe("OUTCOME_UNKNOWN");
    expect(run.legs[2]!.dispatchPermitted).toBe(false);
    expect(run.legs[2]!.reason).toContain("chain stopped honestly");
    expect(run.legs[1]!.reason).toContain("never a blind retry");
    expect(run.pendingReconciliation).toEqual([{ legIndex: 1, evidenceRef: "ev:leg-1" }]);
  });

  it("UNKNOWN is DISTINCT from FAILED (different states, different handling)", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const unknownRun = projectSagaRun({
      plan,
      outcomes: outcomes([[0, "CONFIRMED"], [1, "UNKNOWN"]]),
    });
    const failedRun = projectSagaRun({
      plan,
      outcomes: outcomes([[0, "CONFIRMED"], [1, "FAILED"]]),
    });
    expect(unknownRun.state).toBe("OUTCOME_UNKNOWN");
    expect(failedRun.state).toBe("FAILED_STOPPED");
    expect(unknownRun.pendingReconciliation).toHaveLength(1);
    expect(failedRun.pendingReconciliation).toHaveLength(0);
  });

  it("a FAILED leg stops the chain honestly with the custody position recorded", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const run = projectSagaRun({
      plan,
      outcomes: outcomes([[0, "CONFIRMED"], [1, "FAILED"]]),
    });
    expect(run.state).toBe("FAILED_STOPPED");
    expect(run.legs[2]!.dispatchPermitted).toBe(false);
    expect(run.custodyPosition).toEqual({ afterLegIndex: 0, custodyKind: "PROVIDER" });
  });

  it("COMPENSATION lists only DOCUMENTED mechanisms — an undocumented leg records the honest NO_DOCUMENTED_COMPENSATION", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const run = projectSagaRun({
      plan,
      outcomes: outcomes([[0, "CONFIRMED"], [1, "CONFIRMED"], [2, "FAILED"]]),
    });
    expect(run.state).toBe("FAILED_STOPPED");
    // both confirmed legs get compensation records
    expect(run.compensation.map((record) => record.legIndex)).toEqual([0, 1]);
    // leg 0 has a documented refund; leg 1 honestly does not
    const legZero = run.compensation.find((record) => record.legIndex === 0);
    const legOne = run.compensation.find((record) => record.legIndex === 1);
    expect(legZero?.status).toBe("DOCUMENTED_MECHANISM_AVAILABLE");
    expect(legZero?.documentedMechanism).toBe("flutterwave.refund");
    expect(legOne?.status).toBe("NO_DOCUMENTED_COMPENSATION");
    expect(legOne?.documentedMechanism).toBeNull();
  });

  it("UNRECORDED is never a silent skip — the dependents wait for reconciliation", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const run = projectSagaRun({ plan, outcomes: outcomes([[0, "UNRECORDED"]]) });
    expect(run.state).toBe("OUTCOME_UNKNOWN");
    expect(run.legs[1]!.dispatchPermitted).toBe(false);
    expect(run.legs[0]!.reason).toContain("never a silent skip");
    expect(run.legs[1]!.reason).toContain("chain stopped honestly");
  });

  it("a foreign leg index or a duplicate outcome record is a typed error", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    expect(() =>
      projectSagaRun({ plan, outcomes: outcomes([[7, "CONFIRMED"]]) }),
    ).toThrow(/outside the plan/);
    expect(() =>
      projectSagaRun({
        plan,
        outcomes: outcomes([[0, "CONFIRMED"], [0, "FAILED"]]),
      }),
    ).toThrow(/one-outcome-per-leg/);
    expect(() =>
      projectSagaRun({ plan, outcomes: [{ legIndex: 0, outcome: "MAYBE", evidenceRef: "x" }] }),
    ).toThrow(SagaError);
  });

  it("the outcome and state vocabularies are the ADR-0016 D6 mirror", () => {
    expect([...SAGA_LEG_OUTCOMES]).toEqual(["CONFIRMED", "FAILED", "UNKNOWN", "UNRECORDED"]);
    expect([...SAGA_RUN_STATES]).toEqual([
      "NOT_STARTED",
      "RUNNING",
      "COMPLETED",
      "OUTCOME_UNKNOWN",
      "FAILED_STOPPED",
    ]);
  });

  it("the run digest is deterministic over the same facts", () => {
    const plan = buildMultiLegSagaPlan(threeLegPlan());
    const first = projectSagaRun({ plan, outcomes: outcomes([[0, "CONFIRMED"]]) });
    const second = projectSagaRun({ plan, outcomes: outcomes([[0, "CONFIRMED"]]) });
    expect(first.runDigest).toBe(second.runDigest);
  });
});
