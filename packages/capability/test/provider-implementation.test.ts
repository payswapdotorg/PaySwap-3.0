import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  validateProviderImplementation,
  validateProviderIdentity,
  servesCorridor,
  assertImplementationRestrictionsNarrowDefinition,
  isProviderSystemKind,
} from '../src/index.ts';
import { providerImplementation } from './fixtures.ts';
import { eurGbpRestrictionSet } from './fixtures.ts';

/**
 * ProviderImplementation (layer 2) — ADAPTED from old connectors
 * providers.test.ts concepts + NET-NEW version-pin and narrowing laws.
 * SDK types and provider quirks stay provider-side (INV-16); the adapter
 * reference is opaque.
 */

describe('validateProviderIdentity', () => {
  it('accepts a well-formed identity and rejects unknown system kinds', () => {
    const identity = validateProviderIdentity({
      providerName: 'psp-a',
      providerVersion: '2026-01',
      systemKind: 'psp',
      displayName: 'PSP A',
    });
    expect(identity.providerName).toBe('psp-a');
    expect(() =>
      validateProviderIdentity({
        providerName: 'x',
        providerVersion: '1',
        systemKind: 'galaxy',
        displayName: 'X',
      }),
    ).toThrow(ValidationError);
  });

  it('isProviderSystemKind guards the vocabulary', () => {
    expect(isProviderSystemKind('bank')).toBe(true);
    expect(isProviderSystemKind('psp')).toBe(true);
    expect(isProviderSystemKind('PSP')).toBe(false);
    expect(isProviderSystemKind('framework')).toBe(false);
  });
});

describe('validateProviderImplementation (layer 2)', () => {
  it('accepts the fixture and deep-freezes the stored copy', () => {
    const validated = validateProviderImplementation(providerImplementation());
    expect(validated.implementationId).toBe('impl:psp-a-sepa-1');
    expect(Object.isFrozen(validated)).toBe(true);
  });

  it('requires an EXACT definition-version pin (deterministic chain resolution)', () => {
    expect(() =>
      validateProviderImplementation(
        providerImplementation({ capabilityVersion: '' as unknown as string }),
      ),
    ).toThrow(/capabilityVersion/);
    expect(() =>
      validateProviderImplementation(providerImplementation({ capabilityId: '' })),
    ).toThrow(/capabilityId/);
  });

  it('requires an opaque adapterRef and its own version', () => {
    expect(() => validateProviderImplementation(providerImplementation({ adapterRef: '' }))).toThrow(
      /adapterRef/,
    );
    expect(() => validateProviderImplementation(providerImplementation({ version: '' }))).toThrow(
      /version must be a non-empty string/,
    );
  });

  it('rejects malformed corridor scope declarations', () => {
    expect(() =>
      validateProviderImplementation(
        providerImplementation({ corridors: [{ fromCountries: ['deu'] as never }] }),
      ),
    ).toThrow(/corridors\[0\].fromCountries/);
  });

  it('rejects malformed deviations (documented: true is mandatory)', () => {
    expect(() =>
      validateProviderImplementation(
        providerImplementation({
          knownDeviations: [
            { aspect: 'a', deviation: 'b', documented: true },
            { aspect: 'a', deviation: 'b' } as never,
          ],
        }),
      ),
    ).toThrow(/knownDeviations\[1\]/);
  });

  it('nativeOptimization must be representable as a capability (INV-15 baseline)', () => {
    expect(() =>
      validateProviderImplementation(
        providerImplementation({
          nativeOptimization: { representableAsCapability: false } as never,
        }),
      ),
    ).toThrow(/nativeOptimization/);
    const withNative = validateProviderImplementation(
      providerImplementation({
        nativeOptimization: { representableAsCapability: true, capabilityId: 'cap:psp-a-routing' },
      }),
    );
    expect(withNative.nativeOptimization?.capabilityId).toBe('cap:psp-a-routing');
  });
});

describe('servesCorridor (advisory scope claims)', () => {
  it('answers membership queries over declared corridor scopes', () => {
    const implementation = providerImplementation();
    expect(
      servesCorridor(implementation, { fromCountry: 'DE', toCountry: 'GB', currency: 'EUR' }),
    ).toBe(true);
    expect(
      servesCorridor(implementation, { fromCountry: 'US', toCountry: 'GB', currency: 'EUR' }),
    ).toBe(false);
    expect(servesCorridor(implementation, {})).toBe(true);
  });

  it('returns false when no corridor scope is declared at all', () => {
    const bare = providerImplementation({ corridors: [] });
    expect(servesCorridor(bare, { fromCountry: 'DE' })).toBe(false);
  });
});

describe('the narrowing law (implementation restrictions only narrow the definition)', () => {
  const definitionRestrictions = eurGbpRestrictionSet();

  it('accepts a strictly narrower implementation restriction set', () => {
    const narrower = validateProviderImplementation(
      providerImplementation({
        restrictionSet: eurGbpRestrictionSet({
          restrictionSetId: 'rs:psp-a-sepa',
          sourceCountries: ['DE', 'FR'],
          amountLimits: {
            min: { currency: 'EUR', minorUnits: '1000' },
            max: { currency: 'EUR', minorUnits: '50000000' },
          },
          requiredFields: [
            { fieldId: 'recipient.iban', description: 'IBAN', appliesTo: 'RECIPIENT' },
            { fieldId: 'sender.kyc-tier', description: 'KYC tier', appliesTo: 'SENDER' },
          ],
        }),
      }),
    );
    expect(() =>
      assertImplementationRestrictionsNarrowDefinition(narrower, definitionRestrictions),
    ).not.toThrow();
  });

  it('rejects a WIDER country scope with the violated dimension named', () => {
    const wider = validateProviderImplementation(
      providerImplementation({
        restrictionSet: eurGbpRestrictionSet({
          restrictionSetId: 'rs:psp-a-sepa',
          sourceCountries: ['DE', 'FR', 'US'],
        }),
      }),
    );
    expect(() =>
      assertImplementationRestrictionsNarrowDefinition(wider, definitionRestrictions),
    ).toThrow(/sourceCountries widen/);
  });

  it('rejects dropping a restricted parent dimension (unrestricted widening)', () => {
    const { currencies: _dropped, ...droppedSet } = eurGbpRestrictionSet({
      restrictionSetId: 'rs:psp-a-sepa',
    });
    const dropped = validateProviderImplementation(
      providerImplementation({ restrictionSet: droppedSet }),
    );
    expect(() =>
      assertImplementationRestrictionsNarrowDefinition(dropped, definitionRestrictions),
    ).toThrow(/currencies widen/);
  });

  it('rejects widening amount bounds and dropping required fields', () => {
    const higherMax = validateProviderImplementation(
      providerImplementation({
        restrictionSet: eurGbpRestrictionSet({
          restrictionSetId: 'rs:psp-a-sepa',
          amountLimits: { max: { currency: 'EUR', minorUnits: '200000000' } },
        }),
      }),
    );
    expect(() =>
      assertImplementationRestrictionsNarrowDefinition(higherMax, definitionRestrictions),
    ).toThrow(/amountLimits.max/);
    const fewerFields = validateProviderImplementation(
      providerImplementation({
        restrictionSet: eurGbpRestrictionSet({ restrictionSetId: 'rs:psp-a-sepa', requiredFields: [] }),
      }),
    );
    expect(() =>
      assertImplementationRestrictionsNarrowDefinition(fewerFields, definitionRestrictions),
    ).toThrow(/requiredFields dropped/);
  });

  it('no implementation restriction set is a lawful no-op', () => {
    const bare = validateProviderImplementation(providerImplementation());
    expect(() =>
      assertImplementationRestrictionsNarrowDefinition(bare, definitionRestrictions),
    ).not.toThrow();
  });
});
