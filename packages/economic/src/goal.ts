/**
 * @payswap/economic — the EconomicGoal (P1-W1, NET-NEW per GAP-01).
 *
 * GAP-01 (spec/migration/migration-matrix.json, MMI-01): EconomicGoal has
 * NO old-repo implementation and NO old-repo tests — only spec text
 * (payswap.org@8a735bf spec/architecture/DOMAIN-MODEL.md §intent,
 * FROZEN-ARCHITECTURE.md §1 "EconomicGoal — what the principal wants
 * economically", docs/FINAL-TL-HANDOFF-2026-09-30.md lineage chain
 * EconomicGoal -> EconomicProgram -> MoneyMovementIntent). This module
 * authors it net-new under the PaySwap 3.0 architecture (classification
 * REWRITE; architecture wins over old spec language).
 *
 * An EconomicGoal is an OUTCOME-FIRST, human/agent-legible demand:
 * - `objective`: what the principal wants to achieve (prose, bounded);
 * - `allowedArchetypes`: which intent forms may satisfy it (closed
 *   vocabulary, non-empty, duplicate-free);
 * - `outcomes`: the typed demands (bounded, ORDERED — installment order is
 *   semantic; permutation invariance applies to the SET-like fields, not to
 *   the ordered outcome list);
 * - `constraints` / `timeBounds`: bounded structural constraints and
 *   caller-supplied instants (NO ambient clock);
 * - `recourse` / `proofs`: what must be recoverable and provable;
 * - `nonGoals`: declared NON-goals — what is explicitly NOT wanted, carried
 *   (canonically sorted) into compiled candidate skeletons;
 * - `economicInputs`: versioned economic inputs (quotes, corridor details)
 *   — typed version envelope + explicit content, NEVER implicit ambient
 *   state, and NEVER establishing authorization or financial finality;
 * - `authorizationRef`: OPAQUE authorization LINEAGE reference for trust-
 *   plane wiring. The goal establishes NO authorization (INV-05 lineage
 *   only; authority lives in the trust lane) and NO finality (protocol
 *   lane).
 *
 * Validation is fail-closed and pure: same input -> same verdict, zero side
 * effects, zero clock/network/filesystem access.
 */

import { InvalidEconomicGoalError } from "./errors.ts";
import { type GoalOutcome, requireOutcomesArray, validateGoalOutcome } from "./goal-outcome.ts";
import {
  type IntentArchetype,
  INTENT_ARCHETYPES,
  type IntentConstraints,
  archetypeSatisfies,
  validateIntentConstraints,
} from "./intent.ts";
import {
  type ProofRequirement,
  type RecourseRequirements,
  validateProofRequirements,
  validateRecourseRequirements,
} from "./recourse.ts";
import { type VersionedEconomicInput, validateEconomicInputs } from "./versioned-input.ts";
import {
  LIMITS,
  deepFreeze,
  requireBoundedString,
  requireExactKeys,
  requireNonNegativeSafeInteger,
  requireObject,
  requireUniqueBoundedStringArray,
  type Fail,
} from "./validate.ts";

const fail: Fail = (message: string) => new InvalidEconomicGoalError(message);

/** The canonical EconomicGoal field set (12 fields). */
export const ECONOMIC_GOAL_KEYS = [
  "allowedArchetypes",
  "authorizationRef",
  "constraints",
  "economicInputs",
  "goalId",
  "nonGoals",
  "objective",
  "outcomes",
  "principalRef",
  "proofs",
  "recourse",
  "timeBounds",
] as const;

const TIME_BOUNDS_KEYS = ["deadlineAt", "declaredAt"] as const;

/** Declared time bounds of a goal (caller-supplied instants; no ambient clock). */
export interface GoalTimeBounds {
  /** Goal declaration instant (ms). */
  readonly declaredAt: number;
  /** Absolute deadline (ms): strictly after declaredAt. */
  readonly deadlineAt: number;
}

/**
 * The EconomicGoal: the outcome-first, human/agent-legible root demand of
 * the economic plane. ADVISORY DEMAND ONLY.
 */
export interface EconomicGoal {
  /** Deterministic goal identity (e.g. `goal:<...>`). */
  readonly goalId: string;
  /** Principal reference (opaque; the trust plane owns principal identity). */
  readonly principalRef: string;
  /** Human/agent-legible statement of the OUTCOME the principal wants. */
  readonly objective: string;
  /** Which intent archetypes may satisfy this goal (closed vocabulary, non-empty, no duplicates). */
  readonly allowedArchetypes: readonly IntentArchetype[];
  /** The typed ordered demands (bounded; each must satisfy an allowed archetype). */
  readonly outcomes: readonly GoalOutcome[];
  /** Bounded structural constraints, propagated to every compiled intent. */
  readonly constraints: IntentConstraints;
  /** Declared time bounds. */
  readonly timeBounds: GoalTimeBounds;
  /** Recourse requirements (what must be recoverable/provable on failure). */
  readonly recourse: RecourseRequirements;
  /** Proof requirements (what evidence any satisfying execution must produce). */
  readonly proofs: readonly ProofRequirement[];
  /** Declared NON-goals (what is explicitly NOT wanted; carried into candidate skeletons). */
  readonly nonGoals: readonly string[];
  /** Versioned economic inputs (quotes/corridor details) — explicit, versioned, never ambient. */
  readonly economicInputs: readonly VersionedEconomicInput[];
  /** Authorization LINEAGE reference (opaque; establishes NO authorization). */
  readonly authorizationRef: string;
}

/** Fail-closed validation of GoalTimeBounds. */
export function validateGoalTimeBounds(candidate: unknown): GoalTimeBounds {
  const record = requireObject(candidate, "GoalTimeBounds", fail);
  requireExactKeys(record, TIME_BOUNDS_KEYS, "GoalTimeBounds", fail);
  const declaredAt = requireNonNegativeSafeInteger(
    record["declaredAt"],
    "GoalTimeBounds.declaredAt",
    fail,
  );
  const deadlineAt = requireNonNegativeSafeInteger(
    record["deadlineAt"],
    "GoalTimeBounds.deadlineAt",
    fail,
  );
  if (deadlineAt <= declaredAt) {
    throw new InvalidEconomicGoalError(
      "GoalTimeBounds.deadlineAt must be strictly after declaredAt — a zero-length window achieves nothing",
    );
  }
  return deepFreeze({ declaredAt, deadlineAt });
}

/**
 * Fail-closed structural validation of an EconomicGoal: returns a frozen
 * goal or throws InvalidEconomicGoalError. Never repairs, never guesses,
 * never defaults; unknown fields are rejected.
 */
export function validateEconomicGoal(candidate: unknown): EconomicGoal {
  const record = requireObject(candidate, "an EconomicGoal", fail);
  requireExactKeys(record, ECONOMIC_GOAL_KEYS, "EconomicGoal", fail);

  const goalId = requireBoundedString(
    record["goalId"],
    "EconomicGoal.goalId",
    LIMITS.refMaxLength,
    fail,
  );
  const principalRef = requireBoundedString(
    record["principalRef"],
    "EconomicGoal.principalRef",
    LIMITS.refMaxLength,
    fail,
  );
  const objective = requireBoundedString(
    record["objective"],
    "EconomicGoal.objective",
    LIMITS.objectiveMaxLength,
    fail,
  );

  const rawArchetypes = requireUniqueBoundedStringArray(
    record["allowedArchetypes"],
    "EconomicGoal.allowedArchetypes",
    INTENT_ARCHETYPES.length,
    32,
    fail,
  );
  const allowedArchetypes: readonly IntentArchetype[] = rawArchetypes.map((entry) => {
    if (!(INTENT_ARCHETYPES as readonly string[]).includes(entry)) {
      throw new InvalidEconomicGoalError(
        `EconomicGoal.allowedArchetypes entry '${entry}' is not one of [${INTENT_ARCHETYPES.join(", ")}]`,
      );
    }
    return entry as IntentArchetype;
  });

  const rawOutcomes = requireOutcomesArray(record["outcomes"]);
  const outcomes = rawOutcomes.map((entry, index) =>
    validateGoalOutcome(entry, `EconomicGoal.outcomes[${index}]`),
  );
  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];
    if (outcome === undefined) {
      continue;
    }
    const satisfied = allowedArchetypes.some((allowed) =>
      archetypeSatisfies(outcome.kind, allowed),
    );
    if (!satisfied) {
      throw new InvalidEconomicGoalError(
        `EconomicGoal.outcomes[${index}].kind '${outcome.kind}' is not satisfied by any allowed archetype [${allowedArchetypes.join(", ")}]`,
      );
    }
  }

  let constraints: IntentConstraints;
  try {
    constraints = validateIntentConstraints(record["constraints"]);
  } catch (error) {
    if (error instanceof Error) {
      throw new InvalidEconomicGoalError(`EconomicGoal.constraints: ${error.message}`);
    }
    throw error;
  }
  const timeBounds = validateGoalTimeBounds(record["timeBounds"]);
  const recourse = validateRecourseRequirements(record["recourse"]);
  const proofs = validateProofRequirements(record["proofs"]);
  const nonGoals = validateNonGoals(record["nonGoals"]);
  let economicInputs: readonly VersionedEconomicInput[];
  try {
    economicInputs = validateEconomicInputs(record["economicInputs"]);
  } catch (error) {
    if (error instanceof Error) {
      throw new InvalidEconomicGoalError(error.message);
    }
    throw error;
  }
  const authorizationRef = requireBoundedString(
    record["authorizationRef"],
    "EconomicGoal.authorizationRef",
    LIMITS.refMaxLength,
    fail,
  );

  return deepFreeze({
    goalId,
    principalRef,
    objective,
    allowedArchetypes,
    outcomes,
    constraints,
    timeBounds,
    recourse,
    proofs,
    nonGoals,
    economicInputs,
    authorizationRef,
  });
}

/** Fail-closed validation of the declared NON-goals (may be empty, never malformed). */
function validateNonGoals(candidate: unknown): readonly string[] {
  if (candidate === undefined || !Array.isArray(candidate)) {
    throw new InvalidEconomicGoalError("EconomicGoal.nonGoals must be an array (possibly empty)");
  }
  if (candidate.length > LIMITS.maxNonGoals) {
    throw new InvalidEconomicGoalError(
      `EconomicGoal.nonGoals must carry at most ${LIMITS.maxNonGoals} entries`,
    );
  }
  const items = candidate.map((entry, index) =>
    requireBoundedString(entry, `EconomicGoal.nonGoals[${index}]`, LIMITS.nonGoalMaxLength, fail),
  );
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) {
      throw new InvalidEconomicGoalError(
        `EconomicGoal.nonGoals must not contain duplicates ('${item}')`,
      );
    }
    seen.add(item);
  }
  return deepFreeze(items);
}
