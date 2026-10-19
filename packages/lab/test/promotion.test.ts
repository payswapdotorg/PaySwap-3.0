import { describe, expect, it } from "vitest";
import {
  PROMOTION_EVIDENCE_KINDS,
  PromotionLedger,
  comparePromotionCandidates,
  defaultEvaluationSpec,
  evaluateRun,
  isPromotionEvidenceKind,
  isPromotionStage,
  requiredEvidenceForTarget,
  runSimulation,
} from "@payswap/lab";
import type {
  PromotionEvidenceRef,
  PromotionStage,
  SimulationProgram,
  SimulatedWorld,
  SimulationScenarioPlan,
} from "@payswap/lab";

/**
 * Shadow/canary promotion (P6-W1 rebuild of the old W2-004 suite; LAB.md
 * "Promotion"; INV-L02 + INV-L03 + INV-15 side-by-side no-prior).
 
 * Site classification (this file): 13 old sites PORTED (the full old
 * promotion corpus: INV-L02 gate, the legal DRAFT->BENCHMARKED->
 * VALIDATED->SHADOW advance, CANARY/PRODUCTION report requirements, the
 * stage-contract mirror, skip rejection, published-version references,
 * rollback-append, retirement terminality, earlier-target enforcement,
 * the four INV-15 ranking sites) + 2 NET-NEW (stage/evidence vocabulary
 * predicates; append-only content-stable history) = 15 tests.
 */

const evidence = (
  kinds: readonly PromotionEvidenceRef["kind"][],
): PromotionEvidenceRef[] =>
  kinds.map((kind, index) => ({
    evidenceId: `ev-${kind}-${index}`,
    kind,
    artifactRef: `artifacts/${kind}-${index}`,
    contentDigest: `digest-${kind}-${index}`,
  }));

const FULL_TRIPLE = evidence(["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS"]);
const BASELINE = evidence(["BASELINE_SUITE_EVALUATION"]);
const CANDIDATE_VERSION = 1;

/** Advances one candidate legally to a stage (evidence permitting). */
function advance(
  ledger: PromotionLedger,
  candidateId: string,
  targetStage: PromotionStage,
  evidenceRefs: readonly PromotionEvidenceRef[],
  orderedAt = "t",
): void {
  ledger.orderPromotion({ candidateId, candidateVersion: CANDIDATE_VERSION, targetStage, evidence: evidenceRefs, orderedAt });
}

describe("promotion evidence gating (INV-L02)", () => {
  it("requires the replay/counterfactual/robustness triple to reach SHADOW", () => {
    const ledger = new PromotionLedger();
    // Advance legally to VALIDATED first; SHADOW is then reachable and ONLY
    // the INV-L02 evidence bundle can block it.
    advance(ledger, "cand-1", "BENCHMARKED", BASELINE, "t0");
    advance(ledger, "cand-1", "VALIDATED", FULL_TRIPLE, "t0.5");
    expect(() => advance(ledger, "cand-1", "SHADOW", [], "t1")).toThrow(/INV-L02/);
    expect(() =>
      advance(ledger, "cand-1", "SHADOW", evidence(["REPLAY", "ROBUSTNESS"]), "t2"),
    ).toThrow(/COUNTERFACTUAL/);
  });

  it("advances DRAFT -> BENCHMARKED -> VALIDATED -> SHADOW with the required evidence", () => {
    const ledger = new PromotionLedger();
    const toBenchmarked = ledger.orderPromotion({
      candidateId: "cand-1",
      candidateVersion: CANDIDATE_VERSION,
      targetStage: "BENCHMARKED",
      evidence: BASELINE,
      orderedAt: "t1",
    });
    expect(toBenchmarked.fromStage).toBe("DRAFT");
    expect(toBenchmarked.toStage).toBe("BENCHMARKED");

    const toValidated = ledger.orderPromotion({
      candidateId: "cand-1",
      candidateVersion: CANDIDATE_VERSION,
      targetStage: "VALIDATED",
      evidence: FULL_TRIPLE,
      orderedAt: "t2",
    });
    expect(toValidated.toStage).toBe("VALIDATED");

    const toShadow = ledger.orderPromotion({
      candidateId: "cand-1",
      candidateVersion: CANDIDATE_VERSION,
      targetStage: "SHADOW",
      evidence: FULL_TRIPLE,
      orderedAt: "t3",
    });
    expect(toShadow.toStage).toBe("SHADOW");
    expect(ledger.currentStage("cand-1")).toBe("SHADOW");
  });

  it("CANARY additionally requires a shadow report; PRODUCTION a canary report too", () => {
    const ledger = new PromotionLedger();
    advance(ledger, "cand-2", "BENCHMARKED", BASELINE, "t1");
    advance(ledger, "cand-2", "VALIDATED", FULL_TRIPLE, "t2");
    advance(ledger, "cand-2", "SHADOW", FULL_TRIPLE, "t3");
    expect(() => advance(ledger, "cand-2", "CANARY", FULL_TRIPLE, "t4")).toThrow(
      /SHADOW_REPORT/,
    );
    advance(
      ledger,
      "cand-2",
      "CANARY",
      evidence(["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS", "SHADOW_REPORT"]),
      "t5",
    );
    expect(() =>
      advance(
        ledger,
        "cand-2",
        "PRODUCTION",
        evidence(["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS", "SHADOW_REPORT"]),
        "t6",
      ),
    ).toThrow(/CANARY_REPORT/);
  });

  it("requiredEvidenceForTarget mirrors the LAB.md stage contract", () => {
    expect(requiredEvidenceForTarget("BENCHMARKED")).toEqual(["BASELINE_SUITE_EVALUATION"]);
    expect(requiredEvidenceForTarget("SHADOW")).toEqual(["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS"]);
    expect(requiredEvidenceForTarget("CANARY")).toContain("SHADOW_REPORT");
    expect(requiredEvidenceForTarget("PRODUCTION")).toContain("CANARY_REPORT");
    expect(requiredEvidenceForTarget("DRAFT")).toEqual([]);
    expect(requiredEvidenceForTarget("RETIRED")).toEqual([]);
  });
});

describe("promotion is versioned and reversible (INV-L03)", () => {
  it("stage skipping is rejected", () => {
    const ledger = new PromotionLedger();
    expect(() => advance(ledger, "cand-skip", "VALIDATED", FULL_TRIPLE, "t1")).toThrow(
      /one stage at a time/,
    );
    expect(() => advance(ledger, "cand-skip", "PRODUCTION", FULL_TRIPLE, "t2")).toThrow(
      /one stage at a time/,
    );
  });

  it("every order references an immutable published candidate version", () => {
    const ledger = new PromotionLedger();
    expect(() =>
      ledger.orderPromotion({
        candidateId: "cand-v0",
        candidateVersion: 0,
        targetStage: "BENCHMARKED",
        evidence: BASELINE,
        orderedAt: "t1",
      }),
    ).toThrow(/published version/);
    const order = ledger.orderPromotion({
      candidateId: "cand-v1",
      candidateVersion: 2,
      targetStage: "BENCHMARKED",
      evidence: BASELINE,
      orderedAt: "t2",
    });
    expect(order.candidateVersion).toBe(2);
    expect(order.orderId).toBe("promotion:cand-v1:1");
  });

  it("a rollback APPENDS to history and moves the active stage back (never rewrites)", () => {
    const ledger = new PromotionLedger();
    advance(ledger, "cand-rb", "BENCHMARKED", BASELINE, "t1");
    advance(ledger, "cand-rb", "VALIDATED", FULL_TRIPLE, "t2");
    const before = ledger.historyFor("cand-rb").length;
    const rollback = ledger.orderRollback({
      candidateId: "cand-rb",
      candidateVersion: CANDIDATE_VERSION,
      toStage: "BENCHMARKED",
      reason: "shadow drift",
      orderedAt: "t3",
    });
    expect(rollback.orderKind).toBe("ROLLBACK");
    expect(rollback.fromStage).toBe("VALIDATED");
    expect(rollback.toStage).toBe("BENCHMARKED");
    expect(ledger.currentStage("cand-rb")).toBe("BENCHMARKED");
    expect(ledger.historyFor("cand-rb").length).toBe(before + 1);
    // The prior orders are untouched (append-only).
    expect(ledger.historyFor("cand-rb")[0]?.orderKind).toBe("ADVANCE");
  });

  it("retirement is terminal but the history remains queryable", () => {
    const ledger = new PromotionLedger();
    advance(ledger, "cand-ret", "BENCHMARKED", BASELINE, "t1");
    const retire = ledger.retire({
      candidateId: "cand-ret",
      candidateVersion: 1,
      reason: "superseded",
      orderedAt: "t2",
    });
    expect(retire.toStage).toBe("RETIRED");
    expect(ledger.currentStage("cand-ret")).toBe("RETIRED");
    expect(ledger.historyFor("cand-ret").length).toBe(2);
    expect(() =>
      ledger.retire({
        candidateId: "cand-ret",
        candidateVersion: CANDIDATE_VERSION,
        reason: "again",
        orderedAt: "t3",
      }),
    ).toThrow(/already retired/);
  });

  it("rollback targets must be EARLIER than the current stage", () => {
    const ledger = new PromotionLedger();
    expect(() =>
      ledger.orderRollback({
        candidateId: "cand-fresh",
        candidateVersion: 1,
        toStage: "VALIDATED",
        reason: "nowhere to go",
        orderedAt: "t1",
      }),
    ).toThrow(/earlier/);
  });

  it("the stage and evidence vocabularies are total predicates", () => {
    for (const stage of ["DRAFT", "BENCHMARKED", "VALIDATED", "SHADOW", "CANARY", "PRODUCTION", "RETIRED"] as const) {
      expect(isPromotionStage(stage)).toBe(true);
    }
    expect(isPromotionStage("GA")).toBe(false);
    for (const kind of PROMOTION_EVIDENCE_KINDS) {
      expect(isPromotionEvidenceKind(kind)).toBe(true);
      expect(requiredEvidenceForTarget("PRODUCTION" as PromotionStage)).toBeDefined();
    }
    expect(isPromotionEvidenceKind("VIBES")).toBe(false);
  });

  it("the ledger history is append-only and content-stable across rollbacks", () => {
    const ledger = new PromotionLedger();
    advance(ledger, "cand-stable", "BENCHMARKED", BASELINE, "t1");
    const historyBefore = ledger
      .historyFor("cand-stable")
      .map((order) => order.orderDigest);
    ledger.orderRollback({
      candidateId: "cand-stable",
      candidateVersion: CANDIDATE_VERSION,
      toStage: "DRAFT",
      reason: "reset",
      orderedAt: "t2",
    });
    const historyAfter = ledger
      .historyFor("cand-stable")
      .map((order) => order.orderDigest);
    expect(historyAfter.slice(0, historyBefore.length)).toEqual(historyBefore);
    expect(historyAfter.length).toBe(historyBefore.length + 1);
  });
});

describe("side-by-side candidate comparison (INV-15: no composition prior)", () => {
  // Real evaluations: deterministic world with a cheap and a pricey rail.
  const WORLD: SimulatedWorld = {
    worldId: "compare-world",
    baseCurrency: "EUR",
    stepLatencyMs: 100,
    rails: [
      { railId: "rail-cheap", currency: "EUR", latencyMs: 800, fixedFeeMinor: 1n, variableFeeBps: 1n },
      { railId: "rail-pricey", currency: "EUR", latencyMs: 200, fixedFeeMinor: 90n, variableFeeBps: 90n },
    ],
    pools: [
      { poolId: "pool-cheap", railId: "rail-cheap", availableMinor: 1_000_000n },
      { poolId: "pool-pricey", railId: "rail-pricey", availableMinor: 1_000_000n },
    ],
  };
  const SCENARIO: SimulationScenarioPlan = {
    scenarioId: "compare-scenario",
    demands: [
      {
        demandId: "d1",
        atStep: 0,
        amountMinor: 100_000n,
        currency: "EUR",
        direction: "OUTBOUND",
        deadlineMs: 60_000,
      },
    ],
    incidents: [],
  };

  const programOf = (
    programId: string,
    routePreference: readonly string[],
    overrides?: Partial<SimulationProgram>,
  ): SimulationProgram => ({
    programId,
    programVersion: "1.0.0",
    routePreference,
    useNetting: false,
    useNetworkCredit: false,
    delayToleranceSteps: 0,
    fraudScreening: true,
    privacyBounded: true,
    authorizationMode: "PROTOCOL_AUTHORIZED",
    ...(overrides ?? {}),
  });

  const evaluate = (program: SimulationProgram): ReturnType<typeof evaluateRun> =>
    evaluateRun({
      run: runSimulation({ scenario: SCENARIO, world: WORLD, program, seed: "cmp" }),
      program,
      spec: defaultEvaluationSpec(),
    });
  const entry = (
    candidateId: string,
    execution: "PASS_THROUGH_NATIVE" | "COMPOSED_PAYSWAP" | "OPTIMIZED_MULTI_PROVIDER",
    isIncumbentBaseline: boolean,
    program: SimulationProgram,
  ) => ({ candidateId, execution, isIncumbentBaseline, evaluation: evaluate(program) });

  it("ranks PASS_THROUGH_NATIVE above composed candidates when the incumbent scores better", () => {
    const ranked = comparePromotionCandidates([
      entry("cand-native", "PASS_THROUGH_NATIVE", true, programOf("native", ["rail-cheap"])),
      entry("cand-composed", "COMPOSED_PAYSWAP", false, programOf("composed", ["rail-pricey"])),
      entry("cand-multi", "OPTIMIZED_MULTI_PROVIDER", false, programOf("multi", ["rail-pricey", "rail-cheap"])),
    ]);
    expect(ranked[0]?.candidateId).toBe("cand-native");
    expect(ranked[0]?.isIncumbentBaseline).toBe(true);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it("ranks a composed candidate above the incumbent when IT scores better (both directions)", () => {
    const ranked = comparePromotionCandidates([
      entry("cand-native", "PASS_THROUGH_NATIVE", true, programOf("native", ["rail-pricey"])),
      entry("cand-composed", "COMPOSED_PAYSWAP", false, programOf("composed", ["rail-cheap"])),
    ]);
    expect(ranked[0]?.candidateId).toBe("cand-composed");
    expect(ranked[1]?.candidateId).toBe("cand-native");
  });

  it("hard-constraint failures rank below every passing candidate regardless of score", () => {
    const ranked = comparePromotionCandidates([
      entry("cand-cheap-but-lawless", "COMPOSED_PAYSWAP", false, programOf("lawless", ["rail-cheap"], {
        fraudScreening: false,
        authorizationMode: "DECLARED_BYPASS",
      })),
      entry("cand-sound", "PASS_THROUGH_NATIVE", true, programOf("sound", ["rail-pricey"])),
    ]);
    expect(ranked[0]?.candidateId).toBe("cand-sound");
    expect(ranked[0]?.passedHardConstraints).toBe(true);
    expect(ranked[1]?.candidateId).toBe("cand-cheap-but-lawless");
    expect(ranked[1]?.passedHardConstraints).toBe(false);
  });

  it("equal scores tie-break deterministically on candidateId", () => {
    const ranked = comparePromotionCandidates([
      entry("cand-a", "COMPOSED_PAYSWAP", false, programOf("tie-a", ["rail-cheap"])),
      entry("cand-b", "COMPOSED_PAYSWAP", false, programOf("tie-b", ["rail-cheap"])),
    ]);
    expect(ranked.map((entry) => entry.candidateId)).toEqual(["cand-a", "cand-b"]);
    expect(ranked[0]?.totalOptimizationScoreMinor).toBe(ranked[1]?.totalOptimizationScoreMinor);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/promotion.test.ts)
// ---------------------------------------------------------------------------
// PORTED (13): "requires the replay/counterfactual/robustness triple to
// reach SHADOW"; "advances DRAFT -> BENCHMARKED -> VALIDATED -> SHADOW with
// the required evidence"; "CANARY additionally requires a shadow report;
// PRODUCTION a canary report too"; "requiredEvidenceForTarget mirrors the
// LAB.md stage contract"; "stage skipping is rejected"; "every order
// references an immutable published candidate version"; "a rollback
// APPENDS to history and moves the active stage back (never rewrites)";
// "retirement is terminal but the history remains queryable"; "rollback
// targets must be EARLIER than the current stage"; "ranks
// PASS_THROUGH_NATIVE above composed candidates when the incumbent scores
// better"; "ranks a composed candidate above the incumbent when IT scores
// better (both directions)"; "hard-constraint failures rank below every
// passing candidate regardless of score"; "equal scores tie-break
// deterministically on candidateId".
// NET-NEW (2): vocabulary predicates; append-only history receipt.
