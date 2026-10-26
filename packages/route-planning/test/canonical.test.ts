import { describe, expect, it } from "vitest";
import {
  canonicalJsonStringify,
  contentDigest,
  deepFreeze,
  fnv1a64,
} from "../src/canonical.ts";
import {
  canonicalJsonStringify as realCanonicalJsonStringify,
  contentDigest as realContentDigest,
  deepFreeze as realDeepFreeze,
  fnv1a64 as realFnv1a64,
} from "../../route-compiler/src/canonical.ts";

/**
 * BYTE-IDENTICAL fidelity of the local canonical backbone against the
 * REAL route-compiler canonical module (ADR-0009 D4: the one digest
 * flavor — the value-form canonicalization, FNV-1a 64, namespaced
 * `fnv1a64:<16hex>`). The real module is imported from the TEST tier
 * (the established cross-package relative source-import pattern).
 */

const SAMPLES: readonly unknown[] = [
  null,
  true,
  false,
  0,
  1,
  -1,
  42,
  0.5,
  -0.25,
  1e21,
  "",
  "plain",
  "with \"quotes\" and \\backslash",
  "ünïcödé ✓",
  [],
  [1, 2, 3],
  ["a", "b"],
  [null, true, 1, "x", [2, [3, { deep: true }]]],
  {},
  { b: 1, a: 2 },
  { z: { y: { x: 1 } } },
  { a: [1, { b: "c" }] },
  { list: [3, 1, 2], other: { nested: [true, null] } },
  10n,
  -999999999999999999999999n,
  { bigint: 123n, number: 456, string: "789" },
  { alpha: 1n, beta: { gamma: [10n, 20, "thirty", false, null] } },
];

describe("canonicalJsonStringify — byte-identical to the real route-compiler flavor", () => {
  it("every sample produces the IDENTICAL text", () => {
    for (const sample of SAMPLES) {
      expect(canonicalJsonStringify(sample)).toBe(realCanonicalJsonStringify(sample));
    }
  });

  it("keys are recursively sorted (b before a at every depth)", () => {
    const value = { z: 1, a: { d: 2, b: 3 }, m: [{ q: 1, c: 2 }] };
    expect(canonicalJsonStringify(value)).toBe(realCanonicalJsonStringify(value));
    expect(canonicalJsonStringify({ b: 1, a: 2 })).toBe('{"a":n:2,"b":n:1}');
    expect(canonicalJsonStringify({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":n:2,"y":n:1}}');
  });

  it("bigint renders b:<decimal> and number renders n:<decimal>", () => {
    expect(canonicalJsonStringify(10n)).toBe("b:10");
    expect(canonicalJsonStringify(-3n)).toBe("b:-3");
    expect(canonicalJsonStringify(0.5)).toBe("n:0.5");
    expect(canonicalJsonStringify(-0.25)).toBe("n:-0.25");
    expect(canonicalJsonStringify({ big: 1n, num: 2 })).toBe('{"big":b:1,"num":n:2}');
    for (const sample of [1n, -1n, 9999999999999999999999n]) {
      expect(canonicalJsonStringify(sample)).toBe(realCanonicalJsonStringify(sample));
    }
    for (const sample of [0, 7, -7, 3.125, 2.5e-7]) {
      expect(canonicalJsonStringify(sample)).toBe(realCanonicalJsonStringify(sample));
    }
  });

  it("rejections are identical: functions, symbols, undefined, non-finite numbers", () => {
    expect(() => canonicalJsonStringify(() => 1)).toThrow();
    expect(() => realCanonicalJsonStringify(() => 1)).toThrow();
    expect(() => canonicalJsonStringify(Symbol("x"))).toThrow();
    expect(() => realCanonicalJsonStringify(Symbol("x"))).toThrow();
    expect(() => canonicalJsonStringify(undefined)).toThrow();
    expect(() => realCanonicalJsonStringify(undefined)).toThrow();
    expect(() => canonicalJsonStringify(Number.NaN)).toThrow();
    expect(() => realCanonicalJsonStringify(Number.NaN)).toThrow();
    expect(() => canonicalJsonStringify(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => realCanonicalJsonStringify(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => canonicalJsonStringify({ fn: () => 1 })).toThrow();
    expect(() => realCanonicalJsonStringify({ fn: () => 1 })).toThrow();
  });
});

describe("fnv1a64 + contentDigest — byte-identical digests", () => {
  it("identical digests over the same texts", () => {
    for (const text of ["", "a", "hello world", "ünïcödé", JSON.stringify({ a: 1, b: [2, 3] })]) {
      expect(fnv1a64(text)).toBe(realFnv1a64(text));
    }
  });

  it("the digest is 16 lowercase hex characters", () => {
    expect(fnv1a64("route-planning")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("contentDigest namespaces fnv1a64:<16hex> identically over every sample", () => {
    for (const sample of SAMPLES) {
      expect(contentDigest(sample)).toBe(realContentDigest(sample));
      expect(contentDigest(sample)).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    }
  });

  it("digests are tamper-evident: a one-field change changes the digest", () => {
    const left = contentDigest({ a: 1, b: 2 });
    const right = contentDigest({ a: 1, b: 3 });
    expect(left).not.toBe(right);
  });

  it("key order never matters (the value-form law — never a JSON round-trip)", () => {
    expect(contentDigest({ a: 1, b: 2 })).toBe(contentDigest({ b: 2, a: 1 }));
    expect(contentDigest({ x: { y: 1, z: 2 }, w: 3 })).toBe(contentDigest({ w: 3, x: { z: 2, y: 1 } }));
  });
});

describe("deepFreeze — identical immutability behavior", () => {
  it("freezes arrays and objects in depth; primitives pass through", () => {
    const value = { a: [1, { b: "c" }], d: { e: 2n } };
    const frozen = deepFreeze(value);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.a[1])).toBe(true);
    expect(Object.isFrozen(frozen.d)).toBe(true);
    expect(Object.isFrozen(realDeepFreeze({ p: [1] }).p)).toBe(true);
    expect(deepFreeze(1)).toBe(1);
    expect(deepFreeze("x")).toBe("x");
    expect(deepFreeze(null)).toBe(null);
  });

  it("freezing is idempotent (already-frozen values pass through)", () => {
    const once = deepFreeze({ a: [1] });
    const twice = deepFreeze(once);
    expect(twice).toBe(once);
    expect(Object.isFrozen(twice.a)).toBe(true);
  });
});
