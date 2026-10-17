/**
 * @payswap/onchain-security — the secrets POLICY layer: redaction and
 * opaque vault references (R2-W2 net-new; NON-CUSTODY.md + INV-19).
 *
 * NON-CUSTODY LAW: secrets handling in this package is SHAPES + POLICY
 * ONLY — never key material custody. This module is the policy half:
 *
 * - `redactSecretShapedValues(value)` — the DISPLAY/LOG policy: a deep
 *   copy with every secret-shaped occurrence replaced by an opaque
 *   `[redacted:<shape>]` marker (evidence stays truthful, material never
 *   transits into model context or ordinary artifacts).
 * - `opaqueCredentialRef(...)` — the ONLY lawful way to reference a
 *   secret: an opaque `{ kind: "vault_ref", vault, ref }` pointer; the
 *   vault (trusted surface) owns custody, this package never does.
 *
 * The detection vocabulary (forbidden keys, shape detectors, the deep
 * scan) lives in secrets.ts; both halves are deterministic pure
 * functions.
 */

import { ValidationError } from "./pins/index.ts";
import type { OpaqueCredentialRef } from "./secrets.ts";
import {
  isForbiddenKeyNameLocal,
  isDerivedIdentifierKeyLocal,
  isMnemonicShape,
  isRawKeyShape,
} from "./secrets.ts";

// ---------------------------------------------------------------------------
// Redaction policy (display/log safety — NON-CUSTODY law)
// ---------------------------------------------------------------------------

/** The opaque marker substituted for redacted secret-shaped values. */
export const REDACTED_MARKER_KINDS = ["raw_key", "mnemonic", "forbidden_key"] as const;

function redactValue(
  value: unknown,
  path: string,
  depth: number,
  seen: Map<object, unknown>,
): unknown {
  if (depth > 8 || value === null || typeof value !== "object") {
    return value;
  }
  const already = seen.get(value);
  if (already !== undefined) {
    return already;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (let index = 0; index < value.length; index += 1) {
      copy.push(redactValue(value[index], `${path}[${index}]`, depth + 1, seen));
    }
    return copy;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const key of Object.keys(record)) {
    const field = record[key];
    if (isForbiddenKeyNameLocal(key)) {
      copy[key] = "[redacted:forbidden_key]";
      continue;
    }
    if (typeof field === "string" && !isDerivedIdentifierKeyLocal(key)) {
      if (isRawKeyShape(field)) {
        copy[key] = "[redacted:raw_key]";
        continue;
      }
      if (isMnemonicShape(field)) {
        copy[key] = "[redacted:mnemonic]";
        continue;
      }
    }
    copy[key] = redactValue(field, `${path}.${key}`, depth + 1, seen);
  }
  return copy;
}

/**
 * The DISPLAY/LOG redaction policy: a deep copy of `value` with every
 * secret-shaped occurrence replaced by an opaque `[redacted:<shape>]`
 * marker. The ORIGINAL is never mutated; evidence structure stays intact
 * while the material never transits into model context or ordinary
 * artifacts (INV-19 + NON-CUSTODY.md: redaction, not custody).
 */
export function redactSecretShapedValues(value: unknown): unknown {
  return redactValue(value, "$", 0, new Map());
}

// ---------------------------------------------------------------------------
// Opaque vault references (the ONLY lawful secret reference)
// ---------------------------------------------------------------------------

/** Build a validated opaque vault reference (the non-custody seam). */
export function opaqueCredentialRef(input: {
  readonly vault: string;
  readonly ref: string;
  readonly purpose?: string;
}): OpaqueCredentialRef {
  if (input.vault.length === 0) {
    throw new ValidationError("opaque credential ref requires a non-empty vault id");
  }
  if (input.ref.length === 0) {
    throw new ValidationError("opaque credential ref requires a non-empty vault ref");
  }
  return Object.freeze({
    kind: "vault_ref",
    vault: input.vault,
    ref: input.ref,
    ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
  });
}

/** Type predicate: is this value an opaque vault reference? */
export function isOpaqueCredentialRef(value: unknown): value is OpaqueCredentialRef {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<OpaqueCredentialRef>;
  return (
    record.kind === "vault_ref" &&
    typeof record.vault === "string" &&
    record.vault.length > 0 &&
    typeof record.ref === "string" &&
    record.ref.length > 0
  );
}
