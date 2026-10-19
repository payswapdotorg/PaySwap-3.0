import { describe, expect, it } from "vitest";
import {
  defaultEvaluationSpec,
  evaluateRun,
  runSimulation,
  validateEvaluationSpec,
} from "@payswap/lab";
import type {
  EvaluationSpec,
  SimulationProgram,
  SimulatedWorld,
  SimulationScenarioPlan,
} from "@payswap/lab";

/**
 * The evaluator: hard constraints BEFORE optimization (P6-W1 rebuild of
 * the old W2-004 suite; the compliance-first law — a single
 * hard-constraint failure disqualifies regardless of the optimization
 * score; the phases tuple is compile-time ordered).
 
 * Site classification (this file): 6 old sites PORTED (the old
 * evaluator corpus: the ordered phases tuple, hard-constraint
 * disqualification despite a better score, determinism and
 * content-digest, exact integer minor units, the undeclared-credit
 * EXPLICIT_CREDIT violation, the DEADLINE violation when declared) +
 * 2 NET-NEW sites (the fail-closed spec validation receipt; the
 * canonical default-spec declaration receipt) = 8 tests. The robustness
 * half of the old suite lives in robustness.test.ts.
 */

const WORLD: SimulatedWorld = {
  worldId: "eval-world",
  baseCurrency: "EUR",
  stepLatencyMs: 100,
  rails: [
    { railId: "rail-cheap", currency: "EUR", latencyMs: 300, fixedFeeMinor: 10n, variableFeeBps: 5n },
    { railId: "rail-pricey", currency: "EUR", latencyMs: 200, fixedFeeMinor: 200n, variableFeeBps: 200n },
  ],
  pools: [
    { poolId: "pool-cheap", railId: "rail-cheap", availableMinor: 1_000_000n },
    { poolId: "pool-pricey", railId: "rail-pricey", availableMinor: 1_000_000n },
  ],
};

function plan(): SimulationScenarioPlan {
  return {
    scenarioId: "eval-scenario",
    demands: [
      { demandId: "d1", atStep: 0, amountMinor: 100_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 60_000 },
    ],
    incidents: [],
  };
}

function program(overrides?: Partial<SimulationProgram>): SimulationProgram {
  return {
    programId: "eval.program",
    programVersion: "1.0.0",
    routePreference: ["rail-cheap", "rail-pricey"],
    useNetting: false,
    useNetworkCredit: false,
    delayToleranceSteps: 0,
    fraudScreening: true,
    privacyBounded: true,
    authorizationMode: "PROTOCOL_AUTHORIZED",
    ...(overrides ?? {}),
  };
}

function evaluate(candidate: SimulationProgram, spec?: EvaluationSpec) {
  const run = runSimulation({ scenario: plan(), world: WORLD, program: candidate, seed: "eval" });
  return evaluateRun({ run, program: candidate, spec: spec ?? defaultEvaluationSpec() });
}

describe("hard constraints are evaluated BEFORE optimization (the compliance-first law)", () => {
  it("phases is an ordered tuple: HARD_CONSTRAINTS first, then OPTIMIZATION", () => {
    const result = evaluate(program());
    expect(result.phases[0]?.phase).toBe("HARD_CONSTRAINTS");
    expect(result.phases[1]?.phase).toBe("OPTIMIZATION");
    expect(result.phases.length).toBe(2);
    expect(result.phases[0]?.allPassed).toBe(true);
    expect(result.passedHardConstraints).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("a hard-constraint failure disqualifies a candidate even with a BETTER optimization score", () => {
    // The lawless program rides the cheap rail (better score) but bypasses
    // authorization and screens nothing.
    const lawless = evaluate(
      program({ fraudScreening: false, authorizationMode: "DECLARED_BYPASS" }),
    );
    expect(lawless.passedHardConstraints).toBe(false);
    expect(lawless.passed).toBe(false);
    expect(lawless.phases[1]?.disqualificationNote).toBeDefined();

    const sound = evaluate(program({ routePreference: ["rail-pricey"] }));
    expect(sound.passed).toBe(true);
    // Disqualification is independent of the raw score comparison.
    expect(lawless.totalOptimizationScoreMinor).toBeLessThan(sound.totalOptimizationScoreMinor);
  });

  it("evaluation is deterministic and content-digested", () => {
    const a = evaluate(program());
    const b = evaluate(program());
    expect(a).toEqual(b);
    expect(a.digest).toBe(b.digest);
    expect(a.evaluationId).toBe(`evaluation:${a.digest}`);
    const other = evaluate(program({ programVersion: "2.0.0" }));
    expect(other.digest).not.toBe(a.digest);
  });

  it("the aggregate optimization score is exact integer minor units (INV-2)", () => {
    const result = evaluate(program());
    expect(typeof result.totalOptimizationScoreMinor).toBe("bigint");
    // Manual recomputation: fees = 10 + 100_000*5bps/10_000 = 60; fx = 0.
    // TOTAL_COST = 60; COMPRESSION = 100_000 + 1*1_000; RESILIENCE = 0;
    // LATENCY = totalLatencyMs; LIQUIDITY = 0; CREDIT = 0; COMPLEXITY = 1_000.
    const contributions = result.phases[1]?.contributions ?? [];
    const totalCost = contributions.find((c) => c.objectiveId === "TOTAL_COST");
    expect(totalCost?.observedMinor).toBe(60n);
    expect(totalCost?.contributionMinor).toBe(60n * 100n);
    const recomputed = contributions.reduce((sum, c) => sum + c.contributionMinor, 0n);
    expect(result.totalOptimizationScoreMinor).toBe(recomputed);
  });

  it("an undeclared credit draw violates EXPLICIT_CREDIT", () => {
    const bigDemand: SimulationScenarioPlan = {
      scenarioId: "eval-credit",
      demands: [
        { demandId: "d-big", atStep: 0, amountMinor: 2_000_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 60_000 },
      ],
      incidents: [],
    };
    const run = runSimulation({
      scenario: bigDemand,
      world: WORLD,
      program: program({ useNetworkCredit: false }),
      seed: "eval",
    });
    // pool-cheap has 1M; the 2M demand fails over to... also insufficient on
    // pricey (1M) without credit -> FAILED. Force the credit path instead:
    const creditRun = runSimulation({
      scenario: bigDemand,
      world: WORLD,
      program: program({ useNetworkCredit: true }),
      seed: "eval",
    });
    expect(creditRun.metrics.creditExposureMinor).toBeGreaterThan(0n);
    const creditSpec: EvaluationSpec = {
      hardConstraints: [{ constraintId: "EXPLICIT_CREDIT", description: "credit must be declared" }],
      objectives: [],
      penalties: {
        hopPenaltyMinor: 1_000n,
        routeFailurePenaltyMinor: 50_000n,
        unknownOutcomePenaltyMinor: 25_000n,
        userActionPenaltyMinor: 5_000n,
      },
    };
    // The RUN drew credit while the program did NOT declare it: violation.
    const undeclared = evaluateRun({
      run: creditRun,
      program: program({ useNetworkCredit: false }),
      spec: creditSpec,
    });
    const declared = evaluateRun({
      run: creditRun,
      program: program({ useNetworkCredit: true }),
      spec: creditSpec,
    });
    expect(declared.phases[0]?.results[0]?.passed).toBe(true);
    const explicitCredit = undeclared.phases[0]?.results.find(
      (r) => r.constraintId === "EXPLICIT_CREDIT",
    );
    expect(explicitCredit?.passed).toBe(false);
    expect(run.metrics.failedNoViableRoute).toBe(1);
  });

  it("a deadline miss violates the DEADLINE hard constraint when the pack declares it", () => {
    const deadlineSpec: EvaluationSpec = {
      hardConstraints: [
        { constraintId: "DEADLINE", description: "no deadline misses" },
      ],
      objectives: [],
      penalties: {
        hopPenaltyMinor: 1_000n,
        routeFailurePenaltyMinor: 50_000n,
        unknownOutcomePenaltyMinor: 25_000n,
        userActionPenaltyMinor: 5_000n,
      },
    };
    const lateWorld: SimulatedWorld = {
      ...WORLD,
      rails: [{ ...WORLD.rails[0]!, latencyMs: 90_000 }],
    };
    const run = runSimulation({
      scenario: {
        scenarioId: "eval-deadline",
        demands: [
          { demandId: "d-late", atStep: 0, amountMinor: 100_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 1_000 },
        ],
        incidents: [],
      },
      world: lateWorld,
      program: program(),
      seed: "eval",
    });
    expect(run.metrics.deadlineMisses).toBe(1);
    const result = evaluateRun({ run, program: program(), spec: deadlineSpec });
    expect(result.phases[0]?.results[0]?.passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("an evaluation spec fails closed when it declares unknown vocabulary", () => {
    const bad = validateEvaluationSpec({
      hardConstraints: [],
      objectives: [{ objectiveId: "MAXIMIZE_PONZI" as never, description: "no", weightBps: 1n }],
      penalties: {
        hopPenaltyMinor: -1n,
        routeFailurePenaltyMinor: 1n,
        unknownOutcomePenaltyMinor: 1n,
        userActionPenaltyMinor: 1n,
      },
    });
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.join("|")).toContain("at least one hard constraint");
    expect(bad.join("|")).toContain("unknown objective");
    expect(bad.join("|")).toContain("hopPenaltyMinor");
  });
});

describe("the canonical default spec", () => {
  it("declares the hard-constraint trio and the seven LAB.md objectives with exact penalties", () => {
    const spec = defaultEvaluationSpec();
    expect(spec.hardConstraints.map((c) => c.constraintId)).toEqual([
      "AUTHORIZATION",
      "COMPLIANCE",
      "PRIVACY",
    ]);
    expect(spec.objectives.map((o) => o.objectiveId)).toEqual([
      "TOTAL_COST",
      "ECONOMIC_COMPRESSION",
      "RESILIENCE",
      "LATENCY",
      "LIQUIDITY_LOCKED",
      "COUNTERPARTY_EXPOSURE",
      "OPERATIONAL_COMPLEXITY",
    ]);
    expect(spec.penalties.hopPenaltyMinor).toBe(1_000n);
    expect(spec.penalties.routeFailurePenaltyMinor).toBe(50_000n);
    expect(spec.penalties.unknownOutcomePenaltyMinor).toBe(25_000n);
    expect(spec.penalties.userActionPenaltyMinor).toBe(5_000n);
    expect(validateEvaluationSpec(spec)).toEqual([]);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/evaluator.test.ts,
// evaluator half)
// ---------------------------------------------------------------------------
// PORTED (6): "phases is an ordered tuple: HARD_CONSTRAINTS first, then
// OPTIMIZATION"; "a hard-constraint failure disqualifies a candidate even
// with a BETTER optimization score"; "evaluation is deterministic and
// content-digested"; "the aggregate optimization score is exact integer
// minor units"; "an undeclared credit draw violates EXPLICIT_CREDIT";
// "a deadline miss violates the DEADLINE hard constraint when the pack
// declares it".
// NET-NEW (2): fail-closed spec validation; the canonical default-spec
// receipt.
// ---------------------------------------------------------------------------
// Exact-arithmetic receipts (the manual recomputations this suite asserts)
// ---------------------------------------------------------------------------
// WORLD: rail-cheap (fixed 10, 5bps), rail-pricey (fixed 200, 200bps).
// One 100_000n EUR demand on rail-cheap:
//   fees      = 10 + 100_000 * 5 / 10_000 = 10 + 50 = 60 (exact bigint)
//   TOTAL_COST observed = 60; contribution = 60 * 100bps-weight = 6_000n
//   ECONOMIC_COMPRESSION = external 100_000 + 1 hop * 1_000 = 101_000
//   OPERATIONAL_COMPLEXITY = 1 hop * 1_000 + 0 user actions = 1_000
// The aggregate is the exact integer sum of the seven contributions —
// never floating point anywhere (canonical INV-2).
//
// The disqualification receipt: the lawless program rides the cheap rail
// (a strictly better raw score) but fails AUTHORIZATION (DECLARED_BYPASS
// metered per settled demand) and COMPLIANCE (unscreened adversarial
// demand settles); the phases tuple carries the disqualification note and
// `passed` is false regardless of the score.
// ---------------------------------------------------------------------------
// Default-spec receipts (restated)
// ---------------------------------------------------------------------------
// The canonical default spec is the capability-lane trio (AUTHORIZATION /
// COMPLIANCE / PRIVACY) plus the seven LAB.md objectives with the exact
// canonical penalties (hop 1_000; route-failure 50_000; unknown-outcome
// 25_000; user-action 5_000 — all bigint minor units). validateEvaluation-
// Spec accepts it with zero errors.
