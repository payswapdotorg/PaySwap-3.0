/**
 * The Lab evaluator (P6-W1; the P6 rebuild of the old
 * payswap.org@8a735bf packages/lab evaluator.ts, W2-004).
 *
 * HARD CONSTRAINTS PRECEDE OPTIMIZATION. This is enforced three ways:
 *
 * 1. RUNTIME: `evaluateRun` evaluates every hard constraint first and only
 *    then computes optimization contributions; a single hard-constraint
 *    failure marks the run `passed === false` regardless of how good the
 *    optimization score is.
 * 2. TYPE: `RunEvaluationResult.phases` is a TUPLE —
 *    `readonly [HardConstraintsPhase, OptimizationPhase]` — so the compiler
 *    itself guarantees the ordering can never be swapped.
 * 3. RANKING: `comparePromotionCandidates` (promotion-comparison.ts)
 *    filters on hard constraints BEFORE ordering by optimization score.
 *
 * All money-like quantities are exact bigint minor units (INV-2); the
 * aggregate optimization score is an integer weighted sum — never floating
 * point.
 */

import { canonicalize, deepFreeze, fnv1a64 } from "./canonical.ts";
import type { SimulationProgram } from "./simulation-plan.ts";
import type { SimulationRunResult } from "./simulation-metrics.ts";
import type {
  EvaluationSpec,
  HardConstraintId,
  HardConstraintSpec,
  ObjectiveId,
  ObjectivePenalties,
  ObjectiveSpec,
} from "./evaluation-spec.ts";

// ---------------------------------------------------------------------------
// Phases — hard constraints FIRST (compile-time ordering via a tuple)
// ---------------------------------------------------------------------------

export interface HardConstraintResult {
  readonly constraintId: HardConstraintId;
  readonly passed: boolean;
  /** Human-readable observed value that decided the constraint. */
  readonly observed: string;
}

export interface HardConstraintsPhase {
  readonly phase: "HARD_CONSTRAINTS";
  readonly results: readonly HardConstraintResult[];
  readonly allPassed: boolean;
}

export interface ObjectiveContribution {
  readonly objectiveId: ObjectiveId;
  readonly observedMinor: bigint;
  readonly weightBps: bigint;
  readonly contributionMinor: bigint;
}

export interface OptimizationPhase {
  readonly phase: "OPTIMIZATION";
  readonly contributions: readonly ObjectiveContribution[];
  /** The weighted sum. Lower is better. Exact bigint (INV-2). */
  readonly totalScoreMinor: bigint;
  /**
   * Only meaningful when the hard-constraints phase passed. A run that
   * fails a hard constraint is disqualified regardless of this number.
   */
  readonly disqualificationNote?: string;
}

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

export interface EvaluateRunInput {
  readonly run: SimulationRunResult;
  readonly program: SimulationProgram;
  readonly spec: EvaluationSpec;
}

// ---------------------------------------------------------------------------
// Objective observation (pure functions of the metrics + program)
// ---------------------------------------------------------------------------

function observeObjective(
  objectiveId: ObjectiveId,
  run: SimulationRunResult,
  program: SimulationProgram,
  penalties: ObjectivePenalties,
): bigint {
  const m = run.metrics;
  switch (objectiveId) {
    case "TOTAL_COST":
      return m.feesMinor + m.fxSpreadPaidMinor;
    case "ECONOMIC_COMPRESSION":
      return m.externalValueMovedMinor + BigInt(m.hops) * penalties.hopPenaltyMinor;
    case "RESILIENCE":
      return (
        m.degradedRouteExposureMinor +
        BigInt(m.failedNoViableRoute) * penalties.routeFailurePenaltyMinor +
        BigInt(m.unknownOutcomes) * penalties.unknownOutcomePenaltyMinor
      );
    case "LATENCY":
      return BigInt(m.totalLatencyMs);
    case "LIQUIDITY_LOCKED":
      return m.liquidityLockedMinor;
    case "COUNTERPARTY_EXPOSURE":
      return m.creditExposureMinor;
    case "OPERATIONAL_COMPLEXITY":
      return (
        BigInt(m.hops) * penalties.hopPenaltyMinor +
        BigInt(m.userActionRequired) * penalties.userActionPenaltyMinor +
        (program.useNetting ? 0n : 0n)
      );
  }
}

// ---------------------------------------------------------------------------
// Hard-constraint checks (pure functions of the metrics + program)
// ---------------------------------------------------------------------------

function checkHardConstraint(
  constraintId: HardConstraintId,
  run: SimulationRunResult,
  program: SimulationProgram,
): HardConstraintResult {
  const m = run.metrics;
  switch (constraintId) {
    case "AUTHORIZATION":
      return {
        constraintId,
        passed: m.authorizationBypassEvents === 0,
        observed: `authorizationBypassEvents=${m.authorizationBypassEvents}`,
      };
    case "COMPLIANCE":
      return {
        constraintId,
        passed: m.adversarialSettled === 0,
        observed: `adversarialSettled=${m.adversarialSettled}`,
      };
    case "PRIVACY":
      return {
        constraintId,
        passed: m.privacyViolations === 0,
        observed: `privacyViolations=${m.privacyViolations}`,
      };
    case "DEADLINE":
      return {
        constraintId,
        passed: m.deadlineMisses === 0,
        observed: `deadlineMisses=${m.deadlineMisses}`,
      };
    case "EXPLICIT_CREDIT":
      return {
        constraintId,
        // Credit is explicit: using network credit must be declared;
        // undeclared credit exposure is a violation.
        passed: program.useNetworkCredit || m.creditExposureMinor === 0n,
        observed: `creditExposureMinor=${m.creditExposureMinor} declared=${program.useNetworkCredit}`,
      };
  }
}

// ---------------------------------------------------------------------------
// The evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates one simulation run. Hard constraints are evaluated FIRST and
 * gate the result; optimization is computed second and can never rescue a
 * hard-constraint failure.
 */
export function evaluateRun(input: EvaluateRunInput): RunEvaluationResult {
  const { run, program, spec } = input;

  // Phase 1 — HARD CONSTRAINTS (always first; tuple position 0).
  const hardResults: HardConstraintResult[] = [];
  for (const constraint of spec.hardConstraints) {
    hardResults.push(checkHardConstraint(constraint.constraintId, run, program));
  }
  const allPassed = hardResults.every((result) => result.passed);
  const hardPhase: HardConstraintsPhase = {
    phase: "HARD_CONSTRAINTS",
    results: Object.freeze(hardResults),
    allPassed,
  };

  // Phase 2 — OPTIMIZATION (only ever informational when phase 1 failed).
  const contributions: ObjectiveContribution[] = [];
  let totalScoreMinor = 0n;
  for (const objective of spec.objectives) {
    const observedMinor = observeObjective(
      objective.objectiveId,
      run,
      program,
      spec.penalties,
    );
    const contributionMinor = observedMinor * objective.weightBps;
    contributions.push({
      objectiveId: objective.objectiveId,
      observedMinor,
      weightBps: objective.weightBps,
      contributionMinor,
    });
    totalScoreMinor += contributionMinor;
  }
  const optimizationPhase: OptimizationPhase = allPassed
    ? {
        phase: "OPTIMIZATION",
        contributions: Object.freeze(contributions),
        totalScoreMinor,
      }
    : {
        phase: "OPTIMIZATION",
        contributions: Object.freeze(contributions),
        totalScoreMinor,
        disqualificationNote:
          "hard-constraint failure: optimization score is informational only",
      };

  const digest = fnv1a64(
    canonicalize({
      scenarioId: run.scenarioId,
      programId: run.programId,
      programVersion: run.programVersion,
      seed: run.seed,
      hardPhase,
      totalScoreMinor,
      passed: allPassed,
    }),
  );

  return deepFreeze({
    evaluationId: `evaluation:${digest}`,
    scenarioId: run.scenarioId,
    programId: run.programId,
    programVersion: run.programVersion,
    seed: run.seed,
    phases: [hardPhase, optimizationPhase] as const,
    passedHardConstraints: allPassed,
    totalOptimizationScoreMinor: totalScoreMinor,
    passed: allPassed,
    digest,
  });
}

// ---------------------------------------------------------------------------
// Robustness evidence (INV-L02: promotion requires robustness, not luck)
// ---------------------------------------------------------------------------

/** One run's record inside a robustness evidence bundle. */
export interface RobustnessRunRecord {
  readonly scenarioId: string;
  readonly seed: string;
  readonly passed: boolean;
  readonly totalOptimizationScoreMinor: bigint;
}

/** The accumulated robustness evidence for one program. */
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

/**
 * Accumulates robustness evidence from a set of evaluations of the SAME
 * program across scenarios and/or seeds (INV-L02: promotion requires
 * robustness evidence, not a single lucky run).
 */
export function accumulateRobustnessEvidence(input: {
  readonly programId: string;
  readonly programVersion: string;
  readonly evaluations: readonly RunEvaluationResult[];
}): RobustnessEvidence {
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

  const digest = fnv1a64(
    canonicalize({
      programId: input.programId,
      programVersion: input.programVersion,
      runs,
    }),
  );

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

export type {
  EvaluationSpec,
  HardConstraintId,
  HardConstraintSpec,
  ObjectiveId,
  ObjectiveSpec,
  ObjectivePenalties,
} from "./evaluation-spec.ts";
export {
  HARD_CONSTRAINT_IDS,
  isHardConstraintId,
  OBJECTIVE_IDS,
  isObjectiveId,
  defaultEvaluationSpec,
  validateEvaluationSpec,
} from "./evaluation-spec.ts";
