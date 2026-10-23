/**
 * @payswap/provider-runtime — the Stripe webhook signature scheme
 * (P14-B, ADR-0008 D4): the `Stripe-Signature` header parser, the
 * pinned tolerance constants, the injected crypto seam, and the
 * events.ts `WebhookSignatureVerifier` plug.
 *
 * THE PINNED SCHEME (Stripe's documented webhook signature protocol):
 * the `Stripe-Signature` header carries `t=<epoch-seconds>` and one or
 * more `v1=<hex>` entries; the signature is HMAC-SHA256 over the string
 * `"<t>.<body>"` with the `whsec_` endpoint secret; verification accepts
 * ANY listed v1 entry matching (Stripe rotates endpoint secrets and
 * sends both during rotation).
 *
 * LAWS:
 * - REAL KEY MATERIAL AT THE EDGE ONLY: the whsec_ secret arrives by
 *   injection at the composition edge; it never enters a result shape,
 *   a record or a log line.
 * - TOLERANCE WINDOW (pinned): a signature timestamp older than 300 s
 *   (Stripe's default) is stale; one further in the future than 5 s of
 *   skew is future-dated. Freshness is measured against the INJECTED
 *   clock (deterministic; no host wall clock).
 * - CONSTANT-TIME COMPARISON: v1 equality goes through the injected
 *   timing-safe equal — never `===` on secret-derived digests.
 * - CRYPTO SEAM (the F-2 precedent): this package owns no cryptography —
 *   `StripeWebhookCrypto` is injected (the node:crypto binding is
 *   composed at the edge; tests inject deterministic fakes). Zero
 *   runtime deps.
 */

import type { RuntimeClock } from '../../clock.ts';
import type { WebhookSignatureVerifier, WebhookVerificationInput } from '../../events.ts';
import type { WebhookSignatureVerification } from '../../events.ts';

/** The pinned tolerance window (Stripe's documented default: 300 s). */
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300 as const;

/** The pinned future-skew allowance (a clock slightly ahead is not future-dated). */
export const STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS = 5 as const;

/** The verifier identity for the events.ts ingestor plug (never a secret). */
export const STRIPE_WEBHOOK_VERIFIER_ID = 'stripe-whsec-hmac-sha256-v1' as const;

/**
 * The injected crypto seam (F-2 precedent: the capability edge owns
 * cryptography; this package stays dependency-free and deterministic).
 */
export interface StripeWebhookCrypto {
  /** HMAC-SHA256 of message under key, lowercase hex. */
  hmacSha256Hex(key: string, message: string): string;
  /** Constant-time equality of two lowercase-hex digests. */
  timingSafeEqualHex(a: string, b: string): boolean;
}

/** A parsed `Stripe-Signature` header (any v1 entry may match). */
export interface ParsedStripeSignatureHeader {
  /** Signature timestamp, epoch seconds. */
  readonly timestamp: string;
  /** Every listed v1 candidate, in header order. */
  readonly signatures: readonly string[];
}

/** The header parse outcome (typed refusal — never a thrown string). */
export type StripeSignatureHeaderParse =
  | { readonly ok: true; readonly parsed: ParsedStripeSignatureHeader }
  | { readonly ok: false; readonly reason: 'MALFORMED_SIGNATURE_HEADER'; readonly detail: string };

/**
 * Parse `t=…,v1=…[,v1=…]` (comma-separated; whitespace tolerated; unknown
 * elements are ignored per Stripe's documented forward-compatibility).
 */
export function parseStripeSignatureHeader(header: string): StripeSignatureHeaderParse {
  if (typeof header !== 'string' || header.trim().length === 0) {
    return { ok: false, reason: 'MALFORMED_SIGNATURE_HEADER', detail: 'the header is empty' };
  }
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const element of header.split(',')) {
    const trimmed = element.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const equalsAt = trimmed.indexOf('=');
    if (equalsAt <= 0) {
      continue;
    }
    const name = trimmed.slice(0, equalsAt).trim();
    const value = trimmed.slice(equalsAt + 1).trim();
    if (name === 't') {
      if (!/^-?[0-9]+$/.test(value)) {
        return {
          ok: false,
          reason: 'MALFORMED_SIGNATURE_HEADER',
          detail: 'the t= element must be integer epoch seconds',
        };
      }
      if (timestamp !== undefined) {
        return {
          ok: false,
          reason: 'MALFORMED_SIGNATURE_HEADER',
          detail: 'the header carries more than one t= element',
        };
      }
      timestamp = value;
    } else if (name === 'v1') {
      if (!/^[0-9a-fA-F]{16,128}$/.test(value)) {
        return {
          ok: false,
          reason: 'MALFORMED_SIGNATURE_HEADER',
          detail: 'the v1= element must be a hex digest',
        };
      }
      signatures.push(value.toLowerCase());
    }
  }
  if (timestamp === undefined) {
    return {
      ok: false,
      reason: 'MALFORMED_SIGNATURE_HEADER',
      detail: 'the header carries no t= element',
    };
  }
  if (signatures.length === 0) {
    return {
      ok: false,
      reason: 'MALFORMED_SIGNATURE_HEADER',
      detail: 'the header carries no v1= element',
    };
  }
  return { ok: true, parsed: { timestamp, signatures: Object.freeze(signatures) } };
}

/**
 * The events.ts ingestor plug: a `WebhookSignatureVerifier` backed by the
 * pinned scheme, for compositions that route deliveries through
 * `ProviderEventIngestor` (which adds (provider, eventId) dedupe and
 * raw-state retention on top). The signature field of the delivery
 * carries the raw `Stripe-Signature` header value; the canonical body is
 * the ingestor's deterministic serialization.
 */
export function createStripeWebhookVerifier(deps: {
  readonly webhookSecret: string;
  readonly crypto: StripeWebhookCrypto;
  readonly clock: RuntimeClock;
  readonly toleranceSeconds?: number;
  readonly futureSkewSeconds?: number;
}): WebhookSignatureVerifier {
  const toleranceSeconds = deps.toleranceSeconds ?? STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  const futureSkewSeconds = deps.futureSkewSeconds ?? STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS;
  return Object.freeze({
    verifierId: STRIPE_WEBHOOK_VERIFIER_ID,
    verify(input: WebhookVerificationInput): WebhookSignatureVerification {
      const parsed = parseStripeSignatureHeader(input.delivery.signature);
      if (!parsed.ok) {
        return { valid: false, reason: parsed.detail };
      }
      const signatureMs = BigInt(parsed.parsed.timestamp) * 1000n;
      const nowMs = deps.clock.now();
      if (signatureMs > nowMs + BigInt(futureSkewSeconds) * 1000n) {
        return { valid: false, reason: 'the signature timestamp is unreasonably far in the future' };
      }
      if (nowMs - signatureMs > BigInt(toleranceSeconds) * 1000n) {
        return {
          valid: false,
          reason: `the signature timestamp is older than the pinned ${toleranceSeconds}s tolerance window`,
        };
      }
      const expected = deps.crypto.hmacSha256Hex(
        deps.webhookSecret,
        `${parsed.parsed.timestamp}.${input.canonicalBody}`,
      );
      const good = parsed.parsed.signatures.some((candidate) =>
        deps.crypto.timingSafeEqualHex(candidate, expected),
      );
      return good
        ? { valid: true }
        : { valid: false, reason: 'the v1 signature does not match the signed payload' };
    },
  });
}
