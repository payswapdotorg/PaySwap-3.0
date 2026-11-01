/**
 * @payswap/app — the SELECTED-MODEL CONVERSATION PORT (P24-3, ADR-0017 D8).
 *
 * The host-bridged model invocation seam for the New Task conversation
 * loop, following the taskSessionPort.ts laws (the P13-A→P13-D
 * precedent): @payswap/app is PRESENTATIONAL — the platform host's
 * composition root binds the REAL substrate model/provider runtime
 * (packages/services providerRuntime → the provider adapters) behind
 * this interface at TL integration (P24-D). The app ships NO default
 * runtime (the web tier renders the honest UNBOUND note below, never a
 * simulated conversation — the taskModelPins no-default-catalog law).
 *
 * LAWS (ADR-0017 D8 + D11 — binding):
 * - SAME SELECTED MODEL: every turn carries the task's persisted
 *   {providerId, modelId, reasoningLevel} VERBATIM. The port NEVER
 *   substitutes a different provider/model — a failure is surfaced as a
 *   typed error, never a fallback (no silent model substitution).
 * - TOOL CALLING HONESTY: if the selected model/provider cannot perform
 *   tool calling, the port reports it (describeModelSupport) and the
 *   loop surfaces the honest note + the compatible-selection offer.
 * - PUBLIC CONTEXT ONLY: messages are user-visible text, tool calls and
 *   bounded tool results. Hidden chain-of-thought NEVER crosses this
 *   port's output surface (reasoning deltas are dropped by the host
 *   binding; the wire pin records that reasoning blocks exist).
 * - SECRETS NEVER ENTER MODEL CONTEXT: by construction the app holds no
 *   credential material; every text crossing this port is
 *   secret-shape-scanned at the writer boundary.
 * - Fail-closed typed errors; no ambient window/session state (INV-23).
 */

import type { AgentTaskModelSelectionPin } from "../lib/agent-task-pins.js";

/* ---------------------------- typed errors --------------------------- */

export type AgentModelConversationErrorCode =
  | "UNBOUND"
  | "MODEL_UNAVAILABLE"
  | "TOOL_CALLING_UNSUPPORTED"
  | "PROVIDER_FAILURE"
  | "TURN_TIMEOUT"
  | "INVALID_REQUEST"
  | "STREAM_PROTOCOL_VIOLATION";

/**
 * The typed, fail-closed model-conversation error. `retryable` carries
 * the provider transport's retry classification (handoff §5.4): the loop
 * retries a retryable provider failure a BOUNDED number of times and
 * surfaces the rest honestly.
 */
export class AgentModelConversationError extends Error {
  readonly code: AgentModelConversationErrorCode;
  readonly retryable: boolean;
  constructor(
    code: AgentModelConversationErrorCode,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "AgentModelConversationError";
    this.code = code;
    this.retryable = retryable;
  }
}

/* ------------------------- the message shapes ------------------------ */

/**
 * One PUBLIC conversation message (STRUCTURAL PIN of the substrate wire
 * roles — packages/zcode-bridge/src/wire/model-tool.ts
 * MODEL_MESSAGE_ROLES: system | user | assistant | tool; read-only
 * reference, never imported). Only user-visible content crosses the
 * port; reasoning content has no field here by construction.
 */
export interface AgentConversationMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  /** User-visible text (tool messages carry the bounded, framed result). */
  readonly content: string;
  /** Present on assistant messages that requested tools. */
  readonly toolCalls?: readonly AgentModelToolCallPin[];
  /** Present on tool messages — binds the result to its call. */
  readonly toolCallId?: string;
}

/** One tool call from the model (STRUCTURAL PIN of ModelToolCallWire). */
export interface AgentModelToolCallPin {
  /** The model's own call id (echoed by the loop in results). */
  readonly id: string;
  /** The registered tool name the model invoked. */
  readonly name: string;
  /** The model's raw argument value (validated fail-closed before use). */
  readonly input: unknown;
}

/* --------------------------- the tool contract ----------------------- */

/**
 * One model-facing tool contract (STRUCTURAL PIN of ModelToolContractWire
 * — the fields the model provider needs; the `execute` hook is
 * DELIBERATELY absent: a contract describes a tool, the host runtime
 * executes it — the bridge pin's own law).
 */
export interface AgentModelToolContractPin {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly readOnly?: boolean;
  readonly needsApproval?: boolean;
  readonly maxOutputBytes?: number;
}

/* ------------------------------ the turn ----------------------------- */

/** A turn request: the persisted selection invoked VERBATIM. */
export interface AgentModelTurnRequest {
  /** Monotonic per conversation (audit lineage; never reused). */
  readonly turnId: string;
  /** The task's persisted model selection — invoked exactly as recorded. */
  readonly selection: AgentTaskModelSelectionPin;
  /** The PUBLIC message history (user/assistant/tool only). */
  readonly messages: readonly AgentConversationMessage[];
  /** The currently registered tool contracts (D9 — never flooded). */
  readonly tools: readonly AgentModelToolContractPin[];
  readonly toolChoice: "auto" | "none" | "required";
}

/** The turn's streaming chunks (reasoning deltas have NO kind here). */
export type AgentModelTurnChunk =
  | { readonly kind: "TEXT_DELTA"; readonly text: string }
  | { readonly kind: "TOOL_CALL"; readonly call: AgentModelToolCallPin }
  | { readonly kind: "TURN_COMPLETED"; readonly finish: AgentModelTurnFinish };

/** How one model turn ended. */
export type AgentModelTurnFinish = "STOP" | "TOOL_CALLS" | "LENGTH";

/** The honest capability report for one exact selection. */
export interface AgentModelSupportReport {
  /** Can this exact provider/model perform tool calling round trips? */
  readonly supportsToolCalling: boolean;
  /** Can it stream the required round trips? (honest report, never a guess) */
  readonly supportsStreaming: boolean;
  /** The people-language note when a capability is absent (rendered verbatim). */
  readonly note?: string;
}

/* ------------------------------- the port ---------------------------- */

/**
 * The selected-model conversation port. The desktop composition root
 * binds the real substrate runtime (the persisted providerId routed
 * through the provider registry, the modelId + reasoningLevel forwarded
 * as the model parameters, tools mapped onto the substrate tool wire);
 * the web mount binds nothing — the honest unbound tier.
 */
export interface AgentModelConversationPort {
  /** HOST_BRIDGED (a real runtime is bound) | UNBOUND (the web tier). */
  readonly tier: "HOST_BRIDGED" | "UNBOUND";
  /** The honest capability report for one exact selection (fail-closed). */
  describeModelSupport(
    selection: AgentTaskModelSelectionPin,
  ): Promise<AgentModelSupportReport>;
  /** Stream one model turn. Rejects with AgentModelConversationError. */
  startTurn(request: AgentModelTurnRequest): AsyncIterable<AgentModelTurnChunk>;
}

/* --------------------------- the honest notes ------------------------ */

/** The web tier's truth: no model runtime is bound (rendered VERBATIM). */
export const AGENT_MODEL_CONVERSATION_UNBOUND_NOTE =
  "No model runtime is bound in this deployment — the conversation engine cannot invoke a model here, and none is substituted silently. The platform host binds the substrate model runtime at its composition root; until then this composer states the gap instead of simulating a conversation." as const;

/** The D11 honest note when the selected model cannot do tool calling. */
export const AGENT_MODEL_TOOL_CALLING_UNSUPPORTED_NOTE =
  "The model selected for this task cannot perform tool calling, so it cannot operate Stripe capabilities for you here. No other model was substituted silently — pick a model that supports tool calling from the model controls, and the conversation continues with that selection." as const;

/** The D11 honest note when the selected model/provider fails. */
export const AGENT_MODEL_PROVIDER_FAILURE_NOTE =
  "The selected model or its provider failed — this conversation turn did not complete. The failure is classified by the provider transport: retryable failures are retried a bounded number of times; anything else is surfaced here honestly. No fallback model was used." as const;
