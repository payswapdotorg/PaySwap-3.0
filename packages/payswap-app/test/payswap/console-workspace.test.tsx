// @vitest-environment jsdom
/**
 * @payswap/app — the console WORKSPACE oracle (P10-C, NET-NEW): the
 * populated workspace over a REAL fake store (jsdom + effects flushed —
 * the static-markup oracle of console-shell.test.tsx can only see the
 * honest loading phase; these tests drive the store-port binding
 * through its whole lifecycle).
 *
 * Machine-checked here:
 * - the overview fold (§6): in-progress missions only (archived
 *   excluded), newest-updated-first, the honest approvals attention
 *   line, recent activity capped at 20 newest-first, the designed-empty
 *   (zero missions) AND the honest all-archived state;
 * - the missions lifecycle (§6 + §5): creation intake → structural
 *   validation findings rendered VERBATIM before anything is recorded →
 *   draft recorded → the intent-review step → intent recorded → detail
 *   ladder (§4 VERBATIM prerequisites) + real event timeline +
 *   evidenceNote → revise (pre-filled, re-opens the updated record) →
 *   archive (two-step, visibly archived, controls retired);
 * - the store binding's typed-error state (a rejected store call is
 *   surfaced, never masked);
 * - document titles per route (§1, the jsdom effect).
 *
 * The fake store is a deterministic in-memory WorkspaceStorePort: no
 * timers, no randomness, ids "m-<n>", events append-only, `now` always
 * the injected explicit instant (§5).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  PaySwapAgentWorkspace,
  type MissionEvent,
  type MissionIntakeInput,
  type MissionRecord,
  type WorkspaceStorePort,
} from "../../src/console/PaySwapAgentWorkspace.js";
import { foldMissionLadder, missionEvidenceNote } from "../../src/console/mission-ladder.js";
import { validateMissionIntake } from "../../src/console/mission-validation.js";
import {
  orderInProgressMissions,
  OVERVIEW_ACTIVITY_CAP,
} from "../../src/console/sections/OverviewSection.js";
import { MissionsSection } from "../../src/console/sections/MissionsSection.js";
import { useWorkspaceStore } from "../../src/console/useWorkspaceStore.js";
import { consoleSection, type ConsoleSectionRecord } from "../../src/console/contracts.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import {
  EMPTY_STATES_FIXTURE,
  PREREQUISITES_FIXTURE,
  VALIDATION_FIXTURE,
} from "./console-contract-fixture.js";

const NOW = "2026-10-22T12:00:00.000Z";
const BACK_LABEL = "Back to PaySwap";
const GOAL = "Pay the quarterly supplier invoice";

/* ------------------------- the fake store port ----------------------- */

interface StoreCall {
  readonly op: "list" | "detail" | "create" | "intent" | "revise" | "archive";
  readonly id?: string;
  readonly input?: MissionIntakeInput;
  readonly now?: string;
}

interface FakeWorkspaceStore extends WorkspaceStorePort {
  readonly calls: readonly StoreCall[];
}

function summaryOf(record: MissionRecord) {
  return {
    id: record.id,
    goalStatement: record.intake.goalStatement,
    direction: record.intake.direction,
    ...(record.intake.amount !== undefined ? { amount: record.intake.amount } : {}),
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

/**
 * The deterministic in-memory port. The §5 adapter laws it models:
 * structural validation before recording (the record CARRIES its
 * findings), recordMissionIntent fails closed on !ok, events are
 * append-only (newest first), `now` is the explicit input.
 */
function fakeWorkspaceStore(records: readonly MissionRecord[] = []): FakeWorkspaceStore {
  const store = new Map<string, MissionRecord>(records.map((r) => [r.id, r]));
  const calls: StoreCall[] = [];
  let nextId = 1;
  const id = () => `m-${nextId++}`;
  const revision = (record: MissionRecord, event: MissionEvent): MissionRecord => ({
    ...record,
    updatedAt: event.at,
    events: [event, ...record.events],
  });
  return {
    durability: "BROWSER_PROFILE",
    calls,
    listMissions: async () => {
      calls.push({ op: "list" });
      return [...store.values()].map(summaryOf);
    },
    recordMissionDraft: async (input, now) => {
      calls.push({ op: "create", input, now });
      const structuralValidation = validateMissionIntake(input);
      const record: MissionRecord = {
        id: id(),
        createdAt: now,
        updatedAt: now,
        status: "DRAFT",
        intake: input,
        structuralValidation,
        events: [
          { id: `e-${nextId++}`, at: now, kind: "CREATED", summary: "Mission created" },
        ],
      };
      store.set(record.id, record);
      return record;
    },
    recordMissionIntent: async (missionId, now) => {
      calls.push({ op: "intent", id: missionId, now });
      const record = store.get(missionId);
      if (record === undefined) {
        throw new Error(`unknown mission ${missionId}`);
      }
      if (!record.structuralValidation.ok) {
        throw new Error(
          `structural validation failed: ${record.structuralValidation.findings.join(" ")}`,
        );
      }
      const next = revision(record, {
        id: `e-${nextId++}`,
        at: now,
        kind: "INTENT_VALIDATED",
        summary: "Intent recorded after review",
      });
      store.set(missionId, { ...next, status: "INTENT_RECORDED" });
      return store.get(missionId)!;
    },
    missionDetail: async (missionId) => {
      calls.push({ op: "detail", id: missionId });
      const record = store.get(missionId);
      if (record === undefined) {
        return null;
      }
      return {
        summary: summaryOf(record),
        record,
        ladder: foldMissionLadder(record),
        evidenceNote: missionEvidenceNote(record),
      };
    },
    reviseMissionDraft: async (missionId, input, now) => {
      calls.push({ op: "revise", id: missionId, input, now });
      const record = store.get(missionId);
      if (record === undefined) {
        throw new Error(`unknown mission ${missionId}`);
      }
      const next = revision(
        { ...record, intake: input, structuralValidation: validateMissionIntake(input) },
        { id: `e-${nextId++}`, at: now, kind: "REVISED", summary: "Mission intake revised" },
      );
      store.set(missionId, next);
      return next;
    },
    archiveMissionDraft: async (missionId, now) => {
      calls.push({ op: "archive", id: missionId, now });
      const record = store.get(missionId);
      if (record === undefined) {
        throw new Error(`unknown mission ${missionId}`);
      }
      const next = revision(
        { ...record, status: "ARCHIVED" },
        { id: `e-${nextId++}`, at: now, kind: "ARCHIVED", summary: "Mission archived" },
      );
      store.set(missionId, next);
      return next;
    },
  };
}

/** A deterministic seeded record. */
function seedRecord(overrides: Partial<MissionRecord> & { id: string }): MissionRecord {
  const at = overrides.updatedAt ?? "2026-10-21T00:00:00.000Z";
  return {
    createdAt: at,
    updatedAt: at,
    status: "DRAFT",
    intake: { goalStatement: `Goal of ${overrides.id}`, direction: "PAY" },
    structuralValidation: { ok: true, findings: [] },
    events: [{ id: `e-${overrides.id}`, at, kind: "CREATED", summary: "Mission created" }],
    ...overrides,
  };
}

/* ---------------------------- the harness ---------------------------- */

function mountWorkspace(path: string, store: WorkspaceStorePort): {
  navigation: ReturnType<typeof createStaticNavigation>;
  back: ReturnType<typeof vi.fn>;
} {
  const navigation = createStaticNavigation(path);
  const back = vi.fn();
  render(
    <PaySwapAgentWorkspace
      navigation={navigation}
      store={store}
      backToProduct={{ label: BACK_LABEL, onActivate: back }}
      clock={() => NOW}
    />,
  );
  return { navigation, back };
}

afterEach(() => {
  cleanup();
});

/* ----------------------- overview (§6, populated) --------------------- */

describe("the overview section over a populated store", () => {
  it("renders the in-progress missions only, newest-updated-first (archived excluded)", async () => {
    const store = fakeWorkspaceStore([
      seedRecord({ id: "m-old", updatedAt: "2026-10-20T00:00:00.000Z" }),
      seedRecord({ id: "m-new", updatedAt: "2026-10-22T00:00:00.000Z" }),
      seedRecord({ id: "m-gone", updatedAt: "2026-10-23T00:00:00.000Z", status: "ARCHIVED" }),
    ]);
    mountWorkspace("/console", store);
    await screen.findByText("Goal of m-new");
    const rows = document.querySelectorAll(".ps-console-mission-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("Goal of m-new")).toBeDefined();
    expect(within(rows[1] as HTMLElement).getByText("Goal of m-old")).toBeDefined();
    expect(screen.queryByText("Goal of m-gone")).toBeNull();
  });

  it("renders the honest approvals attention line with its approvals route", async () => {
    mountWorkspace("/console", fakeWorkspaceStore([seedRecord({ id: "m-1" })]));
    await screen.findByText("Goal of m-1");
    expect(screen.getByText("Decisions needing attention")).toBeDefined();
    expect(screen.getByText(EMPTY_STATES_FIXTURE.overviewAttention.reason)).toBeDefined();
    const route = screen.getByText(EMPTY_STATES_FIXTURE.overviewAttention.nextAction.label);
    expect(route.getAttribute("href")).toBe("/console/approvals");
  });

  it("caps recent activity at the 20 newest events, newest first", async () => {
    const events: MissionEvent[] = [];
    for (let index = 0; index < 25; index += 1) {
      events.push({
        id: `e-${String(index).padStart(2, "0")}`,
        at: `2026-10-01T00:00:${String(index).padStart(2, "0")}.000Z`,
        kind: "REVISED",
        summary: `Event number ${index}`,
      });
    }
    const store = fakeWorkspaceStore([seedRecord({ id: "m-busy", events: [...events].reverse() })]);
    mountWorkspace("/console", store);
    await screen.findByText("Event number 24");
    const block = document.querySelector(
      'section[aria-labelledby="ps-console-overview-activity"]',
    ) as HTMLElement;
    const entries = block.querySelectorAll(".ps-timeline li");
    expect(entries).toHaveLength(OVERVIEW_ACTIVITY_CAP);
    expect(within(block).getByText("Event number 24")).toBeDefined();
    expect(within(block).queryByText("Event number 4")).toBeNull();
    expect(entries[0]?.textContent).toContain("Event number 24");
  });

  it("orderInProgressMissions is the pure §6 fold order (newest first, id tie-break)", () => {
    const ordered = orderInProgressMissions([
      summaryOf(seedRecord({ id: "m-b", updatedAt: "2026-10-01T00:00:00.000Z" })),
      summaryOf(seedRecord({ id: "m-a", updatedAt: "2026-10-01T00:00:00.000Z" })),
      summaryOf(seedRecord({ id: "m-z", updatedAt: "2026-10-05T00:00:00.000Z" })),
      summaryOf(seedRecord({ id: "m-arch", updatedAt: "2026-10-09T00:00:00.000Z", status: "ARCHIVED" })),
    ]);
    expect(ordered.map((mission) => mission.id)).toEqual(["m-z", "m-a", "m-b"]);
  });

  it("the designed-empty state when zero missions exist (typed reason + the home's own working create action, P11)", async () => {
    const { navigation } = mountWorkspace("/console", fakeWorkspaceStore());
    await screen.findByText(EMPTY_STATES_FIXTURE.overview.reason);
    // The outcome-first home: the create-first-mission next action is the
    // home's OWN intake entry — "New mission" navigates to the missions
    // intake (the typed reason + a working action, §6/§8). The static
    // adapter records the visit; the end-to-end prefill golden path is the
    // browser journey's (console-mission-lifecycle spec).
    const cta = screen.getByRole("button", { name: "New mission" });
    await act(async () => {
      fireEvent.click(cta);
    });
    expect(navigation.visits).toContain("/console/missions");
  });

  it("the overview intake entry hands its prefill to onStartMission verbatim (P11)", async () => {
    const { navigation } = mountWorkspace("/console", fakeWorkspaceStore());
    await screen.findByText(EMPTY_STATES_FIXTURE.overview.reason);
    // A typed goal + "New mission" carries the goal into the request.
    const goalBox = screen.getByLabelText("Tell your agents what you need");
    fireEvent.change(goalBox, { target: { value: GOAL } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New mission" }));
    });
    expect(navigation.visits).toContain("/console/missions");
    // An outcome shortcut carries its direction (and no goal).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Convert/ }));
    });
    expect(navigation.visits.filter((v) => v === "/console/missions")).toHaveLength(2);
  });

  it("the honest all-archived state (never the zero-missions lie)", async () => {
    const store = fakeWorkspaceStore([seedRecord({ id: "m-1", status: "ARCHIVED" })]);
    mountWorkspace("/console", store);
    await screen.findByText(EMPTY_STATES_FIXTURE.overviewAllArchived.reason);
    expect(screen.queryByText(EMPTY_STATES_FIXTURE.overview.reason)).toBeNull();
  });
});

/* -------------------- the missions lifecycle (§5/§6) ------------------ */

describe("the missions intake consumes an overview-originated prefill (P11)", () => {
  function IntakeHarness(props: {
    readonly store: WorkspaceStorePort;
    readonly request: { readonly seq: number; readonly prefill: { readonly goalStatement?: string; readonly direction?: "PAY" | "RECEIVE" | "MOVE" | "CONVERT" } } | undefined;
  }) {
    const workspace = useWorkspaceStore(props.store, { clock: () => NOW });
    const section = consoleSection("missions") as ConsoleSectionRecord;
    return (
      <MissionsSection
        section={section}
        workspace={workspace}
        navigation={createStaticNavigation("/console/missions")}
        intakeRequest={props.request}
      />
    );
  }

  it("a prefill request seeds the creation intake's initial state", async () => {
    render(
      <IntakeHarness
        store={fakeWorkspaceStore()}
        request={{ seq: 1, prefill: { goalStatement: GOAL, direction: "MOVE" } }}
      />,
    );
    // The prefilled goal + direction render as the intake's initial state.
    const goalBox = await screen.findByRole("textbox", { name: /Goal statement/ });
    expect((goalBox as HTMLTextAreaElement).value).toBe(GOAL);
    const direction = screen.getByRole("combobox", { name: /Direction/ }) as HTMLSelectElement;
    expect(direction.value).toBe("MOVE");
  });

  it("no request renders the plain empty intake (never a stale prefill)", async () => {
    render(<IntakeHarness store={fakeWorkspaceStore()} request={undefined} />);
    const goalBox = await screen.findByRole("textbox", { name: /Goal statement/ });
    expect((goalBox as HTMLTextAreaElement).value).toBe("");
    const direction = screen.getByRole("combobox", { name: /Direction/ }) as HTMLSelectElement;
    expect(direction.value).toBe("");
  });
});


async function fillIntake(goal: string): Promise<void> {
  fireEvent.change(screen.getByRole("textbox", { name: /Goal statement/ }), {
    target: { value: goal },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /Direction/ }), {
    target: { value: "PAY" },
  });
}

async function createThroughReview(store: FakeWorkspaceStore): Promise<void> {
  mountWorkspace("/console/missions", store);
  await screen.findByText(EMPTY_STATES_FIXTURE.missions.reason);
  await fillIntake(GOAL);
  await act(async () => {
    fireEvent.click(screen.getByText("Validate and record draft"));
  });
  await screen.findByText("Review the recorded draft");
}

describe("the missions section: creation intake → validation → review → intent", () => {
  it("renders findings VERBATIM before recording; an invalid intake never reaches the store", async () => {
    const store = fakeWorkspaceStore();
    mountWorkspace("/console/missions", store);
    await screen.findByText(EMPTY_STATES_FIXTURE.missions.reason);
    await act(async () => {
      fireEvent.click(screen.getByText("Validate and record draft"));
    });
    expect(screen.getByText(VALIDATION_FIXTURE.findings.goalRequired)).toBeDefined();
    expect(screen.getByText(VALIDATION_FIXTURE.findings.directionUnknown)).toBeDefined();
    expect(store.calls.filter((call) => call.op === "create")).toHaveLength(0);
  });

  it("records a valid draft (exact wire input + explicit now) and offers the intent-review step", async () => {
    const store = fakeWorkspaceStore();
    await createThroughReview(store);
    const create = store.calls.find((call) => call.op === "create");
    expect(create?.input).toMatchObject({ goalStatement: GOAL, direction: "PAY" });
    expect(create?.now).toBe(NOW);
    const review = document.getElementById("missions-review") as HTMLElement;
    expect(within(review).getByText(GOAL)).toBeDefined();
    expect(within(review).getByText("Record intent")).toBeDefined();
  });

  it("the intent-review step: record intent → the detail with the §4 ladder + timeline + evidence", async () => {
    const store = fakeWorkspaceStore();
    await createThroughReview(store);
    await act(async () => {
      fireEvent.click(screen.getByText("Record intent"));
    });
    const intent = store.calls.find((call) => call.op === "intent");
    expect(intent?.now).toBe(NOW);
    await screen.findByText("Lifecycle ladder");
    expect(screen.getByText(GOAL, { selector: "h2" })).toBeDefined();
    expect(screen.getAllByText("Reached").length).toBeGreaterThanOrEqual(1);
    for (const prerequisite of [
      PREREQUISITES_FIXTURE.ELIGIBILITY,
      PREREQUISITES_FIXTURE.PLANNING,
      PREREQUISITES_FIXTURE.APPROVAL,
      PREREQUISITES_FIXTURE.EXECUTION,
      PREREQUISITES_FIXTURE.OBSERVATION,
      PREREQUISITES_FIXTURE.EVIDENCE,
    ]) {
      // EVIDENCE legitimately renders twice: the ladder rung AND the
      // evidence note — every occurrence must carry the verbatim string.
      expect(screen.getAllByText(prerequisite).length, prerequisite.slice(0, 30)).toBeGreaterThan(0);
    }
    expect(screen.getByText("Mission created")).toBeDefined();
    expect(screen.getByText("Intent recorded after review")).toBeDefined();
    expect(screen.getByText("Passed — no findings")).toBeDefined();
  });

  it("revise: the action WORKS (form pre-filled, revision recorded, detail re-opens)", async () => {
    const store = fakeWorkspaceStore();
    await createThroughReview(store);
    await act(async () => {
      fireEvent.click(screen.getByText("Record intent"));
    });
    await screen.findByText("Lifecycle ladder");
    await act(async () => {
      fireEvent.click(screen.getByText("Revise intake"));
    });
    await screen.findByText("Revise the mission intake");
    const goal = screen.getByRole("textbox", { name: /Goal statement/ }) as HTMLTextAreaElement;
    expect(goal.value).toBe(GOAL);
    fireEvent.change(goal, { target: { value: `${GOAL} (amended)` } });
    await act(async () => {
      fireEvent.click(screen.getByText("Validate and record revision"));
    });
    const revise = store.calls.find((call) => call.op === "revise");
    expect(revise?.input?.goalStatement).toBe(`${GOAL} (amended)`);
    expect(revise?.now).toBe(NOW);
    await screen.findByText("Mission intake revised");
    await screen.findByText(`${GOAL} (amended)`, { selector: "h2" });
  });

  it("archive: two-step confirm → visibly archived, controls retired", async () => {
    const store = fakeWorkspaceStore();
    await createThroughReview(store);
    await act(async () => {
      fireEvent.click(screen.getByText("Record intent"));
    });
    await screen.findByText("Lifecycle ladder");
    await act(async () => {
      fireEvent.click(screen.getByText("Archive…"));
    });
    await screen.findByText("Confirm archive");
    expect(store.calls.filter((call) => call.op === "archive")).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByText("Confirm archive"));
    });
    const archive = store.calls.find((call) => call.op === "archive");
    expect(archive?.now).toBe(NOW);
    await screen.findByText(/This mission is archived\./);
    expect(screen.getByText("Mission archived")).toBeDefined();
    expect(screen.queryByText("Revise intake")).toBeNull();
    expect(screen.queryByText("Archive…")).toBeNull();
  });

  it("a rejected store call surfaces its typed error (never masked)", async () => {
    const store = fakeWorkspaceStore([seedRecord({ id: "m-1" })]);
    const failing: WorkspaceStorePort = {
      ...store,
      archiveMissionDraft: async () => {
        throw new Error("the host store is unavailable");
      },
    };
    mountWorkspace("/console/missions", failing);
    await screen.findByText("Goal of m-1");
    await act(async () => {
      fireEvent.click(screen.getByText("Open"));
    });
    await screen.findByText("Lifecycle ladder");
    await act(async () => {
      fireEvent.click(screen.getByText("Archive…"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Confirm archive"));
    });
    expect(await screen.findByText("The workspace store failed")).toBeDefined();
    expect(screen.getByText(/archive: the host store is unavailable/)).toBeDefined();
  });
});

/* ----------------------- document titles (§1) ------------------------- */

describe("the document-title effect (jsdom)", () => {
  it("the route-specific PaySwap Agent Workspace titles", async () => {
    mountWorkspace("/console", fakeWorkspaceStore());
    await screen.findByText(EMPTY_STATES_FIXTURE.overview.reason);
    expect(document.title).toBe("PaySwap — Agent Workspace");
    cleanup();
    mountWorkspace("/console/missions", fakeWorkspaceStore());
    await screen.findByText(EMPTY_STATES_FIXTURE.missions.reason);
    expect(document.title).toBe("Missions — PaySwap Agent Workspace");
    cleanup();
    mountWorkspace("/console/nowhere", fakeWorkspaceStore());
    await screen.findByText("Section not found");
    expect(document.title).toBe("Not found — PaySwap Agent Workspace");
  });
});
