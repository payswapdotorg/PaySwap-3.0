/**
 * @payswap/opportunities — the honest NON-OPERATOR classifications + the
 * catalogue TOTALITY law (P23-A, lane A; ADR-0015 D2/A.4): the codes that
 * are honestly NOT repairs carry explicit rows with frozen reasons,
 * machine-checked total over the pinned 26-code corridor exclusion
 * vocabulary. Split from ./repair-operators.ts under the 400-line file law
 * (the ./conditional-publication.ts precedent): the two tables are one
 * law — every code has EXACTLY ONE home.
 *
 * The classifications are DATA for the presenting tier (the wait-recheck
 * plane, the intake ask loop, the revise path) — none of them is a repair
 * card, and none of them is a party or platform precondition.
 */

import { ValidationError } from "./errors.ts";
import { PINNED_CORRIDOR_EXCLUSION_CODES } from "./pins/capability.ts";
import type { PinnedCorridorExclusionCode } from "./pins/capability.ts";
import { PLATFORM_GAP_IDS, REPAIR_OPERATORS, isRepairOperatorKind } from "./repair-operators.ts";
import { RepairCatalogueError } from "./repair-facts.ts";
import type { RepairOperator } from "./repair-operators.ts";
import { CONDITIONAL_PARTY_CHANGES } from "./conditional.ts";

/**
 * The closed non-operator classification kinds (frozen): where an honest
 * non-repair belongs instead of a repair card.
 */
export const NON_OPERATOR_CLASSIFICATION_KINDS = Object.freeze([
  "RECHECK_TRIGGER",
  "WAIT_TRIGGER",
  "INTAKE_ASK",
  "REVISE_PATH",
] as const);
export type NonOperatorClassificationKind = (typeof NON_OPERATOR_CLASSIFICATION_KINDS)[number];

/**
 * One honest non-repair row: the code, its classification kind and the
 * frozen reason it is not a repair (never a backlog fabrication, never a
 * silent drop).
 */
export interface NonOperatorClassification {
  readonly code: PinnedCorridorExclusionCode;
  readonly classification: NonOperatorClassificationKind;
  readonly reason: string;
}

/**
 * The frozen 10-entry non-operator table (ADR-0015 A.4, as amended
 * 2026-10-29 — OBSERVATION_NOT_ELIGIBLE joins the recheck triggers and
 * INSTANCE_GEOGRAPHY_NOT_SERVED / INSTANCE_CURRENCY_NOT_SUPPORTED join
 * platform:provider-integration, so the operator set is 16 and this table
 * is exactly 10: 26 total, the totality law exact).
 */
export const NON_OPERATOR_CLASSIFICATIONS: readonly NonOperatorClassification[] = Object.freeze([
  Object.freeze({
    code: "STALE_OBSERVATION",
    classification: "RECHECK_TRIGGER",
    reason: "the observation's freshness window has passed — the honest response is a fresh observation on the wait-recheck plane, never a repair card",
  }),
  Object.freeze({
    code: "AVAILABILITY_UNKNOWN",
    classification: "RECHECK_TRIGGER",
    reason: "the source was unreachable or reported unknown — the two-axis availability law keeps UNKNOWN distinct from failure; re-observe, never guess",
  }),
  Object.freeze({
    code: "OBSERVATION_ELIGIBILITY_UNKNOWN",
    classification: "RECHECK_TRIGGER",
    reason: "the observation could not establish eligibility — the fact belongs to the observation plane; re-observe, never a party or platform repair",
  }),
  Object.freeze({
    code: "OBSERVATION_NOT_ELIGIBLE",
    classification: "RECHECK_TRIGGER",
    reason: "the observation itself reported not-eligible — a verdict about the observation plane, so the honest response is a recheck with fresh evidence, never a repair card",
  }),
  Object.freeze({
    code: "AVAILABILITY_UNAVAILABLE",
    classification: "WAIT_TRIGGER",
    reason: "the capability is presently unavailable — bounded in time; wait and re-evaluate, never a repair card",
  }),
  Object.freeze({
    code: "QUOTA_EXHAUSTED",
    classification: "WAIT_TRIGGER",
    reason: "the quota is exhausted — replenishment is bounded in time; wait and re-evaluate, never a repair card",
  }),
  Object.freeze({
    code: "CUTOFF_PASSED",
    classification: "WAIT_TRIGGER",
    reason: "the processing cutoff has passed for this window — the next window opens in time; wait and re-evaluate, never a repair card",
  }),
  Object.freeze({
    code: "AMOUNT_BELOW_MINIMUM",
    classification: "WAIT_TRIGGER",
    reason: "the amount is below the served minimum — a wait trigger bounded by the user's own next intent, never a party-change or platform repair",
  }),
  Object.freeze({
    code: "MISSING_REQUIRED_FIELDS",
    classification: "INTAKE_ASK",
    reason: "the corridor query lacked a declared required field — the intake ask loop supplies it; no repair is derivable from an incomplete query",
  }),
  Object.freeze({
    code: "AMOUNT_CURRENCY_MISMATCH",
    classification: "REVISE_PATH",
    reason: "the amount's currency disagrees with the corridor's currency — the revise path corrects the intent; no party or platform repair answers a malformed amount",
  }),
]);

// ---------------------------------------------------------------------------
// THE TOTALITY LAW (pure, machine-checked)
// ---------------------------------------------------------------------------

/**
 * THE totality check (pure): every one of the 26 pinned codes appears in
 * EXACTLY ONE place — at least one operator's `applicableExclusionCodes`,
 * or exactly one non-operator row — never both, never neither. The check
 * also verifies the catalogue's structural integrity (unique operator
 * ids; codes inside the pinned vocabulary in canonical order; partyChange
 * and platformGap members inside their vocabularies; `shadowedBy` naming
 * a real P21 operator). Returns the violation list — EMPTY iff the
 * catalogue is total and integral.
 */
export function catalogueTotalityViolations(): readonly string[] {
  const violations: string[] = [];
  const seenOperatorIds = new Set<string>();
  const operatorCodes = new Set<string>();
  const catalogueIds = new Set<string>();
  for (const entry of REPAIR_OPERATORS as readonly RepairOperator[]) {
    if (seenOperatorIds.has(entry.operatorId)) {
      violations.push(`duplicate operatorId '${entry.operatorId}'`);
    }
    seenOperatorIds.add(entry.operatorId);
    catalogueIds.add(entry.operatorId);
    if (!isRepairOperatorKind(entry.kind)) {
      violations.push(`operator '${entry.operatorId}' carries an unknown kind '${String(entry.kind)}'`);
    }
    let orderIndex = -1;
    for (const code of entry.applicableExclusionCodes) {
      const index = (PINNED_CORRIDOR_EXCLUSION_CODES as readonly string[]).indexOf(code);
      if (index < 0) {
        violations.push(`operator '${entry.operatorId}' carries the unpinned code '${code}'`);
        continue;
      }
      if (index <= orderIndex) {
        violations.push(`operator '${entry.operatorId}' carries '${code}' out of canonical pinned order`);
      }
      orderIndex = index;
      operatorCodes.add(code);
    }
    if (entry.partyChange !== undefined && !(CONDITIONAL_PARTY_CHANGES as readonly unknown[]).includes(entry.partyChange)) {
      violations.push(`operator '${entry.operatorId}' carries an unknown partyChange '${String(entry.partyChange)}'`);
    }
    if (entry.partyChange !== undefined && entry.kind !== "PARTY_CHANGE") {
      violations.push(`operator '${entry.operatorId}' carries a partyChange but is kind '${entry.kind}'`);
    }
    if (entry.platformGap !== undefined && !(PLATFORM_GAP_IDS as readonly unknown[]).includes(entry.platformGap)) {
      violations.push(`operator '${entry.operatorId}' carries an unknown platformGap '${String(entry.platformGap)}'`);
    }
    if (entry.kind === "PLATFORM_WORK" && entry.platformGap === undefined) {
      violations.push(`operator '${entry.operatorId}' is PLATFORM_WORK without a platformGap`);
    }
  }
  const nonOperatorCodes = new Map<string, number>();
  for (const row of NON_OPERATOR_CLASSIFICATIONS) {
    nonOperatorCodes.set(row.code, (nonOperatorCodes.get(row.code) ?? 0) + 1);
  }
  for (const code of PINNED_CORRIDOR_EXCLUSION_CODES) {
    const inOperators = operatorCodes.has(code);
    const nonOperatorRows = nonOperatorCodes.get(code) ?? 0;
    if (nonOperatorRows > 1) {
      violations.push(`code '${code}' carries ${String(nonOperatorRows)} non-operator rows (exactly one home)`);
    }
    if (inOperators && nonOperatorRows > 0) {
      violations.push(`code '${code}' is BOTH operator-applicable and non-operator classified (exactly one home)`);
    }
    if (!inOperators && nonOperatorRows === 0) {
      violations.push(`code '${code}' has NO home (neither an operator nor a non-operator row)`);
    }
  }
  for (const code of nonOperatorCodes.keys()) {
    if (!(PINNED_CORRIDOR_EXCLUSION_CODES as readonly string[]).includes(code)) {
      violations.push(`non-operator row carries the unpinned code '${code}'`);
    }
  }
  for (const entry of REPAIR_OPERATORS as readonly RepairOperator[]) {
    if (entry.shadowedBy !== undefined) {
      const shadower = (REPAIR_OPERATORS as readonly RepairOperator[]).find((candidate) => candidate.operatorId === entry.shadowedBy);
      if (shadower === undefined) {
        violations.push(`operator '${entry.operatorId}' is shadowedBy the unknown operator '${entry.shadowedBy}'`);
      } else if (!shadower.p21Specific) {
        violations.push(`operator '${entry.operatorId}' is shadowedBy the non-P21 operator '${entry.shadowedBy}'`);
      }
    }
  }
  return Object.freeze(violations);
}

/** Raised when the catalogue totality law is violated (the battery's gate). */
export class CatalogueTotalityError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "CatalogueTotalityError";
  }
}

/**
 * The assert form of the totality law: throws `CatalogueTotalityError`
 * naming every violation. Run by the battery; callable by any consumer
 * that wants the guarantee at boot.
 */
export function assertCatalogueTotality(): void {
  const violations = catalogueTotalityViolations();
  if (violations.length > 0) {
    throw new CatalogueTotalityError(
      `the repair-operator catalogue violates the totality law: ${violations.join("; ")}`,
      { errors: [...violations] },
    );
  }
}

/** Pure classification lookup: the non-operator row for a code, or null when the code's home is an operator (fail-closed on unpinned codes). */
export function nonOperatorClassificationOf(exclusionCode: string): NonOperatorClassification | null {
  if (!(PINNED_CORRIDOR_EXCLUSION_CODES as readonly string[]).includes(exclusionCode)) {
    throw new RepairCatalogueError(
      `exclusion code '${String(exclusionCode)}' is not one of the pinned 26 corridor exclusion codes — the classification table never guesses (fail closed)`,
    );
  }
  return NON_OPERATOR_CLASSIFICATIONS.find((row) => row.code === exclusionCode) ?? null;
}
