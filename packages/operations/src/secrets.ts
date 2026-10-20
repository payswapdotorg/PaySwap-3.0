/**
 * @payswap/operations — secrets hygiene: handles, never values (P8-W3,
 * hard law 7).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/secrets.ts
 * onto the canonical architecture (the pinned @payswap/provider-runtime
 * credential-isolation discipline: material crosses boundaries only as
 * OPAQUE HANDLES/REFERENCES). The rule set:
 *
 * 1. Secrets are VAULT/SECRET-STORE BACKED and NEVER COMMITTED to any
 *    operational artifact. Only reference names (`*_REF`, `vault://…`,
 *    runtime handles) appear in configuration.
 * 2. `SecretResolver` is the runtime boundary contract: a reference
 *    resolves to a KEY IDENTIFIER — a resolver NEVER returns a secret
 *    VALUE into a configuration artifact, log or record. The type makes
 *    this structural: the resolution result carries `keyId`, never
 *    `value`.
 * 3. Hygiene is CHECKED, not assumed: `checkSecretReferenceHygiene`
 *    scans a config artifact for secret-shaped VALUES and direct
 *    (non-`*_REF`) secret keys; `isSecretShaped` is the shared
 *    fail-closed byte scanner every operational record checker reuses.
 * 4. The SCRUBBER CONTRACT: `scrubSecretShapedValues` produces a
 *    redacted copy of any artifact (matched substrings replaced with
 *    `[REDACTED:<label>]`) — the deterministic form of "remove the
 *    exposed value" before an artifact may be shared.
 * 5. Rotation is PROCEDURAL DATA with bounded overlap windows; keys that
 *    authorize sensitive actions rotate WITH a security-epoch bump.
 *
 * Deterministic only: pure functions; no vault I/O — this package
 * declares and checks, it never resolves live secrets.
 */

/** Raised when the secrets-hygiene contract is violated. */
export class SecretHygieneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretHygieneError";
  }
}

// ---------------------------------------------------------------------------
// The fail-closed byte scanner (shared by every record checker)
// ---------------------------------------------------------------------------

/** Value shapes that are never acceptable inside an operational artifact. */
export const SECRET_SHAPED_PATTERNS: readonly {
  readonly label: string;
  readonly pattern: RegExp;
}[] = Object.freeze([
  { label: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "github-token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: "live-secret-key", pattern: /sk_live_[A-Za-z0-9]{16,}/ },
  { label: "live-publishable-key", pattern: /pk_live_[A-Za-z0-9]{16,}/ },
  { label: "test-secret-key", pattern: /sk_test_[A-Za-z0-9]{8,}/ },
  { label: "webhook-secret", pattern: /whsec_[A-Za-z0-9]{8,}/ },
  { label: "bearer-credential", pattern: /Bearer\s+[A-Za-z0-9._-]{24,}/i },
  { label: "inline-password", pattern: /(?:password|passwd|secret)\s*[:=]\s*\S+/i },
  { label: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
]);

/** True when a string is secret-shaped (fail-closed byte heuristics). */
export function isSecretShaped(value: string): boolean {
  return SECRET_SHAPED_PATTERNS.some((entry) => entry.pattern.test(value));
}

/**
 * Collect every secret-shaped string reachable in a value (field paths).
 * Shared by the provider-environment and rollout checkers so the SAME
 * fail-closed heuristics govern every operational artifact.
 */
export function collectSecretShapedStrings(
  value: unknown,
  prefix = "value",
): readonly string[] {
  const hits: string[] = [];
  const scan = (v: unknown, field: string): void => {
    if (typeof v === "string") {
      if (isSecretShaped(v)) {
        hits.push(field);
      }
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => scan(item, `${field}[${i}]`));
    } else if (typeof v === "object" && v !== null) {
      const record = v as Readonly<Record<string, unknown>>;
      for (const key of Object.keys(record)) {
        scan(record[key], `${field}.${key}`);
      }
    }
  };
  scan(value, prefix);
  return hits;
}

// ---------------------------------------------------------------------------
// The reference-resolution contract (runtime boundary)
// ---------------------------------------------------------------------------

/** What a resolution outcome may carry — a KEY ID, never the value. */
export type SecretResolution =
  | { readonly status: "RESOLVED"; readonly keyId: string }
  | { readonly status: "UNRESOLVED"; readonly reason: string };

/**
 * The runtime secret-resolution contract. An implementation resolves a
 * reference NAME to a key identifier inside the consumer's process; the
 * resolved VALUE never crosses back into configuration space, logs, or
 * this package's artifacts.
 */
export interface SecretResolver {
  resolve(referenceName: string): SecretResolution;
  /** Enumerate the key ids currently valid for a reference (rotation overlap). */
  activeKeyIds(referenceName: string): readonly string[];
}

/** A declarative (test/lint-time) resolver over an in-memory ref->key map. */
export class DeclarativeSecretResolver implements SecretResolver {
  private readonly keys: ReadonlyMap<string, readonly string[]>;

  constructor(entries: Readonly<Record<string, readonly string[]>>) {
    this.keys = new Map(Object.entries(entries));
  }

  resolve(referenceName: string): SecretResolution {
    const keyIds = this.keys.get(referenceName);
    if (keyIds === undefined || keyIds.length === 0) {
      return {
        status: "UNRESOLVED",
        reason: `no active key for reference '${referenceName}'`,
      };
    }
    return { status: "RESOLVED", keyId: `key:${referenceName}:${keyIds[0]}` };
  }

  activeKeyIds(referenceName: string): readonly string[] {
    return this.keys.get(referenceName) ?? [];
  }
}

// ---------------------------------------------------------------------------
// The hygiene gate (no secret values in config artifacts)
// ---------------------------------------------------------------------------

/**
 * A config key that is NOT a `*_REF` but names a secret directly — the
 * contract requires such entries be vault-backed references.
 */
export const FORBIDDEN_SECRET_KEY_FRAGMENTS: readonly string[] = Object.freeze([
  "PRIVATE_KEY",
  "PASSWORD",
  "API_KEY",
  "CLIENT_SECRET",
  "SIGNING_SECRET",
]);

export interface ConfigArtifactHygiene {
  readonly artifactId: string;
  /** Config keys rejected as direct (non-reference) secret keys. */
  readonly forbiddenKeys: readonly string[];
  /** Config values rejected as embedded secret material. */
  readonly embeddedValues: readonly { readonly key: string; readonly pattern: string }[];
  readonly passed: boolean;
}

export interface SecretHygieneReport {
  readonly passed: boolean;
  readonly artifacts: readonly ConfigArtifactHygiene[];
}

/**
 * Check config artifacts for secret EXPOSURE: no artifact may contain a
 * secret VALUE or a direct (non-`*_REF`) secret key. Differences from
 * completeness: this gate scans what IS there; completeness checks what
 * is MISSING. Both must pass before release.
 */
export function checkSecretReferenceHygiene(artifacts: readonly {
  readonly artifactId: string;
  readonly config: Readonly<Record<string, string>>;
}[]): SecretHygieneReport {
  const reports: ConfigArtifactHygiene[] = artifacts.map((artifact) => {
    const forbiddenKeys: string[] = [];
    const embeddedValues: { key: string; pattern: string }[] = [];
    for (const [key, value] of Object.entries(artifact.config)) {
      if (
        FORBIDDEN_SECRET_KEY_FRAGMENTS.some((fragment) =>
          key.toUpperCase().includes(fragment),
        ) &&
        !key.endsWith("_REF")
      ) {
        forbiddenKeys.push(key);
      }
      for (const { label, pattern } of SECRET_SHAPED_PATTERNS) {
        if (pattern.test(value)) {
          embeddedValues.push({ key, pattern: label });
          break;
        }
      }
    }
    return {
      artifactId: artifact.artifactId,
      forbiddenKeys: forbiddenKeys.sort(),
      embeddedValues: embeddedValues.sort((a, b) =>
        a.key.localeCompare(b.key, "en"),
      ),
      passed: forbiddenKeys.length === 0 && embeddedValues.length === 0,
    };
  });
  return { passed: reports.every((check) => check.passed), artifacts: reports };
}

// ---------------------------------------------------------------------------
// The scrubber contract
// ---------------------------------------------------------------------------

export interface ScrubResult {
  /** The redacted copy (matched substrings replaced). */
  readonly scrubbed: string;
  /** What was redacted, by label. */
  readonly findings: readonly { readonly label: string; readonly count: number }[];
}

/**
 * Produce a redacted copy of a text artifact: every secret-shaped
 * substring is replaced with `[REDACTED:<label>]`. Deterministic: the
 * same input always produces the same scrubbed output and findings.
 */
export function scrubSecretShapedValues(text: string): ScrubResult {
  let scrubbed = text;
  const findings: { label: string; count: number }[] = [];
  for (const { label, pattern } of SECRET_SHAPED_PATTERNS) {
    const matches = scrubbed.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
    if (matches !== null && matches.length > 0) {
      findings.push({ label, count: matches.length });
      scrubbed = scrubbed.replace(
        new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`),
        `[REDACTED:${label}]`,
      );
    }
  }
  return { scrubbed, findings };
}
