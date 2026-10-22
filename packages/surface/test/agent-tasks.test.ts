/**
 * Agent-task contract tests (P13-0, ADR-0007 D6): the shared typed
 * intent/task envelope — vocabulary closure, fail-closed validation, the
 * convergence/resume fold, and the honest-voice law.
 *
 * The CONVERGENCE tests are the typed enforcement of the UX reference's
 * core requirement: a Connect-card click and a "connect Stripe" composer
 * text must reach the SAME task; a Pay click and a Pay text must seed the
 * SAME intake. The terminal/monotonic law and the exact-keys law follow the
 * package's established console-missions discipline.
 */

import { describe, expect, it } from "vitest";

import {
  AGENT_TASK_CONNECTION_FORMS,
  AGENT_TASK_EVENT_KINDS,
  AGENT_TASK_KINDS,
  AGENT_TASK_ORIGINS,
  AGENT_TASK_RESUME_WINDOW_SECONDS,
  AGENT_TASK_STATE_LIFETIME_SECONDS,
  AGENT_TASK_STATUSES,
  AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT,
  SUPPORTED_AGENT_TASK_ORIGINS,
  agentTaskResumeKey,
  isResumableAgentTaskStatus,
  isTerminalAgentTaskStatus,
  type AgentTask,
} from "../src/index.ts";
import {
  InvalidAgentTaskError,
  resolveAgentTaskSeed,
  validateAgentTask,
  validateAgentTaskIntent,
  validateConnectionSetupIntent,
  validatePaymentMissionIntent,
} from "../src/index.ts";

const NOW = "2026-10-22T12:00:00Z";

function validConnectionIntent() {
  return {
    kind: "CONNECTION_SETUP" as const,
    providerId: "stripe",
    form: "SCOPED_API_CREDENTIAL" as const,
    useCaseRef: "own-store-test-mode",
  };
}

function validPaymentIntent() {
  return {
    kind: "PAYMENT_MISSION" as const,
    direction: "PAY" as const,
    goalStatement: "Pay the supplier invoice",
  };
}

function validTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task:CONNECTION_SETUP:abc123",
    kind: "CONNECTION_SETUP",
    intent: validConnectionIntent(),
    origin: "SURFACE_ACTION",
    createdAt: NOW,
    updatedAt: NOW,
    status: "DRAFT",
    events: [
      { id: "e1", at: NOW, kind: "CREATED", summary: "Task created from the Connections area" },
    ],
    ...overrides,
  };
}

describe("vocabulary closure", () => {
  it("pins the task kinds", () => {
    expect([...AGENT_TASK_KINDS]).toEqual(["CONNECTION_SETUP", "PAYMENT_MISSION"]);
  });

  it("declares voice as an origin but NOT as a supported one (honest-voice law)", () => {
    expect([...AGENT_TASK_ORIGINS]).toContain("COMPOSER_VOICE");
    expect(SUPPORTED_AGENT_TASK_ORIGINS).not.toContain("COMPOSER_VOICE");
    expect(AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT).toMatch(/not supported in this deployment/);
  });

  it("pins the statuses with the four terminal ones", () => {
    expect([...AGENT_TASK_STATUSES]).toEqual([
      "DRAFT",
      "ACTIVE",
      "AWAITING_EXTERNAL_RETURN",
      "PAUSED",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "EXPIRED",
    ]);
    for (const terminal of ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"] as const) {
      expect(isTerminalAgentTaskStatus(terminal)).toBe(true);
      expect(isResumableAgentTaskStatus(terminal)).toBe(false);
    }
    for (const resumable of ["DRAFT", "ACTIVE", "AWAITING_EXTERNAL_RETURN", "PAUSED"] as const) {
      expect(isResumableAgentTaskStatus(resumable)).toBe(true);
      expect(isTerminalAgentTaskStatus(resumable)).toBe(false);
    }
  });

  it("pins the connection forms BY VALUE to the provider-runtime vocabulary (ADR D6)", () => {
    expect([...AGENT_TASK_CONNECTION_FORMS]).toEqual([
      "DELEGATED_OAUTH",
      "CONNECTED_ACCOUNT",
      "SCOPED_API_CREDENTIAL",
      "ISOLATED_INTERACTIVE_BROWSER_SESSION",
      "PROVIDERLESS_RAIL",
    ]);
  });

  it("carries the UNKNOWN ≠ FAILED reconciliation event kinds (INV-04)", () => {
    expect([...AGENT_TASK_EVENT_KINDS]).toContain("OUTCOME_UNKNOWN");
    expect([...AGENT_TASK_EVENT_KINDS]).toContain("RECONCILED");
    expect([...AGENT_TASK_EVENT_KINDS]).not.toContain("OUTCOME_FAILED_SILENTLY");
  });

  it("pins the correlation constants (ADR D3/D6)", () => {
    expect(AGENT_TASK_RESUME_WINDOW_SECONDS).toBe(900);
    expect(AGENT_TASK_STATE_LIFETIME_SECONDS).toBe(600);
  });
});

describe("resume keys — the convergence vocabulary", () => {
  it("derives the same key for a Connect-card click and a resolved 'connect Stripe' text", () => {
    const fromCard = agentTaskResumeKey({
      kind: "CONNECTION_SETUP",
      providerId: "stripe",
      form: "SCOPED_API_CREDENTIAL",
    });
    const fromChat = agentTaskResumeKey({
      kind: "CONNECTION_SETUP",
      providerId: "stripe",
      form: "SCOPED_API_CREDENTIAL",
    });
    expect(fromCard).toBe("connection:stripe:SCOPED_API_CREDENTIAL");
    expect(fromChat).toBe(fromCard);
  });

  it("separates forms of the same provider (U1 vs U2 are different tasks)", () => {
    expect(
      agentTaskResumeKey({
        kind: "CONNECTION_SETUP",
        providerId: "stripe",
        form: "SCOPED_API_CREDENTIAL",
      }),
    ).not.toBe(
      agentTaskResumeKey({
        kind: "CONNECTION_SETUP",
        providerId: "stripe",
        form: "DELEGATED_OAUTH",
      }),
    );
  });

  it("derives the same key for a Pay button and a resolved 'pay' text", () => {
    const fromButton = agentTaskResumeKey({
      kind: "PAYMENT_MISSION",
      direction: "PAY",
      goalStatement: "",
    });
    const fromChat = agentTaskResumeKey({
      kind: "PAYMENT_MISSION",
      direction: "PAY",
      goalStatement: "pay the supplier",
    });
    expect(fromButton).toBe("payment:PAY");
    expect(fromChat).toBe(fromButton);
  });
});

describe("fail-closed validation", () => {
  it("accepts the canonical connection intent (with and without useCaseRef)", () => {
    expect(() => validateConnectionSetupIntent(validConnectionIntent())).not.toThrow();
    const { useCaseRef: _drop, ...withoutRef } = validConnectionIntent();
    expect(() => validateConnectionSetupIntent(withoutRef)).not.toThrow();
  });

  it("rejects an unknown connection form", () => {
    const intent = { ...validConnectionIntent(), form: "MAGIC_LINK" };
    expect(() => validateConnectionSetupIntent(intent)).toThrow(InvalidAgentTaskError);
  });

  it("rejects extra fields (exact-keys law)", () => {
    const intent = { ...validConnectionIntent(), surprise: true };
    expect(() => validateConnectionSetupIntent(intent)).toThrow(/unexpected fields/);
    const payment = { ...validPaymentIntent(), amount: "100" };
    expect(() => validatePaymentMissionIntent(payment)).toThrow(/unexpected fields/);
  });

  it("rejects an invalid mission direction", () => {
    const intent = { ...validPaymentIntent(), direction: "SEND" };
    expect(() => validatePaymentMissionIntent(intent)).toThrow(/direction/);
  });

  it("dispatches intent validation by kind and rejects unknown kinds", () => {
    expect(validateAgentTaskIntent(validConnectionIntent()).kind).toBe("CONNECTION_SETUP");
    expect(validateAgentTaskIntent(validPaymentIntent()).kind).toBe("PAYMENT_MISSION");
    expect(() => validateAgentTaskIntent({ kind: "SOMETHING_ELSE" })).toThrow(
      /CONNECTION_SETUP.*PAYMENT_MISSION|intent\.kind/,
    );
  });

  it("accepts the canonical task record and rejects shape drift", () => {
    expect(() => validateAgentTask(validTask())).not.toThrow();
    expect(() => validateAgentTask({ ...validTask(), extra: 1 })).toThrow(/unexpected fields/);
    expect(() => validateAgentTask({ ...validTask(), status: "SUPER_ACTIVE" })).toThrow(/status/);
    expect(() =>
      validateAgentTask({ ...validTask(), intent: validPaymentIntent() }),
    ).toThrow(/match task kind/);
  });

  it("rejects duplicate event ids (append-only identity law)", () => {
    const task = validTask({
      events: [
        { id: "e1", at: NOW, kind: "CREATED", summary: "one" },
        { id: "e1", at: NOW, kind: "RESUMED", summary: "two" },
      ],
    });
    expect(() => validateAgentTask(task)).toThrow(/unique/);
  });

  it("rejects non-UTC instants (explicit-input law)", () => {
    expect(() => validateAgentTask(validTask({ createdAt: "2026-10-22 12:00:00" }))).toThrow(
      /ISO-8601 UTC/,
    );
  });

  it("rejects a secret-shaped event summary? NO — that is the writer's escape-scan law, documented here", () => {
    // The contract documents the law; the WRITER (host adapter) enforces the
    // escape-scan before persistence. Structural validation only checks
    // shape/bounds — this test pins the boundary honestly.
    expect(() =>
      validateAgentTask(
        validTask({
          events: [{ id: "e1", at: NOW, kind: "CREATED", summary: "x".repeat(501) }],
        }),
      ),
    ).toThrow(/500 characters/);
  });
});

describe("the convergence fold (resolveAgentTaskSeed)", () => {
  it("RESUMES the in-window resumable task with the same key (card click after chat text)", () => {
    const existing = [
      validTask({
        id: "task:CONNECTION_SETUP:existing",
        status: "AWAITING_EXTERNAL_RETURN",
        updatedAt: "2026-10-22T11:55:00Z", // 5 minutes before NOW — inside the window
      }),
    ];
    const decision = resolveAgentTaskSeed(validConnectionIntent(), existing, NOW);
    expect(decision).toEqual({ action: "RESUME", taskId: "task:CONNECTION_SETUP:existing" });
  });

  it("CREATES when no task exists", () => {
    expect(resolveAgentTaskSeed(validPaymentIntent(), [], NOW)).toEqual({
      action: "CREATE",
      origin: "SURFACE_ACTION",
    });
  });

  it("CREATES when the same-key task is terminal (monotonic law — completed tasks never resume)", () => {
    const existing = [
      validTask({ id: "t1", status: "COMPLETED", updatedAt: "2026-10-22T11:59:00Z" }),
    ];
    expect(resolveAgentTaskSeed(validConnectionIntent(), existing, NOW)).toEqual({
      action: "CREATE",
      origin: "SURFACE_ACTION",
    });
  });

  it("CREATES when the same-key task is stale (outside the resume window)", () => {
    const existing = [
      validTask({ id: "t1", status: "PAUSED", updatedAt: "2026-10-22T11:30:00Z" }), // 30 min old
    ];
    expect(resolveAgentTaskSeed(validConnectionIntent(), existing, NOW)).toEqual({
      action: "CREATE",
      origin: "SURFACE_ACTION",
    });
  });

  it("ignores same-window tasks with different keys (a Pay intent never hijacks a Stripe setup)", () => {
    const existing = [
      validTask({ id: "t1", status: "ACTIVE", updatedAt: "2026-10-22T11:59:00Z" }),
    ];
    expect(resolveAgentTaskSeed(validPaymentIntent(), existing, NOW)).toEqual({
      action: "CREATE",
      origin: "SURFACE_ACTION",
    });
  });

  it("throws on an invalid incoming intent (fail-closed, never guessed)", () => {
    expect(() =>
      resolveAgentTaskSeed({ kind: "CONNECTION_SETUP", providerId: "", form: "DELEGATED_OAUTH" }, [], NOW),
    ).toThrow(InvalidAgentTaskError);
    expect(() => resolveAgentTaskSeed(validPaymentIntent(), [], "not-a-time")).toThrow(
      InvalidAgentTaskError,
    );
  });
});
