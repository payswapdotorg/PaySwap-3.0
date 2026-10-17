/**
 * Bridge implementation: tool contract declaration (P3-W3).
 *
 * Validators for the pinned declaration shapes — permission spec (with the
 * APPLICATION authority-domain law), result budget, timeout policy,
 * cancellation policy, trace policy — and the declaration itself. The
 * application-permission law is enforced structurally: a permission spec
 * whose authorityDomain is not the literal "APPLICATION" is rejected, so a
 * declaration can never smuggle in a financial permission domain.
 */

import { IssueCollector } from "../errors.ts";
import {
  cloneAndFreeze,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
} from "../shared.ts";
import {
  TOOL_CANCELLATION_CLEANUPS,
  TOOL_DENY_PRIORITIES,
  TOOL_PERMISSION_PATTERN_SOURCES,
  TOOL_RESULT_BUDGET_RETENTIONS,
  TOOL_RESULT_BUDGET_STRATEGIES,
  TOOL_TRACE_RECORD_LEVELS,
} from "../wire/tool-declaration.ts";
import type {
  TimedToolTimeoutPolicyWire,
  ToolCancellationPolicyWire,
  ToolDeclarationWire,
  ToolPermissionPatternSourceWire,
  ToolPermissionSpecWire,
  ToolResultBudgetWire,
  ToolTimeoutPolicyWire,
  ToolTracePolicyWire,
} from "../wire/tool-declaration.ts";
import { TOOL_RISK_LEVELS, TOOL_SIDE_EFFECT_SCOPES } from "../wire/tool-registry.ts";

function isPatternSourceArray(
  candidate: unknown,
): candidate is readonly ToolPermissionPatternSourceWire[] {
  return (
    Array.isArray(candidate) &&
    candidate.every(
      (item) =>
        typeof item === "string" &&
        TOOL_PERMISSION_PATTERN_SOURCES.includes(item as ToolPermissionPatternSourceWire),
    )
  );
}

/**
 * Construct and freeze a validated ToolPermissionSpecWire. The
 * APPLICATION-authority law: `authorityDomain` MUST be the literal
 * "APPLICATION" (and is re-stamped from the constant on the frozen result)
 * — substrate permission is application permission, never PaySwap financial
 * authorization.
 */
export function toolPermissionSpec(input: unknown): ToolPermissionSpecWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid tool permission spec: must be an object");
  }
  issues.requireNonEmptyString("permission", input.permission);
  issues.requireNonEmptyString("reason", input.reason);
  if (
    typeof input.riskLevel !== "string" ||
    !TOOL_RISK_LEVELS.includes(input.riskLevel as ToolPermissionSpecWire["riskLevel"])
  ) {
    issues.add("riskLevel", `must be one of: ${TOOL_RISK_LEVELS.join(", ")}`);
  }
  if (
    typeof input.sideEffectScope !== "string" ||
    !TOOL_SIDE_EFFECT_SCOPES.includes(
      input.sideEffectScope as ToolPermissionSpecWire["sideEffectScope"],
    )
  ) {
    issues.add("sideEffectScope", `must be one of: ${TOOL_SIDE_EFFECT_SCOPES.join(", ")}`);
  }
  issues.requireBoolean("needsApproval", input.needsApproval);
  if (!isPatternSourceArray(input.patternSources)) {
    issues.add("patternSources", `must be an array of: ${TOOL_PERMISSION_PATTERN_SOURCES.join(", ")}`);
  }
  if (
    input.alwaysAllowPatternSources !== undefined &&
    !isPatternSourceArray(input.alwaysAllowPatternSources)
  ) {
    issues.add("alwaysAllowPatternSources", `must be an array of: ${TOOL_PERMISSION_PATTERN_SOURCES.join(", ")}`);
  }
  if (
    typeof input.denyPriority !== "string" ||
    !TOOL_DENY_PRIORITIES.includes(input.denyPriority as ToolPermissionSpecWire["denyPriority"])
  ) {
    issues.add("denyPriority", `must be one of: ${TOOL_DENY_PRIORITIES.join(", ")}`);
  }
  if (input.alwaysAsk !== undefined && input.alwaysAsk !== true) {
    issues.add("alwaysAsk", "must be the literal true when present");
  }
  if (input.askOptions !== undefined) {
    if (!isRecord(input.askOptions)) {
      issues.add("askOptions", "must be an object");
    } else if (input.askOptions.allowAlways !== false && input.askOptions.allowAlways !== "session") {
      issues.add("askOptions.allowAlways", 'must be false or "session"');
    }
  }
  if (input.authorityDomain !== "APPLICATION") {
    issues.add(
      "authorityDomain",
      'must be the literal "APPLICATION" — substrate permission is application permission and can never be a financial permission domain',
    );
  }
  issues.throwIfAny("tool permission spec");
  const record = input as unknown as ToolPermissionSpecWire;
  return Object.freeze({
    permission: record.permission,
    reason: record.reason,
    riskLevel: record.riskLevel,
    sideEffectScope: record.sideEffectScope,
    needsApproval: record.needsApproval,
    patternSources: Object.freeze([...record.patternSources]),
    ...(record.alwaysAllowPatternSources !== undefined
      ? { alwaysAllowPatternSources: Object.freeze([...record.alwaysAllowPatternSources]) }
      : {}),
    denyPriority: record.denyPriority,
    ...(record.alwaysAsk !== undefined ? { alwaysAsk: true } : {}),
    ...(record.askOptions !== undefined
      ? { askOptions: Object.freeze({ ...record.askOptions }) }
      : {}),
    authorityDomain: "APPLICATION",
  });
}

/**
 * Construct and freeze a validated ToolResultBudgetWire: non-negative byte
 * budgets, strategy from the pinned vocabulary, optional preview/artifact
 * policies with their own laws.
 */
export function toolResultBudget(input: unknown): ToolResultBudgetWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid tool result budget: must be an object");
  }
  issues.requireNonNegativeInteger("maxInlineBytes", input.maxInlineBytes);
  issues.requireNonNegativeInteger("maxModelBytes", input.maxModelBytes);
  if (
    typeof input.strategy !== "string" ||
    !TOOL_RESULT_BUDGET_STRATEGIES.includes(
      input.strategy as ToolResultBudgetWire["strategy"],
    )
  ) {
    issues.add("strategy", `must be one of: ${TOOL_RESULT_BUDGET_STRATEGIES.join(", ")}`);
  }
  if (input.preview !== undefined) {
    const preview = input.preview;
    if (!isRecord(preview)) {
      issues.add("preview", "must be an object");
    } else {
      if (preview.maxBytes !== undefined) {
        issues.requireNonNegativeInteger("preview.maxBytes", preview.maxBytes);
      }
      if (preview.maxLines !== undefined) {
        issues.requireNonNegativeInteger("preview.maxLines", preview.maxLines);
      }
      if (
        preview.direction !== undefined &&
        preview.direction !== "head" &&
        preview.direction !== "tail"
      ) {
        issues.add("preview.direction", 'must be "head" or "tail"');
      }
    }
  }
  if (input.artifact !== undefined) {
    const artifact = input.artifact;
    if (!isRecord(artifact)) {
      issues.add("artifact", "must be an object");
    } else {
      issues.requireBoolean("artifact.enabled", artifact.enabled);
      if (
        artifact.retention !== undefined &&
        (typeof artifact.retention !== "string" ||
          !TOOL_RESULT_BUDGET_RETENTIONS.includes(
            artifact.retention as "session" | "project" | "temporary",
          ))
      ) {
        issues.add("artifact.retention", `must be one of: ${TOOL_RESULT_BUDGET_RETENTIONS.join(", ")}`);
      }
    }
  }
  issues.throwIfAny("tool result budget");
  const record = input as unknown as ToolResultBudgetWire;
  return Object.freeze({
    maxInlineBytes: record.maxInlineBytes,
    maxModelBytes: record.maxModelBytes,
    strategy: record.strategy,
    ...(record.preview !== undefined
      ? { preview: Object.freeze({ ...record.preview }) }
      : {}),
    ...(record.artifact !== undefined
      ? { artifact: Object.freeze({ ...record.artifact }) }
      : {}),
  });
}

/** Construct and freeze a validated ToolTimeoutPolicyWire (none | timed). */
export function toolTimeoutPolicy(input: unknown): ToolTimeoutPolicyWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid tool timeout policy: must be an object");
  }
  if (input.kind === "none") {
    issues.throwIfAny("tool timeout policy");
    return Object.freeze({ kind: "none" });
  }
  if (input.kind !== undefined && input.kind !== "timed") {
    issues.add("kind", 'must be "none" or "timed"');
  }
  issues.requirePositiveInteger("defaultMs", input.defaultMs);
  if (input.maxMs !== undefined) {
    issues.requirePositiveInteger("maxMs", input.maxMs);
  }
  issues.requireBoolean("allowCallOverride", input.allowCallOverride);
  if (input.cleanupGraceMs !== undefined) {
    issues.requireNonNegativeInteger("cleanupGraceMs", input.cleanupGraceMs);
  }
  issues.throwIfAny("tool timeout policy");
  const record = input as unknown as TimedToolTimeoutPolicyWire;
  if (record.maxMs !== undefined && record.maxMs < record.defaultMs) {
    throw new Error(
      `Invalid tool timeout policy: maxMs (${record.maxMs}) must not be below defaultMs (${record.defaultMs})`,
    );
  }
  return Object.freeze({
    ...(record.kind !== undefined ? { kind: "timed" } : {}),
    defaultMs: record.defaultMs,
    ...(record.maxMs !== undefined ? { maxMs: record.maxMs } : {}),
    allowCallOverride: record.allowCallOverride,
    ...(record.cleanupGraceMs !== undefined
      ? { cleanupGraceMs: record.cleanupGraceMs }
      : {}),
  });
}

/** Construct and freeze a validated ToolCancellationPolicyWire. */
export function toolCancellationPolicy(input: unknown): ToolCancellationPolicyWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid tool cancellation policy: must be an object");
  }
  issues.requireBoolean("supported", input.supported);
  if (
    typeof input.cleanup !== "string" ||
    !TOOL_CANCELLATION_CLEANUPS.includes(input.cleanup as ToolCancellationPolicyWire["cleanup"])
  ) {
    issues.add("cleanup", `must be one of: ${TOOL_CANCELLATION_CLEANUPS.join(", ")}`);
  }
  issues.requireNonEmptyString("userVisibleMessage", input.userVisibleMessage);
  issues.throwIfAny("tool cancellation policy");
  const record = input as unknown as ToolCancellationPolicyWire;
  return Object.freeze({
    supported: record.supported,
    cleanup: record.cleanup,
    userVisibleMessage: record.userVisibleMessage,
  });
}

/** Construct and freeze a validated ToolTracePolicyWire. */
export function toolTracePolicy(input: unknown): ToolTracePolicyWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid tool trace policy: must be an object");
  }
  if (input.required !== true) {
    issues.add("required", "must be the literal true (the substrate's trace law)");
  }
  issues.requireBoolean("propagateToAdapters", input.propagateToAdapters);
  for (const field of ["recordInput", "recordOutput"] as const) {
    const value = input[field];
    if (
      typeof value !== "string" ||
      !TOOL_TRACE_RECORD_LEVELS.includes(value as ToolTracePolicyWire["recordInput"])
    ) {
      issues.add(field, `must be one of: ${TOOL_TRACE_RECORD_LEVELS.join(", ")}`);
    }
  }
  issues.throwIfAny("tool trace policy");
  const record = input as unknown as ToolTracePolicyWire;
  return Object.freeze({
    required: true,
    propagateToAdapters: record.propagateToAdapters,
    recordInput: record.recordInput,
    recordOutput: record.recordOutput,
  });
}

/**
 * Construct and freeze a validated ToolDeclarationWire: the full
 * declaration law (capability, schemas, optional strict/interaction flags,
 * and the five policies). The permission spec is re-validated through the
 * APPLICATION authority-domain law.
 */
export function toolContractDeclaration(input: unknown): ToolDeclarationWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid tool contract declaration: must be an object");
  }
  issues.requireNonEmptyString("capability", input.capability);
  if (!isRecord(input.inputSchema)) {
    issues.add("inputSchema", "must be a JSON object");
  }
  if (!isRecord(input.outputSchema)) {
    issues.add("outputSchema", "must be a JSON object");
  }
  if (input.strict !== undefined) {
    issues.requireBoolean("strict", input.strict);
  }
  if (input.requiresUserInteraction !== undefined) {
    issues.requireBoolean("requiresUserInteraction", input.requiresUserInteraction);
  }
  const subvalidators: readonly [string, (value: unknown) => unknown][] = [
    ["permission", toolPermissionSpec],
    ["resultBudget", toolResultBudget],
    ["timeout", toolTimeoutPolicy],
    ["cancellation", toolCancellationPolicy],
    ["trace", toolTracePolicy],
  ];
  const parsed: Record<string, unknown> = {};
  for (const [field, validate] of subvalidators) {
    try {
      parsed[field] = validate(input[field]);
    } catch (error) {
      issues.add(field, error instanceof Error ? error.message : String(error));
    }
  }
  issues.throwIfAny("tool contract declaration");
  const record = input as unknown as ToolDeclarationWire;
  return Object.freeze({
    capability: record.capability,
    ...(record.executionMode !== undefined ? { executionMode: record.executionMode } : {}),
    ...(record.providerNative !== undefined
      ? { providerNative: cloneAndFreeze(record.providerNative) }
      : {}),
    inputSchema: cloneAndFreeze(record.inputSchema),
    outputSchema: cloneAndFreeze(record.outputSchema),
    ...(record.strict !== undefined ? { strict: record.strict } : {}),
    ...(record.requiresUserInteraction !== undefined
      ? { requiresUserInteraction: record.requiresUserInteraction }
      : {}),
    permission: parsed.permission as ToolPermissionSpecWire,
    resultBudget: parsed.resultBudget as ToolResultBudgetWire,
    timeout: parsed.timeout as ToolTimeoutPolicyWire,
    cancellation: parsed.cancellation as ToolCancellationPolicyWire,
    trace: parsed.trace as ToolTracePolicyWire,
  });
}

/** Structural guard: non-empty string array of pattern sources. */
export function isToolPermissionPatternSourceList(
  candidate: unknown,
): candidate is readonly ToolPermissionPatternSourceWire[] {
  return isPatternSourceArray(candidate);
}
