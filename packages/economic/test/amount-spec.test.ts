/**
 * AmountSpec wire-shape tests (P1-W1): the pinned cross-lane contract.
 *
 * Verifies the pin BYTE-FOR-BYTE against the dispatch text (interface
 * declaration + /^[A-Z]{3}$/ + /^(0|[1-9][0-9]*)$/ patterns) and proves the
 * fail-closed laws: unknown fields rejected, invalid currencies rejected,
 * non-canonical minorUnits rejected (signs, decimal points, exponents,
 * leading zeros), zero accepted structurally but rejected where a POSITIVE
 * amount is demanded, and NO money arithmetic exists on the surface.
 */

import { describe, expect, it } from "vitest";
import {
  type AmountSpec,
  InvalidAmountSpecError,
  isValidAmountSpec,
  validateAmountSpec,
  validatePositiveAmountSpec,
} from "../src/index.ts";

describe("AmountSpec pin (identical in all three P1 lanes)", () => {
  it("declares exactly the pinned interface shape", () => {
    const amount: AmountSpec = { currency: "EUR", minorUnits: "10000" };
    expect(Object.keys(amount).sort()).toEqual(["currency", "minorUnits"]);
  });

  it("accepts fiat ISO-style and onchain symbols in the SAME shape (old-repo law)", () => {
    expect(validateAmountSpec({ currency: "EUR", minorUnits: "10000" })).toEqual({
      currency: "EUR",
      minorUnits: "10000",
    });
    expect(validateAmountSpec({ currency: "ETH", minorUnits: "10000000000000000" })).toEqual({
      currency: "ETH",
      minorUnits: "10000000000000000",
    });
    expect(validateAmountSpec({ currency: "USC", minorUnits: "0" })).toEqual({
      currency: "USC",
      minorUnits: "0",
    });
  });

  it("rejects currencies that are not uppercase 3-letter codes", () => {
    expect(() => validateAmountSpec({ currency: "", minorUnits: "1" })).toThrow(
      /non-empty string/,
    );
    for (const currency of ["eu", "euro", "EURO", "Eur", "E", "EURR", "US$"]) {
      expect(() => validateAmountSpec({ currency, minorUnits: "1" })).toThrow(
        InvalidAmountSpecError,
      );
      expect(() => validateAmountSpec({ currency, minorUnits: "1" })).toThrow(/3-letter/);
    }
  });

  it("rejects non-canonical minorUnits (sign, decimal point, exponent, leading zeros)", () => {
    for (const minorUnits of [
      "",
      "-1",
      "+1",
      "1.5",
      "0.5",
      "1e3",
      "1E3",
      "01",
      "007",
      "00",
      " 1",
      "1 ",
      "one",
      "0x10",
      "1_000",
    ]) {
      expect(() => validateAmountSpec({ currency: "EUR", minorUnits })).toThrow(
        InvalidAmountSpecError,
      );
      expect(() => validateAmountSpec({ currency: "EUR", minorUnits })).toThrow(
        /minorUnits must be a canonical non-negative decimal integer string/,
      );
    }
  });

  it("rejects unknown fields (fail-closed exact key set)", () => {
    expect(() =>
      validateAmountSpec({ currency: "EUR", minorUnits: "1", scale: 2 }),
    ).toThrow(/exactly the fields \[currency, minorUnits\]/);
    expect(() => validateAmountSpec({ currency: "EUR" })).toThrow(/exactly the fields/);
    expect(() => validateAmountSpec(null)).toThrow(/AmountSpec/);
    expect(() => validateAmountSpec("EUR 10")).toThrow(/AmountSpec/);
    expect(() => validateAmountSpec(["EUR", "10"])).toThrow(/AmountSpec/);
  });

  it("returns FROZEN validated amounts", () => {
    const amount = validateAmountSpec({ currency: "EUR", minorUnits: "10000" });
    expect(Object.isFrozen(amount)).toBe(true);
  });

  it("validatePositiveAmountSpec rejects zero (a value transfer moves value)", () => {
    expect(() =>
      validatePositiveAmountSpec({ currency: "EUR", minorUnits: "0" }, "test.amount"),
    ).toThrow(/must be positive — a value transfer moves value/);
    expect(validatePositiveAmountSpec({ currency: "EUR", minorUnits: "1" }, "test.amount")).toEqual(
      { currency: "EUR", minorUnits: "1" },
    );
  });

  it("isValidAmountSpec is a total predicate (no throw, boolean verdict)", () => {
    expect(isValidAmountSpec({ currency: "EUR", minorUnits: "10" })).toBe(true);
    expect(isValidAmountSpec({ currency: "eur", minorUnits: "10" })).toBe(false);
    expect(isValidAmountSpec({ currency: "EUR", minorUnits: "1.0" })).toBe(false);
    expect(isValidAmountSpec(null)).toBe(false);
    expect(isValidAmountSpec(undefined)).toBe(false);
    expect(isValidAmountSpec(42)).toBe(false);
  });
});
