/**
 * @payswap/app — the CONVERSATION PROJECTIONS (P24-3, pure).
 *
 * The view-model folds for the composer's conversation section: the
 * entry views (speaker-labeled, people-language), the PUBLIC history
 * rebuild for resume, and the pinned honest notes. No React, no DOM,
 * no ambient state — the agentComposerProjection.ts discipline.
 *
 * HONESTY LAWS:
 * - Only user-visible events project: user text, assistant text, tool
 *   calls/results, prepared-action lifecycle and notes. There is no
 *   reasoning/chain-of-thought kind anywhere in the vocabulary.
 * - On resume, prior tool results replay as their BOUNDED SUMMARIES
 *   (the full framed payloads are transient; the record carries the
 *   sanitized summary — data minimization by construction).
 * - UNKNOWN renders as UNKNOWN; truncations are stated, never silent.
 */

import type { AgentConversationLogEvent } from "./conversationLogEvents.js";
import type { AgentConversationMessage } from "./modelConversationPort.js";
import type { AgentConversationEventKindPin } from "./conversationLogEvents.js";
import type {
  StripeActionExecutionOutcomePin,
  StripePreparedActionPin,
} from "./stripePreparedActionPins.js";

/* --------------------------- the pinned notes ------------------------ */

/** The honest note when the plane is bound but the task has no model selection. */
export const AGENT_CONVERSATION_NO_SELECTION_NOTE =
  "This task has no model recorded yet — the conversation engine invokes exactly the model you select and record with the task, and never substitutes one silently. Pick a model in the model controls above; the conversation then continues with that selection." as const;

/** The honesty note rendered while the conversation runs (the bounded loop). */
export const AGENT_CONVERSATION_RUNNING_NOTE =
  "The selected model is working — it may call the tools registered for this task (each call and result is recorded below), and everything is bounded: tool steps, byte budgets, per-turn timeout and loop detection all stop the run honestly if exceeded." as const;

/** The confirmation note on the pending-action card (the human gate). */
export const AGENT_CONVERSATION_CONFIRMATION_NOTE =
  "Nothing executes until you confirm this exact preview. Confirming binds your approval to this digest — if any parameter or the account context changes afterwards, the approval is invalid and a fresh preview is required. The host, never the model, mints the single-use authorization." as const;

/* ----------------------------- entry views --------------------------- */

/** Who a conversation line speaks for. */
export type AgentConversationSpeaker = "you" | "model" | "system";

/** One projected conversation entry (the section renders these in order). */
export interface AgentConversationEntryView {
  readonly id: string;
  readonly at: string;
  readonly kind: AgentConversationEventKindPin;
  readonly speaker: AgentConversationSpeaker;
  /** The people-language line (bounded; secrets never reach the writer). */
  readonly text: string;
}

/** Project the log into ordered entry views (append order). */
export function projectConversationEntries(
  events: readonly AgentConversationLogEvent[],
): readonly AgentConversationEntryView[] {
  return events.map((logEvent) => ({
    id: logEvent.id,
    at: logEvent.at,
    kind: logEvent.event.kind,
    speaker: speakerOf(logEvent.event.kind),
    text: entryText(logEvent),
  }));
}

function speakerOf(kind: AgentConversationEventKindPin): AgentConversationSpeaker {
  if (kind === "USER_TEXT") {
    return "you";
  }
  if (kind === "ASSISTANT_TEXT") {
    return "model";
  }
  return "system";
}

/** The people-language line for one event (honest, bounded, never raw payloads). */
function entryText(logEvent: AgentConversationLogEvent): string {
  const event = logEvent.event;
  switch (event.kind) {
    case "CONVERSATION_STARTED":
      return `Conversation started with the recorded model ${event.selection.providerId}/${event.selection.modelId} (${event.selection.reasoningLevel}).`;
    case "USER_TEXT":
      return event.text;
    case "ASSISTANT_TEXT":
      return event.text;
    case "TOOL_CALL":
      return `Tool call ${event.toolName} (${event.callId}) with ${event.argsEcho}.`;
    case "TOOL_RESULT": {
      const suffix = event.truncated === true ? " [truncated]" : "";
      return `Tool result ${event.toolName} (${event.callId}) — ${event.status}: ${event.summary}${suffix}`;
    }
    case "PREPARED_ACTION_PENDING": {
      const action = event.action as StripePreparedActionPin;
      return `Action proposed: ${action.operationId} (preview ${action.preparedActionId}) — awaiting your confirmation; nothing executes until you decide.`;
    }
    case "PREPARED_ACTION_CONFIRMED":
      return `You confirmed action ${event.preparedActionId}; the host minted authorization ${event.authorizationId}.`;
    case "PREPARED_ACTION_REFUSED":
      return `You refused action ${event.preparedActionId} — the action is dead and nothing was executed.`;
    case "PREPARED_ACTION_EXPIRED":
      return `Action ${event.preparedActionId} expired before confirmation — it will never execute; ask for a fresh preview if you still want it.`;
    case "EXECUTION_OUTCOME": {
      const outcome = event.outcome as StripeActionExecutionOutcomePin;
      return `Execution outcome for ${event.preparedActionId}: ${outcomeLine(outcome.kind)}.`;
    }
    case "CONVERSATION_NOTE":
      return event.note;
    case "ACCOUNT_CONTEXT_BOUND":
      return event.scopeChange === "INITIAL"
        ? `Conversation bound to Stripe connection ${event.connectionId}.`
        : `Account context changed by your explicit action to connection ${event.connectionId} — pending actions from the previous context do not carry over.`;
    default:
      return "Unknown conversation event.";
  }
}

/** The outcome people-language (UNKNOWN stays UNKNOWN — INV-04). */
export function outcomeLine(kind: string): string {
  switch (kind) {
    case "CONFIRMED":
      return "CONFIRMED — the provider accepted the effect; read-back evidence recorded";
    case "UNKNOWN":
      return "UNKNOWN — the effect may or may not have happened; reconciliation (provider read-back) is required before any retry, and no success or failure is claimed";
    case "FAILED":
      return "FAILED — the host refused or rejected the action before any external effect";
    case "PROVIDER_REJECTED":
      return "PROVIDER REJECTED — Stripe returned an explicit rejection";
    default:
      return `outcome ${String(kind)}`;
  }
}

/* ------------------------- the resume history ------------------------ */

/**
 * Rebuild the PUBLIC message history from the log (the loop's resume
 * input): user/assistant text as-is; tool calls as an assistant
 * toolCalls message followed by tool messages carrying the BOUNDED
 * summaries (the full framed payloads are transient by the data-
 * minimization law). A trailing unanswered TOOL_CALL (a paused
 * prepare) is NOT auto-answered here — the confirm/refuse path owns
 * its result.
 */
export function conversationHistoryFromLog(
  events: readonly AgentConversationLogEvent[],
): readonly AgentConversationMessage[] {
  const messages: AgentConversationMessage[] = [];
  let assistantText: string | undefined;
  let pendingCalls: { id: string; name: string; input: unknown }[] = [];

  /** Emit the buffered assistant turn — its tool calls, else its text. */
  const flushAssistant = (): void => {
    if (pendingCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: assistantText ?? "",
        toolCalls: [...pendingCalls],
      });
    } else if (assistantText !== undefined && assistantText.length > 0) {
      messages.push({ role: "assistant", content: assistantText });
    }
    assistantText = undefined;
    pendingCalls = [];
  };

  for (const logEvent of events) {
    const event = logEvent.event;
    switch (event.kind) {
      case "USER_TEXT":
        flushAssistant();
        messages.push({ role: "user", content: event.text });
        break;
      case "ASSISTANT_TEXT":
        assistantText = assistantText === undefined ? event.text : `${assistantText}\n\n${event.text}`;
        break;
      case "TOOL_CALL":
        pendingCalls.push({ id: event.callId, name: event.toolName, input: safeParseEcho(event.argsEcho) });
        break;
      case "TOOL_RESULT":
        // The calls precede their results (protocol order): the buffered
        // assistant turn with its toolCalls is emitted FIRST, then the
        // result. The confirm/refuse/expiry path answers a paused
        // prepare call exactly once — never duplicated here and in the
        // continuation input (the cycle dedupes against pending results).
        flushAssistant();
        messages.push({
          role: "tool",
          toolCallId: event.callId,
          content: `[prior tool result — ${event.status}] ${event.summary}`,
        });
        break;
      default:
        break;
    }
  }
  // A trailing PAUSED call group (a prepare awaiting the human decision)
  // still enters history as the assistant toolCalls message — the
  // continuation's pending result then completes the protocol sequence.
  flushAssistant();
  return messages;
}

/** The trailing TOOL_CALL with no result yet (the paused prepare call). */
export function unansweredToolCallOf(
  events: readonly AgentConversationLogEvent[],
): { readonly callId: string; readonly toolName: string } | undefined {
  const answered = new Set<string>();
  let last: { callId: string; toolName: string } | undefined;
  for (const logEvent of events) {
    const event = logEvent.event;
    if (event.kind === "TOOL_CALL") {
      last = { callId: event.callId, toolName: event.toolName };
    } else if (event.kind === "TOOL_RESULT") {
      answered.add(event.callId);
    }
  }
  return last !== undefined && !answered.has(last.callId) ? last : undefined;
}

/** Parse the args echo back for history rebuild (tolerant: the raw echo on failure). */
function safeParseEcho(echo: string): unknown {
  try {
    return JSON.parse(echo) as unknown;
  } catch {
    return echo;
  }
}
