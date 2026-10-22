/**
 * @payswap/app — the console CONTRACT oracle (P10-C, NET-NEW).
 *
 * The mirror discipline, machine-checked: the src/console contract
 * modules are verified against the RECORDED contract vocabulary
 * (console-contract-fixture.ts — transcribed independently from
 * spec/surface/CONSOLE-WORKSPACE.md), the path law is proven total, the
 * §3 validation law is proven fail-closed, the §4 ladder fold carries
 * the verbatim prerequisites, the seam export surface is pinned (the
 * P10-B mounts compile against it), the authority-verb ban extends to
 * this family (§7), and the ONE documented ambient-clock site is pinned
 * to its exact location (the P5 product law's console refinement).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CONSOLE_ADVANCED_PATH,
  CONSOLE_ROOT,
  CONSOLE_SECTION_IDS,
  CONSOLE_SECTIONS,
  consoleDocumentTitle,
  consoleSection,
  consoleSectionPath,
  isConsoleAdvancedPath,
  resolveConsoleSection,
} from "../../src/console/contracts.js";
import {
  APPROVAL_PREREQUISITE,
  ELIGIBILITY_PREREQUISITE,
  EVIDENCE_PREREQUISITE,
  EXECUTION_PREREQUISITE,
  INTENT_PREREQUISITE,
  MISSION_LADDER_RUNGS,
  OBSERVATION_PREREQUISITE,
  PLANNING_PREREQUISITE,
  foldMissionLadder,
  isIntentReached,
  missionEvidenceNote,
} from "../../src/console/mission-ladder.js";
import {
  AMOUNT_CURRENCY_PATTERN,
  AMOUNT_MINOR_UNITS_PATTERN,
  MISSION_INTAKE_LIMITS,
  MISSION_INTENT_DIRECTIONS,
  validateMissionIntake,
} from "../../src/console/mission-validation.js";
import {
  ACTIVITY_OUTCOME_REFERENCE,
  AGENT_CONTRACT_VOCABULARY,
  APPROVALS_GATE_VOCABULARY,
  CONNECTION_LIFECYCLE_VOCABULARY,
  LAB_LAW,
  OPPORTUNITIES_FAMILY,
  storeDurabilityLabel,
} from "../../src/console/section-vocabulary.js";
import * as seam from "../../src/console/PaySwapAgentWorkspace.js";
import {
  CONSOLE_SECTIONS_FIXTURE,
  DOCUMENT_TITLES_FIXTURE,
  DURABILITY_FIXTURE,
  EMPTY_STATES_FIXTURE,
  PATH_LAW_FIXTURE,
  ADVANCED_PATH_FIXTURE,
  PREREQUISITES_FIXTURE,
  REFERENCE_VOCABULARY_FIXTURE,
  SETTINGS_FIXTURE,
  VALIDATION_FIXTURE,
} from "./console-contract-fixture.js";
import {
  AGENTS_EMPTY_STATE,
  APPROVALS_EMPTY_STATE,
  ACTIVITY_EMPTY_STATE,
  CONNECTIONS_EMPTY_STATE,
  LAB_EMPTY_STATE,
  MISSIONS_EMPTY_STATE,
  MODEL_PROVIDERS_NONE,
  OVERVIEW_ALL_ARCHIVED_STATE,
  OVERVIEW_ATTENTION,
  OVERVIEW_EMPTY_STATE,
} from "../../src/console/section-vocabulary.js";
import { ADVANCED_DEVELOPER_ENTRY, CONSOLE_UPSTREAM_ATTRIBUTION, PAYSWAP_IDENTITY } from "../../src/console/section-vocabulary.js";
import type {
  MissionIntakeInput,
  MissionRecord,
  PaySwapAgentWorkspaceProps,
} from "../../src/console/PaySwapAgentWorkspace.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import type { WorkspaceStorePort } from "../../src/console/PaySwapAgentWorkspace.js";

const norm = (value: unknown): string => JSON.stringify(value);

/* --------------------------- seam stability -------------------------- */

describe("the cross-lane seam (P10-B mounts compile against these names)", () => {
  it("exports the pinned component + helper names the mounts import", () => {
    expect(typeof seam.PaySwapAgentWorkspace).toBe("function");
    expect(typeof seam.resolveConsoleSection).toBe("function");
    expect(typeof seam.consoleSectionPath).toBe("function");
    expect(typeof seam.consoleDocumentTitle).toBe("function");
    expect(typeof seam.isConsoleAdvancedPath).toBe("function");
    expect(seam.CONSOLE_ROOT).toBe("/console");
    expect(seam.CONSOLE_ADVANCED_PATH).toBe("/console/advanced");
  });

  it("the props shape: navigation/store/backToProduct required, modelProviders + clock optional", () => {
    const store: WorkspaceStorePort = {
      durability: "BROWSER_PROFILE",
      listMissions: async () => [],
      recordMissionDraft: async (input) => ({
        id: "m-1",
        createdAt: "2026-10-21T00:00:00Z",
        updatedAt: "2026-10-21T00:00:00Z",
        status: "DRAFT",
        intake: input,
        structuralValidation: { ok: true, findings: [] },
        events: [],
      }),
      recordMissionIntent: async (_id, _now) => {
        throw new Error("unused in the shape test");
      },
      missionDetail: async () => null,
      reviseMissionDraft: async (_id, input) => ({
        id: "m-1",
        createdAt: "2026-10-21T00:00:00Z",
        updatedAt: "2026-10-21T00:00:00Z",
        status: "DRAFT",
        intake: input,
        structuralValidation: { ok: true, findings: [] },
        events: [],
      }),
      archiveMissionDraft: async (_id, _now) => {
        throw new Error("unused in the shape test");
      },
    };
    // The minimal legal props (no optional field) must typecheck + run.
    const props: PaySwapAgentWorkspaceProps = {
      navigation: createStaticNavigation("/console"),
      store,
      backToProduct: { label: "Back to PaySwap", onActivate: () => {} },
    };
    expect(props.backToProduct.label).toBe("Back to PaySwap");
    // The optional additions do not break the shape.
    const withOptionals: PaySwapAgentWorkspaceProps = {
      ...props,
      modelProviders: [{ id: "mp-1", label: "Provider One", connected: true }],
      clock: () => "2026-10-21T00:00:00Z",
    };
    expect(withOptionals.modelProviders).toHaveLength(1);
  });

  it("the pinned record shapes accept §3-shaped values field-for-field", () => {
    const intake: MissionIntakeInput = {
      goalStatement: "Pay a supplier invoice",
      direction: "PAY",
      amount: { currency: "USD", minorUnits: "1234" },
      fundingLocationHint: "primary account",
      payoutLocationHint: "supplier bank",
      note: "monthly run",
    };
    const record: MissionRecord = {
      id: "m-1",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
      status: "DRAFT",
      intake,
      structuralValidation: { ok: true, findings: [] },
      events: [
        { id: "e-1", at: "2026-10-21T00:00:00Z", kind: "CREATED", summary: "Mission created" },
      ],
    };
    expect(record.events[0]?.kind).toBe("CREATED");
  });

  it("no export name carries an authority verb (§7 — SV-6 extends to this family)", async () => {
    const AUTHORITY_VERB = /^(authorize|authorise|commit|execute|sign|capture|settle|refund|cancel|approve|dispatch)/i;
    const modules = [
      seam,
      await import("../../src/console/contracts.js"),
      await import("../../src/console/mission-ladder.js"),
      await import("../../src/console/mission-validation.js"),
      await import("../../src/console/section-vocabulary.js"),
    ];
    for (const module of modules) {
      for (const name of Object.keys(module)) {
        expect(
          AUTHORITY_VERB.test(name),
          `export '${name}' carries an authority verb — the console is advisory and can never own authority`,
        ).toBe(false);
      }
    }
  });
});

/* ------------------------- IA + path law totality --------------------- */

describe("the eight-section IA and the console path law (§2)", () => {
  it("the IA mirror matches the recorded fixture (id/title/purpose, same order)", () => {
    expect(norm(CONSOLE_SECTIONS)).toBe(norm(CONSOLE_SECTIONS_FIXTURE));
    expect(CONSOLE_SECTION_IDS).toEqual(CONSOLE_SECTIONS_FIXTURE.map((s) => s.id));
  });

  it("section ids are unique and every id resolves to its record", () => {
    expect(new Set(CONSOLE_SECTION_IDS).size).toBe(8);
    for (const section of CONSOLE_SECTIONS) {
      expect(consoleSection(section.id)).toBe(section);
    }
    expect(consoleSection("nowhere")).toBeUndefined();
  });

  it("consoleSectionPath builds the canonical section paths", () => {
    expect(consoleSectionPath("overview")).toBe("/console/overview");
    expect(consoleSectionPath("settings")).toBe("/console/settings");
  });

  it("the path law is total: every recorded case resolves and nothing throws", () => {
    expect(CONSOLE_ROOT).toBe(PATH_LAW_FIXTURE.root);
    expect(CONSOLE_ADVANCED_PATH).toBe(PATH_LAW_FIXTURE.advanced);
    for (const { path, resolves } of PATH_LAW_FIXTURE.cases) {
      const route = resolveConsoleSection(path);
      const rendered =
        route.kind === "overview"
          ? "overview"
          : route.kind === "section"
            ? `section:${route.sectionId}`
            : "not-found";
      expect(rendered, path).toBe(resolves);
    }
    // Adversarial inputs never throw (totality).
    for (const path of ["/console//", "/console/", "//console", "/console/overview/", "/CONSOLE"]) {
      expect(() => resolveConsoleSection(path)).not.toThrow();
    }
  });

  it("the root and /console/overview both land on the overview section", () => {
    expect(resolveConsoleSection("/console")).toEqual({ kind: "overview" });
    expect(resolveConsoleSection("/console/overview")).toEqual({
      kind: "section",
      sectionId: "overview",
    });
  });

  it("the advanced-path law (§2): the mount paths predicate is total + exact", () => {
    for (const path of ADVANCED_PATH_FIXTURE.advanced) {
      expect(isConsoleAdvancedPath(path), path).toBe(true);
      // Reaching the workspace fold anyway resolves honestly — never an
      // invented section, never a throw (the mounts split first).
      expect(resolveConsoleSection(path).kind, path).toBe(ADVANCED_PATH_FIXTURE.resolvesTo);
    }
    for (const path of ADVANCED_PATH_FIXTURE.notAdvanced) {
      expect(isConsoleAdvancedPath(path), path).toBe(false);
    }
    expect(isConsoleAdvancedPath(PATH_LAW_FIXTURE.advanced)).toBe(true);
  });

  it("document titles follow the §1 law (route-specific; the root is special)", () => {
    expect(consoleDocumentTitle(resolveConsoleSection("/console"))).toBe(
      DOCUMENT_TITLES_FIXTURE.root,
    );
    expect(consoleDocumentTitle(resolveConsoleSection("/console/missions"))).toBe(
      DOCUMENT_TITLES_FIXTURE.section,
    );
    expect(consoleDocumentTitle(resolveConsoleSection("/console/activity"))).toBe(
      DOCUMENT_TITLES_FIXTURE.sectionActivity,
    );
    expect(consoleDocumentTitle(resolveConsoleSection("/console/nowhere"))).toBe(
      DOCUMENT_TITLES_FIXTURE.notFound,
    );
    for (const section of CONSOLE_SECTIONS) {
      expect(consoleDocumentTitle({ kind: "section", sectionId: section.id })).toBe(
        `${section.title} — PaySwap Agent Workspace`,
      );
    }
  });
});

/* ------------------------------ ladder (§4) --------------------------- */

describe("the lifecycle ladder fold (§4, verbatim prerequisites)", () => {
  const base = {
    id: "m-1",
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    intake: { goalStatement: "g", direction: "PAY" } as MissionIntakeInput,
    structuralValidation: { ok: true, findings: [] },
    events: [],
  } as const;

  it("the §4 prerequisite constants match the recorded fixture verbatim", () => {
    expect(INTENT_PREREQUISITE).toBe(PREREQUISITES_FIXTURE.INTENT);
    expect(ELIGIBILITY_PREREQUISITE).toBe(PREREQUISITES_FIXTURE.ELIGIBILITY);
    expect(PLANNING_PREREQUISITE).toBe(PREREQUISITES_FIXTURE.PLANNING);
    expect(APPROVAL_PREREQUISITE).toBe(PREREQUISITES_FIXTURE.APPROVAL);
    expect(EXECUTION_PREREQUISITE).toBe(PREREQUISITES_FIXTURE.EXECUTION);
    expect(OBSERVATION_PREREQUISITE).toBe(PREREQUISITES_FIXTURE.OBSERVATION);
    expect(EVIDENCE_PREREQUISITE).toBe(PREREQUISITES_FIXTURE.EVIDENCE);
  });

  it("the ladder is the seven-rung authority chain in order", () => {
    expect(MISSION_LADDER_RUNGS).toEqual([
      "INTENT",
      "ELIGIBILITY",
      "PLANNING",
      "APPROVAL",
      "EXECUTION",
      "OBSERVATION",
      "EVIDENCE",
    ]);
  });

  it("DRAFT: every rung renders its verbatim prerequisite (INTENT included)", () => {
    const ladder = foldMissionLadder({ ...base, status: "DRAFT" });
    expect(ladder).toHaveLength(7);
    expect(ladder[0]).toEqual({
      rung: "INTENT",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: PREREQUISITES_FIXTURE.INTENT,
    });
    expect(ladder[1]).toEqual({
      rung: "ELIGIBILITY",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: PREREQUISITES_FIXTURE.ELIGIBILITY,
    });
    expect(ladder[6]).toEqual({
      rung: "EVIDENCE",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: PREREQUISITES_FIXTURE.EVIDENCE,
    });
  });

  it("INTENT_RECORDED: INTENT is reached; downstream rungs stay verbatim", () => {
    const ladder = foldMissionLadder({ ...base, status: "INTENT_RECORDED" });
    expect(ladder[0]).toEqual({ rung: "INTENT", state: "REACHED" });
    expect(isIntentReached({ ...base, status: "INTENT_RECORDED" })).toBe(true);
    for (const rung of ladder.slice(1)) {
      expect(rung.state).toBe("NOT_REACHED_PREREQUISITE");
    }
    expect(ladder[5]).toMatchObject({
      rung: "OBSERVATION",
      prerequisite: PREREQUISITES_FIXTURE.OBSERVATION,
    });
  });

  it("ARCHIVED preserves the reached rungs (§4's letter: status is not DRAFT)", () => {
    expect(isIntentReached({ ...base, status: "ARCHIVED" })).toBe(true);
    expect(foldMissionLadder({ ...base, status: "ARCHIVED" })[0]).toEqual({
      rung: "INTENT",
      state: "REACHED",
    });
  });

  it("the evidence note is the verbatim §4 EVIDENCE line (never invented evidence)", () => {
    for (const status of ["DRAFT", "INTENT_RECORDED", "ARCHIVED"] as const) {
      expect(missionEvidenceNote({ ...base, status })).toBe(PREREQUISITES_FIXTURE.EVIDENCE);
    }
  });
});

/* --------------------------- validation law (§3) ---------------------- */

describe("validateMissionIntake (§3 — fail-closed, deterministic)", () => {
  const valid: MissionIntakeInput = {
    goalStatement: "Pay a supplier invoice",
    direction: "PAY",
    amount: { currency: "USD", minorUnits: "1234" },
  };

  it("a valid intake passes with no findings", () => {
    expect(validateMissionIntake(valid)).toEqual({ ok: true, findings: [] });
  });

  it("the bounds and patterns match the recorded fixture", () => {
    expect(MISSION_INTAKE_LIMITS).toEqual(VALIDATION_FIXTURE.limits);
    expect(MISSION_INTENT_DIRECTIONS).toEqual(VALIDATION_FIXTURE.directions);
    expect(AMOUNT_CURRENCY_PATTERN.source).toBe(VALIDATION_FIXTURE.currencyPattern);
    expect(AMOUNT_MINOR_UNITS_PATTERN.source).toBe(VALIDATION_FIXTURE.minorUnitsPattern);
  });

  it("the finding strings match the recorded fixture (rendered verbatim by the UI)", () => {
    expect(validateMissionIntake({ goalStatement: "   ", direction: "PAY" }).findings).toEqual([
      VALIDATION_FIXTURE.findings.goalRequired,
    ]);
    expect(
      validateMissionIntake({ goalStatement: "x".repeat(2001), direction: "PAY" }).findings,
    ).toEqual([VALIDATION_FIXTURE.findings.goalTooLong]);
    expect(
      validateMissionIntake({ goalStatement: "g", direction: "SIDEWAYS" as never }).findings,
    ).toEqual([VALIDATION_FIXTURE.findings.directionUnknown]);
    expect(
      validateMissionIntake({
        goalStatement: "g",
        direction: "PAY",
        amount: { currency: "usd", minorUnits: "012" },
      }).findings,
    ).toEqual([VALIDATION_FIXTURE.findings.amountCurrency, VALIDATION_FIXTURE.findings.amountMinorUnits]);
    expect(
      validateMissionIntake({
        goalStatement: "g",
        direction: "PAY",
        fundingLocationHint: "x".repeat(201),
        payoutLocationHint: "y".repeat(201),
        note: "z".repeat(2001),
      }).findings,
    ).toEqual([
      VALIDATION_FIXTURE.findings.fundingHintTooLong,
      VALIDATION_FIXTURE.findings.payoutHintTooLong,
      VALIDATION_FIXTURE.findings.noteTooLong,
    ]);
  });

  it("trimmed-length bounds: padded values within limits pass; whitespace-only goal fails", () => {
    expect(
      validateMissionIntake({
        goalStatement: ` ${"x".repeat(2000)} `,
        direction: "MOVE",
        note: "  ok  ",
      }).ok,
    ).toBe(true);
    expect(validateMissionIntake({ goalStatement: "\t\n ", direction: "PAY" }).ok).toBe(false);
  });

  it("the AmountSpec law is enforced exactly (canonical integer minor units)", () => {
    for (const minorUnits of ["0", "1", "123456789"]) {
      expect(
        validateMissionIntake({ ...valid, amount: { currency: "EUR", minorUnits } }).ok,
        minorUnits,
      ).toBe(true);
    }
    for (const minorUnits of ["", "-1", "+1", "1.0", "01", " 1", "1 "]) {
      expect(
        validateMissionIntake({ ...valid, amount: { currency: "EUR", minorUnits } }).ok,
        minorUnits,
      ).toBe(false);
    }
    for (const currency of ["USD", "EUR", "CHF"]) {
      expect(validateMissionIntake({ ...valid, amount: { currency, minorUnits: "1" } }).ok).toBe(true);
    }
    for (const currency of ["usd", "US", "USDD", "US-D", ""]) {
      expect(validateMissionIntake({ ...valid, amount: { currency, minorUnits: "1" } }).ok).toBe(false);
    }
  });

  it("validation is deterministic (same input, same findings, every time)", () => {
    const input: MissionIntakeInput = { goalStatement: "", direction: "PAY" };
    expect(validateMissionIntake(input)).toEqual(validateMissionIntake(input));
  });
});

/* --------------------- vocabulary + durability (§5/§6) ---------------- */

describe("the section vocabulary mirror matches the recorded fixture", () => {
  it("the empty-state reasons + next actions match (§6 typed reasons)", () => {
    expect(norm(OVERVIEW_EMPTY_STATE)).toBe(norm(EMPTY_STATES_FIXTURE.overview));
    expect(norm(OVERVIEW_ALL_ARCHIVED_STATE)).toBe(
      norm(EMPTY_STATES_FIXTURE.overviewAllArchived),
    );
    expect(norm(MISSIONS_EMPTY_STATE)).toBe(norm(EMPTY_STATES_FIXTURE.missions));
    expect(norm(AGENTS_EMPTY_STATE)).toBe(norm(EMPTY_STATES_FIXTURE.agents));
    expect(norm(APPROVALS_EMPTY_STATE)).toBe(norm(EMPTY_STATES_FIXTURE.approvals));
    expect(norm(CONNECTIONS_EMPTY_STATE)).toBe(norm(EMPTY_STATES_FIXTURE.connections));
    expect(norm(ACTIVITY_EMPTY_STATE)).toBe(norm(EMPTY_STATES_FIXTURE.activity));
    expect(norm(LAB_EMPTY_STATE)).toBe(norm(EMPTY_STATES_FIXTURE.lab));
    expect(norm(OVERVIEW_ATTENTION)).toBe(norm(EMPTY_STATES_FIXTURE.overviewAttention));
  });

  it("the reference vocabularies match (terms, same order)", () => {
    expect(AGENT_CONTRACT_VOCABULARY.map((t) => t.term)).toEqual(REFERENCE_VOCABULARY_FIXTURE.agents);
    expect(APPROVALS_GATE_VOCABULARY.map((t) => t.term)).toEqual(REFERENCE_VOCABULARY_FIXTURE.approvals);
    expect(CONNECTION_LIFECYCLE_VOCABULARY.map((t) => t.term)).toEqual(REFERENCE_VOCABULARY_FIXTURE.connections);
    expect(ACTIVITY_OUTCOME_REFERENCE.map((t) => t.term)).toEqual(REFERENCE_VOCABULARY_FIXTURE.activityOutcomes);
    expect(LAB_LAW).toBe(REFERENCE_VOCABULARY_FIXTURE.labLaw);
    expect([...OPPORTUNITIES_FAMILY]).toEqual([...REFERENCE_VOCABULARY_FIXTURE.opportunitiesFamily]);
  });

  it("the UNKNOWN outcome reference row is the only one marked unknown (SV-3)", () => {
    const unknown = ACTIVITY_OUTCOME_REFERENCE.filter((entry) => entry.unknown === true);
    expect(unknown.map((entry) => entry.term)).toEqual(["Unknown"]);
    expect(unknown[0]?.line).toContain("UNKNOWN is not FAILED");
  });

  it("the durability labels match (§5 honest per-mount facts)", () => {
    expect(storeDurabilityLabel("DESKTOP_PROFILE")).toEqual(DURABILITY_FIXTURE.DESKTOP_PROFILE);
    expect(storeDurabilityLabel("BROWSER_PROFILE")).toEqual(DURABILITY_FIXTURE.BROWSER_PROFILE);
  });

  it("the settings facts match (identity, attribution, advanced entry)", () => {
    expect(PAYSWAP_IDENTITY).toEqual(SETTINGS_FIXTURE.identity);
    expect(CONSOLE_UPSTREAM_ATTRIBUTION).toBe(SETTINGS_FIXTURE.attribution);
    expect(ADVANCED_DEVELOPER_ENTRY.label).toBe(SETTINGS_FIXTURE.advancedEntry.label);
    expect(ADVANCED_DEVELOPER_ENTRY.path).toBe(SETTINGS_FIXTURE.advancedEntry.path);
    expect(MODEL_PROVIDERS_NONE).toBe(SETTINGS_FIXTURE.modelProvidersNone);
  });
});

/* --------------------- the P5 ambient-clock site pin ------------------ */

describe("the ambient-clock carve-out is pinned to exactly one site", () => {
  function tsSources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        out.push(...tsSources(p));
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(p);
      }
    }
    return out;
  }

  it("exactly one ambient read, in the store binding's default clock, nowhere else", () => {
    const sources = tsSources(join(process.cwd(), "src")).map((file) => ({
      rel: file.slice(process.cwd().length + 1),
      text: readFileSync(file, "utf8"),
    }));
    const offenders = sources
      .filter(({ rel, text }) => rel !== "src/console/useWorkspaceStore.ts" && /Date\.now\(|new\s+Date\(|Math\.random\(/.test(text))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
    const binding = sources.find(({ rel }) => rel === "src/console/useWorkspaceStore.ts");
    expect(binding).toBeDefined();
    const occurrences = binding!.text.match(/new\s+Date\(/g) ?? [];
    expect(occurrences).toHaveLength(1);
    // The one occurrence is the default mutation clock (the §5 explicit-now
    // seam), never a fold or a displayed value.
    expect(binding!.text).toContain("() => new Date().toISOString()");
  });
});
