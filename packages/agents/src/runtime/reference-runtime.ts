/**
 * In-memory reference agent runtime (FROZEN-ARCHITECTURE §20).
 *
 * Implements the `AgentRuntimeContract` with: DETERMINISM (injected clock,
 * id factory and executor seam — no wall clock, no random ids, no LLM/HTTP
 * inside the runtime); EVENT SOURCING (append-only per-session event logs;
 * checkpoints snapshot the log, `restoreCheckpoint` rewinds RUNTIME STATE
 * while the log itself is retained — historical evidence is immutable);
 * REAL STATE TRANSITIONS (pause/resume/cancel are genuine state-machine
 * transitions; a paused session cannot execute or call tools; terminal
 * states are monotonic); and the FAIL-CLOSED TOOL GATE (a financial-effect
 * tool call must carry an authorization-decision reference resolvable to an
 * ALLOW decision produced by the trust lane's evaluate(); anything else
 * REJECTS the call — never best-effort).
 *
 * External protocols (MCP, A2A, AG-UI, REST) are edge adapters to the contract
 * and never domain authority; this reference runtime is the deterministic
 * in-process implementation.
 *
 * Ported from payswap.org@8a735bf
 * packages/agents/src/runtime/reference-runtime.ts (split: the seams live in
 * runtime-seams.ts, the tool gate in tool-gate.ts, and the @payswap/protocol
 * clock type is re-declared locally as ProtocolClockSource per the
 * single-sibling law).
 */

import type {
  AgentEvent,
  AgentRuntimeContract,
  AgentSession,
  ApprovalResult,
  ApprovalSubmission,
  CheckpointRef,
  ExecutionOutcome,
  SessionCommand,
  SessionCreateRequest,
  SessionInspection,
  ToolRequest,
  ToolResult,
} from "../runtime.ts";
import {
  AgentRuntimeError,
  SessionStateError,
  UnknownSessionError,
  CheckpointIntegrityError,
  type AgentExecutor,
  type AgentRuntimeClock,
  type AgentRuntimeIds,
  type AuthorizationDecisionSource,
  type ExecutorContext,
  type ExecutorResult,
  type InMemoryAgentRuntimeParams,
  type ToolDescriptor,
} from "./runtime-seams.ts";
import { evaluateToolRequest } from "./tool-gate.ts";

interface CheckpointSnapshot {
  readonly ref: CheckpointRef;
  readonly session: AgentSession;
  readonly pendingApprovals: readonly string[];
  readonly eventsPrefix: readonly AgentEvent[];
  readonly timeBudgetMs?: number;
}

interface SessionRecord {
  session: AgentSession;
  readonly events: AgentEvent[];
  readonly pendingApprovals: string[];
  readonly checkpoints: Map<string, CheckpointSnapshot>;
  lastCheckpoint?: CheckpointSnapshot;
  readonly requestedCapabilities: readonly string[];
  readonly timeBudgetMs?: number;
}

function requireNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new AgentRuntimeError(`${label} must not be empty`);
  }
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The in-memory reference runtime. See the module documentation for the
 * determinism, event-sourcing, state-machine and fail-closed guarantees.
 */
export class InMemoryAgentRuntime implements AgentRuntimeContract {
  readonly #executor: AgentExecutor;
  readonly #clock: AgentRuntimeClock;
  readonly #ids: AgentRuntimeIds;
  readonly #tools: readonly ToolDescriptor[];
  readonly #decisions: AuthorizationDecisionSource | undefined;
  readonly #sessions = new Map<string, SessionRecord>();

  constructor(params: InMemoryAgentRuntimeParams) {
    this.#executor = params.executor;
    this.#clock = params.clock;
    this.#ids = params.ids;
    this.#tools = params.tools ?? [];
    this.#decisions = params.decisions;
    // Fail closed at construction: a financial tool without a decision source
    // could never be granted; such a runtime must not even start.
    if (this.#decisions === undefined && this.#tools.some((tool) => tool.effect === "financial")) {
      throw new AgentRuntimeError(
        "financial-effect tools require an AuthorizationDecisionSource: construct the runtime with the trust decision seam",
      );
    }
    const seenTools = new Set<string>();
    for (const tool of this.#tools) {
      requireNonEmpty(tool.toolId, "toolId");
      if (seenTools.has(tool.toolId)) {
        throw new AgentRuntimeError(`duplicate tool descriptor '${tool.toolId}'`);
      }
      seenTools.add(tool.toolId);
    }
  }

  #require(sessionId: string): SessionRecord {
    const record = this.#sessions.get(sessionId);
    if (record === undefined) {
      throw new UnknownSessionError(sessionId);
    }
    return record;
  }

  #emit(record: SessionRecord, type: AgentEvent["type"], payload?: Readonly<Record<string, unknown>>): void {
    const event: AgentEvent = {
      type,
      sessionId: record.session.sessionId,
      occurredAt: this.#clock.now(),
      ...(payload !== undefined ? { payload } : {}),
    };
    record.events.push(event);
  }

  #snapshot(record: SessionRecord, checkpointId: string): CheckpointSnapshot {
    return {
      ref: { checkpointId, sequence: record.events.length },
      session: { ...record.session },
      pendingApprovals: [...record.pendingApprovals],
      eventsPrefix: [...record.events],
      ...(record.timeBudgetMs !== undefined ? { timeBudgetMs: record.timeBudgetMs } : {}),
    };
  }

  #verifyPrefix(record: SessionRecord, snapshot: CheckpointSnapshot): void {
    const prefix = record.events.slice(0, snapshot.ref.sequence);
    if (
      prefix.length !== snapshot.ref.sequence ||
      !jsonEqual(prefix, snapshot.eventsPrefix)
    ) {
      throw new CheckpointIntegrityError(record.session.sessionId, snapshot.ref.checkpointId);
    }
  }

  async createSession(request: SessionCreateRequest): Promise<AgentSession> {
    requireNonEmpty(request.instanceId, "instanceId");
    for (const capability of request.requestedCapabilities) {
      requireNonEmpty(capability, "requestedCapabilities entry");
    }
    if (request.timeBudgetMs !== undefined && request.timeBudgetMs <= 0) {
      throw new AgentRuntimeError("timeBudgetMs must be positive when supplied");
    }
    const sessionId = this.#ids.nextSessionId();
    const session: AgentSession = {
      sessionId,
      instanceId: request.instanceId,
      createdAt: this.#clock.now(),
      state: "ACTIVE",
    };
    const record: SessionRecord = {
      session,
      events: [],
      pendingApprovals: [],
      checkpoints: new Map(),
      requestedCapabilities: [...request.requestedCapabilities],
      ...(request.timeBudgetMs !== undefined ? { timeBudgetMs: request.timeBudgetMs } : {}),
    };
    this.#sessions.set(sessionId, record);
    this.#emit(record, "session_created", {
      instanceId: request.instanceId,
      requestedCapabilities: [...request.requestedCapabilities],
      ...(request.timeBudgetMs !== undefined ? { timeBudgetMs: request.timeBudgetMs } : {}),
    });
    return { ...session };
  }

  async execute(sessionId: string, command: SessionCommand): Promise<ExecutionOutcome> {
    requireNonEmpty(command.commandId, "commandId");
    const record = this.#require(sessionId);
    if (record.session.state !== "ACTIVE") {
      throw new SessionStateError("execute", record.session.state, record.session.state);
    }
    const budget = record.timeBudgetMs;
    if (budget !== undefined && this.#clock.now() - record.session.createdAt >= budget) {
      this.#emit(record, "errored", { commandId: command.commandId, reason: "time_budget_exceeded" });
      record.session = { ...record.session, state: "FAILED" };
      return { commandId: command.commandId, status: "FAILED" };
    }
    this.#emit(record, "execution_started", { commandId: command.commandId });
    const context: ExecutorContext = {
      sessionId,
      instanceId: record.session.instanceId,
      requestTool: (toolRequest) => this.requestTool(sessionId, toolRequest),
    };
    let result: ExecutorResult;
    try {
      result = await this.#executor.execute(command, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#emit(record, "errored", { commandId: command.commandId, error: message });
      record.session = { ...record.session, state: "FAILED" };
      return { commandId: command.commandId, status: "FAILED" };
    }
    switch (result.status) {
      case "COMPLETED": {
        this.#emit(record, "execution_completed", {
          commandId: command.commandId,
          status: "COMPLETED",
        });
        record.session = { ...record.session, state: "COMPLETED" };
        return {
          commandId: command.commandId,
          status: "COMPLETED",
          ...(result.output !== undefined ? { output: result.output } : {}),
        };
      }
      case "REQUIRES_INPUT": {
        const approvalId = this.#ids.nextApprovalId();
        record.pendingApprovals.push(approvalId);
        this.#emit(record, "approval_requested", {
          commandId: command.commandId,
          approvalId,
          ...(result.reason !== undefined ? { reason: result.reason } : {}),
        });
        return { commandId: command.commandId, status: "REQUIRES_INPUT" };
      }
      case "FAILED": {
        this.#emit(record, "errored", { commandId: command.commandId, error: result.error });
        record.session = { ...record.session, state: "FAILED" };
        return { commandId: command.commandId, status: "FAILED" };
      }
    }
  }

  streamEvents(sessionId: string): AsyncIterableIterator<AgentEvent> {
    const record = this.#require(sessionId);
    // Deterministic replay semantics: the stream yields the append-only log
    // exactly as recorded at call time, in order, then completes. Live
    // transport streaming is an edge-adapter concern, never domain
    // behavior, so the reference runtime stays replay-deterministic.
    const log = [...record.events];
    return (async function* replay(): AsyncIterableIterator<AgentEvent> {
      for (const event of log) {
        yield event;
      }
    })();
  }

  async approve(sessionId: string, submission: ApprovalSubmission): Promise<ApprovalResult> {
    const record = this.#require(sessionId);
    if (record.session.state !== "ACTIVE") {
      throw new SessionStateError("approve in", record.session.state, record.session.state);
    }
    const next = record.pendingApprovals[0];
    if (next === undefined) {
      return { accepted: false, reason: "no_pending_approval" };
    }
    if (Object.keys(submission.approvalArtifact).length === 0) {
      return { accepted: false, reason: "empty_approval_artifact" };
    }
    record.pendingApprovals.shift();
    this.#emit(record, "approval_recorded", { approvalId: next });
    // Structural recording only: cryptographic verification of the artifact
    // belongs to the trusted approval surface. A chat message is not
    // authority; runtimes must never fabricate or verify signatures.
    return { accepted: true };
  }

  async requestTool(sessionId: string, request: ToolRequest): Promise<ToolResult> {
    requireNonEmpty(request.toolId, "toolId");
    const record = this.#require(sessionId);
    if (record.session.state !== "ACTIVE") {
      // A paused, cancelled or failed session cannot act — fail closed.
      this.#emit(record, "tool_requested", {
        toolId: request.toolId,
        status: "DENIED",
        reason: `session_not_active:${record.session.state}`,
      });
      return { toolId: request.toolId, status: "DENIED" };
    }
    const gate = evaluateToolRequest(this.#tools, this.#decisions, request);
    this.#emit(record, "tool_requested", {
      toolId: request.toolId,
      status: gate.result.status,
      ...(gate.reason !== undefined ? { reason: gate.reason } : {}),
      ...(gate.effect !== undefined ? { effect: gate.effect } : {}),
      ...(gate.decisionRef !== undefined ? { decisionRef: gate.decisionRef } : {}),
    });
    return gate.result;
  }

  async checkpoint(sessionId: string): Promise<CheckpointRef> {
    const record = this.#require(sessionId);
    if (record.session.state !== "ACTIVE" && record.session.state !== "PAUSED") {
      throw new SessionStateError("checkpoint", record.session.state, record.session.state);
    }
    const checkpointId = this.#ids.nextCheckpointId();
    this.#emit(record, "checkpointed", { checkpointId });
    const snapshot = this.#snapshot(record, checkpointId);
    record.checkpoints.set(checkpointId, snapshot);
    record.lastCheckpoint = snapshot;
    return { ...snapshot.ref };
  }

  async pause(sessionId: string): Promise<void> {
    const record = this.#require(sessionId);
    if (record.session.state !== "ACTIVE") {
      throw new SessionStateError("pause", record.session.state, "PAUSED");
    }
    record.session = { ...record.session, state: "PAUSED" };
    this.#emit(record, "paused");
    // A pause always materializes a checkpoint: the session log and state are
    // captured so resume/restore never depends on ambient memory.
    const checkpointId = this.#ids.nextCheckpointId();
    this.#emit(record, "checkpointed", { checkpointId });
    const snapshot = this.#snapshot(record, checkpointId);
    record.checkpoints.set(checkpointId, snapshot);
    record.lastCheckpoint = snapshot;
  }

  async resume(sessionId: string): Promise<void> {
    const record = this.#require(sessionId);
    if (record.session.state !== "PAUSED") {
      throw new SessionStateError("resume", record.session.state, "ACTIVE");
    }
    // Restore: verify the log prefix captured at the pause checkpoint is still
    // intact (the append-only history was not rewritten while paused).
    const snapshot = record.lastCheckpoint;
    if (snapshot !== undefined) {
      this.#verifyPrefix(record, snapshot);
    }
    record.session = { ...record.session, state: "ACTIVE" };
    this.#emit(record, "resumed");
  }

  async cancel(sessionId: string, reason: string): Promise<void> {
    requireNonEmpty(reason, "cancel reason");
    const record = this.#require(sessionId);
    if (record.session.state !== "ACTIVE" && record.session.state !== "PAUSED") {
      throw new SessionStateError("cancel", record.session.state, "CANCELLED");
    }
    record.session = { ...record.session, state: "CANCELLED" };
    this.#emit(record, "cancelled", { reason });
  }

  async inspect(sessionId: string): Promise<SessionInspection> {
    const record = this.#require(sessionId);
    return {
      session: { ...record.session },
      ...(record.lastCheckpoint !== undefined
        ? { lastCheckpoint: { ...record.lastCheckpoint.ref } }
        : {}),
      pendingApprovals: [...record.pendingApprovals],
    };
  }

  /**
   * Reference extension (NOT part of the frozen §20 contract): crash-recovery
   * restore of the session runtime state from a stored checkpoint. The
   * append-only event log is fully RETAINED; only the runtime state (session
   * fields, pending approvals) rewinds, and a `resumed` event with a
   * `restoredFrom` marker is appended so the recovery is itself evidenced.
   * Requires a non-terminal session.
   */
  async restoreCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    const record = this.#require(sessionId);
    if (
      record.session.state !== "ACTIVE" &&
      record.session.state !== "PAUSED"
    ) {
      throw new SessionStateError("restore", record.session.state, record.session.state);
    }
    const snapshot = record.checkpoints.get(checkpointId);
    if (snapshot === undefined) {
      throw new AgentRuntimeError(
        `unknown checkpoint '${checkpointId}' for session '${sessionId}'`,
      );
    }
    this.#verifyPrefix(record, snapshot);
    record.session = { ...snapshot.session };
    record.pendingApprovals.length = 0;
    record.pendingApprovals.push(...snapshot.pendingApprovals);
    record.lastCheckpoint = snapshot;
    this.#emit(record, "resumed", { restoredFrom: checkpointId, sequence: snapshot.ref.sequence });
  }
}
