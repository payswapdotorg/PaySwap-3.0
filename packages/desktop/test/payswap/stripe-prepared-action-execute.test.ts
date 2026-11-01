/**
 * PaySwap Desktop (P24-2, ADR-0017 D10) — the prepared-action EXECUTE
 * battery: the re-resolution + dispatch laws over the FROZEN contracts
 * (split from stripe-prepared-action.test.ts per the file-size law).
 *
 * COVERAGE MAP (the execute laws):
 * - SINGLE-USE: a consumed authorization never executes again (replay
 *   refused); one dispatch attempt, one audit record.
 * - EXPIRY (the resume law): an expired prepared action is never
 *   auto-executed — even when its authorization sits inside its own
 *   (shorter) TTL; an expired authorization refuses too.
 * - CONTEXT-CHANGE INVALIDATION: an account-context change after
 *   approval fails closed (a new preview is required).
 * - PERMISSION WITHDRAWAL: a withdrawn permission between approval and
 *   execution fails closed; the 403 loop records the observation and
 *   the next prepare refuses until the scope refresh re-declares.
 * - APPROVAL-TIER INCREASE / SUPPORT-STATE DEMOTION: a stronger tier
 *   or a non-dispatchable state after approval invalidates the
 *   recorded confirmation.
 * - UNKNOWN (INV-04): a timeout after possible dispatch, a 2xx without
 *   a readable object id, and a crash after consumption are all UNKNOWN
 *   with a reconciliation route — never FAILED, never a fabricated
 *   CONFIRMED, never a replay.
 * - PROVIDER_REJECTED: a non-2xx answer carries status + typed code.
 * - The unknown-authorization refusal: the model can never supply a
 *   valid one (handoff §7.4).
 */

import { describe, expect, it } from "vitest";
import {
  accountContextResolverOver,
  connectionRecordOf,
  executorWorld,
  fakeCensus,
  probeEvidenceOf,
  scriptedTransport,
  throwingTransport,
} from "./stripe-action-fixtures.js";
import { STRIPE_PREPARED_ACTION_TTL_MS } from "../../src/host/payswap/stripe/prepared-action-executor.js";
import type {
  StripePreparedAction,
  StripePreparedActionExecutor,
} from "../../src/host/payswap/stripe/prepared-action-contracts.js";

const PARAMS = [
  { name: "email", value: "member@example.test", location: "body" as const },
  { name: "name", value: "Annual Membership Buyer", location: "body" as const },
];

/** prepare + authorize a PostCustomers action on a fresh world; returns both ids. */
async function authorizedAction(
  world: Awaited<ReturnType<typeof executorWorld>>,
  executor: StripePreparedActionExecutor,
): Promise<{ readonly action: StripePreparedAction; readonly authorizationId: string }> {
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
  return { action: prepared.action, authorizationId: authorized.authorization.authorizationId };
}

/** prepare + authorize on an OVERRIDDEN executor (transport/context/census variants). */
async function authorizedOn(
  world: Awaited<ReturnType<typeof executorWorld>>,
  executor: StripePreparedActionExecutor,
): Promise<{ readonly action: StripePreparedAction; readonly authorizationId: string }> {
  return authorizedAction(world, executor);
}

describe("execute — the re-resolution + dispatch laws", () => {
  it("refuses an unknown authorization (the model can never supply a valid one)", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const outcome = await executor.execute("stripe-authz:forged-by-model");
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "REFUSED_BEFORE_DISPATCH",
      detail: expect.stringContaining("never mint, edit or supply a valid one"),
    });
  });

  it("CONFIRMED: dispatches through the transport with the sealed grant and appends the audit record", async () => {
    const world = await executorWorld();
    const { transport, calls } = scriptedTransport([
      { delivered: true, status: 200, body: { id: "cus_fake51created" }, providerRequestId: "req_fake51stripe01" },
    ]);
    const executor = world.createExecutor({ transport });
    const { action, authorizationId } = await authorizedOn(world, executor);
    const outcome = await executor.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "CONFIRMED",
      providerRefs: ["cus_fake51created"],
      readBackDue: true,
    });
    // The dispatch carried the census facts + the per-connection request version.
    expect(calls.length).toBe(1);
    expect(calls[0]?.operationId).toBe("PostCustomers");
    expect(calls[0]?.apiNamespace).toBe("v1");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.apiVersion).toBe("2025-08-27.basil");
    expect(calls[0]?.idempotencyKey).toBe(`idem-${action.digest}`);
    expect(calls[0]?.correlationId).toBe(`prepared-action-dispatch:${action.preparedActionId}`);
    // The audit record (append-only, secret-free, provider request id).
    const audit = await executor.store.auditRecords();
    expect(audit.length).toBe(1);
    expect(audit[0]?.outcome.kind).toBe("CONFIRMED");
    expect(audit[0]?.providerRequestIds).toEqual(["req_fake51stripe01"]);
    expect(audit[0]?.authorizationId).toBe(authorizationId);
    // The catalogue-surface use recorded the release per connection (D2).
    expect((await world.apiVersion.stateOf(world.connectionId)).catalogueReleaseUsed).toBe(
      "stripe-openapi/v2596@2026-09-30.endive",
    );
  });

  it("SINGLE-USE: a replayed authorization is refused and never dispatches twice", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    const first = await executor.execute(authorizationId);
    expect(first.kind).toBe("CONFIRMED");
    const replay = await executor.execute(authorizationId);
    expect(replay).toEqual({
      kind: "FAILED",
      reason: "REFUSED_BEFORE_DISPATCH",
      detail: expect.stringContaining("single-use; replay is refused"),
    });
    // One dispatch attempt, one audit record.
    const audit = await executor.store.auditRecords();
    expect(audit.length).toBe(1);
  });

  it("EXPIRY (the resume law): an expired prepared action is never auto-executed", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    world.advanceMs(STRIPE_PREPARED_ACTION_TTL_MS + 1);
    const outcome = await executor.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "REFUSED_BEFORE_DISPATCH",
      detail: expect.stringContaining("never auto-executed"),
    });
    expect((await executor.store.auditRecords()).length).toBe(0);
  });

  it("an expired AUTHORIZATION (inside the action TTL) refuses too", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    // 10 minutes: the authorization TTL elapsed, the action (30 min) lives on.
    world.advanceMs(10 * 60 * 1000 + 1);
    const outcome = await executor.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "REFUSED_BEFORE_DISPATCH",
      detail: expect.stringContaining("authorization 'stripe-authz"),
    });
    expect((await executor.store.auditRecords()).length).toBe(0);
  });

  it("CONTEXT-CHANGE INVALIDATION: an account-context change after approval fails closed", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    // The account context changes (a DIFFERENT verified account now).
    const changedContext = accountContextResolverOver({
      evidence: [probeEvidenceOf({ accountRef: "acct_fake51OTHERaccount2" })],
    });
    const rerouted = world.createExecutor({ accountContext: changedContext, store: executor.store });
    const outcome = await rerouted.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "POLICY",
      detail: expect.stringContaining("account context changed after approval"),
    });
    expect((await executor.store.auditRecords()).length).toBe(1);
  });

  it("PERMISSION WITHDRAWAL: a withdrawn permission between approval and execution fails closed", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    await world.permissions.recordDispatchObservation({
      connectionId: world.connectionId,
      operationId: "PostCustomers",
      httpStatus: 403,
      providerErrorCode: null,
    });
    const outcome = await executor.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "PERMISSION_MISSING",
      detail: expect.stringContaining("withdrawn by a 403"),
    });
  });

  it("APPROVAL-TIER INCREASE: a stronger tier after approval invalidates the confirmation", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    // The overlay tier increased (CONFIRM → REAUTH) since approval.
    const stronger = fakeCensus([
      {
        operationId: "PostCustomers",
        effectClass: "PERMISSION_OR_CREDENTIAL_ADMIN",
        approvalTier: "REAUTH",
        requiredPermissionRule: "customers: Write",
        readBackOperationId: "GetCustomersCustomer",
      },
    ]);
    const rerouted = world.createExecutor({ census: stronger, store: executor.store });
    const outcome = await rerouted.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "POLICY",
      detail: expect.stringContaining("approval tier"),
    });
  });

  it("a support-state demotion after approval fails closed (PLANNED is not dispatchable)", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    const demoted = fakeCensus([
      {
        operationId: "PostCustomers",
        supportState: "PLANNED_P24_INITIAL_RELEASE",
        requiredPermissionRule: "customers: Write",
        readBackOperationId: "GetCustomersCustomer",
      },
    ]);
    const rerouted = world.createExecutor({ census: demoted, store: executor.store });
    const outcome = await rerouted.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "POLICY",
      detail: expect.stringContaining("no longer dispatchable"),
    });
  });

  it("UNKNOWN (INV-04): a timeout after possible dispatch is UNKNOWN with a reconciliation route", async () => {
    const world = await executorWorld();
    const { transport } = scriptedTransport([
      { delivered: false, failure: { kind: "TIMEOUT_AFTER_DISPATCH" } },
    ]);
    const executor = world.createExecutor({ transport });
    const { authorizationId } = await authorizedOn(world, executor);
    const outcome = await executor.execute(authorizationId);
    expect(outcome.kind).toBe("UNKNOWN");
    if (outcome.kind === "UNKNOWN") {
      expect(outcome.reconciliationOperationId).toBe("GetCustomersCustomer");
      expect(outcome.note).toContain("reconcile by read-back");
    }
  });

  it("UNKNOWN: a 2xx without a readable object id is never a fabricated CONFIRMED", async () => {
    const world = await executorWorld();
    const { transport } = scriptedTransport([{ delivered: true, status: 200, body: { nope: true } }]);
    const executor = world.createExecutor({ transport });
    const { authorizationId } = await authorizedOn(world, executor);
    const outcome = await executor.execute(authorizationId);
    expect(outcome.kind).toBe("UNKNOWN");
  });

  it("PROVIDER_REJECTED: a non-2xx answer carries the status + code", async () => {
    const world = await executorWorld();
    const { transport } = scriptedTransport([
      { delivered: true, status: 400, providerErrorCode: "parameter_invalid_integer" },
    ]);
    const executor = world.createExecutor({ transport });
    const { authorizationId } = await authorizedOn(world, executor);
    const outcome = await executor.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "PROVIDER_REJECTED",
      httpStatus: 400,
      providerErrorCode: "parameter_invalid_integer",
    });
  });

  it("the withdrawn-permission loop: a 403 records the observation and the next prepare refuses", async () => {
    const world = await executorWorld();
    const { transport } = scriptedTransport([
      { delivered: true, status: 403, providerErrorCode: "raw_not_allowed" },
    ]);
    const executor = world.createExecutor({ transport });
    const { authorizationId } = await authorizedOn(world, executor);
    const outcome = await executor.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "PROVIDER_REJECTED",
      httpStatus: 403,
      providerErrorCode: "raw_not_allowed",
    });
    // The withdrawal observation landed — the operation is no longer preparable.
    const next = await executor.prepare({
      operationId: "PostCustomers",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    expect(next.ok).toBe(false);
    expect(next.ok === false && next.reason).toContain("withdrawn by a 403");
    // The scope refresh clears it (the re-declaration loop).
    const refreshed = await world.permissions.declareScopes({
      connectionId: world.connectionId,
      permissions: ["customers: Write", "customers: Read"],
      principalId: "principal:user-1",
    });
    expect(refreshed.ok).toBe(true);
    const after = await executor.prepare({
      operationId: "PostCustomers",
      parameters: PARAMS,
      connectionId: world.connectionId,
      taskId: "task:fake-1",
    });
    expect(after.ok).toBe(true);
  });

  it("the crash law: an exception after consumption is UNKNOWN (reconcile by read-back — never a replay)", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor({
      transport: throwingTransport(new Error("connection reset mid-dispatch")),
    });
    const { authorizationId } = await authorizedOn(world, executor);
    const outcome = await executor.execute(authorizationId);
    expect(outcome.kind).toBe("UNKNOWN");
    if (outcome.kind === "UNKNOWN") {
      expect(outcome.note).toContain("INV-04");
    }
    // The authorization was consumed — a replay is refused even after the crash.
    const replay = await executor.execute(authorizationId);
    expect(replay.kind).toBe("FAILED");
  });

  it("the connection-no-longer-resolves path audits a POLICY refusal (a new preview is required)", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    const dead = accountContextResolverOver({
      records: [connectionRecordOf({ state: "PENDING_VERIFICATION" })],
    });
    const rerouted = world.createExecutor({ accountContext: dead, store: executor.store });
    const outcome = await rerouted.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "POLICY",
      detail: expect.stringContaining("no longer resolves"),
    });
    // The audit record carries the refusal honestly (append-only).
    const audit = await executor.store.auditRecords();
    expect(audit.length).toBe(1);
    expect(audit[0]?.outcome.kind).toBe("FAILED");
  });

  it("a restricted-key grant refusal inside the seal audits PERMISSION_MISSING (the ADR-0008 belt)", async () => {
    const world = await executorWorld();
    const executor = world.createExecutor();
    const { authorizationId } = await authorizedAction(world, executor);
    // The in-seal gate is INDEPENDENT of the host-side eligibility: a
    // permissions port whose eligibility passes but whose in-seal
    // derivation refuses must still fail closed with an audit record.
    const disagreeingPort = {
      operationEligibility: async () => ({ ok: true as const }),
      recordDispatchObservation: async () => {},
      deriveDispatchGrant: () => ({
        ok: false as const,
        reason: "the in-seal re-derivation refused (a restricted key never derives a grant beyond its declared scopes)",
      }),
    };
    const rerouted = world.createExecutor({ permissions: disagreeingPort, store: executor.store });
    const outcome = await rerouted.execute(authorizationId);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "PERMISSION_MISSING",
      detail: expect.stringContaining("never derives a grant beyond its declared scopes"),
    });
    expect((await executor.store.auditRecords()).length).toBe(1);
  });
});
