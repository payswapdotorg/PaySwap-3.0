/**
 * @payswap/app — the workspace store-port React binding (console surface).
 *
 * The ONLY mutation surface of the workspace (§7): the pinned
 * WorkspaceStorePort. This hook loads the mission list on mount, exposes
 * create / record-intent / revise / archive + per-mission detail loading
 * with honest loading + typed-error states, and NEVER fakes success: a
 * rejected store call surfaces its typed error; a null detail is
 * "missing"; nothing is invented between a request and its answer.
 *
 * Determinism: `now` is an explicit input everywhere (§5/§7) — the hook
 * takes an injectable clock (default: the ambient UTC instant, read once
 * per mutation at this app boundary, never inside a fold).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MissionDetail,
  MissionEvent,
  MissionIntakeInput,
  MissionRecord,
  MissionSummary,
  WorkspaceStorePort,
} from "./contracts.js";

export type WorkspaceStoreOperation =
  | "list"
  | "activity"
  | "detail"
  | "create"
  | "intent"
  | "revise"
  | "archive";

/**
 * The ONE ambient-clock read in this package (the P5 pinned site): the
 * shared DEFAULT mutation clock for every store/port binding at this app
 * boundary — the console workspace store AND the agent composer
 * controller (P13-A). Read once per user-initiated mutation to supply a
 * port's explicit `now` argument (§5: "now is an explicit input"); never
 * a fold input, never a view-model value, never displayed. Every binding
 * and every test injects its clock through the same seam; this default
 * exists only so the standalone browser profile works.
 */
export const ambientMutationClock = () => new Date().toISOString();

/** The typed store error (fail-closed; rejections are never swallowed). */
export interface WorkspaceStoreError {
  readonly kind: "store-error";
  readonly operation: WorkspaceStoreOperation;
  readonly message: string;
}

export type WorkspaceResult =
  | { readonly ok: true; readonly record: MissionRecord }
  | { readonly ok: false; readonly error: WorkspaceStoreError };

export interface WorkspaceListState {
  readonly phase: "loading" | "ready" | "error";
  readonly summaries: readonly MissionSummary[];
  readonly error?: WorkspaceStoreError;
}

export interface WorkspaceActivityState {
  readonly phase: "idle" | "loading" | "ready" | "error";
  readonly events: readonly MissionEvent[];
  readonly error?: WorkspaceStoreError;
}

export interface WorkspaceDetailState {
  readonly phase: "idle" | "loading" | "ready" | "missing" | "error";
  readonly detail?: MissionDetail;
  readonly error?: WorkspaceStoreError;
}

export interface WorkspaceMutationState {
  readonly phase: "idle" | "pending" | "error";
  readonly error?: WorkspaceStoreError;
}

export interface UseWorkspaceStoreOptions {
  /** Injectable clock for store mutations (ISO-8601 UTC). */
  readonly clock?: () => string;
}

function toError(
  operation: WorkspaceStoreOperation,
  thrown: unknown,
): WorkspaceStoreError {
  const message =
    thrown instanceof Error ? thrown.message : String(thrown ?? "unknown store failure");
  return { kind: "store-error", operation, message };
}

/** Merge mission events into one reverse-chronological feed (newest first). */
export function mergeMissionEvents(
  details: readonly MissionDetail[],
): readonly MissionEvent[] {
  return details
    .flatMap((detail) => detail.record.events)
    .slice()
    .sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));
}

/**
 * The store-port binding. Callers get list/activity/detail/mutation state
 * plus honest actions; every action resolves with its real outcome — a
 * failure is RETURNED (and reflected in mutation.error), never masked.
 */
export function useWorkspaceStore(
  store: WorkspaceStorePort,
  options?: UseWorkspaceStoreOptions,
) {
  // The clock seam: the mount (and every test) may inject the clock; the
  // DEFAULT is the package's ONE ambient read (ambientMutationClock above,
  // shared with the agent composer controller — P13-A), called only at the
  // moment of a user-initiated mutation to supply the pinned port's
  // explicit `now` argument (§5). It never feeds a fold, a view model or a
  // displayed value (the P5 product law + the console suite pin the site).
  const clockRef = useRef(ambientMutationClock);
  if (options?.clock !== undefined) {
    clockRef.current = options.clock;
  }
  const now = useCallback(() => clockRef.current(), []);

  const [list, setList] = useState<WorkspaceListState>({
    phase: "loading",
    summaries: [],
  });
  const [activity, setActivity] = useState<WorkspaceActivityState>({
    phase: "idle",
    events: [],
  });
  const [detail, setDetail] = useState<WorkspaceDetailState>({ phase: "idle" });
  const [mutation, setMutation] = useState<WorkspaceMutationState>({
    phase: "idle",
  });

  // Stale-resolution guard: each load cycle increments a token; only the
  // newest cycle may commit state (unmount/change safe, no timers).
  const loadTokenRef = useRef(0);
  const detailIdRef = useRef<string | null>(null);

  const loadList = useCallback(async (): Promise<readonly MissionSummary[] | null> => {
    const token = ++loadTokenRef.current;
    setList((current) => ({ ...current, phase: "loading" }));
    try {
      const summaries = await store.listMissions();
      if (token !== loadTokenRef.current) {
        return null;
      }
      setList({ phase: "ready", summaries });
      return summaries;
    } catch (thrown: unknown) {
      if (token !== loadTokenRef.current) {
        return null;
      }
      setList({
        phase: "error",
        summaries: [],
        error: toError("list", thrown),
      });
      return null;
    }
  }, [store]);

  const loadActivity = useCallback(
    async (summaries: readonly MissionSummary[]) => {
      const token = loadTokenRef.current;
      setActivity({ phase: "loading", events: [] });
      try {
        const details = await Promise.all(
          summaries.map((summary) => store.missionDetail(summary.id)),
        );
        if (token !== loadTokenRef.current) {
          return;
        }
        const real = details.filter((entry): entry is MissionDetail => entry !== null);
        setActivity({ phase: "ready", events: mergeMissionEvents(real) });
      } catch (thrown: unknown) {
        if (token !== loadTokenRef.current) {
          return;
        }
        setActivity({
          phase: "error",
          events: [],
          error: toError("activity", thrown),
        });
      }
    },
    [store],
  );

  const refresh = useCallback(async () => {
    const summaries = await loadList();
    if (summaries !== null) {
      await loadActivity(summaries);
    }
    const openId = detailIdRef.current;
    if (openId !== null) {
      try {
        const next = await store.missionDetail(openId);
        // Only commit while this mission is still the open one.
        if (detailIdRef.current === openId) {
          setDetail(
            next === null
              ? { phase: "missing" }
              : { phase: "ready", detail: next },
          );
        }
      } catch (thrown: unknown) {
        if (detailIdRef.current === openId) {
          setDetail({ phase: "error", error: toError("detail", thrown) });
        }
      }
    }
  }, [loadActivity, loadList, store]);

  // Load the mission list (and the activity feed it feeds) on mount and
  // whenever the store port identity changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = useCallback(
    (id: string) => {
      detailIdRef.current = id;
      const token = loadTokenRef.current;
      setDetail({ phase: "loading" });
      store
        .missionDetail(id)
        .then((result) => {
          if (token !== loadTokenRef.current || detailIdRef.current !== id) {
            return;
          }
          setDetail(
            result === null ? { phase: "missing" } : { phase: "ready", detail: result },
          );
        })
        .catch((thrown: unknown) => {
          if (token !== loadTokenRef.current || detailIdRef.current !== id) {
            return;
          }
          setDetail({ phase: "error", error: toError("detail", thrown) });
        });
    },
    [store],
  );

  const closeDetail = useCallback(() => {
    detailIdRef.current = null;
    setDetail({ phase: "idle" });
  }, []);

  const runMutation = useCallback(
    async (
      operation: WorkspaceStoreOperation,
      call: () => Promise<MissionRecord>,
    ): Promise<WorkspaceResult> => {
      setMutation({ phase: "pending" });
      try {
        const record = await call();
        setMutation({ phase: "idle" });
        await refresh();
        return { ok: true, record };
      } catch (thrown: unknown) {
        const error = toError(operation, thrown);
        setMutation({ phase: "error", error });
        return { ok: false, error };
      }
    },
    [refresh],
  );

  const createDraft = useCallback(
    (input: MissionIntakeInput) =>
      runMutation("create", () => store.recordMissionDraft(input, now())),
    [now, runMutation, store],
  );

  const recordIntent = useCallback(
    (id: string) => runMutation("intent", () => store.recordMissionIntent(id, now())),
    [now, runMutation, store],
  );

  const reviseDraft = useCallback(
    (id: string, input: MissionIntakeInput) =>
      runMutation("revise", () => store.reviseMissionDraft(id, input, now())),
    [now, runMutation, store],
  );

  const archiveDraft = useCallback(
    (id: string) => runMutation("archive", () => store.archiveMissionDraft(id, now())),
    [now, runMutation, store],
  );

  const clearMutationError = useCallback(() => {
    setMutation({ phase: "idle" });
  }, []);

  return {
    durability: store.durability,
    list,
    activity,
    detail,
    mutation,
    reload: refresh,
    openDetail,
    closeDetail,
    createDraft,
    recordIntent,
    reviseDraft,
    archiveDraft,
    clearMutationError,
  } as const;
}

export type WorkspaceStoreBinding = ReturnType<typeof useWorkspaceStore>;
