/**
 * Smoke tests (P3-W3): the public surface end-to-end — identity, export
 * count, frozen-data discipline, and cross-surface validation round-trips.
 */

import { describe, expect, it } from "vitest";

import * as index from "../src/index.ts";

describe("bridge smoke", () => {
  it("exposes the package identity and version", () => {
    expect(index.PACKAGE_NAME).toBe("@payswap/zcode-bridge");
    expect(index.ZCODE_BRIDGE_VERSION).toBe("1.0.0");
  });

  it("exposes a runtime surface of at least the prior-art count (81), all frozen data", () => {
    const keys = Object.keys(index);
    expect(keys.length).toBeGreaterThanOrEqual(81);
    const dataExports = keys.filter((key) => {
      const value: unknown = (index as Record<string, unknown>)[key];
      return typeof value === "object" && value !== null;
    });
    for (const key of dataExports) {
      expect(Object.isFrozen((index as Record<string, unknown>)[key])).toBe(true);
    }
  });

  it("every surface observation record is frozen and SUBSTRATE-stamped", () => {
    for (const surface of index.ZCODE_BRIDGE_SURFACES) {
      expect(Object.isFrozen(surface)).toBe(true);
      expect(surface.authority.financialAuthority).toBe(false);
      expect(surface.substratePin).toBe(index.SUBSTRATE_PIN);
    }
  });

  it("a full validation round-trip across surfaces produces frozen records", () => {
    const entry = index.toolRegistryEntry({
      name: "Read",
      capability: "files.read",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      metadata: {
        name: "Read",
        description: "reads files",
        readOnly: true,
        destructive: false,
        concurrentSafe: true,
        riskLevel: "low",
        needsApproval: false,
        sideEffectScope: "none",
      },
    });
    const contracts = index.projectToolContracts(entry);
    expect(contracts.length).toBe(1);
    const selection = index.parseModelSelection("zai/glm-4.7$high");
    expect(index.formatModelSelection(selection)).toBe("zai/glm-4.7$high");
    const parts = index.parseMcpToolName(
      index.toMcpToolName({ serverName: "filesystem", toolName: "read_file" }),
    );
    expect(parts).toEqual({ serverName: "filesystem", toolName: "read_file" });
    const event = index.sessionEvent({
      id: "evt_1",
      sessionId: "sess_1",
      type: "subagent_spawned",
      timestamp: "2026-10-17T08:00:00Z",
      traceId: "trace_1",
      sequenceNumber: 1,
      payload: null,
    });
    expect(index.sessionEventFamilyOf(event.type)).toBe("history_and_lifecycle");
    expect(
      index.decodeRpcFrameHeader(index.encodeRpcFrameHeader({ type: 1, id: 1, ack: 0, length: 0 })),
    ).toEqual({ type: 1, id: 1, ack: 0, length: 0 });
  });

  it("the never-authorizes discipline holds on the whole vocabulary surface", () => {
    // No frozen capability claim in the inventory may carry financial
    // authority semantics (the lint enforces this at construction; the
    // assertion keeps it true forever).
    for (const surface of index.ZCODE_BRIDGE_SURFACES) {
      for (const capability of surface.capabilities) {
        expect(index.findFinancialAuthorityTerms(capability)).toEqual([]);
      }
    }
  });

  it("the MCP output wire schema and JSON-Schema dialect pins are frozen strings/data", () => {
    expect(Object.isFrozen(index.MCP_TOOL_OUTPUT_JSON_SCHEMA)).toBe(true);
    expect(index.TOOL_JSON_SCHEMA_DIALECT).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
  });
});
