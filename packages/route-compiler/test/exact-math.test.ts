import { describe, expect, it } from "vitest";
import {
  multiplyRationals,
  rationalTimesInteger,
  floorRationalToIntegerString,
  compareRationals,
  isRationalZero,
  valueThroughRate,
  validateExactRational,
  ZERO_RATIONAL,
  UNIT_RATIONAL,
} from "../src/exact-math.ts";
import { ValidationError } from "../src/errors.ts";

/**
 * Exact arithmetic (PORT of the old comparator's exact-math suite): no
 * float, ever; unreduced products; a single floor per boundary.
 */
describe("exact rational arithmetic (BigInt, canonical decimal strings)", () => {
  it("multiplication is exact and NOT reduced (byte-stable intermediate traces)", () => {
    const product = multiplyRationals(
      { numerator: "2", denominator: "3" },
      { numerator: "3", denominator: "4" },
    );
    expect(product).toEqual({ numerator: "6", denominator: "12" });
  });

  it("integer scaling is exact (denominator unchanged)", () => {
    expect(rationalTimesInteger({ numerator: "2", denominator: "3" }, "15")).toEqual({
      numerator: "30",
      denominator: "3",
    });
  });

  it("floor is deterministic (10/3 -> 3; the single rounding boundary)", () => {
    expect(floorRationalToIntegerString({ numerator: "10", denominator: "3" })).toBe("3");
    expect(floorRationalToIntegerString({ numerator: "9", denominator: "3" })).toBe("3");
    expect(floorRationalToIntegerString(ZERO_RATIONAL)).toBe("0");
  });

  it("valueThroughRate floors once at the boundary", () => {
    expect(valueThroughRate("1000000", { numerator: "1", denominator: "1000000" })).toBe("1");
    expect(valueThroughRate("1000000", { numerator: "1", denominator: "3" })).toBe("333333");
    expect(valueThroughRate("0", UNIT_RATIONAL)).toBe("0");
  });

  it("comparison is exact cross-multiplication (no float, no reduction)", () => {
    expect(compareRationals({ numerator: "1", denominator: "3" }, { numerator: "2", denominator: "3" })).toBe(-1);
    expect(compareRationals({ numerator: "2", denominator: "4" }, { numerator: "1", denominator: "2" })).toBe(0);
    expect(compareRationals({ numerator: "3", denominator: "4" }, { numerator: "2", denominator: "3" })).toBe(1);
  });

  it("zero detection is numerator-exact", () => {
    expect(isRationalZero(ZERO_RATIONAL)).toBe(true);
    expect(isRationalZero({ numerator: "0", denominator: "999" })).toBe(true);
    expect(isRationalZero(UNIT_RATIONAL)).toBe(false);
  });

  it("malformed rationals are rejected (negative, zero denominator, leading zeros, decimals)", () => {
    for (const bad of [
      { numerator: "-1", denominator: "1" },
      { numerator: "1", denominator: "0" },
      { numerator: "01", denominator: "1" },
      { numerator: "1.5", denominator: "1" },
      { numerator: "1", denominator: "01" },
    ]) {
      expect(() => validateExactRational(bad)).toThrowError(ValidationError);
    }
  });

  it("rational values survive BigInt-scale denominators exactly (no precision loss)", () => {
    const tiny = { numerator: "276", denominator: "1000000000000000000" };
    const value = valueThroughRate("10000000000000000", tiny);
    expect(value).toBe("2");
    const small = valueThroughRate("1000000000000000000", tiny);
    expect(small).toBe("276");
  });

  it("the identities are frozen singletons", () => {
    expect(Object.isFrozen(ZERO_RATIONAL)).toBe(true);
    expect(Object.isFrozen(UNIT_RATIONAL)).toBe(true);
    expect(ZERO_RATIONAL.numerator).toBe("0");
    expect(UNIT_RATIONAL.numerator).toBe("1");
  });

  it("negative amounts never reach the rate boundary (canonical strings only)", () => {
    expect(() => valueThroughRate("-5", UNIT_RATIONAL)).toThrowError(ValidationError);
    expect(() => rationalTimesInteger(UNIT_RATIONAL, "-5")).toThrowError(ValidationError);
  });

  it("BigInt sums of signed component strings are exact (the net-outcome basis)", () => {
    const net = BigInt("990000") + BigInt("-150") + BigInt("-60") + BigInt("-100000");
    expect(net.toString()).toBe("889790");
  });

  it("large-scale exactness: 2^64-scale arithmetic has no float degradation", () => {
    const big = { numerator: "18446744073709551616", denominator: "18446744073709551615" };
    expect(compareRationals(big, UNIT_RATIONAL)).toBe(1);
    expect(floorRationalToIntegerString(big)).toBe("1");
  });
});
