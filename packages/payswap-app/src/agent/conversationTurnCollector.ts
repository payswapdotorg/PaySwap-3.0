/**
 * @payswap/app — the CONVERSATION TURN COLLECTOR + bounded-stream
 * utilities (P24-3, ADR-0017 D8; split from ./conversationLoopEngine.ts
 * for the ≤400-line file law — a pure mechanical move, no behavior
 * change).
 *
 * The per-turn streaming half of the bounded loop: consume one streamed
 * model turn under the timeout + user-abort races, and the byte-budget
 * utilities the engine applies (history trimming that protects the
 * newest user text, bounded argument echoes, bounded result summaries).
 *
 * HIDDEN CHAIN-OF-THOUGHT NEVER CROSSES THIS COLLECTOR: only text
 * deltas, tool calls and the completion marker are consumed — the
 * port's chunk union has no reasoning kind at all.
 */

import {
  AgentModelConversationError,
  type AgentConversationMessage,
  type AgentModelToolCallPin,
  type AgentModelTurnChunk,
  type AgentModelTurnRequest,
} from "./modelConversationPort.js";
import type { AgentConversationLoopBudgets, AgentConversationLoopSeams } from "./conversationLoopTypes.js";
import { stableStringify } from "./stripeToolOutput.js";

/* --------------------------- the turn shape ---------------------------- */

/** One collected model turn (assembled text + requested tool calls). */
export interface CollectedTurn {
  readonly text: string;
  readonly toolCalls: readonly AgentModelToolCallPin[];
  readonly finish: "STOP" | "TOOL_CALLS" | "LENGTH";
}

/** The internal cancellation marker (never crosses the public surface). */
export class LoopCancelled extends Error {
  constructor() {
    super("the conversation loop was cancelled by the user");
  }
}

/* --------------------------- the collector ----------------------------- */

/**
 * Consume one streamed model turn under the timeout + abort races. A
 * stream that ends WITHOUT a completion chunk is a protocol violation —
 * the turn is discarded, never guessed.
 */
export async function collectOneTurn(
  request: AgentModelTurnRequest,
  seams: AgentConversationLoopSeams,
  budgets: AgentConversationLoopBudgets,
): Promise<CollectedTurn> {
  const consume = async (): Promise<CollectedTurn> => {
    let text = "";
    const toolCalls: AgentModelToolCallPin[] = [];
    let finish: CollectedTurn["finish"] | undefined;
    for await (const chunk of seams.model.startTurn(request)) {
      if (seams.isAborted()) {
        throw new LoopCancelled();
      }
      applyChunk(chunk, (delta) => {
        text += delta;
      }, toolCalls, (done) => {
        finish = done;
      });
    }
    if (finish === undefined) {
      throw new AgentModelConversationError(
        "STREAM_PROTOCOL_VIOLATION",
        "the model stream ended without a TURN_COMPLETED chunk (protocol violation — the turn is discarded, never guessed)",
      );
    }
    return { text, toolCalls, finish };
  };
  return await Promise.race([consume(), seams.timeoutAfter(budgets.perTurnTimeoutMs)]);
}

function applyChunk(
  chunk: AgentModelTurnChunk,
  onText: (delta: string) => void,
  toolCalls: AgentModelToolCallPin[],
  onFinish: (finish: CollectedTurn["finish"]) => void,
): void {
  switch (chunk.kind) {
    case "TEXT_DELTA":
      onText(chunk.text);
      return;
    case "TOOL_CALL":
      toolCalls.push(chunk.call);
      return;
    case "TURN_COMPLETED":
      onFinish(chunk.finish);
      return;
  }
}

/* ------------------------- the bounded utilities ----------------------- */

/** UTF-8 byte length (the budget unit). */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** The bounded argument echo (the record never stores full payloads). */
export function boundedEcho(input: unknown): string {
  const json = stableStringify(input);
  return json.length > 300 ? `${json.slice(0, 297)}…` : json;
}

/** The bounded sanitized summary of one result (record-safe). */
export function summarizeResult(result: {
  readonly status: string;
  readonly error?: { readonly message: string };
  readonly boundedJson?: string;
}): string {
  if (result.error !== undefined) {
    return result.error.message.slice(0, 400);
  }
  const json = result.boundedJson ?? "";
  return json.length > 400 ? `${json.slice(0, 397)}…` : json;
}

/** Trim the OLDEST history messages to the byte budget (the newest stay). */
export function trimHistoryToBudget(
  messages: AgentConversationMessage[],
  budgets: AgentConversationLoopBudgets,
): void {
  const protectedCount = countProtectedTail(messages);
  let index = 0;
  while (
    messages.length - index > protectedCount &&
    byteLength(stableStringify(messages.slice(index))) > budgets.historyMaxBytes
  ) {
    index += 1;
  }
  if (index > 0) {
    messages.splice(0, index);
  }
}

/** The tail that is never trimmed: the newest user message + pending results. */
function countProtectedTail(messages: readonly AgentConversationMessage[]): number {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as AgentConversationMessage;
    if (message.role === "user" || message.role === "tool") {
      count += 1;
    } else {
      break;
    }
  }
  return Math.max(count, 1);
}
