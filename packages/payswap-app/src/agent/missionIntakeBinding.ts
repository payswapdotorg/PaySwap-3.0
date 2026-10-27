/**
 * @payswap/app — the COMPOSER↔MISSION INTAKE BINDING (P21-B, ADR-0014
 * D2).
 *
 * The state machine that binds the composer's PAYMENT_MISSION journey to
 * the REAL mission plane through the pinned MissionIntakePlanePort:
 *
 * - attachTask: when the composer seeds (or resumes) a PAYMENT_MISSION
 *   task, the binding seeds the mission through the plane (the origin
 *   stays host-pinned — the port carries no origin), records the asks +
 *   captures on the TASK timeline (correlationRef = missionId: the app
 *   task store is the journey's session record) and surfaces each ask
 *   as a conversation turn;
 * - handleSendText: while an ask is pending, the user's next text is
 *   the answer — parsed STRICTLY (./missionIntakeReply.ts), captured
 *   through the plane (fail-closed: the plane's typed refusal surfaces
 *   as the honest error line and the ask repeats; nothing is coerced),
 *   then the next ask surfaces; when the intake completes, the binding
 *   reports COMPLETE (route planning stays gated on the compiled
 *   intent — NEEDS_INPUT until then);
 * - resume: the link re-derives from the task's PERSISTED events (the
 *   reload path), then the pending ask re-derives from the plane's own
 *   deterministic order — never from a parallel intake state.
 *
 * NO PARALLEL STATE MODEL: the ask order is the PLANE's own (askNextField
 * is the only ask source); the task timeline is the only record. ZERO
 * FINANCIAL AUTHORITY: the binding seeds, asks and captures demand-side
 * records only.
 */

import { ambientMutationClock } from "../console/useWorkspaceStore.js";
import type { AgentTaskPin } from "../lib/agent-task-pins.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";
import {
  MISSION_INTAKE_UNBOUND_STATE,
  type MissionIntakePhase,
  type MissionIntakePlanePort,
  type MissionIntakeState,
} from "./missionIntakePins.js";
import { parseMissionIntakeReply, projectMissionLink } from "./missionIntakeReply.js";

/** One transcript addition the binding asks the host controller to render. */
export interface MissionIntakeEmitEntry {
  readonly kind: "AGENT_REPLY" | "COMPOSER_ERROR";
  readonly text: string;
  readonly taskId?: string;
}

export interface MissionIntakeBindingOptions {
  /** The mission-plane port (the composition root binds the REAL channel adapter). */
  readonly plane: MissionIntakePlanePort;
  /** The composer's ONE task-session port (the only mutation surface of task records). */
  readonly session: AgentTaskSessionPort;
  /** Injectable clock — ISO-8601 UTC instants (default: the ONE pinned ambient site). */
  readonly clock?: () => string;
  /** The transcript surface (the controller wires its appendEntries + notify here). */
  readonly emit: (entries: readonly MissionIntakeEmitEntry[]) => void;
  /** The state-change notification (the controller re-projects its state). */
  readonly notify: () => void;
}

export interface MissionIntakeBinding {
  /** The current projected state (the composer UI's view). */
  state(): MissionIntakeState;
  /** Seed (or re-attach) the mission for a seeded/resumed PAYMENT_MISSION task. */
  attachTask(task: AgentTaskPin): Promise<void>;
  /** Handle a composer send while an ask is pending: true when the text was consumed as an answer. */
  handleSendText(text: string): Promise<boolean>;
  /** Re-derive the linked mission + pending ask from a task's persisted events (the reload path). */
  resume(task: AgentTaskPin): Promise<void>;
}

interface BindingState {
  phase: MissionIntakePhase;
  missionId: string | null;
  taskId: string | null;
  pendingFieldId: string | null;
  pendingQuestion: string | null;
  error: string | null;
}

const IDLE_STATE: BindingState = {
  phase: "IDLE", missionId: null, taskId: null, pendingFieldId: null, pendingQuestion: null, error: null,
};

function toState(state: BindingState): MissionIntakeState {
  return {
    phase: state.phase,
    ...(state.missionId !== null ? { missionId: state.missionId } : {}),
    ...(state.taskId !== null ? { taskId: state.taskId } : {}),
    ...(state.pendingFieldId !== null && state.pendingQuestion !== null
      ? { pendingAsk: { fieldId: state.pendingFieldId, question: state.pendingQuestion } }
      : {}),
    ...(state.error !== null ? { error: state.error } : {}),
  };
}

/**
 * Create the binding. The controller owns the emit/notify seams so the
 * transcript and the projected state stay single-sourced in the composer.
 */
export function createMissionIntakeBinding(options: MissionIntakeBindingOptions): MissionIntakeBinding {
  const { plane, session, emit, notify } = options;
  const clock = options.clock ?? ambientMutationClock;
  let state: BindingState = { ...IDLE_STATE };

  const commit = (next: Partial<BindingState>): void => {
    state = { ...state, ...next };
    notify();
  };

  /** Surface the next ask (the plane's own deterministic order). */
  const askNext = async (): Promise<void> => {
    const missionId = state.missionId;
    if (missionId === null || state.taskId === null) {
      return;
    }
    try {
      const ask = await plane.askNextField(missionId);
      if (ask === null) {
        commit({ phase: "COMPLETE", pendingFieldId: null, pendingQuestion: null, error: null });
        return;
      }
      // The ask lands on the TASK timeline (correlationRef = missionId —
      // the persisted link) AND as a conversation turn.
      await session.appendTaskEvent(
        state.taskId,
        "MISSING_FIELD_ASKED",
        clock(),
        `Mission intake asked (${ask.fieldId}): ${ask.question}`,
        missionId,
      );
      commit({ phase: "ASKING", pendingFieldId: ask.fieldId, pendingQuestion: ask.question, error: null });
      emit([
        { kind: "AGENT_REPLY", text: ask.question, ...(state.taskId !== null ? { taskId: state.taskId } : {}) },
      ]);
    } catch (thrown: unknown) {
      commit({ phase: "ERROR", error: thrown instanceof Error ? thrown.message : String(thrown) });
      emit([{ kind: "COMPOSER_ERROR", text: state.error ?? "the mission plane refused the ask" }]);
    }
  };

  return {
    state: () => toState(state),

    async attachTask(task) {
      if (task.intent.kind !== "PAYMENT_MISSION") {
        return;
      }
      // A task that already carries a linked mission resumes it (the
      // persisted link is the session record — never a second mission).
      const linked = projectMissionLink(task);
      if (linked !== null) {
        state = { ...IDLE_STATE, phase: "ASKING", missionId: linked, taskId: task.id };
        await askNext();
        return;
      }
      try {
        const outcome = await plane.seedMission({
          direction: task.intent.direction,
          goalStatement: task.intent.goalStatement,
        });
        state = { ...IDLE_STATE, phase: "ASKING", missionId: outcome.missionId, taskId: task.id };
        await askNext();
      } catch (thrown: unknown) {
        commit({ phase: "ERROR", error: thrown instanceof Error ? thrown.message : String(thrown) });
        emit([{ kind: "COMPOSER_ERROR", text: state.error ?? "the mission plane refused the seed" }]);
      }
    },

    async handleSendText(text) {
      if (state.pendingFieldId === null || state.missionId === null || state.taskId === null) {
        return false;
      }
      const fieldId = state.pendingFieldId;
      const parsed = parseMissionIntakeReply(fieldId, text);
      if (!parsed.ok) {
        // The STRICT refusal: the honest error line names the accepted
        // format; the ask repeats; nothing is captured, nothing coerced.
        commit({ phase: "ASKING", error: parsed.message });
        emit([{ kind: "COMPOSER_ERROR", text: parsed.message }]);
        return true;
      }
      try {
        commit({ phase: "CAPTURING", error: null });
        await plane.captureField(state.missionId, fieldId, parsed.value);
        await session.appendTaskEvent(
          state.taskId,
          "FIELD_CAPTURED",
          clock(),
          `Mission intake captured (${fieldId})`,
          state.missionId,
        );
        commit({ pendingFieldId: null, pendingQuestion: null });
        await askNext();
      } catch (thrown: unknown) {
        // The plane's own fail-closed law surfaced: the ask repeats.
        commit({ phase: "ASKING", pendingFieldId: fieldId, error: thrown instanceof Error ? thrown.message : String(thrown) });
        emit([{ kind: "COMPOSER_ERROR", text: state.error ?? "the mission plane refused the capture" }]);
      }
      return true;
    },

    async resume(task) {
      if (task.intent.kind !== "PAYMENT_MISSION") {
        return;
      }
      // Idempotent by construction: a binding that already holds its
      // mission (attached or resumed) never re-asks on refresh — the
      // pending ask is the PLANE's own current state, re-derived once.
      if (state.missionId !== null) {
        return;
      }
      const linked = projectMissionLink(task);
      if (linked === null) {
        state = { ...IDLE_STATE };
        notify();
        return;
      }
      state = { ...IDLE_STATE, phase: "ASKING", missionId: linked, taskId: task.id };
      await askNext();
    },
  };
}

/** The unbound binding (no plane — the honest UNBOUND projection, never a faked mission). */
export function unboundMissionIntakeBinding(): Pick<MissionIntakeBinding, "state" | "attachTask" | "handleSendText" | "resume"> {
  return {
    state: () => MISSION_INTAKE_UNBOUND_STATE,
    async attachTask() {
      /* honestly unbound: no mission can be seeded here */
    },
    async handleSendText() {
      return false;
    },
    async resume() {
      /* honestly unbound */
    },
  };
}
