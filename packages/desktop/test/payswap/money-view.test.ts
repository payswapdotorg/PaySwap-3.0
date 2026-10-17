/**
 * Exact money display laws (P7-W2): integer minor units only, explicit
 * locale inputs, honest labeled fallback — a binary float never touches
 * the amount.
 */

import { describe, expect, it } from "vitest";

import {
  formatDesktopMoneyAmount,
  resolveDesktopMinorUnitDigits,
} from "../../src/host/payswap/index.js";

const USD_EUR = {
  currencyDigits: new Map([
    ["USD", 2],
    ["EUR", 2],
  ]),
};

describe("exact money display laws (P7-W2)", () => {
  it("formats integer minor units with integer arithmetic only (bigint base division)", () => {
    expect(formatDesktopMoneyAmount({ currency: "USD", minorUnits: "100000" }, USD_EUR)).toBe(
      "1,000.00 USD",
    );
    expect(formatDesktopMoneyAmount({ currency: "EUR", minorUnits: "91700" }, USD_EUR)).toBe(
      "917.00 EUR",
    );
    expect(
      formatDesktopMoneyAmount({ currency: "JPY", minorUnits: "5000" }, {
        currencyDigits: new Map([["JPY", 0]]),
      }),
    ).toBe("5,000 JPY");
    expect(
      formatDesktopMoneyAmount({ currency: "USD", minorUnits: "123456789012345678" }, USD_EUR),
    ).toBe("1,234,567,890,123,456.78 USD");
  });

  it("zero and single-digit amounts render exactly (zero-fee corridors disclosed as zero)", () => {
    expect(formatDesktopMoneyAmount({ currency: "USD", minorUnits: "0" }, USD_EUR)).toBe(
      "0.00 USD",
    );
    expect(formatDesktopMoneyAmount({ currency: "USD", minorUnits: "5" }, USD_EUR)).toBe(
      "0.05 USD",
    );
  });

  it("locale separators are EXPLICIT inputs (no ambient Intl)", () => {
    expect(
      formatDesktopMoneyAmount({ currency: "EUR", minorUnits: "123456" }, {
        currencyDigits: new Map([["EUR", 2]]),
        locale: { thousandsSeparator: ".", decimalSeparator: ",", groupSize: 3 },
      }),
    ).toBe("1.234,56 EUR");
  });

  it("an unregistered code assumes 2 digits AND SAYS SO (honest labeled fallback)", () => {
    expect(formatDesktopMoneyAmount({ currency: "XXX", minorUnits: "5" })).toBe(
      "0.05 XXX (unregistered code — 2 digits assumed)",
    );
    const resolved = resolveDesktopMinorUnitDigits("XXX");
    expect(resolved.kind).toBe("fallback-assumed-2");
    expect(
      resolveDesktopMinorUnitDigits("jpy", { currencyDigits: new Map([["JPY", 0]]) }),
    ).toEqual({ kind: "input-registry", code: "JPY", digits: 0 });
  });

  it("fail-closed on malformed wire amounts (never a silently rounded display)", () => {
    expect(() => formatDesktopMoneyAmount({ currency: "usd", minorUnits: "100" })).toThrow(
      /currency/,
    );
    expect(() => formatDesktopMoneyAmount({ currency: "USD", minorUnits: "1.5" })).toThrow(
      /minorUnits/,
    );
    expect(() => formatDesktopMoneyAmount({ currency: "USD", minorUnits: "-5" })).toThrow(
      /minorUnits/,
    );
    expect(() => formatDesktopMoneyAmount({ currency: "USD", minorUnits: "01" })).toThrow(
      /minorUnits/,
    );
  });

  it("registry digits outside [0, 18] refuse (a nonsense currency scale never renders)", () => {
    expect(() =>
      resolveDesktopMinorUnitDigits("USD", { currencyDigits: new Map([["USD", 19]]) }),
    ).toThrow(/\[0, 18\]/);
  });
});
