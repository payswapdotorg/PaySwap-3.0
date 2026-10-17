/**
 * Version and provenance tests (P3-W3).
 */

import { describe, expect, it } from "vitest";

import {
  PACKAGE_NAME,
  SUBSTRATE_PIN,
  ZCODE_BRIDGE_VERSION,
  zcodeBridgeProvenance,
} from "../src/index.ts";

describe("bridge versioning and provenance", () => {
  it("pins the package identity and contract version", () => {
    expect(PACKAGE_NAME).toBe("@payswap/zcode-bridge");
    expect(ZCODE_BRIDGE_VERSION).toBe("1.0.0");
  });

  it("pins the substrate lineage commit (P0-W3 verified pin)", () => {
    expect(SUBSTRATE_PIN).toBe("29628c9acdb81b703bbd4080c207a0e7ce5e276e");
    expect(SUBSTRATE_PIN).toMatch(/^[0-9a-f]{40}$/);
  });

  it("constructs a frozen provenance record carrying version, work order and pin", () => {
    const provenance = zcodeBridgeProvenance("P3-W3");
    expect(Object.isFrozen(provenance)).toBe(true);
    expect(provenance.bridgeVersion).toBe(ZCODE_BRIDGE_VERSION);
    expect(provenance.stability).toBe("stable");
    expect(provenance.workOrder).toBe("P3-W3");
    expect(provenance.substratePin).toBe(SUBSTRATE_PIN);
  });

  it("accepts the experimental stability class and rejects anything else", () => {
    expect(zcodeBridgeProvenance("P3-W3", "experimental").stability).toBe(
      "experimental",
    );
    expect(() => zcodeBridgeProvenance("P3-W3", "unstable" as never)).toThrow();
  });

  it("rejects empty work orders", () => {
    expect(() => zcodeBridgeProvenance("")).toThrowError(/workOrder/);
    expect(() => zcodeBridgeProvenance(42 as never)).toThrowError(/workOrder/);
  });
});
