/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the DURABLE EVENT INBOX: the
 * signature-verified, deduplicated, out-of-order-tolerant intake for
 * Stripe webhook deliveries.
 *
 * THE INGEST ORDER (each step is law — handoff §8):
 * 1. VERIFY RAW BYTES FIRST: the `Stripe-Signature` header is verified
 *    against the endpoint's sealed whsec_ secret(s) over the body
 *    EXACTLY AS RECEIVED — the body is never reserialized before
 *    verification (a re-encoded body breaks the signature). Rotation
 *    overlap: the previous secret stays valid inside its window.
 * 2. PARSE ONLY AFTER VERIFICATION: an unverified payload is never
 *    parsed (prompt-injection surface — Stripe contents are untrusted
 *    data, never instructions).
 * 3. DEDUP by event id (the idempotency key), then OUT-OF-ORDER
 *    CHECK: an event OLDER than the newest observed for its object is
 *    retained as SUPERSEDED_BY_NEWER_OBSERVATION and REQUIRES
 *    AUTHORITATIVE OBJECT RETRIEVAL — never blind application. Then
 *    SEMANTIC DEDUP: the same (object id + event type) at the same
 *    creation instant with a distinct event id is a duplicate semantic
 *    event (never applied); a NEWER same-type event is a fresh
 *    observation. Thin events (no snapshot state) require retrieval too.
 * 4. PROVENANCE: the payload's api_version AND the destination's
 *    event-destination version are recorded per event — never parsed
 *    with one global assumed version.
 * 5. INV-25: a livemode payload is refused (this deployment is
 *    SANDBOX-only).
 *
 * The inbox is APPEND-ONLY (receipts are never mutated); persistence is
 * bounded (the most recent MAX_INBOX_RECORDS receipts persist; the
 * dedupe index rebuilds from what is retained — an honest bound).
 */

import type { StripeWebhookDestinationAuthority } from "./webhook-destinations.js";
import type { StripeWebhookSecretBroker } from "./webhook-secret-broker.js";
import { assertNoStripeSecretShapes } from "./stripe-pins.js";
import {
  parseStripeEventInboxRecord,
  parseStripeEventPayload,
  type ParsedStripeEvent,
  type StripeEventInboxRecord,
} from "./event-inbox-records.js";

/** The raw-bytes verifier port (the provider-runtime HMAC scheme, wired at P24-D). */
export interface StripeWebhookRawVerifier {
  readonly verifierId: string;
  verifyRaw(input: {
    readonly signatureHeader: string;
    readonly rawBody: string;
    readonly nowMs: number;
  }): { readonly valid: true } | { readonly valid: false; readonly reason: string };
}

/** The verifier factory (binds the sealed secrets to the real scheme at the composition edge). */
export interface StripeWebhookVerifierFactory {
  createVerifierFor(secrets: readonly string[]): StripeWebhookRawVerifier;
}

/** The injected fs seam. */
export interface EventInboxFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** The typed ingest refusal (before any receipt — the delivery is not attributable). */
export type StripeEventIngestRefusal =
  | { readonly kind: "UNKNOWN_ENDPOINT"; readonly detail: string }
  | { readonly kind: "ENDPOINT_DELETED"; readonly detail: string };

/** The bounded persistence (the most recent receipts persist; the index rebuilds). */
export const MAX_STRIPE_EVENT_INBOX_RECORDS = 2000;

interface InboxSnapshot {
  readonly version: 1;
  readonly records: readonly StripeEventInboxRecord[];
}

const SNAPSHOT_FILE = "stripe-event-inbox.json";

/** The durable Stripe event inbox. */
export class StripeEventInbox {
  readonly #destinations: StripeWebhookDestinationAuthority;
  readonly #secretBroker: StripeWebhookSecretBroker;
  readonly #verifierFactory: StripeWebhookVerifierFactory;
  readonly #fileSystem: EventInboxFileSystem;
  readonly #directory: string;
  readonly #nowMs: () => number;
  readonly #createId: () => string;
  readonly #records: StripeEventInboxRecord[] = [];

  constructor(input: {
    readonly destinations: StripeWebhookDestinationAuthority;
    readonly secretBroker: StripeWebhookSecretBroker;
    readonly verifierFactory: StripeWebhookVerifierFactory;
    readonly fileSystem: EventInboxFileSystem;
    readonly directory: string;
    readonly nowMs: () => number;
    readonly createId: () => string;
  }) {
    this.#destinations = input.destinations;
    this.#secretBroker = input.secretBroker;
    this.#verifierFactory = input.verifierFactory;
    this.#fileSystem = input.fileSystem;
    this.#directory = input.directory;
    this.#nowMs = input.nowMs;
    this.#createId = input.createId;
  }

  /** Load persisted receipts (absent/corrupt → honest empty start). */
  async load(): Promise<void> {
    try {
      const raw = await this.#fileSystem.readFile(this.#path());
      const parsed = JSON.parse(raw) as Partial<InboxSnapshot>;
      if (parsed !== null && typeof parsed === "object" && parsed.version === 1 && Array.isArray(parsed.records)) {
        for (const candidate of parsed.records) {
          const record = this.#parseRecord(candidate);
          if (record !== null) {
            this.#records.push(record);
          }
        }
      }
    } catch {
      // Absent or corrupt: start empty (per-record quarantine posture).
    }
  }

  #parseRecord(candidate: unknown): StripeEventInboxRecord | null {
    return parseStripeEventInboxRecord(candidate);
  }

  #path(): string {
    return `${this.#directory.replace(/\/+$/, "")}/${SNAPSHOT_FILE}`;
  }

  async #persist(): Promise<void> {
    assertNoStripeSecretShapes(this.#records, "the event inbox snapshot");
    const bounded =
      this.#records.length > MAX_STRIPE_EVENT_INBOX_RECORDS
        ? this.#records.slice(this.#records.length - MAX_STRIPE_EVENT_INBOX_RECORDS)
        : this.#records;
    const snapshot: InboxSnapshot = { version: 1, records: bounded };
    await this.#fileSystem.mkdir(this.#directory);
    await this.#fileSystem.writeFile(this.#path(), JSON.stringify(snapshot, null, 2));
  }

  async #append(record: StripeEventInboxRecord): Promise<StripeEventInboxRecord> {
    this.#records.push(record);
    await this.#persist();
    return record;
  }

  /**
   * Ingest ONE delivery: verify raw bytes against the endpoint's sealed
   * secret(s) BEFORE any parsing, then parse, dedupe, order-check and
   * append the receipt. The RAW BODY never persists (untrusted data;
   * the receipt carries only identifiers, versions and outcomes).
   */
  async ingest(input: {
    readonly endpointId: string;
    readonly rawBody: string;
    readonly signatureHeader: string;
  }): Promise<
    | { readonly ok: true; readonly record: StripeEventInboxRecord; readonly verified: boolean }
    | { readonly ok: false; readonly refusal: StripeEventIngestRefusal }
  > {
    const destination = this.#destinations.destinationOf(input.endpointId);
    if (destination === null) {
      return {
        ok: false,
        refusal: { kind: "UNKNOWN_ENDPOINT", detail: `no webhook destination '${input.endpointId}' exists` },
      };
    }
    if (destination.status === "DELETED") {
      return {
        ok: false,
        refusal: { kind: "ENDPOINT_DELETED", detail: `webhook destination '${input.endpointId}' is DELETED — deliveries are refused` },
      };
    }
    const nowMs = this.#nowMs();
    // (1) RAW-BYTES VERIFICATION — inside the secret seal, before parsing.
    const verification = await this.#secretBroker.withSecrets(
      input.endpointId,
      (secrets) => this.#verifierFactory.createVerifierFor(secrets).verifyRaw({
        signatureHeader: input.signatureHeader,
        rawBody: input.rawBody,
        nowMs,
      }),
      `webhook-verification:${input.endpointId}`,
    );
    if (!verification.valid) {
      const record: StripeEventInboxRecord = Object.freeze({
        inboxRecordId: `stripe-evt:${this.#createId()}`,
        connectionId: destination.connectionId,
        endpointId: destination.endpointId,
        eventId: "unverified",
        eventType: "unverified",
        objectId: null,
        livemode: false,
        payloadApiVersion: "unverified",
        destinationApiVersion: destination.eventApiVersion,
        format: "SNAPSHOT",
        outcome: "REJECTED_SIGNATURE",
        reconciliation: null,
        receivedAt: new Date(nowMs).toISOString(),
        eventCreatedAt: 0,
      });
      await this.#append(record);
      return { ok: true, record, verified: false };
    }
    // (2) PARSE (verified bytes only — untrusted data, never instructions).
    const parsed = parseStripeEventPayload(input.rawBody);
    if (parsed === null) {
      return {
        ok: true,
        verified: true,
        record: await this.#append({
          inboxRecordId: `stripe-evt:${this.#createId()}`,
          connectionId: destination.connectionId,
          endpointId: destination.endpointId,
          eventId: "unparseable",
          eventType: "unparseable",
          objectId: null,
          livemode: false,
          payloadApiVersion: "unparseable",
          destinationApiVersion: destination.eventApiVersion,
          format: "SNAPSHOT",
          outcome: "REJECTED_SHAPE",
          reconciliation: null,
          receivedAt: new Date(nowMs).toISOString(),
          eventCreatedAt: 0,
        }),
      };
    }
    // (3) INV-25: a live payload never ingests in this deployment.
    if (parsed.livemode) {
      return {
        ok: true,
        verified: true,
        record: await this.#append({
          inboxRecordId: `stripe-evt:${this.#createId()}`,
          connectionId: destination.connectionId,
          endpointId: destination.endpointId,
          eventId: parsed.eventId,
          eventType: parsed.eventType,
          objectId: parsed.objectId,
          livemode: true,
          payloadApiVersion: parsed.apiVersion,
          destinationApiVersion: destination.eventApiVersion,
          format: parsed.format,
          outcome: "LIVE_EVENT_REFUSED",
          reconciliation: null,
          receivedAt: new Date(nowMs).toISOString(),
          eventCreatedAt: parsed.created,
        }),
      };
    }
    // (4) DEDUP by event id (the idempotency key — a retransmission
    //     carries the same Stripe event id).
    const seenEventId = this.#records.some(
      (record) =>
        record.connectionId === destination.connectionId &&
        record.eventId === parsed.eventId &&
        record.outcome !== "REJECTED_SIGNATURE" &&
        record.outcome !== "REJECTED_SHAPE",
    );
    if (seenEventId) {
      return {
        ok: true,
        verified: true,
        record: await this.#append(this.#receiptOf(destination, parsed, "DUPLICATE_EVENT_ID", null)),
      };
    }
    // (5) ORDER FIRST (the honest classification): an event OLDER than
    //     the newest observation for its object is a past-state event —
    //     SUPERSEDED with authoritative retrieval required (never blind
    //     application), even when its (object, type) pair was seen.
    if (parsed.objectId !== null && parsed.created < this.#newestObservedFor(destination.connectionId, parsed.objectId)) {
      return {
        ok: true,
        verified: true,
        record: await this.#append(
          this.#receiptOf(destination, parsed, "SUPERSEDED_BY_NEWER_OBSERVATION", {
            required: true,
            reason:
              "an out-of-order (past-state) event — retrieve the authoritative current object state before applying anything",
          }),
        ),
      };
    }
    // (6) SEMANTIC DEDUP: the same (object id + event type) at the SAME
    //     creation instant with a distinct event id is a duplicate
    //     semantic event (handoff §8) — never applied. A NEWER same-type
    //     event is a fresh observation, not a duplicate.
    if (parsed.objectId !== null) {
      const seenSemantic = this.#records.some(
        (record) =>
          record.connectionId === destination.connectionId &&
          record.objectId === parsed.objectId &&
          record.eventType === parsed.eventType &&
          record.eventCreatedAt === parsed.created &&
          (record.outcome === "ACCEPTED" || record.outcome === "SUPERSEDED_BY_NEWER_OBSERVATION"),
      );
      if (seenSemantic) {
        return {
          ok: true,
          verified: true,
          record: await this.#append(this.#receiptOf(destination, parsed, "DUPLICATE_SEMANTIC", null)),
        };
      }
    }
    const reconciliation =
      parsed.format === "THIN"
        ? {
            required: true,
            reason: "a thin event carries no object state — retrieve the authoritative object (the snapshot format alone may be applied as observed state)",
          }
          : null;
    return {
      ok: true,
      verified: true,
      record: await this.#append(this.#receiptOf(destination, parsed, "ACCEPTED", reconciliation)),
    };
  }

  /** The newest event-creation instant observed for one object (0 when none). */
  #newestObservedFor(connectionId: string, objectId: string): number {
    return this.#records
      .filter(
        (record) =>
          record.connectionId === connectionId &&
          record.objectId === objectId &&
          (record.outcome === "ACCEPTED" || record.outcome === "SUPERSEDED_BY_NEWER_OBSERVATION"),
      )
      .reduce((max, record) => Math.max(max, record.eventCreatedAt), 0);
  }

  #receiptOf(
    destination: { readonly connectionId: string; readonly endpointId: string; readonly eventApiVersion: string },
    parsed: ParsedStripeEvent,
    outcome: StripeEventInboxRecord["outcome"],
    reconciliation: StripeEventInboxRecord["reconciliation"],
  ): StripeEventInboxRecord {
    return Object.freeze({
      inboxRecordId: `stripe-evt:${this.#createId()}`,
      connectionId: destination.connectionId,
      endpointId: destination.endpointId,
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      objectId: parsed.objectId,
      livemode: parsed.livemode,
      payloadApiVersion: parsed.apiVersion,
      destinationApiVersion: destination.eventApiVersion,
      format: parsed.format,
      outcome,
      reconciliation,
      receivedAt: new Date(this.#nowMs()).toISOString(),
      eventCreatedAt: parsed.created,
    });
  }

  /** The receipts (append-only views; the reconciliation UI's read). */
  records(): readonly StripeEventInboxRecord[] {
    return Object.freeze([...this.#records]);
  }

  /** The reconciliation worklist: every receipt requiring authoritative retrieval. */
  reconciliationWorklist(): readonly StripeEventInboxRecord[] {
    return Object.freeze(this.#records.filter((record) => record.reconciliation?.required === true));
  }
}
