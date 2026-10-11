/**
 * @payswap/provider-runtime — event/webhook ingestion (P2-W2).
 *
 * Wise §4.4 (advisory, mapped to this Work Order): authenticate webhook
 * signatures where supported; make duplicate delivery harmless; handle
 * out-of-order events without replacing a newer canonical observation with
 * an older one; persist event id, creation/receipt times and processing
 * outcome, with secrets redacted.
 *
 * Laws implemented here, in ingestion order:
 *
 * 1. AUTHENTICATED INGESTION WHERE SUPPORTED: signature verification is a
 *    PLUGGABLE `WebhookSignatureVerifier` contract. Signatures are OPAQUE
 *    strings at this layer — the cryptography itself belongs to the
 *    platform/capability lane (P1-W3 finding F-2 precedent: signature
 *    verification is out of lane). An ingestor without a verifier for a
 *    provider runs in UNAUTHENTICATED mode ONLY when that mode was
 *    explicitly declared at construction (fail-closed default: refuse).
 * 2. REPLAY WINDOW: a signature timestamp outside the tolerance window is
 *    rejected (stale or unreasonably future).
 * 3. DUPLICATE DELIVERY IS HARMLESS: (provider, eventId) is the dedupe
 *    key; a duplicate returns the ORIGINAL record — never ingested twice.
 * 4. OUT-OF-ORDER EVENTS CANNOT REGRESS CANONICAL STATE: the event's
 *    object state is appended to the RawProviderStateStore, whose
 *    projection ordering law keeps the newest observation canonical; a
 *    late older event is retained in history and flagged
 *    SUPERSEDED_BY_NEWER_OBSERVATION.
 * 5. RAW PAYLOAD REFERENCES + EVENT IDS + CREATION/RECEIPT TIMES +
 *    PROCESSING OUTCOME: every ingested event produces a record pointing
 *    at the retained (redacted-at-boundary) raw payload. Secrets are
 *    redacted INSIDE the raw-state store; the event record itself carries
 *    only identifiers, times and outcomes (INV-19).
 *
 * Deterministic: all time flows through the injected clock; no entropy.
 */

import { ValidationError } from './errors.ts';
import { parseEpochSeconds, type RuntimeClock, type TimestampMs } from './clock.ts';
import type { CorrelationId, ProviderEventId, RawStateRecordId } from './identifiers.ts';
import { asProviderEventId } from './identifiers.ts';
import type { RawProviderStateStore } from './raw-state.ts';
import { naiveEventObjectExtractor, type ProviderEventObjectExtractor } from './event-extractor.ts';

/** A raw provider webhook delivery, exactly as received. */
export interface ProviderEventDelivery {
  readonly providerName: string;
  /** The provider's event id — the idempotency (dedupe) key. */
  readonly eventId: string;
  /** Provider-issued signature timestamp (epoch seconds, string-encoded). */
  readonly signatureTimestamp: string;
  /** Provider-issued event creation time (epoch seconds, string-encoded). */
  readonly eventCreatedAt: string;
  /** Raw provider payload, preserved verbatim until the store boundary. */
  readonly payload: unknown;
  /** The provider's signature over the canonical body (OPAQUE here — F-2 precedent). */
  readonly signature: string;
}

/** Signature headers + payload canonicalization input. */
export interface WebhookVerificationInput {
  readonly delivery: ProviderEventDelivery;
  /** Deterministic canonical serialization the provider signed. */
  readonly canonicalBody: string;
}

export type WebhookSignatureVerification =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

/**
 * The PLUGGABLE signature-verifier contract. Provider-specific
 * implementations stay inside provider adapters; the ingestor only
 * consumes the boolean outcome + failure reason. Signature VALUES never
 * enter any artifact (INV-19 — the delivery signature is verification
 * input, not retained material).
 */
export interface WebhookSignatureVerifier {
  /** Stable verifier identity (provenance surface; never a secret). */
  readonly verifierId: string;
  verify(input: WebhookVerificationInput): WebhookSignatureVerification;
}

/** Deterministic canonical body for signature purposes. */
export function canonicalWebhookBody(payload: unknown): string {
  return JSON.stringify(payload ?? null);
}

/** Why a delivery was rejected. */
export type WebhookRejectionReason =
  | 'MALFORMED_DELIVERY'
  | 'UNAUTHENTICATED_PROVIDER_REFUSED'
  | 'SIGNATURE_INVALID'
  | 'TIMESTAMP_OUTSIDE_WINDOW'
  | 'FUTURE_TIMESTAMP';

/** The persisted record of one ingested event (identifiers + times + outcome only). */
export interface ProviderEventRecord {
  readonly providerName: string;
  readonly eventId: ProviderEventId;
  /** Provider-issued event creation time (ms since epoch, bigint). */
  readonly eventCreatedAt: TimestampMs;
  /** PaySwap-side receipt time (ms since epoch, bigint). */
  readonly receivedAt: TimestampMs;
  /** Reference to the retained raw payload (redacted at the store boundary). */
  readonly rawPayloadRecordId?: RawStateRecordId;
  readonly processingOutcome: EventProcessingOutcome;
  readonly correlationId?: CorrelationId;
}

export const EVENT_PROCESSING_OUTCOMES = [
  'CANONICAL_ADVANCED',
  'SUPERSEDED_BY_NEWER_OBSERVATION',
  'RETAINED_WITHOUT_OBJECT_STATE',
  'DUPLICATE_IGNORED',
] as const;

export type EventProcessingOutcome = (typeof EVENT_PROCESSING_OUTCOMES)[number];

/** The result of one ingestion call. */
export type EventIngestionOutcome =
  | {
      readonly kind: 'INGESTED';
      readonly record: ProviderEventRecord;
      readonly rawPayloadRecordId?: RawStateRecordId;
    }
  | {
      readonly kind: 'DUPLICATE';
      readonly providerName: string;
      readonly eventId: ProviderEventId;
      readonly originalRecord: ProviderEventRecord;
    }
  | {
      readonly kind: 'REJECTED';
      readonly reason: WebhookRejectionReason;
      readonly providerName: string;
      readonly eventId?: string;
    };

const DEFAULT_REPLAY_WINDOW_SECONDS = 300;
const DEFAULT_FUTURE_SKEW_SECONDS = 5;

/**
 * The provider event ingestor. Signature verification, replay window,
 * (provider, eventId) dedupe, raw-payload retention with redaction and
 * no-regression ordering — the full Wise §4.4 event discipline.
 */
export class ProviderEventIngestor {
  private readonly verifier: WebhookSignatureVerifier | undefined;
  private readonly unauthenticatedProviders: ReadonlySet<string>;
  private readonly clock: RuntimeClock;
  private readonly store: RawProviderStateStore;
  private readonly extractor: ProviderEventObjectExtractor;
  private readonly replayWindowSeconds: number;
  private readonly futureSkewSeconds: number;
  private readonly ingested = new Map<string, ProviderEventRecord>();
  private readonly log: EventIngestionOutcome[] = [];

  constructor(deps: {
    readonly clock: RuntimeClock;
    readonly store: RawProviderStateStore;
    /** The signature verifier (absent => providers must be declared unauthenticated). */
    readonly verifier?: WebhookSignatureVerifier;
    /** Providers whose deliveries are known-unsupported for authentication (explicit, fail-closed otherwise). */
    readonly unauthenticatedProviders?: readonly string[];
    readonly extractor?: ProviderEventObjectExtractor;
    readonly replayWindowSeconds?: number;
    readonly futureSkewSeconds?: number;
  }) {
    this.clock = deps.clock;
    this.store = deps.store;
    this.verifier = deps.verifier;
    this.unauthenticatedProviders = new Set(deps.unauthenticatedProviders ?? []);
    this.extractor = deps.extractor ?? naiveEventObjectExtractor;
    this.replayWindowSeconds = deps.replayWindowSeconds ?? DEFAULT_REPLAY_WINDOW_SECONDS;
    this.futureSkewSeconds = deps.futureSkewSeconds ?? DEFAULT_FUTURE_SKEW_SECONDS;
  }

  /** Ingest one delivery. Deterministic; never throws on provider input shape. */
  ingest(
    delivery: ProviderEventDelivery,
    options?: { readonly correlationId?: CorrelationId },
  ): EventIngestionOutcome {
    const malformed = this.validateDeliveryShape(delivery);
    if (malformed !== undefined) {
      const rejection: { -readonly [K in keyof Extract<EventIngestionOutcome, { kind: 'REJECTED' }>]: string | WebhookRejectionReason } = {
        kind: 'REJECTED' as const,
        reason: 'MALFORMED_DELIVERY' as const,
        providerName:
          typeof delivery?.providerName === 'string' ? delivery.providerName : '(unknown)',
      };
      if (typeof delivery?.eventId === 'string') {
        rejection.eventId = delivery.eventId;
      }
      const outcome = rejection as unknown as EventIngestionOutcome;
      this.log.push(outcome);
      return outcome;
    }

    // Authentication where supported (fail-closed without a verifier).
    if (this.verifier === undefined) {
      if (!this.unauthenticatedProviders.has(delivery.providerName)) {
        const outcome: EventIngestionOutcome = {
          kind: 'REJECTED',
          reason: 'UNAUTHENTICATED_PROVIDER_REFUSED',
          providerName: delivery.providerName,
          eventId: delivery.eventId,
        };
        this.log.push(outcome);
        return outcome;
      }
    } else if (!this.unauthenticatedProviders.has(delivery.providerName)) {
      const verification = this.verifier.verify({
        delivery,
        canonicalBody: canonicalWebhookBody(delivery.payload),
      });
      if (!verification.valid) {
        const outcome: EventIngestionOutcome = {
          kind: 'REJECTED',
          reason: 'SIGNATURE_INVALID',
          providerName: delivery.providerName,
          eventId: delivery.eventId,
        };
        this.log.push(outcome);
        return outcome;
      }
      // Replay window over the provider signature timestamp.
      const signatureAt = parseEpochSeconds(delivery.signatureTimestamp, 'signatureTimestamp');
      const now = this.clock.now();
      const futureBound = now + BigInt(this.futureSkewSeconds * 1000);
      const pastBound = now - BigInt(this.replayWindowSeconds * 1000);
      if (signatureAt > futureBound) {
        const outcome: EventIngestionOutcome = {
          kind: 'REJECTED',
          reason: 'FUTURE_TIMESTAMP',
          providerName: delivery.providerName,
          eventId: delivery.eventId,
        };
        this.log.push(outcome);
        return outcome;
      }
      if (signatureAt < pastBound) {
        const outcome: EventIngestionOutcome = {
          kind: 'REJECTED',
          reason: 'TIMESTAMP_OUTSIDE_WINDOW',
          providerName: delivery.providerName,
          eventId: delivery.eventId,
        };
        this.log.push(outcome);
        return outcome;
      }
    }

    // Duplicate delivery is harmless: return the ORIGINAL record.
    const dedupeKey = `${delivery.providerName}|${delivery.eventId}`;
    const original = this.ingested.get(dedupeKey);
    if (original !== undefined) {
      const outcome: EventIngestionOutcome = {
        kind: 'DUPLICATE',
        providerName: delivery.providerName,
        eventId: original.eventId,
        originalRecord: original,
      };
      this.log.push(outcome);
      return outcome;
    }

    const receivedAt = this.clock.now();
    const eventCreatedAt = parseEpochSeconds(delivery.eventCreatedAt, 'eventCreatedAt');
    const objectState = this.extractor.extract(delivery.payload);

    let rawPayloadRecordId: RawStateRecordId | undefined;
    let processingOutcome: EventProcessingOutcome;
    if (objectState === undefined) {
      processingOutcome = 'RETAINED_WITHOUT_OBJECT_STATE';
    } else {
      const before = this.store.projectionOf(
        delivery.providerName,
        objectState.objectType,
        objectState.externalId,
      );
      const appendInput: {
        -readonly [K in keyof import('./raw-state.ts').RawStateAppendInput]: import('./raw-state.ts').RawStateAppendInput[K];
      } = {
        providerName: delivery.providerName,
        objectType: objectState.objectType,
        externalId: objectState.externalId,
        revision: objectState.revision,
        occurredAt: eventCreatedAt,
        receivedAt,
        source: 'PROVIDER_EVENT' as const,
        rawState: objectState.state,
      };
      if (options?.correlationId !== undefined) {
        appendInput.correlationId = options.correlationId;
      }
      const record = this.store.append(appendInput);
      rawPayloadRecordId = record.recordId;
      const after = this.store.projectionOf(
        delivery.providerName,
        objectState.objectType,
        objectState.externalId,
      );
      // No-regression law: the projection advanced only if the appended
      // record is the new canonical latest; a late older event is retained
      // but flagged superseded (never a regression of canonical state).
      processingOutcome =
        after !== undefined && after.latest.recordId === record.recordId && before !== undefined
          ? 'CANONICAL_ADVANCED'
          : before === undefined
            ? 'CANONICAL_ADVANCED'
            : 'SUPERSEDED_BY_NEWER_OBSERVATION';
    }

    const record: {
      -readonly [K in keyof ProviderEventRecord]: ProviderEventRecord[K];
    } = {
      providerName: delivery.providerName,
      eventId: asProviderEventId(delivery.eventId),
      eventCreatedAt,
      receivedAt,
      processingOutcome,
    };
    if (rawPayloadRecordId !== undefined) {
      record.rawPayloadRecordId = rawPayloadRecordId;
    }
    if (options?.correlationId !== undefined) {
      record.correlationId = options.correlationId;
    }
    const sealed = Object.freeze(record);
    this.ingested.set(dedupeKey, sealed);
    const outcome: EventIngestionOutcome =
      rawPayloadRecordId === undefined
        ? { kind: 'INGESTED', record: sealed }
        : { kind: 'INGESTED', record: sealed, rawPayloadRecordId };
    this.log.push(outcome);
    return outcome;
  }

  /** The append-only ingestion audit log (all outcomes, rejection included). */
  ingestionLog(): readonly EventIngestionOutcome[] {
    return [...this.log];
  }

  /** The record for one (provider, eventId) — the dedupe surface. */
  recordFor(providerName: string, eventId: string): ProviderEventRecord | undefined {
    return this.ingested.get(`${providerName}|${eventId}`);
  }

  private validateDeliveryShape(delivery: ProviderEventDelivery): string | undefined {
    if (delivery === null || typeof delivery !== 'object') return 'delivery';
    if (typeof delivery.providerName !== 'string' || delivery.providerName.length === 0) {
      return 'providerName';
    }
    if (typeof delivery.eventId !== 'string' || delivery.eventId.length === 0) return 'eventId';
    if (!/^-?[0-9]+$/.test(String(delivery.signatureTimestamp))) return 'signatureTimestamp';
    if (!/^-?[0-9]+$/.test(String(delivery.eventCreatedAt))) return 'eventCreatedAt';
    if (typeof delivery.signature !== 'string' || delivery.signature.length === 0) {
      return 'signature';
    }
    return undefined;
  }
}
