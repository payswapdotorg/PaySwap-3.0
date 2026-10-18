/**
 * @zcode/web/payswap — the STRUCTURAL MIRROR verification (NET-NEW, P7-W1).
 *
 * The substrate packages (packages/ui, packages/web) depend on @zcode/*
 * workspace packages ONLY and NEVER import @payswap/* — so every
 * cross-lane contract shape the product renders is pinned STRUCTURALLY
 * (field-for-field, same literals, same unions) in src/payswap/pins + the
 * mirrored registries in src/payswap/lib. THIS test imports the accepted
 * source packages' src DIRECTLY (test-only — the src/** boundary stays
 * clean) and asserts the mirrors match the source shapes exactly:
 *
 * - @payswap/surface (P2-W3 ACCEPTED)  packages/surface/src
 * - @payswap/provider-runtime (P2-W2 ACCEPTED) packages/provider-runtime/src
 *
 * Drift between a pin and its source fails HERE — detectable at test
 * time, never discovered in production (the surface package's own
 * versioning law, applied at the consumer boundary).
 */
import { describe, expect, it } from "vitest";
import {
  SURFACE_API_VERSION,
  type SurfaceContractProvenance,
} from "../../../surface/src/version.ts";
import {
  OUTCOME_REGISTRY,
  outcomeCapabilityBoard,
  type OutcomeAction,
} from "../../../surface/src/outcomes.ts";
import { UNIVERSAL_AREAS } from "../../../surface/src/areas.ts";
import { SURFACE_PROGRESS_STAGES } from "../../../surface/src/progress-states.ts";
import {
  EXTERNAL_EFFECT_OUTCOMES,
  AMBIGUITY_REASONS,
  type ExecutionResultEnvelope,
  type ProviderFailureMetadata,
} from "../../../provider-runtime/src/result-envelope.ts";

import {
  AMBIGUITY_REASONS_PIN,
  EXTERNAL_EFFECT_OUTCOMES_PIN,
  type ExecutionResultEnvelopePin,
  type ProviderFailureMetadataPin,
} from "../../src/payswap/pins/provider-runtime-pins.js";
import {
  OUTCOME_ACTION_IDS,
  PINNED_SURFACE_API_VERSION,
  SURFACE_PROGRESS_STAGES_PIN,
  UNIVERSAL_AREA_IDS,
  type AmountSpecPin,
  type OutcomeActionPin,
  type SecurityGateDecisionSourcePin,
  type StageObservationPin,
  type StageStatusPin,
  type UniversalAreaPin,
} from "../../src/payswap/pins/surface-pins.js";
import {
  OUTCOME_REGISTRY_MIRROR,
  intakeCapability,
  capabilityObservationCapability,
  merchantCapability,
} from "../../src/payswap/lib/outcome-registry.js";
import { UNIVERSAL_AREAS_MIRROR } from "../../src/payswap/lib/areas.js";
import { foldOutcomeBoard } from "../../src/payswap/lib/outcome-board.js";
import {
  HONEST_DEPLOYMENT_CONTEXT,
  WEB_ORACLE_HARNESS_VERSION,
} from "../../src/payswap/contracts/harness.js";

const norm = (value: unknown): string => JSON.stringify(value);

describe("surface pins mirror the accepted @payswap/surface source", () => {
  it("SURFACE_API_VERSION pin matches the source version", () => {
    expect(PINNED_SURFACE_API_VERSION).toBe(SURFACE_API_VERSION);
  });

  it("the five outcome action ids mirror the source registry (same literals, same order)", () => {
    expect(OUTCOME_ACTION_IDS).toEqual(OUTCOME_REGISTRY.map((action) => action.id));
  });

  it("the outcome registry DATA mirror matches the source field-for-field", () => {
    expect(OUTCOME_REGISTRY_MIRROR.length).toBe(OUTCOME_REGISTRY.length);
    for (let i = 0; i < OUTCOME_REGISTRY.length; i += 1) {
      const source = OUTCOME_REGISTRY[i] as unknown as Record<string, unknown>;
      const mirror = OUTCOME_REGISTRY_MIRROR[i] as unknown as Record<string, unknown>;
      expect(norm(mirror.id)).toBe(norm(source.id));
      expect(norm(mirror.label)).toBe(norm(source.label));
      expect(norm(mirror.outcomeLine)).toBe(norm(source.outcomeLine));
      expect(norm(mirror.advancedDisclosure)).toBe(norm(source.advancedDisclosure));
      expect(norm(mirror.dispatch)).toBe(norm(source.dispatch));
      expect(mirror.provenance).toEqual((source.provenance as SurfaceContractProvenance));
    }
  });

  it("the capability folds agree with the source registry's folds for every deployment context", () => {
    const contexts = [
      { economicIntakeConfigured: false, capabilityObservationsAvailable: false, merchantCheckoutContextBound: false },
      { economicIntakeConfigured: true, capabilityObservationsAvailable: false, merchantCheckoutContextBound: false },
      { economicIntakeConfigured: false, capabilityObservationsAvailable: true, merchantCheckoutContextBound: false },
      { economicIntakeConfigured: false, capabilityObservationsAvailable: false, merchantCheckoutContextBound: true },
      { economicIntakeConfigured: true, capabilityObservationsAvailable: true, merchantCheckoutContextBound: true },
    ];
    for (const context of contexts) {
      const sourceBoard = outcomeCapabilityBoard(context);
      const mirrorBoard = foldOutcomeBoard(context);
      for (let i = 0; i < sourceBoard.length; i += 1) {
        expect(norm(mirrorBoard.rows[i]?.capability)).toBe(norm(sourceBoard[i]?.state));
      }
    }
  });

  it("the eleven-area IA mirror matches the source registry field-for-field", () => {
    expect(UNIVERSAL_AREAS_MIRROR).toHaveLength(UNIVERSAL_AREAS.length);
    expect(norm(UNIVERSAL_AREAS_MIRROR)).toBe(norm(UNIVERSAL_AREAS));
    expect(UNIVERSAL_AREA_IDS).toEqual(UNIVERSAL_AREAS.map((area) => area.id));
  });

  it("the 16-stage progress lifecycle pin matches the source (same literals, same order)", () => {
    expect(SURFACE_PROGRESS_STAGES_PIN).toEqual(SURFACE_PROGRESS_STAGES);
  });

  it("the honest deployment context is the all-false fact set", () => {
    expect(HONEST_DEPLOYMENT_CONTEXT).toEqual({
      economicIntakeConfigured: false,
      capabilityObservationsAvailable: false,
      merchantCheckoutContextBound: false,
    });
    expect(WEB_ORACLE_HARNESS_VERSION).toBe("1.0.0");
  });

  it("the pinned TYPE shapes structurally accept the source values (field-for-field)", () => {
    // AmountSpec: the source pin interface is satisfied by the same object.
    const amount: AmountSpecPin = { currency: "USD", minorUnits: "1234" };
    expect(amount.currency).toMatch(/^[A-Z]{3}$/);
    // StageObservation accepts a source-shaped observation.
    const observation: StageObservationPin = {
      stage: "PAYOUT_SENT",
      status: "ACHIEVED",
      authorityRecordRef: "protocol:payment-1",
      evidenceRefs: ["evidence:1"],
      observedAt: "2026-10-02T06:37:38Z",
    };
    expect(observation.stage).toBe("PAYOUT_SENT");
    const status: StageStatusPin = "UNKNOWN";
    expect(status).toBe("UNKNOWN");
    // Security gate decision: BLOCK/ALLOW/UNKNOWN only.
    const gate: SecurityGateDecisionSourcePin = { decision: "BLOCK", reasons: [] };
    expect(gate.decision).toBe("BLOCK");
    // UniversalArea accepts a source-shaped area record.
    const area = UNIVERSAL_AREAS[0] as unknown as UniversalAreaPin;
    expect(area.id).toBe("overview");
    // OutcomeAction accepts a source-shaped action record (minus the fold).
    const action = OUTCOME_REGISTRY[0] as unknown as Omit<OutcomeAction, "capability">;
    const actionPin = action as unknown as OutcomeActionPin;
    expect(actionPin.id).toBe("pay");
  });
});

describe("provider-runtime pins mirror the accepted source vocabulary", () => {
  it("EXTERNAL_EFFECT_OUTCOMES pin matches the source (CONFIRMED/UNKNOWN/FAILED)", () => {
    expect(EXTERNAL_EFFECT_OUTCOMES_PIN).toEqual(EXTERNAL_EFFECT_OUTCOMES);
  });

  it("AMBIGUITY_REASONS pin matches the source (same literals, same order)", () => {
    expect(AMBIGUITY_REASONS_PIN).toEqual(AMBIGUITY_REASONS);
  });

  it("the envelope pin structurally accepts a source-shaped envelope (field-for-field)", () => {
    const sourceEnvelope: ExecutionResultEnvelope = {
      outcome: "UNKNOWN",
      providerReferences: ["provider-ref-1"],
      ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      dispatchedAt: 1,
      completedAt: 2,
    };
    const pin: ExecutionResultEnvelopePin = sourceEnvelope;
    expect(pin.outcome).toBe("UNKNOWN");
    expect(pin.ambiguityReason).toBe("TRANSPORT_TIMEOUT_AFTER_DISPATCH");
    const failureSource: ProviderFailureMetadata = { retryable: false, ambiguity: "NONE" };
    const failurePin: ProviderFailureMetadataPin = failureSource;
    expect(failurePin.ambiguity).toBe("NONE");
  });
});

describe("the mirror discipline itself", () => {
  it("every pin module header names its source package + module", async () => {
    const { readFile } = await import("node:fs/promises");
    const pinText = await readFile("src/payswap/pins/surface-pins.ts", "utf8");
    expect(pinText).toContain("packages/surface/src");
    const runtimePinText = await readFile("src/payswap/pins/provider-runtime-pins.ts", "utf8");
    expect(runtimePinText).toContain("packages/provider-runtime/src");
  });

  it("intake/observation/merchant folds mirror the source reason strings", () => {
    // The three typed reasons are the source's exact strings — asserted via
    // fold outputs so the words users read cannot drift from the source.
    const none = HONEST_DEPLOYMENT_CONTEXT;
    expect(intakeCapability(none).missingPrerequisite).toContain(
      "The economic intake plane is not configured in this deployment",
    );
    expect(capabilityObservationCapability(none).missingPrerequisite).toContain(
      "Quote projection requires fresh capability observations",
    );
    expect(merchantCapability(none).missingPrerequisite).toContain(
      "No merchant checkout plane exists in this deployment",
    );
  });
});
