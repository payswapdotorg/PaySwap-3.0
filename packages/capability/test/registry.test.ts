import { describe, expect, it } from 'vitest';
import {
  CapabilityFabricRegistry,
  CapabilityRegistryError,
  chainCompleteness,
  corridorRouteInputs,
  projectCorridor,
} from '../src/index.ts';
import type { ConnectorCapabilityPack } from '../src/index.ts';
import { validateProviderCatalogueEntry } from '../src/index.ts';
import {
  executableDefinition,
  nonExecutableDefinition,
  providerImplementation,
  connectedInstance,
  healthyObservation,
} from './fixtures.ts';

/**
 * The four-layer registry (ADAPTED from the old connectors registry.test.ts
 * chain-completeness concepts). Chain rules: definition ->
 * implementation -> instance -> observation, with exact version pins,
 * strictly-monotonic observation versions, catalogue/instance separation
 * (INV-13), pack exposure and the narrowing law enforced at registration.
 */

function populatedRegistry(): CapabilityFabricRegistry {
  const registry = new CapabilityFabricRegistry();
  registry.registerProvider({
    providerName: 'psp-a',
    providerVersion: '2026-01',
    systemKind: 'psp',
    displayName: 'PSP A',
  });
  registry.registerDefinition(executableDefinition());
  registry.registerImplementation(providerImplementation());
  registry.registerInstance(connectedInstance());
  registry.recordObservation(
    // construct through the public observeCapability surface
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    healthyObservation(),
  );
  return registry;
}

describe('layer-1 registration (definitions)', () => {
  it('registers a valid definition and rejects duplicates per id@version', () => {
    const registry = populatedRegistry();
    expect(registry.allDefinitions()).toHaveLength(1);
    expect(() => registry.registerDefinition(executableDefinition())).toThrow(
      /already registered/,
    );
    // a DIFFERENT version of the same id is a distinct entry
    registry.registerDefinition(
      executableDefinition({ version: '1.5.0' }),
    );
    expect(registry.allDefinitions()).toHaveLength(2);
    expect(registry.definition('cap:sepa-credit-transfer', '1.5.0')?.version).toBe('1.5.0');
  });

  it('definition lookup without version returns the first registration', () => {
    const registry = populatedRegistry();
    expect(registry.definition('cap:sepa-credit-transfer')?.version).toBe('1.4.0');
    expect(registry.definition('cap:unknown')).toBeUndefined();
  });
});

describe('layer-2 registration (implementations) — chain + narrowing laws', () => {
  it('rejects an implementation referencing an unregistered definition', () => {
    const registry = new CapabilityFabricRegistry();
    expect(() =>
      registry.registerImplementation(providerImplementation({ capabilityId: 'cap:ghost' })),
    ).toThrow(/chain rule: register the definition first/);
  });

  it('rejects an implementation widening the definition-level restrictions', () => {
    const registry = populatedRegistry();
    expect(() =>
      registry.registerImplementation(
        providerImplementation({
          implementationId: 'impl:psp-b-sepa-1',
          restrictionSet: {
            restrictionSetId: 'rs:wide',
            version: '1.0.0',
            sourceCountries: ['US'],
            requiredFields: [],
            cutoffs: [],
            declaredBy: 'x',
          },
        }),
      ),
    ).toThrow(/widens beyond the definition-level restrictions/);
  });

  it('accepts a narrower implementation and queries by definition', () => {
    const registry = populatedRegistry();
    registry.registerImplementation(
      providerImplementation({
        implementationId: 'impl:psp-b-sepa-1',
        providerName: 'psp-b',
        restrictionSet: {
          restrictionSetId: 'rs:psp-b',
          version: '1.0.0',
          sourceCountries: ['DE'],
          destinationCountries: ['FR'],
          currencies: ['EUR'],
          customerTypes: ['PERSONAL', 'BUSINESS'],
          amountLimits: {
            min: { currency: 'EUR', minorUnits: '100' },
            max: { currency: 'EUR', minorUnits: '50000000' },
          },
          requiredFields: [
            { fieldId: 'recipient.iban', description: 'IBAN', appliesTo: 'RECIPIENT' },
          ],
          cutoffs: [],
          declaredBy: 'psp-b',
        },
      }),
    );
    expect(registry.implementationsForDefinition('cap:sepa-credit-transfer')).toHaveLength(2);
    expect(registry.nativeBaselineImplementations()).toHaveLength(0);
    registry.registerImplementation(
      providerImplementation({
        implementationId: 'impl:psp-a-native',
        nativeOptimization: {
          representableAsCapability: true,
          capabilityId: 'cap:psp-a-routing',
        },
      }),
    );
    expect(registry.nativeBaselineImplementations()).toHaveLength(1);
  });
});

describe('layer-3 registration (instances) — INV-13 catalogue separation', () => {
  it('rejects a ProviderCatalogueEntry outright (never an instance)', () => {
    const registry = populatedRegistry();
    const catalogue = validateProviderCatalogueEntry({
      catalogueEntryId: 'cat:psp-a-payments',
      providerName: 'psp-a',
      providerVersion: '2026-01',
      capabilityId: 'cap:sepa-credit-transfer',
      summary: 'platform-wide advertisement',
      advertisedScope: {
        platformWide: true,
        advertisedGeographies: ['DE'],
        advertisedCurrencies: ['EUR'],
      },
    });
    expect(() => registry.registerInstance(catalogue as never)).toThrow(
      /INV-13.*never be registered as a ConnectedCapabilityInstance/,
    );
  });

  it('rejects an instance without its implementation registered', () => {
    const registry = new CapabilityFabricRegistry();
    expect(() =>
      registry.registerInstance(connectedInstance({ implementationId: 'impl:ghost' })),
    ).toThrow(/chain rule: register the ProviderImplementation first/);
  });

  it('rejects an instance whose capability does not match the implementation', () => {
    const registry = populatedRegistry();
    expect(() =>
      registry.registerInstance(
        connectedInstance({
          instanceId: 'inst:acct-2',
          capabilityId: 'cap:other-capability',
        }),
      ),
    ).toThrow(/but its implementation/);
  });

  it('catalogue entries register in the SEPARATE advertisement surface', () => {
    const registry = populatedRegistry();
    const entry = validateProviderCatalogueEntry({
      catalogueEntryId: 'cat:psp-a-payments',
      providerName: 'psp-a',
      providerVersion: '2026-01',
      capabilityId: 'cap:sepa-credit-transfer',
      summary: 'platform-wide advertisement',
      advertisedScope: {
        platformWide: true,
        advertisedGeographies: ['DE'],
        advertisedCurrencies: ['EUR'],
      },
    });
    registry.registerCatalogueEntry(entry);
    expect(registry.allCatalogueEntries()).toHaveLength(1);
    // the catalogue surface never links into the instance surface
    expect(registry.allInstances().map((instance) => instance.instanceId)).not.toContain(
      'cat:psp-a-payments',
    );
  });
});

describe('layer-4 recording (observations) — monotonic versions', () => {
  it('rejects an observation for an unregistered instance', () => {
    const registry = new CapabilityFabricRegistry();
    expect(() =>
      registry.recordObservation(healthyObservation({ instanceId: 'inst:ghost' })),
    ).toThrow(/chain rule: register the ConnectedCapabilityInstance first/);
  });

  it('rejects non-monotonic versions (out-of-order events cannot regress canonical state)', () => {
    const registry = populatedRegistry();
    registry.recordObservation(
      healthyObservation({ observationVersion: 2, observedAt: '2026-10-01T12:05:00Z' }),
    );
    expect(() =>
      registry.recordObservation(healthyObservation({ observationVersion: 2 })),
    ).toThrow(/strictly monotonic/);
    expect(() => registry.recordObservation(healthyObservation())).toThrow(
      /strictly monotonic/,
    );
    expect(registry.observationsFor('inst:acct-1-payments')).toHaveLength(2);
    expect(registry.latestObservationFor('inst:acct-1-payments')?.observationVersion).toBe(2);
  });

  it('accepts a monotonically increasing sequence', () => {
    const registry = populatedRegistry();
    registry.recordObservation(
      healthyObservation({ observationVersion: 5, observedAt: '2026-10-01T12:05:00Z' }),
    );
    registry.recordObservation(
      healthyObservation({ observationVersion: 6, observedAt: '2026-10-01T12:10:00Z' }),
    );
    expect(registry.latestObservationFor('inst:acct-1-payments')?.observationVersion).toBe(6);
  });
});

describe('pack registration enforces exposure by connected instances', () => {
  function pack(capabilityId: string): ConnectorCapabilityPack {
    return {
      packId: `pack:for-${capabilityId.replace(/[^a-z0-9]/gi, '')}`,
      family: 'payments',
      version: '1.0.0',
      subPacks: [],
      capabilityRefs: [{ capabilityId, capabilityVersion: '1.4.0' }],
      auth: { authKind: 'OAUTH', scopes: ['payments:read'] },
      schemas: [],
      objectMappings: [],
      sourceOfTruth: 'EXTERNAL_AUTHORITATIVE',
      rateLimits: [],
      provenance: { publisher: 'x', publishedAt: '2026-09-30T00:00:00Z', contentHash: 'h' },
      evidence: [],
    } as unknown as ConnectorCapabilityPack;
  }

  it('accepts a pack whose capability is registered AND exposed by an instance', () => {
    const registry = populatedRegistry();
    expect(() => registry.registerPack(pack('cap:sepa-credit-transfer'))).not.toThrow();
    expect(registry.allPacks()).toHaveLength(1);
  });

  it('rejects a pack mapping to an unregistered definition', () => {
    const registry = populatedRegistry();
    expect(() => registry.registerPack(pack('cap:ghost'))).toThrow(
      /definition not registered/,
    );
  });

  it('rejects a pack mapping to a registered definition with NO exposing instance', () => {
    const registry = populatedRegistry();
    registry.registerDefinition(nonExecutableDefinition());
    expect(() =>
      registry.registerPack({
        ...pack('cap:sepa-scheme-info'),
        packId: 'pack:for-schemeinfo',
      } as never),
    ).toThrow(/no registered ConnectedCapabilityInstance exposes it/);
  });
});

describe('chain completeness + the corridor bridge', () => {
  it('reports a complete chain for the populated registry', () => {
    const registry = populatedRegistry();
    registry.registerPack({
      packId: 'pack:sepa',
      family: 'payments',
      version: '1.0.0',
      subPacks: [],
      capabilityRefs: [{ capabilityId: 'cap:sepa-credit-transfer', capabilityVersion: '1.4.0' }],
      auth: { authKind: 'OAUTH', scopes: ['payments:read'] },
      schemas: [],
      objectMappings: [],
      sourceOfTruth: 'EXTERNAL_AUTHORITATIVE',
      rateLimits: [],
      provenance: { publisher: 'x', publishedAt: '2026-09-30T00:00:00Z', contentHash: 'h' },
      evidence: [],
    } as never);
    const report = chainCompleteness(registry);
    expect(report.complete).toBe(true);
    expect(report.gaps).toEqual([]);
  });

  it('reports gaps for instances without observations', () => {
    const registry = populatedRegistry();
    registry.registerInstance(
      connectedInstance({ instanceId: 'inst:acct-2-no-obs' }),
    );
    const report = chainCompleteness(registry);
    expect(report.complete).toBe(false);
    expect(
      report.gaps.some(
        (gap) => gap.link === 'observation' && gap.ref === 'inst:acct-2-no-obs',
      ),
    ).toBe(true);
  });

  it('corridorRouteInputs fabricates NOTHING: instances without observations are absent', () => {
    const registry = populatedRegistry();
    registry.registerInstance(connectedInstance({ instanceId: 'inst:acct-2-no-obs' }));
    const routes = corridorRouteInputs(registry);
    expect(routes.map((route) => route.instance.instanceId)).toEqual([
      'inst:acct-1-payments',
    ]);
  });

  it('the registry feeds the corridor projection end-to-end', () => {
    const registry = populatedRegistry();
    const view = projectCorridor({
      routes: corridorRouteInputs(registry),
      query: {
        sourceCountry: 'DE',
        destinationCountry: 'FR',
        sourceCurrency: 'EUR',
        destinationCurrency: 'EUR',
        customerType: 'PERSONAL',
        sendAmount: { currency: 'EUR', minorUnits: '50000' },
        presentedFieldIds: ['recipient.iban'],
        asOf: '2026-10-01T12:30:00Z',
      },
      freshnessPolicy: { maxAgeSeconds: 3600 },
    });
    expect(view.routes).toHaveLength(1);
    expect(view.routes[0]?.eligible).toBe(true);
    expect(view.routes[0]?.lineage.connectedInstanceId).toBe('inst:acct-1-payments');
  });
});

describe('deterministic ordering', () => {
  it('all lookups preserve registration order', () => {
    const registry = populatedRegistry();
    registry.registerInstance(connectedInstance({ instanceId: 'inst:acct-2' }));
    registry.registerInstance(connectedInstance({ instanceId: 'inst:acct-3' }));
    expect(registry.allInstances().map((instance) => instance.instanceId)).toEqual([
      'inst:acct-1-payments',
      'inst:acct-2',
      'inst:acct-3',
    ]);
    expect(
      corridorRouteInputs(registry).map((route) => route.instance.instanceId),
    ).toEqual(['inst:acct-1-payments']);
  });

  it('registry errors are ValidationError subclasses with the registry name', () => {
    const error = new CapabilityRegistryError('boom');
    expect(error.name).toBe('CapabilityRegistryError');
    expect(error.message).toBe('boom');
  });
});
