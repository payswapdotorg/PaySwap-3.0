/**
 * Workspace section fold tests (P10-A, CONSOLE-WORKSPACE.md §6):
 * foldWorkspaceOverview — in-progress filtering (ARCHIVED excluded),
 * newest-updated-first ordering, the honest approvals-plane attention
 * line (verbatim §4 APPROVAL, route "approvals"), recent events
 * (reverse-chronological, capped at 20, mission-tagged), the
 * designed-empty contract (null iff in-progress non-empty), the
 * connections coverage fact, determinism, and fail-closed behavior.
 */

import { describe, expect, it } from "vitest";

import {
  CONSOLE_SECTION_EMPTY_STATES,
  InvalidConsoleMissionError,
  InvalidOverviewRecordError,
  MISSION_PREREQUISITE_APPROVAL,
  NO_EVIDENCE_COVERAGE,
  NO_EVIDENCE_COVERAGE_NOTE,
  WORKSPACE_OVERVIEW_RECENT_EVENTS_CAP,
  consoleSectionEmptyState,
  foldWorkspaceOverview,
  validateMissionIntake,
  type MissionIntakeInput,
  type MissionRecord,
} from "../src/index.ts";

function makeRecord(input: {
  id: string;
  status?: MissionRecord["status"];
  updatedAt: string;
  events?: Array<{ id: string; at: string; kind: MissionRecord["events"][number]["kind"]; summary: string }>;
  intake?: MissionIntakeInput;
}): MissionRecord {
  const intake = input.intake ?? { goalStatement: `Goal of ${input.id}`, direction: "PAY" as const };
  return {
    id: input.id,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: input.updatedAt,
    status: input.status ?? "DRAFT",
    intake,
    structuralValidation: validateMissionIntake(intake),
    events: input.events ?? [{ id: "evt-1", at: input.updatedAt, kind: "CREATED", summary: "Recorded." }],
  };
}

describe("foldWorkspaceOverview (§6 overview)", () => {
  it("empty input renders the designed-empty state with the working create-first-mission action", () => {
    const view = foldWorkspaceOverview([]);
    expect(view.inProgress).toEqual([]);
    expect(view.emptyState).not.toBeNull();
    expect(view.emptyState?.reason.length).toBeGreaterThan(0);
    expect(view.emptyState?.nextAction).toEqual({
      kind: "route",
      value: "/console/missions",
      label: "Create the first mission",
    });
    expect(view.recentEvents).toEqual([]);
  });

  it("the designed-empty reason matches the overview section's §6 vocabulary entry", () => {
    const view = foldWorkspaceOverview([]);
    expect(view.emptyState?.reason).toBe(consoleSectionEmptyState("overview")?.reason);
  });

  it("all-archived input still renders an honest (non-empty-input) designed-empty reason", () => {
    const view = foldWorkspaceOverview([makeRecord({ id: "m1", status: "ARCHIVED", updatedAt: "2026-10-02T00:00:00Z" })]);
    expect(view.inProgress).toEqual([]);
    expect(view.emptyState).not.toBeNull();
    expect(view.emptyState?.reason).toContain("archived");
    expect(view.emptyState?.nextAction.value).toBe("/console/missions");
  });

  it("in-progress filters out ARCHIVED and includes DRAFT + INTENT_RECORDED, newest-updated first", () => {
    const view = foldWorkspaceOverview([
      makeRecord({ id: "m-old", updatedAt: "2026-10-01T00:00:00Z" }),
      makeRecord({ id: "m-new", status: "INTENT_RECORDED", updatedAt: "2026-10-05T00:00:00Z" }),
      makeRecord({ id: "m-arch", status: "ARCHIVED", updatedAt: "2026-10-09T00:00:00Z" }),
      makeRecord({ id: "m-mid", updatedAt: "2026-10-03T00:00:00Z" }),
    ]);
    expect(view.inProgress.map((mission) => mission.id)).toEqual(["m-new", "m-mid", "m-old"]);
    expect(view.emptyState).toBeNull();
  });

  it("updatedAt ties break deterministically by id ascending", () => {
    const view = foldWorkspaceOverview([
      makeRecord({ id: "m-b", updatedAt: "2026-10-01T00:00:00Z" }),
      makeRecord({ id: "m-a", updatedAt: "2026-10-01T00:00:00Z" }),
      makeRecord({ id: "m-c", updatedAt: "2026-10-01T00:00:00Z" }),
    ]);
    expect(view.inProgress.map((mission) => mission.id)).toEqual(["m-a", "m-b", "m-c"]);
  });

  it("the attention line carries the verbatim §4 APPROVAL fact with the approvals route", () => {
    const view = foldWorkspaceOverview([]);
    expect(view.attention).toEqual({ reason: MISSION_PREREQUISITE_APPROVAL, route: "approvals" });
    expect(view.attention.reason).toContain("No approval plane is configured");
  });

  it("recent events come from ALL records (including archived), newest first, mission-tagged", () => {
    const view = foldWorkspaceOverview([
      makeRecord({
        id: "m1",
        updatedAt: "2026-10-05T00:00:00Z",
        events: [
          { id: "e1b", at: "2026-10-05T00:00:00Z", kind: "REVISED", summary: "Revised." },
          { id: "e1a", at: "2026-10-04T00:00:00Z", kind: "CREATED", summary: "Created." },
        ],
      }),
      makeRecord({
        id: "m2",
        status: "ARCHIVED",
        updatedAt: "2026-10-06T00:00:00Z",
        events: [{ id: "e2a", at: "2026-10-06T00:00:00Z", kind: "ARCHIVED", summary: "Archived." }],
      }),
    ]);
    expect(view.recentEvents.map((tagged) => [tagged.missionId, tagged.event.id])).toEqual([
      ["m2", "e2a"],
      ["m1", "e1b"],
      ["m1", "e1a"],
    ]);
  });

  it("recent events are capped at exactly 20, keeping the newest", () => {
    expect(WORKSPACE_OVERVIEW_RECENT_EVENTS_CAP).toBe(20);
    const records: MissionRecord[] = [];
    for (let i = 0; i < 5; i += 1) {
      const events = Array.from({ length: 6 }, (_, j) => ({
        id: `e-${i}-${j}`,
        at: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:0${j}Z`,
        kind: "REVISED" as const,
        summary: `Event ${i}-${j}.`,
      }));
      records.push(
        makeRecord({
          id: `m-${i}`,
          updatedAt: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:05Z`,
          events,
        }),
      );
    }
    const view = foldWorkspaceOverview(records);
    expect(view.recentEvents).toHaveLength(20);
    const ats = view.recentEvents.map((tagged) => tagged.event.at);
    expect([...ats].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))).toEqual(ats);
  });

  it("event ties break deterministically (mission id, then event id)", () => {
    const view = foldWorkspaceOverview([
      makeRecord({
        id: "m-b",
        updatedAt: "2026-10-01T00:00:00Z",
        events: [
          { id: "e-2", at: "2026-10-01T00:00:00Z", kind: "CREATED", summary: "b2" },
          { id: "e-1", at: "2026-10-01T00:00:00Z", kind: "CREATED", summary: "b1" },
        ],
      }),
      makeRecord({
        id: "m-a",
        updatedAt: "2026-10-01T00:00:00Z",
        events: [{ id: "e-9", at: "2026-10-01T00:00:00Z", kind: "CREATED", summary: "a9" }],
      }),
    ]);
    expect(view.recentEvents.map((tagged) => `${tagged.missionId}/${tagged.event.id}`)).toEqual([
      "m-a/e-9",
      "m-b/e-1",
      "m-b/e-2",
    ]);
  });

  it("is deterministic and input-order independent (same records, any order, same view)", () => {
    const records = [
      makeRecord({ id: "m1", updatedAt: "2026-10-03T00:00:00Z" }),
      makeRecord({ id: "m2", status: "INTENT_RECORDED", updatedAt: "2026-10-04T00:00:00Z" }),
      makeRecord({ id: "m3", status: "ARCHIVED", updatedAt: "2026-10-05T00:00:00Z" }),
    ];
    const once = foldWorkspaceOverview(records);
    expect(foldWorkspaceOverview(records)).toEqual(once);
    expect(foldWorkspaceOverview([...records].reverse())).toEqual(once);
    expect(JSON.stringify(foldWorkspaceOverview([...records].reverse()))).toBe(
      JSON.stringify(once),
    );
  });

  it("fails closed on a malformed record (typed error, never a degraded view)", () => {
    const malformed = { ...makeRecord({ id: "m1", updatedAt: "2026-10-01T00:00:00Z" }), status: "GONE" } as unknown as MissionRecord;
    expect(() => foldWorkspaceOverview([malformed])).toThrow(InvalidOverviewRecordError);
    expect(() => foldWorkspaceOverview([malformed])).toThrow(InvalidConsoleMissionError);
    expect(() => foldWorkspaceOverview([malformed])).toThrow(/records\[0\]/);
  });

  it("an in-progress mission whose intake carries findings still projects (validity is carried)", () => {
    const drafty = makeRecord({
      id: "m1",
      updatedAt: "2026-10-01T00:00:00Z",
      intake: { goalStatement: "", direction: "PAY" },
    });
    const view = foldWorkspaceOverview([drafty]);
    expect(view.inProgress).toHaveLength(1);
    expect(view.emptyState).toBeNull();
  });
});

describe("connections coverage facts (§6 connections)", () => {
  it("the typed zero-connected fact and its note", () => {
    expect(NO_EVIDENCE_COVERAGE).toBe("NO_EVIDENCE_COVERAGE");
    expect(NO_EVIDENCE_COVERAGE_NOTE).toContain("Zero capabilities are connected");
    expect(NO_EVIDENCE_COVERAGE_NOTE).toContain("never a connection");
    const connections = consoleSectionEmptyState("connections");
    expect(connections?.reason).toContain(NO_EVIDENCE_COVERAGE);
  });
});

describe("section empty-state vocabulary totality (§6)", () => {
  it("seven entries, unique typed reason ids, no dead actions", () => {
    const ids = CONSOLE_SECTION_EMPTY_STATES.map((state) => state.reasonId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const state of CONSOLE_SECTION_EMPTY_STATES) {
      if (state.nextAction !== null) {
        expect(state.nextAction.kind).toBe("route");
        expect(state.nextAction.value.startsWith("/")).toBe(true);
      }
    }
  });
});
