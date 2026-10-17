/**
 * Pinned wire shapes: tool contract declaration (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/contracts/src/tools/contract.ts and
 * apps/zcode-cli/packages/contracts/src/tools/json-schema.ts: the
 * substrate's tool declaration contract — permission spec, result budget,
 * timeout policy, cancellation policy, trace policy — plus the canonical
 * JSON-Schema dialect string for tool input/output schemas.
 *
 * ADAPTATION (migration map: permission/approval UX is PAYSWAP-ADAPT, and
 * the critical boundary "ZCode application permission is not PaySwap
 * financial authorization"): ToolPermissionSpecWire carries an explicit
 * `authorityDomain: "APPLICATION"` literal. A declaration that tries to
 * claim a financial permission domain is structurally unrepresentable and
 * rejected by the bridge validator. Permission here means the substrate's
 * APPLICATION permission only.
 */

import type {
  ProviderNativeToolSpecWire,
  ToolExecutionModeWire,
  ToolRiskLevelWire,
  ToolSideEffectScopeWire,
} from "./tool-registry.ts";

/** Canonical JSON-Schema dialect for tool schemas (pin of json-schema.ts). */
export const TOOL_JSON_SCHEMA_DIALECT =
  "https://json-schema.org/draft/2020-12/schema" as const;

/** Permission pattern sources (pin of ToolPermissionPatternSource). */
export type ToolPermissionPatternSourceWire =
  | "none"
  | "toolName"
  | "input"
  | "path"
  | "command"
  | "network"
  | "custom";

/** The frozen pattern-source vocabulary. */
export const TOOL_PERMISSION_PATTERN_SOURCES: readonly ToolPermissionPatternSourceWire[] =
  Object.freeze([
    "none",
    "toolName",
    "input",
    "path",
    "command",
    "network",
    "custom",
  ]);

/** Deny priority law (pin of ToolPermissionSpec.denyPriority). */
export type ToolDenyPriorityWire = "beforeAsk" | "afterStaticAllow";

/** The frozen deny-priority vocabulary. */
export const TOOL_DENY_PRIORITIES: readonly ToolDenyPriorityWire[] =
  Object.freeze(["beforeAsk", "afterStaticAllow"]);

/** Ask-options narrowing (pin of ToolPermissionSpec.askOptions). */
export interface ToolAskOptionsWire {
  readonly allowAlways: false | "session";
}

/**
 * The application permission spec (pin of ToolPermissionSpec + the bridge's
 * authority-domain adaptation). `authorityDomain` is a literal "APPLICATION"
 * — this whole spec is and can only ever be substrate application
 * permission; it structurally cannot express PaySwap financial
 * authorization.
 */
export interface ToolPermissionSpecWire {
  readonly permission: string;
  readonly reason: string;
  readonly riskLevel: ToolRiskLevelWire;
  readonly sideEffectScope: ToolSideEffectScopeWire;
  readonly needsApproval: boolean;
  readonly patternSources: readonly ToolPermissionPatternSourceWire[];
  readonly alwaysAllowPatternSources?: readonly ToolPermissionPatternSourceWire[];
  readonly denyPriority: ToolDenyPriorityWire;
  readonly alwaysAsk?: true;
  readonly askOptions?: ToolAskOptionsWire;
  readonly authorityDomain: "APPLICATION";
}

/** Result budget preview policy (pin of ToolResultBudget.preview). */
export interface ToolResultBudgetPreviewWire {
  readonly maxBytes?: number;
  readonly maxLines?: number;
  readonly direction?: "head" | "tail";
}

/** Result budget artifact policy (pin of ToolResultBudget.artifact). */
export interface ToolResultBudgetArtifactWire {
  readonly enabled: boolean;
  readonly retention?: "session" | "project" | "temporary";
}

/** Result budget strategies (pin of ToolResultBudgetStrategy). */
export type ToolResultBudgetStrategyWire = "inline" | "truncate" | "artifact";

/** The frozen strategy vocabulary. */
export const TOOL_RESULT_BUDGET_STRATEGIES: readonly ToolResultBudgetStrategyWire[] =
  Object.freeze(["inline", "truncate", "artifact"]);

/** The frozen artifact-retention vocabulary. */
export const TOOL_RESULT_BUDGET_RETENTIONS: readonly ("session" | "project" | "temporary")[] =
  Object.freeze(["session", "project", "temporary"]);

/** Result budget (pin of ToolResultBudget). */
export interface ToolResultBudgetWire {
  readonly maxInlineBytes: number;
  readonly maxModelBytes: number;
  readonly strategy: ToolResultBudgetStrategyWire;
  readonly preview?: ToolResultBudgetPreviewWire;
  readonly artifact?: ToolResultBudgetArtifactWire;
}

/** No-timeout policy (pin of NoToolTimeoutPolicy). */
export interface NoToolTimeoutPolicyWire {
  readonly kind: "none";
}

/** Timed timeout policy (pin of TimedToolTimeoutPolicy). */
export interface TimedToolTimeoutPolicyWire {
  readonly kind?: "timed";
  readonly defaultMs: number;
  readonly maxMs?: number;
  readonly allowCallOverride: boolean;
  readonly cleanupGraceMs?: number;
}

/** Timeout policy (pin of ToolTimeoutPolicy). */
export type ToolTimeoutPolicyWire =
  | NoToolTimeoutPolicyWire
  | TimedToolTimeoutPolicyWire;

/** Cancellation cleanup levels (pin of ToolCancellationPolicy.cleanup). */
export type ToolCancellationCleanupWire = "none" | "bestEffort" | "required";

/** The frozen cleanup vocabulary. */
export const TOOL_CANCELLATION_CLEANUPS: readonly ToolCancellationCleanupWire[] =
  Object.freeze(["none", "bestEffort", "required"]);

/** Cancellation policy (pin of ToolCancellationPolicy). */
export interface ToolCancellationPolicyWire {
  readonly supported: boolean;
  readonly cleanup: ToolCancellationCleanupWire;
  readonly userVisibleMessage: string;
}

/** Trace recording levels (pin of ToolTracePolicy.recordInput/recordOutput). */
export type ToolTraceRecordLevelWire = "summary" | "full" | "none";

/** The frozen trace-record vocabulary. */
export const TOOL_TRACE_RECORD_LEVELS: readonly ToolTraceRecordLevelWire[] =
  Object.freeze(["summary", "full", "none"]);

/** Trace policy (pin of ToolTracePolicy). */
export interface ToolTracePolicyWire {
  readonly required: true;
  readonly propagateToAdapters: boolean;
  readonly recordInput: ToolTraceRecordLevelWire;
  readonly recordOutput: ToolTraceRecordLevelWire;
}

/**
 * The tool contract declaration (pin of ToolContractDeclaration with the
 * authority-domain adaptation above). Descriptive only: the declaration
 * tells consumers what a tool IS, never how to execute it.
 */
export interface ToolDeclarationWire {
  readonly capability: string;
  readonly executionMode?: ToolExecutionModeWire;
  readonly providerNative?: ProviderNativeToolSpecWire;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly strict?: boolean;
  readonly requiresUserInteraction?: boolean;
  readonly permission: ToolPermissionSpecWire;
  readonly resultBudget: ToolResultBudgetWire;
  readonly timeout: ToolTimeoutPolicyWire;
  readonly cancellation: ToolCancellationPolicyWire;
  readonly trace: ToolTracePolicyWire;
}
