/**
 * @payswap/app — the CONVERSATION LOG battery (P24-3, ADR-0017 D8 —
 * the append-only record + its validators + its projections).
 *
 * The task's conversation record laws, machine-checked against the REAL
 * writer/validators/adapters/projections:
 *
 * - THE WRITER (conversationLogEvents.validateConversationLogInput):
 *   fail-closed per kind — unknown kinds, malformed shapes, empty ids
 *   and secret-shaped text all refuse typed; the frozen-contract pins
 *   (prepared actions, execution outcomes) validate structurally;
 * - THE ADAPTER (taskSessionAdapter.appendConversationEvent): append
 *   order, monotonic ids, the unknown-task and terminal-task typed
 *   errors, and the SNAPSHOT ROUND-TRIP (a brand-new adapter over the
 *   same store replays the log; pre-P24-3 snapshots load empty;
 *   malformed persisted events are dropped from replay, never
 *   rewritten; ids stay monotonic after reload);
 * - THE PROJECTIONS (agentConversationProjection): people-language
 *   entries, the PUBLIC history rebuild (assistant toolCalls groups,
 *   tool results as bounded summaries, the trailing paused call) and
 *   the unanswered-call fold;
 * - THE DECISION TABLE (conversationConfirmationPhrases): exact-match
 *   yes/no only, normalization, strong-tier gating;
 * - THE ACCOUNT FOLDS (taskAccountContext): last-binding-wins, facts
 *   resolution, the multi-account chip line.
 */
import { describe, expect, it } from "vitest";

import {
  AGENT_CONVERSATION_EVENT_KINDS_PIN,
  validateConversationLogInput,
  type AgentConversationLogEvent,
} from "../../src/agent/conversationLogEvents.js";
import { createBrowserAgentTaskSessionPort } from "../../src/agent/taskSessionAdapter.js";
import type { AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import { AgentTaskSessionError } from "../../src/agent/taskSessionPort.js";
import type { AgentTaskIntentPin } from "../../src/lib/agent-task-pins.js";
import {
  conversationHistoryFromLog,
  projectConversationEntries,
  unansweredToolCallOf,
} from "../../src/agent/agentConversationProjection.js";
import {
  CONVERSATION_CONFIRM_PHRASES,
  CONVERSATION_REFUSE_PHRASES,
  matchConversationConfirmation,
  normalizeConfirmationText,
  tierAllowsConversationalConfirmation,
} from "../../src/agent/conversationConfirmationPhrases.js";
import {
  accountContextLine,
  boundAccountFacts,
  foldAccountBinding,
} from "../../src/agent/taskAccountContext.js";
import type { StripeAccountFactsPin } from "../../src/agent/stripeToolCataloguePort.js";
import type { StripePreparedActionPin } from "../../src/agent/stripePreparedActionPins.js";

const T0 = "2026-10-31T12:00:00Z";
const T1 = "2026-10-31T12:01:00Z";
const SELECTION = { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "high" } as const;

function fakeStorage(seed?: Record<string, string>): AgentTaskSessionStorage {
  const data = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
  };
}

const setupIntent = (): AgentTaskIntentPin => ({
  kind: "CONNECTION_SETUP",
  providerId: "stripe",
  form: "SCOPED_API_CREDENTIAL",
  useCaseRef: "own-store-test-mode",
});

/** Seed one task and return its id. */
async function seedTask(storage: AgentTaskSessionStorage): Promise<string> {
  const port = createBrowserAgentTaskSessionPort({ storage });
  const outcome = await port.seedOrResume({
    intent: setupIntent(),
    origin: "COMPOSER_TEXT",
    now: T0,
    originNote: "connect stripe for my store",
  });
  if (outcome.action === "REFUSED") {
    throw new Error("seed refused");
  }
  return outcome.task.id;
}

function preparedAction(overrides: Partial<StripePreparedActionPin> = {}): StripePreparedActionPin {
  return {
    preparedActionId: "pa-1",
    operationId: "PostProducts",
    catalogueRelease: "v2596 / 2026-09-30.endive",
    accountContext: {
      connectionId: "conn-1",
      stripeAccountId: "acct_test_1",
      accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
      environment: "SANDBOX",
    },
    parameters: [{ name: "name", value: "Annual Membership", location: "body" }],
    digest: "sha256:digest-1",
    effectClass: "STRIPE_CONFIGURATION_WRITE",
    approvalTier: "CONFIRM",
    confirmationInputs: ["Confirm creating this product"],
    idempotencyKeyRef: "idem-1",
    readBackOperationId: "GetProducts",
    expiresAt: "2026-10-31T13:00:00Z",
    createdBy: "model_proposal",
    ...overrides,
  };
}

function log(events: readonly { at: string; event: unknown }[]): readonly AgentConversationLogEvent[] {
  return events.map((entry, index) => ({
    id: `conv:${index + 1}`,
    taskId: "task-1",
    at: entry.at,
    event: validateConversationLogInput(entry.event),
  }));
}

/* ---------------------------- the writer ------------------------------ */

describe("validateConversationLogInput (fail-closed per kind)", () => {
  it("accepts every pinned kind with a well-formed input", () => {
    const samples: readonly unknown[] = [
      { kind: "CONVERSATION_STARTED", selection: SELECTION },
      { kind: "USER_TEXT", text: "what can this connection do?" },
      { kind: "ASSISTANT_TEXT", text: "Here is the answer." },
      { kind: "TOOL_CALL", callId: "call-1", toolName: "stripe.search_operations", argsEcho: "{\"query\":\"products\"}" },
      { kind: "TOOL_RESULT", callId: "call-1", toolName: "stripe.search_operations", status: "OK", summary: "3 matches", truncated: true },
      { kind: "PREPARED_ACTION_PENDING", action: preparedAction() },
      { kind: "PREPARED_ACTION_CONFIRMED", preparedActionId: "pa-1", digest: "sha256:digest-1", authorizationId: "auth-1" },
      { kind: "PREPARED_ACTION_REFUSED", preparedActionId: "pa-1" },
      { kind: "PREPARED_ACTION_EXPIRED", preparedActionId: "pa-1" },
      { kind: "EXECUTION_OUTCOME", preparedActionId: "pa-1", outcome: { kind: "CONFIRMED", providerRefs: ["prod_1"], readBackDue: false } },
      { kind: "CONVERSATION_NOTE", note: "the loop stopped honestly", reason: "MAX_TURNS" },
      { kind: "ACCOUNT_CONTEXT_BOUND", connectionId: "conn-1", scopeChange: "INITIAL" },
    ];
    for (const sample of samples) {
      expect(() => validateConversationLogInput(sample)).not.toThrow();
    }
    expect(AGENT_CONVERSATION_EVENT_KINDS_PIN).toHaveLength(12);
  });

  it("refuses unknown kinds, malformed shapes and empty ids typed", () => {
    expect(() => validateConversationLogInput({ kind: "MODEL_THOUGHT", text: "..." })).toThrow(/pinned vocabulary/);
    expect(() => validateConversationLogInput("nope")).toThrow(/record with a kind/);
    expect(() => validateConversationLogInput({ kind: "USER_TEXT", text: "" })).toThrow(/non-empty/);
    expect(() => validateConversationLogInput({ kind: "CONVERSATION_STARTED", selection: { providerId: "", modelId: "m", reasoningLevel: "low" } })).toThrow(/providerId/);
    expect(() => validateConversationLogInput({ kind: "TOOL_CALL", callId: "", toolName: "x" })).toThrow(/callId/);
    expect(() => validateConversationLogInput({ kind: "TOOL_RESULT", callId: "c", toolName: "t", status: "MAYBE", summary: "" })).toThrow(/status/);
    expect(() => validateConversationLogInput({ kind: "PREPARED_ACTION_REFUSED", preparedActionId: "" })).toThrow(/preparedActionId/);
    expect(() => validateConversationLogInput({ kind: "ACCOUNT_CONTEXT_BOUND", connectionId: "conn-1", scopeChange: "MODEL_PICKED" })).toThrow(/scopeChange/);
    expect(() => validateConversationLogInput({ kind: "CONVERSATION_NOTE", note: "" })).toThrow(/non-empty/);
  });

  it("SECRET-SHAPED text never enters the record (the chat law at the writer)", () => {
    expect(() => validateConversationLogInput({ kind: "USER_TEXT", text: "my key is sk_test_abc123def456" })).toThrow(
      AgentTaskSessionError,
    );
    expect(() => validateConversationLogInput({ kind: "ASSISTANT_TEXT", text: "whsec_topsecret123456" })).toThrow(
      AgentTaskSessionError,
    );
    expect(() => validateConversationLogInput({ kind: "TOOL_RESULT", callId: "c", toolName: "t", status: "OK", summary: "rk_live_secretkey123" })).toThrow(
      AgentTaskSessionError,
    );
    expect(() => validateConversationLogInput({ kind: "TOOL_CALL", callId: "c", toolName: "t", argsEcho: "Bearer abcdefghijklmnop" })).toThrow(
      AgentTaskSessionError,
    );
  });

  it("a malformed prepared action or outcome refuses at the writer (never persisted to quarantine)", () => {
    expect(() => validateConversationLogInput({ kind: "PREPARED_ACTION_PENDING", action: { preparedActionId: "pa-1" } })).toThrow(
      /prepared action/,
    );
    expect(() =>
      validateConversationLogInput({ kind: "PREPARED_ACTION_PENDING", action: { ...preparedAction(), approvalTier: "TRUST_ME" } }),
    ).toThrow(/approvalTier/);
    expect(() => validateConversationLogInput({ kind: "EXECUTION_OUTCOME", preparedActionId: "pa-1", outcome: { kind: "MAYBE" } })).toThrow(
      /kind/,
    );
  });
});

/* ---------------------------- the adapter ----------------------------- */

describe("the browser adapter's conversation log (append-only + durable)", () => {
  it("appends in order with MONOTONIC ids and replays them verbatim", async () => {
    const storage = fakeStorage();
    const taskId = await seedTask(storage);
    const port = createBrowserAgentTaskSessionPort({ storage });
    const first = await port.appendConversationEvent(taskId, { kind: "USER_TEXT", text: "first" }, T0);
    const second = await port.appendConversationEvent(taskId, { kind: "ASSISTANT_TEXT", text: "second" }, T1);
    expect(first.map((entry) => entry.id)).toEqual(["conv:1"]);
    expect(second.map((entry) => [entry.id, entry.at])).toEqual([
      ["conv:1", T0],
      ["conv:2", T1],
    ]);
    const replay = await port.conversationLog(taskId);
    expect(replay.map((entry) => entry.event)).toEqual([
      { kind: "USER_TEXT", text: "first" },
      { kind: "ASSISTANT_TEXT", text: "second" },
    ]);
    // APPEND-ONLY: the earlier returned array is not mutated by later appends.
    expect(first).toHaveLength(1);
  });

  it("a SECOND task's log is independent (per-task records)", async () => {
    const storage = fakeStorage();
    const taskIdA = await seedTask(storage);
    const port = createBrowserAgentTaskSessionPort({ storage });
    const outcomeB = await port.seedOrResume({
      intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
      origin: "COMPOSER_TEXT",
      now: T1,
      originNote: "pay the supplier",
    });
    const taskIdB = outcomeB.action === "CREATED" ? outcomeB.task.id : "";
    expect(taskIdB).not.toBe(taskIdA);
    await port.appendConversationEvent(taskIdA, { kind: "USER_TEXT", text: "on A" }, T1);
    await port.appendConversationEvent(taskIdB, { kind: "USER_TEXT", text: "on B" }, T1);
    expect((await port.conversationLog(taskIdA)).map((entry) => entry.event)).toEqual([{ kind: "USER_TEXT", text: "on A" }]);
    expect((await port.conversationLog(taskIdB)).map((entry) => entry.event)).toEqual([{ kind: "USER_TEXT", text: "on B" }]);
  });

  it("fails closed typed: unknown task, terminal task, malformed event, invalid instant", async () => {
    const storage = fakeStorage();
    const taskId = await seedTask(storage);
    const port = createBrowserAgentTaskSessionPort({ storage });
    await expect(port.appendConversationEvent("task-nope", { kind: "USER_TEXT", text: "x" }, T0)).rejects.toMatchObject({
      code: "UNKNOWN_TASK",
    });
    await expect(port.appendConversationEvent(taskId, { kind: "NOPE" } as never, T0)).rejects.toMatchObject({
      name: "Error",
    });
    await expect(port.appendConversationEvent(taskId, { kind: "USER_TEXT", text: "x" }, "not-an-instant")).rejects.toMatchObject(
      expect.objectContaining({ code: expect.any(String) }),
    );
    // An unknown id READS as empty (a replay of nothing) — only the
    // append path fails closed on unknown tasks.
    expect(await port.conversationLog("task-nope")).toEqual([]);
    // The monotonic-terminal law: a closed task records no further conversation.
    await port.updateTaskStatus(taskId, "CANCELLED", "CANCELLED", T1, "closed for the test");
    await expect(port.appendConversationEvent(taskId, { kind: "USER_TEXT", text: "late" }, T1)).rejects.toMatchObject({
      code: "TERMINAL_TASK",
    });
  });

  it("the SNAPSHOT ROUND-TRIP: a brand-new adapter over the same store replays; ids stay monotonic after reload", async () => {
    const storage = fakeStorage();
    const taskId = await seedTask(storage);
    const port = createBrowserAgentTaskSessionPort({ storage });
    await port.appendConversationEvent(taskId, { kind: "CONVERSATION_STARTED", selection: SELECTION }, T0);
    await port.appendConversationEvent(taskId, { kind: "USER_TEXT", text: "hello" }, T0);
    // The restart: a NEW adapter instance over the SAME storage.
    const port2 = createBrowserAgentTaskSessionPort({ storage });
    const replay = await port2.conversationLog(taskId);
    expect(replay.map((entry) => entry.id)).toEqual(["conv:1", "conv:2"]);
    expect(replay.map((entry) => entry.event.kind)).toEqual(["CONVERSATION_STARTED", "USER_TEXT"]);
    // Ids continue monotonically after the reload (never reused).
    const next = await port2.appendConversationEvent(taskId, { kind: "ASSISTANT_TEXT", text: "hi" }, T1);
    expect(next.map((entry) => entry.id)).toEqual(["conv:1", "conv:2", "conv:3"]);
  });

  it("a PRE-P24-3 snapshot (no conversations) loads empty; malformed persisted events drop from replay", async () => {
    // A legacy snapshot: tasks exist, no conversations key at all.
    const legacyStorage = fakeStorage();
    const legacyTaskId = await seedTask(legacyStorage);
    const legacyPort = createBrowserAgentTaskSessionPort({ storage: legacyStorage });
    expect(await legacyPort.conversationLog(legacyTaskId)).toEqual([]);

    // A corrupted conversations map: one valid task with one good event,
    // one malformed event and one event under the WRONG task id.
    const storage = fakeStorage();
    const taskId = await seedTask(storage);
    const good = createBrowserAgentTaskSessionPort({ storage });
    await good.appendConversationEvent(taskId, { kind: "USER_TEXT", text: "good" }, T0);
    const raw = JSON.parse(storage.getItem("payswap.agent.tasks.v1")!) as {
      conversations: Record<string, unknown[]>;
    };
    raw.conversations[taskId] = [
      ...raw.conversations[taskId]!,
      { id: "conv:99", taskId, at: T1, event: { kind: "USER_TEXT", text: "" } }, // malformed → dropped
      { id: "conv:98", taskId: "other-task", at: T1, event: { kind: "USER_TEXT", text: "misfiled" } }, // wrong task → dropped
      "not-even-a-record", // malformed → dropped
    ];
    storage.setItem("payswap.agent.tasks.v1", JSON.stringify(raw));
    const reloaded = createBrowserAgentTaskSessionPort({ storage });
    const replay = await reloaded.conversationLog(taskId);
    expect(replay.map((entry) => entry.event)).toEqual([{ kind: "USER_TEXT", text: "good" }]);
    // Dropped events still reserve their ids (monotonic, never reused).
    const next = await reloaded.appendConversationEvent(taskId, { kind: "ASSISTANT_TEXT", text: "after" }, T1);
    expect(next.at(-1)!.id).toBe(`conv:${next.length}`);
  });
});

/* --------------------------- the projections --------------------------- */

describe("the entry projection (people language, append order)", () => {
  it("labels speakers and renders each kind honestly", () => {
    const entries = projectConversationEntries(
      log([
        { at: T0, event: { kind: "USER_TEXT", text: "list my products" } },
        { at: T0, event: { kind: "ASSISTANT_TEXT", text: "Here they are." } },
        { at: T0, event: { kind: "TOOL_CALL", callId: "c1", toolName: "stripe.resources.products.list", argsEcho: "{\"limit\":10}" } },
        { at: T0, event: { kind: "TOOL_RESULT", callId: "c1", toolName: "stripe.resources.products.list", status: "OK", summary: "3 items", truncated: true } },
        { at: T0, event: { kind: "CONVERSATION_NOTE", note: "stopped honestly" } },
      ]),
    );
    expect(entries.map((entry) => entry.speaker)).toEqual(["you", "model", "system", "system", "system"]);
    expect(entries[3]!.text).toContain("[truncated]");
    expect(entries[2]!.text).toContain("stripe.resources.products.list");
  });
});

describe("the PUBLIC history rebuild (the resume input)", () => {
  it("groups tool calls under their assistant turn and answers as tool messages with bounded summaries", () => {
    const events = log([
      { at: T0, event: { kind: "USER_TEXT", text: "what do I have?" } },
      { at: T0, event: { kind: "ASSISTANT_TEXT", text: "Checking." } },
      { at: T0, event: { kind: "TOOL_CALL", callId: "c1", toolName: "stripe.resources.products.list", argsEcho: "{}" } },
      { at: T0, event: { kind: "TOOL_RESULT", callId: "c1", toolName: "stripe.resources.products.list", status: "OK", summary: "3 items" } },
      { at: T0, event: { kind: "ASSISTANT_TEXT", text: "You have 3 products." } },
    ]);
    const history = conversationHistoryFromLog(events);
    expect(history).toHaveLength(4);
    expect(history[1]).toMatchObject({ role: "assistant", content: "Checking.", toolCalls: [{ id: "c1", name: "stripe.resources.products.list" }] });
    expect(history[2]).toMatchObject({ role: "tool", toolCallId: "c1" });
    expect(history[2]!.content).toContain("3 items");
    expect(history[3]).toMatchObject({ role: "assistant", content: "You have 3 products." });
  });

  it("a TRAILING paused prepare call enters history unanswered (the human owns its result)", () => {
    const events = log([
      { at: T0, event: { kind: "USER_TEXT", text: "create a product" } },
      { at: T0, event: { kind: "ASSISTANT_TEXT", text: "Proposing." } },
      { at: T0, event: { kind: "TOOL_CALL", callId: "cp", toolName: "stripe.prepare_action", argsEcho: "{\"operationId\":\"PostProducts\"}" } },
      { at: T0, event: { kind: "PREPARED_ACTION_PENDING", action: preparedAction() } },
    ]);
    const history = conversationHistoryFromLog(events);
    expect(history.at(-1)).toMatchObject({
      role: "assistant",
      toolCalls: [{ id: "cp", name: "stripe.prepare_action" }],
    });
    expect(history.some((message) => message.role === "tool" && message.toolCallId === "cp")).toBe(false);
    expect(unansweredToolCallOf(events)).toEqual({ callId: "cp", toolName: "stripe.prepare_action" });
    // Once answered, the fold reports nothing unanswered.
    const answered = log([
      ...events.map((entry) => ({ at: entry.at, event: entry.event as unknown })),
      { at: T1, event: { kind: "TOOL_RESULT", callId: "cp", toolName: "stripe.prepare_action", status: "OK", summary: "executed" } },
    ]);
    expect(unansweredToolCallOf(answered)).toBeUndefined();
  });
});

/* ------------------------- the decision table -------------------------- */

describe("the conversational confirmation table (the human-event law)", () => {
  it("EXACT matches only — after normalization", () => {
    expect(matchConversationConfirmation("yes")).toBe("CONFIRM");
    expect(matchConversationConfirmation("  Yes. ")).toBe("CONFIRM");
    expect(matchConversationConfirmation("do it!")).toBe("CONFIRM");
    expect(matchConversationConfirmation("no")).toBe("REFUSE");
    expect(matchConversationConfirmation("Don't do it.")).toBe("REFUSE");
    expect(matchConversationConfirmation("yes but change the amount")).toBe("NOT_A_DECISION");
    expect(matchConversationConfirmation("what about the products?")).toBe("NOT_A_DECISION");
    expect(matchConversationConfirmation("")).toBe("NOT_A_DECISION");
  });

  it("the phrase tables are pinned and disjoint", () => {
    expect(CONVERSATION_CONFIRM_PHRASES).toContain("go ahead");
    expect(CONVERSATION_REFUSE_PHRASES).toContain("decline");
    for (const phrase of CONVERSATION_CONFIRM_PHRASES) {
      expect(CONVERSATION_REFUSE_PHRASES).not.toContain(phrase);
    }
    expect(normalizeConfirmationText("  YES   PLEASE  !!")).toBe("yes please");
  });

  it("strong tiers NEVER confirm conversationally", () => {
    expect(tierAllowsConversationalConfirmation("NONE")).toBe(true);
    expect(tierAllowsConversationalConfirmation("CONFIRM")).toBe(true);
    expect(tierAllowsConversationalConfirmation("STRONG_CONFIRM")).toBe(false);
    expect(tierAllowsConversationalConfirmation("REAUTH")).toBe(false);
  });
});

/* -------------------------- the account folds -------------------------- */

describe("the account-context folds (one binding, last wins)", () => {
  const accounts: readonly StripeAccountFactsPin[] = [
    {
      connectionId: "conn-1",
      stripeAccountId: "acct_test_1",
      accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
      environment: "SANDBOX",
      displayName: "Main",
      grantedPermissionRules: ["Products: Read"],
    },
    {
      connectionId: "conn-2",
      stripeAccountId: "acct_test_2",
      accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
      environment: "SANDBOX",
      grantedPermissionRules: [],
    },
  ];

  it("the LAST binding wins; INITIAL and USER_AUTHORIZED_SWITCH are distinguished", () => {
    const events = log([
      { at: T0, event: { kind: "ACCOUNT_CONTEXT_BOUND", connectionId: "conn-1", scopeChange: "INITIAL" } },
      { at: T1, event: { kind: "ACCOUNT_CONTEXT_BOUND", connectionId: "conn-2", scopeChange: "USER_AUTHORIZED_SWITCH" } },
    ]);
    const binding = foldAccountBinding(events);
    expect(binding).toEqual({ connectionId: "conn-2", boundAt: T1, scopeChange: "USER_AUTHORIZED_SWITCH" });
    expect(boundAccountFacts(events, accounts)?.stripeAccountId).toBe("acct_test_2");
    expect(foldAccountBinding(log([]))).toBeUndefined();
    expect(boundAccountFacts(log([]), accounts)).toBeUndefined();
    // A bound connection whose facts can no longer resolve → undefined
    // (the honest unresolved note renders, never a stale guess).
    expect(
      boundAccountFacts(
        log([{ at: T0, event: { kind: "ACCOUNT_CONTEXT_BOUND", connectionId: "conn-gone", scopeChange: "INITIAL" } }]),
        accounts,
      ),
    ).toBeUndefined();
  });

  it("the chip line names account, id and environment (multi-account clarity)", () => {
    expect(accountContextLine(accounts[0]!)).toBe("Stripe · Main · acct_test_1 · SANDBOX");
    expect(accountContextLine(accounts[1]!)).toBe("Stripe · acct_test_2 · acct_test_2 · SANDBOX");
  });
});
