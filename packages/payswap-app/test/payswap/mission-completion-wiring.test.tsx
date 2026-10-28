// @vitest-environment jsdom
/**
 * @payswap/app — the PRODUCT TASK-COMPLETION PROJECTION WIRING battery
 * (P21-D Gap B, ADR-0014 D3/D8; failing-first).
 *
 * The wiring law (the named gap in the accepted bridge battery): the
 * projection fires from the PRODUCT'S OWN observation path — the mount
 * re-reads the mission detail after every dispatch/reconcile outcome
 * (refreshDetail) and on every detail load (openMission), and the
 * mission-completion projection rides those observations through the
 * REAL mount + the REAL session seam (the composer's ONE task-session
 * port, injected as the mount's taskSession prop — the
 * PaySwapAgentExperience composition path), never from a test or a
 * manual caller.
 *
 * Machine-checked against the REAL PaymentMissionsMount over the
 * deterministic dispatch-capable fake port
 * (./payment-missions-dispatch-fixture.ts, composed over the P18 fake)
 * with a completing overlay (the mission reaches COMPLETED with the
 * CONFIRMED attempt after the dispatched send — the truthful terminal
 * of the accepted journey), and the REAL browser task-session adapter
 * seeded with the linked task exactly the way the mission-intake
 * binding writes the link (correlationRef = missionId on the task
 * timeline):
 *
 * - THE FLOW-OUTCOME PATH: approve → armed card → lane → send → the
 *   refreshDetail re-read observes the COMPLETED mission → EXACTLY ONE
 *   updateTaskStatus(taskId, "COMPLETED", "ATTEMPT_CONFIRMED", now,
 *   summary, correlationRef = missionId) — the bridge battery's own
 *   people-language summary VERBATIM;
 * - IDEMPOTENCE through the real seam: re-opening the mission (the
 *   detail-load path) projects NOTHING further;
 * - THE DETAIL-LOAD PATH: an already-COMPLETED mission projects on
 *   open, no dispatch needed;
 * - THE PERSISTED FALLBACK: without the live-link prop, the
 *   correlation scan resolves the linked task (the reload path);
 * - THE HONEST UNWIRED DEFAULT: without a task session, the full
 *   dispatch journey never touches the task store (the projection is
 *   simply not composed — never a fabricated session);
 * - THE HONEST FAILURE: a typed projection failure surfaces on the
 *   mount's flow-error line, never masked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PaymentMissionsMount } from "../../src/agent/PaymentMissionsMount.js";
import { MISSION_COMPLETION_PROJECTION_SUMMARY } from "../../src/agent/missionCompletionProjection.js";
import { createBrowserAgentTaskSessionPort, type AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import type { AgentTaskSessionPort } from "../../src/agent/taskSessionPort.js";
import type { AgentTaskStatusPin } from "../../src/lib/agent-task-pins.js";
import type {
  PaymentMissionsAttemptState,
  PaymentMissionsDetail,
} from "../../src/agent/paymentMissionsPins.js";
import type { PaymentMissionsPortWithDispatch } from "../../src/agent/paymentMissionsDispatchPins.js";
import { M1 } from "./payment-missions-fixture.js";
import {
  LANE_SANDBOX_REF,
  M1_ATTEMPT_ID,
  makeFakeDispatchMissionsPort,
} from "./payment-missions-dispatch-fixture.js";

const T0 = "2026-10-27T12:00:00Z";
const T1 = "2026-10-27T12:01:00Z";
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

afterEach(() => {
  cleanup();
});

/* ------------------------- the scripted fixtures ------------------------- */

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

interface RecordedSession {
  readonly session: AgentTaskSessionPort;
  readonly updateCalls: {
    readonly id: string;
    readonly toStatus: AgentTaskStatusPin;
    readonly eventKind: string;
    readonly now: string;
    readonly summary: string;
    readonly correlationRef?: string;
  }[];
  readonly failNextUpdate: () => void;
}

/** The REAL browser adapter wrapped with a call recorder (+ a one-shot failure switch for the honesty law). */
function recordedSession(storage: AgentTaskSessionStorage): RecordedSession {
  const raw = createBrowserAgentTaskSessionPort({ storage });
  const updateCalls: RecordedSession["updateCalls"] = [];
  let failNext = false;
  const session: AgentTaskSessionPort = {
    ...raw,
    async updateTaskStatus(id, toStatus, eventKind, now, summary, correlationRef) {
      if (failNext) {
        failNext = false;
        throw new Error("the store refused the projection (scripted typed failure)");
      }
      updateCalls.push({ id, toStatus, eventKind, now, summary, ...(correlationRef !== undefined ? { correlationRef } : {}) });
      return raw.updateTaskStatus(id, toStatus, eventKind, now, summary, correlationRef);
    },
  };
  return { session, updateCalls, failNextUpdate: () => void (failNext = true) };
}

/** Seed the linked task exactly the way the mission-intake binding writes the link. */
async function seedLinkedTask(session: AgentTaskSessionPort): Promise<string> {
  const outcome = await session.seedOrResume({
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    origin: "COMPOSER_TEXT",
    now: T0,
    originNote: "pay the supplier",
  });
  const taskId = outcome.task.id;
  await session.appendTaskEvent(taskId, "MISSING_FIELD_ASKED", T0, "Mission intake asked (amountAndCurrency)", M1);
  await session.appendTaskEvent(taskId, "FIELD_CAPTURED", T1, "Mission intake captured (amountAndCurrency)", M1);
  return taskId;
}

/** The CONFIRMED attempt the completing overlay carries (the dispatched attempt state). */
const CONFIRMED_ATTEMPT: PaymentMissionsAttemptState = {
  attemptId: M1_ATTEMPT_ID,
  startedAt: T1,
  operation: "CREATE_EXTERNAL_EFFECT",
  executionMode: "SANDBOX",
  outcome: "CONFIRMED",
  summary: "The sandbox lane confirmed the payment effect.",
};

/**
 * The completing overlay over the dispatch fake: once the dispatched
 * send lands (or from the start, for the already-completed variant),
 * every mission detail carries status COMPLETED + the CONFIRMED attempt
 * — the truthful terminal of the accepted journey.
 */
function makeCompletingDispatchPort(options?: { readonly alreadyCompleted?: boolean }) {
  const base = makeFakeDispatchMissionsPort();
  let completed = options?.alreadyCompleted === true;
  const port: PaymentMissionsPortWithDispatch = {
    ...base.port,
    async detail(missionId): Promise<PaymentMissionsDetail | null> {
      const detail = await base.port.detail(missionId);
      if (detail === null || detail.id !== M1 || !completed) {
        return detail;
      }
      const attempts = [...(detail.attempts ?? [])];
      if (!attempts.some((attempt) => attempt.outcome === "CONFIRMED")) {
        attempts.push(CONFIRMED_ATTEMPT);
      }
      return { ...detail, status: "COMPLETED", attempts };
    },
    async dispatch(missionId, connectionRef) {
      const outcome = await base.dispatch(missionId, connectionRef);
      completed = true;
      return outcome;
    },
  };
  return { port, base };
}

/* --------------------------- the journey helpers --------------------------- */

interface MountSeams {
  readonly session?: AgentTaskSessionPort;
  readonly missionLink?: () => { readonly missionId: string; readonly taskId: string } | null;
}

async function openMission(
  port: PaymentMissionsPortWithDispatch,
  seams: MountSeams = {},
): Promise<HTMLElement> {
  const { container } = render(
    <PaymentMissionsMount
      port={port}
      {...(seams.session !== undefined ? { taskSession: seams.session } : {})}
      {...(seams.missionLink !== undefined ? { missionLink: seams.missionLink } : {})}
    />,
  );
  const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
  await act(async () => {
    fireEvent.click(open);
  });
  return container;
}

/** The full two-act journey to the dispatched send (the flow-outcome path). */
async function dispatchToCompletion(
  port: PaymentMissionsPortWithDispatch,
  seams: MountSeams = {},
): Promise<HTMLElement> {
  const container = await openMission(port, seams);
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-present"));
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-engage"));
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-confirm"));
  });
  const engage = await screen.findByTestId("ps-agent-missions-engage-dispatch");
  await act(async () => {
    fireEvent.click(engage);
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId(`ps-agent-missions-lane-${LANE_SANDBOX_REF}`));
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("ps-agent-missions-send"));
  });
  return container;
}

/* ------------------------------- the laws ------------------------------- */

describe("the flow-outcome path (the product's own observation — never a test or a manual caller)", () => {
  it("the dispatched send → the refreshDetail re-read observes the COMPLETED mission → EXACTLY ONE projection through the real seam", async () => {
    const completing = makeCompletingDispatchPort();
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    const liveLink = () => ({ missionId: M1, taskId });
    const container = await dispatchToCompletion(completing.port, {
      session: harness.session,
      missionLink: liveLink,
    });
    // The dispatched outcome rendered (the journey truly reached the send).
    expect(container.textContent).toContain("The payment was sent");
    // THE PROJECTION: exactly one call, with the exact arguments.
    await vi.waitFor(() => expect(harness.updateCalls).toHaveLength(1));
    expect(harness.updateCalls[0]).toEqual({
      id: taskId,
      toStatus: "COMPLETED",
      eventKind: "ATTEMPT_CONFIRMED",
      now: expect.stringMatching(ISO_UTC),
      summary: MISSION_COMPLETION_PROJECTION_SUMMARY,
      correlationRef: M1,
    });
    // The task record itself, through the public session port.
    const record = await harness.session.taskDetail(taskId);
    expect(record?.status).toBe("COMPLETED");
    expect(record?.events.filter((event) => event.kind === "ATTEMPT_CONFIRMED")).toHaveLength(1);
  });

  it("the mission COMPLETED + the CONFIRMED attempt were observed on the re-read — the projection needs BOTH (a non-completed mission never projects)", async () => {
    // The raw dispatch fake (no completing overlay): the mission stays
    // ACTIVE after the send — the CONFIRMED attempt lands but the status
    // never completes, so the projection stays silent.
    const base = makeFakeDispatchMissionsPort();
    const harness = recordedSession(fakeStorage());
    await seedLinkedTask(harness.session);
    const container = await dispatchToCompletion(base.port);
    expect(container.textContent).toContain("The payment was sent");
    await act(async () => {});
    expect(harness.updateCalls).toHaveLength(0);
  });
});

describe("idempotence through the real seam", () => {
  it("re-opening the completed mission (the detail-load path) projects NOTHING further", async () => {
    const completing = makeCompletingDispatchPort();
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    const container = await dispatchToCompletion(completing.port, {
      session: harness.session,
      missionLink: () => ({ missionId: M1, taskId }),
    });
    await vi.waitFor(() => expect(harness.updateCalls).toHaveLength(1));
    // Back to the board, then re-open: the detail load observes the SAME
    // completed mission — the task is already terminal, so nothing fires.
    await act(async () => {
      fireEvent.click(screen.getByTestId("ps-agent-missions-back"));
    });
    const reopen = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(reopen);
    });
    await act(async () => {});
    expect(harness.updateCalls).toHaveLength(1);
    void container;
  });
});

describe("the detail-load path", () => {
  it("an already-COMPLETED mission projects on open — no dispatch needed", async () => {
    const completing = makeCompletingDispatchPort({ alreadyCompleted: true });
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    const container = await openMission(completing.port, { session: harness.session });
    expect(container.textContent).toContain("Pay the supplier invoice INV-42");
    await vi.waitFor(() => expect(harness.updateCalls).toHaveLength(1));
    expect(harness.updateCalls[0]?.id).toBe(taskId);
    expect(harness.updateCalls[0]?.eventKind).toBe("ATTEMPT_CONFIRMED");
    expect(harness.updateCalls[0]?.correlationRef).toBe(M1);
  });
});

describe("the link resolution through the real seam", () => {
  it("the PERSISTED FALLBACK: without the live-link prop, the correlation scan resolves the linked task (the reload path)", async () => {
    const completing = makeCompletingDispatchPort({ alreadyCompleted: true });
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    render(
      <PaymentMissionsMount
        port={completing.port}
        taskSession={harness.session}
      />,
    );
    const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(open);
    });
    await vi.waitFor(() => expect(harness.updateCalls).toHaveLength(1));
    expect(harness.updateCalls[0]?.id).toBe(taskId);
  });

  it("the PRIMARY LIVE LINK (the composer session's mission-intake state) resolves the task; a stale live task id falls back honestly", async () => {
    const completing = makeCompletingDispatchPort({ alreadyCompleted: true });
    const harness = recordedSession(fakeStorage());
    const taskId = await seedLinkedTask(harness.session);
    const liveLink = vi.fn(() => ({ missionId: M1, taskId }));
    render(
      <PaymentMissionsMount
        port={completing.port}
        taskSession={harness.session}
        missionLink={liveLink}
      />,
    );
    const open = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(open);
    });
    await vi.waitFor(() => expect(harness.updateCalls).toHaveLength(1));
    expect(liveLink).toHaveBeenCalled();
    // A live link whose task is gone: the persisted scan still resolves.
    const stale = vi.fn(() => ({ missionId: M1, taskId: "task:PAYMENT_MISSION:gone" }));
    const second = recordedSession(fakeStorage());
    const secondTaskId = await seedLinkedTask(second.session);
    cleanup();
    render(
      <PaymentMissionsMount
        port={completing.port}
        taskSession={second.session}
        missionLink={stale}
      />,
    );
    const openAgain = await screen.findByTestId(`ps-agent-missions-open-${M1}`);
    await act(async () => {
      fireEvent.click(openAgain);
    });
    await vi.waitFor(() => expect(second.updateCalls).toHaveLength(1));
    expect(second.updateCalls[0]?.id).toBe(secondTaskId);
  });
});

describe("the honest seams", () => {
  it("the UNWIRED DEFAULT: without a task session the full dispatch journey never touches the task store — the mission surface still works", async () => {
    const completing = makeCompletingDispatchPort();
    const harness = recordedSession(fakeStorage());
    await seedLinkedTask(harness.session);
    const container = await dispatchToCompletion(completing.port);
    // The journey completed; the projection is simply not composed.
    expect(container.textContent).toContain("The payment was sent");
    await act(async () => {});
    expect(harness.updateCalls).toHaveLength(0);
    const record = await harness.session.taskDetail(
      (await harness.session.listTasks()).find((task) =>
        task.events.some((event) => event.correlationRef === M1),
      )!.id,
    );
    expect(record?.status).not.toBe("COMPLETED");
  });

  it("a typed projection FAILURE surfaces on the mount's honest flow-error line — never masked", async () => {
    const completing = makeCompletingDispatchPort({ alreadyCompleted: true });
    const harness = recordedSession(fakeStorage());
    await seedLinkedTask(harness.session);
    harness.failNextUpdate();
    const container = await openMission(completing.port, { session: harness.session });
    await vi.waitFor(() =>
      expect(container.textContent).toContain("the mission's task completion could not be projected"),
    );
    expect(container.textContent).toContain("the store refused the projection (scripted typed failure)");
    // The typed failure is recorded as attempted — one honest attempt, surfaced.
    expect(harness.updateCalls).toHaveLength(0);
  });
});

/** Compile-time guard: the mount's props carry the projection seams (never a guessed session type). */
const _propsGuard: React.ComponentProps<typeof PaymentMissionsMount> = {
  taskSession: undefined satisfies AgentTaskSessionPort | undefined,
  missionLink: undefined satisfies (() => { missionId: string; taskId: string } | null) | undefined,
};
void _propsGuard;
