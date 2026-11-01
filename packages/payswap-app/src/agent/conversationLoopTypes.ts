/**
 * @payswap/app — the CONVERSATION LOOP types (P24-3, ADR-0017 D8/D11).
 *
 * The public contracts of the bounded selected-model conversation
 * engine (./conversationLoopEngine.ts): the loop budgets (the D8 bounds
 * — max turns, max tool steps, byte budgets, per-turn timeout, failed-
 * call and identical-call bounds), the stream events the loop emits
 * (user-visible text, tool calls, tool results, prepared-action pauses
 * and honest status notes — TEXT_DELTA is TRANSIENT and never
 * persists), and the loop's completion vocabulary.
 *
 * HIDDEN CHAIN-OF-THOUGHT NEVER PERSISTS: the stream vocabulary has no
 * reasoning kind at all — the port's chunk union carries text, tool
 * calls and completion only (the modelConversationPort law).
 */

import type { AgentTaskModelSelectionPin } from "../lib/agent-task-pins.js";
import type {
  AgentConversationMessage,
  AgentModelConversationPort,
  AgentModelToolContractPin,
} from "./modelConversationPort.js";
import type { AgentToolRuntimePort } from "./stripeToolExecutionPort.js";
import type { StripePreparedActionPin } from "./stripePreparedActionPins.js";

/* ------------------------------ the seams ----------------------------- */

/**
 * The engine's injected seams (model port, tool runtime, clock,
 * per-turn timeout, user-abort probe) — PURE inputs, no ambient state.
 */
export interface AgentConversationLoopSeams {
  readonly model: AgentModelConversationPort;
  readonly tools: AgentToolRuntimePort;
  readonly now: () => string;
  /** Rejects with the TURN_TIMEOUT error after ms (the wiring binds setTimeout). */
  readonly timeoutAfter: (ms: number) => Promise<never>;
  /** The user-abort probe (checked between steps and after each stream chunk). */
  readonly isAborted: () => boolean;
}

/* ------------------------------ the budgets -------------------------- */

/** The D8 bounds (all positive integers; a foreign budget fails closed). */
export interface AgentConversationLoopBudgets {
  /** Max model turns per send() cycle (the max-turn cutoff). */
  readonly maxModelTurns: number;
  /** Max executed tool calls per cycle. */
  readonly maxToolSteps: number;
  /** Max failed tool calls (validation/unknown/duplicate/runtime) per cycle. */
  readonly maxFailedToolCalls: number;
  /** Max identical (name + args) tool calls before loop detection stops it. */
  readonly maxIdenticalToolCalls: number;
  /** Per-model-turn timeout in milliseconds. */
  readonly perTurnTimeoutMs: number;
  /** Byte budget for the public message history sent to the model. */
  readonly historyMaxBytes: number;
  /** Total byte budget for tool results within one cycle. */
  readonly totalToolResultBytes: number;
}

/** The pinned defaults (deliberately tight — the bounded-loop law). */
export const AGENT_CONVERSATION_LOOP_DEFAULT_BUDGETS: Readonly<AgentConversationLoopBudgets> =
  Object.freeze({
    maxModelTurns: 8,
    maxToolSteps: 6,
    maxFailedToolCalls: 3,
    maxIdenticalToolCalls: 2,
    perTurnTimeoutMs: 120_000,
    historyMaxBytes: 24_000,
    totalToolResultBytes: 32_000,
  });

/** Merge a partial budget over the defaults (fail-closed on non-positive values). */
export function resolveLoopBudgets(
  partial?: Partial<AgentConversationLoopBudgets>,
): AgentConversationLoopBudgets {
  const merged = { ...AGENT_CONVERSATION_LOOP_DEFAULT_BUDGETS, ...partial };
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(
        `conversation loop budget .${key} must be a positive integer (got ${String(value)}) — the bounded-loop law fails closed`,
      );
    }
  }
  return merged;
}

/* ---------------------------- the stream events ----------------------- */

/** One tool execution's status (UNKNOWN is first-class — INV-04). */
export type AgentToolResultStatus = "OK" | "ERROR" | "UNKNOWN";

/** The transient stream the loop emits (deltas never persist). */
export type AgentConversationStreamEvent =
  | { readonly kind: "TEXT_DELTA"; readonly text: string }
  | { readonly kind: "ASSISTANT_TEXT"; readonly text: string }
  | {
      readonly kind: "TOOL_CALL";
      readonly callId: string;
      readonly toolName: string;
      /** Bounded stable-JSON echo of the model's arguments (no full payloads). */
      readonly argsEcho: string;
    }
  | {
      readonly kind: "TOOL_RESULT";
      readonly callId: string;
      readonly toolName: string;
      readonly status: AgentToolResultStatus;
      /** Bounded sanitized summary (the record's view — never the full payload). */
      readonly summary: string;
      readonly truncated: boolean;
    }
  | { readonly kind: "PREPARED_ACTION_PENDING"; readonly action: StripePreparedActionPin }
  | { readonly kind: "LOOP_STATUS"; readonly reason: AgentConversationLoopReason; readonly note: string };

/* --------------------------- the completion --------------------------- */

/** Why the loop ended (every reason renders honestly; none fabricates success). */
export type AgentConversationLoopReason =
  | "ANSWERED"
  | "MAX_TURNS"
  | "MAX_TOOL_STEPS"
  | "CANCELLED"
  | "TURN_TIMEOUT"
  | "PROVIDER_FAILURE"
  | "STREAM_PROTOCOL_VIOLATION"
  | "TOOL_CALLING_UNSUPPORTED"
  | "TOOL_LOOP_DETECTED"
  | "TOOL_CALL_ERRORS_EXCEEDED"
  | "RESULT_BUDGET_EXCEEDED"
  | "AWAITING_USER_CONFIRMATION";

/** The loop's final report. */
export interface AgentConversationLoopResult {
  readonly reason: AgentConversationLoopReason;
  /** The final PUBLIC history (user/assistant/tool messages only). */
  readonly messages: readonly AgentConversationMessage[];
  /** The honest people-language note for the ended state. */
  readonly note: string;
  /** Present iff reason is AWAITING_USER_CONFIRMATION (the two-phase pause). */
  readonly pendingPreparedAction?: StripePreparedActionPin;
  readonly toolSteps: number;
  readonly turns: number;
}

/* ------------------------------ the input ----------------------------- */

/** A tool result handed back when a paused loop continues (the execution outcome). */
export interface AgentPendingToolResult {
  readonly callId: string;
  readonly toolName: string;
  readonly status: AgentToolResultStatus;
  /** The framed result text the model receives. */
  readonly resultText: string;
}

/** One loop run: a user message or a continuation with pending results. */
export interface AgentConversationLoopInput {
  readonly taskId: string;
  /** The task's bound connection id — the ONLY account context tool calls carry. */
  readonly connectionId: string;
  /** The task's persisted selection — invoked VERBATIM, never substituted. */
  readonly selection: AgentTaskModelSelectionPin;
  /** The PUBLIC history so far (rebuilt from the persisted log on resume). */
  readonly history: readonly AgentConversationMessage[];
  /** The new user message (absent when continuing after an execution). */
  readonly newUserText?: string;
  /** Continuation results (absent on a fresh user turn). */
  readonly pendingToolResults?: readonly AgentPendingToolResult[];
  /** The currently registered tool contracts (D9's bounded set). */
  readonly tools: readonly AgentModelToolContractPin[];
  readonly budgets?: Partial<AgentConversationLoopBudgets>;
}
