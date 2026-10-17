/**
 * Model-facing tool wire surface tests (P3-W3).
 */

import { describe, expect, it } from "vitest";

import {
  MODEL_CONTENT_BLOCK_KINDS,
  MODEL_MESSAGE_ROLES,
  MODEL_STREAM_EVENT_KINDS,
  MODEL_TOOL_CHOICE_KINDS,
  isModelContentBlockKind,
  isModelMessageRole,
  isModelStreamEventKind,
  isModelToolChoice,
  modelToolCall,
  modelToolContract,
  modelToolResult,
} from "../src/index.ts";

describe("model-facing tool wire surface", () => {
  it("pins the message-role, content-block and stream-event vocabularies", () => {
    expect([...MODEL_MESSAGE_ROLES]).toEqual(["system", "user", "assistant", "tool"]);
    expect([...MODEL_CONTENT_BLOCK_KINDS]).toEqual([
      "text",
      "reasoning",
      "image",
      "video",
      "file",
      "resource_link",
    ]);
    expect(MODEL_STREAM_EVENT_KINDS.length).toBe(14);
    expect(MODEL_STREAM_EVENT_KINDS).toContain("tool_call");
    expect(MODEL_STREAM_EVENT_KINDS).toContain("compact_stream_boundary");
    expect(Object.isFrozen(MODEL_STREAM_EVENT_KINDS)).toBe(true);
  });

  it("guards recognize vocabulary members", () => {
    expect(isModelMessageRole("tool")).toBe(true);
    expect(isModelMessageRole("robot")).toBe(false);
    expect(isModelContentBlockKind("resource_link")).toBe(true);
    expect(isModelContentBlockKind("audio")).toBe(false);
    expect(isModelStreamEventKind("text_delta")).toBe(true);
    expect(isModelStreamEventKind("text_middle")).toBe(false);
  });

  it("tool choice recognizes the literal and named-tool forms", () => {
    expect([...MODEL_TOOL_CHOICE_KINDS]).toEqual(["auto", "none", "required"]);
    expect(isModelToolChoice("auto")).toBe(true);
    expect(isModelToolChoice("sometimes")).toBe(false);
    expect(isModelToolChoice({ type: "tool", toolName: "Read" })).toBe(true);
    expect(isModelToolChoice({ type: "tool" })).toBe(false);
    expect(isModelToolChoice({ type: "other", toolName: "Read" })).toBe(false);
    expect(isModelToolChoice(42)).toBe(false);
  });

  it("constructs and freezes a tool call (the tool_use round-trip)", () => {
    const call = modelToolCall({
      id: "tool_1",
      name: "Read",
      input: { path: "a.ts" },
      providerExecuted: true,
    });
    expect(Object.isFrozen(call)).toBe(true);
    expect(call.input).toEqual({ path: "a.ts" });
    expect(call.providerExecuted).toBe(true);
  });

  it("tool call rejects empty ids and names and non-boolean flags", () => {
    expect(() => modelToolCall({ id: "", name: "Read", input: null })).toThrowError(
      /id/,
    );
    expect(() => modelToolCall({ id: "1", name: "", input: null })).toThrowError(
      /name/,
    );
    expect(() =>
      modelToolCall({ id: "1", name: "Read", input: null, providerExecuted: "yes" as never }),
    ).toThrowError(/providerExecuted/);
  });

  it("constructs and freezes a tool result with provider metadata", () => {
    const result = modelToolResult({
      id: "tool_1",
      name: "Read",
      input: { path: "a.ts" },
      output: "file text",
      providerMetadata: { latencyMs: 12 },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.providerMetadata).toEqual({ latencyMs: 12 });
  });

  it("tool result rejects non-object provider metadata", () => {
    expect(() =>
      modelToolResult({
        id: "1",
        name: "Read",
        input: null,
        output: null,
        providerMetadata: "nope",
      }),
    ).toThrowError(/providerMetadata/);
  });

  it("constructs and freezes a model tool contract WITHOUT any execute member", () => {
    const contract = modelToolContract({
      name: "Read",
      description: "Reads files",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      readOnly: true,
      destructive: false,
      needsApproval: false,
      sideEffectScope: "none",
      timeoutMs: 5000,
    });
    expect(Object.isFrozen(contract)).toBe(true);
    expect("execute" in contract).toBe(false);
    expect(contract.readOnly).toBe(true);
  });

  it("contract rejects out-of-vocabulary side-effect scopes and bad flags", () => {
    expect(() =>
      modelToolContract({
        name: "Read",
        inputSchema: {},
        sideEffectScope: "wallet" as never,
      }),
    ).toThrowError(/sideEffectScope/);
    expect(() =>
      modelToolContract({ name: "Read", inputSchema: {}, readOnly: 1 as never }),
    ).toThrowError(/readOnly/);
    expect(() => modelToolContract({ name: "", inputSchema: {} })).toThrowError(/name/);
    expect(() => modelToolContract({ name: "x", inputSchema: [] })).toThrowError(
      /inputSchema/,
    );
  });
});
