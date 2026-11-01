/**
 * @payswap/app — the CONVERSATION USER-GESTURE ACTIONS (P24-3,
 * ADR-0017 D10 + §3.4).
 *
 * The HUMAN-event paths of the prepared-action law and the account
 * selector — each is a controller verb reachable ONLY from a user
 * gesture (the panel's buttons/select, or an EXACT conversational
 * yes/no routed by the pinned phrase table), NEVER from model-side
 * flow:
 *
 * - confirmPreparedAction: the D10 gate chain — re-inspect the CURRENT
 *   host record, assert expiry + digest + account context (a parameter
 *   or context change after approval = a NEW preview required), have
 *   the HOST mint the single-use authorization, execute, record the
 *   outcome (UNKNOWN stays UNKNOWN) and CONTINUE the model with the
 *   execution result so it can present the read-back.
 * - refusePreparedAction: the refusal path — the action DIES, recorded;
 *   nothing executes; the pending tool call is answered with the
 *   refusal so the protocol stays complete.
 * - bindAccountContext: the explicit user-authorized scope change.
 * - cancelRunning: the user abort.
 *
 * FAILURE HONESTY (D11): a host-side throw in any verb surfaces as a
 * recorded note — never an unhandled rejection, never a fabricated
 * outcome.
 */

import type { AgentConversationLogInput } from "./conversationLogEvents.js";
import { unansweredToolCallOf } from "./agentConversationProjection.js";
import { boundStripeToolOutput } from "./stripeToolOutput.js";
import {
  assertConfirmable,
  findActionCard,
  foldPreparedActionCards,
  PreparedActionFlowError,
} from "./preparedActionFlow.js";
import { foldAccountBinding } from "./taskAccountContext.js";
import type { AgentConversationContext, ConversationCycleRunner } from "./agentConversationCycle.js";
import type { AgentPendingToolResult } from "./conversationLoopTypes.js";

export interface AgentConversationActions {
  /** The user-gesture confirm path (the human gate of the two-phase law). */
  confirmPreparedAction(preparedActionId: string): Promise<void>;
  /** The user-gesture refusal (the action dies, recorded). */
  refusePreparedAction(preparedActionId: string): Promise<void>;
  /** The explicit user-authorized account scope change (bind or switch). */
  bindAccountContext(connectionId: string): Promise<void>;
  /** The user abort of a running loop. */
  cancelRunning(): void;
}

/** The extra seams the actions need beyond the shared context. */
export interface AgentConversationActionExtras {
  readonly getConversation: () => { readonly taskId?: string; readonly error?: string };
  readonly refreshTasks: () => Promise<void>;
}

export function createAgentConversationActions(
  context: AgentConversationContext,
  cycle: ConversationCycleRunner,
  extras: AgentConversationActionExtras,
): AgentConversationActions {
  /** Run one user-gesture verb with typed failure honesty. */
  const guarded = async (taskId: string, run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      await context.appendLog(taskId, {
        kind: "CONVERSATION_NOTE",
        note: `The action path failed before anything was executed: ${message} — the recorded state stands; nothing was left running.`,
      });
      await context.projectState(taskId);
    }
  };

  return {
    async confirmPreparedAction(preparedActionId): Promise<void> {
      const taskId = extras.getConversation().taskId;
      if (taskId === undefined) {
        return;
      }
      await guarded(taskId, () => runConfirm(context, cycle, extras, taskId, preparedActionId));
    },

    async refusePreparedAction(preparedActionId): Promise<void> {
      const taskId = extras.getConversation().taskId;
      if (taskId === undefined) {
        return;
      }
      await guarded(taskId, () => runRefuse(context, taskId, preparedActionId));
    },

    async bindAccountContext(connectionId): Promise<void> {
      const taskId = extras.getConversation().taskId;
      if (taskId === undefined) {
        return;
      }
      await guarded(taskId, () => runBind(context, taskId, connectionId));
    },

    cancelRunning(): void {
      cycle.requestAbort();
    },
  };
}

/* ---------------------- the verb bodies (split) ---------------------- */

async function runConfirm(
  context: AgentConversationContext,
  cycle: ConversationCycleRunner,
  extras: AgentConversationActionExtras,
  taskId: string,
  preparedActionId: string,
): Promise<void> {
  const fail = async (message: string): Promise<void> => {
    await context.appendLog(taskId, { kind: "CONVERSATION_NOTE", note: message });
    await context.projectState(taskId);
  };
  const task = await context.session().taskDetail(taskId);
  if (task === null || task.modelSelection === undefined) {
    return;
  }
  const log = await context.session().conversationLog(taskId);
  const card = findActionCard(log, preparedActionId);
  if (card === undefined || card.phase !== "PENDING") {
    await fail(`No action '${preparedActionId}' is awaiting your confirmation — nothing was executed.`);
    return;
  }
  const now = context.clock();
  // The re-inspect gate: the CURRENT host record, not the recorded
  // one — a parameter change after approval surfaces here.
  const inspected = await context.plane.preparedActions.inspect(preparedActionId);
  if (inspected === null) {
    await fail(`The prepared action '${preparedActionId}' is no longer known to the host — nothing was executed; ask for a fresh preview if you still want it.`);
    return;
  }
  const binding = foldAccountBinding(log);
  try {
    assertConfirmable(inspected, card.action.digest, binding?.connectionId ?? "", now);
  } catch (thrown) {
    if (thrown instanceof PreparedActionFlowError) {
      await fail(thrown.message);
      return;
    }
    throw thrown;
  }
  // The HOST mints the single-use authorization (the model never can).
  const authorized = await context.plane.preparedActions.authorize({
    preparedActionId,
    principalId: context.plane.principalId(),
    confirmedDigest: card.action.digest,
  });
  if (!authorized.ok) {
    await fail(`The host refused to authorize this action: ${authorized.reason} — nothing was executed.`);
    return;
  }
  await context.appendLog(taskId, {
    kind: "PREPARED_ACTION_CONFIRMED",
    preparedActionId,
    digest: card.action.digest,
    authorizationId: authorized.authorization.authorizationId,
  });
  // Execution through the host; the outcome is recorded VERBATIM.
  const outcome = await context.plane.preparedActions.execute(
    authorized.authorization.authorizationId,
  );
  await context.appendLog(taskId, { kind: "EXECUTION_OUTCOME", preparedActionId, outcome });
  const pendingCall = unansweredToolCallOf(log);
  if (pendingCall !== undefined && pendingCall.callId.length > 0) {
    await context.appendLog(taskId, toolResultForOutcome(pendingCall, preparedActionId, outcome));
  }
  await context.projectState(taskId);
  // Continue the model with the execution result (the read-back
  // presentation): the model sees the OUTCOME, never an authorization.
  const pendingToolResults: readonly AgentPendingToolResult[] = pendingCall !== undefined
    ? [{
        callId: pendingCall.callId,
        toolName: pendingCall.toolName,
        status: outcomeStatusOf(outcome),
        resultText: boundStripeToolOutput({
          executed: true,
          preparedActionId,
          outcome,
          note: "The human confirmed the exact preview; the host minted the authorization and executed. Present the outcome honestly — UNKNOWN means the effect may or may not have happened and reconciliation is required.",
        }).framed,
      }]
    : [];
  await cycle.runCycle(task, { pendingToolResults });
  await extras.refreshTasks();
}

async function runRefuse(
  context: AgentConversationContext,
  taskId: string,
  preparedActionId: string,
): Promise<void> {
  const log = await context.session().conversationLog(taskId);
  const cards = foldPreparedActionCards(log);
  const card = cards.find((entry) => entry.preparedActionId === preparedActionId);
  if (card === undefined || card.phase !== "PENDING") {
    return;
  }
  await context.appendLog(taskId, { kind: "PREPARED_ACTION_REFUSED", preparedActionId });
  const pendingCall = unansweredToolCallOf(log);
  if (pendingCall !== undefined) {
    await context.appendLog(taskId, {
      kind: "TOOL_RESULT",
      callId: pendingCall.callId,
      toolName: pendingCall.toolName,
      status: "ERROR",
      summary: "refused by the user — the action was not executed and is now dead",
    });
  }
  await context.projectState(taskId);
}

async function runBind(
  context: AgentConversationContext,
  taskId: string,
  connectionId: string,
): Promise<void> {
  const accounts = await context.accountsCache();
  const account = accounts.find((entry) => entry.connectionId === connectionId);
  if (account === undefined) {
    await context.appendLog(taskId, {
      kind: "CONVERSATION_NOTE",
      note: `Connection '${connectionId}' is not available to this task — no binding changed.`,
    });
    await context.projectState(taskId);
    return;
  }
  const log = await context.session().conversationLog(taskId);
  const current = foldAccountBinding(log);
  const event: AgentConversationLogInput = {
    kind: "ACCOUNT_CONTEXT_BOUND",
    connectionId,
    scopeChange: current === undefined ? "INITIAL" : "USER_AUTHORIZED_SWITCH",
  };
  await context.appendLog(taskId, event);
  await context.projectState(taskId);
}

/** The tool-result record for an executed action's pending call. */
function toolResultForOutcome(
  pendingCall: { readonly callId: string; readonly toolName: string },
  preparedActionId: string,
  outcome: { readonly kind: string },
): AgentConversationLogInput {
  return {
    kind: "TOOL_RESULT",
    callId: pendingCall.callId,
    toolName: pendingCall.toolName,
    status: outcomeStatusOf(outcome),
    summary: `prepared action ${preparedActionId} executed — outcome ${outcome.kind}`,
  };
}

function outcomeStatusOf(outcome: { readonly kind: string }): "OK" | "ERROR" | "UNKNOWN" {
  if (outcome.kind === "CONFIRMED") {
    return "OK";
  }
  if (outcome.kind === "UNKNOWN") {
    return "UNKNOWN";
  }
  return "ERROR";
}
