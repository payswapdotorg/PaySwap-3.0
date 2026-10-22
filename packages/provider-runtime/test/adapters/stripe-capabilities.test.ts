import { describe, expect, it } from 'vitest';
import {
  STRIPE_TEST_KEY_PREFIXES,
  STRIPE_LIVE_KEY_PREFIXES,
  STRIPE_READ_ONLY_OPERATION_CLASSES,
  STRIPE_READ_ONLY_EFFECT_CLASSES,
  CONSEQUENTIAL_OPERATION_CLASSES,
  stripeKeyMode,
  validateStripeRestrictedKeyMaterial,
  validateStripeKeyModeBinding,
  stripeReadOnlyScope,
  stripeUseCaseScope,
  refuseConsequentialStripeGrant,
} from '../../src/adapters/stripe/capabilities.ts';
import type { StripeRestrictedKeyMaterial } from '../../src/adapters/stripe/capabilities.ts';
import { ValidationError, SandboxLiveBoundaryError } from '../../src/errors.ts';
import { scopeAdmits } from '../../src/connection-scope.ts';

/**
 * The Stripe capability→scope mapping battery (P13-B, ADR-0007 D1/D5).
 *
 * LAWS under test:
 * - KEY MODE LAW (INV-25): prefixes select the mode; a test key never
 *   binds a LIVE runtime and a live key never binds the SANDBOX slice.
 * - FAIL-CLOSED SCOPE DERIVATION: the U1 grant is read-only; no
 *   consequential operation class can be derived from it.
 * - The sealed material shape validates without ever echoing the key.
 */

/** Fake restricted keys (test material ONLY — constructed to keep the realistic shape without a contiguous secret literal). */
const FAKE_TEST_KEY = 'rk' + '_test_FAKE51keyDoNotUse0001';
const FAKE_LIVE_KEY = 'rk' + '_live_FAKE51keyDoNotUse0001';

describe('Stripe key prefixes select the execution mode (INV-25)', () => {
  it('declares the canonical test and live key prefixes', () => {
    expect([...STRIPE_TEST_KEY_PREFIXES]).toEqual(['rk_test_', 'sk_test_']);
    expect([...STRIPE_LIVE_KEY_PREFIXES]).toEqual(['rk_live_', 'sk_live_']);
  });

  it('classifies key strings by prefix, null when not key-shaped (shape check only — never validation)', () => {
    expect(stripeKeyMode(FAKE_TEST_KEY)).toBe('test');
    expect(stripeKeyMode('sk_test_' + 'FAKE0002')).toBe('test');
    expect(stripeKeyMode(FAKE_LIVE_KEY)).toBe('live');
    expect(stripeKeyMode('sk_live_' + 'FAKE0002')).toBe('live');
    expect(stripeKeyMode('not-a-key')).toBeNull();
    expect(stripeKeyMode('')).toBeNull();
  });

  it('the key-mode binding law refuses mismatches in BOTH directions', () => {
    expect(() => validateStripeKeyModeBinding(FAKE_TEST_KEY, 'SANDBOX')).not.toThrow();
    expect(() => validateStripeKeyModeBinding(FAKE_LIVE_KEY, 'LIVE')).not.toThrow();
    expect(() => validateStripeKeyModeBinding(FAKE_TEST_KEY, 'LIVE')).toThrow(
      SandboxLiveBoundaryError,
    );
    expect(() => validateStripeKeyModeBinding(FAKE_LIVE_KEY, 'SANDBOX')).toThrow(
      SandboxLiveBoundaryError,
    );
    expect(() => validateStripeKeyModeBinding('not-a-key', 'SANDBOX')).toThrow(ValidationError);
  });
});

describe('the sealed U1 material shape (never echoes the key)', () => {
  it('accepts key-shaped material', () => {
    const material: StripeRestrictedKeyMaterial = { apiKey: FAKE_TEST_KEY };
    expect(validateStripeRestrictedKeyMaterial(material)).toBe(material);
  });

  it('refuses non-object material, empty keys and non-key-shaped strings', () => {
    expect(() => validateStripeRestrictedKeyMaterial(null)).toThrow(ValidationError);
    expect(() => validateStripeRestrictedKeyMaterial('rk_test_FAKEx')).toThrow(ValidationError);
    expect(() => validateStripeRestrictedKeyMaterial({ apiKey: '  ' })).toThrow(ValidationError);
    expect(() => validateStripeRestrictedKeyMaterial({ apiKey: 'whsec_FAKE0001' })).toThrow(
      ValidationError,
    );
  });

  it('the validation error never carries the key material itself', () => {
    try {
      validateStripeRestrictedKeyMaterial({ apiKey: 'whsec_' + 'FAKEverySecret0001' });
      expect.unreachable('must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(String((error as ValidationError).message)).not.toContain('FAKEverySecret');
      expect(JSON.stringify((error as ValidationError).details ?? {})).not.toContain(
        'FAKEverySecret',
      );
    }
  });
});

describe('the U1 read-only scope (fail-closed derivation)', () => {
  it('grants exactly the read/observe/manage operation classes and observation-only effects', () => {
    expect([...STRIPE_READ_ONLY_OPERATION_CLASSES]).toEqual([
      'READ_PROVIDER_STATE',
      'OBSERVE_EXTERNAL_FUNDS',
      'MANAGE_CONNECTION',
    ]);
    expect([...STRIPE_READ_ONLY_EFFECT_CLASSES]).toEqual(['NONE', 'OBSERVATION_ONLY']);
    expect([...CONSEQUENTIAL_OPERATION_CLASSES]).toEqual([
      'CREATE_EXTERNAL_EFFECT',
      'CANCEL_OR_REVERSE_EFFECT',
    ]);
    for (const consequential of CONSEQUENTIAL_OPERATION_CLASSES) {
      expect(STRIPE_READ_ONLY_OPERATION_CLASSES).not.toContain(consequential);
    }
  });

  it('the frozen scope admits a read-only request and refuses a state-changing one', () => {
    const scope = stripeReadOnlyScope();
    const now = 1_000n;
    expect(
      scopeAdmits(scope, { operationClass: 'READ_PROVIDER_STATE', effectClass: 'OBSERVATION_ONLY' }, now)
        .kind,
    ).toBe('ADMITTED');
    expect(
      scopeAdmits(scope, { operationClass: 'CREATE_EXTERNAL_EFFECT', effectClass: 'STATE_CHANGING' }, now)
        .kind,
    ).toBe('REFUSED');
  });

  it('refuseConsequentialStripeGrant throws on the write classes (the named enforcement point)', () => {
    expect(() => refuseConsequentialStripeGrant('CREATE_EXTERNAL_EFFECT')).toThrow(ValidationError);
    expect(() => refuseConsequentialStripeGrant('CANCEL_OR_REVERSE_EFFECT')).toThrow(ValidationError);
    expect(() => refuseConsequentialStripeGrant('READ_PROVIDER_STATE')).not.toThrow();
  });

  it('stripeUseCaseScope is the single fold: shape + mode binding + consequential refusal + frozen scope', () => {
    const scope = stripeUseCaseScope({ apiKey: FAKE_TEST_KEY }, 'SANDBOX');
    expect(scope.allowedOperations).toEqual(STRIPE_READ_ONLY_OPERATION_CLASSES);
    expect(scope.allowedEffectClasses).toEqual(STRIPE_READ_ONLY_EFFECT_CLASSES);
    expect(scope.allowedDataClasses).toEqual(['ACCOUNT_READ', 'BALANCE_READ']);
    // A requested write class is refused even when everything else is valid.
    expect(() =>
      stripeUseCaseScope({ apiKey: FAKE_TEST_KEY }, 'SANDBOX', [
        'READ_PROVIDER_STATE',
        'CREATE_EXTERNAL_EFFECT',
      ]),
    ).toThrow(ValidationError);
    // Mode mismatch is refused before any scope is returned.
    expect(() => stripeUseCaseScope({ apiKey: FAKE_LIVE_KEY }, 'SANDBOX')).toThrow(
      SandboxLiveBoundaryError,
    );
  });
});
