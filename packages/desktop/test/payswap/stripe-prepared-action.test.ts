/**
 * PaySwap Desktop (P24-2, ADR-0017 D10 — THE CORE BATTERY) — the
 * prepared-action lifecycle over the FROZEN contracts:
 *
 *   prepare → validate → preview → human confirmation → authorize
 *           → execute → verify/reconcile.
 *
 * This file covers PREPARE + AUTHORIZE + INSPECT; the execute laws live
 * in stripe-prepared-action-execute.test.ts, the in-seal grant laws in
 * stripe-rak-permissions.test.ts, the durable store in
 * stripe-action-store.test.ts and the account-context resolver in
 * stripe-account-context.test.ts (the file-size law).
 *
 * COVERAGE MAP (this file):
 * - DENY law: unknown operationId refused; PLANNED/ACCOUNT_GATED
 *   support states refused (only IMPLEMENTED-class dispatches).
 * - DIGEST BINDING: the digest binds operation + normalized parameters
 *   + account context; parameter ORDER does not change it (canonical
 *   serialization); a one-byte value change does.
 * - The prepared action carries the host-resolved account context, the
 *   confirmation inputs, the idempotency key ref, the read-back route,
 *   the expiry — and NO secret shape.
 * - AUTHORIZE: digest mismatch refused; unknown action refused; expired
 *   action never authorized; ONE live authorization per action.
 * - INSPECT: the preview/resume read.
 */

import { describe, expect, it } from "vitest";
import {
  FAKE_RAK_TEST_KEY,
  accountContextResolverOver,
  executorWorld,
  fakeSchemaValidator,
  scriptedTransport,
} from "./stripe-action-fixtures.js";
import {
  STRIPE_PREPARED_ACTION_TTL_MS,
  createStripePreparedActionExecutor,
} from "../../src/host/payswap/stripe/prepared-action-executor.js";
import { createInMemoryStripePreparedActionStore } from "../../src/host/payswap/stripe/prepared-action-store.js";
import { preparedActionDigestOf } from "../../src/host/payswap/stripe/prepared-action-digest.js";
import { carriesStripeSecretShape } from "../../src/host/payswap/stripe/stripe-pins.js";

const PARAMS = [
  { name: "email", value: "member@example.test", location: "body" as const },
  { name: "name", value: "Annual Membership Buyer", location: "body" as const },
];

async function preparedExecutor() {
  const world = await executorWorld();
  const executor = world.createExecutor();
  const prepared = await executor.prepare({
    operationId: "PostCustomers",
    parameters: PARAMS,
    connectionId: world.connectionId,
    taskId: "task:fake-1",
  });
  if (!prepared.ok) {
    throw new Error(`fixture prepare failed: ${prepared.reason}`);
  }
  return { world, executor, action: prepared.action };
}

describe("prepare — the census decides (the DENY law)", () => {
  it("refuses an unknown operationId", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const outcome = await executor.prepare({
      operationId: "NotARealOperation",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("unknown catalogue operation");
  });

  it("refuses a PLANNED (not-yet-implemented) operation — PLANNED is not dispatchable", async () => {
    const world = await executorWorld({
      operations: [
        { operationId: "PostPrices", supportState: "PLANNED_P24_INITIAL_RELEASE" },
      ],
    });
    const executor = world.createExecutor();
    const outcome = await executor.prepare({
      operationId: "PostPrices",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("PLANNED_P24_INITIAL_RELEASE");
  });

  it("refuses an ACCOUNT_GATED operation with its honest state", async () => {
    const world = await executorWorld({
      operations: [{ operationId: "PostTerminalReaders", supportState: "ACCOUNT_GATED" }],
    });
    const executor = world.createExecutor();
    const outcome = await executor.prepare({
      operationId: "PostTerminalReaders",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("ACCOUNT_GATED");
  });

  it("refuses a proposal without a task id (the approval lineage)", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const outcome = await executor.prepare({
      operationId: "PostCustomers",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("requires the task it belongs to");
  });

  it("refuses when the schema validator rejects a parameter", async () => {
    const world = await executorWorld();
    const executor = createStripePreparedActionExecutor({
      census: world.census,
      schemaValidator: fakeSchemaValidator({ knownParameterNames: ["email"] }),
      transport: scriptedTransport([]).transport,
      seal: {
        withSealedCredential: async <T,>(
          _id: string,
          consumer: (material: unknown) => T,
        ): Promise<Awaited<T>> => consumer({ apiKey: FAKE_RAK_TEST_KEY }) as Awaited<T>,
      },
      accountContext: accountContextResolverOver(),
      permissions: world.permissions,
      apiVersion: world.apiVersion,
      nowMs: () => world.clock.ms,
      nowIso: () => world.clock.iso,
      createId: () => "fake-validator-1",
      store: createInMemoryStripePreparedActionStore(),
    });
    const outcome = await executor.prepare({
      operationId: "PostCustomers",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("UNKNOWN_PARAMETER");
  });

  it("refuses a secret-shaped parameter value (fail-closed — never hashed into a binding)", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const outcome = await executor.prepare({
      operationId: "PostCustomers",
      parameters: [
        { name: "metadata", value: { apiKey: FAKE_RAK_TEST_KEY }, location: "body" },
      ],
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("SECRET_SHAPED_PARAMETER");
  });

  it("binds the host-resolved account context, the digest, the confirmation inputs and the expiry", async () => {
    const { action } = await preparedExecutor();
    expect(action.operationId).toBe("PostCustomers");
    expect(action.accountContext).toEqual({
      connectionId: "conn:fake-stripe-1",
      stripeAccountId: "acct_fake51stripeTestAcct1",
      accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
      environment: "SANDBOX",
    });
    expect(action.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(action.effectClass).toBe("STRIPE_CONFIGURATION_WRITE");
    expect(action.approvalTier).toBe("CONFIRM");
    expect(action.readBackOperationId).toBe("GetCustomersCustomer");
    expect(action.idempotencyKeyRef).toBe(`idem:${action.preparedActionId}`);
    expect(action.expiresAt).toBe(new Date(1_000_000_000 + STRIPE_PREPARED_ACTION_TTL_MS).toISOString());
    const joined = action.confirmationInputs.join("\n");
    expect(joined).toContain("PostCustomers");
    expect(joined).toContain("acct_fake51stripeTestAcct1");
    expect(joined).toContain("SANDBOX");
    expect(joined).toContain("body email = member@example.test");
    // The prepared action is secret-free.
    expect(carriesStripeSecretShape(JSON.stringify(action))).toBe(false);
  });

  it("digests the same logical binding identically and a changed parameter differently", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const first = await executor.prepare({
      operationId: "PostCustomers",
      parameters: [
        { name: "name", value: "Annual Membership", location: "body" },
        { name: "email", value: "a@example.test", location: "body" },
      ],
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    const second = await executor.prepare({
      operationId: "PostCustomers",
      // Parameter ORDER differs — the canonical form sorts; same digest.
      parameters: [
        { name: "email", value: "a@example.test", location: "body" },
        { name: "name", value: "Annual Membership", location: "body" },
      ],
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    const changed = await executor.prepare({
      operationId: "PostCustomers",
      parameters: [
        { name: "name", value: "Annual Membership CHANGED", location: "body" },
        { name: "email", value: "a@example.test", location: "body" },
      ],
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    if (!first.ok || !second.ok || !changed.ok) {
      throw new Error("fixture prepare failed");
    }
    expect(second.action.digest).toBe(first.action.digest);
    expect(changed.action.digest).not.toBe(first.action.digest);
    // The persisted action re-derives its own digest (the integrity law).
    expect(preparedActionDigestOf(first.action)).toBe(first.action.digest);
  });

  it("the digest changes with the ACCOUNT CONTEXT (the binding includes it)", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const first = await executor.prepare({
      operationId: "PostCustomers",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    const otherAccount = world.createExecutor({
      accountContext: accountContextResolverOver({
        evidence: [
          {
            connectionId: "conn:fake-stripe-1",
            providerId: "stripe",
            probedOperation: "stripe.balance.read + stripe.account.read",
            outcome: "CONFIRMED" as const,
            providerReferences: ["acct_fake51OTHERaccount2", "balance"],
            accountRef: "acct_fake51OTHERaccount2",
            providerLiveMode: false,
            keyClass: "RESTRICTED_TEST",
            balanceCurrencies: ["USD"],
            transportId: "stripe-https-transport",
            executionMode: "SANDBOX",
            observedAt: "2026-10-31T10:05:00Z",
            evidenceTier: "PROVIDER_OBSERVATION" as const,
            observationVersion: 1,
          },
        ],
      }),
    });
    const second = await otherAccount.prepare({
      operationId: "PostCustomers",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    if (!first.ok || !second.ok) {
      throw new Error("fixture prepare failed");
    }
    expect(second.action.digest).not.toBe(first.action.digest);
  });
});

describe("authorize — the single-use, digest-bound artifact", () => {
  it("refuses a digest mismatch (the approved preview must bind the exact action)", async () => {
    const { executor, action } = await preparedExecutor();
    const outcome = await executor.authorize({
      preparedActionId: action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: "0".repeat(64),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("digest mismatch");
  });

  it("refuses an unknown action", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const outcome = await executor.authorize({
      preparedActionId: "stripe-action:nope",
      principalId: "principal:user-1",
      confirmedDigest: "0".repeat(64),
    });
    expect(outcome.ok).toBe(false);
  });

  it("refuses an expired prepared action (expired actions are never authorized)", async () => {
    const { world, executor, action } = await preparedExecutor();
    world.advanceMs(STRIPE_PREPARED_ACTION_TTL_MS + 1);
    const outcome = await executor.authorize({
      preparedActionId: action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: action.digest,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("expired");
  });

  it("mints a single-use authorization and refuses a second live one", async () => {
    const { executor, action } = await preparedExecutor();
    const first = await executor.authorize({
      preparedActionId: action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: action.digest,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.authorization.approvedDigest).toBe(action.digest);
      expect(first.authorization.consumedAt).toBeNull();
      // The authorization never outlives the prepared action.
      expect(Date.parse(first.authorization.expiresAt) <= Date.parse(action.expiresAt)).toBe(true);
    }
    const second = await executor.authorize({
      preparedActionId: action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: action.digest,
    });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toContain("live authorization");
  });
});

describe("inspect — the preview/resume read", () => {
  it("returns the stored action (or null)", async () => {
    const { executor, action } = await preparedExecutor();
    const inspected = await executor.inspect(action.preparedActionId);
    expect(inspected).toEqual(action);
    expect(await executor.inspect("stripe-action:unknown")).toBeNull();
  });
});
