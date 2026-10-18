import { describe, expect, it } from 'vitest';
import { validateOnchainExtensionPack } from '../src/index.ts';
import {
  AGGREGATOR_SETTLEMENT_ADDRESS,
  AGGREGATOR_VENUE_KEY,
  zeroswapAggregatorPack,
} from '../src/packs/zeroswap-aggregator.ts';
import { uniswapV2Pack } from '../src/packs/uniswap-v2.ts';
import { variant } from './fixtures.ts';

/**
 * The independent 0x-style aggregator venue, as DECLARATIVE DATA
 * (PORT+ADAPT of the old aggregator suite: the RFQ/AMM runtime composition
 * belongs to the execution lanes; the surface laws — independent identity,
 * multi-source declaration, explicit integrator fee on top, own incumbent
 * baseline — port here as pack-descriptor assertions).
 */

const pack = zeroswapAggregatorPack();

describe('the aggregator is an independent pack (not a reference-venue fork)', () => {
  it('has its own venue/protocol identity, distinct from the reference venue', () => {
    const reference = uniswapV2Pack();
    expect(pack.venueSurface.venueKey).toBe(AGGREGATOR_VENUE_KEY);
    expect(pack.venueSurface.venueKey).not.toBe(reference.venueSurface.venueKey);
    expect(pack.protocol.protocolKey).not.toBe(reference.protocol.protocolKey);
    expect(pack.implementation.implementationId).not.toBe(
      reference.implementation.implementationId,
    );
  });

  it('declares its own smart-routing optimization as the incumbent baseline', () => {
    expect(pack.venueSurface.nativeOptimization?.optimizationKind).toBe('SMART_SOURCE_ROUTING');
    expect(pack.venueSurface.nativeOptimization?.benchmarkBaseline).toBe(true);
  });

  it('its settlement contract declaration is a SYNTHETIC model deployment', () => {
    const settlement = pack.protocol.smartContracts[0];
    expect(settlement?.contractAddress).toBe(AGGREGATOR_SETTLEMENT_ADDRESS);
    expect(settlement?.upgradeAuthority.kind).toBe('MULTISIG');
    expect(settlement?.upgradeAuthority.delayOrTimelock).toBe('24h timelock');
    expect(settlement?.pausePowers.length).toBe(1);
    expect(settlement?.custody.custodial).toBe(false);
  });
});

describe('the AGGREGATOR surface (multi-source, explicit fee on top)', () => {
  it('declares the AGGREGATOR dex kind with RFQ and AMM source kinds', () => {
    if (pack.familyExtension.family !== 'dex') {
      throw new Error('unreachable');
    }
    expect(pack.familyExtension.dexKind).toBe('AGGREGATOR');
    expect(pack.familyExtension.aggregatorSources).toEqual(['RFQ_MAKER', 'AMM_POOL']);
  });

  it('declares the integrator fee as an EXPLICIT component on top of sourced liquidity', () => {
    if (pack.familyExtension.family !== 'dex') {
      throw new Error('unreachable');
    }
    expect(pack.familyExtension.feeModel).toBe('EXPLICIT_COMPONENT');
    const feeConstraint = pack.constraints.find(
      (constraint) => constraint.constraintId === 'integrator-fee-on-top',
    );
    expect(feeConstraint?.description).toContain('never double-counted');
  });

  it('an aggregator without source kinds is rejected (an aggregator composes sources)', () => {
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          const extension = draft.familyExtension as { family: 'dex' } & Record<string, unknown>;
          delete extension.aggregatorSources;
          draft.familyExtension = extension;
        }),
      ),
    ).toThrow(/aggregatorSources/);
  });

  it('an unknown aggregator source kind is rejected (closed vocabulary)', () => {
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.familyExtension = {
            ...(draft.familyExtension as { family: 'dex' }),
            aggregatorSources: ['DARK_POOL'],
          };
        }),
      ),
    ).toThrow(/aggregatorSources\[0\]/);
  });

  it('validates and is deeply frozen like every shipped pack', () => {
    expect(() => validateOnchainExtensionPack(pack)).not.toThrow();
    expect(Object.isFrozen(pack)).toBe(true);
  });
});
