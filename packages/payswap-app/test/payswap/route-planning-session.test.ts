/**
 * @payswap/app — the ROUTE-PLANNING SESSION battery (P16-D part 3,
 * gap-matrix D5; ADR-0009 D8; ROUTINE-CONTRACT stages 8/9a/9b).
 *
 * The session laws, machine-checked against the REAL session over the
 * REAL BROWSER_PROFILE adapter (the injected storage seam — the
 * established task-session test pattern) with a FAKE engine producing a
 * fixed validated engine view:
 *
 * - presentChoices records PREVIEW_PRESENTED with the SEPARATED view
 *   (the summary carries every section's counts + the view digest).
 * - chooseProceed writes NO AUTHORIZATION_GRANTED — the structural
 *   assert runs over EVERY event kind written to EVERY task.
 * - chooseWait → WAITING_FOR_OPPORTUNITIES + WAIT_STARTED +
 *   WAIT_CRITERIA_RECORDED (the criteria serialized into the record and
 *   parsed back losslessly) and PRESERVES a prior proceed selection.
 * - recordOpportunityMatch records OPPORTUNITY_MATCHED and the task
 *   STAYS WAITING; cancelWait/expireWait → ACTIVE (+WAIT_EXPIRED).
 * - Determinism: identical calls → byte-identical event records.
 * - Fail-closed: unknown task, prose criteria, non-integer instants,
 *   terminal tasks, drifted routine pins, impure match records.
 * - The clock law: an omitted `at` resolves through the injected clock
 *   (the package's ONE pinned ambient site default), and the source
 *   carries exactly ONE ambient reference — no second ambient read.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createBrowserAgentTaskSessionPort, type AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import { AgentTaskSessionError } from "../../src/agent/taskSessionPort.js";
import type { AgentTaskPin, AgentTaskSessionPort } from "../../src/agent/taskSessionPort.js";
import {
  createRoutePlanningSession,
  projectRoutePlanningProceedSelection,
  projectRoutePlanningWaiting,
  type RoutePlanningSession,
} from "../../src/agent/routePlanningSession.js";
import { RoutePlanningUxError } from "../../src/agent/routePlanningPins.js";
import type { RoutePlanningEnginePort, RoutePlanningEngineView, RoutePlanningOpportunityMatchPin } from "../../src/agent/routePlanningPins.js";
import { routePlanningViewDigestOf } from "../../src/agent/routePlanningPins.js";

const T0 = "2026-10-22T12:00:00Z";
const T1 = "2026-10-22T12:05:00Z";
const T2 = "2026-10-22T12:10:00Z";
const CLOCK = () => T1;

/** The in-memory storage seam (deterministic; localStorage-shaped). */
function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
  };
}

/** A fixed, fully-valid engine view (the fake engine's presentable plan). */
function fixedEngineView(intentRef = "intent:planning:001"): RoutePlanningEngineView {
  const value = {
    kind: "PRESENTED_PLAN" as const,
    routine: {
      routineId: "payment-route-planning" as const,
      routineVersion: "1.0.0" as const,
      skillContentDigest: "fnv1a64:1abba70f0107d1b2" as const,
    },
    intentRef,
    presentedAt: T0,
    availableNow: {
      ranked: [
        {
          planId: "plan:mixed-dex-offramp", shapeId: "mixed-dex-offramp", rank: 1,
          netNumeraireMinorUnits: "987654", numeraire: "EUR", hopCount: 3, railCrossings: 2,
          riskClass: "LOW", estimatedSettlementMs: 90000, unknownDimensions: [],
          paretoNonDominated: true, dominatedBy: [],
        },
      ],
      notScored: [
        { planId: "plan:provider-native-offramp", shapeId: "provider-native-offramp", reason: "no exact-money score on current quote evidence", unknownDimensions: ["SCORE"] },
      ],
      senderEligibleRouteIds: ["inst:sender-psp-native"],
      recipientEligibleRouteIds: ["inst:recipient-psp-payouts"],
    },
    exclusions: [
      { subject: "shape:onchain-direct", code: "ROUTE_UNSUPPORTED", message: "no venue observation for the direct on-chain shape" },
    ],
    truncation: {
      receipts: [{ dimension: "maxCandidates", limit: 10, actualCount: 12, disclosedAs: "TRUNCATED" as const }],
      coverage: "TRUNCATED" as const,
    },
    scenarios: {
      advisoryOnly: true as const,
      coverage: "COMPLETE" as const,
      outcomes: [
        { interventionId: "add-rail-c", kind: "RAIL_ADDED", counterfactualId: "cf:add-rail-c", counterfactualDigest: "fnv1a64:0123456789abcdef" },
      ],
    },
    waiting: {
      proposal: {
        waitId: "wait:route:001",
        families: ["liquidity" as const],
        categories: ["NEW_OPPORTUNITY" as const, "FEES_KNOWN" as const],
        maxWaitMs: 3_600_000,
        maxSettlementMs: 600_000,
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: "plan:mixed-dex-offramp" },
        tradeOffs: [],
        declaredAt: 1_771_612_800_000,
      },
    },
  };
  return { ...value, viewDigest: routePlanningViewDigestOf(value) };
}

/** The FAKE engine (a fixed view; the REAL engines bind at the acceptance tier). */
function fakeEngine(): RoutePlanningEnginePort {
  return { presentableView: () => fixedEngineView() };
}

/** A valid match record (the five pure facts — the no-dispatch law). */
function fixedMatch(): RoutePlanningOpportunityMatchPin {
  return {
    matchedOpportunityIds: ["op:liq:001"],
    categoryAttribution: { "op:liq:001": ["NEW_OPPORTUNITY", "FEES_KNOWN"] },
    expired: false,
    reasons: [],
    waitingNeverDispatches: false,
  };
}

interface Harness {
  readonly port: AgentTaskSessionPort;
  readonly session: RoutePlanningSession;
  seedTask(): Promise<AgentTaskPin>;
}

function makeHarness(clock: () => string = CLOCK): Harness {
  const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
  const session = createRoutePlanningSession({ session: port, clock });
  return {
    port,
    session,
    async seedTask(): Promise<AgentTaskPin> {
      const { task } = await port.seedOrResume({
        intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
        origin: "COMPOSER_TEXT",
        now: T0,
        originNote: "pay the supplier",
      });
      return task;
    },
  };
}

/** Every event kind written to every task (the structural no-authorization probe). */
async function allWrittenEvents(port: AgentTaskSessionPort): Promise<string[]> {
  const tasks = await port.listTasks();
  return tasks.flatMap((task) => task.events.map((event) => event.kind));
}

beforeEach(() => {
  // No shared state between laws (each harness binds its own storage).
});

describe("stage 8 — presentChoices records PREVIEW_PRESENTED with the separated view", () => {
  it("records PREVIEW_PRESENTED (status unchanged) with every section's counts + the view digest", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    const revised = await h.session.presentChoices(task.id, fakeEngine().presentableView({ taskRef: task.id }), T1);
    expect(revised.status).toBe(task.status);
    const event = revised.events.at(-1)!;
    expect(event.kind).toBe("PREVIEW_PRESENTED");
    expect(event.summary).toContain("1 available-now route(s)");
    expect(event.summary).toContain("1 retained unscored");
    expect(event.summary).toContain("1 typed exclusion(s)");
    expect(event.summary).toContain("search coverage TRUNCATED");
    expect(event.summary).toContain("1 advisory scenario(s)");
    expect(event.summary).toContain(fakeEngine().presentableView({ taskRef: task.id }).viewDigest);
  });

  it("fails closed on a drifted routine pin (a view from another routine never presents)", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    const view = fixedEngineView();
    const drifted = { ...view, routine: { ...view.routine, routineVersion: "9.9.9" as never } };
    await expect(h.session.presentChoices(task.id, drifted as never, T1)).rejects.toMatchObject({
      code: "INVALID_VIEW",
      name: "RoutePlanningUxError",
    });
  });
});

describe("stage 9a — chooseProceed records a REQUEST, never an authorization", () => {
  it("records the proceed REQUEST (ATTEMPT_STARTED, REQUEST-only summary) and NO AUTHORIZATION_GRANTED anywhere", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    await h.session.presentChoices(task.id, fakeEngine().presentableView({ taskRef: task.id }), T1);
    const revised = await h.session.chooseProceed(task.id, "plan:mixed-dex-offramp", T2);
    const event = revised.events.at(-1)!;
    expect(event.kind).toBe("ATTEMPT_STARTED");
    expect(event.correlationRef).toBe("plan:mixed-dex-offramp");
    expect(event.summary).toContain("a REQUEST record, never an authorization");
    // The summary deliberately carries NO authority-surface machine literal:
    // a text-level audit scan of the persisted record stays a CLEAN signal.
    expect(event.summary).not.toContain("AUTHORIZATION_GRANTED");
    // THE STRUCTURAL LAW: no event kind written to any task is AUTHORIZATION_GRANTED.
    const kinds = await allWrittenEvents(h.port);
    expect(kinds).not.toContain("AUTHORIZATION_GRANTED");
  });
});

describe("stage 9b — chooseWait declares the durable wait and preserves the proceed selection", () => {
  it("moves the task to WAITING with WAIT_STARTED + WAIT_CRITERIA_RECORDED (criteria serialized + parsed back losslessly)", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    const view = fakeEngine().presentableView({ taskRef: task.id });
    await h.session.chooseWait(task.id, view.waiting.proposal, T1);
    const revised = await h.port.taskDetail(task.id);
    expect(revised!.status).toBe("WAITING_FOR_OPPORTUNITIES");
    const kinds = revised!.events.map((event) => event.kind);
    expect(kinds).toEqual(["CREATED", "WAIT_STARTED", "WAIT_CRITERIA_RECORDED"]);
    const waiting = projectRoutePlanningWaiting(revised!.status, revised!.events);
    expect(waiting.criteriaRecordTruncated).toBe(false);
    expect(waiting.criteria).toEqual(view.waiting.proposal);
  });

  it("does NOT erase a recorded proceed selection (the fallback policy may reference it)", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    const view = fakeEngine().presentableView({ taskRef: task.id });
    await h.session.chooseProceed(task.id, "plan:mixed-dex-offramp", T1);
    const afterWait = await h.session.chooseWait(task.id, view.waiting.proposal, T2);
    const selection = projectRoutePlanningProceedSelection(afterWait.events);
    expect(selection).toEqual({ planId: "plan:mixed-dex-offramp", at: T1 });
  });
});

describe("the wait lifecycle — a match stays waiting; cancel/expire return to ACTIVE", () => {
  it("recordOpportunityMatch records OPPORTUNITY_MATCHED and the task STAYS WAITING", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    const view = fakeEngine().presentableView({ taskRef: task.id });
    await h.session.chooseWait(task.id, view.waiting.proposal, T1);
    const afterMatch = await h.session.recordOpportunityMatch(task.id, fixedMatch(), T2);
    expect(afterMatch.status).toBe("WAITING_FOR_OPPORTUNITIES");
    expect(afterMatch.events.at(-1)!.kind).toBe("OPPORTUNITY_MATCHED");
    const waiting = projectRoutePlanningWaiting(afterMatch.status, afterMatch.events);
    expect(waiting.matchedOpportunityIds).toEqual(["op:liq:001"]);
  });

  it("cancelWait returns the task to ACTIVE; expireWait returns it to ACTIVE with WAIT_EXPIRED", async () => {
    const first = makeHarness();
    const taskA = await first.seedTask();
    const view = fakeEngine().presentableView({ taskRef: taskA.id });
    await first.session.chooseWait(taskA.id, view.waiting.proposal, T1);
    const cancelled = await first.session.cancelWait(taskA.id, T2);
    expect(cancelled.status).toBe("ACTIVE");
    expect(cancelled.events.at(-1)!.kind).toBe("RESUMED");

    const second = makeHarness();
    const taskB = await second.seedTask();
    await second.session.chooseWait(taskB.id, fakeEngine().presentableView({ taskRef: taskB.id }).waiting.proposal, T1);
    const expired = await second.session.expireWait(taskB.id, T2);
    expect(expired.status).toBe("ACTIVE");
    expect(expired.events.at(-1)!.kind).toBe("WAIT_EXPIRED");
  });
});

describe("determinism + the clock law", () => {
  it("identical calls produce byte-identical event records", async () => {
    const run = async (): Promise<string> => {
      const h = makeHarness();
      const task = await h.seedTask();
      const view = fakeEngine().presentableView({ taskRef: task.id });
      await h.session.presentChoices(task.id, view, T1);
      await h.session.chooseProceed(task.id, "plan:mixed-dex-offramp", T2);
      await h.session.chooseWait(task.id, view.waiting.proposal, T2);
      await h.session.recordOpportunityMatch(task.id, fixedMatch(), T2);
      const tasks = await h.port.listTasks();
      return JSON.stringify(tasks);
    };
    expect(await run()).toBe(await run());
  });

  it("an omitted `at` resolves through the injected clock (the ONE pinned ambient-site default), never a second ambient read", async () => {
    const h = makeHarness(() => T1);
    const task = await h.seedTask();
    const revised = await h.session.chooseProceed(task.id, "plan:mixed-dex-offramp");
    expect(revised.events.at(-1)!.at).toBe(T1);
    // The source pins the ambient clock ONCE (the shared default binding),
    // exactly like the composer controller — the P5 discipline, checked.
    const source = readFileSync(join(process.cwd(), "src/agent/routePlanningSession.ts"), "utf8");
    expect(source.match(/\?\?\s*ambientMutationClock/g)).toHaveLength(1); // the ONE default binding
    expect(source.match(/^import \{ ambientMutationClock \}/m)).not.toBeNull(); // one import, no second read
    expect(source).not.toMatch(/Date\.now\(|new\s+Date\(|Math\.random\(/);
  });
});

describe("fail-closed laws", () => {
  it("an unknown task fails closed (typed)", async () => {
    const h = makeHarness();
    const view = fakeEngine().presentableView({ taskRef: "task:PAYMENT_MISSION:404" });
    await expect(h.session.presentChoices("task:PAYMENT_MISSION:404", view, T1)).rejects.toMatchObject({
      code: "UNKNOWN_TASK",
      name: "AgentTaskSessionError",
    });
    await expect(h.session.chooseWait("task:PAYMENT_MISSION:404", view.waiting.proposal, T1)).rejects.toBeInstanceOf(
      AgentTaskSessionError,
    );
  });

  it("prose criteria are rejected typed (a string is never a criteria record)", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    await expect(
      // @ts-expect-error -- runtime drift is refused, not coerced
      h.session.chooseWait(task.id, "wait for anything cheaper", T1),
    ).rejects.toMatchObject({ code: "INVALID_CRITERIA", name: "RoutePlanningUxError" });
    await expect(
      h.session.chooseWait(task.id, { ...fixedEngineView().waiting.proposal, maxWaitMs: 1.5 }, T1),
    ).rejects.toMatchObject({ code: "INVALID_CRITERIA" });
    await expect(
      h.session.chooseWait(task.id, { ...fixedEngineView().waiting.proposal, declaredAt: Number.NaN }, T1),
    ).rejects.toMatchObject({ code: "INVALID_CRITERIA" });
  });

  it("a malformed `at` instant fails closed (the port's strict ISO law)", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    await expect(h.session.chooseProceed(task.id, "plan:mixed-dex-offramp", "2026-10-22 12:00:00")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("a terminal task has no lawful route-planning mutation; wait mutations require WAITING", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    await h.port.updateTaskStatus(task.id, "CANCELLED", "CANCELLED", T1, "Cancelled by the operator");
    const view = fakeEngine().presentableView({ taskRef: task.id });
    await expect(h.session.presentChoices(task.id, view, T2)).rejects.toMatchObject({ code: "TERMINAL_TASK" });
    await expect(h.session.chooseWait(task.id, view.waiting.proposal, T2)).rejects.toMatchObject({ code: "TERMINAL_TASK" });

    const fresh = makeHarness();
    const live = await fresh.seedTask();
    await expect(fresh.session.recordOpportunityMatch(live.id, fixedMatch(), T1)).rejects.toMatchObject({
      code: "NOT_WAITING",
      name: "RoutePlanningUxError",
    });
  });

  it("an impure match record is rejected (an action-shaped key at any name, or a non-literal waitingNeverDispatches)", async () => {
    const h = makeHarness();
    const task = await h.seedTask();
    const view = fakeEngine().presentableView({ taskRef: task.id });
    await h.session.chooseWait(task.id, view.waiting.proposal, T1);
    await expect(
      h.session.recordOpportunityMatch(task.id, { ...fixedMatch(), dispatch: { kind: "auto" } } as never, T2),
    ).rejects.toMatchObject({ code: "INVALID_MATCH", name: "RoutePlanningUxError" });
    await expect(
      h.session.recordOpportunityMatch(task.id, { ...fixedMatch(), waitingNeverDispatches: true } as never, T2),
    ).rejects.toMatchObject({ code: "INVALID_MATCH" });
    // The typed error class itself is exported for host-side re-throw filters.
    expect(new RoutePlanningUxError("ENGINE_UNBOUND", "probe").code).toBe("ENGINE_UNBOUND");
  });
});
