/**
 * PaySwap Desktop (P24-2, ADR-0017 D10) — the durable prepared-action
 * STORE battery: persistence across reopen (the resume law), the
 * single-use consumption write, the append-only audit surface, the
 * fail-closed secret scan at EVERY write, and per-record quarantine of
 * malformed snapshots.
 */

import { describe, expect, it } from "vitest";
import {
  FAKE_RAK_TEST_KEY,
  executorWorld,
  fakeFs,
  scriptedTransport,
} from "./stripe-action-fixtures.js";
import {
  createInMemoryStripePreparedActionStore,
  openStripePreparedActionStore,
} from "../../src/host/payswap/stripe/prepared-action-store.js";
import { carriesStripeSecretShape } from "../../src/host/payswap/stripe/stripe-pins.js";
import type { StripeActionAuditRecord } from "../../src/host/payswap/stripe/prepared-action-contracts.js";

const PARAMS = [
  { name: "email", value: "member@example.test", location: "body" as const },
];

describe("the durable store (resume + the secret scan)", () => {
  it("persists actions/authorizations/audit across a reopen (the resume law)", async () => {
    const fs = fakeFs();
    const store = await openStripePreparedActionStore({ fileSystem: fs, directory: "/tmp/p242-actions" });
    const world = await executorWorld();
    const executor = world.createExecutor({ store });
    const prepared = await executor.prepare({
      operationId: "PostCustomers",
      parameters: PARAMS,
      connectionId: world.connectionId,
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
    expect(outcome.kind).toBe("CONFIRMED");
    // Reopen from the same fs: the consumed authorization stays consumed.
    const reopened = await openStripePreparedActionStore({ fileSystem: fs, directory: "/tmp/p242-actions" });
    const replay = await world.createExecutor({ store: reopened }).execute(
      authorized.authorization.authorizationId,
    );
    expect(replay.kind).toBe("FAILED");
    const audit = await reopened.auditRecords();
    expect(audit.length).toBe(1);
    // The snapshot is secret-free (nested structures + key prefixes).
    const snapshotText = [...fs.files.values()].join("\n");
    expect(carriesStripeSecretShape(snapshotText)).toBe(false);
  });

  it("quarantines malformed records fail-closed (never a crash)", async () => {
    const fs = fakeFs();
    fs.files.set(
      "/tmp/p242-actions/stripe-prepared-actions.json",
      JSON.stringify({
        version: 1,
        actions: [{ preparedActionId: 42 }, "junk"],
        authorizations: [null],
        audit: [{ nope: true }],
      }),
    );
    const store = await openStripePreparedActionStore({ fileSystem: fs, directory: "/tmp/p242-actions" });
    expect(await store.getAction("anything")).toBeNull();
    expect(await store.auditRecords()).toEqual([]);
  });

  it("an unknown snapshot version starts empty (forward-version honesty)", async () => {
    const fs = fakeFs();
    fs.files.set(
      "/tmp/p242-actions/stripe-prepared-actions.json",
      JSON.stringify({ version: 999, actions: [{ preparedActionId: "x" }] }),
    );
    const store = await openStripePreparedActionStore({ fileSystem: fs, directory: "/tmp/p242-actions" });
    expect(await store.getAction("x")).toBeNull();
  });

  it("the secret scan refuses a credential-shaped record at write (fail-closed, never sanitized)", async () => {
    const store = createInMemoryStripePreparedActionStore();
    await expect(
      store.putAction({
        preparedActionId: "stripe-action:leak",
        operationId: "PostCustomers",
        catalogueRelease: "stripe-openapi/v2596@2026-09-30.endive",
        accountContext: {
          connectionId: "conn:fake-stripe-1",
          stripeAccountId: "acct_fake51stripeTestAcct1",
          accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
          environment: "SANDBOX",
        },
        parameters: [{ name: "metadata", value: { apiKey: FAKE_RAK_TEST_KEY }, location: "body" }],
        digest: "0".repeat(64),
        effectClass: "STRIPE_CONFIGURATION_WRITE",
        approvalTier: "CONFIRM",
        confirmationInputs: [],
        idempotencyKeyRef: "idem:stripe-action:leak",
        readBackOperationId: null,
        expiresAt: "2026-11-01T13:00:00Z",
        createdBy: "model_proposal",
      }),
    ).rejects.toThrow(/secret-scan refusal/);
  });

  it("an audit record with a nested serialized secret shape is refused too", async () => {
    const store = createInMemoryStripePreparedActionStore();
    const record: StripeActionAuditRecord = {
      preparedActionId: "stripe-action:leak",
      authorizationId: null,
      operationId: "PostCustomers",
      accountContext: {
        connectionId: "conn:fake-stripe-1",
        stripeAccountId: "acct_fake51stripeTestAcct1",
        accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
        environment: "SANDBOX",
      },
      outcome: { kind: "FAILED", reason: "VALIDATION", detail: `nested ${FAKE_RAK_TEST_KEY}` },
      providerRequestIds: [],
      at: "2026-11-01T12:00:00Z",
    };
    await expect(store.appendAuditRecord(record)).rejects.toThrow(/secret-scan refusal/);
  });

  it("consumeAuthorization is single-use (the durable before-dispatch write)", async () => {
    const store = createInMemoryStripePreparedActionStore();
    const world = await executorWorld();
    const { transport } = scriptedTransport([
      { delivered: true, status: 200, body: { id: "cus_fake51created" } },
    ]);
    const executor = world.createExecutor({ store, transport });
    const prepared = await executor.prepare({
      operationId: "PostCustomers",
      parameters: PARAMS,
      connectionId: world.connectionId,
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
    expect(await store.consumeAuthorization(authorized.authorization.authorizationId, "2026-11-01T12:01:00Z")).toBe(true);
    expect(await store.consumeAuthorization(authorized.authorization.authorizationId, "2026-11-01T12:02:00Z")).toBe(false);
    // The consumed authorization is visible (audit surface).
    const after = await store.getAuthorization(authorized.authorization.authorizationId);
    expect(after?.consumedAt).toBe("2026-11-01T12:01:00Z");
  });
});
