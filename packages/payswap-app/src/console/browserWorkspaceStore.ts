/**
 * @payswap/app — the BROWSER_PROFILE workspace store.
 *
 * [P15 restoration] Restored from the stripped web mount (P10-B,
 * packages/web/src/payswap/workspaceStore.ts) into the product package
 * — unchanged laws, new home: the ZCode-shell console bridge (and any
 * browser mount) creates it directly. The localStorage key stays
 * byte-exact ("payswap.console.workspace.v1" — pinned by the
 * journey-verification evidence reader).
 *
 * The console workspace's §5 WorkspaceStorePort adapter (the browser
 * profile; spec/surface/CONSOLE-WORKSPACE.md §5 adapter laws):
 *
 * - The store persists as ONE JSON snapshot under the namespaced
 *   localStorage key "payswap.console.workspace.v1" — honest labeling
 *   ("stored in this browser profile only"): the data lives in THIS
 *   browser profile, survives reloads, and is NOT synced anywhere.
 * - Same lifecycle laws as the desktop DESKTOP_PROFILE core: `now` is
 *   always an EXPLICIT input (deterministic with a fixed now); ids are
 *   "mission-<n>", store-assigned and NEVER reused (the counter only
 *   moves forward — quarantined ids included); events are APPEND-ONLY
 *   and reverse-chronological inside the record; recordMissionIntent
 *   transitions DRAFT → INTENT_RECORDED exactly when
 *   structuralValidation.ok and fails closed with a typed error
 *   otherwise; the REVISE law (an INTENT_RECORDED mission that still
 *   validates keeps its intent; one that no longer validates returns
 *   to DRAFT with the fresh findings; ARCHIVED is terminal).
 * - A malformed persisted record is QUARANTINED — surfaced via the
 *   typed health report (createBrowserWorkspaceStore().health()),
 *   never rendered as a mission, never silently dropped; good records
 *   in the same snapshot still load.
 * - A failed write (quota exceeded, storage disabled) REVERTS the
 *   in-memory state and fails closed with a typed error — memory and
 *   storage never silently diverge.
 *
 * The store holds DEMAND-SIDE INTENT ONLY — not financial truth, not
 * authorization, not capability state (AGENTS.md financial boundary;
 * INV-1/INV-23).
 */

import type {
  MissionDetail,
  MissionEvent,
  MissionIntakeInput,
  MissionRecord,
  MissionSummary,
  WorkspaceStorePort,
} from "./contracts.js";
import {
  BROWSER_PROFILE_DURABILITY_NOTE,
  CONSOLE_LADDER_EVIDENCE_PREREQUISITE,
  consoleMissionRecordStructureFinding,
  consoleMissionSummaryOf,
  foldConsoleMissionLadder,
  validateConsoleMissionIntake,
} from "./browserWorkspaceLaw.js";

// ---------------------------------------------------------------------------
// The storage seam (localStorage bound lazily; tests inject fakes)
// ---------------------------------------------------------------------------

/** The namespaced localStorage key (one snapshot, versioned). */
export const WORKSPACE_STORE_LOCALSTORAGE_KEY = "payswap.console.workspace.v1";

/** The minimal storage seam the store needs (localStorage-shaped). */
export interface BrowserWorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): BrowserWorkspaceStorage {
  // Lazy: importing this module in a storage-less context never throws;
  // the store fails closed (typed) only when actually used.
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (storage === undefined) {
    throw new BrowserWorkspaceStoreError(
      "STORE_UNAVAILABLE",
      "localStorage is not available in this browser context — the BROWSER_PROFILE workspace store cannot persist mission intent here",
    );
  }
  return storage;
}

// ---------------------------------------------------------------------------
// Typed errors (fail-closed; never stringly-typed control flow)
// ---------------------------------------------------------------------------

export type BrowserWorkspaceStoreErrorKind =
  | "MISSION_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "INTENT_VALIDATION_FAILED"
  | "STORE_UNAVAILABLE"
  | "PERSISTENCE_FAILED";

/** The one typed error family of the browser workspace store. */
export class BrowserWorkspaceStoreError extends Error {
  readonly kind: BrowserWorkspaceStoreErrorKind;
  readonly missionId?: string;
  readonly findings?: readonly string[];

  constructor(
    kind: BrowserWorkspaceStoreErrorKind,
    message: string,
    details: { readonly missionId?: string; readonly findings?: readonly string[] } = {},
  ) {
    super(message);
    this.name = "BrowserWorkspaceStoreError";
    this.kind = kind;
    if (details.missionId !== undefined) this.missionId = details.missionId;
    if (details.findings !== undefined) this.findings = details.findings;
  }
}

// ---------------------------------------------------------------------------
// Health report (typed; the quarantine surface)
// ---------------------------------------------------------------------------

/** One quarantined persisted record — typed, never a mission. */
export interface BrowserWorkspaceStoreQuarantineEntry {
  /** Position in the persisted records array (-1: the snapshot itself). */
  readonly index: number;
  /** Best-effort record id when one was parseable. */
  readonly recordId: string | null;
  /** The typed structural finding. */
  readonly reason: string;
  /** A bounded raw excerpt for diagnosis (never the whole snapshot). */
  readonly rawExcerpt: string;
}

/** The typed store health report for the workspace settings surface. */
export interface BrowserWorkspaceStoreHealthReport {
  readonly durability: "BROWSER_PROFILE";
  /** Honest storage label (§5: "stored in this browser profile only"). */
  readonly durabilityNote: string;
  readonly storageKey: string;
  readonly missionCount: number;
  readonly nextId: number;
  readonly quarantinedCount: number;
  readonly quarantine: readonly BrowserWorkspaceStoreQuarantineEntry[];
}

// ---------------------------------------------------------------------------
// Snapshot format (versioned — same shape family as the desktop store)
// ---------------------------------------------------------------------------

const SNAPSHOT_SCHEMA_VERSION = 1;
const QUARANTINE_EXCERPT_MAX = 512;

interface BrowserWorkspaceSnapshot {
  readonly schemaVersion: number;
  readonly nextId: number;
  readonly records: readonly unknown[];
}

interface StoreState {
  readonly nextId: number;
  readonly records: readonly MissionRecord[];
}

function excerpt(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const bounded = text ?? "";
  return bounded.length > QUARANTINE_EXCERPT_MAX
    ? `${bounded.slice(0, QUARANTINE_EXCERPT_MAX)}…`
    : bounded;
}

function parseRecordId(candidate: unknown): string | null {
  if (candidate !== null && typeof candidate === "object") {
    const id = (candidate as { readonly id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

function numericMissionId(id: string): number {
  const parsed = Number.parseInt(id.slice("mission-".length), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface LoadedState {
  readonly state: StoreState;
  readonly quarantine: readonly BrowserWorkspaceStoreQuarantineEntry[];
}

function loadSnapshot(raw: string): LoadedState {
  const quarantine: BrowserWorkspaceStoreQuarantineEntry[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    quarantine.push({
      index: -1,
      recordId: null,
      reason: `snapshot is not valid JSON (${error instanceof Error ? error.message : "parse error"})`,
      rawExcerpt: excerpt(raw),
    });
    return { state: { nextId: 1, records: [] }, quarantine };
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as Partial<BrowserWorkspaceSnapshot>).records) ||
    typeof (parsed as Partial<BrowserWorkspaceSnapshot>).schemaVersion !== "number"
  ) {
    quarantine.push({
      index: -1,
      recordId: null,
      reason: "snapshot does not match the workspace-store schema (schemaVersion + records required)",
      rawExcerpt: excerpt(parsed),
    });
    return { state: { nextId: 1, records: [] }, quarantine };
  }
  const snapshot = parsed as BrowserWorkspaceSnapshot;
  const goodRecords: MissionRecord[] = [];
  snapshot.records.forEach((candidate, index) => {
    const finding = consoleMissionRecordStructureFinding(candidate);
    if (finding === null) {
      goodRecords.push(candidate as MissionRecord);
      return;
    }
    quarantine.push({
      index,
      recordId: parseRecordId(candidate),
      reason: finding,
      rawExcerpt: excerpt(candidate),
    });
  });
  // Id law: the persisted counter is authoritative when valid; otherwise
  // derive from the highest parseable id (good or quarantined) so ids are
  // never reused after a partial load.
  const candidates = [
    ...goodRecords.map((record) => record.id),
    ...quarantine.map((entry) => entry.recordId),
  ].filter((id): id is string => typeof id === "string");
  const derived = candidates.reduce((max, id) => Math.max(max, numericMissionId(id)), 0) + 1;
  const nextId =
    typeof snapshot.nextId === "number" && Number.isFinite(snapshot.nextId)
      ? Math.max(1, Math.ceil(snapshot.nextId), derived)
      : Math.max(1, derived);
  return { state: { nextId, records: goodRecords }, quarantine };
}

function serializeSnapshot(state: StoreState): string {
  const snapshot: BrowserWorkspaceSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    nextId: state.nextId,
    records: [...state.records],
  };
  return JSON.stringify(snapshot);
}

// ---------------------------------------------------------------------------
// The store (§5 port + the health companion)
// ---------------------------------------------------------------------------

/** The BROWSER_PROFILE store: the §5 port plus the typed health report. */
export type BrowserWorkspaceStore = WorkspaceStorePort & {
  /** The typed health report (quarantine surfaced, never dropped). */
  health(): Promise<BrowserWorkspaceStoreHealthReport>;
};

function appendEvent(
  record: MissionRecord,
  kind: MissionEvent["kind"],
  summary: string,
  now: string,
): MissionRecord {
  const event: MissionEvent = {
    id: `${record.id}-ev-${record.events.length + 1}`,
    at: now,
    kind,
    summary,
  };
  // Append-only, reverse-chronological: the new event is prepended and
  // the existing events are carried over untouched (never rewritten).
  return { ...record, events: [event, ...record.events], updatedAt: now };
}

/**
 * Create the BROWSER_PROFILE workspace store over localStorage (or an
 * injected storage seam — the deterministic test path). The §5 port
 * method set is the only mutation surface; the extra health() companion
 * is additive (read-only diagnostics).
 */
export function createBrowserWorkspaceStore(
  storage: BrowserWorkspaceStorage = defaultStorage(),
): BrowserWorkspaceStore {
  let state: StoreState = { nextId: 1, records: [] };
  let quarantine: readonly BrowserWorkspaceStoreQuarantineEntry[] = [];
  let loaded = false;

  function load(): void {
    if (loaded) return;
    let raw: string | null = null;
    try {
      raw = storage.getItem(WORKSPACE_STORE_LOCALSTORAGE_KEY);
    } catch (error) {
      throw new BrowserWorkspaceStoreError(
        "STORE_UNAVAILABLE",
        `The workspace store could not read its browser storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const loaded_ = raw === null ? { state, quarantine: [] } : loadSnapshot(raw);
    state = loaded_.state;
    quarantine = [...loaded_.quarantine];
    loaded = true;
  }

  function save(next: StoreState): void {
    try {
      storage.setItem(WORKSPACE_STORE_LOCALSTORAGE_KEY, serializeSnapshot(next));
    } catch (error) {
      // Fail closed: the mutation never happened if it could not be
      // persisted — memory and storage stay in agreement.
      throw new BrowserWorkspaceStoreError(
        "PERSISTENCE_FAILED",
        `The workspace store could not persist to browser storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Apply a mutation with save-after + revert-on-failure discipline. */
  function mutate(operation: (current: StoreState) => StoreState): StoreState {
    load();
    const next = operation(state);
    save(next);
    // Reaching here means the snapshot persisted — only now does the
    // in-memory state advance (a failed save left it untouched).
    state = next;
    return next;
  }

  function requireRecord(id: string): MissionRecord {
    const record = state.records.find((candidate) => candidate.id === id);
    if (record === undefined) {
      throw new BrowserWorkspaceStoreError(
        "MISSION_NOT_FOUND",
        `No mission record ${JSON.stringify(id)}`,
        { missionId: id },
      );
    }
    return record;
  }

  return {
    durability: "BROWSER_PROFILE",

    async listMissions(): Promise<readonly MissionSummary[]> {
      load();
      return [...state.records]
        .map((record) => ({ record, created: numericMissionId(record.id) }))
        .sort((a, b) => {
          if (a.record.updatedAt !== b.record.updatedAt) {
            return a.record.updatedAt < b.record.updatedAt ? 1 : -1;
          }
          return a.created < b.created ? 1 : -1;
        })
        .map(({ record }) => consoleMissionSummaryOf(record));
    },

    async recordMissionDraft(input: MissionIntakeInput, now: string): Promise<MissionRecord> {
      load();
      const id = `mission-${state.nextId}`;
      const validation = validateConsoleMissionIntake(input);
      const record: MissionRecord = {
        id,
        createdAt: now,
        updatedAt: now,
        status: "DRAFT",
        intake: input,
        structuralValidation: validation,
        events: [{ id: `${id}-ev-1`, at: now, kind: "CREATED", summary: "Mission draft recorded." }],
      };
      mutate((current) => ({ nextId: current.nextId + 1, records: [record, ...current.records] }));
      return record;
    },

    async recordMissionIntent(id: string, now: string): Promise<MissionRecord> {
      load();
      const record = requireRecord(id);
      if (record.status !== "DRAFT") {
        throw new BrowserWorkspaceStoreError(
          "INVALID_TRANSITION",
          `Intent can only be recorded from DRAFT — mission ${JSON.stringify(id)} is ${record.status}`,
          { missionId: id },
        );
      }
      if (!record.structuralValidation.ok) {
        throw new BrowserWorkspaceStoreError(
          "INTENT_VALIDATION_FAILED",
          `Mission ${JSON.stringify(id)} has unresolved structural findings — record intent only after a passing review`,
          { missionId: id, findings: record.structuralValidation.findings },
        );
      }
      const next = { ...appendEvent(record, "INTENT_VALIDATED", "Intent recorded — structural validation passed.", now), status: "INTENT_RECORDED" } as MissionRecord;
      mutate((current) => ({
        nextId: current.nextId,
        records: current.records.map((candidate) => (candidate.id === id ? next : candidate)),
      }));
      return next;
    },

    async missionDetail(id: string): Promise<MissionDetail | null> {
      load();
      const record = state.records.find((candidate) => candidate.id === id);
      if (record === undefined) return null;
      const ladder = foldConsoleMissionLadder(record);
      // The evidenceNote is the §4 EVIDENCE line verbatim when unreached
      // (no client, model or simulated result can reach EVIDENCE; the
      // fallback exists only so the fold stays total).
      const evidenceRung = ladder.find((rung) => rung.rung === "EVIDENCE");
      const evidenceNote =
        evidenceRung !== undefined && evidenceRung.state === "NOT_REACHED_PREREQUISITE"
          ? evidenceRung.prerequisite
          : CONSOLE_LADDER_EVIDENCE_PREREQUISITE;
      return {
        summary: consoleMissionSummaryOf(record),
        record,
        ladder,
        evidenceNote,
      };
    },

    async reviseMissionDraft(
      id: string,
      input: MissionIntakeInput,
      now: string,
    ): Promise<MissionRecord> {
      load();
      const record = requireRecord(id);
      if (record.status === "ARCHIVED") {
        throw new BrowserWorkspaceStoreError(
          "INVALID_TRANSITION",
          `Archived missions are terminal — mission ${JSON.stringify(id)} cannot be revised`,
          { missionId: id },
        );
      }
      const validation = validateConsoleMissionIntake(input);
      // REVISE LAW (kept honest + simple, on purpose — same law as the
      // desktop core): an INTENT_RECORDED mission that still validates
      // keeps its recorded intent; one that no longer validates returns
      // to DRAFT with the fresh findings.
      const status =
        record.status === "INTENT_RECORDED" && validation.ok ? "INTENT_RECORDED" : "DRAFT";
      const revised: MissionRecord = {
        ...appendEvent(record, "REVISED", "Mission draft revised.", now),
        status,
        intake: input,
        structuralValidation: validation,
      };
      mutate((current) => ({
        nextId: current.nextId,
        records: current.records.map((candidate) => (candidate.id === id ? revised : candidate)),
      }));
      return revised;
    },

    async archiveMissionDraft(id: string, now: string): Promise<MissionRecord> {
      load();
      const record = requireRecord(id);
      if (record.status === "ARCHIVED") {
        throw new BrowserWorkspaceStoreError(
          "INVALID_TRANSITION",
          `Mission ${JSON.stringify(id)} is already archived`,
          { missionId: id },
        );
      }
      const archived: MissionRecord = {
        ...appendEvent(record, "ARCHIVED", "Mission archived.", now),
        status: "ARCHIVED",
      };
      mutate((current) => ({
        nextId: current.nextId,
        records: current.records.map((candidate) => (candidate.id === id ? archived : candidate)),
      }));
      return archived;
    },

    async health(): Promise<BrowserWorkspaceStoreHealthReport> {
      load();
      return {
        durability: "BROWSER_PROFILE",
        durabilityNote: BROWSER_PROFILE_DURABILITY_NOTE,
        storageKey: WORKSPACE_STORE_LOCALSTORAGE_KEY,
        missionCount: state.records.length,
        nextId: state.nextId,
        quarantinedCount: quarantine.length,
        quarantine,
      };
    },
  };
}
