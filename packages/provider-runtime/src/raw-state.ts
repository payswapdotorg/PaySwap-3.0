/**
 * @payswap/provider-runtime — raw provider-state retention (P2-W2).
 *
 * INV-03/INV-14: provider responses/events are preserved LOSSLESSLY
 * (versioned, immutable) alongside a stable PaySwap projection; historical
 * facts are never rewritten. Wise §4.3: "Keep both original provider
 * status/event payload references and a stable PaySwap projection.
 * Provider-specific rollback or non-monotonic status transitions must not
 * rewrite immutable historical financial facts."
 *
 * Laws implemented here:
 *
 * 1. APPEND-ONLY per (provider, objectType, externalId, revision): an
 *    identical re-record is an idempotent replay; a divergent re-record of
 *    the same revision is a RawStateConflictError — canonical history is
 *    never overwritten (INV-03).
 * 2. SECRET REDACTION AT THE BOUNDARY (INV-19): the raw payload crosses
 *    INTO the store through `redactForArtifact` — provider semantics and
 *    structure survive untouched; secret-shaped material is replaced with
 *    auditable markers + fingerprints (redaction is NEVER silent: every
 *    record carries its `redactionNotices`).
 * 3. NON-MONOTONIC TRANSITIONS NEVER REWRITE HISTORY: a provider state
 *    that moves backwards (succeeded → processing, refund after payout)
 *    appends a NEW revision; the per-object history grows monotonically in
 *    arrival order; the projection follows the ORDERING LAW below and the
 *    history is immutable either way.
 * 4. OUT-OF-ORDER CANNOT REGRESS THE PROJECTION: the canonical projection
 *    advances only when the new record's ordering key
 *    (occurredAt ?? receivedAt, arrivalSequence) is strictly greater than
 *    the current latest. A late-arriving OLDER event is RETAINED in
 *    history but never replaces a newer canonical observation.
 *
 * The stable PaySwap projection is a VIEW: `normalize` is an additive,
 * pluggable summarizer that never erases provider semantics (the rawState
 * is always the evidence of record). The full classification envelope is
 * owned by the capability lane (P2-W1); this projection deliberately keeps
 * only the opaque normalized summary.
 */

import { RawStateConflictError, ValidationError } from './errors.ts';
import type { TimestampMs } from './clock.ts';
import { asRawStateRecordId, contentHash, type RawStateRecordId } from './identifiers.ts';
import { redactForArtifact, type RedactionNotice } from './redaction.ts';

/** Where a raw state observation came from. */
export const RAW_STATE_SOURCES = [
  'PROVIDER_RESPONSE',
  'PROVIDER_EVENT',
  'PROVIDER_RETRIEVAL',
] as const;

export type RawStateSource = (typeof RAW_STATE_SOURCES)[number];

export function isRawStateSource(value: unknown): value is RawStateSource {
  return typeof value === 'string' && (RAW_STATE_SOURCES as readonly unknown[]).includes(value);
}

/** One retained raw provider-state record (immutable, versioned, redacted-at-boundary). */
export interface RawProviderStateRecord {
  readonly recordId: RawStateRecordId;
  readonly providerName: string;
  readonly objectType: string;
  readonly externalId: string;
  /** Provider revision (verbatim provider vocabulary — never renumbered). */
  readonly revision: string;
  /** Provider-side occurrence time when the provider supplies one. */
  readonly occurredAt?: TimestampMs;
  /** PaySwap-side receipt time (always present). */
  readonly receivedAt: TimestampMs;
  readonly source: RawStateSource;
  /** Correlation/command lineage (Wise §4.4 identifier persistence). */
  readonly correlationId?: string;
  readonly commandId?: string;
  /** The retained state — redacted at the boundary, semantics preserved losslessly. */
  readonly rawState: unknown;
  /** Auditable redaction notices (empty when nothing was secret-shaped). */
  readonly redactionNotices: readonly RedactionNotice[];
  /** Content hash of the retained (redacted) state — replay identity. */
  readonly contentHash: string;
  /** Monotonic arrival sequence (projection ordering tiebreak). */
  readonly arrivalSequence: bigint;
}

/** The stable PaySwap projection for one external provider object. */
export interface ProviderProjection {
  readonly providerName: string;
  readonly objectType: string;
  readonly externalId: string;
  /** The canonical LATEST observation (ordering law in the module doc). */
  readonly latest: RawProviderStateRecord;
  /** Full immutable history in arrival order (the evidence of record). */
  readonly history: readonly RawProviderStateRecord[];
  /** Additive normalized summary (pluggable; never replaces rawState). */
  readonly normalizedSummary: unknown;
}

/**
 * The pluggable additive normalizer: derives a stable provider-neutral
 * summary from the raw state. It MUST be pure and MUST never be used to
 * overwrite `rawState` — the projection keeps both.
 */
export interface ProviderStateNormalizer {
  normalize(rawState: unknown): unknown;
}

/** The identity normalizer: the provider's own status vocabulary, verbatim. */
export const identityNormalizer: ProviderStateNormalizer = Object.freeze({
  normalize(rawState: unknown): unknown {
    if (rawState !== null && typeof rawState === 'object' && 'status' in rawState) {
      const status = (rawState as { status: unknown }).status;
      return Object.freeze({ providerStatus: status });
    }
    return Object.freeze({ preserved: true });
  },
});

/** Input to the store's append. */
export interface RawStateAppendInput {
  readonly providerName: string;
  readonly objectType: string;
  readonly externalId: string;
  readonly revision: string;
  readonly occurredAt?: TimestampMs;
  readonly receivedAt: TimestampMs;
  readonly source: RawStateSource;
  readonly correlationId?: string;
  readonly commandId?: string;
  /** The payload as received (redaction happens INSIDE append). */
  readonly rawState: unknown;
}

/**
 * The raw provider-state store (deterministic in-memory reference; durable
 * retention is a separately-accepted Work Order — the P1 deferral law).
 */
export class RawProviderStateStore {
  private readonly records = new Map<string, RawProviderStateRecord>();
  private readonly history = new Map<string, RawProviderStateRecord[]>();
  private readonly normalizer: ProviderStateNormalizer;
  private sequence = 0n;

  constructor(normalizer: ProviderStateNormalizer = identityNormalizer) {
    this.normalizer = normalizer;
  }

  /**
   * Append one observation. Redacts at the boundary (INV-19), enforces the
   * append-only law (INV-03) and returns the retained record. Identical
   * re-record of the same revision is an idempotent replay returning the
   * ORIGINAL record; divergent re-record throws RawStateConflictError.
   */
  append(input: RawStateAppendInput): RawProviderStateRecord {
    if (typeof input.providerName !== 'string' || input.providerName.length === 0) {
      throw new ValidationError('raw state append requires providerName');
    }
    if (typeof input.objectType !== 'string' || input.objectType.length === 0) {
      throw new ValidationError('raw state append requires objectType');
    }
    if (typeof input.externalId !== 'string' || input.externalId.length === 0) {
      throw new ValidationError('raw state append requires externalId');
    }
    if (typeof input.revision !== 'string' || input.revision.length === 0) {
      throw new ValidationError('raw state append requires a non-empty revision');
    }
    if (typeof input.receivedAt !== 'bigint') {
      throw new ValidationError('raw state append requires receivedAt (bigint ms)');
    }
    if (!isRawStateSource(input.source)) {
      throw new ValidationError('raw state append requires a canonical source', {
        source: input.source,
      });
    }

    // The boundary: redact BEFORE anything is retained (INV-19). Notices
    // ride on the record so redaction is auditable, never silent.
    const redaction = redactForArtifact(input.rawState);
    const retainedHash = contentHash(redaction.value);

    const objectKey = `${input.providerName}|${input.objectType}|${input.externalId}`;
    const revisionKey = `${objectKey}|${input.revision}`;
    const existing = this.records.get(revisionKey);
    if (existing !== undefined) {
      if (existing.contentHash === retainedHash) {
        return existing; // idempotent replay of the identical revision content
      }
      throw new RawStateConflictError(
        `divergent re-record of revision '${input.revision}' for ${objectKey} — canonical history is never overwritten (INV-03)`,
        { objectKey, revision: input.revision, recorded: existing.contentHash, attempted: retainedHash },
      );
    }

    this.sequence += 1n;
    const record: {
      -readonly [K in keyof RawProviderStateRecord]: RawProviderStateRecord[K];
    } = {
      recordId: asRawStateRecordId(`raw:${this.sequence}`),
      providerName: input.providerName,
      objectType: input.objectType,
      externalId: input.externalId,
      revision: input.revision,
      receivedAt: input.receivedAt,
      source: input.source,
      rawState: redaction.value,
      redactionNotices: Object.freeze([...redaction.notices]),
      contentHash: retainedHash,
      arrivalSequence: this.sequence,
    };
    if (input.occurredAt !== undefined) {
      record.occurredAt = input.occurredAt;
    }
    if (input.correlationId !== undefined) {
      record.correlationId = input.correlationId;
    }
    if (input.commandId !== undefined) {
      record.commandId = input.commandId;
    }
    const sealed = Object.freeze(record);
    this.records.set(revisionKey, sealed);
    const history = this.history.get(objectKey) ?? [];
    history.push(sealed);
    this.history.set(objectKey, history);
    return sealed;
  }

  /** The retained record for one exact revision (undefined when absent). */
  byRevision(
    providerName: string,
    objectType: string,
    externalId: string,
    revision: string,
  ): RawProviderStateRecord | undefined {
    return this.records.get(`${providerName}|${objectType}|${externalId}|${revision}`);
  }

  /** Arrival-ordered history for one external object (immutable records). */
  historyOf(
    providerName: string,
    objectType: string,
    externalId: string,
  ): readonly RawProviderStateRecord[] {
    return [...(this.history.get(`${providerName}|${objectType}|${externalId}`) ?? [])];
  }

  /**
   * The stable PaySwap projection: the LATEST record by the ordering law
   * (occurredAt ?? receivedAt, then arrival sequence). Because arrival
   * sequence increases monotonically and time dominates, a late OLDER
   * observation can never regress the projection.
   */
  projectionOf(
    providerName: string,
    objectType: string,
    externalId: string,
  ): ProviderProjection | undefined {
    const history = this.history.get(`${providerName}|${objectType}|${externalId}`);
    if (history === undefined || history.length === 0) {
      return undefined;
    }
    let latest: RawProviderStateRecord | undefined;
    for (const record of history) {
      if (latest === undefined || orderingKey(record) > orderingKey(latest)) {
        latest = record;
      }
    }
    if (latest === undefined) {
      return undefined;
    }
    const canonical = latest;
    return Object.freeze({
      providerName,
      objectType,
      externalId,
      latest: canonical,
      history: Object.freeze([...history]),
      normalizedSummary: this.normalizer.normalize(canonical.rawState),
    });
  }

  /** Total retained records (audit surface). */
  get recordCount(): number {
    let count = 0;
    for (const history of this.history.values()) {
      count += history.length;
    }
    return count;
  }
}

/** The projection ordering key: (occurredAt ?? receivedAt, arrivalSequence). */
export function orderingKey(record: RawProviderStateRecord): bigint {
  const time = record.occurredAt ?? record.receivedAt;
  // Composite: time dominates; the sequence breaks exact-time ties toward
  // the later arrival (documented ordering law — see module doc).
  return time * 1_000_000_000n + record.arrivalSequence;
}
