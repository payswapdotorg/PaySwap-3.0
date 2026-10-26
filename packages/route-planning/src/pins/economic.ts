/**
 * @payswap/route-planning — the PINNED WIRE SHAPES of the economic lane
 * (P16-A, ADR-0009 D2).
 *
 * LAYER LAW: zero sibling imports (the v1 intelligence-layer
 * leaf-in-flight law — the @payswap/opportunities and
 * @payswap/route-compiler pins precedents). Every mirror below names its
 * AUTHORITY — @payswap/economic, the Economic Model Authority's contract
 * package (P1-W1). The mirrors are deliberately SUBSET-typed: this
 * package requires LESS than the authority, so any genuine authority
 * value remains structurally assignable to the pin, while a pin can never
 * widen an authority law. Vocabulary VALUES are pinned byte-identical and
 * their cross-lane consistency is asserted by test/pins-fidelity.test.ts
 * (value pinning, never value imports — a value import would be a runtime
 * dependency).
 *
 * Pins in this module (authority: @payswap/economic):
 * - AmountSpecPin / FundsLocationRefPin / IntentConstraintsPin
 * - MoneyMovementIntentPin (the exact 10-key neutral demand)
 * - PaymentIntentPin (the exact 11-key commerce specialization)
 * - hasPinnedIntentKeySet / hasPinnedPaymentIntentKeySet (total predicates)
 */

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/amount-spec.ts
 * `AmountSpec` (three-letter currency code + canonical non-negative
 * decimal integer minor units).
 */
export interface AmountSpecPin {
  readonly currency: string;
  readonly minorUnits: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/intent.ts
 * `FundsLocationRef`: an OBSERVATION-GROUNDED reference to an external
 * funds location (a reference — never a balance, never custody, INV-7).
 */
export interface FundsLocationRefPin {
  /** Opaque external funds-location reference (e.g. `fundsloc:<...>`). */
  readonly locationRef: string;
  /** The currency/symbol observed at that location (AmountSpec law shape). */
  readonly currency: string;
  /** Opaque reference to the canonical observation grounding this location. */
  readonly observationRef: string;
}

/**
 * VALUE PIN — authority: @payswap/economic src/validate.ts LIMITS
 * `maxRouteHops` (8 — pinned byte-identical; the compiler input adapters
 * re-validate).
 */
export const PINNED_MAX_ROUTE_HOPS = 8 as const;

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/intent.ts
 * `IntentConstraints`: the bounded structural constraints carried by
 * every intent, propagated from the goal.
 */
export interface IntentConstraintsPin {
  /** Upper bound on wall-clock settlement duration (ms, positive). */
  readonly maxSettlementMs: number;
  /** Upper bound on intermediate hops (integer in [1, 8]). */
  readonly maxRouteHops: number;
}

/**
 * VALUE PIN — authority: @payswap/economic src/intent.ts
 * `MONEY_MOVEMENT_INTENT_KEYS` (the exact 10 canonical fields — and
 * NOTHING else; closed key set). Pinned byte-identical in the authority's
 * alphabetical order; unknown or missing fields are rejected downstream.
 */
export const PINNED_MONEY_MOVEMENT_INTENT_KEYS = Object.freeze([
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
] as const);

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/intent.ts
 * `MoneyMovementIntent`: ONE executable value-transfer demand,
 * rail/provider-neutral. ADVISORY DEMAND ONLY — establishes NO
 * authorization and NO financial finality; `intentAuthorizationRef` is an
 * opaque LINEAGE reference.
 */
export interface MoneyMovementIntentPin {
  /** Deterministic intent identity (e.g. `intent:<...>`). */
  readonly intentId: string;
  /** Principal reference (opaque; the trust plane owns principal identity). */
  readonly principalRef: string;
  /** Observation-grounded origin: WHERE value leaves (a reference, never a balance). */
  readonly origin: FundsLocationRefPin;
  /** Observation-grounded destination: WHERE value must arrive. */
  readonly destination: FundsLocationRefPin;
  /** The exact amount leaving the origin (positive; currency matches the origin). */
  readonly originAmount: AmountSpecPin;
  /** The currency/symbol the movement must arrive in (matches the destination). */
  readonly arrivalCurrency: string;
  /** Timing/structure constraints (propagated from the goal; bounded). */
  readonly constraints: IntentConstraintsPin;
  /** Authorization LINEAGE reference (opaque; establishes NO authorization). */
  readonly intentAuthorizationRef: string;
  /** Declared-at instant (ms, caller-supplied; no ambient clock). */
  readonly declaredAt: number;
  /** Absolute expiry (ms): strictly after declaredAt. */
  readonly expiresAt: number;
}

/**
 * VALUE PIN — authority: @payswap/economic src/payment-intent.ts
 * `PAYMENT_INTENT_KEYS` (the exact 11 canonical fields: the 10 movement
 * fields + commerceRef; closed key set). Pinned byte-identical in the
 * authority's order — the authority derives its list as
 * [...MONEY_MOVEMENT_INTENT_KEYS, "commerceRef"], so commerceRef is
 * appended LAST.
 */
export const PINNED_PAYMENT_INTENT_KEYS = Object.freeze([
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
] as const);

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/payment-intent.ts
 * `PaymentIntent`: a MoneyMovementIntent whose purpose is value exchange
 * with a commerce counterparty, plus ONE opaque commerce lineage reference
 * — nothing else (the type-level specialization law).
 */
export interface PaymentIntentPin extends MoneyMovementIntentPin {
  /** Opaque commerce-context lineage reference (e.g. `checkout:<...>`). */
  readonly commerceRef: string;
}

/**
 * Total predicate over the pinned movement key set: the compile-time key
 * list equals the runtime key list of any candidate object (subset
 * discipline: a genuine authority intent satisfies it; nothing else).
 */
export function hasPinnedIntentKeySet(candidate: unknown): candidate is MoneyMovementIntentPin {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const keys = Object.keys(candidate as Record<string, unknown>).sort();
  const expected = [...PINNED_MONEY_MOVEMENT_INTENT_KEYS].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

/**
 * Total predicate over the pinned payment key set (the 11-field
 * specialization; a payment intent carries commerceRef and is therefore
 * NOT a valid bare movement record — the fail-closed split).
 */
export function hasPinnedPaymentIntentKeySet(candidate: unknown): candidate is PaymentIntentPin {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const keys = Object.keys(candidate as Record<string, unknown>).sort();
  const expected = [...PINNED_PAYMENT_INTENT_KEYS].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}
