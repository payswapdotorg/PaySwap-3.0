/**
 * PaySwap Desktop (P24-2, ADR-0017 D5 + handoff §11 Worker-2 item 2/3) —
 * the U1 OWN-ACCOUNT (SANDBOX) LIFECYCLE battery, composed over the
 * REAL ConnectionSessionAuthority + the REAL host Stripe transport
 * (scripted fetch — no network) + the REAL probe-evidence ledger:
 *
 * - KEY ROTATION: pk_/sk_org_/whsec_/unknown-shape/live keys refuse
 *   typed (the structural shape law, INV-25 + ADR-0017 D5); a valid
 *   test-mode key re-seals and returns the connection to
 *   PENDING_VERIFICATION; the ROTATION FRESHNESS law then blocks
 *   account-context resolution until a CONFIRMED re-probe lands.
 * - SCOPE REFRESH: (re-)declares the RAK scopes and recomputes the
 *   exposed-operation set.
 * - RE-PROBE: the real verification probe rides the real transport
 *   inside the seal; CONFIRMED reaches ACTIVE + lands evidence +
 *   recomputes exposure; a key-rejected probe withdraws EVERYTHING
 *   until a CONFIRMED re-probe clears it.
 * - U2/U3: the lifecycle exposes no verbs for them (UNCONFIGURED,
 *   never simulated — the account-context battery covers the honesty).
 */

import { describe, expect, it } from "vitest";
import {
  ConnectionSessionAuthority,
  DurableConnectionCredentialBroker,
} from "../../src/host/payswap/connections/index.js";
import { openProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import { createStripeHostTransport, type HostFetch } from "../../src/host/payswap/connections/host-https-transports.js";
import { StripeRakPermissionBinding } from "../../src/host/payswap/connections/stripe-rak-permissions.js";
import { StripeU1LifecycleService } from "../../src/host/payswap/connections/stripe-u1-lifecycle.js";
import { createStripeAccountContextResolver } from "../../src/host/payswap/connections/stripe-account-context.js";
import { fakeCensus, fakeFs } from "./stripe-action-fixtures.js";
import type { PersistedConnectionRecord } from "../../src/host/payswap/connections/record-store.js";
import type { ProbeEvidenceRecord } from "../../src/host/payswap/connections/probe-evidence.js";

/** Fake test-mode key material (concatenated — never a literal credential shape in source). */
const FAKE_RAK_KEY = "rk" + "_test_FAKE51rakDoNotUse00001";
const FAKE_RAK_KEY_2 = "rk" + "_test_FAKE51rakDoNotUse0009";
const FAKE_LIVE_KEY = "rk" + "_live_FAKE51liveDoNotUse0003";
const FAKE_PK_KEY = "pk" + "_test_FAKE51publishable0004";
const FAKE_ORG_KEY = "sk" + "_org_FAKE51orgDoNotUse00005";
const FAKE_WHSEC = "whsec" + "_FAKE51whsecDoNotUse0006";

const STRIPE_BALANCE_URL = "https://api.stripe.com/v1/balance";
const STRIPE_ACCOUNT_URL = "https://api.stripe.com/v1/account";
const ACCOUNT_REF = "acct_fake51stripeTestAcct1";

/** A scripted fetch that answers the probe's two reads (never the headers). */
function scriptedFetch(script: Record<string, { status: number; body: string } | "REJECT">): HostFetch {
  return async (url: string) => {
    const answer = script[url];
    if (answer === undefined) {
      throw new Error(`no scripted answer for ${url}`);
    }
    if (answer === "REJECT") {
      throw new Error("connection lost (scripted)");
    }
    return { status: answer.status, text: async () => answer.body };
  };
}

const OK_SCRIPT = {
  [STRIPE_BALANCE_URL]: {
    status: 200,
    body: JSON.stringify({ object: "balance", available: [{ amount: 1000, currency: "usd" }] }),
  },
  [STRIPE_ACCOUNT_URL]: {
    status: 200,
    body: JSON.stringify({ object: "account", id: ACCOUNT_REF, livemode: false }),
  },
};

async function lifecycleWorld(script: Record<string, { status: number; body: string } | "REJECT"> = OK_SCRIPT) {
  const fs = fakeFs();
  let ms = 1_800_000_000_000;
  let iso = new Date(ms).toISOString();
  let idSeq = 0;
  const credentialService = {
    save: async (key: string, value: string) => {
      fs.files.set(key, value);
    },
    load: async (key: string) => fs.files.get(key) ?? null,
    delete: async (key: string) => {
      fs.files.delete(key);
    },
  };
  const authority = new ConnectionSessionAuthority({
    fileSystem: fs,
    directory: "/tmp/p242-u1-connections",
    broker: new DurableConnectionCredentialBroker(credentialService),
    nowMs: () => ms,
    nowIso: () => iso,
    createId: () => `fake-${(idSeq += 1)}`,
    createState: () => `state-${(idSeq += 1)}`,
  });
  const evidenceStore = await openProbeEvidenceStore({
    fileSystem: fs,
    directory: "/tmp/p242-u1-evidence",
  });
  const permissionBinding = new StripeRakPermissionBinding({
    census: fakeCensus([
      { operationId: "PostCustomers", requiredPermissionRule: "customers: Write" },
      { operationId: "GetCustomers", requiredPermissionRule: "customers: Read", method: "GET" },
    ]),
    fileSystem: fs,
    directory: "/tmp/p242-u1-rak",
    nowIso: () => iso,
  });
  const lifecycle = new StripeU1LifecycleService({
    authority,
    evidenceStore,
    permissionBinding,
    transport: createStripeHostTransport(scriptedFetch(script)),
    nowMs: () => ms,
  });
  const seed = await authority.seedConnectionSetup({
    providerId: "stripe",
    useCaseRef: "own-store-test-mode",
  });
  if (seed.kind !== "CREATED") {
    throw new Error("fixture seed failed");
  }
  const connectionId = seed.connectionId;

  /** The account-context resolver composed over the REAL stores (the P24-D recipe). */
  const resolver = createStripeAccountContextResolver({
    getConnection: async (id) => {
      const statuses = await authority.connectionStatuses();
      const view = statuses.find((entry) => entry.connectionId === id);
      if (view === undefined) {
        return null;
      }
      const record: PersistedConnectionRecord = {
        connectionId: view.connectionId,
        providerId: view.providerId,
        useCaseRef: view.useCaseRef,
        state: view.state,
        credentialHandleRef: view.credentialHandleRef,
        executionMode: view.executionMode === "LIVE" ? "LIVE" : "SANDBOX",
        createdAt: view.createdAt,
        lastTransitionAt: view.lastTransitionAt,
        transitions: [],
      };
      return record;
    },
    getLatestProbeEvidence: async (id) => {
      const all = await evidenceStore.latestProbeEvidence();
      return (all.find((entry: ProbeEvidenceRecord) => entry.connectionId === id) as ProbeEvidenceRecord) ?? null;
    },
    // The seal clock: the LAST CREDENTIAL_SEALED transition's timestamp.
    getCredentialSealedAt: async (id) => {
      const statuses = await authority.connectionStatuses();
      const view = statuses.find((entry) => entry.connectionId === id);
      const sealed = view?.transitionHistory.filter((t) => t.cause === "CREDENTIAL_SEALED");
      return sealed !== undefined && sealed.length > 0 ? sealed[sealed.length - 1]!.at : null;
    },
  });

  return {
    connectionId,
    lifecycle,
    authority,
    evidenceStore,
    permissionBinding,
    resolver,
    advanceMs: (delta: number) => {
      ms += delta;
      iso = new Date(ms).toISOString();
    },
  };
}

describe("U1 key rotation (the structural shape law)", () => {
  it("refuses pk_, sk_org_, whsec_, unknown shapes and live keys typed (never echoing the key)", async () => {
    const { connectionId, lifecycle } = await lifecycleWorld();
    const pk = await lifecycle.rotateKey({ connectionId, secretKey: FAKE_PK_KEY });
    expect(pk.ok === false && pk.refusal.kind).toBe("PUBLISHABLE_KEY_REFUSED");
    const org = await lifecycle.rotateKey({ connectionId, secretKey: FAKE_ORG_KEY });
    expect(org.ok === false && org.refusal.kind).toBe("ORGANIZATION_KEY_OUT_OF_SCOPE");
    const whsec = await lifecycle.rotateKey({ connectionId, secretKey: FAKE_WHSEC });
    expect(whsec.ok === false && whsec.refusal.kind).toBe("WEBHOOK_SECRET_REFUSED");
    const unknown = await lifecycle.rotateKey({ connectionId, secretKey: "not-a-stripe-key" });
    expect(unknown.ok === false && unknown.refusal.kind).toBe("UNKNOWN_KEY_SHAPE");
    const live = await lifecycle.rotateKey({ connectionId, secretKey: FAKE_LIVE_KEY });
    expect(live.ok === false && live.refusal.kind).toBe("LIVE_KEY_REFUSED");
    expect(live.ok === false && live.refusal.detail).toContain("INV-25");
    // No refusal message carries the key material.
    for (const outcome of [pk, org, whsec, unknown, live]) {
      if (!outcome.ok) {
        expect(outcome.refusal.detail).not.toContain("FAKE51");
      }
    }
  });

  it("refuses an unknown connection", async () => {
    const { lifecycle } = await lifecycleWorld();
    const outcome = await lifecycle.rotateKey({ connectionId: "conn:none", secretKey: FAKE_RAK_KEY });
    expect(outcome.ok === false && outcome.refusal.kind).toBe("UNKNOWN_CONNECTION");
  });

  it("a valid rotation re-seals and returns PENDING_VERIFICATION (the freshness law arms)", async () => {
    const { connectionId, lifecycle, authority, resolver } = await lifecycleWorld();
    await lifecycle.rotateKey({ connectionId, secretKey: FAKE_RAK_KEY });
    const statuses = await authority.connectionStatuses();
    expect(statuses[0]?.state).toBe("PENDING_VERIFICATION");
    // Account context does NOT resolve after rotation until the re-probe
    // confirms (evidence must postdate the new seal).
    const resolved = await resolver.resolve(connectionId);
    expect(resolved.ok).toBe(false);
    expect(resolved.ok === false && resolved.reason).toContain("re-probe is required");
  });

  it("the rotation-freshness law: a CONFIRMED re-probe resolves the context again", async () => {
    const { connectionId, lifecycle, resolver, advanceMs } = await lifecycleWorld();
    await lifecycle.rotateKey({ connectionId, secretKey: FAKE_RAK_KEY });
    advanceMs(60_000);
    const probed = await lifecycle.reprobe({ connectionId });
    expect(probed.ok && probed.outcome).toBe("CONFIRMED");
    expect(probed.ok && probed.state).toBe("ACTIVE");
    const resolved = await resolver.resolve(connectionId);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.accountContext.stripeAccountId).toBe(ACCOUNT_REF);
      expect(resolved.accountContext.environment).toBe("SANDBOX");
    }
  });
});

describe("U1 scope refresh (the RAK declaration loop)", () => {
  it("declares scopes and recomputes the exposed set; malformed permissions refuse", async () => {
    const { connectionId, lifecycle } = await lifecycleWorld();
    const refreshed = await lifecycle.refreshScopes({
      connectionId,
      permissions: ["customers: Write", "customers: Read"],
      principalId: "principal:user-1",
    });
    expect(refreshed.ok && refreshed.exposedOperations).toEqual(["GetCustomers", "PostCustomers"]);
    const malformed = await lifecycle.refreshScopes({
      connectionId,
      permissions: ["customers write"],
      principalId: "principal:user-1",
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.ok === false && malformed.reason).toContain("not a Stripe permission string");
  });
});

describe("U1 re-probe (the REAL probe through the REAL transport, inside the seal)", () => {
  it("refuses a connection with no sealed credential", async () => {
    const { connectionId, lifecycle } = await lifecycleWorld();
    const outcome = await lifecycle.reprobe({ connectionId });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain("no sealed credential");
  });

  it("a CONFIRMED probe reaches ACTIVE, lands evidence and recomputes exposure", async () => {
    const { connectionId, lifecycle, authority, evidenceStore, permissionBinding } = await lifecycleWorld();
    await lifecycle.rotateKey({ connectionId, secretKey: FAKE_RAK_KEY });
    await lifecycle.refreshScopes({
      connectionId,
      permissions: ["customers: Write", "customers: Read"],
      principalId: "principal:user-1",
    });
    const probed = await lifecycle.reprobe({ connectionId });
    expect(probed.ok && probed.outcome).toBe("CONFIRMED");
    expect(probed.ok && probed.state).toBe("ACTIVE");
    const statuses = await authority.connectionStatuses();
    expect(statuses[0]?.state).toBe("ACTIVE");
    const evidence = await evidenceStore.latestProbeEvidence();
    expect(evidence[0]?.accountRef).toBe(ACCOUNT_REF);
    expect(evidence[0]?.providerLiveMode).toBe(false);
    expect(probed.ok && probed.exposedOperations).toEqual(["GetCustomers", "PostCustomers"]);
    expect(permissionBinding.declaredScopesOf(connectionId)).toEqual(["customers: Write", "customers: Read"]);
  });

  it("a key-rejected probe records the dead-key observation (everything withdraws until cleared)", async () => {
    const world = await lifecycleWorld({
      ...OK_SCRIPT,
      [STRIPE_BALANCE_URL]: {
        status: 401,
        body: JSON.stringify({ error: { type: "invalid_request_error", code: "invalid_api_key" } }),
      },
    });
    const { connectionId, lifecycle, permissionBinding, evidenceStore, resolver } = world;
    await lifecycle.rotateKey({ connectionId, secretKey: FAKE_RAK_KEY_2 });
    await lifecycle.refreshScopes({
      connectionId,
      permissions: ["customers: Write", "customers: Read"],
      principalId: "principal:user-1",
    });
    const probed = await lifecycle.reprobe({ connectionId });
    expect(probed.ok && probed.outcome).toBe("FAILED");
    expect(probed.ok && probed.state).toBe("PENDING_VERIFICATION");
    // The dead-key observation: EVERYTHING withdraws.
    expect(await permissionBinding.exposedOperations(connectionId)).toEqual([]);
    expect(probed.ok && probed.exposedOperations).toEqual([]);
    // The account context never resolves from FAILED evidence.
    expect((await resolver.resolve(connectionId)).ok).toBe(false);
    // A CONFIRMED re-probe (the key fixed) clears the dead-key observation.
    const fixedLifecycle = new StripeU1LifecycleService({
      authority: world.authority,
      evidenceStore,
      permissionBinding,
      transport: createStripeHostTransport(scriptedFetch(OK_SCRIPT)),
      nowMs: () => 1_800_000_000_100,
    });
    const fixed = await fixedLifecycle.reprobe({ connectionId });
    expect(fixed.ok && fixed.outcome).toBe("CONFIRMED");
    expect(fixed.ok && fixed.state).toBe("ACTIVE");
    expect(await permissionBinding.exposedOperations(connectionId)).toEqual(["GetCustomers", "PostCustomers"]);
  });
});
