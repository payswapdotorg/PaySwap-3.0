/**
 * @payswap/merchant — the secret-boundary detector law (P5-W3, lane
 * R3-W3; PORT+ADAPT of the accepted onchain-security kernel's secret
 * law @ main, byte-identical for the shared detectors, EXTENDED with
 * the Stripe key-kind shapes pinned in pins/stripe.ts).
 *
 * THE LAW (INV-19): raw private keys, seed phrases, wallet passwords,
 * provider API secrets and protected session cookies never enter model
 * context or ordinary artifacts. Secrets handling here is SHAPES +
 * POLICY ONLY — deep runtime scans that make a secret-bearing artifact
 * UNCONSTRUCTIBLE — never key material custody.
 *
 * The accepted kernel is the byte-identical reference:
 * - raw 32-byte key shape: `/^(0x)?[0-9a-fA-F]{64}$/`
 *   (a 20-byte PUBLIC address `0x` + 40 hex does NOT match — public
 *   addresses are never flagged);
 * - BIP-39 mnemonic shape: exactly 12 or 24 lowercase words of 3-8
 *   letters;
 * - Stripe sk_/rk_ live/test key shapes (pins/stripe.ts — the merchant
 *   extension; whsec_ webhook-signing secrets too);
 * - NO over-broad bearer regex exists anywhere in this law (the old
 *   operations-plane bearer pattern was explicitly REJECTED as
 *   dishonest).
 *
 * Derived public identifiers where a 32-byte hex shape is EXPECTED
 * (hashes, digests, signatures, fingerprints, tx ids…) are
 * value-scan-exempt by key name — they are not secrets.
 *
 * Deterministic only: pure functions, no clock, no randomness. No
 * realistic secret literal ever appears in this source or its
 * fixtures: tests assemble credential-shaped fixtures at RUNTIME from
 * fragments.
 */

import { SecretShapeError, ValidationError, type SecretViolation } from "./errors.ts";
import { LIMITS } from "./kernel.ts";
import { pinnedStripeKeyKindOf } from "./pins/stripe.ts";

// ---------------------------------------------------------------------------
// Forbidden key-name vocabulary (byte-identical with the kernel)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: the accepted onchain-security kernel
 * `FORBIDDEN_SECRET_KEY_SUBSTRINGS` (byte-identical members).
 * Normalized forbidden key-name fragments (substring match after
 * stripping `_`/`-` separators and lowercasing). When in doubt the
 * scan fails closed. Use `credentialRef`/`vaultRef` naming for opaque
 * secret references.
 */
export const FORBIDDEN_SECRET_KEY_SUBSTRINGS = [
  "privatekey",
  "privkey",
  "secretkey",
  "plaintextkey",
  "rawkey",
  "keystore",
  "seedphrase",
  "mnemonic",
  "recoveryphrase",
  "backupphrase",
  "brainwallet",
  "password",
  "passphrase",
  "apikey",
  "apisecret",
  "providersecret",
  "clientsecret",
  "secret",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "cookie",
  "mfa",
  "totp",
  "otp",
] as const;

/**
 * VALUE PIN — authority: the accepted kernel
 * `FORBIDDEN_SECRET_KEY_EXACT` (byte-identical). Forbidden only as an
 * EXACT normalized key (ambiguous stems).
 */
export const FORBIDDEN_SECRET_KEY_EXACT = ["seed"] as const;

/**
 * VALUE PIN — authority: the accepted kernel
 * `DERIVED_IDENTIFIER_KEY_FRAGMENTS` (byte-identical members). Key-name
 * fragments whose values are DERIVED PUBLIC identifiers where a
 * 32-byte hex shape is the expected form. These are value-scan-exempt;
 * the forbidden-KEY check still applies to their names.
 */
export const DERIVED_IDENTIFIER_KEY_FRAGMENTS = [
  "hash",
  "digest",
  "signature",
  "fingerprint",
  "txid",
  "transactionid",
  "blockhash",
  "blockref",
  "txref",
  "calldata",
  "domainseparator",
  "salt",
] as const;

// ---------------------------------------------------------------------------
// Value shape detectors (structure only — byte-identical kernel law)
// ---------------------------------------------------------------------------

/** Raw 32-byte key shape: 64 hex chars, with or without a 0x prefix. */
export function isRawKeyShape(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value);
}

/** BIP-39 mnemonic shape: exactly 12 or 24 lowercase words of 3-8 letters. */
export function isMnemonicShape(value: string): boolean {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length !== 12 && tokens.length !== 24) {
    return false;
  }
  return tokens.every((token) => /^[a-z]{3,8}$/.test(token));
}

/**
 * True iff the value's SHAPE is a provider secret key kind (Stripe
 * sk_/rk_ live/test, or a whsec_ webhook-signing secret — via the
 * pinned key-kind law). Publishable pk_ keys are PUBLIC by design and
 * are never flagged.
 */
export function isProviderSecretKeyShape(value: string): boolean {
  const kind = pinnedStripeKeyKindOf(value);
  return kind === "SECRET_KEY" || kind === "RESTRICTED_KEY" || kind === "WEBHOOK_SIGNING_SECRET";
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/** (exported for the policy twin — internal vocabulary helper) */
export function isForbiddenKeyName(key: string): boolean {
  const normalized = normalizeKey(key);
  if ((FORBIDDEN_SECRET_KEY_EXACT as readonly string[]).includes(normalized)) {
    return true;
  }
  return (FORBIDDEN_SECRET_KEY_SUBSTRINGS as readonly string[]).some((fragment) =>
    normalized.includes(fragment),
  );
}

/** (exported for the policy twin — internal vocabulary helper) */
export function isDerivedIdentifierKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (DERIVED_IDENTIFIER_KEY_FRAGMENTS as readonly string[]).some((fragment) =>
    normalized.includes(fragment),
  );
}

// ---------------------------------------------------------------------------
// Deep runtime scan (bounded depth, cycle-safe)
// ---------------------------------------------------------------------------

/**
 * Scan an arbitrary value for secret-shaped material. Deterministic
 * and pure: same value, same violations. Cycles are cut by identity
 * tracking; depth is bounded. Functions are treated as opaque (never
 * carried). The merchant extension of the kernel law: Stripe key
 * shapes are flagged alongside raw-key and mnemonic shapes.
 */
export function scanForSecretMaterial(
  value: unknown,
  path = "$",
  depth = 0,
  seen = new Set<object>(),
): readonly SecretViolation[] {
  const violations: SecretViolation[] = [];
  if (depth > LIMITS.secretScanMaxDepth) {
    return violations;
  }
  if (value === null || typeof value !== "object") {
    return violations;
  }
  if (seen.has(value)) {
    return violations;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      violations.push(
        ...scanForSecretMaterial(value[index], `${path}[${index}]`, depth + 1, seen),
      );
    }
    return violations;
  }
  const record = value as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(record)) {
    const field = record[key];
    const fieldPath = `${path}.${key}`;
    if (isForbiddenKeyName(key)) {
      violations.push({
        path: fieldPath,
        kind: "forbidden_key",
        key,
        reason: `field name '${key}' may never appear on an agent-facing contract (raw credentials stay at the trusted surface / vault — INV-19)`,
      });
      continue; // the name alone is the violation; do not also scan the value
    }
    if (typeof field === "string" && !isDerivedIdentifierKey(key)) {
      if (isRawKeyShape(field)) {
        violations.push({
          path: fieldPath,
          kind: "secret_shaped_value",
          key,
          reason: `value has the raw 32-byte private-key shape (64 hex chars) under a non-derived-identifier field '${key}'`,
        });
        continue;
      }
      if (isMnemonicShape(field)) {
        violations.push({
          path: fieldPath,
          kind: "secret_shaped_value",
          key,
          reason: `value has the BIP-39 mnemonic shape (12/24 lowercase words) under field '${key}'`,
        });
        continue;
      }
      if (isProviderSecretKeyShape(field)) {
        violations.push({
          path: fieldPath,
          kind: "secret_shaped_value",
          key,
          reason: `value has a provider secret-key shape (Stripe sk_/rk_ or whsec_ key) under field '${key}'`,
        });
        continue;
      }
    }
    violations.push(...scanForSecretMaterial(field, fieldPath, depth + 1, seen));
  }
  return violations;
}

/**
 * Fail-closed gate for every agent-facing artifact constructor: throws
 * `SecretShapeError` listing every violation when secret-shaped
 * material is present (INV-19 — proof by construction).
 */
export function assertNoSecretMaterial(value: unknown, label: string): void {
  const violations = scanForSecretMaterial(value);
  if (violations.length > 0) {
    throw new SecretShapeError(label, violations);
  }
}

// ---------------------------------------------------------------------------
// Display policy (redaction — evidence stays truthful, material never moves)
// ---------------------------------------------------------------------------

/** The redaction marker vocabulary (opaque, shape-descriptive). */
export const REDACTION_MARKERS = Object.freeze({
  rawKey: "[redacted:raw-key-shape]",
  mnemonic: "[redacted:mnemonic-shape]",
  providerKey: "[redacted:provider-key-shape]",
} as const);

function redactString(value: string): string | undefined {
  if (isRawKeyShape(value)) {
    return REDACTION_MARKERS.rawKey;
  }
  if (isMnemonicShape(value)) {
    return REDACTION_MARKERS.mnemonic;
  }
  if (isProviderSecretKeyShape(value)) {
    return REDACTION_MARKERS.providerKey;
  }
  return undefined;
}

/**
 * The DISPLAY/LOG policy: a deep copy with every secret-shaped
 * occurrence replaced by an opaque `[redacted:<shape>]` marker
 * (evidence stays truthful, material never transits). Deterministic;
 * the input is never mutated.
 */
export function redactSecretShapedValues(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value) ?? value;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretShapedValues(item));
  }
  const record = value as Readonly<Record<string, unknown>>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    copy[key] = redactSecretShapedValues(record[key]);
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Compile-time twin (type-level forbidden-key detection)
// ---------------------------------------------------------------------------

type StripSeparators<S extends string> = S extends `${infer A}_${infer B}`
  ? StripSeparators<`${A}${B}`>
  : S extends `${infer A}-${infer B}`
    ? StripSeparators<`${A}${B}`>
    : S;

/** Lowercase + strip `_`/`-` from a key name. */
export type NormalizeKeyName<K extends string> = StripSeparators<Lowercase<K>>;

type ForbiddenSubstringUnion = (typeof FORBIDDEN_SECRET_KEY_SUBSTRINGS)[number];

type KeyNameViolates<K extends string> =
  NormalizeKeyName<K> extends "seed"
    ? true
    : NormalizeKeyName<K> extends `${string}${ForbiddenSubstringUnion}${string}`
      ? true
      : false;

/**
 * Union of every forbidden key name found anywhere inside `T`
 * (recursing through object properties, arrays and tuples). Resolves
 * to `never` when the contract is secret-free. The adversarial suite
 * asserts `never` for every agent-facing contract of this package.
 */
export type FindForbiddenSecretKeys<T> =
  T extends (...args: never[]) => unknown
    ? never
    : T extends readonly (infer E)[]
      ? FindForbiddenSecretKeys<E>
      : T extends object
        ? {
            [K in keyof T]-?: K extends string
              ? KeyNameViolates<K> extends true
                ? K
                : FindForbiddenSecretKeys<T[K]>
              : never;
          }[keyof T]
        : never;

/**
 * Self-annotating proof: `SecretFree<T>` is `T` when `T` carries no
 * forbidden key name, and a descriptive error union otherwise.
 */
export type SecretFree<T> =
  FindForbiddenSecretKeys<T> extends never ? T : ["FORBIDDEN_SECRET_KEY", FindForbiddenSecretKeys<T>];

/** Require a non-empty string (the scan's precondition helper). */
export function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`${label} must be a non-empty string`, { label });
  }
  return value;
}
