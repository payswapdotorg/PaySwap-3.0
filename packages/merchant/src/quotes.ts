/**
 * @payswap/merchant — exact crypto quotes (P5-W3, lane R3-W3; PORT of
 * old packages/merchant-crypto/src/quotes.ts @ 8a735bf, digests
 * re-based onto the local canonical backbone).
 *
 * A quote binds a fiat-priced amount to a crypto amount through an
 * EXACT rational ratio; fiat.value * ratio.denominator must equal
 * cryptoAmount.value * ratio.numerator (cross-multiplication, INV-2 —
 * no floats, no rounding, no silent dust). Quotes expire; expiry is a
 * first-class deterministic check (AT the boundary).
 */

import { ValidationError } from "./errors.ts";
import { InvalidCryptoQuoteError } from "./errors.ts";
import { canonicalDigest } from "./kernel.ts";
import { LIMITS } from "./kernel.ts";
import { asChainId, asCryptoAssetId, asQuoteId } from "./identifiers.ts";
import type { ChainId, CryptoAssetId, QuoteId } from "./identifiers.ts";
import { isCryptoAmountPositive } from "./assets.ts";
import type { CryptoAmount } from "./assets.ts";
import type { PinnedMoney } from "./pins/protocol.ts";
import type { PinnedMaterialTerms } from "./pins/payment.ts";
import { requireNonEmptyString } from "./secrets.ts";

/**
 * EXACT rational exchange ratio: `numerator` fiat minor units per
 * `denominator` crypto minor units. Both terms must be positive
 * bigints; the ratio is only ever used through cross-multiplication,
 * never as a float (INV-2).
 */
export interface ExactRatio {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/**
 * An exact crypto quote for one asset on one chain. The fiat amount,
 * crypto amount and ratio satisfy the cross-multiplication invariant
 * exactly; fees share the fiat currency; `validUntil` is strictly
 * after `quotedAt`.
 */
export interface CryptoQuote {
  readonly id: QuoteId;
  readonly assetId: CryptoAssetId;
  readonly chainId: ChainId;
  readonly fiatAmount: PinnedMoney;
  readonly cryptoAmount: CryptoAmount;
  readonly ratio: ExactRatio;
  readonly fees: PinnedMoney;
  readonly quotedAt: bigint;
  readonly validUntil: bigint;
  readonly sourceRef: string;
}

/**
 * Construct a validated, frozen crypto quote.
 *
 * INV-2 is structural: the quote is only accepted when
 * `fiatAmount.value * ratio.denominator === cryptoAmount.value * ratio.numerator`
 * exactly — cross-multiplied bigint equality, no floats, no rounding,
 * no silent dust. Anything else throws `InvalidCryptoQuoteError`.
 */
export function defineCryptoQuote(input: {
  readonly id: string;
  readonly assetId: string;
  readonly chainId: string;
  readonly fiatAmount: PinnedMoney;
  readonly cryptoAmount: CryptoAmount;
  readonly ratio: ExactRatio;
  readonly fees: PinnedMoney;
  readonly quotedAt: bigint;
  readonly validUntil: bigint;
  readonly sourceRef: string;
}): CryptoQuote {
  const id = asQuoteId(input.id);
  const assetId = asCryptoAssetId(input.assetId);
  const chainId = asChainId(input.chainId);
  const fiatAmount = input.fiatAmount;
  if (fiatAmount === null || typeof fiatAmount !== "object" || typeof fiatAmount.value !== "bigint") {
    throw new ValidationError("quote fiatAmount must be exact Money", { id });
  }
  if (fiatAmount.value <= 0n) {
    throw new ValidationError("quote fiatAmount must be positive", { id });
  }
  if (typeof fiatAmount.currency !== "string" || fiatAmount.currency.length !== LIMITS.currencyCodeLength) {
    throw new ValidationError("quote fiat currency must be an ISO-style code", { id });
  }
  const cryptoAmount = input.cryptoAmount;
  if (cryptoAmount === null || typeof cryptoAmount !== "object") {
    throw new ValidationError("quote cryptoAmount must be a CryptoAmount", { id });
  }
  if (!isCryptoAmountPositive(cryptoAmount)) {
    throw new ValidationError("quote cryptoAmount must be positive", { id });
  }
  if (cryptoAmount.assetId !== assetId) {
    throw new ValidationError("quote cryptoAmount must be denominated in the quoted asset", { id });
  }
  const ratio = input.ratio;
  if (
    ratio === null ||
    typeof ratio !== "object" ||
    typeof ratio.numerator !== "bigint" ||
    typeof ratio.denominator !== "bigint"
  ) {
    throw new ValidationError("quote ratio must be an ExactRatio of bigints", { id });
  }
  if (ratio.numerator <= 0n || ratio.denominator <= 0n) {
    throw new ValidationError("quote ratio terms must be positive bigints", { id });
  }
  const fees = input.fees;
  if (fees === null || typeof fees !== "object" || typeof fees.value !== "bigint") {
    throw new ValidationError("quote fees must be exact Money", { id });
  }
  if (fees.value < 0n) {
    throw new ValidationError("quote fees must be non-negative (zero fees are allowed)", { id });
  }
  if (fees.currency !== fiatAmount.currency) {
    throw new ValidationError("quote fees must share the fiat currency", {
      id,
      fiatCurrency: fiatAmount.currency,
      feeCurrency: fees.currency,
    });
  }
  if (typeof input.quotedAt !== "bigint" || typeof input.validUntil !== "bigint") {
    throw new ValidationError("quote timestamps must be bigint TimestampMs", { id });
  }
  if (input.quotedAt >= input.validUntil) {
    throw new ValidationError("quote validUntil must be strictly after quotedAt", { id });
  }
  const sourceRef = requireNonEmptyString(input.sourceRef, "quote sourceRef");
  if (sourceRef.length > LIMITS.refMaxLength) {
    throw new ValidationError("quote sourceRef exceeds 256 characters", { id });
  }
  if (fiatAmount.value * ratio.denominator !== cryptoAmount.value * ratio.numerator) {
    throw new InvalidCryptoQuoteError(
      "quote ratio is inconsistent with the quoted amounts (INV-2: exact cross-multiplication required)",
      { id },
    );
  }
  return Object.freeze({
    id,
    assetId,
    chainId,
    fiatAmount,
    cryptoAmount,
    ratio: Object.freeze({ numerator: ratio.numerator, denominator: ratio.denominator }),
    fees,
    quotedAt: input.quotedAt,
    validUntil: input.validUntil,
    sourceRef,
  });
}

/**
 * Deterministic expiry check. A quote expires AT its boundary:
 * `isQuoteExpired(quote, quote.validUntil)` is `true` — the last
 * instant a quote is usable is `validUntil - 1n`.
 */
export function isQuoteExpired(quote: CryptoQuote, now: bigint): boolean {
  if (quote === null || typeof quote !== "object") {
    throw new ValidationError("isQuoteExpired requires a CryptoQuote");
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs");
  }
  return now >= quote.validUntil;
}

/**
 * Deterministic canonical rendering of a crypto quote. Field-by-field —
 * never key-order JSON — so two structurally equal quotes always
 * render (and digest) identically.
 */
export function canonicalCryptoQuote(quote: CryptoQuote): string {
  if (quote === null || typeof quote !== "object" || typeof quote.id !== "string") {
    throw new ValidationError("canonicalCryptoQuote requires a CryptoQuote");
  }
  return (
    `cryptoQuote|id:${quote.id}` +
    `|asset:${quote.assetId}` +
    `|chain:${quote.chainId}` +
    `|fiat:${quote.fiatAmount.currency}:${quote.fiatAmount.value}` +
    `|crypto:${quote.cryptoAmount.assetId}:${quote.cryptoAmount.value}` +
    `|ratio:${quote.ratio.numerator}/${quote.ratio.denominator}` +
    `|fees:${quote.fees.currency}:${quote.fees.value}` +
    `|quotedAt:${quote.quotedAt}` +
    `|validUntil:${quote.validUntil}` +
    `|source:${quote.sourceRef}`
  );
}

/**
 * Deterministic digest of a crypto quote: the canonical rendering
 * through the local bigint-aware canonical digest (binding, never
 * security).
 */
export function cryptoQuoteHash(quote: CryptoQuote): string {
  return canonicalDigest(canonicalCryptoQuote(quote));
}

/**
 * Derive the quote's validity boundary: `quotedAt + validityMs`. The
 * validity window must be a positive bigint duration — a non-positive
 * window would produce a quote that is born expired.
 */
export function quoteValidityWindow(input: {
  readonly quotedAt: bigint;
  readonly validityMs: bigint;
}): bigint {
  if (typeof input.quotedAt !== "bigint") {
    throw new ValidationError("quote validity window requires a bigint quotedAt");
  }
  if (typeof input.validityMs !== "bigint" || input.validityMs <= 0n) {
    throw new ValidationError("quote validityMs must be a positive bigint");
  }
  return input.quotedAt + input.validityMs;
}

/**
 * Project a crypto quote onto the PINNED material-terms shape: the
 * payer-facing material terms of accepting this quote are the quote's
 * fiat amount, currency and fees plus the completion deadline,
 * recourse and settlement destination supplied by the caller. A
 * translation that changes ANY of these relative to the authorized
 * terms requires fresh reauthorization.
 */
export function materialTermsFromQuote(
  quote: CryptoQuote,
  terms: {
    readonly completionMs: bigint;
    readonly recourse: string;
    readonly settlementDestinationId: string;
  },
): PinnedMaterialTerms {
  if (quote === null || typeof quote !== "object") {
    throw new ValidationError("materialTermsFromQuote requires a CryptoQuote");
  }
  if (
    quote.fiatAmount === null ||
    typeof quote.fiatAmount !== "object" ||
    typeof quote.fiatAmount.currency !== "string" ||
    quote.fiatAmount.currency.length !== LIMITS.currencyCodeLength
  ) {
    throw new ValidationError("material terms currency must be an ISO-style code");
  }
  if (typeof terms.completionMs !== "bigint" || terms.completionMs <= 0n) {
    throw new ValidationError("material terms completionMs must be a positive bigint");
  }
  const recourse = requireNonEmptyString(terms.recourse, "material terms recourse");
  const settlementDestinationId = requireNonEmptyString(
    terms.settlementDestinationId,
    "material terms settlementDestinationId",
  );
  return Object.freeze({
    amount: quote.fiatAmount,
    currency: quote.fiatAmount.currency,
    fees: quote.fees,
    completionMs: terms.completionMs,
    recourse,
    settlementDestinationId,
  });
}
