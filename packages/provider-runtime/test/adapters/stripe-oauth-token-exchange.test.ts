import { describe, expect, it } from 'vitest';
import {
  STRIPE_OAUTH_DEAUTHORIZE_URL,
  STRIPE_OAUTH_TOKEN_URL,
  buildStripeDeauthorizeRequest,
  buildStripeTokenExchangeRequest,
  classifyStripeOAuthError,
  parseStripeOAuthTokenResponse,
  requireStripePlatformOAuthConfiguration,
  validateStripeOAuthTokenMaterial,
} from '../../src/adapters/stripe/oauth-token-exchange.ts';
import { MissingStripePlatformConfigurationError } from '../../src/adapters/stripe/oauth-state.ts';
import { STRIPE_U2_MISSING_OPERATOR_CONFIGURATION } from '../../src/adapters/stripe/oauth-state.ts';
import { SandboxLiveBoundaryError, ValidationError } from '../../src/errors.ts';

/**
 * The P27-A U2 token-exchange battery (ADR-0020 D4/D11 — the key-ready law).
 *
 * LAWS under test:
 * - KEY-READY REFUSAL: without the operator-gated platform client_id /
 *   client_secret every builder refuses with the TYPED
 *   MISSING_STRIPE_PLATFORM_CONFIGURATION carrying the EXACT §B-mapped
 *   items — never a simulated exchange, never a dead parameter.
 * - INV-25 AT THIS EDGE: a live-shaped platform secret (sk_live_/rk_live_)
 *   and a live-issued token are refused fail-closed.
 * - The platform secret travels ONLY in the HTTP Basic authorization
 *   header — never in the URL, never in the body fields.
 * - The typed error path: access_denied (user-denied, resumable),
 *   invalid_grant (code rejected), invalid_client (platform credentials
 *   rejected), invalid_scope — verbatim surfaced, never swallowed.
 * - The never-ACTIVE law's parse-side twin: a 2xx without an access_token
 *   is MALFORMED, never a fabricated TOKEN_ISSUED.
 */

describe('the platform configuration resolver (key-ready, fail-closed)', () => {
  it('resolves a well-formed configuration', () => {
    const config = requireStripePlatformOAuthConfiguration({
      clientId: 'ca_TESTPLATFORM0000000000000000',
      clientSecret: 'sk_test_PLATFORMSECRET00000000000000',
    });
    expect(config.clientId).toBe('ca_TESTPLATFORM0000000000000000');
    expect(config.clientSecret).toBe('sk_test_PLATFORMSECRET00000000000000');
  });

  it('refuses typed without the client_id, carrying the exact missing item', () => {
    try {
      requireStripePlatformOAuthConfiguration({
        clientSecret: 'sk_test_PLATFORMSECRET00000000000000',
      });
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingStripePlatformConfigurationError);
      const typed = error as MissingStripePlatformConfigurationError;
      expect(typed.details?.missingOperatorConfiguration).toEqual([
        STRIPE_U2_MISSING_OPERATOR_CONFIGURATION[0],
      ]);
    }
  });

  it('refuses typed without the client_secret, carrying the exact missing item', () => {
    try {
      requireStripePlatformOAuthConfiguration({ clientId: 'ca_TESTPLATFORM0000000000000000' });
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingStripePlatformConfigurationError);
      const typed = error as MissingStripePlatformConfigurationError;
      expect(typed.details?.missingOperatorConfiguration).toEqual([
        STRIPE_U2_MISSING_OPERATOR_CONFIGURATION[1],
      ]);
    }
  });

  it('refuses BOTH missing items together (the full UNCONFIGURED verdict)', () => {
    expect(() => requireStripePlatformOAuthConfiguration({})).toThrow(
      MissingStripePlatformConfigurationError,
    );
  });

  it('INV-25: refuses a live-shaped platform secret at this edge', () => {
    expect(() =>
      requireStripePlatformOAuthConfiguration({
        clientId: 'ca_TESTPLATFORM0000000000000000',
        clientSecret: 'sk_live_' + 'PLATFORMSECRET000000000000',
      }),
    ).toThrow(SandboxLiveBoundaryError);
    expect(() =>
      requireStripePlatformOAuthConfiguration({
        clientId: 'ca_TESTPLATFORM0000000000000000',
        clientSecret: 'rk_live_' + 'PLATFORMSECRET000000000000',
      }),
    ).toThrow(SandboxLiveBoundaryError);
  });
});

describe('the token-exchange request builder (the documented current shape)', () => {
  const configuration = {
    clientId: 'ca_TESTPLATFORM0000000000000000',
    clientSecret: 'sk_test_PLATFORMSECRET00000000000000',
  };

  it('builds grant_type=authorization_code with the secret ONLY in the basic header', () => {
    const request = buildStripeTokenExchangeRequest({
      code: 'ac_TESTAUTHCODE0000000000000000',
      ...configuration,
    });
    expect(request.url).toBe(STRIPE_OAUTH_TOKEN_URL);
    expect(request.url).toBe('https://connect.stripe.com/oauth/token');
    expect(request.bodyFields).toEqual({
      grant_type: 'authorization_code',
      code: 'ac_TESTAUTHCODE0000000000000000',
    });
    // The secret exists only inside the basic authorization header.
    expect(request.basicAuthorization.startsWith('Basic ')).toBe(true);
    expect(request.basicAuthorization).not.toContain(configuration.clientSecret);
    expect(JSON.stringify(request.bodyFields)).not.toContain(configuration.clientSecret);
    expect(request.url).not.toContain(configuration.clientSecret);
  });

  it('refuses without the platform configuration (never a simulated exchange)', () => {
    expect(() =>
      buildStripeTokenExchangeRequest({ code: 'ac_TESTAUTHCODE0000000000000000' }),
    ).toThrow(MissingStripePlatformConfigurationError);
  });

  it('refuses an empty authorization code', () => {
    expect(() => buildStripeTokenExchangeRequest({ code: '  ', ...configuration })).toThrow(
      ValidationError,
    );
  });

  it('builds the deauthorize request with client_id + stripe_user_id in the body', () => {
    const request = buildStripeDeauthorizeRequest({
      stripeUserId: 'acct_00000000000000',
      ...configuration,
    });
    expect(request.url).toBe(STRIPE_OAUTH_DEAUTHORIZE_URL);
    expect(request.bodyFields).toEqual({
      client_id: 'ca_TESTPLATFORM0000000000000000',
      stripe_user_id: 'acct_00000000000000',
    });
    expect(request.basicAuthorization.startsWith('Basic ')).toBe(true);
    expect(JSON.stringify(request.bodyFields)).not.toContain(configuration.clientSecret);
  });
});

describe('the typed OAuth error classification (verbatim, never swallowed)', () => {
  it('classifies the documented provider error vocabulary', () => {
    expect(classifyStripeOAuthError('access_denied')).toEqual({ kind: 'USER_DENIED' });
    expect(classifyStripeOAuthError('invalid_grant')).toEqual({ kind: 'CODE_REJECTED' });
    expect(classifyStripeOAuthError('invalid_client')).toEqual({
      kind: 'PLATFORM_CREDENTIAL_REJECTED',
    });
    expect(classifyStripeOAuthError('invalid_scope')).toEqual({ kind: 'SCOPE_REJECTED' });
  });

  it('carries any other error verbatim (never a guessed class)', () => {
    expect(classifyStripeOAuthError('some_new_error')).toEqual({
      kind: 'REQUEST_REJECTED',
      verbatim: 'some_new_error',
    });
  });
});

describe('the token-response parser (fail-closed; the never-ACTIVE parse twin)', () => {
  it('parses a documented TOKEN_ISSUED response', () => {
    const outcome = parseStripeOAuthTokenResponse({
      token_type: 'bearer',
      scope: 'read_only',
      livemode: false,
      stripe_user_id: 'acct_00000000000000',
      access_token: 'sk_test_ACCESSTOKEN000000000000000',
      refresh_token: 'rt_TESTREFRESHTOKEN0000000000000',
    });
    expect(outcome.kind).toBe('TOKEN_ISSUED');
    if (outcome.kind !== 'TOKEN_ISSUED') return;
    expect(outcome.livemode).toBe(false);
    expect(outcome.scope).toBe('read_only');
    expect(outcome.stripeUserId).toBe('acct_00000000000000');
    expect(outcome.refreshTokenPresent).toBe(true);
    expect(outcome.accessTokenMaterial.stripeAccessToken).toBe(
      'sk_test_ACCESSTOKEN000000000000000',
    );
    expect(outcome.refreshTokenMaterial?.stripeRefreshToken).toBe(
      'rt_TESTREFRESHTOKEN0000000000000',
    );
  });

  it('parses a response without a refresh token (refreshTokenPresent false)', () => {
    const outcome = parseStripeOAuthTokenResponse({
      token_type: 'bearer',
      livemode: false,
      access_token: 'sk_test_ACCESSTOKEN000000000000000',
    });
    expect(outcome.kind).toBe('TOKEN_ISSUED');
    if (outcome.kind !== 'TOKEN_ISSUED') return;
    expect(outcome.refreshTokenPresent).toBe(false);
    expect(outcome.refreshTokenMaterial).toBeNull();
    expect(outcome.stripeUserId).toBeNull();
  });

  it('parses the documented provider error shape with the verbatim strings', () => {
    const outcome = parseStripeOAuthTokenResponse({
      error: 'invalid_grant',
      error_description: 'Authorization code does not exist: ac_...',
    });
    expect(outcome.kind).toBe('PROVIDER_ERROR');
    if (outcome.kind !== 'PROVIDER_ERROR') return;
    expect(outcome.classification).toEqual({ kind: 'CODE_REJECTED' });
    expect(outcome.verbatimError).toBe('invalid_grant');
    expect(outcome.verbatimDescription).toBe('Authorization code does not exist: ac_...');
  });

  it('MALFORMED on non-objects and on a 2xx without an access token', () => {
    expect(parseStripeOAuthTokenResponse(null).kind).toBe('MALFORMED_RESPONSE');
    expect(parseStripeOAuthTokenResponse('nope').kind).toBe('MALFORMED_RESPONSE');
    expect(parseStripeOAuthTokenResponse([1, 2]).kind).toBe('MALFORMED_RESPONSE');
    expect(parseStripeOAuthTokenResponse({ livemode: false }).kind).toBe('MALFORMED_RESPONSE');
  });

  it('INV-25: a live-issued token is a typed provider refusal, never sealed', () => {
    const outcome = parseStripeOAuthTokenResponse({
      token_type: 'bearer',
      livemode: true,
      access_token: 'sk_live_' + 'ACCESSTOKEN000000000000000',
    });
    expect(outcome.kind).toBe('PROVIDER_ERROR');
    if (outcome.kind !== 'PROVIDER_ERROR') return;
    expect(outcome.verbatimError).toBe('livemode_token_issued');
  });
});

describe('the U2 credential-material validation (the seal-side shape law)', () => {
  it('validates a test-shaped access token material', () => {
    expect(validateStripeOAuthTokenMaterial({ stripeAccessToken: 'sk_test_TOKEN0000' })).toEqual({
      stripeAccessToken: 'sk_test_TOKEN0000',
    });
  });

  it('refuses malformed material shapes', () => {
    expect(() => validateStripeOAuthTokenMaterial(null)).toThrow(ValidationError);
    expect(() => validateStripeOAuthTokenMaterial('sk_test_TOKEN0000')).toThrow(ValidationError);
    expect(() => validateStripeOAuthTokenMaterial({})).toThrow(ValidationError);
    expect(() => validateStripeOAuthTokenMaterial({ stripeAccessToken: '' })).toThrow(
      ValidationError,
    );
  });

  it('INV-25: refuses a live-shaped access token (mode is not a UI choice)', () => {
    expect(() =>
      validateStripeOAuthTokenMaterial({ stripeAccessToken: 'sk_live_' + 'TOKEN0000' }),
    ).toThrow(SandboxLiveBoundaryError);
    expect(() =>
      validateStripeOAuthTokenMaterial({ stripeAccessToken: 'rk_live_' + 'TOKEN0000' }),
    ).toThrow(SandboxLiveBoundaryError);
  });
});
