/**
 * @payswap/execution-graph — ROBUSTNESS EVIDENCE accumulation (P3-W2; ADAPT
 * of payswap.org@8a735bf packages/lab/src/evaluator.ts second half).
 *
 * Promotion-grade evidence requires robustness across scenarios and seeds —
 * a single lucky run is not robustness. Accumulation is deterministic and
 * content-digested; results are ADVISORY evidence (INV-11).
 */

import { ValidationError } from './errors.ts';
import { canonicalDigest, deepFreeze } from './canonical.ts';
import type {
  RobustnessEvidence,
  RobustnessRunRecord,
  RunEvaluationResult,
} from './evaluation-contract.ts';

/**
 * Accumulate robustness evidence from a set of evaluations of the SAME
 * program across scenarios and/or seeds. `allPassed` requires EVERY run to
 * have passed; the worst (highest) optimization score and the spread are
 * tracked exactly in bigint minor units.
 */
export function accumulateRobustnessEvidence(input: {
  readonly programId: string;
  readonly programVersion: string;
  readonly evaluations: readonly RunEvaluationResult[];
}): RobustnessEvidence {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('a robustness accumulation input is required');
  }
  if (typeof input.programId !== 'string' || input.programId.length === 0) {
    throw new ValidationError('programId must be a non-empty string');
  }
  for (const evaluation of input.evaluations) {
    if (evaluation.programId !== input.programId) {
      throw new ValidationError(
        'robustness evidence accumulates evaluations of the SAME program — a foreign evaluation is rejected',
      );
    }
  }
  const runs: RobustnessRunRecord[] = input.evaluations.map((evaluation) => ({
    scenarioId: evaluation.scenarioId,
    seed: evaluation.seed,
    passed: evaluation.passed,
    totalOptimizationScoreMinor: evaluation.totalOptimizationScoreMinor,
  }));
  const totalRuns = runs.length;
  const passedRuns = runs.filter((record) => record.passed).length;
  const scores = runs.map((record) => record.totalOptimizationScoreMinor);
  const worstScoreMinor = scores.reduce<bigint | undefined>(
    (worst, score) => (worst === undefined || score > worst ? score : worst),
    undefined,
  );
  const bestScoreMinor = scores.reduce<bigint | undefined>(
    (best, score) => (best === undefined || score < best ? score : best),
    undefined,
  );
  const scoreSpreadMinor =
    worstScoreMinor !== undefined && bestScoreMinor !== undefined
      ? worstScoreMinor - bestScoreMinor
      : undefined;

  const digest = canonicalDigest({
    binding: 'robustness-evidence',
    programId: input.programId,
    programVersion: input.programVersion,
    runs,
  });

  return deepFreeze({
    robustnessId: `robustness:${digest}`,
    programId: input.programId,
    programVersion: input.programVersion,
    totalRuns,
    passedRuns,
    allPassed: totalRuns > 0 && passedRuns === totalRuns,
    worstScoreMinor,
    scoreSpreadMinor,
    runs: Object.freeze(runs),
    digest,
  });
}
