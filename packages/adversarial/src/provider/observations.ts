/**
 * @payswap/adversarial — provider observations (P6-W3, lane r4-w3;
 * NET-NEW observation contracts for the ADAPTED provider detectors —
 * the old W2-007 harness drove the real old-repo subsystems directly;
 * the re-based detectors consume PURE OBSERVATION DATA shaped like the
 * old subsystems' evidence surfaces).
 *
 * A provider observation is a TIME-STAMPED REPORT of external state —
 * an observation, never custody, never authority (INV-7/INV-11
 * discipline). The bundle is the single deterministic input of every
 * provider detector: same bundle + same thresholds → byte-identical
 * signals.
 *
 * Shapes mirror the evidence surfaces the old fault families attacked:
 * - incident recorder entries (provider_outage, ambiguous_provider);
 * - outbox/webhook delivery states (lost_webhooks);
 * - provider timestamp samples vs the local deterministic instant
 *   (clock_skew);
 * - idempotency registrar entries (duplicated_commands);
 * - capture records with exact amounts (partial_payment);
 * - agent action-attempt telemetry (malicious_agent);
 * - sealed-release integrity digests (package_compromise);
 * - contribution/reward/leaderboard records (incentive abuse);
 * - credential-change signals (account_takeover).
 *
 * Deterministic only: pure data; every instant is an explicit field.
 */

import type { AmountSpec, ChainRef } from "../pins/index.ts";

// ---------------------------------------------------------------------------
// Provider/rail incidents (the incident-recorder surface)
// ---------------------------------------------------------------------------

/** A provider or rail incident observation (INV-4: `unknown` never `failed`). */
export interface ProviderIncidentObservation {
  /** e.g. `incident:<providerRef>:<seq>`. */
  readonly observationId: string;
  /** e.g. `provider:card-acquirer-a` / `rail:onchain:ethereum:mainnet`. */
  readonly providerRef: string;
  /** The chain the incident is scoped to, when onchain. */
  readonly chainRef?: ChainRef;
  readonly incidentKind: "outage" | "degradation" | "maintenance" | "unknown";
  /** Window start (ms); the window is ONGOING while windowEnd is absent. */
  readonly windowStart: number;
  readonly windowEnd?: number;
  readonly observedAt: number;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// Webhook / outbox delivery (the outbox surface)
// ---------------------------------------------------------------------------

/** The delivery state of one expected provider event (outbox view). */
export interface WebhookDeliveryObservation {
  /** e.g. `webhook:<providerRef>:<eventId>`. */
  readonly observationId: string;
  readonly providerRef: string;
  readonly eventId: string;
  readonly status: "delivered" | "pending" | "lost";
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  /** Completed re-drain attempts for this event. */
  readonly redrains: number;
}

// ---------------------------------------------------------------------------
// Provider clock samples (the deterministic-clock surface)
// ---------------------------------------------------------------------------

/** One provider timestamp sample against the local deterministic instant. */
export interface ProviderClockObservation {
  /** e.g. `clock:<providerRef>:<seq>`. */
  readonly observationId: string;
  readonly providerRef: string;
  /** The timestamp the provider attached to its response. */
  readonly providerObservedAt: number;
  /** The local deterministic instant the response arrived at. */
  readonly localObservedAt: number;
}

// ---------------------------------------------------------------------------
// Idempotency (the registrar surface)
// ---------------------------------------------------------------------------

/** One idempotency-key attempt history entry. */
export interface CommandAttemptObservation {
  /** e.g. `idempotency:<registrarRef>:<key>`. */
  readonly observationId: string;
  readonly idempotencyKey: string;
  readonly attemptCount: number;
  /** A mutated payload attempted to re-bind the same key (CONFLICT path). */
  readonly bindingChanged: boolean;
  readonly lastAttemptAt: number;
}

// ---------------------------------------------------------------------------
// Captures (the exact-amount surface)
// ---------------------------------------------------------------------------

/** One provider capture record with exact requested vs captured amounts. */
export interface CaptureObservation {
  /** e.g. `capture:<providerRef>:<paymentRef>`. */
  readonly observationId: string;
  readonly providerRef: string;
  readonly paymentRef: string;
  readonly requested: AmountSpec;
  readonly captured?: AmountSpec;
  readonly status: "captured" | "partially_captured" | "unknown";
}

// ---------------------------------------------------------------------------
// Agent behavior (the delegation telemetry surface)
// ---------------------------------------------------------------------------

/** One delegated-agent action attempt (behavioral telemetry). */
export interface AgentBehaviorObservation {
  /** e.g. `agent:<agentKeyRef>:<seq>`. */
  readonly observationId: string;
  readonly agentKeyRef: string;
  readonly attemptedAction: string;
  /** A command-shaped payload smuggled at depth (proposal-smuggling path). */
  readonly proposalShapeValid: boolean;
  /** An unrestricted transfer was requested. */
  readonly unrestrictedTransfer: boolean;
  /** Authority widening was attempted on any dimension. */
  readonly authorityWidening: boolean;
  readonly observedAt: number;
}

// ---------------------------------------------------------------------------
// Package integrity (the sealed-release surface)
// ---------------------------------------------------------------------------

/** One deployed-package integrity check against the sealed release. */
export interface PackageIntegrityObservation {
  /** e.g. `package:<packageRef>:<version>`. */
  readonly observationId: string;
  readonly packageRef: string;
  readonly version: string;
  readonly expectedContentDigest: string;
  readonly observedContentDigest: string;
  readonly observedAt: number;
}

// ---------------------------------------------------------------------------
// Incentive records (the participation surface)
// ---------------------------------------------------------------------------

/** One incentive-program record observation. */
export interface IncentiveRecordObservation {
  /** e.g. `incentive:<programRef>:<seq>`. */
  readonly observationId: string;
  readonly programRef: string;
  readonly recordKind: "contribution" | "reward" | "leaderboard_entry";
  readonly participantRef: string;
  /** The record failed provenance validation (fabricated). */
  readonly fabricated: boolean;
  /** Rank was presented as authorization. */
  readonly rankClaimed: boolean;
  /** Participant activity velocity vs baseline, integer basis points. */
  readonly velocityBps: number;
  readonly observedAt: number;
}

// ---------------------------------------------------------------------------
// Credential changes (the signal surface)
// ---------------------------------------------------------------------------

/** One credential-change signal observation (account-takeover input). */
export interface CredentialChangeObservation {
  /** e.g. `credential:<principalRef>:<seq>`. */
  readonly observationId: string;
  readonly principalRef: string;
  readonly changeKind:
    | "device_change"
    | "sim_change"
    | "account_change"
    | "beneficiary_change";
  /** Time since the previous verified change of this kind (ms). */
  readonly sincePreviousChangeMs: number;
  /** A sensitive action was attempted within the change window. */
  readonly combinedWithAuthorizationUse: boolean;
  readonly observedAt: number;
}

// ---------------------------------------------------------------------------
// The bundle (the detectors' single deterministic input)
// ---------------------------------------------------------------------------

/** Everything the provider detectors consume (pure data). */
export interface ProviderObservationBundle {
  readonly observerRef: string;
  readonly observedAt: number;
  readonly incidents: readonly ProviderIncidentObservation[];
  readonly webhookDeliveries: readonly WebhookDeliveryObservation[];
  readonly clockSamples: readonly ProviderClockObservation[];
  readonly commandAttempts: readonly CommandAttemptObservation[];
  readonly captures: readonly CaptureObservation[];
  readonly agentBehaviors: readonly AgentBehaviorObservation[];
  readonly packageIntegrities: readonly PackageIntegrityObservation[];
  readonly incentiveRecords: readonly IncentiveRecordObservation[];
  readonly credentialChanges: readonly CredentialChangeObservation[];
}

/** Raised on a structurally invalid bundle (fail closed). */
export class InvalidProviderObservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProviderObservationError";
  }
}

/**
 * Validate a bundle: every entry id non-empty, every provider ref
 * non-empty, exact amounts well-formed where present. Fail closed — an
 * invalid bundle produces NO detections, never guesses.
 */
export function validateProviderObservationBundle(
  bundle: ProviderObservationBundle,
): void {
  if (bundle.observerRef.length === 0) {
    throw new InvalidProviderObservationError("bundle requires an observerRef");
  }
  const idOf = (id: string, label: string): void => {
    if (id.length === 0) {
      throw new InvalidProviderObservationError(`${label} requires an observationId`);
    }
  };
  for (const incident of bundle.incidents) {
    idOf(incident.observationId, "incident");
    if (incident.providerRef.length === 0) {
      throw new InvalidProviderObservationError("incident requires a providerRef");
    }
    if (
      incident.windowEnd !== undefined &&
      incident.windowEnd < incident.windowStart
    ) {
      throw new InvalidProviderObservationError(
        `incident '${incident.observationId}': windowEnd before windowStart`,
      );
    }
  }
  for (const webhook of bundle.webhookDeliveries) {
    idOf(webhook.observationId, "webhook delivery");
    if (webhook.eventId.length === 0) {
      throw new InvalidProviderObservationError("webhook delivery requires an eventId");
    }
    if (webhook.lastSeenAt < webhook.firstSeenAt) {
      throw new InvalidProviderObservationError(
        `webhook '${webhook.observationId}': lastSeenAt before firstSeenAt`,
      );
    }
  }
  for (const clock of bundle.clockSamples) {
    idOf(clock.observationId, "clock sample");
    if (clock.providerRef.length === 0) {
      throw new InvalidProviderObservationError("clock sample requires a providerRef");
    }
  }
  for (const attempt of bundle.commandAttempts) {
    idOf(attempt.observationId, "command attempt");
    if (attempt.idempotencyKey.length === 0) {
      throw new InvalidProviderObservationError("command attempt requires an idempotencyKey");
    }
    if (!Number.isInteger(attempt.attemptCount) || attempt.attemptCount < 1) {
      throw new InvalidProviderObservationError(
        `command attempt '${attempt.observationId}': attemptCount must be an integer >= 1`,
      );
    }
  }
  for (const capture of bundle.captures) {
    idOf(capture.observationId, "capture");
    if (capture.paymentRef.length === 0) {
      throw new InvalidProviderObservationError("capture requires a paymentRef");
    }
    if (capture.requested.currency.length === 0) {
      throw new InvalidProviderObservationError("capture requires a requested amount");
    }
  }
  for (const behavior of bundle.agentBehaviors) {
    idOf(behavior.observationId, "agent behavior");
    if (behavior.agentKeyRef.length === 0) {
      throw new InvalidProviderObservationError("agent behavior requires an agentKeyRef");
    }
    if (behavior.attemptedAction.length === 0) {
      throw new InvalidProviderObservationError("agent behavior requires an attemptedAction");
    }
  }
  for (const integrity of bundle.packageIntegrities) {
    idOf(integrity.observationId, "package integrity");
    if (integrity.packageRef.length === 0) {
      throw new InvalidProviderObservationError("package integrity requires a packageRef");
    }
    if (integrity.expectedContentDigest.length === 0 || integrity.observedContentDigest.length === 0) {
      throw new InvalidProviderObservationError(
        `package integrity '${integrity.observationId}': both digests are mandatory`,
      );
    }
  }
  for (const record of bundle.incentiveRecords) {
    idOf(record.observationId, "incentive record");
    if (record.participantRef.length === 0) {
      throw new InvalidProviderObservationError("incentive record requires a participantRef");
    }
    if (!Number.isInteger(record.velocityBps) || record.velocityBps < 0) {
      throw new InvalidProviderObservationError(
        `incentive record '${record.observationId}': velocityBps must be a non-negative integer`,
      );
    }
  }
  for (const change of bundle.credentialChanges) {
    idOf(change.observationId, "credential change");
    if (change.principalRef.length === 0) {
      throw new InvalidProviderObservationError("credential change requires a principalRef");
    }
  }
}
