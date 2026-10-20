/**
 * @payswap/financial-certification — the pinned wire shapes of the
 * route-compiler's quote-freshness authority (P8-W1).
 *
 * Authority: @payswap/route-compiler (P5-W1 — the port of the old
 * best-execution quote-observation law, MMI-19). Under the zero-sibling
 * law the wire shapes are LOCAL STRUCTURAL PINS and the freshness VALUE
 * law is mirrored behaviour-identically (the canonical pattern:
 * packages/opportunities/src/pins/route-compiler.ts). Cross-lane
 * consistency asserted by test/pins.test.ts.
 */

/**
 * STRUCTURAL PIN — authority: @payswap/route-compiler src/quote.ts
 * `QuoteFreshness` (verbatim wire shape): the bounded observation window
 * every quote carries (asOfMs non-negative integer; maxAgeMs POSITIVE
 * integer — a quote without a bound is not evidence).
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
 * clock.
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
 * VALUE PIN — authority: @payswap/route-compiler src/pins/onchain.ts
 * `PINNED_QUOTE_SEMANTICS` (byte-identical): INDICATIVE vs EXECUTABLE —
 * an INDICATIVE quote is never a credible price for execution. A
 * corridor may only ground commands in EXECUTABLE quotes.
 */
export const PINNED_QUOTE_SEMANTICS = Object.freeze([
  "INDICATIVE",
  "EXECUTABLE",
] as const);

export type PinnedQuoteSemantics = (typeof PINNED_QUOTE_SEMANTICS)[number];
