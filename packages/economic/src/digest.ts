/**
 * @payswap/economic — deterministic content digest + canonical JSON (P1-W1).
 *
 * Port of the determinism discipline of payswap.org@8a735bf
 * packages/route-compiler (determinism.test.ts: "byte-identical output for
 * identical input, stable key ordering"), re-authored for the rail-neutral
 * candidate compiler: every derived id and every compilation digest is a PURE
 * FUNCTION of canonical content.
 *
 * - `canonicalJsonStringify` serializes JSON-shaped data with RECURSIVELY
 *   SORTED object keys (lexicographic), arrays in order, so that two
 *   structurally equal values always serialize byte-identically.
 * - `fnv1a64Hex` is the standard 64-bit FNV-1a hash over UTF-16 code units,
 *   implemented with BigInt (deterministic across platforms). It is NOT
 *   cryptographic and claims no collision resistance — it is used ONLY for
 *   stable content-derived identifiers inside this package, and the compiler
 *   fail-closes on any derived-id collision (never trusts the digest).
 * - No clock, no randomness, no filesystem, no network (the determinism law).
 */

/** Serialized key order for a canonical object is undefined at run time. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function isPlainObject(value: unknown): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown, path: string): JsonValue {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path}: non-finite numbers are not canonicalizable`);
      }
      // -0 serializes as "0" (deterministic canonical form).
      return value === 0 ? 0 : value;
    }
    case "object": {
      if (Array.isArray(value)) {
        return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`));
      }
      if (isPlainObject(value)) {
        const sorted: { [key: string]: JsonValue } = {};
        for (const key of Object.keys(value).sort()) {
          sorted[key] = canonicalize(value[key], `${path}.${key}`);
        }
        return sorted;
      }
      throw new TypeError(`${path}: value is not JSON-shaped (got ${typeof value})`);
    }
    default:
      throw new TypeError(`${path}: value is not JSON-shaped (got ${typeof value})`);
  }
}

/**
 * Canonical JSON text: keys recursively sorted, no whitespace variance, -0
 * normalized to 0. Structurally equal inputs serialize byte-identically.
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$"));
}

const FNV64_OFFSET_BASIS = 14695981039346656037n;
const FNV64_PRIME = 1099511628211n;
const FNV64_MASK = (1n << 64n) - 1n;

/** Standard 64-bit FNV-1a hash of a string's UTF-16 code units, as 16 lowercase hex chars. */
export function fnv1a64Hex(text: string): string {
  let hash = FNV64_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    hash ^= BigInt(codeUnit);
    hash = (hash * FNV64_PRIME) & FNV64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Content digest: FNV-1a 64 over the canonical JSON serialization. */
export function contentDigest(value: unknown): string {
  return fnv1a64Hex(canonicalJsonStringify(value));
}

/** Deterministic lexical sort (stable total order on strings). */
export function sortedStrings(values: readonly string[]): readonly string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
