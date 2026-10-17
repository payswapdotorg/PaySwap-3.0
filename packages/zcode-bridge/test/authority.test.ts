/**
 * Authority boundary tests (P3-W3): the never-financial-authority law —
 * the single SUBSTRATE-only boundary record, the whole-word
 * financial-authority term lint, and the surface-observation validator
 * (which enforces the same law on the data that describes surfaces).
 */

import { describe, expect, it } from "vitest";

import {
  AUTHORITY_BOUNDARY_LAW,
  BRIDGE_AUTHORITY_DOMAIN,
  FORBIDDEN_FINANCIAL_AUTHORITY_TERMS,
  SUBSTRATE_AUTHORITY_BOUNDARY,
  assertNoFinancialAuthoritySemantics,
  findFinancialAuthorityTerms,
  isAuthorityBoundary,
  isZcodeBridgeSurfaceObservation,
  validateZcodeBridgeSurfaceObservation,
  SUBSTRATE_PIN,
  TOOL_REGISTRY_SURFACE,
  ZCODE_BRIDGE_VERSION,
} from "../src/index.ts";

const VALID_OBSERVATION = {
  surfaceId: "test-surface",
  title: "Test surface",
  classification: "KEEP",
  sourcePaths: ["some/where.ts"],
  capabilities: ["describes a substrate capability"],
  authority: SUBSTRATE_AUTHORITY_BOUNDARY,
  substratePin: SUBSTRATE_PIN,
  bridgeVersion: ZCODE_BRIDGE_VERSION,
  adaptationNotes: [],
  notes: [],
} as const;

describe("authority boundary (never-financial-authority)", () => {
  it("the authority domain is SUBSTRATE and nothing else is representable", () => {
    expect(BRIDGE_AUTHORITY_DOMAIN).toBe("SUBSTRATE");
    expect(AUTHORITY_BOUNDARY_LAW).toBe("no_parallel_financial_authority");
  });

  it("the frozen boundary record states financialAuthority false and application permission only", () => {
    expect(Object.isFrozen(SUBSTRATE_AUTHORITY_BOUNDARY)).toBe(true);
    expect(SUBSTRATE_AUTHORITY_BOUNDARY.domain).toBe("SUBSTRATE");
    expect(SUBSTRATE_AUTHORITY_BOUNDARY.financialAuthority).toBe(false);
    expect(SUBSTRATE_AUTHORITY_BOUNDARY.applicationPermissionOnly).toBe(true);
  });

  it("isAuthorityBoundary accepts the exact record and rejects every mutation of it", () => {
    expect(isAuthorityBoundary(SUBSTRATE_AUTHORITY_BOUNDARY)).toBe(true);
    expect(
      isAuthorityBoundary({
        domain: "FINANCIAL",
        financialAuthority: false,
        applicationPermissionOnly: true,
        law: "no_parallel_financial_authority",
      }),
    ).toBe(false);
    expect(
      isAuthorityBoundary({
        domain: "SUBSTRATE",
        financialAuthority: true,
        applicationPermissionOnly: true,
        law: "no_parallel_financial_authority",
      }),
    ).toBe(false);
    expect(
      isAuthorityBoundary({
        domain: "SUBSTRATE",
        financialAuthority: false,
        applicationPermissionOnly: false,
        law: "no_parallel_financial_authority",
      }),
    ).toBe(false);
    expect(isAuthorityBoundary(null)).toBe(false);
    expect(isAuthorityBoundary("SUBSTRATE")).toBe(false);
  });

  it("the forbidden financial-authority vocabulary is frozen and non-empty", () => {
    expect(Object.isFrozen(FORBIDDEN_FINANCIAL_AUTHORITY_TERMS)).toBe(true);
    expect(FORBIDDEN_FINANCIAL_AUTHORITY_TERMS.length).toBeGreaterThanOrEqual(40);
    expect(FORBIDDEN_FINANCIAL_AUTHORITY_TERMS).toContain("settlement");
    expect(FORBIDDEN_FINANCIAL_AUTHORITY_TERMS).toContain("authorize");
    expect(FORBIDDEN_FINANCIAL_AUTHORITY_TERMS).toContain("custody");
    expect(FORBIDDEN_FINANCIAL_AUTHORITY_TERMS).toContain("chargeback");
  });

  it("the term lint is whole-word: 'network' never trips a net* stem rule", () => {
    expect(findFinancialAuthorityTerms("network mesh of provider nodes")).toEqual([]);
    expect(findFinancialAuthorityTerms("internetworked systems")).toEqual([]);
  });

  it("the term lint finds financial authority claims (case-insensitive, inflected)", () => {
    expect(findFinancialAuthorityTerms("settles the payment")).toEqual(["settles"]);
    expect(findFinancialAuthorityTerms("Authorize the payout")).toEqual([
      "authorize",
      "payout",
    ]);
    expect(findFinancialAuthorityTerms("holds customer CUSTODY")).toEqual(["custody"]);
    expect(findFinancialAuthorityTerms("issues a refund and a chargeback")).toEqual([
      "refund",
      "chargeback",
    ]);
  });

  it("assertNoFinancialAuthoritySemantics throws naming the offending terms", () => {
    expect(() =>
      assertNoFinancialAuthoritySemantics("clearing and settlement engine"),
    ).toThrowError(/clearing.*settlement|settlement.*clearing/);
    expect(() =>
      assertNoFinancialAuthoritySemantics("list tools in the registry"),
    ).not.toThrow();
    expect(() =>
      assertNoFinancialAuthoritySemantics("project session events to families"),
    ).not.toThrow();
  });

  it("a valid observation validates, freezes and stamps the SUBSTRATE boundary", () => {
    const observation = validateZcodeBridgeSurfaceObservation(VALID_OBSERVATION);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(observation.authority).toBe(SUBSTRATE_AUTHORITY_BOUNDARY);
    expect(observation.surfaceId).toBe("test-surface");
    expect(isZcodeBridgeSurfaceObservation(observation)).toBe(true);
  });

  it("observations with financial-authority capabilities are rejected", () => {
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        capabilities: ["authorizes payouts"],
      }),
    ).toThrowError(/forbidden financial-authority/);
  });

  it("observations claiming a foreign authority boundary are rejected", () => {
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        authority: {
          domain: "FINANCIAL",
          financialAuthority: true,
          applicationPermissionOnly: false,
          law: "some-other-law",
        },
      }),
    ).toThrowError(/authority/);
  });

  it("observations with a foreign substrate pin or bridge version are rejected", () => {
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        substratePin: "0000000000000000000000000000000000000000",
      }),
    ).toThrowError(/substratePin/);
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        bridgeVersion: "0.0.0",
      }),
    ).toThrowError(/bridgeVersion/);
  });

  it("KEEP_WITH_ADAPTATIONS requires at least one adaptation note", () => {
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        classification: "KEEP_WITH_ADAPTATIONS",
        adaptationNotes: [],
      }),
    ).toThrowError(/adaptationNotes/);
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        classification: "KEEP_WITH_ADAPTATIONS",
        adaptationNotes: ["generalized the mode vocabulary"],
      }),
    ).not.toThrow();
  });

  it("non-kebab-case surface ids and non-repo-relative source paths are rejected", () => {
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        surfaceId: "Bad_Id",
      }),
    ).toThrowError(/kebab-case/);
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        sourcePaths: ["/absolute/path.ts"],
      }),
    ).toThrowError(/repo-relative/);
    expect(() =>
      validateZcodeBridgeSurfaceObservation({
        ...VALID_OBSERVATION,
        sourcePaths: ["../escape.ts"],
      }),
    ).toThrowError(/repo-relative/);
  });

  it("the shipped tool-registry surface observation satisfies the law", () => {
    expect(isZcodeBridgeSurfaceObservation(TOOL_REGISTRY_SURFACE)).toBe(true);
    expect(TOOL_REGISTRY_SURFACE.authority.financialAuthority).toBe(false);
  });
});
