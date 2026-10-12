import { describe, expect, it } from 'vitest';
import {
  CatalogueNotAuthorityError,
  ValidationError,
  assertConnectedInstance,
  isConnectedCapabilityInstance,
  isProviderCatalogueEntry,
  validateConnectedCapabilityInstance,
  validateProviderCatalogueEntry,
} from '../src/index.ts';
import type { ConnectedCapabilityInstance, ProviderCatalogueEntry } from '../src/index.ts';
import { connectedInstance } from './fixtures.ts';

/**
 * ConnectedCapabilityInstance (layer 3) + the catalogue/instance separation
 * law (PORTED from old connectors instances.test.ts; canonical INV-13: a
 * ConnectedCapabilityInstance is scoped to a REAL provider account/tenant,
 * credential scope, authorization, geography/currency and permission state.
 * A ProviderCatalogueEntry is a structurally distinct, NON-ASSIGNABLE type —
 * a provider catalogue claim NEVER authorizes execution).
 */

const catalogue: ProviderCatalogueEntry = {
  catalogueEntryId: 'cat:psp-a-payments',
  providerName: 'psp-a',
  providerVersion: '2026-01',
  capabilityId: 'cap:sepa-credit-transfer',
  summary: 'PSP-A payments platform-wide',
  advertisedScope: {
    platformWide: true,
    advertisedGeographies: ['DE', 'FR', 'GB'],
    advertisedCurrencies: ['EUR', 'GBP'],
  },
};

describe('runtime guards separate instances from catalogue entries (INV-13)', () => {
  it('isConnectedCapabilityInstance accepts the connected instance', () => {
    const instance = connectedInstance();
    expect(isConnectedCapabilityInstance(instance)).toBe(true);
    expect(isProviderCatalogueEntry(instance)).toBe(false);
  });

  it('isProviderCatalogueEntry accepts the catalogue entry', () => {
    expect(isProviderCatalogueEntry(catalogue)).toBe(true);
    expect(isConnectedCapabilityInstance(catalogue)).toBe(false);
  });
});

describe('assertConnectedInstance — the catalogue -> instance rejection (INV-13)', () => {
  it('rejects a catalogue entry with the typed CatalogueNotAuthorityError', () => {
    expect(() => assertConnectedInstance(catalogue)).toThrow(CatalogueNotAuthorityError);
    try {
      assertConnectedInstance(catalogue);
    } catch (error) {
      expect(error instanceof CatalogueNotAuthorityError).toBe(true);
      const typed = error as CatalogueNotAuthorityError;
      expect(typed.code).toBe('CATALOGUE_NOT_AUTHORITY');
      expect(typed.category).toBe('AUTHORIZATION_REQUIRED');
      expect(typed.message).toMatch(/INV-13/);
      expect(typed.message).toMatch(/never authorize execution/);
      expect(typed.details).toMatchObject({
        catalogueEntryId: 'cat:psp-a-payments',
        providerName: 'psp-a',
      });
    }
  });

  it('rejects an arbitrary object that is neither instance nor catalogue', () => {
    expect(() => assertConnectedInstance({ arbitrary: true })).toThrow(ValidationError);
    expect(() => assertConnectedInstance(null)).toThrow(ValidationError);
  });

  it('accepts a genuine connected instance', () => {
    expect(() => assertConnectedInstance(connectedInstance())).not.toThrow();
  });
});

describe('validateConnectedCapabilityInstance (full INV-13 scope)', () => {
  it('accepts the fixture and deep-freezes the stored copy', () => {
    const validated = validateConnectedCapabilityInstance(connectedInstance());
    expect(validated.instanceId).toBe('inst:acct-1-payments');
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.credentialScope)).toBe(true);
  });

  it('rejects missing scope fields (account/tenant/implementation)', () => {
    expect(() =>
      validateConnectedCapabilityInstance({ ...connectedInstance(), accountRef: '' }),
    ).toThrow(/accountRef/);
    expect(() =>
      validateConnectedCapabilityInstance({ ...connectedInstance(), tenantRef: '' }),
    ).toThrow(/tenantRef/);
    expect(() =>
      validateConnectedCapabilityInstance({ ...connectedInstance(), implementationId: '' }),
    ).toThrow(/implementationId/);
  });

  it('rejects an unknown authorization status', () => {
    expect(() =>
      validateConnectedCapabilityInstance({
        ...connectedInstance(),
        authorization: { ...connectedInstance().authorization, status: 'MAYBE' as never },
      }),
    ).toThrow(/authorization.status/);
  });

  it('rejects non-primitive configuration values (provider-neutral primitives only)', () => {
    expect(() =>
      validateConnectedCapabilityInstance({
        ...connectedInstance(),
        configuration: { nested: { deep: true } } as never,
      }),
    ).toThrow(/configuration.nested/);
  });

  it('rejects a malformed permission state', () => {
    expect(() =>
      validateConnectedCapabilityInstance({
        ...connectedInstance(),
        permissionState: { granted: 'payments:write' } as never,
      }),
    ).toThrow(/permissionState/);
  });

  it('rejects empty currencies and missing credential reference', () => {
    expect(() =>
      validateConnectedCapabilityInstance({ ...connectedInstance(), currencies: [] }),
    ).toThrow(/currencies/);
    expect(() =>
      validateConnectedCapabilityInstance({
        ...connectedInstance(),
        credentialScope: { ...connectedInstance().credentialScope, credentialRef: '' },
      }),
    ).toThrow(/credentialRef/);
  });

  it('carries an OPAQUE credential reference only — never credential material', () => {
    const validated = validateConnectedCapabilityInstance(connectedInstance());
    expect(validated.credentialScope.credentialRef).toBe('cred:oauth-merchant-1');
    expect(JSON.stringify(validated)).not.toMatch(/"secret"|"password"|"apiKey"/i);
  });
});

describe('validateProviderCatalogueEntry (advertisements are legal discovery seeds)', () => {
  it('accepts a well-formed catalogue entry', () => {
    const validated = validateProviderCatalogueEntry(catalogue);
    expect(validated.catalogueEntryId).toBe('cat:psp-a-payments');
    expect(validated.advertisedScope.platformWide).toBe(true);
  });

  it('rejects a malformed advertisement', () => {
    expect(() =>
      validateProviderCatalogueEntry({ ...catalogue, summary: '' }),
    ).toThrow(/summary/);
    expect(() =>
      validateProviderCatalogueEntry({
        ...catalogue,
        advertisedScope: { ...catalogue.advertisedScope, platformWide: false },
      }),
    ).toThrow(/platformWide/);
  });

  it('catalogue validation NEVER produces a ConnectedCapabilityInstance', () => {
    const validated: unknown = validateProviderCatalogueEntry(catalogue);
    expect(isConnectedCapabilityInstance(validated)).toBe(false);
    const asInstance = validated as Partial<ConnectedCapabilityInstance>;
    expect(asInstance.instanceId).toBeUndefined();
    expect(asInstance.authorization).toBeUndefined();
    expect(asInstance.credentialScope).toBeUndefined();
  });
});
