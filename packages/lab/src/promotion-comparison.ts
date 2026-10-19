/**
 * Side-by-side promotion candidate comparison (P6-W1; the P6 rebuild of
 * the old payswap.org@8a735bf packages/lab promotion.ts comparison
 * section, W2-004 — old INV-C07/C08, canonical INV-15).
 *
 * Ranks EXPLICIT side-by-side candidates across the three execution modes
 * by evidence only: hard constraints first, then the optimization score
 * (lower is better), then a deterministic tie-break on candidateId. There
 * is NO mode-based prior: PASS_THROUGH_NATIVE, COMPOSED_PAYSWAP and
 * OPTIMIZED_MULTI_PROVIDER compete purely on evidence — the incumbent
 * native candidate can win or lose exactly like every other candidate.
 *
 * THE ACCEPTED RENAME (P6-W1): the evaluation entry carries `execution`
 * (the old field name was `executionMode`).
 */

import type { PinnedExecutionMode } from "./pins/capability.ts";
import type { RunEvaluationResult } from "./evaluator.ts";

// ---------------------------------------------------------------------------
// Side-by-side candidate comparison (INV-15)
// ---------------------------------------------------------------------------

export interface PromotionCandidateEvaluation {
  readonly candidateId: string;
  /** The accepted P6-W1 rename of the old executionMode field name. */
  readonly execution: PinnedExecutionMode;
  readonly isIncumbentBaseline: boolean;
  readonly evaluation: RunEvaluationResult;
}

export interface RankedPromotionCandidate {
  readonly candidateId: string;
  readonly execution: PinnedExecutionMode;
  readonly isIncumbentBaseline: boolean;
  readonly rank: number;
  readonly passedHardConstraints: boolean;
  readonly totalOptimizationScoreMinor: bigint;
}

/**
 * Ranks explicit side-by-side candidates. HARD CONSTRAINTS FIRST, then the
 * optimization score (lower is better), then deterministic tie-break on
 * candidateId. There is NO mode-based prior: PASS_THROUGH_NATIVE,
 * COMPOSED_PAYSWAP and OPTIMIZED_MULTI_PROVIDER compete purely on evidence
 * (INV-15 — the incumbent native candidate can win or lose).
 */
export function comparePromotionCandidates(
  evaluations: readonly PromotionCandidateEvaluation[],
): readonly RankedPromotionCandidate[] {
  const sorted = [...evaluations].sort((left, right) => {
    const leftPass = left.evaluation.passedHardConstraints ? 1 : 0;
    const rightPass = right.evaluation.passedHardConstraints ? 1 : 0;
    if (leftPass !== rightPass) {
      return rightPass - leftPass; // passing candidates first
    }
    const leftScore = left.evaluation.totalOptimizationScoreMinor;
    const rightScore = right.evaluation.totalOptimizationScoreMinor;
    if (leftScore !== rightScore) {
      return leftScore < rightScore ? -1 : 1; // lower cost first
    }
    return left.candidateId < right.candidateId
      ? -1
      : left.candidateId > right.candidateId
        ? 1
        : 0;
  });
  return Object.freeze(
    sorted.map((entry, index) => ({
      candidateId: entry.candidateId,
      execution: entry.execution,
      isIncumbentBaseline: entry.isIncumbentBaseline,
      rank: index + 1,
      passedHardConstraints: entry.evaluation.passedHardConstraints,
      totalOptimizationScoreMinor: entry.evaluation.totalOptimizationScoreMinor,
    })),
  );
}
