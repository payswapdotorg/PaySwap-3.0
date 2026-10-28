/**
 * PaySwap Desktop (P13-C) — the payments-plane CONTRACT MIRROR tests.
 *
 * The payments tree pins the shared agent-task vocabulary and the
 * canonical PaymentIntent shape BY VALUE (the desktop host never
 * imports @payswap/* at runtime — the emitting tsconfig cannot consume
 * the contracts' .ts-suffixed source). This test imports the REAL
 * packages from the TEST TIER (where cross-package source imports are
 * lawful — the established pattern) and asserts behavioral fidelity:
 * drift between a pin and its source is a DEFECT, caught here.
 */

import { describe, expect, it } from "vitest";

import {
  AGENT_TASK_EVENT_KINDS,
  AGENT_TASK_ORIGINS,
  AGENT_TASK_RESUME_WINDOW_SECONDS,
  AGENT_TASK_STATUSES,
  AGENT_TASK_WAIT_VOCABULARY,
  SUPPORTED_AGENT_TASK_ORIGINS,
  TERMINAL_AGENT_TASK_STATUSES,
} from "../../../surface/src/agent-tasks.ts";
import { PAYMENT_INTENT_KEYS } from "../../../economic/src/payment-intent.ts";

import {
  PAYMENT_TASK_EVENT_KINDS,
  PAYMENT_TASK_ORIGINS,
  PAYMENT_TASK_STATUSES,
  PAYMENT_TASK_WAIT_VOCABULARY,
  PAYMENT_PLAN_SELECTION_LIMITS,
  SUPPORTED_PAYMENT_TASK_ORIGINS,
  TERMINAL_PAYMENT_TASK_STATUSES,
  isTerminalPaymentTaskStatus,
} from "../../src/host/payswap/payments/contracts.js";
import { PAYMENT_MISSION_RESUME_WINDOW_SECONDS } from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { PAYMENT_EVENT_KINDS } from "../../src/host/payswap/payments/payment-mission-store.js";
import { paymentMissionRecordStructureFinding } from "../../src/host/payswap/payments/payment-mission-store.js";
import { CANONICAL_PAYMENT_INTENT_KEYS } from "../../src/host/payswap/payments/adapters/economic-payment-intent.js";

describe("the agent-task vocabulary pin (surface agent-tasks.ts, TL-frozen)", () => {
  it("origins match exactly (voice declared-unsupported in both)", () => {
    expect([...PAYMENT_TASK_ORIGINS]).toEqual([...AGENT_TASK_ORIGINS]);
    expect([...SUPPORTED_PAYMENT_TASK_ORIGINS]).toEqual([...SUPPORTED_AGENT_TASK_ORIGINS]);
    expect(SUPPORTED_PAYMENT_TASK_ORIGINS).not.toContain("COMPOSER_VOICE");
  });

  it("statuses + terminal set match exactly", () => {
    expect([...PAYMENT_TASK_STATUSES]).toEqual([...AGENT_TASK_STATUSES]);
    expect([...TERMINAL_PAYMENT_TASK_STATUSES]).toEqual([...TERMINAL_AGENT_TASK_STATUSES]);
  });

  it("event kinds: the shared 21 mirror the surface's first 21 EXACTLY; ROUTINE_PINNED is app-store-only; the payment plane appends its own 22nd + 23rd (P17-A, ADR-0010 D3 + P21-B, ADR-0014 D3 + the P21-D reviewer-gate, Gap C)", () => {
    // The first 21 kinds are the shared agent-task vocabulary, mirrored
    // exactly; the 22nd is the payment plane's own PLAN_SELECTION_RECORDED
    // (the stage-9a landing site — a strict superset, pinned on both sides)
    // and the 23rd is the payment plane's own ATTEMPT_VERIFIED (the P21-D
    // reviewer-gate append, Gap C — the confirmed-attempt verification
    // closer; NEVER a substitute for RECONCILED).
    // (P21-B run 1 appended ROUTINE_PINNED as the SURFACE's 22nd shared
    // kind — stage 0's pin lands on the APP task store only, never the
    // mission timeline, so the payment plane never carries it.)
    expect(PAYMENT_TASK_EVENT_KINDS).toHaveLength(23);
    expect([...PAYMENT_TASK_EVENT_KINDS].slice(0, 21)).toEqual([...AGENT_TASK_EVENT_KINDS].slice(0, 21));
    expect(PAYMENT_TASK_EVENT_KINDS[21]).toBe("PLAN_SELECTION_RECORDED");
    expect(PAYMENT_TASK_EVENT_KINDS[22]).toBe("ATTEMPT_VERIFIED");
    expect([...AGENT_TASK_EVENT_KINDS]).not.toContain("PLAN_SELECTION_RECORDED");
    expect([...AGENT_TASK_EVENT_KINDS]).not.toContain("ATTEMPT_VERIFIED");
    expect(AGENT_TASK_EVENT_KINDS).toHaveLength(22);
    expect(AGENT_TASK_EVENT_KINDS[21]).toBe("ROUTINE_PINNED");
    expect([...PAYMENT_TASK_EVENT_KINDS]).not.toContain("ROUTINE_PINNED");
    expect(PAYMENT_TASK_EVENT_KINDS).toContain("OUTCOME_UNKNOWN");
    expect(PAYMENT_TASK_EVENT_KINDS).toContain("RECONCILED");
  });

  it("the STORE validator's pinned event-kind list equals the full 23-kind contracts set (the P16-D defect re-pin, P17-A + the P21-D reviewer-gate append)", () => {
    // The store re-pins its own list (never imports the contracts const)
    // so the persisted-record validator drifts only through a conscious
    // two-step change — this pin IS that drift check: before P17-A the
    // store pinned only 17 kinds and a mission persisting a wait event
    // loaded into QUARANTINE.
    expect(PAYMENT_EVENT_KINDS).toHaveLength(23);
    expect([...PAYMENT_EVENT_KINDS]).toEqual([...PAYMENT_TASK_EVENT_KINDS]);
    for (const kind of ["WAIT_STARTED", "WAIT_CRITERIA_RECORDED", "OPPORTUNITY_MATCHED", "WAIT_EXPIRED", "PLAN_SELECTION_RECORDED", "ATTEMPT_VERIFIED"]) {
      expect(PAYMENT_EVENT_KINDS).toContain(kind);
    }
  });

  it("the persisted-record validator accepts a wait-carrying + plan-selection-carrying mission (the quarantine defect is fixed)", () => {
    const mission = validMissionRecordFixture();
    const missionId = "task:PAYMENT_MISSION:00000000000000000000000000000001";
    expect(mission.id).toBe(missionId);
    expect(paymentMissionRecordStructureFinding(mission)).toBeNull();
    // The wait kinds and the plan-selection kind all validate as events.
    const waitKinds = ["WAIT_STARTED", "WAIT_CRITERIA_RECORDED", "OPPORTUNITY_MATCHED", "WAIT_EXPIRED", "PLAN_SELECTION_RECORDED"];
    const withWaitEvents = {
      ...mission,
      events: [
        ...waitKinds.map((kind, index) => ({
          id: `${missionId}-ev-${String(index + 2)}`,
          at: "2026-10-26T12:00:00.000Z",
          kind,
          summary: `persisted ${kind} event`,
        })),
        ...mission.events,
      ],
      planSelection: validPlanSelection(),
    };
    expect(paymentMissionRecordStructureFinding(withWaitEvents)).toBeNull();
  });

  it("the persisted planSelection shape is validated fail-closed when present (malformed → finding, never coerced)", () => {
    const mission = validMissionRecordFixture();
    // Non-object.
    expect(paymentMissionRecordStructureFinding({ ...mission, planSelection: "not-an-object" })).toMatch(/planSelection/);
    // Extra key (exactly the five keys are canonical).
    expect(
      paymentMissionRecordStructureFinding({
        ...mission,
        planSelection: { ...validPlanSelection(), authorizationArtifactId: "art:1" },
      }),
    ).toMatch(/planSelection/);
    // Missing key.
    const { planId: _removed, ...partial } = validPlanSelection();
    expect(paymentMissionRecordStructureFinding({ ...mission, planSelection: partial })).toMatch(/planSelection/);
    // Over-limit plan id (the honest maxima are enforced, never trimmed).
    expect(
      paymentMissionRecordStructureFinding({
        ...mission,
        planSelection: { ...validPlanSelection(), planId: "x".repeat(PAYMENT_PLAN_SELECTION_LIMITS.planId + 1) },
      }),
    ).toMatch(/planSelection.planId/);
    // Non-ISO selectedAt.
    expect(
      paymentMissionRecordStructureFinding({
        ...mission,
        planSelection: { ...validPlanSelection(), selectedAt: "2026-10-26 12:00:00" },
      }),
    ).toMatch(/planSelection.selectedAt/);
    // Absent planSelection stays valid (optional member).
    expect(paymentMissionRecordStructureFinding(mission)).toBeNull();
  });

  it("the resume window matches the shared contract (900s)", () => {
    expect(PAYMENT_MISSION_RESUME_WINDOW_SECONDS).toBe(AGENT_TASK_RESUME_WINDOW_SECONDS);
    expect(AGENT_TASK_RESUME_WINDOW_SECONDS).toBe(900);
  });
});

describe("the wait vocabulary mirror (P16-D, ADR-0009 D8)", () => {
  it("PAYMENT_TASK_WAIT_VOCABULARY mirrors AGENT_TASK_WAIT_VOCABULARY byte-identically", () => {
    expect(PAYMENT_TASK_WAIT_VOCABULARY).toEqual(AGENT_TASK_WAIT_VOCABULARY);
    expect(JSON.stringify(PAYMENT_TASK_WAIT_VOCABULARY)).toBe(
      JSON.stringify(AGENT_TASK_WAIT_VOCABULARY),
    );
  });

  it("matchAutoDispatches is the pinned LITERAL false on both sides (never derived)", () => {
    const desktopNever: false = PAYMENT_TASK_WAIT_VOCABULARY.matchAutoDispatches;
    const surfaceNever: false = AGENT_TASK_WAIT_VOCABULARY.matchAutoDispatches;
    expect(desktopNever).toBe(false);
    expect(surfaceNever).toBe(false);
  });

  it("the wait status is non-terminal (never enters a terminal list) and the four kinds are members of both event vocabularies", () => {
    expect(PAYMENT_TASK_WAIT_VOCABULARY.status).toBe("WAITING_FOR_OPPORTUNITIES");
    expect([...PAYMENT_TASK_STATUSES]).toContain("WAITING_FOR_OPPORTUNITIES");
    expect([...TERMINAL_PAYMENT_TASK_STATUSES]).not.toContain("WAITING_FOR_OPPORTUNITIES");
    expect([...TERMINAL_AGENT_TASK_STATUSES]).not.toContain("WAITING_FOR_OPPORTUNITIES");
    expect(isTerminalPaymentTaskStatus("WAITING_FOR_OPPORTUNITIES")).toBe(false);
    for (const kind of PAYMENT_TASK_WAIT_VOCABULARY.eventKinds) {
      expect([...PAYMENT_TASK_EVENT_KINDS]).toContain(kind);
      expect([...AGENT_TASK_EVENT_KINDS]).toContain(kind);
    }
  });

  it("the desktop wait vocabulary is frozen (the record and its event-kind list)", () => {
    expect(Object.isFrozen(PAYMENT_TASK_WAIT_VOCABULARY)).toBe(true);
    expect(Object.isFrozen(PAYMENT_TASK_WAIT_VOCABULARY.eventKinds)).toBe(true);
  });
});

describe("the canonical PaymentIntent pin (@payswap/economic)", () => {
  it("the 11-field canonical key set matches PAYMENT_INTENT_KEYS exactly", () => {
    expect([...CANONICAL_PAYMENT_INTENT_KEYS]).toEqual([...PAYMENT_INTENT_KEYS]);
    expect(PAYMENT_INTENT_KEYS).toHaveLength(11);
  });
});

/** A well-formed persisted mission record (the validator's happy path). */
function validMissionRecordFixture(): Record<string, unknown> {
  const intakeStates = {
    amountAndCurrency: { status: "MISSING" },
    fundingSource: { status: "MISSING" },
    recipient: { status: "MISSING" },
    countryCorridor: { status: "MISSING" },
    speedDeadline: { status: "MISSING" },
    feeCap: { status: "MISSING" },
    purpose: { status: "MISSING" },
    privacyCompliance: { status: "MISSING" },
    partialPaymentPreference: { status: "MISSING" },
  };
  return {
    id: "task:PAYMENT_MISSION:00000000000000000000000000000001",
    direction: "PAY",
    goalStatement: "pay the supplier",
    origin: "COMPOSER_TEXT",
    createdAt: "2026-10-26T12:00:00.000Z",
    updatedAt: "2026-10-26T12:00:00.000Z",
    status: "DRAFT",
    resumeFrom: "DRAFT",
    events: [
      {
        id: "task:PAYMENT_MISSION:00000000000000000000000000000001-ev-1",
        at: "2026-10-26T12:00:00.000Z",
        kind: "CREATED",
        summary: "Payment mission created (COMPOSER_TEXT) — goal: pay the supplier",
      },
    ],
    fields: intakeStates,
    attempts: [],
  };
}

/** A well-formed persisted plan selection (the stage-9a record). */
function validPlanSelection(): Record<string, string> {
  return {
    planId: "route-plan:pmt-intent:task:PAYMENT_MISSION:00000000000000000000000000000001:mixed-dex-offramp",
    viewDigest: "fnv1a64:1abba70f0107d1b2",
    routineId: "payment-route-planning",
    routineVersion: "1.0.0",
    selectedAt: "2026-10-26T12:05:00.000Z",
  };
}
