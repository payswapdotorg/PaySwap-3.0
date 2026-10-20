/**
 * @payswap/adversarial — the shared provider-detector context (P6-W3,
 * lane r4-w3; ADAPT of the deterministic-threshold discipline from the
 * onchain-security threat-intel lane: every threshold the detectors
 * consume is an explicit typed field — no hidden constants).
 *
 * The context carries:
 * - the explicit threshold set (the versioned detector policy);
 * - the confidence calibration table (mirror of the accepted
 *   threat-intel METHOD_BASE_CONFIDENCE_BPS — identical literals, no
 *   parallel calibration);
 * - the evidence helpers every detector shares (digest refs, exact
 *   deltas, corroboration sharpening).
 *
 * Deterministic only: pure data + pure functions.
 */

import { contentDigest, type DetectionMethod } from "../pins/index.ts";

// ---------------------------------------------------------------------------
// The detector thresholds (versioned, explicit, deterministic)
// ---------------------------------------------------------------------------

/**
 * The provider detector thresholds. Every number a detector compares
 * against is here — a pure, versioned input (same bundle + same
 * thresholds → byte-identical signals).
 */
export interface ProviderDetectorThresholds {
  readonly thresholdSetId: string;
  readonly version: number;
  /** Incident window (ms) at/above which an ONGOING outage is high severity. */
  readonly ongoingOutageHighMs: number;
  /** Incident window (ms) at/above which ANY outage/degradation is medium. */
  readonly incidentWindowMediumMs: number;
  /** Webhook age (ms) at/above which a pending/lost event is high. */
  readonly webhookPendingHighMs: number;
  /** Webhook age (ms) at/above which a pending/lost event is medium. */
  readonly webhookPendingMediumMs: number;
  /** Clock skew (ms) at/above which a sample is high severity. */
  readonly clockSkewHighMs: number;
  /** Clock skew (ms) at/above which a sample is medium severity. */
  readonly clockSkewMediumMs: number;
  /** Duplicate attempt count at/above which a replay is medium. */
  readonly duplicateAttemptsMedium: number;
  /** Shortfall (bps of requested) at/above which a partial capture is high. */
  readonly partialCaptureHighBps: number;
  /** Shortfall (bps of requested) at/above which a partial capture is medium. */
  readonly partialCaptureMediumBps: number;
  /** Velocity (bps over baseline) at/above which incentive activity is high. */
  readonly incentiveVelocityHighBps: number;
  /** Velocity (bps over baseline) at/above which incentive activity is medium. */
  readonly incentiveVelocityMediumBps: number;
  /** Time-since-change window (ms) inside which credential changes combine. */
  readonly credentialChangeWindowMs: number;
}

/**
 * The default threshold set (explicit, exported data — deliberate
 * cells, no magic numbers in detector bodies).
 */
export const DEFAULT_PROVIDER_THRESHOLDS: ProviderDetectorThresholds =
  Object.freeze({
    thresholdSetId: "provider-detector-defaults",
    version: 1,
    ongoingOutageHighMs: 60_000,
    incidentWindowMediumMs: 30_000,
    webhookPendingHighMs: 300_000,
    webhookPendingMediumMs: 60_000,
    clockSkewHighMs: 120_000,
    clockSkewMediumMs: 30_000,
    duplicateAttemptsMedium: 2,
    partialCaptureHighBps: 5_000,
    partialCaptureMediumBps: 1_000,
    incentiveVelocityHighBps: 8_000,
    incentiveVelocityMediumBps: 3_000,
    credentialChangeWindowMs: 900_000,
  });

/** Raised on malformed thresholds (fail closed). */
export class InvalidThresholdsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidThresholdsError";
  }
}

/** Validate a threshold set (fail closed on malformed fields). */
export function validateThresholds(thresholds: ProviderDetectorThresholds): void {
  if (thresholds.thresholdSetId.length === 0) {
    throw new InvalidThresholdsError("thresholdSetId must be non-empty");
  }
  if (!Number.isInteger(thresholds.version) || thresholds.version < 1) {
    throw new InvalidThresholdsError("thresholds.version must be an integer >= 1");
  }
  const ms = (value: number, label: string): void => {
    if (!Number.isInteger(value) || value < 0) {
      throw new InvalidThresholdsError(`${label} must be a non-negative integer (ms)`);
    }
  };
  const bps = (value: number, label: string): void => {
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      throw new InvalidThresholdsError(`${label} must be an integer in [0, 10000] bps`);
    }
  };
  ms(thresholds.ongoingOutageHighMs, "ongoingOutageHighMs");
  ms(thresholds.incidentWindowMediumMs, "incidentWindowMediumMs");
  ms(thresholds.webhookPendingHighMs, "webhookPendingHighMs");
  ms(thresholds.webhookPendingMediumMs, "webhookPendingMediumMs");
  ms(thresholds.clockSkewHighMs, "clockSkewHighMs");
  ms(thresholds.clockSkewMediumMs, "clockSkewMediumMs");
  if (!Number.isInteger(thresholds.duplicateAttemptsMedium) || thresholds.duplicateAttemptsMedium < 2) {
    throw new InvalidThresholdsError("duplicateAttemptsMedium must be an integer >= 2");
  }
  bps(thresholds.partialCaptureHighBps, "partialCaptureHighBps");
  bps(thresholds.partialCaptureMediumBps, "partialCaptureMediumBps");
  bps(thresholds.incentiveVelocityHighBps, "incentiveVelocityHighBps");
  bps(thresholds.incentiveVelocityMediumBps, "incentiveVelocityMediumBps");
  ms(thresholds.credentialChangeWindowMs, "credentialChangeWindowMs");
}

// ---------------------------------------------------------------------------
// Confidence calibration (mirror of the accepted threat-intel table)
// ---------------------------------------------------------------------------

/** Base confidence per detection method (identical literals — no parallel calibration). */
export const METHOD_BASE_CONFIDENCE_BPS: Readonly<Record<DetectionMethod, number>> =
  Object.freeze({
    exact_identity_match: 9_900,
    structural_mismatch: 9_000,
    threshold_breach: 8_000,
    behavioral_pattern: 7_000,
    registry_absence: 4_000,
  });

/** Per-independent-corroboration confidence increment (bps). */
export const CORROBORATION_INCREMENT_BPS = 300;

/** Cap on corroborating observations that may sharpen a signal. */
export const MAX_CORROBORATING_OBSERVATIONS = 3;

/** The confidence ceiling. */
export const MAX_CONFIDENCE_BPS = 10_000;

/**
 * Calibrate a detection's confidence: the method base, sharpened by up
 * to MAX_CORROBORATING_OBSERVATIONS independent corroborations, capped
 * at MAX_CONFIDENCE_BPS. Deterministic and exact (integer arithmetic).
 */
export function calibrateConfidenceBps(
  method: DetectionMethod,
  corroboratingObservations: number,
): number {
  const base = METHOD_BASE_CONFIDENCE_BPS[method];
  const capped = Math.min(
    Math.max(corroboratingObservations, 0),
    MAX_CORROBORATING_OBSERVATIONS,
  );
  return Math.min(base + capped * CORROBORATION_INCREMENT_BPS, MAX_CONFIDENCE_BPS);
}

// ---------------------------------------------------------------------------
// Evidence helpers (shared by every detector)
// ---------------------------------------------------------------------------

/** Digest refs for a set of observation ids (deterministic, ordered). */
export function digestRefsFor(observationIds: readonly string[]): readonly string[] {
  return Object.freeze(
    [...observationIds]
      .sort()
      .map((id) => contentDigest({ observationId: id })),
  );
}

/** One exact measured delta (label + value). */
export function delta(label: string, value: string): {
  readonly label: string;
  readonly value: string;
} {
  return { label, value };
}

/**
 * Exact integer shortfall in basis points: floor((requested −
 * captured) × 10_000 / requested) computed with BigInt — exact, no
 * floating point. Returns 0 when the captured amount meets or exceeds
 * the request, and 10_000 when nothing was captured at all.
 */
export function shortfallBps(requested: string, captured: string): number {
  const req = BigInt(requested);
  const cap = BigInt(captured);
  if (req <= 0n) {
    return 0n === cap ? 0 : 10_000;
  }
  if (cap >= req) {
    return 0;
  }
  const shortfall = req - cap;
  return Number((shortfall * 10_000n) / req);
}
