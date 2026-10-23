import { describe, expect, it } from 'vitest';
import {
  STRIPE_REGISTRY_ENTRY,
  STRIPE_PROVIDER_ID,
  STRIPE_API_BASE_URL,
  STRIPE_OPERATION_IDS,
} from '../../src/adapters/stripe/declaration.ts';
import { PAYMENT_PROVIDER_REGISTRY } from '../../src/adapters/payment-provider-registry.ts';
import {
  findPaymentProviderForm,
  validatePaymentProviderFormDeclaration,
  validatePaymentProviderRegistryEntry,
  type PaymentProviderFormDeclaration,
  type PaymentProviderRegistryEntry,
} from '../../src/adapters/registry-declaration.ts';
import { ValidationError } from '../../src/errors.ts';

/**
 * The Stripe registry declaration battery (P13-B, ADR-0007 D1/D5).
 *
 * HONESTY LAWS under test:
 * - U1 (own-store test mode) is the ONE configured form: SCOPED_API_CREDENTIAL
 *   × API_KEY on SANDBOX, verified by the two-step read-only probe.
 * - U2/U3 are declared UNCONFIGURED with the EXACT missing operator
 *   configuration items — never omitted, never paraphrased away.
 * - Every declared (form, credentialKind) satisfies the canonical
 *   connection-forms consistency law (fail-closed at validation time).
 * - The never-ACTIVE law is written into the probe `proves` statements.
 */

const U1 = STRIPE_REGISTRY_ENTRY.forms.find((f) => f.useCaseRef === 'own-store-test-mode');
const U2 = STRIPE_REGISTRY_ENTRY.forms.find((f) => f.useCaseRef === 'existing-account-grant');
const U3 = STRIPE_REGISTRY_ENTRY.forms.find(
  (f) => f.useCaseRef === 'marketplace-connected-accounts',
);

describe('the Stripe registry entry (ADR-0007 D1)', () => {
  it('is the first real entry of the canonical composed payment-provider registry', () => {
    expect(PAYMENT_PROVIDER_REGISTRY[0]).toBe(STRIPE_REGISTRY_ENTRY);
    expect(PAYMENT_PROVIDER_REGISTRY.length).toBeGreaterThanOrEqual(1);
    expect(STRIPE_REGISTRY_ENTRY.providerId).toBe('stripe');
    expect(STRIPE_PROVIDER_ID).toBe('stripe');
  });

  it('declares exactly the THREE distinct Stripe integrations (U1/U2/U3)', () => {
    expect(U1).toBeDefined();
    expect(U2).toBeDefined();
    expect(U3).toBeDefined();
    expect(STRIPE_REGISTRY_ENTRY.forms).toHaveLength(3);
    expect(new Set(STRIPE_REGISTRY_ENTRY.forms.map((f) => f.useCaseRef)).size).toBe(3);
  });

  it('U1 own-store test mode is CONFIGURED: restricted key, SANDBOX only, no operator platform registration', () => {
    expect(U1?.form).toBe('SCOPED_API_CREDENTIAL');
    expect(U1?.status).toBe('CONFIGURED');
    expect(U1?.authMechanism).toBe('restricted-key-host-broker');
    expect(U1?.credentialKind).toBe('API_KEY');
    expect([...(U1?.executionModes ?? [])]).toEqual(['SANDBOX']);
    expect(U1?.missingOperatorConfiguration).toBeUndefined();
  });

  it('U1 requests read-only operation classes and observation-only effects', () => {
    expect([...(U1?.requiredOperationClasses ?? [])]).toEqual([
      'READ_PROVIDER_STATE',
      'OBSERVE_EXTERNAL_FUNDS',
      'MANAGE_CONNECTION',
    ]);
    expect([...(U1?.allowedEffectClasses ?? [])]).toEqual(['NONE', 'OBSERVATION_ONLY']);
  });

  it('U1 declares the two-step read-only probe against the real Stripe REST endpoints', () => {
    const steps = [...(U1?.verificationProbe.steps ?? [])];
    expect(steps).toHaveLength(2);
    expect(steps[0]?.operationId).toBe('stripe.balance.read');
    expect(steps[0]?.endpoint).toBe('GET /v1/balance');
    expect(steps[0]?.effectClass).toBe('OBSERVATION_ONLY');
    expect(steps[1]?.operationId).toBe('stripe.account.read');
    expect(steps[1]?.endpoint).toBe('GET /v1/account');
    expect(steps[1]?.effectClass).toBe('OBSERVATION_ONLY');
  });

  it('the never-ACTIVE law is stated in the probe evidence contract', () => {
    expect(U1?.verificationProbe.proves).toContain('never ACTIVE');
    expect(U2?.verificationProbe.proves).toContain('never ACTIVE');
    expect(U3?.verificationProbe.proves).toContain('never ACTIVE');
  });

  it('U2 delegated OAuth is UNCONFIGURED with the EXACT missing operator configuration', () => {
    expect(U2?.form).toBe('DELEGATED_OAUTH');
    expect(U2?.status).toBe('UNCONFIGURED');
    expect(U2?.authMechanism).toBe('delegated-oauth');
    expect(U2?.credentialKind).toBe('OAUTH');
    const missing = [...(U2?.missingOperatorConfiguration ?? [])];
    expect(missing.length).toBeGreaterThanOrEqual(2);
    expect(missing.some((item) => item.includes('client_id'))).toBe(true);
    expect(missing.some((item) => item.includes('client_secret'))).toBe(true);
  });

  it('U3 connected accounts is UNCONFIGURED with the EXACT missing operator configuration incl. the webhook endpoint', () => {
    expect(U3?.form).toBe('CONNECTED_ACCOUNT');
    expect(U3?.status).toBe('UNCONFIGURED');
    expect(U3?.authMechanism).toBe('connected-account-links');
    expect(U3?.credentialKind).toBe('PROVIDER_DEFINED');
    expect(U3?.webhookRequirement.required).toBe(true);
    const missing = [...(U3?.missingOperatorConfiguration ?? [])];
    expect(missing.some((item) => item.includes('webhook endpoint'))).toBe(true);
  });

  it('U1 honestly declares no webhook requirement for the read-only slice', () => {
    expect(U1?.webhookRequirement.required).toBe(false);
    expect(U1?.webhookRequirement.reason.length).toBeGreaterThan(0);
  });

  it('every form declares provider-rejection revocation that never re-arms (monotonic law)', () => {
    for (const form of STRIPE_REGISTRY_ENTRY.forms) {
      expect(form.revocation.onProviderRejection).toBe('REVOKED_WITH_PROVIDER_EVIDENCE');
      expect(form.revocation.reArmsAfterRejection).toBe(false);
      expect(form.revocation.providerRejectionSignals.length).toBeGreaterThan(0);
    }
  });

  it('every form declares UNKNOWN-requires-reconciliation retry rules (INV-04)', () => {
    for (const form of STRIPE_REGISTRY_ENTRY.forms) {
      expect(form.retry.unknownRequiresReconciliation).toBe(true);
      expect([...form.retry.retryableFailures]).toEqual([
        'REFUSED_BEFORE_DISPATCH',
        'TIMEOUT_AFTER_DISPATCH',
      ]);
    }
  });

  it('pins the public Stripe API surface constants (no SDK, transport-owned endpoints)', () => {
    expect(STRIPE_API_BASE_URL).toBe('https://api.stripe.com');
    // P14-A (ADR-0008 D3): the write surface extends the map additively
    // — the two P13-B read endpoints first, then the four payment-intent
    // operations (create / confirm / retrieve / cancel).
    expect([...STRIPE_OPERATION_IDS]).toEqual([
      'stripe.balance.read',
      'stripe.account.read',
      'stripe.payment_intent.create',
      'stripe.payment_intent.confirm',
      'stripe.payment_intent.retrieve',
      'stripe.payment_intent.cancel',
    ]);
  });
});

describe('registry declaration validation (fail-closed)', () => {
  it('the Stripe entry passes whole-entry validation at module load shape', () => {
    expect(() => validatePaymentProviderRegistryEntry(STRIPE_REGISTRY_ENTRY)).not.toThrow();
  });

  it('rejects a form whose (form, credentialKind) pair violates the connection-forms law', () => {
    const broken: PaymentProviderFormDeclaration = {
      ...(U1 as PaymentProviderFormDeclaration),
      credentialKind: 'OAUTH',
    };
    expect(() => validatePaymentProviderFormDeclaration(broken)).toThrow(ValidationError);
  });

  it('rejects an UNCONFIGURED form without the exact missing operator configuration', () => {
    // The key genuinely OMITTED (the adversarial "without" case — not
    // an explicit undefined, which exactOptionalPropertyTypes rightly
    // rejects at the type level before the runtime validator runs).
    const { missingOperatorConfiguration: _omitted, ...withoutConfig } = U2 as unknown as {
      missingOperatorConfiguration?: readonly string[];
    };
    void _omitted;
    const broken = withoutConfig as unknown as PaymentProviderFormDeclaration;
    expect(() => validatePaymentProviderFormDeclaration(broken)).toThrow(ValidationError);
  });

  it('rejects a probe step that would carry a state-changing effect class', () => {
    // Adversarial by construction: the TYPE forbids STATE_CHANGING on a
    // probe step (read-only by construction), so the broken value is
    // cast through unknown — the RUNTIME validator must still refuse
    // it even if a future type regression lets it through.
    const broken = {
      ...(U1 as PaymentProviderFormDeclaration),
      verificationProbe: {
        steps: [
          {
            operationId: 'stripe.charge.create',
            endpoint: 'POST /v1/charges',
            effectClass: 'STATE_CHANGING',
          },
        ],
        proves: 'not read-only',
      },
    } as unknown as PaymentProviderFormDeclaration;
    expect(() => validatePaymentProviderFormDeclaration(broken)).toThrow(ValidationError);
  });

  it('rejects an entry with a duplicated use case', () => {
    const broken: PaymentProviderRegistryEntry = {
      providerId: 'broken-psp',
      displayName: 'Broken',
      summary: 'declares one use case twice',
      forms: [U1 as PaymentProviderFormDeclaration, U1 as PaymentProviderFormDeclaration],
    };
    expect(() => validatePaymentProviderRegistryEntry(broken)).toThrow(ValidationError);
  });

  it('rejects a form with no execution modes or no operation classes', () => {
    const noModes: PaymentProviderFormDeclaration = {
      ...(U1 as PaymentProviderFormDeclaration),
      executionModes: [],
    };
    expect(() => validatePaymentProviderFormDeclaration(noModes)).toThrow(ValidationError);
    const noOperations: PaymentProviderFormDeclaration = {
      ...(U1 as PaymentProviderFormDeclaration),
      requiredOperationClasses: [],
    };
    expect(() => validatePaymentProviderFormDeclaration(noOperations)).toThrow(ValidationError);
  });

  it('findPaymentProviderForm resolves (provider, form) fail-closed', () => {
    const found = findPaymentProviderForm(PAYMENT_PROVIDER_REGISTRY, 'stripe', 'SCOPED_API_CREDENTIAL');
    expect(found.declaration.useCaseRef).toBe('own-store-test-mode');
    expect(() => findPaymentProviderForm(PAYMENT_PROVIDER_REGISTRY, 'wise', 'SCOPED_API_CREDENTIAL')).toThrow(
      ValidationError,
    );
    expect(() =>
      findPaymentProviderForm(PAYMENT_PROVIDER_REGISTRY, 'stripe', 'PROVIDERLESS_RAIL'),
    ).toThrow(ValidationError);
  });
});
