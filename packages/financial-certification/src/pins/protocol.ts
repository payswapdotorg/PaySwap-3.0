/**
 * @payswap/financial-certification — the pinned wire shapes of the protocol
 * kernel's money/outcome authorities (P8-W1).
 *
 * Authority: @payswap/protocol (P1-W2 — the ONE owner of exact-integer
 * money semantics, INV-01/INV-02). Under the zero-sibling law the wire
 * shapes are LOCAL STRUCTURAL PINS; the money VALUE laws (exact bigint
 * minor units, float rejection, currency registry) stay with the
 * authority — this package never re-derives financial truth, it only
 * certifies artifacts that CARRY these shapes. Cross-lane consistency
 * asserted by test/pins.test.ts.
 */

/**
 * STRUCTURAL PIN — authority: @payswap/protocol src/money.ts `Money`
 * (subset-typed: the genuine branded Money is structurally assignable to
 * this pin): an exact monetary value as integer minor units of an
 * ISO-4217-style currency.
 */
export interface PinnedMoney {
  readonly currency: string;
  /** Integer minor units — bigint, never a float (INV-02). */
  readonly value: bigint;
}

/**
 * STRUCTURAL PIN — authority: @payswap/protocol src/clock.ts
 * `TimestampMs` (verbatim wire shape): milliseconds since the epoch, as
 * an exact bigint. Every instant in the certification machinery is
 * caller-declared; there is no ambient clock.
 */
export type PinnedTimestampMs = bigint;

/**
 * VALUE PIN — authority: @payswap/provider-runtime src/result-envelope.ts
 * `EXTERNAL_EFFECT_OUTCOMES` (byte-identical): the three-value
 * external-effect outcome vocabulary (INV-04 — UNKNOWN is distinct from
 * FAILED and is reconciled rather than blindly retried).
 */
export const PINNED_EXTERNAL_EFFECT_OUTCOMES = Object.freeze([
  "CONFIRMED",
  "UNKNOWN",
  "FAILED",
] as const);

export type PinnedExternalEffectOutcome =
  (typeof PINNED_EXTERNAL_EFFECT_OUTCOMES)[number];
