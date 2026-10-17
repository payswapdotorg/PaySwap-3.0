/**
 * Bridge implementation: MCP naming law and registration policy (P3-W3).
 *
 * The substrate's model-visible MCP tool naming rule, reproduced exactly:
 * `mcp__<sanitized-server>__<sanitized-tool>` where sanitization replaces
 * every character outside [a-zA-Z0-9_-] with "_", collapses "_" runs, and
 * falls back to "unknown" when nothing remains. Plus the registration
 * policy projection (allow/deny lists over model-visible names).
 */

import { IssueCollector } from "../errors.ts";
import { isNonEmptyString, isRecord, isStringArray } from "../shared.ts";
import {
  MCP_TOOL_NAME_FALLBACK,
  MCP_TOOL_NAME_PREFIX,
  MCP_TOOL_NAME_SEPARATOR,
} from "../wire/mcp-naming.ts";
import type {
  McpToolNameParts,
  McpToolRegistrationPolicyWire,
} from "../wire/mcp-naming.ts";

/**
 * Sanitize one name part (pin of toModelVisibleMcpNamePart): non-[a-zA-
 * Z0-9_-] characters become "_", runs collapse, empty results fall back to
 * "unknown".
 */
export function toModelVisibleMcpNamePart(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  return sanitized.length > 0 ? sanitized : MCP_TOOL_NAME_FALLBACK;
}

/**
 * The model-visible MCP tool name (pin of toMcpToolName): the descriptor's
 * explicit `name` when present, else
 * `mcp__<sanitized-server>__<sanitized-tool>`.
 */
export function toMcpToolName(
  descriptor: Pick<McpToolNameParts, "serverName" | "toolName"> & {
    readonly name?: string;
  },
): string {
  return (
    descriptor.name ??
    `${MCP_TOOL_NAME_PREFIX}${toModelVisibleMcpNamePart(descriptor.serverName)}${MCP_TOOL_NAME_SEPARATOR}${toModelVisibleMcpNamePart(descriptor.toolName)}`
  );
}

/**
 * Parse a model-visible MCP tool name back into its parts. Throws a plain
 * Error when the value does not carry the `mcp__` prefix or does not have
 * exactly one `__` separator after it.
 */
export function parseMcpToolName(candidate: string): McpToolNameParts {
  if (!isNonEmptyString(candidate)) {
    throw new Error("parseMcpToolName: must be a non-empty string");
  }
  if (!candidate.startsWith(MCP_TOOL_NAME_PREFIX)) {
    throw new Error(
      `parseMcpToolName: '${candidate}' does not carry the model-visible MCP prefix '${MCP_TOOL_NAME_PREFIX}'`,
    );
  }
  const remainder = candidate.slice(MCP_TOOL_NAME_PREFIX.length);
  const separatorIndex = remainder.indexOf(MCP_TOOL_NAME_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex >= remainder.length - MCP_TOOL_NAME_SEPARATOR.length) {
    throw new Error(
      `parseMcpToolName: '${candidate}' must separate sanitized server and tool names with '${MCP_TOOL_NAME_SEPARATOR}'`,
    );
  }
  return Object.freeze({
    serverName: remainder.slice(0, separatorIndex),
    toolName: remainder.slice(separatorIndex + MCP_TOOL_NAME_SEPARATOR.length),
  });
}

/**
 * Construct and freeze a validated McpToolRegistrationPolicyWire: optional
 * non-empty allow/deny string lists (evaluated against model-visible tool
 * names — both explicit `name` forms and generated `mcp__` forms at
 * registration time).
 */
export function mcpToolRegistrationPolicy(
  input: unknown,
): McpToolRegistrationPolicyWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid MCP tool registration policy: must be an object");
  }
  if (input.allowedTools !== undefined) {
    if (!isStringArray(input.allowedTools) || input.allowedTools.length === 0) {
      issues.add("allowedTools", "must be a non-empty string array when present");
    }
  }
  if (input.disallowedTools !== undefined) {
    if (!isStringArray(input.disallowedTools) || input.disallowedTools.length === 0) {
      issues.add("disallowedTools", "must be a non-empty string array when present");
    }
  }
  issues.throwIfAny("MCP tool registration policy");
  const record = input as unknown as McpToolRegistrationPolicyWire;
  return Object.freeze({
    ...(record.allowedTools !== undefined
      ? { allowedTools: Object.freeze([...record.allowedTools]) }
      : {}),
    ...(record.disallowedTools !== undefined
      ? { disallowedTools: Object.freeze([...record.disallowedTools]) }
      : {}),
  });
}

/**
 * Evaluate a registration policy against one descriptor (pin of the
 * registerMcpTools rule): with an allow list, a descriptor registers only
 * when its generated `mcp__` name OR its explicit name is allowed; with a
 * deny list, a descriptor is refused when either name form is denied; deny
 * wins over allow.
 */
export function admitsMcpTool(
  policy: McpToolRegistrationPolicyWire,
  descriptor: Pick<McpToolNameParts, "serverName" | "toolName"> & {
    readonly name?: string;
  },
): boolean {
  const generated = `${MCP_TOOL_NAME_PREFIX}${toModelVisibleMcpNamePart(descriptor.serverName)}${MCP_TOOL_NAME_SEPARATOR}${toModelVisibleMcpNamePart(descriptor.toolName)}`;
  const explicit = descriptor.name;
  if (policy.disallowedTools !== undefined) {
    if (policy.disallowedTools.includes(generated)) return false;
    if (explicit !== undefined && policy.disallowedTools.includes(explicit)) {
      return false;
    }
  }
  if (policy.allowedTools !== undefined) {
    if (policy.allowedTools.includes(generated)) return true;
    return explicit !== undefined && policy.allowedTools.includes(explicit);
  }
  return true;
}
