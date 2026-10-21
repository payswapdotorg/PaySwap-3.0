/**
 * Console reference vocabulary tests (P10-A, CONSOLE-WORKSPACE.md §6):
 * every reference vocabulary is non-empty, explicitly labeled with
 * REFERENCE semantics (never data), and carries the pinned concepts —
 * agent contract (body/capabilities/constraints/model binding/runtime
 * status), approvals (material terms + authority scope), the connection
 * lifecycle (PROPOSED…DISCONNECTED), the activity outcome-state
 * reference (UNKNOWN ≠ FAILED, reconciliation-first,
 * submission-is-not-finality, late-returns-possible), the Lab law +
 * opportunities family, and the settings facts fold (identity,
 * attribution, store durability per mount, advanced developer entry).
 */

import { describe, expect, it } from "vitest";

import {
  ACTIVITY_OUTCOME_STATE_REFERENCE,
  AGENT_CONTRACT_VOCABULARY,
  APPROVAL_VOCABULARY,
  CONNECTION_LIFECYCLE_VOCABULARY,
  LAB_ADVISORY_LAW,
  LAB_REFERENCE_VOCABULARY,
  WORKSPACE_STORE_DURABILITY_LABELS,
  foldWorkspaceSettingsFacts,
  type ConsoleReferenceVocabulary,
} from "../src/index.ts";

function expectReferenceVocabulary(vocabulary: ConsoleReferenceVocabulary, expectedIds: {
  id: string;
  minEntries: number;
}): void {
  expect(vocabulary.id).toBe(expectedIds.id);
  expect(vocabulary.semantics).toBe("reference");
  expect(vocabulary.about.length).toBeGreaterThan(0);
  expect(vocabulary.entries.length).toBeGreaterThanOrEqual(expectedIds.minEntries);
  for (const entry of vocabulary.entries) {
    expect(entry.term.length).toBeGreaterThan(0);
    expect(entry.line.length).toBeGreaterThan(0);
  }
}

describe("reference semantics law (§6: vocabularies are REFERENCE, never data)", () => {
  const vocabularies: Array<[string, ConsoleReferenceVocabulary]> = [
    ["agent-contract", AGENT_CONTRACT_VOCABULARY],
    ["approval-scope", APPROVAL_VOCABULARY],
    ["connection-lifecycle", CONNECTION_LIFECYCLE_VOCABULARY],
    ["activity-outcome-states", ACTIVITY_OUTCOME_STATE_REFERENCE],
    ["lab-opportunities", LAB_REFERENCE_VOCABULARY],
  ];

  it("all five vocabularies exist, are non-empty and explicitly reference-labeled", () => {
    for (const [id, vocabulary] of vocabularies) {
      expectReferenceVocabulary(vocabulary, { id, minEntries: 3 });
    }
  });

  it("every vocabulary's about line says reference (clearly labeled, never live data)", () => {
    for (const [, vocabulary] of vocabularies) {
      expect(vocabulary.about.toLowerCase()).toContain("reference");
    }
  });

  it("every vocabulary cites its canonical spec source in its about line", () => {
    expect(AGENT_CONTRACT_VOCABULARY.about).toContain("spec/agents/AGENT-MODEL.md");
    expect(APPROVAL_VOCABULARY.about).toContain("spec/trust/TRUST-BOUNDARY.md");
    expect(CONNECTION_LIFECYCLE_VOCABULARY.about).toContain("spec/capability/CAPABILITY-FABRIC.md");
    expect(ACTIVITY_OUTCOME_STATE_REFERENCE.about).toContain("SURFACE-CONTRACTS.md");
  });
});

describe("agent-contract vocabulary (§6 agents)", () => {
  it("carries the five pinned agent-contract concepts, one line each", () => {
    const terms = AGENT_CONTRACT_VOCABULARY.entries.map((entry) => entry.term);
    expect(terms).toEqual(["body", "declared capabilities", "constraints", "model binding", "runtime status"]);
    const joined = AGENT_CONTRACT_VOCABULARY.entries.map((entry) => entry.line).join(" ");
    expect(joined).toContain("model-independent contract");
    expect(joined).toContain("never an authorization");
    expect(joined).toContain("swappable part");
    expect(joined).toContain("never a claim of financial effect");
  });
});

describe("approval vocabulary (§6 approvals)", () => {
  it("carries material terms + authority scope; no approval may be minted from the workspace", () => {
    const terms = APPROVAL_VOCABULARY.entries.map((entry) => entry.term);
    expect(terms).toContain("material terms");
    expect(terms).toContain("authority scope");
    expect(APPROVAL_VOCABULARY.about).toContain("no approval can be minted from this workspace");
    const joined = APPROVAL_VOCABULARY.entries.map((entry) => entry.line).join(" ");
    expect(joined).toContain("actions, resources and amount bound");
    expect(joined).toContain("mandate and security epoch");
  });
});

describe("connection lifecycle vocabulary (§6 connections)", () => {
  it("spans PROPOSED through DISCONNECTED as reference states", () => {
    const terms = CONNECTION_LIFECYCLE_VOCABULARY.entries.map((entry) => entry.term);
    expect(terms[0]).toBe("PROPOSED");
    expect(terms[terms.length - 1]).toBe("DISCONNECTED");
    expect(terms).toContain("CONNECTED");
    expect(terms).toContain("UNKNOWN");
    const joined = CONNECTION_LIFECYCLE_VOCABULARY.entries.map((entry) => entry.line).join(" ");
    expect(joined).toContain("a proposal is never a connection");
    expect(joined).toContain("catalogue support alone never reaches this state");
    expect(joined).toContain("reconciled rather than guessed");
    expect(joined).toContain("never a silent revival");
  });
});

describe("activity outcome-state reference (§6 activity)", () => {
  it("carries the four honest outcome-state laws as reference, never live activity", () => {
    const terms = ACTIVITY_OUTCOME_STATE_REFERENCE.entries.map((entry) => entry.term);
    expect(terms).toEqual([
      "UNKNOWN_NOT_FAILED",
      "RECONCILIATION_FIRST",
      "SUBMISSION_NOT_FINALITY",
      "LATE_RETURNS_POSSIBLE",
    ]);
    const joined = ACTIVITY_OUTCOME_STATE_REFERENCE.entries.map((entry) => entry.line).join(" ");
    expect(joined).toContain("neither failure nor success");
    expect(joined).toContain("no blind retry");
    expect(joined).toContain("never the outcome");
    expect(joined).toContain("history is never rewritten");
  });
});

describe("lab reference vocabulary (§6 lab)", () => {
  it("carries the Lab law verbatim + the opportunities family", () => {
    expect(LAB_ADVISORY_LAW).toBe(
      "Simulation is advisory/test evidence only — never production financial authority.",
    );
    expect(LAB_REFERENCE_VOCABULARY.entries[0]).toEqual({ term: "lab law", line: LAB_ADVISORY_LAW });
    const terms = LAB_REFERENCE_VOCABULARY.entries.map((entry) => entry.term);
    expect(terms).toContain("opportunities");
    expect(terms).toContain("experiments");
    const joined = LAB_REFERENCE_VOCABULARY.entries.map((entry) => entry.line).join(" ");
    expect(joined).toContain("never direct authorization");
    expect(joined).toContain("never leave the Lab's advisory namespace");
  });
});

describe("settings facts fold (§6 settings)", () => {
  it("carries PaySwap identity with the supporting-capability position", () => {
    for (const durability of ["DESKTOP_PROFILE", "BROWSER_PROFILE"] as const) {
      const facts = foldWorkspaceSettingsFacts(durability);
      expect(facts.identity.name).toBe("PaySwap");
      expect(facts.identity.line).toContain("supporting capability");
      expect(facts.identity.line).toContain("never the default landing");
    }
  });

  it("carries the upstream attribution as attribution (legally preserved)", () => {
    const facts = foldWorkspaceSettingsFacts("DESKTOP_PROFILE");
    expect(facts.attribution.line).toBe(
      "PaySwap is built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).",
    );
    expect(facts.attribution.source).toContain("PRODUCT-IDENTITY.md");
  });

  it("carries the store durability fact for THIS mount (both honest labels)", () => {
    const desktop = foldWorkspaceSettingsFacts("DESKTOP_PROFILE");
    expect(desktop.storeDurability).toEqual({
      durability: "DESKTOP_PROFILE",
      label: WORKSPACE_STORE_DURABILITY_LABELS.DESKTOP_PROFILE,
      line: expect.stringContaining("survive app restarts") as unknown as string,
    });
    const browser = foldWorkspaceSettingsFacts("BROWSER_PROFILE");
    expect(browser.storeDurability.durability).toBe("BROWSER_PROFILE");
    expect(browser.storeDurability.label).toBe("stored in this browser profile only");
    expect(browser.storeDurability.line).toContain("clearing this browser's data clears them");
  });

  it("carries the advanced developer workspace entry (clearly labeled, secondary)", () => {
    for (const durability of ["DESKTOP_PROFILE", "BROWSER_PROFILE"] as const) {
      const facts = foldWorkspaceSettingsFacts(durability);
      expect(facts.advancedDeveloperWorkspace.route).toBe("/console/advanced");
      expect(facts.advancedDeveloperWorkspace.label).toBe("Advanced developer workspace");
      expect(facts.advancedDeveloperWorkspace.line).toContain("upstream platform");
      expect(facts.advancedDeveloperWorkspace.line).toContain("never the default console experience");
    }
  });

  it("is deterministic (same durability, same facts)", () => {
    expect(foldWorkspaceSettingsFacts("BROWSER_PROFILE")).toEqual(
      foldWorkspaceSettingsFacts("BROWSER_PROFILE"),
    );
  });
});
