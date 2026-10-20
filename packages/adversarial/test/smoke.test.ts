/**
 * Package smoke (P6-W3, lane r4-w3; PORT of the old packages/security
 * smoke surface onto the consolidated package).
 */

import { describe, expect, it } from "vitest";
import {
  contentDigest,
  PACKAGE_NAME,
  IMMUNE_WIRE_VERSION,
  INTEGRATION_WIRE_VERSION,
} from "../src/index.ts";
import { PROVIDER_INTEL_SURFACE_NAME, PROVIDER_INTEL_WIRE_VERSION } from "../src/provider/index.ts";

describe("@payswap/adversarial smoke", () => {
  it("exports the package name and the wire stamps", () => {
    expect(PACKAGE_NAME).toBe("@payswap/adversarial");
    expect(IMMUNE_WIRE_VERSION).toBe("adversarial-immune/1");
    expect(PROVIDER_INTEL_WIRE_VERSION).toBe("adversarial-provider-intel/1");
    expect(INTEGRATION_WIRE_VERSION).toBe("adversarial-integration/1");
    expect(PROVIDER_INTEL_SURFACE_NAME).toBe("@payswap/adversarial/provider-intel");
  });

  it("the pinned content digest is deterministic (identical input → identical id)", () => {
    const a = contentDigest({ alpha: 1, beta: [2n, "x"] });
    const b = contentDigest({ beta: [2n, "x"], alpha: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("digest inputs are canonical (key order and bigint forms are stable)", () => {
    expect(contentDigest({ a: 1n, b: 2 })).toBe(contentDigest({ b: 2, a: 1n }));
    expect(contentDigest({ a: 1 })).not.toBe(contentDigest({ a: 2 }));
    expect(contentDigest([1, 2])).not.toBe(contentDigest([2, 1]));
  });
});
