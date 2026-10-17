/**
 * Subagents surface tests (P3-W3): run requests, the output union, task
 * snapshots with the terminal-state law, and profiles.
 */

import { describe, expect, it } from "vitest";

import {
  AGENT_PERMISSION_MODES,
  AGENT_PROFILE_SOURCES,
  OBSERVED_BUILT_IN_AGENT_TYPES,
  SUBAGENT_PORT_CAPABILITIES,
  SUBAGENT_TASK_STATUSES,
  SUBAGENT_TERMINAL_STATUSES,
  agentOutput,
  agentProfile,
  isSubagentTaskStatus,
  isSubagentTerminalStatus,
  subagentRunRequest,
  subagentTaskSnapshot,
} from "../src/index.ts";

const VALID_RUN_REQUEST = {
  sessionId: "sess_1",
  parentToolCallId: "tool_1",
  agentType: "general-purpose",
  description: "explore the repo",
  prompt: "find all tests",
  workingDirectory: "/work",
  workspaceRoot: "/work",
};

const VALID_COMPLETED_OUTPUT = {
  status: "completed",
  agentId: "agent_1",
  agentType: "general-purpose",
  description: "explore the repo",
  prompt: "find all tests",
  content: [{ type: "text", text: "found 12 tests" }],
  totalToolUseCount: 3,
  totalDurationMs: 1200,
};

const VALID_SNAPSHOT = {
  taskId: "task_1",
  agentId: "agent_1",
  agentType: "general-purpose",
  description: "explore the repo",
  status: "running",
  startedAt: "2026-10-17T07:00:00Z",
};

describe("subagents surface", () => {
  it("pins the 7-value task status vocabulary and its terminal subset", () => {
    expect([...SUBAGENT_TASK_STATUSES]).toEqual([
      "running",
      "completed",
      "failed",
      "cancelled",
      "killed",
      "stopped",
      "lost",
    ]);
    expect([...SUBAGENT_TERMINAL_STATUSES]).toEqual([
      "completed",
      "failed",
      "cancelled",
      "killed",
      "stopped",
      "lost",
    ]);
    expect(isSubagentTaskStatus("lost")).toBe(true);
    expect(isSubagentTaskStatus("paused")).toBe(false);
    expect(isSubagentTerminalStatus("running")).toBe(false);
    expect(isSubagentTerminalStatus("completed")).toBe(true);
  });

  it("constructs and freezes a valid run request", () => {
    const request = subagentRunRequest({
      ...VALID_RUN_REQUEST,
      turnId: "turn_2",
      callerCanReadOutputFile: true,
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(request.callerCanReadOutputFile).toBe(true);
  });

  it("run request rejects empty identity fields", () => {
    expect(() =>
      subagentRunRequest({ ...VALID_RUN_REQUEST, agentType: "" }),
    ).toThrowError(/agentType/);
    expect(() =>
      subagentRunRequest({ ...VALID_RUN_REQUEST, workingDirectory: "" }),
    ).toThrowError(/workingDirectory/);
  });

  it("validates the completed arm of the output union", () => {
    const output = agentOutput({
      ...VALID_COMPLETED_OUTPUT,
      totalTokens: 500,
      usage: { inputTokens: 300 },
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(output.status).toBe("completed");
    if (output.status === "completed") {
      expect(output.content[0]?.text).toBe("found 12 tests");
    }
  });

  it("validates the async_launched arm of the output union", () => {
    const output = agentOutput({
      status: "async_launched",
      isAsync: true,
      agentId: "agent_1",
      agentType: "general-purpose",
      description: "explore",
      prompt: "find tests",
      childSessionId: "sess_child",
      backgroundTaskId: "task_9",
      outputFile: "/tmp/out.txt",
      canReadOutputFile: true,
    });
    expect(output.status).toBe("async_launched");
    if (output.status === "async_launched") {
      expect(output.isAsync).toBe(true);
      expect(output.backgroundTaskId).toBe("task_9");
    }
  });

  it("output rejects unknown statuses, non-true isAsync and malformed content blocks", () => {
    expect(() => agentOutput({ status: "pending" })).toThrowError(/status/);
    expect(() =>
      agentOutput({
        ...VALID_COMPLETED_OUTPUT,
        content: [{ type: "image", data: "x" } as never],
      }),
    ).toThrowError(/content/);
    expect(() =>
      agentOutput({ status: "async_launched", isAsync: false as never }),
    ).toThrowError(/isAsync/);
    expect(() =>
      agentOutput({ ...VALID_COMPLETED_OUTPUT, totalToolUseCount: -1 }),
    ).toThrowError(/totalToolUseCount/);
  });

  it("constructs and freezes a valid task snapshot with completed output", () => {
    const snapshot = subagentTaskSnapshot({
      ...VALID_SNAPSHOT,
      status: "completed",
      completedAt: "2026-10-17T07:01:00Z",
      childSessionId: "sess_child",
      output: VALID_COMPLETED_OUTPUT,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.output?.status).toBe("completed");
  });

  it("snapshots reject completedAt on non-terminal statuses (settled-state law)", () => {
    expect(() =>
      subagentTaskSnapshot({
        ...VALID_SNAPSHOT,
        status: "running",
        completedAt: "2026-10-17T07:01:00Z",
      }),
    ).toThrowError(/completedAt.*terminal/);
  });

  it("snapshots reject bad timestamps, statuses and outputs", () => {
    expect(() =>
      subagentTaskSnapshot({ ...VALID_SNAPSHOT, startedAt: "yesterday" }),
    ).toThrowError(/startedAt/);
    expect(() =>
      subagentTaskSnapshot({ ...VALID_SNAPSHOT, status: "paused" as never }),
    ).toThrowError(/status/);
    expect(() =>
      subagentTaskSnapshot({ ...VALID_SNAPSHOT, output: { status: "nope" } as never }),
    ).toThrowError(/output/);
  });

  it("constructs and freezes a valid agent profile", () => {
    const profile = agentProfile({
      name: "Explore",
      description: "Fast exploration agent",
      systemPrompt: "You explore codebases.",
      tools: ["Glob", "Grep", "Read"],
      modelSelection: { providerId: "zai", modelId: "glm-4.7", options: { reasoningLevel: "high" } },
      maxTurns: 15,
      permissionMode: "plan",
      source: "built-in",
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(profile.source).toBe("built-in");
    expect(profile.permissionMode).toBe("plan");
  });

  it("profiles reject bad sources, permission modes and model selections", () => {
    expect(() =>
      agentProfile({
        name: "x",
        description: "d",
        systemPrompt: "s",
        source: "marketplace" as never,
      }),
    ).toThrowError(/source/);
    expect(() =>
      agentProfile({
        name: "x",
        description: "d",
        systemPrompt: "s",
        source: "user",
        permissionMode: "yolo" as never,
      }),
    ).toThrowError(/permissionMode/);
    expect(() =>
      agentProfile({
        name: "x",
        description: "d",
        systemPrompt: "s",
        source: "user",
        modelSelection: { providerId: "", modelId: "m" },
      }),
    ).toThrowError(/providerId/);
    expect(() =>
      agentProfile({
        name: "x",
        description: "d",
        systemPrompt: "s",
        source: "user",
        maxTurns: -3,
      }),
    ).toThrowError(/maxTurns/);
  });

  it("pins the APPLICATION permission-mode and profile-source vocabularies plus port capabilities", () => {
    expect([...AGENT_PERMISSION_MODES]).toEqual(["auto", "plan"]);
    expect([...AGENT_PROFILE_SOURCES]).toEqual(["built-in", "project", "user"]);
    expect(SUBAGENT_PORT_CAPABILITIES).toContain("launch");
    expect(SUBAGENT_PORT_CAPABILITIES).toContain("stopTask");
    expect(OBSERVED_BUILT_IN_AGENT_TYPES).toContain("Explore");
  });
});
