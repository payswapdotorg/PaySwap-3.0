import { describe, expect, it } from "vitest";
import {
  canonicalString,
  contentDigest,
  deepFreeze,
} from "../src/digest.js";

describe("digest substrate (the house pattern, reauthored locally)", () => {
  it("canonical serialization sorts keys deterministically", () => {
    expect(canonicalString({ b: 1, a: 2 })).toBe(canonicalString({ a: 2, b: 1 }));
    expect(canonicalString({ x: { z: 1, y: 2 } })).toBe(
      canonicalString({ x: { y: 2, z: 1 } }),
    );
  });

  it("canonical serialization is bigint-safe and typed", () => {
    expect(canonicalString(1n)).toBe("b:1");
    expect(canonicalString(1)).toBe("n:1");
    expect(canonicalString(null)).toBe("null");
    expect(canonicalString([1, "a"])).toBe('[n:1,"a"]');
    expect(() => canonicalString(() => 0)).toThrow(/unsupported value/);
  });

  it("contentDigest is deterministic and prefixed", () => {
    const digest = contentDigest({ a: [1, 2, 3], b: "x" });
    expect(digest).toBe(contentDigest({ b: "x", a: [1, 2, 3] }));
    expect(digest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("contentDigest distinguishes structural changes", () => {
    expect(contentDigest({ a: 1 })).not.toBe(contentDigest({ a: 2 }));
    expect(contentDigest({ a: 1 })).not.toBe(contentDigest({ a: 1, c: 2 }));
    expect(contentDigest({ a: [1] })).not.toBe(contentDigest({ a: [2] }));
    expect(() => contentDigest({ a: undefined })).toThrow(/unsupported value/);
  });

  it("deepFreeze freezes nested structures", () => {
    const frozen = deepFreeze({ inner: { list: [1, 2] } });
    expect(() => {
      (frozen.inner as { list: number[] }).list.push(3);
    }).toThrow();
  });
});
