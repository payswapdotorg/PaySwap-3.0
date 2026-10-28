/**
 * @payswap/app — the TASK-COMPLETION PROJECTION fixture harness (P21-D
 * Gap B): the shared scripted seams the projection batteries ride —
 * a RECORDED wrapper over the REAL browser task-session adapter (every
 * updateTaskStatus call captured with exact arguments, then applied for
 * real, so the idempotence laws flow through the adapter's own
 * monotonic-terminal enforcement — a second terminal write would THROW,
 * proving the projection must check first), the linked-task seeder
 * (exactly the way the mission-intake binding writes the persisted
 * link: correlationRef = missionId on the task timeline), and the
 * configurable mission detail. A separate file so the batteries keep
 * the ≤400-line law (the payment-missions-dispatch-fixture pattern).
 */
import { vi } from "vitest";

import { createBrowserAgentTaskSessionPort, type AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import type { AgentTaskSessionPort } from "../../src/agent/taskSessionPort.js";
import type { AgentTaskPin, AgentTaskStatusPin } from "../../src/lib/agent-task-pins.js";
import type {
  PaymentMissionsAttemptOutcome,
  PaymentMissionsDetail,
  PaymentMissionsStatus,
} from "../../src/agent/paymentMissionsPins.js";

export const T0 = "2026-10-27T12:00:00Z";
export const T1 = "2026-10-27T12:01:00Z";
export const T4 = "2026-10-27T12:04:00Z";
export const MISSION_ID = "task:PAYMENT_MISSION:a1b2c3d4";

export function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

/** One captured updateTaskStatus call (exact arguments). */
export interface RecordedTaskUpdate {
  readonly id: string;
  readonly toStatus: AgentTaskStatusPin;
  readonly eventKind: string;
  readonly now: string;
  readonly summary: string;
  readonly correlationRef?: string;
}

export interface RecordedSession {
  readonly session: AgentTaskSessionPort;
  readonly updateCalls: RecordedTaskUpdate[];
  readonly raw: AgentTaskSessionPort;
}

/** The REAL adapter wrapped with a call recorder (the projection's exact-arguments law). */
export function recordedSession(storage: AgentTaskSessionStorage): RecordedSession {
  const raw = createBrowserAgentTaskSessionPort({ storage });
  const updateCalls: RecordedTaskUpdate[] = [];
  const updateTaskStatus = vi.fn(
    async (
      id: string,
      toStatus: AgentTaskStatusPin,
      eventKind: Parameters<AgentTaskSessionPort["updateTaskStatus"]>[2],
      now: string,
      summary: string,
      correlationRef?: string,
    ): Promise<AgentTaskPin> => {
      updateCalls.push({ id, toStatus, eventKind, now, summary, ...(correlationRef !== undefined ? { correlationRef } : {}) });
      return raw.updateTaskStatus(id, toStatus, eventKind, now, summary, correlationRef);
    },
  );
  return { session: { ...raw, updateTaskStatus }, updateCalls, raw };
}

/**
 * Seed a PAYMENT_MISSION task and link it to the mission exactly the way
 * the mission-intake binding does (correlationRef = missionId on the task
 * timeline); optionally drive it to a terminal status first.
 */
export async function seedLinkedTask(
  session: AgentTaskSessionPort,
  options?: { readonly terminal?: AgentTaskStatusPin },
): Promise<string> {
  const outcome = await session.seedOrResume({
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    origin: "COMPOSER_TEXT",
    now: T0,
    originNote: "pay the supplier",
  });
  const taskId = outcome.task.id;
  await session.appendTaskEvent(taskId, "MISSING_FIELD_ASKED", T0, "Mission intake asked (amountAndCurrency)", MISSION_ID);
  await session.appendTaskEvent(taskId, "FIELD_CAPTURED", T1, "Mission intake captured (amountAndCurrency)", MISSION_ID);
  if (options?.terminal !== undefined) {
    const kind =
      options.terminal === "COMPLETED" ? "ATTEMPT_CONFIRMED"
      : options.terminal === "FAILED" ? "ATTEMPT_FAILED"
      : options.terminal === "CANCELLED" ? "CANCELLED"
      : "EXPIRED";
    await session.updateTaskStatus(taskId, options.terminal, kind, T1, `the task is ${options.terminal}`);
  }
  return taskId;
}

/** A mission detail with a configurable status + attempt outcomes. */
export function missionDetail(options: {
  readonly status?: PaymentMissionsStatus;
  readonly attemptOutcomes?: readonly PaymentMissionsAttemptOutcome[];
  readonly attempts?: boolean;
}): PaymentMissionsDetail {
  const status = options.status ?? "COMPLETED";
  const outcomes = options.attemptOutcomes ?? ["CONFIRMED"];
  return {
    id: MISSION_ID,
    direction: "PAY",
    goalStatement: "pay the supplier",
    origin: "COMPOSER_TEXT",
    status,
    createdAt: T0,
    updatedAt: T4,
    events: [{ id: "evt:a1:9", at: T4, kind: "OPAQUE_HOST_KIND", summary: "The mission completed." }],
    fields: {} as PaymentMissionsDetail["fields"],
    ...(options.attempts === false ? {} : { attempts: outcomes.map((outcome, index) => ({
      attemptId: `attempt:a1b2c3d4:${index + 1}`,
      startedAt: T1,
      operation: "CREATE_EXTERNAL_EFFECT",
      executionMode: "SANDBOX",
      outcome,
      summary: "The sandbox lane reported the attempt.",
    })) }),
  };
}
