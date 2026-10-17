/**
 * Pin-fidelity battery (P7-W2): the desktop's structural pins MUST equal
 * the recorded canonical contract vocabulary (recorded fixtures — see
 * test/fixtures/recorded-contract-vocabulary.ts for the recording method).
 * Drift fails the build rather than silently widening a contract.
 */

import { describe, expect, it } from "vitest";

import {
  PAYSWAP_DESKTOP_PIN_SET_VERSION,
  PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
  PAYSWAP_DESKTOP_PINS,
  pinById,
  pinsForPackage,
  PINNED_SURFACE_API_VERSION,
  PINNED_OUTCOME_ACTIONS,
  PINNED_OUTCOME_ACTION_IDS,
  PINNED_UNIVERSAL_AREAS,
  PINNED_UNIVERSAL_AREA_IDS,
  PINNED_SURFACE_PROGRESS_STAGES,
  PINNED_STAGE_STATUSES,
  PINNED_AUTHORIZATION_CHANGE_KINDS,
  PINNED_SETTLEMENT_ATTEMPT_STATES,
  PINNED_SETTLEMENT_ATTEMPT_EVENTS,
  PINNED_EVIDENCE_NODE_KINDS,
  PINNED_EXTERNAL_EFFECT_OUTCOMES,
  PINNED_AMBIGUITY_REASONS,
  PINNED_EXECUTION_MODES,
} from "../../src/host/payswap/index.js";
import {
  recordedBaseCommit,
  recordedSurface,
  recordedProtocol,
  recordedProviderRuntime,
  recordedStageStatuses,
  recordedQuoteFeeBases,
  recordedDeliveryEstimateKinds,
  recordedEvidenceNodeKinds,
  recordedExecutionModes,
} from "../fixtures/recorded-contract-vocabulary.js";
import { PINNED_DELIVERY_ESTIMATE_KINDS } from "../../src/host/payswap/pins/quote-terms-pins.js";
import type { PinnedQuoteFeeBasis } from "../../src/host/payswap/pins/quote-terms-pins.js";

const FEE_BASES: readonly PinnedQuoteFeeBasis[] = [
  "FLAT",
  "PERCENTAGE_OF_SOURCE",
  "PERCENTAGE_OF_TARGET",
  "PROVIDER_DISCLOSED",
];

describe("pin registry (P7-W2)", () => {
  it("the pin set is versioned and mirrors the exact base commit of this lane", () => {
    expect(PAYSWAP_DESKTOP_PIN_SET_VERSION).toBe("1.0.0");
    expect(PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT).toBe(recordedBaseCommit);
    expect(recordedBaseCommit).toBe("2999bbb1658443b72ce9644f32cabbebdbecaa37");
  });

  it("every pin records mirrored package, version, source commit and work order (canonical)", () => {
    expect(PAYSWAP_DESKTOP_PINS.length).toBe(10);
    for (const pin of PAYSWAP_DESKTOP_PINS) {
      expect(pin.mirroredPackage).toMatch(/^@payswap\//);
      expect(pin.sourceCommit).toBe(recordedBaseCommit);
      expect(pin.workOrder).toMatch(/^P\d+-W\d+$/);
      expect(pin.mirrors.length).toBeGreaterThan(20);
    }
  });

  it("pin lookup is fail-closed on unknown ids (the pin set is closed)", () => {
    expect(() => pinById("surface.nonexistent")).toThrow(/unknown pin id/);
    expect(pinsForPackage("@payswap/surface").length).toBe(8);
    expect(pinsForPackage("@payswap/protocol").length).toBe(1);
    expect(pinsForPackage("@payswap/provider-runtime").length).toBe(1);
  });
});

describe("pin fidelity vs recorded fixtures (surface pins)", () => {
  it("the pinned surface API version equals the recorded contract version", () => {
    expect(PINNED_SURFACE_API_VERSION).toBe(recordedSurface.apiVersion);
    expect(PINNED_SURFACE_API_VERSION).toBe("1.0.0");
  });

  it("the five pinned outcome actions mirror the recorded registry (ids, labels, dispatch authority, journey ids)", () => {
    expect([...PINNED_OUTCOME_ACTION_IDS]).toEqual(recordedSurface.outcomeActions.map((a) => a.id));
    expect(PINNED_OUTCOME_ACTIONS.length).toBe(5);
    for (let index = 0; index < PINNED_OUTCOME_ACTIONS.length; index += 1) {
      const pinned = PINNED_OUTCOME_ACTIONS[index];
      const recorded = recordedSurface.outcomeActions[index];
      expect(pinned.id).toBe(recorded.id);
      expect(pinned.label).toBe(recorded.label);
      expect(pinned.outcomeLine).toBe(recorded.outcomeLine);
      expect([...pinned.advancedDisclosure]).toEqual(recorded.advancedDisclosure);
      expect(pinned.dispatch.authority).toBe(recorded.dispatch.authority);
      expect(pinned.dispatch.intentKind).toBe(recorded.dispatch.intentKind);
      expect(pinned.dispatch.journeyId).toBe(recorded.dispatch.journeyId);
    }
  });

  it("the eleven pinned areas mirror the recorded IA (ids, order, labels, routes, purposes, empty states, law citations)", () => {
    expect([...PINNED_UNIVERSAL_AREA_IDS]).toEqual(recordedSurface.areaIds);
    expect(PINNED_UNIVERSAL_AREAS.length).toBe(11);
    for (let index = 0; index < PINNED_UNIVERSAL_AREAS.length; index += 1) {
      const pinned = PINNED_UNIVERSAL_AREAS[index];
      const recorded = recordedSurface.areas[index];
      expect(pinned.id).toBe(recorded.id);
      expect(pinned.label).toBe(recorded.label);
      expect(pinned.route).toBe(recorded.route);
      expect(pinned.purpose).toBe(recorded.purpose);
      expect([...pinned.lawCitations]).toEqual(recorded.lawCitations);
      expect(pinned.emptyState.reason).toBe(recorded.emptyState.reason);
      expect(pinned.emptyState.nextAction.kind).toBe(recorded.emptyState.nextAction.kind);
      expect(pinned.emptyState.nextAction.value).toBe(recorded.emptyState.nextAction.value);
    }
  });

  it("the pinned progress-stage and authorization-change vocabularies mirror the recordings", () => {
    expect([...PINNED_SURFACE_PROGRESS_STAGES]).toEqual(recordedSurface.progressStages);
    expect(PINNED_SURFACE_PROGRESS_STAGES.length).toBe(16);
    expect([...PINNED_STAGE_STATUSES]).toEqual([...recordedStageStatuses]);
    expect([...PINNED_AUTHORIZATION_CHANGE_KINDS]).toEqual(recordedSurface.authorizationChangeKinds);
    expect(PINNED_AUTHORIZATION_CHANGE_KINDS.length).toBe(8);
  });

  it("the pinned quote-terms type vocabularies mirror the source-read recordings", () => {
    expect(FEE_BASES).toEqual([...recordedQuoteFeeBases]);
    expect([...PINNED_DELIVERY_ESTIMATE_KINDS]).toEqual([...recordedDeliveryEstimateKinds]);
  });
});

describe("pin fidelity vs recorded fixtures (protocol + provider-runtime pins)", () => {
  it("the pinned settlement attempt lifecycle mirrors the recorded protocol machine", () => {
    expect([...PINNED_SETTLEMENT_ATTEMPT_STATES]).toEqual(recordedProtocol.attemptStates);
    expect([...PINNED_SETTLEMENT_ATTEMPT_EVENTS]).toEqual(recordedProtocol.attemptEvents);
    expect(PINNED_SETTLEMENT_ATTEMPT_STATES).toContain("OUTCOME_UNKNOWN");
  });

  it("the pinned evidence-kind taxonomy mirrors the recorded distinct kinds", () => {
    expect([...PINNED_EVIDENCE_NODE_KINDS]).toEqual([...recordedEvidenceNodeKinds]);
    expect(PINNED_EVIDENCE_NODE_KINDS.length).toBe(7);
  });

  it("the pinned bridge law mirrors the recorded result envelope + execution modes", () => {
    expect([...PINNED_EXTERNAL_EFFECT_OUTCOMES]).toEqual(recordedProviderRuntime.externalEffectOutcomes);
    expect([...PINNED_AMBIGUITY_REASONS]).toEqual(recordedProviderRuntime.ambiguityReasons);
    expect([...PINNED_EXECUTION_MODES]).toEqual([...recordedExecutionModes]);
  });
});
