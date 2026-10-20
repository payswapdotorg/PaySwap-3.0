/**
 * The provider detectors (P6-W3, lane r4-w3; ADAPT of the fault-module
 * sites from payswap.org@8a735bf packages/adversarial — every family's
 * injection re-based as an evidence-generating detection; the
 * injection checks become observation-grounded signals).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_THRESHOLDS,
  runAllProviderDetectors,
  calibrateConfidenceBps,
  shortfallBps,
  validateThresholds,
  InvalidThresholdsError,
  validateProviderObservationBundle,
  InvalidProviderObservationError,
  METHOD_BASE_CONFIDENCE_BPS,
  type ProviderThreatSignal,
} from "../src/provider/index.ts";
import {
  agentBehaviorFixture,
  captureFixture,
  clockFixture,
  commandAttemptFixture,
  credentialChangeFixture,
  emptyBundle,
  incidentFixture,
  incentiveRecordFixture,
  packageIntegrityFixture,
  TIGHT_THRESHOLDS,
  T0,
  webhookFixture,
} from "./helpers.ts";

function signalsFor(
  overrides: Parameters<typeof emptyBundle>[0],
  thresholds = TIGHT_THRESHOLDS,
): readonly ProviderThreatSignal[] {
  return runAllProviderDetectors({ bundle: emptyBundle(overrides), thresholds });
}

describe("the provider detectors (every family exactly once)", () => {
  it("an empty bundle produces zero signals", () => {
    expect(signalsFor({})).toEqual([]);
    expect(signalsFor({}, DEFAULT_PROVIDER_THRESHOLDS)).toEqual([]);
  });

  it("duplicated_commands: a held replay is medium; a mutated re-binding is CONFLICT-grade high", () => {
    const [replay] = signalsFor({
      commandAttempts: [commandAttemptFixture({ observationId: "idempotency:reg:1", attemptCount: 3 })],
    });
    expect(replay?.family).toBe("duplicated_commands");
    expect(replay?.code).toBe("duplicate_replay_held");
    expect(replay?.severity).toBe("medium");
    expect(replay?.summary).toContain("one authoritative result");
    const [conflict] = signalsFor({
      commandAttempts: [
        commandAttemptFixture({ observationId: "idempotency:reg:2", attemptCount: 2, bindingChanged: true }),
      ],
    });
    expect(conflict?.code).toBe("mutated_rebinding_conflict");
    expect(conflict?.severity).toBe("high");
    expect(conflict?.evidence.observationRefs).toEqual(["idempotency:reg:2"]);
    expect(conflict?.evidence.deltas).toContainEqual({ label: "attemptCount", value: "2" });
  });

  it("lost_webhooks: pending/lost events are evidenced, never silently dropped (graded by age)", () => {
    const [medium] = signalsFor({
      webhookDeliveries: [
        webhookFixture({ observationId: "webhook:p:evt-1", firstSeenAt: T0 - 1_500, status: "pending" }),
      ],
    });
    expect(medium?.family).toBe("lost_webhooks");
    expect(medium?.severity).toBe("medium");
    const [high] = signalsFor({
      webhookDeliveries: [
        webhookFixture({ observationId: "webhook:p:evt-2", firstSeenAt: T0 - 5_000, status: "lost" }),
      ],
    });
    expect(high?.severity).toBe("high");
    expect(high?.summary).toContain("PENDING");
    expect(signalsFor({
      webhookDeliveries: [webhookFixture({ observationId: "webhook:p:evt-3", status: "delivered" })],
    })).toEqual([]);
  });

  it("ambiguous_provider: an unknown incident is UNKNOWN — never FAILED (INV-4)", () => {
    const [signal] = signalsFor({
      incidents: [incidentFixture({ observationId: "incident:p:1", incidentKind: "unknown" })],
    });
    expect(signal?.family).toBe("ambiguous_provider");
    expect(signal?.severity).toBe("high");
    expect(signal?.summary).toContain("never FAILED");
    expect(signal?.summary).toContain("blind retry is forbidden");
  });

  it("provider_outage: windows are evidenced with exact durations; ongoing windows grade higher", () => {
    const [closed] = signalsFor({
      incidents: [incidentFixture({ observationId: "incident:p:2", windowStart: T0 - 800, windowEnd: T0 - 100 })],
    });
    expect(closed?.family).toBe("provider_outage");
    expect(closed?.code).toBe("outage_window_evidenced");
    expect(closed?.severity).toBe("medium");
    expect(closed?.evidence.deltas).toContainEqual({ label: "durationMs", value: "700" });
    const [ongoing] = signalsFor({
      incidents: [incidentFixture({ observationId: "incident:p:3", windowStart: T0 - 2_000, windowEnd: undefined })],
    });
    expect(ongoing?.code).toBe("outage_window_ongoing");
    expect(ongoing?.severity).toBe("high");
    expect(ongoing?.evidence.deltas).toContainEqual({ label: "ongoing", value: "1" });
    // Maintenance windows are not outage detections.
    expect(signalsFor({
      incidents: [incidentFixture({ observationId: "incident:p:4", incidentKind: "maintenance" })],
    })).toEqual([]);
  });

  it("clock_skew: exact skew deltas; regression escalates to high", () => {
    const [skew] = signalsFor({
      clockSamples: [
        clockFixture({ observationId: "clock:p:1", providerObservedAt: T0 - 2_000, localObservedAt: T0 }),
      ],
    });
    expect(skew?.family).toBe("clock_skew");
    expect(skew?.severity).toBe("medium");
    expect(skew?.evidence.deltas).toContainEqual({ label: "skewMs", value: "2000" });
    const [regressed] = signalsFor({
      clockSamples: [
        clockFixture({ observationId: "clock:p:2", providerObservedAt: T0 - 1_000, localObservedAt: T0 }),
        clockFixture({ observationId: "clock:p:3", providerObservedAt: T0 - 9_000, localObservedAt: T0 }),
      ],
    });
    expect(regressed?.summary).toContain("REGRESSED");
    expect(regressed?.severity).toBe("high");
    // A small skew is silent.
    expect(signalsFor({
      clockSamples: [clockFixture({ observationId: "clock:p:4", providerObservedAt: T0 - 100, localObservedAt: T0 })],
    })).toEqual([]);
  });

  it("partial_payment: the shortfall is EXACT integer bps (BigInt, no floating point)", () => {
    const [short] = signalsFor({
      captures: [
        captureFixture({
          observationId: "capture:p:pay-1",
          captured: { currency: "USD", minorUnits: "9500" },
        }),
      ],
    });
    expect(short?.family).toBe("partial_payment");
    expect(short?.evidence.deltas).toContainEqual({ label: "shortfallBps", value: "500" });
    expect(short?.summary).toContain("PARTIALLY_EXECUTED");
    const [unknown] = signalsFor({
      captures: [captureFixture({ observationId: "capture:p:pay-2", status: "unknown" })],
    });
    expect(unknown?.code).toBe("capture_outcome_unknown");
    expect(unknown?.severity).toBe("medium");
    const [mismatch] = signalsFor({
      captures: [
        captureFixture({
          observationId: "capture:p:pay-3",
          captured: { currency: "EUR", minorUnits: "10000" },
        }),
      ],
    });
    expect(mismatch?.code).toBe("capture_currency_mismatch");
    expect(mismatch?.severity).toBe("high");
    expect(shortfallBps("10000", "9500")).toBe(500);
    expect(shortfallBps("10000", "10000")).toBe(0);
    expect(shortfallBps("10000", "0")).toBe(10_000);
    expect(shortfallBps("3", "1")).toBe(6_666);
  });

  it("account_takeover: a credential change combined with sensitive use is CRITICAL (epoch bump + quarantine)", () => {
    const [takeover] = signalsFor({
      credentialChanges: [credentialChangeFixture({ observationId: "credential:u:1" })],
    });
    expect(takeover?.family).toBe("account_takeover");
    expect(takeover?.severity).toBe("critical");
    expect(takeover?.summary).toContain("epoch bump");
    expect(takeover?.summary).toContain("re-verification");
    const [velocity] = signalsFor({
      credentialChanges: [
        credentialChangeFixture({ observationId: "credential:u:2", combinedWithAuthorizationUse: false }),
      ],
    });
    expect(velocity?.code).toBe("credential_change_velocity");
    expect(velocity?.severity).toBe("medium");
  });

  it("malicious_agent: smuggled proposals, unrestricted transfers and widening are denied with reasons", () => {
    const signals = signalsFor({
      agentBehaviors: [
        agentBehaviorFixture({
          observationId: "agent:k:1",
          proposalShapeValid: false,
          unrestrictedTransfer: true,
          authorityWidening: true,
        }),
      ],
    });
    const codes = signals.filter((s) => s.family === "malicious_agent").map((s) => s.code);
    expect(codes).toEqual([
      "smuggled_command_proposal",
      "unrestricted_transfer_request",
      "authority_widening_attempt",
    ]);
    const smuggled = signals.find((s) => s.code === "smuggled_command_proposal");
    expect(smuggled?.severity).toBe("critical");
    expect(signals.find((s) => s.code === "authority_widening_attempt")?.severity).toBe("high");
    // The honest attenuated path is silent (recovery works).
    expect(signalsFor({
      agentBehaviors: [agentBehaviorFixture({ observationId: "agent:k:2" })],
    })).toEqual([]);
  });

  it("package_compromise: a sealed-release digest divergence is CRITICAL (exact identity match)", () => {
    const [compromise] = signalsFor({
      packageIntegrities: [
        packageIntegrityFixture({
          observationId: "package:pkg:1.4.2",
          observedContentDigest: "fnv1a64:0000000000000009",
        }),
      ],
    });
    expect(compromise?.family).toBe("package_compromise");
    expect(compromise?.severity).toBe("critical");
    expect(compromise?.method).toBe("exact_identity_match");
    expect(compromise?.summary).toContain("sealed release is immutable");
    expect(signalsFor({
      packageIntegrities: [packageIntegrityFixture({ observationId: "package:pkg:1.4.3" })],
    })).toEqual([]);
  });

  it("incentive_sybil_collusion_wash: fabricated records, rank-as-authorization and velocity are detected", () => {
    const signals = signalsFor({
      incentiveRecords: [
        incentiveRecordFixture({ observationId: "incentive:prog:1", fabricated: true }),
        incentiveRecordFixture({ observationId: "incentive:prog:2", rankClaimed: true }),
        incentiveRecordFixture({ observationId: "incentive:prog:3", velocityBps: 9_000 }),
      ],
    });
    const abuse = signals.filter((s) => s.family === "incentive_sybil_collusion_wash");
    expect(new Set(abuse.map((s) => s.code))).toEqual(
      new Set(["fabricated_record_excluded", "rank_as_authorization_refused", "velocity_anomaly"]),
    );
    expect(abuse.find((s) => s.code === "velocity_anomaly")?.severity).toBe("high");
    const [clawback] = abuse.filter((s) => s.code === "rank_as_authorization_refused");
    expect(clawback?.summary).toContain("SEPARATE");
  });

  it("leaderboard_gaming: gamed entries and ranking velocity are detected; rank never widens authority", () => {
    const signals = signalsFor({
      incentiveRecords: [
        incentiveRecordFixture({
          observationId: "incentive:prog:4",
          recordKind: "leaderboard_entry",
          fabricated: true,
        }),
        incentiveRecordFixture({
          observationId: "incentive:prog:5",
          recordKind: "leaderboard_entry",
          velocityBps: 4_000,
        }),
      ],
    });
    const gaming = signals.filter((s) => s.family === "leaderboard_gaming");
    expect(new Set(gaming.map((s) => s.code))).toEqual(
      new Set(["gamed_entry_excluded", "ranking_velocity_anomaly"]),
    );
    expect(gaming.find((s) => s.code === "ranking_velocity_anomaly")?.severity).toBe("medium");
  });

  it("the sweep runs every family exactly once and orders signals deterministically (severity desc)", () => {
    const bundle = emptyBundle({
      incidents: [incidentFixture({ observationId: "incident:p:9", incidentKind: "unknown" })],
      agentBehaviors: [
        agentBehaviorFixture({ observationId: "agent:k:9", proposalShapeValid: false }),
      ],
      commandAttempts: [
        commandAttemptFixture({ observationId: "idempotency:reg:9", attemptCount: 2 }),
      ],
    });
    const signals = runAllProviderDetectors({ bundle, thresholds: TIGHT_THRESHOLDS });
    expect(signals.map((s) => s.family)).toEqual([
      "malicious_agent",
      "ambiguous_provider",
      "duplicated_commands",
    ]);
    // Determinism: identical bundle → byte-identical signal ids.
    const again = runAllProviderDetectors({ bundle, thresholds: TIGHT_THRESHOLDS });
    expect(again.map((s) => s.signalId)).toEqual(signals.map((s) => s.signalId));
  });

  it("every signal carries a complete evidence chain (observation-grounded, digest-linked)", () => {
    const signals = signalsFor({
      incidents: [incidentFixture({ observationId: "incident:p:8", windowStart: T0 - 5_000, windowEnd: undefined })],
    });
    for (const signal of signals) {
      expect(signal.evidence.observationRefs.length).toBeGreaterThan(0);
      expect(signal.evidence.digestRefs.length).toBe(signal.evidence.observationRefs.length);
      expect(signal.confidenceBps).toBeGreaterThanOrEqual(0);
      expect(signal.confidenceBps).toBeLessThanOrEqual(10_000);
      expect(signal.signalId).toMatch(/^fnv1a64:/);
    }
  });

  it("confidence calibration mirrors the accepted table (method base + corroboration, capped)", () => {
    expect(METHOD_BASE_CONFIDENCE_BPS.exact_identity_match).toBe(9_900);
    expect(METHOD_BASE_CONFIDENCE_BPS.registry_absence).toBe(4_000);
    expect(calibrateConfidenceBps("exact_identity_match", 0)).toBe(9_900);
    expect(calibrateConfidenceBps("exact_identity_match", 2)).toBe(10_000);
    expect(calibrateConfidenceBps("registry_absence", 99)).toBe(4_900);
  });

  it("thresholds and bundles fail closed on malformed input", () => {
    expect(() => validateThresholds({ ...TIGHT_THRESHOLDS, version: 0 })).toThrowError(
      InvalidThresholdsError,
    );
    expect(() => validateThresholds({ ...TIGHT_THRESHOLDS, partialCaptureHighBps: 20_000 })).toThrowError(
      /basis points/,
    );
    expect(() => validateThresholds({ ...TIGHT_THRESHOLDS, duplicateAttemptsMedium: 1 })).toThrowError(
      />= 2/,
    );
    expect(() =>
      validateProviderObservationBundle({ ...emptyBundle(), observerRef: "" }),
    ).toThrowError(InvalidProviderObservationError);
    expect(() =>
      validateProviderObservationBundle(
        emptyBundle({ incidents: [incidentFixture({ observationId: "", providerRef: "p" })] }),
      ),
    ).toThrowError(/observationId/);
    expect(() =>
      validateProviderObservationBundle(
        emptyBundle({
          incidents: [incidentFixture({ observationId: "incident:p:x", windowStart: 10, windowEnd: 5 })],
        }),
      ),
    ).toThrowError(/windowEnd before windowStart/);
  });
});
