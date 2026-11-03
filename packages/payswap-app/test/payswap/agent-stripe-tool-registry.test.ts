/**
 * @payswap/app — the STRIPE TOOL REGISTRY + progressive discovery
 * battery (P24-3, ADR-0017 D9 — handoff §4.4).
 *
 * The task-scoped registry laws, machine-checked against the REAL
 * registry over a deterministic census-facts fake:
 *
 * - THE ALWAYS-AVAILABLE SET is small and pinned (discovery, search,
 *   describe, prepare, request-tools) — nothing else is unconditional;
 * - DOMAIN TOOLS register per task from the census facts filtered by
 *   intent + the connection's VERIFIED permissions + dispatchable
 *   support states, READ operations only, capped (no flooding);
 * - THE MID-TASK REQUEST never elevates permission: an operation whose
 *   permission rule is not granted is refused with the exact reason;
 *   non-read effect classes and undispatchable states are refused;
 *   unknown operation ids are DENIED;
 * - NO universal `stripe.request(url, …)` tool exists anywhere in the
 *   registry, and every schema rejects unknown fields;
 * - tool names DERIVE deterministically from the catalogue facts.
 */
import { describe, expect, it } from "vitest";

import {
  createStripeToolRegistry,
  isRegistrableReadFact,
  stripeReadToolName,
  STRIPE_TOOL_DISPATCHABLE_STATES,
  type StripeRegisteredTool,
} from "../../src/agent/stripeToolRegistry.js";
import { STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES } from "../../src/agent/stripeToolSchemas.js";
import type {
  StripeAccountFactsPin,
  StripeOperationFactPin,
  StripeToolCataloguePort,
} from "../../src/agent/stripeToolCataloguePort.js";

/* ------------------------------ the facts ----------------------------- */

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
  fact({ operationId: "GetProducts", resourceFamily: "products", pathParams: ["id"], path: "/v1/products/{id}", listPaginated: false, method: "GET", summary: "Retrieve a product." }),
  fact({ operationId: "ListPrices", resourceFamily: "prices", requiredPermissionRule: "Prices: Read" }),
  fact({ operationId: "SearchCustomers", resourceFamily: "customers", requiredPermissionRule: "Customers: Read" }),
  // Not registrable as a DIRECT tool (state-changing): the two-phase law.
  fact({ operationId: "PostProducts", method: "POST", effectClass: "STRIPE_CONFIGURATION_WRITE", approvalTier: "CONFIRM", supportState: "IMPLEMENTED", resourceFamily: "products" }),
  // Not dispatchable (the overlay's DENY law).
  fact({ operationId: "ListDisputes", resourceFamily: "disputes", supportState: "PLANNED_P24_INITIAL_RELEASE", requiredPermissionRule: "Disputes: Read" }),
  // Dispatchable but NOT granted to the test account (the elevation test).
  fact({ operationId: "ListCheckoutSessions", resourceFamily: "checkout/sessions", requiredPermissionRule: "Checkout Session: Read" }),
  // v2 namespace fact.
  fact({ operationId: "ListRefundsV2", apiNamespace: "v2", method: "GET", path: "/v2/refunds", resourceFamily: "refunds", requiredPermissionRule: "Refunds: Read" }),
];

function cataloguePort(facts: readonly StripeOperationFactPin[] = FACTS): StripeToolCataloguePort {
  return {
    tier: "HOST_BRIDGED",
    catalogueRelease: "v2596 / 2026-09-30.endive",
    async listOperationFacts() {
      return [...facts];
    },
    async operationFact(operationId) {
      return facts.find((entry) => entry.operationId === operationId);
    },
  };
}

const ACCOUNT: StripeAccountFactsPin = {
  connectionId: "conn-1",
  stripeAccountId: "acct_test_1",
  accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
  environment: "SANDBOX",
  displayName: "Main test account",
  grantedPermissionRules: ["Products: Read", "Prices: Read", "Customers: Read"],
};

async function loadedRegistry(options?: { readonly facts?: readonly StripeOperationFactPin[]; readonly account?: StripeAccountFactsPin; readonly intentText?: string; readonly maxDomainTools?: number }) {
  const registry = createStripeToolRegistry({
    facts: cataloguePort(options?.facts),
    ...(options?.maxDomainTools !== undefined ? { maxDomainTools: options.maxDomainTools } : {}),
  });
  const report = await registry.load(options?.account ?? ACCOUNT, options?.intentText);
  return { registry, report };
}

/* ----------------------------- the laws ------------------------------- */

describe("the always-available set (D9's small core)", () => {
  it("is EXACTLY the pinned five names when no family matches the intent", async () => {
    const { registry, report } = await loadedRegistry({ intentText: "hello there friend" });
    expect(report.registeredTools).toEqual([...STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES]);
    expect(report.domainTools).toEqual([]);
    expect(registry.list().map((tool) => tool.name)).toEqual([...STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES]);
  });

  it("projects to model contracts with descriptions, schemas and approval flags", async () => {
    const { registry } = await loadedRegistry({ intentText: "hello there friend" });
    const contracts = registry.toModelContracts();
    expect(contracts).toHaveLength(5);
    for (const contract of contracts) {
      expect(contract.description.length).toBeGreaterThan(20);
      expect(contract.inputSchema).toBeDefined();
    }
    const prepare = contracts.find((contract) => contract.name === "stripe.prepare_action")!;
    expect(prepare.readOnly).toBe(false);
    expect(prepare.needsApproval).toBe(true);
    for (const contract of contracts.filter((entry) => entry.name !== "stripe.prepare_action")) {
      expect(contract.readOnly).toBe(true);
    }
  });

  it("resolves each always-available name; an unknown name resolves to nothing (DENY)", async () => {
    const { registry } = await loadedRegistry({ intentText: "hello there friend" });
    expect(registry.resolve("stripe.discover_capabilities")?.kind).toBe("DISCOVERY");
    expect(registry.resolve("stripe.search_operations")?.kind).toBe("DISCOVERY");
    expect(registry.resolve("stripe.describe_operation")?.kind).toBe("DISCOVERY");
    expect(registry.resolve("stripe.prepare_action")?.kind).toBe("ACTION_PREPARE");
    expect(registry.resolve("stripe.request_tools")?.kind).toBe("REQUEST_TOOLS");
    expect(registry.resolve("stripe.request")).toBeUndefined();
    expect(registry.resolve("stripe.resources.products.list")).toBeUndefined();
  });
});

describe("the per-task domain tools (intent + permission filtered, capped)", () => {
  it("registers ONLY read-only, dispatchable, permission-granted facts the intent names", async () => {
    const { report } = await loadedRegistry({ intentText: "show me my products and prices" });
    expect(report.domainTools).toEqual([
      "stripe.resources.products.get",
      "stripe.resources.prices.list",
      "stripe.resources.products.list",
    ]);
    // No state-changing tool, no undispatchable tool, no unpermitted tool.
    for (const name of report.domainTools) {
      expect(name.startsWith("stripe.resources.")).toBe(true);
    }
  });

  it("without intent text, registers the capped registrable set (the defaults)", async () => {
    const { report } = await loadedRegistry({ intentText: undefined });
    // products (get+list) + prices + customers — the permitted,
    // dispatchable, read-only facts; PostProducts (state-changing),
    // ListDisputes (PLANNED) and ListCheckoutSessions (ungranted) are out.
    expect(report.domainTools).toEqual([
      "stripe.resources.products.get",
      "stripe.resources.prices.list",
      "stripe.resources.products.list",
      "stripe.resources.customers.search",
    ]);
  });

  it("an empty intent string behaves like no intent (all registrable)", async () => {
    const { report } = await loadedRegistry({ intentText: "" });
    expect(report.domainTools.length).toBe(4);
  });

  it("a permission the connection does NOT hold excludes the tool (discovery never elevates)", async () => {
    const account: StripeAccountFactsPin = { ...ACCOUNT, grantedPermissionRules: ["Products: Read"] };
    const { report } = await loadedRegistry({ account, intentText: "customers and products" });
    expect(report.domainTools).toEqual(["stripe.resources.products.get", "stripe.resources.products.list"]);
  });
  it("the domain cap bounds the registered set (no flooding)", async () => {
    const { report } = await loadedRegistry({ intentText: undefined, maxDomainTools: 2 });
    expect(report.domainTools).toHaveLength(2);
  });
  it("read tools derive their schema from the fact (path params required, list options bounded)", async () => {
    const { registry } = await loadedRegistry({ intentText: "products" });
    const get = registry.resolve("stripe.resources.products.get") as StripeRegisteredTool;
    expect(get.operationId).toBe("GetProducts");
    expect(get.inputSchema).toMatchObject({
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: { id: { type: "string" } },
    });
    const list = registry.resolve("stripe.resources.products.list") as StripeRegisteredTool;
    expect(list.inputSchema).toMatchObject({
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100 },
        starting_after: { type: "string" },
      },
    });
  });

  it("the autoWalk opt-in is offered ONLY on paginated list reads (P26-C)", async () => {
    const { registry } = await loadedRegistry({ intentText: "products" });
    const list = registry.resolve("stripe.resources.products.list") as StripeRegisteredTool;
    const listSchema = list.inputSchema as { properties: Record<string, { type?: string }> };
    // The paginated list tool offers the bounded auto-walk opt-in.
    expect(listSchema.properties.autoWalk).toMatchObject({ type: "boolean" });
    expect(String(listSchema.properties.autoWalk?.description)).toContain("10 pages");
    // The non-paginated get tool does NOT offer it (the schema is closed).
    const get = registry.resolve("stripe.resources.products.get") as StripeRegisteredTool;
    const getSchema = get.inputSchema as { properties: Record<string, unknown> };
    expect("autoWalk" in getSchema.properties).toBe(false);
    expect(getSchema.additionalProperties).toBe(false);
  });

  it("isRegistrableReadFact: each filter is load-bearing", () => {
    const account = ACCOUNT;
    expect(isRegistrableReadFact(fact({}), account)).toBe(true);
    expect(isRegistrableReadFact(fact({ effectClass: "FINANCIAL_CREATE" }), account)).toBe(false);
    expect(isRegistrableReadFact(fact({ supportState: "PLANNED_P24_INITIAL_RELEASE" }), account)).toBe(false);
    expect(isRegistrableReadFact(fact({ supportState: "ACCOUNT_GATED" }), account)).toBe(false);
    expect(isRegistrableReadFact(fact({ requiredPermissionRule: "Terminal: Read" }), account)).toBe(false);
  });

  it("stripeReadToolName is deterministic (list/get/search verbs from the operation id)", () => {
    expect(stripeReadToolName(fact({ operationId: "ListProducts", resourceFamily: "products" }))).toBe("stripe.resources.products.list");
    expect(stripeReadToolName(fact({ operationId: "GetProducts", resourceFamily: "products" }))).toBe("stripe.resources.products.get");
    expect(stripeReadToolName(fact({ operationId: "SearchCustomers", resourceFamily: "customers" }))).toBe("stripe.resources.customers.search");
    expect(stripeReadToolName(fact({ operationId: "ListRefundsV2", resourceFamily: "connect/accounts" }))).toBe("stripe.resources.connect.accounts.list");
  });

  it("STRIPE_TOOL_DISPATCHABLE_STATES is exactly the two IMPLEMENTED states", () => {
    expect(STRIPE_TOOL_DISPATCHABLE_STATES).toEqual(["IMPLEMENTED", "IMPLEMENTED_WITH_LIMITS"]);
  });
});

describe("the mid-task tool request (verified, never elevating)", () => {
  it("grants a permitted, dispatchable, read-only operation and registers its tool", async () => {
    const { registry } = await loadedRegistry({ intentText: "products" });
    const outcome = await registry.requestAdditionalTools({ operationIds: ["ListPrices"] });
    expect(outcome.granted).toEqual(["stripe.resources.prices.list"]);
    expect(registry.resolve("stripe.resources.prices.list")?.operationId).toBe("ListPrices");
    expect(outcome.refused).toEqual([]);
  });

  it("refuses an operation whose permission is NOT granted — with the exact reason", async () => {
    const { registry } = await loadedRegistry({ intentText: "products" });
    const outcome = await registry.requestAdditionalTools({ operationIds: ["ListCheckoutSessions"] });
    expect(outcome.granted).toEqual([]);
    expect(outcome.refused).toHaveLength(1);
    expect(outcome.refused[0]!.name).toBe("ListCheckoutSessions");
    expect(outcome.refused[0]!.reason).toContain("'Checkout Session: Read' is not granted");
    expect(outcome.refused[0]!.reason).toContain("discovery never elevates permission");
    expect(registry.resolve("stripe.resources.checkout.sessions.list")).toBeUndefined();
  });

  it("refuses a state-changing operation — the two-phase law, never a direct tool", async () => {
    const { registry } = await loadedRegistry();
    const outcome = await registry.requestAdditionalTools({ operationIds: ["PostProducts"] });
    expect(outcome.granted).toEqual([]);
    expect(outcome.refused[0]!.reason).toContain("two-phase prepare/confirm contract");
  });

  it("refuses an undispatchable support state with the DENY law", async () => {
    const account: StripeAccountFactsPin = { ...ACCOUNT, grantedPermissionRules: [...ACCOUNT.grantedPermissionRules, "Disputes: Read"] };
    const { registry } = await loadedRegistry({ account, intentText: "hello there friend" });
    const outcome = await registry.requestAdditionalTools({ operationIds: ["ListDisputes"] });
    expect(outcome.granted).toEqual([]);
    expect(outcome.refused[0]!.reason).toContain("PLANNED_P24_INITIAL_RELEASE");
    expect(outcome.refused[0]!.reason).toContain("DENY");
  });

  it("DENIES unknown operation ids", async () => {
    const { registry } = await loadedRegistry();
    const outcome = await registry.requestAdditionalTools({ operationIds: ["TotallyMadeUp"] });
    expect(outcome.granted).toEqual([]);
    expect(outcome.refused[0]).toMatchObject({ name: "TotallyMadeUp" });
    expect(outcome.refused[0]!.reason).toContain("unknown operation id");
  });

  it("grants by pack id (permission + effect + state still verified)", async () => {
    const { registry } = await loadedRegistry({ intentText: "customers" });
    const outcome = await registry.requestAdditionalTools({ packIds: ["D_PRODUCTS_PRICING_CATALOG"] });
    expect(outcome.granted).toEqual([
      "stripe.resources.products.list",
      "stripe.resources.products.get",
      "stripe.resources.prices.list",
    ]);
    // PostProducts is in the pack but state-changing; the others fail
    // state/permission checks — every refusal carries its exact reason.
    expect(outcome.refused.map((entry) => entry.name)).toEqual([
      "PostProducts",
      "ListDisputes",
      "ListCheckoutSessions",
      "ListRefundsV2",
    ]);
    expect(outcome.refused[0]!.reason).toContain("two-phase prepare/confirm contract");
  });

  it("an already-registered operation is an idempotent no-op", async () => {
    const { registry } = await loadedRegistry({ intentText: "products" });
    const outcome = await registry.requestAdditionalTools({ operationIds: ["ListProducts"] });
    expect(outcome.granted).toEqual([]);
    expect(outcome.refused).toEqual([]);
  });

  it("the hard registry cap refuses further grants with the no-flooding reason", async () => {
    const registry = createStripeToolRegistry({ facts: cataloguePort(), maxRegisteredTools: 5, maxDomainTools: 0 });
    await registry.load(ACCOUNT, "products");
    const outcome = await registry.requestAdditionalTools({ operationIds: ["ListPrices"] });
    expect(outcome.granted).toEqual([]);
    expect(outcome.refused[0]!.reason).toContain("no-flooding");
  });
});

describe("the no-universal-request law (battery-asserted)", () => {
  it("NO tool name is a universal request primitive and every schema is closed", async () => {
    const { registry } = await loadedRegistry({ intentText: undefined });
    const all: StripeRegisteredTool[] = registry.list();
    // Register more mid-task to sweep the full name space.
    await registry.requestAdditionalTools({ packIds: ["D_PRODUCTS_PRICING_CATALOG"] });
    for (const tool of all) {
      expect(tool.name).not.toMatch(/^stripe\.request$/);
      expect(tool.name).not.toContain("raw");
      expect(tool.name).not.toContain("http");
      const schema = tool.inputSchema as { additionalProperties?: unknown };
      expect(schema.additionalProperties).toBe(false);
    }
    // The universal primitive simply does not exist.
    expect(registry.resolve("stripe.request")).toBeUndefined();
    expect(STRIPE_ALWAYS_AVAILABLE_TOOL_NAMES).not.toContain("stripe.request");
  });
});

describe("the registry's account scope", () => {
  it("remembers the account it is scoped to", async () => {
    const { registry } = await loadedRegistry({ intentText: "hello there friend" });
    expect(registry.account()).toEqual(ACCOUNT);
  });

  it("exposes the loaded census facts for the discovery tools", async () => {
    const { registry, report } = await loadedRegistry();
    expect(report.factCount).toBe(FACTS.length);
    expect(registry.listFacts().map((entry) => entry.operationId)).toContain("PostProducts");
  });
});
