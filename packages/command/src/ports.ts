/**
 * @payswap/command — typed dependency ports (P7-W3).
 *
 * TRANSPORTS-AS-CONTRACTS LAW (the P4-W3 doctrine applied here): hashing,
 * signing, clocks and id minting are TYPED SHAPES, never I/O. This package
 * performs no cryptography, reads no clock and mints no entropy: every
 * effect-bearing dependency is an injected port whose implementation the
 * composition root owns. Tests inject deterministic implementations
 * (including REAL SHA-256/HMAC via the host crypto in test/), which keeps
 * src/** free of built-in-module imports while the wire contracts remain
 * provably implementable.
 *
 * Determinism law: given the same port state and the same call order, the
 * same outputs (the deterministic clock + id factory below are the
 * reference implementations used to pin that law).
 */

import { ValidationError } from './errors.ts';

// ---------------------------------------------------------------------------
// Hex digests (the wire form of every hash/signature this surface pins)
// ---------------------------------------------------------------------------

declare const Hex64Brand: unique symbol;
/** A validated lowercase 64-character hex digest (SHA-256/HMAC-SHA256 output). */
export type Hex64 = string & { readonly [Hex64Brand]: 'Hex64' };

const HEX64_PATTERN = /^[0-9a-f]{64}$/;

/** Narrow an unknown value to a well-formed 64-char lowercase hex digest. */
export function isHex64(value: unknown): value is Hex64 {
  return typeof value === 'string' && HEX64_PATTERN.test(value);
}

/** Validate a 64-char lowercase hex digest or fail closed. */
export function asHex64(value: unknown, subject: string): Hex64 {
  if (!isHex64(value)) {
    throw new ValidationError(
      `${subject} must be a 64-character lowercase hex digest (sha256 wire form)`,
      { subject, value },
    );
  }
  return value;
}

/**
 * Fixed-length constant-time comparison over two hex digests: the
 * accumulation loop never short-circuits on a mismatching byte, so the
 * comparison time does not leak the position of the first difference
 * (mirrors the old webhook verification discipline).
 */
export function constantTimeHexEquals(a: Hex64, b: Hex64): boolean {
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

// ---------------------------------------------------------------------------
// Clock port — timestamps are DATA, never an ambient clock
// ---------------------------------------------------------------------------

/** Milliseconds since the Unix epoch. bigint — never a JS number. */
export type TimestampMs = bigint;

/** The deterministic clock port: wall reading + strictly increasing sequence. */
export interface CommandClock {
  now(): TimestampMs;
  monotonic(): bigint;
}

/** The deterministic reference clock: a CommandClock the test/replay driver advances. */
export interface DeterministicClock extends CommandClock {
  advanceMs(deltaMs: bigint | number): void;
}

/**
 * The deterministic reference clock (tests, replay, contract freezing):
 * `now()` moves only via `advanceMs`; `monotonic()` strictly increases on
 * every call independent of `advanceMs`, so id factories minting on a
 * frozen clock still produce distinct, reproducible identifiers.
 */
export function createDeterministicClock(startMs: bigint | number): DeterministicClock {
  let nowMs: bigint = typeof startMs === 'bigint' ? startMs : BigInt(startMs);
  let monotonic = 0n;
  return {
    now(): TimestampMs {
      return nowMs;
    },
    monotonic(): bigint {
      monotonic += 1n;
      return monotonic;
    },
    advanceMs(deltaMs: bigint | number): void {
      nowMs += typeof deltaMs === 'bigint' ? deltaMs : BigInt(deltaMs);
    },
  };
}

// ---------------------------------------------------------------------------
// Id factory port — uniqueness from the monotonic sequence, never entropy
// ---------------------------------------------------------------------------

/** Deterministic identifier factory port (mirrors the protocol lane shape). */
export interface IdFactory {
  mintId(prefix: string): string;
}

const PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

/**
 * The deterministic reference id factory:
 * `${prefix}${separator}${now}${separator}${monotonic}`. Uniqueness comes
 * from the injected clock's monotonic sequence — never from entropy — so
 * given the same clock and the same call order, the same ids are produced.
 */
export function createDeterministicIdFactory(clock: CommandClock, options?: { readonly separator?: string }): IdFactory {
  const separator = options?.separator ?? '_';
  if (separator.length === 0 || separator.length > 8) {
    throw new ValidationError('separator must be between 1 and 8 characters', { separator });
  }
  return {
    mintId(prefix: string): string {
      if (typeof prefix !== 'string' || !PREFIX_PATTERN.test(prefix)) {
        throw new ValidationError('id prefix must match [A-Za-z0-9][A-Za-z0-9._-]{0,31}', { prefix });
      }
      return `${prefix}${separator}${clock.now()}${separator}${clock.monotonic()}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Hash + MAC ports — typed shapes, never I/O
// ---------------------------------------------------------------------------

/**
 * The request-hash port: SHA-256 over UTF-8 input, hex wire form. The
 * canonical serialization fed to this port is `canonicalJson` (src/canonical.ts)
 * — the signed bytes are therefore deterministic across serializers.
 */
export interface RequestHasher {
  hashUtf8(input: string): Hex64;
}

/**
 * The MAC port: HMAC-SHA256 over UTF-8 input with a string key, hex wire
 * form. Key material is INJECTED by the composition root (secrets vault;
 * INV-19: keys never enter this package's artifacts).
 */
export interface HmacPort {
  signUtf8(key: string, payload: string): Hex64;
}

/** Validate a hasher implementation behaves like a deterministic SHA-256. */
export function assertHasherContract(hasher: RequestHasher): void {
  const first = hasher.hashUtf8('payswap.command.hasher-contract-probe');
  const second = hasher.hashUtf8('payswap.command.hasher-contract-probe');
  if (first !== second) {
    throw new ValidationError('RequestHasher must be deterministic: same input, same digest');
  }
  const other = hasher.hashUtf8('payswap.command.hasher-contract-probe-other');
  if (first === other) {
    throw new ValidationError('RequestHasher must distinguish different inputs');
  }
}

/** Validate an HMAC implementation behaves like a keyed deterministic MAC. */
export function assertHmacContract(mac: HmacPort): void {
  const first = mac.signUtf8('k1', 'payswap.command.mac-contract-probe');
  const second = mac.signUtf8('k1', 'payswap.command.mac-contract-probe');
  if (first !== second) {
    throw new ValidationError('HmacPort must be deterministic: same key + payload, same digest');
  }
  const otherKey = mac.signUtf8('k2', 'payswap.command.mac-contract-probe');
  if (first === otherKey) {
    throw new ValidationError('HmacPort must be keyed: different keys, different digests');
  }
}
