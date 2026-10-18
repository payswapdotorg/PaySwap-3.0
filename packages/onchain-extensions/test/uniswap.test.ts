import { describe, expect, it } from 'vitest';
import { validateOnchainExtensionPack } from '../src/index.ts';
import { protocolCapabilityId } from '../src/index.ts';
import {
  UNISWAP_V2_FACTORY_ADDRESS,
  UNISWAP_V2_ROUTER_02_ADDRESS,
  UNISWAP_V2_VENUE_KEY,
  uniswapV2Pack,
} from '../src/packs/uniswap-v2.ts';
import { CHAIN, variant } from './fixtures.ts';

/**
 * The Uniswap reference venue extension, as DECLARATIVE DATA (PORT+ADAPT of
 * the old uniswap suite: the v2 math, quote and write-planning tests
 * belong to the P5-W1/P4-W3 execution lanes; the surface laws — published
 * contracts, embedded pool fee, incumbent-baseline optimization, canonical
 * identity — port here as pack-descriptor assertions).
 */

const pack = uniswapV2Pack();

describe('the reference venue identity', () => {
  it('declares its canonical pack identity and family', () => {
    expect(pack.packId).toBe('onchain-pack/dex/uniswap-v2@1.0.0');
    expect(pack.family).toBe('dex');
    expect(pack.version).toBe('1.0.0');
    expect(pack.venueSurface.venueKey).toBe(UNISWAP_V2_VENUE_KEY);
  });

  it('binds to the derived protocol capability id (never a declared string)', () => {
    const expected = protocolCapabilityId('uniswap-v2', CHAIN);
    expect(pack.implementation.capabilityId).toBe(expected);
    expect(pack.implementation.nativeOptimization.capabilityId).toBe(expected);
  });

  it('a wrong capability binding is rejected (the deterministic addressing law)', () => {
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.implementation = {
            ...draft.implementation,
            capabilityId: 'capability:protocol:ethereum:mainnet:some-other-protocol',
          };
        }),
      ),
    ).toThrow(/derived protocol capability id/);
  });
});

describe('the canonical protocol declarations (INV-SC01 — public constants)', () => {
  it('declares the published v2 contracts in canonical order', () => {
    const contracts = pack.protocol.smartContracts;
    expect(contracts.map((contract) => contract.contractAddress)).toEqual([
      UNISWAP_V2_ROUTER_02_ADDRESS,
      UNISWAP_V2_FACTORY_ADDRESS,
    ]);
  });

  it('Router02: immutable, non-custodial, on the protocol chain', () => {
    const router = pack.protocol.smartContracts[0];
    expect(router?.upgradeAuthority.kind).toBe('IMMUTABLE');
    expect(router?.adminAuthority.kind).toBe('IMMUTABLE');
    expect(router?.custody.custodial).toBe(false);
    expect(router?.chainRef).toBe(CHAIN);
  });

  it('Factory: immutable upgrade path, MULTISIG admin (fee-switch only)', () => {
    const factory = pack.protocol.smartContracts[1];
    expect(factory?.upgradeAuthority.kind).toBe('IMMUTABLE');
    expect(factory?.adminAuthority.kind).toBe('MULTISIG');
    expect(factory?.custody.custodial).toBe(false);
  });

  it('the protocol class satisfies the dex family coupling law', () => {
    expect(pack.protocol.protocolClass).toBe('DEX');
    expect(() => validateOnchainExtensionPack(pack)).not.toThrow();
  });
});

describe('the DEX surface (AMM, embedded pool fee)', () => {
  it('declares the AMM surface: both swap kinds, executable quotes, declared-limit slippage', () => {
    expect(pack.familyExtension.family).toBe('dex');
    if (pack.familyExtension.family !== 'dex') {
      throw new Error('unreachable');
    }
    expect(pack.familyExtension.dexKind).toBe('AMM');
    expect(pack.familyExtension.supportedSwapKinds).toEqual(['EXACT_INPUT', 'EXACT_OUTPUT']);
    expect(pack.familyExtension.quoteSemantics).toBe('EXECUTABLE');
    expect(pack.familyExtension.slippageProtection).toBe('DECLARED_LIMIT');
  });

  it('declares the 0.30% pool fee as EMBEDDED (never a separate fee component)', () => {
    if (pack.familyExtension.family !== 'dex') {
      throw new Error('unreachable');
    }
    expect(pack.familyExtension.feeModel).toBe('EMBEDDED_POOL_FEE');
    const embedded = pack.constraints.find(
      (constraint) => constraint.constraintId === 'pool-fee-embedded',
    );
    expect(embedded?.description).toContain('never double-counted');
  });

  it('a non-aggregator AMM may not declare aggregator sources', () => {
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.familyExtension = {
            ...(draft.familyExtension as { family: 'dex' }),
            aggregatorSources: ['AMM_POOL'],
          };
        }),
      ),
    ).toThrow(/only declarable when dexKind is AGGREGATOR/);
  });

  it('declares its router-native optimization as the incumbent baseline (INV-C08)', () => {
    expect(pack.venueSurface.nativeOptimization).toEqual({
      optimizationKind: 'ROUTER_NATIVE_PATH_SELECTION',
      benchmarkBaseline: true,
      description: expect.any(String),
    });
  });

  it('a declared optimization that is not the benchmark baseline is rejected', () => {
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.venueSurface = {
            ...draft.venueSurface,
            nativeOptimization: {
              optimizationKind: 'ROUTER_NATIVE_PATH_SELECTION',
              benchmarkBaseline: false,
              description: 'not the baseline',
            },
          };
        }),
      ),
    ).toThrow(/benchmarkBaseline/);
  });
});
