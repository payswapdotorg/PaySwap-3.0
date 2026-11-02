/**
 * @payswap/app — the STRIPE TOOL RUNTIME (P24-3, ADR-0017 D9/D10).
 *
 * The app-side AgentToolRuntimePort implementation the conversation
 * loop consumes: resolve the tool against the CURRENT registry
 * snapshot, validate the arguments against the pinned schema
 * (fail-closed; unknown fields rejected; malformed arguments are a
 * typed ERROR result returned to the model — never a broken loop),
 * execute through the host-bridged ports, and treat every payload at
 * the output boundary (byte caps, data minimization, untrusted-data
 * framing, secret-shape refusal).
 *
 * ZERO FINANCIAL AUTHORITY: prepare returns a PREVIEW ONLY; execution
 * happens exclusively through the human-confirmed, host-minted
 * authorization (the wiring's confirm path — never a model call).
 */

import type {
  AgentToolCallContext,
  AgentToolExecutionResult,
  AgentToolRuntimePort,
  StripePreparedActionPort,
  StripeResourceReadPort,
} from "./stripeToolExecutionPort.js";
import type { StripeToolRegistry } from "./stripeToolRegistry.js";
import {
  requireActionParameters,
  requireNonEmptyString,
  requireStringArray,
  StripeToolArgumentError,
  validateToolArguments,
} from "./stripeToolSchemas.js";
import {
  boundStripeToolOutput,
  minimizeOperationFact,
  STRIPE_TOOL_OUTPUT_DEFAULT_MAX_BYTES,
} from "./stripeToolOutput.js";

/* ------------------------------ the options --------------------------- */

export interface StripeToolRuntimeOptions {
  readonly registry: StripeToolRegistry;
  readonly reads: StripeResourceReadPort;
  readonly preparedActions: StripePreparedActionPort;
  /** Per-result byte budget (default 8192). */
  readonly maxOutputBytes?: number;
}

export function createStripeToolRuntime(options: StripeToolRuntimeOptions): AgentToolRuntimePort {
  const maxBytes = options.maxOutputBytes ?? STRIPE_TOOL_OUTPUT_DEFAULT_MAX_BYTES;
  const registry = options.registry;

  /** Wrap one payload through the output treatment into an OK result. */
  const ok = (payload: unknown): AgentToolExecutionResult => {
    const bounded = boundStripeToolOutput(payload, maxBytes);
    return {
      status: "OK",
      output: bounded.framed,
      boundedJson: bounded.boundedJson,
      truncated: bounded.truncated,
    };
  };

  const error = (
    code: string,
    message: string,
    retryable: boolean,
  ): AgentToolExecutionResult => ({
    status: "ERROR",
    error: { code, message, retryable },
  });

  return {
    async executeCall({ call, context }): Promise<AgentToolExecutionResult> {
      const tool = registry.resolve(call.name);
      if (tool === undefined) {
        return error(
          "UNKNOWN_TOOL",
          `tool '${call.name}' is not in this task's registry — use stripe.discover_capabilities or stripe.search_operations to find registered tools, then call one of those names`,
          true,
        );
      }
      try {
        switch (tool.kind) {
          case "DISCOVERY":
            return ok(await runDiscoveryTool(registry, tool.name, call.input));
          case "REQUEST_TOOLS":
            return ok(await runRequestTools(registry, call.input));
          case "RESOURCE_READ":
            return await runReadTool(options.reads, tool, call.input, context, call.id);
          case "ACTION_PREPARE":
            return await runPrepareAction(options.preparedActions, call.input, context);
        }
      } catch (thrown) {
        if (thrown instanceof StripeToolArgumentError) {
          return error("VALIDATION", thrown.message, true);
        }
        // The secret-shape refusal (typed by the output treatment).
        if (thrown instanceof Error && thrown.name === "AgentTaskSessionError") {
          return error("SECRET_SHAPED_OUTPUT", thrown.message, false);
        }
        return error(
          "TOOL_RUNTIME_FAILURE",
          thrown instanceof Error ? thrown.message : String(thrown),
          false,
        );
      }
    },
  };
}

/* --------------------------- the discovery tools ---------------------- */

async function runDiscoveryTool(
  registry: StripeToolRegistry,
  name: string,
  input: unknown,
): Promise<unknown> {
  const facts = registry.listFacts();
  const account = registry.account();
  if (name === "stripe.discover_capabilities") {
    const args = validateToolArguments(name, input, {
      optional: ["packId"],
      validate: (field, value) => {
        if (field === "packId") requireNonEmptyString(name, field, value);
      },
    });
    const scoped = "packId" in args ? facts.filter((fact) => fact.packId === args.packId) : facts;
    const supportStateCounts: Record<string, number> = {};
    const packCounts: Record<string, number> = {};
    for (const fact of scoped) {
      supportStateCounts[fact.supportState] = (supportStateCounts[fact.supportState] ?? 0) + 1;
      packCounts[fact.packId] = (packCounts[fact.packId] ?? 0) + 1;
    }
    return {
      accountContext: account === undefined
        ? null
        : {
            stripeAccountId: account.stripeAccountId,
            accountModel: account.accountModel,
            environment: account.environment,
          },
      supportStateCounts,
      packCounts,
      registeredTools: registry.list().map((tool) => tool.name),
      note: "Capability facts derive from the pinned catalogue joined with this connection's verified permissions. Support states are honest: IMPLEMENTED and IMPLEMENTED_WITH_LIMITS operations are dispatchable (the limits — account entitlement, test-mode-only, file-size — are surfaced per operation), and state-changing operations always follow the prepare → human-confirm → execute contract.",
    };
  }
  if (name === "stripe.search_operations") {
    const args = validateToolArguments(name, input, {
      required: ["query"],
      optional: ["packId", "effectClass"],
      validate: (field, value) => {
        if (field === "query" || field === "packId" || field === "effectClass") {
          requireNonEmptyString(name, field, value);
        }
      },
    });
    const query = String(args.query).toLowerCase();
    let matches = facts.filter((fact) => {
      const haystack = `${fact.operationId} ${fact.resourceFamily} ${fact.summary}`.toLowerCase();
      return haystack.includes(query);
    });
    if (typeof args.packId === "string") {
      matches = matches.filter((fact) => fact.packId === args.packId);
    }
    if (typeof args.effectClass === "string") {
      matches = matches.filter((fact) => fact.effectClass === args.effectClass);
    }
    const cap = 20;
    const total = matches.length;
    return {
      matches: matches.slice(0, cap).map(minimizeOperationFact),
      total,
      truncated: total > cap,
      note: total > cap
        ? `bounded to the first ${cap} of ${total} matches — refine the query for the rest`
        : "all matches returned",
    };
  }
  // stripe.describe_operation
  const args = validateToolArguments(name, input, {
    required: ["operationId"],
    validate: (field, value) => {
      if (field === "operationId") requireNonEmptyString(name, field, value);
    },
  });
  const fact = facts.find((entry) => entry.operationId === args.operationId);
  if (fact === undefined) {
    return {
      operationId: args.operationId,
      found: false,
      note: "unknown operation id in the pinned catalogue — unknown operations are DENIED (fail-closed)",
    };
  }
  return { found: true, ...minimizeOperationFact(fact) };
}

/* ------------------------- the mid-task request ----------------------- */

async function runRequestTools(
  registry: StripeToolRegistry,
  input: unknown,
): Promise<unknown> {
  const args = validateToolArguments("stripe.request_tools", input, {
    optional: ["operationIds", "packIds"],
    validate: (field, value) => {
      if (field === "operationIds" || field === "packIds") {
        requireStringArray("stripe.request_tools", field, value);
      }
    },
  });
  const outcome = await registry.requestAdditionalTools({
    operationIds: Array.isArray(args.operationIds) ? (args.operationIds as readonly string[]) : undefined,
    packIds: Array.isArray(args.packIds) ? (args.packIds as readonly string[]) : undefined,
  });
  return {
    granted: outcome.granted,
    refused: outcome.refused,
    note: "Each request is verified against the connection's granted permissions and the operation's support state before exposure — discovery never elevates permission, and state-changing operations are never direct tools.",
  };
}

/* ---------------------------- the read tools -------------------------- */

async function runReadTool(
  reads: StripeResourceReadPort,
  tool: { readonly operationId?: string; readonly fact?: { readonly pathParams: readonly string[] } },
  input: unknown,
  context: AgentToolCallContext,
  callId: string,
): Promise<AgentToolExecutionResult> {
  const operationId = tool.operationId ?? "";
  const toolName = "stripe.resources.read";
  const pathParams = tool.fact?.pathParams ?? [];
  const args = validateToolArguments(toolName, input, {
    required: pathParams,
    optional: ["limit", "starting_after"],
    validate: (field, value) => {
      if (pathParams.includes(field) || field === "starting_after") {
        requireNonEmptyString(toolName, field, value);
      }
      if (field === "limit" && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100)) {
        throw new StripeToolArgumentError(
          "INVALID_VALUE",
          `${toolName}.limit must be an integer between 1 and 100`,
        );
      }
    },
  });
  const outcome = await reads.executeRead({
    operationId,
    arguments: args,
    connectionId: context.connectionId,
    taskId: context.taskId,
    callId,
  });
  if (!outcome.ok) {
    if (outcome.error.code === "TIMEOUT_UNKNOWN") {
      return unknownToolOutcome(outcome.error.message);
    }
    return {
      status: "ERROR",
      error: {
        code: outcome.error.code,
        message: outcome.error.message,
        retryable: outcome.error.retryable,
      },
    };
  }
  const treated = boundStripeToolOutput(outcome.output, STRIPE_TOOL_OUTPUT_DEFAULT_MAX_BYTES);
  return {
    status: "OK",
    output: treated.framed,
    boundedJson: treated.boundedJson,
    truncated: treated.truncated,
  };
}

/* -------------------------- the prepare tool -------------------------- */

/** The UNKNOWN read outcome (a timeout after possible dispatch — INV-04). */
function unknownToolOutcome(message: string): AgentToolExecutionResult {
  return {
    status: "UNKNOWN",
    error: { code: "TIMEOUT_UNKNOWN", message, retryable: false },
  };
}

async function runPrepareAction(
  preparedActions: StripePreparedActionPort,
  input: unknown,
  context: AgentToolCallContext,
): Promise<AgentToolExecutionResult> {
  const toolName = "stripe.prepare_action";
  const args = validateToolArguments(toolName, input, {
    required: ["operationId", "parameters"],
    validate: (field, value) => {
      if (field === "operationId") requireNonEmptyString(toolName, field, value);
    },
  });
  const parameters = requireActionParameters(args.parameters);
  const outcome = await preparedActions.prepare({
    operationId: requireNonEmptyString(toolName, "operationId", args.operationId),
    parameters,
    connectionId: context.connectionId,
    taskId: context.taskId,
  });
  if (!outcome.ok) {
    return {
      status: "ERROR",
      error: {
        code: "PREPARE_REFUSED",
        message: `the host refused to prepare this action: ${outcome.reason}`,
        retryable: false,
      },
    };
  }
  const action = outcome.action;
  // The model sees the EXACT preview facts — and NO authorization: the
  // human confirms, the host mints. The loop pauses on the pending
  // action; the conversation only continues after the human decision.
  const preview = {
    preparedActionId: action.preparedActionId,
    operationId: action.operationId,
    account: {
      stripeAccountId: action.accountContext.stripeAccountId,
      environment: action.accountContext.environment,
    },
    parameters: action.parameters,
    digest: action.digest,
    effectClass: action.effectClass,
    approvalTier: action.approvalTier,
    confirmationInputs: action.confirmationInputs,
    expiresAt: action.expiresAt,
    note: "Prepared, not executed. A human must confirm this EXACT preview; the host then mints a single-use authorization and executes. Any parameter or account change requires a new preview.",
  };
  const treated = boundStripeToolOutput(preview, STRIPE_TOOL_OUTPUT_DEFAULT_MAX_BYTES);
  return {
    status: "OK",
    output: treated.framed,
    boundedJson: treated.boundedJson,
    truncated: treated.truncated,
    pendingPreparedAction: action,
  };
}
