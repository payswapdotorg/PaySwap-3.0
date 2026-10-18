/**
 * @payswap/route-compiler — the PINNED WIRE SHAPES of the economic lane
 * (P5-W1, lane R3-W1).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer
 * `intelligence`): packages/route-compiler is a v1 hermetic intelligence
 * package — ZERO sibling imports, no tsconfig paths entries, not even
 * TYPE-ONLY ones. Where a PaySwap contract shape owned by an authority
 * lane is needed, it is re-declared here as a MINIMAL SUBSET-TYPED
 * STRUCTURAL MIRROR with an authority-naming doc comment (the accepted
 * structural-pin pattern: packages/onchain-domain/src/pins.ts,
 * packages/agents/src/pins.ts, packages/execution-graph/src/
 * execution-modes.ts).
 *
 * Every mirror below names its AUTHORITY — @payswap/economic, the
 * Economic Model Authority's contract package (P1-W1). The mirrors are
 * deliberately SUBSET-typed: the route compiler requires LESS than the
 * authority, so any genuine authority value remains structurally
 * assignable to the pin, while a pin can never widen an authority law.
 * Vocabulary VALUES are pinned byte-identical to the authority lanes and
 * their cross-lane consistency is asserted by test/pins.test.ts (value
 * pinning, never value imports — a value import would be a runtime
 * dependency).
 *
 * Pins in this module (authority: @payswap/economic):
 * - AmountSpecPin (the pinned cross-lane money wire shape)
 * - FundsLocationRefPin (the observation-grounded neutral funds location)
 * - IntentConstraintsPin (the bounded hop/time constraints)
 * - MoneyMovementIntentPin (the 10-key neutral demand — the input of
 *   every compilation)
 */

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/amount-spec.ts
 * `AmountSpec` (the pinned cross-lane money wire shape: three-letter
 * currency code + canonical non-negative decimal integer minor units).
 * Branded/validated by the economic lane; structurally identical here.
 */
export interface AmountSpecPin {
  readonly currency: string;
  readonly minorUnits: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/intent.ts
 * `FundsLocationRef`: an OBSERVATION-GROUNDED reference to an external
 * funds location — WHERE value starts or must arrive. A reference — never
 * a balance, never custody (INV-7). The location's rail/provider meaning
 * is owned by the observation plane (capability lane), never by the
 * intent: THIS package grounds it through the location observations
 * carried on the compiler input (see src/grounding.ts).
 */
export interface FundsLocationRefPin {
  /** Opaque external funds-location reference (e.g. `fundsloc:<...>`). */
  readonly locationRef: string;
  /** The currency/symbol observed at that location (AmountSpec law shape). */
  readonly currency: string;
  /** Opaque reference to the canonical observation that grounds this location. */
  readonly observationRef: string;
}

/**
 * VALUE PIN — authority: @payswap/economic src/intent.ts
 * `IntentConstraints` field bounds: maxRouteHops is an integer in
 * [1, 8] (LIMITS.maxRouteHops on the economic lane is 8 — pinned
 * byte-identical here; the compiler input adapters re-validate).
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
 * `MONEY_MOVEMENT_INTENT_KEYS` (the 10 canonical fields — and NOTHING
 * else). Pinned byte-identical; the compiler's structural validation
 * rejects any intent carrying more or fewer keys (a closed key set is the
 * no-secret-material law: no secret-shaped field can smuggle in).
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
 * rail/provider-neutral. The single source of truth every downstream
 * artifact of THIS package (route plans, legs, scores, lineage records)
 * REFERENCES and never re-declares (the no-duplicate-ledger law). The
 * intent establishes NO authorization and NO financial finality —
 * `intentAuthorizationRef` is an opaque LINEAGE reference.
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
 * Total predicate over the pinned intent key set: the compile-time key
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
