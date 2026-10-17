/**
 * Tool registry surface tests (P3-W3): metadata law, entry law, the
 * toContracts projection, and the snapshot name-conflict law.
 */

import { describe, expect, it } from "vitest";

import {
  TOOL_EXECUTION_MODES,
  TOOL_RISK_LEVELS,
  TOOL_SIDE_EFFECT_SCOPES,
  isToolExecutionMode,
  isToolRiskLevel,
  isToolSideEffectScope,
  projectToolContracts,
  toolMetadata,
  toolRegistryEntry,
  toolRegistrySnapshot,
} from "../src/index.ts";

const VALID_METADATA = {
  name: "Read",
  description: "Reads a file from the working directory",
  readOnly: true,
  destructive: false,
  concurrentSafe: true,
  riskLevel: "low",
  needsApproval: false,
  sideEffectScope: "none",
};

const VALID_ENTRY = {
  name: "Read",
  capability: "files.read",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  metadata: VALID_METADATA,
};

describe("tool registry surface", () => {
  it("pins the risk-level, side-effect-scope and execution-mode vocabularies", () => {
    expect([...TOOL_RISK_LEVELS]).toEqual(["low", "medium", "high", "critical"]);
    expect([...TOOL_SIDE_EFFECT_SCOPES]).toEqual([
      "none",
      "workspace",
      "git",
      "network",
      "system",
      "session",
      "userInteraction",
    ]);
    expect([...TOOL_EXECUTION_MODES]).toEqual(["client", "providerNative"]);
    expect(Object.isFrozen(TOOL_RISK_LEVELS)).toBe(true);
  });

  it("guards recognize vocabulary members and reject outsiders", () => {
    expect(isToolRiskLevel("low")).toBe(true);
    expect(isToolRiskLevel("extreme")).toBe(false);
    expect(isToolSideEffectScope("git")).toBe(true);
    expect(isToolSideEffectScope("wallet")).toBe(false);
    expect(isToolExecutionMode("client")).toBe(true);
    expect(isToolExecutionMode("cloud")).toBe(false);
    expect(isToolExecutionMode(9)).toBe(false);
  });

  it("constructs and freezes valid metadata (with optional timeout and MCP presentation)", () => {
    const metadata = toolMetadata({
      ...VALID_METADATA,
      timeoutMs: 5000,
      mcpPresentation: { serverName: "fs", toolName: "read", official: true },
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(metadata.timeoutMs).toBe(5000);
    expect(metadata.mcpPresentation?.official).toBe(true);
  });

  it("metadata rejects wrong-typed flags and out-of-vocabulary values with all issues listed", () => {
    expect(() => toolMetadata({ ...VALID_METADATA, readOnly: "yes" })).toThrowError(
      /readOnly/,
    );
    expect(() => toolMetadata({ ...VALID_METADATA, riskLevel: "mega" })).toThrowError(
      /riskLevel/,
    );
    expect(() => toolMetadata({ ...VALID_METADATA, sideEffectScope: "bank" })).toThrowError(
      /sideEffectScope/,
    );
    expect(() =>
      toolMetadata({ ...VALID_METADATA, timeoutMs: -1 }),
    ).toThrowError(/timeoutMs/);
    expect(() => toolMetadata(null)).toThrowError(/must be an object/);
  });

  it("constructs and freezes a valid registry entry with aliases", () => {
    const entry = toolRegistryEntry({
      ...VALID_ENTRY,
      aliases: ["Cat", "Show"],
      executionMode: "client",
    });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(entry.aliases).toEqual(["Cat", "Show"]);
    expect(entry.inputSchema).toEqual({ type: "object" });
  });

  it("entry rejects metadata whose name disagrees with the canonical name", () => {
    expect(() =>
      toolRegistryEntry({
        ...VALID_ENTRY,
        metadata: { ...VALID_METADATA, name: "Different" },
      }),
    ).toThrowError(/metadata.name/);
  });

  it("entry rejects duplicated aliases and the canonical name among aliases", () => {
    expect(() =>
      toolRegistryEntry({ ...VALID_ENTRY, aliases: ["A", "A"] }),
    ).toThrowError(/must not repeat/);
    expect(() =>
      toolRegistryEntry({ ...VALID_ENTRY, aliases: ["Read"] }),
    ).toThrowError(/canonical name/);
  });

  it("entry rejects non-object schemas and out-of-vocabulary execution modes", () => {
    expect(() =>
      toolRegistryEntry({ ...VALID_ENTRY, inputSchema: "not-an-object" }),
    ).toThrowError(/inputSchema/);
    expect(() =>
      toolRegistryEntry({ ...VALID_ENTRY, executionMode: "quantum" }),
    ).toThrowError(/executionMode/);
  });

  it("projects one model-facing contract per model-visible name (canonical first, then aliases)", () => {
    const entry = toolRegistryEntry({ ...VALID_ENTRY, aliases: ["Cat", "Show"] });
    const contracts = projectToolContracts(entry);
    expect(contracts.map((contract) => contract.name)).toEqual(["Read", "Cat", "Show"]);
    expect(Object.isFrozen(contracts)).toBe(true);
    expect(contracts[0]?.description).toBe(VALID_METADATA.description);
    expect(contracts[0]?.readOnly).toBe(true);
    expect(contracts[0]?.sideEffectScope).toBe("none");
    expect(contracts[0]?.capability).toBe("files.read");
    expect("execute" in (contracts[0] ?? {})).toBe(false);
  });

  it("the projection re-validates raw input (defensive on untrusted entries)", () => {
    expect(() =>
      projectToolContracts({ ...VALID_ENTRY, name: "" } as never),
    ).toThrowError(/name/);
  });

  it("snapshots assemble with canonical-name priority and the full model-visible index", () => {
    const snapshot = toolRegistrySnapshot([
      VALID_ENTRY,
      {
        ...VALID_ENTRY,
        name: "Write",
        aliases: ["Save"],
        metadata: { ...VALID_METADATA, name: "Write", readOnly: false, destructive: true },
      },
    ]);
    expect(snapshot.entries.length).toBe(2);
    expect(snapshot.modelVisibleNames).toEqual(["Read", "Write", "Save"]);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("snapshots reject a conflicting alias across entries (name-conflict law)", () => {
    expect(() =>
      toolRegistrySnapshot([
        VALID_ENTRY,
        {
          ...VALID_ENTRY,
          name: "Write",
          aliases: ["Read"],
          metadata: { ...VALID_METADATA, name: "Write" },
        },
      ]),
    ).toThrowError(/conflicts between/);
  });

  it("snapshots reject duplicate canonical names", () => {
    expect(() => toolRegistrySnapshot([VALID_ENTRY, VALID_ENTRY])).toThrowError(
      /conflicts between/,
    );
  });

  it("snapshots reject non-array input", () => {
    expect(() => toolRegistrySnapshot("entries" as never)).toThrowError(/entries/);
  });
});
