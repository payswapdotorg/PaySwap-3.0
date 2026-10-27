// @vitest-environment jsdom
/**
 * @payswap/app — the WAIT CONTROLS battery (P21-B run 3, ADR-0014 D9/D10
 * — the D10 wait re-check, cancel and expiry controls).
 *
 * The wait surface's user controls, machine-checked against the app's
 * own seams (a scripted FAKE re-check plane — the REAL evaluator is
 * battery-bound renderer-side; no engine, no network, no ambient clock):
 *
 * - THE HONEST TIER: an unbound re-check plane renders the not-wired
 *   note (never a silent no-op button).
 * - RE-CHECK: the control recomputes over the port's fresh facts — a
 *   scripted observation FLIP changes the rendered result; the outcome
 *   facts render (matched / not matched / expired-together + stale ids
 *   + the DATA instant).
 * - A MATCH NEVER DISPATCHES: a match records OPPORTUNITY_MATCHED
 *   through the session and the task STAYS WAITING; NO ATTEMPT_STARTED
 *   or AUTHORIZATION_GRANTED event follows the match; the matched
 *   rendering says re-plan REQUIRED and offers re-presentation, never a
 *   dispatch.
 * - CANCEL wires end-to-end (the task leaves WAITING).
 * - EXPIRY fires on the declared bound: the evaluator's expired fact
 *   surfaces the expire control → the session's expireWait → WAIT_EXPIRED.
 * - The outcome pin mirrors the authorities' never-dispatch literals.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import { createAgentComposerController } from "../../src/agent/agentComposerController.js";
import { AgentComposerPanel } from "../../src/agent/AgentComposerPanel.js";
import type { AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import { createRoutePlanningSession, validateRoutePlanningOpportunityMatch, type RoutePlanningSession } from "../../src/agent/routePlanningSession.js";
import type { RoutePlanningWaitCriteriaPin } from "../../src/agent/routePlanningPins.js";
import { bindRoutePlanningSession, bindRoutePlanningEngine, resetSharedRoutePlanningEngine, resetSharedRoutePlanningSession } from "../../src/agent/RoutePlanningMount.js";
import { routePlanningViewDigestOf, type RoutePlanningEnginePort, type RoutePlanningEngineView } from "../../src/agent/routePlanningPins.js";
import {
  opportunityMatchOfRecheck,
  WAIT_RECHECK_UNBOUND_NOTE,
  type WaitRecheckOutcomePin,
  type WaitRecheckPlanePort,
} from "../../src/agent/waitRecheckPins.js";
import {
  bindSharedWaitRecheckPlane,
  resetSharedWaitRecheckPlane,
  sharedWaitRecheckPlane,
} from "../../src/agent/waitRecheckShared.js";

const T0 = "2026-10-27T12:00:00Z";
const T1 = "2026-10-27T12:05:00Z";

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function criteria(): RoutePlanningWaitCriteriaPin {
  return {
    waitId: "wait:route:001",
    families: ["liquidity"],
    categories: ["NEW_OPPORTUNITY"],
    maxWaitMs: 3_600_000,
    maxSettlementMs: 600_000,
    fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE", routeRef: "plan:none" },
    tradeOffs: [],
    declaredAt: Date.parse(T0),
  };
}

function outcome(overrides?: Partial<WaitRecheckOutcomePin>): WaitRecheckOutcomePin {
  return {
    recheckedAt: T1,
    matchedOpportunityIds: [],
    categoryAttribution: {},
    staleOpportunityIds: [],
    expired: false,
    reasons: [],
    waitingNeverDispatches: false,
    neverAutoDispatches: true,
    ...overrides,
  };
}

/** A scripted FAKE plane (the REAL evaluator binds renderer-side). */
function scriptedPlane(results: WaitRecheckOutcomePin[]): WaitRecheckPlanePort & { calls(): number } {
  let calls = 0;
  const port: WaitRecheckPlanePort = {
    recheckWait: async () => {
      const result = results[Math.min(calls, results.length - 1)]!;
      calls += 1;
      return result;
    },
  };
  return { ...port, calls: () => calls };
}

/** A fixed, fully-valid engine view (the panel battery's own shape, compact). */
function fixedEngineView(): RoutePlanningEngineView {
  const value = {
    kind: "PRESENTED_PLAN" as const,
    routine: {
      routineId: "payment-route-planning" as const,
      routineVersion: "1.0.0" as const,
      skillContentDigest: "fnv1a64:1abba70f0107d1b2" as const,
    },
    intentRef: "intent:planning:001",
    presentedAt: T0,
    availableNow: { ranked: [], notScored: [], senderEligibleRouteIds: [], recipientEligibleRouteIds: [] },
    exclusions: [],
    truncation: { receipts: [], coverage: "COMPLETE" as const },
    scenarios: { advisoryOnly: true as const, coverage: "COMPLETE" as const, outcomes: [] },
    waiting: {
      proposal: {
        waitId: "wait:route:001",
        families: ["liquidity" as const],
        categories: ["NEW_OPPORTUNITY" as const],
        maxWaitMs: 3_600_000,
        maxSettlementMs: 600_000,
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: "plan:none" },
        tradeOffs: [],
        declaredAt: Date.parse(T0),
      },
    },
  };
  return { ...value, viewDigest: routePlanningViewDigestOf(value) };
}

/** The fixed engine (the mount's presentableView seam — deterministic). */
function fixedEngine(): RoutePlanningEnginePort {
  return { presentableView: () => fixedEngineView() };
}

/** Seed a payment-mission task, choose Wait, bind the engine + session, and compose the panel. */
async function waitedComposer() {
  const controller = createAgentComposerController({ clock: () => T0, storage: fakeStorage() });
  await controller.seedFromSurface({
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    originNote: "pay the supplier",
    area: "payments",
  });
  const task = (await controller.sessionPort().listTasks())[0]!;
  const session: RoutePlanningSession = createRoutePlanningSession({
    session: controller.sessionPort(),
    clock: () => T0,
  });
  await session.chooseWait(task.id, criteria(), T0);
  bindRoutePlanningEngine(fixedEngine());
  bindRoutePlanningSession(session);
  await controller.refresh();
  return { controller, session, taskId: task.id };
}

describe("the wait re-check pin (the outcome mirrors the authorities' never-dispatch laws)", () => {
  it("opportunityMatchOfRecheck produces the VALID five-key match record (pure facts only)", () => {
    const recheck = outcome({
      matchedOpportunityIds: ["opportunity:liquidity:usd:venue:001"],
      categoryAttribution: { "opportunity:liquidity:usd:venue:001": ["NEW_OPPORTUNITY"] },
      reasons: [],
    });
    const match = opportunityMatchOfRecheck(recheck);
    expect(() => validateRoutePlanningOpportunityMatch(match)).not.toThrow();
    expect(match.matchedOpportunityIds).toEqual(["opportunity:liquidity:usd:venue:001"]);
    expect(match.waitingNeverDispatches).toBe(false);
    expect(recheck.neverAutoDispatches).toBe(true);
  });
});

describe("the wait controls render the honest tiers", () => {
  afterEach(() => {
    cleanup();
    resetSharedWaitRecheckPlane();
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
  });

  it("an UNBOUND re-check plane renders the not-wired note (never a silent no-op button)", async () => {
    const { controller } = await waitedComposer();
    let panel: ReturnType<typeof render>;
    await act(async () => {
      panel = render(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    });
    const text = panel!.container.textContent ?? "";
    expect(text).toContain(WAIT_RECHECK_UNBOUND_NOTE);
    expect(panel!.container.querySelector("[data-testid='ps-agent-route-recheck']")).toBeNull();
  });

  /** Flush the mount's async re-check chain (deterministic, no timers). */
  const flush = async (): Promise<void> => {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  it("a BOUND plane + session render the Check-now control; a scripted observation FLIP changes the result", async () => {
    const plane = scriptedPlane([
      outcome({ staleOpportunityIds: ["opportunity:stale:001"] }),
      outcome({
        matchedOpportunityIds: ["opportunity:liquidity:usd:venue:001"],
        categoryAttribution: { "opportunity:liquidity:usd:venue:001": ["NEW_OPPORTUNITY"] },
        expired: true,
        reasons: ["WAIT_EXPIRED"],
      }),
    ]);
    const { controller } = await waitedComposer();
    let panel: ReturnType<typeof render>;
    await act(async () => {
      panel = render(<AgentComposerPanel state={controller.getState()} controller={controller} />);
      bindSharedWaitRecheckPlane(plane);
    });
    panel!.rerender(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    const checkNow = panel!.container.querySelector("[data-testid='ps-agent-route-recheck']") as HTMLButtonElement;
    expect(checkNow).not.toBeNull();

    // First check: not matched, one STALE observation reported, nothing dispatched.
    await act(async () => {
      checkNow.click();
    });
    await flush();
    panel!.rerender(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    let text = panel!.container.textContent ?? "";
    expect(text).toContain("Re-checked at");
    expect(text).toContain("No opportunity has matched");
    expect(text).toContain("opportunity:stale:001");
    expect(text).not.toContain("re-plan required");

    // Second check (the scripted FLIP): matched + expired TOGETHER — the
    // re-plan-required line renders, never a dispatch.
    await act(async () => {
      (panel!.container.querySelector("[data-testid='ps-agent-route-recheck']") as HTMLButtonElement).click();
    });
    await flush();
    panel!.rerender(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    text = panel!.container.textContent ?? "";
    expect(text).toContain("opportunity:liquidity:usd:venue:001");
    expect(text).toContain("re-plan required");
    expect(text).toContain("declared wait bound has passed");
    expect(plane.calls()).toBe(2);
  });

  it("a MATCH records OPPORTUNITY_MATCHED, the task STAYS WAITING, and NO ATTEMPT/AUTHORIZATION event follows", async () => {
    const plane = scriptedPlane([
      outcome({
        matchedOpportunityIds: ["opportunity:liquidity:usd:venue:001"],
        categoryAttribution: { "opportunity:liquidity:usd:venue:001": ["NEW_OPPORTUNITY"] },
      }),
    ]);
    const { controller } = await waitedComposer();
    let panel: ReturnType<typeof render>;
    await act(async () => {
      panel = render(<AgentComposerPanel state={controller.getState()} controller={controller} />);
      bindSharedWaitRecheckPlane(plane);
    });
    panel!.rerender(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    await act(async () => {
      (panel!.container.querySelector("[data-testid='ps-agent-route-recheck']") as HTMLButtonElement).click();
    });
    await act(async () => {
      await controller.refresh();
    });
    panel!.rerender(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    const task = (await controller.sessionPort().listTasks()).find((entry) => entry.id.includes("PAYMENT_MISSION"))!;
    expect(task.status).toBe("WAITING_FOR_OPPORTUNITIES");
    const kinds = task.events.map((event) => event.kind);
    expect(kinds).toContain("OPPORTUNITY_MATCHED");
    expect(kinds).not.toContain("ATTEMPT_STARTED");
    expect(kinds).not.toContain("AUTHORIZATION_GRANTED");
    // The re-plan control is a RE-PRESENTATION, never a dispatch: no
    // dispatch/execute/authorize testid exists anywhere.
    const dangerous = panel!.container.querySelectorAll(
      "[data-testid*='dispatch'], [data-testid*='execute'], [data-testid*='authorize']",
    );
    expect(dangerous).toHaveLength(0);
    expect(panel!.container.querySelector("[data-testid='ps-agent-route-replan']")).not.toBeNull();
  });

  it("CANCEL wires end-to-end (the task leaves WAITING)", async () => {
    const { controller } = await waitedComposer();
    let panel: ReturnType<typeof render>;
    await act(async () => {
      panel = render(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    });
    const cancel = panel!.container.querySelector("[data-testid='ps-agent-route-cancel-wait']") as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    await act(async () => {
      cancel.click();
    });
    await act(async () => {
      await controller.refresh();
    });
    const task = (await controller.sessionPort().listTasks()).find((entry) => entry.id.includes("PAYMENT_MISSION"))!;
    expect(task.status).toBe("ACTIVE");
    const cancelled = task.events.find((event) => event.summary.startsWith("Wait cancelled"));
    expect(cancelled).toBeDefined();
    expect(task.events.map((event) => event.kind)).toContain("RESUMED");
  });

  it("EXPIRY fires on the declared bound: the evaluator's expired fact surfaces the expire control → WAIT_EXPIRED", async () => {
    const plane = scriptedPlane([
      outcome({ expired: true, reasons: ["WAIT_EXPIRED"], matchedOpportunityIds: [], categoryAttribution: {} }),
    ]);
    const { controller } = await waitedComposer();
    let panel: ReturnType<typeof render>;
    await act(async () => {
      panel = render(<AgentComposerPanel state={controller.getState()} controller={controller} />);
      bindSharedWaitRecheckPlane(plane);
    });
    panel!.rerender(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    // Before the re-check, no expire control renders (the bound fact comes
    // from the evaluator, never a renderer clock).
    expect(panel!.container.querySelector("[data-testid='ps-agent-route-expire-wait']")).toBeNull();
    await act(async () => {
      (panel!.container.querySelector("[data-testid='ps-agent-route-recheck']") as HTMLButtonElement).click();
    });
    panel!.rerender(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    const expire = panel!.container.querySelector("[data-testid='ps-agent-route-expire-wait']") as HTMLButtonElement;
    expect(expire).not.toBeNull();
    await act(async () => {
      expire.click();
    });
    await act(async () => {
      await controller.refresh();
    });
    const task = (await controller.sessionPort().listTasks()).find((entry) => entry.id.includes("PAYMENT_MISSION"))!;
    expect(task.status).toBe("ACTIVE");
    expect(task.events.map((event) => event.kind)).toContain("WAIT_EXPIRED");
  });

  it("the shared seam binds and resets (the composition law)", () => {
    expect(sharedWaitRecheckPlane()).toBeUndefined();
    const plane = scriptedPlane([outcome()]);
    bindSharedWaitRecheckPlane(plane);
    expect(sharedWaitRecheckPlane()).toBe(plane);
    resetSharedWaitRecheckPlane();
    expect(sharedWaitRecheckPlane()).toBeUndefined();
  });
});
