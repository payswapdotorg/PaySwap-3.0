/**
 * Bridge implementation: runtime IDs (P3-W3).
 *
 * The substrate's ID prefix law as pure functions: format a kind-prefixed
 * ID from an explicit suffix (no randomness — the accepted surface/capability
 * determinism discipline), parse one back, and structural guards. The
 * substrate generates suffixes with crypto; PaySwap callers supply their
 * own uniqueness as DATA.
 */

import { IssueCollector } from "../errors.ts";
import { isNonEmptyString } from "../shared.ts";
import { RUNTIME_ID_KINDS, RUNTIME_ID_PREFIXES } from "../wire/ids.ts";
import type { RuntimeIdKind, RuntimeIdParts } from "../wire/ids.ts";

/**
 * Format a runtime ID: `prefix + suffix` where the prefix is the
 * substrate's exact prefix for the kind (sess_, turn_, evt_, ...). The
 * suffix must be a non-empty string without whitespace.
 */
export function formatRuntimeId(kind: RuntimeIdKind, suffix: string): string {
  if (!RUNTIME_ID_KINDS.includes(kind)) {
    throw new Error(`formatRuntimeId: unknown runtime id kind ${JSON.stringify(kind)}`);
  }
  if (!isNonEmptyString(suffix)) {
    throw new Error("formatRuntimeId: suffix must be a non-empty string");
  }
  if (/\s/.test(suffix)) {
    throw new Error("formatRuntimeId: suffix must not contain whitespace");
  }
  return `${RUNTIME_ID_PREFIXES[kind]}${suffix}`;
}

/** Structural guard: a valid runtime ID of ANY pinned kind. */
export function isRuntimeId(candidate: unknown): candidate is string {
  if (!isNonEmptyString(candidate)) return false;
  return runtimeIdKindOf(candidate) !== undefined;
}

/** Structural guard: a runtime ID of one specific kind. */
export function isRuntimeIdOfKind(
  candidate: unknown,
  kind: RuntimeIdKind,
): candidate is string {
  return isRuntimeId(candidate) && candidate.startsWith(RUNTIME_ID_PREFIXES[kind]);
}

/**
 * Determine the kind of a runtime ID by prefix. Returns undefined when no
 * pinned prefix matches.
 */
export function runtimeIdKindOf(candidate: string): RuntimeIdKind | undefined {
  if (!isNonEmptyString(candidate)) return undefined;
  for (const kind of RUNTIME_ID_KINDS) {
    if (candidate.startsWith(RUNTIME_ID_PREFIXES[kind])) {
      return kind;
    }
  }
  return undefined;
}

/**
 * Parse a runtime ID into its parts. Throws a plain Error when the value
 * does not carry a pinned prefix, has an empty suffix, or contains
 * whitespace in the suffix.
 */
export function parseRuntimeId(candidate: string): RuntimeIdParts {
  const issues = new IssueCollector();
  const kind = runtimeIdKindOf(candidate);
  if (kind === undefined) {
    throw new Error(
      `parseRuntimeId: '${candidate}' does not carry a pinned runtime id prefix (${RUNTIME_ID_KINDS.map((k) => RUNTIME_ID_PREFIXES[k]).join(", ")})`,
    );
  }
  const prefix = RUNTIME_ID_PREFIXES[kind];
  const suffix = candidate.slice(prefix.length);
  issues.requireNonEmptyString("suffix", suffix);
  if (/\s/.test(suffix)) {
    issues.add("suffix", "must not contain whitespace");
  }
  issues.throwIfAny("runtime id");
  return Object.freeze({ kind, prefix, suffix });
}
