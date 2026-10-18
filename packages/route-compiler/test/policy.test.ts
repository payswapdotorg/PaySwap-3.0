import { describe, expect, it } from "vitest";
import { validateBestExecutionPolicy, conversionFor } from "../src/policy.ts";
import { baseBestExecutionPolicy } from "./venue-fixtures.ts";
import { CHAIN, USC_ASSET, ETH_ASSET } from "./fixtures.ts";

/**
 * The best-execution policy (PORT of the old policy suite): every
 * constant that influences a scored decision is a DECLARED field — no
 * hidden constants; validation aggregates every violation; the
 * tie-breaker order must terminate in a total order.
 */
describe("the best-execution policy (versioned, fully declared)", () => {
  it("the fixture policy validates and freezes", () => {
    const policy = validateBestExecutionPolicy(baseBestExecutionPolicy());
    expect(policy.policyId).toBe("best-execution-policy-fixture");
    expect(policy.numeraire).toBe("USC");
    expect(policy.conversions.length).toBe(2);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it("conversions must be non-empty (every touched asset must be convertible)", () => {
    expect(() => validateBestExecutionPolicy({ ...baseBestExecutionPolicy(), conversions: [] })).toThrowError(
      /non-empty/,
    );
  });

  it("duplicate conversion keys are rejected (asset identity is chain+assetId+symbol)", () => {
    const duplicate = [...baseBestExecutionPolicy().conversions, baseBestExecutionPolicy().conversions[0] as never];
    expect(() => validateBestExecutionPolicy({ ...baseBestExecutionPolicy(), conversions: duplicate })).toThrowError(
      /duplicate conversion rule/,
    );
  });

  it("the risk deduction table must be COMPLETE ('0' declared explicitly — no hidden defaults)", () => {
    const incomplete = { ...baseBestExecutionPolicy().failureRiskDeductions };
    delete (incomplete as Record<string, string>).LOW;
    expect(() =>
      validateBestExecutionPolicy({ ...baseBestExecutionPolicy(), failureRiskDeductions: incomplete }),
    ).toThrowError(/declare '0' explicitly/);
  });

  it("tie-breakers must be non-empty, unique and terminate in a total order (VENUE_ID/PLAN_ID)", () => {
    expect(() => validateBestExecutionPolicy({ ...baseBestExecutionPolicy(), tieBreakers: [] })).toThrowError(
      /non-empty/,
    );
    expect(() =>
      validateBestExecutionPolicy({
        ...baseBestExecutionPolicy(),
        tieBreakers: ["LOWER_RISK_CLASS", "LOWER_RISK_CLASS", "VENUE_ID"],
      }),
    ).toThrowError(/twice/);
    expect(() =>
      validateBestExecutionPolicy({ ...baseBestExecutionPolicy(), tieBreakers: ["LOWER_RISK_CLASS"] }),
    ).toThrowError(/terminate in VENUE_ID or PLAN_ID/);
  });

  it("a zero time budget and a non-integer version are rejected", () => {
    expect(() => validateBestExecutionPolicy({ ...baseBestExecutionPolicy(), maxSettlementMs: 0 })).toThrowError(
      /maxSettlementMs/,
    );
    expect(() => validateBestExecutionPolicy({ ...baseBestExecutionPolicy(), version: 0 })).toThrowError(/version/);
  });

  it("validation aggregates every violation into one error (the complete list)", () => {
    try {
      validateBestExecutionPolicy({
        ...baseBestExecutionPolicy(),
        policyId: "",
        version: 0,
        numeraire: "usd",
        maxSettlementMs: 0,
        tieBreakers: [],
      });
      expect.unreachable("the malformed policy must throw");
    } catch (error) {
      const details = (error as { details?: { errors?: string[] } }).details;
      const errors = details !== undefined && typeof details === "object" && "errors" in details
        ? (details as { errors: string[] }).errors
        : [];
      expect(errors.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("conversionFor matches the exact asset identity (never a symbol-only guess)", () => {
    const policy = validateBestExecutionPolicy(baseBestExecutionPolicy());
    expect(conversionFor(policy, USC_ASSET)?.rate.numerator).toBe("1");
    expect(conversionFor(policy, ETH_ASSET)?.rate.numerator).toBe("3");
    expect(conversionFor(policy, { chain: CHAIN, assetId: "other/asset:USC", symbol: "USC" })).toBeUndefined();
    expect(conversionFor(policy, { chain: "solana:mainnet-beta", assetId: USC_ASSET.assetId, symbol: "USC" })).toBeUndefined();
  });

  it("the failure-risk deduction values are canonical integer strings (INV-F01)", () => {
    const policy = validateBestExecutionPolicy(baseBestExecutionPolicy());
    expect(policy.failureRiskDeductions.LOW).toBe("0");
    expect(policy.failureRiskDeductions.MODERATE).toBe("100000");
    expect(policy.timeCostPerMs.numerator).toBe("1");
    expect(policy.timeCostPerMs.denominator).toBe("1000");
  });

  it("the venue allowlist is optional (undefined = unrestricted) and validated when present", () => {
    expect(validateBestExecutionPolicy(baseBestExecutionPolicy()).allowedVenues).toBeUndefined();
    expect(() =>
      validateBestExecutionPolicy({ ...baseBestExecutionPolicy(), allowedVenues: "nope" as unknown as string[] }),
    ).toThrowError(/allowedVenues/);
  });
});
