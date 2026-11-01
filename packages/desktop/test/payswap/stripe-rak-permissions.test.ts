/**
 * PaySwap Desktop (P24-2, ADR-0017 D5/D7 + handoff §13.2) — the RAK
 * OPERATION-LEVEL PERMISSION BINDING battery:
 *
 * - DECLARED, NEVER SNIFFED: eligibility needs a declaration; the exact
 *   permission rule must be a member (no Read-from-Write inference).
 * - THE EXPOSED SET: only declared + census-IMPLEMENTED + unwithdrawn
 *   operations are exposed; the re-probe recompute reads it.
 * - THE WITHDRAWAL LOOP: a 403 observation removes the operation; a
 *   scope refresh (re-declaration) re-arms it; a KEY_REJECTED probe
 *   removes EVERYTHING until a CONFIRMED re-probe clears it.
 * - THE IN-SEAL GRANT (ADR-0008): pk_/sk_org_/whsec_/unknown/live keys
 *   never derive; a restricted key grants ONLY from its declared
 *   scopes; a full test key is unrestricted by definition.
 * - The declaration grammar: malformed/empty/secret-shaped refused.
 * - The snapshot is durable + secret-free.
 */

import { describe, expect, it } from "vitest";
import {
  FAKE_FULL_TEST_KEY,
  FAKE_ORG_KEY,
  FAKE_PK_KEY,
  FAKE_RAK_LIVE_KEY,
  FAKE_RAK_TEST_KEY,
  FAKE_WHSEC,
  executorWorld,
  fakeCensus,
  fakeFs,
} from "./stripe-action-fixtures.js";
import { StripeRakPermissionBinding } from "../../src/host/payswap/connections/stripe-rak-permissions.js";
import { carriesStripeSecretShape } from "../../src/host/payswap/stripe/stripe-pins.js";

const CONN = "conn:fake-stripe-1";

/** A binding over a small deterministic census (customers + products + a v2 op). */
async function binding(declaredPermissions?: readonly string[]) {
  const census = fakeCensus([
    {
      operationId: "PostCustomers",
      requiredPermissionRule: "customers: Write",
      readBackOperationId: "GetCustomersCustomer",
    },
    { operationId: "GetCustomers", requiredPermissionRule: "customers: Read", method: "GET" },
    {
      operationId: "PostProducts",
      requiredPermissionRule: "products: Write",
      readBackOperationId: "GetProductsId",
    },
    {
      operationId: "PostTerminalReaders",
      supportState: "ACCOUNT_GATED",
      requiredPermissionRule: "terminal: Write",
    },
    {
      operationId: "PostPrices",
      supportState: "PLANNED_P24_INITIAL_RELEASE",
      requiredPermissionRule: "prices: Write",
    },
  ]);
  const store = new StripeRakPermissionBinding({
    census,
    fileSystem: fakeFs(),
    directory: "/tmp/p242-rak-battery",
    nowIso: () => "2026-11-01T12:00:00Z",
  });
  if (declaredPermissions !== undefined) {
    const declared = await store.declareScopes({
      connectionId: CONN,
      permissions: declaredPermissions,
      principalId: "principal:user-1",
    });
    if (!declared.ok) {
      throw new Error("fixture declaration failed");
    }
  }
  return store;
}

describe("the scope declaration (the grammar laws)", () => {
  it("refuses an empty declaration, malformed strings and secret-shaped values", async () => {
    const store = await binding();
    const empty = await store.declareScopes({ connectionId: CONN, permissions: [], principalId: "p" });
    expect(empty.ok).toBe(false);
    expect(empty.ok === false && empty.refusal.kind).toBe("EMPTY_DECLARATION");
    const malformed = await store.declareScopes({
      connectionId: CONN,
      permissions: ["customers write"],
      principalId: "p",
    });
    expect(malformed.ok === false && malformed.refusal.kind).toBe("MALFORMED_PERMISSION");
    const secret = await store.declareScopes({
      connectionId: CONN,
      permissions: [`customers: Write ${FAKE_RAK_TEST_KEY}`],
      principalId: "p",
    });
    expect(secret.ok === false && secret.refusal.kind).toBe("SECRET_SHAPED_DECLARATION");
  });

  it("deduplicates and persists the declaration (a reopen reads it back)", async () => {
    const fs = fakeFs();
    const census = fakeCensus([
      { operationId: "PostCustomers", requiredPermissionRule: "customers: Write" },
    ]);
    const first = new StripeRakPermissionBinding({
      census,
      fileSystem: fs,
      directory: "/tmp/p242-rak-battery",
      nowIso: () => "2026-11-01T12:00:00Z",
    });
    const declared = await first.declareScopes({
      connectionId: CONN,
      permissions: ["customers: Write", "customers: Write"],
      principalId: "principal:user-1",
    });
    expect(declared.ok && declared.declaration.declaredPermissions).toEqual(["customers: Write"]);
    // Reopen over the same fs: the declaration survived.
    const reopened = new StripeRakPermissionBinding({
      census,
      fileSystem: fs,
      directory: "/tmp/p242-rak-battery",
      nowIso: () => "2026-11-01T12:00:00Z",
    });
    await reopened.load();
    expect(reopened.declaredScopesOf(CONN)).toEqual(["customers: Write"]);
    // The snapshot is secret-free.
    expect(carriesStripeSecretShape([...fs.files.values()].join("\n"))).toBe(false);
  });
});

describe("the exposed-operation set (the re-probe recompute)", () => {
  it("exposes only declared + IMPLEMENTED-class + unwithdrawn operations", async () => {
    const store = await binding(["customers: Write", "customers: Read"]);
    expect(await store.exposedOperations(CONN)).toEqual(["GetCustomers", "PostCustomers"]);
  });

  it("an undeclared connection exposes nothing; the exact permission is required (no inference)", async () => {
    const store = await binding(["customers: Read"]);
    // No Write declaration: PostCustomers is not exposed (exact rule law).
    expect(await store.exposedOperations(CONN)).toEqual(["GetCustomers"]);
    const undeclared = await binding();
    expect(await undeclared.exposedOperations(CONN)).toEqual([]);
    const eligibility = await undeclared.operationEligibility({ connectionId: CONN, operationId: "PostCustomers" });
    expect(eligibility.ok).toBe(false);
    expect(eligibility.ok === false && eligibility.reason).toContain("no declared RAK scope map");
  });

  it("a restricted key lacking the exact permission cannot dispatch (handoff §13.2)", async () => {
    const store = await binding(["customers: Read"]);
    const eligibility = await store.operationEligibility({ connectionId: CONN, operationId: "PostCustomers" });
    expect(eligibility.ok).toBe(false);
    expect(eligibility.ok === false && eligibility.reason).toContain(
      "restricted key lacking exact permission cannot dispatch",
    );
  });

  it("a withdrawn permission removes the associated operations (until the refresh)", async () => {
    const store = await binding(["customers: Write", "customers: Read"]);
    await store.recordDispatchObservation({
      connectionId: CONN,
      operationId: "PostCustomers",
      httpStatus: 403,
      providerErrorCode: "raw_not_allowed",
    });
    expect(await store.exposedOperations(CONN)).toEqual(["GetCustomers"]);
    // A non-401/403 observation records nothing (only permission evidence withdraws).
    await store.recordDispatchObservation({
      connectionId: CONN,
      operationId: "GetCustomers",
      httpStatus: 500,
      providerErrorCode: null,
    });
    expect(await store.exposedOperations(CONN)).toEqual(["GetCustomers"]);
    // The scope refresh clears the observations (the re-declaration loop).
    await store.declareScopes({
      connectionId: CONN,
      permissions: ["customers: Write", "customers: Read"],
      principalId: "principal:user-1",
    });
    expect(await store.exposedOperations(CONN)).toEqual(["GetCustomers", "PostCustomers"]);
  });

  it("a key-rejected probe removes EVERYTHING until a CONFIRMED re-probe clears it", async () => {
    const store = await binding(["customers: Write", "customers: Read"]);
    await store.recordKeyRejected(CONN);
    expect(await store.exposedOperations(CONN)).toEqual([]);
    const eligibility = await store.operationEligibility({ connectionId: CONN, operationId: "GetCustomers" });
    expect(eligibility.ok === false && eligibility.reason).toContain("re-probe that confirms is required");
    await store.clearKeyRejections(CONN);
    expect(await store.exposedOperations(CONN)).toEqual(["GetCustomers", "PostCustomers"]);
  });
});

describe("the in-seal grant derivation (INV-25 + the key-shape laws)", () => {
  async function executeWithKey(apiKey: string) {
    const world = await executorWorld({
      materialByConnection: new Map([[CONN, { apiKey }]]),
    });
    const executor = world.createExecutor();
    const prepared = await executor.prepare({
      operationId: "PostCustomers",
      parameters: [
        { name: "email", value: "member@example.test", location: "body" },
        { name: "name", value: "Annual Membership Buyer", location: "body" },
      ],
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
    return executor.execute(authorized.authorization.authorizationId);
  }

  it("refuses a publishable pk_ key as a server-side credential", async () => {
    const outcome = await executeWithKey(FAKE_PK_KEY);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "PERMISSION_MISSING",
      detail: expect.stringContaining("publishable pk_ key is not a server-side credential"),
    });
  });

  it("refuses an organization key (out of scope — ADR-0017 D5)", async () => {
    const outcome = await executeWithKey(FAKE_ORG_KEY);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "PERMISSION_MISSING",
      detail: expect.stringContaining("organization keys (sk_org_) are out of scope"),
    });
  });

  it("refuses a webhook signing secret as an API key", async () => {
    const outcome = await executeWithKey(FAKE_WHSEC);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "PERMISSION_MISSING",
      detail: expect.stringContaining("whsec_ value is an endpoint signing secret"),
    });
  });

  it("refuses a live-mode key (INV-25)", async () => {
    const outcome = await executeWithKey(FAKE_RAK_LIVE_KEY);
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "PERMISSION_MISSING",
      detail: expect.stringContaining("INV-25"),
    });
  });

  it("refuses an unknown key shape (shape checks never validate — the probe does)", async () => {
    const outcome = await executeWithKey("not-a-stripe-key-shape-at-all");
    expect(outcome).toEqual({
      kind: "FAILED",
      reason: "PERMISSION_MISSING",
      detail: expect.stringContaining("verification probe"),
    });
  });

  it("dispatches a restricted key inside its declared scopes", async () => {
    const outcome = await executeWithKey(FAKE_RAK_TEST_KEY);
    expect(outcome.kind).toBe("CONFIRMED");
  });

  it("dispatches a full test key (unrestricted by definition — the P14-A SANDBOX slice)", async () => {
    const outcome = await executeWithKey(FAKE_FULL_TEST_KEY);
    expect(outcome.kind).toBe("CONFIRMED");
  });

  it("refuses a restricted key OUTSIDE its declared scopes (re-derived inside the seal)", async () => {
    const world = await executorWorld({
      materialByConnection: new Map([[CONN, { apiKey: FAKE_RAK_TEST_KEY }]]),
      declaredPermissions: ["customers: Read"],
    });
    const executor = world.createExecutor();
    const prepared = await executor.prepare({
      operationId: "PostCustomers",
      parameters: [{ name: "email", value: "member@example.test", location: "body" }],
      connectionId: CONN,
      taskId: "task:fake-1",
    });
    // The prepare-time eligibility already refuses (the write rule is not declared)…
    expect(prepared.ok).toBe(false);
    expect(prepared.ok === false && prepared.reason).toContain("exact permission 'customers: Write'");
    // …and the in-seal derivation refuses independently (belt and braces).
    const grant = world.permissions.deriveDispatchGrant({
      apiKey: FAKE_RAK_TEST_KEY,
      connectionId: CONN,
      environment: "SANDBOX",
      operationId: "PostCustomers",
      requiredPermissionRule: "customers: Write",
    });
    expect(grant.ok).toBe(false);
    expect(grant.ok === false && grant.reason).toContain("never derives a grant beyond its declared scopes");
  });

  it("a LIVE environment never derives a grant (INV-25 — before any key shape is consulted)", async () => {
    const store = await binding(["customers: Write"]);
    const grant = store.deriveDispatchGrant({
      apiKey: FAKE_RAK_TEST_KEY,
      connectionId: CONN,
      environment: "LIVE",
      operationId: "PostCustomers",
      requiredPermissionRule: "customers: Write",
    });
    expect(grant.ok).toBe(false);
    expect(grant.ok === false && grant.reason).toContain("SANDBOX-only");
  });
});
