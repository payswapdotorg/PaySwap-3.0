/**
 * @payswap/provider-runtime — the Paystack registry declaration (P14-C,
 * ADR-0008 D5; the operation surface GROWN by P22-H, ADR-0016 D8). The
 * vertical slice in the P13-B shape: ONE configured form — the own-store
 * test-mode secret key through the host-side credential broker, verified
 * by a read-only transactions probe.
 *
 * Paystack's credential vocabulary (public documentation):
 * - Secret keys: `sk_test_…` (test) / `sk_live_…` (live) — the
 *   server-side credential this form seals. The prefix law is IDENTICAL
 *   in shape to Stripe's (ADR-0008 D5).
 * - Public keys (`pk_test_`/`pk_live_`) are browser-side material, NOT
 *   server credentials — this form never seals them.
 * - Provenance: the endpoint is Paystack's public REST surface
 *   (api.paystack.co, GET /transaction) — NO SDK is used or required
 *   (the transport.ts law).
 *
 * THE PAYOUT LANE (ADR-0016 D8): the SAME sealed test key derives the
 * SANDBOX payout grant at DISPATCH time (the kernel's derivation — the
 * Stripe precedent; never a connection-scope growth): the transfer
 * surface's operation ids are pinned below and the read-only form
 * declaration is UNCHANGED (the connection's use-case scope stays
 * read-only; the probe stays the only path to ACTIVE).
 *
 * LAWS (identical to the Stripe U1 slice):
 * - The ONLY path to ACTIVE is the read-only verification probe through
 *   the real transport INSIDE the credential seal (never-ACTIVE law).
 * - SANDBOX-only in this deployment (INV-25): the form declares test
 *   mode; a live key cannot bind it.
 */

import type { PaymentProviderRegistryEntry } from '../registry-declaration.ts';
import { validatePaymentProviderRegistryEntry } from '../registry-declaration.ts';

/** The declared payment provider id for Paystack. */
export const PAYSTACK_PROVIDER_ID = 'paystack' as const;

/** Paystack REST API base URL (test and live share the host; keys select mode). */
export const PAYSTACK_API_BASE_URL = 'https://api.paystack.co' as const;

/**
 * The transport operation ids the Paystack adapter maps (evidence
 * surface). GROWN by ADR-0016 D8: the transfer surface (the corridor's
 * KES off-ramp lane) — initiate/finalize/verify, the transfer API's
 * real shapes.
 */
export const PAYSTACK_OPERATION_IDS = [
  'paystack.transactions.read',
  'paystack.transfer.initiate',
  'paystack.transfer.finalize',
  'paystack.transfer.verify',
] as const;
export type PaystackOperationId = (typeof PAYSTACK_OPERATION_IDS)[number];

/**
 * THE PAYSTACK REGISTRY ENTRY (typed data; validated at module load so
 * a malformed declaration can never ship).
 */
export const PAYSTACK_REGISTRY_ENTRY: PaymentProviderRegistryEntry = Object.freeze({
  providerId: PAYSTACK_PROVIDER_ID,
  displayName: 'Paystack',
  summary:
    'Nigerian and pan-African card, bank-transfer and mobile-money acceptance. One onboarding mechanism in this build: your own store in test mode with a secret API key, sealed host-side and verified by a read-only transactions probe.',
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
        'The operator\u2019s own Paystack business account (one account per connection; test mode by the sk_test_ secret key)',
      verificationProbe: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            operationId: 'paystack.transactions.read',
            endpoint: 'GET /transaction',
            effectClass: 'OBSERVATION_ONLY' as const,
          }),
        ]),
        proves:
          'The sealed secret key is accepted by Paystack for read-only transaction access in test mode (the only path to ACTIVE — a catalogue entry or pasted key alone is never ACTIVE).',
      }),
      webhookRequirement: Object.freeze({
        required: false,
        reason:
          'The read-only slice observes transactions on demand; no webhook endpoint is required for the declared slice.',
      }),
      revocation: Object.freeze({
        providerRejectionSignals: Object.freeze([
          'invalid_secret_key',
          'invalid_key',
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
        'Connect your own Paystack store in test mode with a secret API key (read-only). The key is entered in a host-side secret field once, sealed immediately, and verified by a read-only transactions probe.',
    }),
  ]),
});

// The declaration is validated at module load (the construction-defect law).
validatePaymentProviderRegistryEntry(PAYSTACK_REGISTRY_ENTRY);
