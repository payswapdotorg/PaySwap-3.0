/**
 * @payswap/provider-runtime — the Paystack webhook SIGNATURE scheme
 * (P27-C, ADR-0020 D4): the claimed scheme's constants (the
 * `x-paystack-signature` header, the HMAC-SHA512 digest), the injected
 * crypto seam, and the events.ts `WebhookSignatureVerifier` plug (the
 * plug itself is minted in webhook-verification.ts — the split's one
 * seam, never a duplicated law).
 * Split from webhook-verification.ts per the <=400-line file law (the
 * Stripe webhook-signature/webhook-verification precedent).
 *
 * THE CLAIMED SCHEME (the K4-adjacent registration claim, honestly
 * recorded — the docs were UNREACHABLE at the 2026-11-03 station, see
 * the P27-C lane report): Paystack signs the RAW request body with
 * HMAC-SHA512 under the webhook secret and delivers the lowercase-hex
 * digest in the `x-paystack-signature` header; the scheme carries NO
 * timestamp, so the replay defense is the event-key single-use
 * consumption law in webhook-verification.ts, not a tolerance window.
 * The claim is re-verified by the operator-gated harness
 * (scripts/p27/c1-paystack-africa-real-sandbox-journey.ts); a wrong
 * scheme fails CLOSED (SIGNATURE_INVALID) — never a guessed pass.
 *
 * LAWS:
 * - REAL KEY MATERIAL AT THE EDGE ONLY: the webhook secret arrives by
 *   injection at the composition edge (the station secret channel,
 *   never chat); it never enters a result shape, a record or a log line.
 * - CONSTANT-TIME COMPARISON: digest equality goes through the injected
 *   timing-safe equal — never `===` on secret-derived digests.
 * - CRYPTO SEAM (the F-2 precedent): this package owns no cryptography —
 *   `PaystackWebhookCrypto` is injected (the node:crypto binding is
 *   composed at the edge; tests inject deterministic fakes).
 */

/** The header the claimed scheme carries the signature in. */
export const PAYSTACK_WEBHOOK_SIGNATURE_HEADER = 'x-paystack-signature' as const;

/** The verifier identity for the events.ts ingestor plug (never a secret). */
export const PAYSTACK_WEBHOOK_VERIFIER_ID = 'paystack-x-signature-hmac-sha512' as const;

/**
 * The injected crypto seam (the F-2 precedent: the capability edge owns
 * cryptography; this package stays dependency-free and deterministic).
 */
export interface PaystackWebhookCrypto {
  /** HMAC-SHA512 of message under key, lowercase hex. */
  hmacSha512Hex(key: string, message: string): string;
  /** Constant-time equality of two lowercase-hex digests. */
  timingSafeEqualHex(a: string, b: string): boolean;
}

/**
 * Verify one claimed-scheme signature over a canonical body (the
 * signature check only — the full typed verification path, the body
 * laws and the consumption law live in webhook-verification.ts).
 * Deterministic, fail-closed, never logs the secret.
 */
export function verifyPaystackWebhookSignature(input: {
  readonly crypto: PaystackWebhookCrypto;
  readonly webhookSecret: string;
  readonly signature: string;
  readonly body: string;
}): boolean {
  if (
    typeof input.signature !== 'string' ||
    input.signature.length === 0 ||
    typeof input.body !== 'string'
  ) {
    return false;
  }
  const expected = input.crypto.hmacSha512Hex(input.webhookSecret, input.body);
  return input.crypto.timingSafeEqualHex(input.signature.toLowerCase(), expected);
}

