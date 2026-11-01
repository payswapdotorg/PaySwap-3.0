/**
 * @payswap/provider-runtime — the Stripe catalogue transport CALL CONTEXT (P24-1).
 *
 * ADR-0017 D2/D6 + INV-25: the API version is PER-CALL state supplied by
 * the host (per-connection API-version pinning is the host lane P24-2) —
 * the transport NEVER hardcodes a version. The legacy request pin
 * 2025-08-27.basil stays in declaration.ts for the six-operation slice
 * (the migration law); this transport records the CATALOGUE-coherent
 * default (the pinned spec's own version) for hosts that have not yet
 * bound per-connection state.
 *
 * CREDENTIAL LAW (fail-closed, mechanical):
 * - The Authorization header value is supplied by the host's sealed broker;
 *   the transport never logs it and never returns it upward.
 * - `pk_` publishable keys are REFUSED as server-side credentials (INV-25:
 *   a publishable key is not a secret and never authorizes API calls).
 * - LIVE-mode keys (sk_live_/rk_live_) are REFUSED by this deployment
 *   (INV-25 + ADR-0017 D14: live-mode expansion is a separate future ADR).
 * - The `Stripe-Account` header (connected-account context) is host-verified
 *   ONLY — model/user text can never inject it (handoff §9.4).
 */

import { ValidationError } from '../../../errors.ts';
import { STRIPE_OPENAPI_PIN } from '../catalogue/spec-pin.ts';

/** The credential classes accepted at this transport edge (test mode only). */
const ACCEPTED_KEY_PREFIXES = ['sk_test_', 'rk_test_'] as const;

/** The credential classes refused everywhere in this deployment. */
const REFUSED_LIVE_PREFIXES = ['sk_live_', 'rk_live_'] as const;

/** The publishable-key prefix that is never a server-side secret. */
const PUBLISHABLE_PREFIX = 'pk_';

/** The explicit per-call context (host-minted; never model-supplied). */
export interface StripeCallContext {
  /** The API version for the Stripe-Version header (per-connection state). */
  readonly apiVersion: string;
  /**
   * The sealed Authorization header VALUE (e.g. "Bearer sk_test_…"). Exists
   * only inside the fetch call frame; never recorded, never returned.
   */
  readonly authorizationHeader: string;
  /** A host-verified connected-account id for the Stripe-Account header. */
  readonly stripeAccount?: string;
  /** Request timeout in milliseconds (default 15s). */
  readonly timeoutMs?: number;
}

/** The catalogue-coherent API version (the pinned spec's own version string). */
export const STRIPE_CATALOGUE_API_VERSION: string = STRIPE_OPENAPI_PIN.specInfoVersion;

const DEFAULT_TIMEOUT_MS = 15_000;

/** Extract the bearer token from an Authorization header value. */
function bearerTokenOf(authorizationHeader: string): string | null {
  if (typeof authorizationHeader !== 'string' || authorizationHeader.length === 0) {
    return null;
  }
  const prefix = 'Bearer ';
  if (!authorizationHeader.startsWith(prefix)) {
    // Basic auth (the spec's securityScheme) is also legal: pass through.
    return null;
  }
  return authorizationHeader.slice(prefix.length);
}

/**
 * THE CREDENTIAL GATE (fail-closed): validate the call context's credential
 * shape. Never echoes the key; the error names the offending CLASS only.
 */
export function validateStripeCallContext(context: StripeCallContext): void {
  if (context === null || typeof context !== 'object') {
    throw new ValidationError('a StripeCallContext object is required');
  }
  if (typeof context.apiVersion !== 'string' || context.apiVersion.length === 0) {
    throw new ValidationError(
      'the Stripe call context requires an explicit apiVersion (per-connection state — the transport never hardcodes it)',
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}\.(\w|-)+$/.test(context.apiVersion)) {
    throw new ValidationError(
      `the apiVersion '${context.apiVersion}' is not a Stripe version string (YYYY-MM-DD.codename)`,
    );
  }
  if (typeof context.authorizationHeader !== 'string' || context.authorizationHeader.length === 0) {
    throw new ValidationError('the Stripe call context requires the sealed Authorization header value');
  }
  const token = bearerTokenOf(context.authorizationHeader);
  if (token !== null) {
    if (token.startsWith(PUBLISHABLE_PREFIX) || token.startsWith('pk_test_') || token.startsWith('pk_live_')) {
      throw new ValidationError(
        'INV-25: a publishable pk_ key is not a server-side credential and is refused by the transport',
      );
    }
    if (REFUSED_LIVE_PREFIXES.some((prefix) => token.startsWith(prefix))) {
      throw new ValidationError(
        'INV-25: live-mode Stripe keys are refused by this deployment (ADR-0017 D14 — live-mode expansion is a separate future ADR)',
      );
    }
    if (!ACCEPTED_KEY_PREFIXES.some((prefix) => token.startsWith(prefix))) {
      throw new ValidationError(
        'the Authorization credential does not carry a canonical test-mode Stripe secret-key prefix (sk_test_/rk_test_)',
      );
    }
  }
  if (context.stripeAccount !== undefined) {
    if (typeof context.stripeAccount !== 'string' || !/^acct_[A-Za-z0-9_-]+$/.test(context.stripeAccount)) {
      throw new ValidationError(
        'the Stripe-Account context must be a host-verified connected-account id (acct_…)',
      );
    }
  }
  if (context.timeoutMs !== undefined) {
    if (!Number.isInteger(context.timeoutMs) || context.timeoutMs <= 0) {
      throw new ValidationError('timeoutMs must be a positive integer', {
        timeoutMs: context.timeoutMs,
      });
    }
  }
}

/** The resolved per-call header set (built ONLY from the validated context). */
export function stripeCallHeaders(
  context: StripeCallContext,
  extras: { readonly idempotencyKey?: string; readonly contentType?: string },
): Record<string, string> {
  validateStripeCallContext(context);
  const headers: Record<string, string> = {
    Authorization: context.authorizationHeader,
    'Stripe-Version': context.apiVersion,
  };
  if (context.stripeAccount !== undefined) {
    headers['Stripe-Account'] = context.stripeAccount;
  }
  if (extras.contentType !== undefined) {
    headers['Content-Type'] = extras.contentType;
  }
  if (extras.idempotencyKey !== undefined) {
    if (typeof extras.idempotencyKey !== 'string' || extras.idempotencyKey.length === 0) {
      throw new ValidationError('an idempotency key must be a non-empty string');
    }
    if (extras.idempotencyKey.length > 255) {
      throw new ValidationError('an idempotency key is limited to 255 characters');
    }
    headers['Idempotency-Key'] = extras.idempotencyKey;
  }
  return headers;
}

/** The per-call timeout (default 15s). */
export function stripeCallTimeoutMs(context: StripeCallContext): number {
  return context.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}
