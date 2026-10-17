/**
 * Quote-disclosure composition laws (P7-W2): the fold composes the pinned
 * quote-terms contract with the disclosure law (fees verbatim, rate
 * provenance, expiry, estimate-vs-guarantee, no fabricated guarantees).
 */

import { describe, expect, it } from "vitest";

import { foldDesktopQuoteTerms } from "../../src/host/payswap/index.js";
import type { DesktopQuoteDisclosureInput } from "../../src/host/payswap/index.js";
import type { PinnedQuoteTermsSource } from "../../src/host/payswap/index.js";

function source(overrides: Partial<PinnedQuoteTermsSource> = {}): PinnedQuoteTermsSource {
  return {
    quoteId: "quote-1",
    quoteVersion: "v3",
    sourceAmount: { currency: "USD", minorUnits: "100000" },
    targetAmount: { currency: "EUR", minorUnits: "91700" },
    feeLines: [
      {
        feeId: "fee-1",
        label: "Transfer fee",
        amount: { currency: "USD", minorUnits: "125" },
        basis: "FLAT",
        includedInQuotedAmount: false,
      },
      {
        feeId: "fee-2",
        label: "Provider-disclosed conversion cost",
        amount: { currency: "USD", minorUnits: "0" },
        basis: "PROVIDER_DISCLOSED",
        includedInQuotedAmount: true,
      },
    ],
    rate: { value: "0.917", provenance: "provider spot", asOf: "2026-10-17T11:00:00.000Z" },
    expiry: { at: "2026-10-17T13:00:00.000Z", onExpiry: "REVALIDATE_REQUIRED" },
    delivery: { kind: "ESTIMATE", estimateLabel: "1–2 business days" },
    conditions: {
      rateLocked: true,
      refreshAvailable: true,
      materialChangePolicy: "recipient or amount changes void the quote",
    },
    ...overrides,
  };
}

const DISPLAY = {
  currencyDigits: new Map([
    ["USD", 2],
    ["EUR", 2],
  ]),
};

function input(
  sourceOverrides: Partial<PinnedQuoteTermsSource> = {},
  now = "2026-10-17T12:00:00.000Z",
): DesktopQuoteDisclosureInput {
  return { source: source(sourceOverrides), now, display: DISPLAY };
}

describe("quote disclosure composition laws (P7-W2)", () => {
  it("renders the SIMPLE outcome line with exact amounts and the delivery line", () => {
    const view = foldDesktopQuoteTerms(input());
    expect(view.outcomeLine).toContain("Send 1,000.00 USD");
    expect(view.outcomeLine).toContain("receive 917.00 EUR");
    expect(view.outcomeLine).toContain("Estimated delivery: 1–2 business days");
    expect(view.outcomeLine).toContain("an estimate, not a guarantee");
  });

  it("every fee line is disclosed verbatim — never hidden, never summed by the desktop", () => {
    const view = foldDesktopQuoteTerms(input());
    expect(view.fees.lines.map((line) => line.feeId)).toEqual(["fee-1", "fee-2"]);
    expect(view.fees.lines[0]?.label).toBe("Transfer fee");
    expect(view.fees.lines[0]?.display).toBe("1.25 USD");
    expect(view.fees.lines[1]?.display).toBe("0.00 USD");
  });

  it("the fee total is the DECLARED total verbatim, or honestly NOT_DECLARED — the desktop never sums", () => {
    const undeclared = foldDesktopQuoteTerms(input());
    expect(undeclared.fees.total.kind).toBe("NOT_DECLARED");
    expect(undeclared.fees.total.kind === "NOT_DECLARED" && undeclared.fees.total.note).toContain(
      "never sums fees",
    );
    const declared = foldDesktopQuoteTerms(
      input({ declaredTotalFees: { currency: "USD", minorUnits: "125" } }),
    );
    expect(declared.fees.total.kind).toBe("DECLARED");
    expect(declared.fees.total.kind === "DECLARED" && declared.fees.total.display).toBe(
      "1.25 USD",
    );
  });

  it("estimate vs guarantee are never conflated; a GUARANTEE without provider backing refuses the fold", () => {
    const guaranteed = foldDesktopQuoteTerms(
      input({ delivery: { kind: "GUARANTEE", estimateLabel: "by Friday", guaranteeBasis: "provider SLA tier-1" } }),
    );
    expect(guaranteed.delivery.line).toContain("Guaranteed delivery: by Friday");
    expect(guaranteed.delivery.line).toContain("provider-backed: provider SLA tier-1");
    expect(() =>
      foldDesktopQuoteTerms(
        input({ delivery: { kind: "GUARANTEE", estimateLabel: "by Friday" } }),
      ),
    ).toThrow(/fabricated guarantee/);
  });

  it("freshness is computed against the EXPLICIT now: VALID before expiry, EXPIRED after — never ambient time", () => {
    const valid = foldDesktopQuoteTerms(input());
    expect(valid.freshness.status).toBe("VALID");
    expect(valid.freshness.status === "VALID" && valid.freshness.expiryAt).toBe(
      "2026-10-17T13:00:00.000Z",
    );
    const expired = foldDesktopQuoteTerms(input({}, "2026-10-17T14:00:00.000Z"));
    expect(expired.freshness.status).toBe("EXPIRED");
    expect(expired.freshness.status === "EXPIRED" && expired.freshness.headline).toContain(
      "expired",
    );
    expect(expired.freshness.status === "EXPIRED" && expired.freshness.headline).toContain(
      "revalidation",
    );
  });

  it("rate value, provenance and as-of time render verbatim", () => {
    const view = foldDesktopQuoteTerms(input());
    expect(view.rate.value).toBe("0.917");
    expect(view.rate.provenance).toBe("provider spot");
    expect(view.rate.asOf).toBe("2026-10-17T11:00:00.000Z");
  });

  it("conditions render the locking/refresh/material-change policy in people language", () => {
    const view = foldDesktopQuoteTerms(input());
    expect(view.conditions.join(" ")).toContain("rate is locked");
    expect(view.conditions.join(" ")).toContain("refresh this quote");
    expect(view.conditions.join(" ")).toContain("recipient or amount changes void the quote");
  });

  it("fail-closed on malformed wire amounts: a fabricated disclosure never renders", () => {
    expect(() =>
      foldDesktopQuoteTerms(input({ sourceAmount: { currency: "usd", minorUnits: "100" } })),
    ).toThrow(/currency/);
    expect(() =>
      foldDesktopQuoteTerms(input({ targetAmount: { currency: "EUR", minorUnits: "1.5" } })),
    ).toThrow(/minorUnits/);
    expect(() => foldDesktopQuoteTerms(input({}, ""))).toThrow(/ISO-8601/);
  });

  it("an unregistered currency renders with the honest labeled 2-digit fallback (never a silent default)", () => {
    const view = foldDesktopQuoteTerms(
      input({ targetAmount: { currency: "XXX", minorUnits: "5" } }),
    );
    expect(view.amounts.target).toContain("0.05 XXX");
    expect(view.amounts.target).toContain("unregistered code — 2 digits assumed");
  });
});
