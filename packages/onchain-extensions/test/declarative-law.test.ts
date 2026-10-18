import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OnchainExtensionPackRegistry,
  PACK_FAMILY_SEMANTICS,
  validateOnchainExtensionPack,
} from '../src/index.ts';
import { uniswapV2Pack } from '../src/packs/uniswap-v2.ts';
import { zeroswapAggregatorPack } from '../src/packs/zeroswap-aggregator.ts';
import { solverbatchIntentsPack } from '../src/packs/solverbatch-intents.ts';
import { lockportBridgePack } from '../src/packs/lockport-bridge.ts';
import { coinrampOffRampPack } from '../src/packs/coinramp-offramp.ts';
import { tidalpoolsLiquidityPack } from '../src/packs/tidalpools-liquidity.ts';
import { meridianLendingPack } from '../src/packs/meridian-lending.ts';
import { fixturePacks, variant } from './fixtures.ts';

/**
 * NET-NEW: THE DECLARATIVE LAW (the R3-W2 mission statement, machine-checked).
 * Packs are versioned descriptor DATA + validation + addressing — never
 * execution, never I/O, never financial authority. A pack may express
 * constraints/assumptions but can never authorize.
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

function deepFunctionMembers(value: unknown, path: string, offenders: string[]): void {
  if (typeof value === 'function') {
    offenders.push(`${path} is a function`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => deepFunctionMembers(entry, `${path}[${index}]`, offenders));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      deepFunctionMembers(entry, `${path}.${key}`, offenders);
    }
  }
}

describe('packs are DATA (zero executable members, anywhere)', () => {
  it('every shipped pack carries ZERO function members (deep scan)', () => {
    const offenders: string[] = [];
    for (const pack of shippedPacks) {
      deepFunctionMembers(pack, pack.packId, offenders);
    }
    expect(offenders).toEqual([]);
  });

  it('every fixture pack carries ZERO function members (deep scan)', () => {
    const offenders: string[] = [];
    for (const pack of fixturePacks()) {
      deepFunctionMembers(pack, pack.packId, offenders);
    }
    expect(offenders).toEqual([]);
  });

  it('pack data is canonical-serializable (pure JSON-ish data, no live references)', () => {
    for (const pack of shippedPacks) {
      expect(() => JSON.parse(JSON.stringify(pack))).not.toThrow();
    }
  });
});

describe('the package surface carries no execution verbs (the old venue port is gone)', () => {
  it('the registry class exposes ONLY declarative operations', () => {
    const forbidden = /^(quote|execute|plan|planWrite|simulate|authorize|broadcast|sign|transfer|approve|swap|bridge|submit|fulfill|settle)$/;
    const prototypeNames = Object.getOwnPropertyNames(
      OnchainExtensionPackRegistry.prototype,
    ).filter((name) => name !== 'constructor');
    for (const name of prototypeNames) {
      expect(forbidden.test(name)).toBe(false);
    }
    expect(prototypeNames.sort()).toEqual([
      'has',
      'pack',
      'packs',
      'packsForFamily',
      'register',
      'require',
      'size',
    ]);
  });

  it('src declares no venue-port execution method (source scan)', () => {
    const srcRoot = join(process.cwd(), 'src');
    const offenders: string[] = [];
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          scan(full);
        } else if (entry.endsWith('.ts')) {
          const source = readFileSync(full, 'utf8');
          // A method-shaped declaration of an execution verb.
          if (/\b(?:quote|planWrite|observeHealth|simulate)\s*\(/.test(source)) {
            offenders.push(`${full}: declares a venue-port execution method`);
          }
        }
      }
    };
    scan(srcRoot);
    expect(offenders).toEqual([]);
  });
});

describe('constraints can NEVER authorize (the authorityCarrier literal law)', () => {
  it('every constraint on every shipped pack carries authorityCarrier === false', () => {
    for (const pack of shippedPacks) {
      expect(pack.constraints.length).toBeGreaterThan(0);
      for (const constraint of pack.constraints) {
        expect(constraint.authorityCarrier).toBe(false);
      }
    }
  });

  it('a constraint claiming authority is REJECTED (authorityCarrier: true)', () => {
    const pack = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.constraints = [
            ...draft.constraints,
            {
              constraintId: 'sneaky-authority',
              kind: 'PRECONDITION',
              description: 'this constraint authorizes execution',
              authorityCarrier: true,
            },
          ];
        }),
      ),
    ).toThrow(/authorityCarrier must be the literal false/);
  });

  it('a constraint omitting the marker is REJECTED (absence is not innocence)', () => {
    const pack = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.constraints = [
            {
              constraintId: 'unmarked',
              kind: 'ASSUMPTION',
              description: 'no marker at all',
            },
          ];
        }),
      ),
    ).toThrow(/authorityCarrier must be the literal false/);
  });
});

describe('certification is required and status is NEVER carried', () => {
  it('every shipped pack declares the two certification literals', () => {
    for (const pack of shippedPacks) {
      expect(pack.certification.certificationRequired).toBe(true);
      expect(pack.certification.statusCarried).toBe(false);
    }
  });

  it('a pack cannot opt out of certification', () => {
    const pack = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.certification = { certificationRequired: false, statusCarried: false };
        }),
      ),
    ).toThrow(/certificationRequired must be the literal true/);
  });

  it('a pack cannot carry its own certification status', () => {
    const pack = uniswapV2Pack();
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.certification = { certificationRequired: true, statusCarried: true };
        }),
      ),
    ).toThrow(/statusCarried must be the literal false/);
  });

  it('no pack field carries certification STATUS anywhere (key census)', () => {
    const statusShaped = /certif(?:ied|icationStatus)|^status$/i;
    for (const pack of shippedPacks) {
      for (const key of Object.keys(pack)) {
        expect(statusShaped.test(key)).toBe(false);
      }
      expect(Object.keys(pack.certification).sort()).toEqual([
        'certificationRequired',
        'statusCarried',
      ]);
    }
  });
});

describe('declarative determinism (same input, same pack)', () => {
  it('a pack builder is a pure function: two constructions are deeply equal', () => {
    const first = uniswapV2Pack();
    const second = uniswapV2Pack();
    expect(first).toEqual(second);
    expect(first.provenance.contentDigest).toBe(second.provenance.contentDigest);
  });

  it('the frozen vocabulary tables are immutable (Object.freeze holds)', () => {
    expect(Object.isFrozen(PACK_FAMILY_SEMANTICS)).toBe(true);
    for (const family of Object.keys(PACK_FAMILY_SEMANTICS)) {
      expect(Object.isFrozen(PACK_FAMILY_SEMANTICS[family as 'dex'])).toBe(true);
    }
  });
});
