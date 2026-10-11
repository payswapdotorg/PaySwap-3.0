/**
 * @payswap/economic — the Service Access Intent (P1-W1).
 *
 * NET-NEW code for a spec-only old-repo concept: payswap.org@8a735bf had
 * ServiceAccessIntent as SPEC ONLY (spec/architecture/FROZEN-ARCHITECTURE.md
 * §6 and spec/architecture/SERVICE-CAPABILITIES.md — "a complementary
 * goal/intent form for obtaining a service or entitlement"); no
 * implementation existed. The fail-closed validation discipline is ported
 * from the old intent law.
 *
 * Laws preserved from the old spec language:
 * - the demand names a SERVICE and a BENEFICIARY (opaque refs; the service
 *   plane owns service identity, the trust plane owns principal identity);
 * - the funding credential and the service/account credential remain
 *   DISTINCT: this intent carries NO funding machinery at all — funding is
 *   a separate MoneyMovementIntent demand (SERVICE-CAPABILITIES.md
 *   credential isolation);
 * - maxCost is an OPTIONAL declared ceiling in the pinned AmountSpec wire
 *   shape. Carrying it is allowed; COMPARING it is money arithmetic and is
 *   owned by the financial protocol lane (P1-W2) — never this package;
 * - ADVISORY DEMAND ONLY: establishes no authorization and no finality.
 */

import { InvalidAmountSpecError } from "./errors.ts";
import { InvalidServiceAccessIntentError } from "./errors.ts";
import { type AmountSpec, validateAmountSpec } from "./amount-spec.ts";
import { type IntentConstraints, validateIntentConstraints } from "./intent.ts";
import {
  LIMITS,
  deepFreeze,
  requireBoundedString,
  requireExactKeys,
  requireNonNegativeSafeInteger,
  requireObject,
  type Fail,
} from "./validate.ts";

const fail: Fail = (message: string) => new InvalidServiceAccessIntentError(message);

/** The canonical ServiceAccessIntent field set (maxCost is optional). */
export const SERVICE_ACCESS_INTENT_KEYS = [
  "authorizationRef",
  "beneficiaryRef",
  "constraints",
  "declaredAt",
  "expiresAt",
  "intentId",
  "maxCost",
  "principalRef",
  "serviceRef",
] as const;

/** The canonical Service Access Intent: ONE service/entitlement acquisition demand. */
export interface ServiceAccessIntent {
  /** Deterministic intent identity (e.g. `intent:<...>`). */
  readonly intentId: string;
  /** Principal reference (opaque; the trust plane owns principal identity). */
  readonly principalRef: string;
  /** Opaque service/entitlement reference — the service plane owns its meaning. */
  readonly serviceRef: string;
  /** Opaque beneficiary principal reference (who receives the entitlement). */
  readonly beneficiaryRef: string;
  /** Optional declared maximum acceptable total cost (wire shape only; comparison lives in the financial lane). */
  readonly maxCost?: AmountSpec;
  /** Timing/structure constraints (propagated from the goal; bounded). */
  readonly constraints: IntentConstraints;
  /** Authorization LINEAGE reference (opaque; establishes NO authorization). */
  readonly authorizationRef: string;
  /** Declared-at instant (ms, caller-supplied; no ambient clock). */
  readonly declaredAt: number;
  /** Absolute expiry (ms): strictly after declaredAt. */
  readonly expiresAt: number;
}

/**
 * Fail-closed structural validation of a Service Access Intent. Returns a
 * frozen intent or throws InvalidServiceAccessIntentError. `maxCost` may be
 * ABSENT but never INVALID; unknown fields are rejected.
 */
export function validateServiceAccessIntent(candidate: unknown): ServiceAccessIntent {
  const record = requireObject(candidate, "a Service Access Intent", fail);
  const hasCost = "maxCost" in record && record["maxCost"] !== undefined;
  requireExactKeys(
    record,
    hasCost
      ? SERVICE_ACCESS_INTENT_KEYS
      : SERVICE_ACCESS_INTENT_KEYS.filter((k) => k !== "maxCost"),
    "ServiceAccessIntent",
    fail,
  );

  const intentId = requireBoundedString(
    record["intentId"],
    "ServiceAccessIntent.intentId",
    LIMITS.refMaxLength,
    fail,
  );
  const principalRef = requireBoundedString(
    record["principalRef"],
    "ServiceAccessIntent.principalRef",
    LIMITS.refMaxLength,
    fail,
  );
  const serviceRef = requireBoundedString(
    record["serviceRef"],
    "ServiceAccessIntent.serviceRef",
    LIMITS.refMaxLength,
    fail,
  );
  const beneficiaryRef = requireBoundedString(
    record["beneficiaryRef"],
    "ServiceAccessIntent.beneficiaryRef",
    LIMITS.refMaxLength,
    fail,
  );
  let maxCost: AmountSpec | undefined;
  if (hasCost) {
    try {
      maxCost = validateAmountSpec(record["maxCost"]);
    } catch (error) {
      if (error instanceof InvalidAmountSpecError) {
        throw new InvalidServiceAccessIntentError(
          `ServiceAccessIntent.maxCost must be a canonical exact-integer AmountSpec: ${error.message}`,
        );
      }
      throw error;
    }
  }
  const constraints = validateIntentConstraints(record["constraints"]);
  const authorizationRef = requireBoundedString(
    record["authorizationRef"],
    "ServiceAccessIntent.authorizationRef",
    LIMITS.refMaxLength,
    fail,
  );
  const declaredAt = requireNonNegativeSafeInteger(
    record["declaredAt"],
    "ServiceAccessIntent.declaredAt",
    fail,
  );
  const expiresAt = requireNonNegativeSafeInteger(
    record["expiresAt"],
    "ServiceAccessIntent.expiresAt",
    fail,
  );
  if (expiresAt <= declaredAt) {
    throw new InvalidServiceAccessIntentError(
      "ServiceAccessIntent.expiresAt must be strictly after declaredAt — an already-expired window compiles nothing",
    );
  }

  const validated: ServiceAccessIntent = hasCost
    ? {
        intentId,
        principalRef,
        serviceRef,
        beneficiaryRef,
        maxCost: maxCost as AmountSpec,
        constraints,
        authorizationRef,
        declaredAt,
        expiresAt,
      }
    : {
        intentId,
        principalRef,
        serviceRef,
        beneficiaryRef,
        constraints,
        authorizationRef,
        declaredAt,
        expiresAt,
      };
  return deepFreeze(validated);
}
