import { describe, expect, it } from "vitest";
import {
  PINNED_CAPABILITY_CLASSES,
  PINNED_CAPABILITY_STATES,
  PINNED_EXECUTION_MODES,
  PINNED_EXECUTION_MODE_VOCABULARY_VERSION,
  PINNED_SOURCE_AVAILABILITIES,
  PINNED_STRATEGY_DIRECTIVE_KINDS,
  isPinnedCapabilityClass,
  isPinnedCapabilityState,
  isPinnedExecutionMode,
  isPinnedSourceAvailability,
  isPinnedStrategyDirectiveKind,
  pinObservation,
  pinnedIsIncumbentBaselineDefinition,
  pinnedIsSearchableByLab,
  pinnedLooksLikeConnectedInstance,
  resolvePinnedEffectiveAvailability,
} from "@payswap/lab";
import type { PinnedConnectedInstance } from "@payswap/lab";
import { makeInstance, makeCatalogueEntry, makeSmartContractExtension, makeCertification } from "./fixtures.ts";

/**
 * The pinned wire shapes (P6-W1, NET-NEW): every external seam pinned
 * locally, byte-identical where the authority publishes a VALUE, subset
 * typed where the authority owns a STRUCTURE. Cross-lane consistency is
 * asserted here because the pins are the ONLY contact surface until the
 * TL wires the real imports at integration.
 
 * Site classification (this file): 0 old sites (NET-NEW FILE — the pin
 * surface did not exist in the old corpus; the old equivalents were
 * sibling-import assertions now illegal under the zero-sibling law) +
 * 6 NET-NEW sites (execution-mode vocabulary byte-identity, capability-
 * class vocabulary, the two-axis resolver matrix over all nine pairs,
 * subset-typed instance assignability, the catalogue-vs-instance law,
 * the smart-contract searchability law + directive vocabulary) = 6
 * tests.
 */

describe("the pinned wire shapes (commit 1/4 surface)", () => {
  it("the execution-mode vocabulary is byte-identical to the capability lane's (INV-15: no priority)", () => {
    // VALUE PIN — authority: @payswap/capability EXECUTION_MODES. The
    // members, ORDER and count are the authority's; no priority is encoded.
    expect(PINNED_EXECUTION_MODES).toEqual([
      "PASS_THROUGH_NATIVE",
      "COMPOSED_PAYSWAP",
      "OPTIMIZED_MULTI_PROVIDER",
    ]);
    expect(Object.isFrozen(PINNED_EXECUTION_MODES)).toBe(true);
    expect(PINNED_EXECUTION_MODE_VOCABULARY_VERSION).toBe("1.0.0");
    for (const mode of PINNED_EXECUTION_MODES) {
      expect(isPinnedExecutionMode(mode)).toBe(true);
    }
    expect(isPinnedExecutionMode("COMPOSED_PAYSWAP_V2")).toBe(false);
  });

  it("the capability-class vocabulary is byte-identical to the capability lane's (13 members)", () => {
    expect(PINNED_CAPABILITY_CLASSES).toEqual([
      "rail_movement",
      "liquidity",
      "fx",
      "credit",
      "lending",
      "merchant_acceptance",
      "identity_kyc_aml",
      "expert_resolution",
      "agent_behavior",
      "software_extension",
      "developer_service",
      "verification",
      "data_oracle",
    ]);
    expect(Object.isFrozen(PINNED_CAPABILITY_CLASSES)).toBe(true);
    for (const cls of PINNED_CAPABILITY_CLASSES) {
      expect(isPinnedCapabilityClass(cls)).toBe(true);
    }
    expect(isPinnedCapabilityClass("bank_transfer")).toBe(false);
  });

  it("the two-axis resolver agrees with the canonical matrix over all nine pairs", () => {
    expect([...PINNED_CAPABILITY_STATES]).toEqual(["AVAILABLE", "DEGRADED", "UNAVAILABLE"]);
    expect([...PINNED_SOURCE_AVAILABILITIES]).toEqual(["REACHABLE", "UNREACHABLE", "UNKNOWN"]);
    for (const state of PINNED_CAPABILITY_STATES) expect(isPinnedCapabilityState(state)).toBe(true);
    for (const source of PINNED_SOURCE_AVAILABILITIES) expect(isPinnedSourceAvailability(source)).toBe(true);
    // The canonical matrix (authority: @payswap/capability
    // resolveEffectiveAvailability): REACHABLE -> state governs;
    // UNREACHABLE/UNKNOWN -> UNKNOWN (never success, never failure).
    for (const state of PINNED_CAPABILITY_STATES) {
      expect(resolvePinnedEffectiveAvailability(state, "REACHABLE")).toBe(state);
      expect(resolvePinnedEffectiveAvailability(state, "UNREACHABLE")).toBe("UNKNOWN");
      expect(resolvePinnedEffectiveAvailability(state, "UNKNOWN")).toBe("UNKNOWN");
    }
    // The observation constructor derives availability from the axes only.
    const observed = pinObservation({
      instanceId: "inst-matrix",
      observedAt: "2026-10-01T00:00:00Z",
      observationVersion: 1,
      capabilityState: "AVAILABLE",
      sourceAvailability: "UNREACHABLE",
      eligibility: "ELIGIBLE",
      health: { status: "HEALTHY", lastCheckedAt: "2026-10-01T00:00:00Z" },
      provenance: { providerName: "psp-mock", source: "PROVIDER_API", capturedAt: "2026-10-01T00:00:00Z" },
    });
    expect(observed.availability).toBe("UNKNOWN");
  });

  it("a fully-populated authority-shaped instance value is assignable to the pinned subset", () => {
    // SUBSET TYPING: the pinned interface accepts a real instance-shaped
    // value (the authority's shape is a superset — assignment just works).
    const realShaped: PinnedConnectedInstance = makeInstance({
      instanceId: "inst-subset",
      capabilityId: "psp.subset",
    });
    expect(realShaped.authorization.status).toBe("ACTIVE");
    expect(realShaped.eligibility.eligible).toBe(true);
    expect(pinnedLooksLikeConnectedInstance(realShaped)).toBe(true);
    expect(pinnedLooksLikeConnectedInstance(null)).toBe(false);
    expect(pinnedLooksLikeConnectedInstance(42)).toBe(false);
  });

  it("the catalogue-vs-instance law: a catalogue entry never looks like a connected instance (INV-13)", () => {
    const catalogueEntry = makeCatalogueEntry({ capabilityId: "psp.advertised" });
    expect(pinnedLooksLikeConnectedInstance(catalogueEntry)).toBe(false);
    // The incumbent-baseline predicate reads the declared native
    // optimization benchmark flag exactly (INV-15).
    expect(
      pinnedIsIncumbentBaselineDefinition({
        capabilityId: "psp.native",
        capabilityVersion: "1.0.0",
        summary: "s",
        kind: "WRITE",
        requiredPermissions: [],
        executionModes: ["PASS_THROUGH_NATIVE"],
        nativeOptimization: { optimizationKind: "ROUTING", benchmarkBaseline: true },
      }),
    ).toBe(true);
    expect(
      pinnedIsIncumbentBaselineDefinition({
        capabilityId: "psp.plain",
        capabilityVersion: "1.0.0",
        summary: "s",
        kind: "WRITE",
        requiredPermissions: [],
        executionModes: ["COMPOSED_PAYSWAP"],
      }),
    ).toBe(false);
  });

  it("the smart-contract searchability law and the strategy-directive vocabulary (searchable only after certification)", () => {
    const searchable = makeSmartContractExtension({ searchable: true });
    const notSearchable = makeSmartContractExtension({ searchable: false });
    expect(pinnedIsSearchableByLab(searchable, "CERTIFIED")).toBe(true);
    expect(pinnedIsSearchableByLab(searchable, "SUSPENDED")).toBe(false);
    expect(pinnedIsSearchableByLab(notSearchable, "CERTIFIED")).toBe(false);
    expect(makeCertification({ subjectId: "x" }).status).toBe("CERTIFIED");

    // The WHAT-vocabulary of strategy directives (authority:
    // @payswap/execution-graph STRATEGY_DIRECTIVE_KINDS).
    expect(PINNED_STRATEGY_DIRECTIVE_KINDS).toEqual([
      "SETTLE_NOW",
      "BATCH",
      "NET_LATER",
      "HOLD_FOR_REVIEW",
    ]);
    for (const kind of PINNED_STRATEGY_DIRECTIVE_KINDS) {
      expect(isPinnedStrategyDirectiveKind(kind)).toBe(true);
    }
    expect(isPinnedStrategyDirectiveKind("SETTLE_LATER")).toBe(false);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger: NONE (NET-NEW FILE)
// ---------------------------------------------------------------------------
// The old corpus asserted the sibling shapes by IMPORTING them
// (@payswap/capabilities, @payswap/connectors) — illegal under the
// zero-sibling pins law of this rebuild. This suite re-asserts the same
// guarantees against the LOCAL pin surface: byte-identity of VALUE pins
// against the authority's published values, subset typing of STRUCTURE
// pins, and the two pinned laws (searchability-after-certification;
// catalogue-vs-instance). Six sites, all NET-NEW.
// ---------------------------------------------------------------------------
// Authority-map receipts (the seams this suite pins)
// ---------------------------------------------------------------------------
// - execution modes + vocabulary version -> @payswap/capability (P2-W1)
// - capability classes (13)               -> @payswap/capability
// - the two-axis resolver matrix          -> @payswap/capability
// - the observation subset + constructor  -> @payswap/capability
// - certification + smart-contract shapes -> @payswap/capability
// - the strategy-program seam             -> @payswap/execution-graph (P3-W2)
// - the directive WHAT-vocabulary         -> @payswap/execution-graph
// Byte-identity is asserted for every VALUE pin; assignability both ways
// is asserted for the strategy-program STRUCTURE pin in
// type-contracts.test.ts.
// ---------------------------------------------------------------------------
// Rename receipts (the two accepted P6-W1 renames, pinned)
// ---------------------------------------------------------------------------
// executionMode -> execution: the search query, the searched candidate,
// the promotion-candidate evaluation and the baseline candidates all
// carry the field name `execution` of the SAME pinned vocabulary type
// (asserted here for the vocabulary; the field-name receipt is asserted
// in search.test.ts and baseline-candidates.test.ts).
// ServiceAccess -> DECLARED_CAPABILITY: the building-block kind (asserted
// in domain-packs.test.ts together with the predicate that rejects the
// old kind name).
