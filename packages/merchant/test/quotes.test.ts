import { describe, expect, it } from "vitest";
import {
  canonicalCryptoQuote,
  cryptoQuoteHash,
  defineCryptoQuote,
  isQuoteExpired,
  materialTermsFromQuote,
  quoteValidityWindow,
} from "../src/quotes.ts";
import type { CryptoQuote, ExactRatio } from "../src/quotes.ts";
import { InvalidCryptoQuoteError, ValidationError } from "../src/errors.ts";
import { canonicalDigest } from "../src/kernel.ts";
import type { CryptoAmount, PinnedMoney } from "../src/index.ts";
import {
  DESTINATION,
  ETH,
  T0,
  USDC,
  canonicalQuote,
  ethAmount,
  eur,
  usd,
  usdcAmount,
} from "./fixtures.ts";

/**
 * The crypto-quote suite (PORTED+ADAPTED from old
 * packages/merchant-crypto/test/quotes.test.ts @ 8a735bf — 23 sites —
 * plus the INV-F01 tampered-ratio probe of old adversarial.test.ts):
 * INV-2 exact cross-multiplication, expiry AT the boundary, the
 * field-by-field canonical rendering, the local deterministic digest and
 * the pinned material-terms projection. Every instant is a fixed bigint
 * from the fixture clock (no Date, no randomness).
 */

const QUOTE_VALIDITY_MS = 7_200_000n;

type QuoteInput = Parameters<typeof defineCryptoQuote>[0];

type QuoteOverrides = {
  readonly id?: string;
  readonly assetId?: string;
  readonly chainId?: string;
  readonly fiatAmount?: PinnedMoney;
  readonly cryptoAmount?: CryptoAmount;
  readonly ratio?: ExactRatio;
  readonly fees?: PinnedMoney;
  readonly quotedAt?: bigint;
  readonly validUntil?: bigint;
  readonly sourceRef?: string;
};

function baseQuoteInput(overrides: QuoteOverrides = {}): QuoteInput {
  return {
    id: overrides.id ?? "quote.usdc.usd.001",
    assetId: overrides.assetId ?? USDC.id,
    chainId: overrides.chainId ?? "chain.eth-mainnet",
    fiatAmount: overrides.fiatAmount ?? usd(10_000n),
    cryptoAmount: overrides.cryptoAmount ?? usdcAmount(100_000_000n),
    ratio: overrides.ratio ?? { numerator: 1n, denominator: 10_000n },
    fees: overrides.fees ?? usd(30n),
    quotedAt: overrides.quotedAt ?? T0,
    validUntil: overrides.validUntil ?? T0 + QUOTE_VALIDITY_MS,
    sourceRef: overrides.sourceRef ?? "source.psp.fixture",
  };
}

describe("defineCryptoQuote (INV-2 exactness)", () => {
  it("accepts an exactly cross-multiplied quote and freezes it", () => {
    const quote = defineCryptoQuote(baseQuoteInput());
    expect(quote.id).toBe("quote.usdc.usd.001");
    expect(quote.assetId).toBe(USDC.id);
    expect(quote.chainId).toBe("chain.eth-mainnet");
    expect(quote.fiatAmount.value).toBe(10_000n);
    expect(quote.fiatAmount.currency).toBe("USD");
    expect(quote.cryptoAmount.assetId).toBe(USDC.id);
    expect(quote.cryptoAmount.value).toBe(100_000_000n);
    expect(quote.cryptoAmount.decimals).toBe(6);
    expect(quote.ratio.numerator).toBe(1n);
    expect(quote.ratio.denominator).toBe(10_000n);
    expect(quote.fees.value).toBe(30n);
    expect(quote.fees.currency).toBe("USD");
    expect(quote.quotedAt).toBe(T0);
    expect(quote.validUntil).toBe(T0 + QUOTE_VALIDITY_MS);
    expect(quote.sourceRef).toBe("source.psp.fixture");
    expect(Object.isFrozen(quote)).toBe(true);
    expect(Object.isFrozen(quote.ratio)).toBe(true);
  });

  it("rejects an inconsistent ratio with InvalidCryptoQuoteError (INV-2 cross-multiplication)", () => {
    // 10_000 * 10_000 !== 111_000_000 * 1 — silent dust is forbidden.
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ cryptoAmount: usdcAmount(111_000_000n) })),
    ).toThrow(InvalidCryptoQuoteError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ cryptoAmount: usdcAmount(111_000_000n) })),
    ).toThrow(/cross-multiplication/);
  });

  it("requires positive fiat, crypto and ratio terms", () => {
    expect(() => defineCryptoQuote(baseQuoteInput({ fiatAmount: usd(0n) }))).toThrow(ValidationError);
    expect(() => defineCryptoQuote(baseQuoteInput({ fiatAmount: usd(-5n) }))).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ cryptoAmount: usdcAmount(0n) })),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ ratio: { numerator: 0n, denominator: 10_000n } })),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ ratio: { numerator: -1n, denominator: 10_000n } })),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ ratio: { numerator: 1n, denominator: 0n } })),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ ratio: { numerator: 1n, denominator: -10_000n } })),
    ).toThrow(ValidationError);
  });

  it("requires fees to share the fiat currency (zero fees allowed, negative fees rejected)", () => {
    expect(() => defineCryptoQuote(baseQuoteInput({ fees: eur(30n) }))).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ fees: eur(30n) })),
    ).toThrow(/share the fiat currency/);
    const zeroFee = defineCryptoQuote(baseQuoteInput({ fees: usd(0n) }));
    expect(zeroFee.fees.value).toBe(0n);
    expect(() => defineCryptoQuote(baseQuoteInput({ fees: usd(-30n) }))).toThrow(ValidationError);
  });

  it("requires validUntil to be strictly after quotedAt", () => {
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ quotedAt: T0 + QUOTE_VALIDITY_MS })),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ quotedAt: T0 + QUOTE_VALIDITY_MS + 1n })),
    ).toThrow(ValidationError);
  });

  it("requires a 3-character ISO-style fiat currency", () => {
    // Both monies carry the malformed 'EU' code, so only the 3-character
    // fiat-currency shape law can reject this input (the fees-share
    // equality passes and the ratio stays exactly cross-multiplied).
    const malformed = baseQuoteInput({
      fiatAmount: { currency: "EU", value: 10_000n },
      fees: { currency: "EU", value: 30n },
    });
    expect(() => defineCryptoQuote(malformed)).toThrow(ValidationError);
    expect(() => defineCryptoQuote(malformed)).toThrow(/ISO-style code/);
  });

  it("bounds sourceRef (non-empty, at most 256 characters)", () => {
    expect(() => defineCryptoQuote(baseQuoteInput({ sourceRef: "" }))).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ sourceRef: "s".repeat(257) })),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ sourceRef: "s".repeat(257) })),
    ).toThrow(/exceeds 256 characters/);
    const maximal = defineCryptoQuote(baseQuoteInput({ sourceRef: "s".repeat(256) }));
    expect(maximal.sourceRef.length).toBe(256);
  });

  it("requires the cryptoAmount to be denominated in the quoted asset", () => {
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ cryptoAmount: ethAmount(5_000_000_000_000_000n) })),
    ).toThrow(ValidationError);
    expect(() =>
      defineCryptoQuote(baseQuoteInput({ cryptoAmount: ethAmount(5_000_000_000_000_000n) })),
    ).toThrow(/denominated in the quoted asset/);
  });
});

describe("isQuoteExpired (expiry at the boundary)", () => {
  it("expires AT the boundary: validUntil is expired, validUntil - 1n is not", () => {
    const quote = canonicalQuote();
    expect(isQuoteExpired(quote, quote.validUntil)).toBe(true);
    expect(isQuoteExpired(quote, quote.validUntil + 1n)).toBe(true);
    expect(isQuoteExpired(quote, quote.validUntil - 1n)).toBe(false);
    expect(isQuoteExpired(quote, quote.quotedAt)).toBe(false);
  });
});

describe("canonicalCryptoQuote + cryptoQuoteHash (deterministic rendering)", () => {
  it("renders the documented field-by-field shape — stable for equal quotes, distinct when any field changes", () => {
    expect(canonicalCryptoQuote(canonicalQuote())).toBe(canonicalCryptoQuote(canonicalQuote()));
    expect(canonicalCryptoQuote(canonicalQuote())).toBe(
      "cryptoQuote|id:quote.usdc.1" +
        "|asset:asset.usdc" +
        "|chain:chain.eth-mainnet" +
        "|fiat:USD:10000" +
        "|crypto:asset.usdc:100000000" +
        "|ratio:1/10000" +
        "|fees:USD:30" +
        "|quotedAt:1761628800000" +
        "|validUntil:1761636000000" +
        "|source:source.psp.fixture",
    );
    const base = canonicalCryptoQuote(defineCryptoQuote(baseQuoteInput()));
    expect(
      canonicalCryptoQuote(defineCryptoQuote(baseQuoteInput({ sourceRef: "source.psp.other" }))),
    ).not.toBe(base);
    expect(
      canonicalCryptoQuote(defineCryptoQuote(baseQuoteInput({ chainId: "chain.base-mainnet" }))),
    ).not.toBe(base);
    expect(canonicalCryptoQuote(defineCryptoQuote(baseQuoteInput({ fees: usd(31n) })))).not.toBe(
      base,
    );
    expect(
      canonicalCryptoQuote(defineCryptoQuote(baseQuoteInput({ id: "quote.usdc.usd.002" }))),
    ).not.toBe(base);
    expect(
      canonicalCryptoQuote(
        defineCryptoQuote(
          baseQuoteInput({
            quotedAt: T0 + 1n,
            validUntil: T0 + QUOTE_VALIDITY_MS + 1n,
          }),
        ),
      ),
    ).not.toBe(base);
    // Twice the fiat for twice the crypto at the same exact ratio.
    expect(
      canonicalCryptoQuote(
        defineCryptoQuote(
          baseQuoteInput({
            fiatAmount: usd(20_000n),
            cryptoAmount: usdcAmount(200_000_000n),
            fees: usd(60n),
          }),
        ),
      ),
    ).not.toBe(base);
  });

  it("hashes deterministically for equal quotes and distinctly for different quotes", () => {
    expect(cryptoQuoteHash(canonicalQuote())).toBe(cryptoQuoteHash(canonicalQuote()));
    // The hash is the canonical rendering through the local digest law.
    expect(cryptoQuoteHash(canonicalQuote())).toBe(
      canonicalDigest(canonicalCryptoQuote(canonicalQuote())),
    );
    const doubled = defineCryptoQuote(
      baseQuoteInput({
        fiatAmount: usd(20_000n),
        cryptoAmount: usdcAmount(200_000_000n),
        fees: usd(60n),
      }),
    );
    expect(cryptoQuoteHash(doubled)).not.toBe(cryptoQuoteHash(canonicalQuote()));
  });
});

describe("quoteValidityWindow", () => {
  it("derives validUntil = quotedAt + validityMs and rejects non-positive windows", () => {
    expect(quoteValidityWindow({ quotedAt: T0, validityMs: QUOTE_VALIDITY_MS })).toBe(
      T0 + QUOTE_VALIDITY_MS,
    );
    expect(quoteValidityWindow({ quotedAt: T0, validityMs: 1n })).toBe(T0 + 1n);
    expect(() => quoteValidityWindow({ quotedAt: T0, validityMs: 0n })).toThrow(ValidationError);
    expect(() => quoteValidityWindow({ quotedAt: T0, validityMs: -1n })).toThrow(ValidationError);
  });
});

describe("materialTermsFromQuote (the pinned material-terms projection)", () => {
  const termsInput = {
    completionMs: 900_000n,
    recourse: "MERCHANT_DISPUTE_WINDOW",
    settlementDestinationId: DESTINATION.id,
  };

  it("projects the quote onto the pinned MaterialTerms (frozen, canonically stable)", () => {
    const quote = canonicalQuote();
    const terms = materialTermsFromQuote(quote, termsInput);
    expect(terms.amount).toBe(quote.fiatAmount);
    expect(terms.currency).toBe("USD");
    expect(terms.fees).toBe(quote.fees);
    expect(terms.completionMs).toBe(900_000n);
    expect(terms.recourse).toBe("MERCHANT_DISPUTE_WINDOW");
    expect(terms.settlementDestinationId).toBe(DESTINATION.id);
    expect(Object.isFrozen(terms)).toBe(true);
    // Canonically identical to the payment-plane MaterialTerms shape (the
    // old suite pinned this through materialTermsHash; the local
    // bigint-aware canonical digest carries the same law).
    const equivalent = {
      amount: quote.fiatAmount,
      currency: quote.fiatAmount.currency,
      fees: quote.fees,
      completionMs: 900_000n,
      recourse: "MERCHANT_DISPUTE_WINDOW",
      settlementDestinationId: DESTINATION.id,
    };
    expect(canonicalDigest(terms)).toBe(canonicalDigest(equivalent));
  });

  it("rejects a non-positive completionMs, an empty recourse and an empty settlementDestinationId", () => {
    const quote = canonicalQuote();
    expect(() =>
      materialTermsFromQuote(quote, { ...termsInput, completionMs: 0n }),
    ).toThrow(ValidationError);
    expect(() =>
      materialTermsFromQuote(quote, { ...termsInput, completionMs: -1n }),
    ).toThrow(ValidationError);
    expect(() => materialTermsFromQuote(quote, { ...termsInput, recourse: "" })).toThrow(
      ValidationError,
    );
    expect(() =>
      materialTermsFromQuote(quote, { ...termsInput, settlementDestinationId: "" }),
    ).toThrow(ValidationError);
  });

  it("rejects a tampered quote whose fiat currency is not a 3-character ISO-style code", () => {
    const quote = canonicalQuote();
    const tampered: CryptoQuote = {
      ...quote,
      fiatAmount: { ...quote.fiatAmount, currency: "EU" },
    };
    expect(() => materialTermsFromQuote(tampered, termsInput)).toThrow(ValidationError);
    expect(() => materialTermsFromQuote(tampered, termsInput)).toThrow(/ISO-style code/);
  });
});
