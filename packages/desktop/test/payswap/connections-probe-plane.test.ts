/**
 * PaySwap Desktop (P21-A, ADR-0014 D5) — the connection-ACTIVATION plane
 * battery: the three new channel members (the Flutterwave/Paystack
 * key-entry verbs + the host-side REAL verification-probe runner).
 *
 * Machine-checks the D5 laws against the REAL authority + the REAL
 * host-side probe machinery over an INJECTED fetch binding (the canonical
 * transport discipline: the battery never touches the network; the
 * composition edge binds globalThis.fetch):
 *
 * - THE SEAL LAW: the two new key-entry verbs follow the Stripe member's
 *   ONE material-carrying path — test-prefix shape fail-closed (INV-25:
 *   a LIVE key is refused, never sealed), PENDING_VERIFICATION after the
 *   seal, and the receipt never echoes key material.
 * - THE CALLER-TRUST FIX: connectionRunVerificationProbe(providerId)
 *   executes the REAL probe host-side INSIDE withSealedCredential over
 *   the REAL HTTPS transport code, records the outcome through the
 *   authority's OWN recordVerificationOutcome (the ONLY ACTIVE path
 *   stays probe-CONFIRMED — UNKNOWN/FAILED keep PENDING_VERIFICATION,
 *   never ACTIVE), and returns a secret-free outcome carrying the honest
 *   per-provider scope note (a Flutterwave probe proves read-only
 *   balance access — never send capability; a Stripe probe proves
 *   balance + account read).
 * - THE EVIDENCE LEDGER: each probe run lands a structured, secret-free
 *   evidence record (provider references, freshness stamp, monotonic
 *   observation version) the capability bridge reads.
 * - FAIL-CLOSED: an unknown provider is refused typed; a provider with
 *   no sealed credential is refused typed; the members fail closed with
 *   the typed ConnectionPlaneNotConfiguredError when the plane is absent.
 *
 * The world/fixtures live in ./connections-probe-plane-fixtures.ts (the
 * ≤400-line file-law split).
 */

import { describe, expect, it } from "vitest";

import {
  PAYSWAP_PROBE_PROVIDER_IDS,
  createPaySwapDesktopService,
  type ConnectionProbeOutcomeDto,
  type ProbeEvidenceStore,
} from "../../src/host/payswap/index.js";
import { openProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import type { WorkspaceStoreFileSystem } from "../../src/host/payswap/product/workspace-store-persistence.js";
import {
  FAKE_FLW_KEY,
  FAKE_FLW_LIVE_KEY,
  FAKE_PAYSTACK_KEY,
  FAKE_PAYSTACK_LIVE_KEY,
  FAKE_STRIPE_FULL_KEY,
  FLW_BALANCES_OK,
  FLW_BALANCES_URL,
  FLW_SEED,
  PAYSTACK_SEED,
  PAYSTACK_TRANSACTIONS_URL,
  STRIPE_ACCOUNT_URL,
  STRIPE_BALANCE_URL,
  STRIPE_SEED,
  fakeWorld,
  probeWorld,
} from "./connections-probe-plane-fixtures.js";

describe("the D5 member surface (ADR-0014 D5 — the census + the naming law)", () => {
  it("the three new members exist on the service and pass the no-authority-verb naming law", async () => {
    const world = fakeWorld();
    const { service } = await probeWorld(world);
    for (const member of [
      "connectionSubmitFlutterwaveSecretKey",
      "connectionSubmitPaystackSecretKey",
      "connectionRunVerificationProbe",
    ]) {
      expect(typeof (service as unknown as Record<string, unknown>)[member]).toBe("function");
      expect(member).not.toMatch(/^(execute|retry|cancel|confirm|settle|payout|approve)/);
    }
    expect([...PAYSWAP_PROBE_PROVIDER_IDS]).toEqual(["stripe", "flutterwave", "paystack"]);
  });

  it("the members fail closed with the typed error when the connection plane is absent", async () => {
    const service = createPaySwapDesktopService({ scope: { kind: "local" }, log: () => {} });
    await expect(service.connectionRunVerificationProbe("stripe")).rejects.toThrow(
      /connection plane is not configured/i,
    );
  });
});

describe("the Flutterwave/Paystack key-entry verbs (the ONE material-carrying path)", () => {
  it("seals a Flutterwave test key → PENDING_VERIFICATION; the receipt never echoes key material", async () => {
    const world = fakeWorld();
    const { service } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(FLW_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    const receipt = await service.connectionSubmitFlutterwaveSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_FLW_KEY,
    });
    expect(receipt.nextState).toBe("PENDING_VERIFICATION");
    expect(receipt.sealedSecretCount).toBe(1);
    expect(JSON.stringify(receipt)).not.toContain(FAKE_FLW_KEY);
    const statuses = await service.connectionStatuses();
    expect(statuses[0]!.state).toBe("PENDING_VERIFICATION");
  });

  it("seals a Paystack test key → PENDING_VERIFICATION (the same seal law)", async () => {
    const world = fakeWorld();
    const { service } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(PAYSTACK_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    const receipt = await service.connectionSubmitPaystackSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_PAYSTACK_KEY,
    });
    expect(receipt.nextState).toBe("PENDING_VERIFICATION");
    expect(JSON.stringify(receipt)).not.toContain(FAKE_PAYSTACK_KEY);
  });

  it("INV-25 through the new members: a LIVE key is refused, never sealed", async () => {
    const world = fakeWorld();
    const { service } = await probeWorld(world);
    const flw = await service.connectionSeedSetup(FLW_SEED);
    if (flw.kind !== "CREATED") throw new Error("seed failed");
    await expect(
      service.connectionSubmitFlutterwaveSecretKey({
        connectionId: flw.connectionId,
        secretKey: FAKE_FLW_LIVE_KEY,
      }),
    ).rejects.toThrow(/SANDBOX-only/);
    const paystack = await service.connectionSeedSetup(PAYSTACK_SEED);
    if (paystack.kind !== "CREATED") throw new Error("seed failed");
    await expect(
      service.connectionSubmitPaystackSecretKey({
        connectionId: paystack.connectionId,
        secretKey: FAKE_PAYSTACK_LIVE_KEY,
      }),
    ).rejects.toThrow(/SANDBOX-only/);
    // Nothing was sealed: both connections stay PROPOSED.
    const statuses = await service.connectionStatuses();
    for (const status of statuses) {
      expect(status.state).toBe("PROPOSED");
      expect(status.credentialHandleRef).toBe("");
    }
  });
});

describe("connectionRunVerificationProbe — the caller-trust fix (the REAL probe host-side)", () => {
  it("a CONFIRMED Flutterwave probe carries the connection to ACTIVE through the authority's own recorder, with the honest read-only note", async () => {
    const world = fakeWorld();
    world.fetchScript.set(FLW_BALANCES_URL, FLW_BALANCES_OK);
    const { service, evidenceStore } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(FLW_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitFlutterwaveSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_FLW_KEY,
    });

    const outcome = await service.connectionRunVerificationProbe("flutterwave");
    expect(outcome.providerId).toBe("flutterwave");
    expect(outcome.probedOperation).toBe("flutterwave.balances.read");
    expect(outcome.evidenceTier).toBe("PROVIDER_OBSERVATION");
    expect(outcome.results).toHaveLength(1);
    const result = outcome.results[0]!;
    expect(result.connectionId).toBe(seeded.connectionId);
    expect(result.outcome).toBe("CONFIRMED");
    expect(result.providerReferences).toEqual(["NGN", "KES"]);
    expect(result.state).toBe("ACTIVE");
    // The honest note: a Flutterwave probe proves READ-ONLY balance
    // access — never send capability (F3).
    expect(outcome.note).toContain("read-only");
    expect(outcome.note).toContain("never");
    // Secret-free: no key material anywhere on the outcome.
    expect(JSON.stringify(outcome)).not.toContain(FAKE_FLW_KEY);
    // The ONLY ACTIVE path: the authority's own transition history.
    const statuses = await service.connectionStatuses();
    expect(statuses[0]!.state).toBe("ACTIVE");
    expect(statuses[0]!.transitionHistory.at(-1)!.cause).toBe("PROBE_CONFIRMED");
    // The evidence ledger holds the structured, secret-free facts.
    const evidence = await evidenceStore.latestProbeEvidence();
    const flwEvidence = evidence.find((record) => record.connectionId === seeded.connectionId);
    expect(flwEvidence?.outcome).toBe("CONFIRMED");
    expect(flwEvidence?.providerReferences).toEqual(["NGN", "KES"]);
    expect(flwEvidence?.probedOperation).toBe("flutterwave.balances.read");
    expect(flwEvidence?.evidenceTier).toBe("PROVIDER_OBSERVATION");
    expect(typeof flwEvidence?.observedAt).toBe("string");
    expect(flwEvidence?.observationVersion).toBe(1);
    expect(JSON.stringify(evidence)).not.toContain(FAKE_FLW_KEY);
  });

  it("an UNKNOWN probe keeps PENDING_VERIFICATION (INV-04 — reconcile before any conclusion)", async () => {
    const world = fakeWorld();
    // The provider answered 2xx without the canonical balances shape:
    // uninterpretable evidence is UNKNOWN, never a fabricated CONFIRMED.
    world.fetchScript.set(FLW_BALANCES_URL, {
      status: 200,
      body: JSON.stringify({ status: "success", data: "not-an-array" }),
    });
    const { service } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(FLW_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitFlutterwaveSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_FLW_KEY,
    });
    const outcome = await service.connectionRunVerificationProbe("flutterwave");
    expect(outcome.results[0]!.outcome).toBe("UNKNOWN");
    expect(outcome.results[0]!.state).toBe("PENDING_VERIFICATION");
    const statuses = await service.connectionStatuses();
    expect(statuses[0]!.state).toBe("PENDING_VERIFICATION");
    expect(statuses[0]!.transitionHistory.at(-1)!.cause).toBe("PROBE_UNKNOWN");
  });

  it("a FAILED probe (the provider rejected the key) keeps PENDING_VERIFICATION — a failed probe NEVER activates", async () => {
    const world = fakeWorld();
    world.fetchScript.set(FLW_BALANCES_URL, {
      status: 401,
      body: JSON.stringify({ status: "error", message: "Invalid secret key" }),
    });
    const { service } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(FLW_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitFlutterwaveSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_FLW_KEY,
    });
    const outcome = await service.connectionRunVerificationProbe("flutterwave");
    expect(outcome.results[0]!.outcome).toBe("FAILED");
    expect(outcome.results[0]!.state).toBe("PENDING_VERIFICATION");
    const statuses = await service.connectionStatuses();
    expect(statuses[0]!.state).toBe("PENDING_VERIFICATION");
    expect(statuses[0]!.transitionHistory.at(-1)!.cause).toBe("PROBE_FAILED");
  });

  it("a CONFIRMED Stripe probe proves balance + account read (the account reference is the evidence)", async () => {
    const world = fakeWorld();
    world.fetchScript.set(STRIPE_BALANCE_URL, {
      status: 200,
      body: JSON.stringify({
        object: "balance",
        available: [{ amount: 5000, currency: "usd" }],
        pending: [],
      }),
    });
    world.fetchScript.set(STRIPE_ACCOUNT_URL, {
      status: 200,
      body: JSON.stringify({ id: "acct_FAKE0001", livemode: false }),
    });
    const { service, evidenceStore } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(STRIPE_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_STRIPE_FULL_KEY,
    });
    const outcome = await service.connectionRunVerificationProbe("stripe");
    expect(outcome.probedOperation).toBe("stripe.balance.read + stripe.account.read");
    expect(outcome.results[0]!.outcome).toBe("CONFIRMED");
    expect(outcome.results[0]!.providerReferences).toContain("acct_FAKE0001");
    expect(outcome.results[0]!.state).toBe("ACTIVE");
    expect(JSON.stringify(outcome)).not.toContain(FAKE_STRIPE_FULL_KEY);
    const evidence = await evidenceStore.latestProbeEvidence();
    const stripeEvidence = evidence.find((record) => record.connectionId === seeded.connectionId);
    expect(stripeEvidence?.accountRef).toBe("acct_FAKE0001");
    expect(stripeEvidence?.providerLiveMode).toBe(false);
    // The credential CLASS is structural evidence (not secret material):
    // a FULL test key derives the SANDBOX execution grant (the kernel's
    // own grant law checks it inside the seal again at dispatch).
    expect(stripeEvidence?.keyClass).toBe("FULL_TEST");
  });

  it("a re-probe bumps the observation version monotonically (freshness-stamped evidence)", async () => {
    const world = fakeWorld();
    world.fetchScript.set(FLW_BALANCES_URL, FLW_BALANCES_OK);
    const { service, evidenceStore } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(FLW_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitFlutterwaveSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_FLW_KEY,
    });
    await service.connectionRunVerificationProbe("flutterwave");
    await service.connectionRunVerificationProbe("flutterwave");
    const evidence = await evidenceStore.latestProbeEvidence();
    const flwEvidence = evidence.find((record) => record.connectionId === seeded.connectionId);
    expect(flwEvidence?.observationVersion).toBe(2);
  });

  it("a Paystack CONFIRMED probe reads the transactions evidence (the read-only slice)", async () => {
    const world = fakeWorld();
    world.fetchScript.set(PAYSTACK_TRANSACTIONS_URL, {
      status: 200,
      body: JSON.stringify({
        status: true,
        data: [{ id: 30483271, status: "success" }, { id: 30483272, status: "abandoned" }],
      }),
    });
    const { service } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(PAYSTACK_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitPaystackSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_PAYSTACK_KEY,
    });
    const outcome = await service.connectionRunVerificationProbe("paystack");
    expect(outcome.probedOperation).toBe("paystack.transactions.read");
    expect(outcome.results[0]!.outcome).toBe("CONFIRMED");
    expect(outcome.results[0]!.providerReferences).toEqual(["txn_30483271", "txn_30483272"]);
    expect(outcome.results[0]!.state).toBe("ACTIVE");
  });

  it("fail-closed addressing: an unknown provider is refused typed; no sealed credential is refused typed", async () => {
    const world = fakeWorld();
    const { service } = await probeWorld(world);
    await expect(service.connectionRunVerificationProbe("paypal")).rejects.toThrow(
      /no verification probe exists for provider 'paypal'/i,
    );
    // A seeded-but-unsealed connection: the probe requires the seal.
    const seeded = await service.connectionSeedSetup(FLW_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await expect(service.connectionRunVerificationProbe("flutterwave")).rejects.toThrow(
      /sealed credential/i,
    );
  });

  it("the probe outcome DTO carries people-language per-connection summaries (no envelope internals)", async () => {
    const world = fakeWorld();
    world.fetchScript.set(FLW_BALANCES_URL, FLW_BALANCES_OK);
    const { service } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup(FLW_SEED);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitFlutterwaveSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_FLW_KEY,
    });
    const outcome: ConnectionProbeOutcomeDto = await service.connectionRunVerificationProbe("flutterwave");
    const result = outcome.results[0]!;
    expect(result.summary.length).toBeGreaterThan(10);
    expect(result.summary).not.toMatch(/idempotency|correlation|command/i);
    // The DTO keys stay the pinned set (no secret-bearing fields; the
    // failure code appears only on a FAILED row).
    expect(Object.keys(result).sort()).toEqual(
      ["connectionId", "outcome", "providerReferences", "state", "summary"].sort(),
    );
    expect(Object.keys(outcome).sort()).toEqual(
      ["evidenceTier", "note", "providerId", "probedOperation", "results"].sort(),
    );
  });
});

describe("the evidence ledger (the bridge's input)", () => {
  it("an in-memory probe evidence store counts as a ProbeEvidenceStore; the file store persists across reopen", async () => {
    const files = new Map<string, string>();
    const fileSystem: WorkspaceStoreFileSystem = {
      readFile: async (path) => {
        const data = files.get(path);
        if (data === undefined) throw new Error("ENOENT");
        return data;
      },
      writeFile: async (path, data) => {
        files.set(path, data);
      },
      mkdir: async () => {},
    };
    const first = await openProbeEvidenceStore({ fileSystem, directory: "/tmp/probe-ev" });
    const store: ProbeEvidenceStore = first;
    await store.recordProbeEvidence({
      connectionId: "conn:1",
      providerId: "flutterwave",
      probedOperation: "flutterwave.balances.read",
      outcome: "CONFIRMED",
      providerReferences: ["NGN"],
      accountRef: null,
      providerLiveMode: null,
      keyClass: "READ_ONLY_TEST",
      transportId: "flutterwave-https",
      executionMode: "SANDBOX",
      observedAt: "2026-10-27T12:00:00Z",
      evidenceTier: "PROVIDER_OBSERVATION",
      balanceCurrencies: [],
    });
    const second = await openProbeEvidenceStore({ fileSystem, directory: "/tmp/probe-ev" });
    const evidence = await second.latestProbeEvidence();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.observationVersion).toBe(1);
    void store;
  });
});
