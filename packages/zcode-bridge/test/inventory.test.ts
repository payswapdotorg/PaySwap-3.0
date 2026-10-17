/**
 * Inventory tests (P3-W3): the 13-surface inventory law, classification
 * counts, and every source path VERIFIED ON DISK in this worktree (the
 * evidence source is the current repo's own ZCode substrate).
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MODEL_SELECTION_SURFACE,
  MODEL_TOOL_WIRE_SURFACE,
  MCP_PORT_SURFACE,
  MCP_REGISTRY_SURFACE,
  RPC_WIRE_SURFACE,
  SESSION_EVENTS_SURFACE,
  SESSION_PORT_SURFACE,
  SKILLS_SURFACE,
  SUBAGENTS_SURFACE,
  TOOL_DECLARATION_SURFACE,
  TOOL_REGISTRY_SURFACE,
  WORKFLOW_ENGINE_SURFACE,
  WORKFLOW_RUNTIME_SURFACE,
  ZCODE_BRIDGE_SURFACE_COUNT,
  ZCODE_BRIDGE_SURFACES,
  zcodeBridgeInventoryLaw,
  zcodeBridgeSurfaceById,
  zcodeBridgeSurfacesByClassification,
} from "../src/index.ts";

const REPO_ROOT = join(process.cwd(), "..", "..");

describe("the 13-surface inventory", () => {
  it("carries exactly 13 bridged surfaces and the inventory law holds", () => {
    expect(ZCODE_BRIDGE_SURFACE_COUNT).toBe(13);
    expect(ZCODE_BRIDGE_SURFACES.length).toBe(13);
    expect(zcodeBridgeInventoryLaw()).toBe(13);
  });

  it("classifies 9 KEEP and 4 KEEP_WITH_ADAPTATIONS per the migration map", () => {
    expect(zcodeBridgeSurfacesByClassification("KEEP").length).toBe(9);
    expect(zcodeBridgeSurfacesByClassification("KEEP_WITH_ADAPTATIONS").length).toBe(4);
  });

  it("every surface is frozen, unique, SUBSTRATE-stamped and source-pathed", () => {
    const ids = new Set<string>();
    for (const surface of ZCODE_BRIDGE_SURFACES) {
      expect(Object.isFrozen(surface)).toBe(true);
      expect(ids.has(surface.surfaceId)).toBe(false);
      ids.add(surface.surfaceId);
      expect(surface.authority.domain).toBe("SUBSTRATE");
      expect(surface.authority.financialAuthority).toBe(false);
      expect(surface.sourcePaths.length).toBeGreaterThanOrEqual(1);
      if (surface.classification === "KEEP_WITH_ADAPTATIONS") {
        expect(surface.adaptationNotes.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("every source path of every surface EXISTS ON DISK in this worktree", () => {
    for (const surface of ZCODE_BRIDGE_SURFACES) {
      for (const path of surface.sourcePaths) {
        const full = join(REPO_ROOT, path);
        expect(
          statSync(full).isFile(),
          `${surface.surfaceId}: source path missing on disk: ${path}`,
        ).toBe(true);
      }
    }
  });

  it("the expected 13 mission surfaces are present by id", () => {
    const expected = [
      "tool-registry",
      "tool-declaration",
      "model-tool-wire",
      "mcp-port",
      "mcp-registry",
      "skills",
      "session-events",
      "session-port",
      "subagents",
      "model-selection",
      "workflow-engine",
      "workflow-runtime",
      "rpc-wire",
    ] as const;
    for (const id of expected) {
      expect(zcodeBridgeSurfaceById(id), `missing surface: ${id}`).toBeDefined();
    }
  });

  it("the four adapted surfaces are the ones the migration map adapts", () => {
    const adapted = zcodeBridgeSurfacesByClassification("KEEP_WITH_ADAPTATIONS");
    expect(adapted.map((surface) => surface.surfaceId).sort()).toEqual(
      ["session-port", "subagents", "tool-declaration", "workflow-engine"].sort(),
    );
  });

  it("surface lookups resolve the pinned observation records", () => {
    expect(zcodeBridgeSurfaceById("tool-registry")).toBe(TOOL_REGISTRY_SURFACE);
    expect(zcodeBridgeSurfaceById("tool-declaration")).toBe(TOOL_DECLARATION_SURFACE);
    expect(zcodeBridgeSurfaceById("model-tool-wire")).toBe(MODEL_TOOL_WIRE_SURFACE);
    expect(zcodeBridgeSurfaceById("mcp-port")).toBe(MCP_PORT_SURFACE);
    expect(zcodeBridgeSurfaceById("mcp-registry")).toBe(MCP_REGISTRY_SURFACE);
    expect(zcodeBridgeSurfaceById("skills")).toBe(SKILLS_SURFACE);
    expect(zcodeBridgeSurfaceById("session-events")).toBe(SESSION_EVENTS_SURFACE);
    expect(zcodeBridgeSurfaceById("session-port")).toBe(SESSION_PORT_SURFACE);
    expect(zcodeBridgeSurfaceById("subagents")).toBe(SUBAGENTS_SURFACE);
    expect(zcodeBridgeSurfaceById("model-selection")).toBe(MODEL_SELECTION_SURFACE);
    expect(zcodeBridgeSurfaceById("workflow-engine")).toBe(WORKFLOW_ENGINE_SURFACE);
    expect(zcodeBridgeSurfaceById("workflow-runtime")).toBe(WORKFLOW_RUNTIME_SURFACE);
    expect(zcodeBridgeSurfaceById("rpc-wire")).toBe(RPC_WIRE_SURFACE);
    expect(zcodeBridgeSurfaceById("no-such-surface")).toBeUndefined();
  });

  it("the total on-disk source-path set matches the verified 25-file inventory", () => {
    const all = new Set<string>();
    for (const surface of ZCODE_BRIDGE_SURFACES) {
      for (const path of surface.sourcePaths) all.add(path);
    }
    expect(all.size).toBe(25);
  });
});
