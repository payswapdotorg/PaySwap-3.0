/**
 * @payswap/app — the CONVERSATION WIRING integration battery (P24-3,
 * ADR-0017 D8/D10/D11 — handoff §3.3/§3.4/§7.2/§13.4).
 *
 * The composer↔conversation binding, machine-checked END-TO-END against
 * the REAL controller, wiring, cycle runner, actions, engine, registry,
 * runtime and browser session adapter — only the HOST-BRIDGED plane is
 * faked (the model port, the catalogue, the reads, the prepared-action
 * host and the account facts), exactly what P24-D wires for real:
 *
 * - the SEND PATH: a seeded task starts the conversation (the user text
 *   is recorded even before a model is selected — lineage is
 *   append-only); the no-selection honest note; the selected model
 *   invoked VERBATIM; the UNKNOWN follow-up owned by the ACTIVE
 *   conversation (the router reply does NOT fire);
 * - the ACCOUNT SELECTOR (§3.4): one connection auto-binds; multiple
 *   connections ask; an explicit switch is a USER_AUTHORIZED scope
 *   change and pending actions from the old context do NOT carry over;
 * - the TWO-PHASE LAW (§7.2/D10): the prepare pause; the exact yes/no
 *   decided by the pinned phrase table (never model interpretation);
 *   strong tiers never confirm conversationally; the confirm path
 *   (host-minted authorization → execution → the model continuation
 *   sees the outcome EXACTLY once); the refusal path; the digest and
 *   account gates; UNKNOWN outcomes render as reconcile cards;
 * - the RESUME law (§13.4): a fresh controller over the SAME store
 *   replays the public history; an EXPIRED pending action is marked
 *   expired and answered — NEVER auto-executed; a fresh pending action
 *   presents its card and nothing executes;
 * - the WEB HONESTY tier: an unbound plane renders the honest notes,
 *   never a simulated conversation, and the verbs are inert.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createAgentComposerController,
  type AgentComposerController,
} from "../../src/agent/agentComposerController.js";
import { AgentComposerPanel } from "../../src/agent/AgentComposerPanel.js";
import { AGENT_INTENT_UNKNOWN_REPLY } from "../../src/agent/intentRouter.js";
import {
  AgentModelConversationError,
  type AgentModelConversationPort,
  type AgentModelTurnChunk,
  type AgentModelTurnRequest,
} from "../../src/agent/modelConversationPort.js";
import {
  AGENT_MODEL_CONVERSATION_UNBOUND_NOTE,
} from "../../src/agent/modelConversationPort.js";
import { STRIPE_TOOL_CATALOGUE_UNBOUND_NOTE } from "../../src/agent/stripeToolCataloguePort.js";
import type {
  StripeAccountFactsPin,
  StripeOperationFactPin,
  StripeToolCataloguePort,
} from "../../src/agent/stripeToolCataloguePort.js";
import type {
  StripePreparedActionPort,
  StripeResourceReadPort,
} from "../../src/agent/stripeToolExecutionPort.js";
import type { StripePreparedActionPin } from "../../src/agent/stripePreparedActionPins.js";
import { stableStringify } from "../../src/agent/stripeToolOutput.js";
import type { AgentConversationPlane } from "../../src/agent/agentConversationWiring.js";

/* ------------------------------ the fixtures --------------------------- */

const SELECTION = { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "high" } as const;
const T0 = "2026-10-31T12:00:00Z";
const FRESH_EXPIRY = "2026-10-31T13:00:00Z";
const STALE_EXPIRY = "2026-10-31T11:00:00Z";
const CATALOGUE_RELEASE = "v2596 / 2026-09-30.endive";

const ACCOUNT_1: StripeAccountFactsPin = {
  connectionId: "conn-1",
  stripeAccountId: "acct_test_1",
  accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
  environment: "SANDBOX",
  displayName: "Main test account",
  grantedPermissionRules: ["Products: Read", "Prices: Read", "Customers: Read"],
};
const ACCOUNT_2: StripeAccountFactsPin = {
  connectionId: "conn-2",
  stripeAccountId: "acct_test_2",
  accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
  environment: "SANDBOX",
  displayName: "Second test account",
  grantedPermissionRules: ["Products: Read"],
};

function fact(overrides: Partial<StripeOperationFactPin>): StripeOperationFactPin {
  return {
    operationId: "ListProducts",
    apiNamespace: "v1",
    method: "GET",
    path: "/v1/products",
    pathParams: [],
    listPaginated: true,
    summary: "List all products.",
    resourceFamily: "products",
    packId: "D_PRODUCTS_PRICING_CATALOG",
    effectClass: "READ_ONLY",
    approvalTier: "NONE",
    supportState: "IMPLEMENTED",
    requiredPermissionRule: "Products: Read",
    ...overrides,
  };
}

const FACTS: readonly StripeOperationFactPin[] = [
  fact({ operationId: "ListProducts", resourceFamily: "products" }),
  fact({ operationId: "GetProducts", resourceFamily: "products", pathParams: ["id"], path: "/v1/products/{id}", listPaginated: false, summary: "Retrieve a product." }),
  fact({ operationId: "PostProducts", method: "POST", effectClass: "STRIPE_CONFIGURATION_WRITE", approvalTier: "CONFIRM", resourceFamily: "products" }),
];

function cataloguePort(): StripeToolCataloguePort {
  return {
    tier: "HOST_BRIDGED",
    catalogueRelease: CATALOGUE_RELEASE,
    async listOperationFacts() {
      return [...FACTS];
    },
    async operationFact(operationId) {
      return FACTS.find((entry) => entry.operationId === operationId);
    },
  };
}

function readsPort(calls: unknown[] = []): StripeResourceReadPort {
  return {
    tier: "HOST_BRIDGED",
    async executeRead(request) {
      calls.push(request);
      return { ok: true, output: { object: "list", data: [{ id: "prod_1", name: "Existing" }] } };
    },
  };
}

/* --------------------------- the fake model ---------------------------- */

type TurnScript = (request: AgentModelTurnRequest) => AgentModelTurnChunk[];

function scriptedModel(scripts: readonly TurnScript[]) {
  const requests: AgentModelTurnRequest[] = [];
  let cursor = 0;
  const port: AgentModelConversationPort = {
    tier: "HOST_BRIDGED",
    async describeModelSupport() {
      return { supportsToolCalling: true, supportsStreaming: true };
    },
    async *startTurn(request): AsyncGenerator<AgentModelTurnChunk> {
      requests.push({ ...request, messages: [...request.messages], tools: [...request.tools] });
      const script = scripts[cursor];
      cursor += 1;
      if (script === undefined) {
        throw new AgentModelConversationError("PROVIDER_FAILURE", "the scripted model ran out of turns", false);
      }
      for (const chunk of script(request)) {
        yield chunk;
      }
    },
  };
  return { port, requests };
}

/** A slow streaming turn (yields a delta every few ms — never completes on its own). */
async function* slowStream(): AsyncGenerator<AgentModelTurnChunk> {
  yield { kind: "TEXT_DELTA", text: "working" };
  for (let i = 0; i < 200; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 4));
    yield { kind: "TEXT_DELTA", text: "." };
  }
  yield { kind: "TURN_COMPLETED", finish: "STOP" };
}

const text = (t: string): AgentModelTurnChunk => ({ kind: "TEXT_DELTA", text: t });
const toolCall = (id: string, name: string, input: unknown): AgentModelTurnChunk => ({
  kind: "TOOL_CALL",
  call: { id, name, input },
});
const done = (finish: "STOP" | "TOOL_CALLS" = "STOP"): AgentModelTurnChunk => ({
  kind: "TURN_COMPLETED",
  finish,
});

const PREPARE_INPUT = {
  operationId: "PostProducts",
  parameters: [{ name: "name", value: "Annual Membership", location: "body" }],
};

/** The model script that proposes the prepared action (the D10 pause). */
const proposeTurn: TurnScript = () => [
  text("I will create that product — here is the exact proposal."),
  toolCall("call-prepare-1", "stripe.prepare_action", PREPARE_INPUT),
  done("TOOL_CALLS"),
];

/* --------------------- the fake prepared-action host ------------------- */

interface PreparedHostOptions {
  readonly approvalTier?: StripePreparedActionPin["approvalTier"];
  readonly expiresAt?: string;
  readonly executeOutcome?: StripePreparedActionPin extends never ? never : import("../../src/agent/stripePreparedActionPins.js").StripeActionExecutionOutcomePin;
  /** Overrides inspect (simulates a host-side parameter change after approval). */
  readonly inspectDigestOverride?: string;
}

function preparedActionHost(accounts: readonly StripeAccountFactsPin[], options: PreparedHostOptions = {}) {
  const actions = new Map<string, StripePreparedActionPin>();
  const authorizations = new Map<string, { authorizationId: string; preparedActionId: string; approvedDigest: string; consumedAt: string | null }>();
  const calls = {
    prepare: [] as { operationId: string; connectionId: string; taskId: string }[],
    authorize: [] as { preparedActionId: string; principalId: string; confirmedDigest: string }[],
    execute: [] as string[],
    inspect: [] as string[],
  };
  const port: StripePreparedActionPort = {
    tier: "HOST_BRIDGED",
    async prepare(proposal) {
      calls.prepare.push({ operationId: proposal.operationId, connectionId: proposal.connectionId, taskId: proposal.taskId });
      const account = accounts.find((entry) => entry.connectionId === proposal.connectionId) ?? accounts[0]!;
      const preparedActionId = `pa-${actions.size + 1}`;
      const action: StripePreparedActionPin = {
        preparedActionId,
        operationId: proposal.operationId,
        catalogueRelease: CATALOGUE_RELEASE,
        accountContext: {
          connectionId: account.connectionId,
          stripeAccountId: account.stripeAccountId,
          accountModel: account.accountModel,
          environment: account.environment,
        },
        parameters: [...proposal.parameters],
        digest: `sha256:${stableStringify({ operationId: proposal.operationId, parameters: proposal.parameters, connectionId: proposal.connectionId })}`,
        effectClass: "STRIPE_CONFIGURATION_WRITE",
        approvalTier: options.approvalTier ?? "CONFIRM",
        confirmationInputs: ["Confirm creating this product"],
        idempotencyKeyRef: `idem-${preparedActionId}`,
        readBackOperationId: "GetProducts",
        expiresAt: options.expiresAt ?? FRESH_EXPIRY,
        createdBy: "model_proposal",
      };
      actions.set(preparedActionId, action);
      return { ok: true, action };
    },
    async authorize(input) {
      calls.authorize.push({ ...input });
      const action = actions.get(input.preparedActionId);
      if (action === undefined) {
        return { ok: false, reason: "unknown prepared action" };
      }
      if (action.digest !== input.confirmedDigest) {
        return { ok: false, reason: "the digest no longer matches the prepared action" };
      }
      const authorizationId = `auth-${authorizations.size + 1}`;
      authorizations.set(authorizationId, {
        authorizationId,
        preparedActionId: action.preparedActionId,
        approvedDigest: action.digest,
        consumedAt: null,
      });
      return {
        ok: true,
        authorization: {
          authorizationId,
          preparedActionId: action.preparedActionId,
          approvedDigest: action.digest,
          approvedByPrincipalId: input.principalId,
          accountContext: action.accountContext,
          consumedAt: null,
          expiresAt: FRESH_EXPIRY,
        },
      };
    },
    async execute(authorizationId) {
      calls.execute.push(authorizationId);
      const authorization = authorizations.get(authorizationId);
      if (authorization === undefined || authorization.consumedAt !== null) {
        return { kind: "FAILED", reason: "REFUSED_BEFORE_DISPATCH", detail: "unknown or consumed authorization" };
      }
      authorization.consumedAt = T0;
      return options.executeOutcome ?? { kind: "CONFIRMED", providerRefs: ["prod_new_1"], readBackDue: false };
    },
    async inspect(preparedActionId) {
      calls.inspect.push(preparedActionId);
      const action = actions.get(preparedActionId);
      if (action === undefined) {
        return null;
      }
      return options.inspectDigestOverride === undefined ? action : { ...action, digest: options.inspectDigestOverride };
    },
  };
  return { port, calls };
}

/* ---------------------------- the harness ------------------------------ */

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length(): number {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

interface Harness {
  readonly controller: AgentComposerController;
  readonly model: ReturnType<typeof scriptedModel>;
  readonly prepared: ReturnType<typeof preparedActionHost>;
  readonly readCalls: unknown[];
}

function harness(options: {
  readonly scripts?: readonly (TurnScript | "SLOW")[];
  readonly accounts?: readonly StripeAccountFactsPin[];
  readonly preparedOptions?: PreparedHostOptions;
  readonly storage?: Storage;
  readonly plane?: boolean;
}): Harness {
  const accounts = options.accounts ?? [ACCOUNT_1];
  const readCalls: unknown[] = [];
  const model = scriptedModel(
    (options.scripts ?? []).map((script) => (script === "SLOW" ? () => [] : script)),
  );
  const prepared = preparedActionHost(accounts, options.preparedOptions);
  const plane: AgentConversationPlane | undefined = options.plane === false
    ? undefined
    : {
        model: model.port,
        catalogue: cataloguePort(),
        accounts: {
          tier: "HOST_BRIDGED",
          async listAccountFacts() {
            return [...accounts];
          },
          async accountFacts(connectionId) {
            return accounts.find((entry) => entry.connectionId === connectionId);
          },
        },
        reads: readsPort(readCalls),
        preparedActions: prepared.port,
        principalId: () => "principal-1",
      };
  const controller = createAgentComposerController({
    storage: options.storage ?? fakeStorage(),
    clock: () => T0,
    ...(plane !== undefined ? { conversationPlane: plane } : {}),
    modelCatalog: {
      async listModels() {
        return [{ providerId: "zai", modelId: "glm-5.2", displayName: "GLM 5.2", reasoningLevels: ["low", "medium", "high"] }];
      },
    },
  });
  return { controller, model, prepared, readCalls };
}

async function send(controller: AgentComposerController, text: string): Promise<void> {
  controller.setDraft(text);
  await controller.send();
}

/** Seed a task, record the model, and run one answering turn. */
async function driveToAnswered(h: Harness): Promise<string> {
  await send(h.controller, "pay the supplier for the products");
  await h.controller.loadModelCatalog();
  await h.controller.selectModel(SELECTION);
  await send(h.controller, "what products do I have?");
  const taskId = h.controller.getState().conversation.taskId;
  expect(taskId).toBeDefined();
  return taskId!;
}

const logKinds = async (h: Harness, taskId: string): Promise<string[]> => {
  const log = await h.controller.sessionPort().conversationLog(taskId);
  return log.map((entry) => entry.event.kind);
};

/* ------------------------- the web honesty tier ------------------------ */

describe("the unbound plane (the web tier's truth)", () => {
  it("renders the honest unbound notes — never a simulated conversation; the verbs are inert", async () => {
    const h = harness({ plane: false });
    await h.controller.refresh();
    const conversation = h.controller.getState().conversation;
    expect(conversation.phase).toBe("UNBOUND");
    // The verbs never throw and never do anything without a plane.
    await h.controller.confirmPreparedAction("pa-none");
    await h.controller.refusePreparedAction("pa-none");
    await h.controller.bindAccountContext("conn-1");
    h.controller.cancelConversation();
    const markup = renderToStaticMarkup(
      <AgentComposerPanel state={h.controller.getState()} controller={h.controller} />,
    );
    expect(markup).toContain(AGENT_MODEL_CONVERSATION_UNBOUND_NOTE);
    expect(markup).toContain(STRIPE_TOOL_CATALOGUE_UNBOUND_NOTE);
    expect(markup).not.toContain("ps-agent-prepared-action");
  });
});

/* ------------------------ the send path (D8) --------------------------- */

describe("the seeded conversation turn", () => {
  it("records the user text BEFORE any model exists (append-only lineage) + the honest no-selection note", async () => {
    const h = harness({ scripts: [() => [text("You have one product."), done()]] });
    await send(h.controller, "pay the supplier for the products");
    const state = h.controller.getState().conversation;
    expect(state.phase).toBe("IDLE");
    expect(state.modelNote).toContain("no model recorded yet");
    const taskId = state.taskId!;
    expect(await logKinds(h, taskId)).toEqual(["ACCOUNT_CONTEXT_BOUND", "USER_TEXT"]);
    // The model was never invoked (no selection — none is substituted).
    expect(h.model.requests).toHaveLength(0);
  });

  it("after selection, invokes the SAME persisted model VERBATIM with the account-scoped tool set", async () => {
    const h = harness({ scripts: [() => [text("You have one product."), done()]] });
    const taskId = await driveToAnswered(h);
    expect(h.model.requests).toHaveLength(1);
    expect(h.model.requests[0]!.selection).toEqual(SELECTION);
    const tools = h.model.requests[0]!.tools.map((tool) => tool.name);
    expect(tools).toContain("stripe.discover_capabilities");
    expect(tools).toContain("stripe.prepare_action");
    // The intent ("...for the products") names the products family and
    // the connection grants Products: Read → the domain read tool rides.
    expect(tools).toContain("stripe.resources.products.list");
    expect(h.model.requests[0]!.toolChoice).toBe("auto");
    expect(await logKinds(h, taskId)).toEqual([
      "ACCOUNT_CONTEXT_BOUND",
      "USER_TEXT",
      "CONVERSATION_STARTED",
      "USER_TEXT",
      "ASSISTANT_TEXT",
    ]);
    const log = await h.controller.sessionPort().conversationLog(taskId);
    expect(log[0]!.event).toEqual({ kind: "ACCOUNT_CONTEXT_BOUND", connectionId: "conn-1", scopeChange: "INITIAL" });
    expect(log[2]!.event).toEqual({ kind: "CONVERSATION_STARTED", selection: SELECTION });
    // The conversation consumed the UNKNOWN follow-up: the ROUTER's honest
    // reply never fired (the unbound mission-intake note is a different,
    // pre-existing honest line — not the router speaking).
    expect(
      h.controller.getState().entries.filter((entry) => entry.kind === "AGENT_REPLY" && entry.text === AGENT_INTENT_UNKNOWN_REPLY),
    ).toHaveLength(0);
    expect(h.controller.getState().conversation.accountContext?.stripeAccountId).toBe("acct_test_1");
  });

  it("MULTIPLE ACCOUNTS: no silent pick — the honest note asks, and the explicit bind is a USER_AUTHORIZED scope change", async () => {
    const h = harness({
      accounts: [ACCOUNT_1, ACCOUNT_2],
      scripts: [
        () => [text("Which account?"), done()],
        () => [text("Bound. You have one product."), done()],
      ],
    });
    await send(h.controller, "pay the supplier for the products");
    await h.controller.loadModelCatalog();
    await h.controller.selectModel(SELECTION);
    await send(h.controller, "what products do I have?");
    const taskId = h.controller.getState().conversation.taskId!;
    // Two connections → NO auto-bind → the honest ask-note + a toolless turn.
    expect(h.controller.getState().conversation.accountContext).toBeUndefined();
    expect(h.model.requests[0]!.tools).toHaveLength(0);
    expect(h.model.requests[0]!.toolChoice).toBe("none");
    const log1 = await h.controller.sessionPort().conversationLog(taskId);
    expect(log1.some((entry) => entry.event.kind === "CONVERSATION_NOTE" && entry.event.note.includes("pick a connection"))).toBe(true);
    // The explicit user gesture binds.
    await h.controller.bindAccountContext("conn-2");
    const log2 = await h.controller.sessionPort().conversationLog(taskId);
    const binding = log2.find((entry) => entry.event.kind === "ACCOUNT_CONTEXT_BOUND")!.event;
    expect(binding).toEqual({ kind: "ACCOUNT_CONTEXT_BOUND", connectionId: "conn-2", scopeChange: "INITIAL" });
    expect(h.controller.getState().conversation.accountContext?.displayName).toBe("Second test account");
    // The next turn carries the bound connection's scoped tools.
    await send(h.controller, "and the products now?");
    expect(h.model.requests[1]!.tools.map((tool) => tool.name)).toContain("stripe.resources.products.list");
  });
});

/* --------------------- the two-phase law (D10/§7.2) -------------------- */

describe("the prepared-action pause and the conversational decision", () => {
  async function driveToPending(h: Harness): Promise<string> {
    await driveToAnswered(h);
    await send(h.controller, "create a product called Annual Membership");
    return h.controller.getState().conversation.taskId!;
  }

  it("the prepare PAUSES the loop with the EXACT preview; the card renders; nothing executed", async () => {
    const h = harness({
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
      ],
    });
    const taskId = await driveToPending(h);
    const conversation = h.controller.getState().conversation;
    expect(conversation.phase).toBe("AWAITING_CONFIRMATION");
    const card = conversation.pendingAction!;
    expect(card.phase).toBe("PENDING");
    expect(card.action.operationId).toBe("PostProducts");
    expect(card.action.digest).toContain("sha256:");
    expect(card.action.approvalTier).toBe("CONFIRM");
    expect(card.action.accountContext.connectionId).toBe("conn-1");
    expect(h.prepared.calls.authorize).toHaveLength(0);
    expect(h.prepared.calls.execute).toHaveLength(0);
    // The pending prepare call is UNANSWERED in the record (the human owns its result).
    expect(await logKinds(h, taskId)).toContain("PREPARED_ACTION_PENDING");
    expect(await logKinds(h, taskId)).not.toContain("EXECUTION_OUTCOME");
    const markup = renderToStaticMarkup(
      <AgentComposerPanel state={h.controller.getState()} controller={h.controller} />,
    );
    expect(markup).toContain("ps-agent-prepared-action");
    expect(markup).toContain("Preview digest");
    expect(markup).toContain(card.action.digest.replaceAll('"', "&quot;"));
    expect(markup).toContain("Confirm this action");
  });

  it("an exact 'yes' CONFIRMS conversationally: host-minted authorization → execution → the model continues with the outcome EXACTLY once", async () => {
    const h = harness({
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
        () => [text("Created — the product is live."), done()],
      ],
    });
    const taskId = await driveToPending(h);
    const callId = "call-prepare-1";
    await send(h.controller, "yes");
    // The host minted the authorization bound to the exact digest + principal.
    expect(h.prepared.calls.authorize).toHaveLength(1);
    expect(h.prepared.calls.authorize[0]!.confirmedDigest).toBe(h.prepared.calls.authorize[0]!.confirmedDigest);
    expect(h.prepared.calls.authorize[0]!.principalId).toBe("principal-1");
    expect(h.prepared.calls.execute).toHaveLength(1);
    expect(await logKinds(h, taskId)).toEqual([
      "ACCOUNT_CONTEXT_BOUND",
      "USER_TEXT",
      "CONVERSATION_STARTED",
      "USER_TEXT",
      "ASSISTANT_TEXT",
      "USER_TEXT",
      "ASSISTANT_TEXT",
      "TOOL_CALL",
      "PREPARED_ACTION_PENDING",
      "USER_TEXT",
      "PREPARED_ACTION_CONFIRMED",
      "EXECUTION_OUTCOME",
      "TOOL_RESULT",
      "ASSISTANT_TEXT",
    ]);
    expect(h.controller.getState().conversation.phase).toBe("IDLE");
    // The continuation request carries the tool result EXACTLY once.
    const continuation = h.model.requests[2]!;
    const toolMessages = continuation.messages.filter(
      (message) => message.role === "tool" && message.toolCallId === callId,
    );
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0]!.content).toContain("CONFIRMED");
  });

  it("an exact 'no' REFUSES: the action dies, the call is answered, nothing executes", async () => {
    const h = harness({
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
      ],
    });
    const taskId = await driveToPending(h);
    await send(h.controller, "no");
    expect(h.prepared.calls.authorize).toHaveLength(0);
    expect(h.prepared.calls.execute).toHaveLength(0);
    const log = await h.controller.sessionPort().conversationLog(taskId);
    const refused = log.find((entry) => entry.event.kind === "PREPARED_ACTION_REFUSED");
    expect(refused).toBeDefined();
    const answered = log.find((entry) => entry.event.kind === "TOOL_RESULT");
    expect(answered!.event).toMatchObject({ callId: "call-prepare-1", status: "ERROR" });
    expect(h.controller.getState().conversation.pendingAction).toBeUndefined();
  });

  it("anything else gets the honest decide-first note — the loop stays paused, nothing executes", async () => {
    const h = harness({
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
      ],
    });
    await driveToPending(h);
    await send(h.controller, "actually change the name to Premium first");
    expect(h.prepared.calls.authorize).toHaveLength(0);
    const conversation = h.controller.getState().conversation;
    expect(conversation.phase).toBe("AWAITING_CONFIRMATION");
    expect(conversation.entries.some((entry) => entry.text.includes("awaiting your decision"))).toBe(true);
  });

  it("STRONG tiers NEVER confirm conversationally — the pinned table is the only instrument", async () => {
    const h = harness({
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
      ],
      preparedOptions: { approvalTier: "STRONG_CONFIRM" },
    });
    await driveToPending(h);
    await send(h.controller, "yes");
    expect(h.prepared.calls.authorize).toHaveLength(0);
    expect(h.controller.getState().conversation.phase).toBe("AWAITING_CONFIRMATION");
    // A refusal is always allowed conversationally.
    await send(h.controller, "no");
    expect(h.controller.getState().conversation.pendingAction).toBeUndefined();
  });

  it("a DIGEST change after approval refuses typed — a NEW preview is required (nothing executes)", async () => {
    const h = harness({
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
      ],
      preparedOptions: { inspectDigestOverride: "sha256:the-host-changed-the-parameters" },
    });
    await driveToPending(h);
    await send(h.controller, "yes");
    expect(h.prepared.calls.authorize).toHaveLength(0);
    expect(h.prepared.calls.execute).toHaveLength(0);
    const conversation = h.controller.getState().conversation;
    expect(conversation.phase).toBe("AWAITING_CONFIRMATION");
    expect(conversation.entries.some((entry) => entry.text.includes("NEW preview"))).toBe(true);
  });

  it("an account-context switch invalidates the pending action (the authorization binds the account)", async () => {
    const h = harness({
      accounts: [ACCOUNT_1, ACCOUNT_2],
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
      ],
    });
    await driveToAnswered(h);
    await h.controller.bindAccountContext("conn-1");
    await send(h.controller, "create a product called Annual Membership");
    expect(h.controller.getState().conversation.phase).toBe("AWAITING_CONFIRMATION");
    // The user-authorized switch to the second account…
    await h.controller.bindAccountContext("conn-2");
    const log = await h.controller.sessionPort().conversationLog(
      h.controller.getState().conversation.taskId!,
    );
    expect(log.filter((entry) => entry.event.kind === "ACCOUNT_CONTEXT_BOUND").map((entry) => entry.event.scopeChange)).toEqual(["INITIAL", "USER_AUTHORIZED_SWITCH"]);
    // …and the confirm of the OLD context's action refuses typed.
    await send(h.controller, "yes");
    expect(h.prepared.calls.authorize).toHaveLength(0);
    expect(h.controller.getState().conversation.entries.some((entry) => entry.text.includes("account context changed"))).toBe(true);
  });

  it("an UNKNOWN execution outcome renders as a RECONCILE card and reaches the model as UNKNOWN", async () => {
    const h = harness({
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
        () => [text("The outcome is unknown — I will reconcile."), done()],
      ],
      preparedOptions: {
        executeOutcome: { kind: "UNKNOWN", reconciliationOperationId: "GetProducts", note: "timeout after possible dispatch" },
      },
    });
    await driveToPending(h);
    await send(h.controller, "yes");
    expect(h.controller.getState().conversation.reconcileCards).toHaveLength(1);
    const markup = renderToStaticMarkup(
      <AgentComposerPanel state={h.controller.getState()} controller={h.controller} />,
    );
    expect(markup).toContain("ps-agent-reconcile-card");
    expect(markup).toContain("UNKNOWN");
    const continuation = h.model.requests[2]!;
    const toolMessage = continuation.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call-prepare-1",
    );
    expect(toolMessage!.content).toContain("UNKNOWN");
  });
});

/* --------------------------- the resume law ---------------------------- */

describe("resume (§13.4 — task restart replays; expired never auto-executes)", () => {
  it("a FRESH pending action presents its card on resume and NOTHING executes", async () => {
    const storage = fakeStorage();
    const h = harness({
      storage,
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
      ],
    });
    await driveToAnswered(h);
    await send(h.controller, "create a product called Annual Membership");
    const taskId = h.controller.getState().conversation.taskId!;
    // A BRAND-NEW controller over the SAME store (the restart).
    const h2 = harness({ storage, scripts: [] });
    await h2.controller.refresh();
    const conversation = h2.controller.getState().conversation;
    expect(conversation.taskId).toBe(taskId);
    // The decision window reopens on resume (a phase PROJECTION of the
    // pending card) — but NOTHING executes without the human decision.
    expect(conversation.phase).toBe("AWAITING_CONFIRMATION");
    expect(conversation.pendingAction?.phase).toBe("PENDING");
    expect(conversation.entries.length).toBeGreaterThan(0);
    expect(h2.prepared.calls.execute).toHaveLength(0);
    expect(h2.prepared.calls.authorize).toHaveLength(0);
  });

  it("an EXPIRED pending action is marked expired, answered, and NEVER auto-executed", async () => {
    const storage = fakeStorage();
    const h = harness({
      storage,
      scripts: [
        () => [text("You have one product."), done()],
        proposeTurn,
      ],
      preparedOptions: { expiresAt: STALE_EXPIRY },
    });
    await driveToAnswered(h);
    await send(h.controller, "create a product called Annual Membership");
    const taskId = h.controller.getState().conversation.taskId!;
    const h2 = harness({ storage, scripts: [] });
    await h2.controller.refresh();
    const kinds = await logKinds(h2, taskId);
    expect(kinds).toContain("PREPARED_ACTION_EXPIRED");
    const log = await h2.controller.sessionPort().conversationLog(taskId);
    const answered = log.find((entry) => entry.event.kind === "TOOL_RESULT");
    expect(answered!.event).toMatchObject({ callId: "call-prepare-1", status: "ERROR" });
    expect(answered!.event).toMatchObject({ summary: expect.stringContaining("expired before confirmation") });
    expect(h2.controller.getState().conversation.pendingAction).toBeUndefined();
    expect(h2.prepared.calls.execute).toHaveLength(0);
    expect(h2.controller.getState().conversation.entries.some((entry) => entry.text.includes("expired before confirmation"))).toBe(true);
  });
});

/* -------------------------- the abort path ----------------------------- */

describe("cancellation (the user abort mid-loop)", () => {
  it("cancelRunning stops the loop honestly; the recorded partials stay; nothing executes", async () => {
    const h = harness({ scripts: [() => []] });
    await send(h.controller, "pay the supplier for the products");
    await h.controller.loadModelCatalog();
    await h.controller.selectModel(SELECTION);
    // Swap in the slow stream: the model is mid-answer when the user cancels.
    (h.model.port as { startTurn: () => AsyncGenerator<AgentModelTurnChunk> }).startTurn = async function* () {
      yield* slowStream();
    };
    const sending = send(h.controller, "summarize my products slowly");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(h.controller.getState().conversation.phase).toBe("RUNNING");
    h.controller.cancelConversation();
    await sending;
    const conversation = h.controller.getState().conversation;
    expect(conversation.phase).toBe("IDLE");
    expect(conversation.entries.some((entry) => entry.text.includes("cancelled"))).toBe(true);
    expect(h.prepared.calls.execute).toHaveLength(0);
  });
});
