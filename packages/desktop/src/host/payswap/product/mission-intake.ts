/**
 * PaySwap Desktop (P10-B) — the console mission-intake folds.
 *
 * Pure, deterministic folds over the structurally pinned console
 * workspace mission vocabulary (pins/mission-intake-pins.ts mirrors
 * spec/surface/CONSOLE-WORKSPACE.md §3/§4 byte-exact):
 *
 * - validatePinnedMissionIntake: the §3 fail-closed structural validation
 *   law (trimmed-length bounds per field; the AmountSpec law enforced
 *   exactly; unknown direction is a FINDING, never silently coerced);
 * - foldPinnedMissionLadder: the §4 lifecycle ladder with the VERBATIM
 *   typed-prerequisite strings (pinned constants) — INTENT is REACHED
 *   exactly when the intent was recorded (status INTENT_RECORDED, or
 *   ARCHIVED preserving the rungs reached at archive time, derived from
 *   the append-only event history); every other rung renders its typed
 *   prerequisite — no client component, model, tool permission or
 *   simulated result may mark a rung reached;
 * - pinnedMissionSummaryOf: the §3 summary projection of one record.
 *
 * The store built on these folds holds DEMAND-SIDE INTENT ONLY — never
 * financial truth, never authorization, never capability state.
 */

import {
  isPinnedMissionIntentDirection,
  isPinnedMissionDraftStatus,
  isPinnedMissionEventKind,
  PINNED_LADDER_PREREQUISITES,
  PINNED_MISSION_INTAKE_BOUNDS,
  PINNED_CURRENCY_PATTERN,
  PINNED_MINOR_UNITS_PATTERN,
} from "../pins/index.js";
import type {
  PinnedAmountSpec,
  PinnedMissionIntakeInput,
  PinnedMissionRecord,
  PinnedMissionRungState,
  PinnedMissionStructuralValidation,
  PinnedMissionSummary,
  PinnedMissionLifecycleRung,
} from "../pins/index.js";

// ---------------------------------------------------------------------------
// Structural validation (§3 law — fail-closed, total, deterministic)
// ---------------------------------------------------------------------------

/** The AmountSpec law as a finding (mirrors the pinned surface wire form). */
function amountSpecFindings(amount: unknown, findings: string[]): void {
  if (amount === null || typeof amount !== "object") {
    findings.push("amount: must be an AmountSpec object when present");
    return;
  }
  const candidate = amount as Partial<PinnedAmountSpec>;
  if (
    typeof candidate.currency !== "string" ||
    !PINNED_CURRENCY_PATTERN.test(candidate.currency)
  ) {
    findings.push("amount.currency: must match /^[A-Z]{3}$/ (an ISO-4217-style code)");
  }
  if (
    typeof candidate.minorUnits !== "string" ||
    !PINNED_MINOR_UNITS_PATTERN.test(candidate.minorUnits)
  ) {
    findings.push(
      "amount.minorUnits: must be a canonical non-negative decimal integer string (exact minor units)",
    );
  }
}

/** The optional trimmed-length bound law for one free-text field. */
function optionalTextFinding(
  fieldName: string,
  value: unknown,
  maxLength: number,
  findings: string[],
): void {
  if (value === undefined) return;
  if (typeof value !== "string") {
    findings.push(`${fieldName}: must be a string when present`);
    return;
  }
  if (value.trim().length > maxLength) {
    findings.push(`${fieldName}: longer than ${maxLength} characters after trim`);
  }
}

/**
 * The §3 structural validation of a mission intake. Fail-closed and
 * total: every violation becomes a human-readable finding; nothing is
 * coerced, defaulted or dropped. Findings are empty exactly when ok.
 */
export function validatePinnedMissionIntake(
  intake: PinnedMissionIntakeInput,
): PinnedMissionStructuralValidation {
  const findings: string[] = [];
  if (intake === null || typeof intake !== "object") {
    return {
      ok: false,
      findings: ["intake: must be a MissionIntakeInput object"],
    };
  }
  const input = intake as Partial<PinnedMissionIntakeInput>;

  if (typeof input.goalStatement !== "string" || input.goalStatement.trim().length === 0) {
    findings.push("goalStatement: must be non-empty after trim");
  } else if (input.goalStatement.trim().length > PINNED_MISSION_INTAKE_BOUNDS.goalStatementMaxLength) {
    findings.push(
      `goalStatement: longer than ${PINNED_MISSION_INTAKE_BOUNDS.goalStatementMaxLength} characters after trim`,
    );
  }

  if (!isPinnedMissionIntentDirection(input.direction)) {
    findings.push(
      `direction: must be one of PAY | RECEIVE | MOVE | CONVERT — got ${JSON.stringify(input.direction)}`,
    );
  }

  if (input.amount !== undefined) {
    amountSpecFindings(input.amount, findings);
  }

  optionalTextFinding(
    "fundingLocationHint",
    input.fundingLocationHint,
    PINNED_MISSION_INTAKE_BOUNDS.locationHintMaxLength,
    findings,
  );
  optionalTextFinding(
    "payoutLocationHint",
    input.payoutLocationHint,
    PINNED_MISSION_INTAKE_BOUNDS.locationHintMaxLength,
    findings,
  );
  optionalTextFinding("note", input.note, PINNED_MISSION_INTAKE_BOUNDS.noteMaxLength, findings);

  return { ok: findings.length === 0, findings };
}

// ---------------------------------------------------------------------------
// Lifecycle ladder (§4 law — typed prerequisites, verbatim)
// ---------------------------------------------------------------------------

/**
 * Was the intent rung reached for this record? The §4 law: INTENT is
 * REACHED exactly when status === "INTENT_RECORDED" — or "ARCHIVED",
 * which PRESERVES the rungs reached at archive time. The append-only
 * event history is the record's memory of that fact: an INTENT_VALIDATED
 * event exists exactly when the intent-review step ever passed.
 */
export function pinnedMissionIntentReached(record: PinnedMissionRecord): boolean {
  if (record.status === "INTENT_RECORDED") return true;
  return (
    record.status === "ARCHIVED" &&
    record.events.some((event) => event.kind === "INTENT_VALIDATED")
  );
}

/**
 * The §4 ladder fold: INTENT per the reached law above; every other rung
 * renders NOT_REACHED_PREREQUISITE with the VERBATIM pinned string. The
 * returned order follows the pinned lifecycle-rung order (the authority
 * chain of AGENTS.md rendered honestly).
 */
export function foldPinnedMissionLadder(record: PinnedMissionRecord): readonly PinnedMissionRungState[] {
  const intentReached = pinnedMissionIntentReached(record);
  return PINNED_LADDER_PREREQUISITES_ORDER.map((rung) => {
    if (rung === "INTENT" && intentReached) {
      return { rung: "INTENT", state: "REACHED" } as const;
    }
    return {
      rung,
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: PINNED_LADDER_PREREQUISITES[rung],
    } as const;
  });
}

/** The ladder order (pinned; mirrors the §4 chain). */
const PINNED_LADDER_PREREQUISITES_ORDER: readonly PinnedMissionLifecycleRung[] = [
  "INTENT",
  "ELIGIBILITY",
  "PLANNING",
  "APPROVAL",
  "EXECUTION",
  "OBSERVATION",
  "EVIDENCE",
];

// ---------------------------------------------------------------------------
// Summary projection (§3)
// ---------------------------------------------------------------------------

/** The §3 summary projection of one mission record. */
export function pinnedMissionSummaryOf(record: PinnedMissionRecord): PinnedMissionSummary {
  return {
    id: record.id,
    goalStatement: record.intake.goalStatement,
    direction: record.intake.direction,
    ...(record.intake.amount !== undefined ? { amount: record.intake.amount } : {}),
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Persisted-record structural guard (the persistence quarantine basis)
// ---------------------------------------------------------------------------

/**
 * Structural check of a persisted mission record (the load path): a
 * record that fails ANY check is quarantined — never rendered as a
 * mission, never silently dropped. Returns the typed finding on failure.
 */
export function pinnedMissionRecordStructureFinding(record: unknown): string | null {
  if (record === null || typeof record !== "object") {
    return "record is not an object";
  }
  const candidate = record as Partial<PinnedMissionRecord>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return "record.id is not a non-empty string";
  }
  if (typeof candidate.createdAt !== "string" || candidate.createdAt.length === 0) {
    return "record.createdAt is not a non-empty string";
  }
  if (typeof candidate.updatedAt !== "string" || candidate.updatedAt.length === 0) {
    return "record.updatedAt is not a non-empty string";
  }
  if (!isPinnedMissionDraftStatus(candidate.status)) {
    return "record.status is not a pinned MissionDraftStatus";
  }
  if (candidate.intake === null || typeof candidate.intake !== "object") {
    return "record.intake is not an object";
  } else {
    const intake = candidate.intake as Partial<PinnedMissionIntakeInput>;
    if (typeof intake.goalStatement !== "string") {
      return "record.intake.goalStatement is not a string";
    }
    if (!isPinnedMissionIntentDirection(intake.direction)) {
      return "record.intake.direction is not a pinned MissionIntentDirection";
    }
    if (intake.amount !== undefined && (intake.amount === null || typeof intake.amount !== "object")) {
      return "record.intake.amount is not an AmountSpec object";
    }
  }
  const validation = candidate.structuralValidation;
  if (
    validation === null ||
    typeof validation !== "object" ||
    typeof validation.ok !== "boolean" ||
    !Array.isArray(validation.findings) ||
    validation.findings.some((finding) => typeof finding !== "string")
  ) {
    return "record.structuralValidation is malformed";
  }
  if (!Array.isArray(candidate.events)) {
    return "record.events is not an array";
  }
  for (const event of candidate.events) {
    if (
      event === null ||
      typeof event !== "object" ||
      typeof (event as Partial<{ id: string; at: string; summary: string }>).id !== "string" ||
      typeof (event as Partial<{ id: string; at: string; summary: string }>).at !== "string" ||
      typeof (event as Partial<{ id: string; at: string; summary: string }>).summary !==
        "string" ||
      !isPinnedMissionEventKind((event as Partial<{ kind: unknown }>).kind)
    ) {
      return "record.events contains a malformed event";
    }
  }
  return null;
}
