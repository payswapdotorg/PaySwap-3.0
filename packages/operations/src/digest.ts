/**
 * @payswap/operations — deterministic canonical serialization + content
 * digest (package-local house pattern).
 *
 * Same deliberately-local pattern as every sibling certification-era
 * package (financial-certification, client-certification, opportunities,
 * lab, provider-runtime …): the protocol kernel exports no
 * content-addressing primitive, so each package reauthors the sorted-key
 * canonical form, bigint-safe, digested with FNV-1a 64. It detects
 * structural change for deployment fingerprints, parity reports, rollback
 * artifacts and evidence chains; it is NOT a cryptographic defense —
 * cryptographic digests (sha256) are produced by the substrate tooling
 * (scripts/release/build-release-manifest.mjs) and only ever ENTER this
 * package as validated hex strings.
 *
 * Deterministic only: pure functions of their inputs; no ambient clock,
 * no randomness, no locale-aware collation (sort() on string keys is
 * code-unit order — stable across machines).
 */

/** Deterministic canonical serialization (sorted keys, bigint-safe). */
export function canonicalString(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
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
        return `[${value.map((item) => serialize(item)).join(",")}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${serialize(record[key])}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new Error(
        `canonicalString: unsupported value of type '${typeof value}'`,
      );
  }
}

/**
 * FNV-1a 64-bit digest of the canonical serialization, as lowercase hex
 * with the `fnv1a64:` prefix. Content addressing for deployment
 * identities, environment fingerprints, parity reports, rollback
 * artifacts and evidence-chain links.
 */
export function contentDigest(value: unknown): string {
  const input = serialize(value);
  const prime = 0x100000001b3n;
  const offset = 0xcbf29ce484222325n;
  let hash = offset;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i) & 0xff);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/** Deep-freeze a value (operational records are immutable once assembled). */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return Object.freeze(value) as T;
}
