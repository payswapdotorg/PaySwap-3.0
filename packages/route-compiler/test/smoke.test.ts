import { describe, expect, it } from "vitest";
import * as routeCompiler from "../src/index.ts";

/**
 * Smoke: the package surface (PORT of the old three packages' smoke
 * suites, folded into one census + NET-NEW surface-census laws).
 */
describe("@payswap/route-compiler smoke", () => {
  it("declares its package name", () => {
    expect(routeCompiler.PACKAGE_NAME).toBe("@payswap/route-compiler");
  });

  it("exports the compilation surface", () => {
    expect(typeof routeCompiler.compileMoneyMovementRoute).toBe("function");
    expect(typeof routeCompiler.walkRoutePlan).toBe("function");
    expect(typeof routeCompiler.evaluateComparabilityGate).toBe("function");
    expect(typeof routeCompiler.evaluateNetOutcome).toBe("function");
    expect(typeof routeCompiler.rankScoredPlans).toBe("function");
    expect(routeCompiler.ROUTE_SHAPE_IDS.length).toBe(9);
  });

  it("exports the engine, record and error-taxonomy surface", () => {
    expect(typeof routeCompiler.BestExecutionEngine).toBe("function");
    expect(typeof routeCompiler.RouteExecutionRecord).toBe("function");
    expect(typeof routeCompiler.VenueRegistry).toBe("function");
    expect(typeof routeCompiler.discoverOnchainLane).toBe("function");
    expect(typeof routeCompiler.executeOnchainLane).toBe("function");
    expect(typeof routeCompiler.checkSelectedRouteValidity).toBe("function");
    expect(typeof routeCompiler.ValidationError).toBe("function");
    expect(typeof routeCompiler.ExecutionTransitionError).toBe("function");
    expect(typeof routeCompiler.RouteInvalidatedError).toBe("function");
    expect(typeof routeCompiler.VenueRegistryError).toBe("function");
    expect(typeof routeCompiler.LabTierSettlementRejectedError).toBe("function");
  });

  it("the curated barrel census: exactly 172 runtime exports (131 functions + 41 consts)", () => {
    const exports = Object.entries(routeCompiler);
    const functions = exports.filter(([, value]) => typeof value === "function");
    const consts = exports.filter(([, value]) => typeof value !== "function");
    expect(functions.length).toBe(131);
    expect(consts.length).toBe(41);
    expect(exports.length).toBe(172);
  });

  it("the tier + comparability vocabularies are closed and frozen", () => {
    expect(routeCompiler.LAB_EXECUTION_TIER).toBe("LAB_SIMULATION_NON_PRODUCTION");
    expect(routeCompiler.labTierPermitsFinancialSettlement()).toBe(false);
    expect(Object.isFrozen(routeCompiler.COMPARABILITY_REQUIREMENTS)).toBe(true);
    expect([...routeCompiler.COMPARABILITY_REQUIREMENTS]).toEqual([
      "CURRENT_ELIGIBILITY",
      "CREDIBLE_PRICING",
      "CONNECTION_PERMISSION",
      "FUNDING_PAYOUT_CONSTRAINTS",
      "AUDITABLE_ASSUMPTIONS",
    ]);
    expect(Object.isFrozen(routeCompiler.ROUTE_LEG_KINDS)).toBe(true);
    expect(routeCompiler.ROUTE_LEG_KINDS.length).toBe(8);
  });
});
