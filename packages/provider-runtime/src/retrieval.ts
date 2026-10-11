/**
 * @payswap/provider-runtime — canonical provider retrieval + reconciliation
 * supply (P2-W2).
 *
 * Wise §4.4 (advisory, mapped to this Work Order): "When an API times out
 * or returns an ambiguous response after an effect may have occurred, mark
 * the outcome UNKNOWN and reconcile via provider retrieval/events before
 * retrying a consequential command. Where webhooks are unavailable or not
 * authoritative, use controlled retrieval/reconciliation and record its
 * provenance."
 *
 * THE AUTHORITY BOUNDARY (AUTHORITY-MODEL): this runtime SUPPLIES the
 * retrieval — controlled, provenance-recorded provider-state fetches. It
 * does NOT decide financial truth: the definitive resolver of ambiguous
 * outcomes is the P1-W2 protocol lane (SettlementReconciliationAuthority);
 * the reconciliation consumer consumes the retrieval evidence produced
 * here.
 *
 * Laws:
 * - CONTROLLED RETRIEVAL: every retrieval goes through a registered
 *   retrieval contract (per provider/object type), executes as a
 *   READ_PROVIDER_STATE scoped operation against a live connection, and
 *   retains the provider's answer losslessly in the raw-state store.
 * - PROVENANCE: every retrieval carries (fetchId, retrievedAt, reason,
 *   connectionId, correlationId) — the reconciliation consumer can prove
 *   WHERE the evidence came from and WHEN.
 * - RECONCILE-BEFORE-RETRY EVIDENCE: `postAmbiguityRetrievalFor` answers
 *   whether a retrieval exists for a provider object AFTER a given
 *   instant — the execution bridge's retry gate consumes exactly this.
 */

import { ValidationError } from './errors.ts';
import type { RuntimeClock, TimestampMs } from './clock.ts';
import { asFetchId, type FetchId, type RawStateRecordId } from './identifiers.ts';
import type { RawProviderStateRecord, RawProviderStateStore } from './raw-state.ts';
import { redactForArtifact } from './redaction.ts';
import type { ProviderTransport, ProviderTransportCall, ProviderTransportResponse } from './transport.ts';
import { validateTransportResponse } from './transport.ts';

/** Why a retrieval runs (recorded provenance dimension). */
export const RETRIEVAL_REASONS = [
  'RECONCILIATION_AFTER_AMBIGUITY',
  'SCHEDULED_POLL',
  'OPERATOR_INITIATED',
  'EVENT_LOSS_RECOVERY',
] as const;

export type RetrievalReason = (typeof RETRIEVAL_REASONS)[number];

export function isRetrievalReason(value: unknown): value is RetrievalReason {
  return typeof value === 'string' && (RETRIEVAL_REASONS as readonly unknown[]).includes(value);
}

/** The per provider/object-type retrieval contract (controlled retrieval). */
export interface ProviderRetrievalContract {
  readonly providerName: string;
  readonly objectType: string;
  /** The READ operation id dispatches the provider fetch. */
  readonly operationId: string;
  /** True when the provider supports fetching at an explicit revision. */
  readonly supportsRevisionFetch: boolean;
  /** Builds the provider fetch params for one external object. */
  buildFetchParams(input: {
    readonly externalId: string;
    readonly revision?: string;
  }): Readonly<Record<string, unknown>>;
  /** Parses the provider response into the retained object state. */
  parseFetchResponse(response: {
    readonly status: number;
    readonly body: unknown;
  }):
    | {
        readonly externalId: string;
        readonly revision: string;
        readonly state: unknown;
        readonly occurredAt?: TimestampMs;
      }
    | undefined;
}

/** The provenance of one completed retrieval. */
export interface RetrievalProvenance {
  readonly fetchId: FetchId;
  readonly retrievedAt: TimestampMs;
  readonly reason: RetrievalReason;
  readonly connectionId: string;
  readonly correlationId?: string;
  readonly providerName: string;
  readonly objectType: string;
  readonly externalId: string;
}

/** The result of one completed retrieval. */
export interface RetrievalResult {
  readonly provenance: RetrievalProvenance;
  /** The retained raw provider-state record (lossless, redacted at boundary). */
  readonly record: RawProviderStateRecord;
  /** The transport status the provider answered with. */
  readonly transportStatus: number;
}

/** The retrieval ledger (append-only; the retry gate reads it). */
export interface RetrievalLedgerEntry {
  readonly provenance: RetrievalProvenance;
  readonly rawStateRecordId: RawStateRecordId;
}

/**
 * The provider retrieval service. Controlled retrieval with provenance;
 * deterministic in-memory reference ledger (durable persistence is a
 * separately-accepted Work Order).
 */
export class ProviderRetrievalService {
  private readonly contracts = new Map<string, ProviderRetrievalContract>();
  private readonly ledger: RetrievalLedgerEntry[] = [];
  private readonly store: RawProviderStateStore;
  private readonly clock: RuntimeClock;
  private sequence = 0n;

  constructor(deps: {
    readonly store: RawProviderStateStore;
    readonly clock: RuntimeClock;
  }) {
    this.store = deps.store;
    this.clock = deps.clock;
  }

  /** Register a retrieval contract (idempotent for identical contracts). */
  registerContract(contract: ProviderRetrievalContract): ProviderRetrievalContract {
    if (typeof contract.providerName !== 'string' || contract.providerName.length === 0) {
      throw new ValidationError('retrieval contract requires providerName');
    }
    if (typeof contract.objectType !== 'string' || contract.objectType.length === 0) {
      throw new ValidationError('retrieval contract requires objectType');
    }
    if (typeof contract.operationId !== 'string' || contract.operationId.length === 0) {
      throw new ValidationError('retrieval contract requires operationId');
    }
    if (typeof contract.buildFetchParams !== 'function' || typeof contract.parseFetchResponse !== 'function') {
      throw new ValidationError('retrieval contract requires buildFetchParams + parseFetchResponse');
    }
    const key = `${contract.providerName}|${contract.objectType}`;
    this.contracts.set(key, contract);
    return contract;
  }

  /**
   * Retrieve one external object's current provider state. Controlled:
   * requires a registered contract; the caller (the execution bridge or a
   * reconciliation loop) supplies the live transport + connection. The
   * provider's answer is retained losslessly and the provenance recorded.
   */
  async retrieve(input: {
    readonly transport: ProviderTransport;
    readonly connectionId: string;
    readonly providerName: string;
    readonly objectType: string;
    readonly externalId: string;
    readonly reason: RetrievalReason;
    readonly correlationId?: string;
    /**
     * The credential dispatch bundle: the retrieval dispatch runs INSIDE
     * the credential seal (the binder builds secret-bearing headers, the
     * transport consumes them) and only the clean provider response comes
     * out (INV-19) — the same dispatch pattern the execution bridge uses.
     */
    readonly credential: import('./credential-isolation.ts').CredentialDispatch;
  }): Promise<RetrievalResult> {
    const contract = this.contracts.get(`${input.providerName}|${input.objectType}`);
    if (contract === undefined) {
      throw new ValidationError(
        `no retrieval contract registered for ${input.providerName}/${input.objectType}`,
      );
    }
    if (!isRetrievalReason(input.reason)) {
      throw new ValidationError('retrieval requires a canonical reason', { reason: input.reason });
    }
    const externalId = String(input.externalId);
    const retrievedAt = this.clock.now();
    this.sequence += 1n;
    const fetchId = asFetchId(`fetch:${this.sequence}`);

    // Params must be clean of secrets BEFORE they cross toward the
    // transport call record (defense in depth on top of the seal).
    const params = redactForArtifact(
      contract.buildFetchParams({ externalId }),
    ).value as Record<string, unknown>;

    const call: ProviderTransportCall = {
      operationId: contract.operationId,
      idempotencyKey: fetchId,
      params,
      headers: {},
      correlationId: input.correlationId ?? fetchId,
    };
    const response: ProviderTransportResponse = await input.credential.broker.withMaterial(
      input.credential.credentialHandleRef as Parameters<
        import('./credential-isolation.ts').InMemoryCredentialBroker['withMaterial']
      >[0],
      {
        runtimeKey: input.credential.runtimeKey,
        context: `retrieval:${input.providerName}/${input.objectType}:${fetchId}`,
        consumer: (material) =>
          input.transport.send({
            ...call,
            headers: input.credential.bindHeaders(material),
          }),
      },
    );
    validateTransportResponse(response);
    if (!response.delivered) {
      throw new ValidationError('provider retrieval was not delivered — retry the retrieval', {
        failure: response.failure,
      });
    }
    const parsed = contract.parseFetchResponse({
      status: response.status as number,
      body: response.body,
    });
    if (parsed === undefined) {
      throw new ValidationError(
        'the provider response did not parse into an object state — no fabricated state (INV-24)',
        { providerName: input.providerName, objectType: input.objectType },
      );
    }

    const recordAppend: {
      -readonly [K in keyof import('./raw-state.ts').RawStateAppendInput]: import('./raw-state.ts').RawStateAppendInput[K];
    } = {
      providerName: input.providerName,
      objectType: input.objectType,
      externalId: parsed.externalId,
      revision: parsed.revision,
      receivedAt: retrievedAt,
      source: 'PROVIDER_RETRIEVAL' as const,
      rawState: parsed.state,
    };
    if (parsed.occurredAt !== undefined) {
      recordAppend.occurredAt = parsed.occurredAt;
    }
    if (input.correlationId !== undefined) {
      recordAppend.correlationId = input.correlationId;
    }
    const record = this.store.append(recordAppend);

    const provenance: {
      -readonly [K in keyof RetrievalProvenance]: RetrievalProvenance[K];
    } = {
      fetchId,
      retrievedAt,
      reason: input.reason,
      connectionId: input.connectionId,
      providerName: input.providerName,
      objectType: input.objectType,
      externalId: parsed.externalId,
    };
    if (input.correlationId !== undefined) {
      provenance.correlationId = input.correlationId;
    }
    const sealedProvenance = Object.freeze(provenance);
    this.ledger.push(Object.freeze({ provenance: sealedProvenance, rawStateRecordId: record.recordId }));
    return Object.freeze({
      provenance: sealedProvenance,
      record,
      transportStatus: response.status as number,
    });
  }

  /**
   * The reconcile-before-retry evidence surface: is there a retrieval for
   * this provider object recorded AFTER the given instant? The execution
   * bridge's retry gate consumes exactly this (INV-04: reconcile before
   * any consequential retry).
   */
  postAmbiguityRetrievalFor(
    providerName: string,
    objectType: string,
    externalId: string,
    after: TimestampMs,
  ): RetrievalLedgerEntry | undefined {
    return this.ledger.find(
      (entry) =>
        entry.provenance.providerName === providerName &&
        entry.provenance.objectType === objectType &&
        entry.provenance.externalId === externalId &&
        entry.provenance.retrievedAt > after,
    );
  }

  /** The append-only retrieval ledger (audit surface). */
  ledgerEntries(): readonly RetrievalLedgerEntry[] {
    return [...this.ledger];
  }

  /**
   * The reconcile-before-retry evidence question: does a provider
   * retrieval exist AFTER the ambiguity instant, anchored either on a
   * provider object the ambiguous record referenced (the general case) or
   * on the command's correlation id (the UNKNOWN-create case — no provider
   * reference exists to anchor on; the adapter's retrieval contract
   * performs the provider-side lookup by client reference).
   *
   * The execution bridge's INV-04 retry gate consumes exactly this.
   */
  hasPostAmbiguityRetrievalEvidence(input: {
    readonly providerName: string;
    readonly providerReferences: readonly string[];
    readonly correlationId: string;
    readonly ambiguousSince: TimestampMs;
  }): boolean {
    return this.ledger.some(
      (entry) =>
        entry.provenance.retrievedAt > input.ambiguousSince &&
        ((entry.provenance.providerName === input.providerName &&
          input.providerReferences.includes(entry.provenance.externalId)) ||
          entry.provenance.correlationId === input.correlationId),
    );
  }
}
