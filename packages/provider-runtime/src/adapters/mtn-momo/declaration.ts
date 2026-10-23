/**
 * @payswap/provider-runtime — the MTN MoMo (Mobile Money) registry
 * declaration (P14-C, ADR-0008 D5): a TYPED PREREQUISITE, no adapter.
 *
 * THE HONEST STATE (the credential inventory, P13): the delivered MoMo
 * sandbox credentials are INVALID AS PROVIDED — every product's token
 * endpoint (collection, disbursement, remittance) and the provisioning
 * read answered 401 "invalid subscription key". Per the D5 precedent
 * (the Stripe U2/U3 law): a mechanism whose required operator
 * configuration does not exist is declared UNCONFIGURED with the EXACT
 * missing items — never a dead button, never a simulated flow, never an
 * adapter that cannot be verified.
 *
 * THE MECHANISM (for when valid credentials arrive): MoMo's provider-
 * defined handshake — an API user (X-Reference-Id) provisioned in the
 * MoMo developer portal, an API key issued for it, the pair exchanged
 * for a Bearer token, and every call carrying the
 * Ocp-Apim-Subscription-Key header. The sealed material would be the
 * provider-issued key SET; the registry's credentialKind is API_KEY
 * (the programmatic key class of the SCOPED_API_CREDENTIAL form) and
 * the typed prerequisite below enumerates every component — nothing is
 * paraphrased or glossed.
 *
 * NO ADAPTER SHIPS: no transport, no probe, no capabilities derivation —
 * nothing unverifiable exists in this tree for MoMo.
 */

import type { PaymentProviderRegistryEntry } from '../registry-declaration.ts';
import { validatePaymentProviderRegistryEntry } from '../registry-declaration.ts';

/** The declared payment provider id for MTN MoMo. */
export const MTN_MOMO_PROVIDER_ID = 'mtn-momo' as const;

/** The EXACT missing operator configuration (machine-checkable honesty). */
export const MTN_MOMO_MISSING_OPERATOR_CONFIGURATION: readonly string[] = Object.freeze([
  'A valid MTN MoMo Ocp-Apim-Subscription-Key for the sandbox product (the delivered key answers 401 "invalid subscription key" on the collection, disbursement and remittance token endpoints and on the apiuser provisioning read)',
  'A provisioned MTN MoMo API user (X-Reference-Id) for the target product',
  'The MTN MoMo API key issued for that API user (delivered through the operator secret channel, never chat)',
]);

/**
 * THE MTN MOMO REGISTRY ENTRY (typed data; validated at module load).
 * One UNCONFIGURED form — the typed prerequisite IS the deliverable.
 */
export const MTN_MOMO_REGISTRY_ENTRY: PaymentProviderRegistryEntry = Object.freeze({
  providerId: MTN_MOMO_PROVIDER_ID,
  displayName: 'MTN MoMo',
  summary:
    'MTN Mobile Money collection for Ghana and other MTN markets. Not configurable in this deployment: the delivered sandbox credentials are rejected by every MoMo product endpoint — the exact missing configuration is stated, never simulated.',
  forms: Object.freeze([
    Object.freeze({
      useCaseRef: 'own-collection-test-mode',
      form: 'SCOPED_API_CREDENTIAL' as const,
      status: 'UNCONFIGURED' as const,
      authMechanism: 'provider-defined-handshake' as const,
      credentialKind: 'API_KEY' as const,
      executionModes: Object.freeze(['SANDBOX' as const]),
      requiredOperationClasses: Object.freeze([
        'READ_PROVIDER_STATE' as const,
        'OBSERVE_EXTERNAL_FUNDS' as const,
        'MANAGE_CONNECTION' as const,
      ]),
      allowedEffectClasses: Object.freeze(['NONE' as const, 'OBSERVATION_ONLY' as const]),
      accountModel:
        'The operator\u2019s own MTN MoMo merchant account for one product (collection, disbursement or remittance — one connection each)',
      verificationProbe: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            operationId: 'mtn-momo.account.read',
            endpoint: 'GET /v1_0/apiuser/{reference-id}',
            effectClass: 'OBSERVATION_ONLY' as const,
          }),
        ]),
        proves:
          'The provisioned API user is retrievable read-only with the subscription key and the exchanged token (the only path a future MoMo connection could reach ACTIVE — a pasted key alone is never ACTIVE).',
      }),
      webhookRequirement: Object.freeze({
        required: false,
        reason:
          'The declared read-only slice observes account state on demand; no webhook endpoint is required.',
      }),
      revocation: Object.freeze({
        providerRejectionSignals: Object.freeze([
          'invalid_subscription_key',
          'token_exchange_rejected',
          'key_revoked_by_operator',
        ]),
        onProviderRejection: 'REVOKED_WITH_PROVIDER_EVIDENCE' as const,
        reArmsAfterRejection: false,
      }),
      retry: Object.freeze({
        retryableFailures: Object.freeze(['REFUSED_BEFORE_DISPATCH', 'TIMEOUT_AFTER_DISPATCH'] as const),
        unknownRequiresReconciliation: true,
        guidance:
          'A future verification probe can be retried when it failed before dispatch or timed out; an UNKNOWN probe reconciles by running the read-only probe again before anything else.',
      }),
      missingOperatorConfiguration: MTN_MOMO_MISSING_OPERATOR_CONFIGURATION,
      summary:
        'Collect payments into your own MTN Mobile Money merchant account (Ghana sandbox first). Requires a valid MoMo subscription key and a provisioned API user + API key — the delivered sandbox credentials are invalid (401 on every product endpoint), so the exact missing configuration is stated and nothing is simulated.',
    }),
  ]),
});

// The declaration is validated at module load (the construction-defect law).
validatePaymentProviderRegistryEntry(MTN_MOMO_REGISTRY_ENTRY);
