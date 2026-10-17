/**
 * Pinned wire shapes: model-facing tool wire (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/contracts/src/model/index.ts: the wire the
 * substrate presents TO the model provider — ModelToolContract (with the
 * `execute` hook DELIBERATELY dropped: this bridge pins description, never
 * execution), ModelToolCall / ModelToolResult (the tool_use round-trip),
 * ModelToolChoice, message roles, content-block kinds, and the streaming
 * event vocabulary.
 */

/** Message roles (pin of ModelMessageRole). */
export type ModelMessageRoleWire =
  | "system"
  | "user"
  | "assistant"
  | "tool";

/** The frozen message-role vocabulary. */
export const MODEL_MESSAGE_ROLES: readonly ModelMessageRoleWire[] =
  Object.freeze(["system", "user", "assistant", "tool"]);

/** Content-block kinds (pin of ModelMessageContentBlock discriminants). */
export type ModelContentBlockKindWire =
  | "text"
  | "reasoning"
  | "image"
  | "video"
  | "file"
  | "resource_link";

/** The frozen content-block-kind vocabulary. */
export const MODEL_CONTENT_BLOCK_KINDS: readonly ModelContentBlockKindWire[] =
  Object.freeze([
    "text",
    "reasoning",
    "image",
    "video",
    "file",
    "resource_link",
  ]);

/** Tool choice forms (pin of ModelToolChoice). */
export type ModelToolChoiceWire =
  | "auto"
  | "none"
  | "required"
  | { readonly type: "tool"; readonly toolName: string };

/** The frozen tool-choice literal vocabulary. */
export const MODEL_TOOL_CHOICE_KINDS: readonly ("auto" | "none" | "required")[] =
  Object.freeze(["auto", "none", "required"]);

/** Tool side-effect scopes on the model contract (pin: ModelToolSideEffectScope mirrors contracts ToolSideEffectScope). */
export type ModelToolSideEffectScopeWire =
  | "none"
  | "workspace"
  | "git"
  | "network"
  | "system"
  | "session"
  | "userInteraction";

/** The frozen model-tool side-effect-scope vocabulary. */
export const MODEL_TOOL_SIDE_EFFECT_SCOPES: readonly ModelToolSideEffectScopeWire[] =
  Object.freeze([
    "none",
    "workspace",
    "git",
    "network",
    "system",
    "session",
    "userInteraction",
  ]);

/**
 * The model-facing tool contract (pin of ModelToolContract MINUS the
 * `execute` member — a bridged contract describes a tool; the substrate
 * runtime, not the bridge, executes).
 */
export interface ModelToolContractWire {
  readonly name: string;
  readonly description?: string;
  readonly capability?: string;
  readonly executionMode?: "client" | "providerNative";
  readonly providerNative?: {
    readonly kind: "provider_native";
    readonly logicalName: string;
    readonly providerToolName: string;
    readonly providerIds?: readonly string[];
    readonly args?: Readonly<Record<string, unknown>>;
    readonly fallback: "disabled";
  };
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly strict?: boolean;
  readonly readOnly?: boolean;
  readonly destructive?: boolean;
  readonly concurrentSafe?: boolean;
  readonly requiresUserInteraction?: boolean;
  readonly maxOutputBytes?: number;
  readonly timeoutMs?: number;
  readonly needsApproval?: boolean;
  readonly sideEffectScope?: ModelToolSideEffectScopeWire;
}

/**
 * A tool call from the model (pin of ModelToolCall; re-exported by the
 * substrate session-events lane as ToolCall).
 */
export interface ModelToolCallWire {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly providerExecuted?: boolean;
}

/** A tool result returned to the model (pin of ModelToolResult). */
export interface ModelToolResultWire {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly providerExecuted?: boolean;
  readonly providerMetadata?: Readonly<Record<string, unknown>>;
}

/** Cache-control scopes (pin of ModelCacheControl). */
export type ModelCacheControlScopeWire = "system" | "messages";

/**
 * Streaming event kinds (pin of the ModelStreamEvent discriminants). The
 * substrate names compact-stream boundaries with five boundary kinds; the
 * bridge pins the event-kind vocabulary as strings.
 */
export type ModelStreamEventKindWire =
  | "start"
  | "compact_stream_boundary"
  | "text_start"
  | "text_delta"
  | "text_end"
  | "reasoning_start"
  | "reasoning_delta"
  | "reasoning_end"
  | "tool_input_start"
  | "tool_input_delta"
  | "tool_input_end"
  | "tool_call"
  | "finish"
  | "error";

/** The frozen streaming event-kind vocabulary. */
export const MODEL_STREAM_EVENT_KINDS: readonly ModelStreamEventKindWire[] =
  Object.freeze([
    "start",
    "compact_stream_boundary",
    "text_start",
    "text_delta",
    "text_end",
    "reasoning_start",
    "reasoning_delta",
    "reasoning_end",
    "tool_input_start",
    "tool_input_delta",
    "tool_input_end",
    "tool_call",
    "finish",
    "error",
  ]);
