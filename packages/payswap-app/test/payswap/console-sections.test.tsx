// @vitest-environment jsdom
/**
 * @payswap/app — the console SECTION oracle (P10-C, NET-NEW): the seven
 * non-mission workspace sections over a real fake store, in their READY
 * state (jsdom + effects flushed — the static suite only sees loading).
 *
 * Machine-checked here (§6):
 * - the honest empties: agents / approvals / connections / activity / lab
 *   render their typed reasons with REAL next actions; the vocabulary
 *   renders as clearly-labeled REFERENCE; NOTHING is fabricated (no
 *   invented agent rows, no approval-minting control, no experiment
 *   records — asserted structurally, not just by copy);
 * - connections: the honest no-provider state (zero connected on
 *   recorded evidence) + the truthful model-provider projection (absent
 *   = the honest none line; present = each real row with its truthful
 *   connected state);
 * - activity: the real mission-event timeline + the outcome-state
 *   reference where UNKNOWN carries role="status" and NEVER role="alert"
 *   (SV-3);
 * - settings: the PaySwap identity, the upstream attribution, the store
 *   durability fact per mount (browser AND desktop), and the advanced
 *   developer-workspace entry routed through the navigation adapter
 *   (no renderer reload);
 * - §8 a11y across the populated renders: every interactive element
 *   accessible-named; the back affordance works.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  PaySwapAgentWorkspace,
  type MissionRecord,
  type WorkspaceStorePort,
} from "../../src/console/PaySwapAgentWorkspace.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import {
  DURABILITY_FIXTURE,
  EMPTY_STATES_FIXTURE,
  REFERENCE_VOCABULARY_FIXTURE,
  SETTINGS_FIXTURE,
} from "./console-contract-fixture.js";

const BACK_LABEL = "Back to PaySwap";

function seedRecord(overrides: Partial<MissionRecord> & { id: string }): MissionRecord {
  const at = overrides.updatedAt ?? "2026-10-21T00:00:00.000Z";
  return {
    createdAt: at,
    updatedAt: at,
    status: "INTENT_RECORDED",
    intake: { goalStatement: `Goal of ${overrides.id}`, direction: "PAY" },
    structuralValidation: { ok: true, findings: [] },
    events: [{ id: `e-${overrides.id}`, at, kind: "CREATED", summary: "Mission created" }],
    ...overrides,
  };
}

function fakeStore(
  records: readonly MissionRecord[] = [],
  durability: "DESKTOP_PROFILE" | "BROWSER_PROFILE" = "BROWSER_PROFILE",
): WorkspaceStorePort {
  return {
    durability,
    listMissions: async () =>
      records.map((record) => ({
        id: record.id,
        goalStatement: record.intake.goalStatement,
        direction: record.intake.direction,
        status: record.status,
        updatedAt: record.updatedAt,
      })),
    recordMissionDraft: async (input, now) => ({
      id: "m-new",
      createdAt: now,
      updatedAt: now,
      status: "DRAFT",
      intake: input,
      structuralValidation: { ok: true, findings: [] },
      events: [],
    }),
    recordMissionIntent: async (_id, now) => seedRecord({ id: "m-new", updatedAt: now }),
    missionDetail: async (id) => {
      const record = records.find((entry) => entry.id === id);
      return record === undefined
        ? null
        : {
            summary: {
              id: record.id,
              goalStatement: record.intake.goalStatement,
              direction: record.intake.direction,
              status: record.status,
              updatedAt: record.updatedAt,
            },
            record,
            ladder: [],
            evidenceNote: "",
          };
    },
    reviseMissionDraft: async (id, input, now) => ({
      ...seedRecord({ id, updatedAt: now }),
      intake: input,
    }),
    archiveMissionDraft: async (id, now) => ({
      ...seedRecord({ id, updatedAt: now }),
      status: "ARCHIVED",
    }),
  };
}

function mountSection(
  path: string,
  store: WorkspaceStorePort = fakeStore(),
  modelProviders?: readonly { id: string; label: string; connected: boolean }[],
): { navigation: ReturnType<typeof createStaticNavigation>; back: ReturnType<typeof vi.fn> } {
  const navigation = createStaticNavigation(path);
  const back = vi.fn();
  render(
    <PaySwapAgentWorkspace
      navigation={navigation}
      store={store}
      backToProduct={{ label: BACK_LABEL, onActivate: back }}
      clock={() => "2026-10-22T12:00:00.000Z"}
      {...(modelProviders !== undefined ? { modelProviders } : {})}
    />,
  );
  return { navigation, back };
}

function sectionOf(id: string): HTMLElement {
  const region = document.querySelector(
    `section[aria-labelledby="ps-console-${id}-heading"]`,
  ) as HTMLElement | null;
  expect(region, `the ${id} section renders`).not.toBeNull();
  return region as HTMLElement;
}

afterEach(() => {
  cleanup();
});

/* ------------------------------ agents -------------------------------- */

describe("the agents section (§6 — honest empty + reference vocabulary)", () => {
  it("the typed reason + the agent-contract vocabulary as clearly-labeled reference", async () => {
    mountSection("/console/agents");
    const section = sectionOf("agents");
    expect(screen.getByText(EMPTY_STATES_FIXTURE.agents.reason)).toBeDefined();
    for (const term of REFERENCE_VOCABULARY_FIXTURE.agents) {
      expect(within(section).getByText(term)).toBeDefined();
    }
    expect(within(section).getAllByText("Reference").length).toBeGreaterThanOrEqual(1);
  });

  it("NO fabricated agents (no rows, no table, no runtime statuses) + the honest none line", async () => {
    mountSection("/console/agents");
    const section = sectionOf("agents");
    expect(section.querySelectorAll("li")).toHaveLength(0);
    expect(section.querySelectorAll("table")).toHaveLength(0);
    expect(section.querySelector(".ps-console-mission-list")).toBeNull();
    expect(screen.getByText(SETTINGS_FIXTURE.modelProvidersNone)).toBeDefined();
  });

  it("the model-binding row projects REAL substrate provider state when the mount supplies it", async () => {
    mountSection("/console/agents", fakeStore(), [
      { id: "mp-1", label: "Provider One", connected: true },
      { id: "mp-2", label: "Provider Two", connected: false },
    ]);
    const section = sectionOf("agents");
    expect(within(section).getByText("Provider One")).toBeDefined();
    expect(within(section).getByText("Provider Two")).toBeDefined();
    expect(within(section).getAllByText("Connected")).toHaveLength(1);
    expect(within(section).getAllByText("Not connected")).toHaveLength(1);
    expect(within(section).queryByText(SETTINGS_FIXTURE.modelProvidersNone)).toBeNull();
  });
});

/* ----------------------------- approvals ------------------------------ */

describe("the approvals section (§6 — nothing can be approved from here)", () => {
  it("the typed reason + what approvals gate as reference", async () => {
    mountSection("/console/approvals");
    const section = sectionOf("approvals");
    expect(screen.getByText(EMPTY_STATES_FIXTURE.approvals.reason)).toBeDefined();
    for (const term of REFERENCE_VOCABULARY_FIXTURE.approvals) {
      expect(within(section).getByText(term)).toBeDefined();
    }
    expect(within(section).getAllByText("Reference").length).toBeGreaterThanOrEqual(1);
  });

  it("NO approval-minting control exists (zero rows; no approve/mint action)", async () => {
    mountSection("/console/approvals");
    const section = sectionOf("approvals");
    expect(section.querySelectorAll("li")).toHaveLength(0);
    expect(section.querySelectorAll("table")).toHaveLength(0);
    for (const control of section.querySelectorAll("button, a")) {
      expect(
        control.textContent,
        "no approval can be minted from the workspace",
      ).not.toMatch(/approve|mint/i);
    }
  });
});

/* ---------------------------- connections ----------------------------- */

describe("the connections section (§6 — the honest no-provider state)", () => {
  it("the typed reason + the honest zero-connected fact + the lifecycle vocabulary", async () => {
    mountSection("/console/connections");
    const section = sectionOf("connections");
    expect(screen.getByText(EMPTY_STATES_FIXTURE.connections.reason)).toBeDefined();
    expect(screen.getByText(/Zero connected capabilities — the honest state \(0 connected\)/)).toBeDefined();
    for (const term of REFERENCE_VOCABULARY_FIXTURE.connections) {
      expect(within(section).getByText(term)).toBeDefined();
    }
    expect(screen.getByText(SETTINGS_FIXTURE.modelProvidersNone)).toBeDefined();
  });

  it("the setup-required next action routes to the product via the mount's back affordance", async () => {
    const { back } = mountSection("/console/connections");
    const action = screen.getByText(EMPTY_STATES_FIXTURE.connections.nextAction.label);
    await act(async () => {
      fireEvent.click(action);
    });
    expect(back).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------ activity ------------------------------ */

describe("the activity section (§6 — real events + the outcome-state reference)", () => {
  it("the real mission-event timeline (newest first) when events exist", async () => {
    const store = fakeStore([
      seedRecord({
        id: "m-1",
        events: [
          { id: "e-2", at: "2026-10-02T00:00:00.000Z", kind: "INTENT_VALIDATED", summary: "Intent recorded" },
          { id: "e-1", at: "2026-10-01T00:00:00.000Z", kind: "CREATED", summary: "Mission created" },
        ],
      }),
    ]);
    mountSection("/console/activity", store);
    const section = sectionOf("activity");
    await screen.findByText("Intent recorded");
    expect(within(section).getByText("Mission created")).toBeDefined();
    const timeline = section.querySelectorAll(".ps-timeline li");
    expect(timeline[0]?.textContent).toContain("Intent recorded");
  });

  it("the designed-empty when no mission events are recorded", async () => {
    mountSection("/console/activity");
    await screen.findByText(EMPTY_STATES_FIXTURE.activity.reason);
    expect(screen.getByText(EMPTY_STATES_FIXTURE.activity.nextAction.label)).toBeDefined();
  });

  it("UNKNOWN renders with role=status and NEVER as an alert (SV-3)", async () => {
    mountSection("/console/activity");
    const section = sectionOf("activity");
    await screen.findByText(EMPTY_STATES_FIXTURE.activity.reason);
    const unknown = section.querySelector('li[role="status"]');
    expect(unknown).not.toBeNull();
    expect(unknown?.textContent).toContain("Unknown");
    expect(unknown?.textContent).toContain("UNKNOWN is not FAILED");
    expect(section.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });
});

/* -------------------------------- lab --------------------------------- */

describe("the lab section (§6 — honest empty + the Lab law verbatim)", () => {
  it("the typed reason + the Lab law + the opportunities family as reference", async () => {
    mountSection("/console/lab");
    const section = sectionOf("lab");
    expect(screen.getByText(EMPTY_STATES_FIXTURE.lab.reason)).toBeDefined();
    expect(screen.getByText(REFERENCE_VOCABULARY_FIXTURE.labLaw)).toBeDefined();
    for (const line of REFERENCE_VOCABULARY_FIXTURE.opportunitiesFamily) {
      expect(within(section).getByText(line, { exact: false })).toBeDefined();
    }
    expect(within(section).getAllByText("Reference").length).toBeGreaterThanOrEqual(1);
  });

  it("NO experiment records are simulated (no timeline, no table)", async () => {
    mountSection("/console/lab");
    const section = sectionOf("lab");
    expect(section.querySelectorAll(".ps-timeline")).toHaveLength(0);
    expect(section.querySelectorAll("table")).toHaveLength(0);
    // The only list rows are the two opportunities-family framing lines.
    expect(section.querySelectorAll("li")).toHaveLength(
      REFERENCE_VOCABULARY_FIXTURE.opportunitiesFamily.length,
    );
  });
});

/* ------------------------------ settings ------------------------------ */

describe("the settings section (§6 — identity, attribution, durability, advanced)", () => {
  it("the PaySwap identity + the upstream attribution + the browser-profile store fact", async () => {
    mountSection("/console/settings");
    const section = sectionOf("settings");
    expect(within(section).getByText(SETTINGS_FIXTURE.identity.name)).toBeDefined();
    expect(within(section).getByText(SETTINGS_FIXTURE.identity.line)).toBeDefined();
    expect(within(section).getByText(SETTINGS_FIXTURE.attribution)).toBeDefined();
    expect(within(section).getByText(DURABILITY_FIXTURE.BROWSER_PROFILE.label)).toBeDefined();
    expect(within(section).getByText(DURABILITY_FIXTURE.BROWSER_PROFILE.fact)).toBeDefined();
  });

  it("the desktop-profile store fact for a DESKTOP_PROFILE mount", async () => {
    mountSection("/console/settings", fakeStore([], "DESKTOP_PROFILE"));
    const section = sectionOf("settings");
    expect(within(section).getByText(DURABILITY_FIXTURE.DESKTOP_PROFILE.label)).toBeDefined();
    expect(within(section).getByText(DURABILITY_FIXTURE.DESKTOP_PROFILE.fact)).toBeDefined();
    expect(within(section).queryByText(DURABILITY_FIXTURE.BROWSER_PROFILE.fact)).toBeNull();
  });

  it("the advanced developer-workspace entry: clearly labeled + adapter-routed (no reload)", async () => {
    const { navigation } = mountSection("/console/settings");
    const entry = screen.getByText(SETTINGS_FIXTURE.advancedEntry.label);
    expect(entry.getAttribute("href")).toBe(SETTINGS_FIXTURE.advancedEntry.path);
    expect(screen.getByText(/developer workspace of the upstream ZCode platform/)).toBeDefined();
    await act(async () => {
      fireEvent.click(entry);
    });
    expect(navigation.visits).toContain(SETTINGS_FIXTURE.advancedEntry.path);
  });
});

/* ------------------------- a11y over ready renders -------------------- */

describe("§8 accessibility over the populated section renders", () => {
  it("every interactive element is accessible-named (populated overview, missions, agents, settings)", async () => {
    const populated = fakeStore([
      seedRecord({ id: "m-1", updatedAt: "2026-10-02T00:00:00.000Z" }),
      seedRecord({ id: "m-2", updatedAt: "2026-10-01T00:00:00.000Z" }),
    ]);
    const paths = ["/console", "/console/missions", "/console/agents", "/console/settings"];
    for (const path of paths) {
      cleanup();
      mountSection(path, populated, [
        { id: "mp-1", label: "Provider One", connected: false },
      ]);
      if (path === "/console" || path === "/console/missions") {
        await screen.findByText("Goal of m-1");
      } else {
        await act(async () => {});
      }
      const anonymous: string[] = [];
      for (const element of document.querySelectorAll("a[href], button")) {
        const text = (element.textContent ?? "").trim();
        const ariaLabel = element.getAttribute("aria-label");
        if (text === "" && ariaLabel === null) {
          anonymous.push(`${path}: <${element.tagName.toLowerCase()}>`);
        }
      }
      expect(anonymous, path).toEqual([]);
    }
  });

  it("the back-to-product affordance works from any section", async () => {
    const { back } = mountSection("/console/lab");
    await act(async () => {
      fireEvent.click(screen.getByText(BACK_LABEL));
    });
    expect(back).toHaveBeenCalledTimes(1);
  });
});
