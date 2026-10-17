import { describe, expect, it } from 'vitest';

import {
  isHex64,
  asHex64,
  constantTimeHexEquals,
  createDeterministicClock,
  createDeterministicIdFactory,
  assertHasherContract,
  assertHmacContract,
} from '../src/ports.ts';
import type { RequestHasher, HmacPort, Hex64 } from '../src/ports.ts';
import { ValidationError } from '../src/errors.ts';
import { realSha256, realHmac, T0_MS } from './fixtures.ts';

describe('the typed dependency ports (transports-as-contracts)', () => {
  it('Hex64 validates the 64-char lowercase hex wire form exactly', () => {
    const digest = realSha256.hashUtf8('probe');
    expect(isHex64(digest)).toBe(true);
    expect(isHex64(`${digest.toUpperCase()}`)).toBe(false);
    expect(isHex64(digest.slice(0, 63))).toBe(false);
    expect(asHex64(digest, 'test digest')).toBe(digest);
    expect(() => asHex64('nothex', 'test digest')).toThrow(ValidationError);
  });

  it('constantTimeHexEquals compares digests without short-circuiting', () => {
    const a = realSha256.hashUtf8('a');
    const b = realSha256.hashUtf8('b');
    expect(constantTimeHexEquals(a, a)).toBe(true);
    expect(constantTimeHexEquals(a, b)).toBe(false);
  });

  it('the deterministic clock advances only via advanceMs; monotonic strictly increases', () => {
    const clock = createDeterministicClock(T0_MS);
    expect(clock.now()).toBe(T0_MS);
    const m1 = clock.monotonic();
    const m2 = clock.monotonic();
    expect(m2 > m1).toBe(true);
    clock.advanceMs(1000n);
    expect(clock.now()).toBe(T0_MS + 1000n);
    expect(clock.monotonic()).toBe(m2 + 1n);
  });

  it('the deterministic id factory: same clock state + same call order => same ids; prefixes validated', () => {
    const idsA = createDeterministicIdFactory(createDeterministicClock(T0_MS));
    const idsB = createDeterministicIdFactory(createDeterministicClock(T0_MS));
    expect(idsA.mintId('cmd')).toBe(idsB.mintId('cmd'));
    expect(idsA.mintId('cmd')).not.toBe(idsA.mintId('cmd')); // monotonic advances
    expect(() => idsA.mintId('bad prefix!')).toThrow(ValidationError);
    expect(() => idsA.mintId('')).toThrow(ValidationError);
    expect(idsA.mintId('cmd')).toMatch(/^cmd_\d+_\d+$/);
  });

  it('the REAL SHA-256 hasher satisfies the RequestHasher contract (deterministic, distinguishing)', () => {
    expect(() => assertHasherContract(realSha256)).not.toThrow();
  });

  it('the REAL HMAC signer satisfies the HmacPort contract (deterministic, keyed)', () => {
    expect(() => assertHmacContract(realHmac)).not.toThrow();
  });

  it('a non-deterministic hasher port fails the contract probe (fail closed)', () => {
    let flip = false;
    const broken: RequestHasher = {
      hashUtf8(): Hex64 {
        flip = !flip;
        return (flip ? 'a'.repeat(64) : 'b'.repeat(64)) as Hex64;
      },
    };
    expect(() => assertHasherContract(broken)).toThrow(ValidationError);
    const unkeyed: HmacPort = {
      signUtf8(_key: string, payload: string): Hex64 {
        return realSha256.hashUtf8(payload); // ignores the key
      },
    };
    expect(() => assertHmacContract(unkeyed)).toThrow(ValidationError);
  });

  it('the sha256 wire form is pinned: known-answer test over canonical material', () => {
    // sha256("payswap") — known answer; pins the primitive's hex wire form.
    expect(realSha256.hashUtf8('payswap')).toBe(
      '8ec402124f46b039063974c8b46421e8a7ef3e0bd39e6aca8e806c7cacb3d33a',
    );
  });
});
