/**
 * @payswap/app — the STRIPE TOOL RUNTIME battery (P24-3, ADR-0017
 * D9/D10 — the loop's ONE execution seam).
 *
 * The registry-mediated runtime, machine-checked against the REAL
 * runtime over deterministic registry/port fakes:
 *
 * - FAIL-CLOSED VALIDATION: unknown fields rejected, missing required
 *   fields named, non-object arguments refused — every violation is a
 *   TYPED ERROR RESULT returned to the model (bounded by the loop's
 *   failed-call budget), never an exception that breaks the loop;
 * - UNKNOWN TOOL: a name outside the registry is DENIED with guidance;
 * - THE READ PATH: the registered operationId + the task's bound
 *   connection cross the host port; a TIMEOUT_UNKNOWN read stays
 *   UNKNOWN; a refused read surfaces its typed code;
 * - THE PREPARE PATH: a validated proposal crosses the host port and
 *   returns the EXACT preview — with NO authorization (the host mints
 *   that only after the human confirms); a host refusal is honest;
 * - THE DISCOVERY PATH: bounded, data-minimized answers;
 * - SECRET-SHAPED OUTPUT never enters model context (fail-closed).
 */
import { describe, expect, it } from "vitest";

import { createStripeToolRuntime } from "../../src/agent/stripeToolRuntime.js";
import { createStripeToolRegistry } from "../../src/agent/stripeToolRegistry.js";
import type {
  StripePreparedActionPort,
  StripeResourceReadPort,
} from "../../src/agent/stripeToolExecutionPort.js";
import type { StripeActionExecutionOutcomePin, StripePreparedActionPin } from "../../src/agent/stripePreparedActionPins.js";
import type {
  StripeAccountFactsPin,
  StripeOperationFactPin,
  StripeToolCataloguePort,
} from "../../src/agent/stripeToolCataloguePort.js";
import { STRIPE_TOOL_OUTPUT_UNTRUSTED_OPEN } from "../../src/agent/stripeToolOutput.js";

/* ------------------------------ the fakes ----------------------------- */

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
  fact({ operationId: "ListProducts" }),
  fact({ operationId: "GetProducts", pathParams: ["id"], path: "/v1/products/{id}", listPaginated: false }),
  fact({ operationId: "PostProducts", method: "POST", effectClass: "STRIPE_CONFIGURATION_WRITE", approvalTier: "CONFIRM" }),
];

const ACCOUNT: StripeAccountFactsPin = {
  connectionId: "conn-1",
  stripeAccountId: "acct_test_1",
  accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
  environment: "SANDBOX",
  grantedPermissionRules: ["Products: Read"],
};

const catalogue: StripeToolCataloguePort = {
  tier: "HOST_BRIDGED",
  catalogueRelease: "v2596",
  async listOperationFacts() {
    return [...FACTS];
  },
  async operationFact(operationId) {
    return FACTS.find((entry) => entry.operationId === operationId);
  },
};

const CONTEXT = { taskId: "task-1", connectionId: "conn-1" } as const;

function makeReads(
  handler: (operationId: string, args: Readonly<Record<string, unknown>>) =>
    | { ok: true; output: unknown }
    | { ok: false; error: { code: string; message: string; retryable: boolean } },
): StripeResourceReadPort & { readonly calls: { operationId: string; args: Readonly<Record<string, unknown>>; connectionId: string; taskId: string }[] } {
  const calls: { operationId: string; args: Readonly<Record<string, unknown>>; connectionId: string; taskId: string }[] = [];
  return {
    tier: "HOST_BRIDGED",
    calls,
    async executeRead(request) {
      calls.push({ operationId: request.operationId, args: request.arguments, connectionId: request.connectionId, taskId: request.taskId });
      return handler(request.operationId, request.arguments);
    },
  };
}

const PREPARED: StripePreparedActionPin = {
  preparedActionId: "pa-1",
  operationId: "PostProducts",
  catalogueRelease: "v2596",
  accountContext: {
    connectionId: "conn-1",
    stripeAccountId: "acct_test_1",
    accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
    environment: "SANDBOX",
  },
  parameters: [
    { name: "name", value: "Annual Membership", location: "body" },
    { name: "id", value: "prod_new", location: "path" },
  ],
  digest: "sha256:abc",
  effectClass: "STRIPE_CONFIGURATION_WRITE",
  approvalTier: "CONFIRM",
  confirmationInputs: ["Confirm creating product 'Annual Membership' on acct_test_1 (SANDBOX)"],
  idempotencyKeyRef: "idem-1",
  readBackOperationId: "GetProducts",
  expiresAt: "2026-10-31T13:00:00Z",
  createdBy: "model_proposal",
};

function makePrepared(
  prepareResult: { ok: true; action: StripePreparedActionPin } | { ok: false; reason: string } = { ok: true, action: PREPARED },
): StripePreparedActionPort & { readonly proposals: unknown[] } {
  const proposals: unknown[] = [];
  return {
    tier: "HOST_BRIDGED",
    proposals,
    async prepare(proposal) {
      proposals.push(proposal);
      return prepareResult;
    },
    async authorize() {
      throw new Error("the runtime never authorizes — only the user-gesture confirm path does");
    },
    async execute(): Promise<StripeActionExecutionOutcomePin> {
      throw new Error("the runtime never executes — only the user-gesture confirm path does");
    },
    async inspect() {
      return PREPARED;
    },
  };
}

async function makeRuntime(options?: { readonly reads?: StripeResourceReadPort; readonly preparedActions?: StripePreparedActionPort }) {
  const registry = createStripeToolRegistry({ facts: catalogue });
  await registry.load(ACCOUNT, "products");
  const runtime = createStripeToolRuntime({
    registry,
    reads: options?.reads ?? makeReads(() => ({ ok: true, output: { data: [{ id: "prod_1" }] } })),
    preparedActions: options?.preparedActions ?? makePrepared(),
  });
  return { registry, runtime };
}

const call = (id: string, name: string, input: unknown) => ({ call: { id, name, input }, context: CONTEXT });

/* --------------------------- the validation --------------------------- */

describe("fail-closed argument validation (malformed args never execute)", () => {
  it("a non-object argument is a typed validation error", async () => {
    const { runtime } = await makeRuntime();
    const result = await runtime.executeCall(call("c1", "stripe.search_operations", "just a string"));
    expect(result.status).toBe("ERROR");
    expect(result.error).toMatchObject({ code: "VALIDATION", retryable: true });
    expect(result.error!.message).toContain("must be a JSON object");
  });

  it("an UNKNOWN FIELD is rejected (never coerced)", async () => {
    const { runtime } = await makeRuntime();
    const result = await runtime.executeCall(call("c1", "stripe.describe_operation", { operationId: "ListProducts", extra: true }));
    expect(result.error).toMatchObject({ code: "VALIDATION" });
    expect(result.error!.message).toContain("unknown argument field 'extra'");
  });

  it("a MISSING REQUIRED field is named", async () => {
    const { runtime } = await makeRuntime();
    const result = await runtime.executeCall(call("c1", "stripe.describe_operation", {}));
    expect(result.error).toMatchObject({ code: "VALIDATION" });
    expect(result.error!.message).toContain("required argument 'operationId' is missing");
  });

  it("an INVALID VALUE is typed (empty strings refuse)", async () => {
    const { runtime } = await makeRuntime();
    const result = await runtime.executeCall(call("c1", "stripe.describe_operation", { operationId: "" }));
    expect(result.error).toMatchObject({ code: "VALIDATION" });
    expect(result.error!.message).toContain("non-empty string");
  });

  it("a read tool's path parameter is required and limit-bounded", async () => {
    const reads = makeReads(() => ({ ok: true, output: {} }));
    const { runtime } = await makeRuntime({ reads });
    const missing = await runtime.executeCall(call("c1", "stripe.resources.products.get", {}));
    expect(missing.error).toMatchObject({ code: "VALIDATION" });
    expect(missing.error!.message).toContain("required argument 'id' is missing");
    const badLimit = await runtime.executeCall(call("c2", "stripe.resources.products.list", { limit: 500 }));
    expect(badLimit.error).toMatchObject({ code: "VALIDATION" });
    expect(badLimit.error!.message).toContain("between 1 and 100");
    expect(reads.calls).toHaveLength(0);
  });

  it("prepare_action parameters must be exactly { name, value, location }", async () => {
    const prepared = makePrepared();
    const { runtime } = await makeRuntime({ preparedActions: prepared });
    const badLocation = await runtime.executeCall(call("c1", "stripe.prepare_action", {
      operationId: "PostProducts",
      parameters: [{ name: "name", value: "X", location: "header" }],
    }));
    expect(badLocation.error).toMatchObject({ code: "VALIDATION" });
    expect(badLocation.error!.message).toContain("location must be path, query or body");
    const extraField = await runtime.executeCall(call("c2", "stripe.prepare_action", {
      operationId: "PostProducts",
      parameters: [{ name: "name", value: "X", location: "body", evil: true }],
    }));
    expect(extraField.error).toMatchObject({ code: "VALIDATION" });
    expect(prepared.proposals).toHaveLength(0);
  });
});

describe("unknown tools and names (DENY)", () => {
  it("a tool outside the registry is refused with guidance, never executed", async () => {
    const reads = makeReads(() => ({ ok: true, output: {} }));
    const { runtime } = await makeRuntime({ reads });
    const result = await runtime.executeCall(call("c1", "stripe.request", { url: "https://attack" }));
    expect(result.status).toBe("ERROR");
    expect(result.error).toMatchObject({ code: "UNKNOWN_TOOL" });
    expect(result.error!.message).toContain("not in this task's registry");
    expect(reads.calls).toHaveLength(0);
  });
});

describe("the read path (informational tools)", () => {
  it("crosses the host port with the REGISTERED operationId and the task's bound connection", async () => {
    const reads = makeReads(() => ({ ok: true, output: { data: [{ id: "prod_1", name: "Test" }] } }));
    const { runtime } = await makeRuntime({ reads });
    const result = await runtime.executeCall(call("c1", "stripe.resources.products.list", { limit: 10 }));
    expect(result.status).toBe("OK");
    expect(reads.calls).toEqual([{ operationId: "ListProducts", args: { limit: 10 }, connectionId: "conn-1", taskId: "task-1" }]);
    // The payload is framed as UNTRUSTED DATA for the model.
    expect(result.output).toContain(STRIPE_TOOL_OUTPUT_UNTRUSTED_OPEN);
    expect(String(result.output)).toContain("prod_1");
  });

  it("a TIMEOUT_UNKNOWN read stays UNKNOWN (INV-04 — never failed, never succeeded)", async () => {
    const reads = makeReads(() => ({ ok: false, error: { code: "TIMEOUT_UNKNOWN", message: "timeout after possible dispatch", retryable: false } }));
    const { runtime } = await makeRuntime({ reads });
    const result = await runtime.executeCall(call("c1", "stripe.resources.products.list", {}));
    expect(result.status).toBe("UNKNOWN");
    expect(result.error).toMatchObject({ code: "TIMEOUT_UNKNOWN" });
  });

  it("a refused read surfaces its typed code and retry classification", async () => {
    const reads = makeReads(() => ({ ok: false, error: { code: "PERMISSION_MISSING", message: "the key lacks Products: Read", retryable: false } }));
    const { runtime } = await makeRuntime({ reads });
    const result = await runtime.executeCall(call("c1", "stripe.resources.products.list", {}));
    expect(result.status).toBe("ERROR");
    expect(result.error).toMatchObject({ code: "PERMISSION_MISSING", retryable: false });
  });

  it("SECRET-SHAPED read output is refused fail-closed (never enters model context)", async () => {
    const reads = makeReads(() => ({ ok: true, output: { note: `leaked ${["rk", "test", "51H7XeQ" + "SECRETSECRETSECRET"].join("_")}` } }));
    const { runtime } = await makeRuntime({ reads });
    const result = await runtime.executeCall(call("c1", "stripe.resources.products.list", {}));
    expect(result.status).toBe("ERROR");
    expect(result.error).toMatchObject({ code: "SECRET_SHAPED_OUTPUT" });
    expect(JSON.stringify(result)).not.toContain("rk_test_");
  });
});

describe("the prepare path (the two-phase law)", () => {
  it("crosses the host port with the validated proposal and returns the EXACT preview — NO authorization", async () => {
    const prepared = makePrepared();
    const { runtime } = await makeRuntime({ preparedActions: prepared });
    const result = await runtime.executeCall(call("c9", "stripe.prepare_action", {
      operationId: "PostProducts",
      parameters: [{ name: "name", value: "Annual Membership", location: "body" }],
    }));
    expect(result.status).toBe("OK");
    expect(result.pendingPreparedAction).toEqual(PREPARED);
    expect(prepared.proposals).toEqual([{
      operationId: "PostProducts",
      parameters: [{ name: "name", value: "Annual Membership", location: "body" }],
      connectionId: "conn-1",
      taskId: "task-1",
    }]);
    const payload = String(result.output);
    // The preview facts the model may see…
    expect(payload).toContain("pa-1");
    expect(payload).toContain("PostProducts");
    expect(payload).toContain("sha256:abc");
    expect(payload).toContain("CONFIRM");
    // …and NEVER an authorization (the host mints that after the human).
    expect(payload).not.toContain("authorizationId");
    expect(payload).not.toContain("approvedDigest");
  });

  it("a host refusal is honest (the reason reaches the model)", async () => {
    const prepared = makePrepared({ ok: false, reason: "operation PostProducts requires a permission this connection does not hold" });
    const { runtime } = await makeRuntime({ preparedActions: prepared });
    const result = await runtime.executeCall(call("c9", "stripe.prepare_action", {
      operationId: "PostProducts",
      parameters: [{ name: "name", value: "X", location: "body" }],
    }));
    expect(result.status).toBe("ERROR");
    expect(result.error).toMatchObject({ code: "PREPARE_REFUSED" });
    expect(result.error!.message).toContain("does not hold");
    expect(result.pendingPreparedAction).toBeUndefined();
  });
});

describe("the discovery path (bounded, data-minimized)", () => {
  it("discover_capabilities reports the account context, honest state counts and registered tools", async () => {
    const { runtime } = await makeRuntime();
    const result = await runtime.executeCall(call("c1", "stripe.discover_capabilities", {}));
    expect(result.status).toBe("OK");
    const payload = String(result.output);
    expect(payload).toContain("acct_test_1");
    expect(payload).toContain("OWN_ACCOUNT_RESTRICTED_KEY");
    expect(payload).toContain("IMPLEMENTED");
    expect(payload).toContain("stripe.resources.products.list");
    expect(payload).toContain("only IMPLEMENTED operations are dispatchable");
  });

  it("discover_capabilities with an unknown pack filter yields empty counts (never invented)", async () => {
    const { runtime } = await makeRuntime();
    const result = await runtime.executeCall(call("c1", "stripe.discover_capabilities", { packId: "NO_SUCH_PACK" }));
    expect(result.status).toBe("OK");
    const payload = String(result.output);
    expect(payload).toContain('"packCounts":{}');
    expect(payload).toContain('"supportStateCounts":{}');
  });

  it("search_operations matches and truncates honestly beyond the cap", async () => {
    const many = Array.from({ length: 30 }, (_, index) => fact({ operationId: `ListProducts${index}`, summary: `variant ${index}` }));
    const registry = createStripeToolRegistry({
      facts: {
        tier: "HOST_BRIDGED",
        catalogueRelease: "x",
        async listOperationFacts() {
          return [...many];
        },
        async operationFact(operationId) {
          return many.find((entry) => entry.operationId === operationId);
        },
      },
    });
    await registry.load(ACCOUNT, "products");
    const runtime = createStripeToolRuntime({ registry, reads: makeReads(() => ({ ok: true, output: {} })), preparedActions: makePrepared() });
    const result = await runtime.executeCall(call("c1", "stripe.search_operations", { query: "variant" }));
    expect(result.status).toBe("OK");
    const payload = String(result.output);
    expect(payload).toContain("truncated");
    expect(payload).toContain("total");
  });

  it("describe_operation returns the minimized fact; unknown ids are honestly not-found", async () => {
    const { runtime } = await makeRuntime();
    const found = await runtime.executeCall(call("c1", "stripe.describe_operation", { operationId: "PostProducts" }));
    expect(found.status).toBe("OK");
    const payload = String(found.output);
    expect(payload).toContain("STRIPE_CONFIGURATION_WRITE");
    expect(payload).toContain("Products: Read");
    expect(payload).not.toContain("specDigest");
    const unknown = await runtime.executeCall(call("c2", "stripe.describe_operation", { operationId: "Nope" }));
    expect(unknown.status).toBe("OK");
    expect(String(unknown.output)).toContain("DENIED");
  });

  it("request_tools grants and refuses through the registry (never elevating)", async () => {
    const { runtime } = await makeRuntime();
    const result = await runtime.executeCall(call("c1", "stripe.request_tools", { operationIds: ["GetProducts"] }));
    expect(result.status).toBe("OK");
    expect(String(result.output)).toContain("granted");
    const refused = await runtime.executeCall(call("c2", "stripe.request_tools", { operationIds: ["PostProducts"] }));
    expect(String(refused.output)).toContain("two-phase prepare/confirm contract");
  });
});
