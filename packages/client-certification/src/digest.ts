/**
 * @payswap/client-certification — deterministic content digest (P8-W2).
 *
 * NET-NEW (the house digest law re-authored for this package): a pure
 * canonical-JSON serializer + 64-bit FNV-1a hash. Deterministic by
 * construction — same value in, same digest out, byte-identical across
 * runs and platforms; no ambient state, no randomness, no node: imports.
 */

/**
 * Canonical JSON: object keys sorted lexicographically at every depth,
 * arrays in order, strings JSON-escaped, `undefined` omitted (matching
 * JSON semantics), numbers via their JSON form. BigInts render as
 * `<n>n` (the canonical literal form — deterministic and unambiguous).
 */
export function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      return `${value.toString()}n`;
    case "number":
      return Number.isFinite(value) ? JSON.stringify(value) : "null";
    case "string":
      return JSON.stringify(value);
    case "undefined":
      return "null";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
      }
      const keys = Object.keys(value as Record<string, unknown>).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const entry = (value as Record<string, unknown>)[key];
        if (entry !== undefined) {
          parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`);
        }
      }
      return `{${parts.join(",")}}`;
    }
    default:
      // Functions and symbols never appear in certified payloads; treat
      // them as opaque excluded (deterministic, total).
      return "null";
  }
}

const FNV_64_OFFSET = 0xcbf29ce484222325n;
const FNV_64_PRIME = 0x100000001b3n;
const HEX_16 = "0123456789abcdef";

/** FNV-1a 64-bit over the UTF-8 bytes of the input; hex-encoded. */
export function fnv1a64Hex(input: string): string {
  let hash = FNV_64_OFFSET;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    // UTF-8 encode each UTF-16 code unit (surrogates pass through as
    // their own bytes — deterministic for every string).
    const bytes: number[] = [];
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = (hash * FNV_64_PRIME) & 0xffffffffffffffffn;
    }
  }
  let hex = "";
  for (let shift = 60n; shift >= 0n; shift -= 4n) {
    hex += HEX_16[Number((hash >> shift) & 0xfn)];
  }
  return hex;
}

/** The certification digest of any value (deterministic, pure). */
export function contentDigest(value: unknown): string {
  return `ccert:${fnv1a64Hex(canonicalJson(value))}`;
}
