/**
 * Pinned wire shapes: tool registry (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/core/src/tool/registry.ts and
 * apps/zcode-cli/packages/core/src/tool/types.ts: the substrate's tool
 * registry entry contract — the name/alias law (canonical name priority;
 * conflicting aliases rejected), the ToolMetadata risk/safety vocabulary,
 * execution modes ("client" | "providerNative") and the model-facing
 * contract projection (registry.toContracts(): strips execution, folds
 * metadata into the model-visible description).
 *
 * The registry's `handler`, `execute`, ports and context are EXECUTION
 * machinery and are deliberately NOT bridged: this bridge pins the
 * descriptive wire only (a typed observation, never a callable).
 */

/** Risk levels (pin of contracts RiskLevel, shared by tools and permissions). */
export type ToolRiskLevelWire = "low" | "medium" | "high" | "critical";

/** The frozen risk-level vocabulary. */
export const TOOL_RISK_LEVELS: readonly ToolRiskLevelWire[] = Object.freeze([
  "low",
  "medium",
  "high",
  "critical",
]);

/**
 * Side-effect scopes (pin of contracts/src/tools/contract.ts
 * ToolSideEffectScope). These are APPLICATION-level effect scopes —
 * workspace/git/system mutate the working environment; they are not and can
 * never be financial effect scopes.
 */
export type ToolSideEffectScopeWire =
  | "none"
  | "workspace"
  | "git"
  | "network"
  | "system"
  | "session"
  | "userInteraction";

/** The frozen side-effect-scope vocabulary. */
export const TOOL_SIDE_EFFECT_SCOPES: readonly ToolSideEffectScopeWire[] =
  Object.freeze([
    "none",
    "workspace",
    "git",
    "network",
    "system",
    "session",
    "userInteraction",
  ]);

/** Execution modes (pin of ToolExecutionMode). */
export type ToolExecutionModeWire = "client" | "providerNative";

/** The frozen execution-mode vocabulary. */
export const TOOL_EXECUTION_MODES: readonly ToolExecutionModeWire[] =
  Object.freeze(["client", "providerNative"]);

/**
 * Provider-native tool spec (pin of ProviderNativeToolSpec): a tool the
 * model provider executes natively.
 */
export interface ProviderNativeToolSpecWire {
  readonly kind: "provider_native";
  readonly logicalName: string;
  readonly providerToolName: string;
  readonly providerIds?: readonly string[];
  readonly args?: Readonly<Record<string, unknown>>;
  readonly fallback: "disabled";
}

/** MCP presentation metadata on a tool (pin of ToolMetadata.mcpPresentation). */
export interface McpPresentationWire {
  readonly serverName: string;
  readonly toolName: string;
  readonly description?: string;
  readonly official?: boolean;
}

/**
 * Tool metadata (pin of core/src/tool/types.ts ToolMetadata): the
 * descriptive safety envelope of a registered tool.
 */
export interface ToolMetadataWire {
  readonly name: string;
  readonly description: string;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly concurrentSafe: boolean;
  readonly riskLevel: ToolRiskLevelWire;
  readonly needsApproval: boolean;
  readonly sideEffectScope: ToolSideEffectScopeWire;
  readonly timeoutMs?: number;
  readonly mcpPresentation?: McpPresentationWire;
}

/**
 * A registry entry on the wire (the descriptive slice of core ToolEntry,
 * which extends the contracts ToolContractDeclaration): name + aliases +
 * capability + schemas + metadata. No handler, no context, no execute —
 * those live in the substrate runtime and are never bridged.
 */
export interface ToolRegistryEntryWire {
  /** Canonical registered name (model-visible primary). */
  readonly name: string;
  /** Model-visible aliases (each also projected as a contract name). */
  readonly aliases?: readonly string[];
  /** The capability id the tool serves (contracts declaration key). */
  readonly capability: string;
  readonly executionMode?: ToolExecutionModeWire;
  readonly providerNative?: ProviderNativeToolSpecWire;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly metadata: ToolMetadataWire;
}

/**
 * A registry snapshot: the full set of entries plus the derived
 * model-visible name index (canonical names first, then aliases — the
 * substrate's alias-conflict law is enforced at snapshot construction).
 */
export interface ToolRegistrySnapshotWire {
  readonly entries: readonly ToolRegistryEntryWire[];
  readonly modelVisibleNames: readonly string[];
}
