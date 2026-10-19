/**
 * Canonical serialization + digests for the Lab (P6-W1; the deterministic
 * core extracted from the old payswap.org@8a735bf packages/lab
 * simulation.ts, W2-004 — INV-P03 reproducibility discipline).
 *
 * Everything in the Lab is content-digested so evidence artifacts are
 * content-addressed and tampering is detectable. The canonical form is
 * SORT-STABLE (object keys sorted recursively) and bigint-aware, so the
 * same logical content always digests identically. The hash is FNV-1a 64
 * (deterministic, import-free, no platform dependency).
 *
 * DETERMINISM LAW: no clock, no Math.random, no locale, no timezone —
 * this module is a pure function of its input.
 *
 * This module also carries the Lab's ONLY entropy source: the caller-seeded
 * splitmix64 PRNG (DeterministicRandom, merged from the old simulation.ts).
 * The same seed always produces the same sequence.
 */

/**
 * Canonical, sort-stable JSON text for digests (bigint-aware). Exported
 * for reuse by the other Lab modules (replay/candidates/promotion); the
 * simulation engine itself consumes it through this module only.
 */
export function canonicalize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return `n:${value.toString()}`;
    case "bigint":
      return `b:${value.toString()}`;
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalize(item)).join(",")}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${canonicalize(record[key])}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new Error(
        `lab canonical digest: unsupported value of type '${typeof value}'`,
      );
  }
}

const MASK64 = 0xffff_ffff_ffff_ffffn;

/** FNV-1a 64 digest over canonical text (deterministic, import-free). */
export function fnv1a64(text: string): string {
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i) & 0xff);
    hash = (hash * 0x100_0000_01b3n) & MASK64;
  }
  return `labfnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/**
 * Deep-freezes plain data (bigint-safe) so Lab evidence artifacts and
 * simulation results are immutable at runtime. Freezing is idempotent and
 * never throws on already-frozen values.
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
/**
 * The Lab's ONLY entropy source: a caller-seeded splitmix64 PRNG
 * (P6-W1; extracted from the old simulation.ts, W2-004).
 *
 * DETERMINISM LAW: behaviour of every simulation is a pure function of
 * (scenario plan, world, program, seed). There is no ambient clock, no
 * Math.random, no Date.now — the only pseudo-entropy in the entire package
 * is this class, seeded from the caller-supplied seed string. The same
 * seed always produces the same sequence.
 */


function foldSeed(seed: string): bigint {
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= BigInt(seed.charCodeAt(i) & 0xff);
    hash = (hash * 0x100_0000_01b3n) & MASK64;
  }
  return hash;
}

/**
 * Deterministic splitmix64 PRNG. Exported so the test battery can assert
 * the sequence determinism directly; the simulation engine is its only
 * production consumer.
 */
export class DeterministicRandom {
  private state: bigint;

  constructor(seed: string) {
    this.state = foldSeed(seed) & MASK64;
  }

  nextUint64(): bigint {
    this.state = (this.state + 0x9e37_79b9_7f4a_7c15n) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d0_49bb_1331_11ebn) & MASK64;
    return z ^ (z >> 31n);
  }

  /** Deterministic bounded jitter in [0, maxExclusive). */
  nextBounded(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      return 0;
    }
    return Number(this.nextUint64() % BigInt(maxExclusive));
  }
}
