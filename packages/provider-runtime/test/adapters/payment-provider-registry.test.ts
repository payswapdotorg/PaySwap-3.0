import { describe, expect, it } from 'vitest';
import { PAYMENT_PROVIDER_REGISTRY } from '../../src/adapters/payment-provider-registry.ts';
import { STRIPE_REGISTRY_ENTRY } from '../../src/adapters/stripe/declaration.ts';
import { FLUTTERWAVE_REGISTRY_ENTRY } from '../../src/adapters/flutterwave/declaration.ts';
import { PAYSTACK_REGISTRY_ENTRY } from '../../src/adapters/paystack/declaration.ts';
import {
  MTN_MOMO_REGISTRY_ENTRY,
  MTN_MOMO_MISSING_OPERATOR_CONFIGURATION,
  MTN_MOMO_PROVIDER_ID,
} from '../../src/adapters/mtn-momo/declaration.ts';
import {
  findPaymentProviderForm,
  validatePaymentProviderRegistryEntry,
} from '../../src/adapters/registry-declaration.ts';

/**
 * P14-C battery (ADR-0008 D5): the composed canonical registry + the MTN
 * MoMo typed-prerequisite law. The registry is COMPOSED DATA — each
 * provider owns its declaration (validated at its module load); this
 * battery pins the composition and the honest MoMo state.
 */

describe('the composed canonical payment-provider registry', () => {
  it('declares exactly the four providers, each entry already validated at module load', () => {
    expect(PAYMENT_PROVIDER_REGISTRY.map((entry) => entry.providerId)).toEqual([
      'stripe',
      'flutterwave',
      'paystack',
      'mtn-momo',
    ]);
    for (const entry of PAYMENT_PROVIDER_REGISTRY) {
      // Re-validating here is belt-and-braces: module load already ran it.
      expect(() => validatePaymentProviderRegistryEntry(entry)).not.toThrow();
    }
    expect(PAYMENT_PROVIDER_REGISTRY[0]).toBe(STRIPE_REGISTRY_ENTRY);
    expect(PAYMENT_PROVIDER_REGISTRY[1]).toBe(FLUTTERWAVE_REGISTRY_ENTRY);
    expect(PAYMENT_PROVIDER_REGISTRY[2]).toBe(PAYSTACK_REGISTRY_ENTRY);
    expect(PAYMENT_PROVIDER_REGISTRY[3]).toBe(MTN_MOMO_REGISTRY_ENTRY);
  });

  it('findPaymentProviderForm resolves every provider\'s declared own-account form', () => {
    const expectedUseCases: Record<string, string> = {
      stripe: 'own-store-test-mode',
      flutterwave: 'own-store-test-mode',
      paystack: 'own-store-test-mode',
      'mtn-momo': 'own-collection-test-mode',
    };
    for (const [providerId, useCaseRef] of Object.entries(expectedUseCases)) {
      const found = findPaymentProviderForm(PAYMENT_PROVIDER_REGISTRY, providerId, 'SCOPED_API_CREDENTIAL');
      expect(found.declaration.useCaseRef).toBe(useCaseRef);
    }
    expect(() => findPaymentProviderForm(PAYMENT_PROVIDER_REGISTRY, 'wise', 'SCOPED_API_CREDENTIAL')).toThrow(
      /unknown payment provider/,
    );
  });

  it('the registry is frozen (adding a provider means editing the composition, never mutating)', () => {
    expect(Object.isFrozen(PAYMENT_PROVIDER_REGISTRY)).toBe(true);
  });
});

describe('the MTN MoMo typed prerequisite (the honest unconfigured state)', () => {
  it('is UNCONFIGURED with the EXACT missing operator configuration — never a dead button', () => {
    expect(MTN_MOMO_PROVIDER_ID).toBe('mtn-momo');
    const form = MTN_MOMO_REGISTRY_ENTRY.forms[0]!;
    expect(form.status).toBe('UNCONFIGURED');
    expect(form.authMechanism).toBe('provider-defined-handshake');
    const missing = form.missingOperatorConfiguration ?? [];
    expect(missing).toHaveLength(3);
    // The 401 fact is named machine-checkably, never paraphrased away.
    const joined = missing.join(' | ');
    expect(joined).toContain('Ocp-Apim-Subscription-Key');
    expect(joined).toContain('401');
    expect(joined).toContain('collection, disbursement and remittance');
    expect(joined).toContain('API user');
    expect(joined).toContain('API key');
    expect(MTN_MOMO_MISSING_OPERATOR_CONFIGURATION).toBe(missing);
  });

  it('the registry entry validates with the typed prerequisite (module-load law already ran)', () => {
    expect(() => validatePaymentProviderRegistryEntry(MTN_MOMO_REGISTRY_ENTRY)).not.toThrow();
  });

  it('the summary states the honest boundary verbatim (nothing simulated)', () => {
    const form = MTN_MOMO_REGISTRY_ENTRY.forms[0]!;
    expect(form.summary).toContain('invalid');
    expect(form.summary).toContain('401');
    expect(form.summary).toContain('nothing is simulated');
  });
});
