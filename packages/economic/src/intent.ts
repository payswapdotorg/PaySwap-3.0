/**
 * @payswap/economic — the rail/provider-neutral Money Movement Intent (P1-W1).
 *
 * ADAPT of payswap.org@8a735bf packages/route-compiler/src/intent.ts (351
 * lines, PORT classification MMI-02): an EXECUTABLE VALUE-TRANSFER DEMAND
 * with fail-closed validation, exact-money AmountSpec, observation-grounded
 * origins/destinations, authorization LINEAGE reference and no secret
 * material. The old shape is re-authored under the PaySwap 3.0 architecture:
 *
 * RAIL/PROVIDER NEUTRALITY (work-order law; INV-16 — provider
 * implementations do not leak into provider-neutral domain contracts): the
 * old origin/destination vocabulary (ONCHAIN_WALLET / EXTERNAL_PROVIDER_
 * ACCOUNT / BANK_ACCOUNT / ONCHAIN_RECIPIENT / STRIPE_MERCHANT_BALANCE, with
 * chainKey/providerName/stripeAccountRef fields) was RAIL- and
 * PROVIDER-IDENTIFYING. It is NOT ported. Origins and destinations are now
 * opaque OBSERVATION-GROUNDED funds-location references: the rail/provider
 * specifics live in the observation plane (capability lane, P2-W1), never
 * on the intent. The intent also carries NO execution or routing semantics
 * — no legs, no venues, no rail choices; HOW the demand is satisfied is the
 * route compiler's output (P5-W1), never the intent's content.
 *
 * The intent is ADVISORY DEMAND ONLY: it establishes NO authorization and NO
 * financial finality (authority lives in the trust lane P1-W3, finality in
 * the protocol lane P1-W2). `intentAuthorizationRef` is an OPAQUE LINEAGE
 * reference to the trust-plane demand/authorization registration — carried
 * for wiring, never interpreted, never re-declared here.
 *
 * Origins/destinations are REFERENCES, NOT BALANCES and NOT custody (INV-7):
 * the movement's funding is proven downstream by fresh canonical
 * observations, never by the intent itself.
 *
 * No secret material: the closed exact key sets (unknown fields rejected)
 * structurally exclude any secret-shaped field; refs are opaque
 * identifiers, not secret values (INV-19 discipline).
 */

import { InvalidAmountSpecError } from "./errors.ts";
import { InvalidMoneyMovementIntentError } from "./errors.ts";
import { type AmountSpec, validatePositiveAmountSpec } from "./amount-spec.ts";
import {
  LIMITS,
  deepFreeze,
  requireBoundedString,
  requireCurrencyCode,
  requireExactKeys,
  requireNonNegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
  type Fail,
} from "./validate.ts";

const fail: Fail = (message: string) => new InvalidMoneyMovementIntentError(message);

/** Coarse intent form families (the intent taxonomy vocabulary; closed). */
export const INTENT_ARCHETYPES = ["MONEY_MOVEMENT", "PAYMENT", "SERVICE_ACCESS"] as const;

/** The archetype of an intent: MONEY_MOVEMENT, PAYMENT (a movement specialization) or SERVICE_ACCESS. */
export type IntentArchetype = (typeof INTENT_ARCHETYPES)[number];

/**
 * Archetype compatibility: PAYMENT is a type-level specialization of
 * MONEY_MOVEMENT, so a payment satisfies a money-movement demand; the
 * reverse is false (a bare movement does not satisfy a payment-only demand).
 */
export function archetypeSatisfies(
  offered: IntentArchetype,
  required: IntentArchetype,
): boolean {
  if (offered === "PAYMENT" && required === "MONEY_MOVEMENT") {
    return true;
  }
  return offered === required;
}

/** Bounded structural constraints carried by every intent (propagated from the goal). */
export interface IntentConstraints {
  /** Upper bound on wall-clock settlement duration (ms, positive, caller-supplied). */
  readonly maxSettlementMs: number;
  /** Upper bound on intermediate hops (integer in [1, 8] — an unbounded hop count is never authorized). */
  readonly maxRouteHops: number;
}

export const INTENT_CONSTRAINTS_KEYS = ["maxRouteHops", "maxSettlementMs"] as const;

/** Fail-closed validation of IntentConstraints. */
export function validateIntentConstraints(candidate: unknown): IntentConstraints {
  const record = requireObject(candidate, "IntentConstraints", fail);
  requireExactKeys(record, INTENT_CONSTRAINTS_KEYS, "IntentConstraints", fail);
  const maxSettlementMs = requirePositiveSafeInteger(
    record["maxSettlementMs"],
    "IntentConstraints.maxSettlementMs",
    fail,
  );
  const rawHops = record["maxRouteHops"];
  if (
    typeof rawHops !== "number" ||
    !Number.isSafeInteger(rawHops) ||
    rawHops < 1 ||
    rawHops > LIMITS.maxRouteHops
  ) {
    throw new InvalidMoneyMovementIntentError(
      `IntentConstraints.maxRouteHops must be an integer in [1, ${LIMITS.maxRouteHops}] — an unbounded hop count is never authorized`,
    );
  }
  return deepFreeze({ maxRouteHops: rawHops, maxSettlementMs });
}

/**
 * An OBSERVATION-GROUNDED reference to an external funds location
 * (rail/provider-neutral): WHERE value starts or must arrive. A reference —
 * never a balance, never custody (INV-7). The location's rail/provider
 * meaning is owned by the observation plane (capability lane), never here.
 */
export interface FundsLocationRef {
  /** Opaque external funds-location reference (e.g. `fundsloc:<...>`); the observation plane owns its meaning. */
  readonly locationRef: string;
  /** The currency/symbol observed at that location (the AmountSpec law shape). */
  readonly currency: string;
  /** Opaque reference to the canonical observation that grounds this location (the observation law). */
  readonly observationRef: string;
}

export const FUNDS_LOCATION_REF_KEYS = ["currency", "locationRef", "observationRef"] as const;

/**
 * Fail-closed validation of a FundsLocationRef (exact key set — no
 * rail/provider-identifying field can smuggle into the neutral contract).
 */
export function validateFundsLocationRef(candidate: unknown, field: string): FundsLocationRef {
  const record = requireObject(candidate, `${field} (a FundsLocationRef)`, fail);
  requireExactKeys(record, FUNDS_LOCATION_REF_KEYS, field, fail);
  return deepFreeze({
    locationRef: requireBoundedString(
      record["locationRef"],
      `${field}.locationRef`,
      LIMITS.refMaxLength,
      fail,
    ),
    currency: requireCurrencyCode(record["currency"], `${field}.currency`, fail),
    observationRef: requireBoundedString(
      record["observationRef"],
      `${field}.observationRef`,
      LIMITS.refMaxLength,
      fail,
    ),
  });
}

/** The 10 canonical MoneyMovementIntent fields — and NOTHING else. */
export const MONEY_MOVEMENT_INTENT_KEYS = [
  "arrivalCurrency",
  "constraints",
  "declaredAt",
  "destination",
  "expiresAt",
  "intentAuthorizationRef",
  "intentId",
  "origin",
  "originAmount",
  "principalRef",
] as const;

/**
 * The canonical Money Movement Intent: ONE executable value-transfer demand,
 * rail/provider-neutral. The single source of truth every downstream
 * artifact (candidate skeleton now; route plans in P5-W1) REFERENCES and
 * never re-declares.
 */
export interface MoneyMovementIntent {
  /** Deterministic intent identity (e.g. `intent:<...>`). */
  readonly intentId: string;
  /** Principal reference (opaque; the trust plane owns principal identity). */
  readonly principalRef: string;
  /** Observation-grounded origin: WHERE value leaves (a reference, never a balance). */
  readonly origin: FundsLocationRef;
  /** Observation-grounded destination: WHERE value must arrive (a reference, never a balance). */
  readonly destination: FundsLocationRef;
  /** The exact amount leaving the origin (positive; currency matches the origin location). */
  readonly originAmount: AmountSpec;
  /** The currency/symbol the movement must arrive in (matches the destination location). */
  readonly arrivalCurrency: string;
  /** Timing/structure constraints (propagated from the goal; bounded). */
  readonly constraints: IntentConstraints;
  /** Authorization LINEAGE reference (opaque; establishes NO authorization). */
  readonly intentAuthorizationRef: string;
  /** Declared-at instant (ms, caller-supplied; no ambient clock). */
  readonly declaredAt: number;
  /** Absolute expiry (ms): strictly after declaredAt. */
  readonly expiresAt: number;
}

/**
 * Fail-closed structural validation of a Money Movement Intent (ports the
 * discipline of the old validateMoneyMovementIntent): returns a frozen
 * intent or throws InvalidMoneyMovementIntentError — never repairs, never
 * guesses, never defaults. Unknown fields are rejected.
 */
export function validateMoneyMovementIntent(candidate: unknown): MoneyMovementIntent {
  const record = requireObject(candidate, "a Money Movement Intent", fail);
  requireExactKeys(record, MONEY_MOVEMENT_INTENT_KEYS, "MoneyMovementIntent", fail);
  const intentId = requireBoundedString(
    record["intentId"],
    "MoneyMovementIntent.intentId",
    LIMITS.refMaxLength,
    fail,
  );
  const principalRef = requireBoundedString(
    record["principalRef"],
    "MoneyMovementIntent.principalRef",
    LIMITS.refMaxLength,
    fail,
  );
  const origin = validateFundsLocationRef(record["origin"], "MoneyMovementIntent.origin");
  const destination = validateFundsLocationRef(
    record["destination"],
    "MoneyMovementIntent.destination",
  );

  let originAmount: AmountSpec;
  try {
    originAmount = validatePositiveAmountSpec(
      record["originAmount"],
      "MoneyMovementIntent.originAmount",
    );
  } catch (error) {
    if (error instanceof InvalidAmountSpecError) {
      throw new InvalidMoneyMovementIntentError(
        `MoneyMovementIntent.originAmount must be a canonical exact-integer AmountSpec: ${error.message}`,
      );
    }
    throw error;
  }
  if (originAmount.currency !== origin.currency) {
    throw new InvalidMoneyMovementIntentError(
      `MoneyMovementIntent.originAmount currency '${originAmount.currency}' must match the origin location currency '${origin.currency}'`,
    );
  }

  const arrivalCurrency = requireCurrencyCode(
    record["arrivalCurrency"],
    "MoneyMovementIntent.arrivalCurrency",
    fail,
  );
  if (arrivalCurrency !== destination.currency) {
    throw new InvalidMoneyMovementIntentError(
      `MoneyMovementIntent.arrivalCurrency '${arrivalCurrency}' must match the destination location currency '${destination.currency}'`,
    );
  }

  const constraints = validateIntentConstraints(record["constraints"]);
  const intentAuthorizationRef = requireBoundedString(
    record["intentAuthorizationRef"],
    "MoneyMovementIntent.intentAuthorizationRef",
    LIMITS.refMaxLength,
    fail,
  );
  const declaredAt = requireNonNegativeSafeInteger(
    record["declaredAt"],
    "MoneyMovementIntent.declaredAt",
    fail,
  );
  const expiresAt = requireNonNegativeSafeInteger(
    record["expiresAt"],
    "MoneyMovementIntent.expiresAt",
    fail,
  );
  if (expiresAt <= declaredAt) {
    throw new InvalidMoneyMovementIntentError(
      "MoneyMovementIntent.expiresAt must be strictly after declaredAt — an already-expired window compiles nothing",
    );
  }

  return deepFreeze({
    intentId,
    principalRef,
    origin,
    destination,
    originAmount,
    arrivalCurrency,
    constraints,
    intentAuthorizationRef,
    declaredAt,
    expiresAt,
  });
}
