/**
 * PaySwap Desktop (P10-B) — JSON snapshot persistence for the
 * DESKTOP_PROFILE workspace store.
 *
 * The persistence laws (spec/surface/CONSOLE-WORKSPACE.md §5 adapter
 * laws + the P10-B work order):
 *
 * - The store lives in the desktop main-process host, persisted as JSON
 *   under the PaySwap user-data directory (the directory arrives via the
 *   host seam; node:fs is INJECTED at the composition edge — this module
 *   never imports fs, keeping it pure + node-testable with fakes).
 * - SAVE AFTER EACH MUTATION: every mutating port call applies to the
 *   core, serializes the snapshot and writes it; a failed write REVERTS
 *   the in-memory core to the pre-mutation state and fails closed with
 *   a typed PERSISTENCE_FAILED error (never a silent divergence between
 *   memory and disk).
 * - LOAD IS FAIL-CLOSED ABOUT RECORDS, NOT ABOUT THE STORE: a malformed
 *   or unparseable persisted record goes to a QUARANTINE list surfaced
 *   via the typed store health report (workspaceStoreHealth) — never
 *   rendered as a mission, never silently dropped. Good records in the
 *   same snapshot still load.
 * - Ids are never reused across loads: the persisted id counter is
 *   authoritative when valid; otherwise it is derived from the highest
 *   parseable mission id (loaded OR quarantined) + 1.
 *
 * The store holds DEMAND-SIDE INTENT ONLY — never financial truth.
 */

import { pinnedMissionRecordStructureFinding } from "./mission-intake.js";
import {
  createWorkspaceStoreCore,
  WorkspaceStoreError,
  type WorkspaceStoreCore,
  type WorkspaceStoreCoreState,
} from "./workspace-store.js";
import type {
  PinnedMissionDetail,
  PinnedMissionIntakeInput,
  PinnedMissionRecord,
  PinnedMissionSummary,
} from "../pins/index.js";

// ---------------------------------------------------------------------------
// The injected file system (node:fs is bound at the composition edge)
// ---------------------------------------------------------------------------

/** The file-system seam the persistence layer needs (node:fs-shaped). */
export interface WorkspaceStoreFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Health report (typed; the quarantine surface)
// ---------------------------------------------------------------------------

/** One quarantined persisted record (or snapshot) — typed, never a mission. */
export interface WorkspaceStoreQuarantineEntry {
  /** Position in the persisted records array (-1: the snapshot itself). */
  readonly index: number;
  /** Best-effort record id when one was parseable. */
  readonly recordId: string | null;
  /** The typed structural finding. */
  readonly reason: string;
  /** A bounded raw excerpt for support diagnosis (never the whole file). */
  readonly rawExcerpt: string;
}

/** The typed store health report surfaced to the workspace settings. */
export interface WorkspaceStoreHealthReport {
  readonly durability: "DESKTOP_PROFILE";
  /** Honest storage label (§5: survives app restarts). */
  readonly durabilityNote: string;
  readonly directory: string;
  readonly snapshotFile: string;
  readonly missionCount: number;
  readonly nextId: number;
  readonly quarantinedCount: number;
  readonly quarantine: readonly WorkspaceStoreQuarantineEntry[];
}

// ---------------------------------------------------------------------------
// Snapshot format (versioned)
// ---------------------------------------------------------------------------

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_FILE_NAME = "workspace-store.json";
const QUARANTINE_EXCERPT_MAX = 512;

interface WorkspaceSnapshot {
  readonly schemaVersion: number;
  readonly nextId: number;
  readonly records: readonly unknown[];
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

interface LoadedStore {
  readonly core: WorkspaceStoreCore;
  readonly quarantine: readonly WorkspaceStoreQuarantineEntry[];
}

function loadSnapshot(raw: string): LoadedStore {
  const quarantine: WorkspaceStoreQuarantineEntry[] = [];
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
    return { core: createWorkspaceStoreCore(), quarantine };
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as Partial<WorkspaceSnapshot>).records) ||
    typeof (parsed as Partial<WorkspaceSnapshot>).schemaVersion !== "number"
  ) {
    quarantine.push({
      index: -1,
      recordId: null,
      reason: "snapshot does not match the workspace-store schema (schemaVersion + records required)",
      rawExcerpt: excerpt(parsed),
    });
    return { core: createWorkspaceStoreCore(), quarantine };
  }
  const snapshot = parsed as WorkspaceSnapshot;
  const goodRecords: PinnedMissionRecord[] = [];
  snapshot.records.forEach((candidate, index) => {
    const finding = pinnedMissionRecordStructureFinding(candidate);
    if (finding === null) {
      goodRecords.push(candidate as PinnedMissionRecord);
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
  const state: WorkspaceStoreCoreState = {
    nextId:
      typeof snapshot.nextId === "number" && Number.isFinite(snapshot.nextId)
        ? Math.max(1, Math.ceil(snapshot.nextId), derived)
        : Math.max(1, derived),
    records: goodRecords,
  };
  return { core: createWorkspaceStoreCore(state), quarantine };
}

function serializeSnapshot(state: WorkspaceStoreCoreState): string {
  const snapshot: WorkspaceSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    nextId: state.nextId,
    records: [...state.records],
  };
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// The persistent store (the §5 port surface + health, over the core)
// ---------------------------------------------------------------------------

export interface PersistentWorkspaceStore {
  listMissions(): Promise<readonly PinnedMissionSummary[]>;
  recordMissionDraft(input: PinnedMissionIntakeInput, now: string): Promise<PinnedMissionRecord>;
  recordMissionIntent(id: string, now: string): Promise<PinnedMissionRecord>;
  missionDetail(id: string): Promise<PinnedMissionDetail | null>;
  reviseMissionDraft(
    id: string,
    input: PinnedMissionIntakeInput,
    now: string,
  ): Promise<PinnedMissionRecord>;
  archiveMissionDraft(id: string, now: string): Promise<PinnedMissionRecord>;
  health(): Promise<WorkspaceStoreHealthReport>;
}

/**
 * Open the persistent DESKTOP_PROFILE workspace store: create the
 * directory (idempotent), load the snapshot (quarantine malformed
 * records — good records still load), then serve the §5 port surface
 * with save-after-each-mutation discipline.
 */
export async function openPersistentWorkspaceStore(params: {
  readonly fileSystem: WorkspaceStoreFileSystem;
  readonly directory: string;
  readonly snapshotFileName?: string;
}): Promise<PersistentWorkspaceStore> {
  const snapshotFile = `${params.directory}/${params.snapshotFileName ?? SNAPSHOT_FILE_NAME}`;
  await params.fileSystem.mkdir(params.directory);

  let raw: string | null = null;
  try {
    raw = await params.fileSystem.readFile(snapshotFile);
  } catch {
    raw = null; // First run (no snapshot yet) — an empty store, not an error.
  }
  const loaded = raw === null ? { core: createWorkspaceStoreCore(), quarantine: [] } : loadSnapshot(raw);
  let core = loaded.core;
  const quarantine = [...loaded.quarantine];
  let dirty = raw === null;

  async function save(): Promise<void> {
    await params.fileSystem.writeFile(snapshotFile, serializeSnapshot(core.exportState()));
    dirty = false;
  }

  async function mutate<T>(
    operation: () => T,
    describe: (result: T) => string,
  ): Promise<T> {
    const before = core.exportState();
    const result = operation();
    try {
      await save();
    } catch (error) {
      // All-or-nothing: the mutation never happened if it could not be
      // persisted — memory and disk stay in agreement, fail-closed.
      core = createWorkspaceStoreCore(before);
      throw new WorkspaceStoreError(
        "PERSISTENCE_FAILED",
        `The workspace store could not persist the ${describe(result)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return result;
  }

  if (dirty) {
    await save();
  }

  return {
    async listMissions() {
      return core.listMissions();
    },
    recordMissionDraft(input, now) {
      return mutate(
        () => core.recordMissionDraft(input, now),
        (record) => `new mission draft ${record.id}`,
      );
    },
    recordMissionIntent(id, now) {
      return mutate(
        () => core.recordMissionIntent(id, now),
        () => `intent recording for mission ${id}`,
      );
    },
    async missionDetail(id) {
      return core.missionDetail(id);
    },
    reviseMissionDraft(id, input, now) {
      return mutate(
        () => core.reviseMissionDraft(id, input, now),
        () => `revision of mission ${id}`,
      );
    },
    archiveMissionDraft(id, now) {
      return mutate(
        () => core.archiveMissionDraft(id, now),
        () => `archival of mission ${id}`,
      );
    },
    async health(): Promise<WorkspaceStoreHealthReport> {
      const state = core.exportState();
      return {
        durability: "DESKTOP_PROFILE",
        durabilityNote:
          "DESKTOP_PROFILE — persisted as JSON under the PaySwap user-data directory; survives app restarts",
        directory: params.directory,
        snapshotFile,
        missionCount: state.records.length,
        nextId: state.nextId,
        quarantinedCount: quarantine.length,
        quarantine,
      };
    },
  };
}
