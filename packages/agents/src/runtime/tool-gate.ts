/**
 * The fail-closed financial-effect tool gate (FROZEN §20 runtime contract;
 * INV-9/INV-19 discipline; extracted from the reference runtime for the
 * <= 400-line file law).
 *
 * A tool that is not REGISTERED is denied — unknown tools are never
 * granted. An INFORMATIONAL tool is granted without a decision reference.
 * A FINANCIAL-effect tool call must carry an authorization-decision
 * reference (`args.decisionRef`) resolvable by the injected decision source
 * to an ALLOW decision produced by the trust lane's evaluate(). Absent,
 * unknown, denied or needs-approval references REJECT the call — never
 * best-effort. The runtime never fabricates decisions.
 */

import type { AuthorizationDecision } from "@payswap/trust";
import type { ToolRequest, ToolResult } from "../runtime.ts";
import type { AuthorizationDecisionSource, ToolDescriptor } from "./runtime-seams.ts";

/** The deterministic outcome of one tool-gate evaluation. */
export interface ToolGateOutcome {
  readonly result: ToolResult;
  /** Denial reason (present on every DENIED outcome; event evidence). */
  readonly reason?: string;
  /** The effect classification, when the tool is registered. */
  readonly effect?: "financial" | "informational";
  /** The decision reference presented, when any. */
  readonly decisionRef?: string;
}

const DECISION_REF_ARG = "decisionRef";

/**
 * Pure gate evaluation for an ACTIVE session. Deterministic: the same
 * registered tools, decision source, session state and request always
 * produce the same outcome.
 */
export function evaluateToolRequest(
  tools: readonly ToolDescriptor[],
  decisions: AuthorizationDecisionSource | undefined,
  request: ToolRequest,
): ToolGateOutcome {
  const descriptor = tools.find((tool) => tool.toolId === request.toolId);
  if (descriptor === undefined) {
    return {
      result: { toolId: request.toolId, status: "DENIED" },
      reason: "unknown_tool",
    };
  }
  if (descriptor.effect === "informational") {
    return {
      result: { toolId: request.toolId, status: "GRANTED", result: { effect: "informational" } },
      effect: "informational",
    };
  }
  // Financial-effect tool: an ALLOW decision reference is mandatory.
  const raw = request.args[DECISION_REF_ARG];
  const decisionRef = typeof raw === "string" && raw.length > 0 ? raw : undefined;
  if (decisionRef === undefined) {
    return {
      result: { toolId: request.toolId, status: "DENIED" },
      reason: "missing_decision_ref",
    };
  }
  const decision: AuthorizationDecision | undefined = decisions?.resolve(decisionRef);
  if (decision === undefined) {
    return {
      result: { toolId: request.toolId, status: "DENIED" },
      reason: "unknown_decision_ref",
      decisionRef,
    };
  }
  if (decision.decision !== "ALLOW") {
    return {
      result: { toolId: request.toolId, status: "DENIED" },
      reason: `decision_not_allow:${decision.decision}`,
      decisionRef,
    };
  }
  return {
    result: {
      toolId: request.toolId,
      status: "GRANTED",
      result: { effect: "financial", decisionRef },
    },
    effect: "financial",
    decisionRef,
  };
}
