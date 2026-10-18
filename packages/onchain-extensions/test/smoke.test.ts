import { describe, expect, it } from 'vitest';
import * as onchainExtensions from '../src/index.ts';

/** Smoke: the package surface (PORT+ADAPT of the old onchain-venues smoke). */
describe('@payswap/onchain-extensions smoke', () => {
  it('declares its package name', () => {
    expect(onchainExtensions.PACKAGE_NAME).toBe('@payswap/onchain-extensions');
  });

  it('exports the neutral pack contract', () => {
    expect(typeof onchainExtensions.validateOnchainExtensionPack).toBe('function');
    expect(typeof onchainExtensions.onchainPackId).toBe('function');
    expect(typeof onchainExtensions.parsePackId).toBe('function');
    expect(typeof onchainExtensions.packContentDigest).toBe('function');
    expect(typeof onchainExtensions.OnchainExtensionPackRegistry).toBe('function');
  });

  it('exports the per-family validators and the semantics tables', () => {
    expect(typeof onchainExtensions.validateDexPackExtension).toBe('function');
    expect(typeof onchainExtensions.validateBridgePackExtension).toBe('function');
    expect(typeof onchainExtensions.validateOffRampPackExtension).toBe('function');
    expect(typeof onchainExtensions.validateLiquidityPackExtension).toBe('function');
    expect(typeof onchainExtensions.validateLendingStakingPackExtension).toBe('function');
    expect(typeof onchainExtensions.validateIntentProtocolPackExtension).toBe('function');
    expect(Object.isFrozen(onchainExtensions.PACK_FAMILY_SEMANTICS)).toBe(true);
    expect(Object.isFrozen(onchainExtensions.PACK_FAMILY_COMPOSITION)).toBe(true);
  });

  it('the neutral barrel carries NO concrete pack vocabulary (the old census law)', () => {
    const exportedNames = Object.keys(onchainExtensions).sort();
    expect(exportedNames.length).toBeGreaterThan(80);
    for (const name of exportedNames) {
      expect(
        /uniswap|zeroswap|solverbatch|lockport|coinramp|tidalpools|meridian/i.test(name),
      ).toBe(false);
    }
  });

  it('all seven pack subpaths import and construct validated packs', async () => {
    const subpaths = [
      '../src/packs/uniswap-v2.ts',
      '../src/packs/zeroswap-aggregator.ts',
      '../src/packs/solverbatch-intents.ts',
      '../src/packs/lockport-bridge.ts',
      '../src/packs/coinramp-offramp.ts',
      '../src/packs/tidalpools-liquidity.ts',
      '../src/packs/meridian-lending.ts',
    ] as const;
    for (const subpath of subpaths) {
      const mod = (await import(subpath)) as Record<string, unknown>;
      const builder = Object.values(mod).find(
        (value) => typeof value === 'function',
      ) as () => unknown;
      const pack = builder() as { packId: string };
      expect(pack.packId).toMatch(/^onchain-pack\//);
    }
  });
});
