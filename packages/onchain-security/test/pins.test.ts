import { describe, expect, expectTypeOf, it } from "vitest";
import {
  actionPatternCoveredBy,
  approvalSigningPayload,
  compareAmounts,
  compareCanonicalMinorUnits,
  InvalidAmountError,
  isRawKeyShape,
  matchesActionPattern,
  opaqueCredentialRef,
  principalRef,
  validateActionPattern,
  validateAmountSpec,
} from "../src/index.ts";

/**
 * The structural pins (R2-W2 net-new): the pinned cross-lane wire shapes
 * under the zero-sibling law. Each pin is a STRUCTURAL mirror of a lane
 * contract (trust AmountSpec/Principal/Mandate wire, the trust approval
 * payload, the smart-contract declaration, the quote disclosures); these
 * tests prove the pins' semantics are exactly the lane contracts'
 * semantics, so the TL integration is a typecheck, not a rewrite.
 */

describe("the AmountSpec pin (verbatim P1-W3 wire)", () => {
  it("accepts canonical 3-letter currency + non-negative integer minor units", () => {
    expect(() => validateAmountSpec({ currency: "USC", minorUnits: "0" })).not.toThrow();
    expect(() => validateAmountSpec({ currency: "ETH", minorUnits: "1000000" })).not.toThrow();
  });

  it("rejects every non-canonical shape (fail closed)", () => {
    expect(() => validateAmountSpec({ currency: "usd", minorUnits: "1" })).toThrow(InvalidAmountError);
    expect(() => validateAmountSpec({ currency: "USDT", minorUnits: "1" })).toThrow(InvalidAmountError);
    expect(() => validateAmountSpec({ currency: "USC", minorUnits: "-1" })).toThrow(InvalidAmountError);
    expect(() => validateAmountSpec({ currency: "USC", minorUnits: "1.5" })).toThrow(InvalidAmountError);
    expect(() => validateAmountSpec({ currency: "USC", minorUnits: "01" })).toThrow(InvalidAmountError);
    expect(() => validateAmountSpec({ currency: "USC", minorUnits: "" })).toThrow(InvalidAmountError);
  });

  it("compares exact integer minor units without floating point (INV-2)", () => {
    expect(compareCanonicalMinorUnits("999999999999999999999999", "999999999999999999999998")).toBe(1);
    expect(compareCanonicalMinorUnits("10", "9")).toBe(1);
    expect(compareCanonicalMinorUnits("9", "10")).toBe(-1);
    expect(compareCanonicalMinorUnits("0", "0")).toBe(0);
  });

  it("compareAmounts refuses cross-currency comparison (an FX quote is a financial-lane concern)", () => {
    expect(compareAmounts({ currency: "USC", minorUnits: "1" }, { currency: "USC", minorUnits: "1" })).toBe(0);
    expect(() =>
      compareAmounts({ currency: "USC", minorUnits: "1" }, { currency: "ETH", minorUnits: "1" }),
    ).toThrow(InvalidAmountError);
  });
});

describe("the Principal pin (trust-lane projection, verbatim semantics)", () => {
  it("projects each principal kind onto its canonical ref", () => {
    expect(principalRef({ kind: "user", id: "alice", securityEpoch: 0n })).toBe("user:alice");
    expect(
      principalRef({
        kind: "agent",
        agentKeyFingerprint: "key-1",
        ownerRef: "user:alice",
        bodyRef: "body-1",
        packageVersionRef: "pkg@1.0.0",
        authorityEnvelope: [],
        securityEpoch: 0n,
      }),
    ).toBe("agent:key-1");
    expect(principalRef({ kind: "service", id: "checkout", scope: "payments" })).toBe("service:checkout");
  });
});

describe("the Mandate/action-pattern pin (attenuation semantics, INV-12)", () => {
  it("validates action patterns (trailing wildcard only)", () => {
    expect(() => validateActionPattern("onchain.transfer")).not.toThrow();
    expect(() => validateActionPattern("onchain.*")).not.toThrow();
    expect(() => validateActionPattern("")).toThrow();
    expect(() => validateActionPattern("onchain.*.transfer")).toThrow();
  });

  it("matches concrete actions against patterns", () => {
    expect(matchesActionPattern("onchain.transfer", "onchain.transfer")).toBe(true);
    expect(matchesActionPattern("onchain.*", "onchain.transfer")).toBe(true);
    expect(matchesActionPattern("onchain.transfer", "onchain.approval")).toBe(false);
  });

  it("coverage is attenuation: a child pattern must fall inside the parent", () => {
    expect(actionPatternCoveredBy("onchain.transfer", "onchain.*")).toBe(true);
    expect(actionPatternCoveredBy("onchain.*", "onchain.transfer")).toBe(false);
    expect(actionPatternCoveredBy("onchain.transfer", "onchain.transfer")).toBe(true);
    expect(actionPatternCoveredBy("onchain.approval.*", "onchain.*")).toBe(true);
  });
});

describe("the trust approval-payload pin (one auditable prefix)", () => {
  it("serializes the trust-plane artifact fields in canonical order", () => {
    const payload = approvalSigningPayload({
      principal: "user:alice",
      agentRef: "agent:key-1",
      scope: {
        actions: ["onchain.transfer"],
        resources: [{ type: "onchain_write", resourceId: "write-1" }],
        maxAmount: { currency: "USC", minorUnits: "1000000" },
      },
      expiry: 1_000_060,
      requestHash: "fnv1a64:0000000000000001",
      signature: "sig:opaque",
      issuedAt: 1_000_000,
    });
    expect(payload.startsWith("principal:user:alice|agent:agent:key-1|")).toBe(true);
    expect(payload).toContain("maxAmount:USC:1000000");
    expect(payload).toContain("expiry:1000060");
    expect(payload.endsWith("|signature:sig:opaque")).toBe(true);
  });

  it("omits absent optionals deterministically", () => {
    const payload = approvalSigningPayload({
      principal: "user:alice",
      scope: { actions: ["a"], resources: [{ type: "t" }] },
      expiry: 1,
      requestHash: "h",
      signature: "s",
      issuedAt: 0,
    });
    expect(payload).toContain("agent:-");
    expect(payload).toContain("maxAmount:-");
  });
});

describe("the secrets-policy pin (non-custody seam)", () => {
  it("raw-key shape detection is structure-only", () => {
    expect(isRawKeyShape("0x" + "ab".repeat(32))).toBe(true);
    expect(isRawKeyShape("ab".repeat(32))).toBe(true);
    expect(isRawKeyShape("0x" + "ab".repeat(31))).toBe(false);
  });

  it("opaque credential refs are the only lawful secret reference", () => {
    const ref = opaqueCredentialRef({ vault: "vault:wallet-1", ref: "cred-9", purpose: "onchain signing" });
    expect(ref.kind).toBe("vault_ref");
    expect(ref.purpose).toBe("onchain signing");
    expect(() => opaqueCredentialRef({ vault: "", ref: "x" })).toThrow();
    expect(() => opaqueCredentialRef({ vault: "v", ref: "" })).toThrow();
  });
});

describe("pin surface sanity (compile-time shape checks)", () => {
  it("the pinned Mandate wire keeps the trust lane's field surface", () => {
    expectTypeOf<import("../src/index.ts").Mandate>().toHaveProperty("id").toEqualTypeOf<string>();
    expectTypeOf<import("../src/index.ts").Mandate>().toHaveProperty("expiresAt").toEqualTypeOf<number>();
    expectTypeOf<import("../src/index.ts").Mandate>().toHaveProperty("issuedAtEpoch").toEqualTypeOf<bigint>();
  });

  it("the smart-contract declaration pin keeps the full INV-20 surface", () => {
    expectTypeOf<import("../src/index.ts").SmartContractExtension>()
      .toHaveProperty("contractAddress")
      .toEqualTypeOf<string>();
    expectTypeOf<import("../src/index.ts").SmartContractExtension>()
      .toHaveProperty("custody")
      .toMatchTypeOf<{ readonly custodial: boolean }>();
  });

  it("the quote-disclosure pin keeps the execution lane's disclosure surface", () => {
    expectTypeOf<import("../src/index.ts").SlippageDisclosure>()
      .toHaveProperty("protection")
      .toEqualTypeOf<"DECLARED_LIMIT" | "PROVIDER_DEFINED">();
    expectTypeOf<import("../src/index.ts").LiquidityImpactDisclosure>()
      .toHaveProperty("declaredImpactCost")
      .toMatchTypeOf<{ readonly minorUnits: string }>();
  });
});
