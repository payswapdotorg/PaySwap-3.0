import { describe, expect, it } from 'vitest';
import {
  PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION,
  PROVIDER_STATE_FAMILIES,
  ValidationError,
  createProviderStateEnvelope,
  isProviderStateEnvelope,
  parseProviderStateEnvelope,
  serializeProviderStateEnvelope,
} from '../src/index.ts';
import type { ProviderStateEnvelope, ProviderStateFamily } from '../src/index.ts';

/**
 * ProviderStateEnvelope — lossless consequential provider-state
 * preservation (PORTED from old connectors provider-state.test.ts; canonical
 * INV-14). Every consequential state family round-trips LOSSLESSLY through
 * the JSON codec, including raw provider-native state, history, required
 * actions, failure metadata, privacy scope and provenance.
 */

function rawEnvelopeInput(
  family: ProviderStateFamily,
  overrides: Partial<ProviderStateEnvelope> = {},
): Record<string, unknown> {
  return ({
    provider: { name: 'psp-a', version: '2026-01' },
    object: { objectType: 'PAYMENT_INTENT', externalId: 'pi_3Qabc123' },
    revision: 'rev_8812',
    state: {
      status: 'requires_action',
      raw: {
        next_action: 'redirect_to_url',
        url: 'https://psp-a.example/challenge',
      },
    },
    classification: {
      family,
      lifecycleStep: 'challenge_issued',
      isTerminal: false,
      requiresCustomerAction: true,
    },
    history: [
      {
        toRevision: 'rev_8811',
        occurredAt: '2026-10-01T11:58:00Z',
        actor: 'customer',
        note: 'authentication started',
      },
      {
        fromRevision: 'rev_8811',
        toRevision: 'rev_8812',
        occurredAt: '2026-10-01T11:59:00Z',
        actor: 'provider',
      },
    ],
    actionRequired: {
      kind: 'customer_authentication',
      message: 'Complete the 3DS challenge.',
      deepLink: 'https://psp-a.example/challenge',
    },
    failure: {
      providerErrorCode: 'authentication_required',
      providerErrorMessage: 'The customer must authenticate.',
      retryable: true,
      ambiguity: 'NONE',
    },
    privacy: {
      dataClassification: 'PARTNER',
      constraints: ['no-PII-in-support-tickets'],
      shareableFields: ['status', 'next_action'],
    },
    metadata: {
      routingHint: 'sca-ios',
      providerInternalCorrelation: 'ic_99213',
    },
    timestamps: { observedAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T11:59:00Z' },
    provenance: { source: 'PROVIDER_API', fetchId: 'fetch_1a' },
    ...overrides,
  } as unknown) as Record<string, unknown>;
}

function envelope(
  family: ProviderStateFamily,
  overrides: Partial<ProviderStateEnvelope> = {},
): ProviderStateEnvelope {
  return createProviderStateEnvelope(
    rawEnvelopeInput(family, overrides) as Parameters<typeof createProviderStateEnvelope>[0],
  );
}

describe('the consequential state-family vocabulary (INV-14)', () => {
  it('covers every family the lossless model names, plus an escape hatch', () => {
    expect([...PROVIDER_STATE_FAMILIES]).toEqual([
      'customer_action_required',
      'async_processing',
      'capture',
      'mandate',
      'refund',
      'dispute',
      'payout',
      'connected_account',
      'other',
    ]);
  });
});

describe('lossless round-trip for every consequential state family (INV-14)', () => {
  const families = [...PROVIDER_STATE_FAMILIES] as const;

  for (const family of families) {
    it(`round-trips a ${family} envelope losslessly (serialize -> parse)`, () => {
      const original = envelope(family);
      const parsed = parseProviderStateEnvelope(serializeProviderStateEnvelope(original));
      expect(parsed).toEqual(original);
      expect(parsed.classification.family).toBe(family);
    });
  }

  it('preserves the raw provider-native state VERBATIM (opaque passthrough)', () => {
    const original = envelope('customer_action_required');
    const parsed = parseProviderStateEnvelope(serializeProviderStateEnvelope(original));
    expect(parsed.state).toEqual({
      status: 'requires_action',
      raw: {
        next_action: 'redirect_to_url',
        url: 'https://psp-a.example/challenge',
      },
    });
  });
});

describe('validation is fail-closed (mandatory classification + privacy + provenance)', () => {
  it('rejects a missing classification (absence is a validation error)', () => {
    const input = rawEnvelopeInput('payout');
    delete input['classification'];
    expect(() => createProviderStateEnvelope(input as never)).toThrow(/classification/);
  });

  it('rejects a missing privacy scope and a missing provenance', () => {
    const noPrivacy = rawEnvelopeInput('payout');
    delete noPrivacy['privacy'];
    expect(() => createProviderStateEnvelope(noPrivacy as never)).toThrow(/privacy/);
    const noProvenance = rawEnvelopeInput('payout');
    delete noProvenance['provenance'];
    expect(() => createProviderStateEnvelope(noProvenance as never)).toThrow(/provenance/);
  });

  it('rejects a missing raw state (state must be PRESENT, even when null-like)', () => {
    const noState = rawEnvelopeInput('payout');
    delete noState['state'];
    expect(() => createProviderStateEnvelope(noState as never)).toThrow(/state must be present/);
    // but an explicit null state is legal (verbatim preservation of "no state")
    expect(() => envelope('payout', { state: null })).not.toThrow();
  });

  it('rejects an unknown family and an unknown provenance source', () => {
    expect(() =>
      envelope('ledger_magic' as never),
    ).toThrow(/classification.family/);
    expect(() =>
      envelope('payout', { provenance: { source: 'TELEPATHY' as never } }),
    ).toThrow(/provenance.source/);
  });

  it('rejects a malformed failure metadata (retryable must be boolean)', () => {
    expect(() =>
      envelope('refund', { failure: { retryable: 'yes' as never, ambiguity: 'NONE' } }),
    ).toThrow(/failure/);
  });
});

describe('the envelope is a versioned contract', () => {
  it('stamps schemaVersion on construction', () => {
    const constructed = envelope('mandate');
    expect(constructed.schemaVersion).toBe(PROVIDER_STATE_ENVELOPE_SCHEMA_VERSION);
  });

  it('isProviderStateEnvelope requires the pinned schema version', () => {
    const constructed = envelope('mandate');
    expect(isProviderStateEnvelope(constructed)).toBe(true);
    const { schemaVersion: _stripped, ...unversioned } = constructed;
    expect(isProviderStateEnvelope(unversioned)).toBe(false);
  });

  it('parse rejects a serialized envelope with a foreign schema version', () => {
    const foreign = JSON.stringify({ ...envelope('mandate'), schemaVersion: 999 });
    expect(() => parseProviderStateEnvelope(foreign)).toThrow(/not a ProviderStateEnvelope/);
  });

  it('parse rejects malformed JSON', () => {
    expect(() => parseProviderStateEnvelope('{not json')).toThrow(ValidationError);
  });
});

describe('constructed envelopes are frozen (immutability discipline)', () => {
  it('deep-freezes the classification, privacy, history, timestamps and provenance', () => {
    const constructed = envelope('dispute');
    expect(Object.isFrozen(constructed)).toBe(true);
    expect(Object.isFrozen(constructed.classification)).toBe(true);
    expect(Object.isFrozen(constructed.privacy)).toBe(true);
    expect(Object.isFrozen(constructed.history)).toBe(true);
    expect(Object.isFrozen(constructed.timestamps)).toBe(true);
    expect(Object.isFrozen(constructed.provenance)).toBe(true);
  });
});
