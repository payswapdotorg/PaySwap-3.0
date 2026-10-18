import { describe, expect, it } from 'vitest';
import {
  DEX_PACK_KINDS,
  ONCHAIN_OPERATION_KINDS,
  PACK_FAMILIES,
  PACK_FAMILY_COMPOSITION,
  PACK_FAMILY_PROTOCOL_CLASSES,
  PACK_FAMILY_SEMANTICS,
  allowedProtocolClasses,
  composableFamilies,
  isBridgePackExtension,
  isDexPackExtension,
  isIntentProtocolPackExtension,
  isLendingStakingPackExtension,
  isLiquidityPackExtension,
  isOffRampPackExtension,
  isPackFamily,
  packFamilySemantics,
  packFamilyTablesAreTotal,
} from '../src/index.ts';
import { fixturePacks } from './fixtures.ts';

/** NET-NEW: the pack-family vocabulary + semantics tables (graph.md P5-W2). */
describe('the pack-family vocabulary', () => {
  it('pins the six families exactly (frozen const + derived union + guard)', () => {
    expect([...PACK_FAMILIES]).toEqual([
      'dex',
      'bridge',
      'off-ramp',
      'liquidity',
      'lending-staking',
      'intent-protocol',
    ]);
    expect(Object.isFrozen(PACK_FAMILIES)).toBe(true);
  });

  it('the guard admits the six families and rejects everything else', () => {
    for (const family of PACK_FAMILIES) {
      expect(isPackFamily(family)).toBe(true);
    }
    expect(isPackFamily('venues')).toBe(false);
    expect(isPackFamily('DEX')).toBe(false);
    expect(isPackFamily('')).toBe(false);
    expect(isPackFamily(42)).toBe(false);
  });

  it('the family-extension guards discriminate on the family discriminant', () => {
    const packs = fixturePacks();
    for (const pack of packs) {
      expect(isDexPackExtension(pack.familyExtension)).toBe(pack.family === 'dex');
      expect(isBridgePackExtension(pack.familyExtension)).toBe(pack.family === 'bridge');
      expect(isOffRampPackExtension(pack.familyExtension)).toBe(pack.family === 'off-ramp');
      expect(isLiquidityPackExtension(pack.familyExtension)).toBe(pack.family === 'liquidity');
      expect(isLendingStakingPackExtension(pack.familyExtension)).toBe(
        pack.family === 'lending-staking',
      );
      expect(isIntentProtocolPackExtension(pack.familyExtension)).toBe(
        pack.family === 'intent-protocol',
      );
    }
  });
});

describe('the family semantics table (what each family offers, declaratively)', () => {
  it('is total over the six families and frozen', () => {
    expect(packFamilyTablesAreTotal()).toBe(true);
    expect(Object.isFrozen(PACK_FAMILY_SEMANTICS)).toBe(true);
  });

  it('every family declares a surface summary and representative canonical operations', () => {
    for (const family of PACK_FAMILIES) {
      const semantics = packFamilySemantics(family);
      expect(semantics.family).toBe(family);
      expect(semantics.description.length).toBeGreaterThan(20);
      expect(semantics.addressingDescription.length).toBeGreaterThan(20);
      expect(semantics.representativeOperations.length).toBeGreaterThan(0);
      for (const operation of semantics.representativeOperations) {
        expect((ONCHAIN_OPERATION_KINDS as readonly string[]).includes(operation)).toBe(true);
      }
    }
  });

  it('each family addresses a distinct canonical operation signature', () => {
    expect(packFamilySemantics('dex').representativeOperations).toEqual(['onchain.swap']);
    expect(packFamilySemantics('bridge').representativeOperations).toEqual(['onchain.bridge']);
    expect(packFamilySemantics('intent-protocol').representativeOperations).toEqual([
      'onchain.intent',
    ]);
    expect(
      packFamilySemantics('off-ramp').representativeOperations.includes('onchain.transfer'),
    ).toBe(true);
  });
});

describe('the protocolClass coupling table', () => {
  it('pins the allowed protocol classes per family', () => {
    expect([...allowedProtocolClasses('dex')]).toEqual(['DEX']);
    expect([...allowedProtocolClasses('bridge')]).toEqual(['BRIDGE']);
    expect([...allowedProtocolClasses('off-ramp')]).toEqual(['OTHER']);
    expect([...allowedProtocolClasses('liquidity')]).toEqual(['DEX', 'OTHER']);
    expect([...allowedProtocolClasses('lending-staking')]).toEqual(['LENDING', 'STAKING']);
    expect([...allowedProtocolClasses('intent-protocol')]).toEqual(['INTENT_NETWORK']);
    expect(Object.isFrozen(PACK_FAMILY_PROTOCOL_CLASSES)).toBe(true);
  });
});

describe('the family composition table (which families compose which)', () => {
  it('pins the compatibility law: aggregators compose venues; leaves compose nothing', () => {
    expect([...composableFamilies('dex')]).toEqual(['dex', 'liquidity']);
    expect([...composableFamilies('bridge')]).toEqual(['bridge', 'liquidity']);
    expect([...composableFamilies('off-ramp')]).toEqual(['off-ramp', 'dex']);
    expect([...composableFamilies('liquidity')]).toEqual([]);
    expect([...composableFamilies('lending-staking')]).toEqual([]);
    expect([...composableFamilies('intent-protocol')]).toEqual(['dex', 'bridge']);
    expect(Object.isFrozen(PACK_FAMILY_COMPOSITION)).toBe(true);
  });

  it('every composable family is a declared family (no dangling composition edges)', () => {
    for (const family of PACK_FAMILIES) {
      for (const composable of composableFamilies(family)) {
        expect(isPackFamily(composable)).toBe(true);
      }
    }
  });
});

describe('the DEX pack-kind vocabulary (ADAPT of the old flavor kinds)', () => {
  it('pins the four dex kinds exactly', () => {
    expect([...DEX_PACK_KINDS]).toEqual(['AMM', 'ORDER_BOOK', 'RFQ', 'AGGREGATOR']);
  });
});
