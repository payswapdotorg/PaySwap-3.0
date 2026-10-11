/**
 * Money-view tests (P2-W3): 6 tests PORTED from the old repo's
 * surface-contract.test.ts "exact integer money display (INV-F01)" block,
 * adapted to the new API (currency registry as EXPLICIT input instead of
 * the old @payswap/protocol runtime import), plus net-new exactness,
 * locale-input, determinism and wire-law tests.
 */

import { describe, expect, it } from "vitest";

import {
  type MoneyDisplayInput,
  formatMinorUnits,
  formatMoneyAmount,
  minorUnitsSortKey,
  resolveMinorUnitDigits,
} from "../src/index.ts";

const DISPLAY: MoneyDisplayInput = {
  currencyDigits: new Map([
    ["EUR", 2],
    ["USD", 2],
    ["JPY", 0],
    ["KWD", 3],
  ]),
};

describe("exact integer money display (INV-02 at the display boundary)", () => {
  it("formats registered two-digit currencies exactly", () => {
    expect(formatMinorUnits(123456n, "EUR", DISPLAY)).toBe("1,234.56 EUR");
    expect(formatMinorUnits(0n, "usd", DISPLAY)).toBe("0.00 USD");
    expect(formatMinorUnits(5n, "USD", DISPLAY)).toBe("0.05 USD");
    expect(formatMinorUnits(100n, "USD", DISPLAY)).toBe("1.00 USD");
  });

  it("formats integer strings (the wire form) without floats", () => {
    expect(formatMinorUnits("999999999999", "USD", DISPLAY)).toBe("9,999,999,999.99 USD");
  });

  it("handles negatives with a true minus sign", () => {
    expect(formatMinorUnits(-420n, "USD", DISPLAY)).toBe("−4.20 USD");
  });

  it("labels the honest fallback for unregistered codes", () => {
    const out = formatMinorUnits(1n, "XYZ");
    expect(out).toContain("unregistered code");
    expect(resolveMinorUnitDigits("XYZ").kind).toBe("fallback-assumed-2");
    expect(resolveMinorUnitDigits("USD", DISPLAY).kind).toBe("input-registry");
  });

  it("rejects non-integer and malformed inputs (never silently rounds)", () => {
    expect(() => formatMinorUnits("12.5", "USD", DISPLAY)).toThrow();
    expect(() => formatMinorUnits("abc", "USD", DISPLAY)).toThrow();
  });

  it("produces a stable machine sort key", () => {
    expect(minorUnitsSortKey(5n, "usd") < minorUnitsSortKey(50n, "USD")).toBe(true);
  });
});

describe("money-view net-new (explicit inputs, exactness, determinism)", () => {
  it("zero-decimal currencies render with no decimal point (JPY)", () => {
    expect(formatMinorUnits(1234567n, "JPY", DISPLAY)).toBe("1,234,567 JPY");
  });

  it("three-decimal currencies render exactly (KWD)", () => {
    expect(formatMinorUnits(1234567n, "KWD", DISPLAY)).toBe("1,234.567 KWD");
  });

  it("locale data is an explicit input: European separators render exactly", () => {
    const european: MoneyDisplayInput = {
      ...DISPLAY,
      locale: { thousandsSeparator: ".", decimalSeparator: "," },
    };
    expect(formatMinorUnits(123456n, "EUR", european)).toBe("1.234,56 EUR");
  });

  it("an explicit group size is honored (4-digit grouping)", () => {
    const four: MoneyDisplayInput = {
      ...DISPLAY,
      locale: { groupSize: 4 },
    };
    expect(formatMinorUnits(12345678901n, "USD", four)).toBe("1,2345,6789.01 USD");
  });

  it("formatMoneyAmount validates the wire pin first (fail-closed on malformed AmountSpec)", () => {
    expect(formatMoneyAmount({ currency: "EUR", minorUnits: "123456" }, DISPLAY)).toBe("1,234.56 EUR");
    expect(() => formatMoneyAmount({ currency: "eur", minorUnits: "123456" }, DISPLAY)).toThrow(/currency/);
    expect(() => formatMoneyAmount({ currency: "EUR", minorUnits: "0123456" }, DISPLAY)).toThrow(/minorUnits/);
    expect(() => formatMoneyAmount({ currency: "EUR", minorUnits: "12.5" }, DISPLAY)).toThrow(/minorUnits/);
    expect(() => formatMoneyAmount({ currency: "EUR", minorUnits: "-5" }, DISPLAY)).toThrow(/minorUnits/);
  });

  it("unregistered-code display stays honest when a registry input exists but omits the code", () => {
    const out = formatMinorUnits(250n, "BHD", DISPLAY); // BHD not in the map above
    expect(out).toBe("2.50 BHD (unregistered code — 2 digits assumed)");
  });

  it("deterministic: same inputs produce identical outputs across calls (no ambient state)", () => {
    const first = formatMinorUnits(987654321n, "USD", DISPLAY);
    const second = formatMinorUnits(987654321n, "USD", DISPLAY);
    expect(first).toBe(second);
    expect(first).toBe("9,876,543.21 USD");
  });

  it("digits outside [0, 18] are refused (fail-closed input registry)", () => {
    expect(() =>
      resolveMinorUnitDigits("USD", { currencyDigits: new Map([["USD", -1]]) }),
    ).toThrow(/0, 18/);
    expect(() =>
      resolveMinorUnitDigits("USD", { currencyDigits: new Map([["USD", 2.5]]) }),
    ).toThrow(/0, 18/);
  });
});
