/**
 * @payswap/command — the webhook delivery contract (P7-W3).
 *
 * ADAPTED from the old repository's webhook boundary contract
 * (@payswap/interfaces webhooks.ts) and its producer-side delivery
 * semantics (@payswap/api webhooks.ts) onto the typed-contract doctrine:
 *
 * - events are delivered as versioned `WebhookEventEnvelope`s
 *   (occurredAt is strict ISO-8601 UTC DATA);
 * - every delivery carries X-PaySwap-Signature / X-PaySwap-Timestamp
 *   headers produced over `${timestamp}.${canonicalJson(envelope)}` —
 *   because the signed bytes are the canonical serialization, JSON key
 *   order at the transport layer does not affect verification. The HMAC
 *   comes from the INJECTED HmacPort; the timestamp is an explicit
 *   parameter, never ambient time;
 * - verification is PURE: constant-time hex comparison, replay window as
 *   DATA parameters. Failure modes: malformed timestamp/signature,
 *   signature mismatch (covers tampered payloads and wrong secrets),
 *   timestamp outside the replay window;
 * - failed deliveries retry with DETERMINISTIC exponential backoff
 *   (`backoffDelayMs`: base * 2^(attempt-1)) — the pure math; the
 *   dispatcher's scheduling store is NOT ported (D-record: composition
 *   root concern);
 * - receiving an event is never domain authority: reconciliation resolves
 *   ambiguous external effects (INV-4 discipline).
 *
 * ADAPTATION (D-record): delivery-attempt timestamps become bigint ms
 * DATA (attemptedAtMs/nextAttemptAtMs) per the canonical timestamps-are-
 * DATA doctrine, replacing the old ISO-string stamps produced from the
 * injected clock.
 */

import { ValidationError } from './errors.ts';
import { canonicalJson } from './canonical.ts';
import { parseStrictIsoUtc } from './canonical.ts';
import type { HmacPort, Hex64 } from './ports.ts';
import { asHex64, constantTimeHexEquals } from './ports.ts';

/** Transport header carrying the HMAC signature (v1 = hex digest). */
export const SIGNATURE_HEADER = 'X-PaySwap-Signature';

/** Transport header carrying the Unix-epoch-seconds signing timestamp. */
export const TIMESTAMP_HEADER = 'X-PaySwap-Timestamp';

export const SIGNATURE_SCHEME = 'v1';

/** Default replay window for signature timestamps (seconds). */
export const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

/** Versioned webhook event envelope. */
export interface WebhookEventEnvelope<TData = unknown> {
  readonly id: string;
  readonly type: string;
  /** Strict ISO-8601 UTC timestamp of the recorded occurrence (DATA). */
  readonly occurredAt: string;
  readonly schemaVersion: string;
  readonly data: TData;
}

/** Record of one delivery attempt of one envelope (timestamps are bigint DATA). */
export interface WebhookDeliveryAttempt {
  readonly envelopeId: string;
  readonly attemptNumber: number;
  readonly attemptedAtMs: bigint;
  readonly outcome: 'SUCCEEDED' | 'FAILED' | 'RETRY_SCHEDULED';
  readonly responseStatus?: number;
  readonly nextAttemptAtMs?: bigint;
}

/** Signature headers for one signed delivery. */
export interface WebhookSignatureHeaders {
  /** Value for X-PaySwap-Signature: `v1=<hex hmac-sha256>`. */
  readonly signature: string;
  /** Value for X-PaySwap-Timestamp: Unix epoch seconds. */
  readonly timestamp: string;
}

export interface WebhookVerificationOptions {
  /** Verification time (epoch seconds) — DATA, always explicit here. */
  readonly nowSeconds: number;
  /** Replay tolerance in seconds; defaults to DEFAULT_REPLAY_WINDOW_SECONDS. */
  readonly replayWindowSeconds?: number;
}

export type WebhookVerification =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason:
        | 'MALFORMED_SIGNATURE'
        | 'MALFORMED_TIMESTAMP'
        | 'SIGNATURE_MISMATCH'
        | 'TIMESTAMP_OUTSIDE_REPLAY_WINDOW';
    };

// ---------------------------------------------------------------------------
// Envelope validation + the signed payload (deterministic)
// ---------------------------------------------------------------------------

/** Validate a webhook event envelope (fail closed; occurredAt is DATA). */
export function validateWebhookEventEnvelope(envelope: WebhookEventEnvelope<unknown>): WebhookEventEnvelope<unknown> {
  if (typeof envelope.id !== 'string' || envelope.id.length === 0) {
    throw new ValidationError('webhook envelope requires a non-empty id');
  }
  if (typeof envelope.type !== 'string' || envelope.type.length === 0) {
    throw new ValidationError('webhook envelope requires a non-empty type');
  }
  if (typeof envelope.schemaVersion !== 'string' || envelope.schemaVersion.length === 0) {
    throw new ValidationError('webhook envelope requires a non-empty schemaVersion');
  }
  parseStrictIsoUtc(envelope.occurredAt, 'envelope.occurredAt');
  return envelope;
}

/** The signed payload: `${timestampSeconds}.${canonicalJson(envelope)}`. */
export function signedWebhookPayload(
  timestampSeconds: number,
  envelope: WebhookEventEnvelope<unknown>,
): string {
  if (!Number.isInteger(timestampSeconds) || timestampSeconds < 0) {
    throw new ValidationError('timestampSeconds must be a non-negative integer');
  }
  return `${timestampSeconds}.${canonicalJson(envelope)}`;
}

// ---------------------------------------------------------------------------
// Signing + verification (HMAC via the injected port; pure given inputs)
// ---------------------------------------------------------------------------

/**
 * Sign a webhook envelope with HMAC-SHA256 (via the injected port) over
 * the canonical JSON of the envelope joined with the timestamp. The
 * timestamp is an EXPLICIT parameter (the old default of ambient wall
 * time is deliberately NOT ported — determinism law).
 */
export function signWebhookEventVia<TData>(
  mac: HmacPort,
  envelope: WebhookEventEnvelope<TData>,
  secret: string,
  timestampSeconds: number,
): WebhookSignatureHeaders {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new ValidationError('webhook signing secret must be a non-empty string');
  }
  const payload = signedWebhookPayload(timestampSeconds, envelope as WebhookEventEnvelope<unknown>);
  const digest = mac.signUtf8(secret, payload);
  return { signature: `${SIGNATURE_SCHEME}=${digest}`, timestamp: String(timestampSeconds) };
}

/**
 * Verify webhook signature headers against an envelope (pure given the
 * injected MAC port and the explicit verification time). Failure modes:
 * malformed timestamp/signature, signature mismatch (covers tampered
 * payloads and wrong secrets — compared constant-time), timestamp outside
 * the replay window.
 */
export function verifyWebhookSignature<TData>(
  mac: HmacPort,
  envelope: WebhookEventEnvelope<TData>,
  secret: string,
  headers: WebhookSignatureHeaders,
  options: WebhookVerificationOptions,
): WebhookVerification {
  if (typeof headers?.timestamp !== 'string' || !/^\d+$/.test(headers.timestamp)) {
    return { valid: false, reason: 'MALFORMED_TIMESTAMP' };
  }
  const timestamp = Number.parseInt(headers.timestamp, 10);
  if (typeof headers.signature !== 'string' || !headers.signature.startsWith(`${SIGNATURE_SCHEME}=`)) {
    return { valid: false, reason: 'MALFORMED_SIGNATURE' };
  }
  const presented = headers.signature.slice(SIGNATURE_SCHEME.length + 1);
  let presentedDigest: Hex64;
  try {
    presentedDigest = asHex64(presented, 'presented signature');
  } catch {
    return { valid: false, reason: 'MALFORMED_SIGNATURE' };
  }
  const payload = signedWebhookPayload(timestamp, envelope as WebhookEventEnvelope<unknown>);
  const expected = mac.signUtf8(secret, payload);
  if (!constantTimeHexEquals(expected, presentedDigest)) {
    return { valid: false, reason: 'SIGNATURE_MISMATCH' };
  }
  const replayWindowSeconds = options.replayWindowSeconds ?? DEFAULT_REPLAY_WINDOW_SECONDS;
  if (Math.abs(options.nowSeconds - timestamp) > replayWindowSeconds) {
    return { valid: false, reason: 'TIMESTAMP_OUTSIDE_REPLAY_WINDOW' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// The transport port + deterministic backoff (typed shapes, never I/O)
// ---------------------------------------------------------------------------

/** Outcome of one transport-level delivery attempt. */
export type WebhookTransportOutcome =
  | { readonly ok: true; readonly responseStatus: number }
  | { readonly ok: false; readonly responseStatus?: number };

/** The delivery port: how envelopes physically leave the system. */
export interface WebhookTransport {
  deliver(input: {
    readonly url: string;
    readonly envelope: WebhookEventEnvelope<unknown>;
    readonly headers: WebhookSignatureHeaders;
  }): Promise<WebhookTransportOutcome>;
}

/** A registered webhook delivery endpoint. */
export interface WebhookEndpointConfig {
  readonly endpointId: string;
  readonly url: string;
  /** Endpoint signing secret (injected from a vault in production; INV-19). */
  readonly secret: string;
}

/** Validate an endpoint registration (fail closed). */
export function validateWebhookEndpointConfig(config: WebhookEndpointConfig): WebhookEndpointConfig {
  if (typeof config.endpointId !== 'string' || config.endpointId.length === 0) {
    throw new ValidationError('webhook endpoint requires a non-empty endpointId');
  }
  if (typeof config.url !== 'string' || config.url.length === 0) {
    throw new ValidationError(`webhook endpoint ${config.endpointId} requires a non-empty url`);
  }
  if (typeof config.secret !== 'string' || config.secret.length === 0) {
    throw new ValidationError(`webhook endpoint ${config.endpointId} requires a non-empty secret`);
  }
  return config;
}

/**
 * DETERMINISTIC exponential backoff: `base * 2^(attemptNumber - 1)` for
 * attemptNumber >= 1 (the pure retry math; the old dispatcher's scheduling
 * loop is the composition root's concern).
 */
export function backoffDelayMs(backoffBaseMs: number, attemptNumber: number): number {
  if (!Number.isInteger(backoffBaseMs) || backoffBaseMs <= 0) {
    throw new ValidationError('backoffBaseMs must be a positive integer');
  }
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new ValidationError('attemptNumber must be a positive integer (>= 1)');
  }
  return backoffBaseMs * 2 ** (attemptNumber - 1);
}
