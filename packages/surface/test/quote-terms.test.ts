/**
 * Quote/terms tests (P2-W3).
 *
 * PORTED/ADAPTED (7 tests) from the old repo's convert-disclosure fold
 * block (payswap.org@8a735bf vocabulary-folds.test.ts §"convert disclosure
 * fold"): the disclosure-fold LAW (honest counts, verbatim reasons, nothing
 * silently dropped, honest all-unavailable headline, exact minor-unit
 * summary) ports onto the quote/terms projection; route compilation itself
 * is P5-W1 territory and is NOT ported.
 *
 * NET-NEW: quote disclosure completeness (fees), estimate-vs-guarantee
 * labeling, expiry freshness with the explicit clock, funding/recipient
 * assumptions, material-change conditions, and fail-closed guards.
 */

import { describe, expect, it } from "vitest";

import {
  type MoneyDisplayInput,
  type QuoteTermsSource,
  type QuoteTermsView,
  foldQuoteTerms,
} from "../src/index.ts";

const DISPLAY: MoneyDisplayInput = {
  currencyDigits: new Map([
    ["EUR", 2],
    ["GBP", 2],
  ]),
};

const NOW = "2026-10-11T12:10:00Z";

function declaredDisplay(total: QuoteTermsView["fees"]["total"]): string {
  if (total.kind !== "DECLARED") {
    throw new Error(`expected DECLARED total, got ${total.kind}`);
  }
  return total.display;
}

function notDeclaredNote(total: QuoteTermsView["fees"]["total"]): string {
  if (total.kind !== "NOT_DECLARED") {
    throw new Error(`expected NOT_DECLARED total, got ${total.kind}`);
  }
  return total.note;
}

const baseQuote: QuoteTermsSource = {
  quoteId: "quote:1",
  quoteVersion: "3",
  sourceAmount: { currency: "EUR", minorUnits: "123456" },
  targetAmount: { currency: "GBP", minorUnits: "108742" },
  feeLines: [
    {
      feeId: "transfer-fee",
      label: "Transfer fee",
      amount: { currency: "EUR", minorUnits: "391" },
      basis: "PROVIDER_DISCLOSED",
      includedInQuotedAmount: true,
    },
  ],
  declaredTotalFees: { currency: "EUR", minorUnits: "391" },
  rate: {
    value: "0.880742",
    provenance: "mid-market",
    asOf: "2026-10-11T12:00:00Z",
    roundingRule: "round half up to target minor units",
  },
  expiry: { at: "2026-10-11T12:30:00Z", onExpiry: "REVALIDATE_REQUIRED" },
  delivery: { kind: "ESTIMATE", estimateLabel: "1–2 business days" },
  fundingAssumption: {
    method: "BANK_TRANSFER",
    note: "changing the funding method can change the terms",
  },
  recipientAssumption: {
    accountType: "BUSINESS_BANK_ACCOUNT",
    note: "fields and checks depend on corridor, method and recipient type",
  },
  conditions: {
    rateLocked: true,
    refreshAvailable: true,
    materialChangePolicy: "recipient or amount changes void the quote",
  },
};

describe("quote disclosure fold (ported disclosure law)", () => {
  const view = foldQuoteTerms(baseQuote, { now: NOW, display: DISPLAY });

  it("discloses the exact amounts, fee count, rate provenance and expiry in the outcome line", () => {
    expect(view.amounts.source).toBe("1,234.56 EUR");
    expect(view.amounts.target).toBe("1,087.42 GBP");
    expect(view.outcomeLine).toContain("1 fee line disclosed");
    expect(view.outcomeLine).toContain("rate 0.880742 (mid-market, as of 2026-10-11T12:00:00Z)");
    expect(view.outcomeLine).toContain("expires 2026-10-11T12:30:00Z");
  });

  it("carries every fee line verbatim (nothing hidden, nothing summed by the surface)", () => {
    expect(view.fees.lines).toHaveLength(1);
    expect(view.fees.lines[0]?.label).toBe("Transfer fee");
    expect(view.fees.lines[0]?.display).toBe("3.91 EUR");
    expect(view.fees.total.kind).toBe("DECLARED");
    expect(declaredDisplay(view.fees.total)).toBe("3.91 EUR");
  });

  it("declared-total honesty: absent declared total is NEVER invented (no money arithmetic on the surface)", () => {
    const { declaredTotalFees: _omitted, ...withoutTotal } = baseQuote;
    const noTotal = foldQuoteTerms(withoutTotal, { now: NOW, display: DISPLAY });
    expect(noTotal.fees.total.kind).toBe("NOT_DECLARED");
    expect(notDeclaredNote(noTotal.fees.total)).toContain("never invents a total");
  });

  it("funding and recipient assumptions render in people language", () => {
    expect(view.assumptions.join(" ")).toContain("BANK_TRANSFER");
    expect(view.assumptions.join(" ")).toContain("BUSINESS_BANK_ACCOUNT");
  });

  it("conditions render the material-change policy verbatim", () => {
    expect(view.conditions.join(" ")).toContain("recipient or amount changes void the quote");
    expect(view.conditions.join(" ")).toContain("rate is locked");
  });

  it("an expired quote leads with the honest expired fact (explicit now input)", () => {
    const expired = foldQuoteTerms(baseQuote, {
      now: "2026-10-11T12:31:00Z",
      display: DISPLAY,
    });
    expect(expired.freshness.status).toBe("EXPIRED");
    const expiredFreshness = expired.freshness;
    if (expiredFreshness.status !== "EXPIRED") throw new Error("unreachable");
    expect(expiredFreshness.headline).toContain("no longer offered");
    expect(expired.outcomeLine.startsWith("This quote has expired")).toBe(true);
  });

  it("the summary line is exact minor units, never a float rewrite", () => {
    expect(view.outcomeLine).toContain("1,234.56 EUR → 1,087.42 GBP");
  });
});

describe("estimate-vs-guarantee labeling (net-new)", () => {
  it("an ESTIMATE is labeled as an estimate and NEVER claims a guarantee", () => {
    const view = foldQuoteTerms(baseQuote, { now: NOW, display: DISPLAY });
    expect(view.delivery.kind).toBe("ESTIMATE");
    expect(view.delivery.line).toBe("Estimated delivery: 1–2 business days — an estimate, not a guarantee.");
    expect(view.delivery.line).not.toContain("Guaranteed");
  });

  it("a GUARANTEE renders only with its provider-backed basis", () => {
    const guaranteed = foldQuoteTerms(
      {
        ...baseQuote,
        delivery: { kind: "GUARANTEE", estimateLabel: "by 17:00 tomorrow", guaranteeBasis: "provider contract terms v12 §4" },
      },
      { now: NOW, display: DISPLAY },
    );
    expect(guaranteed.delivery.kind).toBe("GUARANTEE");
    expect(guaranteed.delivery.line).toContain("Guaranteed delivery: by 17:00 tomorrow");
    expect(guaranteed.delivery.line).toContain("provider-backed: provider contract terms v12 §4");
  });

  it("a guarantee WITHOUT provider backing is refused fail-closed (no fabricated guarantees)", () => {
    expect(() =>
      foldQuoteTerms(
        { ...baseQuote, delivery: { kind: "GUARANTEE", estimateLabel: "instant" } },
        { now: NOW, display: DISPLAY },
      ),
    ).toThrow(/GUARANTEE requires guaranteeBasis/);
  });
});

describe("quote disclosure fail-closed guards (net-new)", () => {
  it("malformed wire amounts are refused through the pin", () => {
    expect(() =>
      foldQuoteTerms(
        { ...baseQuote, sourceAmount: { currency: "EUR", minorUnits: "0123" } },
        { now: NOW, display: DISPLAY },
      ),
    ).toThrow(/sourceAmount/);
    expect(() =>
      foldQuoteTerms(
        { ...baseQuote, targetAmount: { currency: "gbp", minorUnits: "108742" } },
        { now: NOW, display: DISPLAY },
      ),
    ).toThrow(/targetAmount/);
    expect(() =>
      foldQuoteTerms(
        {
          ...baseQuote,
          feeLines: [
            {
              feeId: "transfer-fee",
              label: "Transfer fee",
              amount: { currency: "EUR", minorUnits: "3.91" },
              basis: "PROVIDER_DISCLOSED",
              includedInQuotedAmount: true,
            },
          ],
        },
        { now: NOW, display: DISPLAY },
      ),
    ).toThrow(/feeLines/);
  });

  it("empty quoteId/quoteVersion are refused", () => {
    expect(() =>
      foldQuoteTerms({ ...baseQuote, quoteId: "" }, { now: NOW, display: DISPLAY }),
    ).toThrow(/quoteId/);
    expect(() =>
      foldQuoteTerms({ ...baseQuote, quoteVersion: "" }, { now: NOW, display: DISPLAY }),
    ).toThrow(/quoteVersion/);
  });

  it("freshness flips exactly at the boundary (VALID before, EXPIRED at/after)", () => {
    const before = foldQuoteTerms(baseQuote, { now: "2026-10-11T12:29:59Z", display: DISPLAY });
    expect(before.freshness.status).toBe("VALID");
    expect(before.freshness.expiryAt).toBe("2026-10-11T12:30:00Z");
    const at = foldQuoteTerms(baseQuote, { now: "2026-10-11T12:30:00Z", display: DISPLAY });
    expect(at.freshness.status).toBe("EXPIRED");
  });
});
