/**
 * Mission vocabulary + validation tests (P10-A, CONSOLE-WORKSPACE.md §3):
 * validateMissionIntake is fail-closed and deterministic — every finding
 * case covered (goal bounds, direction closure, the AmountSpec law,
 * hint/note bounds, unknown/extra shape); ok cases at the exact
 * boundaries; the summary projection; the fold-time record-shape law.
 */

import { describe, expect, it } from "vitest";

import {
  InvalidConsoleMissionError,
  MISSION_DRAFT_STATUSES,
  MISSION_EVENT_KINDS,
  MISSION_INTENT_DIRECTIONS,
  MISSION_LIFECYCLE_RUNGS,
  missionSummaryOf,
  validateMissionIntake,
  validateMissionRecordShape,
  type MissionIntakeInput,
  type MissionRecord,
} from "../src/index.ts";

const NOW = "2026-10-21T12:00:00Z";

function validIntake(): MissionIntakeInput {
  return {
    goalStatement: "Pay a Berlin invoice in EUR from my USD account",
    direction: "PAY",
  };
}

function makeRecord(overrides?: {
  id?: string;
  status?: MissionRecord["status"];
  intake?: MissionIntakeInput;
  events?: MissionRecord["events"];
  updatedAt?: string;
}): MissionRecord {
  const intake = overrides?.intake ?? validIntake();
  const validation = validateMissionIntake(intake);
  return {
    id: overrides?.id ?? "mission-1",
    createdAt: NOW,
    updatedAt: overrides?.updatedAt ?? NOW,
    status: overrides?.status ?? "DRAFT",
    intake,
    structuralValidation: validation,
    events:
      overrides?.events ??
      Object.freeze([
        { id: "evt-1", at: NOW, kind: "CREATED", summary: "Mission draft recorded." },
      ] as const),
  };
}

describe("the closed vocabularies (§3)", () => {
  it("pins the direction, status, event-kind and rung vocabularies", () => {
    expect([...MISSION_INTENT_DIRECTIONS]).toEqual(["PAY", "RECEIVE", "MOVE", "CONVERT"]);
    expect([...MISSION_DRAFT_STATUSES]).toEqual(["DRAFT", "INTENT_RECORDED", "ARCHIVED"]);
    expect([...MISSION_EVENT_KINDS]).toEqual([
      "CREATED",
      "REVISED",
      "INTENT_VALIDATED",
      "ARCHIVED",
    ]);
    expect([...MISSION_LIFECYCLE_RUNGS]).toEqual([
      "INTENT",
      "ELIGIBILITY",
      "PLANNING",
      "APPROVAL",
      "EXECUTION",
      "OBSERVATION",
      "EVIDENCE",
    ]);
  });
});

describe("validateMissionIntake (§3 validation law — fail-closed, deterministic)", () => {
  it("accepts the minimal valid intake", () => {
    expect(validateMissionIntake(validIntake())).toEqual({ ok: true, findings: [] });
  });

  it("accepts the full valid intake with a valid AmountSpec", () => {
    const intake: MissionIntakeInput = {
      goalStatement: "Move funds",
      direction: "MOVE",
      amount: { currency: "USD", minorUnits: "12345" },
      fundingLocationHint: "USD account at my bank",
      payoutLocationHint: "EUR account in Berlin",
      note: "Monthly sweep.",
    };
    expect(validateMissionIntake(intake)).toEqual({ ok: true, findings: [] });
  });

  it("accepts goal statements at the exact trimmed bounds (1 and 2000) and trims first", () => {
    expect(validateMissionIntake({ goalStatement: "x", direction: "PAY" }).ok).toBe(true);
    expect(
      validateMissionIntake({ goalStatement: "  ".padEnd(1999, "a") + " ", direction: "PAY" }).ok,
    ).toBe(true);
  });

  it("rejects an empty-after-trim goal statement", () => {
    const result = validateMissionIntake({ goalStatement: "   ", direction: "PAY" });
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(["goalStatement must not be empty after trimming"]);
  });

  it("rejects a goal statement over 2000 characters after trimming", () => {
    const result = validateMissionIntake({ goalStatement: "a".repeat(2001), direction: "PAY" });
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      "goalStatement must be at most 2000 characters after trimming (got 2001)",
    ]);
  });

  it("rejects a missing or non-string goal statement", () => {
    const missing = validateMissionIntake({ direction: "PAY" } as unknown as MissionIntakeInput);
    expect(missing.ok).toBe(false);
    expect(missing.findings).toEqual(["goalStatement is required and must be a string"]);
    const wrongType = validateMissionIntake({
      goalStatement: 42,
      direction: "PAY",
    } as unknown as MissionIntakeInput);
    expect(wrongType.findings).toEqual(["goalStatement is required and must be a string"]);
  });

  it("rejects a missing direction", () => {
    const result = validateMissionIntake({
      goalStatement: "Pay an invoice",
    } as unknown as MissionIntakeInput);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(["direction is required"]);
  });

  it("rejects an unknown direction as a finding — never silently coerced", () => {
    const result = validateMissionIntake({
      goalStatement: "Pay an invoice",
      direction: "FLY",
    } as unknown as MissionIntakeInput);
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toContain("direction must be one of PAY, RECEIVE, MOVE, CONVERT");
    expect(result.findings[0]).toContain('"FLY"');
    expect(result.findings[0]).toContain("never silently coerced");
  });

  it("enforces the AmountSpec law exactly — currency shape", () => {
    const result = validateMissionIntake({
      goalStatement: "Pay",
      direction: "PAY",
      amount: { currency: "usd", minorUnits: "100" },
    });
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      "amount: currency must be a 3-letter uppercase code, got 'usd'",
    ]);
  });

  it("enforces the AmountSpec law exactly — minorUnits canonical integer", () => {
    for (const minorUnits of ["-1", "1.5", "1e3", "007", "", "12 "]) {
      const result = validateMissionIntake({
        goalStatement: "Pay",
        direction: "PAY",
        amount: { currency: "EUR", minorUnits },
      });
      expect(result.ok, `minorUnits ${JSON.stringify(minorUnits)} must be a finding`).toBe(false);
      expect(result.findings[0]).toContain("amount:");
      expect(result.findings[0]).toContain("minorUnits");
    }
  });

  it("rejects a non-object amount when present", () => {
    const result = validateMissionIntake({
      goalStatement: "Pay",
      direction: "PAY",
      amount: "100 EUR",
    } as unknown as MissionIntakeInput);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(["amount must be an AmountSpec object when present"]);
  });

  it("rejects hint/note bound violations with the exact bounds (200 / 2000)", () => {
    const result = validateMissionIntake({
      goalStatement: "Pay",
      direction: "PAY",
      fundingLocationHint: "h".repeat(201),
      payoutLocationHint: "p".repeat(201),
      note: "n".repeat(2001),
    });
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      "fundingLocationHint must be at most 200 characters (got 201)",
      "payoutLocationHint must be at most 200 characters (got 201)",
      "note must be at most 2000 characters (got 2001)",
    ]);
  });

  it("accepts hints and notes at the exact bounds", () => {
    const result = validateMissionIntake({
      goalStatement: "Pay",
      direction: "PAY",
      fundingLocationHint: "h".repeat(200),
      payoutLocationHint: "p".repeat(200),
      note: "n".repeat(2000),
    });
    expect(result).toEqual({ ok: true, findings: [] });
  });

  it("rejects non-string hints/note when present", () => {
    const result = validateMissionIntake({
      goalStatement: "Pay",
      direction: "PAY",
      note: 7,
    } as unknown as MissionIntakeInput);
    expect(result.findings).toEqual(["note must be a string when present"]);
  });

  it("treats unknown/extra shape as findings — never silently coerced", () => {
    const result = validateMissionIntake({
      goalStatement: "Pay",
      direction: "PAY",
      urgency: "high",
      zeta: true,
    } as unknown as MissionIntakeInput);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      "unknown field \"urgency\" — the intake shape is closed; extra fields are findings, never coerced",
      "unknown field \"zeta\" — the intake shape is closed; extra fields are findings, never coerced",
    ]);
  });

  it("rejects non-object intake outright", () => {
    expect(validateMissionIntake(null as unknown as MissionIntakeInput)).toEqual({
      ok: false,
      findings: ["intake must be an object"],
    });
    expect(validateMissionIntake([] as unknown as MissionIntakeInput)).toEqual({
      ok: false,
      findings: ["intake must be an object"],
    });
  });

  it("accumulates findings deterministically in a fixed field order", () => {
    const input = {
      goalStatement: "",
      direction: "SIDWAYS",
      amount: { currency: "euros", minorUnits: "-3" },
      fundingLocationHint: "x".repeat(300),
      extra: 1,
    } as unknown as MissionIntakeInput;
    const first = validateMissionIntake(input);
    const second = validateMissionIntake(input);
    expect(first).toEqual(second);
    expect(first.ok).toBe(false);
    expect(first.findings.length).toBe(5);
    expect(first.findings[0]).toContain("goalStatement");
    expect(first.findings[1]).toContain("direction");
    expect(first.findings[2]).toContain("amount");
    expect(first.findings[3]).toContain("fundingLocationHint");
    expect(first.findings[4]).toContain("unknown field");
  });

  it("ok implies findings is empty and vice versa (the pinned invariant)", () => {
    expect(validateMissionIntake(validIntake()).findings).toEqual([]);
    const bad = validateMissionIntake({ goalStatement: "", direction: "NOPE" } as unknown as MissionIntakeInput);
    expect(bad.ok).toBe(false);
    expect(bad.findings.length).toBeGreaterThan(0);
  });
});

describe("missionSummaryOf (the projection)", () => {
  it("projects the recorded values verbatim, amount only when present", () => {
    const without = makeRecord();
    expect(missionSummaryOf(without)).toEqual({
      id: "mission-1",
      goalStatement: "Pay a Berlin invoice in EUR from my USD account",
      direction: "PAY",
      status: "DRAFT",
      updatedAt: NOW,
    });
    expect("amount" in missionSummaryOf(without)).toBe(false);

    const withAmount = makeRecord({
      intake: { goalStatement: "Move", direction: "MOVE", amount: { currency: "USD", minorUnits: "1" } },
    });
    expect(missionSummaryOf(withAmount).amount).toEqual({ currency: "USD", minorUnits: "1" });
  });
});

describe("validateMissionRecordShape (fold-time fail-closed law)", () => {
  it("accepts a well-formed record in every status", () => {
    for (const status of MISSION_DRAFT_STATUSES) {
      expect(() => validateMissionRecordShape(makeRecord({ status }))).not.toThrow();
    }
  });

  it("rejects malformed store-assigned structure with the typed error", () => {
    const cases: Array<[string, MissionRecord]> = [
      ["id", makeRecord({ id: "" })],
      ["status", { ...makeRecord(), status: "FLYING" } as unknown as MissionRecord],
      ["events", { ...makeRecord(), events: "nope" } as unknown as MissionRecord],
      [
        "event kind",
        {
          ...makeRecord(),
          events: [{ id: "e", at: NOW, kind: "DELETED", summary: "s" }],
        } as unknown as MissionRecord,
      ],
      ["intake", { ...makeRecord(), intake: null } as unknown as MissionRecord],
    ];
    for (const [label, record] of cases) {
      expect(() => validateMissionRecordShape(record), `case ${label}`).toThrow(
        InvalidConsoleMissionError,
      );
    }
  });

  it("accepts records whose intake carries findings (validity is carried, not re-validated)", () => {
    const drafty = makeRecord({
      intake: { goalStatement: "", direction: "PAY" },
    });
    expect(drafty.structuralValidation.ok).toBe(false);
    expect(() => validateMissionRecordShape(drafty)).not.toThrow();
    expect(missionSummaryOf(drafty).goalStatement).toBe("");
  });
});
