/**
 * @payswap/onchain-adapters — the secret boundary (Work Order P4-W3, lane
 * R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-security/src/secrets.ts — the accepted local-copy law).
 *
 * Rule 25 discipline: agent-facing adapter contracts (write requests,
 * authorization feeds, observations, evidence) NEVER carry secret material
 * — raw private keys, seed phrases, wallet passwords, provider secrets,
 * cookies or MFA material. `assertNoSecretMaterial` is the fail-closed
 * proof: a violation THROWS, it is never silently sanitized.
 *
 * Detection is name/shape-based (binding, never security):
 * - forbidden KEY NAMES (normalized substring/exact vocabulary — when in
 *   doubt the boundary fails closed; use `vaultRef`/`credentialRef` naming
 *   for opaque secret REFERENCES);
 * - secret-shaped VALUES (raw 32-byte key shape, BIP-39 mnemonic shape,
 *   Bearer/Basic headers, PEM private keys) in neutral fields;
 * - DERIVED PUBLIC IDENTIFIERS are value-scan-exempt BY KEY NAME: a
 *   32-byte hex shape is the EXPECTED form for hashes, digests, signatures,
 *   txids, block hashes, calldata — they are not secrets.
 */

/** Marker explaining why a candidate was rejected (audit surface). */
export interface SecretBoundaryViolation {
  readonly path: string;
  readonly kind: 'forbidden_key' | 'secret_shaped_value';
  readonly key?: string;
  readonly reason: string;
}

/**
 * Normalized forbidden key-name fragments (substring match after stripping
 * `_`/`-` separators and lowercasing). No legitimate field of this
 * package's contracts collides; when in doubt the boundary fails closed.
 */
export const FORBIDDEN_SECRET_KEY_SUBSTRINGS = [
  'privatekey',
  'privkey',
  'secretkey',
  'plaintextkey',
  'rawkey',
  'keystore',
  'seedphrase',
  'mnemonic',
  'recoveryphrase',
  'backupphrase',
  'brainwallet',
  'password',
  'passphrase',
  'apikey',
  'apisecret',
  'providersecret',
  'clientsecret',
  'secret',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'cookie',
  'mfa',
  'totp',
  'otp',
] as const;

/** Forbidden only as an EXACT normalized key (ambiguous stems). */
export const FORBIDDEN_SECRET_KEY_EXACT = ['seed'] as const;

/**
 * Key-name fragments whose values are DERIVED PUBLIC identifiers where a
 * 32-byte hex shape is the expected form (keccak hashes, digests, opaque
 * signatures, txids, block hashes, calldata). These are value-scan-exempt;
 * the forbidden-KEY check still applies to their names.
 */
const DERIVED_IDENTIFIER_KEY_FRAGMENTS = [
  'hash',
  'digest',
  'signature',
  'fingerprint',
  'txid',
  'transactionid',
  'blockhash',
  'blockref',
  'headref',
  'txref',
  'calldata',
  'domainseparator',
  'salt',
] as const;

const MAX_SCAN_DEPTH = 8;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isForbiddenKeyName(key: string): boolean {
  const normalized = normalizeKey(key);
  if ((FORBIDDEN_SECRET_KEY_EXACT as readonly string[]).includes(normalized)) {
    return true;
  }
  return (FORBIDDEN_SECRET_KEY_SUBSTRINGS as readonly string[]).some((fragment) =>
    normalized.includes(fragment),
  );
}

function isDerivedIdentifierKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return DERIVED_IDENTIFIER_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/** Value shapes that are credential material regardless of field name. */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i,
  /^Basic\s+[A-Za-z0-9+/]+=*$/i,
  /^-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|PGP\s+)?PRIVATE KEY-----/,
];

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

/** Deterministic probe: does the string look like raw key material? */
export function looksLikeRawKeyMaterial(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  return isRawKeyShape(value);
}

function collectViolations(
  value: unknown,
  path: string,
  depth: number,
  seen: Set<object>,
  violations: SecretBoundaryViolation[],
): void {
  if (violations.length >= 5 || depth > MAX_SCAN_DEPTH) {
    return; // bounded reporting; the throw itself is the enforcement
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') {
      for (const pattern of SECRET_VALUE_PATTERNS) {
        if (pattern.test(value)) {
          violations.push({
            path,
            kind: 'secret_shaped_value',
            reason: 'credential-shaped value (auth header / PEM key)',
          });
          return;
        }
      }
      if (isMnemonicShape(value)) {
        violations.push({
          path,
          kind: 'secret_shaped_value',
          reason: 'BIP-39 mnemonic-shaped value in a neutral field',
        });
        return;
      }
      if (isRawKeyShape(value)) {
        violations.push({
          path,
          kind: 'secret_shaped_value',
          reason: 'raw 32-byte key-shaped value in a neutral field',
        });
      }
    }
    return;
  }
  if (seen.has(value)) {
    return; // cycle-safe (identity tracking)
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectViolations(value[index], `${path}[${index}]`, depth + 1, seen, violations);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Readonly<Record<string, unknown>>)) {
    const fieldPath = path === '' ? key : `${path}.${key}`;
    if (isForbiddenKeyName(key)) {
      violations.push({
        path: fieldPath,
        kind: 'forbidden_key',
        key,
        reason: 'forbidden secret key name on an agent-facing contract',
      });
      continue;
    }
    if (isDerivedIdentifierKey(key)) {
      // Derived public identifier: value-shape exempt (hashes, digests,
      // signatures, txids...) — recurse for structure, but the VALUE shape
      // of this field is expected to be hex/opaque.
      if (child !== null && typeof child === 'object' && !seen.has(child)) {
        collectViolations(child, fieldPath, depth + 1, seen, violations);
      }
      continue;
    }
    collectViolations(child, fieldPath, depth + 1, seen, violations);
  }
}

/**
 * Fail-closed proof that a candidate value carries no secret material:
 * forbidden key names and secret-shaped values throw (the first violations
 * are named in the error; the candidate is rejected, never sanitized).
 */
export function assertNoSecretMaterial(value: unknown, label: string): void {
  const violations: SecretBoundaryViolation[] = [];
  collectViolations(value, '', 0, new Set(), violations);
  if (violations.length > 0) {
    const summary = violations
      .slice(0, 5)
      .map((violation) => `${violation.path} [${violation.kind}] ${violation.reason}`)
      .join('; ');
    throw new Error(
      `secret boundary violation in ${label}: ${summary} — secret material never enters agent-facing contracts (rule 25); the value is rejected, never sanitized`,
    );
  }
}
