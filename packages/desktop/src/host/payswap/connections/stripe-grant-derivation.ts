/**
 * PaySwap Desktop (P24-2, ADR-0017 D5/D7 + handoff §2.3/§13.2) — the
 * IN-SEAL GRANT DERIVATION: the pure key-shape + mode + declared-scope
 * law that runs INSIDE the credential seal on EVERY dispatch (the
 * ADR-0008 law — never a cached grant).
 *
 * Extracted from connections/stripe-rak-permissions.ts per the
 * ≤400-line file law; the laws are unchanged:
 * - INV-25: a LIVE environment never derives; a live-mode key never
 *   serves a SANDBOX dispatch (sandbox and live credentials cannot
 *   cross-bind).
 * - pk_ is refused as a server-side credential (publishable, limited).
 * - sk_org_ is refused (organization keys are out of scope — ADR-0017
 *   D5; an organization context is never silently substituted for
 *   account scope).
 * - whsec_ is refused (an endpoint signing secret is not an API key).
 * - An unknown key shape is refused (actual validation is ALWAYS the
 *   verification probe — shape checks never validate).
 * - A RESTRICTED key grants ONLY from its DECLARED permission set (the
 *   exact rule string must be a member — no inference).
 * - A FULL test key (sk_test_) is unrestricted by definition — the
 *   P14-A accepted SANDBOX slice (the restricted-by-default product
 *   guidance lives at connection setup, not in the grant law).
 */

import {
  pinnedStripeKeyModeOf,
  stripeServerKeyShape,
} from "../stripe/stripe-pins.js";

/** The typed grant-derivation outcome (never a thrown string). */
export type StripeDispatchGrant =
  | { readonly ok: true; readonly keyClass: "RESTRICTED_KEY" | "FULL_SECRET_KEY" }
  | { readonly ok: false; readonly reason: string };

/** Derive the dispatch grant from the actual material + the declared scopes. */
export function deriveStripeDispatchGrant(input: {
  readonly apiKey: string;
  readonly environment: "SANDBOX" | "LIVE";
  readonly operationId: string;
  readonly requiredPermissionRule: string;
  /** The connection's DECLARED RAK permission strings (empty = nothing declared). */
  readonly declaredPermissions: readonly string[];
}): StripeDispatchGrant {
  if (input.environment === "LIVE") {
    return {
      ok: false,
      reason: "INV-25: this deployment is SANDBOX-only — a LIVE corridor is never derived (live-mode expansion is a separate ADR with operator authorization)",
    };
  }
  const shape = stripeServerKeyShape(input.apiKey);
  if (shape === "PUBLISHABLE_KEY") {
    return {
      ok: false,
      reason: "a publishable pk_ key is not a server-side credential and can never derive a dispatch grant",
    };
  }
  if (shape === "ORGANIZATION_KEY") {
    return {
      ok: false,
      reason: "organization keys (sk_org_) are out of scope in this release (ADR-0017 D5) — an organization context is never silently substituted for account scope",
    };
  }
  if (shape === "WEBHOOK_SIGNING_SECRET") {
    return {
      ok: false,
      reason: "a whsec_ value is an endpoint signing secret, not an API key",
    };
  }
  if (shape === "UNKNOWN") {
    return {
      ok: false,
      reason: "the sealed credential does not carry a canonical Stripe key prefix (actual validation is always the verification probe)",
    };
  }
  const keyMode = pinnedStripeKeyModeOf(input.apiKey);
  if (keyMode !== "test") {
    return {
      ok: false,
      reason: "INV-25: a live-mode Stripe key cannot serve a SANDBOX dispatch (test keys serve SANDBOX; live keys serve LIVE)",
    };
  }
  if (shape === "RESTRICTED_KEY") {
    if (!input.declaredPermissions.includes(input.requiredPermissionRule)) {
      return {
        ok: false,
        reason: `the declared RAK scopes do not include the exact permission '${input.requiredPermissionRule}' required by '${input.operationId}' (a restricted key never derives a grant beyond its declared scopes)`,
      };
    }
    return { ok: true, keyClass: "RESTRICTED_KEY" };
  }
  return { ok: true, keyClass: "FULL_SECRET_KEY" };
}
