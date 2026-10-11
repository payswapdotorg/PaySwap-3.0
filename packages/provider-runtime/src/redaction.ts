/**
 * @payswap/provider-runtime — secret redaction at every boundary (P2-W2).
 *
 * INV-19: raw private keys, seed phrases, passwords, MFA material, API
 * secrets and protected session cookies never enter model context, normal
 * logs or ordinary artifacts. This module is the mechanical enforcement:
 *
 * - `redactForArtifact(value)` strips secret-named FIELDS and
 *   credential-shaped VALUES from anything headed for a record, log line
 *   or model-visible context. Structure and non-secret provider semantics
 *   survive untouched (lossless retention of semantics, INV-14); every
 *   redaction is AUDITABLE via the returned notices — never silent.
 * - `assertNoSecretMaterial(candidate, material)` proves that no string
 *   from a sealed credential bundle leaked into a callback result,
 *   artifact or envelope (fail-closed — a leak throws, it is never
 *   silently sanitized).
 *
 * Deterministic: no entropy, no host clock, never throws on odd input
 * (redaction itself must not become a crash vector); cycles are handled
 * with a seen-set.
 */

import { CredentialIsolationViolationError, ValidationError } from './errors.ts';
import { fnv1a64Hex } from './identifiers.ts';

/** Marker written in place of a redacted secret value. */
export const REDACTED_MARKER = '[REDACTED' as const;

/** One auditable redaction notice (what was removed and why). */
export interface RedactionNotice {
  /** Field path of the redacted value (e.g. `headers.Authorization`). */
  readonly path: string;
  /** Why it was redacted. */
  readonly reason: 'SECRET_FIELD_NAME' | 'CREDENTIAL_SHAPED_VALUE';
  /** Non-reversible fingerprint of the removed value (binding-never-security). */
  readonly fingerprint: string;
}

/**
 * Secret field-name vocabulary (case-insensitive match, exact-name or
 * camelCase/snake_case/kebab-case tolerant). Deliberately CONSERVATIVE on
 * names that are references (sessionId, eventId, correlationId are opaque
 * REFERENCES, not material — they must survive so lineage stays intact).
 */
const SECRET_FIELD_PATTERNS: readonly RegExp[] = [
  /^(?:api[_-]?key|apikey)$/i,
  /^(?:secret|client[_-]?secret|secret[_-]?key|signing[_-]?secret|webhook[_-]?secret)$/i,
  /^(?:password|passwd|pass)$/i,
  /^(?:access[_-]?token|refresh[_-]?token|auth[_-]?token|bearer[_-]?token|id[_-]?token)$/i,
  /^(?:token|session[_-]?token|api[_-]?token)$/i,
  /^(?:cookie|cookies|set[_-]?cookie|session[_-]?cookie|protected[_-]?cookie)$/i,
  /^(?:authorization|proxy[_-]?authorization)$/i,
  /^(?:private[_-]?key|signing[_-]?key|seed|seed[_-]?phrase|mnemonic)$/i,
  /^(?:otp|mfa[_-]?code|otp[_-]?code|one[_-]?time[_-]?code)$/i,
  /^(?:credential|credentials|api[_-]?credentials)$/i,
  /^(?:header[_-]?auth|auth[_-]?header)$/i,
];

/** Value shapes that are credential material regardless of field name. */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i,
  /^Basic\s+[A-Za-z0-9+/]+=*$/i,
  /^-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|PGP\s+)?PRIVATE KEY-----/,
];

function isSecretFieldName(name: string): boolean {
  return SECRET_FIELD_PATTERNS.some((pattern) => pattern.test(name));
}

function isCredentialShapedValue(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function redactStringIfShaped(
  value: string,
  path: string,
  notices: RedactionNotice[],
): string {
  if (isCredentialShapedValue(value)) {
    notices.push({
      path,
      reason: 'CREDENTIAL_SHAPED_VALUE',
      fingerprint: fnv1a64Hex(value),
    });
    return `${REDACTED_MARKER}:CREDENTIAL_SHAPED_VALUE]`;
  }
  return value;
}

function redactValue(
  value: unknown,
  path: string,
  notices: RedactionNotice[],
  seen: ReadonlySet<object>,
): unknown {
  if (typeof value === 'string') {
    return redactStringIfShaped(value, path, notices);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value as object)) {
    return '[CYCLE]';
  }
  const nextSeen = new Set(seen);
  nextSeen.add(value as object);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      out.push(redactValue(value[index], `${path}[${index}]`, notices, nextSeen));
    }
    return Object.freeze(out);
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const inner = record[key];
    if (inner === undefined) {
      continue; // canonical artifact form omits undefined
    }
    if (typeof inner === 'string' && isSecretFieldName(key)) {
      notices.push({
        path: path === '' ? key : `${path}.${key}`,
        reason: 'SECRET_FIELD_NAME',
        fingerprint: fnv1a64Hex(inner),
      });
      out[key] = `${REDACTED_MARKER}:SECRET_FIELD:${key}]`;
      continue;
    }
    if (inner !== null && typeof inner === 'object' && isSecretFieldName(key)) {
      // A secret-named container: redact the whole subtree's leaves.
      const subtreeNotices: RedactionNotice[] = [];
      const redacted = redactValue(inner, `${path}.${key}`, subtreeNotices, nextSeen);
      notices.push({
        path: path === '' ? key : `${path}.${key}`,
        reason: 'SECRET_FIELD_NAME',
        fingerprint: fnv1a64Hex(JSON.stringify(redacted)),
      });
      out[key] = `${REDACTED_MARKER}:SECRET_FIELD:${key}]`;
      continue;
    }
    out[key] = redactValue(inner, path === '' ? key : `${path}.${key}`, notices, nextSeen);
  }
  return Object.freeze(out);
}

/** Result of a redaction pass: the clean value plus auditable notices. */
export interface RedactionResult {
  readonly value: unknown;
  readonly notices: readonly RedactionNotice[];
}

/**
 * Redact anything headed for an artifact / log line / model context.
 * Deterministic, cycle-safe, never throws. Non-secret semantics are
 * preserved verbatim; every removal is recorded in `notices`.
 */
export function redactForArtifact(value: unknown): RedactionResult {
  const notices: RedactionNotice[] = [];
  const clean = redactValue(value, '', notices, new Set());
  return Object.freeze({ value: clean, notices: Object.freeze([...notices]) });
}

/** Convenience: redact and return only the clean value. */
export function redactedValue(value: unknown): unknown {
  return redactForArtifact(value).value;
}

/**
 * Fail-closed proof that no secret material from `secretStrings` appears
 * anywhere inside `candidate` (deep scan of string leaves and substrings
 * of long strings). A violation THROWS — the isolation boundary is never
 * silently sanitized (CredentialIsolationViolationError).
 */
export function assertNoSecretMaterial(
  candidate: unknown,
  secretStrings: readonly string[],
  context: string,
): void {
  const secrets = secretStrings.filter((s) => typeof s === 'string' && s.length >= 4);
  if (secrets.length === 0) {
    return;
  }
  const leaks = collectLeaks(candidate, secrets, new Set(), context);
  if (leaks.length > 0) {
    throw new CredentialIsolationViolationError(
      `INV-19 violation: credential material escaped the isolation boundary (${context})`,
      { leaks: leaks.slice(0, 5) },
    );
  }
}

function collectLeaks(
  value: unknown,
  secrets: readonly string[],
  seen: ReadonlySet<object>,
  path: string,
): string[] {
  if (typeof value === 'string') {
    return secrets.filter((secret) => value.includes(secret)).map((secret) => path);
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  if (seen.has(value as object)) {
    return [];
  }
  const nextSeen = new Set(seen);
  nextSeen.add(value as object);
  const leaks: string[] = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      leaks.push(...collectLeaks(value[index], secrets, nextSeen, `${path}[${index}]`));
    }
    return leaks;
  }
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    leaks.push(...collectLeaks(inner, secrets, nextSeen, path === '' ? key : `${path}.${key}`));
  }
  return leaks;
}

/** Extract the string leaves of a credential material object (isolation scan input). */
export function secretStringsOf(material: unknown): readonly string[] {
  if (typeof material === 'string') {
    return [material];
  }
  if (material === null || typeof material !== 'object') {
    return [];
  }
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      out.push(value);
    } else if (value !== null && typeof value === 'object') {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else {
        for (const inner of Object.values(value as Record<string, unknown>)) {
          walk(inner);
        }
      }
    }
  };
  walk(material);
  return out;
}

/** Validate that a value is a well-formed redaction marker. */
export function isRedactionMarker(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(REDACTED_MARKER);
}

/** Require a redacted value: throws if it still contains secret material. */
export function requireRedacted(value: unknown, context: string): unknown {
  const result = redactForArtifact(value);
  if (result.notices.length > 0) {
    throw new ValidationError(
      `${context}: value still carries unredacted secret-shaped material`,
      { paths: result.notices.map((n) => n.path) },
    );
  }
  return result.value;
}
