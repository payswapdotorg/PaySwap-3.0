/**
 * @payswap/execution-graph — EVALUATION contracts (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/lab/src/evaluator.ts, W2-004).
 *
 * HARD CONSTRAINTS PRECEDE OPTIMIZATION: compliance, sanctions, risk,
 * policy and security constraints are hard constraints before soft
 * optimization. Enforced three ways (carried over from the accepted old
 * design):
 * 1. RUNTIME: `evaluateRun` evaluates every hard constraint first; a single
 *    failure marks the run `passed === false` regardless of the score.
 * 2. TYPE: `RunEvaluationResult.phases` is a TUPLE — the compiler itself
 *    guarantees the ordering can never be swapped.
 * 3. RANKING: robustness accumulation filters on hard constraints BEFORE
 *    ordering by optimization score.
 *
 * Evaluation results are ADVISORY evidence (INV-11): they rank strategy
 * candidates for the Director's advisory outputs; they never authorize and
 * never declare financial truth.
 */

import type { SimulationRunResult } from './simulation-contract.ts';
import type { StrategyProgram } from './strategy-contract.ts';

/** Hard constraints the built-in evaluator can check from run metrics. */
export const HARD_CONSTRAINT_IDS = [
  'AUTHORIZATION',
  'COMPLIANCE',
  'PRIVACY',
  'DEADLINE',
  'EXPLICIT_CREDIT',
] as const;

export type HardConstraintId = (typeof HARD_CONSTRAINT_IDS)[number];

/** Total predicate over the hard-constraint vocabulary. */
export function isHardConstraintId(value: unknown): value is HardConstraintId {
  return (
    typeof value === 'string' &&
    (HARD_CONSTRAINT_IDS as readonly unknown[]).includes(value)
  );
}

/** A hard-constraint declaration inside an evaluation spec. */
export interface HardConstraintSpec {
  readonly constraintId: HardConstraintId;
  readonly description: string;
}

/**
 * Optimization objectives the built-in evaluator can score. All are
 * lower-is-better costs expressed in exact minor units (counts are priced
 * via the evaluation spec penalties so the aggregate stays a bigint).
 */
export const OBJECTIVE_IDS = [
  'TOTAL_COST',
  'ECONOMIC_COMPRESSION',
  'RESILIENCE',
  'LATENCY',
  'LIQUIDITY_LOCKED',
  'COUNTERPARTY_EXPOSURE',
  'OPERATIONAL_COMPLEXITY',
] as const;

export type ObjectiveId = (typeof OBJECTIVE_IDS)[number];

/** Total predicate over the objective vocabulary. */
export function isObjectiveId(value: unknown): value is ObjectiveId {
  return (
    typeof value === 'string' &&
    (OBJECTIVE_IDS as readonly unknown[]).includes(value)
  );
}

/** An optimization objective declaration with an integer weight (bps). */
export interface ObjectiveSpec {
  readonly objectiveId: ObjectiveId;
  readonly description: string;
  /** Positive integer weight; the aggregate is SUM(weight * observed). */
  readonly weightBps: bigint;
}

/** Penalties that price count-based objectives into minor units. */
export interface ObjectivePenalties {
  /** Cost of one external hop for ECONOMIC_COMPRESSION. */
  readonly hopPenaltyMinor: bigint;
  /** Cost of one failed route for RESILIENCE. */
  readonly routeFailurePenaltyMinor: bigint;
  /** Cost of one UNKNOWN outcome awaiting reconciliation for RESILIENCE. */
  readonly unknownOutcomePenaltyMinor: bigint;
  /** Cost of one user-action-required outcome for OPERATIONAL_COMPLEXITY. */
  readonly userActionPenaltyMinor: bigint;
}

/** The full evaluation specification. */
export interface EvaluationSpec {
  readonly hardConstraints: readonly HardConstraintSpec[];
  readonly objectives: readonly ObjectiveSpec[];
  readonly penalties: ObjectivePenalties;
}

/** One hard-constraint check result. */
export interface HardConstraintResult {
  readonly constraintId: HardConstraintId;
  readonly passed: boolean;
  /** Human-readable observed value that decided the constraint. */
  readonly observed: string;
}

/** Phase 1 — hard constraints (tuple position 0, always first). */
export interface HardConstraintsPhase {
  readonly phase: 'HARD_CONSTRAINTS';
  readonly results: readonly HardConstraintResult[];
  readonly allPassed: boolean;
}

/** One objective's contribution to the aggregate optimization score. */
export interface ObjectiveContribution {
  readonly objectiveId: ObjectiveId;
  readonly observedMinor: bigint;
  readonly weightBps: bigint;
  readonly contributionMinor: bigint;
}

/** Phase 2 — optimization (only ever informational when phase 1 failed). */
export interface OptimizationPhase {
  readonly phase: 'OPTIMIZATION';
  readonly contributions: readonly ObjectiveContribution[];
  /** SUM(weight * observed). Lower is better. Exact bigint (INV-02). */
  readonly totalScoreMinor: bigint;
  /** Only meaningful when the hard-constraints phase passed. */
  readonly disqualificationNote?: string;
}

/** The evaluation of one simulation run (advisory evidence, INV-11). */
export interface RunEvaluationResult {
  readonly evaluationId: string;
  readonly scenarioId: string;
  readonly programId: string;
  readonly programVersion: string;
  readonly seed: string;
  /** TUPLE: the compiler guarantees hard constraints are phase[0]. */
  readonly phases: readonly [HardConstraintsPhase, OptimizationPhase];
  readonly passedHardConstraints: boolean;
  readonly totalOptimizationScoreMinor: bigint;
  readonly passed: boolean;
  readonly digest: string;
}

/** One robustness run record (a scenario x seed evaluation). */
export interface RobustnessRunRecord {
  readonly scenarioId: string;
  readonly seed: string;
  readonly passed: boolean;
  readonly totalOptimizationScoreMinor: bigint;
}

/** Accumulated robustness evidence for one program (INV-L02 adapt). */
export interface RobustnessEvidence {
  readonly robustnessId: string;
  readonly programId: string;
  readonly programVersion: string;
  readonly totalRuns: number;
  readonly passedRuns: number;
  readonly allPassed: boolean;
  /** Worst (highest) optimization score observed across the runs. */
  readonly worstScoreMinor: bigint | undefined;
  /** worst - best (0 means perfectly stable score). */
  readonly scoreSpreadMinor: bigint | undefined;
  readonly runs: readonly RobustnessRunRecord[];
  readonly digest: string;
}

/** Input accepted by `evaluateRun`. */
export interface EvaluateRunInput {
  readonly run: SimulationRunResult;
  readonly program: StrategyProgram;
  readonly spec: EvaluationSpec;
}
