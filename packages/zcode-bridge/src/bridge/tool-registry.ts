/**
 * Bridge implementation: tool registry (P3-W3).
 *
 * The registry entry contract as typed observations: construct/validate
 * entries (metadata law, alias law), project entries to model-facing tool
 * contracts (the substrate registry's toContracts() projection: one
 * contract per model-visible name — canonical name first, then aliases —
 * with metadata folded into the model-visible description), and assemble
 * registry snapshots that enforce the substrate's name-conflict law
 * (canonical-name priority; a conflicting alias is rejected).
 */

import { IssueCollector } from "../errors.ts";
import {
  cloneAndFreeze,
  isBoolean,
  isNonEmptyString,
  isNonEmptyStringArray,
  isNonNegativeInteger,
  isRecord,
} from "../shared.ts";
import {
  TOOL_EXECUTION_MODES,
  TOOL_RISK_LEVELS,
  TOOL_SIDE_EFFECT_SCOPES,
} from "../wire/tool-registry.ts";
import type {
  McpPresentationWire,
  ToolExecutionModeWire,
  ToolMetadataWire,
  ToolRegistryEntryWire,
  ToolRegistrySnapshotWire,
  ToolRiskLevelWire,
  ToolSideEffectScopeWire,
} from "../wire/tool-registry.ts";
import type { ModelToolContractWire } from "../wire/model-tool.ts";

/** Structural guard: tool risk level. */
export function isToolRiskLevel(candidate: unknown): candidate is ToolRiskLevelWire {
  if (typeof candidate !== "string") return false;
  return TOOL_RISK_LEVELS.includes(candidate as ToolRiskLevelWire);
}

/** Structural guard: tool side-effect scope. */
export function isToolSideEffectScope(
  candidate: unknown,
): candidate is ToolSideEffectScopeWire {
  if (typeof candidate !== "string") return false;
  return TOOL_SIDE_EFFECT_SCOPES.includes(candidate as ToolSideEffectScopeWire);
}

/** Structural guard: tool execution mode. */
export function isToolExecutionMode(
  candidate: unknown,
): candidate is ToolExecutionModeWire {
  if (typeof candidate !== "string") return false;
  return TOOL_EXECUTION_MODES.includes(candidate as ToolExecutionModeWire);
}

/**
 * Construct and freeze a validated ToolMetadataWire. The metadata law:
 * non-empty name/description, booleans for the safety flags, risk level and
 * side-effect scope from the pinned vocabularies, optional non-negative
 * timeout, optional MCP presentation. Throws a plain Error listing every
 * violation.
 */
export function toolMetadata(input: unknown): ToolMetadataWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid tool metadata: must be an object");
  }
  issues.requireNonEmptyString("name", input.name);
  issues.requireNonEmptyString("description", input.description);
  issues.requireBoolean("readOnly", input.readOnly);
  issues.requireBoolean("destructive", input.destructive);
  issues.requireBoolean("concurrentSafe", input.concurrentSafe);
  issues.requireBoolean("needsApproval", input.needsApproval);
  if (!isToolRiskLevel(input.riskLevel)) {
    issues.add("riskLevel", `must be one of: ${TOOL_RISK_LEVELS.join(", ")}`);
  }
  if (!isToolSideEffectScope(input.sideEffectScope)) {
    issues.add("sideEffectScope", `must be one of: ${TOOL_SIDE_EFFECT_SCOPES.join(", ")}`);
  }
  if (input.timeoutMs !== undefined) {
    issues.requireNonNegativeInteger("timeoutMs", input.timeoutMs);
  }
  if (input.mcpPresentation !== undefined) {
    const presentation = input.mcpPresentation;
    if (!isRecord(presentation)) {
      issues.add("mcpPresentation", "must be an object");
    } else {
      issues.requireNonEmptyString("mcpPresentation.serverName", presentation.serverName);
      issues.requireNonEmptyString("mcpPresentation.toolName", presentation.toolName);
      if (presentation.description !== undefined) {
        issues.requireNonEmptyString(
          "mcpPresentation.description",
          presentation.description,
          "must be a non-empty string when present",
        );
      }
      if (presentation.official !== undefined) {
        issues.requireBoolean("mcpPresentation.official", presentation.official);
      }
    }
  }
  issues.throwIfAny("tool metadata");
  const record = input as unknown as ToolMetadataWire;
  return Object.freeze({
    name: record.name,
    description: record.description,
    readOnly: record.readOnly,
    destructive: record.destructive,
    concurrentSafe: record.concurrentSafe,
    riskLevel: record.riskLevel,
    needsApproval: record.needsApproval,
    sideEffectScope: record.sideEffectScope,
    ...(record.timeoutMs !== undefined ? { timeoutMs: record.timeoutMs } : {}),
    ...(record.mcpPresentation !== undefined
      ? { mcpPresentation: Object.freeze({ ...record.mcpPresentation }) }
      : {}),
  });
}

/**
 * Construct and freeze a validated ToolRegistryEntryWire: non-empty
 * canonical name, optional non-empty unique aliases, non-empty capability,
 * optional execution mode from the pinned vocabulary, JSON-object schemas,
 * and valid metadata whose name MUST equal the entry's canonical name (the
 * substrate's registry law — the metadata is the name's safety envelope).
 */
export function toolRegistryEntry(input: unknown): ToolRegistryEntryWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid tool registry entry: must be an object");
  }
  issues.requireNonEmptyString("name", input.name);
  issues.requireNonEmptyString("capability", input.capability);
  if (input.aliases !== undefined && !isNonEmptyStringArray(input.aliases)) {
    issues.add("aliases", "must be a non-empty string array when present");
  }
  if (
    input.aliases !== undefined &&
    isNonEmptyStringArray(input.aliases) &&
    new Set(input.aliases).size !== input.aliases.length
  ) {
    issues.add("aliases", "must not repeat");
  }
  if (
    input.aliases !== undefined &&
    isNonEmptyStringArray(input.aliases) &&
    isNonEmptyString(input.name) &&
    input.aliases.includes(input.name)
  ) {
    issues.add("aliases", "must not include the canonical name");
  }
  if (input.executionMode !== undefined && !isToolExecutionMode(input.executionMode)) {
    issues.add("executionMode", `must be one of: ${TOOL_EXECUTION_MODES.join(", ")}`);
  }
  if (!isRecord(input.inputSchema)) {
    issues.add("inputSchema", "must be a JSON object");
  }
  if (!isRecord(input.outputSchema)) {
    issues.add("outputSchema", "must be a JSON object");
  }
  let metadata: ToolMetadataWire | undefined;
  try {
    metadata = toolMetadata(input.metadata);
  } catch (error) {
    issues.add("metadata", error instanceof Error ? error.message : String(error));
  }
  if (metadata !== undefined && isNonEmptyString(input.name) && metadata.name !== input.name) {
    issues.add("metadata.name", `must equal the entry's canonical name '${input.name}'`);
  }
  issues.throwIfAny("tool registry entry");
  const record = input as unknown as ToolRegistryEntryWire;
  // After throwIfAny the metadata parse succeeded (a failure added an issue
  // and threw), so the cast is safe.
  const validatedMetadata = metadata as ToolMetadataWire;
  return Object.freeze({
    name: record.name,
    capability: record.capability,
    ...(record.aliases !== undefined
      ? { aliases: Object.freeze([...record.aliases]) }
      : {}),
    ...(record.executionMode !== undefined ? { executionMode: record.executionMode } : {}),
    inputSchema: cloneAndFreeze(record.inputSchema),
    outputSchema: cloneAndFreeze(record.outputSchema),
    metadata: validatedMetadata,
  });
}

/**
 * Project a registry entry to its model-facing tool contracts (the
 * substrate registry's toContracts() law): one contract per model-visible
 * name — the canonical name first, then each alias in order — each carrying
 * the entry's schemas, safety flags folded from metadata, and a
 * model-visible description. No `execute`: a bridged contract describes a
 * tool; the substrate runtime executes.
 */
export function projectToolContracts(
  entry: ToolRegistryEntryWire,
): readonly ModelToolContractWire[] {
  const validated = isFrozenEntry(entry) ? entry : toolRegistryEntry(entry);
  const names = [validated.name, ...(validated.aliases ?? [])];
  return Object.freeze(
    names.map(
      (name) =>
        Object.freeze({
          name,
          description: validated.metadata.description,
          capability: validated.capability,
          ...(validated.executionMode !== undefined
            ? { executionMode: validated.executionMode }
            : {}),
          inputSchema: validated.inputSchema,
          outputSchema: validated.outputSchema,
          readOnly: validated.metadata.readOnly,
          destructive: validated.metadata.destructive,
          concurrentSafe: validated.metadata.concurrentSafe,
          needsApproval: validated.metadata.needsApproval,
          sideEffectScope: validated.metadata.sideEffectScope,
          ...(validated.metadata.timeoutMs !== undefined
            ? { timeoutMs: validated.metadata.timeoutMs }
            : {}),
        }) as ModelToolContractWire,
    ),
  );
}

function isFrozenEntry(entry: ToolRegistryEntryWire): boolean {
  return Object.isFrozen(entry) && Object.isFrozen(entry.metadata);
}

/**
 * Assemble a registry snapshot from entries, enforcing the substrate's
 * name-conflict law: every model-visible name (canonical names AND
 * aliases) must be unique across the registry — a conflicting alias is
 * rejected, canonical names take priority by construction (first entry to
 * declare a name owns it). The snapshot's modelVisibleNames list carries
 * canonical names first, then aliases, in entry order.
 */
export function toolRegistrySnapshot(
  entries: readonly unknown[],
): ToolRegistrySnapshotWire {
  if (!Array.isArray(entries)) {
    throw new Error("Invalid tool registry snapshot: entries must be an array");
  }
  const validated = entries.map((entry) => toolRegistryEntry(entry));
  const owner = new Map<string, string>();
  const names: string[] = [];
  for (const entry of validated) {
    for (const name of [entry.name, ...(entry.aliases ?? [])]) {
      const existing = owner.get(name);
      if (existing !== undefined) {
        throw new Error(
          `Invalid tool registry snapshot: model-visible name '${name}' conflicts between '${existing}' and '${entry.name}' (canonical-name priority; conflicting aliases rejected)`,
        );
      }
      owner.set(name, entry.name);
      names.push(name);
    }
  }
  return Object.freeze({
    entries: Object.freeze(validated),
    modelVisibleNames: Object.freeze(names),
  });
}
