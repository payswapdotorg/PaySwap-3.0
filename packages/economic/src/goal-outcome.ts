/**
 * @payswap/economic — goal outcomes and demands (P1-W1, net-new per GAP-01).
 *
 * The OUTCOME side of the net-new EconomicGoal: a goal declares WHAT it
 * wants as a bounded, typed list of outcomes. Each outcome is a
 * discriminated union member with a CLOSED kind vocabulary:
 *
 * - MONEY_MOVEMENT: one value-transfer demand (origin/destination
 *   funds-location references + the exact origin amount);
 * - PAYMENT: a money-movement demand WITH an opaque commerce lineage ref
 *   (compiles to a PaymentIntent — the type-level specialization);
 * - SERVICE_ACCESS: one service/entitlement acquisition demand.
 *
 * Old-repo concept reference: FROZEN-ARCHITECTURE.md §6 (MoneyMovementIntent
 * minimum content) and SERVICE-CAPABILITIES.md §ServiceAccessIntent,
 * re-authored rail/provider-neutrally (no rail/provider fields anywhere).
 *
 * DEMAND ONLY: outcomes establish no authorization and no finality. The
 * same locationRef MAY appear as origin and destination (an in-place
 * conversion is a legitimate demand — conversion itself is downstream,
 * never here).
 */

import { InvalidEconomicGoalError } from "./errors.ts";
import { type AmountSpec, validateAmountSpec, validatePositiveAmountSpec } from "./amount-spec.ts";
import { type FundsLocationRef, validateFundsLocationRef } from "./intent.ts";
import {
  LIMITS,
  deepFreeze,
  requireBoundedString,
  requireExactKeys,
  requireObject,
  type Fail,
} from "./validate.ts";

const fail: Fail = (message: string) => new InvalidEconomicGoalError(message);

/** Closed vocabulary of goal-outcome kinds. */
export const GOAL_OUTCOME_KINDS = ["MONEY_MOVEMENT", "PAYMENT", "SERVICE_ACCESS"] as const;

/** The kind of a goal outcome. */
export type GoalOutcomeKind = (typeof GOAL_OUTCOME_KINDS)[number];

const MOVEMENT_DEMAND_KEYS = ["destination", "origin", "originAmount"] as const;
const SERVICE_DEMAND_KEYS = ["beneficiaryRef", "maxCost", "serviceRef"] as const;
const SERVICE_DEMAND_REQUIRED_KEYS = ["beneficiaryRef", "serviceRef"] as const;

/** One value-transfer demand: where value starts, where it must arrive, and the exact amount leaving the origin. */
export interface MoneyMovementDemand {
  /** Observation-grounded origin (a reference, never a balance). */
  readonly origin: FundsLocationRef;
  /** Observation-grounded destination (a reference, never a balance). */
  readonly destination: FundsLocationRef;
  /** The exact positive amount leaving the origin (currency matches the origin location). */
  readonly originAmount: AmountSpec;
}

/** One service/entitlement acquisition demand (funding is a SEPARATE movement demand, never merged here). */
export interface ServiceAccessDemand {
  /** Opaque service/entitlement reference — the service plane owns its meaning. */
  readonly serviceRef: string;
  /** Opaque beneficiary principal reference. */
  readonly beneficiaryRef: string;
  /** Optional declared maximum acceptable total cost (wire shape only; comparison lives in the financial lane). */
  readonly maxCost?: AmountSpec;
}

/** A typed goal outcome: exactly one demand shape per kind. */
export type GoalOutcome =
  | { readonly kind: "MONEY_MOVEMENT"; readonly demand: MoneyMovementDemand }
  | { readonly kind: "PAYMENT"; readonly demand: MoneyMovementDemand; readonly commerceRef: string }
  | { readonly kind: "SERVICE_ACCESS"; readonly demand: ServiceAccessDemand };

/** Rewraps a nested structural error as the goal-outcome contract error (class discipline). */
function rethrowAsGoalError(error: unknown): never {
  if (error instanceof InvalidEconomicGoalError) {
    throw error;
  }
  if (error instanceof Error) {
    throw new InvalidEconomicGoalError(error.message);
  }
  throw new InvalidEconomicGoalError(String(error));
}

/** Fail-closed validation of a MoneyMovementDemand. */
export function validateMoneyMovementDemand(
  candidate: unknown,
  field: string,
): MoneyMovementDemand {
  const record = requireObject(candidate, `${field} (a MoneyMovementDemand)`, fail);
  requireExactKeys(record, MOVEMENT_DEMAND_KEYS, field, fail);
  const origin = wrap(() => validateFundsLocationRef(record["origin"], `${field}.origin`));
  const destination = wrap(() =>
    validateFundsLocationRef(record["destination"], `${field}.destination`),
  );
  const originAmount = wrap(() =>
    validatePositiveAmountSpec(record["originAmount"], `${field}.originAmount`),
  );
  if (originAmount.currency !== origin.currency) {
    throw new InvalidEconomicGoalError(
      `${field}.originAmount currency '${originAmount.currency}' must match the origin location currency '${origin.currency}'`,
    );
  }
  return deepFreeze({ origin, destination, originAmount });
}

/** Fail-closed validation of a ServiceAccessDemand (maxCost may be absent, never invalid). */
export function validateServiceAccessDemand(
  candidate: unknown,
  field: string,
): ServiceAccessDemand {
  const record = requireObject(candidate, `${field} (a ServiceAccessDemand)`, fail);
  const hasCost = "maxCost" in record && record["maxCost"] !== undefined;
  requireExactKeys(
    record,
    hasCost ? SERVICE_DEMAND_KEYS : SERVICE_DEMAND_REQUIRED_KEYS,
    field,
    fail,
  );
  const serviceRef = requireBoundedString(
    record["serviceRef"],
    `${field}.serviceRef`,
    LIMITS.refMaxLength,
    fail,
  );
  const beneficiaryRef = requireBoundedString(
    record["beneficiaryRef"],
    `${field}.beneficiaryRef`,
    LIMITS.refMaxLength,
    fail,
  );
  if (hasCost) {
    const maxCost = wrap(() => validateAmountSpec(record["maxCost"]));
    return deepFreeze({ serviceRef, beneficiaryRef, maxCost });
  }
  return deepFreeze({ serviceRef, beneficiaryRef });
}

/** Fail-closed validation of one GoalOutcome (discriminated by its closed kind). */
export function validateGoalOutcome(candidate: unknown, field: string): GoalOutcome {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new InvalidEconomicGoalError(`${field} is required (a typed GoalOutcome)`);
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const kind = record["kind"];
  if (typeof kind !== "string" || !(GOAL_OUTCOME_KINDS as readonly string[]).includes(kind)) {
    throw new InvalidEconomicGoalError(
      `${field}.kind must be one of [${GOAL_OUTCOME_KINDS.join(", ")}] (got: ${String(kind)})`,
    );
  }
  if (kind === "MONEY_MOVEMENT") {
    requireExactKeys(record, ["demand", "kind"], field, fail);
    const demand = validateMoneyMovementDemand(record["demand"], `${field}.demand`);
    return deepFreeze({ kind, demand });
  }
  if (kind === "PAYMENT") {
    requireExactKeys(record, ["commerceRef", "demand", "kind"], field, fail);
    const commerceRef = requireBoundedString(
      record["commerceRef"],
      `${field}.commerceRef`,
      LIMITS.refMaxLength,
      fail,
    );
    const demand = validateMoneyMovementDemand(record["demand"], `${field}.demand`);
    return deepFreeze({ kind, demand, commerceRef });
  }
  requireExactKeys(record, ["demand", "kind"], field, fail);
  const demand = validateServiceAccessDemand(record["demand"], `${field}.demand`);
  return deepFreeze({ kind: "SERVICE_ACCESS", demand });
}

/** Runs a nested validation, rethrowing foreign error classes as goal errors (same message). */
function wrap<T>(validate: () => T): T {
  try {
    return validate();
  } catch (error) {
    rethrowAsGoalError(error);
  }
}

/** Non-empty bounded check of the outcomes list (shared by the goal validator). */
export function requireOutcomesArray(candidate: unknown): readonly unknown[] {
  if (!Array.isArray(candidate)) {
    throw new InvalidEconomicGoalError("EconomicGoal.outcomes must be an array");
  }
  if (candidate.length === 0) {
    throw new InvalidEconomicGoalError(
      "EconomicGoal.outcomes must not be empty — a goal demands at least one outcome",
    );
  }
  if (candidate.length > LIMITS.maxOutcomes) {
    throw new InvalidEconomicGoalError(
      `EconomicGoal.outcomes must carry at most ${LIMITS.maxOutcomes} entries — a recurring demand is a program, not a goal`,
    );
  }
  return candidate;
}
