/**
 * PaySwap Desktop (P10-B) — the DESKTOP_PROFILE workspace store core.
 *
 * A PURE, DETERMINISTIC, TESTABLE core for demand-side mission-intent
 * records over the pinned console workspace vocabulary (§3/§5 of
 * spec/surface/CONSOLE-WORKSPACE.md, mirrored in pins/mission-intake-
 * pins.ts). It holds MISSION RECORDS ONLY — never financial truth, never
 * authorization, never capability state (AGENTS.md financial boundary;
 * INV-1/INV-23); the §5 port method set is the only mutation surface.
 *
 * LAWS (each tested in test/payswap/workspace-store.test.ts):
 * - `now` is ALWAYS an explicit input (no ambient clock — determinism
 *   with a fixed now is total: same inputs, same bytes).
 * - Ids are store-assigned "mission-<n>" with a monotonic counter and
 *   are NEVER reused (archived or quarantined ids included — the counter
 *   only moves forward).
 * - Events are APPEND-ONLY and reverse-chronological inside the record
 *   (newest first); history is never rewritten or reordered.
 * - recordMissionDraft validates structurally (fail-closed findings,
 *   embedded in the record — an invalid draft is honest data, reviewed
 *   verbatim; nothing is coerced) and emits CREATED.
 * - recordMissionIntent transitions DRAFT → INTENT_RECORDED EXACTLY
 *   when structuralValidation.ok (emitting INTENT_VALIDATED) and fails
 *   closed with a typed error otherwise — never silently coerced.
 * - REVISE LAW (kept honest + simple, on purpose): revise re-validates
 *   and emits REVISED; a record that was INTENT_RECORDED and still
 *   validates stays INTENT_RECORDED (the recorded intent remains true);
 *   a record whose validation now fails returns to DRAFT with the new
 *   findings (the intent can no longer be honestly claimed). ARCHIVED
 *   is terminal — revising or re-recording intent fails closed.
 * - archiveMissionDraft moves DRAFT or INTENT_RECORDED to ARCHIVED
 *   (emitting ARCHIVED); §4's archive law preserves the rungs reached
 *   at archive time via the append-only INTENT_VALIDATED event.
 * - listMissions orders summaries newest-updated-first (updatedAt
 *   descending; ties break by creation recency — the higher id first —
 *   so a fixed clock still yields a deterministic order).
 */

import {
  foldPinnedMissionLadder,
  pinnedMissionSummaryOf,
  validatePinnedMissionIntake,
} from "./mission-intake.js";
import { PINNED_LADDER_EVIDENCE_PREREQUISITE } from "../pins/index.js";
import type {
  PinnedMissionDetail,
  PinnedMissionEvent,
  PinnedMissionEventKind,
  PinnedMissionIntakeInput,
  PinnedMissionRecord,
  PinnedMissionSummary,
} from "../pins/index.js";

// ---------------------------------------------------------------------------
// Typed errors (fail-closed; never stringly-typed control flow)
// ---------------------------------------------------------------------------

export type WorkspaceStoreErrorKind =
  | "MISSION_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "INTENT_VALIDATION_FAILED"
  | "STORE_NOT_CONFIGURED"
  | "PERSISTENCE_FAILED";

/** The one typed error family of the workspace store (fail-closed). */
export class WorkspaceStoreError extends Error {
  readonly kind: WorkspaceStoreErrorKind;
  readonly missionId?: string;
  readonly findings?: readonly string[];

  constructor(
    kind: WorkspaceStoreErrorKind,
    message: string,
    details: { readonly missionId?: string; readonly findings?: readonly string[] } = {},
  ) {
    super(message);
    this.name = "WorkspaceStoreError";
    this.kind = kind;
    if (details.missionId !== undefined) this.missionId = details.missionId;
    if (details.findings !== undefined) this.findings = details.findings;
  }
}

// ---------------------------------------------------------------------------
// Core state + the §5 mutation surface
// ---------------------------------------------------------------------------

/** A serializable state snapshot (the persistence unit). */
export interface WorkspaceStoreCoreState {
  readonly nextId: number;
  readonly records: readonly PinnedMissionRecord[];
}

export interface WorkspaceStoreCore {
  recordMissionDraft(input: PinnedMissionIntakeInput, now: string): PinnedMissionRecord;
  recordMissionIntent(id: string, now: string): PinnedMissionRecord;
  reviseMissionDraft(id: string, input: PinnedMissionIntakeInput, now: string): PinnedMissionRecord;
  archiveMissionDraft(id: string, now: string): PinnedMissionRecord;
  listMissions(): readonly PinnedMissionSummary[];
  missionDetail(id: string): PinnedMissionDetail | null;
  exportState(): WorkspaceStoreCoreState;
}

function missionNumericId(id: string): number {
  const parsed = Number.parseInt(id.slice("mission-".length), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Create a workspace store core (optionally restored from a snapshot). */
export function createWorkspaceStoreCore(
  initial: WorkspaceStoreCoreState = { nextId: 1, records: [] },
): WorkspaceStoreCore {
  const records = new Map<string, PinnedMissionRecord>(initial.records.map((r) => [r.id, r]));
  let nextId = Math.max(1, initial.nextId);

  function requireRecord(id: string): PinnedMissionRecord {
    const record = records.get(id);
    if (record === undefined) {
      throw new WorkspaceStoreError("MISSION_NOT_FOUND", `No mission record ${JSON.stringify(id)}`, {
        missionId: id,
      });
    }
    return record;
  }

  function nextEventId(record: PinnedMissionRecord): string {
    return `${record.id}-ev-${record.events.length + 1}`;
  }

  function appendEvent(
    record: PinnedMissionRecord,
    kind: PinnedMissionEventKind,
    summary: string,
    now: string,
  ): PinnedMissionRecord {
    const event: PinnedMissionEvent = {
      id: nextEventId(record),
      at: now,
      kind,
      summary,
    };
    // Append-only, reverse-chronological: the new event is prepended and
    // the existing events are carried over untouched (never rewritten).
    return { ...record, events: [event, ...record.events], updatedAt: now };
  }

  return {
    recordMissionDraft(input, now) {
      const id = `mission-${nextId}`;
      nextId += 1;
      const validation = validatePinnedMissionIntake(input);
      const record: PinnedMissionRecord = {
        id,
        createdAt: now,
        updatedAt: now,
        status: "DRAFT",
        intake: input,
        structuralValidation: validation,
        events: [
          {
            id: `${id}-ev-1`,
            at: now,
            kind: "CREATED",
            summary: "Mission draft recorded.",
          },
        ],
      };
      records.set(id, record);
      return record;
    },

    recordMissionIntent(id, now) {
      const record = requireRecord(id);
      if (record.status !== "DRAFT") {
        throw new WorkspaceStoreError(
          "INVALID_TRANSITION",
          `Intent can only be recorded from DRAFT — mission ${JSON.stringify(id)} is ${record.status}`,
          { missionId: id },
        );
      }
      if (!record.structuralValidation.ok) {
        throw new WorkspaceStoreError(
          "INTENT_VALIDATION_FAILED",
          `Mission ${JSON.stringify(id)} has unresolved structural findings — record intent only after a passing review`,
          { missionId: id, findings: record.structuralValidation.findings },
        );
      }
      const next = appendEvent(
        record,
        "INTENT_VALIDATED",
        "Intent recorded — structural validation passed.",
        now,
      );
      const withStatus: PinnedMissionRecord = { ...next, status: "INTENT_RECORDED" };
      records.set(id, withStatus);
      return withStatus;
    },

    reviseMissionDraft(id, input, now) {
      const record = requireRecord(id);
      if (record.status === "ARCHIVED") {
        throw new WorkspaceStoreError(
          "INVALID_TRANSITION",
          `Archived missions are terminal — mission ${JSON.stringify(id)} cannot be revised`,
          { missionId: id },
        );
      }
      const validation = validatePinnedMissionIntake(input);
      // REVISE LAW: an INTENT_RECORDED mission that still validates keeps
      // its recorded intent; one that no longer validates returns to
      // DRAFT with the fresh findings (the intent can no longer be
      // honestly claimed).
      const status =
        record.status === "INTENT_RECORDED" && validation.ok ? "INTENT_RECORDED" : "DRAFT";
      const revised: PinnedMissionRecord = {
        ...appendEvent(record, "REVISED", "Mission draft revised.", now),
        status,
        intake: input,
        structuralValidation: validation,
      };
      records.set(id, revised);
      return revised;
    },

    archiveMissionDraft(id, now) {
      const record = requireRecord(id);
      if (record.status === "ARCHIVED") {
        throw new WorkspaceStoreError(
          "INVALID_TRANSITION",
          `Mission ${JSON.stringify(id)} is already archived`,
          { missionId: id },
        );
      }
      const archived: PinnedMissionRecord = {
        ...appendEvent(record, "ARCHIVED", "Mission archived.", now),
        status: "ARCHIVED",
      };
      records.set(id, archived);
      return archived;
    },

    listMissions() {
      return [...records.values()]
        .map((record) => ({ record, created: missionNumericId(record.id) }))
        .sort((a, b) => {
          if (a.record.updatedAt !== b.record.updatedAt) {
            return a.record.updatedAt < b.record.updatedAt ? 1 : -1;
          }
          return a.created < b.created ? 1 : -1;
        })
        .map(({ record }) => pinnedMissionSummaryOf(record));
    },

    missionDetail(id) {
      const record = records.get(id);
      if (record === undefined) return null;
      const ladder = foldPinnedMissionLadder(record);
      // The evidenceNote is the §4 EVIDENCE line verbatim when unreached.
      // (The pinned MissionRungState union has no reached variant outside
      // INTENT — no client, model or simulated result can reach EVIDENCE;
      // the fallback exists only so the fold stays total.)
      const evidenceRung = ladder.find((rung) => rung.rung === "EVIDENCE");
      const evidenceNote =
        evidenceRung !== undefined && evidenceRung.state === "NOT_REACHED_PREREQUISITE"
          ? evidenceRung.prerequisite
          : PINNED_LADDER_EVIDENCE_PREREQUISITE;
      return {
        summary: pinnedMissionSummaryOf(record),
        record,
        ladder,
        evidenceNote,
      };
    },

    exportState() {
      return { nextId, records: [...records.values()] };
    },
  };
}
