/**
 * MCP naming and registration policy tests (P3-W3): the exact substrate
 * naming rule (`mcp__<sanitized-server>__<sanitized-tool>`).
 */

import { describe, expect, it } from "vitest";

import {
  MCP_TOOL_NAME_FALLBACK,
  MCP_TOOL_NAME_PREFIX,
  MCP_TOOL_NAME_SEPARATOR,
  admitsMcpTool,
  mcpToolRegistrationPolicy,
  parseMcpToolName,
  toModelVisibleMcpNamePart,
  toMcpToolName,
} from "../src/index.ts";

describe("MCP naming law", () => {
  it("pins the naming constants", () => {
    expect(MCP_TOOL_NAME_PREFIX).toBe("mcp__");
    expect(MCP_TOOL_NAME_SEPARATOR).toBe("__");
    expect(MCP_TOOL_NAME_FALLBACK).toBe("unknown");
  });

  it("sanitizes name parts exactly like the substrate (non-[a-zA-Z0-9_-] -> _, runs collapse)", () => {
    expect(toModelVisibleMcpNamePart("example-server")).toBe("example-server");
    expect(toModelVisibleMcpNamePart("my server!")).toBe("my_server_");
    expect(toModelVisibleMcpNamePart("a..b!!c")).toBe("a_b_c");
    expect(toModelVisibleMcpNamePart(" ünïcode ")).toBe("_n_code_");
    expect(toModelVisibleMcpNamePart("")).toBe("unknown");
    expect(toModelVisibleMcpNamePart("///")).toBe("_");
  });

  it("builds the model-visible name from server and tool parts", () => {
    expect(
      toMcpToolName({ serverName: "filesystem", toolName: "read_file" }),
    ).toBe("mcp__filesystem__read_file");
    expect(toMcpToolName({ serverName: "My Server", toolName: "search!" })).toBe(
      "mcp__My_Server__search_",
    );
  });

  it("prefers the descriptor's explicit name when present", () => {
    expect(
      toMcpToolName({ serverName: "s", toolName: "t", name: "custom_name" }),
    ).toBe("custom_name");
  });

  it("parses a model-visible name back into its parts", () => {
    const parts = parseMcpToolName("mcp__filesystem__read_file");
    expect(Object.isFrozen(parts)).toBe(true);
    expect(parts.serverName).toBe("filesystem");
    expect(parts.toolName).toBe("read_file");
  });

  it("parse rejects values without the prefix or the separator", () => {
    expect(() => parseMcpToolName("")).toThrowError(/non-empty/);
    expect(() => parseMcpToolName("filesystem__read")).toThrowError(/prefix/);
    expect(() => parseMcpToolName("mcp__nofull")).toThrowError(/separate/);
    expect(() => parseMcpToolName("mcp___trailing")).toThrowError(/separate/);
  });

  it("registration policies validate allow/deny lists", () => {
    const policy = mcpToolRegistrationPolicy({
      allowedTools: ["mcp__a__b"],
      disallowedTools: ["mcp__c__d"],
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(() =>
      mcpToolRegistrationPolicy({ allowedTools: [] }),
    ).toThrowError(/allowedTools/);
    expect(() =>
      mcpToolRegistrationPolicy({ disallowedTools: "x" as never }),
    ).toThrowError(/disallowedTools/);
    expect(mcpToolRegistrationPolicy({})).toEqual({});
  });

  it("admission: deny wins; allow-list gates; no lists admits everything", () => {
    const descriptor = { serverName: "fs", toolName: "read" };
    expect(admitsMcpTool({}, descriptor)).toBe(true);
    expect(
      admitsMcpTool({ disallowedTools: ["mcp__fs__read"] }, descriptor),
    ).toBe(false);
    expect(admitsMcpTool({ allowedTools: ["mcp__fs__read"] }, descriptor)).toBe(true);
    expect(admitsMcpTool({ allowedTools: ["mcp__other__x"] }, descriptor)).toBe(false);
    expect(
      admitsMcpTool(
        { allowedTools: ["mcp__fs__read"], disallowedTools: ["mcp__fs__read"] },
        descriptor,
      ),
    ).toBe(false);
  });

  it("admission honors the explicit descriptor name alongside the generated one", () => {
    const descriptor = { serverName: "fs", toolName: "read", name: "custom" };
    expect(admitsMcpTool({ allowedTools: ["custom"] }, descriptor)).toBe(true);
    expect(admitsMcpTool({ allowedTools: ["mcp__fs__read"] }, descriptor)).toBe(true);
    expect(admitsMcpTool({ allowedTools: ["mcp__x__y"] }, descriptor)).toBe(false);
    expect(admitsMcpTool({ disallowedTools: ["custom"] }, descriptor)).toBe(false);
    expect(
      admitsMcpTool({ disallowedTools: ["mcp__fs__read"] }, descriptor),
    ).toBe(false);
  });
});

function parseMcpName(candidate: string, _context: string): ReturnType<typeof parseMcpToolName> {
  return parseMcpToolName(candidate);
}
