import { describe, expect, it } from "vitest";
import {
  evaluateHardGates,
  HARD_GATE_EXCLUSION_CODES,
  HARD_GATE_ORDER,
  routeCandidateMetricsOf,
  ROUTE_METRIC_DIMENSIONS,
  validateRoutePlanningIntent,
} from "../src/hard-gates.ts";
import type { PinnedRoutePlan } from "../src/pins/route-compiler.ts";
import { HardGateError, RoutePlanningValidationError } from "../src/errors.ts";
import { movementIntentFixture, NOW } from "./fixtures.ts";

/**
 * THE HARD-GATE LAWS (ROUTINE-CONTRACT stage 5, the contract law): hard
 * constraints gate BEFORE any soft-preference ranking; every violated
 * gate contributes a typed exclusion (the every-reason law); UNKNOWN
 * dimensions are RETAINED and disclosed, never guessed, never coerced to
 * a failure; nothing is dropped without a recorded reason.
 */

function leg(legId: string, hopIndex: number) {
  return {
    legId,
    legKind: "RAIL_MOVEMENT",
    hopIndex,
    intentRef: "intent:planning:001",
    custody: {
      from: { kind: "USER_CUSTODY" },
      to: { kind: "EXTERNAL_PROVIDER" },
      assetRef: "ethereum:mainnet/asset:ETH",
      amount: { currency: "ETH", minorUnits: "10000000000000000" },
      evidenceRefs: [],
    },
    plannedAmount: { basis: "QUOTE" },
    stateGrounding: { groundingFailures: [] },
    assumptions: [],
    evidenceRefs: [],
  };
}

function score(net: string, options?: { riskClass?: string; settlementMs?: number }) {
  return {
    candidateId: "plan",
    numeraire: "USC",
    components: [
      { kind: "OUTPUT", description: "arrival value", numeraireMinorUnits: net },
      ...(options?.riskClass !== undefined
        ? [{ kind: "RISK_DEDUCTION", description: "risk", riskClass: options.riskClass, numeraireMinorUnits: "0" }]
        : []),
      ...(options?.settlementMs !== undefined
        ? [{ kind: "TIME_COST", description: "time", milliseconds: options.settlementMs, numeraireMinorUnits: "0" }]
        : []),
    ],
    netNumeraireMinorUnits: net,
  };
}

function plan(planId: string, overrides?: Partial<PinnedRoutePlan>): PinnedRoutePlan {
  return {
    planId,
    shapeId: "mixed-dex-offramp",
    intentRef: "intent:planning:001",
    compositionClass: "COMPOSED",
    executionMode: "COMPOSED_PAYSWAP",
    isProviderNativeBaseline: false,
    candidateStatus: "EXECUTABLE_CANDIDATE",
    comparability: { comparable: true },
    ineligibilityReasons: [],
    legs: [leg(`${planId}-0`, 0), leg(`${planId}-1`, 1)],
    evidenceRefs: [],
    planDigest: `fnv1a64:${planId.length.toString(16).padStart(16, "0")}`,
    railCrossings: {
      crossings: 1,
      legs: [{ hopIndex: 0, fromFamily: "ONCHAIN", toFamily: "PROVIDER", crosses: true }],
    },
    environmentClasses: [],
    ...(overrides?.score !== undefined ? { score: overrides.score } : {}),
    ...overrides,
  } as PinnedRoutePlan;
}

describe("the pinned gate vocabulary", () => {
  it("the gate order is frozen and fixed", () => {
    expect(Object.isFrozen(HARD_GATE_ORDER)).toBe(true);
    expect([...HARD_GATE_ORDER]).toEqual([
      "INTENT_WINDOW",
      "HOP_BUDGET",
      "SETTLEMENT_DEADLINE",
      "CANDIDATE_STATUS",
    ]);
  });

  it("the exclusion-code vocabulary is frozen and closed", () => {
    expect(Object.isFrozen(HARD_GATE_EXCLUSION_CODES)).toBe(true);
    expect([...HARD_GATE_EXCLUSION_CODES]).toEqual([
      "INTENT_WINDOW_EXPIRED",
      "HOP_BUDGET_EXCEEDED",
      "SETTLEMENT_DEADLINE_EXCEEDED",
      "CANDIDATE_INELIGIBLE",
      "CANDIDATE_NOT_COMPARABLE",
    ]);
  });

  it("the metric-dimension vocabulary is frozen and closed", () => {
    expect(Object.isFrozen(ROUTE_METRIC_DIMENSIONS)).toBe(true);
    expect([...ROUTE_METRIC_DIMENSIONS]).toEqual([
      "SCORE",
      "NET_NUMERAIRE",
      "RISK_CLASS",
      "SETTLEMENT_MS",
      "HOP_COUNT",
      "RAIL_CROSSINGS",
    ]);
  });
});

describe("routeCandidateMetricsOf — the transparent projection", () => {
  it("every dimension is visible: hops, crossings, custody kinds, amount bases", () => {
    const metrics = routeCandidateMetricsOf(plan("p1", { score: score("100", { riskClass: "LOW", settlementMs: 5000 }) }));
    expect(metrics.planId).toBe("p1");
    expect(metrics.shapeId).toBe("mixed-dex-offramp");
    expect(metrics.hopCount).toBe(2);
    expect(metrics.railCrossings).toBe(1);
    expect(metrics.custodyKinds).toEqual(["USER_CUSTODY", "EXTERNAL_PROVIDER", "USER_CUSTODY", "EXTERNAL_PROVIDER"]);
    expect(metrics.plannedAmountBases).toEqual(["QUOTE", "QUOTE"]);
    expect(metrics.riskClass).toBe("LOW");
    expect(metrics.estimatedSettlementMs).toBe(5000);
    expect(metrics.unknownDimensions).toEqual([]);
    expect(Object.isFrozen(metrics)).toBe(true);
  });

  it("an unscored plan discloses the UNKNOWN score dimensions (UNKNOWN is not FAILED)", () => {
    const metrics = routeCandidateMetricsOf(plan("p2"));
    expect(metrics.score).toBeUndefined();
    expect(metrics.riskClass).toBeUndefined();
    expect(metrics.estimatedSettlementMs).toBeUndefined();
    expect(metrics.unknownDimensions).toEqual(["SCORE", "NET_NUMERAIRE", "RISK_CLASS", "SETTLEMENT_MS"]);
  });

  it("a scored plan with missing components retains the per-dimension UNKNOWNs", () => {
    const metrics = routeCandidateMetricsOf(plan("p3", { score: score("100") }));
    expect(metrics.unknownDimensions).toEqual(["RISK_CLASS", "SETTLEMENT_MS"]);
    expect(metrics.unknownDimensions).not.toContain("SCORE");
  });
});

describe("evaluateHardGates — gates BEFORE ranking", () => {
  it("a fully-eligible plan survives every gate", () => {
    const intent = movementIntentFixture();
    const evaluation = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [plan("p1", { score: score("100", { riskClass: "LOW", settlementMs: 60000 }) })],
    });
    expect(evaluation.intentRef).toBe(intent.intentId);
    expect(evaluation.evaluationInstant).toBe(NOW);
    expect(evaluation.gateOrder).toEqual([...HARD_GATE_ORDER]);
    expect(evaluation.rankEligible).toHaveLength(1);
    expect(evaluation.gated).toEqual([]);
    expect(evaluation.hardGateDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(evaluation.hardGatesPermitExecution).toBe(false);
    expect(Object.isFrozen(evaluation)).toBe(true);
  });

  it("INTENT_WINDOW_EXPIRED gates EVERY candidate (an expired window gates everything)", () => {
    const intent = movementIntentFixture();
    const evaluation = evaluateHardGates({
      intent,
      at: intent.expiresAt,
      candidates: [plan("p1", { score: score("100") })],
    });
    expect(evaluation.rankEligible).toEqual([]);
    expect(evaluation.gated).toHaveLength(1);
    expect(evaluation.gated[0]?.codes).toEqual(["INTENT_WINDOW_EXPIRED"]);
    expect(evaluation.gated[0]?.reasons[0]?.message).toContain("expired authorization window");
  });

  it("HOP_BUDGET_EXCEEDED gates plans over the intent's maxRouteHops", () => {
    const intent = movementIntentFixture();
    const evaluation = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [plan("p1", { legs: [leg("a", 0), leg("b", 1), leg("c", 2), leg("d", 3), leg("e", 4), leg("f", 5), leg("g", 6)] })],
    });
    expect(evaluation.gated[0]?.codes).toEqual(["HOP_BUDGET_EXCEEDED"]);
    expect(evaluation.rankEligible).toEqual([]);
  });

  it("SETTLEMENT_DEADLINE_EXCEEDED gates only a KNOWN over-budget estimate", () => {
    const intent = movementIntentFixture();
    const over = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [plan("p1", { score: score("100", { settlementMs: intent.constraints.maxSettlementMs + 1 }) })],
    });
    expect(over.gated[0]?.codes).toEqual(["SETTLEMENT_DEADLINE_EXCEEDED"]);
    const exactlyAt = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [plan("p1", { score: score("100", { settlementMs: intent.constraints.maxSettlementMs }) })],
    });
    expect(exactlyAt.rankEligible).toHaveLength(1);
  });

  it("an UNKNOWN settlement estimate is RETAINED, never coerced to a failure", () => {
    const intent = movementIntentFixture();
    const evaluation = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [plan("p1", { score: score("100") })],
    });
    expect(evaluation.rankEligible).toHaveLength(1);
    expect(evaluation.rankEligible[0]?.metrics.unknownDimensions).toContain("SETTLEMENT_MS");
    expect(evaluation.rankEligible[0]?.metrics.unknownDimensions).not.toContain("SCORE");
  });

  it("CANDIDATE_INELIGIBLE carries the compiler's ineligibility reasons VERBATIM", () => {
    const intent = movementIntentFixture();
    const reasons = [{ legId: "a", code: "MISSING_QUOTE", detail: "no quote grounds the leg" }];
    const evaluation = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [plan("p1", { candidateStatus: "INELIGIBLE_CANDIDATE", ineligibilityReasons: reasons })],
    });
    expect(evaluation.gated[0]?.codes).toEqual(["CANDIDATE_INELIGIBLE"]);
    expect(evaluation.gated[0]?.ineligibilityReasons).toEqual(reasons);
  });

  it("CANDIDATE_NOT_COMPARABLE carries the comparability gaps VERBATIM", () => {
    const intent = movementIntentFixture();
    const gaps = [{ legId: "a", requirement: "CREDIBLE_PRICING", code: "INV-C01", detail: "no venue quote" }];
    const evaluation = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [plan("p1", { candidateStatus: "NOT_COMPARABLE", comparability: { comparable: false, gaps } })],
    });
    expect(evaluation.gated[0]?.codes).toEqual(["CANDIDATE_NOT_COMPARABLE"]);
    expect(evaluation.gated[0]?.comparabilityGaps).toEqual(gaps);
  });

  it("THE EVERY-REASON LAW: multiple violations surface ALL codes, never just the first", () => {
    const intent = movementIntentFixture();
    const gaps = [{ legId: "a", requirement: "CREDIBLE_PRICING", code: "INV-C01", detail: "no venue quote" }];
    const evaluation = evaluateHardGates({
      intent,
      at: intent.expiresAt,
      candidates: [
        plan("p1", {
          legs: [leg("a", 0), leg("b", 1), leg("c", 2), leg("d", 3), leg("e", 4), leg("f", 5), leg("g", 6)],
          score: score("100", { settlementMs: intent.constraints.maxSettlementMs + 1 }),
          candidateStatus: "NOT_COMPARABLE",
          comparability: { comparable: false, gaps },
        }),
      ],
    });
    expect(evaluation.gated[0]?.codes).toEqual([
      "INTENT_WINDOW_EXPIRED",
      "HOP_BUDGET_EXCEEDED",
      "SETTLEMENT_DEADLINE_EXCEEDED",
      "CANDIDATE_NOT_COMPARABLE",
    ]);
    expect(evaluation.gated[0]?.reasons).toHaveLength(4);
    expect(evaluation.rankEligible).toEqual([]);
  });

  it("the PROVIDER_NATIVE_BASELINE proceeds like any candidate (INV-C08)", () => {
    const intent = movementIntentFixture();
    const evaluation = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [plan("p1", { candidateStatus: "PROVIDER_NATIVE_BASELINE", isProviderNativeBaseline: true })],
    });
    expect(evaluation.rankEligible).toHaveLength(1);
    expect(evaluation.rankEligible[0]?.metrics.isProviderNativeBaseline).toBe(true);
  });

  it("a gated candidate NEVER reaches rankEligible (the structural split)", () => {
    const intent = movementIntentFixture();
    const evaluation = evaluateHardGates({
      intent,
      at: NOW,
      candidates: [
        plan("p-ok", { score: score("100") }),
        plan("p-bad", { candidateStatus: "INELIGIBLE_CANDIDATE", ineligibilityReasons: [{ legId: "x", code: "MISSING_QUOTE", detail: "no quote" }] }),
      ],
    });
    expect(evaluation.rankEligible.map((survivor) => survivor.plan.planId)).toEqual(["p-ok"]);
    expect(evaluation.gated.map((candidate) => candidate.planId)).toEqual(["p-bad"]);
    expect(evaluation.gated[0]?.candidateStatus).toBe("INELIGIBLE_CANDIDATE");
  });

  it("candidates must carry a non-empty planId (fail closed)", () => {
    expect(() =>
      evaluateHardGates({ intent: movementIntentFixture(), at: NOW, candidates: [{} as PinnedRoutePlan] }),
    ).toThrow(HardGateError);
    expect(() =>
      evaluateHardGates({ intent: movementIntentFixture(), at: NOW, candidates: "not-a-list" as never }),
    ).toThrow(HardGateError);
  });

  it("the evaluation instant must be a caller-supplied non-negative integer", () => {
    expect(() => evaluateHardGates({ intent: movementIntentFixture(), at: -1, candidates: [] })).toThrow(
      HardGateError,
    );
    expect(() => evaluateHardGates({ intent: movementIntentFixture(), at: 0.5, candidates: [] })).toThrow(
      HardGateError,
    );
  });

  it("byte-identical replays under identical inputs (determinism)", () => {
    const input = {
      intent: movementIntentFixture(),
      at: NOW,
      candidates: [plan("p1", { score: score("100") }), plan("p2", { candidateStatus: "INELIGIBLE_CANDIDATE", ineligibilityReasons: [{ legId: "x", code: "MISSING_QUOTE", detail: "no quote" }] })],
    };
    expect(evaluateHardGates(input).hardGateDigest).toBe(evaluateHardGates(input).hardGateDigest);
  });
});

describe("validateRoutePlanningIntent — the local fail-closed re-declaration", () => {
  it("the fixture intent validates and passes through", () => {
    const intent = movementIntentFixture();
    expect(validateRoutePlanningIntent(intent)).toBe(intent);
  });

  it("prose and malformed records never reach gate evaluation", () => {
    expect(() => validateRoutePlanningIntent("pay alice" as never)).toThrow(RoutePlanningValidationError);
    expect(() => validateRoutePlanningIntent(null)).toThrow(RoutePlanningValidationError);
    expect(() =>
      validateRoutePlanningIntent({ ...movementIntentFixture(), extra: "field" }),
    ).toThrow(RoutePlanningValidationError);
    expect(() => {
      const partial = { ...movementIntentFixture() } as Record<string, unknown>;
      delete partial["arrivalCurrency"];
      return validateRoutePlanningIntent(partial);
    }).toThrow(RoutePlanningValidationError);
  });

  it("currency/amount/constraint/window laws are re-validated locally", () => {
    expect(() =>
      validateRoutePlanningIntent({ ...movementIntentFixture(), origin: { ...movementIntentFixture().origin, currency: "eth" } }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      validateRoutePlanningIntent({ ...movementIntentFixture(), originAmount: { currency: "EUR", minorUnits: "10000000000000000" } }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      validateRoutePlanningIntent({ ...movementIntentFixture(), arrivalCurrency: "USD" }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      validateRoutePlanningIntent({ ...movementIntentFixture(), constraints: { maxSettlementMs: 0, maxRouteHops: 4 } }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      validateRoutePlanningIntent({ ...movementIntentFixture(), constraints: { maxSettlementMs: 1000, maxRouteHops: 9 } }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      validateRoutePlanningIntent({ ...movementIntentFixture(), expiresAt: movementIntentFixture().declaredAt }),
    ).toThrow(RoutePlanningValidationError);
  });
});
