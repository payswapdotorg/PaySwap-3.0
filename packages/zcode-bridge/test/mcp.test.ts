/**
 * MCP port surface tests (P3-W3): server config union, tool descriptors,
 * call results and server statuses.
 */

import { describe, expect, it } from "vitest";

import {
  MCP_PROTOCOL_VERSIONS,
  MCP_SERVER_STATUS_KINDS,
  MCP_SERVER_TRANSPORT_TYPES,
  MCP_TOOL_ANNOTATION_HINTS,
  MCP_TOOL_OUTPUT_JSON_SCHEMA,
  isMcpRuntimeScope,
  mcpServerStatus,
  mcpToolCallResult,
  mcpToolDescriptor,
  validateMcpServerConfig,
} from "../src/index.ts";

describe("MCP port surface", () => {
  it("pins the transport, protocol-version and status vocabularies", () => {
    expect([...MCP_SERVER_TRANSPORT_TYPES]).toEqual(["stdio", "http", "sse"]);
    expect([...MCP_PROTOCOL_VERSIONS]).toEqual(["legacy", "auto", "2026-07-28"]);
    expect([...MCP_SERVER_STATUS_KINDS]).toEqual([
      "connecting",
      "connected",
      "disabled",
      "disconnected",
      "failed",
      "untrusted",
    ]);
    expect([...MCP_TOOL_ANNOTATION_HINTS]).toEqual([
      "readOnlyHint",
      "destructiveHint",
      "idempotentHint",
      "openWorldHint",
    ]);
    expect(Object.isFrozen(MCP_SERVER_STATUS_KINDS)).toBe(true);
  });

  it("pins the MCP tool output wire schema verbatim (substrate law)", () => {
    expect(MCP_TOOL_OUTPUT_JSON_SCHEMA).toEqual({
      type: "object",
      required: ["content"],
      properties: {
        content: { type: "array", items: { type: "object", additionalProperties: true } },
        structuredContent: {},
        isError: { type: "boolean" },
        _meta: { type: "object", additionalProperties: true },
      },
      additionalProperties: false,
    });
    expect(Object.isFrozen(MCP_TOOL_OUTPUT_JSON_SCHEMA)).toBe(true);
  });

  it("validates a stdio server config (command required, env as string record)", () => {
    const config = validateMcpServerConfig({
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { DEBUG: "1" },
      enabled: true,
      isolation: "workspace",
      protocolVersion: "auto",
      timeoutMs: 15000,
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.type).toBe("stdio");
    if (config.type === "stdio") {
      expect(config.command).toBe("node");
      expect(config.args).toEqual(["server.js"]);
    }
  });

  it("validates http and sse server configs (url required, headers and oauth optional)", () => {
    const http = validateMcpServerConfig({
      type: "http",
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer x" },
      oauth: { type: "client_credentials", clientId: "a", clientSecret: "b" },
    });
    expect(http.type).toBe("http");
    const sse = validateMcpServerConfig({ type: "sse", url: "https://s.test" });
    expect(sse.type).toBe("sse");
  });

  it("rejects missing transport discriminants and per-transport required members", () => {
    expect(() => validateMcpServerConfig({})).toThrowError(/type/);
    expect(() =>
      validateMcpServerConfig({ type: "stdio" as never }),
    ).toThrowError(/command/);
    expect(() =>
      validateMcpServerConfig({ type: "http" as never }),
    ).toThrowError(/url/);
    expect(() => validateMcpServerConfig(null)).toThrowError(/must be an object/);
  });

  it("rejects cross-transport fields (url on stdio, command on http) and bad base values", () => {
    expect(() =>
      validateMcpServerConfig({ type: "stdio", command: "node", url: "x" }),
    ).toThrowError(/url/);
    expect(() =>
      validateMcpServerConfig({ type: "http", url: "u", command: "node" }),
    ).toThrowError(/command/);
    expect(() =>
      validateMcpServerConfig({ type: "stdio", command: "node", isolation: "global" as never }),
    ).toThrowError(/isolation/);
    expect(() =>
      validateMcpServerConfig({ type: "stdio", command: "node", timeoutMs: -5 }),
    ).toThrowError(/timeoutMs/);
    expect(() =>
      validateMcpServerConfig({ type: "http", url: "u", oauth: { type: "password" as never } }),
    ).toThrowError(/oauth.type/);
  });

  it("constructs and freezes tool descriptors with annotations", () => {
    const descriptor = mcpToolDescriptor({
      serverName: "fs",
      toolName: "read",
      description: "reads files",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true, idempotentHint: true },
      official: false,
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(descriptor.annotations?.readOnlyHint).toBe(true);
  });

  it("descriptor rejects empty names, non-object schemas and non-boolean hints", () => {
    expect(() => mcpToolDescriptor({ serverName: "", toolName: "x", inputSchema: {} })).toThrowError(
      /serverName/,
    );
    expect(() =>
      mcpToolDescriptor({ serverName: "s", toolName: "t", inputSchema: "nope" }),
    ).toThrowError(/inputSchema/);
    expect(() =>
      mcpToolDescriptor({
        serverName: "s",
        toolName: "t",
        inputSchema: {},
        annotations: { readOnlyHint: "yes" as never },
      }),
    ).toThrowError(/readOnlyHint/);
  });

  it("constructs and freezes tool call results (content blocks stay opaque)", () => {
    const result = mcpToolCallResult({
      content: [{ type: "text", text: "hello" }],
      structuredContent: { value: 1 },
      isError: false,
      _meta: { trace: "t" },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.content[0]).toEqual({ type: "text", text: "hello" });
  });

  it("tool call result rejects empty content arrays and non-object blocks", () => {
    expect(() => mcpToolCallResult({ content: [] })).toThrowError(/content/);
    expect(() => mcpToolCallResult({ content: ["text"] })).toThrowError(/content/);
    expect(() =>
      mcpToolCallResult({ content: [{}], isError: "no" as never }),
    ).toThrowError(/isError/);
  });

  it("constructs and freezes server statuses from the pinned vocabulary", () => {
    const status = mcpServerStatus({
      status: "connected",
      transport: "stdio",
      toolCount: 3,
      updatedAt: "2026-10-17T07:00:00Z",
      protocolEra: "modern",
    });
    expect(Object.isFrozen(status)).toBe(true);
    expect(status.protocolEra).toBe("modern");
  });

  it("server status rejects unknown statuses/transports and negative tool counts", () => {
    expect(() =>
      mcpServerStatus({ status: "paused" as never, transport: "stdio", toolCount: 0, updatedAt: "x" }),
    ).toThrowError(/status/);
    expect(() =>
      mcpServerStatus({ status: "failed", transport: "carrier-pigeon" as never, toolCount: 0, updatedAt: "x" }),
    ).toThrowError(/transport/);
    expect(() =>
      mcpServerStatus({ status: "failed", transport: "sse", toolCount: -1, updatedAt: "x" }),
    ).toThrowError(/toolCount/);
  });

  it("runtime scope guards recognize main and subagent only", () => {
    expect(isMcpRuntimeScope("main")).toBe(true);
    expect(isMcpRuntimeScope("subagent")).toBe(true);
    expect(isMcpRuntimeScope("background")).toBe(false);
  });
});
