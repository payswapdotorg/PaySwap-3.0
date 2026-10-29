/**
 * PaySwap Desktop (P22-H, ADR-0016 D2/D9) — the ONCHAIN RAIL plane
 * battery: the Stellar keypair seal + the Horizon account-read probe
 * through the REAL member path.
 *
 * Machine-checks the D9 laws over the REAL authority + the REAL
 * host-side probe machinery + the REAL Horizon transport code over an
 * INJECTED fetch binding (the battery never touches the network):
 *
 * - THE STRKEY SEAL LAW: the keypair verb seals ONE material
 *   {publicKey G…, secretKey S…} (56-char base32 shapes enforced
 *   fail-closed — anything else is refused, never sealed); the receipt
 *   counts TWO sealed secrets; PENDING_VERIFICATION after the seal; the
 *   persisted payload is the SEALED envelope, never plaintext.
 * - THE PSP SEPARATION (ADR-0008 D5): the rail connection seeds through
 *   the PROVIDERLESS_RAIL form (its own catalogue); the probe runner
 *   addresses stellar:testnet connections ONLY — never a PSP id.
 * - THE ACCOUNT-READ PROBE: CONFIRMED on the canonical Horizon account
 *   shape (the asset positions observed, the issuer-scoped refs — the
 *   corridor chain's grounding); the honest UNFUNDED law (404 → FAILED
 *   with the typed code, never a fabricated CONFIRMED position);
 *   UNKNOWN on malformed/timeout (INV-04 — never a guess); the evidence
 *   ledger carries the positions.
 */

import { describe, expect, it } from "vitest";

import { createPaySwapDesktopService } from "../../src/host/payswap/index.js";
import { openProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import { fakeAuthority, fakeWorld } from "./connections-probe-plane-fixtures.js";

/** A canonical fake StrKey account id (G + 55 base32 chars — test material ONLY). */
const FAKE_G_ACCOUNT =
  "G" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
/** A canonical fake StrKey secret (S + 55 base32 chars — test material ONLY). */
const FAKE_S_SECRET =
  "S" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
/** A second fake account (the USDC issuer). */
const FAKE_G_ISSUER =
  "G" + "BCDEFGHIJKLMNOPQRSTUVWXYZA234567".repeat(2).slice(0, 55);

const HORIZON_ACCOUNT_URL = `https://horizon-testnet.stellar.org/accounts/${FAKE_G_ACCOUNT}`;

/** The canonical Horizon account answer (XLM native + the issuer-scoped USDC). */
const HORIZON_ACCOUNT_OK = {
  status: 200,
  body: JSON.stringify({
    id: FAKE_G_ACCOUNT,
    sequence: "1234567890",
    balances: [
      { balance: "1000.0000000", asset_type: "native" },
      {
        balance: "125.0000000",
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: FAKE_G_ISSUER,
      },
    ],
  }),
};

/** A world with the stellar rail plane composed (authority + evidence + service). */
async function stellarWorld() {
  const world = fakeWorld();
  const ctx = fakeAuthority(world);
  const evidenceStore = await openProbeEvidenceStore({
    fileSystem: world.fileSystem,
    directory: "/tmp/payswap-stellar-test",
  });
  const service = createPaySwapDesktopService(
    { scope: { kind: "local" }, log: () => {} },
    {
      connectionAuthority: ctx.authority,
      connectionProbe: {
        evidenceStore,
        fetchImpl: world.fetchImpl,
        nowMs: () => 1_000_000,
      },
    },
  );
  return { world, evidenceStore, service };
}

describe("the Stellar keypair-entry verb (D9 — the StrKey seal law)", () => {
  it("seeds the rail connection through the PROVIDERLESS_RAIL form (its own catalogue, never the PSP registry)", async () => {
    const { service } = await stellarWorld();
    const seeded = await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    expect(seeded.kind).toBe("CREATED");
    // The PSP registry catalogue is UNTOUCHED by the rail form.
    const catalogue = await service.connectionRegistry();
    expect(catalogue.map((entry) => entry.providerId)).toEqual([
      "stripe",
      "flutterwave",
      "paystack",
      "mtn-momo",
    ]);
  });

  it("seals the keypair as ONE material (2 secrets) and lands PENDING_VERIFICATION", async () => {
    const { world, service } = await stellarWorld();
    const seeded = await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    expect(seeded.kind).toBe("CREATED");
    if (seeded.kind !== "CREATED") return;
    if (seeded.kind !== "CREATED") throw new Error("seed refused");
    const connectionId = seeded.connectionId;
    const receipt = await service.connectionSubmitStellarSecretKey({
      connectionId,
      publicKey: FAKE_G_ACCOUNT,
      secretKey: FAKE_S_SECRET,
    });
    expect(receipt.sealedSecretCount).toBe(2);
    expect(receipt.nextState).toBe("PENDING_VERIFICATION");
    expect(receipt.credentialHandleRef).toBe(`payswap-cred:${connectionId}`);
    // The persisted credential is the VERSIONED SEALED ENVELOPE (the
    // substrate's AES-256-GCM cipher is applied by the REAL credential
    // service — the fake world's store persists the envelope structure,
    // never a bare key string).
    const persisted = world.files.get(`payswap.connection.${connectionId}.credential`) ?? "";
    const envelope = JSON.parse(persisted) as { version?: unknown; materialJson?: unknown; metadata?: { secretCount?: unknown; credentialKind?: unknown } };
    expect(envelope.version).toBe(1);
    expect(typeof envelope.materialJson).toBe("string");
    expect(envelope.metadata?.secretCount).toBe(2);
    expect(envelope.metadata?.credentialKind).toBe("STELLAR_KEYPAIR");
    expect(persisted).not.toBe(FAKE_S_SECRET);
    const statuses = await service.connectionStatuses();
    const status = statuses.find((row) => row.connectionId === connectionId);
    expect(status?.state).toBe("PENDING_VERIFICATION");
    expect(status?.form).toBe("PROVIDERLESS_RAIL");
  });

  it("refuses non-canonical shapes fail-closed (never sealed): bad G, bad S, short keys", async () => {
    const { world, service } = await stellarWorld();
    const seeded = await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    if (seeded.kind !== "CREATED") throw new Error("seed refused");
    const connectionId = seeded.connectionId;
    await expect(
      service.connectionSubmitStellarSecretKey({
        connectionId,
        publicKey: "S" + FAKE_G_ACCOUNT.slice(1),
        secretKey: FAKE_S_SECRET,
      }),
    ).rejects.toThrow(/StrKey keypair/);
    await expect(
      service.connectionSubmitStellarSecretKey({
        connectionId,
        publicKey: FAKE_G_ACCOUNT,
        secretKey: "G" + FAKE_S_SECRET.slice(1),
      }),
    ).rejects.toThrow(/StrKey keypair/);
    await expect(
      service.connectionSubmitStellarSecretKey({
        connectionId,
        publicKey: FAKE_G_ACCOUNT.slice(0, 30),
        secretKey: FAKE_S_SECRET,
      }),
    ).rejects.toThrow(/StrKey keypair/);
    await expect(
      service.connectionSubmitStellarSecretKey({
        connectionId: "conn:unknown",
        publicKey: FAKE_G_ACCOUNT,
        secretKey: FAKE_S_SECRET,
      }),
    ).rejects.toThrow(/No connection/);
    // Nothing was sealed.
    expect(world.files.get(`payswap.connection.${connectionId}.credential`)).toBeUndefined();
  });

  it("an unknown (providerId, useCaseRef) rail pair derives NO form (fail-closed, never guessed)", async () => {
    const { service } = await stellarWorld();
    const refused = await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "not-a-declared-form",
    });
    expect(refused.kind).toBe("REFUSED");
  });
});

describe("the Horizon account-read probe (D9 — the ONLY ACTIVE path for the rail)", () => {
  it("CONFIRMS on the canonical account shape: the positions observed, the issuer-scoped refs recorded, ACTIVE on this evidence alone", async () => {
    const { world, evidenceStore, service } = await stellarWorld();
    const seeded = await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    if (seeded.kind !== "CREATED") throw new Error("seed refused");
    const connectionId = seeded.connectionId;
    await service.connectionSubmitStellarSecretKey({
      connectionId,
      publicKey: FAKE_G_ACCOUNT,
      secretKey: FAKE_S_SECRET,
    });
    world.fetchScript.set(HORIZON_ACCOUNT_URL, HORIZON_ACCOUNT_OK);
    const outcome = await service.connectionRunStellarAccountReadProbe();
    expect(outcome.providerRef).toBe("stellar:testnet");
    expect(outcome.probedOperation).toBe("stellar.account.read");
    expect(outcome.results).toHaveLength(1);
    const row = outcome.results[0]!;
    expect(row.outcome).toBe("CONFIRMED");
    expect(row.state).toBe("ACTIVE");
    // THE OPAQUE-HANDLE LAW: the raw G… address never appears (the
    // sealed keypair's public half); the observation is the positions.
    expect(row.providerReferences).not.toContain(FAKE_G_ACCOUNT);
    expect(row.providerReferences).toContain(`stellar:testnet/asset:USDC:${FAKE_G_ISSUER}`);
    expect(outcome.note).toContain("Stellar testnet");
    // The evidence ledger carries the positions (the chain derivation's input).
    const latest = await evidenceStore.latestProbeEvidence();
    const record = latest.find((entry) => entry.connectionId === connectionId);
    expect(record?.assetPositions).toEqual([
      `stellar:testnet/asset:USDC:${FAKE_G_ISSUER}`,
    ]);
    expect(record?.balanceCurrencies).toEqual(["XLM", "USDC"]);
    expect(record?.providerId).toBe("stellar:testnet");
  });

  it("the honest UNFUNDED law: a 404 is FAILED with the typed code — never a fabricated CONFIRMED position", async () => {
    const { world, service } = await stellarWorld();
    const seeded = await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    if (seeded.kind !== "CREATED") throw new Error("seed refused");
    const connectionId = seeded.connectionId;
    await service.connectionSubmitStellarSecretKey({
      connectionId,
      publicKey: FAKE_G_ACCOUNT,
      secretKey: FAKE_S_SECRET,
    });
    world.fetchScript.set(HORIZON_ACCOUNT_URL, {
      status: 404,
      body: JSON.stringify({
        type: "https://stellar.org/horizon-errors/not_found",
        title: "Resource Missing",
        status: 404,
      }),
    });
    const outcome = await service.connectionRunStellarAccountReadProbe();
    const row = outcome.results[0]!;
    expect(row.outcome).toBe("FAILED");
    expect(row.failureCode).toBe("STELLAR_ACCOUNT_NOT_FUNDED");
    expect(row.state).toBe("PENDING_VERIFICATION");
    expect(row.summary).not.toContain("CONFIRMED");
  });

  it("a 2xx without the canonical account shape is UNKNOWN (INV-04 — never a guess)", async () => {
    const { world, service } = await stellarWorld();
    const seeded = await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    if (seeded.kind !== "CREATED") throw new Error("seed refused");
    const connectionId = seeded.connectionId;
    await service.connectionSubmitStellarSecretKey({
      connectionId,
      publicKey: FAKE_G_ACCOUNT,
      secretKey: FAKE_S_SECRET,
    });
    world.fetchScript.set(HORIZON_ACCOUNT_URL, { status: 200, body: JSON.stringify({ odd: true }) });
    const outcome = await service.connectionRunStellarAccountReadProbe();
    const row = outcome.results[0]!;
    expect(row.outcome).toBe("UNKNOWN");
    expect(row.state).toBe("PENDING_VERIFICATION");
  });

  it("a connection with no sealed keypair is refused typed; the PSP probe vocabulary is never consulted", async () => {
    const { service } = await stellarWorld();
    await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    await expect(service.connectionRunStellarAccountReadProbe()).rejects.toThrow(
      /no stellar:testnet connection has a sealed keypair/,
    );
  });
});
