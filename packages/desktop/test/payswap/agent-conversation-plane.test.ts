/**
 * PaySwap Desktop (P24-D, ADR-0017 D8/D9/D10) — the AGENT
 * CONVERSATION PLANE composition battery: the integration laws of the
 * P24-D desktop composition binding, end to end over the REAL census/
 * validator/transport adapters (the stripe-plane-adapters lifts) and
 * the channel members.
 *
 * THE LAWS THIS BATTERY PINS:
 * 1. THE STRIPE PLANE COMPOSITION over the real adapters + a scripted
 *    fetch: the census release + the executor's two-phase flow
 *    (prepare → authorize → execute → CONFIRMED with the audit trail)
 *    over the fake authority/evidence/seal (the stripe-p241-wiring-flow
 *    precedent, lifted to the production composition).
 * 2. THE MODEL-CONVERSATION MEMBER: the persisted selection forwarded
 *    VERBATIM onto the substrate surface; the tool-message toolName
 *    recovery; the tool-choice law ("none" sends no tools, "required"
 *    refused honestly); the runtime-unavailable typed mapping.
 * 3. THE ABSENT POSTURES: every member fails closed with the typed
 *    errors (never a simulated turn, never a fabricated catalogue).
 * 4. THE RENDERER COMPOSITION: the fake channel → the pinned plane
 *    (all five ports HOST_BRIDGED + the principal), the model turn's
 *    chunk sequence, the catalogue release fetched (never invented),
 *    and the honest unbound mapping when the host throws the typed
 *    not-configured error.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PersistedConnectionRecord } from "../../src/host/payswap/connections/record-store.js";
import type { ProbeEvidenceRecord } from "../../src/host/payswap/connections/probe-evidence.js";
import type { ProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import type { ConnectionSessionAuthority } from "../../src/host/payswap/connections/session-authority.js";
import {
  composeStripeActionPlane,
  type StripeActionPlane,
} from "../../src/host/payswap/stripe/stripe-plane-composition.js";
import {
  createStripePlaneChannelMembers,
  createAbsentStripePlaneChannelMembers,
} from "../../src/host/payswap/shell/stripe-plane-members.js";
import {
  createModelConversationChannelMembers,
  createAbsentModelConversationChannelMembers,
} from "../../src/host/payswap/shell/model-conversation-members.js";
import {
  ModelConversationNotConfiguredError,
  StripePlaneNotConfiguredError,
} from "../../src/host/payswap/shell/plane-errors.js";
import {
  FAKE_RAK_TEST_KEY,
  connectionRecordOf,
  fakeFs,
  probeEvidenceOf,
} from "./stripe-action-fixtures.js";
import {
  resetSharedConversationPlane,
  sharedConversationPlane,
} from "@payswap/app";
import {
  channelConversationPlaneForTest,
  composeOverFakeChannel,
} from "./agent-conversation-plane-fixtures.js";

/* ----------------------------- the fake world ----------------------------- */

const CONNECTION_ID = "conn:composition-1";

function fakeAuthority(input?: {
  readonly record?: PersistedConnectionRecord | null;
  readonly evidence?: ProbeEvidenceRecord | null;
}): Pick<
  ConnectionSessionAuthority,
  "connectionRecordOf" | "credentialSealedAtOf" | "connectionStatuses" | "withSealedCredential"
> {
  const record = input?.record === null ? null : input?.record ?? connectionRecordOf({ connectionId: CONNECTION_ID });
  void input?.evidence;
  return {
    async connectionRecordOf() {
      return record;
    },
    async credentialSealedAtOf() {
      return "2026-11-01T10:00:00Z";
    },
    async connectionStatuses() {
      return record === null
        ? []
        : [
            {
              connectionId: record.connectionId,
              providerId: record.providerId,
              useCaseRef: record.useCaseRef,
              form: { kind: "API_KEY" } as never,
              credentialKind: "STRIPE_RESTRICTED_KEY" as never,
              executionMode: record.executionMode,
              state: record.state,
              credentialHandleRef: record.credentialHandleRef ?? "handle:1",
              createdAt: record.createdAt,
              lastTransitionAt: record.lastTransitionAt,
              transitionHistory: [],
            },
          ];
    },
    async withSealedCredential<T>(
      _connectionId: string,
      consumer: (material: unknown) => T,
      _context: string,
    ): Promise<Awaited<T>> {
      return consumer({ apiKey: FAKE_RAK_TEST_KEY }) as Awaited<T>;
    },
  };
}

function fakeEvidenceStore(evidence: ProbeEvidenceRecord | null): Pick<ProbeEvidenceStore, "latestProbeEvidence"> {
  return {
    async latestProbeEvidence() {
      return evidence === null ? [] : [evidence];
    },
  };
}

/** The scripted Stripe-shaped fetch: a REAL Response (the composition's fetch seam is typeof globalThis.fetch). */
function scriptedStripeFetch() {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const impl = (async (
    url: string,
    init: {
      readonly method: "GET" | "POST" | "DELETE";
      readonly headers: Readonly<Record<string, string>>;
      readonly body?: string;
      readonly signal?: AbortSignal;
    },
  ): Promise<Response> => {
    calls.push({ url, method: init.method, headers: { ...init.headers }, body: init.body });
    return new Response(
      JSON.stringify({ id: "cus_composition_1", object: "customer", email: "member@example.test" }),
      { status: 200, headers: { "request-id": "req_composition_1" } },
    );
  }) as typeof globalThis.fetch;
  return { calls, impl };
}

async function composedWorld(input?: {
  readonly record?: PersistedConnectionRecord | null;
  readonly evidence?: ProbeEvidenceRecord | null;
}): Promise<{
  readonly plane: StripeActionPlane;
  readonly calls: ReturnType<typeof scriptedStripeFetch>["calls"];
}> {
  const fs = fakeFs();
  const directory = await mkdtemp(join(tmpdir(), "p24d-composition-"));
  const { calls, impl } = scriptedStripeFetch();
  const evidence =
    input?.evidence === null
      ? null
      : input?.evidence ?? probeEvidenceOf({ connectionId: CONNECTION_ID, observedAt: "2026-11-01T10:05:00Z" });
  const plane = await composeStripeActionPlane({
    authority: fakeAuthority({ ...input, evidence }) as ConnectionSessionAuthority,
    evidenceStore: fakeEvidenceStore(evidence) as ProbeEvidenceStore,
    fetchImpl: impl,
    storeDirectory: directory,
    fileSystem: fs,
    nowIso: () => "2026-11-01T12:00:00Z",
    createId: (() => {
      let seq = 0;
      return () => `composition-${(seq += 1)}`;
    })(),
  });
  return { plane, calls };
}

/* ------------------------------ the battery ------------------------------ */

describe("the P24-D stripe plane composition (the real adapters, production form)", () => {
  it("carries the pinned catalogue release and the full census (644 operations, v1 612 + v2 32)", async () => {
    const { plane } = await composedWorld();
    expect(plane.census.catalogueRelease).toBe("v2596@2026-09-30.endive");
    const views = plane.census.enumerate();
    expect(views.length).toBe(644);
    expect(views.filter((view) => view.apiNamespace === "v1").length).toBe(612);
    expect(views.filter((view) => view.apiNamespace === "v2").length).toBe(32);
    // The P24-D view extension: the facts carry the family/pack/pagination.
    const createCustomer = plane.census.resolve("PostCustomers");
    expect(createCustomer).toBeDefined();
    expect(createCustomer?.resourceFamily).toBe("customers");
    expect(createCustomer?.packId).toBe("B_CUSTOMERS_PAYMENT_INSTRUMENTS");
    expect(typeof createCustomer?.listPaginated).toBe("boolean");
  });

  it("runs the two-phase action flow over the REAL transport behind the scripted fetch (prepare → authorize → execute → CONFIRMED)", async () => {
    const { plane, calls } = await composedWorld();
    // The RAK scope declaration (the production flow declares the
    // connection's key scopes; the composition starts empty).
    const declared = await plane.permissions.declareScopes({
      connectionId: CONNECTION_ID,
      permissions: ["customers: Write", "customers: Read"],
      principalId: "principal:test",
    });
    expect(declared.ok).toBe(true);
    const prepared = await plane.executor.prepare({
      operationId: "PostCustomers",
      parameters: [{ name: "email", value: "member@example.test", location: "body" }],
      connectionId: CONNECTION_ID,
      taskId: "task:composition-1",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.reason);
    expect(prepared.action.digest.length).toBeGreaterThan(0);
    expect(prepared.action.effectClass).toBe("STRIPE_CONFIGURATION_WRITE");
    const authorized = await plane.executor.authorize({
      preparedActionId: prepared.action.preparedActionId,
      principalId: "principal:test",
      confirmedDigest: prepared.action.digest,
    });
    expect(authorized.ok).toBe(true);
    const outcome = await plane.executor.execute(authorized.ok ? authorized.authorization.authorizationId : "");
    expect(outcome.kind).toBe("CONFIRMED");
    // The REAL transport fired exactly once with the sealed bearer key.
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toContain("https://api.stripe.com/v1/customers");
    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${FAKE_RAK_TEST_KEY}`);
    expect(calls[0]?.headers["Idempotency-Key"]).toBeDefined();
  });
});

describe("the P24-D model-conversation member (the substrate edge)", () => {
  const workspace = { workspacePath: "/tmp/p24d-workspace" };

  it("forwards the persisted selection VERBATIM and recovers the tool message's toolName", async () => {
    const turns: unknown[] = [];
    const members = createModelConversationChannelMembers({
      agentService: {
        async generateWorkspaceText(params: unknown) {
          turns.push(params);
          return {
            text: "The customer was created.",
            selection: (params as { selection: unknown }).selection,
            toolCalls: [],
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          };
        },
      } as never,
      workspace,
      log: () => {},
    });
    const result = await members.agentModelTurn({
      turnId: "turn-1",
      selection: { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "high" },
      messages: [
        { role: "user", content: "create a customer" },
        {
          role: "assistant",
          content: "Creating the customer.",
          toolCalls: [{ id: "call_1", name: "stripe_prepare_action", input: { operationId: "PostCustomers" } }],
        },
        { role: "tool", content: "{\"ok\":true}", toolCallId: "call_1" },
      ],
      tools: [{ name: "stripe_prepare_action", description: "prepare", inputSchema: { type: "object" } }],
      toolChoice: "auto",
    });
    expect(result.ok).toBe(true);
    expect(result.finish).toBe("STOP");
    expect(result.usage?.totalTokens).toBe(15);
    const sent = turns[0] as {
      selection: { providerId: string; modelId: string; options: { reasoningLevel: string } };
      messages: { role: string; toolName?: string }[];
      tools: { name: string }[] | undefined;
    };
    expect(sent.selection).toEqual({
      providerId: "zai",
      modelId: "glm-5.2",
      options: { reasoningLevel: "high" },
    });
    expect(sent.messages[2]?.toolName).toBe("stripe_prepare_action");
    expect(sent.tools?.[0]?.name).toBe("stripe_prepare_action");
  });

  it("refuses a required tool choice honestly (the substrate has no force-tool parameter) and maps runtime-unavailable", async () => {
    const members = createModelConversationChannelMembers({
      agentService: {
        async generateWorkspaceText() {
          const error = new Error("runtime unavailable");
          (error as { code?: string }).code = "ZCODE_AGENT_RUNTIME_UNAVAILABLE";
          throw error;
        },
      } as never,
      workspace,
      log: () => {},
    });
    const refused = await members.agentModelTurn({
      turnId: "turn-2",
      selection: { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "high" },
      messages: [{ role: "user", content: "go" }],
      tools: [],
      toolChoice: "required",
    });
    expect(refused.ok).toBe(false);
    expect(refused.error?.code).toBe("INVALID_REQUEST");
    const unavailable = await members.agentModelTurn({
      turnId: "turn-3",
      selection: { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "high" },
      messages: [{ role: "user", content: "go" }],
      tools: [],
      toolChoice: "auto",
    });
    expect(unavailable.ok).toBe(false);
    expect(unavailable.error?.code).toBe("MODEL_UNAVAILABLE");
    expect(unavailable.error?.retryable).toBe(true);
  });

  it("fails closed typed when the seam is absent (never a simulated turn)", async () => {
    const members = createAbsentModelConversationChannelMembers();
    await expect(
      members.agentModelTurn({
        turnId: "t",
        selection: { providerId: "z", modelId: "m", reasoningLevel: "l" },
        messages: [{ role: "user", content: "x" }],
        tools: [],
        toolChoice: "auto",
      }),
    ).rejects.toBeInstanceOf(ModelConversationNotConfiguredError);
  });
});

describe("the P24-D stripe plane members (the channel surface)", () => {
  it("fail closed typed when the plane is absent", async () => {
    const members = createAbsentStripePlaneChannelMembers();
    await expect(members.stripeListAccountFacts()).rejects.toBeInstanceOf(StripePlaneNotConfiguredError);
    expect(members.stripePlanePrincipalId()).toBe("principal:local-desktop-operator");
  });

  it("list the verified account facts and refuse an unknown connection honestly", async () => {
    const { plane } = await composedWorld();
    const members = createStripePlaneChannelMembers({
      plane,
      authority: fakeAuthority() as ConnectionSessionAuthority,
      log: () => {},
    });
    const facts = await members.stripeListAccountFacts();
    expect(facts.length).toBe(1);
    expect(facts[0]?.connectionId).toBe(CONNECTION_ID);
    expect(facts[0]?.environment).toBe("SANDBOX");
    const unknown = await members.stripeAccountFacts("conn:unknown");
    expect(unknown).toBeNull();
    const release = await members.stripeCatalogueRelease();
    expect(release).toBe("v2596@2026-09-30.endive");
  });
});

describe("the P24-D renderer composition (the channel → the pinned plane)", () => {
  it("binds all five ports HOST_BRIDGED with the fetched release and streams the turn's chunks", async () => {
    resetSharedConversationPlane();
    const { compose } = channelConversationPlaneForTest();
    const handle = await compose();
    expect(handle.plane.model.tier).toBe("HOST_BRIDGED");
    expect(handle.plane.catalogue.tier).toBe("HOST_BRIDGED");
    expect(handle.plane.catalogue.catalogueRelease).toBe("v2596@2026-09-30.endive");
    expect(handle.plane.accounts.tier).toBe("HOST_BRIDGED");
    expect(handle.plane.reads.tier).toBe("HOST_BRIDGED");
    expect(handle.plane.preparedActions.tier).toBe("HOST_BRIDGED");
    expect(handle.plane.principalId()).toBe("principal:local-desktop-operator");
    // The shared seam carries the SAME plane (the controller captures it).
    expect(sharedConversationPlane()).toBe(handle.plane);
    // The model turn's chunk sequence: text delta, completion.
    const chunks: string[] = [];
    for await (const chunk of handle.plane.model.startTurn({
      turnId: "turn-r1",
      selection: { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "high" },
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      toolChoice: "auto",
    })) {
      chunks.push(chunk.kind);
    }
    expect(chunks).toEqual(["TEXT_DELTA", "TURN_COMPLETED"]);
    const support = await handle.plane.model.describeModelSupport({
      providerId: "zai",
      modelId: "glm-5.2",
      reasoningLevel: "high",
    });
    expect(support.supportsToolCalling).toBe(true);
    expect(support.supportsStreaming).toBe(false);
    handle.reset();
    expect(sharedConversationPlane()).toBeUndefined();
  });

  it("rejects honestly when the host's stripe plane is not configured (the seam stays unbound)", async () => {
    resetSharedConversationPlane();
    const { composeRefusing } = channelConversationPlaneForTest();
    await expect(composeRefusing()).rejects.toThrow();
    expect(sharedConversationPlane()).toBeUndefined();
  });

  it("maps the read member's typed failure onto the port's typed error one-to-one", async () => {
    resetSharedConversationPlane();
    const plane = await composeOverFakeChannel({
      reads: [
        {
          ok: false,
          error: { code: "PERMISSION_MISSING", message: "the RAK lacks the rule", retryable: false },
        },
      ],
    });
    const read = await plane.reads.executeRead({
      operationId: "GetCustomers",
      arguments: {},
      connectionId: CONNECTION_ID,
      taskId: "task-1",
      callId: "call-1",
    });
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error.code).toBe("PERMISSION_MISSING");
      expect(read.error.retryable).toBe(false);
    }
  });
});
