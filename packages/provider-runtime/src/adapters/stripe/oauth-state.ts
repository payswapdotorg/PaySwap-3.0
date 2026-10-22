/**
 * @payswap/provider-runtime — the Stripe OAuth state machinery for the
 * declared-but-UNCONFIGURED U2/U3 forms (P13-B, ADR-0007 D3).
 *
 * THE RETURN/CORRELATION CONTRACT (D3, pinned): each outbound auth attempt
 * mints a SINGLE-USE state (crypto-random, minted HOST-side — the entropy
 * is INJECTED so this package stays deterministic), bound to
 * {taskId, providerId, form, requestedScopes, expiresAt} with a 600-second
 * default lifetime. On return: state must be known + unconsumed +
 * unexpired; the `error` param is surfaced VERBATIM (user-denied returns
 * the task to a resumable state with the reason recorded — never silently
 * retried); consumed states are MONOTONIC (a second consumption is
 * rejected, never replayed).
 *
 * U2/U3 are UNCONFIGURED in this deployment: `buildStripeAuthorizeUrl`
 * REFUSES without the platform client_id with the EXACT missing operator
 * configuration. The machinery is complete and unit-tested so the operator
 * configuration is the only missing piece.
 */

import { ProviderRuntimeError, ValidationError } from '../../errors.ts';
import type { TimestampMs } from '../../clock.ts';
import type { ConnectionForm } from '../../connection-forms.ts';

/** Default single-use state lifetime: 600 seconds (ADR-0007 D3). */
export const STRIPE_OAUTH_STATE_LIFETIME_MS = 600_000n;

/** The D3 binding: one outbound auth attempt's correlation record. */
export interface StripeOAuthStateBinding {
  /** The single-use state token (opaque; carried in the authorize URL). */
  readonly state: string;
  readonly taskId: string;
  readonly providerId: string;
  readonly form: ConnectionForm;
  readonly requestedScopes: readonly string[];
  readonly expiresAt: TimestampMs;
  /** Set at the first (and only) lawful consumption — monotonic. */
  readonly consumedAt: TimestampMs | null;
}

/** The consumption decision (fail-closed with the exact reason). */
export type StripeStateConsumption =
  | { readonly kind: 'CONSUMED'; readonly binding: StripeOAuthStateBinding }
  | {
      readonly kind: 'REJECTED';
      readonly reason: 'UNKNOWN_STATE' | 'STATE_EXPIRED' | 'STATE_ALREADY_CONSUMED';
    };

/**
 * Raised when a U2/U3 flow is attempted without the operator-gated Stripe
 * platform configuration — the EXACT missing items are carried in details.
 */
export class MissingStripePlatformConfigurationError extends ProviderRuntimeError {
  constructor(message: string, missing: readonly string[]) {
    super({
      code: 'MISSING_STRIPE_PLATFORM_CONFIGURATION',
      category: 'POLICY_BLOCKED',
      message,
      details: { missingOperatorConfiguration: [...missing] },
    });
  }
}

/** The exact missing operator configuration for U2 (ADR-0007 D1). */
export const STRIPE_U2_MISSING_OPERATOR_CONFIGURATION: readonly string[] = Object.freeze([
  'Stripe platform client_id (a registered Stripe platform application owned by the operator)',
  'Stripe platform client_secret (delivered to the host through the operator secret channel, never chat)',
]);

/** The exact missing operator configuration for U3 (ADR-0007 D1). */
export const STRIPE_U3_MISSING_OPERATOR_CONFIGURATION: readonly string[] = Object.freeze([
  'Stripe platform credentials (client_id + client_secret for the Connect platform)',
  'A webhook endpoint registered with Stripe for connected-account events, delivered to the operator-run PaySwap backend',
]);

/**
 * The state registry: mint, consume (single-use, monotonic), inspect.
 * Deterministic — the state token and clock are injected per call.
 */
export class StripeOAuthStateRegistry {
  readonly #bindings = new Map<string, StripeOAuthStateBinding>();

  /** Mint one single-use state binding (fails on duplicate tokens). */
  mint(
    input: {
      readonly taskId: string;
      readonly providerId: string;
      readonly form: ConnectionForm;
      readonly requestedScopes?: readonly string[];
      readonly lifetimeMs?: TimestampMs;
    },
    deps: { readonly now: TimestampMs; readonly newState: () => string },
  ): StripeOAuthStateBinding {
    for (const field of ['taskId', 'providerId'] as const) {
      if (typeof input[field] !== 'string' || input[field].length === 0) {
        throw new ValidationError(`state minting requires a non-empty ${field}`);
      }
    }
    const lifetime = input.lifetimeMs ?? STRIPE_OAUTH_STATE_LIFETIME_MS;
    if (typeof lifetime !== 'bigint' || lifetime <= 0n) {
      throw new ValidationError('state lifetime must be a positive bigint', {
        lifetimeMs: String(lifetime),
      });
    }
    if (typeof deps.newState !== 'function') {
      throw new ValidationError('state minting requires an injected newState entropy source');
    }
    const state = deps.newState();
    if (typeof state !== 'string' || state.trim().length < 16 || state.length > 256) {
      throw new ValidationError(
        'minted states must be opaque strings of 16-256 characters (crypto-random at the host edge)',
      );
    }
    if (this.#bindings.has(state)) {
      throw new ValidationError('state collision — the injected entropy source is not random');
    }
    const binding: StripeOAuthStateBinding = Object.freeze({
      state,
      taskId: input.taskId,
      providerId: input.providerId,
      form: input.form,
      requestedScopes: Object.freeze([...(input.requestedScopes ?? [])]),
      expiresAt: deps.now + lifetime,
      consumedAt: null,
    });
    this.#bindings.set(state, binding);
    return binding;
  }

  /**
   * Consume a state (single-use, monotonic). The FIRST lawful consumption
   * records consumedAt and returns CONSUMED; any later attempt on the same
   * state is REJECTED (STATE_ALREADY_CONSUMED — a replayed return can
   * never re-drive the flow). Expired states are rejected even when never
   * consumed.
   */
  consume(state: string, now: TimestampMs): StripeStateConsumption {
    const binding = this.#bindings.get(state);
    if (binding === undefined) {
      return { kind: 'REJECTED', reason: 'UNKNOWN_STATE' };
    }
    if (binding.consumedAt !== null) {
      return { kind: 'REJECTED', reason: 'STATE_ALREADY_CONSUMED' };
    }
    if (now >= binding.expiresAt) {
      return { kind: 'REJECTED', reason: 'STATE_EXPIRED' };
    }
    const consumed: StripeOAuthStateBinding = Object.freeze({ ...binding, consumedAt: now });
    this.#bindings.set(state, consumed);
    return { kind: 'CONSUMED', binding: consumed };
  }

  /** Read-only inspection (never consumes). */
  get(state: string): StripeOAuthStateBinding | undefined {
    return this.#bindings.get(state);
  }

  /** All live bindings (audit surface; never secret material). */
  list(): readonly StripeOAuthStateBinding[] {
    return [...this.#bindings.values()];
  }
}

/**
 * Build the Stripe OAuth authorize URL (U2). REFUSES without the platform
 * client_id, carrying the EXACT missing operator configuration — never a
 * simulated authorize URL, never a dead parameter.
 */
export function buildStripeAuthorizeUrl(input: {
  readonly clientId?: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly scope?: string;
}): string {
  if (typeof input.clientId !== 'string' || input.clientId.trim().length === 0) {
    throw new MissingStripePlatformConfigurationError(
      'the Stripe delegated-OAuth form is UNCONFIGURED: building an authorize URL requires the operator-gated Stripe platform configuration',
      STRIPE_U2_MISSING_OPERATOR_CONFIGURATION,
    );
  }
  if (typeof input.redirectUri !== 'string' || input.redirectUri.length === 0) {
    throw new ValidationError('building an authorize URL requires a redirect URI');
  }
  if (typeof input.state !== 'string' || input.state.length === 0) {
    throw new ValidationError('building an authorize URL requires the minted state');
  }
  const url = new URL('https://connect.stripe.com/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('scope', input.scope ?? 'read_only');
  return url.toString();
}

/** The provider return params (error surfaced VERBATIM — D3 honesty). */
export interface StripeReturnParams {
  readonly state: string | null;
  readonly code: string | null;
  readonly error: string | null;
  readonly errorDescription: string | null;
}

/**
 * Read the return params from a provider callback URL's query. `error` and
 * `error_description` are surfaced verbatim (user-denied is a reason to
 * record, never to swallow or silently retry).
 */
export function readStripeReturnParams(searchParams: URLSearchParams): StripeReturnParams {
  const read = (name: string): string | null => {
    const value = searchParams.get(name);
    return typeof value === 'string' && value.length > 0 ? value : null;
  };
  return {
    state: read('state'),
    code: read('code'),
    error: read('error'),
    errorDescription: read('error_description'),
  };
}
