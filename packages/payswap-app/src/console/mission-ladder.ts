/**
 * @payswap/app — the mission lifecycle ladder (CONSOLE-WORKSPACE.md §4).
 *
 * The ladder is the authority chain of AGENTS.md rendered honestly:
 * Goal/Intent → Eligibility → Planning → Approval → Execution →
 * Observation → Evidence. No client component, model, tool permission or
 * simulated result may mark a rung reached — in this deployment only
 * INTENT can ever be REACHED, and only the store's recorded intent
 * transition says so.
 *
 * The prerequisite strings below are VERBATIM from §4 (the recorded
 * contract vocabulary pins them in test/payswap/console-contract-fixture.ts;
 * the drift test asserts the mirror matches). Pure module: no React, no
 * DOM, no ambient state (§7).
 */

import type {
  MissionLifecycleRung,
  MissionRecord,
  MissionRungState,
} from "./contracts.js";

/** The ladder order (§4: the authority chain, top to bottom). */
export const MISSION_LADDER_RUNGS: readonly MissionLifecycleRung[] = [
  "INTENT",
  "ELIGIBILITY",
  "PLANNING",
  "APPROVAL",
  "EXECUTION",
  "OBSERVATION",
  "EVIDENCE",
];

/* The §4 typed prerequisites — VERBATIM. */

export const INTENT_PREREQUISITE =
  "The intent has not been recorded yet — complete the intake review to record it." as const;

export const ELIGIBILITY_PREREQUISITE =
  "Capability discovery is not configured in this deployment. Missions cannot be evaluated for eligibility until a capability discovery plane exists — nothing here may guess eligibility." as const;

export const PLANNING_PREREQUISITE =
  "No planning plane is configured. Candidate plans are compiled by the economic execution graph when a planning plane exists; this deployment has none — the honest state is planning unavailable, never an invented plan." as const;

export const APPROVAL_PREREQUISITE =
  "No approval plane is configured. Consequential actions require PaySwap authorization — material terms and authority scope — before execution; with no trust plane configured there is nothing to approve and nothing approved." as const;

export const EXECUTION_PREREQUISITE =
  "No execution plane is configured. PaySwap never executes money movement from the console; execution requires the financial protocol with a connected capability, and no capability is connected in this deployment." as const;

export const OBSERVATION_PREREQUISITE =
  "No observations exist. Observations are provider-verified facts recorded by the execution plane; with no execution there is nothing to observe, and UNKNOWN is never rendered as success or failure." as const;

export const EVIDENCE_PREREQUISITE =
  "No evidence records exist. Evidence is produced by reconciliation of executed effects; no effect has been executed." as const;

/** The §4 prerequisite carried by a rung (total over the ladder). */
export function rungPrerequisite(rung: MissionLifecycleRung): string {
  switch (rung) {
    case "INTENT":
      return INTENT_PREREQUISITE;
    case "ELIGIBILITY":
      return ELIGIBILITY_PREREQUISITE;
    case "PLANNING":
      return PLANNING_PREREQUISITE;
    case "APPROVAL":
      return APPROVAL_PREREQUISITE;
    case "EXECUTION":
      return EXECUTION_PREREQUISITE;
    case "OBSERVATION":
      return OBSERVATION_PREREQUISITE;
    case "EVIDENCE":
      return EVIDENCE_PREREQUISITE;
  }
}

/**
 * Is INTENT reached for this record? §4: exactly when
 * `status === "INTENT_RECORDED"` (or "ARCHIVED", which preserves the
 * reached rungs at archive time) — the letter of the doc. Every other
 * rung is unreachable in this deployment and renders its VERBATIM
 * typed prerequisite.
 */
export function isIntentReached(record: MissionRecord): boolean {
  return record.status === "INTENT_RECORDED" || record.status === "ARCHIVED";
}

/**
 * foldMissionLadder (§4): INTENT is REACHED exactly when the recorded
 * status says the intent was recorded (archiving preserves it); every
 * other rung renders NOT_REACHED_PREREQUISITE with the verbatim §4
 * string. Pure and deterministic.
 */
export function foldMissionLadder(record: MissionRecord): readonly MissionRungState[] {
  const intentReached = isIntentReached(record);
  return MISSION_LADDER_RUNGS.map((rung) => {
    if (rung === "INTENT" && intentReached) {
      return { rung: "INTENT", state: "REACHED" } as const;
    }
    return {
      rung,
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: rungPrerequisite(rung),
    } as const;
  });
}

/**
 * The honest evidence line for a record: verbatim from §4 EVIDENCE when
 * unreached. The pinned §3 MissionRungState union can only express
 * REACHED for the INTENT rung — EVIDENCE:REACHED is not expressible
 * (no execution plane exists, so no evidence records can exist) — which
 * makes the verbatim §4 line the only honest evidence note for every
 * record this deployment can hold. Kept as a fold so the §3 shape (the
 * detail carries `evidenceNote`) has exactly one implementation.
 */
export function missionEvidenceNote(record: MissionRecord): string {
  foldMissionLadder(record); // the ladder is the authority: EVIDENCE never reaches.
  return EVIDENCE_PREREQUISITE;
}
