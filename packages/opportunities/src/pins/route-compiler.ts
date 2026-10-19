/**
 * @payswap/opportunities — the pinned wire shapes of the route-compiler's
 * exact-math + freshness laws (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/route-compiler (P5-W1 — the best-execution/route
 * optimization lane; the PORT of the old payswap.org@8a735bf
 * packages/best-execution). The old onchain-opportunities package
 * consumed the old lane's ExactRational + QuoteFreshness AS-IS
 * (validateExactRational, compareRationals, isRationalZero,
 * validateQuoteFreshness, isQuoteStale); in PaySwap 3.0 the authority is
 * the route-compiler lane, and under the zero-sibling law this package
 * re-declares the wire shapes as LOCAL STRUCTURAL PINS and implements
 * the value laws LOCALLY (src/rational.ts + src/freshness.ts),
 * behaviour-identical, credited here:
 *
 * - ExactRational: canonical decimal integer strings (numerator
 *   non-negative, denominator positive — NEVER zero), computed with
 *   native BigInt, NOT GCD-reduced (reduction is a canonicalization
 *   choice that would change byte-stability of intermediate traces).
 * - QuoteFreshness: a BOUNDED observation window { asOfMs, maxAgeMs }
 *   with maxAgeMs POSITIVE (a boundless quote is not evidence), and the
 *   INCLUSIVE staleness law: stale iff (at − asOfMs) > maxAgeMs — fresh
 *   at exactly maxAge of age, stale one millisecond later. No ambient
 *   clock; the evaluation instant is always caller-supplied.
 *
 * Cross-lane consistency of both value laws is asserted by
 * test/pins.test.ts (the full resolver/staleness boundary matrix and the
 * rational canonical-form domain this package exercises).
 */

/**
 * STRUCTURAL PIN — authority: @payswap/route-compiler src/exact-math.ts
 * `ExactRational` (verbatim wire shape): an exact NON-NEGATIVE rational
 * as canonical decimal integer strings.
 */
export interface PinnedExactRational {
  /** Non-negative canonical decimal integer (no leading zeros). */
  readonly numerator: string;
  /** Positive canonical decimal integer (never zero). */
  readonly denominator: string;
}

/**
 * VALUE PIN — authority: @payswap/route-compiler src/exact-math.ts
 * `NON_NEGATIVE_INTEGER` + `POSITIVE_INTEGER` patterns (byte-identical):
 * the canonical decimal integer string forms of the two components.
 */
export const PINNED_NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
export const PINNED_POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

/**
 * VALUE PIN — authority: @payswap/route-compiler src/exact-math.ts
 * `ZERO_RATIONAL` (byte-identical value): the additive identity.
 */
export const PINNED_ZERO_RATIONAL: PinnedExactRational = Object.freeze({
  numerator: "0",
  denominator: "1",
});

/**
 * STRUCTURAL PIN — authority: @payswap/route-compiler src/quote.ts
 * `QuoteFreshness` (verbatim wire shape): the bounded observation window
 * every piece of opportunity evidence carries (asOfMs non-negative
 * integer; maxAgeMs POSITIVE integer — a boundless observation is not
 * evidence). This package names it EvidenceFreshness locally; the wire
 * shape is the authority's, and any genuine authority value remains
 * structurally assignable to the pin.
 */
export interface PinnedQuoteFreshness {
  readonly asOfMs: number;
  /** POSITIVE: an observation without a bound is not evidence. */
  readonly maxAgeMs: number;
}

/**
 * VALUE PIN — authority: @payswap/route-compiler src/quote.ts
 * `isQuoteStale` (behaviour-identical): stale iff
 * (at − asOfMs) > maxAgeMs — the INCLUSIVE freshness bound (fresh at
 * exactly maxAge of age, stale one millisecond later). The evaluation
 * instant must be a non-negative safe integer; there is no ambient
 * clock. Cross-lane consistency asserted over the boundary matrix by
 * test/pins.test.ts.
 */
export function pinnedIsQuoteStale(
  freshness: PinnedQuoteFreshness,
  at: number,
): boolean {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(
      "the evaluation instant must be a non-negative integer (no ambient clock)",
    );
  }
  return at - freshness.asOfMs > freshness.maxAgeMs;
}

/**
 * VALUE PIN — authority: @payswap/route-compiler src/exact-math.ts
 * `compareRationals` semantics (behaviour-identical): the exact ordering
 * of two canonical rationals via cross-multiplication in BigInt —
 * negative when a < b, zero when equal, positive when a > b. NEVER
 * floating point.
 */
export function pinnedCompareRationals(
  a: PinnedExactRational,
  b: PinnedExactRational,
): number {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
