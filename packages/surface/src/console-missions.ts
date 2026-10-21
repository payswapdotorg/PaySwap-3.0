/**
 * @payswap/surface — the mission vocabulary (P10-A, CONSOLE-WORKSPACE.md §3).
 *
 * NET-NEW module: the PINNED mission view-models (MissionIntakeInput,
 * MissionRecord, MissionSummary, MissionDetail, …) byte-exact to §3 —
 * drift is a defect (the @payswap/app seam stub and the P10-B mounts
 * compile against the same shapes) — plus `validateMissionIntake`, the
 * fail-closed deterministic structural validation, and the summary
 * projection used by the section folds.
 *
 * AmountSpec is the package's own pinned wire form (src/amount-spec.ts,
 * SURFACE-CONTRACTS.md §2) reused here unchanged.
 *
 * LAWS enforced here (canonical):
 * - The store holds DEMAND-SIDE INTENT ONLY (§5): records are not
 *   financial truth, not authorization, not capability state (INV-1/23).
 * - Validation is fail-closed and deterministic: every finding is a
 *   human-readable string; unknown direction/extra shape is a finding,
 *   NEVER silently coerced; findings empty iff ok.
 * - The AmountSpec law is enforced exactly (currency /^[A-Z]{3}$/,
 *   canonical non-negative decimal integer minorUnits — the package's
 *   own validateSurfaceAmountSpec, reused).
 * - PROJECTION (INV-23): `missionSummaryOf` projects RECORDED values
 *   verbatim. The fold validates only store-assigned STRUCTURE (ids,
 *   status, event kinds — §5's quarantine law); intake VALUES may carry
 *   findings (their validity is the record's structuralValidation, and
 *   recordMissionIntent gates on it) and project as recorded.
 */

import { validateSurfaceAmountSpec, type AmountSpec } from "./amount-spec.ts";

/* ====================================================================
 * Mission vocabulary (CONSOLE-WORKSPACE.md §3 — pinned, byte-exact)
 * ==================================================================== */

export type MissionIntentDirection = "PAY" | "RECEIVE" | "MOVE" | "CONVERT";

export interface MissionIntakeInput {
  /** Non-empty after trim, at most 2000 characters. */
  readonly goalStatement: string;
  readonly direction: MissionIntentDirection;
  /** Optional until known; when present it must satisfy the AmountSpec law. */
  readonly amount?: AmountSpec;
  /** Optional free-text location hints, at most 200 characters each. */
  readonly fundingLocationHint?: string;
  readonly payoutLocationHint?: string;
  /** Optional note, at most 2000 characters. */
  readonly note?: string;
}

export type MissionDraftStatus = "DRAFT" | "INTENT_RECORDED" | "ARCHIVED";

export type MissionLifecycleRung =
  | "INTENT"
  | "ELIGIBILITY"
  | "PLANNING"
  | "APPROVAL"
  | "EXECUTION"
  | "OBSERVATION"
  | "EVIDENCE";

export type MissionRungState =
  | { readonly rung: "INTENT"; readonly state: "REACHED" }
  | {
      readonly rung: MissionLifecycleRung;
      readonly state: "NOT_REACHED_PREREQUISITE";
      /** The typed prerequisite, carried verbatim from §4. */
      readonly prerequisite: string;
    };

export type MissionEventKind =
  | "CREATED"
  | "REVISED"
  | "INTENT_VALIDATED"
  | "ARCHIVED";

export interface MissionEvent {
  /** Stable within the store; assigned by the store adapter. */
  readonly id: string;
  /** ISO-8601 UTC instant, explicit input — never an ambient clock. */
  readonly at: string;
  readonly kind: MissionEventKind;
  readonly summary: string;
}

export interface MissionStructuralValidation {
  readonly ok: boolean;
  /** Empty iff ok; human-readable findings otherwise. */
  readonly findings: readonly string[];
}

export interface MissionRecord {
  /** Stable, store-assigned, never reused, non-empty. */
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: MissionDraftStatus;
  readonly intake: MissionIntakeInput;
  readonly structuralValidation: MissionStructuralValidation;
  /** Reverse-chronological (newest first), never rewritten. */
  readonly events: readonly MissionEvent[];
}

export interface MissionSummary {
  readonly id: string;
  readonly goalStatement: string;
  readonly direction: MissionIntentDirection;
  readonly amount?: AmountSpec;
  readonly status: MissionDraftStatus;
  readonly updatedAt: string;
}

export interface MissionDetail {
  readonly summary: MissionSummary;
  readonly record: MissionRecord;
  /** The §4 ladder fold result for this record. */
  readonly ladder: readonly MissionRungState[];
  /** Honest evidence line — verbatim from §4 EVIDENCE when unreached. */
  readonly evidenceNote: string;
}

/** The closed direction vocabulary (validation order). */
export const MISSION_INTENT_DIRECTIONS: readonly MissionIntentDirection[] = Object.freeze([
  "PAY",
  "RECEIVE",
  "MOVE",
  "CONVERT",
] as const);

/** The closed draft-status vocabulary. */
export const MISSION_DRAFT_STATUSES: readonly MissionDraftStatus[] = Object.freeze([
  "DRAFT",
  "INTENT_RECORDED",
  "ARCHIVED",
] as const);

/** The closed event-kind vocabulary (store-assigned; §5 append-only events). */
export const MISSION_EVENT_KINDS: readonly MissionEventKind[] = Object.freeze([
  "CREATED",
  "REVISED",
  "INTENT_VALIDATED",
  "ARCHIVED",
] as const);

/** The ladder rung order, INTENT → EVIDENCE (§4). */
export const MISSION_LIFECYCLE_RUNGS: readonly MissionLifecycleRung[] = Object.freeze([
  "INTENT",
  "ELIGIBILITY",
  "PLANNING",
  "APPROVAL",
  "EXECUTION",
  "OBSERVATION",
  "EVIDENCE",
] as const);

/** Raised when a mission record is structurally malformed (fail-closed). */
export class InvalidConsoleMissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConsoleMissionError";
  }
}

/* ====================================================================
 * validateMissionIntake (§3 validation law)
 * ==================================================================== */

const GOAL_STATEMENT_MAX = 2000;
const LOCATION_HINT_MAX = 200;
const NOTE_MAX = 2000;
const KNOWN_INTAKE_FIELDS: readonly string[] = Object.freeze([
  "goalStatement",
  "direction",
  "amount",
  "fundingLocationHint",
  "payoutLocationHint",
  "note",
] as const);

/**
 * Fail-closed, deterministic structural validation of a mission intake.
 * Returns `MissionStructuralValidation` (findings empty iff ok). The
 * AmountSpec law is enforced exactly via the package's own validator;
 * an unknown direction or any unknown/extra field is a finding — never
 * silently coerced. Finding order is fixed (deterministic): goal, then
 * direction, then amount, then hints, then note, then unknown fields
 * (alphabetical).
 */
export function validateMissionIntake(input: MissionIntakeInput): MissionStructuralValidation {
  const findings: string[] = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, findings: ["intake must be an object"] };
  }

  const record = input as unknown as Record<string, unknown>;
  const goal = record["goalStatement"];
  if (typeof goal !== "string") {
    findings.push("goalStatement is required and must be a string");
  } else {
    const trimmedLength = goal.trim().length;
    if (trimmedLength === 0) {
      findings.push("goalStatement must not be empty after trimming");
    } else if (trimmedLength > GOAL_STATEMENT_MAX) {
      findings.push(
        `goalStatement must be at most ${GOAL_STATEMENT_MAX} characters after trimming (got ${trimmedLength})`,
      );
    }
  }

  const direction = record["direction"];
  if (direction === undefined) {
    findings.push("direction is required");
  } else if (
    typeof direction !== "string" ||
    !(MISSION_INTENT_DIRECTIONS as readonly string[]).includes(direction)
  ) {
    findings.push(
      `direction must be one of ${MISSION_INTENT_DIRECTIONS.join(", ")} (got ${JSON.stringify(direction)}) — never silently coerced`,
    );
  }

  const amount = record["amount"];
  if (amount !== undefined) {
    if (amount === null || typeof amount !== "object") {
      findings.push("amount must be an AmountSpec object when present");
    } else {
      try {
        validateSurfaceAmountSpec(amount as AmountSpec);
      } catch (error) {
        findings.push(`amount: ${(error as Error).message}`);
      }
    }
  }

  for (const [field, max] of [
    ["fundingLocationHint", LOCATION_HINT_MAX],
    ["payoutLocationHint", LOCATION_HINT_MAX],
    ["note", NOTE_MAX],
  ] as const) {
    const value = record[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      findings.push(`${field} must be a string when present`);
    } else if (value.length > max) {
      findings.push(`${field} must be at most ${max} characters (got ${value.length})`);
    }
  }

  const unknownFields = Object.keys(record)
    .filter((key) => !(KNOWN_INTAKE_FIELDS as readonly string[]).includes(key))
    .sort();
  for (const field of unknownFields) {
    findings.push(
      `unknown field ${JSON.stringify(field)} — the intake shape is closed; extra fields are findings, never coerced`,
    );
  }

  return { ok: findings.length === 0, findings };
}

/* ====================================================================
 * Record shape validation + the summary projection (fold-time law)
 * ==================================================================== */

/**
 * Fail-closed validation of the STORE-ASSIGNED structure of a mission
 * record (ids, status, event kinds — the structure the §5 adapters
 * guarantee; a violation is a malformed record the store must quarantine,
 * never render). Intake VALUES are NOT re-validated here: they project
 * verbatim and their validity is the carried structuralValidation.
 */
export function validateMissionRecordShape(record: MissionRecord): void {
  const where = (field: string): string =>
    `mission ${JSON.stringify(typeof record?.id === "string" ? record.id : record?.id)}: ${field}`;
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new InvalidConsoleMissionError("mission record must be an object");
  }
  if (typeof record.id !== "string" || record.id.length === 0) {
    throw new InvalidConsoleMissionError(where("id must be a non-empty string"));
  }
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (typeof record[field] !== "string" || (record[field] as string).length === 0) {
      throw new InvalidConsoleMissionError(where(`${field} must be a non-empty ISO-8601 string`));
    }
  }
  if (
    typeof record.status !== "string" ||
    !(MISSION_DRAFT_STATUSES as readonly string[]).includes(record.status)
  ) {
    throw new InvalidConsoleMissionError(
      where(`unknown status ${JSON.stringify(record.status)} — the vocabulary is closed`),
    );
  }
  const intake = record.intake as unknown;
  if (intake === null || typeof intake !== "object" || Array.isArray(intake)) {
    throw new InvalidConsoleMissionError(where("intake must be an object"));
  }
  const intakeRecord = intake as Record<string, unknown>;
  if (typeof intakeRecord["goalStatement"] !== "string") {
    throw new InvalidConsoleMissionError(where("intake.goalStatement must be a string"));
  }
  if (typeof intakeRecord["direction"] !== "string") {
    throw new InvalidConsoleMissionError(where("intake.direction must be a string"));
  }
  const amount = intakeRecord["amount"];
  if (amount !== undefined && (amount === null || typeof amount !== "object")) {
    throw new InvalidConsoleMissionError(where("intake.amount must be an object when present"));
  }
  for (const field of ["fundingLocationHint", "payoutLocationHint", "note"] as const) {
    const value = intakeRecord[field];
    if (value !== undefined && typeof value !== "string") {
      throw new InvalidConsoleMissionError(where(`intake.${field} must be a string when present`));
    }
  }
  const validation = record.structuralValidation as unknown;
  if (
    validation === null ||
    typeof validation !== "object" ||
    typeof (validation as Record<string, unknown>)["ok"] !== "boolean" ||
    !Array.isArray((validation as Record<string, unknown>)["findings"])
  ) {
    throw new InvalidConsoleMissionError(
      where("structuralValidation must carry ok: boolean and findings: string[]"),
    );
  }
  if (!Array.isArray(record.events)) {
    throw new InvalidConsoleMissionError(where("events must be an array (append-only)"));
  }
  for (const [index, event] of record.events.entries()) {
    if (event === null || typeof event !== "object") {
      throw new InvalidConsoleMissionError(where(`events[${index}] must be an object`));
    }
    const candidate = event as Record<string, unknown>;
    if (typeof candidate["id"] !== "string" || (candidate["id"] as string).length === 0) {
      throw new InvalidConsoleMissionError(where(`events[${index}].id must be a non-empty string`));
    }
    if (typeof candidate["at"] !== "string" || (candidate["at"] as string).length === 0) {
      throw new InvalidConsoleMissionError(
        where(`events[${index}].at must be a non-empty ISO-8601 string`),
      );
    }
    if (
      typeof candidate["kind"] !== "string" ||
      !(MISSION_EVENT_KINDS as readonly string[]).includes(candidate["kind"])
    ) {
      throw new InvalidConsoleMissionError(
        where(`events[${index}].kind ${JSON.stringify(candidate["kind"])} is outside the closed vocabulary`),
      );
    }
    if (typeof candidate["summary"] !== "string") {
      throw new InvalidConsoleMissionError(where(`events[${index}].summary must be a string`));
    }
  }
}

/**
 * Project a mission record into its summary (pure; recorded values
 * verbatim). Fail-closed on malformed store-assigned structure.
 */
export function missionSummaryOf(record: MissionRecord): MissionSummary {
  validateMissionRecordShape(record);
  return {
    id: record.id,
    goalStatement: record.intake.goalStatement,
    direction: record.intake.direction,
    ...(record.intake.amount !== undefined ? { amount: record.intake.amount } : {}),
    status: record.status,
    updatedAt: record.updatedAt,
  };
}
