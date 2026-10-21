/**
 * Workspace store port tests (P10-A, CONSOLE-WORKSPACE.md §5): the
 * pinned port shape (verified structurally by a conforming double that
 * must satisfy the interface at typecheck, plus runtime method-name and
 * arity pins), the honest durability labels (the BROWSER_PROFILE label
 * byte-exact to the contract document), and the fail-closed label
 * lookup.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  InvalidWorkspaceStoreError,
  WORKSPACE_STORE_DEMAND_SIDE_LAW,
  WORKSPACE_STORE_DURABILITY_LABELS,
  workspaceStoreDurabilityLabel,
  foldWorkspaceSettingsFacts,
  type WorkspaceStoreDurability,
  type WorkspaceStorePort,
} from "../src/index.ts";

const ROOT = process.cwd();
const CONTRACT_DOC = join(ROOT, "..", "..", "spec", "surface", "CONSOLE-WORKSPACE.md");

/** A structurally conforming DESKTOP_PROFILE double (typecheck = the shape pin). */
function desktopPortDouble(): WorkspaceStorePort {
  return {
    durability: "DESKTOP_PROFILE",
    listMissions: async () => [],
    recordMissionDraft: async (input, now) => ({
      id: `mission-${now}`,
      createdAt: now,
      updatedAt: now,
      status: "DRAFT",
      intake: input,
      structuralValidation: { ok: true, findings: [] },
      events: [{ id: "evt-1", at: now, kind: "CREATED", summary: "Mission draft recorded." }],
    }),
    recordMissionIntent: async (id, now) => ({
      id,
      createdAt: now,
      updatedAt: now,
      status: "INTENT_RECORDED",
      intake: { goalStatement: "recorded", direction: "PAY" },
      structuralValidation: { ok: true, findings: [] },
      events: [{ id: "evt-2", at: now, kind: "INTENT_VALIDATED", summary: "Intent recorded." }],
    }),
    missionDetail: async (id) => (id === "none" ? null : null),
    reviseMissionDraft: async (id, input, now) => ({
      id,
      createdAt: now,
      updatedAt: now,
      status: "DRAFT",
      intake: input,
      structuralValidation: { ok: true, findings: [] },
      events: [{ id: "evt-3", at: now, kind: "REVISED", summary: "Draft revised." }],
    }),
    archiveMissionDraft: async (id, now) => ({
      id,
      createdAt: now,
      updatedAt: now,
      status: "ARCHIVED",
      intake: { goalStatement: "recorded", direction: "PAY" },
      structuralValidation: { ok: true, findings: [] },
      events: [{ id: "evt-4", at: now, kind: "ARCHIVED", summary: "Draft archived." }],
    }),
  };
}

describe("the pinned port shape (§5)", () => {
  it("a conforming double satisfies WorkspaceStorePort (compile) with the pinned members (runtime)", () => {
    const port = desktopPortDouble();
    expect(port.durability).toBe("DESKTOP_PROFILE");
    expect(Object.keys(port).sort()).toEqual(
      [
        "archiveMissionDraft",
        "durability",
        "listMissions",
        "missionDetail",
        "recordMissionDraft",
        "recordMissionIntent",
        "reviseMissionDraft",
      ].sort(),
    );
    // Arity pins: the §5 signatures (input, now) / (id, now) / (id, input, now).
    expect(port.listMissions.length).toBe(0);
    expect(port.recordMissionDraft.length).toBe(2);
    expect(port.recordMissionIntent.length).toBe(2);
    expect(port.missionDetail.length).toBe(1);
    expect(port.reviseMissionDraft.length).toBe(3);
    expect(port.archiveMissionDraft.length).toBe(2);
  });

  it("recordMissionIntent is the intent-review step named in §5 (the DRAFT → INTENT_RECORDED member)", () => {
    const port: WorkspaceStorePort = desktopPortDouble();
    expect(typeof port.recordMissionIntent).toBe("function");
    expect("recordMissionIntent" in port).toBe(true);
  });

  it("both durability values are constructible (the closed vocabulary)", () => {
    const durabilities: WorkspaceStoreDurability[] = ["DESKTOP_PROFILE", "BROWSER_PROFILE"];
    expect(durabilities).toHaveLength(2);
  });
});

describe("the honest durability labels (§5 honest-labeling law)", () => {
  it("BROWSER_PROFILE label is byte-exact to the contract document", () => {
    const text = readFileSync(CONTRACT_DOC, "utf8");
    const section5 = text.split("## 5.")[1]?.split("## 6.")[0] ?? "";
    const match = section5.match(/honest labeling \(`"([^]*?)"`\)/);
    expect(match, "the §5 honest-labeling quote must exist in the contract document").not.toBeNull();
    const docLabel = (match?.[1] ?? "").split("\n").map((line) => line.trim()).join(" ");
    expect(WORKSPACE_STORE_DURABILITY_LABELS.BROWSER_PROFILE).toBe(docLabel);
  });

  it("the labels are short, honest and cover both durabilities", () => {
    expect(WORKSPACE_STORE_DURABILITY_LABELS.DESKTOP_PROFILE).toBe(
      "stored in the PaySwap desktop app profile",
    );
    expect(WORKSPACE_STORE_DURABILITY_LABELS.BROWSER_PROFILE).toBe(
      "stored in this browser profile only",
    );
    expect(workspaceStoreDurabilityLabel("DESKTOP_PROFILE")).toBe(
      "stored in the PaySwap desktop app profile",
    );
    expect(workspaceStoreDurabilityLabel("BROWSER_PROFILE")).toBe(
      "stored in this browser profile only",
    );
  });

  it("the label lookup fails closed on an unknown durability", () => {
    expect(() =>
      workspaceStoreDurabilityLabel("CLOUD_PROFILE" as unknown as WorkspaceStoreDurability),
    ).toThrow(InvalidWorkspaceStoreError);
    expect(() =>
      foldWorkspaceSettingsFacts("CLOUD_PROFILE" as unknown as WorkspaceStoreDurability),
    ).toThrow(/unknown workspace store durability/);
  });

  it("the demand-side-intent law is carried verbatim (§5 final law)", () => {
    expect(WORKSPACE_STORE_DEMAND_SIDE_LAW).toBe(
      "The workspace store holds demand-side intent only — it is not financial truth, not authorization, not capability state.",
    );
  });
});
