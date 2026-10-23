/**
 * @payswap/app — the console workspace LAW module (BROWSER_PROFILE).
 *
 * [P15 restoration] This module + its store lived in the web mount
 * (packages/web/src/payswap, P10-B) until the P15 strip unmounted the
 * product surfaces; both are restored INTO the product package so the
 * ZCode-shell console bridge owns its browser store without a
 * packages/web dependency. The laws are UNCHANGED (pinned §3/§4).
 *
 * The pure, deterministic mission-intake laws for the BROWSER_PROFILE
 * workspace store (spec/surface/CONSOLE-WORKSPACE.md §3/§4):
 *
 * - validateConsoleMissionIntake: the §3 fail-closed structural
 *   validation (trimmed-length bounds per field; the AmountSpec law
 *   enforced exactly; an unknown direction is a FINDING, never coerced);
 * - CONSOLE_LADDER_PREREQUISITES + foldConsoleMissionLadder: the §4
 *   lifecycle ladder — INTENT is REACHED exactly when the intent was
 *   recorded (status INTENT_RECORDED, or ARCHIVED preserving the rungs
 *   reached at archive time, derived from the append-only event
 *   history); every other rung renders its typed prerequisite VERBATIM;
 * - consoleMissionRecordStructureFinding: the persisted-record guard
 *   (the localStorage quarantine basis).
 *
 * The §4 strings are pinned CHARACTER-EXACT against
 * spec/surface/CONSOLE-WORKSPACE.md by
 * test/payswap/browserWorkspaceStore.test.ts (doc-parsing, fail-closed
 * on doc reformat) — restored alongside this module.
 *
 * The store built on these laws holds DEMAND-SIDE INTENT ONLY — never
 * financial truth, never authorization, never capability state
 * (AGENTS.md financial boundary; INV-1/INV-23).
 */

import type {
  MissionDraftStatus,
  MissionEvent,
  MissionIntakeInput,
  MissionLifecycleRung,
  MissionRecord,
  MissionRungState,
  MissionStructuralValidation,
  MissionSummary,
  MissionAmountSpec,
} from "./contracts.js";

// ---------------------------------------------------------------------------
// Closed vocabularies (§3 — structural, not exported as authority)
// ---------------------------------------------------------------------------

const MISSION_INTENT_DIRECTIONS = ["PAY", "RECEIVE", "MOVE", "CONVERT"] as const;
const MISSION_DRAFT_STATUSES = ["DRAFT", "INTENT_RECORDED", "ARCHIVED"] as const;
const MISSION_EVENT_KINDS = ["CREATED", "REVISED", "INTENT_VALIDATED", "ARCHIVED"] as const;

/** The §3 intake field bounds (trimmed-length law). */
export const CONSOLE_MISSION_INTAKE_BOUNDS = Object.freeze({
  goalStatementMaxLength: 2000,
  locationHintMaxLength: 200,
  noteMaxLength: 2000,
} as const);

/** The §4 ladder order (the authority chain of AGENTS.md). */
const LADDER_ORDER: readonly MissionLifecycleRung[] = [
  "INTENT",
  "ELIGIBILITY",
  "PLANNING",
  "APPROVAL",
  "EXECUTION",
  "OBSERVATION",
  "EVIDENCE",
];

// ---------------------------------------------------------------------------
// The §4 typed prerequisites — VERBATIM (character-exact, em-dashes)
// ---------------------------------------------------------------------------

/** The §4 INTENT prerequisite (when not reached), verbatim. */
export const CONSOLE_LADDER_INTENT_PREREQUISITE =
  "The intent has not been recorded yet — complete the intake review to record it." as const;

/** The §4 ELIGIBILITY prerequisite, verbatim. */
export const CONSOLE_LADDER_ELIGIBILITY_PREREQUISITE =
  "Capability discovery is not configured in this deployment. Missions cannot be evaluated for eligibility until a capability discovery plane exists — nothing here may guess eligibility." as const;

/** The §4 PLANNING prerequisite, verbatim. */
export const CONSOLE_LADDER_PLANNING_PREREQUISITE =
  "No planning plane is configured. Candidate plans are compiled by the economic execution graph when a planning plane exists; this deployment has none — the honest state is planning unavailable, never an invented plan." as const;

/** The §4 APPROVAL prerequisite, verbatim. */
export const CONSOLE_LADDER_APPROVAL_PREREQUISITE =
  "No approval plane is configured. Consequential actions require PaySwap authorization — material terms and authority scope — before execution; with no trust plane configured there is nothing to approve and nothing approved." as const;

/** The §4 EXECUTION prerequisite, verbatim. */
export const CONSOLE_LADDER_EXECUTION_PREREQUISITE =
  "No execution plane is configured. PaySwap never executes money movement from the console; execution requires the financial protocol with a connected capability, and no capability is connected in this deployment." as const;

/** The §4 OBSERVATION prerequisite, verbatim. */
export const CONSOLE_LADDER_OBSERVATION_PREREQUISITE =
  "No observations exist. Observations are provider-verified facts recorded by the execution plane; with no execution there is nothing to observe, and UNKNOWN is never rendered as success or failure." as const;

/** The §4 EVIDENCE prerequisite (the evidenceNote), verbatim. */
export const CONSOLE_LADDER_EVIDENCE_PREREQUISITE =
  "No evidence records exist. Evidence is produced by reconciliation of executed effects; no effect has been executed." as const;

/** Every §4 prerequisite, keyed by rung (closed; order follows the ladder). */
export const CONSOLE_LADDER_PREREQUISITES: Readonly<Record<MissionLifecycleRung, string>> =
  Object.freeze({
    INTENT: CONSOLE_LADDER_INTENT_PREREQUISITE,
    ELIGIBILITY: CONSOLE_LADDER_ELIGIBILITY_PREREQUISITE,
    PLANNING: CONSOLE_LADDER_PLANNING_PREREQUISITE,
    APPROVAL: CONSOLE_LADDER_APPROVAL_PREREQUISITE,
    EXECUTION: CONSOLE_LADDER_EXECUTION_PREREQUISITE,
    OBSERVATION: CONSOLE_LADDER_OBSERVATION_PREREQUISITE,
    EVIDENCE: CONSOLE_LADDER_EVIDENCE_PREREQUISITE,
  });

/** The honest BROWSER_PROFILE durability label (§5 adapter law). */
export const BROWSER_PROFILE_DURABILITY_NOTE = "stored in this browser profile only" as const;

// ---------------------------------------------------------------------------
// Structural validation (§3 law — fail-closed, total, deterministic)
// ---------------------------------------------------------------------------

function isIntentDirection(value: unknown): value is MissionIntakeInput["direction"] {
  return (
    typeof value === "string" && (MISSION_INTENT_DIRECTIONS as readonly unknown[]).includes(value)
  );
}

function isDraftStatus(value: unknown): value is MissionDraftStatus {
  return (
    typeof value === "string" && (MISSION_DRAFT_STATUSES as readonly unknown[]).includes(value)
  );
}

function isEventKind(value: unknown): value is MissionEvent["kind"] {
  return typeof value === "string" && (MISSION_EVENT_KINDS as readonly unknown[]).includes(value);
}

function amountSpecFindings(amount: unknown, findings: string[]): void {
  if (amount === null || typeof amount !== "object") {
    findings.push("amount: must be an AmountSpec object when present");
    return;
  }
  const candidate = amount as Partial<MissionAmountSpec>;
  if (typeof candidate.currency !== "string" || !/^[A-Z]{3}$/.test(candidate.currency)) {
    findings.push("amount.currency: must match /^[A-Z]{3}$/ (an ISO-4217-style code)");
  }
  if (typeof candidate.minorUnits !== "string" || !/^(0|[1-9][0-9]*)$/.test(candidate.minorUnits)) {
    findings.push(
      "amount.minorUnits: must be a canonical non-negative decimal integer string (exact minor units)",
    );
  }
}

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
export function validateConsoleMissionIntake(intake: MissionIntakeInput): MissionStructuralValidation {
  const findings: string[] = [];
  if (intake === null || typeof intake !== "object") {
    return { ok: false, findings: ["intake: must be a MissionIntakeInput object"] };
  }
  const input = intake as Partial<MissionIntakeInput>;

  if (typeof input.goalStatement !== "string" || input.goalStatement.trim().length === 0) {
    findings.push("goalStatement: must be non-empty after trim");
  } else if (input.goalStatement.trim().length > CONSOLE_MISSION_INTAKE_BOUNDS.goalStatementMaxLength) {
    findings.push(
      `goalStatement: longer than ${CONSOLE_MISSION_INTAKE_BOUNDS.goalStatementMaxLength} characters after trim`,
    );
  }

  if (!isIntentDirection(input.direction)) {
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
    CONSOLE_MISSION_INTAKE_BOUNDS.locationHintMaxLength,
    findings,
  );
  optionalTextFinding(
    "payoutLocationHint",
    input.payoutLocationHint,
    CONSOLE_MISSION_INTAKE_BOUNDS.locationHintMaxLength,
    findings,
  );
  optionalTextFinding("note", input.note, CONSOLE_MISSION_INTAKE_BOUNDS.noteMaxLength, findings);

  return { ok: findings.length === 0, findings };
}

// ---------------------------------------------------------------------------
// Lifecycle ladder (§4 law — typed prerequisites, verbatim)
// ---------------------------------------------------------------------------

/**
 * Was the intent rung reached for this record? §4: INTENT is REACHED
 * exactly when status === "INTENT_RECORDED" — or "ARCHIVED", which
 * PRESERVES the rungs reached at archive time (the append-only event
 * history is the record's memory of that fact).
 */
export function consoleMissionIntentReached(record: MissionRecord): boolean {
  if (record.status === "INTENT_RECORDED") return true;
  return (
    record.status === "ARCHIVED" && record.events.some((event) => event.kind === "INTENT_VALIDATED")
  );
}

/**
 * The §4 ladder fold: INTENT per the reached law above; every other rung
 * renders NOT_REACHED_PREREQUISITE with the VERBATIM string, in ladder
 * order. No client component, model, tool permission or simulated result
 * may mark a rung reached.
 */
export function foldConsoleMissionLadder(record: MissionRecord): readonly MissionRungState[] {
  const intentReached = consoleMissionIntentReached(record);
  return LADDER_ORDER.map((rung) => {
    if (rung === "INTENT" && intentReached) {
      return { rung: "INTENT", state: "REACHED" } as const;
    }
    return {
      rung,
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: CONSOLE_LADDER_PREREQUISITES[rung],
    } as const;
  });
}

// ---------------------------------------------------------------------------
// Summary projection (§3)
// ---------------------------------------------------------------------------

/** The §3 summary projection of one mission record. */
export function consoleMissionSummaryOf(record: MissionRecord): MissionSummary {
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
// Persisted-record structural guard (the localStorage quarantine basis)
// ---------------------------------------------------------------------------

/**
 * Structural check of a persisted mission record (the load path): a
 * record that fails ANY check is quarantined — never rendered as a
 * mission, never silently dropped. Returns the typed finding on failure.
 */
export function consoleMissionRecordStructureFinding(record: unknown): string | null {
  if (record === null || typeof record !== "object") {
    return "record is not an object";
  }
  const candidate = record as Partial<MissionRecord>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return "record.id is not a non-empty string";
  }
  if (typeof candidate.createdAt !== "string" || candidate.createdAt.length === 0) {
    return "record.createdAt is not a non-empty string";
  }
  if (typeof candidate.updatedAt !== "string" || candidate.updatedAt.length === 0) {
    return "record.updatedAt is not a non-empty string";
  }
  if (!isDraftStatus(candidate.status)) {
    return "record.status is not a pinned MissionDraftStatus";
  }
  if (candidate.intake === null || typeof candidate.intake !== "object") {
    return "record.intake is not an object";
  } else {
    const intake = candidate.intake as Partial<MissionIntakeInput>;
    if (typeof intake.goalStatement !== "string") {
      return "record.intake.goalStatement is not a string";
    }
    if (!isIntentDirection(intake.direction)) {
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
      !isEventKind((event as Partial<{ kind: unknown }>).kind)
    ) {
      return "record.events contains a malformed event";
    }
  }
  return null;
}
