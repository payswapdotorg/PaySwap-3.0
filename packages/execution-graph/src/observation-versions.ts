/**
 * @payswap/execution-graph — the OBSERVATION VERSION LEDGER (P3-W2,
 * ENCODED LAW 1).
 *
 * "Preserve quote/route/provider observation VERSIONS (lossless — the
 * capability fabric's observations are evidence; the graph must keep the
 * exact version it decided on)."
 *
 * The ledger is an append-only, per-instance version history of capability
 * observations. Laws enforced:
 * - VERSION MONOTONITY: a new record for an instance must carry a version
 *   STRICTLY greater than every recorded version for that instance (no
 *   history rewrites, no gaps in the recorded chain's upper bound);
 * - LOSSLESS RETRIEVAL: `atVersion` returns the EXACT recorded version
 *   verbatim, no matter how many newer versions arrive afterwards; the
 *   pinned digest is re-verified on retrieval (a mismatch is corruption,
 *   never a fresher observation);
 * - IMMUTABILITY: recorded observations are deep-frozen (INV-03);
 * - STRUCTURAL VALIDATION ONLY: observations are validated fail-closed for
 *   SHAPE (instance, version, ISO stamp, two axes + derived agreement,
 *   provenance), never re-graded or re-interpreted — the capability lane
 *   owns observation semantics (INV-07: evidence, never custody).
 */

import { ObservationVersionError, ValidationError } from './errors.ts';
import { canonicalDigest, deepFreeze, requireIsoUtcTimestamp } from './canonical.ts';
import type {
  ObservationVersionLookup,
  ObservationVersionPin,
  VersionedObservationRecord,
} from './observation-version-contract.ts';
import type { CapabilityObservation } from '@payswap/capability';
import type { TimestampMs } from '@payswap/protocol';

const CAPABILITY_STATES = ['AVAILABLE', 'DEGRADED', 'UNAVAILABLE'] as const;
const SOURCE_AVAILABILITIES = ['REACHABLE', 'UNREACHABLE', 'UNKNOWN'] as const;

function isCapabilityState(value: unknown): value is (typeof CAPABILITY_STATES)[number] {
  return (
    typeof value === 'string' &&
    (CAPABILITY_STATES as readonly unknown[]).includes(value)
  );
}

function isSourceAvailability(value: unknown): value is (typeof SOURCE_AVAILABILITIES)[number] {
  return (
    typeof value === 'string' &&
    (SOURCE_AVAILABILITIES as readonly unknown[]).includes(value)
  );
}

/** Resolve the two axes into one effective availability (INV-04/07 law). */
export function resolveEffectiveAvailability(
  state: (typeof CAPABILITY_STATES)[number],
  source: (typeof SOURCE_AVAILABILITIES)[number],
): 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN' {
  switch (source) {
    case 'REACHABLE':
      return state;
    case 'UNREACHABLE':
      return 'UNKNOWN';
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}

/** Structural validation of a capability observation (shape only, fail-closed). */
export function validateObservationShape(
  observation: CapabilityObservation,
): CapabilityObservation {
  if (observation === null || typeof observation !== 'object') {
    throw new ValidationError('a capability observation must be an object');
  }
  const record = observation as unknown as Readonly<Record<string, unknown>>;
  if (typeof record['instanceId'] !== 'string' || (record['instanceId'] as string).length === 0) {
    throw new ValidationError('observation.instanceId must be a non-empty string');
  }
  const version = record['observationVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ValidationError('observation.observationVersion must be a positive integer');
  }
  if (typeof record['observedAt'] !== 'string') {
    throw new ValidationError('observation.observedAt must be a strict ISO-8601 UTC string');
  }
  requireIsoUtcTimestamp(record['observedAt'], 'observation.observedAt');
  if (!isCapabilityState(record['capabilityState'])) {
    throw new ValidationError(
      'observation.capabilityState must be AVAILABLE, DEGRADED or UNAVAILABLE',
    );
  }
  if (!isSourceAvailability(record['sourceAvailability'])) {
    throw new ValidationError(
      'observation.sourceAvailability must be REACHABLE, UNREACHABLE or UNKNOWN',
    );
  }
  const provenance = record['provenance'];
  if (
    provenance === null ||
    typeof provenance !== 'object' ||
    typeof (provenance as Record<string, unknown>)['providerName'] !== 'string' ||
    ((provenance as Record<string, unknown>)['providerName'] as string).length === 0
  ) {
    throw new ValidationError('observation.provenance must carry a providerName');
  }
  return deepFreeze(observation);
}

/** Whether the stored availability agrees with a fresh two-axis derivation. */
export function twoAxesAgree(observation: CapabilityObservation): boolean {
  const derived = resolveEffectiveAvailability(
    observation.capabilityState,
    observation.sourceAvailability,
  );
  return observation.availability === derived;
}

/** Construct the version pin of a validated observation (LAW 1 identity). */
export function pinObservation(observation: CapabilityObservation): ObservationVersionPin {
  validateObservationShape(observation);
  const pin: ObservationVersionPin = {
    instanceId: observation.instanceId,
    observationVersion: observation.observationVersion,
    observedAt: observation.observedAt,
    observationDigest: canonicalDigest(observation),
  };
  return deepFreeze(pin);
}

/** Structural validation of a pin arriving from an untyped source. */
export function validateObservationPin(pin: ObservationVersionPin): ObservationVersionPin {
  if (pin === null || typeof pin !== 'object') {
    throw new ValidationError('an ObservationVersionPin must be an object');
  }
  if (typeof pin.instanceId !== 'string' || pin.instanceId.length === 0) {
    throw new ValidationError('pin.instanceId must be a non-empty string');
  }
  if (
    typeof pin.observationVersion !== 'number' ||
    !Number.isInteger(pin.observationVersion) ||
    pin.observationVersion < 1
  ) {
    throw new ValidationError('pin.observationVersion must be a positive integer');
  }
  requireIsoUtcTimestamp(pin.observedAt, 'pin.observedAt');
  if (typeof pin.observationDigest !== 'string' || pin.observationDigest.length === 0) {
    throw new ValidationError('pin.observationDigest must be a non-empty digest string');
  }
  return deepFreeze({ ...pin });
}

/**
 * The append-only observation version ledger (LAW 1 backbone). The class
 * shape is the storage-agnostic contract; production replaces persistence,
 * never semantics.
 */
export class ObservationVersionLedger implements ObservationVersionLookup {
  readonly #byInstance = new Map<string, VersionedObservationRecord[]>();
  readonly #pins = new Map<string, ObservationVersionPin>();

  #key(instanceId: string, version: number): string {
    return `${instanceId}#${version}`;
  }

  /**
   * Record a NEW observation version. The version must be strictly greater
   * than every recorded version for the instance (monotonity); older or
   * duplicate versions are rejected — history is append-only and immutable.
   */
  record(observation: CapabilityObservation, now: TimestampMs): VersionedObservationRecord {
    const validated = validateObservationShape(observation);
    // Two-axis agreement is a RECORDING law: the ledger refuses to enter a
    // forged availability into the versioned history (fail-closed).
    if (!twoAxesAgree(validated)) {
      throw new ValidationError(
        `observation.availability '${String(validated.availability)}' does not match its two axes (an unknown/unreachable source is never success or failure)`,
      );
    }
    const history = this.#byInstance.get(validated.instanceId) ?? [];
    const latest = history[history.length - 1];
    if (latest !== undefined && validated.observationVersion <= latest.pin.observationVersion) {
      throw new ObservationVersionError(
        `observation version ${validated.observationVersion} for instance '${validated.instanceId}' does not advance the recorded history (latest recorded: ${latest.pin.observationVersion}) — history is append-only`,
      );
    }
    const pin = pinObservation(validated);
    const record: VersionedObservationRecord = deepFreeze({
      pin,
      observation: validated,
      recordedAt: now,
    });
    history.push(record);
    this.#byInstance.set(validated.instanceId, history);
    this.#pins.set(this.#key(validated.instanceId, pin.observationVersion), pin);
    return record;
  }

  /** The EXACT recorded version, preserved verbatim (LAW 1; digest re-verified). */
  atVersion(
    instanceId: string,
    observationVersion: number,
  ): VersionedObservationRecord | undefined {
    const history = this.#byInstance.get(instanceId);
    if (history === undefined) {
      return undefined;
    }
    const record = history.find((entry) => entry.pin.observationVersion === observationVersion);
    if (record === undefined) {
      return undefined;
    }
    // Digest re-verification: the preserved content must still digest to the
    // pin. A mismatch is corruption, never a fresher observation.
    const currentDigest = canonicalDigest(record.observation);
    if (currentDigest !== record.pin.observationDigest) {
      throw new ObservationVersionError(
        `preserved observation ${instanceId}#${observationVersion} no longer digests to its pin — corrupted history`,
      );
    }
    return record;
  }

  /** The latest recorded pin for an instance (convenience over history). */
  latestPinFor(instanceId: string): ObservationVersionPin | undefined {
    const history = this.#byInstance.get(instanceId);
    if (history === undefined || history.length === 0) {
      return undefined;
    }
    return history[history.length - 1]?.pin;
  }

  /** The latest recorded observation record for an instance. */
  latestFor(instanceId: string): VersionedObservationRecord | undefined {
    const history = this.#byInstance.get(instanceId);
    if (history === undefined || history.length === 0) {
      return undefined;
    }
    return history[history.length - 1];
  }

  /** Every recorded version for an instance, ascending by version. */
  historyFor(instanceId: string): readonly VersionedObservationRecord[] {
    return [...(this.#byInstance.get(instanceId) ?? [])];
  }

  /** Total number of recorded observations (test/diagnostic surface). */
  get size(): number {
    let total = 0;
    for (const history of this.#byInstance.values()) {
      total += history.length;
    }
    return total;
  }
}
