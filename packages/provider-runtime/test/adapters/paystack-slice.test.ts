import { describe, expect, it } from 'vitest';
import { ValidationError, SandboxLiveBoundaryError } from '../../src/errors.ts';
import {
  PAYSTACK_REGISTRY_ENTRY,
  PAYSTACK_PROVIDER_ID,
  PAYSTACK_API_BASE_URL,
  PAYSTACK_OPERATION_IDS,
} from '../../src/adapters/paystack/declaration.ts';
import {
  paystackKeyMode,
  validatePaystackSecretKeyMaterial,
  validatePaystackKeyModeBinding,
  paystackReadOnlyScope,
  refuseConsequentialPaystackGrant,
  paystackUseCaseScope,
  derivePaystackSandboxPayoutGrant,
  paystackSandboxPayoutScope,
  PAYSTACK_READ_ONLY_OPERATION_CLASSES,
  PAYSTACK_SANDBOX_PAYOUT_OPERATION_CLASSES,
} from '../../src/adapters/paystack/capabilities.ts';
import { findPaymentProviderForm } from '../../src/adapters/registry-declaration.ts';

/**
 * P14-C battery (ADR-0008 D5): the Paystack registry declaration + key
 * capabilities — the vertical slice in the P13-B shape, with the
 * key-prefix law IDENTICAL in shape to Stripe's. Fake keys are
 * non-contiguously constructed test material ONLY.
 *
 * P22-H AMENDMENT (ADR-0016 D8, disclosed): the payout-lane facts grew —
 * the operation-id surface now carries the transfer ops, and the payout
 * grant derivation exists beside the unchanged read-only slice. The
 * amended assertions below carry the D8 re-pin comments.
 */

const FAKE_TEST_KEY = 'sk' + '_test_FAKE51keyDoNotUse0005';
const FAKE_LIVE_KEY = 'sk' + '_live_FAKE51keyDoNotUse0006';

describe('the Paystack registry entry (P14-C, the P13-B slice shape)', () => {
  it('declares ONE configured own-store test-mode form (SCOPED_API_CREDENTIAL + API_KEY)', () => {
    expect(PAYSTACK_REGISTRY_ENTRY.providerId).toBe('paystack');
    expect(PAYSTACK_PROVIDER_ID).toBe('paystack');
    expect(PAYSTACK_API_BASE_URL).toBe('https://api.paystack.co');
    expect(PAYSTACK_REGISTRY_ENTRY.forms).toHaveLength(1);
    const form = PAYSTACK_REGISTRY_ENTRY.forms[0]!;
    expect(form.useCaseRef).toBe('own-store-test-mode');
    expect(form.status).toBe('CONFIGURED');
    expect(form.form).toBe('SCOPED_API_CREDENTIAL');
    expect(form.credentialKind).toBe('API_KEY');
    expect(form.authMechanism).toBe('restricted-key-host-broker');
    expect(form.executionModes).toEqual(['SANDBOX']);
    // Read-only by construction: no CREATE/CANCEL class, no STATE_CHANGING effect.
    expect(form.requiredOperationClasses).not.toContain('CREATE_EXTERNAL_EFFECT');
    expect(form.allowedEffectClasses).not.toContain('STATE_CHANGING');
  });

  it('the verification probe contract is read-only and names the real endpoint', () => {
    const form = PAYSTACK_REGISTRY_ENTRY.forms[0]!;
    expect(form.verificationProbe.steps).toHaveLength(1);
    const step = form.verificationProbe.steps[0]!;
    expect(step.operationId).toBe('paystack.transactions.read');
    expect(step.endpoint).toBe('GET /transaction');
    expect(step.effectClass).toBe('OBSERVATION_ONLY');
    expect(form.verificationProbe.proves).toContain('never ACTIVE');
  });

  it('findPaymentProviderForm resolves the Paystack form fail-closed', () => {
    const found = findPaymentProviderForm(
      [PAYSTACK_REGISTRY_ENTRY],
      'paystack',
      'SCOPED_API_CREDENTIAL',
    );
    expect(found.declaration.useCaseRef).toBe('own-store-test-mode');
    expect(() =>
      findPaymentProviderForm([PAYSTACK_REGISTRY_ENTRY], 'paystack', 'DELEGATED_OAUTH'),
    ).toThrow(ValidationError);
    // P22-H re-pin (ADR-0016 D8): the operation surface grew the transfer
    // ops — the read op stays first, the transfer surface follows.
    expect(PAYSTACK_OPERATION_IDS).toEqual([
      'paystack.transactions.read',
      'paystack.transfer.initiate',
      'paystack.transfer.finalize',
      'paystack.transfer.verify',
    ]);
  });
});

describe('the Paystack key-mode law (INV-25 — identical in shape to Stripe\'s)', () => {
  it('sk_test_ selects test; sk_live_ selects live; anything else is null', () => {
    expect(paystackKeyMode(FAKE_TEST_KEY)).toBe('test');
    expect(paystackKeyMode(FAKE_LIVE_KEY)).toBe('live');
    expect(paystackKeyMode('pk_test_publicKeyMaterial')).toBeNull();
    expect(paystackKeyMode('')).toBeNull();
  });

  it('material validation refuses non-objects, empty keys and unknown prefixes (never echoes the key)', () => {
    expect(() => validatePaystackSecretKeyMaterial(null)).toThrow(ValidationError);
    expect(() => validatePaystackSecretKeyMaterial({ apiKey: '' })).toThrow(ValidationError);
    expect(() => validatePaystackSecretKeyMaterial({ apiKey: 'pk_test_public' })).toThrow(
      /canonical prefix/,
    );
    expect(validatePaystackSecretKeyMaterial({ apiKey: FAKE_TEST_KEY })).toEqual({
      apiKey: FAKE_TEST_KEY,
    });
  });

  it('a test key binds SANDBOX; a live key NEVER binds SANDBOX (the mechanical separation)', () => {
    expect(() => validatePaystackKeyModeBinding(FAKE_TEST_KEY, 'SANDBOX')).not.toThrow();
    expect(() => validatePaystackKeyModeBinding(FAKE_LIVE_KEY, 'SANDBOX')).toThrow(
      SandboxLiveBoundaryError,
    );
    expect(() => validatePaystackKeyModeBinding(FAKE_LIVE_KEY, 'LIVE')).not.toThrow();
    expect(() => validatePaystackKeyModeBinding(FAKE_TEST_KEY, 'LIVE')).toThrow(
      SandboxLiveBoundaryError,
    );
  });
});

describe('the Paystack read-only scope (fail-closed)', () => {
  it('grants exactly the read-only classes and observation-only effects (frozen)', () => {
    const scope = paystackReadOnlyScope();
    expect([...scope.allowedOperations]).toEqual([...PAYSTACK_READ_ONLY_OPERATION_CLASSES]);
    expect(scope.allowedEffectClasses).not.toContain('STATE_CHANGING');
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it('refuses any consequential grant from the READ-ONLY slice (the D8 amendment narrows, never widens)', () => {
    // P22-H re-pin (ADR-0016 D8, disclosed): the payout lane EXISTS now —
    // but the read-only slice's refusal law is unchanged: the slice never
    // grows a write class; the payout grant derives ONLY through
    // derivePaystackSandboxPayoutGrant (the test name's old claim "no
    // Paystack execution surface in this wave" is honestly amended).
    expect(() => refuseConsequentialPaystackGrant('CREATE_EXTERNAL_EFFECT')).toThrow(ValidationError);
    expect(() => refuseConsequentialPaystackGrant('CANCEL_OR_REVERSE_EFFECT')).toThrow(ValidationError);
    expect(() => refuseConsequentialPaystackGrant('READ_PROVIDER_STATE')).not.toThrow();
  });

  it('the use-case fold validates, binds the mode and returns the frozen read-only scope', () => {
    const scope = paystackUseCaseScope({ apiKey: FAKE_TEST_KEY }, 'SANDBOX');
    expect(scope.allowedOperations).toContain('OBSERVE_EXTERNAL_FUNDS');
    expect(() => paystackUseCaseScope({ apiKey: FAKE_LIVE_KEY }, 'SANDBOX')).toThrow(
      SandboxLiveBoundaryError,
    );
    expect(() =>
      paystackUseCaseScope({ apiKey: FAKE_TEST_KEY }, 'SANDBOX', ['CREATE_EXTERNAL_EFFECT']),
    ).toThrow(ValidationError);
  });
});

describe('the Paystack SANDBOX payout grant (P22-H, ADR-0016 D8 — the KES off-ramp lane)', () => {
  it('an sk_test_ key bound to SANDBOX derives the payout grant (CREATE_EXTERNAL_EFFECT only, never CANCEL)', () => {
    const scope = derivePaystackSandboxPayoutGrant(FAKE_TEST_KEY, 'SANDBOX');
    expect([...scope.allowedOperations]).toEqual([...PAYSTACK_SANDBOX_PAYOUT_OPERATION_CLASSES]);
    expect(scope.allowedOperations).toContain('CREATE_EXTERNAL_EFFECT');
    expect(scope.allowedOperations).not.toContain('CANCEL_OR_REVERSE_EFFECT');
    expect(scope.allowedEffectClasses).toContain('STATE_CHANGING');
    expect(scope.allowedDataClasses).toContain('TRANSFER_WRITE');
    expect(Object.isFrozen(scope)).toBe(true);
    expect(() => derivePaystackSandboxPayoutGrant(FAKE_LIVE_KEY, 'SANDBOX')).toThrow(
      SandboxLiveBoundaryError,
    );
  });

  it('the derivation is SANDBOX-only by name and by law (a live payout lane is never derived)', () => {
    expect(() => derivePaystackSandboxPayoutGrant(FAKE_TEST_KEY, 'LIVE')).toThrow(
      SandboxLiveBoundaryError,
    );
    expect(() => derivePaystackSandboxPayoutGrant(FAKE_LIVE_KEY, 'LIVE')).toThrow(
      SandboxLiveBoundaryError,
    );
  });

  it('the payout scope is distinct from the read-only scope (the read surface never widens)', () => {
    const payout = paystackSandboxPayoutScope();
    const readOnly = paystackReadOnlyScope();
    expect(readOnly.allowedOperations).not.toContain('CREATE_EXTERNAL_EFFECT');
    expect(payout.allowedOperations).toContain('READ_PROVIDER_STATE');
  });
});
