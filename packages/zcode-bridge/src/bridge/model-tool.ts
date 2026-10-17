/**
 * Bridge implementation: model-facing tool wire (P3-W3).
 *
 * Validators for the wire the substrate presents TO the model provider:
 * tool calls (the tool_use round-trip), tool results, tool choice, message
 * roles, content-block kinds and streaming event kinds. A bridged
 * ModelToolContractWire deliberately carries no `execute` member — this
 * bridge pins description, never execution.
 */

import { IssueCollector } from "../errors.ts";
import {
  cloneAndFreeze,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from "../shared.ts";
import {
  MODEL_CONTENT_BLOCK_KINDS,
  MODEL_MESSAGE_ROLES,
  MODEL_STREAM_EVENT_KINDS,
  MODEL_TOOL_CHOICE_KINDS,
  MODEL_TOOL_SIDE_EFFECT_SCOPES,
} from "../wire/model-tool.ts";
import type {
  ModelContentBlockKindWire,
  ModelMessageRoleWire,
  ModelStreamEventKindWire,
  ModelToolChoiceWire,
  ModelToolCallWire,
  ModelToolContractWire,
  ModelToolResultWire,
} from "../wire/model-tool.ts";

/** Structural guard: message role. */
export function isModelMessageRole(candidate: unknown): candidate is ModelMessageRoleWire {
  return (
    typeof candidate === "string" &&
    MODEL_MESSAGE_ROLES.includes(candidate as ModelMessageRoleWire)
  );
}

/** Structural guard: content-block kind. */
export function isModelContentBlockKind(
  candidate: unknown,
): candidate is ModelContentBlockKindWire {
  return (
    typeof candidate === "string" &&
    MODEL_CONTENT_BLOCK_KINDS.includes(candidate as ModelContentBlockKindWire)
  );
}

/** Structural guard: streaming event kind. */
export function isModelStreamEventKind(
  candidate: unknown,
): candidate is ModelStreamEventKindWire {
  return (
    typeof candidate === "string" &&
    MODEL_STREAM_EVENT_KINDS.includes(candidate as ModelStreamEventKindWire)
  );
}

/** Structural guard: tool choice ("auto" | "none" | "required" | {type:"tool"}). */
export function isModelToolChoice(candidate: unknown): candidate is ModelToolChoiceWire {
  if (typeof candidate === "string") {
    return MODEL_TOOL_CHOICE_KINDS.includes(
      candidate as "auto" | "none" | "required",
    );
  }
  if (isRecord(candidate)) {
    return (
      candidate.type === "tool" &&
      isNonEmptyString(candidate.toolName)
    );
  }
  return false;
}

/** Construct and freeze a validated ModelToolCallWire (id, name, input). */
export function modelToolCall(input: unknown): ModelToolCallWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid model tool call: must be an object");
  }
  issues.requireNonEmptyString("id", input.id);
  issues.requireNonEmptyString("name", input.name);
  if (input.providerExecuted !== undefined) {
    issues.requireBoolean("providerExecuted", input.providerExecuted);
  }
  issues.throwIfAny("model tool call");
  const record = input as unknown as ModelToolCallWire;
  return Object.freeze({
    id: record.id,
    name: record.name,
    input: cloneAndFreeze(record.input),
    ...(record.providerExecuted !== undefined
      ? { providerExecuted: record.providerExecuted }
      : {}),
  });
}

/** Construct and freeze a validated ModelToolResultWire. */
export function modelToolResult(input: unknown): ModelToolResultWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid model tool result: must be an object");
  }
  issues.requireNonEmptyString("id", input.id);
  issues.requireNonEmptyString("name", input.name);
  if (input.providerExecuted !== undefined) {
    issues.requireBoolean("providerExecuted", input.providerExecuted);
  }
  if (input.providerMetadata !== undefined && !isRecord(input.providerMetadata)) {
    issues.add("providerMetadata", "must be an object when present");
  }
  issues.throwIfAny("model tool result");
  const record = input as unknown as ModelToolResultWire;
  return Object.freeze({
    id: record.id,
    name: record.name,
    input: cloneAndFreeze(record.input),
    output: cloneAndFreeze(record.output),
    ...(record.providerExecuted !== undefined
      ? { providerExecuted: record.providerExecuted }
      : {}),
    ...(record.providerMetadata !== undefined
      ? { providerMetadata: cloneAndFreeze(record.providerMetadata) }
      : {}),
  });
}

/**
 * Construct and freeze a validated ModelToolContractWire (the descriptive
 * slice of the substrate's ModelToolContract — NO execute member). The
 * side-effect scope, when present, must come from the pinned vocabulary.
 */
export function modelToolContract(input: unknown): ModelToolContractWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid model tool contract: must be an object");
  }
  issues.requireNonEmptyString("name", input.name);
  if (input.description !== undefined) {
    issues.requireNonEmptyString(
      "description",
      input.description,
      "must be a non-empty string when present",
    );
  }
  if (input.capability !== undefined) {
    issues.requireNonEmptyString(
      "capability",
      input.capability,
      "must be a non-empty string when present",
    );
  }
  if (input.executionMode !== undefined) {
    if (
      typeof input.executionMode !== "string" ||
      (input.executionMode !== "client" && input.executionMode !== "providerNative")
    ) {
      issues.add("executionMode", 'must be "client" or "providerNative"');
    }
  }
  if (!isRecord(input.inputSchema)) {
    issues.add("inputSchema", "must be a JSON object");
  }
  if (input.outputSchema !== undefined && !isRecord(input.outputSchema)) {
    issues.add("outputSchema", "must be a JSON object when present");
  }
  for (const flag of [
    "strict",
    "readOnly",
    "destructive",
    "concurrentSafe",
    "requiresUserInteraction",
    "needsApproval",
  ] as const) {
    if (input[flag] !== undefined) {
      issues.requireBoolean(flag, input[flag]);
    }
  }
  if (input.maxOutputBytes !== undefined) {
    issues.requireNonNegativeInteger("maxOutputBytes", input.maxOutputBytes);
  }
  if (input.timeoutMs !== undefined) {
    issues.requireNonNegativeInteger("timeoutMs", input.timeoutMs);
  }
  if (input.sideEffectScope !== undefined) {
    if (
      typeof input.sideEffectScope !== "string" ||
      !MODEL_TOOL_SIDE_EFFECT_SCOPES.includes(input.sideEffectScope as ModelToolContractWire["sideEffectScope"] & string)
    ) {
      issues.add("sideEffectScope", `must be one of: ${MODEL_TOOL_SIDE_EFFECT_SCOPES.join(", ")}`);
    }
  }
  issues.throwIfAny("model tool contract");
  const record = input as unknown as ModelToolContractWire;
  return Object.freeze({
    name: record.name,
    ...(record.description !== undefined ? { description: record.description } : {}),
    ...(record.capability !== undefined ? { capability: record.capability } : {}),
    ...(record.executionMode !== undefined
      ? { executionMode: record.executionMode }
      : {}),
    inputSchema: cloneAndFreeze(record.inputSchema),
    ...(record.outputSchema !== undefined
      ? { outputSchema: cloneAndFreeze(record.outputSchema) }
      : {}),
    ...(record.strict !== undefined ? { strict: record.strict } : {}),
    ...(record.readOnly !== undefined ? { readOnly: record.readOnly } : {}),
    ...(record.destructive !== undefined ? { destructive: record.destructive } : {}),
    ...(record.concurrentSafe !== undefined
      ? { concurrentSafe: record.concurrentSafe }
      : {}),
    ...(record.requiresUserInteraction !== undefined
      ? { requiresUserInteraction: record.requiresUserInteraction }
      : {}),
    ...(record.maxOutputBytes !== undefined
      ? { maxOutputBytes: record.maxOutputBytes }
      : {}),
    ...(record.timeoutMs !== undefined ? { timeoutMs: record.timeoutMs } : {}),
    ...(record.needsApproval !== undefined ? { needsApproval: record.needsApproval } : {}),
    ...(record.sideEffectScope !== undefined
      ? { sideEffectScope: record.sideEffectScope }
      : {}),
  });
}

/** Structural guard: boolean (re-exported convenience for wire consumers). */
export function isModelBoolean(candidate: unknown): candidate is boolean {
  return isBoolean(candidate);
}
