/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the event-inbox RECORDS: the
 * append-only receipt shape + its fail-closed parser, and the VERIFIED
 * payload parser (snapshot/thin per Stripe's v1/v2 event shapes).
 * Extracted from event-inbox.ts per the ≤400-line file law.
 *
 * LAWS:
 * - A receipt is SECRET-FREE and carries no raw payload (untrusted
 *   data never persists; identifiers, versions and outcomes only).
 * - PROVENANCE: the payload's api_version AND the destination's
 *   event-destination version are recorded per event — never parsed
 *   with one global assumed version.
 * - parseStripeEventPayload runs ONLY on VERIFIED bytes (the inbox
 *   calls it after raw-bytes verification — Stripe contents are
 *   untrusted data, never instructions).
 * - The shape law is fail-closed: an evt_ id, `object: "event"`, a
 *   string type, api_version, created and livemode are all required;
 *   a snapshot needs `data.object`; a thin event needs
 *   `data.related_object`; anything else is null (REJECTED_SHAPE).
 */

/** One append-only inbox receipt (secret-free; no raw payloads persist). */
export interface StripeEventInboxRecord {
  readonly inboxRecordId: string;
  readonly connectionId: string;
  readonly endpointId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly objectId: string | null;
  readonly livemode: boolean;
  /** Provenance: the api_version the PAYLOAD carries. */
  readonly payloadApiVersion: string;
  /** Provenance: the event-destination version the ENDPOINT records. */
  readonly destinationApiVersion: string;
  readonly format: "SNAPSHOT" | "THIN";
  readonly outcome:
    | "ACCEPTED"
    | "DUPLICATE_EVENT_ID"
    | "DUPLICATE_SEMANTIC"
    | "SUPERSEDED_BY_NEWER_OBSERVATION"
    | "REJECTED_SIGNATURE"
    | "REJECTED_SHAPE"
    | "LIVE_EVENT_REFUSED";
  /** The reconciliation route (authoritative retrieval — the only path to applying a superseded/abstract event). */
  readonly reconciliation: { readonly required: boolean; readonly reason: string } | null;
  readonly receivedAt: string;
  readonly eventCreatedAt: number;
}

/** Fail-closed parse of one persisted receipt (a malformed record is dropped). */
export function parseStripeEventInboxRecord(candidate: unknown): StripeEventInboxRecord | null {
  if (candidate === null || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as Partial<StripeEventInboxRecord>;
  if (
    typeof record.inboxRecordId !== "string" ||
    typeof record.connectionId !== "string" ||
    typeof record.endpointId !== "string" ||
    typeof record.eventId !== "string" ||
    typeof record.eventType !== "string" ||
    typeof record.payloadApiVersion !== "string" ||
    typeof record.destinationApiVersion !== "string" ||
    (record.format !== "SNAPSHOT" && record.format !== "THIN") ||
    typeof record.receivedAt !== "string" ||
    typeof record.eventCreatedAt !== "number"
  ) {
    return null;
  }
  return {
    inboxRecordId: record.inboxRecordId,
    connectionId: record.connectionId,
    endpointId: record.endpointId,
    eventId: record.eventId,
    eventType: record.eventType,
    objectId: typeof record.objectId === "string" ? record.objectId : null,
    livemode: record.livemode === true,
    payloadApiVersion: record.payloadApiVersion,
    destinationApiVersion: record.destinationApiVersion,
    format: record.format,
    outcome: record.outcome as StripeEventInboxRecord["outcome"],
    reconciliation: record.reconciliation ?? null,
    receivedAt: record.receivedAt,
    eventCreatedAt: record.eventCreatedAt,
  };
}

/** The parsed, verified event payload (the shape law — fail-closed). */
export interface ParsedStripeEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly objectId: string | null;
  readonly livemode: boolean;
  readonly apiVersion: string;
  readonly created: number;
  readonly format: "SNAPSHOT" | "THIN";
}

/** Parse a VERIFIED payload (shape law: evt_ id, string type, api_version, created, data). */
export function parseStripeEventPayload(rawBody: string): ParsedStripeEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const event = body as {
    id?: unknown;
    object?: unknown;
    api_version?: unknown;
    created?: unknown;
    type?: unknown;
    livemode?: unknown;
    data?: unknown;
  };
  if (
    typeof event.id !== "string" ||
    !event.id.startsWith("evt_") ||
    event.object !== "event" ||
    typeof event.api_version !== "string" ||
    typeof event.type !== "string" ||
    event.type.length === 0 ||
    typeof event.created !== "number" ||
    typeof event.livemode !== "boolean"
  ) {
    return null;
  }
  const data =
    event.data !== null && typeof event.data === "object" && !Array.isArray(event.data)
      ? (event.data as { object?: unknown; related_object?: unknown })
      : null;
  const snapshot =
    data?.object !== null && typeof data?.object === "object" && !Array.isArray(data?.object)
      ? (data?.object as { id?: unknown })
      : null;
  const related =
    data?.related_object !== null &&
    typeof data?.related_object === "object" &&
    !Array.isArray(data?.related_object)
      ? (data?.related_object as { id?: unknown })
      : null;
  if (snapshot !== null) {
    const id = snapshot.id;
    return {
      eventId: event.id,
      eventType: event.type,
      objectId: typeof id === "string" && id.length > 0 ? id : null,
      livemode: event.livemode,
      apiVersion: event.api_version,
      created: event.created,
      format: "SNAPSHOT",
    };
  }
  if (related !== null) {
    const id = related.id;
    return {
      eventId: event.id,
      eventType: event.type,
      objectId: typeof id === "string" && id.length > 0 ? id : null,
      livemode: event.livemode,
      apiVersion: event.api_version,
      created: event.created,
      format: "THIN",
    };
  }
  return null;
}
