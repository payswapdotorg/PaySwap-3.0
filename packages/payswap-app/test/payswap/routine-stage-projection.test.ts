/**
 * @payswap/app — the STAGE-PROGRESS PROJECTION battery (P21-B, ADR-0014
 * D3; failing-first).
 *
 * The projection laws over PURE inputs (the persisted typed task events +
 * the mission timeline the channel reads + the deterministic engine view):
 *
 * - an EVENT-LESS mission projects every stage PENDING with its
 *   prerequisites rendered (a static checklist is never fabricated);
 * - a stage COMPLETES only from its typed result (ROUTINE_PINNED for
 *   stage 0; VALIDATED for stage 1; the engine view for 2-7;
 *   PREVIEW_PRESENTED for 8; the authority-surface events for 9a/10;
 *   WAIT_STARTED for 9b) — prose never completes anything;
 * - the ROUTINE_PINNED event PERSISTS (a reload re-reads the same pin;
 *   an identical re-pin is a no-op, a DRIFTED re-pin is a typed error);
 * - the projection REBUILDS IDENTICALLY after rehydration (the inputs
 *   serialize/deserialize through the task store; the output is
 *   byte-identical);
 * - the honest unbound mission tier: no mission timeline → null mission
 *   facts, never a fabricated timeline.
 */

import { describe, expect, it } from "vitest";

import {
  projectRoutineStageProgress,
  type RoutineStageProjectionInput,
} from "../../src/agent/routineStageProjection.js";
import {
  parseRoutinePinSummary,
  recordRoutinePin,
  RoutinePinDriftError,
  routinePinSummary,
  ROUTINE_PIN_SUMMARY_PREFIX,
} from "../../src/agent/routineStagePinning.js";
import {
  AGENT_ROUTINE_STAGES_PIN,
  AGENT_TASK_STAGE_STATUSES_PIN,
  ROUTINE_STAGE_STATUS_LABELS_PIN,
} from "../../src/agent/routineStagePins.js";
import {
  PINNED_ROUTE_PLANNING_ROUTINE,
  routePlanningViewDigestOf,
} from "../../src/agent/routePlanningPins.js";
import { createBrowserAgentTaskSessionPort } from "../../src/agent/taskSessionAdapter.js";
import type { AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import type { AgentTaskPin } from "../../src/lib/agent-task-pins.js";

const T0 = "2026-10-27T12:00:00Z";
const T1 = "2026-10-27T12:05:00Z";

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

/** Seed one payment-mission task through the REAL browser adapter. */
async function seedMissionTask(): Promise<AgentTaskPin> {
  const session = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
  const outcome = await session.seedOrResume({
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    origin: "COMPOSER_TEXT",
    now: T0,
    originNote: "pay the supplier",
  });
  return outcome.task;
}
void seedMissionTask;

const NO_EVENTS: readonly { readonly kind: string; readonly summary: string; readonly at: string }[] = [];

/** The empty-input projection: a mission-less, event-less view. */
const EMPTY_INPUT: RoutineStageProjectionInput = {
  taskEvents: NO_EVENTS,
  mission: null,
  engineView: null,
};

describe("D3 — the twelve-stage contract pin (the ONE workflow vocabulary)", () => {
  it("pins exactly the twelve canonical stage ids in the frozen order", () => {
    expect(AGENT_ROUTINE_STAGES_PIN.map((stage) => stage.stageId)).toEqual([
      "0", "1", "2", "3", "4", "5", "6", "7", "8", "9a", "9b", "10",
    ]);
  });

  it("uses the surface contract's own plan-status vocabulary", () => {
    expect([...AGENT_TASK_STAGE_STATUSES_PIN]).toEqual(["PENDING", "IN_PROGRESS", "COMPLETED"]);
    expect(ROUTINE_STAGE_STATUS_LABELS_PIN.PENDING).toBe("pending");
    expect(ROUTINE_STAGE_STATUS_LABELS_PIN.IN_PROGRESS).toBe("in progress");
    expect(ROUTINE_STAGE_STATUS_LABELS_PIN.COMPLETED).toBe("completed");
  });
});

describe("D3 — an event-less mission projects every stage PENDING", () => {
  it("all twelve stages are PENDING with their prerequisites, never a fabricated completion", () => {
    const progress = projectRoutineStageProgress({
      taskEvents: NO_EVENTS,
      mission: { missionId: "task:PAYMENT_MISSION:01", status: "ACTIVE", events: NO_EVENTS },
      engineView: null,
    });
    expect(progress).toHaveLength(12);
    for (const stage of progress) {
      expect(stage.status).toBe("PENDING");
      expect(stage.summary.length).toBeGreaterThan(0);
      const declaration = AGENT_ROUTINE_STAGES_PIN.find((entry) => entry.stageId === stage.stageId)!;
      expect(stage.prerequisites).toBe(declaration.prerequisites);
      expect(stage.checkpoint).toBe(declaration.checkpoint);
    }
  });

  it("an unbound mission tier (null mission) also projects every stage PENDING — never a fabricated timeline", () => {
    const progress = projectRoutineStageProgress(EMPTY_INPUT);
    expect(progress).toHaveLength(12);
    expect(progress.every((stage) => stage.status === "PENDING")).toBe(true);
  });
});

describe("D3 — a stage completes ONLY from its typed result", () => {
  it("stage 0 completes from ROUTINE_PINNED — nothing else completes it", () => {
    const withPin = projectRoutineStageProgress({
      taskEvents: [
        { kind: "ROUTINE_PINNED", summary: routinePinSummary(PINNED_ROUTE_PLANNING_ROUTINE), at: T0 },
      ],
      mission: { missionId: "task:PAYMENT_MISSION:01", status: "ACTIVE", events: NO_EVENTS },
      engineView: null,
    });
    expect(withPin[0]!.status).toBe("COMPLETED");
    expect(withPin[0]!.summary).toContain("payment-route-planning");
    // A prose claim of loading never completes stage 0.
    const withProse = projectRoutineStageProgress({
      taskEvents: [{ kind: "CREATED", summary: "the routine loaded (prose claim)", at: T0 }],
      mission: { missionId: "task:PAYMENT_MISSION:01", status: "ACTIVE", events: NO_EVENTS },
      engineView: null,
    });
    expect(withProse[0]!.status).not.toBe("COMPLETED");
  });

  it("stage 1 completes from the mission's VALIDATED event; the ask loop marks it in progress", () => {
    const asking = projectRoutineStageProgress({
      taskEvents: NO_EVENTS,
      mission: {
        missionId: "task:PAYMENT_MISSION:01",
        status: "ACTIVE",
        events: [{ kind: "MISSING_FIELD_ASKED", summary: "Mission intake asked (amountAndCurrency)", at: T0 }],
      },
      engineView: null,
    });
    expect(asking[1]!.status).toBe("IN_PROGRESS");
    const validated = projectRoutineStageProgress({
      taskEvents: NO_EVENTS,
      mission: {
        missionId: "task:PAYMENT_MISSION:01",
        status: "ACTIVE",
        events: [{ kind: "VALIDATED", summary: "the nine-field intake compiled a validated typed intent", at: T0 }],
      },
      engineView: null,
    });
    expect(validated[1]!.status).toBe("COMPLETED");
  });

  it("stages 2-7 complete from the deterministic engine view (the typed result), with grounded summaries", () => {
    const view = fixedEngineView();
    const progress = projectRoutineStageProgress({
      taskEvents: [{ kind: "ROUTINE_PINNED", summary: routinePinSummary(view.routine), at: T0 }],
      mission: {
        missionId: "task:PAYMENT_MISSION:01",
        status: "ACTIVE",
        events: [{ kind: "VALIDATED", summary: "compiled", at: T0 }],
      },
      engineView: view,
    });
    for (const stageId of ["2", "3", "4", "5", "6", "7"]) {
      const stage = progress.find((entry) => entry.stageId === stageId)!;
      expect(stage.status).toBe("COMPLETED");
      expect(stage.summary.length).toBeGreaterThan(0);
    }
    // Without the engine view, none of 2-7 completes.
    const noView = projectRoutineStageProgress({
      taskEvents: NO_EVENTS,
      mission: { missionId: "task:PAYMENT_MISSION:01", status: "ACTIVE", events: [{ kind: "VALIDATED", summary: "compiled", at: T0 }] },
      engineView: null,
    });
    for (const stageId of ["2", "3", "4", "5", "6", "7"]) {
      expect(noView.find((entry) => entry.stageId === stageId)!.status).toBe("PENDING");
    }
  });

  it("stage 8 completes from PREVIEW_PRESENTED; 9a from the authority-surface events; 9b from WAIT_STARTED; 10 from RECONCILED", () => {
    const progress = projectRoutineStageProgress({
      taskEvents: [
        { kind: "PREVIEW_PRESENTED", summary: "Route planning preview presented", at: T0 },
        { kind: "WAIT_STARTED", summary: "Wait started", at: T0 },
      ],
      mission: {
        missionId: "task:PAYMENT_MISSION:01",
        status: "WAITING_FOR_OPPORTUNITIES",
        events: [
          { kind: "ATTEMPT_STARTED", summary: "dispatch attempt started on the authority surface", at: T1 },
          { kind: "RECONCILED", summary: "reconciled from provider evidence", at: T1 },
        ],
      },
      engineView: fixedEngineView(),
    });
    expect(progress.find((entry) => entry.stageId === "8")!.status).toBe("COMPLETED");
    expect(progress.find((entry) => entry.stageId === "9a")!.status).toBe("COMPLETED");
    expect(progress.find((entry) => entry.stageId === "9b")!.status).toBe("COMPLETED");
    expect(progress.find((entry) => entry.stageId === "10")!.status).toBe("COMPLETED");
  });

  it("a proceed REQUEST alone never completes 9a (the approval belongs to the authority surface)", () => {
    const progress = projectRoutineStageProgress({
      taskEvents: [
        {
          kind: "ATTEMPT_STARTED",
          summary:
            "Proceed request recorded for plan 'plan:mixed-dex-offramp' (stage 9a requested) — a REQUEST record, never an authorization: the fresh scoped approval belongs to the real authority surface, never this composer.",
          at: T0,
        },
      ],
      mission: { missionId: "task:PAYMENT_MISSION:01", status: "ACTIVE", events: NO_EVENTS },
      engineView: fixedEngineView(),
    });
    const stage9a = progress.find((entry) => entry.stageId === "9a")!;
    expect(stage9a.status).toBe("IN_PROGRESS");
    expect(stage9a.summary).toContain("request");
  });
});

describe("D3 — ROUTINE_PINNED persists (the reload law)", () => {
  it("recordRoutinePin appends exactly one pin; an identical re-pin is a no-op; a drifted re-pin is a typed error", async () => {
    const session = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    const outcome = await session.seedOrResume({
      intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
      origin: "COMPOSER_TEXT",
      now: T0,
      originNote: "pay the supplier",
    });
    const first = await recordRoutinePin(session, outcome.task.id, PINNED_ROUTE_PLANNING_ROUTINE, T1);
    expect(first).toBe("PINNED");
    const afterFirst = await session.taskDetail(outcome.task.id);
    const pinEvents = afterFirst!.events.filter((event) => event.kind === "ROUTINE_PINNED");
    expect(pinEvents).toHaveLength(1);
    expect(pinEvents[0]!.summary.startsWith(ROUTINE_PIN_SUMMARY_PREFIX)).toBe(true);
    // Reload: the identical re-pin over the re-read record is a no-op.
    const second = await recordRoutinePin(session, outcome.task.id, PINNED_ROUTE_PLANNING_ROUTINE, T1);
    expect(second).toBe("ALREADY_PINNED");
    const afterSecond = await session.taskDetail(outcome.task.id);
    expect(afterSecond!.events.filter((event) => event.kind === "ROUTINE_PINNED")).toHaveLength(1);
    // Drift: a different routine never silently re-pins.
    await expect(
      recordRoutinePin(
        session,
        outcome.task.id,
        { ...PINNED_ROUTE_PLANNING_ROUTINE, routineVersion: "9.9.9" },
        T1,
      ),
    ).rejects.toBeInstanceOf(RoutinePinDriftError);
    const afterDrift = await session.taskDetail(outcome.task.id);
    expect(afterDrift!.events.filter((event) => event.kind === "ROUTINE_PINNED")).toHaveLength(1);
  });

  it("the pin summary round-trips (parseRoutinePinSummary recovers the pinned facts; prose never parses)", () => {
    const summary = routinePinSummary(PINNED_ROUTE_PLANNING_ROUTINE);
    expect(parseRoutinePinSummary(summary)).toEqual(PINNED_ROUTE_PLANNING_ROUTINE);
    expect(parseRoutinePinSummary("Routine loaded (prose)")).toBeNull();
  });
});

describe("D3 — the projection rebuilds identically after rehydration", () => {
  it("a projection over the re-read task record equals the pre-reload projection (byte-identical rows)", async () => {
    const storage = fakeStorage();
    const session = createBrowserAgentTaskSessionPort({ storage });
    const outcome = await session.seedOrResume({
      intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
      origin: "COMPOSER_TEXT",
      now: T0,
      originNote: "pay the supplier",
    });
    await recordRoutinePin(session, outcome.task.id, PINNED_ROUTE_PLANNING_ROUTINE, T1);
    await session.appendTaskEvent(outcome.task.id, "PREVIEW_PRESENTED", T1, "Route planning preview presented");

    const before = projectRoutineStageProgress({
      taskEvents: (await session.taskDetail(outcome.task.id))!.events,
      mission: {
        missionId: "task:PAYMENT_MISSION:01",
        status: "ACTIVE",
        events: [{ kind: "VALIDATED", summary: "compiled", at: T0 }],
      },
      engineView: fixedEngineView(),
    });

    // Rehydrate: a FRESH adapter over the SAME persisted storage.
    const rehydrated = createBrowserAgentTaskSessionPort({ storage });
    const after = projectRoutineStageProgress({
      taskEvents: (await rehydrated.taskDetail(outcome.task.id))!.events,
      mission: {
        missionId: "task:PAYMENT_MISSION:01",
        status: "ACTIVE",
        events: [{ kind: "VALIDATED", summary: "compiled", at: T0 }],
      },
      engineView: fixedEngineView(),
    });
    expect(after).toEqual(before);
    expect(after.find((entry) => entry.stageId === "0")!.status).toBe("COMPLETED");
  });
});

/* --------------------- the fixed validated engine view --------------------- */

function fixedEngineView() {
  const value = {
    kind: "PRESENTED_PLAN" as const,
    routine: {
      routineId: "payment-route-planning" as const,
      routineVersion: "1.0.0" as const,
      skillContentDigest: "fnv1a64:1abba70f0107d1b2" as const,
    },
    intentRef: "intent:planning:001",
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
        { planId: "plan:onchain-direct", shapeId: "onchain-direct", reason: "no exact-money score on current quote evidence", unknownDimensions: ["SCORE"] },
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
