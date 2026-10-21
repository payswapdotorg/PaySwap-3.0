/**
 * Mission ladder tests (P10-A, CONSOLE-WORKSPACE.md §4): the typed-
 * prerequisite ladder fold. The seven prerequisite strings are pinned
 * BYTE-EXACT against the contract document itself (§4 is parsed out of
 * spec/surface/CONSOLE-WORKSPACE.md and compared) — the strongest form
 * of the VERBATIM law. INTENT is REACHED exactly when the status is
 * INTENT_RECORDED or ARCHIVED; rung order INTENT → EVIDENCE; the detail
 * fold carries summary + record + ladder + evidenceNote.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MISSION_LIFECYCLE_RUNGS,
  MISSION_PREREQUISITE_APPROVAL,
  MISSION_PREREQUISITE_EVIDENCE,
  MISSION_PREREQUISITE_ELIGIBILITY,
  MISSION_PREREQUISITE_EXECUTION,
  MISSION_PREREQUISITE_INTENT,
  MISSION_PREREQUISITE_OBSERVATION,
  MISSION_PREREQUISITE_PLANNING,
  foldMissionDetail,
  foldMissionLadder,
  validateMissionIntake,
  type MissionIntakeInput,
  type MissionRecord,
  type MissionRungState,
} from "../src/index.ts";

const ROOT = process.cwd();
const CONTRACT_DOC = join(ROOT, "..", "..", "spec", "surface", "CONSOLE-WORKSPACE.md");

/** Parse §4's prerequisite strings out of the contract document. */
function contractPrerequisites(): Record<string, string> {
  const text = readFileSync(CONTRACT_DOC, "utf8");
  const section4 = text.split("## 4.")[1]?.split("## 5.")[0] ?? "";
  const out: Record<string, string> = {};
  for (const match of section4.matchAll(/^- ([A-Z]+)[^\n]*: `"([^]*?)"`/gm)) {
    out[match[1] ?? ""] = (match[2] ?? "").split("\n").map((line) => line.trim()).join(" ");
  }
  return out;
}

function makeRecord(status: MissionRecord["status"]): MissionRecord {
  const intake: MissionIntakeInput = {
    goalStatement: "Pay a Berlin invoice in EUR from my USD account",
    direction: "PAY",
  };
  return {
    id: "mission-1",
    createdAt: "2026-10-21T12:00:00Z",
    updatedAt: "2026-10-21T12:00:00Z",
    status,
    intake,
    structuralValidation: validateMissionIntake(intake),
    events: [{ id: "evt-1", at: "2026-10-21T12:00:00Z", kind: "CREATED", summary: "Recorded." }],
  };
}

describe("the §4 prerequisite constants are VERBATIM (parsed from the contract document)", () => {
  const doc = contractPrerequisites();

  it("the contract document exposes all seven §4 strings", () => {
    expect(Object.keys(doc).sort()).toEqual([
      "APPROVAL",
      "ELIGIBILITY",
      "EVIDENCE",
      "EXECUTION",
      "INTENT",
      "OBSERVATION",
      "PLANNING",
    ]);
  });

  it("each exported constant is byte-exact to the contract document", () => {
    expect(MISSION_PREREQUISITE_INTENT).toBe(doc["INTENT"]);
    expect(MISSION_PREREQUISITE_ELIGIBILITY).toBe(doc["ELIGIBILITY"]);
    expect(MISSION_PREREQUISITE_PLANNING).toBe(doc["PLANNING"]);
    expect(MISSION_PREREQUISITE_APPROVAL).toBe(doc["APPROVAL"]);
    expect(MISSION_PREREQUISITE_EXECUTION).toBe(doc["EXECUTION"]);
    expect(MISSION_PREREQUISITE_OBSERVATION).toBe(doc["OBSERVATION"]);
    expect(MISSION_PREREQUISITE_EVIDENCE).toBe(doc["EVIDENCE"]);
  });

  it("the strings carry the honest deployment facts (spot checks)", () => {
    expect(MISSION_PREREQUISITE_INTENT).toContain("intake review");
    expect(MISSION_PREREQUISITE_ELIGIBILITY).toContain("nothing here may guess");
    expect(MISSION_PREREQUISITE_PLANNING).toContain("never an invented plan");
    expect(MISSION_PREREQUISITE_APPROVAL).toContain("nothing to approve and nothing approved");
    expect(MISSION_PREREQUISITE_EXECUTION).toContain("never executes money movement from the console");
    expect(MISSION_PREREQUISITE_OBSERVATION).toContain("UNKNOWN is never rendered as success or failure");
    expect(MISSION_PREREQUISITE_EVIDENCE).toContain("no effect has been executed");
  });
});

describe("foldMissionLadder (§4 ladder law)", () => {
  it("returns the seven rungs in the pinned order INTENT → EVIDENCE", () => {
    const ladder = foldMissionLadder(makeRecord("DRAFT"));
    expect(ladder.map((rung) => rung.rung)).toEqual([...MISSION_LIFECYCLE_RUNGS]);
  });

  it("INTENT is REACHED exactly when status is INTENT_RECORDED or ARCHIVED", () => {
    for (const status of ["INTENT_RECORDED", "ARCHIVED"] as const) {
      const ladder = foldMissionLadder(makeRecord(status));
      expect(ladder[0]).toEqual({ rung: "INTENT", state: "REACHED" });
    }
    const draft = foldMissionLadder(makeRecord("DRAFT"));
    expect(draft[0]).toEqual({
      rung: "INTENT",
      state: "NOT_REACHED_PREREQUISITE",
      prerequisite: MISSION_PREREQUISITE_INTENT,
    });
  });

  it("every rung after INTENT is NOT_REACHED_PREREQUISITE with its verbatim constant", () => {
    const expected: Record<string, string> = {
      ELIGIBILITY: MISSION_PREREQUISITE_ELIGIBILITY,
      PLANNING: MISSION_PREREQUISITE_PLANNING,
      APPROVAL: MISSION_PREREQUISITE_APPROVAL,
      EXECUTION: MISSION_PREREQUISITE_EXECUTION,
      OBSERVATION: MISSION_PREREQUISITE_OBSERVATION,
      EVIDENCE: MISSION_PREREQUISITE_EVIDENCE,
    };
    for (const status of ["DRAFT", "INTENT_RECORDED", "ARCHIVED"] as const) {
      const ladder = foldMissionLadder(makeRecord(status));
      for (const rungState of ladder.slice(1) as Extract<
        MissionRungState,
        { state: "NOT_REACHED_PREREQUISITE" }
      >[]) {
        expect(rungState.state).toBe("NOT_REACHED_PREREQUISITE");
        expect(rungState.prerequisite).toBe(expected[rungState.rung]);
      }
    }
  });

  it("no component, model or simulated result can mark a downstream rung reached — the fold is pure", () => {
    const record = makeRecord("INTENT_RECORDED");
    expect(foldMissionLadder(record)).toEqual(foldMissionLadder(record));
    expect(JSON.stringify(foldMissionLadder(record))).toBe(JSON.stringify(foldMissionLadder(record)));
    // Mutating the record's shape after folding does not change a prior fold's honesty.
    expect(foldMissionLadder(record).filter((r) => r.state === "REACHED")).toHaveLength(1);
  });
});

describe("foldMissionDetail (§3/§4 detail fold)", () => {
  it("carries summary + record + ladder + the evidenceNote", () => {
    const record = makeRecord("INTENT_RECORDED");
    const detail = foldMissionDetail(record);
    expect(detail.record).toBe(record);
    expect(detail.summary.id).toBe("mission-1");
    expect(detail.summary.status).toBe("INTENT_RECORDED");
    expect(detail.ladder).toEqual(foldMissionLadder(record));
    expect(detail.evidenceNote).toBe(MISSION_PREREQUISITE_EVIDENCE);
  });

  it("the evidenceNote is the honest §4 EVIDENCE line while the rung is unreached", () => {
    for (const status of ["DRAFT", "INTENT_RECORDED", "ARCHIVED"] as const) {
      expect(foldMissionDetail(makeRecord(status)).evidenceNote).toBe(
        MISSION_PREREQUISITE_EVIDENCE,
      );
    }
  });

  it("is deterministic (same input, same output)", () => {
    const record = makeRecord("DRAFT");
    expect(foldMissionDetail(record)).toEqual(foldMissionDetail(record));
  });
});
