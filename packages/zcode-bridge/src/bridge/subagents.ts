/**
 * Bridge implementation: subagent validators (P3-W3).
 *
 * Validators for the pinned subagent contracts: run requests, the agent
 * output union (completed | async_launched), task snapshots (with
 * terminal-status law: completedAt only on terminal statuses), and agent
 * profiles (with the APPLICATION permission-mode vocabulary).
 */

import { IssueCollector } from "../errors.ts";
import {
  cloneAndFreeze,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  isStringArray,
} from "../shared.ts";
import {
  AGENT_PERMISSION_MODES,
  AGENT_PROFILE_SOURCES,
  SUBAGENT_TASK_STATUSES,
  SUBAGENT_TERMINAL_STATUSES,
} from "../wire/subagents.ts";
import type {
  AgentCompletedOutputWire,
  AgentOutputWire,
  AgentProfileWire,
  SubagentRunRequestWire,
  SubagentTaskSnapshotWire,
  SubagentTaskStatusWire,
} from "../wire/subagents.ts";
import { isIsoUtcTimestamp } from "./session-events.ts";

/** Structural guard: subagent task status. */
export function isSubagentTaskStatus(
  candidate: unknown,
): candidate is SubagentTaskStatusWire {
  return (
    typeof candidate === "string" &&
    SUBAGENT_TASK_STATUSES.includes(candidate as SubagentTaskStatusWire)
  );
}

/** Structural guard: terminal subagent task status. */
export function isSubagentTerminalStatus(
  candidate: unknown,
): candidate is SubagentTaskStatusWire {
  return (
    typeof candidate === "string" &&
    SUBAGENT_TERMINAL_STATUSES.includes(candidate as SubagentTaskStatusWire)
  );
}

/**
 * Construct and freeze a validated SubagentRunRequestWire (the descriptive
 * slice of the substrate's run request: parent session/turn/tool-call ids,
 * agent type, description, prompt, working directories).
 */
export function subagentRunRequest(input: unknown): SubagentRunRequestWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid subagent run request: must be an object");
  }
  issues.requireNonEmptyString("sessionId", input.sessionId);
  if (input.turnId !== undefined) {
    issues.requireNonEmptyString("turnId", input.turnId, "must be a non-empty string when present");
  }
  issues.requireNonEmptyString("parentToolCallId", input.parentToolCallId);
  issues.requireNonEmptyString("agentType", input.agentType);
  issues.requireNonEmptyString("description", input.description);
  issues.requireNonEmptyString("prompt", input.prompt);
  if (input.callerCanReadOutputFile !== undefined) {
    issues.requireBoolean("callerCanReadOutputFile", input.callerCanReadOutputFile);
  }
  issues.requireNonEmptyString("workingDirectory", input.workingDirectory);
  issues.requireNonEmptyString("workspaceRoot", input.workspaceRoot);
  issues.throwIfAny("subagent run request");
  const record = input as unknown as SubagentRunRequestWire;
  return Object.freeze({
    sessionId: record.sessionId,
    ...(record.turnId !== undefined ? { turnId: record.turnId } : {}),
    parentToolCallId: record.parentToolCallId,
    agentType: record.agentType,
    description: record.description,
    prompt: record.prompt,
    ...(record.callerCanReadOutputFile !== undefined
      ? { callerCanReadOutputFile: record.callerCanReadOutputFile }
      : {}),
    workingDirectory: record.workingDirectory,
    workspaceRoot: record.workspaceRoot,
  });
}

/** Validate the completed arm of the agent output union. */
function agentCompletedOutput(input: Record<string, unknown>): AgentCompletedOutputWire {
  const issues = new IssueCollector();
  issues.requireNonEmptyString("agentId", input.agentId);
  issues.requireNonEmptyString("agentType", input.agentType);
  issues.requireNonEmptyString("description", input.description);
  issues.requireNonEmptyString("prompt", input.prompt);
  if (
    !Array.isArray(input.content) ||
    !input.content.every(
      (block: unknown) =>
        isRecord(block) &&
        block.type === "text" &&
        isNonEmptyString(block.text),
    )
  ) {
    issues.add("content", "must be an array of { type: 'text', text } blocks");
  }
  issues.requireNonNegativeInteger("totalToolUseCount", input.totalToolUseCount);
  issues.requireNonNegativeInteger("totalDurationMs", input.totalDurationMs);
  if (input.totalTokens !== undefined) {
    issues.requireNonNegativeInteger("totalTokens", input.totalTokens);
  }
  if (input.usage !== undefined && !isRecord(input.usage)) {
    issues.add("usage", "must be an object when present");
  }
  issues.throwIfAny("agent completed output");
  const record = input as unknown as AgentCompletedOutputWire;
  return Object.freeze({
    status: "completed",
    agentId: record.agentId,
    agentType: record.agentType,
    description: record.description,
    prompt: record.prompt,
    content: Object.freeze(record.content.map((block) => Object.freeze({ ...block }))),
    totalToolUseCount: record.totalToolUseCount,
    totalDurationMs: record.totalDurationMs,
    ...(record.totalTokens !== undefined ? { totalTokens: record.totalTokens } : {}),
    ...(record.usage !== undefined ? { usage: cloneAndFreeze(record.usage) } : {}),
  });
}

/** Validate the async-launched arm of the agent output union. */
function agentBackgroundedOutput(
  input: Record<string, unknown>,
): AgentOutputWire {
  const issues = new IssueCollector();
  if (input.isAsync !== true) {
    issues.add("isAsync", "must be the literal true on the async_launched arm");
  }
  issues.requireNonEmptyString("agentId", input.agentId);
  issues.requireNonEmptyString("agentType", input.agentType);
  issues.requireNonEmptyString("description", input.description);
  issues.requireNonEmptyString("prompt", input.prompt);
  issues.requireNonEmptyString("childSessionId", input.childSessionId);
  issues.requireNonEmptyString("backgroundTaskId", input.backgroundTaskId);
  issues.requireNonEmptyString("outputFile", input.outputFile);
  issues.requireBoolean("canReadOutputFile", input.canReadOutputFile);
  issues.throwIfAny("agent backgrounded output");
  const record = input as unknown as AgentOutputWire & {
    isAsync: true;
    agentId: string;
    agentType: string;
    description: string;
    prompt: string;
    childSessionId: string;
    backgroundTaskId: string;
    outputFile: string;
    canReadOutputFile: boolean;
  };
  return Object.freeze({
    status: "async_launched",
    isAsync: true,
    agentId: record.agentId,
    agentType: record.agentType,
    description: record.description,
    prompt: record.prompt,
    childSessionId: record.childSessionId,
    backgroundTaskId: record.backgroundTaskId,
    outputFile: record.outputFile,
    canReadOutputFile: record.canReadOutputFile,
  });
}

/**
 * Construct and freeze a validated AgentOutputWire (the completed |
 * async_launched union).
 */
export function agentOutput(input: unknown): AgentOutputWire {
  if (!isRecord(input)) {
    throw new Error("Invalid agent output: must be an object");
  }
  if (input.status === "completed") {
    return agentCompletedOutput(input);
  }
  if (input.status === "async_launched") {
    return agentBackgroundedOutput(input);
  }
  throw new Error(
    `Invalid agent output: status must be 'completed' or 'async_launched' (got ${JSON.stringify(input.status)})`,
  );
}

/**
 * Construct and freeze a validated SubagentTaskSnapshotWire: non-empty
 * identity fields, pinned status, strict ISO-8601 UTC startedAt, optional
 * completedAt (allowed ONLY on terminal statuses — the substrate's settled
 * state law), optional output validated through the union.
 */
export function subagentTaskSnapshot(input: unknown): SubagentTaskSnapshotWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid subagent task snapshot: must be an object");
  }
  issues.requireNonEmptyString("taskId", input.taskId);
  issues.requireNonEmptyString("agentId", input.agentId);
  issues.requireNonEmptyString("agentType", input.agentType);
  issues.requireNonEmptyString("description", input.description);
  if (!isSubagentTaskStatus(input.status)) {
    issues.add("status", `must be one of: ${SUBAGENT_TASK_STATUSES.join(", ")}`);
  }
  if (!isIsoUtcTimestamp(input.startedAt)) {
    issues.add("startedAt", "must be a strict ISO-8601 UTC timestamp string");
  }
  if (input.completedAt !== undefined) {
    if (!isIsoUtcTimestamp(input.completedAt)) {
      issues.add("completedAt", "must be a strict ISO-8601 UTC timestamp string when present");
    } else if (
      isSubagentTaskStatus(input.status) &&
      !isSubagentTerminalStatus(input.status)
    ) {
      issues.add(
        "completedAt",
        "may only be present on a terminal status (completed, failed, cancelled, killed, stopped, lost)",
      );
    }
  }
  if (input.childSessionId !== undefined) {
    issues.requireNonEmptyString("childSessionId", input.childSessionId, "must be a non-empty string when present");
  }
  if (input.parentToolCallId !== undefined) {
    issues.requireNonEmptyString("parentToolCallId", input.parentToolCallId, "must be a non-empty string when present");
  }
  if (input.pid !== undefined) {
    issues.requireNonNegativeInteger("pid", input.pid);
  }
  if (input.error !== undefined) {
    issues.requireNonEmptyString("error", input.error, "must be a non-empty string when present");
  }
  if (input.outputFile !== undefined) {
    issues.requireNonEmptyString("outputFile", input.outputFile, "must be a non-empty string when present");
  }
  let parsedOutput: AgentOutputWire | undefined;
  if (input.output !== undefined) {
    try {
      parsedOutput = agentOutput(input.output);
    } catch (error) {
      issues.add("output", error instanceof Error ? error.message : String(error));
    }
  }
  issues.throwIfAny("subagent task snapshot");
  const record = input as unknown as SubagentTaskSnapshotWire;
  return Object.freeze({
    taskId: record.taskId,
    agentId: record.agentId,
    agentType: record.agentType,
    description: record.description,
    status: record.status,
    startedAt: record.startedAt,
    ...(record.completedAt !== undefined ? { completedAt: record.completedAt } : {}),
    ...(record.childSessionId !== undefined
      ? { childSessionId: record.childSessionId }
      : {}),
    ...(record.parentToolCallId !== undefined
      ? { parentToolCallId: record.parentToolCallId }
      : {}),
    ...(record.pid !== undefined ? { pid: record.pid } : {}),
    ...(record.error !== undefined ? { error: record.error } : {}),
    ...(parsedOutput !== undefined ? { output: parsedOutput } : {}),
    ...(record.outputFile !== undefined ? { outputFile: record.outputFile } : {}),
  });
}

/**
 * Construct and freeze a validated AgentProfileWire: non-empty name,
 * description and systemPrompt; optional string lists; optional model
 * selection (validated through the pinned strict shape); optional
 * non-negative maxTurns and flags; permissionMode from the APPLICATION
 * vocabulary; source from the pinned profile-source vocabulary.
 */
export function agentProfile(input: unknown): AgentProfileWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid agent profile: must be an object");
  }
  issues.requireNonEmptyString("name", input.name);
  issues.requireNonEmptyString("description", input.description);
  issues.requireNonEmptyString("systemPrompt", input.systemPrompt);
  for (const field of [
    "tools",
    "disallowedTools",
    "skills",
    "mcpServers",
  ] as const) {
    if (input[field] !== undefined && !isStringArray(input[field])) {
      issues.add(field, "must be a string array when present");
    }
  }
  if (input.modelSelection !== undefined) {
    const selection = input.modelSelection;
    if (!isRecord(selection)) {
      issues.add("modelSelection", "must be an object when present");
    } else {
      issues.requireNonEmptyString("modelSelection.providerId", selection.providerId);
      issues.requireNonEmptyString("modelSelection.modelId", selection.modelId);
      if (selection.options !== undefined) {
        const options = selection.options;
        if (!isRecord(options)) {
          issues.add("modelSelection.options", "must be an object when present");
        } else if (
          options.reasoningLevel !== undefined &&
          !isNonEmptyString(options.reasoningLevel)
        ) {
          issues.add(
            "modelSelection.options.reasoningLevel",
            "must be a non-empty string when present",
          );
        }
      }
    }
  }
  if (input.maxTurns !== undefined) {
    issues.requireNonNegativeInteger("maxTurns", input.maxTurns);
  }
  for (const flag of ["background", "memory", "injectAgentsMd"] as const) {
    if (input[flag] !== undefined) {
      issues.requireBoolean(flag, input[flag]);
    }
  }
  if (input.color !== undefined) {
    issues.requireNonEmptyString("color", input.color, "must be a non-empty string when present");
  }
  if (input.permissionMode !== undefined) {
    if (
      typeof input.permissionMode !== "string" ||
      !AGENT_PERMISSION_MODES.includes(
        input.permissionMode as AgentProfileWire["permissionMode"] & string,
      )
    ) {
      issues.add(
        "permissionMode",
        `must be one of: ${AGENT_PERMISSION_MODES.join(", ")} (APPLICATION permission modes — never financial authorization)`,
      );
    }
  }
  if (
    typeof input.source !== "string" ||
    !AGENT_PROFILE_SOURCES.includes(input.source as AgentProfileWire["source"])
  ) {
    issues.add("source", `must be one of: ${AGENT_PROFILE_SOURCES.join(", ")}`);
  }
  issues.throwIfAny("agent profile");
  const record = input as unknown as AgentProfileWire;
  return Object.freeze({
    name: record.name,
    description: record.description,
    systemPrompt: record.systemPrompt,
    ...(record.tools !== undefined ? { tools: Object.freeze([...record.tools]) } : {}),
    ...(record.disallowedTools !== undefined
      ? { disallowedTools: Object.freeze([...record.disallowedTools]) }
      : {}),
    ...(record.skills !== undefined ? { skills: Object.freeze([...record.skills]) } : {}),
    ...(record.mcpServers !== undefined
      ? { mcpServers: Object.freeze([...record.mcpServers]) }
      : {}),
    ...(record.modelSelection !== undefined
      ? { modelSelection: Object.freeze({ ...record.modelSelection }) }
      : {}),
    ...(record.maxTurns !== undefined ? { maxTurns: record.maxTurns } : {}),
    ...(record.background !== undefined ? { background: record.background } : {}),
    ...(record.color !== undefined ? { color: record.color } : {}),
    ...(record.permissionMode !== undefined
      ? { permissionMode: record.permissionMode }
      : {}),
    ...(record.memory !== undefined ? { memory: record.memory } : {}),
    ...(record.injectAgentsMd !== undefined
      ? { injectAgentsMd: record.injectAgentsMd }
      : {}),
    source: record.source,
  });
}
