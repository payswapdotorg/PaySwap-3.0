/**
 * @payswap/app — the COMPOSER↔MISSION BINDING battery (P21-B, ADR-0014
 * D2; failing-first).
 *
 * The binding laws over a RECORDED fake mission plane (the channel
 * members' shapes) + the REAL browser task-session adapter:
 *
 * - a "pay" text through the COMPOSER seeds exactly ONE mission
 *   (idempotency: a duplicate submission converges — one mission, one
 *   task, never a second);
 * - the ask loop surfaces the deterministic nine-field questions IN
 *   ORDER as conversation turns, and the user's reply is captured
 *   through the plane (fail-closed: an invalid amount is refused, the
 *   ask repeats, nothing is coerced);
 * - NO route compilation before the intent compiles (NEEDS_INPUT gates:
 *   the ask loop owns the conversation while fields are missing);
 * - non-payment text NEVER activates the routine (zero plane calls);
 * - the composer's session record and the mission record stay LINKED —
 *   the link is re-derived from the task's persisted events after a
 *   reload (resumable; the app task store is the journey's session
 *   record);
 * - the honest unbound note: with NO plane bound, the composer keeps
 *   the localStorage task tier and discloses that the mission tier is
 *   not wired — never a faked mission.
 */

import { describe, expect, it } from "vitest";

import {
  createAgentComposerController,
  type AgentComposerController,
} from "../../src/agent/agentComposerController.js";
import {
  MISSION_INTAKE_UNBOUND_NOTE,
  type MissionIntakePlanePort,
} from "../../src/agent/missionIntakePins.js";
import type { AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";

const T0 = "2026-10-27T12:00:00Z";
const T1 = "2026-10-27T12:01:00Z";

/** The deterministic nine-field ask order (the mission plane's own). */
const ASK_ORDER = [
  "amountAndCurrency", "fundingSource", "recipient", "countryCorridor",
  "speedDeadline", "feeCap", "purpose", "privacyCompliance",
  "partialPaymentPreference",
] as const;

const QUESTIONS: Readonly<Record<string, string>> = Object.freeze({
  amountAndCurrency: "How much should move, and in which currency? (exact amount — PaySwap works in exact money, never approximations)",
  fundingSource: "Which funding source should the payment leave from?",
  recipient: "Who is the recipient?",
  countryCorridor: "Which corridor — source country, destination country and destination currency?",
  speedDeadline: "By when must it arrive?",
  feeCap: "What is your fee cap?",
  purpose: "What is the purpose of this payment?",
  privacyCompliance: "Any privacy or compliance constraints?",
  partialPaymentPreference: "Can this payment be settled partially, or must it be full?",
});

const VALID_REPLIES: Readonly<Record<string, string>> = Object.freeze({
  amountAndCurrency: "1250 USD",
  fundingSource: "the USD wallet",
  recipient: "the supplier",
  countryCorridor: "US KE KES",
  speedDeadline: "2026-10-28T12:00:00Z",
  feeCap: "uncapped",
  purpose: "supplier invoice 42",
  privacyCompliance: "none",
  partialPaymentPreference: "full",
});

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

interface RecordedPlane {
  readonly plane: MissionIntakePlanePort;
  /** Live read of the seedMission call count (a getter — never a stale snapshot). */
  readonly seedCalls: () => number;
  readonly captured: readonly { readonly fieldId: string; readonly value: unknown }[];
  readonly missions: ReadonlyMap<string, { readonly captured: Set<string> }>;
}

/**
 * A RECORDED fake of the mission-plane channel members (the exact member
 * shapes the desktop composition binds over paymentMissionSeed /
 * paymentMissionAskNextField / paymentMissionCapture). Fail-closed
 * validation mirrors the host's own law: an invalid value is a typed
 * refusal, never a coerced capture.
 */
function recordedPlane(options?: { readonly refuseFirstAmount?: boolean }): RecordedPlane {
  let seedCalls = 0;
  let missionSeq = 0;
  const missions = new Map<string, { captured: Set<string> }>();
  const captured: { fieldId: string; value: unknown }[] = [];
  const plane: MissionIntakePlanePort = {
    async seedMission(input) {
      seedCalls += 1;
      // seedMission convergence (the host's own law): the same direction
      // resumes the same mission — one mission, never a duplicate.
      for (const [id, mission] of missions) {
        void mission;
        return { missionId: id, action: "RESUMED" };
      }
      missionSeq += 1;
      const id = `task:PAYMENT_MISSION:${String(missionSeq).padStart(2, "0")}`;
      missions.set(id, { captured: new Set() });
      return { missionId: id, action: "CREATED" };
    },
    async askNextField(missionId) {
      const mission = missions.get(missionId);
      if (mission === undefined) throw new Error("unknown mission");
      const next = ASK_ORDER.find((field) => !mission.captured.has(field));
      return next === undefined ? null : { fieldId: next, question: QUESTIONS[next]! };
    },
    async captureField(missionId, fieldId, value) {
      const mission = missions.get(missionId);
      if (mission === undefined) throw new Error("unknown mission");
      if (!(ASK_ORDER as readonly string[]).includes(fieldId)) {
        throw new Error(`fieldId must be one of the nine intake fields`);
      }
      // The host's own fail-closed law, mirrored: an invalid amount is a
      // typed refusal (never coerced).
      if (fieldId === "amountAndCurrency") {
        const amount = value as { minorUnits?: unknown; currency?: unknown };
        if (typeof amount?.currency !== "string" || !/^[A-Z]{3}$/.test(amount.currency)) {
          throw new Error("amountAndCurrency.currency must match /^[A-Z]{3}$/ — never guessed or defaulted");
        }
        if (typeof amount?.minorUnits !== "string" || !/^(0|[1-9][0-9]*)$/.test(amount.minorUnits)) {
          throw new Error("amountAndCurrency.minorUnits must be a canonical non-negative decimal integer string (exact minor units)");
        }
        if (amount.minorUnits === "0") {
          throw new Error("amountAndCurrency.minorUnits must be POSITIVE — a zero-amount payment is not a payment");
        }
      }
      captured.push({ fieldId, value });
      mission.captured.add(fieldId);
    },
  };
  void options;
  return { plane, seedCalls: () => seedCalls, captured, missions };
}

function makeController(plane?: MissionIntakePlanePort): AgentComposerController {
  return createAgentComposerController({
    storage: fakeStorage(),
    clock: () => T0,
    ...(plane !== undefined ? { missionIntakePlane: plane } : {}),
  });
}

async function send(controller: AgentComposerController, text: string): Promise<void> {
  controller.setDraft(text);
  await controller.send();
}

describe("D2 — a 'pay' text seeds exactly ONE mission (the binding over the plane)", () => {
  it("a 'pay' text seeds ONE mission and ONE task; the pending ask owns the next text (never a second mission)", async () => {
    const recorded = recordedPlane();
    const controller = makeController(recorded.plane);
    await send(controller, "pay the supplier");
    expect(recorded.missions.size).toBe(1);
    // While an ask is pending, a repeat 'pay' text is an ANSWER (refused
    // by the strict amount grammar) — never a second mission or task.
    await send(controller, "pay the supplier again");
    expect(recorded.missions.size).toBe(1);
    expect(recorded.captured).toHaveLength(0);
    const state = controller.getState();
    expect(state.tasks.filter((task) => task.intentLine.startsWith("Payment mission"))).toHaveLength(1);
  });

  it("after the intake completes, a duplicate 'pay' submission converges on the SAME mission (the persisted link, never a re-seed)", async () => {
    const recorded = recordedPlane();
    const controller = makeController(recorded.plane);
    await send(controller, "pay the supplier");
    for (const fieldId of ASK_ORDER) {
      await send(controller, VALID_REPLIES[fieldId]!);
    }
    expect(controller.getState().missionIntake.phase).toBe("COMPLETE");
    const missionId = controller.getState().missionIntake.missionId;
    // The duplicate submission AFTER completion: same task, same mission.
    await send(controller, "pay the supplier");
    expect(recorded.missions.size).toBe(1);
    expect(recorded.seedCalls()).toBe(1);
    expect(controller.getState().missionIntake.missionId).toBe(missionId);
    expect(controller.getState().tasks.filter((task) => task.intentLine.startsWith("Payment mission"))).toHaveLength(1);
  });

  it("the ask loop surfaces the deterministic questions IN ORDER as conversation turns", async () => {
    const recorded = recordedPlane();
    const controller = makeController(recorded.plane);
    await send(controller, "pay the supplier");
    // The first ask surfaced with the plane's own question.
    const state = controller.getState();
    expect(state.missionIntake.pendingAsk?.fieldId).toBe("amountAndCurrency");
    expect(state.entries.some((entry) => entry.text.includes(QUESTIONS.amountAndCurrency!))).toBe(true);
    // Reply validly through all nine fields: the asks follow the canonical order.
    for (const fieldId of ASK_ORDER) {
      expect(controller.getState().missionIntake.pendingAsk?.fieldId).toBe(fieldId);
      await send(controller, VALID_REPLIES[fieldId]!);
    }
    expect(controller.getState().missionIntake.pendingAsk).toBeUndefined();
    expect(controller.getState().missionIntake.phase).toBe("COMPLETE");
    const askedFields = controller
      .getState()
      .tasks.find((task) => task.intentLine.startsWith("Payment mission"))!
      .events.filter((event) => event.kind === "MISSING_FIELD_ASKED")
      .map((event) => event.summary);
    expect(askedFields.length).toBeGreaterThanOrEqual(9);
  });

  it("capture validation FAILS CLOSED — an invalid amount is refused, the ask repeats, nothing is coerced", async () => {
    const recorded = recordedPlane();
    const controller = makeController(recorded.plane);
    await send(controller, "pay the supplier");
    await send(controller, "12.50 USD");
    const state = controller.getState();
    expect(state.missionIntake.pendingAsk?.fieldId).toBe("amountAndCurrency");
    expect(state.entries.some((entry) => entry.kind === "COMPOSER_ERROR")).toBe(true);
    expect(recorded.captured).toHaveLength(0);
    // The valid form still captures after the refusal.
    await send(controller, "1250 USD");
    expect(recorded.captured).toHaveLength(1);
    expect(recorded.captured[0]!.value).toEqual({ minorUnits: "1250", currency: "USD" });
    expect(controller.getState().missionIntake.pendingAsk?.fieldId).toBe("fundingSource");
  });

  it("a zero amount is refused by the plane's own law (the typed refusal surfaces, the ask repeats)", async () => {
    const recorded = recordedPlane();
    const controller = makeController(recorded.plane);
    await send(controller, "pay the supplier");
    await send(controller, "0 USD");
    expect(controller.getState().missionIntake.pendingAsk?.fieldId).toBe("amountAndCurrency");
    expect(recorded.captured).toHaveLength(0);
  });
});

describe("D2 — NEEDS_INPUT gates: no route compilation before the intent compiles", () => {
  it("while the intake is incomplete, the conversation stays in the ask loop — the panel shows the mission-intake state, never a plan", async () => {
    const recorded = recordedPlane();
    const controller = makeController(recorded.plane);
    await send(controller, "pay the supplier");
    const state = controller.getState();
    expect(state.missionIntake.phase).toBe("ASKING");
    expect(state.missionIntake.pendingAsk).not.toBeNull();
    // The task record carries the ask events (the journey's session record).
    const task = state.tasks.find((entry) => entry.intentLine.startsWith("Payment mission"))!;
    expect(task.events.some((event) => event.kind === "MISSING_FIELD_ASKED")).toBe(true);
  });
});

describe("D2 — non-payment text never activates the routine", () => {
  it("UNKNOWN text seeds NO task and calls NO plane member", async () => {
    const recorded = recordedPlane();
    const controller = makeController(recorded.plane);
    await send(controller, "what is the weather");
    expect(recorded.seedCalls()).toBe(0);
    expect(controller.getState().tasks).toHaveLength(0);
    expect(controller.getState().missionIntake.phase).toBe("UNBOUND");
  });
});

describe("D2 — the session record and the mission record stay LINKED (resumable)", () => {
  it("the link re-derives from the task's persisted events after a reload (a second controller over the SAME storage)", async () => {
    const storage = fakeStorage();
    const recorded = recordedPlane();
    const first = createAgentComposerController({
      storage,
      clock: () => T0,
      missionIntakePlane: recorded.plane,
    });
    await send(first, "pay the supplier");
    await send(first, "1250 USD");
    const missionId = first.getState().missionIntake.missionId;
    expect(missionId).toBe("task:PAYMENT_MISSION:01");

    // The reload: a NEW controller over the same persisted store + plane.
    const second = createAgentComposerController({
      storage,
      clock: () => T1,
      missionIntakePlane: recorded.plane,
    });
    await second.refresh();
    const state = second.getState();
    expect(state.missionIntake.missionId).toBe(missionId);
    expect(state.missionIntake.pendingAsk?.fieldId).toBe("fundingSource");
    // The task's PERSISTED record carries the link + the captured field
    // (read through the controller's ONE session port — the raw record).
    const view = state.tasks.find((entry) => entry.id.includes("PAYMENT_MISSION"))!;
    const record = await second.sessionPort().taskDetail(view.id);
    expect(record!.events.some((event) => event.kind === "FIELD_CAPTURED" && event.correlationRef === missionId)).toBe(true);
    expect(record!.events.some((event) => event.kind === "MISSING_FIELD_ASKED" && event.correlationRef === missionId)).toBe(true);
  });

  it("the mission's asks + captures land on the TASK timeline (the app task store is the journey's session record)", async () => {
    const recorded = recordedPlane();
    const controller = makeController(recorded.plane);
    await send(controller, "pay the supplier");
    await send(controller, "1250 USD");
    const task = controller
      .getState()
      .tasks.find((entry) => entry.intentLine.startsWith("Payment mission"))!;
    const kinds = task.events.map((event) => event.kind);
    expect(kinds).toContain("CREATED");
    expect(kinds).toContain("MISSING_FIELD_ASKED");
    expect(kinds).toContain("FIELD_CAPTURED");
  });
});

describe("D2 — the honest unbound tier (web: no plane, never a faked mission)", () => {
  it("with NO plane bound the composer keeps the task tier and discloses the unbound mission note", async () => {
    const controller = makeController();
    await send(controller, "pay the supplier");
    const state = controller.getState();
    // The task tier still works (the honest localStorage journey record).
    expect(state.tasks.filter((task) => task.intentLine.startsWith("Payment mission"))).toHaveLength(1);
    expect(state.missionIntake.phase).toBe("UNBOUND");
    expect(state.entries.some((entry) => entry.text.includes(MISSION_INTAKE_UNBOUND_NOTE))).toBe(true);
  });
});
