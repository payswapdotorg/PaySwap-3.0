/**
 * The Lab evaluation SPECIFICATION vocabulary (P6-W1; extracted from the
 * old payswap.org@8a735bf packages/lab evaluator.ts, W2-004 — split so
 * Domain Packs and the evaluator share one vocabulary module).
 *
 * HARD CONSTRAINTS PRECEDE OPTIMIZATION (the old AGENTS.md rule 14; the
 * canonical form is the policy/governance authority's compliance-first
 * law). Hard constraints are the pass/fail discipline; objectives are the
 * lower-is-better optimization costs priced in exact minor units via the
 * spec penalties. All money-like quantities are exact bigint minor units
 * (INV-2) — the aggregate optimization score is an integer weighted sum,
 * never floating point.
 */

// ---------------------------------------------------------------------------
// Hard constraints (pass/fail discipline)
// ---------------------------------------------------------------------------

/**
 * Hard constraints the built-in evaluator can check from simulation
 * metrics. Domain Packs declare a subset; anything NOT declared is not
 * enforced by this evaluator version.
 */
export const HARD_CONSTRAINT_IDS = [
  "AUTHORIZATION",
  "COMPLIANCE",
  "PRIVACY",
  "DEADLINE",
  "EXPLICIT_CREDIT",
] as const;
export type HardConstraintId = (typeof HARD_CONSTRAINT_IDS)[number];

/** Total predicate over the hard-constraint vocabulary. */
export function isHardConstraintId(
  value: unknown,
): value is HardConstraintId {
  return (
    typeof value === "string" &&
    (HARD_CONSTRAINT_IDS as readonly unknown[]).includes(value)
  );
}

/** A hard constraint declaration inside a Domain Pack. */
export interface HardConstraintSpec {
  readonly constraintId: HardConstraintId;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Optimization objectives (lower-is-better costs, exact minor units)
// ---------------------------------------------------------------------------

/**
 * Optimization objectives the built-in evaluator can score. All are
 * lower-is-better costs expressed in exact minor units (counts are priced
 * via the evaluation spec penalties so the aggregate stays a bigint).
 */
export const OBJECTIVE_IDS = [
  "TOTAL_COST",
  "ECONOMIC_COMPRESSION",
  "RESILIENCE",
  "LATENCY",
  "LIQUIDITY_LOCKED",
  "COUNTERPARTY_EXPOSURE",
  "OPERATIONAL_COMPLEXITY",
] as const;
export type ObjectiveId = (typeof OBJECTIVE_IDS)[number];

/** Total predicate over the objective vocabulary. */
export function isObjectiveId(value: unknown): value is ObjectiveId {
  return (
    typeof value === "string" &&
    (OBJECTIVE_IDS as readonly unknown[]).includes(value)
  );
}

/** An optimization objective declaration with an integer weight (bps). */
export interface ObjectiveSpec {
  readonly objectiveId: ObjectiveId;
  readonly description: string;
  /** Positive integer weight; the aggregate is the weighted sum. */
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

/** The full evaluation specification (typically derived from a Domain Pack). */
export interface EvaluationSpec {
  readonly hardConstraints: readonly HardConstraintSpec[];
  readonly objectives: readonly ObjectiveSpec[];
  readonly penalties: ObjectivePenalties;
}

/** The canonical default evaluation spec (deterministic, caller-overridable). */
export function defaultEvaluationSpec(): EvaluationSpec {
  return {
    hardConstraints: [
      { constraintId: "AUTHORIZATION", description: "no authorization bypass events" },
      {
        constraintId: "COMPLIANCE",
        description: "no adversarial (fraud/collusion/malicious/gaming) demand settles",
      },
      { constraintId: "PRIVACY", description: "no privacy violations (minimum-context discipline)" },
    ],
    objectives: [
      { objectiveId: "TOTAL_COST", description: "fees + FX spread paid", weightBps: 100n },
      { objectiveId: "ECONOMIC_COMPRESSION", description: "external value moved + hops", weightBps: 100n },
      { objectiveId: "RESILIENCE", description: "degraded exposure + failures + unknowns", weightBps: 100n },
      { objectiveId: "LATENCY", description: "total latency", weightBps: 10n },
      { objectiveId: "LIQUIDITY_LOCKED", description: "liquidity locked by deferral", weightBps: 10n },
      { objectiveId: "COUNTERPARTY_EXPOSURE", description: "explicit network credit exposure", weightBps: 10n },
      { objectiveId: "OPERATIONAL_COMPLEXITY", description: "hops + user actions", weightBps: 10n },
    ],
    penalties: {
      hopPenaltyMinor: 1_000n,
      routeFailurePenaltyMinor: 50_000n,
      unknownOutcomePenaltyMinor: 25_000n,
      userActionPenaltyMinor: 5_000n,
    },
  };
}

/** Fail-closed validation of an evaluation spec. */
export function validateEvaluationSpec(
  spec: EvaluationSpec,
): readonly string[] {
  const errors: string[] = [];
  if (spec.hardConstraints.length === 0) {
    errors.push("an evaluation spec must declare at least one hard constraint");
  }
  for (const constraint of spec.hardConstraints) {
    if (!isHardConstraintId(constraint.constraintId)) {
      errors.push(`unknown hard constraint '${String(constraint.constraintId)}'`);
    }
  }
  for (const objective of spec.objectives) {
    if (!isObjectiveId(objective.objectiveId)) {
      errors.push(`unknown objective '${String(objective.objectiveId)}'`);
    }
    if (objective.weightBps < 0n) {
      errors.push(`objective '${objective.objectiveId}' weight must be >= 0`);
    }
  }
  if (spec.penalties.hopPenaltyMinor < 0n) {
    errors.push("hopPenaltyMinor must be >= 0");
  }
  return errors;
}
