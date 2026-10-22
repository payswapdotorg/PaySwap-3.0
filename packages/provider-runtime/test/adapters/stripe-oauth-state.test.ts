import { describe, expect, it } from 'vitest';
import {
  StripeOAuthStateRegistry,
  STRIPE_OAUTH_STATE_LIFETIME_MS,
  STRIPE_U2_MISSING_OPERATOR_CONFIGURATION,
  STRIPE_U3_MISSING_OPERATOR_CONFIGURATION,
  MissingStripePlatformConfigurationError,
  buildStripeAuthorizeUrl,
  readStripeReturnParams,
} from '../../src/adapters/stripe/oauth-state.ts';
import { ValidationError } from '../../src/errors.ts';

/**
 * The D3 return/correlation state machinery battery (P13-B, ADR-0007 D3).
 *
 * LAWS under test:
 * - single-use, crypto-random-shaped states minted HOST-side (entropy
 *   injected — this package stays deterministic);
 * - 600-second default lifetime;
 * - MONOTONIC consumption: the first lawful consumption wins, any replay
 *   is rejected, expired states are rejected even when never consumed;
 * - U2 authorize-URL building REFUSES without the platform client_id,
 *   carrying the EXACT missing operator configuration (never simulated);
 * - the `error` return param is surfaced VERBATIM (user-denied is a
 *   reason to record, never to swallow or silently retry).
 */

function minted(registry: StripeOAuthStateRegistry, now = 0n, state = 'a'.repeat(32)) {
  return registry.mint(
    {
      taskId: 'task:CONNECTION_SETUP:FAKE0001',
      providerId: 'stripe',
      form: 'DELEGATED_OAUTH' as const,
      requestedScopes: ['read_only'],
    },
    { now, newState: () => state },
  );
}

describe('state minting (host-side, injected entropy)', () => {
  it('mints a single-use binding with the 600-second default lifetime', () => {
    const registry = new StripeOAuthStateRegistry();
    const binding = minted(registry);
    expect(binding.state).toBe('a'.repeat(32));
    expect(binding.taskId).toBe('task:CONNECTION_SETUP:FAKE0001');
    expect(binding.providerId).toBe('stripe');
    expect(binding.form).toBe('DELEGATED_OAUTH');
    expect(binding.requestedScopes).toEqual(['read_only']);
    expect(binding.expiresAt).toBe(0n + STRIPE_OAUTH_STATE_LIFETIME_MS);
    expect(binding.consumedAt).toBeNull();
    expect(STRIPE_OAUTH_STATE_LIFETIME_MS).toBe(600_000n);
  });

  it('refuses weak entropy shapes (too short, too long) and duplicate states', () => {
    const registry = new StripeOAuthStateRegistry();
    expect(() => minted(registry, 0n, 'short')).toThrow(ValidationError);
    expect(() => minted(registry, 0n, 'x'.repeat(257))).toThrow(ValidationError);
    expect(() => minted(registry, 0n, '   padded     ')).toThrow(ValidationError);
    minted(registry, 0n, 'a'.repeat(32));
    expect(() => minted(registry, 0n, 'a'.repeat(32))).toThrow(ValidationError);
  });

  it('refuses empty task/provider ids and non-positive lifetimes', () => {
    const registry = new StripeOAuthStateRegistry();
    expect(() =>
      registry.mint(
        { taskId: '', providerId: 'stripe', form: 'DELEGATED_OAUTH' },
        { now: 0n, newState: () => 'b'.repeat(32) },
      ),
    ).toThrow(ValidationError);
    expect(() =>
      registry.mint(
        { taskId: 't1', providerId: 'stripe', form: 'DELEGATED_OAUTH', lifetimeMs: 0n },
        { now: 0n, newState: () => 'c'.repeat(32) },
      ),
    ).toThrow(ValidationError);
    expect(() =>
      registry.mint(
        { taskId: 't1', providerId: 'stripe', form: 'DELEGATED_OAUTH' },
        { now: 0n, newState: undefined as unknown as () => string },
      ),
    ).toThrow(ValidationError);
  });
});

describe('state consumption (single-use, monotonic, expiring)', () => {
  it('the FIRST consumption wins and records consumedAt', () => {
    const registry = new StripeOAuthStateRegistry();
    const binding = minted(registry, 0n);
    const first = registry.consume(binding.state, 100n);
    expect(first.kind).toBe('CONSUMED');
    if (first.kind === 'CONSUMED') {
      expect(first.binding.consumedAt).toBe(100n);
      expect(first.binding.taskId).toBe(binding.taskId);
    }
  });

  it('a REPLAYED return is rejected (monotonic — a second consumption can never re-drive the flow)', () => {
    const registry = new StripeOAuthStateRegistry();
    const binding = minted(registry, 0n);
    expect(registry.consume(binding.state, 100n).kind).toBe('CONSUMED');
    const replay = registry.consume(binding.state, 200n);
    expect(replay).toEqual({ kind: 'REJECTED', reason: 'STATE_ALREADY_CONSUMED' });
    const replayMuchLater = registry.consume(binding.state, 10_000_000n);
    expect(replayMuchLater).toEqual({ kind: 'REJECTED', reason: 'STATE_ALREADY_CONSUMED' });
  });

  it('an EXPIRED state is rejected even when never consumed (10-minute window)', () => {
    const registry = new StripeOAuthStateRegistry();
    const binding = minted(registry, 0n);
    const atExpiry = registry.consume(binding.state, STRIPE_OAUTH_STATE_LIFETIME_MS);
    expect(atExpiry).toEqual({ kind: 'REJECTED', reason: 'STATE_EXPIRED' });
    const justBefore = new StripeOAuthStateRegistry();
    const other = minted(justBefore, 0n, 'd'.repeat(32));
    expect(justBefore.consume(other.state, STRIPE_OAUTH_STATE_LIFETIME_MS - 1n).kind).toBe('CONSUMED');
  });

  it('an UNKNOWN state is rejected fail-closed', () => {
    const registry = new StripeOAuthStateRegistry();
    expect(registry.consume('not-a-minted-state-000000000', 0n)).toEqual({
      kind: 'REJECTED',
      reason: 'UNKNOWN_STATE',
    });
  });

  it('inspection never consumes (get/list are audit surfaces)', () => {
    const registry = new StripeOAuthStateRegistry();
    const binding = minted(registry, 0n);
    expect(registry.get(binding.state)?.consumedAt).toBeNull();
    expect(registry.list()).toHaveLength(1);
    expect(registry.consume(binding.state, 1n).kind).toBe('CONSUMED');
    expect(registry.get(binding.state)?.consumedAt).toBe(1n);
    expect(registry.list()[0]?.consumedAt).toBe(1n);
  });
});

describe('the U2 authorize URL (REFUSES without the operator platform configuration)', () => {
  it('throws MissingStripePlatformConfigurationError with the EXACT missing items — never a simulated URL', () => {
    try {
      buildStripeAuthorizeUrl({ redirectUri: 'zcode://provider/callback', state: 'e'.repeat(32) });
      expect.unreachable('must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingStripePlatformConfigurationError);
      const typed = error as MissingStripePlatformConfigurationError;
      expect(typed.code).toBe('MISSING_STRIPE_PLATFORM_CONFIGURATION');
      expect(typed.category).toBe('POLICY_BLOCKED');
      expect(typed.details?.missingOperatorConfiguration).toEqual([
        ...STRIPE_U2_MISSING_OPERATOR_CONFIGURATION,
      ]);
    }
  });

  it('the missing operator configuration names the platform client_id and client_secret exactly', () => {
    expect(STRIPE_U2_MISSING_OPERATOR_CONFIGURATION.some((item) => item.includes('client_id'))).toBe(
      true,
    );
    expect(STRIPE_U2_MISSING_OPERATOR_CONFIGURATION.some((item) => item.includes('client_secret'))).toBe(
      true,
    );
    expect(STRIPE_U3_MISSING_OPERATOR_CONFIGURATION.some((item) => item.includes('webhook endpoint'))).toBe(
      true,
    );
  });

  it('with a client_id it builds the real Stripe authorize URL with read-only default scope', () => {
    const url = buildStripeAuthorizeUrl({
      clientId: 'ca_FAKE0001platform',
      redirectUri: 'zcode://provider/callback',
      state: 'f'.repeat(32),
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://connect.stripe.com/oauth/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('ca_FAKE0001platform');
    expect(parsed.searchParams.get('redirect_uri')).toBe('zcode://provider/callback');
    expect(parsed.searchParams.get('state')).toBe('f'.repeat(32));
    expect(parsed.searchParams.get('scope')).toBe('read_only');
  });

  it('refuses an empty client_id, empty redirect URI and empty state (fail-closed)', () => {
    expect(() =>
      buildStripeAuthorizeUrl({ clientId: '  ', redirectUri: 'zcode://provider/callback', state: 'g'.repeat(32) }),
    ).toThrow(MissingStripePlatformConfigurationError);
    expect(() =>
      buildStripeAuthorizeUrl({ clientId: 'ca_FAKE0001platform', redirectUri: '', state: 'g'.repeat(32) }),
    ).toThrow(ValidationError);
    expect(() =>
      buildStripeAuthorizeUrl({ clientId: 'ca_FAKE0001platform', redirectUri: 'zcode://provider/callback', state: '' }),
    ).toThrow(ValidationError);
  });
});

describe('the return params (error surfaced VERBATIM — D3 honesty)', () => {
  it('reads state/code and error/error_description from a provider callback query', () => {
    const params = new URLSearchParams();
    params.set('state', 'state0001');
    params.set('code', 'ac_FAKE0001code');
    params.set('error_description', 'denied by user');
    const read = readStripeReturnParams(params);
    expect(read.state).toBe('state0001');
    expect(read.code).toBe('ac_FAKE0001code');
    expect(read.errorDescription).toBe('denied by user');
  });

  it('surfaces the error param VERBATIM (user-denied is recorded, never swallowed)', () => {
    const params = new URLSearchParams('state=state0002&error=access_denied');
    const read = readStripeReturnParams(params);
    expect(read.error).toBe('access_denied');
    expect(read.code).toBeNull();
  });

  it('empty or absent params read as null (fail-closed, never invented)', () => {
    const read = readStripeReturnParams(new URLSearchParams('state=&code='));
    expect(read.state).toBeNull();
    expect(read.code).toBeNull();
    expect(read.error).toBeNull();
    expect(read.errorDescription).toBeNull();
  });
});
