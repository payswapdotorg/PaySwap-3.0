import { describe, expect, expectTypeOf, it } from "vitest";
import {
  composeThreatVerdict,
  isThreatVerdict,
  resolveOnchainSecurityDecision,
  THREAT_VERDICTS,
  VERDICT_RANK,
  stricterVerdict,
} from "../../src/threat-intel/index.ts";
import type { ComposedSecurityDecision, ThreatVerdict } from "../../src/threat-intel/index.ts";
import {
  evaluateOnchainWriteGates,
  prepareWrite,
} from "../../src/index.ts";
import type { GateDecision } from "../../src/index.ts";
import {
  AGENT_REF,
  NOW,
  baseKernelPolicy,
  baseSecurityState,
  baseThreatPolicy,
  baseWriteRequest,
  benignBundle,
} from "./helpers.ts";
import { AdversarialTransactionAgent } from "../../src/threat-intel/index.ts";

/**
 * The threat-layer no-downgrade law encoding (R2-W2 net-new; the
 * extension of the kernel's cannot_downgrade_block layer law —
 * MODULE-OWNERSHIP layer `security` — to the four-value verdict
 * vocabulary; canonical INV-21).
 *
 * The lattice: ALLOW < ALLOW_WITH_CONSTRAINTS < REQUIRE_CONFIRMATION <
 * BLOCK. Every composition is a JOIN (the stricter verdict wins) — an
 * agent can only ever HARDEN a decision, never soften it; and the
 * KERNEL's BLOCK/UNKNOWN discipline dominates the whole threat layer.
 */

describe("the four-value verdict vocabulary is closed and ranked", () => {
  it("THREAT_VERDICTS is exactly the SECURITY-MODEL vocabulary", () => {
    expect([...THREAT_VERDICTS]).toEqual([
      "ALLOW",
      "ALLOW_WITH_CONSTRAINTS",
      "REQUIRE_CONFIRMATION",
      "BLOCK",
    ]);
  });

  it("the restriction rank is total and stricterVerdict is symmetric", () => {
    expect(VERDICT_RANK.ALLOW).toBeLessThan(VERDICT_RANK.ALLOW_WITH_CONSTRAINTS);
    expect(VERDICT_RANK.ALLOW_WITH_CONSTRAINTS).toBeLessThan(VERDICT_RANK.REQUIRE_CONFIRMATION);
    expect(VERDICT_RANK.REQUIRE_CONFIRMATION).toBeLessThan(VERDICT_RANK.BLOCK);
    for (const a of THREAT_VERDICTS) {
      for (const b of THREAT_VERDICTS) {
        expect(stricterVerdict(a, b)).toBe(stricterVerdict(b, a));
        expect(isThreatVerdict(stricterVerdict(a, b))).toBe(true);
      }
    }
  });
});

describe("composeThreatVerdict: the agent can only HARDEN (INV-21)", () => {
  it("an agent BLOCK stays BLOCK against every policy verdict", () => {
    for (const policyVerdict of THREAT_VERDICTS) {
      expect(composeThreatVerdict("BLOCK", policyVerdict)).toBe("BLOCK");
    }
  });

  it("a policy BLOCK overrides an agent ALLOW (the policy is authoritative)", () => {
    expect(composeThreatVerdict("ALLOW", "BLOCK")).toBe("BLOCK");
    expect(composeThreatVerdict("ALLOW_WITH_CONSTRAINTS", "BLOCK")).toBe("BLOCK");
    expect(composeThreatVerdict("REQUIRE_CONFIRMATION", "BLOCK")).toBe("BLOCK");
  });

  it("neither BLOCKs → the more restrictive surviving verdict", () => {
    expect(composeThreatVerdict("ALLOW", "ALLOW")).toBe("ALLOW");
    expect(composeThreatVerdict("ALLOW", "ALLOW_WITH_CONSTRAINTS")).toBe("ALLOW_WITH_CONSTRAINTS");
    expect(composeThreatVerdict("REQUIRE_CONFIRMATION", "ALLOW_WITH_CONSTRAINTS")).toBe(
      "REQUIRE_CONFIRMATION",
    );
  });

  it("no (agent, policy) pair composes BELOW the policy verdict (join property)", () => {
    const recommendations = ["ALLOW", "ALLOW_WITH_CONSTRAINTS", "REQUIRE_CONFIRMATION", "BLOCK"] as const;
    for (const policyVerdict of THREAT_VERDICTS) {
      for (const agent of recommendations) {
        const composed = composeThreatVerdict(agent, policyVerdict);
        expect(VERDICT_RANK[composed]).toBeGreaterThanOrEqual(VERDICT_RANK[policyVerdict]);
      }
    }
  });
});

describe("resolveOnchainSecurityDecision: the kernel discipline dominates", () => {
  function kernelAllow(): GateDecision {
    const decision = evaluateOnchainWriteGates({
      write: prepareWrite(baseWriteRequest(), NOW),
      policy: baseKernelPolicy(),
      securityState: baseSecurityState(),
      at: NOW,
    });
    if (decision.decision !== "ALLOW") {
      throw new Error("fixture must produce a kernel ALLOW");
    }
    return decision;
  }

  function kernelBlock(): GateDecision {
    // A destination outside the kernel policy allowlist → deterministic BLOCK.
    const decision = evaluateOnchainWriteGates({
      write: prepareWrite(
        baseWriteRequest({ transfer: { ...baseWriteRequest().transfer!, to: "0x9999999999999999999999999999999999999999" } }),
        NOW,
      ),
      policy: baseKernelPolicy(),
      securityState: baseSecurityState(),
      at: NOW,
    });
    if (decision.decision !== "BLOCK") {
      throw new Error("fixture must produce a kernel BLOCK");
    }
    return decision;
  }

  function kernelUnknown(): GateDecision {
    const decision = evaluateOnchainWriteGates({
      write: prepareWrite(baseWriteRequest(), NOW),
      policy: baseKernelPolicy({ knownRoutes: ["fnv1a64:0000000000000009"], unknownRoutePolicy: "escalate" }),
      securityState: baseSecurityState(),
      at: NOW,
    });
    if (decision.decision !== "UNKNOWN") {
      throw new Error("fixture must produce a kernel UNKNOWN");
    }
    return decision;
  }

  it("a kernel BLOCK is terminal — every threat verdict resolves to BLOCK", () => {
    for (const threatVerdict of THREAT_VERDICTS) {
      const resolution = resolveOnchainSecurityDecision({
        kernelDecision: kernelBlock(),
        threatVerdict,
      });
      expect(resolution.decision).toBe("BLOCK");
      expect(resolution.basis).toContain("kernel:BLOCK:terminal");
    }
  });

  it("a threat BLOCK binds even when the kernel said ALLOW (the adversarial extension)", () => {
    const resolution = resolveOnchainSecurityDecision({
      kernelDecision: kernelAllow(),
      threatVerdict: "BLOCK",
    });
    expect(resolution.decision).toBe("BLOCK");
    expect(resolution.basis).toContain("threat:BLOCK:binding");
  });

  it("a kernel UNKNOWN is never agent-allowed: the resolution floor is REQUIRE_CONFIRMATION (INV-4)", () => {
    for (const threatVerdict of ["ALLOW", "ALLOW_WITH_CONSTRAINTS"] as const) {
      const resolution = resolveOnchainSecurityDecision({
        kernelDecision: kernelUnknown(),
        threatVerdict,
      });
      expect(VERDICT_RANK[resolution.decision]).toBeGreaterThanOrEqual(
        VERDICT_RANK.REQUIRE_CONFIRMATION,
      );
    }
    // A stricter threat verdict still wins above the floor:
    expect(
      resolveOnchainSecurityDecision({ kernelDecision: kernelUnknown(), threatVerdict: "BLOCK" }).decision,
    ).toBe("BLOCK");
  });

  it("a kernel ALLOW lets the composed threat verdict stand", () => {
    const resolution = resolveOnchainSecurityDecision({
      kernelDecision: kernelAllow(),
      threatVerdict: "ALLOW_WITH_CONSTRAINTS",
    });
    expect(resolution.decision).toBe("ALLOW_WITH_CONSTRAINTS");
    expect(resolution.kernelDecision).toBe("ALLOW");
    expect(resolution.threatVerdict).toBe("ALLOW_WITH_CONSTRAINTS");
  });
});

describe("the composed decision type is the threat verdict vocabulary (no fifth verdict)", () => {
  it("ComposedSecurityDecision is exactly ThreatVerdict", () => {
    expectTypeOf<ComposedSecurityDecision>().toEqualTypeOf<ThreatVerdict>();
  });
});

describe("end-to-end: a benign world composes to ALLOW through the whole seam", () => {
  it("agent → policy → composition → resolution all agree on a clean write", () => {
    const agent = new AdversarialTransactionAgent(AGENT_REF);
    const write = prepareWrite(baseWriteRequest(), NOW);
    const assessment = agent.analyze({
      write,
      policy: baseThreatPolicy(),
      bundle: benignBundle(),
      at: NOW,
    });
    expect(assessment.agentRecommendation).toBe("ALLOW");
    const resolution = resolveOnchainSecurityDecision({
      kernelDecision: evaluateOnchainWriteGates({
        write,
        policy: baseKernelPolicy(),
        securityState: baseSecurityState(),
        at: NOW,
      }),
      threatVerdict: composeThreatVerdict(assessment.agentRecommendation, "ALLOW"),
    });
    expect(resolution.decision).toBe("ALLOW");
  });
});
