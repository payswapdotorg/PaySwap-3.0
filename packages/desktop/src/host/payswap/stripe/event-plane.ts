/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the EVENT PLANE composition
 * helpers: the desktop webhook verifier factory (a STRUCTURAL MIRROR of
 * the provider-runtime pinned scheme — the host-https-transports
 * precedent; the desktop host cannot import the provider-runtime
 * source, and the mirror battery asserts verdict-for-verdict fidelity
 * against the REAL `createStripeWebhookVerifier`) + the honest
 * installation-capability statement.
 *
 * THE PINNED SCHEME (mirrored from webhook-signature.ts):
 * - the `Stripe-Signature` header carries `t=<epoch-seconds>` and one
 *   or more `v1=<hex>` entries; the signature is HMAC-SHA256 over
 *   `"<t>.<rawBody>"` with the endpoint's `whsec_` secret;
 * - verification accepts ANY listed v1 entry matching ANY live secret
 *   (Stripe rotates endpoint secrets and sends both during rotation —
 *   the factory takes the broker's live secret list);
 * - tolerance window 300 s / future skew 5 s (pinned constants);
 * - CONSTANT-TIME comparison (node:crypto timingSafeEqual — never ===
 *   on secret-derived digests);
 * - REAL KEY MATERIAL AT THE EDGE ONLY: the secrets arrive from the
 *   broker's withSecrets consumer; nothing derived from them escapes.
 *
 * THE HONEST CAPABILITY LAW: a desktop-only installation without a
 * publicly reachable HTTPS endpoint CANNOT receive real Stripe
 * deliveries. The typed prerequisite states so explicitly — a fake
 * receiver never exists, and scripted signed events prove LOCAL
 * VERIFICATION only (handoff §8: "no webhook live-delivery proof
 * without a publicly reachable configured endpoint and real provider
 * receipt").
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { StripeWebhookRawVerifier, StripeWebhookVerifierFactory } from "./event-inbox.js";
import {
  PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS,
  PINNED_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  PINNED_STRIPE_WEBHOOK_VERIFIER_ID,
} from "./stripe-pins.js";

/** A parsed `Stripe-Signature` header (any v1 entry may match). */
interface ParsedSignatureHeader {
  readonly timestamp: string;
  readonly signatures: readonly string[];
}

/** Parse `t=…,v1=…[,v1=…]` (whitespace tolerated; unknown elements ignored — forward-compatibility). */
function parseSignatureHeader(header: string): ParsedSignatureHeader | null {
  if (typeof header !== "string" || header.trim().length === 0) {
    return null;
  }
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const element of header.split(",")) {
    const trimmed = element.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) {
      continue;
    }
    const name = trimmed.slice(0, equalsAt).trim();
    const value = trimmed.slice(equalsAt + 1).trim();
    if (name === "t") {
      if (!/^-?[0-9]+$/.test(value) || timestamp !== undefined) {
        return null;
      }
      timestamp = value;
    } else if (name === "v1") {
      if (!/^[0-9a-fA-F]{16,128}$/.test(value)) {
        return null;
      }
      signatures.push(value.toLowerCase());
    }
  }
  if (timestamp === undefined || signatures.length === 0) {
    return null;
  }
  return { timestamp, signatures: Object.freeze(signatures) };
}

/** Constant-time equality of two hex digests (length check first — timingSafeEqual throws on length mismatch). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * The desktop verifier factory (the structural mirror). The secrets
 * arrive ONLY from the secret broker's consumer — the factory never
 * persists, logs or echoes them.
 */
export function createDesktopStripeWebhookVerifierFactory(options?: {
  readonly toleranceSeconds?: number;
  readonly futureSkewSeconds?: number;
}): StripeWebhookVerifierFactory {
  const toleranceSeconds = options?.toleranceSeconds ?? PINNED_STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  const futureSkewSeconds = options?.futureSkewSeconds ?? PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS;
  return {
    createVerifierFor(secrets: readonly string[]): StripeWebhookRawVerifier {
      if (!Array.isArray(secrets) || secrets.length === 0) {
        // Fail closed: no live secret means nothing can verify.
        return {
          verifierId: PINNED_STRIPE_WEBHOOK_VERIFIER_ID,
          verifyRaw(): { readonly valid: false; readonly reason: string } {
            return { valid: false, reason: "no live webhook signing secret is available for this endpoint" };
          },
        };
      }
      return Object.freeze({
        verifierId: PINNED_STRIPE_WEBHOOK_VERIFIER_ID,
        verifyRaw(input: {
          readonly signatureHeader: string;
          readonly rawBody: string;
          readonly nowMs: number;
        }): { readonly valid: true } | { readonly valid: false; readonly reason: string } {
          const parsed = parseSignatureHeader(input.signatureHeader);
          if (parsed === null) {
            return { valid: false, reason: "the Stripe-Signature header is malformed (t= and at least one v1= required)" };
          }
          const signatureMs = BigInt(parsed.timestamp) * 1000n;
          if (signatureMs > BigInt(input.nowMs) + BigInt(futureSkewSeconds) * 1000n) {
            return { valid: false, reason: "the signature timestamp is unreasonably far in the future" };
          }
          if (BigInt(input.nowMs) - signatureMs > BigInt(toleranceSeconds) * 1000n) {
            return {
              valid: false,
              reason: `the signature timestamp is older than the pinned ${toleranceSeconds}s tolerance window`,
            };
          }
          // Any listed v1 entry matching ANY live secret verifies
          // (secret rotation: the previous secret stays valid inside
          // its overlap window).
          for (const secret of secrets) {
            const expected = createHmac("sha256", secret)
              .update(`${parsed.timestamp}.${input.rawBody}`, "utf8")
              .digest("hex");
            if (parsed.signatures.some((candidate) => timingSafeEqualHex(candidate, expected))) {
              return { valid: true };
            }
          }
          return { valid: false, reason: "the v1 signature does not match the signed payload under any live endpoint secret" };
        },
      });
    },
  };
}

/** The typed reception-capability statement (never a fake receiver). */
export interface StripeEventReceptionCapability {
  readonly canReceivePublicEvents: boolean;
  /** The exact typed prerequisite (null when reception is available). */
  readonly prerequisite: "PUBLIC_HTTPS_ENDPOINT_REQUIRED" | null;
  readonly detail: string;
}

/**
 * The honest capability law: a desktop-only installation without a
 * publicly reachable HTTPS endpoint cannot receive real Stripe webhook
 * deliveries — the typed prerequisite states so explicitly, and no
 * simulated receiver exists. Scripted signed events prove LOCAL
 * VERIFICATION ONLY (never live delivery).
 */
export function describeStripeEventReception(input: {
  readonly publicEndpointConfigured: boolean;
}): StripeEventReceptionCapability {
  if (input.publicEndpointConfigured) {
    return {
      canReceivePublicEvents: true,
      prerequisite: null,
      detail:
        "a publicly reachable HTTPS endpoint is configured for this installation — deliveries verify against the endpoint's sealed whsec_ secret before any parsing",
    };
  }
  return {
    canReceivePublicEvents: false,
    prerequisite: "PUBLIC_HTTPS_ENDPOINT_REQUIRED",
    detail:
      "this desktop-only installation cannot receive public Stripe webhook deliveries (no publicly reachable HTTPS endpoint is configured). No fake receiver exists: locally scripted signed events prove verification only, never live delivery — an operator-run backend with a public endpoint is required for real event reception.",
  };
}
