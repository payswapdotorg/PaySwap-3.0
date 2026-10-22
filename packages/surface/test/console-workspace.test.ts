/**
 * Console workspace IA tests (P10-A): the §2 eight-section contract,
 * the console sub-route law (pure, total, never throws), the document
 * title helper (§1), and the section empty-state reason vocabulary.
 * The §2 table is pinned BYTE-EXACT against the contract document
 * itself (spec/surface/CONSOLE-WORKSPACE.md is parsed and compared).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONSOLE_ADVANCED_LABEL,
  CONSOLE_ADVANCED_ROUTE,
  CONSOLE_ROOT_TITLE,
  CONSOLE_SECTION_EMPTY_STATES,
  CONSOLE_SECTION_IDS,
  CONSOLE_TITLE_SUFFIX,
  WORKSPACE_SECTIONS,
  consoleDocumentTitle,
  consoleSectionById,
  consoleSectionEmptyState,
  resolveConsoleSection,
} from "../src/index.ts";

const ROOT = process.cwd();
const CONTRACT_DOC = join(ROOT, "..", "..", "spec", "surface", "CONSOLE-WORKSPACE.md");

/** Parse §2's table rows out of the contract document (id, title, purpose). */
function contractSectionTable(): Array<{ id: string; title: string; purpose: string }> {
  const text = readFileSync(CONTRACT_DOC, "utf8");
  const section2 = text.split("## 2.")[1]?.split("## 3.")[0] ?? "";
  const rows: Array<{ id: string; title: string; purpose: string }> = [];
  for (const match of section2.matchAll(/^\| `([a-z]+)` \| (.+?) \| (.+?) \|$/gm)) {
    rows.push({ id: match[1] ?? "", title: match[2] ?? "", purpose: match[3] ?? "" });
  }
  return rows;
}

describe("workspace IA (§2)", () => {
  it("has exactly the eight sections, in §2 order, byte-exact against the contract document", () => {
    const docRows = contractSectionTable();
    expect(docRows).toHaveLength(8);
    expect(WORKSPACE_SECTIONS).toHaveLength(8);
    expect(CONSOLE_SECTION_IDS).toEqual(docRows.map((row) => row.id));
    for (const [index, row] of docRows.entries()) {
      const section = WORKSPACE_SECTIONS[index];
      expect(section, `missing section at index ${index}`).toBeDefined();
      if (section === undefined) continue;
      expect(section.id).toBe(row.id);
      expect(section.title).toBe(row.title);
      expect(section.purpose).toBe(row.purpose);
      expect(section.route).toBe(`/console/${row.id}`);
    }
  });

  it("titles/purposes are non-empty people language and every section cites its law", () => {
    for (const section of WORKSPACE_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.purpose.length).toBeGreaterThan(0);
      expect(section.lawCitations.length).toBeGreaterThan(0);
      expect(section.provenance.workOrder).toBe("P10-A");
    }
  });

  it("consoleSectionById resolves every id and throws on an unknown id", () => {
    expect(consoleSectionById("overview").title).toBe("Overview");
    expect(consoleSectionById("settings").title).toBe("Settings");
    expect(() => consoleSectionById("nope" as never)).toThrow(/unknown console section id/);
  });
});

describe("console sub-route law (§2 — pure, total, never throws)", () => {
  it("the console root resolves to overview (with and without the trailing slash)", () => {
    for (const root of ["", "/"]) {
      const resolution = resolveConsoleSection(root);
      expect(resolution.kind).toBe("section");
      if (resolution.kind === "section") {
        expect(resolution.section.id).toBe("overview");
      }
    }
  });

  it("every known section resolves, with and without the leading slash", () => {
    for (const section of WORKSPACE_SECTIONS) {
      for (const subPath of [`/${section.id}`, section.id]) {
        const resolution = resolveConsoleSection(subPath);
        expect(resolution.kind).toBe("section");
        if (resolution.kind === "section") {
          expect(resolution.section.id).toBe(section.id);
        }
      }
    }
  });

  it("advanced (and any deeper path under it) resolves to the advanced mount, never a section", () => {
    for (const subPath of ["/advanced", "advanced", "/advanced/anything", "/advanced/x/y"]) {
      const resolution = resolveConsoleSection(subPath);
      expect(resolution.kind).toBe("advanced");
      if (resolution.kind === "advanced") {
        expect(resolution.path).toBe(subPath);
      }
    }
  });

  it("unknown paths resolve to not-found — never a throw, with the path echoed", () => {
    for (const subPath of [
      "/unknown",
      "unknown",
      "/Overview",
      "/MISSIONS",
      "//missions",
      "/missions/",
      "/missions/deeper",
      "/overview/extra",
      " ",
      "/pay",
    ]) {
      const resolution = resolveConsoleSection(subPath);
      expect(resolution.kind).toBe("not-found");
      if (resolution.kind === "not-found") {
        expect(resolution.path).toBe(subPath);
      }
    }
  });

  it("is total over arbitrary runtime garbage (never throws)", () => {
    for (const junk of [null, undefined, 42, {}, []] as unknown as string[]) {
      expect(() => resolveConsoleSection(junk)).not.toThrow();
      expect(resolveConsoleSection(junk).kind).toBe("not-found");
    }
  });

  it("resolution is deterministic (same input, same output)", () => {
    for (const subPath of ["", "/missions", "/advanced", "/nope"]) {
      expect(resolveConsoleSection(subPath)).toEqual(resolveConsoleSection(subPath));
    }
  });
});

describe("console document titles (§1)", () => {
  it("the workspace root reads the pinned title", () => {
    expect(CONSOLE_ROOT_TITLE).toBe("PaySwap — Agent Workspace");
    expect(consoleDocumentTitle("")).toBe("PaySwap — Agent Workspace");
    expect(consoleDocumentTitle("/")).toBe("PaySwap — Agent Workspace");
  });

  it("every section title follows the pinned suffix pattern", () => {
    expect(CONSOLE_TITLE_SUFFIX).toBe(" — PaySwap Agent Workspace");
    expect(consoleDocumentTitle("/overview")).toBe("Overview — PaySwap Agent Workspace");
    expect(consoleDocumentTitle("/activity")).toBe("Activity & receipts — PaySwap Agent Workspace");
    expect(consoleDocumentTitle("/settings")).toBe("Settings — PaySwap Agent Workspace");
    for (const section of WORKSPACE_SECTIONS) {
      expect(consoleDocumentTitle(`/${section.id}`)).toBe(
        `${section.title} — PaySwap Agent Workspace`,
      );
    }
  });

  it("unknown paths render the honest not-found title; advanced carries the honest label", () => {
    expect(consoleDocumentTitle("/unknown")).toBe("Not found — PaySwap Agent Workspace");
    expect(CONSOLE_ADVANCED_ROUTE).toBe("/console/advanced");
    expect(consoleDocumentTitle("/advanced")).toBe(CONSOLE_ADVANCED_LABEL);
    expect(consoleDocumentTitle("/advanced/deeper")).toBe(CONSOLE_ADVANCED_LABEL);
    expect(CONSOLE_ADVANCED_LABEL).toContain("Developer workspace");
    expect(CONSOLE_ADVANCED_LABEL).toContain("upstream");
  });
});

describe("section empty-state reason vocabulary (§6)", () => {
  it("covers the seven sections §6 defines an empty state for", () => {
    expect(CONSOLE_SECTION_EMPTY_STATES).toHaveLength(7);
    expect(
      CONSOLE_SECTION_EMPTY_STATES.map((state) => state.sectionId).sort(),
    ).toEqual(
      ["activity", "agents", "approvals", "connections", "lab", "missions", "overview"].sort(),
    );
  });

  it("every entry carries a typed reason id, a non-empty designed-empty reason and a real or honestly-null next action", () => {
    for (const state of CONSOLE_SECTION_EMPTY_STATES) {
      expect(state.reasonId.length).toBeGreaterThan(0);
      expect(state.reason.length).toBeGreaterThan(0);
      expect(state.reason).not.toMatch(/error|fail/i);
      if (state.nextAction !== null) {
        expect(state.nextAction.kind).toBe("route");
        expect(state.nextAction.value.startsWith("/")).toBe(true);
        expect(state.nextAction.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("settings has NO data-empty state by design (it always renders its facts)", () => {
    expect(consoleSectionEmptyState("settings")).toBeNull();
  });

  it("the accessor is total over all eight sections and matches the vocabulary", () => {
    for (const id of CONSOLE_SECTION_IDS) {
      const found = consoleSectionEmptyState(id);
      expect(found).toBe(CONSOLE_SECTION_EMPTY_STATES.find((state) => state.sectionId === id) ?? null);
    }
  });

  it("the overview empty state's next action is the working create-first-mission route (§5 store)", () => {
    const overview = consoleSectionEmptyState("overview");
    expect(overview?.nextAction).toEqual({
      kind: "route",
      value: "/console/missions",
      label: "Create the first mission",
    });
  });

  it("the connections empty state routes to the product connections area", () => {
    const connections = consoleSectionEmptyState("connections");
    expect(connections?.reason).toContain("NO_EVIDENCE_COVERAGE");
    expect(connections?.nextAction?.value).toBe("/app/connections");
  });
});
