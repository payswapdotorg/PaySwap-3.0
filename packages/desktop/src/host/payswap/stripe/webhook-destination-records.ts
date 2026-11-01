/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the webhook-destination
 * RECORDS: the durable record/approval shapes, their fail-closed parsers
 * and the canonical binding digests. Extracted from
 * webhook-destinations.ts per the ≤400-line file law (the
 * event-inbox-records.ts precedent).
 *
 * LAWS:
 * - A destination record is SECRET-FREE (the whsec_ lives ONLY in the
 *   broker's sealed envelope, under its own storage-key namespace).
 * - `providerEndpointId` is null until a provider-side registration is
 *   CONFIRMED through the real transport — the record never claims a
 *   Stripe endpoint id it does not have.
 * - The event-destination schema version is an INDEPENDENT fact: it
 *   enters the digest of the binding it was approved under and is never
 *   rewritten by a request-version change (ADR-0017 D2).
 * - Parsers are fail-closed per record (a malformed record is dropped,
 *   never a crash, never a "repair").
 */

import { createHash } from "node:crypto";

/** The injected fs seam (the workspace-store shape). */
export interface WebhookDestinationFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** The event-destination-version recorder (the API-version state store's method). */
export interface EventDestinationVersionRecorder {
  recordEventDestinationVersion(connectionId: string, apiVersion: string): Promise<void>;
}

/** One destination record (durable; secret-free — the secret lives in the broker). */
export interface StripeWebhookDestinationRecord {
  readonly endpointId: string;
  readonly connectionId: string;
  readonly url: string;
  readonly description: string;
  readonly enabledEventTypes: readonly string[];
  /** The event-destination schema version (an INDEPENDENT fact — never rewritten by request-version changes). */
  readonly eventApiVersion: string;
  readonly status: "SEALED" | "DELETED";
  /** The Stripe endpoint id (we_…) once provider registration is CONFIRMED — null until then (never claimed). */
  readonly providerEndpointId: string | null;
  readonly registeredAt: string;
  readonly createdByPrincipalId: string;
  readonly approvedDigest: string;
  readonly deletedAt: string | null;
  readonly deletedByPrincipalId: string | null;
}

/** One single-use destination approval artifact (host-minted). */
export interface StripeDestinationApproval {
  readonly approvalId: string;
  readonly endpointId: string;
  readonly kind: "REGISTRATION" | "DELETION";
  readonly approvedDigest: string;
  readonly approvedByPrincipalId: string;
  readonly consumedAt: string | null;
  readonly expiresAt: string;
}

/** The typed refusals (fail-closed; no thrown strings for control flow). */
export type StripeDestinationRefusal =
  | { readonly kind: "MALFORMED_URL" }
  | { readonly kind: "EMPTY_EVENT_TYPES" }
  | { readonly kind: "MALFORMED_EVENT_TYPE"; readonly value: string }
  | { readonly kind: "UNKNOWN_ENDPOINT" }
  | { readonly kind: "ALREADY_REGISTERED" }
  | { readonly kind: "DIGEST_MISMATCH" }
  | { readonly kind: "EXPIRED" }
  | { readonly kind: "APPROVAL_CONSUMED" };

/** The persisted snapshot shape (versioned for forward migration). */
export interface DestinationSnapshot {
  readonly version: 1;
  readonly destinations: readonly StripeWebhookDestinationRecord[];
  readonly approvals: readonly StripeDestinationApproval[];
}

/** Fail-closed parse of one persisted destination record. */
export function isValidWebhookDestinationRecord(
  candidate: unknown,
): candidate is StripeWebhookDestinationRecord {
  if (candidate === null || typeof candidate !== "object") {
    return false;
  }
  const record = candidate as Partial<StripeWebhookDestinationRecord>;
  return (
    typeof record.endpointId === "string" &&
    typeof record.connectionId === "string" &&
    typeof record.url === "string" &&
    Array.isArray(record.enabledEventTypes) &&
    typeof record.eventApiVersion === "string" &&
    (record.status === "SEALED" || record.status === "DELETED") &&
    typeof record.registeredAt === "string" &&
    typeof record.createdByPrincipalId === "string" &&
    typeof record.approvedDigest === "string"
  );
}

/** Fail-closed parse of one persisted approval record. */
export function isValidStripeDestinationApproval(
  candidate: unknown,
): candidate is StripeDestinationApproval {
  if (candidate === null || typeof candidate !== "object") {
    return false;
  }
  const record = candidate as Partial<StripeDestinationApproval>;
  return (
    typeof record.approvalId === "string" &&
    typeof record.endpointId === "string" &&
    (record.kind === "REGISTRATION" || record.kind === "DELETION") &&
    typeof record.approvedDigest === "string" &&
    typeof record.approvedByPrincipalId === "string" &&
    (record.consumedAt === null || typeof record.consumedAt === "string") &&
    typeof record.expiresAt === "string"
  );
}

/** The canonical digest of a registration/deletion binding (SHA-256 hex). */
export function destinationDigestOf(input: {
  readonly kind: "REGISTRATION" | "DELETION";
  readonly endpointId: string;
  readonly connectionId: string;
  readonly url: string;
  readonly enabledEventTypes: readonly string[];
  readonly eventApiVersion: string;
}): string {
  return destinationDigestOfCanonical(canonicalDestinationBinding(input));
}

/** The canonical (deterministic, key-sorted) binding object — the digest preimage. */
export function canonicalDestinationBinding(input: {
  readonly kind: "REGISTRATION" | "DELETION";
  readonly endpointId: string;
  readonly connectionId: string;
  readonly url: string;
  readonly enabledEventTypes: readonly string[];
  readonly eventApiVersion: string;
}): Record<string, unknown> {
  return {
    connectionId: input.connectionId,
    enabledEventTypes: [...input.enabledEventTypes].sort(),
    endpointId: input.endpointId,
    eventApiVersion: input.eventApiVersion,
    kind: input.kind,
    url: input.url,
  };
}

/** SHA-256 hex over a canonical binding (the digest law: exact-binding match). */
export function destinationDigestOfCanonical(canonical: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}
