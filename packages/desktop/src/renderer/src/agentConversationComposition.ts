/**
 * PaySwap Desktop renderer (P24-D, ADR-0017 D8/D9/D10) — the AGENT
 * CONVERSATION composition root: binds the payswap-desktop channel's
 * conversation members (agentModelTurn + the stripe plane members)
 * into the app's pinned AgentConversationPlane, at the desktop
 * renderer's business-root initialization — the missionIntakeComposition
 * / modelCatalogComposition pattern.
 *
 * THE WIRING LAWS:
 * - 1:1 MEMBER MAPPING: each port member maps onto its channel member
 *   and NOTHING else — the model turn carries the persisted selection
 *   VERBATIM (no substitution), the reads/actions carry the task's
 *   bound connection, the catalogue lists the host's census facts
 *   (never renderer-generated).
 * - TURN-LEVEL HONESTY (D8): the substrate RPC answers COMPLETED turns;
 *   the model port emits the turn's text as its deltas and declares
 *   supportsStreaming: false with the honest note. Cancellation stops
 *   the consumer; the in-flight turn completes host-side.
 * - FAIL-CLOSED: the host's typed not-configured errors map onto the
 *   app's typed errors (the composer renders the honest notes, never a
 *   mask); the {ok: false} result shapes map onto the ports' typed
 *   error shapes one-to-one.
 * - THE SHARED SEAM: composeAgentConversationBinding binds the shared
 *   plane (bindSharedConversationPlane) BEFORE the first
 *   sharedAgentComposerController() construction — the desktop
 *   business root does exactly that. The web tier binds nothing: the
 *   honest unbound conversation tier.
 *
 * Mounting law: this module is a composition root beside
 * ./missionIntakeComposition.ts (the ADR-0010 D1 renderer-exemption
 * precedent; module ownership unchanged — no new edges).
 */

import {
  AgentModelConversationError,
  bindSharedConversationPlane,
  resetSharedConversationPlane,
  type AgentConversationMessage,
  type AgentConversationPlane,
  type AgentModelConversationPort,
  type AgentModelSupportReport,
  type AgentModelToolContractPin,
  type AgentModelTurnChunk,
  type AgentModelTurnFinish,
  type AgentModelTurnRequest,
  type StripeAccountFactsPin,
  type StripeAccountFactsPort,
  type StripeOperationFactFilter,
  type StripeOperationFactPin,
  type StripePreparedActionPin,
  type StripeToolCataloguePort,
  type StripePreparedActionPort,
  type StripeResourceReadPort,
} from "@payswap/app";
import type { DesktopConsoleChannelServices } from "./consoleWorkspaceMount.js";

/* ------------- the channel client surface this composition rides ------------- */

/**
 * The conversation members the plane rides (the channel client's
 * surface — structural, drift-tested; see consoleWorkspaceMount.tsx).
 */
export interface AgentConversationChannelClient {
  agentModelTurn(request: {
    readonly turnId: string;
    readonly selection: {
      readonly providerId: string;
      readonly modelId: string;
      readonly reasoningLevel: string;
    };
    readonly messages: readonly {
      readonly role: "system" | "user" | "assistant" | "tool";
      readonly content: string;
      readonly toolCalls?: readonly {
        readonly id: string;
        readonly name: string;
        readonly input: unknown;
      }[];
      readonly toolCallId?: string;
    }[];
    readonly tools: readonly {
      readonly name: string;
      readonly description?: string;
      readonly inputSchema: Readonly<Record<string, unknown>>;
    }[];
    readonly toolChoice: "auto" | "none" | "required";
    readonly maxOutputTokens?: number;
    readonly requestTimeoutMs?: number;
  }): Promise<{
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
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
    };
  }>;
  stripeCatalogueRelease(): Promise<string>;
  stripeListOperationFacts(filter?: StripeOperationFactFilter): Promise<
    readonly StripeOperationFactPin[]
  >;
  stripeOperationFact(operationId: string): Promise<StripeOperationFactPin | null>;
  stripeListAccountFacts(): Promise<readonly StripeAccountFactsPin[]>;
  stripeAccountFacts(connectionId: string): Promise<StripeAccountFactsPin | null>;
  stripeExecuteRead(request: {
    readonly operationId: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly connectionId: string;
    readonly taskId: string;
    readonly callId: string;
  }): Promise<
    | { readonly ok: true; readonly output: unknown }
    | {
        readonly ok: false;
        readonly error: {
          readonly code: string;
          readonly message: string;
          readonly retryable: boolean;
        };
      }
  >;
  stripePrepareAction(proposal: {
    readonly operationId: string;
    readonly parameters: readonly {
      readonly name: string;
      readonly value: unknown;
      readonly location: "path" | "query" | "body";
    }[];
    readonly connectionId: string;
    readonly taskId: string;
  }): Promise<
    | { readonly ok: true; readonly action: StripePreparedActionPin }
    | { readonly ok: false; readonly reason: string }
  >;
  stripeAuthorizeAction(input: {
    readonly preparedActionId: string;
    readonly confirmedDigest: string;
  }): Promise<
    | { readonly ok: true; readonly authorization: unknown }
    | { readonly ok: false; readonly reason: string }
  >;
  stripeExecuteAction(authorizationId: string): Promise<unknown>;
  stripeInspectAction(preparedActionId: string): Promise<StripePreparedActionPin | null>;
  stripePlanePrincipalId(): string;
}

/** True iff the thrown value is a host's typed fail-closed plane error. */
function isHostPlaneNotConfigured(thrown: unknown): boolean {
  return (
    thrown !== null &&
    typeof thrown === "object" &&
    [
      "ModelConversationNotConfiguredError",
      "StripePlaneNotConfiguredError",
    ].includes(String((thrown as { readonly name?: unknown }).name))
  );
}

const TURN_LEVEL_MODEL_NOTE =
  "Turn-level binding: the substrate model runtime answers completed turns (no token streaming), and stopping the conversation does not cancel an in-flight turn host-side. Tool-calling support is verified by the turn itself — an incapable model surfaces honestly as a typed failure, never a substitution." as const;

/* --------------------------- the model port --------------------------- */

function channelModelPort(client: AgentConversationChannelClient): AgentModelConversationPort {
  return {
    tier: "HOST_BRIDGED",
    async describeModelSupport(): Promise<AgentModelSupportReport> {
      // The honest report: the substrate surface accepts tool contracts
      // for any selection (a model-level inability surfaces through the
      // turn's typed failure); streaming is turn-level, disclosed.
      return {
        supportsToolCalling: true,
        supportsStreaming: false,
        note: TURN_LEVEL_MODEL_NOTE,
      };
    },
    startTurn(request: AgentModelTurnRequest): AsyncIterable<AgentModelTurnChunk> {
      return (async function* () {
        let result;
        try {
          result = await client.agentModelTurn({
            turnId: request.turnId,
            selection: request.selection,
            messages: request.messages.map((message: AgentConversationMessage) => ({
              role: message.role,
              content: message.content,
              ...(message.toolCalls !== undefined ? { toolCalls: message.toolCalls } : {}),
              ...(message.toolCallId !== undefined ? { toolCallId: message.toolCallId } : {}),
            })),
            tools: request.tools.map((tool: AgentModelToolContractPin) => ({
              name: tool.name,
              ...(tool.description !== undefined ? { description: tool.description } : {}),
              inputSchema: tool.inputSchema,
            })),
            toolChoice: request.toolChoice,
          });
        } catch (thrown: unknown) {
          if (isHostPlaneNotConfigured(thrown)) {
            throw new AgentModelConversationError(
              "UNBOUND",
              "The model-conversation plane is not configured in this host — no model turn runs and none is simulated.",
              false,
            );
          }
          throw new AgentModelConversationError(
            "PROVIDER_FAILURE",
            thrown instanceof Error ? thrown.message : String(thrown),
            true,
          );
        }
        if (!result.ok) {
          const code = result.error?.code ?? "PROVIDER_FAILURE";
          throw new AgentModelConversationError(
            (["MODEL_UNAVAILABLE", "TOOL_CALLING_UNSUPPORTED", "PROVIDER_FAILURE", "TURN_TIMEOUT", "INVALID_REQUEST"].includes(
              code,
            )
              ? code
              : "PROVIDER_FAILURE") as AgentModelConversationError["code"],
            result.error?.message ?? "the model turn failed",
            result.error?.retryable ?? false,
          );
        }
        if (result.text !== undefined && result.text.length > 0) {
          yield { kind: "TEXT_DELTA", text: result.text };
        }
        for (const call of result.toolCalls ?? []) {
          yield { kind: "TOOL_CALL", call: { id: call.id, name: call.name, input: call.input } };
        }
        yield { kind: "TURN_COMPLETED", finish: (result.finish ?? "STOP") as AgentModelTurnFinish };
      })();
    },
  };
}

/* ------------------------ the stripe plane ports ------------------------ */

function channelCataloguePort(
  client: AgentConversationChannelClient,
  catalogueRelease: string,
): StripeToolCataloguePort {
  return {
    tier: "HOST_BRIDGED",
    catalogueRelease,
    listOperationFacts: (filter?: StripeOperationFactFilter) =>
      client.stripeListOperationFacts(filter),
    operationFact: async (operationId: string) =>
      (await client.stripeOperationFact(operationId)) ?? undefined,
  };
}

function channelAccountsPort(client: AgentConversationChannelClient): StripeAccountFactsPort {
  return {
    tier: "HOST_BRIDGED",
    listAccountFacts: () => client.stripeListAccountFacts(),
    accountFacts: async (connectionId: string) =>
      (await client.stripeAccountFacts(connectionId)) ?? undefined,
  };
}

function channelReadsPort(client: AgentConversationChannelClient): StripeResourceReadPort {
  return {
    tier: "HOST_BRIDGED",
    executeRead: async (request) => {
      try {
        return await client.stripeExecuteRead({
          operationId: request.operationId,
          arguments: request.arguments,
          connectionId: request.connectionId,
          taskId: request.taskId,
          callId: request.callId,
        });
      } catch (thrown: unknown) {
        if (isHostPlaneNotConfigured(thrown)) {
          return {
            ok: false,
            error: {
              code: "UNBOUND",
              message:
                "The Stripe action plane is not configured in this host — no read runs and none is simulated.",
              retryable: false,
            },
          };
        }
        throw thrown;
      }
    },
  };
}

function channelPreparedActionsPort(
  client: AgentConversationChannelClient,
): StripePreparedActionPort {
  return {
    tier: "HOST_BRIDGED",
    prepare: (proposal) => client.stripePrepareAction(proposal),
    authorize: (input) => client.stripeAuthorizeAction(input) as Promise<
      | { readonly ok: true; readonly authorization: unknown }
      | { readonly ok: false; readonly reason: string }
    >,
    execute: (authorizationId: string) =>
      client.stripeExecuteAction(authorizationId) as Promise<unknown>,
    inspect: (preparedActionId: string) => client.stripeInspectAction(preparedActionId),
  };
}

/* ------------------------------ the composition ------------------------------ */

/** The composed binding handle (the plane + the reset for the bridge-tier battery). */
export interface AgentConversationComposition {
  readonly plane: AgentConversationPlane;
  /** Restore the seam's honest default (unbound — the honest unbound note). */
  readonly reset: () => void;
}

/**
 * Compose + bind the conversation plane. Called ONCE at the renderer's
 * business-root initialization (BEFORE the first shared-controller
 * construction). Async because the catalogue release is host authority
 * data (fetched over the channel at bind time; a failing fetch leaves
 * the seam honestly unbound — never a fabricated release string).
 */
export async function composeAgentConversationBinding(options: {
  readonly services: DesktopConsoleChannelServices;
}): Promise<AgentConversationComposition> {
  const client = options.services
    .payswapDesktopService as unknown as AgentConversationChannelClient;
  // The catalogue release is HOST authority data — fetched over the
  // channel, never pinned renderer-side (a dead plane leaves the seam
  // honestly unbound; the try/catch at the mount keeps the unbound
  // note).
  const release = await client.stripeCatalogueRelease();
  const plane: AgentConversationPlane = {
    model: channelModelPort(client),
    catalogue: channelCataloguePort(client, release),
    accounts: channelAccountsPort(client),
    reads: channelReadsPort(client),
    preparedActions: channelPreparedActionsPort(client),
    principalId: () => client.stripePlanePrincipalId(),
  };
  bindSharedConversationPlane(plane);
  return { plane, reset: resetSharedConversationPlane };
}
