/**
 * @payswap/app — the ROUTINE-STAGE PIN MIRROR verification (P21-B).
 *
 * The stage-progress projection consumes the surface's routine-stage
 * contract (packages/surface/src/agent-routine-stages.ts, P21-B run 1)
 * through STRUCTURAL PINS in src/agent/routineStagePins.ts — the
 * product law keeps @payswap/* imports out of src. THIS test imports
 * the accepted source module DIRECTLY (test-only — the established
 * pin-mirror discipline) and asserts the pins match the source EXACTLY:
 *
 * - the twelve stage ids, frozen order;
 * - every stage declaration field (title, handlerId, branch, advisory,
 *   authorityClass, prerequisites, checkpoint) — the ONE workflow
 *   vocabulary, never a second one;
 * - the plan-status vocabulary + labels (the substrate status-panel
 *   plan pattern's own words).
 *
 * Drift between a pin and its source fails HERE — detectable at test
 * time, never discovered in production.
 */
import { describe, expect, it } from "vitest";
import {
  AGENT_ROUTINE_STAGE_IDS,
  AGENT_ROUTINE_STAGES,
  AGENT_TASK_STAGE_STATUSES,
  ROUTINE_STAGE_STATUS_LABELS,
} from "../../../surface/src/agent-routine-stages.ts";
import {
  AGENT_ROUTINE_STAGE_IDS_PIN,
  AGENT_ROUTINE_STAGES_PIN,
  AGENT_TASK_STAGE_STATUSES_PIN,
  ROUTINE_STAGE_STATUS_LABELS_PIN,
} from "../../src/agent/routineStagePins.js";

describe("P21-B — the routine-stage pins mirror the surface contract exactly", () => {
  it("the stage ids pin matches the source (same literals, same frozen order)", () => {
    expect([...AGENT_ROUTINE_STAGE_IDS_PIN]).toEqual([...AGENT_ROUTINE_STAGE_IDS]);
  });

  it("every stage declaration field matches the source — the ONE workflow vocabulary", () => {
    expect(AGENT_ROUTINE_STAGES_PIN).toEqual(AGENT_ROUTINE_STAGES as unknown as typeof AGENT_ROUTINE_STAGES_PIN);
    for (let index = 0; index < AGENT_ROUTINE_STAGES.length; index += 1) {
      const source = AGENT_ROUTINE_STAGES[index]!;
      const pin = AGENT_ROUTINE_STAGES_PIN[index]!;
      expect(pin.stageId).toBe(source.stageId);
      expect(pin.title).toBe(source.title);
      expect(pin.handlerId).toBe(source.handlerId);
      expect(pin.branch).toBe(source.branch);
      expect(pin.advisory).toBe(source.advisory);
      expect(pin.authorityClass).toBe(source.authorityClass);
      expect(pin.prerequisites).toBe(source.prerequisites);
      expect(pin.checkpoint).toBe(source.checkpoint);
    }
  });

  it("the plan-status vocabulary + labels match the source (the plan pattern's own words)", () => {
    expect([...AGENT_TASK_STAGE_STATUSES_PIN]).toEqual([...AGENT_TASK_STAGE_STATUSES]);
    expect(ROUTINE_STAGE_STATUS_LABELS_PIN).toEqual(ROUTINE_STAGE_STATUS_LABELS as unknown as typeof ROUTINE_STAGE_STATUS_LABELS_PIN);
  });
});
