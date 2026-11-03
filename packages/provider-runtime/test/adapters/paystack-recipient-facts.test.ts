import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors.ts';
import {
  PAYSTACK_RECIPIENT_TYPE_CANDIDATES,
  PAYSTACK_RECIPIENT_TYPE_EVIDENCE,
  PAYSTACK_RECIPIENT_FACTS_STATION_RECORD,
  isPaystackRecipientTypeCandidate,
  validatePaystackRecipientTypeEvidence,
  paystackRecipientTypeEvidenceFor,
  type PaystackRecipientTypeEvidence,
} from '../../src/adapters/paystack/recipient-facts.ts';
import { buildPaystackTransferRecipientRequest } from '../../src/adapters/paystack/recipient-request.ts';
import {
  derivePaystackSandboxRecipientGrant,
  refuseConsequentialPaystackGrant,
} from '../../src/adapters/paystack/capabilities.ts';

/**
 * P27-C battery (ADR-0020 D10/D11): the recipient FACTS registry and
 * the REQUEST BUILDER gate — the dated-evidence observation law, the
 * EMPTY shipped registry (the K3/K4 honest state) and the fail-closed
 * builder that refuses every unverified (type, country, currency)
 * triple. Test observations are FIXTURES ONLY — never promoted to the
 * shipped registry (D11: no fixture is ever real evidence).
 */

const FAKE_TEST_KEY = 'sk' + '_test_FAKE51keyDoNotUse0077';
const FAKE_LIVE_KEY = 'sk' + '_live_FAKE51keyDoNotUse0078';

/** A verified observation fixture (TEST MATERIAL ONLY — never promoted to the shipped registry). */
function verifiedKesBankEvidence(overrides: Record<string, unknown> = {}): PaystackRecipientTypeEvidence {
  return validatePaystackRecipientTypeEvidence({
    recipientType: 'kepss',
    country: 'KE',
    currency: 'KES',
    status: 'VERIFIED_AVAILABLE',
    sourceUrl: 'https://docs.paystack.com/transfers',
    retrievedAt: '2026-11-03',
    evidenceTier: 'LIVE_PROVIDER_DOC',
    requiredFields: ['name', 'account_number', 'bank_code'],
    ...overrides,
  });
}

describe('the recipient-type candidate vocabulary (the registration K3 claim, names only)', () => {
  it('carries exactly the five claimed candidate names, never an availability fact', () => {
    expect(PAYSTACK_RECIPIENT_TYPE_CANDIDATES).toEqual([
      'ghipss',
      'mobile_money',
      'nuban',
      'basa',
      'kepss',
    ]);
    expect(isPaystackRecipientTypeCandidate('nuban')).toBe(true);
    expect(isPaystackRecipientTypeCandidate('nu_ban')).toBe(false);
    expect(isPaystackRecipientTypeCandidate('africa')).toBe(false);
  });

  it('THE SHIPPED EVIDENCE REGISTRY IS EMPTY (K3/K4 unverified at the station — D10/D11)', () => {
    expect(PAYSTACK_RECIPIENT_TYPE_EVIDENCE).toEqual([]);
    expect(Object.isFrozen(PAYSTACK_RECIPIENT_TYPE_EVIDENCE)).toBe(true);
    // The station record honestly carries the re-verification attempts.
    expect(PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.conclusion).toBe('UNVERIFIED_AT_STATION');
    expect(PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attemptedAt).toBe('2026-11-03');
    expect(PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attempts.length).toBeGreaterThan(0);
    for (const attempt of PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attempts) {
      expect(attempt.url).toMatch(/^https:\/\//);
    }
  });
});

describe('the dated-evidence observation law (D10 — shape + datedness, fail-closed)', () => {
  it('accepts a fully-dated verified observation', () => {
    const record = verifiedKesBankEvidence();
    expect(record.recipientType).toBe('kepss');
  });

  it('refuses undated, unsourced, non-candidate or wrongly-shaped observations', () => {
    expect(() => validatePaystackRecipientTypeEvidence(null)).toThrow(ValidationError);
    // A type outside the candidate vocabulary is never admitted.
    expect(() => validated('recipientType', 'swift')).toThrow(ValidationError);
    // The retrieval date and source URL are LAW (D10).
    expect(() => validated('retrievedAt', '2026-11-03T12:00:00Z')).toThrow(ValidationError);
    expect(() => validated('sourceUrl', 'http://not-https.example')).toThrow(ValidationError);
    // Country/currency shapes.
    expect(() => validated('country', 'ke')).toThrow(ValidationError);
    expect(() => validated('currency', 'Kes')).toThrow(ValidationError);
    // The status and tier vocabularies are canonical.
    expect(() => validated('status', 'PROBABLY_FINE')).toThrow(ValidationError);
    expect(() => validated('evidenceTier', 'WIKIPEDIA')).toThrow(ValidationError);
    // The required wire fields must come from the known candidate set.
    expect(() => validated('requiredFields', ['name', 'favourite_colour'])).toThrow(ValidationError);
    expect(() => validated('requiredFields', [])).toThrow(ValidationError);

    function validated(field: string, value: unknown): unknown {
      return validatePaystackRecipientTypeEvidence({
        ...verifiedKesBankEvidence(),
        [field]: value,
      });
    }
  });

  it('the lookup matches the (type, country, currency) triple and skips EXCLUDED facts', () => {
    const available = verifiedKesBankEvidence();
    const excluded = verifiedKesBankEvidence({
      status: 'VERIFIED_EXCLUDED',
      recipientType: 'ghipss',
      country: 'GH',
      currency: 'GHS',
    });
    const registry = [available, excluded];
    expect(paystackRecipientTypeEvidenceFor(registry, 'kepss', 'KE', 'KES')).toBe(available);
    // An EXCLUDED fact never admits a request.
    expect(paystackRecipientTypeEvidenceFor(registry, 'ghipss', 'GH', 'GHS')).toBeUndefined();
    // A currency drift is a different fact.
    expect(paystackRecipientTypeEvidenceFor(registry, 'kepss', 'KE', 'USD')).toBeUndefined();
    expect(paystackRecipientTypeEvidenceFor(registry, 'kepss', 'GH', 'KES')).toBeUndefined();
  });
});

describe('the typed request builder (the K3/K4 gate — nothing unverified dispatches)', () => {
  const input = {
    recipientType: 'kepss' as const,
    name: 'Kes Beneficiary Ltd',
    country: 'KE',
    currency: 'KES',
    accountNumber: '0123456789',
    bankCode: '00199',
  };

  it('REFUSES every candidate type while the registry ships empty (UNVERIFIED — never a silent pass)', () => {
    for (const candidate of PAYSTACK_RECIPIENT_TYPE_CANDIDATES) {
      let refused: unknown;
      try {
        buildPaystackTransferRecipientRequest({ ...input, recipientType: candidate });
      } catch (error) {
        refused = error;
      }
      expect(refused).toBeInstanceOf(ValidationError);
      expect(String((refused as ValidationError).message)).toMatch(/UNVERIFIED/);
      expect(
        (refused as ValidationError).details?.['refusal'],
      ).toBe('PAYSTACK_RECIPIENT_TYPE_UNVERIFIED');
    }
  });

  it('admits a request ONLY through a verified dated observation, enforcing its required fields', () => {
    const registry = [verifiedKesBankEvidence()];
    const request = buildPaystackTransferRecipientRequest(input, registry);
    expect(request.type).toBe('kepss');
    expect(request.params).toEqual({
      type: 'kepss',
      name: 'Kes Beneficiary Ltd',
      currency: 'KES',
      account_number: '0123456789',
      bank_code: '00199',
    });
    expect(request.admittedBy.retrievedAt).toBe('2026-11-03');
    // A required field the verified evidence names is LAW: missing → typed refusal.
    let missing: unknown;
    const { bankCode: _omitted, ...inputWithoutBank } = input;
    try {
      buildPaystackTransferRecipientRequest(inputWithoutBank, registry);
    } catch (error) {
      missing = error;
    }
    expect(missing).toBeInstanceOf(ValidationError);
    expect((missing as ValidationError).details?.['refusal']).toBe('PAYSTACK_RECIPIENT_FIELD_REQUIRED');
  });

  it('the institution-exclusion law: a verified exclusion refuses the excluded bank (case-insensitive)', () => {
    // The registration's claimed Bank-of-Ghana-class exclusion, as a fixture observation.
    const registry = [
      verifiedKesBankEvidence({
        recipientType: 'ghipss',
        country: 'GH',
        currency: 'GHS',
        requiredFields: ['name', 'account_number', 'bank_code'],
        excludedInstitutionRefs: ['GH-BANK-OF-GHANA'],
      }),
    ];
    const ghanaInput = {
      recipientType: 'ghipss' as const,
      name: 'Ghana Beneficiary Ltd',
      country: 'GH',
      currency: 'GHS',
      accountNumber: '0123456789',
      bankCode: 'gh-bank-of-ghana',
    };
    let refused: unknown;
    try {
      buildPaystackTransferRecipientRequest(ghanaInput, registry);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(ValidationError);
    expect((refused as ValidationError).details?.['refusal']).toBe(
      'PAYSTACK_RECIPIENT_INSTITUTION_EXCLUDED',
    );
    // A different institution is admitted by the same evidence.
    const ok = buildPaystackTransferRecipientRequest(
      { ...ghanaInput, bankCode: 'GH-OTHER-BANK' },
      registry,
    );
    expect(ok.params['bank_code']).toBe('GH-OTHER-BANK');
  });

  it('generic input shape laws: name/country/currency/type validate fail-closed', () => {
    const registry = [verifiedKesBankEvidence()];
    expect(() => buildPaystackTransferRecipientRequest({ ...input, name: '' }, registry)).toThrow(
      ValidationError,
    );
    expect(() => buildPaystackTransferRecipientRequest({ ...input, country: 'KEN' }, registry)).toThrow(
      ValidationError,
    );
    expect(() => buildPaystackTransferRecipientRequest({ ...input, currency: 'kES' }, registry)).toThrow(
      ValidationError,
    );
  });
});

describe('the D4 grant law on the recipient plane (the read-only scope NEVER widens)', () => {
  it('the recipient grant is SANDBOX-only, derived at dispatch, and distinct from the read-only scope', () => {
    const scope = derivePaystackSandboxRecipientGrant(FAKE_TEST_KEY, 'SANDBOX');
    expect(scope.allowedOperations).toContain('CREATE_EXTERNAL_EFFECT');
    expect(scope.allowedEffectClasses).toContain('STATE_CHANGING');
    expect(scope.allowedDataClasses).toContain('RECIPIENT_WRITE');
    expect(Object.isFrozen(scope)).toBe(true);
    expect(() => derivePaystackSandboxRecipientGrant(FAKE_LIVE_KEY, 'SANDBOX')).toThrow(/INV-25/);
    expect(() => derivePaystackSandboxRecipientGrant(FAKE_TEST_KEY, 'LIVE')).toThrow(/INV-25/);
    // The read-only slice's refusal law is UNCHANGED (D4).
    expect(() => refuseConsequentialPaystackGrant('CREATE_EXTERNAL_EFFECT')).toThrow(ValidationError);
  });
});
