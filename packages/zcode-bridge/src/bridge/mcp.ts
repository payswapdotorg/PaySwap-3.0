/**
 * Bridge implementation: MCP port validators (P3-W3).
 *
 * Validators for the pinned MCP wire: server configs (the discriminated
 * stdio/http/sse union with the shared base law), tool descriptors with
 * annotations, tool call results, and server status snapshots.
 */

import { IssueCollector } from "../errors.ts";
import {
  cloneAndFreeze,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  isStringArray,
  isStringRecord,
} from "../shared.ts";
import {
  MCP_OAUTH_GRANT_KINDS,
  MCP_PROTOCOL_ERAS,
  MCP_PROTOCOL_VERSIONS,
  MCP_RUNTIME_SCOPES,
  MCP_SERVER_ISOLATIONS,
  MCP_SERVER_STATUS_KINDS,
  MCP_SERVER_TRANSPORT_TYPES,
} from "../wire/mcp.ts";
import type {
  McpContentBlockWire,
  McpServerConfigWire,
  McpServerStatusWire,
  McpToolCallResultWire,
  McpToolDescriptorWire,
} from "../wire/mcp.ts";

function validateBase(issues: IssueCollector, input: Record<string, unknown>): void {
  if (input.enabled !== undefined) {
    issues.requireBoolean("enabled", input.enabled);
  }
  if (input.isolation !== undefined) {
    if (
      typeof input.isolation !== "string" ||
      !MCP_SERVER_ISOLATIONS.includes(input.isolation as "session" | "workspace")
    ) {
      issues.add("isolation", `must be one of: ${MCP_SERVER_ISOLATIONS.join(", ")}`);
    }
  }
  if (input.protocolVersion !== undefined) {
    if (
      typeof input.protocolVersion !== "string" ||
      !MCP_PROTOCOL_VERSIONS.includes(
        input.protocolVersion as "legacy" | "auto" | "2026-07-28",
      )
    ) {
      issues.add("protocolVersion", `must be one of: ${MCP_PROTOCOL_VERSIONS.join(", ")}`);
    }
  }
  if (input.source !== undefined) {
    if (
      typeof input.source !== "string" ||
      (input.source !== "builtin" && input.source !== "plugin")
    ) {
      issues.add("source", 'must be "builtin" or "plugin"');
    }
  }
  if (input.timeoutMs !== undefined) {
    issues.requireNonNegativeInteger("timeoutMs", input.timeoutMs);
  }
}

function validateOAuth(issues: IssueCollector, candidate: unknown): void {
  if (candidate === undefined) return;
  if (!isRecord(candidate)) {
    issues.add("oauth", "must be an object when present");
    return;
  }
  if (
    typeof candidate.type !== "string" ||
    !MCP_OAUTH_GRANT_KINDS.includes(
      candidate.type as "authorization_code" | "client_credentials",
    )
  ) {
    issues.add("oauth.type", `must be one of: ${MCP_OAUTH_GRANT_KINDS.join(", ")}`);
  }
  for (const field of ["clientId", "clientSecret", "clientName", "redirectPath", "scope"] as const) {
    if (candidate[field] !== undefined && !isNonEmptyString(candidate[field])) {
      issues.add(`oauth.${field}`, "must be a non-empty string when present");
    }
  }
}

/**
 * Construct and freeze a validated McpServerConfigWire (the discriminated
 * stdio/http/sse union). Per-transport law: stdio requires command (args,
 * cwd, env optional; oauth is structurally absent); http/sse require url
 * (headers, oauth optional). The base law applies to all three.
 */
export function validateMcpServerConfig(input: unknown): McpServerConfigWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid MCP server config: must be an object");
  }
  const type = input.type;
  if (typeof type !== "string" || !MCP_SERVER_TRANSPORT_TYPES.includes(type as "stdio" | "http" | "sse")) {
    throw new Error(
      `Invalid MCP server config: type must be one of: ${MCP_SERVER_TRANSPORT_TYPES.join(", ")}`,
    );
  }
  validateBase(issues, input);
  if (type === "stdio") {
    issues.requireNonEmptyString("command", input.command);
    if (input.args !== undefined && !isStringArray(input.args)) {
      issues.add("args", "must be a string array when present");
    }
    if (input.cwd !== undefined && !isNonEmptyString(input.cwd)) {
      issues.add("cwd", "must be a non-empty string when present");
    }
    if (input.env !== undefined && !isStringRecord(input.env)) {
      issues.add("env", "must be a record of strings when present");
    }
    if (input.oauth !== undefined) {
      issues.add("oauth", 'must be absent on stdio servers (sse rejects oauth-bearing auth; http carries it)');
    }
    if (input.url !== undefined) {
      issues.add("url", "must be absent on stdio servers");
    }
  } else {
    issues.requireNonEmptyString("url", input.url);
    if (input.headers !== undefined && !isStringRecord(input.headers)) {
      issues.add("headers", "must be a record of strings when present");
    }
    validateOAuth(issues, input.oauth);
    if (input.command !== undefined) {
      issues.add("command", `must be absent on ${type} servers`);
    }
  }
  issues.throwIfAny("MCP server config");
  const record = input as unknown as McpServerConfigWire;
  const frozen = {
    type: record.type,
    ...(record.enabled !== undefined ? { enabled: record.enabled } : {}),
    ...(record.isolation !== undefined ? { isolation: record.isolation } : {}),
    ...(record.protocolVersion !== undefined
      ? { protocolVersion: record.protocolVersion }
      : {}),
    ...(record.source !== undefined ? { source: record.source } : {}),
    ...(record.timeoutMs !== undefined ? { timeoutMs: record.timeoutMs } : {}),
    ...(record.type === "stdio"
      ? {
          command: record.command,
          ...(record.args !== undefined ? { args: Object.freeze([...record.args]) } : {}),
          ...(record.cwd !== undefined ? { cwd: record.cwd } : {}),
          ...(record.env !== undefined ? { env: cloneAndFreeze(record.env) } : {}),
        }
      : {
          url: record.url,
          ...(record.headers !== undefined ? { headers: cloneAndFreeze(record.headers) } : {}),
          ...(record.oauth !== undefined ? { oauth: cloneAndFreeze(record.oauth) } : {}),
        }),
  };
  return Object.freeze(frozen) as McpServerConfigWire;
}

/**
 * Construct and freeze a validated McpToolDescriptorWire: non-empty server
 * and tool names, JSON-object input schema, optional output schema,
 * timeout and annotations with boolean hints.
 */
export function mcpToolDescriptor(input: unknown): McpToolDescriptorWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid MCP tool descriptor: must be an object");
  }
  issues.requireNonEmptyString("serverName", input.serverName);
  issues.requireNonEmptyString("toolName", input.toolName);
  if (input.name !== undefined) {
    issues.requireNonEmptyString("name", input.name, "must be a non-empty string when present");
  }
  if (input.description !== undefined) {
    issues.requireNonEmptyString(
      "description",
      input.description,
      "must be a non-empty string when present",
    );
  }
  if (input.timeoutMs !== undefined) {
    issues.requireNonNegativeInteger("timeoutMs", input.timeoutMs);
  }
  if (!isRecord(input.inputSchema)) {
    issues.add("inputSchema", "must be a JSON object");
  }
  if (input.outputSchema !== undefined && !isRecord(input.outputSchema)) {
    issues.add("outputSchema", "must be a JSON object when present");
  }
  if (input.annotations !== undefined) {
    const annotations = input.annotations;
    if (!isRecord(annotations)) {
      issues.add("annotations", "must be an object when present");
    } else {
      for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
        if (annotations[hint] !== undefined) {
          issues.requireBoolean(`annotations.${hint}`, annotations[hint]);
        }
      }
    }
  }
  if (input.official !== undefined) {
    issues.requireBoolean("official", input.official);
  }
  issues.throwIfAny("MCP tool descriptor");
  const record = input as unknown as McpToolDescriptorWire;
  return Object.freeze({
    serverName: record.serverName,
    toolName: record.toolName,
    ...(record.name !== undefined ? { name: record.name } : {}),
    ...(record.description !== undefined ? { description: record.description } : {}),
    ...(record.timeoutMs !== undefined ? { timeoutMs: record.timeoutMs } : {}),
    inputSchema: cloneAndFreeze(record.inputSchema),
    ...(record.outputSchema !== undefined
      ? { outputSchema: cloneAndFreeze(record.outputSchema) }
      : {}),
    ...(record.annotations !== undefined
      ? { annotations: Object.freeze({ ...record.annotations }) }
      : {}),
    ...(record.official !== undefined ? { official: record.official } : {}),
  });
}

/**
 * Construct and freeze a validated McpToolCallResultWire: a non-empty
 * content block array (each block an object), optional structuredContent,
 * isError and _meta.
 */
export function mcpToolCallResult(input: unknown): McpToolCallResultWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid MCP tool call result: must be an object");
  }
  if (
    !Array.isArray(input.content) ||
    input.content.length === 0 ||
    !input.content.every((block: unknown) => isRecord(block))
  ) {
    issues.add("content", "must be a non-empty array of content-block objects");
  }
  if (input.isError !== undefined) {
    issues.requireBoolean("isError", input.isError);
  }
  if (input._meta !== undefined && !isRecord(input._meta)) {
    issues.add("_meta", "must be an object when present");
  }
  issues.throwIfAny("MCP tool call result");
  const record = input as unknown as McpToolCallResultWire;
  return Object.freeze({
    content: Object.freeze(
      (record.content as readonly McpContentBlockWire[]).map((block) => cloneAndFreeze(block)),
    ),
    ...(record.structuredContent !== undefined
      ? { structuredContent: cloneAndFreeze(record.structuredContent) }
      : {}),
    ...(record.isError !== undefined ? { isError: record.isError } : {}),
    ...(record._meta !== undefined ? { _meta: cloneAndFreeze(record._meta) } : {}),
  });
}

/**
 * Construct and freeze a validated McpServerStatusWire: status and
 * transport from the pinned vocabularies, non-negative toolCount,
 * non-empty updatedAt, optional error/failureKind/protocolEra.
 */
export function mcpServerStatus(input: unknown): McpServerStatusWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid MCP server status: must be an object");
  }
  if (
    typeof input.status !== "string" ||
    !MCP_SERVER_STATUS_KINDS.includes(
      input.status as McpServerStatusWire["status"],
    )
  ) {
    issues.add("status", `must be one of: ${MCP_SERVER_STATUS_KINDS.join(", ")}`);
  }
  if (
    typeof input.transport !== "string" ||
    !MCP_SERVER_TRANSPORT_TYPES.includes(
      input.transport as McpServerStatusWire["transport"],
    )
  ) {
    issues.add("transport", `must be one of: ${MCP_SERVER_TRANSPORT_TYPES.join(", ")}`);
  }
  issues.requireNonNegativeInteger("toolCount", input.toolCount);
  issues.requireNonEmptyString("updatedAt", input.updatedAt);
  if (input.error !== undefined) {
    issues.requireNonEmptyString("error", input.error, "must be a non-empty string when present");
  }
  if (input.failureKind !== undefined) {
    issues.requireNonEmptyString(
      "failureKind",
      input.failureKind,
      "must be a non-empty string when present",
    );
  }
  if (input.protocolEra !== undefined) {
    if (
      typeof input.protocolEra !== "string" ||
      !MCP_PROTOCOL_ERAS.includes(input.protocolEra as "legacy" | "modern")
    ) {
      issues.add("protocolEra", `must be one of: ${MCP_PROTOCOL_ERAS.join(", ")}`);
    }
  }
  issues.throwIfAny("MCP server status");
  const record = input as unknown as McpServerStatusWire;
  return Object.freeze({
    status: record.status,
    transport: record.transport,
    toolCount: record.toolCount,
    updatedAt: record.updatedAt,
    ...(record.error !== undefined ? { error: record.error } : {}),
    ...(record.failureKind !== undefined ? { failureKind: record.failureKind } : {}),
    ...(record.protocolEra !== undefined ? { protocolEra: record.protocolEra } : {}),
  });
}

/** Structural guard: MCP runtime scope ("main" | "subagent"). */
export function isMcpRuntimeScope(
  candidate: unknown,
): candidate is "main" | "subagent" {
  return (
    typeof candidate === "string" &&
    MCP_RUNTIME_SCOPES.includes(candidate as "main" | "subagent")
  );
}
