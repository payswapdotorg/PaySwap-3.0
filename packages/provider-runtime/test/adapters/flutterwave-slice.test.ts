import { describe, expect, it } from 'vitest';
import { ValidationError, SandboxLiveBoundaryError } from '../../src/errors.ts';
import {
  FLUTTERWAVE_REGISTRY_ENTRY,
  FLUTTERWAVE_PROVIDER_ID,
  FLUTTERWAVE_API_BASE_URL,
  FLUTTERWAVE_OPERATION_IDS,
} from '../../src/adapters/flutterwave/declaration.ts';
import {
  flutterwaveKeyMode,
  validateFlutterwaveSecretKeyMaterial,
  validateFlutterwaveKeyModeBinding,
  flutterwaveReadOnlyScope,
  refuseConsequentialFlutterwaveGrant,
  flutterwaveUseCaseScope,
  FLUTTERWAVE_READ_ONLY_OPERATION_CLASSES,
} from '../../src/adapters/flutterwave/capabilities.ts';
import { findPaymentProviderForm } from '../../src/adapters/registry-declaration.ts';

/**
 * P14-C battery (ADR-0008 D5): the Flutterwave registry declaration +
 * key capabilities — the vertical slice in the P13-B shape. Fake keys
 * are non-contiguously constructed test material ONLY.
 */

const FAKE_TEST_KEY = 'FLWSECK_TEST-' + 'FAKE51keyDoNotUse0001';
const FAKE_LIVE_KEY = 'FLWSECK-' + 'FAKE51keyDoNotUse0002';

describe('the Flutterwave registry entry (P14-C, the P13-B slice shape)', () => {
  it('declares ONE configured own-store test-mode form (SCOPED_API_CREDENTIAL + API_KEY)', () => {
    expect(FLUTTERWAVE_REGISTRY_ENTRY.providerId).toBe('flutterwave');
    expect(FLUTTERWAVE_PROVIDER_ID).toBe('flutterwave');
    expect(FLUTTERWAVE_API_BASE_URL).toBe('https://api.flutterwave.com');
    expect(FLUTTERWAVE_REGISTRY_ENTRY.forms).toHaveLength(1);
    const form = FLUTTERWAVE_REGISTRY_ENTRY.forms[0]!;
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
    const form = FLUTTERWAVE_REGISTRY_ENTRY.forms[0]!;
    expect(form.verificationProbe.steps).toHaveLength(1);
    const step = form.verificationProbe.steps[0]!;
    expect(step.operationId).toBe('flutterwave.balances.read');
    expect(step.endpoint).toBe('GET /v3/balances');
    expect(step.effectClass).toBe('OBSERVATION_ONLY');
    // The never-ACTIVE law is stated in the proof contract.
    expect(form.verificationProbe.proves).toContain('never ACTIVE');
  });

  it('findPaymentProviderForm resolves the Flutterwave form fail-closed', () => {
    const found = findPaymentProviderForm(
      [FLUTTERWAVE_REGISTRY_ENTRY],
      'flutterwave',
      'SCOPED_API_CREDENTIAL',
    );
    expect(found.declaration.useCaseRef).toBe('own-store-test-mode');
    expect(() =>
      findPaymentProviderForm([FLUTTERWAVE_REGISTRY_ENTRY], 'flutterwave', 'DELEGATED_OAUTH'),
    ).toThrow(ValidationError);
    expect(FLUTTERWAVE_OPERATION_IDS).toEqual(['flutterwave.balances.read']);
  });
});

describe('the Flutterwave key-mode law (INV-25)', () => {
  it('FLWSECK_TEST- selects test; FLWSECK- (without TEST) selects live; anything else is null', () => {
    expect(flutterwaveKeyMode(FAKE_TEST_KEY)).toBe('test');
    expect(flutterwaveKeyMode(FAKE_LIVE_KEY)).toBe('live');
    expect(flutterwaveKeyMode('not-a-flw-key')).toBeNull();
    expect(flutterwaveKeyMode('')).toBeNull();
  });

  it('the test prefix WINS over the live prefix family (FLWSECK_TEST- is test, never live)', () => {
    expect(FAKE_TEST_KEY.startsWith('FLWSECK-')).toBe(false);
    expect(flutterwaveKeyMode(FAKE_TEST_KEY)).toBe('test');
  });

  it('material validation refuses non-objects, empty keys and unknown prefixes (never echoes the key)', () => {
    expect(() => validateFlutterwaveSecretKeyMaterial(null)).toThrow(ValidationError);
    expect(() => validateFlutterwaveSecretKeyMaterial({ apiKey: '' })).toThrow(ValidationError);
    expect(() => validateFlutterwaveSecretKeyMaterial({ apiKey: 'garbage' })).toThrow(
      /canonical prefix/,
    );
    expect(validateFlutterwaveSecretKeyMaterial({ apiKey: FAKE_TEST_KEY })).toEqual({
      apiKey: FAKE_TEST_KEY,
    });
  });

  it('a test key binds SANDBOX; a live key NEVER binds SANDBOX (the mechanical separation)', () => {
    expect(() => validateFlutterwaveKeyModeBinding(FAKE_TEST_KEY, 'SANDBOX')).not.toThrow();
    expect(() => validateFlutterwaveKeyModeBinding(FAKE_LIVE_KEY, 'SANDBOX')).toThrow(
      SandboxLiveBoundaryError,
    );
    expect(() => validateFlutterwaveKeyModeBinding(FAKE_LIVE_KEY, 'LIVE')).not.toThrow();
    expect(() => validateFlutterwaveKeyModeBinding(FAKE_TEST_KEY, 'LIVE')).toThrow(
      SandboxLiveBoundaryError,
    );
  });
});

describe('the Flutterwave read-only scope (fail-closed)', () => {
  it('grants exactly the read-only classes and observation-only effects (frozen)', () => {
    const scope = flutterwaveReadOnlyScope();
    expect([...scope.allowedOperations]).toEqual([...FLUTTERWAVE_READ_ONLY_OPERATION_CLASSES]);
    expect(scope.allowedEffectClasses).not.toContain('STATE_CHANGING');
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it('refuses any consequential grant (no Flutterwave execution surface in this wave)', () => {
    expect(() => refuseConsequentialFlutterwaveGrant('CREATE_EXTERNAL_EFFECT')).toThrow(
      ValidationError,
    );
    expect(() => refuseConsequentialFlutterwaveGrant('CANCEL_OR_REVERSE_EFFECT')).toThrow(
      ValidationError,
    );
    expect(() => refuseConsequentialFlutterwaveGrant('READ_PROVIDER_STATE')).not.toThrow();
  });

  it('the use-case fold validates, binds the mode and returns the frozen read-only scope', () => {
    const scope = flutterwaveUseCaseScope({ apiKey: FAKE_TEST_KEY }, 'SANDBOX');
    expect(scope.allowedOperations).toContain('OBSERVE_EXTERNAL_FUNDS');
    expect(() =>
      flutterwaveUseCaseScope({ apiKey: FAKE_LIVE_KEY }, 'SANDBOX'),
    ).toThrow(SandboxLiveBoundaryError);
    expect(() =>
      flutterwaveUseCaseScope({ apiKey: FAKE_TEST_KEY }, 'SANDBOX', [
        'CREATE_EXTERNAL_EFFECT',
      ]),
    ).toThrow(ValidationError);
  });
});
