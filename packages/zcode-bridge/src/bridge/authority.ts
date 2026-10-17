/**
 * Bridge implementation: authority boundary enforcement (P3-W3).
 *
 * The never-financial-authority law made executable:
 * - the single frozen AuthorityBoundary record every observation stamps;
 * - the advisory lint over capability descriptions (whole-word,
 *   case-insensitive matching against FORBIDDEN_FINANCIAL_AUTHORITY_TERMS);
 * - the ZcodeBridgeSurfaceObservation validator (the observation itself is
 *   data crossing this boundary — it must obey the same law it describes).
 */

import { IssueCollector } from "../errors.ts";
import { isNonEmptyString, isRecord, isStringArray } from "../shared.ts";
import {
  BRIDGE_AUTHORITY_DOMAIN,
  FORBIDDEN_FINANCIAL_AUTHORITY_TERMS,
} from "../wire/authority.ts";
import type {
  AuthorityBoundary,
  ZcodeBridgeSurfaceClassification,
  ZcodeBridgeSurfaceObservation,
} from "../wire/authority.ts";
import { SUBSTRATE_PIN, ZCODE_BRIDGE_VERSION } from "../version.ts";

/** The one authority boundary this bridge can ever state (frozen). */
export const SUBSTRATE_AUTHORITY_BOUNDARY: AuthorityBoundary = Object.freeze({
  domain: BRIDGE_AUTHORITY_DOMAIN,
  financialAuthority: false,
  applicationPermissionOnly: true,
  law: "no_parallel_financial_authority",
});

/**
 * Structural guard for the authority boundary: domain must be SUBSTRATE,
 * financialAuthority literally false, applicationPermissionOnly literally
 * true, and the law citation exact. A record claiming anything else is not
 * an AuthorityBoundary — financial authority is unrepresentable.
 */
export function isAuthorityBoundary(candidate: unknown): candidate is AuthorityBoundary {
  if (!isRecord(candidate)) return false;
  return (
    candidate.domain === BRIDGE_AUTHORITY_DOMAIN &&
    candidate.financialAuthority === false &&
    candidate.applicationPermissionOnly === true &&
    candidate.law === "no_parallel_financial_authority"
  );
}

/** Whole-word, case-insensitive term match (no stems — "network" is safe). */
function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, "i");
  return pattern.test(text);
}

/**
 * Find every forbidden financial-authority term present in a candidate
 * capability/description text (advisory lint — deterministic, pure).
 * Returns the matched terms in vocabulary order; empty when clean.
 */
export function findFinancialAuthorityTerms(text: string): readonly string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const found: string[] = [];
  for (const term of FORBIDDEN_FINANCIAL_AUTHORITY_TERMS) {
    if (containsTerm(text, term)) {
      found.push(term);
    }
  }
  return Object.freeze(found);
}

/**
 * Assert that a capability description carries NO financial-authority
 * semantics. Throws a plain Error naming the offending terms — the bridge
 * describes substrate capabilities; it must never claim the power to
 * authorize, settle, capture, refund, or hold custody.
 */
export function assertNoFinancialAuthoritySemantics(
  text: string,
  subject = "capability description",
): void {
  const found = findFinancialAuthorityTerms(text);
  if (found.length > 0) {
    throw new Error(
      `${subject} carries forbidden financial-authority semantics: ${found.join(", ")} — the bridge never holds financial authority (no_parallel_financial_authority)`,
    );
  }
}

const CLASSIFICATIONS: readonly ZcodeBridgeSurfaceClassification[] = [
  "KEEP",
  "KEEP_WITH_ADAPTATIONS",
];

/**
 * Validate and freeze a bridged surface observation: unique kebab-case id,
 * non-empty title, classification under the migration map's law, at least
 * one source path (each a non-empty repo-relative string), non-empty
 * capability descriptions (each free of financial-authority semantics),
 * the exact SUBSTRATE authority boundary, the exact substrate pin and
 * bridge version, and — for KEEP_WITH_ADAPTATIONS — at least one
 * adaptation note. Invalid input throws a plain Error.
 */
export function validateZcodeBridgeSurfaceObservation(
  candidate: unknown,
): ZcodeBridgeSurfaceObservation {
  const issues = new IssueCollector();
  if (!isRecord(candidate)) {
    throw new Error("Invalid zcode bridge surface observation: must be an object");
  }
  if (!isNonEmptyString(candidate.surfaceId)) {
    issues.add("surfaceId", "must be a non-empty string");
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(candidate.surfaceId)) {
    issues.add("surfaceId", "must be kebab-case");
  }
  issues.requireNonEmptyString("title", candidate.title);
  if (
    typeof candidate.classification !== "string" ||
    !CLASSIFICATIONS.includes(candidate.classification as ZcodeBridgeSurfaceClassification)
  ) {
    issues.add("classification", "must be KEEP or KEEP_WITH_ADAPTATIONS");
  }
  if (!isStringArray(candidate.sourcePaths) || candidate.sourcePaths.length === 0) {
    issues.add("sourcePaths", "must be a non-empty string array (repo-relative, verified on disk)");
  } else {
    for (const path of candidate.sourcePaths) {
      if (path.length === 0 || path.startsWith("/") || path.includes("..")) {
        issues.add("sourcePaths", `must be repo-relative without '..': ${path}`);
      }
    }
  }
  if (!isStringArray(candidate.capabilities) || candidate.capabilities.length === 0) {
    issues.add("capabilities", "must be a non-empty string array");
  } else {
    for (const capability of candidate.capabilities) {
      const found = findFinancialAuthorityTerms(capability);
      if (found.length > 0) {
        issues.add(
          "capabilities",
          `capability '${capability}' carries forbidden financial-authority terms: ${found.join(", ")}`,
        );
      }
    }
  }
  if (!isAuthorityBoundary(candidate.authority)) {
    issues.add(
      "authority",
      "must be the exact SUBSTRATE boundary (domain SUBSTRATE; financialAuthority false; applicationPermissionOnly true; law no_parallel_financial_authority)",
    );
  }
  if (candidate.substratePin !== SUBSTRATE_PIN) {
    issues.add("substratePin", `must be the pinned substrate commit ${SUBSTRATE_PIN}`);
  }
  if (candidate.bridgeVersion !== ZCODE_BRIDGE_VERSION) {
    issues.add("bridgeVersion", `must be the bridge contract version ${ZCODE_BRIDGE_VERSION}`);
  }
  if (candidate.classification === "KEEP_WITH_ADAPTATIONS") {
    if (!isStringArray(candidate.adaptationNotes) || candidate.adaptationNotes.length === 0) {
      issues.add("adaptationNotes", "required (at least one) when classification is KEEP_WITH_ADAPTATIONS");
    }
  }
  if (!isStringArray(candidate.notes)) {
    issues.add("notes", "must be a string array (possibly empty)");
  }
  issues.throwIfAny("zcode bridge surface observation");

  const record = candidate as unknown as ZcodeBridgeSurfaceObservation;
  return Object.freeze({
    surfaceId: record.surfaceId,
    title: record.title,
    classification: record.classification,
    sourcePaths: Object.freeze([...record.sourcePaths]),
    capabilities: Object.freeze([...record.capabilities]),
    authority: SUBSTRATE_AUTHORITY_BOUNDARY,
    substratePin: record.substratePin,
    bridgeVersion: record.bridgeVersion,
    adaptationNotes: Object.freeze([...(record.adaptationNotes ?? [])]),
    notes: Object.freeze([...(record.notes ?? [])]),
  });
}

/** Structural guard: a valid, frozen surface observation. */
export function isZcodeBridgeSurfaceObservation(
  candidate: unknown,
): candidate is ZcodeBridgeSurfaceObservation {
  try {
    validateZcodeBridgeSurfaceObservation(candidate);
    return Object.isFrozen(candidate);
  } catch {
    return false;
  }
}
