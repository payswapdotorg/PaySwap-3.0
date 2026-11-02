/**
 * PaySwap Desktop (P24-2) — the P24-1 REAL-WIRING battery, part 2:
 * THE REAL TRANSPORT behind the host port + THE FULL TWO-PHASE FLOW
 * through REAL code (the adapters live in
 * stripe-p241-wiring-adapters.ts — the executable P24-D recipe).
 *
 * LAWS PROVEN HERE (the frozen-contract lifecycle over REAL code):
 * - prepare → authorize → execute lands CONFIRMED with the provider
 *   object id; the audit record carries the provider request id; the
 *   wire request is EXACTLY the census path + the REAL v1 form
 *   serializer output + the sealed Authorization header + the
 *   per-connection request version (the legacy pin — ADR-0017 D2) +
 *   the digest-bound Idempotency-Key on v1 state-changing POSTs only;
 * - a real classified error response maps onto PROVIDER_REJECTED with
 *   the typed provider error code;
 * - a timeout after possible dispatch is UNKNOWN with the real
 *   reconciliation route (INV-04 — never FAILED, never a replay);
 * - the REAL strict validator gates prepare through the host port
 *   (no fake pass-through; nothing reaches the wire on refusal);
 * - a HELD credential-admin operation in the REAL census refuses at
 *   prepare (the DENY law over real support state — the P25 held set).
 */

import { describe, expect, it } from "vitest";
import { STRIPE_OPERATION_CENSUS } from "../../../provider-runtime/src/index.js";
import type { StripeActionParameter } from "../../src/host/payswap/stripe/prepared-action-contracts.js";
import { FAKE_RAK_TEST_KEY } from "./stripe-action-fixtures.js";
import { realWiredExecutor } from "./stripe-p241-wiring-adapters.js";

const CONN = "conn:fake-stripe-1";

const CUSTOMER_PARAMS: readonly StripeActionParameter[] = [
  { name: "email", value: "member@example.test", location: "body" },
  { name: "name", value: "Annual Membership Buyer", location: "body" },
];

describe("the REAL transport behind the host port (the full two-phase flow)", () => {
  it("prepare → authorize → execute lands CONFIRMED with the exact wire request", async () => {
    const { executor, store, calls } = await realWiredExecutor({
      status: 200,
      body: JSON.stringify({ id: "cus_fake51realWired1", object: "customer" }),
      headers: { "request-id": "req_fake51realWired01" },
    });
    const prepared = await executor.prepare({
      operationId: "PostCustomers",
      parameters: CUSTOMER_PARAMS,
      connectionId: CONN,
      taskId: "task:fake-1",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      throw new Error(prepared.reason);
    }
    // The REAL registry's read-back route rides the action.
    expect(prepared.action.readBackOperationId).toBe("GetCustomersCustomer");
    const authorized = await executor.authorize({
      preparedActionId: prepared.action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: prepared.action.digest,
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) {
      throw new Error(authorized.reason);
    }
    const outcome = await executor.execute(authorized.authorization.authorizationId);
    expect(outcome).toEqual({
      kind: "CONFIRMED",
      providerRefs: ["cus_fake51realWired1"],
      readBackDue: true,
    });
    // THE WIRE EVIDENCE: one call, exactly the census path, the REAL v1
    // form serializer output, the sealed Authorization header, the
    // per-connection request version (the legacy pin — ADR-0017 D2) and
    // the digest-bound Idempotency-Key.
    expect(calls.length).toBe(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.stripe.com/v1/customers");
    expect(call.method).toBe("POST");
    expect(call.headers["Authorization"]).toBe(`Bearer ${FAKE_RAK_TEST_KEY}`);
    expect(call.headers["Stripe-Version"]).toBe("2025-08-27.basil");
    expect(call.headers["Idempotency-Key"]).toBe(`idem-${prepared.action.digest}`);
    expect(call.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(new URLSearchParams(call.body ?? "").get("email")).toBe("member@example.test");
    expect(new URLSearchParams(call.body ?? "").get("name")).toBe("Annual Membership Buyer");
    // The audit record carries the provider request id (append-only).
    const audit = await store.auditRecords();
    expect(audit.length).toBe(1);
    expect(audit[0]?.providerRequestIds).toEqual(["req_fake51realWired01"]);
  });

  it("a GET dispatch carries NO Idempotency-Key and no content type (the class law)", async () => {
    const { executor, calls } = await realWiredExecutor({
      status: 200,
      body: JSON.stringify({ object: "list", data: [], has_more: false }),
      headers: { "request-id": "req_fake51realWired02" },
    });
    const prepared = await executor.prepare({
      operationId: "GetCustomers",
      parameters: [{ name: "limit", value: 3, location: "query" }],
      connectionId: CONN,
      taskId: "task:fake-1",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      throw new Error(prepared.reason);
    }
    const authorized = await executor.authorize({
      preparedActionId: prepared.action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: prepared.action.digest,
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) {
      throw new Error(authorized.reason);
    }
    const outcome = await executor.execute(authorized.authorization.authorizationId);
    // A list GET with no top-level id classifies CONFIRMED (the read IS
    // the data — no read-back due).
    expect(outcome.kind).toBe("CONFIRMED");
    expect(calls.length).toBe(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.stripe.com/v1/customers?limit=3");
    expect(call.method).toBe("GET");
    expect(call.headers["Idempotency-Key"]).toBeUndefined();
    expect(call.headers["Content-Type"]).toBeUndefined();
    expect(call.headers["Stripe-Version"]).toBe("2025-08-27.basil");
  });

  it("a real classified error response maps onto PROVIDER_REJECTED with the typed code", async () => {
    const { executor } = await realWiredExecutor({
      status: 400,
      body: JSON.stringify({
        error: { type: "invalid_request_error", code: "parameter_invalid_integer" },
      }),
      headers: { "request-id": "req_fake51realWired03" },
    });
    const prepared = await executor.prepare({
      operationId: "PostCustomers",
      parameters: CUSTOMER_PARAMS,
      connectionId: CONN,
      taskId: "task:fake-1",
    });
    if (!prepared.ok) {
      throw new Error(prepared.reason);
    }
    const authorized = await executor.authorize({
      preparedActionId: prepared.action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: prepared.action.digest,
    });
    if (!authorized.ok) {
      throw new Error(authorized.reason);
    }
    const outcome = await executor.execute(authorized.authorization.authorizationId);
    expect(outcome).toEqual({
      kind: "PROVIDER_REJECTED",
      httpStatus: 400,
      providerErrorCode: "parameter_invalid_integer",
    });
  });

  it("a timeout after possible dispatch is UNKNOWN with the real reconciliation route (INV-04)", async () => {
    const { executor } = await realWiredExecutor("TIMEOUT");
    const prepared = await executor.prepare({
      operationId: "PostCustomers",
      parameters: CUSTOMER_PARAMS,
      connectionId: CONN,
      taskId: "task:fake-1",
    });
    if (!prepared.ok) {
      throw new Error(prepared.reason);
    }
    const authorized = await executor.authorize({
      preparedActionId: prepared.action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: prepared.action.digest,
    });
    if (!authorized.ok) {
      throw new Error(authorized.reason);
    }
    const outcome = await executor.execute(authorized.authorization.authorizationId);
    expect(outcome.kind).toBe("UNKNOWN");
    if (outcome.kind === "UNKNOWN") {
      expect(outcome.reconciliationOperationId).toBe("GetCustomersCustomer");
      expect(outcome.note).toContain("reconcile by read-back");
    }
    // Single-use even after the ambiguity: a replay refuses.
    const replay = await executor.execute(authorized.authorization.authorizationId);
    expect(replay.kind).toBe("FAILED");
  });

  it("the REAL strict validator gates prepare through the host port (no fake pass-through)", async () => {
    const { executor, calls } = await realWiredExecutor({
      status: 200,
      body: JSON.stringify({ id: "cus_fake51neverReached" }),
    });
    const refused = await executor.prepare({
      operationId: "PostCustomers",
      parameters: [
        ...CUSTOMER_PARAMS,
        { name: "bogus_field", value: "nope", location: "body" },
      ],
      connectionId: CONN,
      taskId: "task:fake-1",
    });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toContain("UNKNOWN_PARAMETER");
    // Nothing reached the wire.
    expect(calls.length).toBe(0);
  });

  it("a HELD credential-admin operation in the REAL census refuses at prepare (the DENY law over real state)", async () => {
    const { executor } = await realWiredExecutor({
      status: 200,
      body: JSON.stringify({ id: "cus_fake51neverReached" }),
    });
    // Find a real held operation in the live census (never hardcode): the
    // P25 surface holds the credential-admin writes at NOT_SUPPORTED_WITH_REASON.
    const held = STRIPE_OPERATION_CENSUS.find(
      (record) =>
        record.supportState === "NOT_SUPPORTED_WITH_REASON" &&
        record.requiredPermissionRule === "webhookEndpoints: Write",
    );
    expect(held).toBeDefined();
    const refused = await executor.prepare({
      operationId: held!.operationId,
      parameters: [],
      connectionId: CONN,
      taskId: "task:fake-1",
    });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toContain("NOT_SUPPORTED_WITH_REASON");
  });
});
