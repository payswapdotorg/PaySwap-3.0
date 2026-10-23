/**
 * @payswap/provider-runtime — the Stripe registry declaration (P13-B).
 *
 * ADR-0007 D1 (BINDING): Stripe setup is THREE DISTINCT integrations, and
 * P13-B's vertical slice is U1 (own-store test-mode restricted key through
 * the host-side credential broker). U2/U3 are declared UNCONFIGURED with
 * the EXACT missing operator configuration — never a dead button, never a
 * simulated OAuth.
 *
 * | Use case | Stripe mechanism | Form | Credential | Operator platform registration |
 * |---|---|---|---|---|
 * | U1 own-store acceptance | Restricted API key (test mode rk_test_/sk_test_) via host-side credential broker; read-only probe | SCOPED_API_CREDENTIAL | API_KEY | No |
 * | U2 existing account grant | Stripe OAuth /oauth/authorize + code→token at /oauth/token | DELEGATED_OAUTH | OAUTH | Yes — platform client_id + secret |
 * | U3 marketplace onboarding | Stripe Connect Account Links (Express/Custom) | CONNECTED_ACCOUNT | PROVIDER_DEFINED | Yes — platform credentials + webhook endpoint |
 *
 * Provenance: the mechanism table and the never-ACTIVE law are quoted from
 * ADR-0007 (docs/architecture-governance/adr/…-p13-agent-led-connector…);
 * the endpoints are Stripe's public REST API surface (api.stripe.com,
 * /v1/balance, /v1/account, /oauth/authorize, /oauth/token, Connect
 * account_links) — NO Stripe SDK is used or required (transport.ts law).
 */

import type { PaymentProviderRegistryEntry } from '../registry-declaration.ts';
import { validatePaymentProviderRegistryEntry } from '../registry-declaration.ts';

/** The single declared payment provider id for Stripe. */
export const STRIPE_PROVIDER_ID = 'stripe' as const;

/** Stripe REST API base URL (test and live share the host; keys select mode). */
export const STRIPE_API_BASE_URL = 'https://api.stripe.com' as const;

/** Stripe API version pinned for the adapter's Stripe-Version header. */
export const STRIPE_API_VERSION = '2025-08-27.basil' as const;

/** The transport operation ids the Stripe adapter maps (evidence surface). */
export const STRIPE_OPERATION_IDS = [
  'stripe.balance.read',
  'stripe.account.read',
  'stripe.payment_intent.create',
  'stripe.payment_intent.confirm',
  'stripe.payment_intent.retrieve',
  'stripe.payment_intent.cancel',
] as const;
export type StripeOperationId = (typeof STRIPE_OPERATION_IDS)[number];

/**
 * THE STRIPE REGISTRY ENTRY (typed data; validated at module load so a
 * malformed declaration can never ship — the boundary-test battery plus
 * the declaration test pin this).
 */
export const STRIPE_REGISTRY_ENTRY: PaymentProviderRegistryEntry = Object.freeze({
  providerId: STRIPE_PROVIDER_ID,
  displayName: 'Stripe',
  summary:
    'Card and bank payment acceptance. Three distinct onboarding mechanisms: a restricted API key for your own store (test mode live in this build), delegated OAuth for an existing account, and Stripe Connect for marketplace sellers.',
  forms: Object.freeze([
    Object.freeze({
      useCaseRef: 'own-store-test-mode',
      form: 'SCOPED_API_CREDENTIAL' as const,
      status: 'CONFIGURED' as const,
      authMechanism: 'restricted-key-host-broker' as const,
      credentialKind: 'API_KEY' as const,
      executionModes: Object.freeze(['SANDBOX' as const]),
      requiredOperationClasses: Object.freeze([
        'READ_PROVIDER_STATE' as const,
        'OBSERVE_EXTERNAL_FUNDS' as const,
        'MANAGE_CONNECTION' as const,
      ]),
      allowedEffectClasses: Object.freeze(['NONE' as const, 'OBSERVATION_ONLY' as const]),
      accountModel:
        'The operator\u2019s own Stripe account (one account per connection; test mode by restricted test key)',
      verificationProbe: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            operationId: 'stripe.balance.read',
            endpoint: 'GET /v1/balance',
            effectClass: 'OBSERVATION_ONLY' as const,
          }),
          Object.freeze({
            operationId: 'stripe.account.read',
            endpoint: 'GET /v1/account',
            effectClass: 'OBSERVATION_ONLY' as const,
          }),
        ]),
        proves:
          'The sealed restricted key is accepted by Stripe for read-only account and balance access in test mode (the only path to ACTIVE — a catalogue entry or pasted key alone is never ACTIVE).',
      }),
      webhookRequirement: Object.freeze({
        required: false,
        reason:
          'The read-only slice observes account and balance state on demand; no webhook endpoint is required until write or event-driven flows are enabled.',
      }),
      revocation: Object.freeze({
        providerRejectionSignals: Object.freeze([
          'invalid_api_key',
          'api_key_expired',
          'key_revoked_by_operator',
        ]),
        onProviderRejection: 'REVOKED_WITH_PROVIDER_EVIDENCE' as const,
        reArmsAfterRejection: false,
      }),
      retry: Object.freeze({
        retryableFailures: Object.freeze(['REFUSED_BEFORE_DISPATCH', 'TIMEOUT_AFTER_DISPATCH'] as const),
        unknownRequiresReconciliation: true,
        guidance:
          'A verification probe can be retried when it failed before dispatch or timed out; an UNKNOWN probe is reconciled by running the read-only probe again before anything else.',
      }),
      summary:
        'Connect your own Stripe store in test mode with a restricted API key (read-only). The key is entered in a host-side secret field, sealed immediately, and verified by a read-only balance + account probe.',
    }),
    Object.freeze({
      useCaseRef: 'existing-account-grant',
      form: 'DELEGATED_OAUTH' as const,
      status: 'UNCONFIGURED' as const,
      authMechanism: 'delegated-oauth' as const,
      credentialKind: 'OAUTH' as const,
      executionModes: Object.freeze(['SANDBOX' as const]),
      requiredOperationClasses: Object.freeze([
        'READ_PROVIDER_STATE' as const,
        'OBSERVE_EXTERNAL_FUNDS' as const,
        'MANAGE_CONNECTION' as const,
      ]),
      allowedEffectClasses: Object.freeze(['NONE' as const, 'OBSERVATION_ONLY' as const]),
      accountModel:
        'A user\u2019s existing Stripe account accessed through a scoped OAuth grant to the PaySwap platform',
      verificationProbe: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            operationId: 'stripe.account.read',
            endpoint: 'GET /v1/account',
            effectClass: 'OBSERVATION_ONLY' as const,
          }),
        ]),
        proves:
          'The delegated OAuth token is accepted by Stripe for read-only account access (only after a real code→token exchange — a redirect return alone is never ACTIVE).',
      }),
      webhookRequirement: Object.freeze({
        required: false,
        reason: 'Read-only observation only; no webhook endpoint required for the declared slice.',
      }),
      revocation: Object.freeze({
        providerRejectionSignals: Object.freeze(['invalid_grant', 'token_revoked']),
        onProviderRejection: 'REVOKED_WITH_PROVIDER_EVIDENCE' as const,
        reArmsAfterRejection: false,
      }),
      retry: Object.freeze({
        retryableFailures: Object.freeze(['REFUSED_BEFORE_DISPATCH', 'TIMEOUT_AFTER_DISPATCH'] as const),
        unknownRequiresReconciliation: true,
        guidance:
          'A denied authorization returns the connection to a resumable state with the reason recorded; it is never silently retried.',
      }),
      missingOperatorConfiguration: Object.freeze([
        'Stripe platform client_id (a registered Stripe platform application owned by the operator)',
        'Stripe platform client_secret (delivered to the host through the operator secret channel, never chat)',
      ]),
      summary:
        'Delegate PaySwap scoped read-only access to an existing Stripe account through Stripe OAuth in the system browser.',
    }),
    Object.freeze({
      useCaseRef: 'marketplace-connected-accounts',
      form: 'CONNECTED_ACCOUNT' as const,
      status: 'UNCONFIGURED' as const,
      authMechanism: 'connected-account-links' as const,
      credentialKind: 'PROVIDER_DEFINED' as const,
      executionModes: Object.freeze(['SANDBOX' as const]),
      requiredOperationClasses: Object.freeze([
        'READ_PROVIDER_STATE' as const,
        'OBSERVE_EXTERNAL_FUNDS' as const,
        'MANAGE_CONNECTION' as const,
      ]),
      allowedEffectClasses: Object.freeze(['NONE' as const, 'OBSERVATION_ONLY' as const]),
      accountModel:
        'Seller accounts connected to the PaySwap platform via Stripe Connect (Express/Custom) Account Links',
      verificationProbe: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            operationId: 'stripe.account.read',
            endpoint: 'GET /v1/account',
            effectClass: 'OBSERVATION_ONLY' as const,
          }),
        ]),
        proves:
          'The connected account is retrievable read-only after the seller completes the hosted onboarding (the return alone is never ACTIVE).',
      }),
      webhookRequirement: Object.freeze({
        required: true,
        reason:
          'Connected-account onboarding completes asynchronously (account.updated and payouts events); the read-only slice cannot observe completion without a registered webhook endpoint.',
      }),
      revocation: Object.freeze({
        providerRejectionSignals: Object.freeze(['account_rejected', 'account_closed']),
        onProviderRejection: 'REVOKED_WITH_PROVIDER_EVIDENCE' as const,
        reArmsAfterRejection: false,
      }),
      retry: Object.freeze({
        retryableFailures: Object.freeze(['REFUSED_BEFORE_DISPATCH', 'TIMEOUT_AFTER_DISPATCH'] as const),
        unknownRequiresReconciliation: true,
        guidance:
          'An incomplete hosted onboarding can be resumed with a fresh Account Link for the same connected account.',
      }),
      missingOperatorConfiguration: Object.freeze([
        'Stripe platform credentials (client_id + client_secret for the Connect platform)',
        'A webhook endpoint registered with Stripe for connected-account events, delivered to the operator-run PaySwap backend',
      ]),
      summary:
        'Onboard marketplace sellers as Stripe Connect accounts through hosted Account Links.',
    }),
  ]),
});

// The declaration is validated at module load: a malformed registry entry
// is a construction defect, never a runtime surprise.
validatePaymentProviderRegistryEntry(STRIPE_REGISTRY_ENTRY);

// The COMPOSED canonical registry (all providers) lives in
// ../payment-provider-registry.ts — the P14-C composition point
// (each provider owns its declaration; the list is frozen data).
