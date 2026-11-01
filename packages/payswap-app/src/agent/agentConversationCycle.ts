/**
 * @payswap/app — the CONVERSATION CYCLE RUNNER (P24-3, ADR-0017 D8).
 *
 * The shared engine-invocation half of the composer↔conversation
 * wiring (split from ./agentConversationWiring.ts for the ≤400-line
 * file law): builds the task's registry/runtime over the host-bound
 * plane, replays the PUBLIC history from the persisted log, runs the
 * bounded loop with SEQUENTIALLY-AWAITED append-only log writes (event
 * order is preserved exactly), and projects the honest end state.
 *
 * LAWS: the SAME persisted selection every cycle (no substitution);
 * tool calls carry ONLY the task's bound connection; every emitted
 * event is persisted before the state projects; TEXT_DELTA never
 * persists; the pending action is re-folded from the LOG (never from
 * engine memory) so resume and live runs agree.
 */

import type { AgentTaskPin } from "../lib/agent-task-pins.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";
import type { AgentConversationLogInput } from "./conversationLogEvents.js";
import type { AgentPendingToolResult } from "./conversationLoopTypes.js";
import { runAgentConversationLoop } from "./conversationLoopEngine.js";
import { conversationHistoryFromLog } from "./agentConversationProjection.js";
import { foldAccountBinding } from "./taskAccountContext.js";
import type { StripeAccountFactsPin } from "./stripeToolCataloguePort.js";
import { AgentModelConversationError } from "./modelConversationPort.js";
import { createStripeToolRuntime } from "./stripeToolRuntime.js";
import { createStripeToolRegistry, type StripeToolRegistry } from "./stripeToolRegistry.js";
import type { AgentConversationPlane } from "./agentConversationWiring.js";

/** The shared context the wiring and the actions ride (explicit seams). */
export interface AgentConversationContext {
  readonly plane: AgentConversationPlane;
  readonly session: () => AgentTaskSessionPort;
  readonly clock: () => string;
  readonly accountsCache: () => Promise<readonly StripeAccountFactsPin[]>;
  readonly appendLog: (taskId: string, event: AgentConversationLogInput) => Promise<void>;
  /** Re-project the conversation state from the task's persisted log. */
  readonly projectState: (taskId: string, patch?: { readonly phase?: "IDLE" | "RUNNING" | "AWAITING_CONFIRMATION"; readonly modelNote?: string }) => Promise<void>;
  readonly emit: () => void;
}

export interface ConversationCycleRunner {
  runCycle(
    task: AgentTaskPin,
    cycle: {
      /** Continuation results (the confirm path); a fresh user turn is already in the log. */
      readonly pendingToolResults?: readonly AgentPendingToolResult[];
    },
  ): Promise<void>;
  /** The task's registry (created once per conversation; account-scoped). */
  registryFor(task: AgentTaskPin, account: StripeAccountFactsPin): Promise<StripeToolRegistry>;
  /** The account binding for a task (auto-bind the SINGLE connection; ask otherwise). */
  ensureAccountBinding(taskId: string): Promise<StripeAccountFactsPin | undefined>;
  /** The user-abort flag (the wiring sets it; the loop probes it). */
  requestAbort(): void;
}

export function createConversationCycleRunner(
  context: AgentConversationContext,
): ConversationCycleRunner {
  const registries = new Map<string, { registry: StripeToolRegistry; connectionId: string }>();
  let abortRunning = false;

  const runner: ConversationCycleRunner = {
    requestAbort(): void {
      abortRunning = true;
    },

    async ensureAccountBinding(taskId): Promise<StripeAccountFactsPin | undefined> {
      const log = await context.session().conversationLog(taskId);
      const binding = foldAccountBinding(log);
      const accounts = await context.accountsCache();
      if (binding !== undefined) {
        return accounts.find((account) => account.connectionId === binding.connectionId);
      }
      // Exactly ONE connection: the initial binding is host-resolved
      // (the user's only account). Multiple: the user picks explicitly.
      if (accounts.length === 1) {
        const account = accounts[0] as StripeAccountFactsPin;
        await context.appendLog(taskId, {
          kind: "ACCOUNT_CONTEXT_BOUND",
          connectionId: account.connectionId,
          scopeChange: "INITIAL",
        });
        return account;
      }
      return undefined;
    },

    async registryFor(task, account): Promise<StripeToolRegistry> {
      const existing = registries.get(task.id);
      if (existing !== undefined && existing.connectionId === account.connectionId) {
        return existing.registry;
      }
      const registry = createStripeToolRegistry({ facts: context.plane.catalogue });
      await registry.load(account, intentTextOf(task));
      registries.set(task.id, { registry, connectionId: account.connectionId });
      return registry;
    },

    async runCycle(task, cycle): Promise<void> {
      const selection = task.modelSelection;
      if (selection === undefined) {
        return; // the caller surfaced the honest no-selection note
      }
      abortRunning = false;
      await context.projectState(task.id, { phase: "RUNNING" });

      const account = await runner.ensureAccountBinding(task.id);
      const registry = account === undefined ? undefined : await runner.registryFor(task, account);
      const tools = registry?.toModelContracts() ?? [];
      // The user text is ALREADY in the log (the callers append before
      // running) — the fold rebuilds it; passing it again would duplicate
      // the message in the model context.
      const log = await context.session().conversationLog(task.id);
      const history = conversationHistoryFromLog(log);
      // The confirm path records the execution TOOL_RESULT before it
      // continues the loop with the same result as a pendingToolResult —
      // dedupe so the model sees it EXACTLY once (protocol law).
      const pendingIds = new Set((cycle.pendingToolResults ?? []).map((result) => result.callId));
      const dedupedHistory = pendingIds.size === 0
        ? history
        : history.filter(
            (message) =>
              !(message.role === "tool" && message.toolCallId !== undefined && pendingIds.has(message.toolCallId)),
          );
      if (account === undefined) {
        // The honest account note: a conversation with no bound account
        // runs WITHOUT Stripe tools (never a fabricated catalog) — the
        // account selector is the way in (§3.4). Recorded once, not
        // repeated every turn.
        const accounts = await context.accountsCache();
        const note = accounts.length > 0
          ? "No Stripe account is bound to this task yet — pick a connection above; this turn runs without Stripe tools, and none is simulated."
          : "No Stripe connection is available to this task — this turn runs without Stripe tools, and none is simulated.";
        const alreadyNoted = log.some(
          (entry) => entry.event.kind === "CONVERSATION_NOTE" && entry.event.note === note,
        );
        if (!alreadyNoted) {
          await context.appendLog(task.id, { kind: "CONVERSATION_NOTE", note });
        }
      }

      // SEQUENTIAL log writes: the append-only order is the record.
      let writeChain: Promise<void> = Promise.resolve();
      const onEvent = (event: Parameters<Parameters<typeof runAgentConversationLoop>[2]>[0]): void => {
        const mapped = mapStreamEventToLog(event);
        if (mapped !== undefined) {
          writeChain = writeChain.then(() => context.appendLog(task.id, mapped));
        }
      };

      const result = await runAgentConversationLoop(
        {
          taskId: task.id,
          connectionId: account?.connectionId ?? "",
          selection,
          history: dedupedHistory,
          ...(cycle.pendingToolResults !== undefined ? { pendingToolResults: cycle.pendingToolResults } : {}),
          tools,
        },
        {
          model: context.plane.model,
          tools:
            registry === undefined
              ? {
                  executeCall: async () => ({
                    status: "ERROR",
                    error: {
                      code: "NO_ACCOUNT_CONTEXT",
                      message: "No Stripe account is bound to this task — bind one before using Stripe tools.",
                      retryable: false,
                    },
                  }),
                }
              : createStripeToolRuntime({
                  registry,
                  reads: context.plane.reads,
                  preparedActions: context.plane.preparedActions,
                }),
          now: context.clock,
          timeoutAfter: (ms) =>
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new AgentModelConversationError(
                  "TURN_TIMEOUT",
                  `the model turn exceeded its ${ms}ms timeout — the loop stopped honestly (no tool was left running)`,
                ));
              }, ms);
            }),
          isAborted: () => abortRunning,
        },
        onEvent,
      );
      await writeChain;

      if (result.reason !== "ANSWERED" && result.reason !== "AWAITING_USER_CONFIRMATION") {
        await context.appendLog(task.id, {
          kind: "CONVERSATION_NOTE",
          note: result.note,
          reason: result.reason,
        });
      }
      await context.projectState(task.id, {
        phase: result.reason === "AWAITING_USER_CONFIRMATION" ? "AWAITING_CONFIRMATION" : "IDLE",
        ...(result.reason === "TOOL_CALLING_UNSUPPORTED" || result.reason === "PROVIDER_FAILURE"
          ? { modelNote: result.note }
          : {}),
      });
      context.emit();
    },
  };
  return runner;
}

/** Map one loop stream event to its persisted log input (undefined = transient). */
function mapStreamEventToLog(
  event: Parameters<Parameters<typeof runAgentConversationLoop>[2]>[0],
): AgentConversationLogInput | undefined {
  switch (event.kind) {
    case "TEXT_DELTA":
      return undefined;
    case "ASSISTANT_TEXT":
      return { kind: "ASSISTANT_TEXT", text: event.text };
    case "TOOL_CALL":
      return { kind: "TOOL_CALL", callId: event.callId, toolName: event.toolName, argsEcho: event.argsEcho };
    case "TOOL_RESULT":
      return {
        kind: "TOOL_RESULT",
        callId: event.callId,
        toolName: event.toolName,
        status: event.status,
        summary: event.summary,
        ...(event.truncated ? { truncated: true } : {}),
      };
    case "PREPARED_ACTION_PENDING":
      return { kind: "PREPARED_ACTION_PENDING", action: event.action };
    case "LOOP_STATUS":
      return { kind: "CONVERSATION_NOTE", note: event.note, reason: event.reason };
    default:
      return undefined;
  }
}

/** The intent line the registry's domain-tool filter reads. */
function intentTextOf(task: AgentTaskPin): string | undefined {
  if (task.intent.kind === "PAYMENT_MISSION") {
    return task.intent.goalStatement;
  }
  return `${task.intent.providerId} ${task.intent.form}`;
}
