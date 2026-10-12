/**
 * CapabilityObservation — hierarchy layer 4 (P2-W1; ADAPT of
 * payswap.org@8a735bf packages/connectors/src/observations.ts).
 *
 * Time/versioned observations of a connected instance's availability,
 * eligibility, health, quota, terms and external state
 * (CAPABILITY-MODEL). Observations are EVIDENCE, never authorization:
 * an observation of a balance is not PaySwap custody (INV-7) and an
 * ELIGIBLE observation never substitutes for protocol authorization.
 *
 * Freshness law: every observation is freshness-STAMPED — `observedAt` is a
 * strict ISO-8601 UTC string declared as DATA by the observer (no ambient
 * clock in this library; see canonical.ts). The corridor projection
 * evaluates freshness deterministically against a caller-supplied asOf
 * timestamp plus an explicit freshness policy (maxAgeSeconds).
 *
 * The two-axis availability model (state + source availability, availability
 * DERIVED — an unreachable/unknown source yields UNKNOWN, never success,
 * never failure) is reused from availability.ts: `observeCapability`
 * derives the effective availability; callers cannot fabricate it, and
 * `validateCapabilityObservation` rejects any record whose declared
 * availability disagrees with its two axes.
 */

import { ValidationError } from './errors.ts';
import {
  isCapabilityState,
  isSourceAvailability,
  resolveEffectiveAvailability,
} from './availability.ts';
import type {
  CapabilityState,
  EffectiveAvailability,
  SourceAvailability,
} from './availability.ts';
import { parseIsoUtcTimestamp } from './canonical.ts';
import type { ProviderStateEnvelope } from './provider-state-envelope.ts';
import { isProviderStateEnvelope } from './provider-state-envelope.ts';
import { cloneAndFreeze, isNonEmptyString, isRecord } from './shared.ts';

/** Observation provenance (two-axis: state and source availability separate). */
export interface ObservationProvenance {
  readonly providerName: string;
  readonly source: 'PROVIDER_API' | 'PROVIDER_WEBHOOK' | 'OPERATOR' | 'INTERNAL';
  readonly capturedAt: string;
}

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';

export interface HealthSignal {
  readonly status: HealthStatus;
  readonly lastCheckedAt: string;
}

export interface QuotaObservation {
  readonly limit?: number;
  readonly remaining?: number;
  readonly windowSeconds?: number;
}

export interface TermsObservation {
  readonly version: string;
  readonly changePending: boolean;
}

export type EligibilityObservation = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN';

/**
 * CapabilityObservation (layer 4): scoped to a ConnectedCapabilityInstance,
 * time/versioned, and UNKNOWN whenever current reachability cannot be
 * established. `availability` is always DERIVED from the two axes.
 */
export interface CapabilityObservation {
  readonly instanceId: string;
  readonly observedAt: string;
  /** Monotonic per-instance observation version. */
  readonly observationVersion: number;
  /** Axis 1: what the capability itself reports. */
  readonly capabilityState: CapabilityState;
  /** Axis 2: whether the confirming source is reachable. */
  readonly sourceAvailability: SourceAvailability;
  /** The derived two-axis effective availability. */
  readonly availability: EffectiveAvailability;
  readonly eligibility: EligibilityObservation;
  readonly health: HealthSignal;
  readonly quota?: QuotaObservation;
  readonly terms?: TermsObservation;
  /** External state needed for execution (lossless, INV-14). */
  readonly externalState?: ProviderStateEnvelope;
  readonly provenance: ObservationProvenance;
}

/** Input to `observeCapability`: the axes are mandatory, availability is NOT. */
export interface ObserveCapabilityInput {
  readonly instanceId: string;
  readonly observedAt: string;
  readonly observationVersion: number;
  readonly capabilityState: CapabilityState;
  readonly sourceAvailability: SourceAvailability;
  readonly eligibility: EligibilityObservation;
  readonly health: HealthSignal;
  readonly quota?: QuotaObservation;
  readonly terms?: TermsObservation;
  readonly externalState?: ProviderStateEnvelope;
  readonly provenance: ObservationProvenance;
}

function isEligibility(value: unknown): value is EligibilityObservation {
  return value === 'ELIGIBLE' || value === 'NOT_ELIGIBLE' || value === 'UNKNOWN';
}

function isHealthStatus(value: unknown): value is HealthStatus {
  return (
    value === 'HEALTHY' ||
    value === 'DEGRADED' ||
    value === 'UNHEALTHY' ||
    value === 'UNKNOWN'
  );
}

/**
 * Constructs a validated observation. The effective availability is DERIVED
 * from the two axes — an unreachable or unknown source yields UNKNOWN,
 * never success or failure. There is deliberately no way to declare a
 * fabricated availability. `observedAt` and `provenance.capturedAt` must be
 * strict ISO-8601 UTC strings (freshness stamps are DATA).
 */
export function observeCapability(input: ObserveCapabilityInput): CapabilityObservation {
  const errors: string[] = [];
  if (!isRecord(input)) {
    throw new ValidationError('observation input must be an object');
  }
  if (!isNonEmptyString(input.instanceId)) {
    errors.push('instanceId must be a non-empty string');
  }
  if (!isNonEmptyString(input.observedAt)) {
    errors.push('observedAt must be a non-empty timestamp string');
  } else {
    try {
      parseIsoUtcTimestamp(input.observedAt, 'observedAt');
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  if (
    typeof input.observationVersion !== 'number' ||
    !Number.isInteger(input.observationVersion) ||
    input.observationVersion < 1
  ) {
    errors.push('observationVersion must be a positive integer');
  }
  if (!isCapabilityState(input.capabilityState)) {
    errors.push('capabilityState must be AVAILABLE, DEGRADED or UNAVAILABLE');
  }
  if (!isSourceAvailability(input.sourceAvailability)) {
    errors.push('sourceAvailability must be REACHABLE, UNREACHABLE or UNKNOWN');
  }
  if (!isEligibility(input.eligibility)) {
    errors.push('eligibility must be ELIGIBLE, NOT_ELIGIBLE or UNKNOWN');
  }
  const health = input.health;
  if (
    !isRecord(health) ||
    !isHealthStatus(health.status) ||
    !isNonEmptyString(health.lastCheckedAt)
  ) {
    errors.push('health must be { status, lastCheckedAt }');
  }
  const provenance = input.provenance;
  if (
    !isRecord(provenance) ||
    !isNonEmptyString(provenance.providerName) ||
    !isNonEmptyString(provenance.capturedAt) ||
    (provenance.source !== 'PROVIDER_API' &&
      provenance.source !== 'PROVIDER_WEBHOOK' &&
      provenance.source !== 'OPERATOR' &&
      provenance.source !== 'INTERNAL')
  ) {
    errors.push('provenance must be { providerName, source, capturedAt }');
  }
  if (
    input.externalState !== undefined &&
    !isProviderStateEnvelope(input.externalState)
  ) {
    errors.push('externalState, when present, must be a ProviderStateEnvelope (INV-14)');
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid capability observation: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }

  const availability = resolveEffectiveAvailability(
    input.capabilityState,
    input.sourceAvailability,
  );

  const observation: CapabilityObservation = {
    instanceId: input.instanceId,
    observedAt: input.observedAt,
    observationVersion: input.observationVersion,
    capabilityState: input.capabilityState,
    sourceAvailability: input.sourceAvailability,
    availability,
    eligibility: input.eligibility,
    health: Object.freeze({ ...input.health }),
    provenance: Object.freeze({ ...input.provenance }),
    ...(input.quota !== undefined ? { quota: Object.freeze({ ...input.quota }) } : {}),
    ...(input.terms !== undefined ? { terms: Object.freeze({ ...input.terms }) } : {}),
    ...(input.externalState !== undefined ? { externalState: input.externalState } : {}),
  };
  return Object.freeze(observation);
}

/**
 * Convenience constructor for the case where CURRENT REACHABILITY CANNOT BE
 * ESTABLISHED (source UNKNOWN): the last-known capability state is carried
 * as-is, the source axis is UNKNOWN, and the derived availability is
 * therefore UNKNOWN — never FAILED, never success (INV-4 discipline).
 */
export function unknownReachabilityObservation(input: {
  readonly instanceId: string;
  readonly observedAt: string;
  readonly observationVersion: number;
  readonly lastKnownCapabilityState: CapabilityState;
  readonly reason: string;
  readonly provenance: ObservationProvenance;
}): CapabilityObservation {
  return observeCapability({
    instanceId: input.instanceId,
    observedAt: input.observedAt,
    observationVersion: input.observationVersion,
    capabilityState: input.lastKnownCapabilityState,
    sourceAvailability: 'UNKNOWN',
    eligibility: 'UNKNOWN',
    health: { status: 'UNKNOWN', lastCheckedAt: input.observedAt },
    provenance: input.provenance,
  });
}

/**
 * Structural validation for observations from untyped sources: verifies the
 * derived availability actually matches the two axes (a fabricated
 * AVAILABLE on an unreachable source is rejected) and re-stamps the
 * observedAt freshness stamp shape.
 */
export function validateCapabilityObservation(
  candidate: unknown,
): CapabilityObservation {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new ValidationError('capability observation must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (
    !isCapabilityState(record.capabilityState) ||
    !isSourceAvailability(record.sourceAvailability)
  ) {
    throw new ValidationError(
      'capability observation must declare both availability axes',
    );
  }
  const expected = resolveEffectiveAvailability(
    record.capabilityState,
    record.sourceAvailability,
  );
  if (record.availability !== expected) {
    throw new ValidationError(
      `capability observation availability '${String(record.availability)}' does not match its two axes (expected '${expected}' — an unknown/unreachable source is never success or failure)`,
    );
  }
  return cloneAndFreeze(candidate as CapabilityObservation);
}
