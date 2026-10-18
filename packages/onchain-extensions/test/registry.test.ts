import { describe, expect, it } from 'vitest';
import {
  OnchainExtensionPackRegistry,
  findSubPack,
  flattenPackTree,
  onchainPackId,
  resolveComposition,
} from '../src/index.ts';
import { PackConflictError } from '../src/errors.ts';
import { PackNotFoundError } from '../src/errors.ts';
import { uniswapV2Pack } from '../src/packs/uniswap-v2.ts';
import { tidalpoolsLiquidityPack } from '../src/packs/tidalpools-liquidity.ts';
import { meridianLendingPack } from '../src/packs/meridian-lending.ts';
import {
  fixtureDexPack,
  fixtureLendingStakingPack,
  fixtureLiquidityPack,
  variant,
} from './fixtures.ts';

/** NET-NEW: the declarative registry + family composition laws. */
describe('the pack registry (deterministic, order-preserving)', () => {
  it('registers packs and preserves registration order', () => {
    const registry = new OnchainExtensionPackRegistry();
    const first = uniswapV2Pack();
    const second = tidalpoolsLiquidityPack();
    registry.register(first);
    registry.register(second);
    expect(registry.packs().map((pack) => pack.packId)).toEqual([first.packId, second.packId]);
    expect(registry.size).toBe(2);
  });

  it('rejects duplicate pack ids (ids are unique per version)', () => {
    const registry = new OnchainExtensionPackRegistry();
    registry.register(uniswapV2Pack());
    expect(() => registry.register(uniswapV2Pack())).toThrow(PackConflictError);
    expect(registry.size).toBe(1);
  });

  it('a rejected registration leaves NO partial state (checks before insertion)', () => {
    const registry = new OnchainExtensionPackRegistry();
    registry.register(tidalpoolsLiquidityPack());
    const before = registry.size;
    expect(() => registry.register(uniswapV2Pack())).not.toThrow();
    expect(() =>
      registry.register(
        variant(uniswapV2Pack(), (draft) => {
          draft.venueSurface = { ...draft.venueSurface, displayName: '' };
        }),
      ),
    ).toThrow();
    expect(registry.size).toBe(before + 1);
  });

  it('require() is fail-closed; pack() never fabricates', () => {
    const registry = new OnchainExtensionPackRegistry();
    expect(() => registry.require('onchain-pack/dex/absent@1.0.0')).toThrow(PackNotFoundError);
    expect(registry.pack('onchain-pack/dex/absent@1.0.0')).toBeUndefined();
    expect(registry.has('onchain-pack/dex/absent@1.0.0')).toBe(false);
    registry.register(uniswapV2Pack());
    expect(registry.require('onchain-pack/dex/uniswap-v2@1.0.0').packId).toBe(
      'onchain-pack/dex/uniswap-v2@1.0.0',
    );
    expect(registry.has('onchain-pack/dex/uniswap-v2@1.0.0')).toBe(true);
  });

  it('packsForFamily filters in registration order', () => {
    const registry = new OnchainExtensionPackRegistry();
    registry.register(uniswapV2Pack());
    registry.register(tidalpoolsLiquidityPack());
    registry.register(meridianLendingPack());
    const dexPacks = registry.packsForFamily('dex');
    expect(dexPacks.map((pack) => pack.venueSurface.venueKey)).toEqual(['uniswap-v2']);
    expect(registry.packsForFamily('liquidity').length).toBe(1);
    expect(registry.packsForFamily('bridge')).toEqual([]);
  });
});

describe('family composition (sub-packs registered BEFORE the composer)', () => {
  it('a composer referencing an UNREGISTERED sub-pack is rejected (never fabricates)', () => {
    const registry = new OnchainExtensionPackRegistry();
    const composer = variant(fixtureDexPack(), (draft) => {
      draft.subPacks = [
        {
          packId: 'onchain-pack/liquidity/tidalpools-liquidity@1.0.0',
          role: 'source-venue',
          assumptions: [],
        },
      ];
    });
    expect(() => registry.register(composer)).toThrow(/not registered/);
    expect(registry.size).toBe(0);
  });

  it('a composer referencing a REGISTERED sub-pack resolves', () => {
    const registry = new OnchainExtensionPackRegistry();
    registry.register(tidalpoolsLiquidityPack());
    const composer = variant(fixtureDexPack(), (draft) => {
      draft.subPacks = [
        {
          packId: 'onchain-pack/liquidity/tidalpools-liquidity@1.0.0',
          role: 'source-venue',
          assumptions: ['the composed venue stays certified'],
        },
      ];
    });
    expect(() => registry.register(composer)).not.toThrow();
    const composition = resolveComposition(
      registry,
      'onchain-pack/dex/fixture-dex@1.0.0',
    );
    expect(composition.subPacks.length).toBe(1);
    expect(composition.subPacks[0]?.pack.family).toBe('liquidity');
  });

  it('family-incompatible composition is rejected (the PACK_FAMILY_COMPOSITION law)', () => {
    const registry = new OnchainExtensionPackRegistry();
    registry.register(meridianLendingPack());
    const composer = variant(fixtureDexPack(), (draft) => {
      draft.subPacks = [
        {
          packId: 'onchain-pack/lending-staking/meridian-lending@1.0.0',
          role: 'yield-source',
          assumptions: [],
        },
      ];
    });
    expect(() => registry.register(composer)).toThrow(/not composable into family 'dex'/);
  });

  it('a pack can never compose itself (self-reference rejected at validation)', () => {
    const registry = new OnchainExtensionPackRegistry();
    const selfComposed = variant(fixtureDexPack(), (draft) => {
      draft.subPacks = [
        {
          packId: draft.packId,
          role: 'self',
          assumptions: [],
        },
      ];
    });
    expect(() => registry.register(selfComposed)).toThrow(/never compose itself/);
  });

  it('duplicate sub-pack references are rejected at validation', () => {
    const registry = new OnchainExtensionPackRegistry();
    const duplicated = variant(fixtureDexPack(), (draft) => {
      draft.subPacks = [
        {
          packId: 'onchain-pack/liquidity/any@1.0.0',
          role: 'source-venue',
          assumptions: [],
        },
        {
          packId: 'onchain-pack/liquidity/any@1.0.0',
          role: 'source-venue-again',
          assumptions: [],
        },
      ];
    });
    expect(() => registry.register(duplicated)).toThrow(/duplicate sub-pack reference/);
  });

  it('leaves (liquidity, lending-staking) may compose nothing incompatible — and dex may compose dex', () => {
    const registry = new OnchainExtensionPackRegistry();
    registry.register(fixtureLiquidityPack());
    registry.register(uniswapV2Pack());
    const aggregator = variant(fixtureDexPack(), (draft) => {
      draft.packId = onchainPackId('dex', 'fixture-dex-aggregator', '1.0.0');
      draft.venueSurface = { ...draft.venueSurface, venueKey: 'fixture-dex-aggregator' };
      draft.subPacks = [
        {
          packId: 'onchain-pack/dex/uniswap-v2@1.0.0',
          role: 'source-venue',
          assumptions: [],
        },
      ];
    });
    expect(() => registry.register(aggregator)).not.toThrow();
    // A liquidity pack composing a dex pack is rejected (leaves compose leaves only... liquidity composes []).
    const liquidityComposer = variant(fixtureLiquidityPack(), (draft) => {
      draft.subPacks = [
        {
          packId: 'onchain-pack/dex/uniswap-v2@1.0.0',
          role: 'source',
          assumptions: [],
        },
      ];
    });
    expect(() => registry.register(liquidityComposer)).toThrow(PackConflictError);
  });
});

describe('composition projections (deterministic tree walks)', () => {
  it('flattenPackTree walks parent-first; findSubPack searches depth-first', () => {
    const registry = new OnchainExtensionPackRegistry();
    registry.register(fixtureLiquidityPack());
    registry.register(uniswapV2Pack());
    const root = variant(fixtureDexPack(), (draft) => {
      draft.subPacks = [
        {
          packId: 'onchain-pack/dex/uniswap-v2@1.0.0',
          role: 'source-venue',
          assumptions: [],
        },
      ];
    });
    registry.register(root);
    const composition = resolveComposition(registry, 'onchain-pack/dex/fixture-dex@1.0.0');
    const flattened = flattenPackTree(composition);
    expect(flattened.map((pack) => pack.venueSurface.venueKey)).toEqual([
      'fixture-dex',
      'uniswap-v2',
    ]);
    expect(findSubPack(composition, 'onchain-pack/dex/uniswap-v2@1.0.0')?.family).toBe('dex');
    expect(findSubPack(composition, 'onchain-pack/dex/absent@1.0.0')).toBeUndefined();
  });

  it('resolveComposition is fail-closed on unknown roots', () => {
    const registry = new OnchainExtensionPackRegistry();
    expect(() => resolveComposition(registry, 'onchain-pack/dex/absent@1.0.0')).toThrow(
      PackNotFoundError,
    );
  });
});
