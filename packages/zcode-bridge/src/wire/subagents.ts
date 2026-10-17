/**
 * Pinned wire shapes: subagents (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/contracts/src/interfaces/subagent.port.ts
 * (SubagentRunRequest, SubagentTaskSnapshot, the 7-value task status
 * vocabulary, the port method surface),
 * apps/zcode-cli/packages/contracts/src/tools/agent.ts (AgentOutput =
 * completed | async_launched, AgentTextContentBlock) and
 * apps/zcode-cli/packages/core/src/subagent/profile.ts (AgentProfile).
 *
 * ADAPTATION (migration map: subagents/workflows KEEP as mechanics; the
 * built-in agent types "general-purpose"/"Explore" and their tool lists are
 * coding-product flavored): the bridge pins the port/profile mechanics and
 * records the built-in agent type names as OBSERVED vocabulary. Profile
 * permission modes ("auto" | "plan") are APPLICATION permission modes —
 * never financial authorization.
 */

/** Subagent task statuses (pin of SubagentTaskStatus). */
export type SubagentTaskStatusWire =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "killed"
  | "stopped"
  | "lost";

/** The frozen subagent task status vocabulary. */
export const SUBAGENT_TASK_STATUSES: readonly SubagentTaskStatusWire[] =
  Object.freeze([
    "running",
    "completed",
    "failed",
    "cancelled",
    "killed",
    "stopped",
    "lost",
  ]);

/** The terminal statuses (the substrate's settled states). */
export const SUBAGENT_TERMINAL_STATUSES: readonly SubagentTaskStatusWire[] =
  Object.freeze(["completed", "failed", "cancelled", "killed", "stopped", "lost"]);

/** A text content block of an agent's completed output (pin of AgentTextContentBlock). */
export interface AgentTextContentBlockWire {
  readonly type: "text";
  readonly text: string;
}

/** A completed subagent run (pin of AgentCompletedOutput). */
export interface AgentCompletedOutputWire {
  readonly status: "completed";
  readonly agentId: string;
  readonly agentType: string;
  readonly description: string;
  readonly prompt: string;
  readonly content: readonly AgentTextContentBlockWire[];
  readonly totalToolUseCount: number;
  readonly totalDurationMs: number;
  readonly totalTokens?: number;
  readonly usage?: Readonly<Record<string, unknown>>;
}

/** A backgrounded subagent launch (pin of AgentBackgroundedOutput). */
export interface AgentBackgroundedOutputWire {
  readonly status: "async_launched";
  readonly isAsync: true;
  readonly agentId: string;
  readonly agentType: string;
  readonly description: string;
  readonly prompt: string;
  readonly childSessionId: string;
  readonly backgroundTaskId: string;
  readonly outputFile: string;
  readonly canReadOutputFile: boolean;
}

/** Agent output (pin of AgentOutput). */
export type AgentOutputWire =
  | AgentCompletedOutputWire
  | AgentBackgroundedOutputWire;

/** A subagent run request (pin of SubagentRunRequest; descriptive only). */
export interface SubagentRunRequestWire {
  readonly sessionId: string;
  readonly turnId?: string;
  readonly parentToolCallId: string;
  readonly agentType: string;
  readonly description: string;
  readonly prompt: string;
  readonly callerCanReadOutputFile?: boolean;
  readonly workingDirectory: string;
  readonly workspaceRoot: string;
}

/** A subagent task snapshot (pin of SubagentTaskSnapshot). */
export interface SubagentTaskSnapshotWire {
  readonly taskId: string;
  readonly agentId: string;
  readonly agentType: string;
  readonly description: string;
  readonly status: SubagentTaskStatusWire;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly childSessionId?: string;
  readonly parentToolCallId?: string;
  readonly pid?: number;
  readonly error?: string;
  readonly output?: AgentOutputWire;
  readonly outputFile?: string;
}

/** Agent profile permission modes (pin of AgentPermissionMode — APPLICATION permission). */
export type AgentPermissionModeWire = "auto" | "plan";

/** The frozen agent permission-mode vocabulary. */
export const AGENT_PERMISSION_MODES: readonly AgentPermissionModeWire[] =
  Object.freeze(["auto", "plan"]);

/** Agent profile sources (pin of AgentProfile.source). */
export type AgentProfileSourceWire = "built-in" | "project" | "user";

/** The frozen agent profile-source vocabulary. */
export const AGENT_PROFILE_SOURCES: readonly AgentProfileSourceWire[] =
  Object.freeze(["built-in", "project", "user"]);

/**
 * An agent profile (pin of core/src/subagent/profile.ts AgentProfile):
 * the descriptive identity of a subagent type — system prompt, tool
 * allow/deny lists, skills, MCP servers, model selection, turn budget.
 */
export interface AgentProfileWire {
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools?: readonly string[];
  readonly disallowedTools?: readonly string[];
  readonly skills?: readonly string[];
  readonly mcpServers?: readonly string[];
  readonly modelSelection?: {
    readonly providerId: string;
    readonly modelId: string;
    readonly options?: { readonly reasoningLevel?: string };
  };
  readonly maxTurns?: number;
  readonly background?: boolean;
  readonly color?: string;
  readonly permissionMode?: AgentPermissionModeWire;
  readonly memory?: boolean;
  readonly injectAgentsMd?: boolean;
  readonly source: AgentProfileSourceWire;
}

/**
 * The substrate's built-in agent type names, pinned as OBSERVED vocabulary
 * (coding-flavored product identity — adaptation note on the surface
 * observation).
 */
export const OBSERVED_BUILT_IN_AGENT_TYPES: readonly string[] = Object.freeze([
  "general-purpose",
  "Explore",
]);

/** The subagent port capability list (pin of SubagentPort method names — descriptive only). */
export const SUBAGENT_PORT_CAPABILITIES: readonly string[] = Object.freeze([
  "launch",
  "run",
  "start",
  "backgroundTask",
  "getTask",
  "waitForTask",
  "stopTask",
  "sendMessage",
]);
