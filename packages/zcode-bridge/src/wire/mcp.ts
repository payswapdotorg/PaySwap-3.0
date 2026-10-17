/**
 * Pinned wire shapes: MCP (Model Context Protocol) port (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/contracts/src/interfaces/mcp.port.ts — the
 * canonical typed MCP surface (NOT the loose legacy record in
 * packages/shared/src/mcp.ts): server config discriminated union
 * (stdio/http/sse), tool descriptors with annotations, tool call results,
 * and the server status vocabulary.
 *
 * SCOPE NOTE (exclusion, not adaptation): the substrate's ZCode-official
 * auth layer (ZCodeOfficialMcpAuthConfig "zcode_official"/"jwt_token",
 * official provenance, quota/coding-plan error codes in
 * packages/shared/src/official-mcp-*.ts and packages/services/src/
 * official-mcp/*) is PRODUCT-identity surface, not product-neutral platform
 * mechanics — the bridge pins the neutral MCP mechanics only.
 */

/** MCP server transports (pin of McpServerTransportType). */
export type McpServerTransportTypeWire = "stdio" | "http" | "sse";

/** The frozen transport vocabulary. */
export const MCP_SERVER_TRANSPORT_TYPES: readonly McpServerTransportTypeWire[] =
  Object.freeze(["stdio", "http", "sse"]);

/** MCP protocol versions (pin of McpProtocolVersion). */
export type McpProtocolVersionWire = "legacy" | "auto" | "2026-07-28";

/** The frozen protocol-version vocabulary. */
export const MCP_PROTOCOL_VERSIONS: readonly McpProtocolVersionWire[] =
  Object.freeze(["legacy", "auto", "2026-07-28"]);

/** MCP server isolation scopes (pin of McpServerIsolation). */
export type McpServerIsolationWire = "session" | "workspace";

/** The frozen isolation vocabulary. */
export const MCP_SERVER_ISOLATIONS: readonly McpServerIsolationWire[] =
  Object.freeze(["session", "workspace"]);

/** Runtime scope of an MCP tool call (pin of McpCallToolRequest.runtimeScope). */
export type McpRuntimeScopeWire = "main" | "subagent";

/** The frozen runtime-scope vocabulary. */
export const MCP_RUNTIME_SCOPES: readonly McpRuntimeScopeWire[] =
  Object.freeze(["main", "subagent"]);

/** Host-attached runtime source (pin of McpServerRuntimeSource). */
export type McpServerRuntimeSourceWire = "builtin" | "plugin";

/** Common config base (pin of McpServerConfigBase). */
export interface McpServerConfigBaseWire {
  readonly enabled?: boolean;
  readonly isolation?: McpServerIsolationWire;
  readonly protocolVersion?: McpProtocolVersionWire;
  readonly source?: McpServerRuntimeSourceWire;
  readonly timeoutMs?: number;
}

/** OAuth grant kinds (pin of McpOAuthConfig discriminants). */
export type McpOAuthGrantKindWire =
  | "authorization_code"
  | "client_credentials";

/** The frozen OAuth grant vocabulary. */
export const MCP_OAUTH_GRANT_KINDS: readonly McpOAuthGrantKindWire[] =
  Object.freeze(["authorization_code", "client_credentials"]);

/** OAuth configuration (pin of McpOAuthConfig). */
export interface McpOAuthConfigWire {
  readonly type: McpOAuthGrantKindWire;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly clientName?: string;
  readonly redirectPath?: string;
  readonly scope?: string;
}

/** stdio server config (pin of McpStdioServerConfig, official auth dropped). */
export interface McpStdioServerConfigWire extends McpServerConfigBaseWire {
  readonly type: "stdio";
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly oauth?: undefined;
}

/** http server config (pin of McpHttpServerConfig, official auth dropped). */
export interface McpHttpServerConfigWire extends McpServerConfigBaseWire {
  readonly type: "http";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly oauth?: McpOAuthConfigWire;
}

/** sse server config (pin of McpSseServerConfig). */
export interface McpSseServerConfigWire extends McpServerConfigBaseWire {
  readonly type: "sse";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly oauth?: McpOAuthConfigWire;
}

/** The MCP server config union (pin of McpServerConfig). */
export type McpServerConfigWire =
  | McpStdioServerConfigWire
  | McpHttpServerConfigWire
  | McpSseServerConfigWire;

/** MCP tool annotation hints (pin of McpToolAnnotations). */
export type McpToolAnnotationHintWire =
  | "readOnlyHint"
  | "destructiveHint"
  | "idempotentHint"
  | "openWorldHint";

/** The frozen annotation-hint vocabulary. */
export const MCP_TOOL_ANNOTATION_HINTS: readonly McpToolAnnotationHintWire[] =
  Object.freeze([
    "readOnlyHint",
    "destructiveHint",
    "idempotentHint",
    "openWorldHint",
  ]);

/** MCP tool annotations (pin of McpToolAnnotations). */
export interface McpToolAnnotationsWire {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

/**
 * An MCP tool descriptor (pin of McpToolDescriptor): how a remote MCP tool
 * presents to the registry and the model.
 */
export interface McpToolDescriptorWire {
  readonly serverName: string;
  readonly toolName: string;
  readonly name?: string;
  readonly description?: string;
  readonly timeoutMs?: number;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly annotations?: McpToolAnnotationsWire;
  readonly official?: boolean;
}

/**
 * An MCP content block (pin of McpContentBlock): an opaque JSON record —
 * the MCP protocol's content blocks (text/image/resource/...) pass through
 * uninterpreted.
 */
export type McpContentBlockWire = Readonly<Record<string, unknown>>;

/** An MCP tool call result (pin of McpToolCallResult). */
export interface McpToolCallResultWire {
  readonly content: readonly McpContentBlockWire[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
  readonly _meta?: Readonly<Record<string, unknown>>;
}

/** MCP server status kinds (pin of McpServerStatusKind). */
export type McpServerStatusKindWire =
  | "connecting"
  | "connected"
  | "disabled"
  | "disconnected"
  | "failed"
  | "untrusted";

/** The frozen server-status vocabulary. */
export const MCP_SERVER_STATUS_KINDS: readonly McpServerStatusKindWire[] =
  Object.freeze([
    "connecting",
    "connected",
    "disabled",
    "disconnected",
    "failed",
    "untrusted",
  ]);

/** MCP protocol eras (pin of McpServerStatus.protocolEra). */
export type McpProtocolEraWire = "legacy" | "modern";

/** The frozen protocol-era vocabulary. */
export const MCP_PROTOCOL_ERAS: readonly McpProtocolEraWire[] =
  Object.freeze(["legacy", "modern"]);

/** An MCP server status snapshot (pin of McpServerStatus). */
export interface McpServerStatusWire {
  readonly status: McpServerStatusKindWire;
  readonly transport: McpServerTransportTypeWire;
  readonly toolCount: number;
  readonly updatedAt: string;
  readonly error?: string;
  readonly failureKind?: string;
  readonly protocolEra?: McpProtocolEraWire;
}

/** A connection snapshot over all servers (pin of McpConnectionSnapshot). */
export interface McpConnectionSnapshotWire {
  readonly statuses: Readonly<Record<string, McpServerStatusWire>>;
  readonly tools: readonly McpToolDescriptorWire[];
}

/** An MCP tool call request (pin of McpCallToolRequest; descriptive only). */
export interface McpCallToolRequestWire {
  readonly serverName: string;
  readonly toolName: string;
  readonly arguments?: unknown;
  readonly trace?: unknown;
  readonly runtimeScope?: McpRuntimeScopeWire;
  readonly workspacePath?: string;
  readonly workspaceKey?: string;
  readonly remoteSessionId?: string;
  readonly turnId?: string;
}
