import { describe, expect, it } from 'vitest';
import {
  canonicalProtocolRef,
  canonicalString,
  chainCapabilityId,
  contentDigest,
  onchainPackId,
  packContentDigest,
  packFamilyOf,
  parsePackId,
  validateOnchainExtensionPack,
} from '../src/index.ts';
import { ValidationError } from '../src/errors.ts';
import type { OnchainExtensionPack } from '../src/wire/core.ts';
import { uniswapV2Pack } from '../src/packs/uniswap-v2.ts';
import { lockportBridgePack } from '../src/packs/lockport-bridge.ts';
import { fixtureDexPack, tampered, variant } from './fixtures.ts';

/** NET-NEW: the canonical addressing law (deterministic identity + tamper evidence). */
describe('the pack id law (deterministic derivation)', () => {
  it('derives the canonical form family/packKey/version', () => {
    expect(onchainPackId('dex', 'uniswap-v2', '1.0.0')).toBe(
      'onchain-pack/dex/uniswap-v2@1.0.0',
    );
    expect(onchainPackId('lending-staking', 'meridian-lending', '0.2.1')).toBe(
      'onchain-pack/lending-staking/meridian-lending@0.2.1',
    );
  });

  it('rejects non-families, non-canonical pack keys and non-semver versions', () => {
    expect(() => onchainPackId('venues' as 'dex', 'x', '1.0.0')).toThrow(ValidationError);
    expect(() => onchainPackId('dex', 'Bad Key', '1.0.0')).toThrow(/packKey/);
    expect(() => onchainPackId('dex', 'ok-key', '1.0')).toThrow(/version/);
  });

  it('parses every shipped pack id round-trip (fail-closed parser)', () => {
    for (const pack of [uniswapV2Pack(), lockportBridgePack()]) {
      const parsed = parsePackId(pack.packId);
      expect(parsed).toEqual({
        family: pack.family,
        packKey: pack.venueSurface.venueKey,
        version: pack.version,
      });
      expect(packFamilyOf(pack.packId)).toBe(pack.family);
    }
  });

  it('rejects malformed ids without guessing or repairing', () => {
    for (const malformed of [
      '',
      'venue-pack/uniswap-v2@1.0.0',
      'onchain-pack/dex/uniswap-v2',
      'onchain-pack/dex/Uniswap-V2@1.0.0',
      'onchain-pack/unknown-family/key@1.0.0',
      'onchain-pack/dex/key@1.0.0.0',
    ]) {
      expect(() => parsePackId(malformed)).toThrow(ValidationError);
    }
  });
});

describe('the pinned onchain-domain addressing forms (reconciled with the 3.0 pins)', () => {
  it('chain capability ids follow the accepted capability:chain: convention', () => {
    expect(chainCapabilityId('ethereum:mainnet')).toBe('capability:chain:ethereum:mainnet');
    expect(() => chainCapabilityId('Ethereum Mainnet')).toThrow(ValidationError);
  });

  it('protocol capability ids and canonical refs follow the pinned forms', () => {
    expect(canonicalProtocolRef('uniswap-v2', 'ethereum:mainnet')).toBe(
      'ethereum:mainnet/protocol:uniswap-v2',
    );
    // The 3.0 convention extended to protocols (deviation D-2 in the
    // evidence record: the old form was protocol.<chainKey>:<protocolKey>).
    const pack = uniswapV2Pack();
    expect(pack.implementation.capabilityId).toBe(
      'capability:protocol:ethereum:mainnet:uniswap-v2',
    );
  });
});

describe('the canonical pack projection + content digest (tamper evidence)', () => {
  it('the projection excludes exactly the digest field', () => {
    const pack = uniswapV2Pack();
    const projection = {
      ...pack,
      provenance: { declaredBy: pack.provenance.declaredBy, artifactRef: pack.provenance.artifactRef },
    };
    expect(packContentDigest(pack)).toBe(contentDigest(projection));
  });

  it('the digest is INDEPENDENT of key insertion order (canonical serialization sorts)', () => {
    const pack = fixtureDexPack();
    const reordered = {
      provenance: pack.provenance,
      certification: pack.certification,
      constraints: pack.constraints,
      subPacks: pack.subPacks,
      familyExtension: pack.familyExtension,
      implementation: pack.implementation,
      protocol: pack.protocol,
      venueSurface: pack.venueSurface,
      version: pack.version,
      family: pack.family,
      packId: pack.packId,
    };
    expect(packContentDigest(reordered)).toBe(packContentDigest(pack));
  });

  it('the digest CHANGES when pack data changes (binding)', () => {
    const pack = fixtureDexPack();
    const mutated = structuredClone(pack) as {
      venueSurface: { displayName: string };
    } & OnchainExtensionPack;
    mutated.venueSurface.displayName = 'a different display name';
    expect(packContentDigest(mutated)).not.toBe(packContentDigest(pack));
  });

  it('silent mutation of pack data is DETECTED at validation (the tamper law)', () => {
    const pack = uniswapV2Pack();
    // tampered = mutated WITHOUT re-deriving the digest.
    expect(() =>
      validateOnchainExtensionPack(
        tampered(pack, (draft) => {
          draft.venueSurface = {
            ...draft.venueSurface,
            displayName: 'silently renamed',
          };
        }),
      ),
    ).toThrow(/disagrees with the canonical pack projection digest/);
  });

  it('a well-formed variant with a RE-DERIVED digest still validates (isolation)', () => {
    const pack = uniswapV2Pack();
    const renamed = variant(pack, (draft) => {
      draft.venueSurface = {
        ...draft.venueSurface,
        displayName: 'an honestly renamed venue',
      };
    });
    expect(() => validateOnchainExtensionPack(renamed)).not.toThrow();
  });

  it('the digest format is fnv1a64:<16 hex> (binding-never-security)', () => {
    expect(uniswapV2Pack().provenance.contentDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(canonicalString({ b: 1, a: [true, null, 'x'] })).toBe('{"a":[true,null,"x"],"b":n:1}');
  });
});
