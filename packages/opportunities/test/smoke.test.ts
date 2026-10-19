import { describe, expect, it } from "vitest";
import {
  DISCOVERY_TIER,
  GUARANTEE_LANGUAGE_PATTERNS,
  OPPORTUNITY_DISCOVERY_NON_PRODUCTION_CONSTRAINT,
  OPPORTUNITY_FAMILIES,
  PACKAGE_NAME,
  RAIL_KINDS,
  discoveryPermitsExecution,
} from "../src/index.ts";
import * as opportunityExports from "../src/index.ts";

/**
 * Package smoke (the repo-wide smoke-test convention): the public
 * surface, constants and laws are exactly what the work order demands.
 */
describe("package smoke (P6-W2)", () => {
  it("exposes the canonical package name", () => {
    expect(PACKAGE_NAME).toBe("@payswap/opportunities");
  });

  it("the six opportunity families are exactly the work order's family list", () => {
    expect([...OPPORTUNITY_FAMILIES]).toEqual([
      "liquidity",
      "lending",
      "staking",
      "incentives",
      "arbitrage",
      "other",
    ]);
  });

  it("the rail kinds are the across-rails vocabulary (ONCHAIN, FIAT, FX)", () => {
    expect([...RAIL_KINDS]).toEqual(["ONCHAIN", "FIAT", "FX"]);
  });

  it("the structural discovery tier is DISCOVERY_NEVER_AUTHORIZATION", () => {
    expect(DISCOVERY_TIER).toBe("DISCOVERY_NEVER_AUTHORIZATION");
    expect(discoveryPermitsExecution()).toBe(false);
  });

  it("the Lab non-production constraint is exported for discovery results", () => {
    expect(OPPORTUNITY_DISCOVERY_NON_PRODUCTION_CONSTRAINT).toBe(
      "OPPORTUNITY_DISCOVERY_IS_NOT_PRODUCTION_EXECUTION",
    );
  });

  it("the guarantee-vocabulary pattern list is frozen and non-empty", () => {
    expect(Object.isFrozen(GUARANTEE_LANGUAGE_PATTERNS)).toBe(true);
    expect(GUARANTEE_LANGUAGE_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });

  it("the export surface is the complete barrel (the plain-Node receipt)", () => {
    const exportNames = Object.keys(opportunityExports);
    expect(exportNames.length).toBeGreaterThanOrEqual(100);
    expect(exportNames).toContain("discoverOpportunity");
    expect(exportNames).toContain("validateFinancialOpportunity");
    expect(exportNames).toContain("resolveOpportunity");
    expect(exportNames).toContain("evaluateDiscoveryPolicy");
    expect(exportNames).toContain("opportunityProposalDraft");
    expect(exportNames).toContain("assertNoSecretMaterial");
    expect(exportNames).toContain("rejectDiscoveryForExecution");
    expect(exportNames).toContain("opportunityFamilyCapabilities");
  });
});
