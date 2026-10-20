import { describe, expect, it } from "vitest";
import {
  MATERIAL_CHANGE_AXES,
  certifiedQuoteDigest,
  certifyQuoteGrounding,
  defineCertifiedQuoteObservation,
  materialChangeBetween,
  quoteStatusAt,
} from "../src/index.ts";
import type { CertifiedQuoteObservation, QuoteMaterialTerms } from "../src/index.ts";
import {
  MAX_AGE_MS,
  T0,
  T0_NUM,
  VALIDITY_MS,
  conformingCommandFor,
  conformingQuote,
} from "./fixtures.ts";

/**
 * FIN-LAW-01 — quote honesty (hard law 1): expired quotes are inert;
 * material change (beneficiary/price/amount/rail) invalidates the quote
 * and any command built on it; freshness is carried, not assumed.
 */
describe("FIN-LAW-01: quote honesty", () => {
  it("a fresh, unexpired, EXECUTABLE quote is executable at the probe instant", () => {
    const quote = conformingQuote();
    const status = quoteStatusAt(quote, { windowAt: T0, freshnessAt: T0_NUM });
    expect(status).toEqual({ status: "EXECUTABLE" });
  });

  it("a quote expires AT its boundary (the last usable instant is validUntil − 1)", () => {
    const quote = conformingQuote();
    expect(
      quoteStatusAt(quote, { windowAt: quote.validUntil - 1n, freshnessAt: T0_NUM }).status,
    ).toBe("EXECUTABLE");
    const atBoundary = quoteStatusAt(quote, {
      windowAt: quote.validUntil,
      freshnessAt: T0_NUM,
    });
    expect(atBoundary.status).toBe("EXPIRED");
  });

  it("a stale observation window is expiry too (the inclusive freshness bound)", () => {
    const quote = conformingQuote();
    // Fresh at exactly maxAge of age; stale one ms later.
    expect(
      quoteStatusAt(quote, {
        windowAt: T0,
        freshnessAt: quote.freshness.asOfMs + MAX_AGE_MS,
      }).status,
    ).toBe("EXECUTABLE");
    expect(
      quoteStatusAt(quote, {
        windowAt: T0,
        freshnessAt: quote.freshness.asOfMs + MAX_AGE_MS + 1,
      }).status,
    ).toBe("EXPIRED");
  });

  it("a command grounded in an EXPIRED quote violates the inertness law", () => {
    const quote = conformingQuote();
    const command = conformingCommandFor(quote);
    const verdict = certifyQuoteGrounding({
      subjectRef: "corridor:test",
      quote,
      at: { windowAt: quote.validUntil + 5n, freshnessAt: T0_NUM },
      command,
      scenarioId: "QUOTE_EXPIRY",
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("EXPIRED");
    expect(verdict.violations.join(" ")).toContain("never executable");
  });

  it("a correctly grounded command on a fresh quote passes", () => {
    const quote = conformingQuote();
    const verdict = certifyQuoteGrounding({
      subjectRef: "corridor:test",
      quote,
      at: { windowAt: T0, freshnessAt: T0_NUM },
      command: conformingCommandFor(quote),
      scenarioId: "QUOTE_EXPIRY",
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it("material change on ANY axis invalidates the command (all five axes covered)", () => {
    const quote = conformingQuote();
    expect(MATERIAL_CHANGE_AXES).toEqual([
      "BENEFICIARY",
      "PAYOUT_AMOUNT",
      "PAYOUT_CURRENCY",
      "FIAT_PRICE",
      "RAIL",
    ]);
    const cases: [string, Partial<QuoteMaterialTerms>][] = [
      ["BENEFICIARY", { beneficiaryId: "bene:swapped" }],
      ["PAYOUT_AMOUNT", { payoutAmountMinor: 10_001n }],
      ["PAYOUT_CURRENCY", { payoutCurrency: "USD" }],
      ["FIAT_PRICE", { fiatPriceMinor: 1_051n }],
      ["RAIL", { railId: "fiat:swift" }],
    ];
    for (const [axis, override] of cases) {
      const changed = materialChangeBetween(quote.materialTerms, {
        ...quote.materialTerms,
        ...override,
      });
      expect(changed.changed, axis).toBe(true);
      if (changed.changed) {
        expect(changed.axes, axis).toEqual([axis]);
      }
      const verdict = certifyQuoteGrounding({
        subjectRef: "corridor:test",
        quote,
        at: { windowAt: T0, freshnessAt: T0_NUM },
        command: {
          ...conformingCommandFor(quote),
          presentedTerms: { ...quote.materialTerms, ...override },
        },
        scenarioId: "QUOTE_MATERIAL_CHANGE",
      });
      expect(verdict.passed, axis).toBe(false);
      expect(verdict.violations.join(" "), axis).toContain("MATERIALLY changed");
    }
  });

  it("unchanged terms report NO material change", () => {
    const quote = conformingQuote();
    expect(materialChangeBetween(quote.materialTerms, { ...quote.materialTerms })).toEqual({
      changed: false,
    });
  });

  it("an INDICATIVE quote can never ground a command (freshness/semantics carried)", () => {
    const base = conformingQuote();
    const indicative = defineCertifiedQuoteObservation({
      ...base,
      quoteId: "quote:indicative-1",
      quoteSemantics: "INDICATIVE",
    });
    const verdict = certifyQuoteGrounding({
      subjectRef: "corridor:test",
      quote: indicative,
      at: { windowAt: T0, freshnessAt: T0_NUM },
      command: conformingCommandFor(indicative),
      scenarioId: "QUOTE_MATERIAL_CHANGE",
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("INDICATIVE");
  });

  it("a command that does not carry the quote's digest violates the binding law", () => {
    const quote = conformingQuote();
    const verdict = certifyQuoteGrounding({
      subjectRef: "corridor:test",
      quote,
      at: { windowAt: T0, freshnessAt: T0_NUM },
      command: {
        ...conformingCommandFor(quote),
        quoteDigest: "fnv1a64:0000000000000000",
      },
      scenarioId: "QUOTE_EXPIRY",
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("digest");
  });

  it("construction fails closed: a born-expired quote is unrepresentable", () => {
    const base = conformingQuote();
    expect(() =>
      defineCertifiedQuoteObservation({
        ...base,
        validUntil: base.quotedAt,
      }),
    ).toThrow(/strictly after quotedAt/);
    expect(() =>
      defineCertifiedQuoteObservation({
        ...base,
        freshness: { asOfMs: T0_NUM, maxAgeMs: 0 },
      }),
    ).toThrow(/bounded window/);
  });

  it("the quote digest is byte-deterministic (same quote, same digest)", () => {
    expect(certifiedQuoteDigest(conformingQuote())).toBe(
      certifiedQuoteDigest(conformingQuote()),
    );
    const variant = defineCertifiedQuoteObservation({
      ...conformingQuote(),
      quoteId: "quote:alpha-2",
    });
    expect(certifiedQuoteDigest(variant)).not.toBe(
      certifiedQuoteDigest(conformingQuote()),
    );
    expect(VALIDITY_MS).toBeGreaterThan(0n);
  });
});
