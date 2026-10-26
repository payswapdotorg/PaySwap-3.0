import { describe, expect, it } from "vitest";
import {
  compareForRanking,
  PLAN_LEVEL_TIE_BREAKERS,
  rankRoutes,
} from "../src/ranking.ts";
import type { RouteRankingRequest } from "../src/ranking.ts";
import { evaluateHardGates } from "../src/hard-gates.ts";
import type { HardGateEvaluation, RouteCandidateMetrics } from "../src/hard-gates.ts";
import type { PinnedRoutePlan } from "../src/pins/route-compiler.ts";
import type { PinnedBestExecutionPolicy } from "../src/pins/route-compiler.ts";
import { RouteRankingError } from "../src/errors.ts";
import { movementIntentFixture, NOW } from "./fixtures.ts";
import { planningBestExecutionPolicy } from "./compiler-evidence.ts";

/**
 * THE RANKING LAWS (ROUTINE-CONTRACT stage 5): deterministic ordering —
 * net outcome DESCENDING (exact BigInt), then the declared tie-breakers
 * IN ORDER (an UNKNOWN dimension contributes no ordering signal), then
 * the PLAN_ID total order. Unscored-but-hard-eligible candidates are
 * RETAINED in a disclosed tier, never ranked by a guessed number; where
 * trade-offs conflict the Pareto/non-dominated front is disclosed.
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
      amount: { currency: "ETH", minorUnits: "1" },
      evidenceRefs: [],
    },
    plannedAmount: { basis: "QUOTE" },
    stateGrounding: { groundingFailures: [] },
    assumptions: [],
    evidenceRefs: [],
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
    railCrossings: { crossings: 1, legs: [] },
    environmentClasses: [],
    ...(overrides?.score !== undefined ? { score: overrides.score } : {}),
    ...overrides,
  } as PinnedRoutePlan;
}

function scoreOf(net: string, options?: { riskClass?: string; settlementMs?: number }) {
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

function gateEvaluation(plans: readonly PinnedRoutePlan[]): HardGateEvaluation {
  return evaluateHardGates({ intent: movementIntentFixture(), at: NOW, candidates: plans });
}
function policy(overrides?: Partial<PinnedBestExecutionPolicy>): PinnedBestExecutionPolicy {
  return { ...planningBestExecutionPolicy(), ...overrides } as PinnedBestExecutionPolicy;
}

function metricsOf(planId: string, options?: { riskClass?: string; settlementMs?: number; score?: string }): RouteCandidateMetrics {
  const effectiveScore = options?.score !== undefined || options?.riskClass !== undefined || options?.settlementMs !== undefined
    ? scoreOf(options?.score ?? "1000", {
        ...(options?.riskClass !== undefined ? { riskClass: options.riskClass } : {}),
        ...(options?.settlementMs !== undefined ? { settlementMs: options.settlementMs } : {}),
      })
    : undefined;
  const ranked = rankRoutes({
    evaluation: gateEvaluation([plan(planId, effectiveScore !== undefined ? { score: effectiveScore } : {})]),
    policy: policy(),
  });
  return ranked.ranked[0]?.metrics ?? ranked.notScored[0] !== undefined
    ? (ranked.ranked[0]?.metrics as RouteCandidateMetrics)
    : ({} as RouteCandidateMetrics);
}

describe("the pinned tie-breaker vocabulary", () => {
  it("is frozen with the plan-level kinds in order (VENUE_ID is not plan-level)", () => {
    expect(Object.isFrozen(PLAN_LEVEL_TIE_BREAKERS)).toBe(true);
    expect([...PLAN_LEVEL_TIE_BREAKERS]).toEqual([
      "LOWER_RISK_CLASS",
      "FASTER_SETTLEMENT",
      "FEWER_HOPS",
      "FEWER_RAIL_CROSSINGS",
      "PLAN_ID",
    ]);
    expect(PLAN_LEVEL_TIE_BREAKERS).not.toContain("VENUE_ID");
  });
});

describe("compareForRanking — the deterministic total order", () => {
  function m(planId: string, net: string, options?: { riskClass?: string; settlementMs?: number; hops?: number; crossings?: number }): RouteCandidateMetrics {
    return {
      planId,
      shapeId: "mixed-dex-offramp",
      candidateStatus: "EXECUTABLE_CANDIDATE" as const,
      isProviderNativeBaseline: false,
      comparability: { comparable: true },
      hopCount: options?.hops ?? 2,
      railCrossings: options?.crossings ?? 1,
      custodyKinds: [],
      plannedAmountBases: [],
      ...(options?.riskClass !== undefined || options?.settlementMs !== undefined || net !== ""
        ? {
            score: scoreOf(net === "" ? "0" : net, {
              ...(options?.riskClass !== undefined ? { riskClass: options.riskClass } : {}),
              ...(options?.settlementMs !== undefined ? { settlementMs: options.settlementMs } : {}),
            }),
          }
        : {}),
      ...(options?.riskClass !== undefined ? { riskClass: options.riskClass } : {}),
      ...(options?.settlementMs !== undefined ? { estimatedSettlementMs: options.settlementMs } : {}),
      unknownDimensions: [],
    };
  }

  it("net outcome DESCENDING is the primary order (exact BigInt, beyond 2^53)", () => {
    const big = "9999999999999999999999";
    const small = "1";
    expect(compareForRanking(m("a", big), m("b", small), [])).toBe(-1);
    expect(compareForRanking(m("a", small), m("b", big), [])).toBe(1);
    expect(compareForRanking(m("a", "500"), m("b", "500"), [])).toBe(-1); // falls to PLAN_ID
  });

  it("the declared tie-breakers apply IN ORDER when nets tie", () => {
    const tieBreakers = ["LOWER_RISK_CLASS", "FASTER_SETTLEMENT", "FEWER_HOPS", "FEWER_RAIL_CROSSINGS"];
    expect(compareForRanking(m("a", "500", { riskClass: "LOW" }), m("b", "500", { riskClass: "HIGH" }), tieBreakers)).toBeLessThan(0);
    expect(compareForRanking(m("a", "500", { riskClass: "HIGH" }), m("b", "500", { riskClass: "LOW" }), tieBreakers)).toBeGreaterThan(0);
    expect(compareForRanking(m("a", "500", { settlementMs: 100 }), m("b", "500", { settlementMs: 200 }), tieBreakers)).toBe(-100);
    expect(compareForRanking(m("a", "500", { hops: 1 }), m("b", "500", { hops: 3 }), tieBreakers)).toBe(-2);
    expect(compareForRanking(m("a", "500", { crossings: 0 }), m("b", "500", { crossings: 2 }), tieBreakers)).toBe(-2);
  });

  it("an UNKNOWN dimension contributes NO ordering signal (never guessed, never coerced)", () => {
    const tieBreakers = ["LOWER_RISK_CLASS", "FASTER_SETTLEMENT"];
    // a knows risk, b does not: no signal -> falls through to PLAN_ID
    expect(compareForRanking(m("a", "500", { riskClass: "LOW" }), m("b", "500"), tieBreakers)).toBe(-1);
    expect(compareForRanking(m("b", "500"), m("a", "500", { riskClass: "LOW" }), tieBreakers)).toBe(1);
    expect(compareForRanking(m("a", "500", { settlementMs: 100 }), m("b", "500"), tieBreakers)).toBe(-1);
  });

  it("PLAN_ID is the terminal total order (VENUE_ID is skipped like the compiler's own law)", () => {
    expect(compareForRanking(m("plan-a", "500"), m("plan-b", "500"), [])).toBe(-1);
    expect(compareForRanking(m("plan-b", "500"), m("plan-a", "500"), [])).toBe(1);
    expect(compareForRanking(m("same", "500"), m("same", "500"), [])).toBe(0);
    expect(compareForRanking(m("a", "500"), m("b", "500"), ["VENUE_ID", "PLAN_ID"])).toBe(-1);
  });

  it("an unknown tie-breaker kind fails closed", () => {
    expect(() => compareForRanking(m("a", "1"), m("b", "1"), ["NOT_A_TIE_BREAKER"])).toThrow(
      RouteRankingError,
    );
  });

  it("an unscored candidate NEVER enters the ranked tier comparison", () => {
    expect(() => compareForRanking(m("a", ""), m("b", "1"), [])).toThrow(RouteRankingError);
  });
});

describe("rankRoutes — the transparent projection", () => {
  it("orders scored survivors by net DESC and assigns 1-based ranks", () => {
    const ranking = rankRoutes({
      evaluation: gateEvaluation([
        plan("p-low", { score: scoreOf("100") }),
        plan("p-high", { score: scoreOf("900") }),
        plan("p-mid", { score: scoreOf("500") }),
      ]),
      policy: policy(),
    });
    expect(ranking.ranked.map((candidate) => candidate.metrics.planId)).toEqual(["p-high", "p-mid", "p-low"]);
    expect(ranking.ranked.map((candidate) => candidate.rank)).toEqual([1, 2, 3]);
    expect(ranking.numeraire).toBe("USC");
    expect(ranking.tieBreakers).toEqual(planningBestExecutionPolicy().tieBreakers);
    expect(ranking.rankingDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(ranking.rankingPermitsExecution).toBe(false);
    expect(Object.isFrozen(ranking)).toBe(true);
  });

  it("retains unscored-but-hard-eligible candidates in a disclosed tier (never a guessed rank)", () => {
    const ranking = rankRoutes({
      evaluation: gateEvaluation([
        plan("p-scored", { score: scoreOf("100") }),
        plan("z-unscored"),
        plan("a-unscored"),
      ]),
      policy: policy(),
    });
    expect(ranking.ranked.map((candidate) => candidate.metrics.planId)).toEqual(["p-scored"]);
    expect(ranking.notScored.map((candidate) => candidate.planId)).toEqual(["a-unscored", "z-unscored"]);
    expect(ranking.notScored[0]?.reason).toContain("no exact-money score");
    expect(ranking.notScored[0]?.unknownDimensions).toContain("SCORE");
  });

  it("discloses the Pareto/non-dominated front where trade-offs conflict", () => {
    // p-fast: lower net but faster; p-rich: higher net but slower — neither dominates.
    const ranking = rankRoutes({
      evaluation: gateEvaluation([
        plan("p-fast", { score: scoreOf("100", { settlementMs: 100 }) }),
        plan("p-rich", { score: scoreOf("900", { settlementMs: 90000 }) }),
      ]),
      policy: policy(),
    });
    expect(ranking.ranked.map((candidate) => candidate.metrics.planId)).toEqual(["p-rich", "p-fast"]);
    expect([...ranking.tradeOffFront].sort()).toEqual(["p-fast", "p-rich"]);
    expect(ranking.ranked.every((candidate) => candidate.paretoNonDominated)).toBe(true);
    expect(ranking.ranked.every((candidate) => candidate.dominatedBy.length === 0)).toBe(true);
  });

  it("a strictly dominated candidate is disclosed with its dominator", () => {
    // p-worse: lower net AND slower AND more hops — dominated by p-better on every known dimension.
    const ranking = rankRoutes({
      evaluation: gateEvaluation([
        plan("p-better", { score: scoreOf("900", { riskClass: "LOW", settlementMs: 100 }) }),
        plan("p-worse", { score: scoreOf("100", { riskClass: "HIGH", settlementMs: 90000 }) }),
      ]),
      policy: policy(),
    });
    const worse = ranking.ranked.find((candidate) => candidate.metrics.planId === "p-worse");
    expect(worse?.paretoNonDominated).toBe(false);
    expect(worse?.dominatedBy).toEqual(["p-better"]);
    expect(ranking.tradeOffFront).toEqual(["p-better"]);
  });

  it("an UNKNOWN dimension blocks a domination proof (non-dominated by honest default)", () => {
    // p-unknown has the same net but no settlement estimate: p-known cannot dominate it.
    const ranking = rankRoutes({
      evaluation: gateEvaluation([
        plan("p-known", { score: scoreOf("500", { settlementMs: 100 }) }),
        plan("p-unknown", { score: scoreOf("500") }),
      ]),
      policy: policy(),
    });
    expect(ranking.ranked.every((candidate) => candidate.paretoNonDominated)).toBe(true);
    expect(ranking.ranked.map((candidate) => candidate.metrics.planId)).toEqual(["p-known", "p-unknown"]);
  });

  it("byte-identical replays under identical inputs (determinism)", () => {
    const request: RouteRankingRequest = {
      evaluation: gateEvaluation([
        plan("p-a", { score: scoreOf("100") }),
        plan("p-b", { score: scoreOf("900") }),
      ]),
      policy: policy(),
    };
    expect(rankRoutes(request).rankingDigest).toBe(rankRoutes(request).rankingDigest);
  });

  it("ranking is structurally unreachable without the gates (gates BEFORE ranking)", () => {
    expect(() => rankRoutes({ evaluation: null as never, policy: policy() })).toThrow(
      RouteRankingError,
    );
    expect(() => rankRoutes({ evaluation: {} as never, policy: policy() })).toThrow(
      RouteRankingError,
    );
  });

  it("the policy must declare a total tie-breaker order and a numeraire", () => {
    const evaluation = gateEvaluation([plan("p1", { score: scoreOf("100") })]);
    expect(() => rankRoutes({ evaluation, policy: null as never })).toThrow(RouteRankingError);
    expect(() => rankRoutes({ evaluation, policy: policy({ tieBreakers: [] }) })).toThrow(
      RouteRankingError,
    );
    expect(() => rankRoutes({ evaluation, policy: policy({ numeraire: "" }) })).toThrow(
      RouteRankingError,
    );
  });

  it("an empty gate evaluation ranks nothing (the honest empty projection)", () => {
    const ranking = rankRoutes({ evaluation: gateEvaluation([]), policy: policy() });
    expect(ranking.ranked).toEqual([]);
    expect(ranking.notScored).toEqual([]);
    expect(ranking.tradeOffFront).toEqual([]);
    expect(ranking.rankingDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("the projection helper surfaces ranked metrics through the gate survivor path", () => {
    const metrics = metricsOf("p1", { score: "750", riskClass: "MODERATE", settlementMs: 42000 });
    expect(metrics.planId).toBe("p1");
    expect(metrics.riskClass).toBe("MODERATE");
    expect(metrics.estimatedSettlementMs).toBe(42000);
    expect(metrics.hopCount).toBe(2);
  });
});
