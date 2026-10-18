import { describe, expect, it } from "vitest";
import { validateQuoteFreshness, isQuoteStale, validateQuoteProvenance, validateQuoteObserver } from "../src/quote.ts";
import { validateVenueQuote, validateVenueQuoteOutcome } from "../src/engine-support.ts";
import { ValidationError } from "../src/errors.ts";
import { fixtureQuote } from "./venue-fixtures.ts";
import { NOW } from "./fixtures.ts";

/**
 * The quote observation law (PORT of the old quote-observation suite):
 * freshness is mandatory and bounded; provenance is evidenced; observer
 * identity is mandatory; the quote outcome carries UNKNOWN.
 */
describe("quote freshness (the inclusive bound law)", () => {
  it("freshness requires a positive maxAge (a boundless quote is not evidence)", () => {
    expect(() => validateQuoteFreshness({ asOfMs: NOW, maxAgeMs: 0 }, "probe")).toThrowError(/positive/);
    expect(() => validateQuoteFreshness({ asOfMs: NOW, maxAgeMs: -1 }, "probe")).toThrowError(/positive/);
    expect(() => validateQuoteFreshness({ asOfMs: -1, maxAgeMs: 10 }, "probe")).toThrowError(/non-negative/);
    expect(validateQuoteFreshness({ asOfMs: NOW, maxAgeMs: 10_000 }, "probe")).toEqual({
      asOfMs: NOW,
      maxAgeMs: 10_000,
    });
  });

  it("staleness: fresh at exactly maxAge, stale one ms later", () => {
    const freshness = { asOfMs: NOW, maxAgeMs: 10_000 };
    expect(isQuoteStale(freshness, NOW)).toBe(false);
    expect(isQuoteStale(freshness, NOW + 10_000)).toBe(false);
    expect(isQuoteStale(freshness, NOW + 10_001)).toBe(true);
  });

  it("the evaluation instant must be a non-negative integer (no ambient clock)", () => {
    expect(() => isQuoteStale({ asOfMs: NOW, maxAgeMs: 10 }, -1)).toThrowError(/non-negative/);
    expect(() => isQuoteStale({ asOfMs: NOW, maxAgeMs: 10 }, 1.5)).toThrowError(/non-negative/);
  });

  it("provenance requires non-empty evidence refs (INV-E02)", () => {
    expect(() =>
      validateQuoteProvenance({ providerName: "p", source: "VENUE_API", capturedAtMs: NOW, evidenceRefs: [] }, "probe"),
    ).toThrowError(/non-empty/);
    expect(
      validateQuoteProvenance({ providerName: "p", source: "VENUE_API", capturedAtMs: NOW, evidenceRefs: ["a"] }, "probe"),
    ).toEqual({
      providerName: "p",
      source: "VENUE_API",
      capturedAtMs: NOW,
      evidenceRefs: ["a"],
    });
  });

  it("the source and observer vocabularies are closed", () => {
    expect(() =>
      validateQuoteProvenance({ providerName: "p", source: "MAGIC", capturedAtMs: NOW, evidenceRefs: ["a"] }, "probe"),
    ).toThrowError(/closed/);
    expect(() => validateQuoteObserver({ observerId: "x", observerKind: "MAGIC" }, "probe")).toThrowError(/closed/);
    expect(validateQuoteObserver({ observerId: "x", observerKind: "INDEXER" }, "probe")).toEqual({
      observerId: "x",
      observerKind: "INDEXER",
    });
  });
});

describe("the venue quote validation law (aggregate, never first-fail)", () => {
  it("the fixture quote validates and freezes", () => {
    const quote = validateVenueQuote(fixtureQuote());
    expect(quote.quoteId).toBe("quote:fixture-dex:001");
    expect(quote.quoteSemantics).toBe("EXECUTABLE");
    expect(quote.slippage.worstCaseOutput.minorUnits).toBe("3200000");
    expect(Object.isFrozen(quote)).toBe(true);
  });

  it("aggregates every violation into one error (the complete list, never the first)", () => {
    try {
      validateVenueQuote({ ...fixtureQuote(), quoteId: "", chain: "", fees: "nope", slippage: undefined });
      expect.unreachable("the malformed quote must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const details = (error as ValidationError & { details?: { errors?: string[] } }).details;
      const errors = details !== undefined && typeof details === "object" && "errors" in details
        ? (details as { errors: string[] }).errors
        : [];
      expect(errors.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("the input amount must be denominated in the input asset's symbol", () => {
    expect(() =>
      validateVenueQuote({ ...fixtureQuote(), inputAmount: { currency: "USC", minorUnits: "1" } }),
    ).toThrowError(/input asset's symbol/);
  });

  it("the worst-case output must be denominated in the output asset's symbol", () => {
    expect(() =>
      validateVenueQuote({
        ...fixtureQuote(),
        slippage: { ...fixtureQuote().slippage, worstCaseOutput: { currency: "ETH", minorUnits: "1" } },
      }),
    ).toThrowError(/output asset/);
  });

  it("a quote without provenance, observer or freshness is rejected (observations are evidenced)", () => {
    const { provenance, observer, freshness, ...stripped } = fixtureQuote();
    void provenance;
    void observer;
    void freshness;
    expect(() => validateVenueQuote(stripped)).toThrowError(ValidationError);
  });

  it("the quote OUTCOME vocabulary carries UNKNOWN (never converted)", () => {
    const unavailable = validateVenueQuoteOutcome({ kind: "UNAVAILABLE", reason: "no liquidity" });
    expect(unavailable.kind).toBe("UNAVAILABLE");
    const unknown = validateVenueQuoteOutcome({ kind: "OUTCOME_UNKNOWN", reason: "could not observe" });
    expect(unknown.kind).toBe("OUTCOME_UNKNOWN");
    expect(() => validateVenueQuoteOutcome({ kind: "MAGIC" })).toThrowError(/QUOTE, UNAVAILABLE or OUTCOME_UNKNOWN/);
    expect(validateVenueQuoteOutcome({ kind: "QUOTE", quote: fixtureQuote() }).kind).toBe("QUOTE");
  });
});
