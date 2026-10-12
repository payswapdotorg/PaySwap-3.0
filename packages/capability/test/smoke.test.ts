import { describe, expect, it } from 'vitest';
import * as exports from '../src/index.ts';

/** Smoke: the export surface is non-empty, named and stable. */
describe('package smoke', () => {
  it('exports the capability fabric surface', () => {
    expect(exports.PACKAGE_NAME).toBe('@payswap/capability');
    const names = Object.keys(exports);
    expect(names.length).toBeGreaterThanOrEqual(100);
    // hierarchy layers
    expect(names).toContain('validateCapabilityDefinition');
    expect(names).toContain('validateProviderImplementation');
    expect(names).toContain('validateConnectedCapabilityInstance');
    expect(names).toContain('observeCapability');
    // ProviderStateEnvelope
    expect(names).toContain('createProviderStateEnvelope');
    expect(names).toContain('parseProviderStateEnvelope');
    // execution modes
    expect(names).toContain('validateExecutionRequest');
    // certification
    expect(names).toContain('CertificationLedger');
    // packs
    expect(names).toContain('validateConnectorCapabilityPack');
    // corridor projection
    expect(names).toContain('projectCorridor');
    expect(names).toContain('assertCorridorViewCarriesNoAuthorization');
    expect(names).toContain('corridorViewIsNotAnExecutionRequest');
    // registry
    expect(names).toContain('CapabilityFabricRegistry');
    // internal canonical helpers deliberately NOT exported
    expect(names).not.toContain('parseIsoUtcTimestamp');
    expect(names).not.toContain('cloneAndFreeze');
    expect(names).not.toContain('compareMinorUnitStrings');
  });
});
