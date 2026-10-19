/**
 * Counterfactual evidence (P6-W1; the P6 rebuild of the old
 * payswap.org@8a735bf packages/lab replay.ts counterfactual section,
 * W2-004).
 *
 * INV-L02: the SAME recorded facts are re-run under a variant program and
 * compared against the base replay. Facts stay frozen; only the program
 * differs. The delta is computed per metric exactly (bigint for money,
 * integer for counts) — positive means the variant moved more / paid
 * more / failed more than the base.
 *
 * Like every Lab artifact, a counterfactual result carries the REPLAY
 * namespace brand (INV-L01 / canonical INV-11) and is advisory/test
 * evidence only — never production financial authority.
 */

import { canonicalize, deepFreeze, fnv1a64 } from "./canonical.ts";
import type { SimulationProgram } from "./simulation-plan.ts";
import type { RecordedProductionFacts, ReplayResult } from "./replay.ts";
import { REPLAY_NAMESPACE, runReplay } from "./replay.ts";
import type { ReplayNamespaceBrand } from "./replay.ts";

// ---------------------------------------------------------------------------
// Counterfactual (INV-L02)
// ---------------------------------------------------------------------------

export interface CounterfactualInput {
  readonly facts: RecordedProductionFacts;
  readonly baseProgram: SimulationProgram;
  readonly variantProgram: SimulationProgram;
  readonly seed: string;
  readonly stepMs: number;
}

/** The exact per-metric delta of a counterfactual (variant − base). */
export interface ReplayDelta {
  readonly settled: number;
  readonly partiallySettled: number;
  readonly failedNoViableRoute: number;
  readonly unknownOutcomes: number;
  readonly feesMinor: bigint;
  readonly fxSpreadPaidMinor: bigint;
  readonly externalValueMovedMinor: bigint;
  readonly adversarialSettled: number;
  readonly deadlineMisses: number;
}

export interface CounterfactualResult extends ReplayNamespaceBrand {
  readonly namespace: typeof REPLAY_NAMESPACE;
  readonly counterfactualId: string;
  readonly base: ReplayResult;
  readonly variant: ReplayResult;
  /** variant − base per metric (positive = variant moved more/paid more). */
  readonly delta: ReplayDelta;
  readonly digest: string;
}


/**
 * Runs a counterfactual: the same recorded facts under a variant program,
 * compared against the base replay (INV-L02 evidence). The facts are used
 * read-only for BOTH branches and are never rewritten. Deterministic for
 * identical inputs.
 */
export function runCounterfactual(
  input: CounterfactualInput,
): CounterfactualResult {
  const base = runReplay({
    facts: input.facts,
    program: input.baseProgram,
    seed: input.seed,
    stepMs: input.stepMs,
  });
  const variant = runReplay({
    facts: input.facts,
    program: input.variantProgram,
    seed: input.seed,
    stepMs: input.stepMs,
  });
  const baseMetrics = base.run.metrics;
  const variantMetrics = variant.run.metrics;
  const delta: ReplayDelta = {
    settled: variantMetrics.settled - baseMetrics.settled,
    partiallySettled:
      variantMetrics.partiallySettled - baseMetrics.partiallySettled,
    failedNoViableRoute:
      variantMetrics.failedNoViableRoute - baseMetrics.failedNoViableRoute,
    unknownOutcomes: variantMetrics.unknownOutcomes - baseMetrics.unknownOutcomes,
    feesMinor: variantMetrics.feesMinor - baseMetrics.feesMinor,
    fxSpreadPaidMinor:
      variantMetrics.fxSpreadPaidMinor - baseMetrics.fxSpreadPaidMinor,
    externalValueMovedMinor:
      variantMetrics.externalValueMovedMinor - baseMetrics.externalValueMovedMinor,
    adversarialSettled:
      variantMetrics.adversarialSettled - baseMetrics.adversarialSettled,
    deadlineMisses: variantMetrics.deadlineMisses - baseMetrics.deadlineMisses,
  };
  const digest = fnv1a64(
    canonicalize({
      factsId: input.facts.factsId,
      baseDigest: base.digest,
      variantDigest: variant.digest,
      delta,
    }),
  );
  return deepFreeze({
    namespace: REPLAY_NAMESPACE,
    __payswapLabReplayNamespace: REPLAY_NAMESPACE,
    counterfactualId: `counterfactual:${digest}`,
    base,
    variant,
    delta,
    digest,
  });
}
