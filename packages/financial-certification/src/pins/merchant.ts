/**
 * @payswap/financial-certification — the pinned wire shapes of the
 * merchant lane's exact-quote authority (P8-W1).
 *
 * Authority: @payswap/merchant (P5-W3, lane R3-W3 — the port of the old
 * merchant-crypto quotes/intent laws). Under the zero-sibling law the
 * wire shapes are LOCAL STRUCTURAL PINS and the expiry/ration value laws
 * are mirrored behaviour-identically; cross-lane consistency asserted by
 * test/pins.test.ts.
 */

/**
 * STRUCTURAL PIN — authority: @payswap/merchant src/quotes.ts
 * `CryptoQuote` (subset-typed): the expiry-bearing fields of an exact
 * quote — `validUntil` is strictly after `quotedAt` (a quote born
 * expired is unrepresentable).
 */
export interface PinnedQuoteExpiryWindow {
  readonly quotedAt: bigint;
  readonly validUntil: bigint;
}

/**
 * VALUE PIN — authority: @payswap/merchant src/quotes.ts
 * `isQuoteExpired` (behaviour-identical): a quote expires AT its
 * boundary — `isQuoteExpired(quote, quote.validUntil)` is true; the
 * last instant a quote is usable is `validUntil − 1n`.
 */
export function pinnedIsQuoteExpired(
  window: PinnedQuoteExpiryWindow,
  now: bigint,
): boolean {
  if (typeof now !== "bigint") {
    throw new RangeError("now must be a bigint TimestampMs");
  }
  return now >= window.validUntil;
}

/**
 * STRUCTURAL PIN — authority: @payswap/merchant src/quotes.ts
 * `ExactRatio` (verbatim wire shape): an exact rational exchange ratio
 * as positive bigints, only ever used through cross-multiplication
 * (INV-2 — no floats, no rounding, no silent dust).
 */
export interface PinnedExactRatio {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/**
 * VALUE PIN — authority: @payswap/merchant src/quotes.ts
 * `defineCryptoQuote` invariant (behaviour-identical): the exact
 * cross-multiplication law `fiatValue * denominator === cryptoValue *
 * numerator`.
 */
export function pinnedRatioCrossMultiplies(
  ratio: PinnedExactRatio,
  fiatValueMinor: bigint,
  cryptoValueMinor: bigint,
): boolean {
  if (
    typeof ratio.numerator !== "bigint" ||
    typeof ratio.denominator !== "bigint"
  ) {
    throw new RangeError("the ratio terms must be bigints");
  }
  return fiatValueMinor * ratio.denominator === cryptoValueMinor * ratio.numerator;
}

/**
 * STRUCTURAL PIN — authority: @payswap/merchant src/quotes.ts
 * `materialTermsFromQuote` output (subset-typed): the payer-facing
 * MATERIAL TERMS of accepting a quote. A translation that changes ANY of
 * these relative to the authorized terms requires fresh
 * reauthorization.
 */
export interface PinnedMaterialTerms {
  readonly amount: { readonly currency: string; readonly value: bigint };
  readonly currency: string;
  readonly fees: { readonly currency: string; readonly value: bigint };
  readonly completionMs: bigint;
  readonly recourse: string;
  readonly settlementDestinationId: string;
}
