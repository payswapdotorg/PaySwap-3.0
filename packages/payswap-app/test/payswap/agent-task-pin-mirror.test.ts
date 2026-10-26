/**
 * @payswap/app — the AGENT-TASK PIN MIRROR verification (P13-A).
 *
 * The composer lane consumes the shared agent-task contract
 * (packages/surface/src/agent-tasks.ts + agent-task-validation.ts,
 * P13-0/ADR-0007 D6+D9) through STRUCTURAL PINS in
 * src/lib/agent-task-pins.ts + agent-task-validation.ts — the substrate
 * layer law keeps @payswap/* imports out of src (the TL wires real
 * imports at integration; P13-D). THIS test imports the accepted source
 * package's src DIRECTLY (test-only — the established pin-mirror
 * discipline, see pin-mirror.test.ts) and asserts the pins match the
 * source EXACTLY:
 *
 * - every vocabulary constant (same literals, same order);
 * - the honest unsupported-voice statement VERBATIM;
 * - the resume-key fold and the CONVERGENCE seed fold agree
 *   case-for-case (the fold the adapter runs by default is verified
 *   equivalent to resolveAgentTaskSeed — the shared contract's own law);
 * - the fail-closed validators agree on an accept/reject battery.
 *
 * Drift between a pin and its source fails HERE — detectable at test
 * time, never discovered in production.
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
  TERMINAL_AGENT_TASK_STATUSES,
  AGENT_TASK_WAIT_VOCABULARY,
  agentTaskResumeKey,
  isResumableAgentTaskStatus,
  isTerminalAgentTaskStatus,
  type AgentTask,
  type AgentTaskIntent,
} from "../../../surface/src/agent-tasks.ts";
import {
  InvalidAgentTaskError,
  resolveAgentTaskSeed,
  validateAgentTask,
  validateAgentTaskIntent,
} from "../../../surface/src/agent-task-validation.ts";

import {
  AGENT_TASK_CONNECTION_FORMS_PIN,
  AGENT_TASK_EVENT_KINDS_PIN,
  AGENT_TASK_KINDS_PIN,
  AGENT_TASK_ORIGINS_PIN,
  AGENT_TASK_RESUME_WINDOW_SECONDS_PIN,
  AGENT_TASK_STATE_LIFETIME_SECONDS_PIN,
  AGENT_TASK_STATUSES_PIN,
  AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN,
  SUPPORTED_AGENT_TASK_ORIGINS_PIN,
  TERMINAL_AGENT_TASK_STATUSES_PIN,
  AGENT_TASK_WAIT_VOCABULARY_PIN,
  agentTaskResumeKeyPin,
  isResumableAgentTaskStatusPin,
  isTerminalAgentTaskStatusPin,
  type AgentTaskIntentPin,
  type AgentTaskPin,
} from "../../src/lib/agent-task-pins.js";
import { agentTaskStatusView } from "../../src/agent/agentComposerProjection.js";
import {
  InvalidPinnedAgentTaskError,
  resolvePinnedAgentTaskSeed,
  validatePinnedAgentTask,
  validatePinnedAgentTaskIntent,
} from "../../src/lib/agent-task-validation.js";

const NOW = "2026-10-22T12:00:00Z";

/* -------------------- the shared battery inputs --------------------- */

function connectionIntent(): AgentTaskIntentPin {
  return {
    kind: "CONNECTION_SETUP",
    providerId: "stripe",
    form: "SCOPED_API_CREDENTIAL",
    useCaseRef: "own-store-test-mode",
  };
}

function paymentIntent(direction: "PAY" | "RECEIVE" | "MOVE" | "CONVERT" = "PAY"): AgentTaskIntentPin {
  return {
    kind: "PAYMENT_MISSION",
    direction,
    goalStatement: "Pay the supplier invoice",
  };
}

function pinnedTask(overrides: Partial<AgentTaskPin> = {}): AgentTaskPin {
  return {
    id: "task:CONNECTION_SETUP:1",
    kind: "CONNECTION_SETUP",
    intent: connectionIntent(),
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

/* ---------------------- vocabulary closure -------------------------- */

describe("agent-task pins mirror the shared contract vocabulary", () => {
  it("pins the task kinds (same literals, same order)", () => {
    expect([...AGENT_TASK_KINDS_PIN]).toEqual([...AGENT_TASK_KINDS]);
  });

  it("pins the origins and the supported list (the honest-voice law)", () => {
    expect([...AGENT_TASK_ORIGINS_PIN]).toEqual([...AGENT_TASK_ORIGINS]);
    expect([...SUPPORTED_AGENT_TASK_ORIGINS_PIN]).toEqual([...SUPPORTED_AGENT_TASK_ORIGINS]);
    expect(SUPPORTED_AGENT_TASK_ORIGINS_PIN).not.toContain("COMPOSER_VOICE");
  });

  it("pins the honest unsupported-voice statement VERBATIM", () => {
    expect(AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN).toBe(AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT);
  });

  it("pins the statuses, the terminal set and both predicates", () => {
    expect([...AGENT_TASK_STATUSES_PIN]).toEqual([...AGENT_TASK_STATUSES]);
    expect([...AGENT_TASK_STATUSES_PIN]).toContain("AWAITING_EXTERNAL_RETURN");
    for (const status of AGENT_TASK_STATUSES_PIN) {
      expect(isTerminalAgentTaskStatusPin(status)).toBe(isTerminalAgentTaskStatus(status));
      expect(isResumableAgentTaskStatusPin(status)).toBe(isResumableAgentTaskStatus(status));
    }
  });

  it("pins the event kinds and the connection forms BY VALUE", () => {
    expect([...AGENT_TASK_EVENT_KINDS_PIN]).toEqual([...AGENT_TASK_EVENT_KINDS]);
    expect([...AGENT_TASK_CONNECTION_FORMS_PIN]).toEqual([...AGENT_TASK_CONNECTION_FORMS]);
  });

  it("pins the correlation constants (ADR-0007 D3/D6)", () => {
    expect(AGENT_TASK_RESUME_WINDOW_SECONDS_PIN).toBe(AGENT_TASK_RESUME_WINDOW_SECONDS);
    expect(AGENT_TASK_STATE_LIFETIME_SECONDS_PIN).toBe(AGENT_TASK_STATE_LIFETIME_SECONDS);
  });
});

/* --------------- the wait vocabulary mirror (P16-D) --------------- */

describe("the wait vocabulary pin mirrors the surface authority (P16-D, ADR-0009 D8)", () => {
  it("AGENT_TASK_WAIT_VOCABULARY_PIN matches the surface authority byte-identically", () => {
    expect(AGENT_TASK_WAIT_VOCABULARY_PIN).toEqual(AGENT_TASK_WAIT_VOCABULARY);
    expect(JSON.stringify(AGENT_TASK_WAIT_VOCABULARY_PIN)).toBe(
      JSON.stringify(AGENT_TASK_WAIT_VOCABULARY),
    );
  });

  it("matchAutoDispatches is the pinned LITERAL false on both sides (never derived)", () => {
    const appNever: false = AGENT_TASK_WAIT_VOCABULARY_PIN.matchAutoDispatches;
    const surfaceNever: false = AGENT_TASK_WAIT_VOCABULARY.matchAutoDispatches;
    expect(appNever).toBe(false);
    expect(surfaceNever).toBe(false);
  });

  it("the wait status is a member of BOTH status vocabularies — non-terminal, resumable", () => {
    expect(AGENT_TASK_WAIT_VOCABULARY_PIN.status).toBe(AGENT_TASK_WAIT_VOCABULARY.status);
    expect(AGENT_TASK_WAIT_VOCABULARY_PIN.status).toBe("WAITING_FOR_OPPORTUNITIES");
    expect([...AGENT_TASK_STATUSES_PIN]).toContain(AGENT_TASK_WAIT_VOCABULARY_PIN.status);
    expect([...AGENT_TASK_STATUSES]).toContain(AGENT_TASK_WAIT_VOCABULARY.status);
    expect([...TERMINAL_AGENT_TASK_STATUSES_PIN]).toEqual([...TERMINAL_AGENT_TASK_STATUSES]);
    expect([...TERMINAL_AGENT_TASK_STATUSES_PIN]).not.toContain("WAITING_FOR_OPPORTUNITIES");
    expect(isTerminalAgentTaskStatusPin("WAITING_FOR_OPPORTUNITIES")).toBe(false);
    expect(isResumableAgentTaskStatusPin("WAITING_FOR_OPPORTUNITIES")).toBe(true);
  });

  it("the four wait event kinds are members of BOTH event vocabularies", () => {
    expect([...AGENT_TASK_WAIT_VOCABULARY_PIN.eventKinds]).toEqual([
      "WAIT_STARTED",
      "WAIT_CRITERIA_RECORDED",
      "OPPORTUNITY_MATCHED",
      "WAIT_EXPIRED",
    ]);
    for (const kind of AGENT_TASK_WAIT_VOCABULARY_PIN.eventKinds) {
      expect([...AGENT_TASK_EVENT_KINDS_PIN]).toContain(kind);
      expect([...AGENT_TASK_EVENT_KINDS]).toContain(kind);
    }
  });

  it("the pin is frozen; the composer STATUS_VIEW covers every pinned status with the honest wait label", () => {
    expect(Object.isFrozen(AGENT_TASK_WAIT_VOCABULARY_PIN)).toBe(true);
    expect(Object.isFrozen(AGENT_TASK_WAIT_VOCABULARY_PIN.eventKinds)).toBe(true);
    for (const status of AGENT_TASK_STATUSES_PIN) {
      expect(agentTaskStatusView(status).label.length).toBeGreaterThan(0);
    }
    expect(agentTaskStatusView("WAITING_FOR_OPPORTUNITIES")).toEqual({
      tone: "attention",
      label: "Waiting for opportunities — nothing dispatches automatically",
    });
  });
});

/* --------------------- the folds agree (convergence) ---------------- */

describe("the pinned folds agree with the shared contract", () => {
  const intents: readonly AgentTaskIntentPin[] = [
    connectionIntent(),
    { kind: "CONNECTION_SETUP", providerId: "stripe", form: "DELEGATED_OAUTH" },
    { kind: "CONNECTION_SETUP", providerId: "wise", form: "PROVIDERLESS_RAIL" },
    paymentIntent("PAY"),
    paymentIntent("RECEIVE"),
    paymentIntent("MOVE"),
    paymentIntent("CONVERT"),
  ];

  it("the resume-key fold derives identical keys for every intent battery entry", () => {
    for (const intent of intents) {
      expect(agentTaskResumeKeyPin(intent)).toBe(
        agentTaskResumeKey(intent as unknown as AgentTaskIntent),
      );
    }
  });

  it("the CONVERGENCE seed fold agrees case-for-case (CREATE/RESUME/stale/terminal/mixed)", () => {
    const cases: readonly {
      readonly name: string;
      readonly existing: readonly AgentTaskPin[];
      readonly now: string;
    }[] = [
      { name: "empty store", existing: [], now: NOW },
      {
        name: "in-window resumable same-key",
        existing: [pinnedTask({ id: "t1", updatedAt: "2026-10-22T11:55:00Z" })],
        now: NOW,
      },
      {
        name: "AWAITING_EXTERNAL_RETURN same-key inside window",
        existing: [
          pinnedTask({
            id: "t2",
            status: "AWAITING_EXTERNAL_RETURN",
            updatedAt: "2026-10-22T11:50:00Z",
          }),
        ],
        now: NOW,
      },
      {
        name: "terminal same-key never resumes",
        existing: [pinnedTask({ id: "t3", status: "COMPLETED", updatedAt: NOW })],
        now: NOW,
      },
      {
        name: "stale same-key (outside the window)",
        existing: [pinnedTask({ id: "t4", status: "PAUSED", updatedAt: "2026-10-22T11:00:00Z" })],
        now: NOW,
      },
      {
        name: "different-key task never hijacks",
        existing: [
          pinnedTask({
            id: "t5",
            intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "other" },
            kind: "PAYMENT_MISSION",
          }),
        ],
        now: NOW,
      },
      {
        name: "first-match wins with several in-window candidates",
        existing: [
          pinnedTask({ id: "t6", updatedAt: "2026-10-22T11:40:00Z" }),
          pinnedTask({ id: "t7", updatedAt: "2026-10-22T11:50:00Z" }),
        ],
        now: NOW,
      },
    ];
    for (const intent of intents) {
      for (const testCase of cases) {
        const source = resolveAgentTaskSeed(
          intent as unknown as AgentTaskIntent,
          testCase.existing as unknown as readonly AgentTask[],
          testCase.now,
        );
        const mirror = resolvePinnedAgentTaskSeed(intent, testCase.existing, testCase.now);
        expect(mirror, `${intent.kind} / ${testCase.name}`).toEqual(source as never);
      }
    }
  });

  it("the seed fold fails closed on invalid inputs exactly like the source", () => {
    expect(() =>
      resolveAgentTaskSeed(
        { kind: "CONNECTION_SETUP", providerId: "", form: "DELEGATED_OAUTH" } as never,
        [],
        NOW,
      ),
    ).toThrow(InvalidAgentTaskError);
    expect(() =>
      resolvePinnedAgentTaskSeed(
        { kind: "CONNECTION_SETUP", providerId: "", form: "DELEGATED_OAUTH" },
        [],
        NOW,
      ),
    ).toThrow(InvalidPinnedAgentTaskError);
    expect(() => resolveAgentTaskSeed(paymentIntent() as never, [], "not-a-time")).toThrow(
      InvalidAgentTaskError,
    );
    expect(() => resolvePinnedAgentTaskSeed(paymentIntent(), [], "not-a-time")).toThrow(
      InvalidPinnedAgentTaskError,
    );
  });
});

/* --------------------- the validators agree ------------------------- */

describe("the pinned fail-closed validators agree with the shared contract", () => {
  const acceptedIntents: readonly unknown[] = [connectionIntent(), paymentIntent("CONVERT")];
  const acceptedTasks: readonly unknown[] = [
    pinnedTask(),
    pinnedTask({
      kind: "PAYMENT_MISSION",
      intent: paymentIntent("MOVE"),
      status: "AWAITING_EXTERNAL_RETURN",
      events: [
        { id: "e1", at: NOW, kind: "CREATED", summary: "created" },
        { id: "e2", at: NOW, kind: "RESUMED", summary: "resumed", correlationRef: "seed:42" },
      ],
    }),
    // P16-D: a WAITING task carrying WAIT_STARTED/OPPORTUNITY_MATCHED events is canonical on BOTH validators.
    pinnedTask({
      kind: "PAYMENT_MISSION",
      intent: paymentIntent("PAY"),
      status: "WAITING_FOR_OPPORTUNITIES",
      events: [
        { id: "e1", at: NOW, kind: "CREATED", summary: "created" },
        { id: "e2", at: NOW, kind: "WAIT_STARTED", summary: "wait started" },
        { id: "e3", at: NOW, kind: "OPPORTUNITY_MATCHED", summary: "stays waiting" },
      ],
    }),
  ];
  const rejected: readonly unknown[] = [
    null,
    "stripe",
    { kind: "CONNECTION_SETUP", providerId: "stripe", form: "MAGIC_LINK" },
    { ...connectionIntent(), surprise: true },
    { kind: "PAYMENT_MISSION", direction: "SEND", goalStatement: "x" },
    { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "" },
    { ...pinnedTask(), extra: 1 },
    { ...pinnedTask(), status: "SUPER_ACTIVE" },
    { ...pinnedTask(), intent: paymentIntent() },
    { ...pinnedTask(), createdAt: "2026-10-22 12:00:00" },
    pinnedTask({
      events: [
        { id: "e1", at: NOW, kind: "CREATED", summary: "one" },
        { id: "e1", at: NOW, kind: "RESUMED", summary: "two" },
      ],
    }),
    pinnedTask({ events: [{ id: "e1", at: NOW, kind: "CREATED", summary: "x".repeat(501) }] }),
  ];

  it("accepts exactly the canonical shapes the source accepts (intents)", () => {
    for (const value of acceptedIntents) {
      expect(() => validateAgentTaskIntent(value)).not.toThrow();
      expect(() => validatePinnedAgentTaskIntent(value)).not.toThrow();
    }
  });

  it("accepts exactly the canonical shapes the source accepts (task records)", () => {
    for (const value of acceptedTasks) {
      expect(() => validateAgentTask(value)).not.toThrow();
      expect(() => validatePinnedAgentTask(value)).not.toThrow();
    }
  });

  it("rejects exactly the drifted shapes the source rejects", () => {
    for (const value of rejected) {
      expect(() => validatePinnedAgentTaskIntent(value), JSON.stringify(value)).toThrow(
        InvalidPinnedAgentTaskError,
      );
      expect(() => validateAgentTaskIntent(value), JSON.stringify(value)).toThrow(
        InvalidAgentTaskError,
      );
      expect(() => validatePinnedAgentTask(value), JSON.stringify(value)).toThrow(
        InvalidPinnedAgentTaskError,
      );
      expect(() => validateAgentTask(value), JSON.stringify(value)).toThrow(InvalidAgentTaskError);
    }
  });

  it("the pin modules name their source package + modules (the discipline itself)", async () => {
    const { readFile } = await import("node:fs/promises");
    const pins = await readFile("src/lib/agent-task-pins.ts", "utf8");
    expect(pins).toContain("packages/surface/src/agent-tasks.ts");
    const validation = await readFile("src/lib/agent-task-validation.ts", "utf8");
    expect(validation).toContain("packages/surface/src/agent-task-validation.ts");
  });
});
