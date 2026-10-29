import { describe, expect, it } from "vitest";
import * as pkg from "../src/index.ts";
import * as errors from "../src/errors.ts";

/**
 * The package smoke suite (NET-NEW): the public surface is importable,
 * curated and versioned; the deterministic backbone responds; the
 * package's own identity constants are stable.
 */

describe("package surface smoke", () => {
  it("the barrel imports cleanly with the curated public surface (206..235 exports)", () => {
    const count = Object.keys(pkg).length;
    expect(count).toBeGreaterThanOrEqual(206);
    expect(count).toBeLessThanOrEqual(235);
    // DISCLOSED RE-PIN (P22-C, ADR-0016 D5): +4 value exports (the corridor
    // KES receiving context — three pinned literals + the constructor).
    expect(count).toBe(235);
  });

  it("the package identity constants are stable", () => {
    expect(pkg.PACKAGE_NAME).toBe("@payswap/merchant");
    expect(pkg.PACKAGE_VERSION).toBe("0.1.0");
    expect(pkg.WORK_ORDER_ID).toBe("P5-W3");
    expect(pkg.REBUILD_LANE).toBe("R3-W3");
  });

  it("the deterministic backbone is exported and total over wire data", () => {
    expect(typeof pkg.stableStringify).toBe("function");
    expect(typeof pkg.canonicalDigest).toBe("function");
    expect(typeof pkg.deepFreeze).toBe("function");
    expect(pkg.stableStringify({ b: 1n, a: "x" })).toBe('{"a":"x","b":b:1}');
  });

  it("the secret-boundary law is exported (the INV-19 kernel twins)", () => {
    expect(pkg.isRawKeyShape("0x" + "a".repeat(64))).toBe(true);
    expect(pkg.isRawKeyShape("0x" + "a".repeat(40))).toBe(false);
    expect(typeof pkg.assertNoSecretMaterial).toBe("function");
    expect(Array.isArray(pkg.FORBIDDEN_SECRET_KEY_SUBSTRINGS)).toBe(true);
  });

  it("the local error taxonomy exports its full class census (21 classes)", () => {
    const exported: Record<string, unknown> = { ...pkg, ...errors };
    for (const name of errors.ERROR_CLASSES) {
      expect(typeof exported[name]).toBe("function");
    }
    expect(errors.ERROR_CLASSES.length).toBe(21);
    const error = new errors.ValidationError("boom");
    expect(error instanceof errors.MerchantError).toBe(true);
    expect(error.code).toBe("MERCHANT_VALIDATION");
    expect(pkg.isMerchantError(error)).toBe(true);
  });

  it("the wallet-payment port vocabulary exports the handoff-only law", () => {
    expect([...pkg.WALLET_PAYMENT_PORT_METHODS]).toEqual(["handoff"]);
    expect(typeof pkg.performWalletPaymentHandoff).toBe("function");
    expect(typeof pkg.assertWalletPaymentPort).toBe("function");
  });
});
