/**
 * @payswap/execution-graph — the EVALUATOR (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/lab/src/evaluator.ts, W2-004).
 *
 * HARD CONSTRAINTS PRECEDE OPTIMIZATION — enforced at runtime (constraints
 * first, one failure disqualifies), at the type level (the phases TUPLE)
 * and at ranking time (robustness filters before ordering). All money-like
 * quantities are exact bigint minor units (INV-02). Evaluation results are
 * ADVISORY evidence (INV-11).
 */

import { ValidationError } from './errors.ts';
import { canonicalDigest, deepFreeze } from './canonical.ts';
import type {
  EvaluateRunInput,
  EvaluationSpec,
  HardConstraintResult,
  HardConstraintsPhase,
  ObjectiveContribution,
  OptimizationPhase,
  RunEvaluationResult,
} from './evaluation-contract.ts';
import { isHardConstraintId, isObjectiveId } from './evaluation-contract.ts';
import type { StrategyProgram } from './strategy-contract.ts';
import type { SimulationRunResult } from './simulation-contract.ts';

/** The default evaluation spec (deterministic, frozen). */
export function defaultEvaluationSpec(): EvaluationSpec {
  return deepFreeze({
    hardConstraints: [
      { constraintId: 'AUTHORIZATION', description: 'no authorization bypass events' },
      {
        constraintId: 'COMPLIANCE',
        description: 'no adversarial (fraud/collusion/malicious/gaming) demand settles',
      },
      { constraintId: 'PRIVACY', description: 'no privacy violations (minimum-context)' },
    ],
    objectives: [
      { objectiveId: 'TOTAL_COST', description: 'fees + FX spread paid', weightBps: 100n },
      {
        objectiveId: 'ECONOMIC_COMPRESSION',
        description: 'external value moved + hops',
        weightBps: 100n,
      },
      {
        objectiveId: 'RESILIENCE',
        description: 'degraded exposure + failures + unknowns',
        weightBps: 100n,
      },
      { objectiveId: 'LATENCY', description: 'total latency', weightBps: 10n },
      { objectiveId: 'LIQUIDITY_LOCKED', description: 'liquidity locked by deferral', weightBps: 10n },
      {
        objectiveId: 'COUNTERPARTY_EXPOSURE',
        description: 'explicit network credit exposure',
        weightBps: 10n,
      },
      { objectiveId: 'OPERATIONAL_COMPLEXITY', description: 'hops + user actions', weightBps: 10n },
    ],
    penalties: {
      hopPenaltyMinor: 1_000n,
      routeFailurePenaltyMinor: 50_000n,
      unknownOutcomePenaltyMinor: 25_000n,
      userActionPenaltyMinor: 5_000n,
    },
  });
}

/** Fail-closed validation of an evaluation spec. */
export function validateEvaluationSpec(spec: EvaluationSpec): EvaluationSpec {
  if (spec === null || typeof spec !== 'object') {
    throw new ValidationError('an evaluation spec must be an object');
  }
  if (!Array.isArray(spec.hardConstraints) || spec.hardConstraints.length === 0) {
    throw new ValidationError('an evaluation spec must declare at least one hard constraint');
  }
  for (const constraint of spec.hardConstraints) {
    if (!isHardConstraintId(constraint.constraintId)) {
      throw new ValidationError(
        `unknown hard constraint '${String(constraint.constraintId)}' — undeclared constraints are not enforced by this evaluator`,
      );
    }
  }
  if (!Array.isArray(spec.objectives) || spec.objectives.length === 0) {
    throw new ValidationError('an evaluation spec must declare at least one objective');
  }
  for (const objective of spec.objectives) {
    if (!isObjectiveId(objective.objectiveId)) {
      throw new ValidationError(
        `unknown objective '${String(objective.objectiveId)}' — undeclared objectives are not scored by this evaluator`,
      );
    }
    if (typeof objective.weightBps !== 'bigint' || objective.weightBps <= 0n) {
      throw new ValidationError('objective weights must be positive bigint bps');
    }
  }
  for (const penalty of ['hopPenaltyMinor', 'routeFailurePenaltyMinor', 'unknownOutcomePenaltyMinor', 'userActionPenaltyMinor'] as const) {
    if (typeof spec.penalties[penalty] !== 'bigint' || spec.penalties[penalty] < 0n) {
      throw new ValidationError(`the ${penalty} penalty must be a non-negative bigint`);
    }
  }
  return spec;
}

/** Objective observation (a pure function of the metrics + program). */
function observeObjective(
  objectiveId: EvaluationSpec['objectives'][number]['objectiveId'],
  run: SimulationRunResult,
  program: StrategyProgram,
  penalties: EvaluationSpec['penalties'],
): bigint {
  const m = run.metrics;
  switch (objectiveId) {
    case 'TOTAL_COST':
      return m.feesMinor + m.fxSpreadPaidMinor;
    case 'ECONOMIC_COMPRESSION':
      return m.externalValueMovedMinor + BigInt(m.hops) * penalties.hopPenaltyMinor;
    case 'RESILIENCE':
      return (
        m.degradedRouteExposureMinor +
        BigInt(m.failedNoViableRoute) * penalties.routeFailurePenaltyMinor +
        BigInt(m.unknownOutcomes) * penalties.unknownOutcomePenaltyMinor
      );
    case 'LATENCY':
      return BigInt(m.totalLatencyMs);
    case 'LIQUIDITY_LOCKED':
      return m.liquidityLockedMinor;
    case 'COUNTERPARTY_EXPOSURE':
      return m.creditExposureMinor;
    case 'OPERATIONAL_COMPLEXITY':
      return (
        BigInt(m.hops) * penalties.hopPenaltyMinor +
        BigInt(m.userActionRequired) * penalties.userActionPenaltyMinor
      );
    default: {
      void program;
      throw new ValidationError(`objective '${String(objectiveId)}' is not scoreable`);
    }
  }
}

/** Hard-constraint check (a pure function of the metrics + program). */
function checkHardConstraint(
  constraintId: EvaluationSpec['hardConstraints'][number]['constraintId'],
  run: SimulationRunResult,
  program: StrategyProgram,
): HardConstraintResult {
  const m = run.metrics;
  switch (constraintId) {
    case 'AUTHORIZATION':
      return {
        constraintId,
        passed: m.authorizationBypassEvents === 0,
        observed: `authorizationBypassEvents=${m.authorizationBypassEvents}`,
      };
    case 'COMPLIANCE':
      return {
        constraintId,
        passed: m.adversarialSettled === 0,
        observed: `adversarialSettled=${m.adversarialSettled}`,
      };
    case 'PRIVACY':
      return {
        constraintId,
        passed: m.privacyViolations === 0,
        observed: `privacyViolations=${m.privacyViolations}`,
      };
    case 'DEADLINE':
      return {
        constraintId,
        passed: m.deadlineMisses === 0,
        observed: `deadlineMisses=${m.deadlineMisses}`,
      };
    case 'EXPLICIT_CREDIT':
      return {
        constraintId,
        // Credit is explicit: using network credit must be declared;
        // undeclared credit exposure is a violation.
        passed: program.useNetworkCredit || m.creditExposureMinor === 0n,
        observed: `creditExposureMinor=${m.creditExposureMinor} declared=${program.useNetworkCredit}`,
      };
  }
}

/**
 * Evaluate one simulation run. Hard constraints are evaluated FIRST and
 * gate the result; optimization is computed second and can never rescue a
 * hard-constraint failure.
 */
export function evaluateRun(input: EvaluateRunInput): RunEvaluationResult {
  validateEvaluationSpec(input.spec);
  const { run, program, spec } = input;

  // Phase 1 — HARD CONSTRAINTS (always first; tuple position 0).
  const hardResults: HardConstraintResult[] = [];
  for (const constraint of spec.hardConstraints) {
    hardResults.push(checkHardConstraint(constraint.constraintId, run, program));
  }
  const allPassed = hardResults.every((result) => result.passed);
  const hardPhase: HardConstraintsPhase = {
    phase: 'HARD_CONSTRAINTS',
    results: Object.freeze(hardResults),
    allPassed,
  };

  // Phase 2 — OPTIMIZATION (only ever informational when phase 1 failed).
  const contributions: ObjectiveContribution[] = [];
  let totalScoreMinor = 0n;
  for (const objective of spec.objectives) {
    const observedMinor = observeObjective(objective.objectiveId, run, program, spec.penalties);
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
        phase: 'OPTIMIZATION',
        contributions: Object.freeze(contributions),
        totalScoreMinor,
      }
    : {
        phase: 'OPTIMIZATION',
        contributions: Object.freeze(contributions),
        totalScoreMinor,
        disqualificationNote:
          'hard-constraint failure: optimization score is informational only',
      };

  const digest = canonicalDigest({
    binding: 'run-evaluation',
    scenarioId: run.scenarioId,
    programId: run.programId,
    programVersion: run.programVersion,
    seed: run.seed,
    hardPhase,
    totalScoreMinor,
    passed: allPassed,
  });

  return Object.freeze({
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
