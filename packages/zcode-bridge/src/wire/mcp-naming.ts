/**
 * Pinned wire shapes: MCP registry integration and naming law (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/core/src/mcp/name.ts and
 * apps/zcode-cli/packages/core/src/mcp/index.ts: the model-visible MCP tool
 * naming rule (`mcp__<sanitized-server>__<sanitized-tool>` where sanitizing
 * replaces every character outside [a-zA-Z0-9_-] with "_" then collapses
 * runs, falling back to "unknown" when nothing remains) and the
 * registration policy shapes (allowed/disallowed tool lists).
 */

/** The model-visible MCP tool name prefix (pin of the naming rule). */
export const MCP_TOOL_NAME_PREFIX = "mcp__" as const;

/** The separator between sanitized server and tool name parts. */
export const MCP_TOOL_NAME_SEPARATOR = "__" as const;

/** The fallback name part when sanitization leaves nothing (pin). */
export const MCP_TOOL_NAME_FALLBACK = "unknown" as const;

/** A parsed model-visible MCP tool name. */
export interface McpToolNameParts {
  readonly serverName: string;
  readonly toolName: string;
}

/**
 * The registration policy for MCP tools entering the substrate tool
 * registry (pin of RegisterMcpToolsOptions): allow/deny lists evaluated by
 * model-visible tool name.
 */
export interface McpToolRegistrationPolicyWire {
  /** When present, only these model-visible tool names register. */
  readonly allowedTools?: readonly string[];
  /** When present, these model-visible tool names never register. */
  readonly disallowedTools?: readonly string[];
}

/**
 * The MCP tool output wire schema (pin of McpToolOutputJsonSchema in
 * apps/zcode-cli/packages/core/src/mcp/index.ts — the JSON-Schema form of
 * an MCP tool result as the substrate registers it; frozen verbatim).
 */
export const MCP_TOOL_OUTPUT_JSON_SCHEMA: Readonly<Record<string, unknown>> =
  Object.freeze({
    type: "object",
    required: Object.freeze(["content"]),
    properties: Object.freeze({
      content: Object.freeze({
        type: "array",
        items: Object.freeze({
          type: "object",
          additionalProperties: true,
        }),
      }),
      structuredContent: Object.freeze({}),
      isError: Object.freeze({
        type: "boolean",
      }),
      _meta: Object.freeze({
        type: "object",
        additionalProperties: true,
      }),
    }),
    additionalProperties: false,
  });
