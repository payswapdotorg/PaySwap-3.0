import { describe, expect, it } from 'vitest';
import {
  onchainPackId,
  parsePackId,
  protocolCapabilityId,
  validateOnchainExtensionPack,
} from '../src/index.ts';
import { uniswapV2Pack, UNISWAP_V2_VENUE_KEY } from '../src/packs/uniswap-v2.ts';
import { zeroswapAggregatorPack } from '../src/packs/zeroswap-aggregator.ts';
import { solverbatchIntentsPack } from '../src/packs/solverbatch-intents.ts';
import { lockportBridgePack } from '../src/packs/lockport-bridge.ts';
import { coinrampOffRampPack } from '../src/packs/coinramp-offramp.ts';
import { tidalpoolsLiquidityPack } from '../src/packs/tidalpools-liquidity.ts';
import { meridianLendingPack } from '../src/packs/meridian-lending.ts';
import { CHAIN, variant } from './fixtures.ts';

/**
 * The extension-pack contract (PORT+ADAPT of the old pack-contract suite):
 * packs validate through the full battery, pack identity is deterministic
 * and couples to the venue identity, and the ONE-venue coupling laws hold
 * (a pack's venue surface, protocol declarations and implementation
 * descriptor are the same venue — never two).
 */

const shippedPacks = [
  uniswapV2Pack(),
  zeroswapAggregatorPack(),
  solverbatchIntentsPack(),
  lockportBridgePack(),
  coinrampOffRampPack(),
  tidalpoolsLiquidityPack(),
  meridianLendingPack(),
];

describe('extension-pack validation (the canonical composition)', () => {
  it('every shipped pack validates as an OnchainExtensionPack', () => {
    for (const pack of shippedPacks) {
      expect(() => validateOnchainExtensionPack(pack)).not.toThrow();
    }
  });

  it('every pack is deeply frozen after validation (validate-then-freeze)', () => {
    for (const pack of shippedPacks) {
      expect(Object.isFrozen(pack)).toBe(true);
      expect(Object.isFrozen(pack.protocol)).toBe(true);
      expect(Object.isFrozen(pack.protocol.smartContracts)).toBe(true);
      expect(Object.isFrozen(pack.familyExtension)).toBe(true);
    }
  });

  it("every pack's protocol binding couples to its implementation and pack identity", () => {
    for (const pack of shippedPacks) {
      expect(pack.implementation.protocolKey).toBe(pack.protocol.protocolKey);
      expect(pack.implementation.chainKey).toBe(pack.protocol.chainKey);
      expect(pack.implementation.capabilityId).toBe(
        protocolCapabilityId(pack.protocol.protocolKey, pack.protocol.chainKey),
      );
      expect(pack.packId).toBe(onchainPackId(pack.family, pack.venueSurface.venueKey, pack.version));
    }
  });

  it('the INV-SC01 declarations are complete (source/bytecode/authorities/custody on every contract)', () => {
    for (const pack of shippedPacks) {
      expect(pack.protocol.smartContracts.length).toBeGreaterThan(0);
      for (const contract of pack.protocol.smartContracts) {
        expect(contract.kind).toBe('smart_contract_extension');
        expect(contract.sourceHash).toMatch(/^sha256:/);
        expect(contract.bytecodeHash).toMatch(/^sha256:/);
        expect(contract.upgradeAuthority.kind).toBeTruthy();
        expect(contract.adminAuthority.kind).toBeTruthy();
        expect(typeof contract.custody.custodial).toBe('boolean');
        expect(contract.chainRef).toBe(pack.protocol.chainKey);
      }
    }
  });

  it('pack ids are deterministic and couple to the venue identity', () => {
    const uniswap = uniswapV2Pack();
    expect(uniswap.packId).toBe(onchainPackId('dex', UNISWAP_V2_VENUE_KEY, '1.0.0'));
    expect(parsePackId(uniswap.packId)).toEqual({
      family: 'dex',
      packKey: UNISWAP_V2_VENUE_KEY,
      version: '1.0.0',
    });
    // A pack whose id names ANOTHER venue is rejected (the old venueId law).
    expect(() =>
      validateOnchainExtensionPack(
        variant(uniswap, (draft) => {
          draft.packId = onchainPackId('dex', 'some-other-venue', draft.version);
        }),
      ),
    ).toThrow(/venueKey/);
  });

  it("a pack whose id family segment disagrees with its family field is rejected", () => {
    const uniswap = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(uniswap, (draft) => {
          draft.packId = onchainPackId('bridge', draft.venueSurface.venueKey, draft.version);
        }),
      ),
    ).toThrow(/family segment/);
  });

  it("a pack whose id version segment disagrees with its version field is rejected", () => {
    const uniswap = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(uniswap, (draft) => {
          draft.version = '2.0.0';
        }),
      ),
    ).toThrow(/version/);
  });

  it('a pack whose venue surface and protocol declarations disagree is rejected (ONE venue)', () => {
    const uniswap = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(uniswap, (draft) => {
          draft.protocol = {
            ...draft.protocol,
            protocolKey: 'a-different-protocol',
          };
        }),
      ),
    ).toThrow(/ONE venue/);
  });

  it('a pack whose venue surface drops the protocol chain is rejected (ONE venue on ONE chain)', () => {
    const uniswap = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(uniswap, (draft) => {
          draft.venueSurface = {
            ...draft.venueSurface,
            chains: ['solana:mainnet-beta'],
          };
        }),
      ),
    ).toThrow(/chainKey/);
  });

  it('a pack whose protocol class violates the family coupling law is rejected', () => {
    const uniswap = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(uniswap, (draft) => {
          draft.protocol = {
            ...draft.protocol,
            protocolClass: 'LENDING',
          };
        }),
      ),
    ).toThrow(/not allowed for family/);
  });
});

describe('the venue registry seed covers all six families', () => {
  it('the seven shipped packs cover every family (dex twice: reference + aggregator)', () => {
    const families = shippedPacks.map((pack) => pack.family).sort();
    expect(families).toEqual([
      'bridge',
      'dex',
      'dex',
      'intent-protocol',
      'lending-staking',
      'liquidity',
      'off-ramp',
    ]);
  });

  it('every fixture-chain reference is the canonical ethereum mainnet key', () => {
    for (const pack of shippedPacks) {
      expect(pack.protocol.chainKey).toBe(CHAIN);
    }
  });
});
