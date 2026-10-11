/**
 * @payswap/provider-runtime — deterministic clock (P2-W2).
 *
 * Same discipline as the P1 lanes (protocol clock.ts): domain logic never
 * reads the host wall clock; it receives a `RuntimeClock` by injection.
 * Deterministic tests use `DeterministicClock` (caller advances time
 * explicitly); `SystemRuntimeClock` exists ONLY for the composition root.
 * `TimestampMs` is bigint milliseconds — never a JS number (float).
 */

import { ValidationError } from './errors.ts';

/** Milliseconds since the Unix epoch. bigint — never a JS number. */
export type TimestampMs = bigint;

export interface RuntimeClock {
  /** Wall-clock reading, millisecond precision. */
  now(): TimestampMs;
  /** Strictly increasing sequence for uniqueness within this clock. */
  monotonic(): bigint;
}

function toBigIntMs(value: number | bigint, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new ValidationError(`${label} must be an integer number of milliseconds`, { value });
    }
    return BigInt(value);
  }
  return value;
}

/** Deterministic clock: time advances ONLY by explicit call. */
export class DeterministicClock implements RuntimeClock {
  private currentMs: bigint;
  private sequence: bigint;

  constructor(start?: number | bigint) {
    this.currentMs = start === undefined ? 0n : toBigIntMs(start, 'start');
    this.sequence = 0n;
  }

  now(): TimestampMs {
    return this.currentMs;
  }

  monotonic(): bigint {
    this.sequence += 1n;
    return this.sequence;
  }

  /** Advance deterministic time by an explicit delta (tests/replay only). */
  advance(deltaMs: number | bigint): void {
    const delta = toBigIntMs(deltaMs, 'deltaMs');
    if (delta < 0n) {
      throw new ValidationError('deterministic clock never regresses', { deltaMs: String(delta) });
    }
    this.currentMs += delta;
  }

  /** Set deterministic time to an explicit absolute value. */
  setTo(ms: number | bigint): void {
    const target = toBigIntMs(ms, 'ms');
    if (target < this.currentMs) {
      throw new ValidationError('deterministic clock never regresses', {
        from: String(this.currentMs),
        to: String(target),
      });
    }
    this.currentMs = target;
  }
}

/**
 * Wall-clock edge adapter. Composition-root use only — never constructed
 * inside domain logic (the boundary test guards Date.now to this file).
 */
export class SystemRuntimeClock implements RuntimeClock {
  #lastSeq = 0n;

  now(): TimestampMs {
    return BigInt(Date.now());
  }

  monotonic(): bigint {
    this.#lastSeq += 1n;
    return BigInt(Date.now()) + this.#lastSeq;
  }
}

/** Parse a provider-issued epoch-seconds string into TimestampMs (bigint). */
export function parseEpochSeconds(seconds: string, label: string): TimestampMs {
  if (typeof seconds !== 'string' || seconds.length === 0) {
    throw new ValidationError(`${label} must be a non-empty epoch-seconds string`, { seconds });
  }
  if (!/^-?[0-9]+$/.test(seconds)) {
    throw new ValidationError(`${label} must be integer epoch seconds`, { seconds });
  }
  return BigInt(seconds) * 1000n;
}
