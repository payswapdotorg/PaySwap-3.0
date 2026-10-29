/**
 * @payswap/opportunities — the digest backbone (P23-A, ADR-0015 D2/D4/D6).
 *
 * LOCAL re-declaration of the route-compiler canonical flavor under the
 * leaf-in-flight law (zero sibling imports, even type-only ones — the
 * @payswap/route-planning src/canonical.ts discipline, which itself
 * re-declares the same authority). ADR-0009 D4 fixes ONE digest flavor:
 * the value-form canonicalization — recursively key-sorted JSON text with
 * bigint rendered `b:<decimal>` and number rendered `n:<decimal>` — hashed
 * with FNV-1a 64 and namespaced `fnv1a64:<16-hex>`. Digests compute over
 * the VALUE (the canonical projection), never over a JSON.stringify
 * round-trip of already-parsed text.
 *
 * Consumers (this wave): the deterministic platform-work id
 * `platform-work:<gapId>:<digest-of-evidence>` (./platform-work.ts) and
 * the deterministic model-proposal id (./repair-proposals.ts).
 *
 * Determinism law: no ambient clock, no randomness, no filesystem, no
 * network, no float parsing. Same input -> same output, always.
 */

import { ValidationError } from "./errors.ts";

/**
 * Recursively freeze a wire value (idempotent; the immutability law).
 * Arrays and plain objects are frozen in depth; primitives pass through.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Canonical, sort-stable JSON text (bigint-aware). Objects serialize with
 * recursively sorted keys; bigints as `b:<decimal>`; numbers as
 * `n:<decimal>`; strings via JSON.stringify. Functions/symbols/undefined/
 * non-finite numbers are rejected — canonical text is total over wire data.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new ValidationError("canonical JSON rejects non-finite numbers");
      }
      return `n:${value.toString()}`;
    case "bigint":
      return `b:${value.toString()}`;
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new ValidationError(
        `canonical JSON rejects values of type '${typeof value}'`,
      );
  }
}

const MASK64 = 0xffff_ffff_ffff_ffffn;
const FNV_OFFSET = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x100_0000_01b3n;

/** FNV-1a 64 digest over text (deterministic binding, not security). */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index) & 0xff);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Content digest over the canonical JSON projection: `fnv1a64:<16 hex>`
 * (ADR-0009 D4 — the one digest flavor; re-declared locally under the
 * leaf-in-flight law, byte-identical to the route-compiler flavor).
 */
export function contentDigest(value: unknown): string {
  return `fnv1a64:${fnv1a64(canonicalJsonStringify(value))}`;
}
