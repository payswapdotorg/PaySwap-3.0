/**
 * The capability access gate — cached state can NEVER bypass an active
 * quarantine (P6-W3, lane r4-w3; PORT of the gate sites from
 * payswap.org@8a735bf packages/security/test/quarantine.test.ts — the
 * old INV-S03 law).
 */

import { describe, expect, it } from "vitest";
import {
  authorizeCapabilityUse,
  QuarantineLedger,
  SecurityAdvisoryRegistry,
  type CachedCapabilityView,
} from "../src/index.ts";

function enforcement() {
  return {
    advisories: new SecurityAdvisoryRegistry(),
    quarantine: new QuarantineLedger(),
  };
}

function cachedAvailable(): CachedCapabilityView {
  return {
    capabilityId: "cap:payment.attempt",
    sourceId: "source:checkout-1",
    effectiveAvailability: "AVAILABLE",
  };
}

describe("the capability access gate (cached state is never authority)", () => {
  it("an unrestricted, unquarantined capability is allowed", () => {
    const security = enforcement();
    expect(authorizeCapabilityUse(cachedAvailable(), security)).toEqual({ decision: "ALLOW" });
  });

  it("a cached AVAILABLE capability state is rejected while quarantine is active (the bypass law)", () => {
    const security = enforcement();
    security.quarantine.quarantine({
      component: { kind: "capability", id: "cap:payment.attempt" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    const decision = authorizeCapabilityUse(cachedAvailable(), security);
    expect(decision.decision).toBe("REJECT");
    if (decision.decision === "REJECT") {
      expect(decision.reason).toBe("quarantined");
      expect(decision.componentKey).toBe("capability:cap:payment.attempt");
      expect(decision.quarantineIds).toEqual(["quarantine:capability:cap:payment.attempt:1"]);
    }
    // A cached DEGRADED/UNKNOWN view fails identically (the cached value
    // is never read in the decision path).
    for (const availability of ["DEGRADED", "UNAVAILABLE", "UNKNOWN"] as const) {
      const degraded = authorizeCapabilityUse(
        { ...cachedAvailable(), effectiveAvailability: availability },
        security,
      );
      expect(degraded.decision).toBe("REJECT");
    }
  });

  it("quarantining the PROVIDER blocks the capability even though the capability itself is clean", () => {
    const security = enforcement();
    security.quarantine.quarantine({
      component: { kind: "extension", id: "ext-1" },
      reason: "compromise",
      advisoryRefs: ["adv-1"],
      at: 1_000,
    });
    const decision = authorizeCapabilityUse(
      { ...cachedAvailable(), providedBy: [{ kind: "extension", id: "ext-1" }] },
      security,
    );
    expect(decision.decision).toBe("REJECT");
    if (decision.decision === "REJECT") {
      expect(decision.reason).toBe("quarantined_provider");
      expect(decision.componentKey).toBe("extension:ext-1");
    }
  });

  it("advisory-level restriction (without a quarantine record) also rejects", () => {
    const security = enforcement();
    security.advisories.publish({
      advisoryId: "adv-1",
      title: "t",
      severity: "high",
      description: "d",
      affected: [{ kind: "capability", id: "cap:payment.attempt" }],
      action: "restrict",
      remediation: { summary: "s", workarounds: [] },
      declaredBy: "source:cert-intel",
      publishedAt: 1_000,
    });
    const decision = authorizeCapabilityUse(cachedAvailable(), security);
    expect(decision.decision).toBe("REJECT");
    if (decision.decision === "REJECT") {
      expect(decision.reason).toBe("restricted");
      expect(decision.advisoryRefs).toEqual(["adv-1"]);
      expect(decision.quarantineIds).toEqual([]);
    }
  });

  it("retirement outranks quarantine-grade restriction in the reject reasons (retire > quarantine > restrict)", () => {
    const security = enforcement();
    security.advisories.publish({
      advisoryId: "adv-restrict",
      title: "t",
      severity: "low",
      description: "d",
      affected: [{ kind: "extension", id: "ext-1" }],
      action: "restrict",
      remediation: { summary: "s", workarounds: [] },
      declaredBy: "source:cert-intel",
      publishedAt: 1_000,
    });
    security.advisories.publish({
      advisoryId: "adv-retire",
      title: "t",
      severity: "critical",
      description: "d",
      affected: [{ kind: "extension", id: "ext-1" }],
      action: "retire",
      remediation: { summary: "s", workarounds: [] },
      declaredBy: "source:cert-intel",
      publishedAt: 1_100,
    });
    const decision = authorizeCapabilityUse(
      { ...cachedAvailable(), providedBy: [{ kind: "extension", id: "ext-1" }] },
      security,
    );
    expect(decision.decision).toBe("REJECT");
    if (decision.decision === "REJECT") {
      expect(decision.reason).toBe("retired_provider");
      expect(decision.advisoryRefs[0]).toBe("adv-retire");
    }
  });

  it("fails closed on a view without a capabilityId", () => {
    const security = enforcement();
    expect(() =>
      authorizeCapabilityUse({ ...cachedAvailable(), capabilityId: "" }, security),
    ).toThrowError(/capabilityId/);
  });
});
