/**
 * @payswap/route-compiler — the auditable-assumption contracts (P5-W1).
 *
 * NET-NEW as a first-class contract (the fifth comparability requirement
 * of the P5-W1 law: "auditable assumptions"): composed/multi-provider
 * routes are comparable only when EVERY leg carries auditable
 * assumptions — explicit, versioned, evidence-referenced statements of
 * what the plan ASSUMES to hold at execution time.
 *
 * The old compiler embedded assumptions implicitly in quotes (slippage,
 * time-to-settlement) and routing hints; the rebuild surfaces them as a
 * typed, closed record per leg so the gate can require them and the
 * evidence record can carry them. An assumption is DATA:
 * - `assumptionId` — deterministic identity (evidence-addressable);
 * - `basis` — the closed basis vocabulary: a quote disclosure, a declared
 *   conversion, a declared corridor term, an observation freshness bound,
 *   or a routing hint;
 * - `statement` — the human-auditable text of what is assumed;
 * - `evidenceRefs` — NON-EMPTY (an unevidenced assumption is unauditable,
 *   INV-E02);
 * - `assumedValidUntil` — the honest expiry of the assumption (strict
 *   ISO-8601 UTC data, never a clock read).
 *
 * Liquidity estimates may GROUND an assumption (DEPTH basis) but never
 * become custody or authorization — see liquidity.ts (advisory-only law).
 */

import { InvalidRouteLegContractError } from "./errors.ts";
import { epochMillisFromIso, isIsoUtcTimestamp } from "./canonical-time.ts";
import { deepFreeze, requireBoundedString, requireNonEmptyStringArray, requireObject, LIMITS, type Fail } from "./canonical.ts";

const fail: Fail = (message: string) => new InvalidRouteLegContractError(message);

/** The closed assumption-basis vocabulary (frozen). */
export const ASSUMPTION_BASES = Object.freeze([
  "QUOTE_DISCLOSURE",
  "DECLARED_CONVERSION",
  "CORRIDOR_TERMS",
  "OBSERVATION_FRESHNESS",
  "ROUTING_HINT",
  "LIQUIDITY_DEPTH",
] as const);

export type AssumptionBasis = (typeof ASSUMPTION_BASES)[number];

/** One auditable assumption: basis + statement + evidence + expiry. */
export interface AuditableAssumption {
  readonly assumptionId: string;
  readonly basis: AssumptionBasis;
  readonly statement: string;
  /** NON-EMPTY: an unevidenced assumption is unauditable (INV-E02). */
  readonly evidenceRefs: readonly string[];
  /** The honest expiry of the assumption (strict ISO-8601 UTC, data). */
  readonly assumedValidUntil: string;
}

/** True iff the value is a member of the closed basis vocabulary. */
export function isAssumptionBasis(value: unknown): value is AssumptionBasis {
  return typeof value === "string" && (ASSUMPTION_BASES as readonly unknown[]).includes(value);
}

/** Fail-closed validation of one auditable assumption. */
export function validateAuditableAssumption(candidate: unknown): AuditableAssumption {
  const record = requireObject(candidate, "an AuditableAssumption", fail);
  const assumptionId = requireBoundedString(
    record["assumptionId"],
    "assumption.assumptionId",
    LIMITS.refMaxLength,
    fail,
  );
  const basis = record["basis"];
  if (!isAssumptionBasis(basis)) {
    throw fail(
      `assumption.basis must be one of the closed vocabulary [${ASSUMPTION_BASES.join(", ")}]`,
    );
  }
  const statement = requireBoundedString(
    record["statement"],
    "assumption.statement",
    LIMITS.descriptionMaxLength,
    fail,
  );
  const evidenceRefs = requireNonEmptyStringArray(
    record["evidenceRefs"],
    "assumption.evidenceRefs",
    fail,
  );
  const assumedValidUntil = record["assumedValidUntil"];
  if (typeof assumedValidUntil !== "string" || !isIsoUtcTimestamp(assumedValidUntil)) {
    throw fail("assumption.assumedValidUntil must be a strict ISO-8601 UTC timestamp (data, never a clock read)");
  }
  return deepFreeze({ assumptionId, basis, statement, evidenceRefs, assumedValidUntil });
}

/** Fail-closed validation of a leg's assumption set (all-or-throw). */
export function validateAssumptionSet(
  candidates: readonly unknown[],
): readonly AuditableAssumption[] {
  return Object.freeze(candidates.map((candidate) => validateAuditableAssumption(candidate)));
}

/** Deterministic assumption ordering (by assumptionId — the replay law). */
export function sortedAssumptions(
  assumptions: readonly AuditableAssumption[],
): readonly AuditableAssumption[] {
  return [...assumptions].sort((left, right) =>
    left.assumptionId < right.assumptionId ? -1 : left.assumptionId > right.assumptionId ? 1 : 0,
  );
}

/**
 * True iff every assumption of the set is still valid at the given
 * instant (caller-supplied `at`, strict ISO civil arithmetic — no
 * platform Date parser anywhere). An expired assumption makes the leg's
 * assumption set STALE — an honest gap for the comparability gate, never
 * a silent pass.
 */
export function assumptionsValidAt(
  assumptions: readonly AuditableAssumption[],
  atMs: number,
): boolean {
  for (const assumption of assumptions) {
    const untilMs = epochMillisFromIso(assumption.assumedValidUntil);
    if (atMs > untilMs) {
      return false;
    }
  }
  return true;
}
