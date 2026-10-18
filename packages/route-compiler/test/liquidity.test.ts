import { describe, expect, it } from "vitest";
import {
  validateLiquidityEstimate,
  isLiquidityAdvisoryOnly,
  liquidityPermitsCustody,
  liquidityPermitsAuthorization,
  isLiquidityEstimateFresh,
  LIQUIDITY_ESTIMATE_MODELS,
} from "../src/liquidity.ts";
import { ValidationError } from "../src/errors.ts";
import { liquidityEstimateFixture } from "./merchant-fixtures.ts";
import { NOW } from "./fixtures.ts";

/**
 * Liquidity estimates are ADVISORY ONLY (NET-NEW, the work-order law:
 * "Liquidity estimates are NOT custody and NOT authorization").
 */
describe("liquidity estimates are advisory only (never custody, never authorization)", () => {
  it("the model vocabulary is closed and frozen", () => {
    expect([...LIQUIDITY_ESTIMATE_MODELS]).toEqual([
      "DEPTH_SNAPSHOT",
      "POOL_STATE",
      "VENUE_DECLARED",
      "AGGREGATED_DEPTH",
    ]);
    expect(Object.isFrozen(LIQUIDITY_ESTIMATE_MODELS)).toBe(true);
  });

  it("the advisory-only literal is enforced (a non-advisory record is unrepresentable)", () => {
    expect(() =>
      validateLiquidityEstimate({ ...liquidityEstimateFixture(), advisoryOnly: false }),
    ).toThrowError(/advisoryOnly must be true/);
    expect(isLiquidityAdvisoryOnly(liquidityEstimateFixture())).toBe(true);
    expect(isLiquidityAdvisoryOnly({ ...liquidityEstimateFixture(), advisoryOnly: false })).toBe(false);
  });

  it("liquidityPermitsCustody and liquidityPermitsAuthorization are first-class ALWAYS-FALSE contracts", () => {
    expect(liquidityPermitsCustody()).toBe(false);
    expect(liquidityPermitsAuthorization()).toBe(false);
    expect(liquidityPermitsCustody()).toBe(false);
    expect(liquidityPermitsAuthorization()).toBe(false);
  });

  it("a liquidity estimate is NOT funding: the estimate validates but never grounds execution scope", () => {
    const estimate = validateLiquidityEstimate(liquidityEstimateFixture());
    expect(estimate.declaredDepthMinorUnits).toBe("1000000000");
    expect(estimate.observedAt).toBe("2026-10-03T00:00:00Z");
    expect(Object.isFrozen(estimate)).toBe(true);
    expect(estimate.freshness.maxAgeSeconds).toBe(60);
  });

  it("freshness is the inclusive bound law (fresh at exactly maxAge, stale one second later)", () => {
    const estimate = validateLiquidityEstimate(liquidityEstimateFixture());
    expect(isLiquidityEstimateFresh(estimate, NOW)).toBe(true);
    expect(isLiquidityEstimateFresh(estimate, NOW + 60_000)).toBe(true);
    expect(isLiquidityEstimateFresh(estimate, NOW + 60_001)).toBe(false);
  });

  it("validation rejects malformed estimates (closed models, unbounded freshness, missing evidence)", () => {
    expect(() => validateLiquidityEstimate({ ...liquidityEstimateFixture(), model: "MAGIC" })).toThrowError(
      /closed vocabulary/,
    );
    expect(() =>
      validateLiquidityEstimate({ ...liquidityEstimateFixture(), freshness: { asOf: "2026-10-03T00:00:00Z", maxAgeSeconds: 0 } }),
    ).toThrowError(/positive/);
    expect(() => validateLiquidityEstimate({ ...liquidityEstimateFixture(), evidenceRefs: [] })).toThrowError(
      /non-empty/,
    );
    expect(() =>
      validateLiquidityEstimate({ ...liquidityEstimateFixture(), freshness: { asOf: "2026-10-03 00:00:00", maxAgeSeconds: 60 } }),
    ).toThrowError(/strict ISO-8601/);
  });

  it("even advisory numbers are exact integers (INV-F01)", () => {
    expect(() =>
      validateLiquidityEstimate({ ...liquidityEstimateFixture(), declaredDepthMinorUnits: "1.5" }),
    ).toThrowError(ValidationError);
    expect(() =>
      validateLiquidityEstimate({ ...liquidityEstimateFixture(), declaredDepthMinorUnits: "-1" }),
    ).toThrowError(ValidationError);
  });

  it("the liquidity estimate carries no authorization surface (no scope, no grant, no permission fields)", () => {
    const serialized = JSON.stringify(validateLiquidityEstimate(liquidityEstimateFixture()));
    for (const forbidden of ["authorization", "permission", "grant", "credentialRef", "transferOut"]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });

  it("a liquidity estimate never satisfies the comparability gate's funding requirement (advisory-only law)", async () => {
    // The gate's FUNDING_PAYOUT_CONSTRAINTS code vocabulary has no
    // liquidity-satisfiable path: the codes are funding/payout evidence
    // gaps, and no gap code accepts a liquidity estimate as evidence.
    const gate = await import("../src/comparability-gate.ts");
    expect([...gate.COMPARABILITY_GAP_CODES]).not.toContain("LIQUIDITY_SATISFIED");
    expect(gate.COMPARABILITY_REQUIREMENTS.includes("FUNDING_PAYOUT_CONSTRAINTS")).toBe(true);
  });

  it("scoring consumes ONLY the declared impact cost (the depth never enters valuation)", async () => {
    const { liquidityImpactCostBasisPoints } = await import("../src/liquidity.ts");
    const estimate = validateLiquidityEstimate(liquidityEstimateFixture({ declaredImpactBasisPoints: 42 }));
    expect(liquidityImpactCostBasisPoints(estimate)).toBe(42);
    expect(estimate.declaredDepthMinorUnits).toBe("1000000000");
  });

  it("an expired estimate is an honest stale record (never a silent pass)", () => {
    const stale = validateLiquidityEstimate(liquidityEstimateFixture({ asOf: "2026-10-02T00:00:00Z" }));
    expect(isLiquidityEstimateFresh(stale, NOW)).toBe(false);
  });
});
