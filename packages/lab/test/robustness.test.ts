import { describe, expect, it } from "vitest";
import {
  accumulateRobustnessEvidence,
  defaultEvaluationSpec,
  evaluateRun,
  runSimulation,
} from "@payswap/lab";
import type { RunEvaluationResult, SimulationProgram, SimulatedWorld } from "@payswap/lab";

/**
 * Robustness evidence (P6-W1; split out of the old W2-004 evaluator suite
 * — INV-L02: promotion requires robustness evidence, not a single lucky
 * run; one failing run makes allPassed false; the worst case and the
 * score spread are tracked exactly).
 
 * Site classification (this file): 3 old sites PORTED (the old
 * robustness half of the old evaluator suite: accumulation across
 * scenarios/seeds with worst-case and spread, one failing run makes
 * allPassed false, robustness determinism) + 2 NET-NEW sites (the honest
 * empty-evidence receipt; the scenarioId+seed provenance receipt) = 4
 * tests.
 */

const WORLD: SimulatedWorld = {
  worldId: "robust-world",
  baseCurrency: "EUR",
  stepLatencyMs: 100,
  rails: [
    { railId: "rail-a", currency: "EUR", latencyMs: 300, fixedFeeMinor: 10n, variableFeeBps: 5n },
    { railId: "rail-b", currency: "EUR", latencyMs: 500, fixedFeeMinor: 30n, variableFeeBps: 9n },
  ],
  pools: [
    { poolId: "pool-a", railId: "rail-a", availableMinor: 1_000_000n },
    { poolId: "pool-b", railId: "rail-b", availableMinor: 1_000_000n },
  ],
};

const PROGRAM: SimulationProgram = {
  programId: "robust.program",
  programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b"],
  useNetting: false,
  useNetworkCredit: false,
  delayToleranceSteps: 0,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

function runEvaluation(
  scenarioId: string,
  seed: string,
  program: SimulationProgram = PROGRAM,
): RunEvaluationResult {
  const run = runSimulation({
    scenario: {
      scenarioId,
      demands: [
        { demandId: "d1", atStep: 0, amountMinor: 100_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 60_000 },
      ],
      incidents: [],
    },
    world: WORLD,
    program,
    seed,
  });
  return evaluateRun({ run, program, spec: defaultEvaluationSpec() });
}

describe("robustness evidence (INV-L02)", () => {
  it("accumulates across scenarios and seeds, tracking worst case and spread", () => {
    const evaluations = [
      runEvaluation("s-1", "seed-1"),
      runEvaluation("s-2", "seed-1"),
      runEvaluation("s-1", "seed-2"),
    ];
    const evidence = accumulateRobustnessEvidence({
      programId: PROGRAM.programId,
      programVersion: PROGRAM.programVersion,
      evaluations,
    });
    expect(evidence.totalRuns).toBe(3);
    expect(evidence.passedRuns).toBe(3);
    expect(evidence.allPassed).toBe(true);
    expect(evidence.runs.length).toBe(3);
    expect(evidence.worstScoreMinor).not.toBeUndefined();
    expect(evidence.scoreSpreadMinor).not.toBeUndefined();
    // scores differ across scenarios/seeds -> spread reflects it exactly
    const scores = evaluations.map((e) => e.totalOptimizationScoreMinor);
    const worst = scores.reduce((a, b) => (a > b ? a : b));
    const best = scores.reduce((a, b) => (a < b ? a : b));
    expect(evidence.worstScoreMinor).toBe(worst);
    expect(evidence.scoreSpreadMinor).toBe(worst - best);
    expect(evidence.robustnessId).toBe(`robustness:${evidence.digest}`);
  });

  it("one failing run makes allPassed false — a single lucky run is not robustness", () => {
    const lawless: SimulationProgram = {
      ...PROGRAM,
      fraudScreening: false,
      authorizationMode: "DECLARED_BYPASS",
    };
    const evaluations = [
      runEvaluation("s-1", "seed-1"),
      runEvaluation("s-2", "seed-1", lawless),
    ];
    const evidence = accumulateRobustnessEvidence({
      programId: PROGRAM.programId,
      programVersion: PROGRAM.programVersion,
      evaluations,
    });
    expect(evidence.passedRuns).toBe(1);
    expect(evidence.allPassed).toBe(false);
  });

  it("an empty evidence set is honestly empty (allPassed false, spread undefined)", () => {
    const evidence = accumulateRobustnessEvidence({
      programId: PROGRAM.programId,
      programVersion: PROGRAM.programVersion,
      evaluations: [],
    });
    expect(evidence.totalRuns).toBe(0);
    expect(evidence.passedRuns).toBe(0);
    expect(evidence.allPassed).toBe(false);
    expect(evidence.worstScoreMinor).toBeUndefined();
    expect(evidence.scoreSpreadMinor).toBeUndefined();
  });

  it("robustness evidence is deterministic", () => {
    const build = () =>
      accumulateRobustnessEvidence({
        programId: PROGRAM.programId,
        programVersion: PROGRAM.programVersion,
        evaluations: [runEvaluation("s-1", "seed-1"), runEvaluation("s-2", "seed-2")],
      });
    const a = build();
    const b = build();
    expect(a).toEqual(b);
    expect(a.digest).toBe(b.digest);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.runs)).toBe(true);
  });
});

describe("robustness provenance receipts", () => {
  it("run records preserve the scenarioId + seed provenance of every evaluation", () => {
    const evaluations = [runEvaluation("s-prov", "seed-prov")];
    const evidence = accumulateRobustnessEvidence({
      programId: PROGRAM.programId,
      programVersion: PROGRAM.programVersion,
      evaluations,
    });
    expect(evidence.programId).toBe(PROGRAM.programId);
    expect(evidence.programVersion).toBe(PROGRAM.programVersion);
    expect(evidence.runs[0]?.scenarioId).toBe("s-prov");
    expect(evidence.runs[0]?.seed).toBe("seed-prov");
    expect(evidence.runs[0]?.passed).toBe(true);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/evaluator.test.ts,
// robustness half — re-filed into this suite)
// ---------------------------------------------------------------------------
// PORTED (3): "accumulates across scenarios and seeds, tracking worst case
// and spread"; "one failing run makes allPassed false — a single lucky run
// is not robustness"; "robustness evidence is deterministic".
// NET-NEW (2): the honest empty-evidence receipt; the provenance receipt.
// ---------------------------------------------------------------------------
// Accumulation-semantics receipts
// ---------------------------------------------------------------------------
// totalRuns is the evaluation count; passedRuns counts `passed` (the
// hard-constraint gate, not the raw score); allPassed is TRUE only when
// totalRuns > 0 AND passedRuns === totalRuns — the empty set is honestly
// NOT robust (absence of evidence is not evidence of absence).
// worstScoreMinor is the maximum observed optimization score; the spread
// is worst − best (0 means a perfectly stable score across scenarios and
// seeds). The run records preserve the (scenarioId, seed) provenance of
// every evaluation, so a regression can always be traced to the exact
// scenario x seed cell that produced it. The evidence object and its run
// list are deep-frozen; the robustnessId embeds the content digest.
//
// The one-failing-run receipt is the INV-L02 core: a single lucky
// scenario/seed cell can never certify a program for promotion — the law
// requires robustness ACROSS the suite, and one hard-constraint failure
// anywhere makes the whole bundle fail honestly.
// ---------------------------------------------------------------------------
// Determinism receipts (restated)
// ---------------------------------------------------------------------------
// accumulateRobustnessEvidence is a pure fold over its evaluations: the
// same evaluation list always produces the same evidence object, digest
// and robustnessId. The evaluation fixtures are themselves pure functions
// of (scenarioId, seed, program) via runSimulation + evaluateRun, so the
// whole chain from world data to the promotion gate is reproducible from
// constants — the battery never consults a clock, a locale or randomness.
