/**
 * Runtime ID tests (P3-W3): the substrate's ID prefix law.
 */

import { describe, expect, it } from "vitest";

import {
  RUNTIME_ID_KINDS,
  RUNTIME_ID_PREFIXES,
  formatRuntimeId,
  isRuntimeId,
  isRuntimeIdOfKind,
  parseRuntimeId,
  runtimeIdKindOf,
} from "../src/index.ts";

describe("runtime IDs", () => {
  it("pins the substrate's exact prefix strings for all ten kinds", () => {
    expect(RUNTIME_ID_PREFIXES.session).toBe("sess_");
    expect(RUNTIME_ID_PREFIXES.turn).toBe("turn_");
    expect(RUNTIME_ID_PREFIXES.event).toBe("evt_");
    expect(RUNTIME_ID_PREFIXES.query).toBe("query_");
    expect(RUNTIME_ID_PREFIXES.toolCall).toBe("tool_");
    expect(RUNTIME_ID_PREFIXES.message).toBe("msg_");
    expect(RUNTIME_ID_PREFIXES.part).toBe("part_");
    expect(RUNTIME_ID_PREFIXES.inputHistory).toBe("input_");
    expect(RUNTIME_ID_PREFIXES.project).toBe("proj_");
    expect(RUNTIME_ID_PREFIXES.workspace).toBe("ws_");
    expect(RUNTIME_ID_KINDS.length).toBe(10);
    expect(Object.isFrozen(RUNTIME_ID_PREFIXES)).toBe(true);
    expect(Object.isFrozen(RUNTIME_ID_KINDS)).toBe(true);
  });

  it("formats a kind-prefixed id from an explicit suffix (no randomness)", () => {
    expect(formatRuntimeId("session", "abc123")).toBe("sess_abc123");
    expect(formatRuntimeId("toolCall", "42")).toBe("tool_42");
    expect(formatRuntimeId("workspace", "root")).toBe("ws_root");
  });

  it("rejects unknown kinds, empty and whitespace suffixes", () => {
    expect(() => formatRuntimeId("nosuch" as never, "x")).toThrowError(/kind/);
    expect(() => formatRuntimeId("session", "")).toThrowError(/suffix/);
    expect(() => formatRuntimeId("session", "a b")).toThrowError(/whitespace/);
  });

  it("detects the kind of a prefixed id", () => {
    expect(runtimeIdKindOf("sess_1")).toBe("session");
    expect(runtimeIdKindOf("turn_9")).toBe("turn");
    expect(runtimeIdKindOf("evt_x")).toBe("event");
    expect(runtimeIdKindOf("tool_7")).toBe("toolCall");
    expect(runtimeIdKindOf("msg_m")).toBe("message");
    expect(runtimeIdKindOf("random-string")).toBeUndefined();
    expect(runtimeIdKindOf("")).toBeUndefined();
  });

  it("guards recognize prefixed ids per kind", () => {
    expect(isRuntimeId("sess_1")).toBe(true);
    expect(isRuntimeId("plain")).toBe(false);
    expect(isRuntimeId(123)).toBe(false);
    expect(isRuntimeIdOfKind("turn_5", "turn")).toBe(true);
    expect(isRuntimeIdOfKind("turn_5", "session")).toBe(false);
    expect(isRuntimeIdOfKind("part_1", "part")).toBe(true);
    expect(isRuntimeIdOfKind("input_9", "inputHistory")).toBe(true);
  });

  it("parses a runtime id into frozen kind/prefix/suffix parts", () => {
    const parts = parseRuntimeId("tool_abc-123");
    expect(Object.isFrozen(parts)).toBe(true);
    expect(parts.kind).toBe("toolCall");
    expect(parts.prefix).toBe("tool_");
    expect(parts.suffix).toBe("abc-123");
  });

  it("parse rejects unprefixed values and empty/whitespace suffixes", () => {
    expect(() => parseRuntimeId("nope")).toThrowError(/prefix/);
    expect(() => parseRuntimeId("sess_")).toThrowError(/suffix/);
    expect(() => parseRuntimeId("sess_a b")).toThrowError(/whitespace/);
  });
});
