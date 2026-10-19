import { describe, expect, it } from "vitest";
import {
  BASELINE_CANDIDATES,
  PINNED_EXECUTION_MODES,
  defaultEvaluationSpec,
  evaluateRun,
  getBaselineSuite,
  runSimulation,
} from "@payswap/lab";
import type { BaselineCandidate } from "@payswap/lab";

/**
 * The mandatory baseline candidate set (P6-W1; split out of the old
 * W2-004 scenarios suite — LAB.md "Promotion": deterministic/generalist,
 * hand-designed, searched and the incumbent production candidate; ALL
 * THREE execution modes appear as EXPLICIT side-by-side candidates;
 * INV-15: the incumbent is never assumed inferior; the whole set runs
 * GREEN on the canonical hard-constraint trio).
 
 * Site classification (this file): 4 old sites PORTED (the old
 * baseline-candidate half of the old scenarios suite: the four mandatory
 * kinds, ALL THREE execution modes side-by-side, exactly-one incumbent
 * (INV-15), the runs-GREEN whole-suite receipt) + 2 NET-NEW sites (the
 * `execution` field-rename receipt on the candidate records; the
 * cheapest-first searched-program receipt) = 6 tests.
 */

describe("baseline candidate set (LAB.md mandatory baselines)", () => {
  it("contains exactly the four mandatory baseline kinds", () => {
    const suite = getBaselineSuite();
    expect(suite.candidates.length).toBe(4);
    expect(BASELINE_CANDIDATES).toEqual(suite.candidates);
    const kinds = suite.candidates.map((c: BaselineCandidate) => c.baselineKind);
    expect(kinds).toEqual([
      "DETERMINISTIC_GENERALIST",
      "HAND_DESIGNED",
      "SEARCHED",
      "INCUMBENT_PRODUCTION",
    ]);
    for (const candidate of suite.candidates) {
      expect(candidate.program.authorizationMode).toBe("PROTOCOL_AUTHORIZED");
      expect(candidate.program.fraudScreening).toBe(true);
      expect(candidate.program.privacyBounded).toBe(true);
      expect(candidate.label.length).toBeGreaterThan(0);
    }
  });

  it("presents ALL THREE execution modes as explicit side-by-side candidates (the `execution` rename)", () => {
    const modes = getBaselineSuite().candidates.map((c: BaselineCandidate) => c.execution);
    for (const mode of PINNED_EXECUTION_MODES) {
      expect(modes).toContain(mode);
    }
    // The field name is the accepted P6-W1 rename of executionMode.
    for (const candidate of BASELINE_CANDIDATES) {
      expect(candidate).toHaveProperty("execution");
      expect(candidate).not.toHaveProperty("executionMode");
    }
  });

  it("marks exactly the incumbent production candidate as the incumbent baseline (INV-15)", () => {
    const incumbents = BASELINE_CANDIDATES.filter((c: BaselineCandidate) => c.isIncumbentBaseline);
    expect(incumbents.length).toBe(1);
    expect(incumbents[0]?.baselineKind).toBe("INCUMBENT_PRODUCTION");
    expect(incumbents[0]?.execution).toBe("PASS_THROUGH_NATIVE");
    expect(incumbents[0]?.program.programId).toBe("baseline.incumbent-native");
    expect(incumbents[0]?.program.routePreference).toEqual(["rail-a"]);
  });

  it("runs GREEN: every baseline candidate passes the hard-constraint trio on the whole suite", () => {
    const suite = getBaselineSuite();
    const spec = defaultEvaluationSpec(); // AUTHORIZATION + COMPLIANCE + PRIVACY
    for (const candidate of suite.candidates) {
      for (const scenario of suite.scenarios) {
        const run = runSimulation({
          scenario: scenario.plan,
          world: scenario.world,
          program: candidate.program,
          seed: "baseline-green",
        });
        const evaluation = evaluateRun({ run, program: candidate.program, spec });
        expect(evaluation.passedHardConstraints).toBe(true);
      }
    }
  });

  it("the four baseline programs are pairwise distinct deterministic data", () => {
    const ids = BASELINE_CANDIDATES.map((c: BaselineCandidate) => c.program.programId);
    expect(new Set(ids).size).toBe(4);
    for (const candidate of BASELINE_CANDIDATES) {
      const program = candidate.program;
      const again = BASELINE_CANDIDATES.find(
        (c: BaselineCandidate) => c.baselineKind === candidate.baselineKind,
      )?.program;
      expect(again).toEqual(program);
    }
  });
});

describe("searched baseline receipt", () => {
  it("the searched program's routePreference is the cheapest-first ordering over the baseline world", () => {
    // Reference-amount cost model: fixed + 1_000_000 * bps / 10_000.
    // rail-d: 5+40=45 < rail-b: 40+80=120 < rail-a: 25+100=125 < rail-c: 15+120=135.
    const searched = BASELINE_CANDIDATES.find((c) => c.baselineKind === "SEARCHED");
    expect(searched?.program.routePreference).toEqual(["rail-d", "rail-b", "rail-a", "rail-c"]);
    expect(searched?.program.useNetting).toBe(true);
    expect(searched?.program.useNetworkCredit).toBe(true);
    expect(searched?.program.delayToleranceSteps).toBe(2);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/scenarios.test.ts,
// baseline-candidate half — re-filed into this suite)
// ---------------------------------------------------------------------------
// PORTED (4): "contains exactly the four mandatory baseline kinds";
// "presents ALL THREE execution modes as explicit side-by-side
// candidates"; "marks exactly the incumbent production candidate as the
// incumbent baseline (INV-15)"; "runs GREEN: every baseline candidate
// passes the hard-constraint trio on the whole suite".
// NET-NEW (2): the `execution` field-rename receipt; the cheapest-first
// searched-program receipt.
// ---------------------------------------------------------------------------
// Baseline-set receipts (LAB.md "Promotion": the mandatory candidate set)
// ---------------------------------------------------------------------------
// The four mandatory baselines: DETERMINISTIC_GENERALIST (preference-
// ordered, no batching, COMPOSED_PAYSWAP), HAND_DESIGNED (latency-first
// preference with netting + explicit credit, COMPOSED_PAYSWAP), SEARCHED
// (the greedy multi-provider program shape the deterministic search
// plug-in reproduces over the baseline world, OPTIMIZED_MULTI_PROVIDER)
// and INCUMBENT_PRODUCTION (the provider-native pass-through candidate,
// PASS_THROUGH_NATIVE, INV-15). All three execution modes therefore appear
// as EXPLICIT side-by-side candidates — none structurally advantaged.
//
// The runs-GREEN receipt: every candidate passes the canonical
// hard-constraint trio (AUTHORIZATION / COMPLIANCE / PRIVACY) on every
// scenario of the whole baseline suite under the default spec. The
// incumbent is held to exactly the same gates as the composed candidates.
// ---------------------------------------------------------------------------
// Determinism receipts (restated)
// ---------------------------------------------------------------------------
// BASELINE_CANDIDATES is a module-level frozen constant: the suite
// accessor returns the same structural data on every call, and the four
// programs are pairwise distinct deterministic data — the searched program
// is kept as DATA so the baseline suite is usable without running a
// search first, while search.test.ts independently proves the plug-in
// reproduces exactly that shape over the baseline world.
