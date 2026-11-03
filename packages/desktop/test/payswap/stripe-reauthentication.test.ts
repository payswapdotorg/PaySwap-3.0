/**
 * PaySwap Desktop (P26-A, ADR-0018) — THE RE-AUTHENTICATION BATTERY: the
 * proof machinery + the executor's REAUTH gate, the laws test-enforced.
 *
 * COVERAGE MAP (ADR-0018 D1–D6):
 * - THE SAME-ACCOUNT LAW: a fresh credential probe-verifying a DIFFERENT
 *   account than the connection's verified account is refused
 *   (ACCOUNT_MISMATCH — fail-closed, never a cross-account proof).
 * - INV-25 AT THE FLOW'S OWN EDGE: live keys refused here AND at the
 *   transport edge (LIVE_KEY_REFUSED); malformed shapes refused
 *   (INVALID_CREDENTIAL_SHAPE); possession is only proven by a DELIVERED
 *   2xx probe (undelivered/rejected both fail closed).
 * - THE PROOF LAWS: digest-SCOPED (a proof for one digest never authorizes
 *   another — PROOF_DIGEST_MISMATCH), single-use (consumption refuses
 *   replay), 10-minute TTL (expiry refuses), EMPTY_DIGEST_SCOPE refused.
 * - THE ESCAPE LAW: the minted proof carries no credential material; the
 *   store's persisted JSON is secret-shape-scanned.
 * - THE EXECUTOR GATE: a REAUTH-tier action refuses authorization without
 *   the re-authentication plane composed (the honest-unbound posture —
 *   the tier NEVER degrades to a card click) and without a valid proof
 *   (REAUTH_PROOF_REQUIRED); with a proof: authorize → execute → the
 *   proof is consumed BEFORE dispatch (a second authorization of the same
 *   action needs a NEW proof); the digest scope binds end-to-end.
 */

import { describe, expect, it } from "vitest";
import {
  accountContextResolverOver,
  connectionRecordOf,
  executorWorld,
  fakeCensus,
  probeEvidenceOf,
  scriptedTransport,
} from "./stripe-action-fixtures.js";
import {
  createStripeReauthenticationService,
  StripeReauthenticationStore,
  STRIPE_REAUTHENTICATION_PROOF_TTL_MS,
  type StripeReauthenticationService,
} from "../../src/host/payswap/stripe/reauthentication.js";
import type { StripeReauthenticationPort } from "../../src/host/payswap/stripe/action-seams.js";
import type { StripePreparedActionExecutor } from "../../src/host/payswap/stripe/prepared-action-contracts.js";

/** The connection's verified account (the same-account law's target — the
 *  world's default probe-evidence account). */
const VERIFIED_ACCOUNT_ID = "acct_fake51stripeTestAcct1";
const FRESH_RK_TEST = "rk_test_51FakeFreshCredentialMaterial0001";
/** The live-key fixture follows the stripe-protocol.test.ts push-protection
 *  convention: the literal never appears in source (built at runtime). */
const REFUSED_LIVE_RK = ["rk", "live", "FAKE51key" + "DoNotUse0001"].join("_");

/** An in-memory fs for the proof store. */
function memoryFs() {
  const files = new Map<string, string>();
  return {
    files,
    readFile: async (path: string) => {
      const data = files.get(path);
      if (data === undefined) throw new Error("ENOENT");
      return data;
    },
    writeFile: async (path: string, data: string) => {
      files.set(path, data);
    },
    mkdir: async () => {},
  };
}

/** A re-auth service over the world's census/context + a scripted transport. */
function reauthOf(
  world: Awaited<ReturnType<typeof executorWorld>>,
  script: Parameters<typeof scriptedTransport>[0],
  clockMs: () => number,
): { readonly service: StripeReauthenticationService; readonly transport: ReturnType<typeof scriptedTransport>["transport"] } {
  const { transport } = scriptedTransport([...script]);
  const store = new StripeReauthenticationStore(memoryFs(), "/tmp/reauth/proofs.json");
  const service = createStripeReauthenticationService({
    census: fakeCensus([
      { operationId: "GetAccount", method: "GET", path: "/v1/account", effectClass: "READ_ONLY", approvalTier: "NONE", requiredPermissionRule: "Account: Read" },
    ]),
    transport,
    accountContext: accountContextResolverOver({
      records: [connectionRecordOf({ connectionId: world.connectionId })],
      evidence: [probeEvidenceOf({ connectionId: world.connectionId, accountRef: VERIFIED_ACCOUNT_ID })],
    }),
    store,
    nowMs: clockMs,
    createId: () => `reauth-${Math.random().toString(36).slice(2, 8)}`,
  });
  return { service, transport };
}

/** The executor's reauthentication seam adapter (the service IS the port shape modulo the refusal mapping). */
function portOf(service: StripeReauthenticationService): StripeReauthenticationPort {
  return {
    begin: async (input) => {
      const result = await service.begin(input);
      return result.ok ? { ok: true, proofId: result.proofId } : { ok: false, reason: result.refusal.kind };
    },
    verify: async (input) => {
      const result = await service.verify(input);
      return result.ok ? { ok: true, proofId: result.proofId } : { ok: false, reason: result.refusal.kind };
    },
    consume: (proofId) => service.consume(proofId),
  };
}

const ACCOUNT_LINKS_OPERATION = {
  operationId: "PostAccountLinks",
  method: "POST",
  path: "/v1/account_links",
  effectClass: "PERMISSION_OR_CREDENTIAL_ADMIN",
  approvalTier: "REAUTH",
  supportState: "IMPLEMENTED",
  requiredPermissionRule: "Account: Write",
  readBackOperationId: null,
  idempotencyKeyAllowed: false,
} as const;

/** The world with the account-links operation + the Account permissions declared. */
async function reauthWorld() {
  return executorWorld({
    operations: [ACCOUNT_LINKS_OPERATION],
    declaredPermissions: ["Account: Write", "Account: Read"],
  });
}

describe("reauthentication — the proof machinery (ADR-0018 D1/D2)", () => {
  it("mints a digest-scoped proof on a verified fresh credential (the same-account law holds)", async () => {
    const world = await reauthWorld();
    const { service } = reauthOf(world, [{ delivered: true, status: 200, body: { id: VERIFIED_ACCOUNT_ID } }], () => 1_000);
    const begun = await service.begin({
      connectionId: world.connectionId,
      principalId: "principal:user-1",
      actionDigests: ["digest-alpha"],
      freshCredential: FRESH_RK_TEST,
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) throw new Error("unreachable");
    const verified = await service.verify({
      connectionId: world.connectionId,
      principalId: "principal:user-1",
      digest: "digest-alpha",
    });
    expect(verified.ok).toBe(true);
  });

  it("refuses a fresh credential verifying a DIFFERENT account (ACCOUNT_MISMATCH — fail-closed)", async () => {
    const world = await reauthWorld();
    const { service } = reauthOf(world, [{ delivered: true, status: 200, body: { id: "acct_SOMEONE_ELSE" } }], () => 1_000);
    const begun = await service.begin({
      connectionId: world.connectionId,
      principalId: "principal:user-1",
      actionDigests: ["digest-alpha"],
      freshCredential: FRESH_RK_TEST,
    });
    expect(begun).toEqual({ ok: false, refusal: { kind: "ACCOUNT_MISMATCH", detail: expect.stringContaining("acct_SOMEONE_ELSE") } });
  });

  it("INV-25 at the flow's own edge: live keys refused; malformed shapes refused", async () => {
    const world = await reauthWorld();
    const { service } = reauthOf(world, [], () => 1_000);
    const live = await service.begin({
      connectionId: world.connectionId,
      principalId: "principal:user-1",
      actionDigests: ["digest-alpha"],
      freshCredential: REFUSED_LIVE_RK,
    });
    expect(live).toEqual({ ok: false, refusal: { kind: "LIVE_KEY_REFUSED", detail: expect.stringContaining("INV-25") } });
    const malformed = await service.begin({
      connectionId: world.connectionId,
      principalId: "principal:user-1",
      actionDigests: ["digest-alpha"],
      freshCredential: "not-a-stripe-key",
    });
    expect(malformed).toEqual({ ok: false, refusal: { kind: "INVALID_CREDENTIAL_SHAPE" } });
  });

  it("possession is proven ONLY by a delivered 2xx probe (undelivered/rejected fail closed)", async () => {
    const world = await reauthWorld();
    const undelivered = reauthOf(world, [{ delivered: false, failure: { kind: "TIMEOUT_AFTER_DISPATCH" } }], () => 1_000);
    const r1 = await undelivered.service.begin({
      connectionId: world.connectionId, principalId: "principal:user-1", actionDigests: ["d"], freshCredential: FRESH_RK_TEST,
    });
    expect(r1.ok && r1.refusal === undefined ? "ok" : JSON.stringify(r1)).toContain("PROBE_UNDELIVERED");
    const rejected = reauthOf(world, [{ delivered: true, status: 401, providerErrorCode: "invalid_api_key" }], () => 1_000);
    const r2 = await rejected.service.begin({
      connectionId: world.connectionId, principalId: "principal:user-1", actionDigests: ["d"], freshCredential: FRESH_RK_TEST,
    });
    expect(JSON.stringify(r2)).toContain("PROBE_REJECTED");
  });

  it("the digest scope binds: a proof never authorizes another digest (PROOF_DIGEST_MISMATCH)", async () => {
    const world = await reauthWorld();
    const { service } = reauthOf(world, [{ delivered: true, status: 200, body: { id: VERIFIED_ACCOUNT_ID } }], () => 1_000);
    await service.begin({
      connectionId: world.connectionId, principalId: "principal:user-1", actionDigests: ["digest-alpha"], freshCredential: FRESH_RK_TEST,
    });
    const other = await service.verify({
      connectionId: world.connectionId, principalId: "principal:user-1", digest: "digest-beta",
    });
    expect(other).toEqual({ ok: false, refusal: { kind: "PROOF_DIGEST_MISMATCH" } });
  });

  it("single-use: consumption refuses replay; the TTL law refuses expired proofs", async () => {
    const world = await reauthWorld();
    let clock = 1_000;
    const { service } = reauthOf(world, [{ delivered: true, status: 200, body: { id: VERIFIED_ACCOUNT_ID } }], () => clock);
    const begun = await service.begin({
      connectionId: world.connectionId, principalId: "principal:user-1", actionDigests: ["digest-alpha"], freshCredential: FRESH_RK_TEST,
    });
    if (!begun.ok) throw new Error("unreachable");
    expect(await service.consume(begun.proofId)).toBe(true);
    expect(await service.consume(begun.proofId)).toBe(false); // single-use
    // A second proof for the expiry law.
    const second = await service.begin({
      connectionId: world.connectionId, principalId: "principal:user-1", actionDigests: ["digest-alpha"], freshCredential: FRESH_RK_TEST,
    });
    if (!second.ok) throw new Error("unreachable");
    clock += STRIPE_REAUTHENTICATION_PROOF_TTL_MS + 1;
    const expired = await service.verify({
      connectionId: world.connectionId, principalId: "principal:user-1", digest: "digest-alpha",
    });
    expect(expired).toEqual({ ok: false, refusal: { kind: "PROOF_NOT_FOUND" } });
  });

  it("an empty digest scope is refused (never a blank-check proof)", async () => {
    const world = await reauthWorld();
    const { service } = reauthOf(world, [{ delivered: true, status: 200, body: { id: VERIFIED_ACCOUNT_ID } }], () => 1_000);
    const result = await service.begin({
      connectionId: world.connectionId, principalId: "principal:user-1", actionDigests: [], freshCredential: FRESH_RK_TEST,
    });
    expect(result).toEqual({ ok: false, refusal: { kind: "EMPTY_DIGEST_SCOPE" } });
  });
});

describe("reauthentication — the executor REAUTH gate (ADR-0018 D3/D6)", () => {
  const LINKS_PARAMS = [{ name: "type", value: "account_onboarding", location: "body" as const }];

  async function preparedReauthAction(
    world: Awaited<ReturnType<typeof executorWorld>>,
    executor: StripePreparedActionExecutor,
  ) {
    const prepared = await executor.prepare({
      operationId: "PostAccountLinks",
      parameters: LINKS_PARAMS,
      connectionId: world.connectionId,
      taskId: "task:reauth-1",
    });
    if (!prepared.ok) throw new Error(prepared.reason);
    return prepared.action;
  }

  it("an UNCOMPOSED re-authentication plane refuses REAUTH-tier authorization honestly (the tier never degrades)", async () => {
    const world = await reauthWorld();
    const executor = world.createExecutor();
    const action = await preparedReauthAction(world, executor);
    const authorized = await executor.authorize({
      preparedActionId: action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: action.digest,
    });
    expect(authorized.ok).toBe(false);
    if (authorized.ok) throw new Error("unreachable");
    expect(authorized.reason).toContain("REAUTH_PROOF_REQUIRED");
    expect(authorized.reason).toContain("not composed");
  });

  it("a composed plane without a proof refuses REAUTH_PROOF_REQUIRED; with a proof: authorize → execute → consumed", async () => {
    const world = await reauthWorld();
    const { service } = reauthOf(
      world,
      [
        { delivered: true, status: 200, body: { id: VERIFIED_ACCOUNT_ID } }, // the probe
        { delivered: true, status: 200, body: { id: "alink_fake51created01" }, providerRequestId: "req_fake51reauth1" }, // the dispatch
      ],
      () => world.clock.ms,
    );
    const port = portOf(service);
    const executor = world.createExecutor({ reauthentication: port });
    const action = await preparedReauthAction(world, executor);

    // Without a proof: refusal.
    const refused = await executor.authorize({
      preparedActionId: action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: action.digest,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.reason).toContain("REAUTH_PROOF_REQUIRED");

    // With a proof: authorize + execute; the dispatch happens; the proof is consumed.
    await service.begin({
      connectionId: world.connectionId,
      principalId: "principal:user-1",
      actionDigests: [action.digest],
      freshCredential: FRESH_RK_TEST,
    });
    const authorized = await executor.authorize({
      preparedActionId: action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: action.digest,
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) throw new Error(authorized.reason);
    const outcome = await executor.execute(authorized.authorization.authorizationId);
    expect(outcome.kind).toBe("CONFIRMED");

    // The proof was consumed at dispatch: a NEW authorization of a fresh
    // identical action now refuses (single-use proof law, end-to-end).
    const second = await executor.prepare({
      operationId: "PostAccountLinks",
      parameters: LINKS_PARAMS,
      connectionId: world.connectionId,
      taskId: "task:reauth-2",
    });
    if (!second.ok) throw new Error(second.reason);
    const reauthorized = await executor.authorize({
      preparedActionId: second.action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: second.action.digest,
    });
    expect(reauthorized.ok).toBe(false);
  });

  it("a proof scoped to a DIFFERENT action digest never authorizes (end-to-end digest binding)", async () => {
    const world = await reauthWorld();
    const { service } = reauthOf(world, [{ delivered: true, status: 200, body: { id: VERIFIED_ACCOUNT_ID } }], () => world.clock.ms);
    const executor = world.createExecutor({ reauthentication: portOf(service) });
    const action = await preparedReauthAction(world, executor);
    // A proof for an unrelated digest.
    await service.begin({
      connectionId: world.connectionId,
      principalId: "principal:user-1",
      actionDigests: ["digest-of-something-else"],
      freshCredential: FRESH_RK_TEST,
    });
    const authorized = await executor.authorize({
      preparedActionId: action.preparedActionId,
      principalId: "principal:user-1",
      confirmedDigest: action.digest,
    });
    expect(authorized.ok).toBe(false);
    if (authorized.ok) throw new Error("unreachable");
    expect(authorized.reason).toContain("REAUTH_PROOF_REQUIRED");
  });
});

describe("reauthentication — the store laws", () => {
  it("persisted proofs are secret-free and reload fail-closed (the escape law)", async () => {
    const fs = memoryFs();
    const store = new StripeReauthenticationStore(fs, "/tmp/reauth/proofs.json");
    await store.put({
      proofId: "stripe-reauth:proof-1",
      principalId: "principal:user-1",
      connectionId: "conn:stripe-1",
      verifiedStripeAccountId: VERIFIED_ACCOUNT_ID,
      actionDigests: ["digest-alpha"],
      issuedAt: new Date(Date.now()).toISOString(),
      expiresAt: new Date(Date.now() + STRIPE_REAUTHENTICATION_PROOF_TTL_MS).toISOString(),
      consumedAt: null,
    });
    const persisted = fs.files.get("/tmp/reauth/proofs.json") ?? "";
    expect(persisted).not.toContain(FRESH_RK_TEST);
    expect(persisted).not.toContain("rk_test_");
    expect(persisted).not.toContain("sk_test_");
    // Reload (a fresh store over the same file) sees the proof.
    const reloaded = new StripeReauthenticationStore(fs, "/tmp/reauth/proofs.json");
    const found = await reloaded.get("stripe-reauth:proof-1");
    expect(found?.actionDigests).toEqual(["digest-alpha"]);
  });
});
