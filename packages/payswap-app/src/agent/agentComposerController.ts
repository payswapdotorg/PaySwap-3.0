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

import type { AgentTaskIntentPin, AgentTaskModelSelectionPin } from "../lib/agent-task-pins.js";
import { ambientMutationClock } from "../console/useWorkspaceStore.js";
import { routeAgentText } from "./intentRouter.js";
import {
  createBrowserAgentTaskSessionPort,
  scanAgentTranscriptText,
} from "./taskSessionAdapter.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";
import {
  createAgentComposerIntakeWiring,
  resolveControllerIntakePlane,
  type AgentComposerIntakeWiring,
} from "./agentComposerIntake.js";
import { createAgentComposerSeedPath } from "./agentComposerSeedPath.js";
import { cancelAgentComposerTask } from "./agentComposerTaskClose.js";
import { MISSION_INTAKE_UNBOUND_STATE } from "./missionIntakePins.js";
import { MODEL_CONTROLS_UNBOUND_STATE, type ModelControlsState } from "./taskModelPins.js";
import { createAgentComposerModelWiring, type AgentComposerModelWiring } from "./agentComposerModelControls.js";
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

  // The composer↔mission binding (P21-B, ADR-0014 D2): the wiring module
  // owns the lazy binding over the composer's ONE task-session port (the
  // injected plane for tests; the shared host binding for platform
  // hosts); the unbound tier keeps the honest UNBOUND projection.
  const intake: AgentComposerIntakeWiring = createAgentComposerIntakeWiring(
    resolveControllerIntakePlane(options?.missionIntakePlane),
    {
      session: () => resolveSession(),
      clock: () => clock(),
      appendEntries: (entries, at) => {
        appendEntries(
          entries.map((entry) => ({ kind: entry.kind, text: entry.text, ...(entry.taskId !== undefined ? { taskId: entry.taskId } : {}) })),
          at,
        );
      },
      persistUi: () => persistUi(),
      emit: () => emit(),
      setMissionIntake: (next) => {
        state = { ...state, missionIntake: next };
      },
    },
  );

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
    missionIntake: MISSION_INTAKE_UNBOUND_STATE,
    modelControls: MODEL_CONTROLS_UNBOUND_STATE,
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

  // (P21-B, D4) The model/difficulty controls wiring (split to
  // ./agentComposerModelControls.ts for the ≤400-line file law): the
  // catalog load, the fail-closed selection path over the controller's
  // ONE session port, and taskModelRecovery.
  const modelWiring: AgentComposerModelWiring = createAgentComposerModelWiring({
    catalog: options?.modelCatalog,
    session: () => resolveSession(),
    clock: () => clock(),
    tasks: () => state.tasks,
    setModelControls: (next: ModelControlsState) => {
      state = { ...state, modelControls: next };
      persistUi();
      emit();
    },
    getModelControls: () => state.modelControls,
    refresh: async () => {
      await reloadTasks();
    },
  });

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

  /** The shared seed path (split to ./agentComposerSeedPath.ts for the
   * ≤400-line file law): the convergence fold + the outcome line + the
   * honest reload, over the controller's seams. */
  const seedPath = createAgentComposerSeedPath({
    session: () => resolveSession(),
    clock: () => clock(),
    setTasks: (tasks, phase, error) => {
      state = phase === "ready"
        ? { ...state, tasks, tasksPhase: "ready", tasksError: null }
        : { ...state, tasksPhase: "error", tasksError: error };
    },
  });
  const seed = seedPath.seed;
  const taskOutcomeLine = seedPath.taskOutcomeLine;
  const reloadTasks = seedPath.reloadTasks;

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

      // (P21-B, D2) The pending intake ask OWNS this text: the user's
      // reply is captured through the mission plane (fail-closed) and
      // the conversation stays in the ask loop — NEEDS_INPUT gates the
      // journey until the intent compiles.
      if (await intake.handleSendText(text)) {
        await reloadTasks();
        setState({ sendPhase: "idle" });
        return;
      }

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
        await intake.attachForSeed(outcome.task);
      }
      await reloadTasks();
      setState({ sendPhase: "idle" });
    },

    async seedFromSurface(seedInput: AgentComposerSurfaceSeed): Promise<void> {
      const note = seedInput.originNote.trim();
      // The floating panel's visibility after the seed: default OPEN; a
      // surface with its OWN embedded panel (openPanel: false) keeps the
      // current mode — the seed + transcript land in the shared state
      // either way (the convergence law is about the orchestration,
      // never about which panel renders it).
      const nextMode = seedInput.openPanel === false ? state.mode : "open";
      if (note.length === 0) {
        return;
      }
      try {
        scanAgentTranscriptText(note);
      } catch (thrown: unknown) {
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        appendEntries([{ kind: "COMPOSER_ERROR", text: message }], clock());
        setState({ mode: nextMode, entryArea: seedInput.area });
        return;
      }
      appendEntries(
        [{ kind: "SURFACE_ACTION", text: `From the ${seedInput.area} area: ${note}` }],
        clock(),
      );
      setState({ mode: nextMode, entryArea: seedInput.area, sendPhase: "sending" });

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
        await intake.attachForSeed(outcome.task);
      }
      await reloadTasks();
      setState({ sendPhase: "idle" });
    },

    async cancelTask(taskId: string): Promise<void> {
      // The close path (split to ./agentComposerTaskClose.ts for the
      // ≤400-line file law): zero financial authority — an orchestration
      // record close with the monotonic-terminal law surfaced honestly.
      await cancelAgentComposerTask(
        {
          session: () => resolveSession(),
          clock: () => clock(),
          appendEntries,
          persistUi: () => persistUi(),
          emit: () => emit(),
        },
        taskId,
        state.tasks,
      );
      await reloadTasks();
      persistUi();
      emit();
    },

    async refresh(): Promise<void> {
      await reloadTasks();
      // (P21-B, D4) taskModelRecovery: the controls rehydrate from the
      // persisted task record (the newest resumable task's modelSelection).
      modelWiring.recoverModelSelection(state.tasks);
      // (P21-B, D2) The reload path: when a mission plane is bound, a
      // FRESH binding re-derives the task↔mission link from the task's
      // persisted events and re-surfaces the pending ask (idempotent —
      // a binding that already holds its mission never re-asks).
      const intakeBinding = intake.resolve();
      if (intakeBinding !== undefined) {
        const latest = state.tasks.find(
          (task) => task.resumable && task.intentLine.startsWith("Payment mission"),
        );
        const record = latest !== undefined ? await resolveSession().taskDetail(latest.id) : null;
        if (record !== null) {
          await intake.resume(record);
        }
      }
      emit();
    },

    // P17-C (ADR-0010 D5): the ONE composition seam for hosts binding a
    // route-planning session over the SAME store (never a second adapter).
    sessionPort(): AgentTaskSessionPort {
      return resolveSession();
    },

    async loadModelCatalog(): Promise<void> {
      await modelWiring.loadModelCatalog();
    },

    async selectModel(selection: AgentTaskModelSelectionPin): Promise<void> {
      await modelWiring.selectModel(selection);
    },
  };
}

/* ------- the shared seams (split to ./agentComposerShared.ts) ------- */

export {
  bindSharedMissionIntakePlane,
  resetSharedAgentComposerController,
  resetSharedMissionIntakePlane,
  sharedAgentComposerController,
  sharedMissionIntakePlane,
} from "./agentComposerShared.js";
