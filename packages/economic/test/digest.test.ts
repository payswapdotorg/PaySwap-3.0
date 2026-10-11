/**
 * Deterministic digest tests (P1-W1): canonical JSON serialization and the
 * FNV-1a 64 content digest. Pure functions — same input -> same output,
 * byte-identical serialization for structurally equal inputs regardless of
 * key insertion order (the determinism law's foundation).
 */

import { describe, expect, it } from "vitest";
import { canonicalJsonStringify, contentDigest, fnv1a64Hex, sortedStrings } from "../src/index.ts";

describe("canonicalJsonStringify (stable key ordering)", () => {
  it("sorts object keys recursively, top level and nested", () => {
    const a = { z: 1, a: { y: [1, 2], b: true, x: null } };
    const b = { a: { b: true, x: null, y: [1, 2] }, z: 1 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(canonicalJsonStringify(a)).toBe('{"a":{"b":true,"x":null,"y":[1,2]},"z":1}');
  });

  it("preserves array order (arrays are sequences, not sets)", () => {
    expect(canonicalJsonStringify([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJsonStringify({ list: ["b", "a"] })).toBe('{"list":["b","a"]}');
  });

  it("normalizes -0 and rejects non-finite numbers and non-JSON values", () => {
    expect(canonicalJsonStringify({ n: -0 })).toBe('{"n":0}');
    expect(() => canonicalJsonStringify({ n: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJsonStringify({ n: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => canonicalJsonStringify({ f: () => 1 })).toThrow(/not JSON-shaped/);
    expect(() => canonicalJsonStringify({ s: Symbol("x") })).toThrow(/not JSON-shaped/);
    expect(() => canonicalJsonStringify(undefined)).toThrow(/not JSON-shaped/);
  });

  it("round-trips JSON text through parse + canonicalize deterministically", () => {
    const text = '{"b":1,"a":{"c":"x"}}';
    expect(canonicalJsonStringify(JSON.parse(text))).toBe('{"a":{"c":"x"},"b":1}');
  });
});

describe("fnv1a64Hex (standard FNV-1a 64, deterministic)", () => {
  it("matches the published FNV-1a 64 test vectors", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325"); // offset basis
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });

  it("is pure: same input -> same digest, different inputs -> different digests", () => {
    expect(fnv1a64Hex("payswap")).toBe(fnv1a64Hex("payswap"));
    expect(fnv1a64Hex("payswap")).not.toBe(fnv1a64Hex("payswaq"));
    expect(fnv1a64Hex("ETH:1")).not.toBe(fnv1a64Hex("ETH:2"));
  });
});

describe("contentDigest + sortedStrings", () => {
  it("digests canonical content: equal structures -> equal digests, order-independent", () => {
    expect(contentDigest({ b: 2, a: 1 })).toBe(contentDigest({ a: 1, b: 2 }));
    expect(contentDigest({ a: 1, b: 2 })).not.toBe(contentDigest({ a: 1, b: 3 }));
  });

  it("sortedStrings is a deterministic lexical sort (ported canonical-ordering helper)", () => {
    expect(sortedStrings(["c", "a", "b"])).toEqual(["a", "b", "c"]);
    expect(sortedStrings(["c", "a", "b"])).toEqual(sortedStrings(["b", "c", "a"]));
  });
});
