/**
 * @payswap/execution-graph — OBSERVATION-VERSION PRESERVATION contracts
 * (P3-W2, ENCODED LAW 1).
 *
 * Work-order law (P3-W2): "Preserve quote/route/provider observation
 * versions (lossless — the capability fabric's observations are evidence;
 * the graph must keep the exact version it decided on)."
 *
 * Every graph decision that rests on a provider/capability observation must
 * pin the EXACT observation version it was made on, and the pinned
 * observation content must stay retrievable VERBATIM after any number of
 * newer versions arrive. Canonical citations: INV-03 (historical facts are
 * immutable and versioned), INV-07 (external state is observation evidence,
 * never custody), INV-14 (provider state preserved where needed for
 * action/reconciliation/audit).
 *
 * `CapabilityObservation` is PINNED type-only from @payswap/capability (the
 * observation authority): this package stores and preserves observations;
 * it never re-derives, re-grades or re-interprets them (structural
 * validation only — fail-closed shape checks, never semantics changes).
 */

import type { CapabilityObservation } from '@payswap/capability';
import type { TimestampMs } from '@payswap/protocol';

/**
 * A pinned reference to the EXACT observation version a graph decision was
 * made on. The digest binds the pin to the observation content: a pin whose
 * recorded content no longer digests to `observationDigest` is a corruption,
 * never a fresher observation.
 */
export interface ObservationVersionPin {
  /** The observed ConnectedCapabilityInstance. */
  readonly instanceId: string;
  /** The monotonic per-instance observation version that was decided on. */
  readonly observationVersion: number;
  /** The observation's own freshness stamp (strict ISO-8601 UTC, DATA). */
  readonly observedAt: string;
  /** Canonical digest of the recorded observation content (FNV-1a 64). */
  readonly observationDigest: string;
}

/** The pinned fields of an ObservationVersionPin (canonical order). */
export const OBSERVATION_VERSION_PIN_KEYS = [
  'instanceId',
  'observationDigest',
  'observationVersion',
  'observedAt',
] as const;

/**
 * One losslessly preserved versioned observation record. The observation is
 * carried VERBATIM (INV-14): the graph may read it for action,
 * reconciliation, support, audit and reprocessing, and may never flatten or
 * overwrite its provider lifecycle semantics.
 */
export interface VersionedObservationRecord {
  /** The version pin (identity of this record). */
  readonly pin: ObservationVersionPin;
  /** The preserved observation, exactly as recorded (lossless). */
  readonly observation: CapabilityObservation;
  /** When the graph recorded this observation (caller-supplied instant). */
  readonly recordedAt: TimestampMs;
}

/**
 * The lossless lookup shape: the exact recorded version, never "latest".
 * Retrieval by version is total over recorded history — `latestFor` is a
 * convenience over the same immutable history, never a replacement for it.
 */
export interface ObservationVersionLookup {
  /** The latest recorded observation pin for an instance (highest version). */
  latestPinFor(instanceId: string): ObservationVersionPin | undefined;
  /** The EXACT recorded version, preserved verbatim (LAW 1). */
  atVersion(instanceId: string, observationVersion: number): VersionedObservationRecord | undefined;
  /** Every recorded version for an instance, ascending by version. */
  historyFor(instanceId: string): readonly VersionedObservationRecord[];
}
