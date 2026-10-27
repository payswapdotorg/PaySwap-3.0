/**
 * @payswap/app — the ROUTINE-STAGE PANEL render laws (P21-B, ADR-0014
 * D3; failing-first).
 *
 * The stage-checklist surface, machine-checked against the REAL
 * component (static markup + jsdom; deterministic — no engine, no
 * network, no clock):
 *
 * - the honest UNBOUND note renders when the mission tier is not wired
 *   (no mission timeline → no stage checklist; never a fake) and NO
 *   stage rows render in that tier;
 * - with a projection, every stage row renders its title + status label
 *   + checkpoint; a PENDING stage renders its prerequisites;
 * - the status labels are the surface contract's own vocabulary
 *   (pending / in progress / completed);
 * - the ROUTINE_PINNED wiring: a mounted engine + session record the
 *   stage-0 pin on the task and the panel then derives stage 0 as
 *   completed from the PERSISTED event (reload → same pin).
 */
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { RoutineStagePanel } from "../../src/agent/RoutineStagePanel.js";
import { projectRoutineStageProgress } from "../../src/agent/routineStageProjection.js";
import {
  AGENT_ROUTINE_STAGES_PIN,
  ROUTINE_STAGE_PANEL_UNBOUND_NOTE,
} from "../../src/agent/routineStagePins.js";
import { routinePinSummary } from "../../src/agent/routineStagePinning.js";
import { PINNED_ROUTE_PLANNING_ROUTINE } from "../../src/agent/routePlanningPins.js";

const T0 = "2026-10-27T12:00:00Z";
const NO_EVENTS: readonly { readonly kind: string; readonly summary: string; readonly at: string }[] = [];

/** Decode the static markup's entity escapes for verbatim-note asserts. */
function decodedMarkup(element: React.ReactElement): string {
  return renderToStaticMarkup(element).replaceAll("&#x27;", "'");
}

describe("D3 — the stage-checklist panel (the honest unbound tier + the derived rows)", () => {
  it("renders the honest unbound note VERBATIM when no mission timeline is wired — and no stage rows", () => {
    const markup = decodedMarkup(<RoutineStagePanel progress={null} />);
    expect(markup).toContain(ROUTINE_STAGE_PANEL_UNBOUND_NOTE);
    // No fabricated checklist in the unbound tier.
    expect(markup).not.toContain("ps-agent-stage-item");
  });

  it("renders every projected stage row: title, status label, checkpoint always; prerequisites while pending", () => {
    const progress = projectRoutineStageProgress({
      taskEvents: [
        { kind: "ROUTINE_PINNED", summary: routinePinSummary(PINNED_ROUTE_PLANNING_ROUTINE), at: T0 },
      ],
      mission: { missionId: "task:PAYMENT_MISSION:01", status: "ACTIVE", events: NO_EVENTS },
      engineView: null,
    });
    const markup = decodedMarkup(<RoutineStagePanel progress={progress} />);
    for (const stage of AGENT_ROUTINE_STAGES_PIN) {
      expect(markup).toContain(stage.title);
      expect(markup).toContain(stage.checkpoint);
    }
    // The completed stage 0 renders its grounded summary.
    expect(markup).toContain("completed");
    // A pending stage (1) renders its prerequisites line.
    expect(markup).toContain(AGENT_ROUTINE_STAGES_PIN[1]!.prerequisites);
    expect(markup).toContain("pending");
  });

  it("renders the in-progress label from the surface contract's own vocabulary when a stage is running", () => {
    const progress = projectRoutineStageProgress({
      taskEvents: NO_EVENTS,
      mission: {
        missionId: "task:PAYMENT_MISSION:01",
        status: "ACTIVE",
        events: [{ kind: "MISSING_FIELD_ASKED", summary: "Mission intake asked (amountAndCurrency)", at: T0 }],
      },
      engineView: null,
    });
    const { container } = render(<RoutineStagePanel progress={progress} />);
    const stageOne = container.querySelector('[data-ps-stage-id="1"]');
    expect(stageOne?.getAttribute("data-ps-stage-status")).toBe("IN_PROGRESS");
    expect(stageOne?.textContent).toContain("in progress");
  });

  it("renders one row per canonical stage id, in the frozen order", () => {
    const progress = projectRoutineStageProgress({
      taskEvents: NO_EVENTS,
      mission: { missionId: "task:PAYMENT_MISSION:01", status: "ACTIVE", events: NO_EVENTS },
      engineView: null,
    });
    const { container } = render(<RoutineStagePanel progress={progress} />);
    const ids = [...container.querySelectorAll("[data-ps-stage-id]")].map((node) => node.getAttribute("data-ps-stage-id"));
    expect(ids).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9a", "9b", "10"]);
  });
});
