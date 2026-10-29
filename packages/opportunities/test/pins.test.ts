import { describe, expect, it } from "vitest";
import {
  MAX_PLAUSIBLE_RETURN_PER_YEAR,
  PACKAGE_NAME,
  PINNED_CAPABILITY_STATES,
  PINNED_CURRENCY_PATTERN,
  PINNED_ECONOMIC_INPUT_KINDS,
  PINNED_INTENT_ARCHETYPES,
  PINNED_LAB_CATALOGUE_ENTRY_ONLY,
  PINNED_LAB_EXECUTION_MODES,
  PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT,
  PINNED_LAB_REJECTION_REASONS,
  PINNED_MINOR_UNIT_PATTERN,
  PINNED_PROTOCOL_COMMAND_MARKER_FIELDS,
  PINNED_PROPOSAL_SCHEMA_VERSION,
  PINNED_CORRIDOR_EXCLUSION_CODES,
  PINNED_RAIL_KEY_PATTERN,
  PINNED_SOURCE_AVAILABILITIES,
  compareRationals,
  isEvidenceStale,
  pinnedCanonicalAssetRef,
  pinnedCompareRationals,
  pinnedIsQuoteStale,
  pinnedResolveEffectiveAvailability,
  pinnedIsValidRailKey,
  validateEvidenceFreshness,
  validateExactRational,
} from "../src/index.ts";
import { MAX_AGE_MS, NOW } from "./fixtures-catalog.ts";

/**
 * The pin consistency suite (P6-W2; NET-NEW): every VALUE pin is asserted
 * against its authority's PUBLISHED law (the sibling sources read at base
 * 0755624 — value pinning, never value imports). The authorities:
 * onchain-domain (P4-W1), capability (P2-W1), economic (P1-W1),
 * route-compiler (P5-W1), lab (P6-W1), agents (P3-W1).
 */
describe("the pinned wire shapes are consistent with their authorities", () => {
  it("rail-key law (onchain-domain CHAIN_KEY_PATTERN): the canonical `${namespace}:${network}` shape", () => {
    expect(String(PINNED_RAIL_KEY_PATTERN)).toBe(
      String(/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/),
    );
    for (const valid of [
      "ethereum:mainnet",
      "fiat:sepa",
      "fx:eur-usd",
      "solana:mainnet-beta",
      "a:1",
    ]) {
      expect(pinnedIsValidRailKey(valid), valid).toBe(true);
    }
    for (const invalid of [
      "Ethereum:Mainnet",
      "ethereum",
      ":mainnet",
      "ethereum:",
      "eth reum:main net",
      "ethereum:mainnet:extra",
    ]) {
      expect(pinnedIsValidRailKey(invalid), invalid).toBe(false);
    }
  });

  it("asset-ref + symbol + minor-unit laws (onchain-domain canonicalAssetRef/SYMBOL_PATTERN/MINOR_UNIT_PATTERN)", () => {
    expect(pinnedCanonicalAssetRef("ethereum:mainnet", "USCD")).toBe(
      "ethereum:mainnet/asset:USCD",
    );
    expect(String(PINNED_MINOR_UNIT_PATTERN)).toBe(String(/^(0|[1-9][0-9]*)$/));
    expect(PINNED_MINOR_UNIT_PATTERN.test("0")).toBe(true);
    expect(PINNED_MINOR_UNIT_PATTERN.test("1000000")).toBe(true);
    expect(PINNED_MINOR_UNIT_PATTERN.test("007")).toBe(false);
    expect(PINNED_MINOR_UNIT_PATTERN.test("1.5")).toBe(false);
    expect(PINNED_MINOR_UNIT_PATTERN.test("1e7")).toBe(false);
    expect(PINNED_MINOR_UNIT_PATTERN.test("-1")).toBe(false);
  });

  it("two-axis availability law (capability resolveEffectiveAvailability): the canonical matrix, all nine pairs", () => {
    expect([...PINNED_CAPABILITY_STATES]).toEqual(["AVAILABLE", "DEGRADED", "UNAVAILABLE"]);
    expect([...PINNED_SOURCE_AVAILABILITIES]).toEqual(["REACHABLE", "UNREACHABLE", "UNKNOWN"]);
    for (const state of PINNED_CAPABILITY_STATES) {
      expect(pinnedResolveEffectiveAvailability(state, "REACHABLE")).toBe(state);
      expect(pinnedResolveEffectiveAvailability(state, "UNREACHABLE")).toBe("UNKNOWN");
      expect(pinnedResolveEffectiveAvailability(state, "UNKNOWN")).toBe("UNKNOWN");
    }
  });

  it("economic lane pins: AmountSpec currency pattern, input kinds, intent archetypes (byte-identical)", () => {
    expect(String(PINNED_CURRENCY_PATTERN)).toBe(String(/^[A-Z]{3}$/));
    expect([...PINNED_ECONOMIC_INPUT_KINDS]).toEqual([
      "QUOTE",
      "CORRIDOR",
      "FX_RATE",
      "MARKET_DATA",
      "OTHER",
    ]);
    expect([...PINNED_INTENT_ARCHETYPES]).toEqual([
      "MONEY_MOVEMENT",
      "PAYMENT",
      "SERVICE_ACCESS",
    ]);
  });

  it("exact-rational law (route-compiler exact-math): canonical forms, ordering, the pinned comparator agrees", () => {
    validateExactRational({ numerator: "0", denominator: "1" });
    expect(() => validateExactRational({ numerator: "-1", denominator: "1" })).toThrow();
    expect(() => validateExactRational({ numerator: "01", denominator: "1" })).toThrow();
    expect(() => validateExactRational({ numerator: "1", denominator: "0" })).toThrow();
    expect(() => validateExactRational({ numerator: "1", denominator: "01" })).toThrow();
    // The local comparator agrees with the pinned comparator (cross-lane law).
    const a = { numerator: "431", denominator: "10000" };
    const b = { numerator: "10", denominator: "1" };
    expect(compareRationals(a, b)).toBe(pinnedCompareRationals(a, b));
    expect(compareRationals(a, b)).toBe(-1);
    expect(compareRationals(b, a)).toBe(1);
    expect(compareRationals(a, { ...a })).toBe(0);
    // MAX_PLAUSIBLE_RETURN_PER_YEAR is exactly 10/1 (the frozen ceiling).
    expect(MAX_PLAUSIBLE_RETURN_PER_YEAR).toEqual({ numerator: "10", denominator: "1" });
  });

  it("staleness law (route-compiler quote.ts): stale iff (at − asOfMs) > maxAgeMs — the inclusive boundary", () => {
    const freshness = validateEvidenceFreshness(
      { asOfMs: NOW - MAX_AGE_MS, maxAgeMs: MAX_AGE_MS },
      "pin",
    );
    expect(isEvidenceStale(freshness, NOW)).toBe(false); // exactly maxAge old: fresh
    expect(isEvidenceStale(freshness, NOW + 1)).toBe(true); // one ms later: stale
    // The pinned comparator law agrees with the local law at every boundary.
    for (const offset of [-1, 0, 1]) {
      expect(isEvidenceStale(freshness, NOW + offset)).toBe(
        pinnedIsQuoteStale(freshness, NOW + offset),
      );
    }
    expect(() => validateEvidenceFreshness({ asOfMs: NOW, maxAgeMs: 0 }, "pin")).toThrow();
    expect(() => validateEvidenceFreshness({ asOfMs: -1, maxAgeMs: 1 }, "pin")).toThrow();
    expect(() => isEvidenceStale(freshness, -1)).toThrow(RangeError);
    expect(() => isEvidenceStale(freshness, 1.5)).toThrow(RangeError);
  });

  it("lab pins (P6-W1): execution modes, rejection reasons, the proposal-only + catalogue-only laws", () => {
    expect([...PINNED_LAB_EXECUTION_MODES]).toEqual([
      "PASS_THROUGH_NATIVE",
      "COMPOSED_PAYSWAP",
      "OPTIMIZED_MULTI_PROVIDER",
    ]);
    expect([...PINNED_LAB_REJECTION_REASONS]).toContain("CATALOGUE_ENTRY_ONLY");
    expect(PINNED_LAB_CATALOGUE_ENTRY_ONLY).toBe("CATALOGUE_ENTRY_ONLY");
    expect(PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT).toBe(
      "LAB_COMPOSITION_IS_A_PROPOSAL_NOT_A_GRANT",
    );
  });

  it("agents pins (P3-W1): the proposal schema version, types and the 18 marker fields", () => {
    expect(PINNED_PROPOSAL_SCHEMA_VERSION).toBe(1);
    expect(PINNED_PROTOCOL_COMMAND_MARKER_FIELDS).toHaveLength(18);
    expect(PINNED_PROTOCOL_COMMAND_MARKER_FIELDS[0]).toBe("idempotencyKey");
    expect(PINNED_PROTOCOL_COMMAND_MARKER_FIELDS[10]).toBe("signature");
    expect(PINNED_PROTOCOL_COMMAND_MARKER_FIELDS[17]).toBe("finalityRecordId");
  });

  it("corridor exclusion codes (P2-W1 capability corridor-types.ts:48-75): the 26 stable machine codes, byte-identical, same order", () => {
    // VALUE PIN — the authority's published CORRIDOR_EXCLUSION_CODES list
    // (read at base d28e000; value pinning, never value imports). The
    // repair-operator catalogue's totality law runs over EXACTLY this list.
    expect(Object.isFrozen(PINNED_CORRIDOR_EXCLUSION_CODES)).toBe(true);
    expect([...PINNED_CORRIDOR_EXCLUSION_CODES]).toEqual([
      "AUTHORIZATION_NOT_ACTIVE",
      "INSTANCE_INELIGIBLE",
      "MISSING_PERMISSIONS",
      "INSTANCE_GEOGRAPHY_NOT_SERVED",
      "INSTANCE_CURRENCY_NOT_SUPPORTED",
      "IMPLEMENTATION_SCOPE_NOT_SERVED",
      "AVAILABILITY_UNAVAILABLE",
      "AVAILABILITY_UNKNOWN",
      "OBSERVATION_NOT_ELIGIBLE",
      "OBSERVATION_ELIGIBILITY_UNKNOWN",
      "STALE_OBSERVATION",
      "QUOTA_EXHAUSTED",
      "SOURCE_COUNTRY_NOT_SERVED",
      "DESTINATION_COUNTRY_NOT_SERVED",
      "SOURCE_CURRENCY_NOT_SUPPORTED",
      "DESTINATION_CURRENCY_NOT_SUPPORTED",
      "CUSTOMER_TYPE_NOT_SERVED",
      "AMOUNT_BELOW_MINIMUM",
      "AMOUNT_ABOVE_MAXIMUM",
      "AMOUNT_CURRENCY_MISMATCH",
      "FUNDING_METHOD_NOT_SERVED",
      "PAYOUT_METHOD_NOT_SERVED",
      "RECIPIENT_TYPE_NOT_SERVED",
      "MISSING_REQUIRED_FIELDS",
      "CUTOFF_PASSED",
      "NOT_EXECUTABLE_CAPABILITY",
    ]);
    expect(new Set(PINNED_CORRIDOR_EXCLUSION_CODES).size).toBe(26);
  });

  it("the package identity (the barrel law)", () => {
    expect(PACKAGE_NAME).toBe("@payswap/opportunities");
  });
});
