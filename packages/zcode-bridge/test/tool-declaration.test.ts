/**
 * Tool declaration surface tests (P3-W3): the declaration law with the
 * APPLICATION authority-domain adaptation at its core.
 */

import { describe, expect, it } from "vitest";

import {
  TOOL_JSON_SCHEMA_DIALECT,
  TOOL_PERMISSION_PATTERN_SOURCES,
  toolCancellationPolicy,
  toolContractDeclaration,
  toolPermissionSpec,
  toolResultBudget,
  toolTimeoutPolicy,
  toolTracePolicy,
} from "../src/index.ts";

const VALID_PERMISSION = {
  permission: "fs_read",
  reason: "reading workspace files",
  riskLevel: "low",
  sideEffectScope: "none",
  needsApproval: false,
  patternSources: ["toolName"],
  denyPriority: "beforeAsk",
  authorityDomain: "APPLICATION",
};

const VALID_DECLARATION = {
  capability: "files.read",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  permission: VALID_PERMISSION,
  resultBudget: {
    maxInlineBytes: 4096,
    maxModelBytes: 2048,
    strategy: "inline",
  },
  timeout: { kind: "timed", defaultMs: 10000, allowCallOverride: true },
  cancellation: { supported: true, cleanup: "bestEffort", userVisibleMessage: "Stopped" },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

describe("tool declaration surface", () => {
  it("pins the canonical JSON-Schema dialect and pattern-source vocabulary", () => {
    expect(TOOL_JSON_SCHEMA_DIALECT).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect([...TOOL_PERMISSION_PATTERN_SOURCES]).toEqual([
      "none",
      "toolName",
      "input",
      "path",
      "command",
      "network",
      "custom",
    ]);
  });

  it("constructs and freezes a valid permission spec, re-stamping APPLICATION", () => {
    const spec = toolPermissionSpec({
      ...VALID_PERMISSION,
      alwaysAsk: true,
      askOptions: { allowAlways: "session" },
      alwaysAllowPatternSources: ["input"],
    });
    expect(Object.isFrozen(spec)).toBe(true);
    expect(spec.authorityDomain).toBe("APPLICATION");
    expect(spec.alwaysAsk).toBe(true);
    expect(spec.askOptions?.allowAlways).toBe("session");
  });

  it("rejects a permission spec that claims any other authority domain", () => {
    expect(() =>
      toolPermissionSpec({ ...VALID_PERMISSION, authorityDomain: "FINANCIAL" }),
    ).toThrowError(/APPLICATION/);
    expect(() =>
      toolPermissionSpec({ ...VALID_PERMISSION, authorityDomain: undefined }),
    ).toThrowError(/APPLICATION/);
  });

  it("rejects out-of-vocabulary risk levels, scopes, deny priorities and pattern sources", () => {
    expect(() =>
      toolPermissionSpec({ ...VALID_PERMISSION, riskLevel: "apocalyptic" }),
    ).toThrowError(/riskLevel/);
    expect(() =>
      toolPermissionSpec({ ...VALID_PERMISSION, sideEffectScope: "ledger" }),
    ).toThrowError(/sideEffectScope/);
    expect(() =>
      toolPermissionSpec({ ...VALID_PERMISSION, denyPriority: "whenever" }),
    ).toThrowError(/denyPriority/);
    expect(() =>
      toolPermissionSpec({ ...VALID_PERMISSION, patternSources: ["vibes"] }),
    ).toThrowError(/patternSources/);
  });

  it("rejects non-true alwaysAsk and malformed askOptions", () => {
    expect(() =>
      toolPermissionSpec({ ...VALID_PERMISSION, alwaysAsk: false as never }),
    ).toThrowError(/alwaysAsk/);
    expect(() =>
      toolPermissionSpec({
        ...VALID_PERMISSION,
        askOptions: { allowAlways: "forever" as never },
      }),
    ).toThrowError(/askOptions/);
  });

  it("constructs and freezes valid result budgets with preview and artifact policies", () => {
    const budget = toolResultBudget({
      maxInlineBytes: 1000,
      maxModelBytes: 500,
      strategy: "truncate",
      preview: { maxBytes: 200, maxLines: 20, direction: "tail" },
      artifact: { enabled: true, retention: "session" },
    });
    expect(Object.isFrozen(budget)).toBe(true);
    expect(budget.preview?.direction).toBe("tail");
    expect(budget.artifact?.retention).toBe("session");
  });

  it("rejects negative budgets, unknown strategies and bad retention", () => {
    expect(() =>
      toolResultBudget({ maxInlineBytes: -1, maxModelBytes: 0, strategy: "inline" }),
    ).toThrowError(/maxInlineBytes/);
    expect(() =>
      toolResultBudget({ maxInlineBytes: 1, maxModelBytes: 1, strategy: "explode" }),
    ).toThrowError(/strategy/);
    expect(() =>
      toolResultBudget({
        maxInlineBytes: 1,
        maxModelBytes: 1,
        strategy: "artifact",
        artifact: { enabled: true, retention: "forever" as never },
      }),
    ).toThrowError(/retention/);
  });

  it("timeout policy handles both arms and rejects maxMs below defaultMs", () => {
    expect(toolTimeoutPolicy({ kind: "none" })).toEqual({ kind: "none" });
    const timed = toolTimeoutPolicy({
      kind: "timed",
      defaultMs: 100,
      maxMs: 500,
      allowCallOverride: false,
      cleanupGraceMs: 50,
    });
    expect(Object.isFrozen(timed)).toBe(true);
    expect(() =>
      toolTimeoutPolicy({ kind: "timed", defaultMs: 500, maxMs: 100, allowCallOverride: true }),
    ).toThrowError(/maxMs/);
    expect(() =>
      toolTimeoutPolicy({ kind: "timed", defaultMs: 0, allowCallOverride: true }),
    ).toThrowError(/defaultMs/);
    expect(() => toolTimeoutPolicy({ kind: "sometimes" })).toThrowError(/kind|defaultMs/);
  });

  it("cancellation policy requires the cleanup vocabulary and a user-visible message", () => {
    expect(() =>
      toolCancellationPolicy({ supported: true, cleanup: "maybe", userVisibleMessage: "x" }),
    ).toThrowError(/cleanup/);
    expect(() =>
      toolCancellationPolicy({ supported: true, cleanup: "required", userVisibleMessage: "" }),
    ).toThrowError(/userVisibleMessage/);
  });

  it("trace policy requires the literal true and the record-level vocabulary", () => {
    expect(() =>
      toolTracePolicy({
        required: false as never,
        propagateToAdapters: true,
        recordInput: "summary",
        recordOutput: "none",
      }),
    ).toThrowError(/required/);
    expect(() =>
      toolTracePolicy({
        required: true,
        propagateToAdapters: true,
        recordInput: "sometimes",
        recordOutput: "none",
      }),
    ).toThrowError(/recordInput/);
  });

  it("constructs and freezes the full declaration, preserving optional flags", () => {
    const declaration = toolContractDeclaration({
      ...VALID_DECLARATION,
      strict: true,
      requiresUserInteraction: false,
      executionMode: "client",
    });
    expect(Object.isFrozen(declaration)).toBe(true);
    expect(declaration.strict).toBe(true);
    expect(declaration.permission.authorityDomain).toBe("APPLICATION");
    expect(declaration.timeout.kind).toBe("timed");
  });

  it("rejects a declaration whose permission spec claims a financial domain", () => {
    expect(() =>
      toolContractDeclaration({
        ...VALID_DECLARATION,
        permission: { ...VALID_PERMISSION, authorityDomain: "FINANCIAL" },
      }),
    ).toThrowError(/permission/);
  });

  it("rejects non-object schemas and lists every missing policy", () => {
    expect(() =>
      toolContractDeclaration({ ...VALID_DECLARATION, outputSchema: 7 }),
    ).toThrowError(/outputSchema/);
    const { permission: _p, ...withoutPermission } = VALID_DECLARATION;
    expect(() => toolContractDeclaration(withoutPermission)).toThrowError(/permission/);
  });
});
