/**
 * @payswap/route-compiler — the Money Movement Intent on the economic pin
 * (P5-W1; ADAPT of payswap.org@8a735bf route-compiler/src/intent.ts, 351
 * lines, MMI-19/MMP-30).
 *
 * THE ADAPTATION (the 3.0 rail-neutrality law): the old intent's
 * origin/destination KIND vocabulary (ONCHAIN_WALLET /
 * EXTERNAL_PROVIDER_ACCOUNT / BANK_ACCOUNT / ONCHAIN_RECIPIENT /
 * STRIPE_MERCHANT_BALANCE) was rail- and provider-IDENTIFYING — the
 * economic lane (P1-W1) owns the intent and made origins/destinations
 * opaque OBSERVATION-GROUNDED funds-location references. THIS module is
 * the compiler-side CONSUMER of that neutral contract:
 *
 * - the wire shape is the PIN (src/pins/economic.ts, authority
 *   @payswap/economic) — byte-identical keys, closed key set;
 * - validation is STRUCTURAL (the fail-closed discipline of the old
 *   suite, re-targeted at the neutral shape): exact keys, currency
 *   matches at origin/destination/amount, bounded constraints, expiry
 *   strictly after declaration;
 * - the intent carries NO execution or routing semantics (HOW the demand
 *   is satisfied is the compiler's OUTPUT) and NO balance/custody state
 *   (INV-7: funding is proven by fresh observations at compile time);
 * - the intent is ADVISORY DEMAND ONLY: it establishes NO authorization
 *   and NO financial finality — `intentAuthorizationRef` is an opaque
 *   lineage reference the compiler carries, never interprets.
 */

import { InvalidMoneyMovementIntentError } from "./errors.ts";
import { requireBoundedString, requireCurrencyCode, requireNonNegativeSafeInteger, LIMITS } from "./canonical.ts";
import { deepFreeze, requireExactKeys, requireObject } from "./canonical.ts";
import { validatePositiveAmountSpec, type AmountSpec } from "./amount.ts";
import {
  PINNED_MAX_ROUTE_HOPS,
  PINNED_MONEY_MOVEMENT_INTENT_KEYS,
  type FundsLocationRefPin,
  type IntentConstraintsPin,
  type MoneyMovementIntentPin,
} from "./pins/economic.ts";

const fail = (message: string) => new InvalidMoneyMovementIntentError(message);

/** The compiler's view of the neutral intent (the pin, locally named). */
export type MoneyMovementIntent = MoneyMovementIntentPin;

/** A funds-location reference (the pin, locally named). */
export type FundsLocationRef = FundsLocationRefPin;

/** The intent constraints (the pin, locally named). */
export type IntentConstraints = IntentConstraintsPin;

/** Fail-closed validation of a FundsLocationRef (exact key set, bounded refs). */
export function validateFundsLocationRef(candidate: unknown, field: string): FundsLocationRef {
  const record = requireObject(candidate, `${field} (a FundsLocationRef)`, fail);
  requireExactKeys(record, ["currency", "locationRef", "observationRef"], field, fail);
  return deepFreeze({
    locationRef: requireBoundedString(record["locationRef"], `${field}.locationRef`, LIMITS.refMaxLength, fail),
    currency: requireCurrencyCode(record["currency"], `${field}.currency`, fail),
    observationRef: requireBoundedString(
      record["observationRef"],
      `${field}.observationRef`,
      LIMITS.refMaxLength,
      fail,
    ),
  });
}

/** Fail-closed validation of IntentConstraints (bounded hops and time). */
export function validateIntentConstraints(candidate: unknown): IntentConstraints {
  const record = requireObject(candidate, "IntentConstraints", fail);
  requireExactKeys(record, ["maxRouteHops", "maxSettlementMs"], "IntentConstraints", fail);
  const maxSettlementMs = candidate
    ? requireNonNegativeSafeInteger(record["maxSettlementMs"], "IntentConstraints.maxSettlementMs", fail)
    : 0;
  if (maxSettlementMs < 1) {
    throw new InvalidMoneyMovementIntentError(
      "IntentConstraints.maxSettlementMs must be a positive integer (a zero time budget is refused)",
    );
  }
  const rawHops = record["maxRouteHops"];
  if (
    typeof rawHops !== "number" ||
    !Number.isSafeInteger(rawHops) ||
    rawHops < 1 ||
    rawHops > PINNED_MAX_ROUTE_HOPS
  ) {
    throw new InvalidMoneyMovementIntentError(
      `IntentConstraints.maxRouteHops must be an integer in [1, ${PINNED_MAX_ROUTE_HOPS}] — an unbounded hop count is never authorized`,
    );
  }
  return deepFreeze({ maxRouteHops: rawHops, maxSettlementMs });
}

/**
 * Fail-closed STRUCTURAL validation of a Money Movement Intent (ports the
 * discipline of the old validateMoneyMovementIntent onto the neutral
 * pin): returns a frozen intent or throws — never repairs, never guesses,
 * never defaults. Unknown fields are rejected (the closed key set is the
 * no-secret-material law).
 */
export function validateMoneyMovementIntent(candidate: unknown): MoneyMovementIntent {
  const record = requireObject(candidate, "a Money Movement Intent", fail);
  requireExactKeys(record, PINNED_MONEY_MOVEMENT_INTENT_KEYS, "MoneyMovementIntent", fail);
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
    originAmount = validatePositiveAmountSpec(record["originAmount"], "MoneyMovementIntent.originAmount");
  } catch (error) {
    if (error instanceof Error && error.name === "ValidationError") {
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
      "MoneyMovementIntent.expiresAt must be strictly after declaredAt (a non-positive window is refused)",
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

/**
 * The intent references NO balance, custody, lock or hold (INV-7 — the
 * serialized form must never mention custody-shaped fields; the old
 * negative probe, preserved as a total predicate).
 */
export function intentCarriesNoCustodyState(intent: MoneyMovementIntent): boolean {
  const serialized = JSON.stringify(intent);
  return !/balance|available|held|custody|locked/i.test(serialized);
}
