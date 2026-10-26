/**
 * PaySwap Desktop (P13-C) — the durable payment-mission store.
 *
 * THE DURABILITY DISCIPLINE (the P10-B workspace-store law, applied to
 * the payment-mission plane): JSON snapshot persistence under the
 * PaySwap user-data directory with node:fs INJECTED at the composition
 * edge; SAVE AFTER EACH MUTATION with all-or-nothing rollback (a failed
 * write reverts the in-memory state — memory and disk never diverge);
 * LOAD IS FAIL-CLOSED ABOUT RECORDS, NOT ABOUT THE STORE (malformed
 * mission/idempotency records go to a typed quarantine surfaced by
 * health(), never rendered, never silently dropped).
 *
 * ONE SNAPSHOT carries the mission records, the presented previews, the
 * authorization-gate state and the idempotency records — so an attempt
 * and its idempotency record persist ATOMICALLY (the no-duplicate-write
 * law survives crashes: a begin() that persisted will REPLAY or CONFLICT
 * after restart, never re-execute).
 *
 * TASK IDENTITY (ADR-0007 D6): mission ids are HOST-MINTED
 * `task:PAYMENT_MISSION:<crypto-random>` (a 32-hex-char crypto random;
 * the factory is injectable for deterministic tests). Ids are persisted
 * with the record and are therefore restart-stable; crypto randomness
 * makes reuse impossible (no counter to roll back).
 *
 * BigInt law: the idempotency records carry TimestampMs as bigint in
 * memory (the pinned registrar law); the snapshot serializes those two
 * fields as decimal strings via explicit converters (JSON cannot carry
 * bigint — the conversion is typed, never a silent stringly drift).
 */

import { PaymentMissionError } from "./contracts.js";
import {
  PAYMENTS_SNAPSHOT_FILE_NAME,
  parsePaymentsSnapshot,
  serializePaymentsSnapshot,
  type PaymentsStoreState,
  type PaymentsStoreQuarantineEntry,
} from "./payments-snapshot-format.js";
import {
  PAYMENT_MISSION_DIRECTIONS,
  PAYMENT_PLAN_SELECTION_LIMITS,
  PAYMENT_TASK_ORIGINS,
  PAYMENT_TASK_STATUSES,
} from "./contracts.js";
import { initialAuthorizationGateState } from "./authorization-gate.js";
import type { PaymentPreviewRecord } from "./preview.js";

// ---------------------------------------------------------------------------
// The injected file system (node:fs is bound at the composition edge)
// ---------------------------------------------------------------------------

/** The file-system seam this store needs (node:fs-shaped; injected). */
export interface PaymentsStoreFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// The persisted preview registry (the authorization-binding records)
// ---------------------------------------------------------------------------

/**
 * The persisted presentation record: the FULL composed preview the user
 * saw — presentation facts, gate decisions with verbatim reasons, quote
 * provenance, destination and risk — the durable facts the authorization
 * gate binds a request to. Restart-stable: an approval round-trip may
 * span a restart without losing what was presented.
 */
export type StoredPaymentPreview = PaymentPreviewRecord;

// ---------------------------------------------------------------------------
// Snapshot format (versioned) + bigint converters
// ---------------------------------------------------------------------------





// ---------------------------------------------------------------------------
// Structural validation of persisted mission records (fail-closed)
// ---------------------------------------------------------------------------

const MISSION_ID_PATTERN = /^task:PAYMENT_MISSION:[0-9a-f]{32}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const PLAN_SELECTION_KEYS = ["planId", "viewDigest", "routineId", "routineVersion", "selectedAt"] as const;
/**
 * The store's own RE-PINNED event-kind list (P17-A, ADR-0010 D3): the
 * full 22-kind payment-mission vocabulary, re-pinned deliberately —
 * NOT imported from contracts.ts — so the persisted-record validator
 * drifts only through a conscious two-step change caught by the mirror
 * test. The P16-D defect (this list pinned only 17 kinds, missing the
 * four wait kinds, so a mission persisting a wait event loaded into
 * QUARANTINE) is the reason this list is pinned EXACTLY to the full
 * contracts set and drift-tested against it.
 */
export const PAYMENT_EVENT_KINDS: readonly string[] = [
  "CREATED", "RESUMED", "FIELD_CAPTURED", "MISSING_FIELD_ASKED", "VALIDATED",
  "PREVIEW_PRESENTED", "AUTHORIZATION_GRANTED", "AUTHORIZATION_DECLINED",
  "EXTERNAL_RETURN_VALIDATED", "EXTERNAL_RETURN_REJECTED", "ATTEMPT_STARTED",
  "ATTEMPT_CONFIRMED", "ATTEMPT_FAILED", "OUTCOME_UNKNOWN", "RECONCILED",
  "CANCELLED", "EXPIRED", "WAIT_STARTED", "WAIT_CRITERIA_RECORDED",
  "OPPORTUNITY_MATCHED", "WAIT_EXPIRED", "PLAN_SELECTION_RECORDED",
];
const INTAKE_FIELD_IDS: readonly string[] = [
  "amountAndCurrency", "fundingSource", "recipient", "countryCorridor",
  "speedDeadline", "feeCap", "purpose", "privacyCompliance", "partialPaymentPreference",
];

/**
 * Fail-closed structural validation of a persisted mission record.
 * Returns a typed finding string (null = valid) — the quarantine reason.
 */
export function paymentMissionRecordStructureFinding(candidate: unknown): string | null {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return "a payment mission record must be an object";
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (typeof record["id"] !== "string" || !MISSION_ID_PATTERN.test(record["id"])) {
    return `mission id must match ${MISSION_ID_PATTERN.toString()} (the host-minted task identity, ADR-0007 D6)`;
  }
  if (typeof record["direction"] !== "string" || !(PAYMENT_MISSION_DIRECTIONS as readonly string[]).includes(record["direction"])) {
    return "mission direction must be PAY/RECEIVE/MOVE/CONVERT";
  }
  if (typeof record["goalStatement"] !== "string" || record["goalStatement"].length === 0) {
    return "mission goalStatement must be a non-empty string";
  }
  if (typeof record["origin"] !== "string" || !(PAYMENT_TASK_ORIGINS as readonly string[]).includes(record["origin"])) {
    return "mission origin is not canonical";
  }
  for (const field of ["createdAt", "updatedAt"]) {
    if (typeof record[field] !== "string" || !ISO_UTC_PATTERN.test(record[field])) {
      return `mission ${field} must be an ISO-8601 UTC instant`;
    }
  }
  for (const field of ["status", "resumeFrom"]) {
    if (typeof record[field] !== "string" || !(PAYMENT_TASK_STATUSES as readonly string[]).includes(record[field])) {
      return `mission ${field} is not a canonical task status`;
    }
  }
  if (!Array.isArray(record["events"])) {
    return "mission events must be an array";
  }
  const seenEventIds = new Set<string>();
  for (const event of record["events"]) {
    if (event === null || typeof event !== "object" || Array.isArray(event)) {
      return "each mission event must be an object";
    }
    const e = event as Readonly<Record<string, unknown>>;
    if (typeof e["id"] !== "string" || e["id"].length === 0 || seenEventIds.has(e["id"])) {
      return "mission event ids must be unique non-empty strings";
    }
    seenEventIds.add(e["id"]);
    if (typeof e["at"] !== "string" || !ISO_UTC_PATTERN.test(e["at"])) {
      return "mission event.at must be an ISO-8601 UTC instant";
    }
    if (typeof e["kind"] !== "string" || !PAYMENT_EVENT_KINDS.includes(e["kind"])) {
      return "mission event.kind is not canonical";
    }
    if (typeof e["summary"] !== "string" || e["summary"].length === 0) {
      return "mission event.summary must be a non-empty string";
    }
  }
  if (record["fields"] === null || typeof record["fields"] !== "object" || Array.isArray(record["fields"])) {
    return "mission fields must be the nine-field intake state object";
  }
  const fieldKeys = Object.keys(record["fields"]).sort();
  if (fieldKeys.join(",") !== [...INTAKE_FIELD_IDS].sort().join(",")) {
    return "mission fields must carry exactly the nine intake field states";
  }
  for (const key of fieldKeys) {
    const state = (record["fields"] as Readonly<Record<string, unknown>>)[key];
    if (state === null || typeof state !== "object" || Array.isArray(state)) {
      return `mission field state '${key}' must be an object`;
    }
    const status = (state as Readonly<Record<string, unknown>>)["status"];
    if (status !== "MISSING" && status !== "CAPTURED") {
      return `mission field state '${key}' must be MISSING or CAPTURED`;
    }
  }
  if (record["attempts"] !== undefined && !Array.isArray(record["attempts"])) {
    return "mission attempts must be an array";
  }
  if (record["planSelection"] !== undefined) {
    const finding = planSelectionStructureFinding(record["planSelection"]);
    if (finding !== null) {
      return finding;
    }
  }
  return null;
}

/**
 * Fail-closed structural validation of a persisted plan selection (the
 * stage-9a record, P17-A): malformed → finding, NEVER coerced — a
 * tampered or partial selection never loads as mission state.
 */
function planSelectionStructureFinding(candidate: unknown): string | null {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return "mission planSelection must be an object";
  }
  const selection = candidate as Readonly<Record<string, unknown>>;
  const keys = Object.keys(selection).sort().join(",");
  if (keys !== [...PLAN_SELECTION_KEYS].sort().join(",")) {
    return "mission planSelection must carry exactly planId, viewDigest, routineId, routineVersion and selectedAt";
  }
  const limits = PAYMENT_PLAN_SELECTION_LIMITS;
  for (const field of ["planId", "viewDigest", "routineId", "routineVersion"] as const) {
    const value = selection[field];
    if (typeof value !== "string" || value.trim().length === 0 || value.length > limits[field]) {
      return `mission planSelection.${field} must be a non-empty string of at most ${String(limits[field])} characters`;
    }
  }
  if (typeof selection["selectedAt"] !== "string" || !ISO_UTC_PATTERN.test(selection["selectedAt"])) {
    return "mission planSelection.selectedAt must be an ISO-8601 UTC instant";
  }
  return null;
}


/** The typed store health report. */
export interface PaymentsStoreHealthReport {
  readonly durability: "DESKTOP_PROFILE";
  readonly durabilityNote: string;
  readonly directory: string;
  readonly snapshotFile: string;
  readonly missionCount: number;
  readonly previewCount: number;
  readonly idempotencyCount: number;
  readonly quarantinedCount: number;
  readonly quarantine: readonly PaymentsStoreQuarantineEntry[];
}


// ---------------------------------------------------------------------------
// The durable payments store (the runtime's ONLY persistence surface)
// ---------------------------------------------------------------------------

/** The in-memory state the store tracks between mutations. */

/** The durable payment-mission store (save-after-each-mutation). */
export interface PaymentMissionStore {
  load(): Promise<PaymentsStoreState>;
  /** Apply one state transition atomically (persisted or thrown back). */
  commit(mutation: (state: PaymentsStoreState) => PaymentsStoreState): Promise<PaymentsStoreState>;
  health(): Promise<PaymentsStoreHealthReport>;
}

/** Parse a snapshot string into store state (quarantine on bad records). */


/**
 * Open the durable payment-mission store: create the directory
 * (idempotent), load the snapshot (quarantine malformed records — good
 * records still load), then serve read/commit with the
 * save-after-each-mutation discipline. The FIRST commit persists the
 * empty snapshot on a fresh install (first-run detection is honest).
 */
export async function openPaymentMissionStore(params: {
  readonly fileSystem: PaymentsStoreFileSystem;
  readonly directory: string;
  readonly snapshotFileName?: string;
}): Promise<PaymentMissionStore> {
  const snapshotFile = `${params.directory}/${params.snapshotFileName ?? PAYMENTS_SNAPSHOT_FILE_NAME}`;
  await params.fileSystem.mkdir(params.directory);

  let raw: string | null = null;
  try {
    raw = await params.fileSystem.readFile(snapshotFile);
  } catch {
    raw = null; // First run — an empty store, not an error.
  }
  const loaded = raw === null ? null : parsePaymentsSnapshot(raw);
  let state: PaymentsStoreState =
    loaded?.state ?? { missions: [], previews: [], authorization: initialAuthorizationGateState(), idempotency: [] };
  const quarantine = [...(loaded?.quarantine ?? [])];
  let dirty = raw === null;

  async function save(): Promise<void> {
    await params.fileSystem.writeFile(snapshotFile, serializePaymentsSnapshot(state));
    dirty = false;
  }

  if (dirty) {
    await save();
  }

  return {
    async load() {
      return state;
    },
    async commit(mutation) {
      const before = state;
      const next = mutation(state);
      try {
        state = next;
        await save();
      } catch (error) {
        // All-or-nothing: the mutation never happened if it could not
        // be persisted — memory and disk stay in agreement, fail-closed.
        state = before;
        throw new PaymentMissionError(
          "PERSISTENCE_FAILED",
          `The payment-mission store could not persist the mutation: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return state;
    },
    async health(): Promise<PaymentsStoreHealthReport> {
      if (dirty) {
        await save();
      }
      return {
        durability: "DESKTOP_PROFILE",
        durabilityNote:
          "DESKTOP_PROFILE — the payment-mission plane persists as JSON under the PaySwap user-data directory; task ids, timelines, idempotency records and authorization artifacts survive app restarts",
        directory: params.directory,
        snapshotFile,
        missionCount: state.missions.length,
        previewCount: state.previews.length,
        idempotencyCount: state.idempotency.length,
        quarantinedCount: quarantine.length,
        quarantine,
      };
    },
  };
}
