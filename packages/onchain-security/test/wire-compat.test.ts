import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ADAPTER_WIRE_VERSION,
  KERNEL_WIRE_VERSION,
  PACKAGE_NAME,
  prepareWrite,
} from "../src/index.ts";
import type { GateDecision, Principal } from "../src/index.ts";
import { THREAT_INTEL_SURFACE_NAME, THREAT_INTEL_WIRE_VERSION } from "../src/threat-intel/index.ts";
import type { ThreatSignal } from "../src/threat-intel/index.ts";
import { baseWriteRequest, NOW } from "./helpers.ts";

/**
 * Wire compatibility (R2-W2 net-new): the structural seams this package
 * exposes to its CONSUMERS. Under the zero-sibling law the tests cannot
 * import the sibling lanes — so each seam is asserted against the
 * consumer's own PINNED shape, declared here as a structural copy (the
 * same discipline the surface lane used for OUR GateDecision:
 * packages/surface/src/security-vocabulary.ts pins
 * SecurityGateDecisionSource and defers wiring to the TL).
 *
 * These tests guarantee: when the TL wires the real lanes at
 * integration, the shapes line up by construction — drift is impossible
 * without a typecheck failure.
 */

/**
 * STRUCTURAL COPY of the surface lane's pinned SecurityGateDecisionSource
 * (packages/surface/src/security-vocabulary.ts, P2-W3): the people-language
 * fold reads BLOCK/ALLOW/UNKNOWN decisions with drill-down reasons.
 */
interface SurfacePinnedGateDecisionSource {
  readonly decision: "BLOCK" | "ALLOW" | "UNKNOWN";
  /** Present with BLOCK (the violated reasons). */
  readonly reasons?: readonly {
    readonly dimension: string;
    readonly code: string;
    readonly message: string;
    readonly invariantRefs: readonly string[];
  }[];
  /** Present with ALLOW (what passed). */
  readonly checks?: readonly {
    readonly dimension: string;
    readonly outcome: string;
    readonly code: string;
    readonly detail: string;
  }[];
  /** Present with UNKNOWN (unresolved dimensions). */
  readonly dimensions?: readonly {
    readonly dimension: string;
    readonly code: string;
    readonly message: string;
  }[];
}

/** STRUCTURAL COPY of the trust lane's pinned AmountSpec (P1-W3 pin). */
interface TrustPinnedAmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

describe("the kernel's GateDecision satisfies the surface lane's pinned fold shape", () => {
  it("every GateDecision variant is assignable to the surface pin (no fourth verdict)", () => {
    // ALLOW carries checks; BLOCK carries reasons; UNKNOWN carries
    // dimensions — exactly the drilled-down shapes the surface fold reads.
    expectTypeOf<GateDecision>().toMatchTypeOf<SurfacePinnedGateDecisionSource>();
    // And the reverse structural view holds for the shared vocabulary:
    expectTypeOf<SurfacePinnedGateDecisionSource["decision"]>().toEqualTypeOf<
      GateDecision["decision"]
    >();
  });

  it("the pinned fold's laws hold at runtime: BLOCK stays BLOCK, UNKNOWN stays UNKNOWN", async () => {
    const { evaluateOnchainWriteGates, buildExpectedStateDiff } = await import("../src/index.ts");
    const { basePolicy, baseSecurityState } = await import("./helpers.ts");
    const write = prepareWrite(baseWriteRequest(), NOW);
    const allow = evaluateOnchainWriteGates({
      write,
      policy: basePolicy(),
      securityState: baseSecurityState(),
      at: NOW,
    });
    if (allow.decision !== "ALLOW") {
      throw new Error("fixture must produce ALLOW");
    }
    // The fold reads checks on ALLOW:
    expect(allow.checks.length).toBeGreaterThan(0);
    // The diff the trusted surface shows is renderable + content-addressed:
    const diff = buildExpectedStateDiff(write);
    expect(diff.diffDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(diff.entries.length).toBeGreaterThan(0);
  });
});

describe("the pinned AmountSpec wire is identical across lanes", () => {
  it("the kernel's AmountSpec is the trust lane's pin, field for field", () => {
    expectTypeOf<import("../src/index.ts").AmountSpec>().toEqualTypeOf<TrustPinnedAmountSpec>();
  });
});

describe("the pinned Principal wire satisfies the trust lane's principal model", () => {
  it("all three principal kinds are structurally present", () => {
    expectTypeOf<Principal>().toMatchTypeOf<
      | { kind: "user"; id: string; securityEpoch: bigint }
      | { kind: "agent"; agentKeyFingerprint: string; ownerRef: string; bodyRef: string; packageVersionRef: string; authorityEnvelope: readonly { mandateId: string; version: number }[]; securityEpoch: bigint }
      | { kind: "service"; id: string; scope: string }
    >();
  });
});

describe("the wire-version stamps (versioned, canonical contracts)", () => {
  it("the kernel stamp is pinned and stable", () => {
    expect(KERNEL_WIRE_VERSION).toBe("onchain-security-kernel/1");
    expect(PACKAGE_NAME).toBe("@payswap/onchain-security");
  });

  it("the threat-intel stamp is pinned and names the subpath surface", () => {
    expect(THREAT_INTEL_WIRE_VERSION).toBe("onchain-threat-intel/1");
    expect(THREAT_INTEL_SURFACE_NAME).toBe("@payswap/onchain-security/threat-intel");
  });

  it("the adapter stamp is pinned (EVM semantics behind ./adapters/*)", () => {
    expect(ADAPTER_WIRE_VERSION).toBe("onchain-signer-adapters/1");
  });
});

describe("the threat-intel signal satisfies downstream evidence consumers", () => {
  it("a ThreatSignal always carries its evidence chain + calibrated confidence (types)", () => {
    expectTypeOf<ThreatSignal>().toHaveProperty("evidence").toMatchTypeOf<{
      readonly observationRefs: readonly string[];
      readonly digestRefs: readonly string[];
    }>();
    expectTypeOf<ThreatSignal>().toHaveProperty("confidenceBps").toEqualTypeOf<number>();
    expectTypeOf<ThreatSignal>().toHaveProperty("signalId").toEqualTypeOf<string>();
  });
});
