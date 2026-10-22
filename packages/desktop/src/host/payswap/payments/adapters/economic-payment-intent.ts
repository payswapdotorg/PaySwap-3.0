/**
 * PaySwap Desktop (P13-C) — the economic-composition adapter: the
 * canonical 11-field PaymentIntent pin.
 *
 * PINS BY VALUE the @payswap/economic law (packages/economic/src/
 * payment-intent.ts + intent.ts, P1-W1, TL-frozen):
 *
 * - PaymentIntent = MoneyMovementIntent (10 fields) + commerceRef — the
 *   11-field canonical key set, CLOSED: unknown fields are rejected.
 * - Origins/destinations are OBSERVATION-GROUNDED FundsLocationRefs —
 *   references, never balances, never custody (INV-7).
 * - originAmount is a positive exact-integer AmountSpec whose currency
 *   matches the origin location; arrivalCurrency matches the destination.
 * - constraints = { maxSettlementMs (positive), maxRouteHops (1..8) }.
 * - expiresAt is strictly after declaredAt (an already-expired window
 *   compiles nothing).
 * - ADVISORY DEMAND ONLY: the compiled intent establishes NO authorization
 *   and NO financial finality; intentAuthorizationRef is an OPAQUE lineage
 *   reference.
 *
 * The compile in ./intent-compiler.ts produces this shape; the mirror test
 * (test/payswap/payments-contract-mirrors.test.ts) feeds the compiled
 * record to the REAL @payswap/economic validatePaymentIntent and asserts
 * acceptance, plus the exact-keys rejections — behavioral fidelity, the
 * two-step mirror discipline. Live-import composition is the TL's
 * integration step (the desktop host layer law: no @payswap/* imports).
 */

/** The canonical currency shape: /^[A-Z]{3}$/ (fiat ISO-style + onchain symbols). */
export const CANONICAL_CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** The canonical minor-units shape: non-negative decimal integer string. */
export const CANONICAL_MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

/** The canonical hop bound (an unbounded hop count is never authorized). */
export const CANONICAL_MAX_ROUTE_HOPS = 8;

/**
 * The 11 canonical PaymentIntent fields: the 10 movement fields +
 * commerceRef. Mirrors PAYMENT_INTENT_KEYS (@payswap/economic).
 */
export const CANONICAL_PAYMENT_INTENT_KEYS = [
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
  "commerceRef",
] as const;

/** Observation-grounded funds-location reference (a reference, never a balance). */
export interface CanonicalFundsLocationRef {
  readonly locationRef: string;
  readonly currency: string;
  readonly observationRef: string;
}

/** Bounded structural constraints carried by every intent. */
export interface CanonicalIntentConstraints {
  readonly maxSettlementMs: number;
  readonly maxRouteHops: number;
}

/**
 * The canonical PaymentIntent pin — the ADVISORY demand record the
 * payment-mission runtime compiles to (structure only; this host module
 * implements the SHAPE and its fail-closed structural validation, never
 * money arithmetic — INV-01).
 */
export interface CanonicalPaymentIntent {
  readonly intentId: string;
  readonly principalRef: string;
  readonly origin: CanonicalFundsLocationRef;
  readonly destination: CanonicalFundsLocationRef;
  readonly originAmount: { readonly currency: string; readonly minorUnits: string };
  readonly arrivalCurrency: string;
  readonly constraints: CanonicalIntentConstraints;
  readonly intentAuthorizationRef: string;
  /** Declared-at instant (ms, caller-supplied; no ambient clock). */
  readonly declaredAt: number;
  /** Absolute expiry (ms): strictly after declaredAt. */
  readonly expiresAt: number;
  readonly commerceRef: string;
}

function isObject(candidate: unknown): candidate is Record<string, unknown> {
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate);
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], what: string): void {
  const got = Object.keys(record).sort().join(",");
  const want = [...expected].sort().join(",");
  if (got !== want) {
    throw new Error(`${what} has unexpected fields: got [${got}], want [${want}]`);
  }
}

function requireBoundedString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw new Error(`${field} must be a non-empty bounded string`);
  }
  return value;
}

/**
 * Fail-closed structural validation of the canonical 11-field shape
 * (mirrors validatePaymentIntent semantics; unknown fields rejected).
 * Returns a frozen copy — never repairs, never guesses, never defaults.
 */
export function validateCanonicalPaymentIntent(candidate: unknown): CanonicalPaymentIntent {
  if (!isObject(candidate)) {
    throw new Error("a canonical PaymentIntent (11 fields) is required");
  }
  exactKeys(candidate, CANONICAL_PAYMENT_INTENT_KEYS, "PaymentIntent");
  const origin = validateCanonicalFundsLocationRef(candidate["origin"], "origin");
  const destination = validateCanonicalFundsLocationRef(candidate["destination"], "destination");
  const amount = candidate["originAmount"];
  if (!isObject(amount)) {
    throw new Error("originAmount must be an AmountSpec (currency + minorUnits)");
  }
  exactKeys(amount, ["currency", "minorUnits"], "originAmount");
  if (
    typeof amount["currency"] !== "string" ||
    !CANONICAL_CURRENCY_PATTERN.test(amount["currency"])
  ) {
    throw new Error("originAmount.currency must match /^[A-Z]{3}$/");
  }
  if (
    typeof amount["minorUnits"] !== "string" ||
    !CANONICAL_MINOR_UNITS_PATTERN.test(amount["minorUnits"]) ||
    amount["minorUnits"] === "0"
  ) {
    throw new Error("originAmount.minorUnits must be a POSITIVE canonical decimal integer string");
  }
  if (amount["currency"] !== origin.currency) {
    throw new Error(
      `originAmount currency '${String(amount["currency"])}' must match the origin location currency '${origin.currency}'`,
    );
  }
  const arrivalCurrency = candidate["arrivalCurrency"];
  if (
    typeof arrivalCurrency !== "string" ||
    !CANONICAL_CURRENCY_PATTERN.test(arrivalCurrency) ||
    arrivalCurrency !== destination.currency
  ) {
    throw new Error(
      `arrivalCurrency must match /^[A-Z]{3}$/ and equal the destination location currency '${destination.currency}'`,
    );
  }
  const constraints = candidate["constraints"];
  if (!isObject(constraints)) {
    throw new Error("constraints must be { maxSettlementMs, maxRouteHops }");
  }
  exactKeys(constraints, ["maxRouteHops", "maxSettlementMs"], "constraints");
  const maxSettlementMs = constraints["maxSettlementMs"];
  if (
    typeof maxSettlementMs !== "number" ||
    !Number.isSafeInteger(maxSettlementMs) ||
    maxSettlementMs <= 0
  ) {
    throw new Error("constraints.maxSettlementMs must be a positive safe integer (ms)");
  }
  const maxRouteHops = constraints["maxRouteHops"];
  if (
    typeof maxRouteHops !== "number" ||
    !Number.isSafeInteger(maxRouteHops) ||
    maxRouteHops < 1 ||
    maxRouteHops > CANONICAL_MAX_ROUTE_HOPS
  ) {
    throw new Error(
      `constraints.maxRouteHops must be an integer in [1, ${String(CANONICAL_MAX_ROUTE_HOPS)}] — an unbounded hop count is never authorized`,
    );
  }
  const declaredAt = candidate["declaredAt"];
  const expiresAt = candidate["expiresAt"];
  if (
    typeof declaredAt !== "number" ||
    !Number.isSafeInteger(declaredAt) ||
    declaredAt < 0
  ) {
    throw new Error("declaredAt must be a non-negative safe integer (ms)");
  }
  if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt <= declaredAt) {
    throw new Error("expiresAt must be strictly after declaredAt — an already-expired window compiles nothing");
  }
  const intent: CanonicalPaymentIntent = Object.freeze({
    intentId: requireBoundedString(candidate["intentId"], "intentId"),
    principalRef: requireBoundedString(candidate["principalRef"], "principalRef"),
    origin,
    destination,
    originAmount: Object.freeze({
      currency: amount["currency"],
      minorUnits: amount["minorUnits"],
    }),
    arrivalCurrency,
    constraints: Object.freeze({ maxSettlementMs, maxRouteHops }),
    intentAuthorizationRef: requireBoundedString(
      candidate["intentAuthorizationRef"],
      "intentAuthorizationRef",
    ),
    declaredAt,
    expiresAt,
    commerceRef: requireBoundedString(candidate["commerceRef"], "commerceRef"),
  });
  return intent;
}

/** Fail-closed validation of a FundsLocationRef (exact keys; opaque refs). */
export function validateCanonicalFundsLocationRef(
  candidate: unknown,
  field: string,
): CanonicalFundsLocationRef {
  if (!isObject(candidate)) {
    throw new Error(`${field} must be a FundsLocationRef object`);
  }
  exactKeys(candidate, ["currency", "locationRef", "observationRef"], field);
  const currency = candidate["currency"];
  if (typeof currency !== "string" || !CANONICAL_CURRENCY_PATTERN.test(currency)) {
    throw new Error(`${field}.currency must match /^[A-Z]{3}$/`);
  }
  return Object.freeze({
    locationRef: requireBoundedString(candidate["locationRef"], `${field}.locationRef`),
    currency,
    observationRef: requireBoundedString(candidate["observationRef"], `${field}.observationRef`),
  });
}
