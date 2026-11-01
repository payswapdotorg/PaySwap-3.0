/**
 * @payswap/app — the CONVERSATION LOOP ENGINE (P24-3, ADR-0017 D8).
 *
 * The bounded selected-model conversation loop: intake history → model
 * turn → tool calls → tool results → next model turn → … → final
 * user-visible answer. PURE over its injected seams (model port, tool
 * runtime, clock, timeout, cancellation) — deterministic under fixed
 * fakes, no ambient state, no React.
 *
 * THE D8 BOUNDS (each is a lawful stop, surfaced honestly):
 * - max model turns and max tool steps (the cutoffs),
 * - byte budgets on tool results and history,
 * - per-turn timeout (TURN_TIMEOUT — never a hang),
 * - loop detection (repeated identical tool calls stop the loop),
 * - cancellation (the user abort mid-loop: CANCELLED, partials kept),
 * - the two-phase pause (a prepared action stops the loop for a HUMAN
 *   confirmation — AWAITING_USER_CONFIRMATION; the model never
 *   executes, never mints authorizations).
 *
 * THE HONESTY LAWS (D11): the SAME persisted selection is invoked every
 * turn (no silent substitution); provider failures surface with their
 * retry classification and at most ONE bounded retry; a model that
 * cannot do tool calling is reported, never worked around; malformed
 * tool arguments and invalid tool names return typed error results to
 * the model (bounded); duplicate tool-call ids are refused; UNKNOWN
 * results stay UNKNOWN. Only user-visible events are emitted — hidden
 * chain-of-thought never crosses the port (it has no kind here). The
 * streamed-turn collection + byte-budget utilities live in
 * ./conversationTurnCollector.ts (the file-law split).
 */

import {
  AgentModelConversationError,
  type AgentConversationMessage,
  type AgentModelToolCallPin,
  type AgentModelTurnRequest,
} from "./modelConversationPort.js";
import type { StripePreparedActionPin } from "./stripePreparedActionPins.js";
import { stableStringify } from "./stripeToolOutput.js";
import {
  resolveLoopBudgets,
  type AgentConversationLoopInput,
  type AgentConversationLoopResult,
  type AgentConversationStreamEvent,
} from "./conversationLoopTypes.js";
import {
  boundedEcho,
  byteLength,
  collectOneTurn,
  LoopCancelled,
  summarizeResult,
  trimHistoryToBudget,
  type CollectedTurn,
} from "./conversationTurnCollector.js";
import type { AgentConversationLoopSeams } from "./conversationLoopTypes.js";

// The engine's seam contract lives in ./conversationLoopTypes.ts (the
// collector shares it without an import cycle); re-exported here for
// the wiring and the tests — the engine's public surface is unchanged.
export type { AgentConversationLoopSeams } from "./conversationLoopTypes.js";

/* ---------------------------- the engine ----------------------------- */

/**
 * Run one bounded conversation cycle. Emits stream events to `onEvent`
 * (append-only in order) and returns the final report. NEVER throws
 * for model/tool failures — every failure is an honest reason.
 */
export async function runAgentConversationLoop(
  input: AgentConversationLoopInput,
  seams: AgentConversationLoopSeams,
  onEvent: (event: AgentConversationStreamEvent) => void,
): Promise<AgentConversationLoopResult> {
  const budgets = resolveLoopBudgets(input.budgets);

  // The message stack: history + the new user message + pending results.
  const messages: AgentConversationMessage[] = [...input.history];
  if (input.newUserText !== undefined) {
    messages.push({ role: "user", content: input.newUserText });
  }
  for (const pending of input.pendingToolResults ?? []) {
    messages.push({ role: "tool", toolCallId: pending.callId, content: pending.resultText });
  }
  trimHistoryToBudget(messages, budgets);

  if (input.selection.providerId.trim().length === 0 || input.selection.modelId.trim().length === 0) {
    return ended(messages, 0, 0, "PROVIDER_FAILURE",
      "The task has no usable model selection — a model must be selected and recorded before the conversation can run (none is substituted silently).");
  }

  // Tool-calling honesty (D11): probe the EXACT selection before asking
  // for tools; a model that cannot do tool calling is reported honestly.
  if (input.tools.length > 0) {
    try {
      const support = await seams.model.describeModelSupport(input.selection);
      if (!support.supportsToolCalling) {
        return ended(messages, 0, 0, "TOOL_CALLING_UNSUPPORTED", support.note ??
          "The model selected for this task cannot perform tool calling — no other model was substituted silently; pick a tool-calling model to continue.");
      }
    } catch (thrown) {
      return ended(messages, 0, 0, "PROVIDER_FAILURE", describeThrown(thrown));
    }
  }

  let toolSteps = 0;
  let failedCalls = 0;
  let resultBytes = 0;
  let turns = 0;
  let providerRetries = 0;
  const fingerprints = new Map<string, number>();
  const seenCallIds = new Set<string>();

  while (true) {
    if (seams.isAborted()) {
      return cancelled(messages, toolSteps, turns);
    }
    if (turns >= budgets.maxModelTurns) {
      return ended(messages, toolSteps, turns, "MAX_TURNS",
        `The conversation reached its model-turn budget (${budgets.maxModelTurns} turns) and stopped — send another message to continue; nothing was left running.`);
    }
    turns += 1;
    const turnId = `turn:${input.taskId}:${turns}`;
    const request: AgentModelTurnRequest = {
      turnId,
      selection: input.selection,
      messages: [...messages],
      tools: input.tools,
      toolChoice: input.tools.length > 0 ? "auto" : "none",
    };

    let turn: CollectedTurn;
    try {
      turn = await collectOneTurn(request, seams, budgets);
    } catch (thrown) {
      if (thrown instanceof LoopCancelled) {
        return cancelled(messages, toolSteps, turns);
      }
      if (thrown instanceof AgentModelConversationError) {
        if (thrown.code === "TURN_TIMEOUT") {
          return ended(messages, toolSteps, turns, "TURN_TIMEOUT",
            "The model turn timed out and the loop stopped — the conversation state is kept; send another message to retry. No tool was left running.");
        }
        if (thrown.code === "TOOL_CALLING_UNSUPPORTED") {
          return ended(messages, toolSteps, turns, "TOOL_CALLING_UNSUPPORTED", thrown.message);
        }
        if (thrown.code === "STREAM_PROTOCOL_VIOLATION") {
          return ended(messages, toolSteps, turns, "STREAM_PROTOCOL_VIOLATION", thrown.message);
        }
        if (thrown.retryable && providerRetries < 1) {
          providerRetries += 1;
          turns -= 1; // the retried turn does not consume the budget twice
          continue;
        }
        return ended(messages, toolSteps, turns, "PROVIDER_FAILURE", describeThrown(thrown));
      }
      return ended(messages, toolSteps, turns, "PROVIDER_FAILURE", describeThrown(thrown));
    }

    if (turn.text.trim().length > 0) {
      onEvent({ kind: "ASSISTANT_TEXT", text: turn.text });
    }
    messages.push({
      role: "assistant",
      content: turn.text,
      ...(turn.toolCalls.length > 0 ? { toolCalls: turn.toolCalls } : {}),
    });

    if (turn.toolCalls.length === 0) {
      return ended(messages, toolSteps, turns, "ANSWERED",
        "The model answered without further tool calls.");
    }

    // Execute the requested tool calls in order; a prepared action
    // PAUSES the whole loop (the human gate — the model never executes).
    let pausedAction: StripePreparedActionPin | undefined;
    for (const call of turn.toolCalls) {
      if (toolSteps >= budgets.maxToolSteps) {
        return ended(messages, toolSteps, turns, "MAX_TOOL_STEPS",
          `The conversation reached its tool-step budget (${budgets.maxToolSteps} tool calls) and stopped honestly — send another message to continue with fresh budget.`);
      }
      if (seams.isAborted()) {
        return cancelled(messages, toolSteps, turns);
      }
      // Duplicate tool-call ids fail closed (§13.4): the duplicate gets
      // a typed error result; the model may continue with distinct ids.
      if (typeof call.id !== "string" || call.id.length === 0) {
        emitToolPair(onEvent, call, "ERROR", "rejected: the tool call carries no call id (protocol violation)");
        messages.push({ role: "tool", toolCallId: call.id, content: "ERROR: the tool call carried no call id" });
        failedCalls += 1;
        continue;
      }
      if (seenCallIds.has(call.id)) {
        emitToolPair(onEvent, call, "ERROR",
          `rejected: tool call id '${call.id}' was already used in this conversation — ids are never reused`);
        messages.push({ role: "tool", toolCallId: call.id, content: `ERROR: duplicate tool call id '${call.id}'` });
        failedCalls += 1;
        continue;
      }
      seenCallIds.add(call.id);

      // Loop detection BEFORE executing: the Nth identical call stops.
      const fingerprint = `${call.name}#${stableStringify(call.input)}`;
      const seen = fingerprints.get(fingerprint) ?? 0;
      if (seen >= budgets.maxIdenticalToolCalls) {
        return ended(messages, toolSteps, turns, "TOOL_LOOP_DETECTED",
          `The model repeated the identical tool call (${call.name} with identical arguments) more than ${budgets.maxIdenticalToolCalls} times — the loop stopped instead of spinning.`);
      }
      fingerprints.set(fingerprint, seen + 1);

      onEvent({ kind: "TOOL_CALL", callId: call.id, toolName: call.name, argsEcho: boundedEcho(call.input) });
      const result = await seams.tools.executeCall({ call, context: { taskId: input.taskId, connectionId: input.connectionId } });
      toolSteps += 1;

      // The two-phase pause (D10): a call that prepared an action stays
      // UNANSWERED in the record — no tool result is emitted or pushed,
      // because the HUMAN decision (confirm / refuse / expiry) owns that
      // result. The model is not invoked again until the decision lands.
      if (result.pendingPreparedAction !== undefined) {
        pausedAction = result.pendingPreparedAction;
        break;
      }

      const text =
        result.error !== undefined
          ? // The typed error envelope the model receives (fail-closed: a
            // failed call's reason ALWAYS reaches the model — never a bare
            // "null" — so it can correct or explain honestly).
            stableStringify({
              status: result.status,
              error: {
                code: result.error.code,
                message: result.error.message,
                retryable: result.error.retryable,
              },
            })
          : typeof result.output === "string"
            ? result.output
            : stableStringify(result.output);
      resultBytes += byteLength(text);
      if (resultBytes > budgets.totalToolResultBytes) {
        return ended(messages, toolSteps, turns, "RESULT_BUDGET_EXCEEDED",
          `The tool results exceeded the conversation's byte budget (${budgets.totalToolResultBytes} bytes) — partial results are kept; narrow the request to continue.`);
      }
      onEvent({
        kind: "TOOL_RESULT",
        callId: call.id,
        toolName: call.name,
        status: result.status,
        summary: summarizeResult(result),
        truncated: result.truncated === true,
      });
      messages.push({ role: "tool", toolCallId: call.id, content: text });
      if (result.error !== undefined) {
        failedCalls += 1;
        if (failedCalls > budgets.maxFailedToolCalls) {
          return ended(messages, toolSteps, turns, "TOOL_CALL_ERRORS_EXCEEDED",
            `Too many failed tool calls in this cycle (${failedCalls}) — the loop stopped. The failures were reported to the model before stopping; malformed arguments never execute anything.`);
        }
      }
    }
    if (pausedAction !== undefined) {
      onEvent({ kind: "PREPARED_ACTION_PENDING", action: pausedAction });
      return {
        reason: "AWAITING_USER_CONFIRMATION",
        messages,
        note: "The model proposed an action; the exact preview is presented for a human confirmation. Nothing executes until you confirm — and the host, not the model, mints the authorization.",
        pendingPreparedAction: pausedAction,
        toolSteps,
        turns,
      };
    }
  }
}

/* ------------------------------ the helpers --------------------------- */

function ended(
  messages: readonly AgentConversationMessage[],
  toolSteps: number,
  turns: number,
  reason: AgentConversationLoopResult["reason"],
  note: string,
): AgentConversationLoopResult {
  return { reason, messages, note, toolSteps, turns };
}

function cancelled(
  messages: readonly AgentConversationMessage[],
  toolSteps: number,
  turns: number,
): AgentConversationLoopResult {
  return {
    reason: "CANCELLED",
    messages,
    note: "The conversation was cancelled — everything already recorded stays (user text, assistant text, tool calls and results); nothing was left running.",
    toolSteps,
    turns,
  };
}

function emitToolPair(
  onEvent: (event: AgentConversationStreamEvent) => void,
  call: AgentModelToolCallPin,
  status: "ERROR",
  summary: string,
): void {
  onEvent({ kind: "TOOL_CALL", callId: call.id, toolName: call.name, argsEcho: boundedEcho(call.input) });
  onEvent({ kind: "TOOL_RESULT", callId: call.id, toolName: call.name, status, summary, truncated: false });
}

function describeThrown(thrown: unknown): string {
  if (thrown instanceof AgentModelConversationError) {
    return thrown.message;
  }
  return thrown instanceof Error ? thrown.message : String(thrown);
}
