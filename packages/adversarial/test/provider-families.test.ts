/**
 * The provider threat families + recovery-path contracts (P6-W3, lane
 * r4-w3; ADAPT of the family-taxonomy sites from payswap.org@8a735bf
 * packages/adversarial — the eleven W2-007 fault families, exactly
 * once, with complete declarations and ordered recovery steps).
 */

import { describe, expect, it } from "vitest";
import {
  isProviderThreatFamily,
  PROVIDER_FAMILY_DECLARATIONS,
  PROVIDER_FAMILY_RECOVERY_CONTRACTS,
  PROVIDER_THREAT_FAMILIES,
  recoveryContractFor,
  RETIRE_ELIGIBLE_PROVIDER_FAMILIES,
  threatSeverityRank,
} from "../src/provider/index.ts";

describe("the provider threat families (the old W2-007 taxonomy, 1:1)", () => {
  it("registers exactly the eleven families with unique ids", () => {
    expect(PROVIDER_THREAT_FAMILIES).toHaveLength(11);
    expect(new Set(PROVIDER_THREAT_FAMILIES).size).toBe(11);
    expect(PROVIDER_THREAT_FAMILIES).toEqual([
      "duplicated_commands",
      "lost_webhooks",
      "ambiguous_provider",
      "account_takeover",
      "malicious_agent",
      "package_compromise",
      "incentive_sybil_collusion_wash",
      "leaderboard_gaming",
      "provider_outage",
      "clock_skew",
      "partial_payment",
    ]);
    expect(isProviderThreatFamily("provider_outage")).toBe(true);
    expect(isProviderThreatFamily("meteor_strike")).toBe(false);
  });

  it("provides one complete declaration per family (no stubbed targets)", () => {
    for (const family of PROVIDER_THREAT_FAMILIES) {
      const declaration = PROVIDER_FAMILY_DECLARATIONS[family];
      expect(declaration.family).toBe(family);
      expect(declaration.title.length).toBeGreaterThan(0);
      expect(declaration.description.length).toBeGreaterThan(40);
      expect(declaration.endangers.length).toBeGreaterThan(0);
      for (const law of declaration.endangers) {
        expect(law.invariantRef).toMatch(/^INV-\d+$/);
        expect(law.law.length).toBeGreaterThan(0);
      }
      expect(["restrict", "quarantine", "retire"]).toContain(declaration.advisoryOutcome);
    }
  });

  it("the advisory outcomes map to quarantine/restrict/retire (the D-1 vocabulary)", () => {
    expect(PROVIDER_FAMILY_DECLARATIONS.account_takeover.advisoryOutcome).toBe("quarantine");
    expect(PROVIDER_FAMILY_DECLARATIONS.malicious_agent.advisoryOutcome).toBe("quarantine");
    expect(PROVIDER_FAMILY_DECLARATIONS.package_compromise.advisoryOutcome).toBe("quarantine");
    for (const family of PROVIDER_THREAT_FAMILIES) {
      if (!RETIRE_ELIGIBLE_PROVIDER_FAMILIES.includes(family)) {
        expect(PROVIDER_FAMILY_DECLARATIONS[family].advisoryOutcome).not.toBe("retire");
      }
    }
  });

  it("retirement is reserved for the package-compromise family (irreversible steps demand opt-in)", () => {
    expect(RETIRE_ELIGIBLE_PROVIDER_FAMILIES).toEqual(["package_compromise"]);
    expect(PROVIDER_FAMILY_DECLARATIONS.package_compromise.retireEligible).toBe(true);
  });

  it("every family carries an ordered, non-empty recovery-path contract", () => {
    for (const family of PROVIDER_THREAT_FAMILIES) {
      const contract = PROVIDER_FAMILY_RECOVERY_CONTRACTS[family];
      expect(contract.family).toBe(family);
      expect(contract.steps.length).toBeGreaterThan(0);
      const stepIds = contract.steps.map((step) => step.stepId);
      expect(new Set(stepIds).size).toBe(stepIds.length);
      for (const step of contract.steps) {
        expect(step.summary.length).toBeGreaterThan(10);
        expect(step.invariantRefs.length).toBeGreaterThan(0);
      }
    }
    expect(recoveryContractFor("provider_outage").steps.map((step) => step.stepId)).toEqual([
      "unknown-surfaced",
      "window-evidenced",
      "reconcile",
      "finality-then-redrain",
    ]);
    expect(() => recoveryContractFor("duplicated_commands")).not.toThrow();
  });

  it("the recovery contracts preserve the old exact-recovery laws (spot checks)", () => {
    // UNKNOWN is preserved, never FAILED (ambiguous provider).
    const ambiguous = PROVIDER_FAMILY_RECOVERY_CONTRACTS.ambiguous_provider;
    expect(ambiguous.steps[0]?.invariantRefs).toContain("INV-4");
    // The account-takeover path revokes via the epoch bump and recovers
    // ONLY through re-verification.
    const takeover = PROVIDER_FAMILY_RECOVERY_CONTRACTS.account_takeover;
    expect(takeover.steps.map((step) => step.stepId)).toEqual([
      "epoch-bump",
      "quarantine-key",
      "deny-cached-reentry",
      "re-verify",
    ]);
    // The package-compromise path: sealed release immutable, patched
    // version + closure + evidenced release.
    const compromise = PROVIDER_FAMILY_RECOVERY_CONTRACTS.package_compromise;
    expect(compromise.steps[2]?.stepId).toBe("sealed-immutable");
    expect(compromise.steps[3]?.stepId).toBe("patched-release");
    // The incentive clawback is a SEPARATE adjustment (history remains).
    const incentive = PROVIDER_FAMILY_RECOVERY_CONTRACTS.incentive_sybil_collusion_wash;
    expect(incentive.steps[2]?.summary).toContain("SEPARATE");
  });

  it("severity ranking is the five-value deterministic order", () => {
    expect(threatSeverityRank("info")).toBe(0);
    expect(threatSeverityRank("low")).toBe(1);
    expect(threatSeverityRank("medium")).toBe(2);
    expect(threatSeverityRank("high")).toBe(3);
    expect(threatSeverityRank("critical")).toBe(4);
  });
});
