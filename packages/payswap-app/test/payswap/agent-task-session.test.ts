/**
 * @payswap/app — the AGENT TASK-SESSION adapter tests (P13-A).
 *
 * The BROWSER_PROFILE adapter laws, machine-checked against the REAL
 * adapter (the localStorage-backed implementation with its storage seam
 * injected — the established workspace-store test pattern):
 *
 * - THE CONVERGENCE LAW (the acceptance core): a Connect-card seed and
 *   a composer-text seed with the same resume key reach ONE task record
 *   (RESUME, never a duplicate); a Pay action seed and a "pay the
 *   supplier" text seed reach ONE payment-intake task. Runs with BOTH
 *   the adapter's default (pinned) fold AND the REAL shared-contract
 *   fold injected from packages/surface/src (test-only import).
 * - The honest-voice law at the port: seeding with COMPOSER_VOICE fails
 *   closed (declared-unsupported, never simulated).
 * - Fail-closed everywhere: unknown ids, terminal monotonicity,
 *   invalid instants, secret-shaped transcripts (the chat law).
 * - Persistence round-trip, malformed-record quarantine, write-failure
 *   revert.
 */
import { describe, expect, it } from "vitest";
import { resolveAgentTaskSeed } from "../../../surface/src/agent-task-validation.ts";

import { createBrowserAgentTaskSessionPort } from "../../src/agent/taskSessionAdapter.js";
import type { AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import { AgentTaskSessionError } from "../../src/agent/taskSessionPort.js";
import type { AgentTaskIntentPin, AgentTaskPin } from "../../src/lib/agent-task-pins.js";

const T0 = "2026-10-22T12:00:00Z";
const T1 = "2026-10-22T12:05:00Z";

/** The in-memory storage seam (deterministic; localStorage-shaped). */
function fakeStorage(seed?: Record<string, string>): AgentTaskSessionStorage & {
  readonly writes: readonly string[];
  failWrites(): void;
} {
  const data = new Map<string, string>(Object.entries(seed ?? {}));
  const writes: string[] = [];
  let failing = false;
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      if (failing) {
        throw new Error("quota exceeded");
      }
      data.set(key, value);
      writes.push(key);
    },
    failWrites: () => {
      failing = true;
    },
    get writes() {
      return writes;
    },
  };
}

function stripeSetupIntent(): AgentTaskIntentPin {
  return {
    kind: "CONNECTION_SETUP",
    providerId: "stripe",
    form: "SCOPED_API_CREDENTIAL",
    useCaseRef: "own-store-test-mode",
  };
}

function payIntent(goalStatement = "pay the supplier"): AgentTaskIntentPin {
  return { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement };
}

describe("the CONVERGENCE law (the acceptance core) — one task record, never a duplicate", () => {
  it("a Connect-card click then composer text 'connect Stripe' RESUMES the same task (default fold)", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    const fromCard = await port.seedOrResume({
      intent: stripeSetupIntent(),
      origin: "SURFACE_ACTION",
      now: T0,
      originNote: "Stripe connect card on the Connections area (own-store, test mode)",
    });
    expect(fromCard.action).toBe("CREATED");

    const fromChat = await port.seedOrResume({
      intent: (() => {
        const { useCaseRef: _drop, ...bare } = stripeSetupIntent();
        return bare;
      })(),
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "connect Stripe",
    });
    expect(fromChat.action).toBe("RESUMED");
    expect(fromChat.task.id).toBe(fromCard.task.id);

    const tasks = await port.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.events.map((event) => event.kind)).toEqual(["CREATED", "RESUMED"]);
  });

  it("the same convergence holds with the REAL shared-contract fold injected (resolveAgentTaskSeed)", async () => {
    const port = createBrowserAgentTaskSessionPort({
      storage: fakeStorage(),
      resolveSeed: (intent, existing, now) =>
        resolveAgentTaskSeed(intent as never, existing as never, now) as never,
    });
    const first = await port.seedOrResume({
      intent: stripeSetupIntent(),
      origin: "SURFACE_ACTION",
      now: T0,
      originNote: "Stripe connect card on the Connections area",
    });
    const second = await port.seedOrResume({
      intent: stripeSetupIntent(),
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "connect Stripe",
    });
    expect(second.action).toBe("RESUMED");
    expect(second.task.id).toBe(first.task.id);
    expect(await port.listTasks()).toHaveLength(1);
  });

  it("a Pay button then composer text 'pay the supplier' seeds ONE payment-intake task", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    const fromButton = await port.seedOrResume({
      intent: payIntent("Pay request started from the Payments area action"),
      origin: "SURFACE_ACTION",
      now: T0,
      originNote: "Pay action on the Payments area",
    });
    expect(fromButton.action).toBe("CREATED");
    expect(fromButton.task.kind).toBe("PAYMENT_MISSION");

    const fromChat = await port.seedOrResume({
      intent: payIntent("pay the supplier"),
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "pay the supplier",
    });
    expect(fromChat.action).toBe("RESUMED");
    expect(fromChat.task.id).toBe(fromButton.task.id);
    expect(await port.listTasks()).toHaveLength(1);
  });

  it("different resume keys are different tasks (a Pay intent never hijacks a Stripe setup)", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    await port.seedOrResume({
      intent: stripeSetupIntent(),
      origin: "SURFACE_ACTION",
      now: T0,
      originNote: "connect card",
    });
    const pay = await port.seedOrResume({
      intent: payIntent(),
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "pay the supplier",
    });
    expect(pay.action).toBe("CREATED");
    expect(await port.listTasks()).toHaveLength(2);
  });

  it("a stale same-key task (outside the 900s window) creates a NEW task — never a stale resume", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    await port.seedOrResume({
      intent: stripeSetupIntent(),
      origin: "SURFACE_ACTION",
      now: "2026-10-22T11:00:00Z",
      originNote: "connect card",
    });
    const late = await port.seedOrResume({
      intent: stripeSetupIntent(),
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "connect Stripe",
    });
    expect(late.action).toBe("CREATED");
    expect(await port.listTasks()).toHaveLength(2);
  });
});

describe("the honest-voice law at the port (COMPOSER_VOICE is declared-unsupported)", () => {
  it("seeding with the COMPOSER_VOICE origin fails closed — voice is never simulated", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    await expect(
      port.seedOrResume({
        intent: stripeSetupIntent(),
        origin: "COMPOSER_VOICE",
        now: T0,
        originNote: "spoken request",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_ORIGIN" });
    expect(await port.listTasks()).toHaveLength(0);
  });
});

describe("fail-closed laws", () => {
  it("unknown task ids fail closed", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    await expect(
      port.appendTaskEvent("task:CONNECTION_SETUP:404", "RESUMED", T0, "note"),
    ).rejects.toBeInstanceOf(AgentTaskSessionError);
  });

  it("the monotonic-terminal law: a terminal status has no lawful exit", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    const { task } = await port.seedOrResume({
      intent: payIntent(),
      origin: "COMPOSER_TEXT",
      now: T0,
      originNote: "pay the supplier",
    });
    const cancelled = await port.updateTaskStatus(
      task.id,
      "CANCELLED",
      "CANCELLED",
      T1,
      "Cancelled by the operator from the composer",
    );
    expect(cancelled.status).toBe("CANCELLED");
    await expect(
      port.updateTaskStatus(task.id, "DRAFT", "RESUMED", T1, "trying to leave the terminal"),
    ).rejects.toMatchObject({ code: "TERMINAL_TASK" });
  });

  it("a lawful status transition records the caller-chosen event kind + the status", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    const { task } = await port.seedOrResume({
      intent: stripeSetupIntent(),
      origin: "SURFACE_ACTION",
      now: T0,
      originNote: "connect card",
    });
    const awaiting = await port.updateTaskStatus(
      task.id,
      "AWAITING_EXTERNAL_RETURN",
      "ATTEMPT_STARTED",
      T1,
      "Outbound auth attempt started (host-side single-use state)",
    );
    expect(awaiting.status).toBe("AWAITING_EXTERNAL_RETURN");
    expect(awaiting.events.at(-1)?.kind).toBe("ATTEMPT_STARTED");
  });

  it("invalid instants and vocabularies fail closed", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    const { task } = await port.seedOrResume({
      intent: payIntent(),
      origin: "COMPOSER_TEXT",
      now: T0,
      originNote: "pay the supplier",
    });
    await expect(
      port.appendTaskEvent(task.id, "RESUMED", "2026-10-22 12:00:00", "bad instant"),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      // @ts-expect-error -- runtime drift is refused, not coerced
      port.appendTaskEvent(task.id, "MYSTERY_EVENT", T1, "bad kind"),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("the chat law: secret-shaped transcripts are refused before they are recorded", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    await expect(
      port.seedOrResume({
        intent: payIntent("pay the supplier with key sk_test_abc123def456"),
        origin: "COMPOSER_TEXT",
        now: T0,
        originNote: "pay the supplier with key sk_test_abc123def456",
      }),
    ).rejects.toMatchObject({ code: "SECRET_SHAPED_INPUT" });
    expect(await port.listTasks()).toHaveLength(0);
  });
});

describe("persistence, quarantine and write failures", () => {
  it("tasks persist across adapter instances (the reload story) with monotonic ids", async () => {
    const storage = fakeStorage();
    const first = createBrowserAgentTaskSessionPort({ storage });
    const a = await first.seedOrResume({
      intent: stripeSetupIntent(),
      origin: "SURFACE_ACTION",
      now: T0,
      originNote: "connect card",
    });
    const b = await first.seedOrResume({
      intent: payIntent(),
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "pay the supplier",
    });
    expect(a.task.id).not.toBe(b.task.id);

    const reloaded = createBrowserAgentTaskSessionPort({ storage });
    const tasks = await reloaded.listTasks();
    expect(tasks.map((task) => task.id)).toEqual([a.task.id, b.task.id]);
    // The counter never reuses an id after a reload.
    const c = await reloaded.seedOrResume({
      intent: { kind: "PAYMENT_MISSION", direction: "MOVE", goalStatement: "move funds" },
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "move funds",
    });
    expect(c.task.id).not.toBe(a.task.id);
    expect(c.task.id).not.toBe(b.task.id);
  });

  it("a malformed persisted record is quarantined (health-visible), good records still load", async () => {
    const good: AgentTaskPin = {
      id: "task:PAYMENT_MISSION:1",
      kind: "PAYMENT_MISSION",
      intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
      origin: "COMPOSER_TEXT",
      createdAt: T0,
      updatedAt: T0,
      status: "DRAFT",
      events: [{ id: "evt:1", at: T0, kind: "CREATED", summary: "Task created from composer text" }],
    };
    const storage = fakeStorage({
      "payswap.agent.tasks.v1": JSON.stringify({
        version: 1,
        nextTaskNumber: 5,
        nextEventNumber: 2,
        tasks: [good, { id: "broken", nope: true }],
      }),
    });
    const port = createBrowserAgentTaskSessionPort({ storage });
    const tasks = await port.listTasks();
    expect(tasks.map((task) => task.id)).toEqual(["task:PAYMENT_MISSION:1"]);
    expect(port.taskSessionHealth()).toEqual({ quarantinedRecords: 1, taskCount: 1 });
  });

  it("a failed write reverts the in-memory state — memory and storage never diverge", async () => {
    const storage = fakeStorage();
    const port = createBrowserAgentTaskSessionPort({ storage });
    const { task } = await port.seedOrResume({
      intent: payIntent(),
      origin: "COMPOSER_TEXT",
      now: T0,
      originNote: "pay the supplier",
    });
    storage.failWrites();
    await expect(
      port.appendTaskEvent(task.id, "RESUMED", T1, "this write will fail"),
    ).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });
    // The reverted state still lists the ORIGINAL record (no phantom event).
    const tasks = await port.listTasks();
    expect(tasks[0]!.events).toHaveLength(1);
  });
});

describe("the standalone honesty label", () => {
  it("labels itself BROWSER_PROFILE (the desktop host binding lands at P13-D)", () => {
    expect(createBrowserAgentTaskSessionPort({ storage: fakeStorage() }).durability).toBe(
      "BROWSER_PROFILE",
    );
  });

  it("fails closed with STORE_UNAVAILABLE when no storage exists at all", async () => {
    const port = createBrowserAgentTaskSessionPort({ storage: undefined });
    // Node has no localStorage — the default seam must fail closed (typed).
    const hasLocalStorage =
      (globalThis as { localStorage?: unknown }).localStorage !== undefined;
    if (!hasLocalStorage) {
      await expect(port.listTasks()).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" });
    }
  });
});
