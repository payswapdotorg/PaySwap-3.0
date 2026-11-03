/**
 * @payswap/provider-runtime — the Stripe OAuth TOKEN EXCHANGE machinery for
 * the U2 delegated-OAuth form (P27-A, ADR-0020 D4/D11).
 *
 * SPLIT LAW: split from ./oauth-state.ts at the <=400-line file law (the
 * webhook-signature.ts <- webhook-verification.ts precedent); the state/
 * replay-protection registry and the authorize-URL builder stay there.
 * Both files are the P27-A lane's owned surface.
 *
 * DATED RE-VERIFICATION (2026-11-03, docs.stripe.com/connect/
 * oauth-standard-accounts — the P27-0 matrix §6 duty; the operator-account
 * half is honestly NOT re-verifiable: no platform credentials exist in
 * this deployment):
 * - The code->token exchange is POST https://connect.stripe.com/oauth/token
 *   authenticated with the PLATFORM'S SECRET API KEY over HTTP Basic
 *   (`-u sk_test_...:`), form body `grant_type=authorization_code` +
 *   `code=ac_...` (the current documented shape — the legacy client_secret
 *   form field is not what the live page shows).
 * - The response carries `token_type`, `scope`, `livemode`,
 *   `stripe_user_id` (the connected account id) plus the access/refresh
 *   tokens; the refresh token "can be used to ... roll your access token".
 * - The error shape is `{error, error_description}` with `invalid_grant`
 *   ("Authorization code does not exist") documented verbatim.
 * - Acting on the user's behalf ALSO works by passing the account id in the
 *   Stripe-Account header with the platform key (the currently recommended
 *   pattern) — the U2 probe/read-back composes that way.
 * - Deauthorization is POST /oauth/deauthorize (client_id +
 *   stripe_user_id); the `account.application.deauthorized` webhook event
 *   is the provider-side signal.
 *
 * KEY-READY LAW (D11): every function here refuses typed without the
 * operator-gated platform configuration (MISSING_STRIPE_PLATFORM_
 * CONFIGURATION with the EXACT missing items) — never a simulated exchange.
 * INV-25: a live-shaped platform secret is refused at THIS edge too.
 */

import { SandboxLiveBoundaryError, ValidationError } from '../../errors.ts';
import {
  MissingStripePlatformConfigurationError,
  STRIPE_U2_MISSING_OPERATOR_CONFIGURATION,
} from './oauth-state.ts';

/** Stripe's public OAuth token endpoint (the U2 code->token exchange). */
export const STRIPE_OAUTH_TOKEN_URL = 'https://connect.stripe.com/oauth/token' as const;

/** Stripe's public OAuth deauthorize endpoint (disconnect a connected account). */
export const STRIPE_OAUTH_DEAUTHORIZE_URL = 'https://connect.stripe.com/oauth/deauthorize' as const;

/** The resolved platform OAuth configuration (the client secret is secret-bearing). */
export interface StripePlatformOAuthConfiguration {
  /** The registered platform application id (`ca_...`). */
  readonly clientId: string;
  /** The platform's secret API key (sk_test_-shaped in Sandbox; never live — INV-25). */
  readonly clientSecret: string;
}

/**
 * Resolve + validate the operator-gated platform OAuth configuration.
 * Fail-closed: a missing/blank client_id or client_secret throws the TYPED
 * UNCONFIGURED refusal carrying the exact missing operator configuration;
 * a live-shaped client secret throws the INV-25 boundary refusal.
 */
export function requireStripePlatformOAuthConfiguration(input: {
  readonly clientId?: string;
  readonly clientSecret?: string;
}): StripePlatformOAuthConfiguration {
  const missing: string[] = [];
  if (typeof input.clientId !== 'string' || input.clientId.trim().length === 0) {
    missing.push(STRIPE_U2_MISSING_OPERATOR_CONFIGURATION[0]!);
  }
  if (typeof input.clientSecret !== 'string' || input.clientSecret.trim().length === 0) {
    missing.push(STRIPE_U2_MISSING_OPERATOR_CONFIGURATION[1]!);
  }
  if (missing.length > 0) {
    throw new MissingStripePlatformConfigurationError(
      'the Stripe delegated-OAuth form is UNCONFIGURED: the token exchange requires the operator-gated Stripe platform configuration',
      missing,
    );
  }
  if (input.clientSecret!.startsWith('sk_live_') || input.clientSecret!.startsWith('rk_live_')) {
    // INV-25 at this edge as well: a live platform secret never drives the
    // SANDBOX-only U2 flow (the transport edge refuses it again).
    throw new SandboxLiveBoundaryError(
      'INV-25: a live-mode Stripe platform secret cannot drive the delegated-OAuth flow (this deployment is SANDBOX-only)',
      { keyMode: 'live', executionMode: 'SANDBOX' },
    );
  }
  return Object.freeze({
    clientId: input.clientId!.trim(),
    clientSecret: input.clientSecret!,
  });
}

/** One built OAuth wire request (the secret exists ONLY in the authorization header). */
export interface StripeOAuthWireRequest {
  readonly url: string;
  /** HTTP Basic authorization header value (secret-bearing — transport edge only). */
  readonly basicAuthorization: string;
  /** The form-encoded body fields (never secret-bearing for the documented shapes). */
  readonly bodyFields: Readonly<Record<string, string>>;
}

/** The isolated basic-header fold (the host edge binds node: Buffer; this package stays dependency-free). */
const basicHeaderOf = (secret: string): string => {
  const plain = `${secret}:`;
  // Strict RFC-4648 base64 over latin1 code units (sufficient for Stripe
  // key alphabets); no node:Buffer — this package has zero runtime deps.
  if (typeof btoa !== 'function') {
    throw new ValidationError('the OAuth basic header requires a base64 encoder at the edge');
  }
  return btoa(plain);
};

/**
 * Build the U2 code->token exchange request (grant_type=authorization_code).
 * The platform secret travels in the HTTP Basic authorization header per
 * the current documented shape — NEVER in the URL or the body.
 */
export function buildStripeTokenExchangeRequest(input: {
  readonly code: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
}): StripeOAuthWireRequest {
  if (typeof input.code !== 'string' || input.code.trim().length === 0) {
    throw new ValidationError('the token exchange requires the authorization code from the provider return');
  }
  const configuration = requireStripePlatformOAuthConfiguration(input);
  return Object.freeze({
    url: STRIPE_OAUTH_TOKEN_URL,
    basicAuthorization: `Basic ${basicHeaderOf(configuration.clientSecret)}`,
    bodyFields: Object.freeze({
      grant_type: 'authorization_code',
      code: input.code.trim(),
    }),
  });
}

/**
 * Build the deauthorize request (disconnect a connected account from the
 * platform). Body carries client_id + stripe_user_id per the documented
 * shape; the platform secret authenticates over HTTP Basic.
 */
export function buildStripeDeauthorizeRequest(input: {
  readonly stripeUserId: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
}): StripeOAuthWireRequest {
  if (typeof input.stripeUserId !== 'string' || input.stripeUserId.length === 0) {
    throw new ValidationError('the deauthorize request requires the connected account id (stripe_user_id)');
  }
  const configuration = requireStripePlatformOAuthConfiguration(input);
  return Object.freeze({
    url: STRIPE_OAUTH_DEAUTHORIZE_URL,
    basicAuthorization: `Basic ${basicHeaderOf(configuration.clientSecret)}`,
    bodyFields: Object.freeze({
      client_id: configuration.clientId,
      stripe_user_id: input.stripeUserId,
    }),
  });
}

/** The typed classification of a Stripe OAuth `error` value (verbatim carried, never swallowed). */
export type StripeOAuthErrorClassification =
  /** access_denied — the user denied the connection; the task stays resumable. */
  | { readonly kind: 'USER_DENIED' }
  /** invalid_grant — the code does not exist, expired or was already consumed. */
  | { readonly kind: 'CODE_REJECTED' }
  /** invalid_client — the platform credentials were rejected. */
  | { readonly kind: 'PLATFORM_CREDENTIAL_REJECTED' }
  /** invalid_scope — the requested scope is not available to this platform. */
  | { readonly kind: 'SCOPE_REJECTED' }
  /** Any other refusal — the verbatim provider error string is carried. */
  | { readonly kind: 'REQUEST_REJECTED'; readonly verbatim: string };

/** Classify a provider OAuth error value (typed; never a thrown string). */
export function classifyStripeOAuthError(error: string): StripeOAuthErrorClassification {
  if (typeof error !== 'string' || error.length === 0) {
    return { kind: 'REQUEST_REJECTED', verbatim: '' };
  }
  switch (error) {
    case 'access_denied':
      return { kind: 'USER_DENIED' };
    case 'invalid_grant':
      return { kind: 'CODE_REJECTED' };
    case 'invalid_client':
      return { kind: 'PLATFORM_CREDENTIAL_REJECTED' };
    case 'invalid_scope':
      return { kind: 'SCOPE_REJECTED' };
    default:
      return { kind: 'REQUEST_REJECTED', verbatim: error };
  }
}

/**
 * The typed outcome of one token exchange.
 * TOKEN_ISSUED carries the access/refresh token MATERALS explicitly marked
 * secret-bearing: they exist for the ONE host consumer that seals them and
 * are never logged, rendered or persisted by this package.
 */
export type StripeOAuthTokenExchangeOutcome =
  | {
      readonly kind: 'TOKEN_ISSUED';
      /** The provider-reported mode (must be false for the SANDBOX flow — INV-25). */
      readonly livemode: boolean | null;
      readonly scope: string | null;
      /** The connected account id (`acct_...`) — the U2 connection's provider reference. */
      readonly stripeUserId: string | null;
      readonly tokenType: string | null;
      /** True iff the response carried a refresh token (rolls are possible). */
      readonly refreshTokenPresent: boolean;
      /** SECRET-BEARING: the access token material for the host-side seal. */
      readonly accessTokenMaterial: { readonly stripeAccessToken: string };
      /** SECRET-BEARING: the refresh token material for the host-side seal, when issued. */
      readonly refreshTokenMaterial: { readonly stripeRefreshToken: string } | null;
    }
  | {
      readonly kind: 'PROVIDER_ERROR';
      readonly classification: StripeOAuthErrorClassification;
      /** The verbatim provider `error` value (surfaced, never swallowed). */
      readonly verbatimError: string;
      readonly verbatimDescription: string | null;
    }
  | { readonly kind: 'MALFORMED_RESPONSE'; readonly detail: string };

/**
 * Parse the OAuth token endpoint's response body. Fail-closed: an
 * uninterpretable body is a typed MALFORMED_RESPONSE, never a guessed
 * TOKEN_ISSUED; an `error` body is a typed PROVIDER_ERROR with the
 * classification + verbatim strings.
 */
export function parseStripeOAuthTokenResponse(body: unknown): StripeOAuthTokenExchangeOutcome {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'MALFORMED_RESPONSE', detail: 'the token response is not an object' };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.length > 0) {
    const description = record.error_description;
    return {
      kind: 'PROVIDER_ERROR',
      classification: classifyStripeOAuthError(record.error),
      verbatimError: record.error,
      verbatimDescription: typeof description === 'string' && description.length > 0 ? description : null,
    };
  }
  const accessToken = record.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    // A 2xx without an access token is uninterpretable evidence — never a
    // fabricated TOKEN_ISSUED (the never-ACTIVE law's parse-side twin).
    return {
      kind: 'MALFORMED_RESPONSE',
      detail: 'the token response carries no access_token',
    };
  }
  const livemode = typeof record.livemode === 'boolean' ? record.livemode : null;
  if (livemode === true) {
    // INV-25: the provider answered in LIVE mode for the SANDBOX-only U2
    // flow — the exchange result is refused as a typed provider error,
    // never sealed as a credential.
    return {
      kind: 'PROVIDER_ERROR',
      classification: { kind: 'REQUEST_REJECTED', verbatim: 'livemode_token_issued' },
      verbatimError: 'livemode_token_issued',
      verbatimDescription:
        'the provider issued a LIVE-mode token for a SANDBOX-only flow (INV-25) — the token is not sealed',
    };
  }
  const refreshToken = record.refresh_token;
  const stripeUserId = record.stripe_user_id;
  const scope = record.scope;
  const tokenType = record.token_type;
  return {
    kind: 'TOKEN_ISSUED',
    livemode,
    scope: typeof scope === 'string' && scope.length > 0 ? scope : null,
    stripeUserId: typeof stripeUserId === 'string' && stripeUserId.length > 0 ? stripeUserId : null,
    tokenType: typeof tokenType === 'string' && tokenType.length > 0 ? tokenType : null,
    refreshTokenPresent: typeof refreshToken === 'string' && refreshToken.length > 0,
    accessTokenMaterial: { stripeAccessToken: accessToken },
    refreshTokenMaterial:
      typeof refreshToken === 'string' && refreshToken.length > 0
        ? { stripeRefreshToken: refreshToken }
        : null,
  };
}

/**
 * The U2 credential-material validation (the seal-side shape law): the
 * derived material is the OAuth access token (an sk_-shaped Stripe API key
 * per the current documented response) bound to the SANDBOX execution
 * mode. A live-shaped token NEVER validates (INV-25 — mode is not a UI
 * choice).
 */
export function validateStripeOAuthTokenMaterial(
  material: unknown,
): { readonly stripeAccessToken: string } {
  if (material === null || typeof material !== 'object' || Array.isArray(material)) {
    throw new ValidationError('the U2 OAuth credential material must be an object with a stripeAccessToken field');
  }
  const token = (material as { stripeAccessToken?: unknown }).stripeAccessToken;
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new ValidationError('the U2 OAuth credential material requires a non-empty stripeAccessToken');
  }
  if (token.startsWith('sk_live_') || token.startsWith('rk_live_')) {
    throw new SandboxLiveBoundaryError(
      'INV-25: a live-mode OAuth access token cannot seal into the SANDBOX-only U2 connection',
      { keyMode: 'live', executionMode: 'SANDBOX' },
    );
  }
  return { stripeAccessToken: token };
}
