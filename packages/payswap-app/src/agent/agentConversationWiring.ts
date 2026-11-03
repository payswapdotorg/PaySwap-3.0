/**
 * @payswap/app — the COMPOSER↔CONVERSATION WIRING (P24-3, ADR-0017
 * D8; the agentComposerIntake.ts / agentComposerModelControls.ts
 * pattern, split for the ≤400-line file law).
 *
 * The controller-side half of the selected-model conversation binding:
 * the send-path ownership (a seeded task with a recorded model starts
 * the bounded loop; an UNKNOWN follow-up reaches the ACTIVE
 * conversation) and the resume fold (public history + pending states +
 * expiry + reconcile cards). The bounded cycle lives in
 * ./agentConversationCycle.ts; the user-gesture confirm/refuse/bind
 * paths live in ./agentConversationActions.ts.
 *
 * LAWS: ZERO FINANCIAL AUTHORITY; the SAME persisted selection every
 * cycle (no default, no substitution); APPEND-ONLY through the ONE
 * session port; the deterministic intent router stays the INTAKE
 * helper (the controller calls this wiring only after routing/seeding).
 * While a prepared action is pending, the conversation is BLOCKED for
 * the decision: an exact yes/no decides it (the pinned phrase table,
 * never model interpretation — ./conversationConfirmationPhrases.ts);
 * anything else gets the honest decide-first note (the loop stays
 * paused; nothing executes by itself).
 */

import { isTerminalAgentTaskStatusPin, type AgentTaskPin } from "../lib/agent-task-pins.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";
import type { AgentConversationLogEvent, AgentConversationLogInput } from "./conversationLogEvents.js";
import type { AgentModelConversationPort } from "./modelConversationPort.js";
import {
  AGENT_CONVERSATION_NO_SELECTION_NOTE,
  projectConversationEntries,
  unansweredToolCallOf,
} from "./agentConversationProjection.js";
import {
  pendingPreparedActionOf,
  reconcileCardsOf,
  type PreparedActionCardView,
} from "./preparedActionFlow.js";
import { boundAccountFacts } from "./taskAccountContext.js";
import type {
  StripeAccountFactsPin,
  StripeAccountFactsPort,
  StripeToolCataloguePort,
} from "./stripeToolCataloguePort.js";
import type {
  StripePreparedActionPort,
  StripeResourceReadPort,
} from "./stripeToolExecutionPort.js";
import {
  createConversationCycleRunner,
  type AgentConversationContext,
} from "./agentConversationCycle.js";
import { createAgentConversationActions, type AgentConversationActions } from "./agentConversationActions.js";
import {
  matchConversationConfirmation,
  tierAllowsConversationalConfirmation,
} from "./conversationConfirmationPhrases.js";
import { expiredPendingCards } from "./preparedActionFlow.js";

/* ------------------------------- the plane ---------------------------- */

/** The host-bound bundle the composition root supplies (the P24-D wiring point). */
export interface AgentConversationPlane {
  readonly model: AgentModelConversationPort;
  readonly catalogue: StripeToolCataloguePort;
  readonly accounts: StripeAccountFactsPort;
  readonly reads: StripeResourceReadPort;
  readonly preparedActions: StripePreparedActionPort;
  /** The authenticated human's principal reference (host-resolved). */
  readonly principalId: () => string;
}

/* -------------------------------- the state --------------------------- */

/** The composer-projected conversation state (the section's view model). */
export interface AgentConversationState {
  readonly phase: "UNBOUND" | "IDLE" | "RUNNING" | "AWAITING_CONFIRMATION";
  readonly taskId?: string;
  readonly entries: readonly ReturnType<typeof projectConversationEntries>[number][];
  readonly pendingAction?: PreparedActionCardView;
  readonly reconcileCards: readonly PreparedActionCardView[];
  readonly accountContext?: StripeAccountFactsPin;
  readonly availableAccounts: readonly StripeAccountFactsPin[];
  readonly modelNote?: string;
  readonly error?: string;
}

export const AGENT_CONVERSATION_UNBOUND_STATE: AgentConversationState = Object.freeze({
  phase: "UNBOUND",
  entries: [],
  reconcileCards: [],
  availableAccounts: [],
});

/** The honest note when text arrives while an action is still pending. */
export const AGENT_CONVERSATION_DECIDE_FIRST_NOTE =
  "An action is awaiting your decision — confirm or refuse it (the card above, or an exact 'yes' / 'no' in chat for actions that allow conversational confirmation) before the conversation continues. Nothing executes by itself, and the action expires on its own if left undecided." as const;

/** The controller seams the wiring rides. */
export interface AgentConversationHost {
  readonly session: () => AgentTaskSessionPort;
  readonly clock: () => string;
  readonly setConversation: (next: AgentConversationState) => void;
  readonly getConversation: () => AgentConversationState;
  readonly refreshTasks: () => Promise<void>;
  readonly emit: () => void;
}

/** The wiring the controller consumes (send paths + the user gestures). */
export interface AgentConversationWiring extends AgentConversationActions {
  /** Post-seed: start (or continue) the model conversation on the task. */
  startTurnForTask(task: AgentTaskPin, userText: string): Promise<void>;
  /** UNKNOWN-route follow-up: true when an ACTIVE conversation consumed the text. */
  handleFollowUpText(text: string): Promise<boolean>;
  /** Reload path: reattach to the newest resumable conversation task + replay
   * (the FULL task pins are read from the ONE session port). */
  resumeFromTasks(): Promise<void>;
}

/* ------------------------------ the wiring ---------------------------- */

export function createAgentConversationWiring(
  plane: AgentConversationPlane | undefined,
  host: AgentConversationHost,
): AgentConversationWiring {
  let accountsCache: readonly StripeAccountFactsPin[] | undefined;

  const availableAccounts = async (): Promise<readonly StripeAccountFactsPin[]> => {
    if (plane === undefined) {
      return [];
    }
    accountsCache ??= await plane.accounts.listAccountFacts();
    return accountsCache;
  };

  const appendLog = async (taskId: string, event: AgentConversationLogInput): Promise<void> => {
    await host.session().appendConversationEvent(taskId, event, host.clock());
  };

  /** Re-project the conversation state from the task's persisted log. */
  const projectState = async (
    taskId: string,
    patch?: {
      readonly phase?: "IDLE" | "RUNNING" | "AWAITING_CONFIRMATION";
      readonly modelNote?: string;
    },
  ): Promise<readonly AgentConversationLogEvent[]> => {
    const log = await host.session().conversationLog(taskId);
    const accounts = await availableAccounts();
    // The phase is a PROJECTION of the log (never a stale memory): an
    // un-patched projection with a still-PENDING action is
    // AWAITING_CONFIRMATION — the decision window cannot be lost by a
    // mid-flow re-projection (the decide-first / bind paths rely on it).
    const pending = pendingPreparedActionOf(log);
    host.setConversation({
      phase: patch?.phase ?? (pending !== undefined ? "AWAITING_CONFIRMATION" : "IDLE"),
      taskId,
      entries: projectConversationEntries(log),
      pendingAction: pending,
      reconcileCards: reconcileCardsOf(log),
      availableAccounts: accounts,
      accountContext: boundAccountFacts(log, accounts),
      ...patch,
    });
    host.emit();
    return log;
  };

  const cycle =
    plane === undefined
      ? undefined
      : createConversationCycleRunner({
          plane,
          session: host.session,
          clock: host.clock,
          accountsCache: availableAccounts,
          appendLog,
          projectState: async (taskId, patch) => {
            await projectState(taskId, patch);
          },
          emit: host.emit,
        } satisfies AgentConversationContext);

  const actions =
    plane === undefined || cycle === undefined
      ? undefined
      : createAgentConversationActions({
          plane,
          session: host.session,
          clock: host.clock,
          accountsCache: availableAccounts,
          appendLog,
          projectState: async (taskId, patch) => {
            await projectState(taskId, patch);
          },
          emit: host.emit,
        }, cycle, {
          getConversation: host.getConversation,
          refreshTasks: host.refreshTasks,
        });

  const activeConversationTask = async (): Promise<AgentTaskPin | undefined> => {
    const taskId = host.getConversation().taskId;
    if (taskId === undefined) {
      return undefined;
    }
    const task = await host.session().taskDetail(taskId);
    return task !== null && !isTerminalAgentTaskStatusPin(task.status) ? task : undefined;
  };

  const idleActions: AgentConversationActions = {
    async confirmPreparedAction(): Promise<void> {},
    async confirmReauthPreparedAction(): Promise<void> {},
    async refusePreparedAction(): Promise<void> {},
    async bindAccountContext(): Promise<void> {},
    cancelRunning(): void {},
  };

  return {
    ...(actions ?? idleActions),

    async startTurnForTask(task, userText): Promise<void> {
      if (plane === undefined || cycle === undefined) {
        return;
      }
      accountsCache = undefined; // fresh connection facts per send (revocation honesty)
      const log = await host.session().conversationLog(task.id);
      if (log.length === 0) {
        if (task.modelSelection !== undefined) {
          await appendLog(task.id, { kind: "CONVERSATION_STARTED", selection: task.modelSelection });
        }
        await cycle.ensureAccountBinding(task.id);
      }
      // The user's request enters the conversation record ALWAYS (the
      // lineage is append-only); without a recorded model the cycle
      // cannot run — the honest note says so, never a substituted model.
      await appendLog(task.id, { kind: "USER_TEXT", text: userText });
      if (task.modelSelection === undefined) {
        await projectState(task.id, { modelNote: AGENT_CONVERSATION_NO_SELECTION_NOTE });
        return;
      }
      await cycle.runCycle(task, {});
      await host.refreshTasks();
    },

    async handleFollowUpText(text): Promise<boolean> {
      if (plane === undefined || cycle === undefined) {
        return false;
      }
      const task = await activeConversationTask();
      if (task === undefined || task.modelSelection === undefined) {
        return false;
      }
      // The conversation's model lineage starts with its FIRST model
      // turn: a task seeded before a selection was recorded gets its
      // CONVERSATION_STARTED here (the persisted selection, verbatim).
      const lineage = await host.session().conversationLog(task.id);
      if (!lineage.some((entry) => entry.event.kind === "CONVERSATION_STARTED")) {
        await appendLog(task.id, { kind: "CONVERSATION_STARTED", selection: task.modelSelection });
      }
      // The conversational decision window (§7.2 + §13.4): while an
      // action is pending, an EXACT yes/no decides it (deterministic
      // phrase table — never model interpretation); anything else gets
      // the honest decide-first note and the loop stays paused. The
      // user's exact words enter the record either way (append-only).
      const state = host.getConversation();
      if (state.phase === "AWAITING_CONFIRMATION" && actions !== undefined) {
        const pending = state.pendingAction;
        if (pending !== undefined && pending.phase === "PENDING") {
          await appendLog(task.id, { kind: "USER_TEXT", text });
          const decision = matchConversationConfirmation(text);
          if (decision === "CONFIRM" && tierAllowsConversationalConfirmation(pending.action.approvalTier)) {
            await actions.confirmPreparedAction(pending.preparedActionId);
            await host.refreshTasks();
            return true;
          }
          if (decision === "REFUSE") {
            await actions.refusePreparedAction(pending.preparedActionId);
            await host.refreshTasks();
            return true;
          }
          await appendLog(task.id, { kind: "CONVERSATION_NOTE", note: AGENT_CONVERSATION_DECIDE_FIRST_NOTE });
          await projectState(task.id);
          return true;
        }
      }
      await appendLog(task.id, { kind: "USER_TEXT", text });
      await cycle.runCycle(task, {});
      await host.refreshTasks();
      return true;
    },

    async resumeFromTasks(): Promise<void> {
      if (plane === undefined) {
        return;
      }
      accountsCache = undefined; // fresh connection facts on reattach
      const tasks = await host.session().listTasks();
      const resumable = tasks.filter((task) => !isTerminalAgentTaskStatusPin(task.status));
      const target = resumable.find((task) => task.modelSelection !== undefined);
      if (target === undefined) {
        host.setConversation({ ...AGENT_CONVERSATION_UNBOUND_STATE, phase: "IDLE" });
        host.emit();
        return;
      }
      let log = await projectState(target.id);
      // The expiry law (D10/D11): an expired pending action NEVER
      // auto-executes on resume — it is marked EXPIRED (recorded) and
      // its pending tool call is answered with the honest refusal.
      const expired = expiredPendingCards(log, host.clock());
      if (expired.length > 0) {
        const pendingCall = unansweredToolCallOf(log);
        for (const card of expired) {
          await appendLog(target.id, { kind: "PREPARED_ACTION_EXPIRED", preparedActionId: card.preparedActionId });
          if (pendingCall !== undefined) {
            await appendLog(target.id, {
              kind: "TOOL_RESULT",
              callId: pendingCall.callId,
              toolName: pendingCall.toolName,
              status: "ERROR",
              summary: "the prepared action expired before confirmation — nothing executed; ask for a fresh preview if you still want it",
            });
          }
        }
        log = await projectState(target.id);
      }
      void log;
    },
  };
}
