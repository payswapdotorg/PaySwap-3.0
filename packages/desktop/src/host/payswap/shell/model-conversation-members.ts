/**
 * PaySwap Desktop (P24-D, ADR-0017 D8) — the MODEL-CONVERSATION channel
 * member: the host-side selected-model invocation over the substrate
 * agent service's REAL workspace model runtime
 * (IZCodeAgentService.generateWorkspaceText — the workspace/generateText
 * protocol RPC: selection + messages + tools → text + toolCalls +
 * finishReason + usage; the CLI worker holds every credential, the
 * product host never sees provider keys).
 *
 * THE WIRING LAWS (ADR-0017 D8 + D11):
 * - SAME SELECTED MODEL: the request's persisted selection
 *   {providerId, modelId, reasoningLevel} maps VERBATIM onto the
 *   substrate's {providerId, modelId, options.reasoningLevel} — never
 *   a substitution, never a default. A missing selection is a typed
 *   INVALID_REQUEST refusal.
 * - PUBLIC CONTEXT ONLY: the wire carries user-visible text, tool
 *   contracts and bounded tool results; the substrate's usage block is
 *   token counts (no reasoning content crosses by construction — the
 *   result schema has no reasoning field).
 * - TURN-LEVEL HONESTY: the substrate RPC answers a COMPLETED turn
 *   (turn-level granularity, not token streaming); the result DTO
 *   carries that truth and the renderer's port adapter emits the
 *   turn's text as its deltas. Cancellation stops the CONSUMER; the
 *   in-flight turn completes host-side (disclosed, never claimed
 *   otherwise).
 * - FAIL-CLOSED AS DATA: runtime failures cross as the result's typed
 *   {ok: false, error} shape (never error-masked, never retried here —
 *   the loop owns bounded retries through the port's retryable flag).
 */

import {
  ZCODE_AGENT_RUNTIME_UNAVAILABLE_CODE,
  type IZCodeAgentService,
  type ZCodeAgentWorkspaceTarget,
} from "@zcode/services";

import type { IPaySwapDesktopService } from "./contracts.js";
import { ModelConversationNotConfiguredError } from "./plane-errors.js";

/** The wire DTOs (the renderer mirrors these by value — the session-model-catalog precedent). */
export interface AgentModelTurnMessageDto {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCalls?: readonly {
    readonly id: string;
    readonly name: string;
    readonly input: unknown;
  }[];
  readonly toolCallId?: string;
}

export interface AgentModelTurnToolDto {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface AgentModelTurnRequestDto {
  readonly turnId: string;
  readonly selection: {
    readonly providerId: string;
    readonly modelId: string;
    readonly reasoningLevel: string;
  };
  readonly messages: readonly AgentModelTurnMessageDto[];
  readonly tools: readonly AgentModelTurnToolDto[];
  readonly toolChoice: "auto" | "none" | "required";
  readonly maxOutputTokens?: number;
  readonly requestTimeoutMs?: number;
}

export interface AgentModelTurnResultDto {
  readonly ok: boolean;
  readonly text?: string;
  readonly toolCalls?: readonly {
    readonly id: string;
    readonly name: string;
    readonly input: unknown;
  }[];
  readonly finish?: "STOP" | "TOOL_CALLS" | "LENGTH";
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly error?: {
    readonly code:
      | "MODEL_UNAVAILABLE"
      | "TOOL_CALLING_UNSUPPORTED"
      | "PROVIDER_FAILURE"
      | "TURN_TIMEOUT"
      | "INVALID_REQUEST";
    readonly message: string;
    readonly retryable: boolean;
  };
}

/** What the model-conversation member needs (injected at the host composition edge). */
export interface ModelConversationChannelDeps {
  readonly agentService: Pick<IZCodeAgentService, "generateWorkspaceText">;
  readonly workspace: ZCodeAgentWorkspaceTarget;
  /** The host seam log (never console; no secret material is ever logged). */
  readonly log: (
    level: "info" | "warn" | "error",
    message: string,
    ...args: readonly unknown[]
  ) => void;
}

/** True iff the thrown value is the agent service's runtime-unavailable refusal. */
function isRuntimeUnavailable(thrown: unknown): boolean {
  return (
    thrown !== null &&
    typeof thrown === "object" &&
    (thrown as { readonly code?: unknown }).code === ZCODE_AGENT_RUNTIME_UNAVAILABLE_CODE
  );
}

/** True iff the thrown value looks like an abort/timeout classification. */
function isTimeoutLike(thrown: unknown): boolean {
  const text = String(
    thrown instanceof Error ? thrown.message : (thrown as { readonly message?: unknown })?.message,
  );
  return /timeout|timed out|aborted|deadline/i.test(text);
}

/** Map the substrate's raw finish reason onto the port's vocabulary (deterministic). */
function mapFinishReason(
  raw: string | undefined,
  toolCallCount: number,
): "STOP" | "TOOL_CALLS" | "LENGTH" {
  if (toolCallCount > 0) {
    return "TOOL_CALLS";
  }
  if (raw !== undefined && /length|max_tokens|context.?length/i.test(raw)) {
    return "LENGTH";
  }
  return "STOP";
}

/** The ABSENT-seam posture (the session-model-members precedent). */
export function createAbsentModelConversationChannelMembers(): Pick<
  IPaySwapDesktopService,
  "agentModelTurn"
> {
  return {
    async agentModelTurn(): Promise<never> {
      throw new ModelConversationNotConfiguredError();
    },
  };
}

/** The service-wiring helper (keeps service.ts within its budget). */
export function modelConversationMembersOf(
  options: ModelConversationChannelDeps | undefined,
  log: ModelConversationChannelDeps["log"],
): Pick<IPaySwapDesktopService, "agentModelTurn"> {
  return options !== undefined
    ? createModelConversationChannelMembers({ ...options, log })
    : createAbsentModelConversationChannelMembers();
}

/** Create the model-conversation channel member. */
export function createModelConversationChannelMembers(
  deps: ModelConversationChannelDeps,
): Pick<IPaySwapDesktopService, "agentModelTurn"> {
  return {
    async agentModelTurn(request: AgentModelTurnRequestDto): Promise<AgentModelTurnResultDto> {
      // ---- the persisted selection, VERBATIM (no default, no substitution) ----
      if (
        typeof request?.selection?.providerId !== "string" ||
        request.selection.providerId.length === 0 ||
        typeof request?.selection?.modelId !== "string" ||
        request.selection.modelId.length === 0 ||
        typeof request?.selection?.reasoningLevel !== "string" ||
        request.selection.reasoningLevel.length === 0
      ) {
        return {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message:
              "the model turn requires the task's persisted selection {providerId, modelId, reasoningLevel} — none is substituted",
            retryable: false,
          },
        };
      }
      if (!Array.isArray(request.messages) || request.messages.length === 0) {
        return {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "the model turn requires at least one message",
            retryable: false,
          },
        };
      }

      // ---- the message mapping (tool messages recover their toolName
      // from the prior assistant toolCalls — the substrate wire requires
      // it; the app pin carries the call id only) ----
      const toolNameByCallId = new Map<string, string>();
      for (const message of request.messages) {
        for (const call of message.toolCalls ?? []) {
          if (typeof call?.id === "string" && typeof call?.name === "string") {
            toolNameByCallId.set(call.id, call.name);
          }
        }
      }
      const wireMessages: (
        | { role: "system"; content: string }
        | { role: "user"; content: string }
        | { role: "assistant"; content: string; toolCalls?: { id: string; name: string; input: unknown }[] }
        | { role: "tool"; content: string; toolCallId: string; toolName: string }
      )[] = [];
      for (const message of request.messages) {
        if (message.role === "tool") {
          const toolName =
            message.toolCallId !== undefined
              ? toolNameByCallId.get(message.toolCallId)
              : undefined;
          if (toolName === undefined) {
            return {
              ok: false,
              error: {
                code: "INVALID_REQUEST",
                message:
                  `the tool message for call '${String(message.toolCallId)}' cannot be mapped — ` +
                  "no prior assistant message declares that tool call",
                retryable: false,
              },
            };
          }
          wireMessages.push({
            role: "tool",
            content: message.content,
            toolCallId: message.toolCallId as string,
            toolName,
          });
          continue;
        }
        if (message.role === "assistant") {
          wireMessages.push({
            role: "assistant",
            content: message.content,
            ...(message.toolCalls !== undefined
              ? {
                  toolCalls: message.toolCalls.map(
                    (call: NonNullable<AgentModelTurnMessageDto["toolCalls"]>[number]) => ({ ...call }),
                  ),
                }
              : {}),
          });
          continue;
        }
        wireMessages.push({ role: message.role, content: message.content });
      }

      // ---- the tool-choice law (honest substrate mapping): the
      // workspace/generateText RPC has NO force-tool parameter — "auto"
      // sends the tools, "none" sends none (the model cannot call what
      // it cannot see), and "required" is REFUSED honestly (never
      // silently downgraded to auto). ----
      let wireTools:
        | { name: string; description?: string; inputSchema: Record<string, unknown> }[]
        | undefined;
      if (request.toolChoice === "none") {
        wireTools = undefined;
      } else if (request.toolChoice === "required") {
        return {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message:
              "the substrate model runtime has no force-tool-call parameter — a required tool choice cannot be honored here and is never silently downgraded",
            retryable: false,
          },
        };
      } else {
        wireTools = request.tools.map((tool) => ({
          name: tool.name,
          ...(tool.description !== undefined ? { description: tool.description } : {}),
          inputSchema: tool.inputSchema as Record<string, unknown>,
        }));
      }

      try {
        const result = await deps.agentService.generateWorkspaceText({
          workspacePath: deps.workspace.workspacePath,
          ...(deps.workspace.workspaceIdentity !== undefined
            ? { workspaceIdentity: deps.workspace.workspaceIdentity }
            : {}),
          selection: {
            providerId: request.selection.providerId,
            modelId: request.selection.modelId,
            options: { reasoningLevel: request.selection.reasoningLevel },
          },
          messages: wireMessages,
          ...(wireTools !== undefined && wireTools.length > 0 ? { tools: wireTools } : {}),
          querySource: "payswap-agent-conversation",
          ...(request.maxOutputTokens !== undefined
            ? { maxOutputTokens: request.maxOutputTokens }
            : {}),
          ...(request.requestTimeoutMs !== undefined
            ? { requestTimeoutMs: request.requestTimeoutMs }
            : {}),
        });
        const toolCalls = (result.toolCalls ?? []).map((call) => ({
          id: call.id,
          name: call.name,
          input: call.input,
        }));
        return {
          ok: true,
          text: result.text,
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
          finish: mapFinishReason(result.finishReason, toolCalls.length),
          ...(result.usage !== undefined
            ? {
                usage: {
                  ...(result.usage.inputTokens !== undefined
                    ? { inputTokens: result.usage.inputTokens }
                    : {}),
                  ...(result.usage.outputTokens !== undefined
                    ? { outputTokens: result.usage.outputTokens }
                    : {}),
                  ...(result.usage.totalTokens !== undefined
                    ? { totalTokens: result.usage.totalTokens }
                    : {}),
                },
              }
            : {}),
        };
      } catch (thrown: unknown) {
        if (isRuntimeUnavailable(thrown)) {
          return {
            ok: false,
            error: {
              code: "MODEL_UNAVAILABLE",
              message:
                "no substrate agent runtime is live for this workspace — the selected model cannot be invoked here, and none is substituted",
              retryable: true,
            },
          };
        }
        if (isTimeoutLike(thrown)) {
          return {
            ok: false,
            error: {
              code: "TURN_TIMEOUT",
              message:
                "the model turn timed out at the substrate runtime — the turn did not complete",
              retryable: true,
            },
          };
        }
        const message =
          thrown instanceof Error
            ? thrown.message
            : String((thrown as { readonly message?: unknown })?.message ?? thrown);
        deps.log("warn", "payswap-desktop: agent model turn failed", { message });
        return {
          ok: false,
          error: {
            code: "PROVIDER_FAILURE",
            message: `the selected model or its provider failed: ${message}`,
            retryable: true,
          },
        };
      }
    },
  };
}
