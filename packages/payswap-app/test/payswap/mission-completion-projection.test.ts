/**
 * @payswap/app — the PRODUCT TASK-COMPLETION PROJECTION battery, part 1:
 * the PURE DECISION CORE (P21-D Gap B, ADR-0014 D3/D8; failing-first).
 *
 * The projection laws (the named gap in the accepted bridge battery —
 * packages/desktop/test/payswap/p21-journey-bridge.test.ts, where the
 * TEST drove updateTaskStatus by hand): when a payment mission reaches
 * COMPLETED with an attempt CONFIRMED through the execution authority,
 * the PRODUCT projects the linked agent task to COMPLETED with the
 * ATTEMPT_CONFIRMED event through the PUBLIC session port.
 *
 * This file pins the pure core's decision table (the driver + link
 * laws live in ./mission-completion-driver.test.ts; the mount wiring in
 * ./mission-completion-wiring.test.tsx):
 *
 * - (a) COMPLETED mission + CONFIRMED attempt + non-terminal linked task
 *   → the PROJECT plan with the exact fields (status, event kind, the
 *   VERBATIM bridge-battery summary, correlationRef = missionId);
 * - (c) a mission that is not COMPLETED projects nothing (every status);
 * - (d) a COMPLETED mission with no CONFIRMED attempt projects nothing;
 * - (e) a linked task already terminal projects nothing (never a
 *   terminal-escape);
 * - (f) no linked task → the honest no-op (never a guessed task).
 */

import { describe, expect, it } from "vitest";

import {
  MISSION_COMPLETION_PROJECTION_SUMMARY,
  projectMissionCompletion,
} from "../../src/agent/missionCompletionProjection.js";
import type { AgentTaskPin, AgentTaskStatusPin } from "../../src/lib/agent-task-pins.js";
import type { PaymentMissionsStatus } from "../../src/agent/paymentMissionsPins.js";
import { MISSION_ID, T0, T1, missionDetail } from "./mission-completion-fixture.js";

describe("the pure decision core (projectMissionCompletion)", () => {
  const task = (status: AgentTaskStatusPin): AgentTaskPin => ({
    id: "task:PAYMENT_MISSION:01",
    kind: "PAYMENT_MISSION",
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    origin: "COMPOSER_TEXT",
    createdAt: T0,
    updatedAt: T1,
    status,
    events: [],
  });

  it("(a) a COMPLETED mission with a CONFIRMED attempt and a non-terminal linked task → the PROJECT plan with the exact fields", () => {
    const decision = projectMissionCompletion(missionDetail({}), task("ACTIVE"));
    expect(decision).toEqual({
      kind: "PROJECT",
      taskId: "task:PAYMENT_MISSION:01",
      missionId: MISSION_ID,
      toStatus: "COMPLETED",
      eventKind: "ATTEMPT_CONFIRMED",
      summary: MISSION_COMPLETION_PROJECTION_SUMMARY,
      correlationRef: MISSION_ID,
    });
  });

  it("the pinned summary is the bridge battery's own people-language phrasing, VERBATIM", () => {
    expect(MISSION_COMPLETION_PROJECTION_SUMMARY).toBe(
      "The mission's dispatch attempt confirmed through the execution authority — the task completes with the mission.",
    );
  });

  it("(c) a mission that is not COMPLETED projects nothing — every non-terminal mission status", () => {
    const statuses: readonly PaymentMissionsStatus[] = [
      "DRAFT", "ACTIVE", "AWAITING_EXTERNAL_RETURN", "PAUSED", "WAITING_FOR_OPPORTUNITIES",
    ];
    for (const status of statuses) {
      const decision = projectMissionCompletion(missionDetail({ status }), task("ACTIVE"));
      expect(decision).toEqual({ kind: "NO_PROJECTION", reason: "MISSION_NOT_COMPLETED" });
    }
  });

  it("(c) a FAILED / CANCELLED / EXPIRED mission projects nothing too", () => {
    for (const status of ["FAILED", "CANCELLED", "EXPIRED"] as const) {
      const decision = projectMissionCompletion(missionDetail({ status }), task("ACTIVE"));
      expect(decision).toEqual({ kind: "NO_PROJECTION", reason: "MISSION_NOT_COMPLETED" });
    }
  });

  it("(d) a COMPLETED mission with NO CONFIRMED attempt projects nothing — every non-confirmed outcome", () => {
    const outcomes = ["STARTED", "FAILED", "OUTCOME_UNKNOWN", "RECONCILED", "REFUSED"] as const;
    for (const outcome of outcomes) {
      const decision = projectMissionCompletion(
        missionDetail({ attemptOutcomes: [outcome] }),
        task("ACTIVE"),
      );
      expect(decision).toEqual({ kind: "NO_PROJECTION", reason: "NO_CONFIRMED_ATTEMPT" });
    }
  });

  it("(d) a COMPLETED mission with zero attempts recorded (the absent attempts field) projects nothing", () => {
    const decision = projectMissionCompletion(missionDetail({ attempts: false }), task("ACTIVE"));
    expect(decision).toEqual({ kind: "NO_PROJECTION", reason: "NO_CONFIRMED_ATTEMPT" });
  });

  it("(e) a linked task already terminal projects nothing — every terminal status (never a terminal-escape)", () => {
    for (const status of ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"] as const) {
      const decision = projectMissionCompletion(missionDetail({}), task(status));
      expect(decision).toEqual({ kind: "NO_PROJECTION", reason: "TASK_ALREADY_TERMINAL" });
    }
  });

  it("(f) no linked task → the honest no-op (never a guessed task)", () => {
    const decision = projectMissionCompletion(missionDetail({}), null);
    expect(decision).toEqual({ kind: "NO_PROJECTION", reason: "NO_LINKED_TASK" });
  });

  it("a COMPLETED mission with a mixed attempt history (a FAILED then a CONFIRMED attempt) still projects — at least one CONFIRMED", () => {
    const decision = projectMissionCompletion(
      missionDetail({ attemptOutcomes: ["FAILED", "CONFIRMED"] }),
      task("WAITING_FOR_OPPORTUNITIES"),
    );
    expect(decision.kind).toBe("PROJECT");
  });
});
