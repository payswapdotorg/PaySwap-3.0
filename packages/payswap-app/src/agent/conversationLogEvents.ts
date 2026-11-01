/**
 * @payswap/app — the AGENT CONVERSATION LOG events (P24-3, ADR-0017 D8).
 *
 * The app-owned, append-only conversation record that rides a task:
 * ONLY user-visible text, tool calls, tool results, prepared-action
 * lifecycle and honest status notes. HIDDEN CHAIN-OF-THOUGHT NEVER
 * PERSISTS — the vocabulary has no reasoning kind at all (the port
 * drops reasoning deltas; the loop never emits them).
 *
 * PROVENANCE LAWS:
 * - USER-CONFIRMATION EVENTS ARE HUMAN EVENTS: PREPARED_ACTION_CONFIRMED
 *   and PREPARED_ACTION_REFUSED are written ONLY by the controller's
 *   confirm/refuse paths (a user gesture) — the model-side loop has NO
 *   event kind that can produce them (battery-asserted).
 * - The prepared-action records carried here are STRUCTURALLY VALIDATED
 *   against the frozen-contract pins (fail-closed; a malformed record
 *   is refused at the writer, never persisted to quarantine later).
 * - Every text field is secret-shape-scanned at the writer (the chat
 *   law — secrets never enter the conversation record).
 * - APPEND-ONLY: events are minted with monotonic ids and never
 *   rewritten; resume replays them in order.
 */

import type { AgentTaskModelSelectionPin } from "../lib/agent-task-pins.js";
import type { AgentToolResultStatus } from "./conversationLoopTypes.js";
import {
  requireValidPreparedActionPin,
  type StripeActionExecutionOutcomePin,
  type StripePreparedActionPin,
} from "./stripePreparedActionPins.js";
import { scanAgentTranscriptText } from "./taskSessionGuard.js";

/* ----------------------------- the vocabulary ------------------------ */

export const AGENT_CONVERSATION_EVENT_KINDS_PIN = [
  "CONVERSATION_STARTED",
  "USER_TEXT",
  "ASSISTANT_TEXT",
  "TOOL_CALL",
  "TOOL_RESULT",
  "PREPARED_ACTION_PENDING",
  "PREPARED_ACTION_CONFIRMED",
  "PREPARED_ACTION_REFUSED",
  "PREPARED_ACTION_EXPIRED",
  "EXECUTION_OUTCOME",
  "CONVERSATION_NOTE",
  "ACCOUNT_CONTEXT_BOUND",
] as const;
export type AgentConversationEventKindPin = (typeof AGENT_CONVERSATION_EVENT_KINDS_PIN)[number];

/* ------------------------------ the inputs ---------------------------- */

/** One append request (validated fail-closed by the adapter). */
export type AgentConversationLogInput =
  | { readonly kind: "CONVERSATION_STARTED"; readonly selection: AgentTaskModelSelectionPin }
  | { readonly kind: "USER_TEXT"; readonly text: string }
  | { readonly kind: "ASSISTANT_TEXT"; readonly text: string }
  | {
      readonly kind: "TOOL_CALL";
      readonly callId: string;
      readonly toolName: string;
      readonly argsEcho: string;
    }
  | {
      readonly kind: "TOOL_RESULT";
      readonly callId: string;
      readonly toolName: string;
      readonly status: AgentToolResultStatus;
      readonly summary: string;
      readonly truncated?: boolean;
    }
  | { readonly kind: "PREPARED_ACTION_PENDING"; readonly action: unknown }
  | {
      readonly kind: "PREPARED_ACTION_CONFIRMED";
      readonly preparedActionId: string;
      readonly digest: string;
      readonly authorizationId: string;
    }
  | { readonly kind: "PREPARED_ACTION_REFUSED"; readonly preparedActionId: string }
  | { readonly kind: "PREPARED_ACTION_EXPIRED"; readonly preparedActionId: string }
  | { readonly kind: "EXECUTION_OUTCOME"; readonly preparedActionId: string; readonly outcome: unknown }
  | { readonly kind: "CONVERSATION_NOTE"; readonly note: string; readonly reason?: string }
  | {
      readonly kind: "ACCOUNT_CONTEXT_BOUND";
      readonly connectionId: string;
      readonly scopeChange: "INITIAL" | "USER_AUTHORIZED_SWITCH";
    };

/** The persisted event (append-only; ids monotonic per store). */
export interface AgentConversationLogEvent {
  readonly id: string;
  readonly taskId: string;
  readonly at: string;
  readonly event: AgentConversationLogInput;
}

/* ------------------------------ validation ---------------------------- */

/** The typed, fail-closed conversation-log writer error. */
export type AgentConversationLogErrorCode =
  | "UNKNOWN_TASK"
  | "TERMINAL_TASK"
  | "INVALID_INPUT"
  | "SECRET_SHAPED_INPUT"
  | "STORE_WRITE_FAILED"
  | "STORE_UNAVAILABLE";

/**
 * Validate one append input fail-closed (shape + secret scan + the
 * frozen-contract structural pins). Returns a normalized copy.
 */
export function validateConversationLogInput(input: unknown): AgentConversationLogInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("a conversation event must be a record with a kind");
  }
  const record = input as Readonly<Record<string, unknown>>;
  const kind = record.kind as string;
  if (!(AGENT_CONVERSATION_EVENT_KINDS_PIN as readonly string[]).includes(kind)) {
    throw new Error(`conversation event kind '${String(kind)}' is not in the pinned vocabulary`);
  }
  switch (kind) {
    case "CONVERSATION_STARTED": {
      const selection = record.selection;
      if (selection === null || typeof selection !== "object") {
        throw new Error("CONVERSATION_STARTED.selection must be the { providerId, modelId, reasoningLevel } record");
      }
      const sel = selection as Readonly<Record<string, unknown>>;
      for (const field of ["providerId", "modelId", "reasoningLevel"] as const) {
        if (typeof sel[field] !== "string" || (sel[field] as string).length === 0) {
          throw new Error(`CONVERSATION_STARTED.selection.${field} must be a non-empty string`);
        }
      }
      return { kind, selection: { ...selection } as AgentTaskModelSelectionPin };
    }
    case "USER_TEXT":
    case "ASSISTANT_TEXT":
    case "CONVERSATION_NOTE": {
      const text = typeof record.text === "string" ? record.text
        : typeof record.note === "string" ? record.note
          : undefined;
      if (text === undefined || text.length === 0) {
        throw new Error(`${kind} requires a non-empty text/note`);
      }
      scanAgentTranscriptText(text);
      if (kind === "CONVERSATION_NOTE") {
        return {
          kind,
          note: text,
          ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
        };
      }
      return { kind, text } as AgentConversationLogInput;
    }
    case "TOOL_CALL":
    case "TOOL_RESULT": {
      for (const field of ["callId", "toolName"] as const) {
        if (typeof record[field] !== "string" || (record[field] as string).length === 0) {
          throw new Error(`${kind}.${field} must be a non-empty string`);
        }
      }
      if (kind === "TOOL_CALL") {
        const argsEcho = typeof record.argsEcho === "string" ? record.argsEcho : "";
        scanAgentTranscriptText(argsEcho);
        return {
          kind,
          callId: record.callId as string,
          toolName: record.toolName as string,
          argsEcho,
        };
      }
      const status = record.status;
      if (status !== "OK" && status !== "ERROR" && status !== "UNKNOWN") {
        throw new Error("TOOL_RESULT.status must be OK, ERROR or UNKNOWN");
      }
      const summary = typeof record.summary === "string" ? record.summary : "";
      scanAgentTranscriptText(summary);
      return {
        kind,
        callId: record.callId as string,
        toolName: record.toolName as string,
        status,
        summary,
        ...(record.truncated === true ? { truncated: true } : {}),
      };
    }
    case "PREPARED_ACTION_PENDING": {
      const action = requireValidPreparedActionPin(record.action);
      return { kind, action };
    }
    case "PREPARED_ACTION_CONFIRMED":
    case "PREPARED_ACTION_REFUSED":
    case "PREPARED_ACTION_EXPIRED": {
      if (typeof record.preparedActionId !== "string" || (record.preparedActionId as string).length === 0) {
        throw new Error(`${kind}.preparedActionId must be a non-empty string`);
      }
      if (kind === "PREPARED_ACTION_CONFIRMED") {
        for (const field of ["digest", "authorizationId"] as const) {
          if (typeof record[field] !== "string" || (record[field] as string).length === 0) {
            throw new Error(`PREPARED_ACTION_CONFIRMED.${field} must be a non-empty string`);
          }
        }
        return {
          kind,
          preparedActionId: record.preparedActionId as string,
          digest: record.digest as string,
          authorizationId: record.authorizationId as string,
        };
      }
      return { kind, preparedActionId: record.preparedActionId as string };
    }
    case "EXECUTION_OUTCOME": {
      if (typeof record.preparedActionId !== "string" || (record.preparedActionId as string).length === 0) {
        throw new Error("EXECUTION_OUTCOME.preparedActionId must be a non-empty string");
      }
      return {
        kind,
        preparedActionId: record.preparedActionId as string,
        outcome: requireValidExecutionOutcome(record.outcome),
      };
    }
    case "ACCOUNT_CONTEXT_BOUND": {
      if (typeof record.connectionId !== "string" || (record.connectionId as string).length === 0) {
        throw new Error("ACCOUNT_CONTEXT_BOUND.connectionId must be a non-empty string");
      }
      if (record.scopeChange !== "INITIAL" && record.scopeChange !== "USER_AUTHORIZED_SWITCH") {
        throw new Error("ACCOUNT_CONTEXT_BOUND.scopeChange must be INITIAL or USER_AUTHORIZED_SWITCH");
      }
      return {
        kind,
        connectionId: record.connectionId as string,
        scopeChange: record.scopeChange,
      };
    }
    default:
      throw new Error(`unhandled conversation event kind '${kind}'`);
  }
}

/** Validate a frozen-contract execution outcome (fail-closed). */
export function requireValidExecutionOutcome(candidate: unknown): StripeActionExecutionOutcomePin {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("EXECUTION_OUTCOME.outcome must be a record");
  }
  const outcome = candidate as Readonly<Record<string, unknown>>;
  switch (outcome.kind) {
    case "CONFIRMED":
      if (!Array.isArray(outcome.providerRefs)) {
        throw new Error("a CONFIRMED outcome requires providerRefs");
      }
      return { kind: "CONFIRMED", providerRefs: [...(outcome.providerRefs as string[])], readBackDue: outcome.readBackDue === true };
    case "UNKNOWN":
      if (typeof outcome.note !== "string") {
        throw new Error("an UNKNOWN outcome requires a note");
      }
      return {
        kind: "UNKNOWN",
        reconciliationOperationId: typeof outcome.reconciliationOperationId === "string" ? outcome.reconciliationOperationId : null,
        note: outcome.note,
      };
    case "FAILED":
      if (!["REFUSED_BEFORE_DISPATCH", "PERMISSION_MISSING", "VALIDATION", "POLICY"].includes(String(outcome.reason))) {
        throw new Error("a FAILED outcome requires a known reason");
      }
      if (typeof outcome.detail !== "string") {
        throw new Error("a FAILED outcome requires a detail");
      }
      return { kind: "FAILED", reason: outcome.reason as "VALIDATION", detail: outcome.detail };
    case "PROVIDER_REJECTED":
      if (typeof outcome.httpStatus !== "number") {
        throw new Error("a PROVIDER_REJECTED outcome requires httpStatus");
      }
      return {
        kind: "PROVIDER_REJECTED",
        httpStatus: outcome.httpStatus,
        providerErrorCode: typeof outcome.providerErrorCode === "string" ? outcome.providerErrorCode : null,
      };
    default:
      throw new Error("EXECUTION_OUTCOME.outcome.kind must be CONFIRMED, UNKNOWN, FAILED or PROVIDER_REJECTED");
  }
}

/** The pending prepared action carried by a log event (typed read helper). */
export function preparedActionOfEvent(
  event: AgentConversationLogEvent,
): StripePreparedActionPin | undefined {
  return event.event.kind === "PREPARED_ACTION_PENDING"
    ? (event.event.action as StripePreparedActionPin)
    : undefined;
}
