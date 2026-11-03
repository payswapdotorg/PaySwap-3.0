import { describe, expect, it } from "vitest";
import {
  SAGA_PLAN_VERSION,
  buildMultiLegSagaPlan,
  sagaAuthorizationShareRequests,
  sagaLegIdempotencyKey,
  sagaLegIdempotencyKeys,
  sagaPlanDigest,
} from "../src/index.ts";
import { SagaError } from "../src/index.ts";

/** A minimal two-leg plan fixture (hermetic; a PLAN, never an authorization). */
function twoLegPlan() {
  return {
    missionRef: "mission:test-1",
    intentDigest: "fnv1a64:aaaaaaaaaaaaaaaa",
    legs: [
      {
        legIndex: 0,
        operation: "flutterwave.collect",
        lane: { kind: "PROVIDER", id: "flutterwave" },
        operatingNodeId: null,
        plannedAmount: { currency: "GHS", minorUnits: "100000" },
        destinationRef: "acct:gh-collect",
        custodyTransition: { fromKind: "SENDER", toKind: "PROVIDER", evidenceRefs: ["ev:0"] },
        effectClass: "COLLECT",
        approvalTier: "OPERATOR",
        evidenceRequirements: ["COLLECT_RECEIPT"],
        readBackRoute: "flutterwave.transaction.read",
        compensation: { documentedMechanism: "flutterwave.refund", mechanismEvidenceRefs: ["doc:flw-refund"] },
      },
      {
        legIndex: 1,
        operation: "paystack.transfer.initiate",
        lane: { kind: "PROVIDER", id: "paystack" },
        operatingNodeId: "node:fixture-ke-1",
        plannedAmount: { currency: "KES", minorUnits: "1500000" },
        destinationRef: "bank:ke-beneficiary",
        custodyTransition: { fromKind: "PROVIDER", toKind: "BENEFICIARY", evidenceRefs: ["ev:1"] },
        effectClass: "PAYOUT",
        approvalTier: "OPERATOR",
        evidenceRequirements: ["TRANSFER_RECEIPT"],
        readBackRoute: "paystack.transfer.verify",
        compensation: { documentedMechanism: null, mechanismEvidenceRefs: [] },
      },
    ],
  };
}

describe("the immutable multi-leg saga plan (ADR-0020 D7)", () => {
  it("builds the plan, freezes it, and carries the literal permits-execution false", () => {
    const plan = buildMultiLegSagaPlan(twoLegPlan());
    expect(plan.sagaVersion).toBe(SAGA_PLAN_VERSION);
    expect(plan.legs).toHaveLength(2);
    expect(plan.sagaPermitsExecution).toBe(false);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan.planDigest.startsWith("saga-plan:")).toBe(true);
  });

  it("THE IMMUTABILITY LAW: changing ANY material leg fact changes the digest", () => {
    const base = buildMultiLegSagaPlan(twoLegPlan());
    const mutations: Record<string, unknown>[] = [
      { legIndex: 1, operation: "paystack.transfer.finalize" },
      { legIndex: 1, plannedAmount: { currency: "KES", minorUnits: "1500001" } },
      { legIndex: 1, destinationRef: "bank:somewhere-else" },
      { legIndex: 1, operatingNodeId: "node:other-node" },
      { legIndex: 1, approvalTier: "USER" },
    ];
    for (const mutation of mutations) {
      const mutated = {
        ...twoLegPlan(),
        legs: [twoLegPlan().legs[0], { ...twoLegPlan().legs[1], ...mutation }],
      };
      expect(sagaPlanDigestOf(mutated)).not.toBe(base.planDigest);
    }
    // byte-identical rebuild: same digest
    expect(buildMultiLegSagaPlan(twoLegPlan()).planDigest).toBe(base.planDigest);
  });

  it("the idempotency keys are the exact ADR-0016 D6 form and deterministic", () => {
    const plan = buildMultiLegSagaPlan(twoLegPlan());
    const keys = sagaLegIdempotencyKeys(plan);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    // same inputs -> same key (replay-safety)
    expect(
      sagaLegIdempotencyKey({
        missionRef: plan.missionRef,
        operation: plan.legs[0]!.operation,
        legIndex: 0,
        intentDigest: plan.intentDigest,
      }),
    ).toBe(keys[0]);
    // any distinguishing input changes the key
    expect(
      sagaLegIdempotencyKey({
        missionRef: "mission:other",
        operation: plan.legs[0]!.operation,
        legIndex: 0,
        intentDigest: plan.intentDigest,
      }),
    ).not.toBe(keys[0]);
    expect(() =>
      sagaLegIdempotencyKey({
        missionRef: plan.missionRef,
        operation: plan.legs[0]!.operation,
        legIndex: -1,
        intentDigest: plan.intentDigest,
      }),
    ).toThrow(SagaError);
  });

  it("the per-leg authorization-share REQUESTS bind the whole plan digest (D7)", () => {
    const plan = buildMultiLegSagaPlan(twoLegPlan());
    const requests = sagaAuthorizationShareRequests(plan);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.planDigest).toBe(plan.planDigest);
      expect(request.intentDigest).toBe(plan.intentDigest);
      expect(request.missionRef).toBe(plan.missionRef);
    }
    expect(requests[1]!.legIndex).toBe(1);
    expect(requests[1]!.operation).toBe("paystack.transfer.initiate");
  });

  it("a leg index gap or duplicate is a typed error (the keys bind the index)", () => {
    const broken = {
      ...twoLegPlan(),
      legs: [twoLegPlan().legs[1], twoLegPlan().legs[1]],
    };
    expect(() => buildMultiLegSagaPlan(broken)).toThrow(/exact index/);
  });

  it("an empty or oversized plan is refused (the hop law)", () => {
    expect(() => buildMultiLegSagaPlan({ ...twoLegPlan(), legs: [] })).toThrow(/at least one leg/);
    const tooMany = Array.from({ length: 9 }, (_, index) => ({
      ...twoLegPlan().legs[0]!,
      legIndex: index,
    }));
    expect(() => buildMultiLegPlan(tooMany)).toThrow();
    expect(() => buildMultiLegSagaPlan({ ...twoLegPlan(), legs: tooMany })).toThrow(/at most/);
  });

  it("a leg without a read-back route is refused (reconciliation is not optional)", () => {
    const noReadBack = {
      ...twoLegPlan(),
      legs: [twoLegPlan().legs[0]!, { ...twoLegPlan().legs[1]!, readBackRoute: "" }],
    };
    expect(() => buildMultiLegSagaPlan(noReadBack)).toThrow(/readBackRoute/);
  });
});

function sagaPlanDigestOf(input: {
  missionRef: string;
  intentDigest: string;
  legs: readonly unknown[];
}): string {
  return sagaPlanDigest({
    missionRef: input.missionRef,
    intentDigest: input.intentDigest,
    legs: input.legs as never[],
  });
}

function buildMultiLegPlan(legs: readonly unknown[]): unknown {
  return buildMultiLegSagaPlan({ missionRef: "mission:test-1", intentDigest: "fnv1a64:aaaaaaaaaaaaaaaa", legs });
}
