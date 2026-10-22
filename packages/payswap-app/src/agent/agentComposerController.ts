/**
 * @payswap/app — the AGENT COMPOSER CONTROLLER (P13-A, framework-free).
 *
 * The observable state machine behind the persistent, toggleable
 * composer: mode, the DRAFT text, the bounded transcript, the projected
 * task list and the honest error states. React binds through
 * useSyncExternalStore (./AgentComposer.tsx); every entrypoint drives
 * the SAME controller (the shared-entrypoints law). Public contracts:
 * ./agentComposerTypes.ts; UI-state persistence: ./agentComposerUiState.ts.
 *
 * LAWS: ZERO FINANCIAL AUTHORITY (ADR-0007 D7 — seeds tasks and records
 * events only; the one extra verb is CANCEL, an orchestration-record
 * close, never a financial act) · CONVERGENCE (text and surface seeds
 * go through the SAME seedOrResume fold — one task, never a duplicate)
 * · ONE TYPED INTENT PATH (the deterministic router, injectable, never
 * an LLM; voice declared-unsupported, never simulated) · CHAT LAW (D4 —
 * secret-shaped text refused before it is recorded; refusals echo no
 * material) · PERSISTENCE (task records + UI state survive reload and
 * reopen) · DETERMINISM (`now` is an explicit input, never displayed).
 */

import type { AgentTaskIntentPin, AgentTaskPin } from "../lib/agent-task-pins.js";
import { ambientMutationClock } from "../console/useWorkspaceStore.js";
import { routeAgentText } from "./intentRouter.js";
import {
  createBrowserAgentTaskSessionPort,
  scanAgentTranscriptText,
} from "./taskSessionAdapter.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";
import { projectAgentComposerTasks } from "./agentComposerProjection.js";
import {
  bindUiStorage,
  readUiSnapshot,
  writeUiSnapshot,
  type ComposerUiSnapshot,
} from "./agentComposerUiState.js";

/* ------------------------------ the state --------------------------- */
/* The public contracts (state/controller/options surfaces + the
 * transcript entry re-export) live in ./agentComposerTypes.ts (the
 * ≤400-line law); re-exported here unchanged for consumers. */

export type {
  AgentComposerMode,
  AgentComposerState,
  AgentComposerSurfaceSeed,
  AgentComposerControllerOptions,
  AgentComposerController,
  AgentComposerTranscriptEntry,
} from "./agentComposerTypes.js";
import type {
  AgentComposerController,
  AgentComposerControllerOptions,
  AgentComposerState,
  AgentComposerSurfaceSeed,
  AgentComposerTranscriptEntry,
} from "./agentComposerTypes.js";

/* ------- the persistence + state contracts (split per the file law) -- */

const DEFAULT_ENTRY_CAP = 60;

/* ---------------------------- the controller ------------------------ */

/**
 * Create a composer controller. All side-effecting seams (session port,
 * UI storage, clock, router) are injectable; the defaults make the
 * composer work STANDALONE in the browser profile, honestly labeled.
 */
export function createAgentComposerController(
  options?: AgentComposerControllerOptions,
): AgentComposerController {
  const session = options?.session;
  const route = options?.route ?? routeAgentText;
  const entryCap = options?.entryCap ?? DEFAULT_ENTRY_CAP;

  // The default clock is the package's ONE pinned ambient site (the P5
  // carve-out, shared with the console store binding): read once per
  // user-initiated mutation to supply the port's explicit `now` argument —
  // never a displayed value. (The controller therefore binds to the app
  // package's clock seam; tests inject their own clock.)
  const clock = options?.clock ?? ambientMutationClock;

  const uiStore = bindUiStorage(options?.storage);

  let sessionPort: AgentTaskSessionPort | undefined = session;
  const resolveSession = (): AgentTaskSessionPort => {
    // The injected storage seam governs BOTH persistence planes (the
    // UI state AND the task store) — tests never touch the ambient
    // localStorage, and a storage-less environment degrades honestly.
    sessionPort ??= createBrowserAgentTaskSessionPort({ storage: uiStore ?? undefined });
    return sessionPort;
  };

  const persisted = readUiSnapshot(uiStore);
  let uiPersistence: "browser-profile" | "memory-only" = uiStore === null ? "memory-only" : "browser-profile";

  let lineSeq = persisted?.entries.length ?? 0;
  let state: AgentComposerState = {
    mode: persisted?.mode ?? "minimized",
    entryArea: persisted?.entryArea ?? null,
    draftText: persisted?.draftText ?? "",
    entries: persisted?.entries ?? [],
    tasks: [],
    tasksPhase: "loading",
    tasksError: null,
    sendPhase: "idle",
    uiPersistence,
  };

  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const setState = (patch: Partial<AgentComposerState>): void => {
    state = { ...state, ...patch };
    persistUi();
    emit();
  };

  /** Best-effort UI-state persistence (an honest downgrade on failure). */
  const persistUi = (): void => {
    const snapshot: ComposerUiSnapshot = {
      version: 1,
      mode: state.mode,
      entryArea: state.entryArea,
      draftText: state.draftText,
      entries: state.entries.slice(-entryCap),
    };
    if (!writeUiSnapshot(uiStore, snapshot) && uiPersistence !== "memory-only") {
      uiPersistence = "memory-only";
      state = { ...state, uiPersistence };
    }
  };

  const nextLineId = (): string => {
    lineSeq += 1;
    return `line:${lineSeq}`;
  };

  const appendEntries = (
    additions: readonly { kind: AgentComposerTranscriptEntry["kind"]; text: string; taskId?: string }[],
    at: string,
  ): void => {
    const capped = [
      ...state.entries,
      ...additions.map((addition) => ({
        id: nextLineId(),
        at,
        kind: addition.kind,
        text: addition.text,
        ...(addition.taskId !== undefined ? { taskId: addition.taskId } : {}),
      })),
    ].slice(-entryCap);
    state = { ...state, entries: capped };
  };

  /** The shared seed path — every entrypoint converges here. */
  const seed = async (
    intent: AgentTaskIntentPin,
    origin: "COMPOSER_TEXT" | "SURFACE_ACTION",
    originNote: string,
  ): Promise<{ action: "CREATED" | "RESUMED"; task: AgentTaskPin } | { action: "REFUSED"; message: string }> => {
    try {
      return await resolveSession().seedOrResume({
        intent,
        origin,
        now: clock(),
        originNote,
      });
    } catch (thrown: unknown) {
      const message =
        thrown instanceof Error ? thrown.message : String(thrown ?? "the task store refused the request");
      return { action: "REFUSED", message };
    }
  };

  const taskOutcomeLine = (task: AgentTaskPin, action: "CREATED" | "RESUMED"): string => {
    const lines = projectAgentComposerTasks([task])[0]!;
    const verb = action === "CREATED" ? "Task created" : "Task resumed — the same one, not a duplicate";
    return `${verb}: ${lines.title}. Status: ${lines.statusView.label}. This is a request record, not a payment or a connection.`;
  };

  const reloadTasks = async (): Promise<void> => {
    try {
      const tasks = await resolveSession().listTasks();
      state = { ...state, tasks: projectAgentComposerTasks(tasks), tasksPhase: "ready", tasksError: null };
    } catch (thrown: unknown) {
      state = {
        ...state,
        tasksPhase: "error",
        tasksError:
          thrown instanceof Error ? thrown.message : String(thrown ?? "the task store could not be read"),
      };
    }
  };

  return {
    getState: () => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    open(entry?: { readonly area?: string }): void {
      setState({
        mode: "open",
        ...(entry?.area !== undefined ? { entryArea: entry.area } : {}),
      });
    },

    minimize(): void {
      setState({ mode: "minimized" });
    },

    close(): void {
      setState({ mode: "closed" });
    },

    setDraft(text: string): void {
      setState({ draftText: text });
    },

    async send(): Promise<void> {
      const text = state.draftText.trim();
      if (text.length === 0 || state.sendPhase === "sending") {
        return;
      }
      // The chat law FIRST: secret-shaped text is refused before it is
      // recorded anywhere, and the refusal echoes no secret material.
      try {
        scanAgentTranscriptText(text);
      } catch (thrown: unknown) {
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        appendEntries([{ kind: "COMPOSER_ERROR", text: message }], clock());
        setState({ draftText: "", sendPhase: "idle" });
        return;
      }
      appendEntries([{ kind: "USER_TEXT", text }], clock());
      setState({ draftText: "", sendPhase: "sending" });

      const routed = route(text);
      if (routed.kind === "UNKNOWN") {
        appendEntries([{ kind: "AGENT_REPLY", text: routed.reply }], clock());
        setState({ sendPhase: "idle" });
        return;
      }

      const intent: AgentTaskIntentPin =
        routed.kind === "CONNECTION_SETUP"
          ? {
              kind: "CONNECTION_SETUP",
              providerId: routed.providerId,
              form: routed.form,
              useCaseRef: routed.useCaseRef,
            }
          : { kind: "PAYMENT_MISSION", direction: routed.direction, goalStatement: routed.goalStatement };

      const outcome = await seed(intent, "COMPOSER_TEXT", text);
      if (outcome.action === "REFUSED") {
        appendEntries([{ kind: "COMPOSER_ERROR", text: outcome.message }], clock());
      } else {
        appendEntries(
          [
            {
              kind: outcome.action === "CREATED" ? "TASK_CREATED" : "TASK_RESUMED",
              text: taskOutcomeLine(outcome.task, outcome.action),
              taskId: outcome.task.id,
            },
          ],
          clock(),
        );
      }
      await reloadTasks();
      setState({ sendPhase: "idle" });
    },

    async seedFromSurface(seedInput: AgentComposerSurfaceSeed): Promise<void> {
      const note = seedInput.originNote.trim();
      if (note.length === 0) {
        return;
      }
      try {
        scanAgentTranscriptText(note);
      } catch (thrown: unknown) {
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        appendEntries([{ kind: "COMPOSER_ERROR", text: message }], clock());
        setState({ mode: "open", entryArea: seedInput.area });
        return;
      }
      appendEntries(
        [{ kind: "SURFACE_ACTION", text: `From the ${seedInput.area} area: ${note}` }],
        clock(),
      );
      setState({ mode: "open", entryArea: seedInput.area, sendPhase: "sending" });

      const outcome = await seed(seedInput.intent, "SURFACE_ACTION", note);
      if (outcome.action === "REFUSED") {
        appendEntries([{ kind: "COMPOSER_ERROR", text: outcome.message }], clock());
      } else {
        appendEntries(
          [
            {
              kind: outcome.action === "CREATED" ? "TASK_CREATED" : "TASK_RESUMED",
              text: taskOutcomeLine(outcome.task, outcome.action),
              taskId: outcome.task.id,
            },
          ],
          clock(),
        );
      }
      await reloadTasks();
      setState({ sendPhase: "idle" });
    },

    async cancelTask(taskId: string): Promise<void> {
      const task = state.tasks.find((entry) => entry.id === taskId);
      if (task === undefined) {
        return;
      }
      if (!task.resumable) {
        appendEntries(
          [
            {
              kind: "COMPOSER_ERROR",
              text: `Task ${taskId} is ${task.status} — a terminal status has no lawful exit (the monotonic-terminal law).`,
            },
          ],
          clock(),
        );
        persistUi();
        emit();
        return;
      }
      try {
        await resolveSession().updateTaskStatus(
          taskId,
          "CANCELLED",
          "CANCELLED",
          clock(),
          "Cancelled from the composer — the task record is closed. Nothing was dispatched: the composer holds no financial authority.",
        );
        appendEntries(
          [
            {
              kind: "TASK_CANCELLED",
              text: `Task cancelled: ${task.title}. The record is closed — nothing was dispatched and nothing needs unwinding.`,
              taskId,
            },
          ],
          clock(),
        );
      } catch (thrown: unknown) {
        appendEntries(
          [
            {
              kind: "COMPOSER_ERROR",
              text: thrown instanceof Error ? thrown.message : String(thrown),
            },
          ],
          clock(),
        );
      }
      await reloadTasks();
      persistUi();
      emit();
    },

    async refresh(): Promise<void> {
      await reloadTasks();
      emit();
    },
  };
}

/* ------------------------- the shared singleton ---------------------- */

let sharedController: AgentComposerController | undefined;

/**
 * The ONE shared composer controller per document: every entrypoint
 * (product areas, app overview, Agent Workspace overview) drives the
 * same controller, so the composer's identity, draft, progress and
 * history are shared by construction — including across product ↔
 * console surface switches in the same document.
 */
export function sharedAgentComposerController(): AgentComposerController {
  sharedController ??= createAgentComposerController();
  return sharedController;
}

/** Test/inspection helper: drop the shared singleton (never used in src). */
export function resetSharedAgentComposerController(): void {
  sharedController = undefined;
}
