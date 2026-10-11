/**
 * @payswap/protocol — provider revision ledger: append-only provider-state
 * history (P1-W2).
 *
 * Adapted from payswap.org@8a735bf packages/settlement/src/reconciliation.ts
 * (old Work Order W1-004, the ProviderRevisionLedger half; old INV-C06 maps
 * to canonical INV-14: provider state is preserved where needed for
 * action/reconciliation/audit).
 *
 * CROSS-LANE PIN: the old ledger imported `ProviderStateEnvelope` from
 * @payswap/connectors. That package belongs to the provider/capability
 * lanes (P2) and is not imported here (dependency-free in flight). The
 * structural envelope shape the ledger actually requires is pinned locally:
 *
 *   interface ProviderStateEnvelopeShape {
 *     readonly provider: { readonly name: string };
 *     readonly object: { readonly objectType: string; readonly externalId: string };
 *     readonly revision: string;
 *   }
 *
 * The provider runtime lane (P2-W2) owns the real envelope; the TL wires
 * the type at integration (the shape is structural, so any envelope
 * satisfying it slots in without touching ledger semantics).
 *
 * Law: provider state envelopes arrive as revisions; every observation is
 * APPENDED to the per-object canonical history in arrival order.
 * Re-recording the same (provider, object, revision) with byte-identical
 * content is an idempotent replay; any content difference is REJECTED —
 * canonical history is never overwritten, and reconciliation reads the
 * history rather than rewriting it.
 */

import { ValidationError } from '../errors.ts';
import type { TimestampMs } from '../clock.ts';

/**
 * PINNED structural provider-state envelope shape (see module doc). The
 * provider runtime lane owns the full envelope; only these identity fields
 * are required by the revision ledger.
 */
export interface ProviderStateEnvelopeShape {
  readonly provider: { readonly name: string };
  readonly object: { readonly objectType: string; readonly externalId: string };
  readonly revision: string;
}

/** One immutable provider-revision entry in canonical history. */
export interface ProviderRevisionEntry {
  readonly providerName: string;
  readonly objectType: string;
  readonly externalId: string;
  readonly revision: string;
  readonly envelope: ProviderStateEnvelopeShape;
  readonly observedAt: TimestampMs;
}

/** Canonical-history overwrite attempt. */
export class ProviderRevisionConflictError extends ValidationError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message, details);
    this.name = 'ProviderRevisionConflictError';
  }
}

/**
 * The append-only provider revision ledger. Provider state envelopes arrive
 * as revisions; every observation is APPENDED to the per-object canonical
 * history in arrival order. Re-recording the same
 * (provider, object, revision) with byte-identical content is an idempotent
 * replay; any content difference is REJECTED — canonical history is never
 * overwritten, and reconciliation reads the history rather than rewriting it.
 */
export class ProviderRevisionLedger {
  readonly #entries: ProviderRevisionEntry[] = [];
  readonly #byKey = new Map<string, ProviderRevisionEntry>();
  readonly #byObject = new Map<string, ProviderRevisionEntry[]>();

  /** Append one observed revision to canonical history. */
  append(envelope: ProviderStateEnvelopeShape, now: TimestampMs): ProviderRevisionEntry {
    if (envelope === null || typeof envelope !== 'object') {
      throw new ValidationError('a provider-state envelope is required');
    }
    if (typeof now !== 'bigint') {
      throw new ValidationError('now must be a bigint TimestampMs');
    }
    const providerName = envelope.provider?.name;
    const objectType = envelope.object?.objectType;
    const externalId = envelope.object?.externalId;
    const revision = envelope.revision;
    if (
      typeof providerName !== 'string' || providerName.length === 0 ||
      typeof objectType !== 'string' || objectType.length === 0 ||
      typeof externalId !== 'string' || externalId.length === 0 ||
      typeof revision !== 'string' || revision.length === 0
    ) {
      throw new ValidationError('the envelope must carry provider, object and revision identities');
    }
    const key = `${providerName}|${objectType}|${externalId}|${revision}`;
    const entry: ProviderRevisionEntry = Object.freeze({
      providerName,
      objectType,
      externalId,
      revision,
      envelope: Object.freeze(envelope),
      observedAt: now,
    });
    const existing = this.#byKey.get(key);
    if (existing !== undefined) {
      if (JSON.stringify(existing.envelope) !== JSON.stringify(envelope)) {
        // Canonical history is append-only — a divergent re-record of the
        // same revision is an overwrite attempt, never absorbed.
        throw new ProviderRevisionConflictError(
          `revision '${revision}' of ${providerName}/${objectType}/${externalId} is already recorded in canonical history and cannot be overwritten`,
          { providerName, objectType, externalId, revision },
        );
      }
      return existing; // idempotent re-observation of the identical revision
    }
    this.#byKey.set(key, entry);
    this.#entries.push(entry);
    const objectKey = `${providerName}|${objectType}|${externalId}`;
    const list = this.#byObject.get(objectKey) ?? [];
    list.push(entry);
    this.#byObject.set(objectKey, list);
    return entry;
  }

  /** Canonical history of one provider object, in append order (never rewritten). */
  history(providerName: string, objectType: string, externalId: string): readonly ProviderRevisionEntry[] {
    return [...(this.#byObject.get(`${providerName}|${objectType}|${externalId}`) ?? [])];
  }

  /** The latest appended revision of one provider object, if observed. */
  latest(providerName: string, objectType: string, externalId: string): ProviderRevisionEntry | undefined {
    const list = this.#byObject.get(`${providerName}|${objectType}|${externalId}`);
    return list === undefined || list.length === 0 ? undefined : list[list.length - 1];
  }

  /** All entries in append order (audit view). */
  allEntries(): readonly ProviderRevisionEntry[] {
    return [...this.#entries];
  }
}
