/**
 * Test helpers: deterministic fixture builders (P6-W3, lane r4-w3).
 *
 * SECRET HYGIENE (the hard law): every credential-shaped fixture value
 * is ASSEMBLED AT RUNTIME from non-secret fragments — no 64-hex (raw
 * key shaped) literal exists anywhere in this tree. The agent key
 * "fingerprints" below are deterministic composition fixtures only.
 *
 * Deterministic only: fixed constants, pure builders.
 */

import type {
  AgentBehaviorObservation,
  CaptureObservation,
  CommandAttemptObservation,
  CredentialChangeObservation,
  IncentiveRecordObservation,
  PackageIntegrityObservation,
  ProviderClockObservation,
  ProviderIncidentObservation,
  ProviderObservationBundle,
  WebhookDeliveryObservation,
} from "../src/provider/index.ts";
import type { EvidenceRef } from "../src/index.ts";
import type { ProviderDetectorThresholds } from "../src/provider/index.ts";
import { DEFAULT_PROVIDER_THRESHOLDS } from "../src/provider/index.ts";

/** The fixed deterministic test epoch (ms). */
export const T0 = 1_766_000_000_000;

/** A tighter threshold set for fast, deterministic detector tests. */
export const TIGHT_THRESHOLDS: ProviderDetectorThresholds = Object.freeze({
  ...DEFAULT_PROVIDER_THRESHOLDS,
  thresholdSetId: "test-tight",
  version: 2,
  ongoingOutageHighMs: 1_000,
  incidentWindowMediumMs: 500,
  webhookPendingHighMs: 2_000,
  webhookPendingMediumMs: 1_000,
  clockSkewHighMs: 5_000,
  clockSkewMediumMs: 1_000,
  duplicateAttemptsMedium: 2,
  partialCaptureHighBps: 5_000,
  partialCaptureMediumBps: 1_000,
  incentiveVelocityHighBps: 8_000,
  incentiveVelocityMediumBps: 3_000,
  credentialChangeWindowMs: 60_000,
});

// ---------------------------------------------------------------------------
// Runtime-fragment-assembled credential fixtures (never literal)
// ---------------------------------------------------------------------------

const KEY_FRAGMENT_A = "e0" + "3b" + "71" + "04";
const KEY_FRAGMENT_B = "9f" + "1c" + "aa" + "27";
const KEY_FRAGMENT_C = "5d" + "8e" + "42" + "b6";

/** A deterministic agent-key fixture (assembled from fragments at runtime). */
export function agentKeyFixture(index: number): string {
  const fragments = [KEY_FRAGMENT_A, KEY_FRAGMENT_B, KEY_FRAGMENT_C];
  const fragment = fragments[index % fragments.length] ?? KEY_FRAGMENT_A;
  return `key-fingerprint-${index}-${fragment}`;
}

/** A deterministic content-digest-shaped fixture (runtime-assembled). */
export function digestFixture(label: string, index: number): string {
  return `fnv1a64:${label}-${index}-${KEY_FRAGMENT_A}${index % 10}`;
}

/** One evidence ref fixture (content-addressed). */
export function evidenceRefFixture(label: string, index: number): EvidenceRef {
  return {
    evidenceId: `evidence:${label}:${index}`,
    artifactRef: `artifact:${label}:${index}`,
    contentDigest: digestFixture(label, index),
  };
}

// ---------------------------------------------------------------------------
// Provider observation bundle builders
// ---------------------------------------------------------------------------

export interface BundleOverrides {
  readonly incidents?: readonly ProviderIncidentObservation[];
  readonly webhookDeliveries?: readonly WebhookDeliveryObservation[];
  readonly clockSamples?: readonly ProviderClockObservation[];
  readonly commandAttempts?: readonly CommandAttemptObservation[];
  readonly captures?: readonly CaptureObservation[];
  readonly agentBehaviors?: readonly AgentBehaviorObservation[];
  readonly packageIntegrities?: readonly PackageIntegrityObservation[];
  readonly incentiveRecords?: readonly IncentiveRecordObservation[];
  readonly credentialChanges?: readonly CredentialChangeObservation[];
}

/** An empty bundle (all detectors silent). */
export function emptyBundle(overrides: BundleOverrides = {}): ProviderObservationBundle {
  return {
    observerRef: "observer:test-harness",
    observedAt: T0,
    incidents: [],
    webhookDeliveries: [],
    clockSamples: [],
    commandAttempts: [],
    captures: [],
    agentBehaviors: [],
    packageIntegrities: [],
    incentiveRecords: [],
    credentialChanges: [],
    ...overrides,
  };
}

/** One provider incident observation fixture (windowEnd: undefined = ongoing). */
export function incidentFixture(
  partial: Omit<Partial<ProviderIncidentObservation>, "windowEnd"> & {
    observationId: string;
    windowEnd?: number | undefined;
  },
): ProviderIncidentObservation {
  const base: Omit<ProviderIncidentObservation, "windowEnd"> = {
    providerRef: partial.providerRef ?? "provider:card-acquirer-a",
    incidentKind: partial.incidentKind ?? "outage",
    windowStart: partial.windowStart ?? T0 - 2_000,
    observedAt: partial.observedAt ?? T0,
    detail: partial.detail ?? "synthetic incident fixture",
    ...(partial.chainRef === undefined ? {} : { chainRef: partial.chainRef }),
    observationId: partial.observationId,
  };
  // An EXPLICIT windowEnd mention is authoritative (undefined = ongoing
  // window); an absent mention defaults to a closed window.
  if ("windowEnd" in partial) {
    return partial.windowEnd === undefined
      ? { ...base }
      : { ...base, windowEnd: partial.windowEnd };
  }
  return { ...base, windowEnd: T0 - 500 };
}

/** One command-attempt observation fixture. */
export function commandAttemptFixture(
  partial: Partial<CommandAttemptObservation> & { observationId: string },
): CommandAttemptObservation {
  return {
    idempotencyKey: "idem-key-1",
    attemptCount: 1,
    bindingChanged: false,
    lastAttemptAt: T0,
    ...partial,
  };
}

/** One webhook delivery observation fixture. */
export function webhookFixture(
  partial: Partial<WebhookDeliveryObservation> & { observationId: string },
): WebhookDeliveryObservation {
  return {
    providerRef: "provider:card-acquirer-a",
    eventId: "evt-1",
    status: "pending",
    firstSeenAt: T0 - 10_000,
    lastSeenAt: T0,
    redrains: 0,
    ...partial,
  };
}

/** One clock sample fixture. */
export function clockFixture(
  partial: Partial<ProviderClockObservation> & { observationId: string },
): ProviderClockObservation {
  return {
    providerRef: "provider:card-acquirer-a",
    providerObservedAt: T0 - 60_000,
    localObservedAt: T0,
    ...partial,
  };
}

/** One capture observation fixture. */
export function captureFixture(
  partial: Partial<CaptureObservation> & { observationId: string },
): CaptureObservation {
  return {
    providerRef: "provider:card-acquirer-a",
    paymentRef: "pay-1",
    requested: { currency: "USD", minorUnits: "10000" },
    status: "partially_captured",
    ...partial,
  };
}

/** One agent behavior observation fixture. */
export function agentBehaviorFixture(
  partial: Partial<AgentBehaviorObservation> & { observationId: string },
): AgentBehaviorObservation {
  return {
    agentKeyRef: agentKeyFixture(0),
    attemptedAction: "payment.attempt.resolve",
    proposalShapeValid: true,
    unrestrictedTransfer: false,
    authorityWidening: false,
    observedAt: T0,
    ...partial,
  };
}

/** One package integrity observation fixture. */
export function packageIntegrityFixture(
  partial: Partial<PackageIntegrityObservation> & { observationId: string },
): PackageIntegrityObservation {
  return {
    packageRef: "pkg:checkout-extension",
    version: "1.4.2",
    expectedContentDigest: digestFixture("sealed", 0),
    observedContentDigest: digestFixture("sealed", 0),
    observedAt: T0,
    ...partial,
  };
}

/** One incentive record observation fixture. */
export function incentiveRecordFixture(
  partial: Partial<IncentiveRecordObservation> & { observationId: string },
): IncentiveRecordObservation {
  return {
    programRef: "program:referral-wave-3",
    recordKind: "contribution",
    participantRef: "user:participant-7",
    fabricated: false,
    rankClaimed: false,
    velocityBps: 0,
    observedAt: T0,
    ...partial,
  };
}

/** One credential change observation fixture. */
export function credentialChangeFixture(
  partial: Partial<CredentialChangeObservation> & { observationId: string },
): CredentialChangeObservation {
  return {
    principalRef: "user:customer-9",
    changeKind: "sim_change",
    sincePreviousChangeMs: 30_000,
    combinedWithAuthorizationUse: true,
    observedAt: T0,
    ...partial,
  };
}
