import { describe, expect, it } from "vitest";
import {
  addCanonicalMinorUnits,
  amountWithinBound,
  compareCanonicalMinorUnits,
} from "../src/minor-units.ts";
import { InvalidAmountError, validateAmountSpec } from "../src/amount-spec.ts";

/**
 * Net-new (P1-W3): determinism properties of the internal canonical-integer
 * helpers (src/minor-units.ts) and the pinned AmountSpec wire format.
 *
 * These helpers are NOT part of the public API (single-owner law, INV-01 /
 * TB-7): they are tested directly here and behaviorally through attenuation,
 * grants and authorization tests.
 */

/** Deterministic pseudo-random string-of-digits generator (no Math.random). */
function digits(seed: number, length: number): string {
  let value = "";
  let state = seed * 2654435761;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    value += String(state % 10);
  }
  return value;
}

function canonicalInteger(seed: number, length: number): string {
  let value = digits(seed, length);
  if (value.startsWith("0")) {
    value = `1${value.slice(1)}`; // keep canonical: no leading zeros (except "0")
  }
  return value === "" ? "0" : value;
}

describe("pinned AmountSpec wire format (TB-7)", () => {
  it("accepts canonical fiat-style and onchain-style 3-letter currencies", () => {
    for (const currency of ["EUR", "USD", "BTC", "ETH", "SOL"]) {
      expect(() => validateAmountSpec({ currency, minorUnits: "0" })).not.toThrow();
    }
  });

  it("rejects every non-canonical shape, fail closed", () => {
    const badCurrencies = ["eur", "EU", "EURO", "E1R", "", "USDD", "€"];
    for (const currency of badCurrencies) {
      expect(() => validateAmountSpec({ currency, minorUnits: "1" })).toThrow(InvalidAmountError);
    }
    const badMinorUnits = [
      "", "-1", "+1", "1.5", "1e3", "0x10", "01", "00", " 1", "1 ", "١٢٣", "1_000",
    ];
    for (const minorUnits of badMinorUnits) {
      expect(() => validateAmountSpec({ currency: "EUR", minorUnits })).toThrow(InvalidAmountError);
    }
  });

  it("accepts exactly the canonical non-negative integers (property sample)", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const minorUnits = canonicalInteger(seed, 1 + (seed % 40));
      expect(() => validateAmountSpec({ currency: "EUR", minorUnits })).not.toThrow();
    }
    expect(() => validateAmountSpec({ currency: "EUR", minorUnits: "0" })).not.toThrow();
  });
});

describe("compareCanonicalMinorUnits — exact ordering (determinism properties)", () => {
  it("orders identical strings equal", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const value = canonicalInteger(seed, 1 + (seed % 30));
      expect(compareCanonicalMinorUnits(value, value)).toBe(0);
    }
    expect(compareCanonicalMinorUnits("0", "0")).toBe(0);
  });

  it("length-then-lexicographic equals integer ordering, including > Number.MAX_SAFE_INTEGER", () => {
    expect(compareCanonicalMinorUnits("0", "1")).toBe(-1);
    expect(compareCanonicalMinorUnits("9", "10")).toBe(-1);
    expect(compareCanonicalMinorUnits("10", "9")).toBe(1);
    expect(compareCanonicalMinorUnits("999", "1000")).toBe(-1);
    // float-unsafe territory: 2^53 comparisons
    expect(compareCanonicalMinorUnits("9007199254740992", "9007199254740993")).toBe(-1);
    expect(compareCanonicalMinorUnits("9007199254740993", "9007199254740992")).toBe(1);
    expect(compareCanonicalMinorUnits("10000000000000000000", "9999999999999999999")).toBe(1);
  });

  it("matches BigInt ordering on deterministic samples (property)", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const a = canonicalInteger(seed, 1 + (seed % 25));
      const b = canonicalInteger(seed + 1000, 1 + ((seed * 7) % 25));
      const expected = a === b ? 0 : BigInt(a) < BigInt(b) ? -1 : 1;
      expect(compareCanonicalMinorUnits(a, b)).toBe(expected);
      expect(compareCanonicalMinorUnits(b, a)).toBe(expected === 0 ? 0 : -expected);
    }
  });

  it("is deterministic across repetitions (same inputs, same output)", () => {
    for (let repetition = 0; repetition < 5; repetition += 1) {
      expect(compareCanonicalMinorUnits("123456789012345678901234567890", "1")).toBe(1);
      expect(compareCanonicalMinorUnits("1", "123456789012345678901234567890")).toBe(-1);
    }
  });

  it("fails closed on non-canonical input (internal invariant guard)", () => {
    expect(() => compareCanonicalMinorUnits("01", "1")).toThrow(/canonical/);
    expect(() => compareCanonicalMinorUnits("1", "")).toThrow(/canonical/);
    expect(() => compareCanonicalMinorUnits("-1", "1")).toThrow(/canonical/);
  });
});

describe("addCanonicalMinorUnits — exact summation (determinism properties)", () => {
  it("sums exactly, including float-unsafe magnitudes", () => {
    expect(addCanonicalMinorUnits("0", "0")).toBe("0");
    expect(addCanonicalMinorUnits("0", "42")).toBe("42");
    expect(addCanonicalMinorUnits("1", "999999999999999999")).toBe("1000000000000000000");
    // 2^53 + 1 + 2 = 2^53 + 3 — impossible with floats
    expect(addCanonicalMinorUnits("9007199254740993", "2")).toBe("9007199254740995");
    expect(addCanonicalMinorUnits("999999999999999999999999", "1")).toBe("1000000000000000000000000");
  });

  it("matches BigInt addition on deterministic samples (property)", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const a = canonicalInteger(seed, 1 + (seed % 25));
      const b = canonicalInteger(seed + 500, 1 + ((seed * 3) % 25));
      expect(addCanonicalMinorUnits(a, b)).toBe((BigInt(a) + BigInt(b)).toString(10));
    }
  });

  it("is commutative and deterministic on repetitions (property)", () => {
    const a = canonicalInteger(7, 30);
    const b = canonicalInteger(11, 30);
    for (let repetition = 0; repetition < 5; repetition += 1) {
      expect(addCanonicalMinorUnits(a, b)).toBe(addCanonicalMinorUnits(b, a));
    }
  });

  it("sum never exceeds the bound when parts do not (monotonicity sample)", () => {
    const bound = "1000000";
    expect(amountWithinBound({ currency: "EUR", minorUnits: "1000000" }, { currency: "EUR", minorUnits: bound })).toBe(true);
    expect(amountWithinBound({ currency: "EUR", minorUnits: "1000001" }, { currency: "EUR", minorUnits: bound })).toBe(false);
  });

  it("amountWithinBound fails closed on currency mismatch and malformed wire data", () => {
    expect(() =>
      amountWithinBound({ currency: "EUR", minorUnits: "1" }, { currency: "USD", minorUnits: "1" }),
    ).toThrow(/currency mismatch/);
    expect(() =>
      amountWithinBound({ currency: "EUR", minorUnits: "01" } as never, { currency: "EUR", minorUnits: "1" }),
    ).toThrow(InvalidAmountError);
  });
});
