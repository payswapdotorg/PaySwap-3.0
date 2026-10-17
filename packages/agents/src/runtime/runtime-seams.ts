/**
 * Reference-runtime seams: errors, deterministic clock/id interfaces, tool
 * descriptors, the authorization-decision source and the executor contract
 * (FROZEN-ARCHITECTURE §20; split out of the old repository's 625-line
 * reference-runtime.ts for the <= 400-line file law).
 *
 * DETERMINISM LAW: no wall clock, no random ids, no LLM/HTTP calls inside
 * the runtime. Time comes from an injected `AgentRuntimeClock`, identifiers
 * from an injected `AgentRuntimeIds` factory, agent behavior from an
 * injected `AgentExecutor` seam. The same injected inputs always produce
 * the same session log.
 *
 * ADAPTATION (payswap.org@8a735bf -> PaySwap 3.0): the old
 * `fromProtocolClock` imported the `ProtocolClock` TYPE from
 * @payswap/protocol. This lane's single-sibling law allows only a TYPE-ONLY
 * @payswap/trust link, so the minimal clock shape is re-declared locally as
 * `ProtocolClockSource` (hard-constraint 4: re-declare minimal structural
 * types locally). The real @payswap/protocol DeterministicClock satisfies
 * it structurally.
 */

import type { AuthorizationDecision } from "@payswap/trust";
import type { AgentSessionState, SessionCommand, ToolRequest, ToolResult } from "../runtime.ts";

/** Raised on any invalid runtime operation argument or state transition. */
export class AgentRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRuntimeError";
  }
}

/** Raised when an operation names a session this runtime never created. */
export class UnknownSessionError extends AgentRuntimeError {
  constructor(sessionId: string) {
    super(`unknown session '${sessionId}'`);
    this.name = "UnknownSessionError";
  }
}

/** Raised on an illegal session-state transition (fail closed). */
export class SessionStateError extends AgentRuntimeError {
  readonly from: AgentSessionState;
  readonly to: AgentSessionState;

  constructor(operation: string, from: AgentSessionState, to: AgentSessionState) {
    super(
      `cannot ${operation} session in state ${from} (would move to ${to}): ` +
        "pause/resume/cancel are real state transitions; terminal states are monotonic",
    );
    this.name = "SessionStateError";
    this.from = from;
    this.to = to;
  }
}

/** Raised when a checkpoint no longer matches the session log prefix (tamper fail-closed). */
export class CheckpointIntegrityError extends AgentRuntimeError {
  constructor(sessionId: string, checkpointId: string) {
    super(
      `checkpoint '${checkpointId}' of session '${sessionId}' does not match the append-only log prefix: history must be immutable`,
    );
    this.name = "CheckpointIntegrityError";
  }
}

/** Deterministic time source (number milliseconds, matching the §20 contract). */
export interface AgentRuntimeClock {
  now(): number;
}

/** Deterministic identifier factory for sessions, checkpoints and approvals. */
export interface AgentRuntimeIds {
  nextSessionId(): string;
  nextCheckpointId(): string;
  nextApprovalId(): string;
}

/** Classify a tool's effect: financial tools are gated, informational are not. */
export type ToolEffect = "financial" | "informational";

/**
 * Tool descriptor registered with the runtime. A tool that is not registered
 * is DENIED — unknown tools are never granted (fail closed).
 */
export interface ToolDescriptor {
  readonly toolId: string;
  readonly effect: ToolEffect;
}

/**
 * Source of authorization decisions (evidence lineage). The composition
 * root wires this to decisions produced by the trust lane's evaluate(); the
 * reference runtime only ever RESOLVES references, it never fabricates
 * decisions.
 */
export interface AuthorizationDecisionSource {
  resolve(decisionRef: string): AuthorizationDecision | undefined;
}

/** Handle the injected executor uses to act inside one session. */
export interface ExecutorContext {
  readonly sessionId: string;
  readonly instanceId: string;
  /**
   * Request a tool through the runtime's fail-closed authorization gate.
   * Financial-effect tools require an ALLOW decision reference.
   */
  requestTool(request: ToolRequest): Promise<ToolResult>;
}

/** Deterministic result of one executor invocation. */
export type ExecutorResult =
  | { readonly status: "COMPLETED"; readonly output?: Readonly<Record<string, unknown>> }
  | { readonly status: "REQUIRES_INPUT"; readonly reason?: string }
  | { readonly status: "FAILED"; readonly error: string };

/**
 * The injected agent-behavior seam. Concrete executors (model adapters,
 * P3-W3 transports) implement this; the runtime owns state, events and the
 * tool gate. No LLM or HTTP call ever happens inside the runtime itself.
 */
export interface AgentExecutor {
  execute(command: SessionCommand, context: ExecutorContext): Promise<ExecutorResult>;
}

/** Constructor inputs: everything is injected, nothing is ambient. */
export interface InMemoryAgentRuntimeParams {
  readonly executor: AgentExecutor;
  readonly clock: AgentRuntimeClock;
  readonly ids: AgentRuntimeIds;
  readonly tools?: readonly ToolDescriptor[];
  readonly decisions?: AuthorizationDecisionSource;
}

/**
 * Minimal structural view of the protocol kernel's clock (bigint
 * `TimestampMs`), re-declared locally per the single-sibling law. The real
 * @payswap/protocol clock satisfies this structurally.
 */
export interface ProtocolClockSource {
  now(): bigint;
}

/**
 * Adapt a protocol clock (bigint TimestampMs) onto the number-based
 * `AgentRuntimeClock` seam mandated by the frozen §20 contract. Fails closed
 * with a RangeError when the protocol time exceeds `Number.MAX_SAFE_INTEGER`
 * rather than silently losing precision.
 */
export function fromProtocolClock(clock: ProtocolClockSource): AgentRuntimeClock {
  return {
    now(): number {
      const ms = clock.now();
      if (ms > BigInt(Number.MAX_SAFE_INTEGER) || ms < -BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError(
          "protocol clock time exceeds Number.MAX_SAFE_INTEGER: refusing lossy number conversion",
        );
      }
      return Number(ms);
    },
  };
}

/** Deterministic sequential id factory: `session-1`, `checkpoint-2`, … */
export class SequentialIdFactory implements AgentRuntimeIds {
  readonly #prefix: string;
  #next = 0;

  constructor(prefix = "") {
    this.#prefix = prefix;
  }

  #mint(kind: string): string {
    this.#next += 1;
    return `${this.#prefix}${kind}-${this.#next}`;
  }

  nextSessionId(): string {
    return this.#mint("session");
  }

  nextCheckpointId(): string {
    return this.#mint("checkpoint");
  }

  nextApprovalId(): string {
    return this.#mint("approval");
  }
}

/** Manual number-millisecond clock for deterministic tests and replay. */
export class ManualClock implements AgentRuntimeClock {
  #now: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) {
      throw new AgentRuntimeError("clock seed must be finite");
    }
    this.#now = seed;
  }

  now(): number {
    return this.#now;
  }

  set(now: number): void {
    this.#now = now;
  }

  advanceBy(ms: number): void {
    this.#now += ms;
  }
}
