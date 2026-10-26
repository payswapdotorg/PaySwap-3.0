/**
 * PaySwap Desktop (P10-B; P18-A split) — the DESKTOP_PROFILE
 * workspace-store channel members, split from ./service.ts for the
 * ≤400-line file law (the payment-mission-members.ts precedent).
 *
 * The §5 store surface: host-computed persistence for DEMAND-SIDE
 * MISSION INTENT ONLY — never financial truth, never authorization,
 * never capability state. The store opens lazily on FIRST USE (an
 * unconfigured seam composes fine; the members fail closed per-call
 * with the typed WorkspaceStoreError — never a silent no-op, never an
 * in-memory-only store pretending to be durable).
 */

import {
  openPersistentWorkspaceStore,
  type PersistentWorkspaceStore,
  type WorkspaceStoreFileSystem,
} from "../product/workspace-store-persistence.js";
import { WorkspaceStoreError } from "../product/workspace-store.js";
import type {
  PinnedMissionDetail,
  PinnedMissionIntakeInput,
  PinnedMissionRecord,
  PinnedMissionSummary,
} from "../pins/index.js";
import type { IPaySwapDesktopService } from "./contracts.js";

/** What the members need from the service (injected — never ambient). */
export interface WorkspaceStoreChannelDeps {
  /** The seam's store directory (absent → the members fail closed per-call). */
  readonly storeDirectory: string | undefined;
  /** The injected file system for the snapshot (absent → fail closed per-call). */
  readonly fileSystem: WorkspaceStoreFileSystem | undefined;
  /** The host seam log (never console; no secret material is ever logged). */
  readonly log: (level: "info" | "warn" | "error", message: string, ...args: unknown[]) => void;
}

/** The §5 workspace-store member family (a structural slice of the service). */
export type WorkspaceStoreChannelMembers = Pick<
  IPaySwapDesktopService,
  | "workspaceListMissions"
  | "workspaceRecordMissionDraft"
  | "workspaceRecordMissionIntent"
  | "workspaceMissionDetail"
  | "workspaceReviseMissionDraft"
  | "workspaceArchiveMissionDraft"
  | "workspaceStoreHealth"
>;

/** Create the workspace-store channel members over the lazy per-call store. */
export function createWorkspaceStoreChannelMembers(
  deps: WorkspaceStoreChannelDeps,
): WorkspaceStoreChannelMembers {
  // The DESKTOP_PROFILE workspace store opens lazily on FIRST USE (the
  // store must never delay service composition, and unconfigured seams
  // must compose fine — they fail closed per-call, not at construction).
  let storePromise: Promise<PersistentWorkspaceStore> | null = null;
  let missingLogged = false;
  function resolveWorkspaceStore(): Promise<PersistentWorkspaceStore> {
    if (storePromise === null) {
      if (deps.storeDirectory === undefined || deps.fileSystem === undefined) {
        if (!missingLogged) {
          missingLogged = true;
          deps.log(
            "warn",
            "payswap-desktop: workspace store NOT configured (no store directory on the seam or no file system injected at the composition edge) — workspace-store calls fail closed",
          );
        }
        return Promise.reject(
          new WorkspaceStoreError(
            "STORE_NOT_CONFIGURED",
            "The DESKTOP_PROFILE workspace store is not configured in this host (no store directory on the seam) — the console workspace cannot persist mission intent here",
          ),
        );
      }
      const open = openPersistentWorkspaceStore({
        fileSystem: deps.fileSystem,
        directory: deps.storeDirectory,
      });
      // A failed open is not cached: the next call retries (the typed
      // error surfaces every time; transient fs failures can recover).
      storePromise = open.catch((error: unknown) => {
        storePromise = null;
        throw error;
      });
      storePromise
        .then(() => {
          deps.log(
            "info",
            "payswap-desktop: workspace store opened",
            JSON.stringify({ directory: deps.storeDirectory }),
          );
        })
        .catch(() => {});
    }
    return storePromise;
  }

  return {
    async workspaceListMissions(): Promise<readonly PinnedMissionSummary[]> {
      const store = await resolveWorkspaceStore();
      return store.listMissions();
    },

    async workspaceRecordMissionDraft(
      input: PinnedMissionIntakeInput,
      now: string,
    ): Promise<PinnedMissionRecord> {
      const store = await resolveWorkspaceStore();
      const record = await store.recordMissionDraft(input, now);
      deps.log(
        "info",
        "payswap-desktop: mission draft recorded (demand-side intent only)",
        JSON.stringify({ missionId: record.id, ok: record.structuralValidation.ok }),
      );
      return record;
    },

    async workspaceRecordMissionIntent(id: string, now: string): Promise<PinnedMissionRecord> {
      const store = await resolveWorkspaceStore();
      const record = await store.recordMissionIntent(id, now);
      deps.log(
        "info",
        "payswap-desktop: mission intent recorded (structural validation passed)",
        JSON.stringify({ missionId: record.id }),
      );
      return record;
    },

    async workspaceMissionDetail(id: string): Promise<PinnedMissionDetail | null> {
      const store = await resolveWorkspaceStore();
      return store.missionDetail(id);
    },

    async workspaceReviseMissionDraft(
      id: string,
      input: PinnedMissionIntakeInput,
      now: string,
    ): Promise<PinnedMissionRecord> {
      const store = await resolveWorkspaceStore();
      return store.reviseMissionDraft(id, input, now);
    },

    async workspaceArchiveMissionDraft(id: string, now: string): Promise<PinnedMissionRecord> {
      const store = await resolveWorkspaceStore();
      return store.archiveMissionDraft(id, now);
    },

    async workspaceStoreHealth() {
      const store = await resolveWorkspaceStore();
      const health = await store.health();
      if (health.quarantinedCount > 0) {
        deps.log(
          "warn",
          "payswap-desktop: workspace store loaded with quarantined records (never rendered as missions)",
          JSON.stringify({ quarantinedCount: health.quarantinedCount }),
        );
      }
      return health;
    },
  };
}
