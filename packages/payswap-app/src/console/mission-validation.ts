/**
 * @payswap/app — the mission intake structural validation
 * (CONSOLE-WORKSPACE.md §3 validation law).
 *
 * Fail-closed, deterministic, no ambient state: the AmountSpec law is
 * enforced exactly (currency /^[A-Z]{3}$/, canonical non-negative
 * decimal integer minorUnits), trimmed-length bounds are enforced per
 * field, and an unknown direction is a finding (never silently
 * coerced). The finding STRINGS are this module's human wording of the
 * pinned rules — the UI renders whatever findings the validator returns
 * VERBATIM, so the words users read are the words tested here and
 * recorded in the contract fixture.
 */

import type { MissionIntakeInput, MissionIntentDirection } from "./contracts.js";

/** The pinned intake bounds (§3 field contracts). */
export const MISSION_INTAKE_LIMITS = {
  goalStatementMax: 2000,
  locationHintMax: 200,
  noteMax: 2000,
} as const;

/** The AmountSpec wire law (surface AmountSpec, enforced exactly). */
export const AMOUNT_CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const AMOUNT_MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

/** The four pinned intent directions (unknown is a finding). */
export const MISSION_INTENT_DIRECTIONS: readonly MissionIntentDirection[] = [
  "PAY",
  "RECEIVE",
  "MOVE",
  "CONVERT",
];

/** Goal statement: non-empty after trim, at most 2000 characters. */
export const GOAL_REQUIRED_FINDING =
  "The goal statement is required — it must not be empty after trimming.";
export const GOAL_TOO_LONG_FINDING =
  "The goal statement exceeds the 2000-character limit.";

/** Direction: one of the four pinned literals. */
export const DIRECTION_UNKNOWN_FINDING =
  "The direction must be one of PAY, RECEIVE, MOVE or CONVERT.";

/** Amount (optional): the AmountSpec law when present. */
export const AMOUNT_CURRENCY_FINDING =
  "The amount currency must be a three-letter uppercase code (for example USD).";
export const AMOUNT_MINOR_UNITS_FINDING =
  "The amount minor units must be a canonical non-negative decimal integer (digits only, no sign, no decimal point, no leading zero).";

/** Location hints (optional): at most 200 characters each. */
export const FUNDING_HINT_TOO_LONG_FINDING =
  "The funding location hint exceeds the 200-character limit.";
export const PAYOUT_HINT_TOO_LONG_FINDING =
  "The payout location hint exceeds the 200-character limit.";

/** Note (optional): at most 2000 characters. */
export const NOTE_TOO_LONG_FINDING =
  "The note exceeds the 2000-character limit.";

/**
 * validateMissionIntake (§3): the structural gate every recorded intake
 * must pass. Returns ok=true with no findings, or ok=false with every
 * finding (deterministic order: goal, direction, amount, hints, note).
 */
export function validateMissionIntake(
  input: MissionIntakeInput,
): { readonly ok: boolean; readonly findings: readonly string[] } {
  const findings: string[] = [];
  const goal = input.goalStatement.trim();
  if (goal.length === 0) {
    findings.push(GOAL_REQUIRED_FINDING);
  } else if (goal.length > MISSION_INTAKE_LIMITS.goalStatementMax) {
    findings.push(GOAL_TOO_LONG_FINDING);
  }
  if (!MISSION_INTENT_DIRECTIONS.includes(input.direction)) {
    findings.push(DIRECTION_UNKNOWN_FINDING);
  }
  if (input.amount !== undefined) {
    if (!AMOUNT_CURRENCY_PATTERN.test(input.amount.currency)) {
      findings.push(AMOUNT_CURRENCY_FINDING);
    }
    if (!AMOUNT_MINOR_UNITS_PATTERN.test(input.amount.minorUnits)) {
      findings.push(AMOUNT_MINOR_UNITS_FINDING);
    }
  }
  if (
    input.fundingLocationHint !== undefined &&
    input.fundingLocationHint.trim().length > MISSION_INTAKE_LIMITS.locationHintMax
  ) {
    findings.push(FUNDING_HINT_TOO_LONG_FINDING);
  }
  if (
    input.payoutLocationHint !== undefined &&
    input.payoutLocationHint.trim().length > MISSION_INTAKE_LIMITS.locationHintMax
  ) {
    findings.push(PAYOUT_HINT_TOO_LONG_FINDING);
  }
  if (
    input.note !== undefined &&
    input.note.trim().length > MISSION_INTAKE_LIMITS.noteMax
  ) {
    findings.push(NOTE_TOO_LONG_FINDING);
  }
  return { ok: findings.length === 0, findings };
}
