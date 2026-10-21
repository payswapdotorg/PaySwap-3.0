/**
 * @payswap/app — the console workspace PIN MIRROR cross-check (P10
 * integration, TL-owned): the app's console contracts (src/console/)
 * must match @payswap/surface's console contract family (P10-A)
 * exactly where they overlap — the §4 prerequisite strings, the rung
 * order, the ladder fold behavior, the §2 section table and the
 * console titles/routes. Test-only relative imports of the surface
 * source (the established pin-mirror pattern; src/** keeps the layer
 * law of never importing @payswap/*).
 */

import { describe, expect, it } from "vitest";

import {
  CONSOLE_ADVANCED_ROUTE,
  CONSOLE_ROOT_TITLE,
  CONSOLE_SECTION_IDS,
  WORKSPACE_SECTIONS,
} from "../../../surface/src/console-workspace.ts";
import {
  foldMissionLadder as surfaceFoldMissionLadder,
  MISSION_PREREQUISITE_APPROVAL,
  MISSION_PREREQUISITE_ELIGIBILITY,
  MISSION_PREREQUISITE_EVIDENCE,
  MISSION_PREREQUISITE_EXECUTION,
  MISSION_PREREQUISITE_INTENT,
  MISSION_PREREQUISITE_OBSERVATION,
  MISSION_PREREQUISITE_PLANNING,
} from "../../../surface/src/console-ladder.ts";
import { MISSION_LIFECYCLE_RUNGS as SURFACE_RUNGS } from "../../../surface/src/console-missions.ts";
import {
  foldMissionLadder as appFoldMissionLadder,
  MISSION_LADDER_RUNGS,
  INTENT_PREREQUISITE,
  ELIGIBILITY_PREREQUISITE,
  PLANNING_PREREQUISITE,
  APPROVAL_PREREQUISITE,
  EXECUTION_PREREQUISITE,
  OBSERVATION_PREREQUISITE,
  EVIDENCE_PREREQUISITE,
} from "../../src/console/mission-ladder.js";
import {
  CONSOLE_SECTIONS,
  CONSOLE_ADVANCED_PATH as APP_ADVANCED_ROUTE,
  consoleDocumentTitle,
} from "../../src/console/contracts.js";
import type { MissionRecord } from "../../src/console/contracts.js";
import type {
  MissionIntakeInput,
  WorkspaceStorePort,
} from "../../src/console/PaySwapAgentWorkspace.js";
import type {
  MissionIntakeInput as SurfaceIntake,
  WorkspaceStorePort as SurfacePort,
} from "../../../surface/src/console-store.ts";
import type { MissionRecord as SurfaceRecord } from "../../../surface/src/console-missions.ts";

/* Compile-time seam assignability (checked by tsc over this test):
 * the app port/intake and the surface port/intake are the same shape. */
const _surfacePortIsAppPort: WorkspaceStorePort = null as unknown as SurfacePort;
const _appPortIsSurfacePort: SurfacePort = null as unknown as WorkspaceStorePort;
const _surfaceIntakeIsAppIntake: MissionIntakeInput = null as unknown as SurfaceIntake;
void _surfacePortIsAppPort;
void _appPortIsSurfacePort;
void _surfaceIntakeIsAppIntake;

describe("console pin mirror (P10 integration cross-check)", () => {
  it("the §4 typed prerequisites are byte-identical to @payswap/surface", () => {
    expect(INTENT_PREREQUISITE).toBe(MISSION_PREREQUISITE_INTENT);
    expect(ELIGIBILITY_PREREQUISITE).toBe(MISSION_PREREQUISITE_ELIGIBILITY);
    expect(PLANNING_PREREQUISITE).toBe(MISSION_PREREQUISITE_PLANNING);
    expect(APPROVAL_PREREQUISITE).toBe(MISSION_PREREQUISITE_APPROVAL);
    expect(EXECUTION_PREREQUISITE).toBe(MISSION_PREREQUISITE_EXECUTION);
    expect(OBSERVATION_PREREQUISITE).toBe(MISSION_PREREQUISITE_OBSERVATION);
    expect(EVIDENCE_PREREQUISITE).toBe(MISSION_PREREQUISITE_EVIDENCE);
  });

  it("the lifecycle rung order matches", () => {
    expect([...MISSION_LADDER_RUNGS]).toEqual([...SURFACE_RUNGS]);
  });

  it("the ladder fold is behaviorally identical on fixture records", () => {
    const intake: MissionIntakeInput = {
      goalStatement: "Fixture goal for the mirror cross-check",
      direction: "PAY",
      amount: { currency: "USD", minorUnits: "1234" },
    };
    const record = (status: MissionRecord["status"]): MissionRecord => ({
      id: "mission-1",
      createdAt: "2026-10-21T15:00:00Z",
      updatedAt: "2026-10-21T15:01:00Z",
      status,
      intake,
      structuralValidation: { ok: true, findings: [] },
      events: [
        {
          id: "event-1",
          at: "2026-10-21T15:00:00Z",
          kind: "CREATED",
          summary: "Fixture created",
        },
      ],
    });
    for (const status of ["DRAFT", "INTENT_RECORDED", "ARCHIVED"] as const) {
      const surfaceRecord = record(status) as unknown as SurfaceRecord;
      expect(appFoldMissionLadder(record(status))).toEqual(
        surfaceFoldMissionLadder(surfaceRecord),
      );
    }
  });

  it("the §2 section table matches (ids + titles, all eight)", () => {
    expect(CONSOLE_SECTIONS.map((s) => s.id)).toEqual([...CONSOLE_SECTION_IDS]);
    expect(CONSOLE_SECTIONS.map((s) => s.title)).toEqual(
      WORKSPACE_SECTIONS.map((s) => s.title),
    );
    expect(CONSOLE_SECTIONS).toHaveLength(8);
  });

  it("the console root title and the advanced route match", () => {
    expect(consoleDocumentTitle({ kind: "overview" })).toBe(CONSOLE_ROOT_TITLE);
    expect(APP_ADVANCED_ROUTE).toBe(CONSOLE_ADVANCED_ROUTE);
  });
});
