/**
 * @payswap/provider-runtime — the Flutterwave registry declaration (P14-C,
 * ADR-0008 D5). The vertical slice in the P13-B shape: ONE configured
 * form — the own-store test-mode secret key through the host-side
 * credential broker, verified by a read-only balances probe.
 *
 * Flutterwave's credential vocabulary (public documentation):
 * - Secret keys: `FLWSECK_TEST-…` (test) / `FLWSECK-…` (live) — the
 *   server-side credential this form seals.
 * - Public keys (`FLWPUBK_TEST-`/`FLWPUBK-`) and encryption keys are
 *   browser-side / widget-side material, NOT server credentials — this
 *   form never seals them.
 * - Provenance: the mechanism row and the never-ACTIVE law follow the
 *   ADR-0007 D1 table shape; the endpoint is Flutterwave's public REST
 *   surface (api.flutterwave.com, GET /v3/balances) — NO SDK is used or
 *   required (the transport.ts law).
 *
 * LAWS (identical to the Stripe U1 slice):
 * - The ONLY path to ACTIVE is the read-only verification probe through
 *   the real transport INSIDE the credential seal (never-ACTIVE law).
 * - SANDBOX-only in this deployment (INV-25): the form declares test
 *   mode; a live key cannot bind it.
 */

import type { PaymentProviderRegistryEntry } from '../registry-declaration.ts';
import { validatePaymentProviderRegistryEntry } from '../registry-declaration.ts';

/** The declared payment provider id for Flutterwave. */
export const FLUTTERWAVE_PROVIDER_ID = 'flutterwave' as const;

/** Flutterwave REST API base URL (test and live share the host; keys select mode). */
export const FLUTTERWAVE_API_BASE_URL = 'https://api.flutterwave.com' as const;

/** The transport operation ids the Flutterwave adapter maps (evidence surface). */
export const FLUTTERWAVE_OPERATION_IDS = ['flutterwave.balances.read'] as const;
export type FlutterwaveOperationId = (typeof FLUTTERWAVE_OPERATION_IDS)[number];

/**
 * THE FLUTTERWAVE REGISTRY ENTRY (typed data; validated at module load so
 * a malformed declaration can never ship).
 */
export const FLUTTERWAVE_REGISTRY_ENTRY: PaymentProviderRegistryEntry = Object.freeze({
  providerId: FLUTTERWAVE_PROVIDER_ID,
  displayName: 'Flutterwave',
  summary:
    'Pan-African card, bank-transfer and mobile-money acceptance across NGN, KES, GHS and more. One onboarding mechanism in this build: your own store in test mode with a secret API key, sealed host-side and verified by a read-only balances probe.',
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
        'The operator\u2019s own Flutterwave merchant account (one account per connection; test mode by the FLWSECK_TEST- secret key)',
      verificationProbe: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            operationId: 'flutterwave.balances.read',
            endpoint: 'GET /v3/balances',
            effectClass: 'OBSERVATION_ONLY' as const,
          }),
        ]),
        proves:
          'The sealed secret key is accepted by Flutterwave for read-only balance access across the account\u2019s currency wallets in test mode (the only path to ACTIVE — a catalogue entry or pasted key alone is never ACTIVE).',
      }),
      webhookRequirement: Object.freeze({
        required: false,
        reason:
          'The read-only slice observes wallet balances on demand; no webhook endpoint is required for the declared slice.',
      }),
      revocation: Object.freeze({
        providerRejectionSignals: Object.freeze([
          'invalid_secret_key',
          'authorization_error',
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
        'Connect your own Flutterwave store in test mode with a secret API key (read-only). The key is entered in a host-side secret field once, sealed immediately, and verified by a read-only balances probe across your currency wallets.',
    }),
  ]),
});

// The declaration is validated at module load (the construction-defect law).
validatePaymentProviderRegistryEntry(FLUTTERWAVE_REGISTRY_ENTRY);
