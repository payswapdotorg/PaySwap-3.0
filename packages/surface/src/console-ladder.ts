/**
 * @payswap/surface — the mission lifecycle ladder (P10-A, §4 VERBATIM).
 *
 * NET-NEW module implementing CONSOLE-WORKSPACE.md §4: the typed-
 * prerequisite ladder fold. The ladder is the authority chain of
 * AGENTS.md rendered honestly:
 * Goal/Intent → Eligibility → Planning → Approval → Execution →
 * Observation → Evidence. No client component, model, tool permission
 * or simulated result may mark a rung reached (INV-9/INV-23).
 *
 * INTENT is REACHED exactly when `status === "INTENT_RECORDED"`
 * (or "ARCHIVED", which preserves the reached rungs at archive time);
 * every other rung renders NOT_REACHED_PREREQUISITE with the VERBATIM
 * §4 string (exported as named constants so consumers — and the P10-C
 * views, the P10-D journeys — can assert them byte-exact).
 *
 * The prerequisite strings are pinned to the contract document by
 * test/console-ladder.test.ts, which parses §4 out of
 * spec/surface/CONSOLE-WORKSPACE.md and compares byte-for-byte.
 */

import { missionSummaryOf, validateMissionRecordShape, type MissionDetail, type MissionRecord, type MissionRungState } from "./console-missions.ts";

/** §4 INTENT (when not reached) — verbatim. */
export const MISSION_PREREQUISITE_INTENT =
  "The intent has not been recorded yet — complete the intake review to record it." as const;

/** §4 ELIGIBILITY — verbatim. */
export const MISSION_PREREQUISITE_ELIGIBILITY =
  "Capability discovery is not configured in this deployment. Missions cannot be evaluated for eligibility until a capability discovery plane exists — nothing here may guess eligibility." as const;

/** §4 PLANNING — verbatim. */
export const MISSION_PREREQUISITE_PLANNING =
  "No planning plane is configured. Candidate plans are compiled by the economic execution graph when a planning plane exists; this deployment has none — the honest state is planning unavailable, never an invented plan." as const;

/** §4 APPROVAL — verbatim. */
export const MISSION_PREREQUISITE_APPROVAL =
  "No approval plane is configured. Consequential actions require PaySwap authorization — material terms and authority scope — before execution; with no trust plane configured there is nothing to approve and nothing approved." as const;

/** §4 EXECUTION — verbatim. */
export const MISSION_PREREQUISITE_EXECUTION =
  "No execution plane is configured. PaySwap never executes money movement from the console; execution requires the financial protocol with a connected capability, and no capability is connected in this deployment." as const;

/** §4 OBSERVATION — verbatim. */
export const MISSION_PREREQUISITE_OBSERVATION =
  "No observations exist. Observations are provider-verified facts recorded by the execution plane; with no execution there is nothing to observe, and UNKNOWN is never rendered as success or failure." as const;

/** §4 EVIDENCE (the evidenceNote) — verbatim. */
export const MISSION_PREREQUISITE_EVIDENCE =
  "No evidence records exist. Evidence is produced by reconciliation of executed effects; no effect has been executed." as const;

/**
 * Fold the §4 ladder for one mission record. Pure and deterministic:
 * INTENT is REACHED exactly when the status is INTENT_RECORDED or
 * ARCHIVED; every downstream rung is NOT_REACHED_PREREQUISITE with its
 * verbatim §4 constant (no capability, planning, approval or execution
 * plane is configured in this deployment — and no console component can
 * ever mark one reached). Fail-closed on malformed store-assigned
 * structure (typed InvalidConsoleMissionError).
 */
export function foldMissionLadder(record: MissionRecord): readonly MissionRungState[] {
  validateMissionRecordShape(record);
  const intentReached = record.status === "INTENT_RECORDED" || record.status === "ARCHIVED";
  const ladder: MissionRungState[] = [
    intentReached
      ? { rung: "INTENT", state: "REACHED" }
      : {
          rung: "INTENT",
          state: "NOT_REACHED_PREREQUISITE",
          prerequisite: MISSION_PREREQUISITE_INTENT,
        },
    {
      rung: "ELIGIBILITY",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: MISSION_PREREQUISITE_ELIGIBILITY,
    },
    {
      rung: "PLANNING",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: MISSION_PREREQUISITE_PLANNING,
    },
    {
      rung: "APPROVAL",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: MISSION_PREREQUISITE_APPROVAL,
    },
    {
      rung: "EXECUTION",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: MISSION_PREREQUISITE_EXECUTION,
    },
    {
      rung: "OBSERVATION",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: MISSION_PREREQUISITE_OBSERVATION,
    },
    {
      rung: "EVIDENCE",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: MISSION_PREREQUISITE_EVIDENCE,
    },
  ];
  return ladder;
}

/**
 * Fold one mission record into its detail view: summary + record + the
 * §4 ladder + the honest evidence note (verbatim from §4 EVIDENCE while
 * the rung is unreached — which is always the case in this deployment).
 * Pure, deterministic, fail-closed.
 */
export function foldMissionDetail(record: MissionRecord): MissionDetail {
  return {
    summary: missionSummaryOf(record),
    record,
    ladder: foldMissionLadder(record),
    evidenceNote: MISSION_PREREQUISITE_EVIDENCE,
  };
}
