import { describe, expect, it } from "vitest";
import { canonicalString, contentDigest } from "../src/index.ts";

/**
 * The digest substrate (the LAW-8 byte-determinism foundation): sorted
 * canonical keys, bigint-safe serialization, stable FNV-1a 64 digests.
 */
describe("the digest substrate", () => {
  it("canonical serialization sorts keys recursively (insertion order is irrelevant)", () => {
    expect(canonicalString({ b: 1, a: 2 })).toBe(canonicalString({ a: 2, b: 1 }));
    expect(canonicalString({ z: { y: 1, x: 2 }, a: [3, { d: 1, c: 2 }] })).toBe(
      canonicalString({ a: [3, { c: 2, d: 1 }], z: { x: 2, y: 1 } }),
    );
  });

  it("the canonical golden forms (byte-stable vocabulary)", () => {
    expect(canonicalString(null)).toBe("null");
    expect(canonicalString(true)).toBe("true");
    expect(canonicalString(false)).toBe("false");
    expect(canonicalString("x")).toBe('"x"');
    expect(canonicalString(2)).toBe("n:2");
    expect(canonicalString(2n)).toBe("b:2");
    expect(canonicalString([])).toBe("[]");
    expect(canonicalString({})).toBe("{}");
    expect(canonicalString({ b: 2n, a: "x" })).toBe('{"a":"x","b":b:2}');
    expect(canonicalString([1, "two", null, 3n])).toBe('[n:1,"two",null,b:3]');
  });

  it("bigint and number are NEVER conflated (b: vs n: prefixes)", () => {
    expect(canonicalString(2n)).not.toBe(canonicalString(2));
    expect(contentDigest({ v: 2n })).not.toBe(contentDigest({ v: 2 }));
  });

  it("unsupported value types fail closed", () => {
    expect(() => canonicalString(undefined)).toThrow(/unsupported value/);
    expect(() => canonicalString(() => 1)).toThrow(/unsupported value/);
    expect(() => canonicalString(Symbol("x"))).toThrow(/unsupported value/);
  });

  it("digests are stable, distinct per content, and well-formed", () => {
    const a = contentDigest({ a: 1 });
    expect(a).toBe(contentDigest({ a: 1 }));
    expect(a).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(contentDigest({ a: 1 })).not.toBe(contentDigest({ a: 2 }));
    expect(contentDigest({ a: 1 })).not.toBe(contentDigest({ b: 1 }));
    // Determinism across structurally identical nested values.
    expect(contentDigest([{ x: [1n] }])).toBe(contentDigest([{ x: [1n] }]));
  });

  it("the digest is byte-sensitive (one character changes it)", () => {
    expect(contentDigest("a")).not.toBe(contentDigest("b"));
    expect(contentDigest({ long: "payload-1" })).not.toBe(
      contentDigest({ long: "payload-2" }),
    );
  });
});
