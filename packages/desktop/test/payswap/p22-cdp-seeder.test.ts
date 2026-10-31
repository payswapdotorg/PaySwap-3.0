/**
 * PaySwap Desktop (P22-D, ADR-0016 D10 — the E2E law's seeder) — the
 * CORRIDOR CDP connection-state seeder: the 3-provider corridor plane
 * (FLW's GHS wallet + Paystack's KES-observed transactions + the
 * stellar:testnet keypair seal with the Horizon account read observing
 * the ISSUER-SCOPED USDC — the corridor's observed middle) seeded
 * through the REAL member path over the SCRIPTED provider transport,
 * into the harness's seed dir (the p23-cdp-seeder precedent).
 *
 * ENV-GATED: runs ONLY when P22_CDP_SEED_DIR is set (the CDP harness
 * sets it); the default vitest run SKIPS this file — the seeder never
 * touches the network and never runs as a plain battery.
 *
 * The seeded state lands for the CDP harness to copy into the isolated
 * userData (the app then derives its REAL bridge, chains, rails, the
 * corridor compile and the composite-act surfaces from that state).
 * The execution + read-back answers are scripted too (the D10 law: the
 * per-leg dispatch over the scripted Stellar transport) — the journey
 * discloses the scripted tier; NO live provider is contacted or
 * claimed.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ConnectionSessionAuthority,
  createPaySwapDesktopService,
  DurableConnectionCredentialBroker,
} from "../../src/host/payswap/index.js";
import { openProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import {
  FAKE_FLW_KEY,
  FAKE_PAYSTACK_KEY,
  FLW_BALANCES_URL,
  PAYSTACK_TRANSACTIONS_URL,
} from "./connections-probe-plane-fixtures.js";
import { CORRIDOR_USDC_ISSUER_G } from "../../../route-compiler/test/corridor-fixtures.ts";

const SEED_DIR = process.env.P22_CDP_SEED_DIR ?? "";

const seed = SEED_DIR.length > 0 ? describe : describe.skip;

/** A canonical fake StrKey keypair (test material ONLY — non-contiguous construction). */
const FAKE_G_ACCOUNT = "G" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
const FAKE_S_SECRET = "S" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
/** The observed deployed-contract id + the canonical references (the bridge battery's own). */
const FAKE_C_CONTRACT = "C" + "DEFGHIJKLMNOPQRSTUVWXYZAB234567".repeat(2).slice(0, 55);
const CORRIDOR_TX_HASH = "tx_p22d_hash_0001";
const CORRIDOR_TRANSFER_REFERENCE = "ref_p22d_transfer";
const CORRIDOR_TRANSFER_CODE = "TRF_p22dx";

seed("the P22-D CDP corridor-state seeder (the scripted corridor world over the REAL member path)", () => {
  it("seeds the 3-provider corridor plane ACTIVE (FLW GHS + Paystack KES + the stellar:testnet rail observing the issuer-scoped USDC)", async () => {
    const connectionsDir = `${SEED_DIR.replace(/\/+$/, "")}/connections`;
    await mkdir(connectionsDir, { recursive: true });
    const credentialDir = `${SEED_DIR.replace(/\/+$/, "")}/credentials`;
    await mkdir(credentialDir, { recursive: true });
    const fileSystem = {
      readFile: (path: string) => readFile(path, "utf8"),
      writeFile: (path: string, data: string) => writeFile(path, data, "utf8"),
      mkdir: async (path: string) => {
        await mkdir(path, { recursive: true });
      },
    };
    const credentialService = {
      load: async (key: string) => {
        try {
          return await readFile(`${credentialDir}/${key}`, "utf8");
        } catch {
          return null;
        }
      },
      save: async (key: string, value: string) => {
        await writeFile(`${credentialDir}/${key}`, value, "utf8");
      },
      delete: async () => {},
    };
    // The scripted corridor transport (the bridge battery's own answers —
    // the GHS wallet, the KES transactions, the issuer-scoped USDC middle,
    // and the execution + read-back answers the D10 dispatch legs ride).
    const fetchScript = new Map<string, { status: number; body: string }>([
      [
        FLW_BALANCES_URL,
        {
          status: 200,
          body: JSON.stringify({
            status: "success",
            data: [
              { currency: "GHS", available_balance: 1000, ledger_balance: 1000 },
              { currency: "NGN", available_balance: 500, ledger_balance: 500 },
            ],
          }),
        },
      ],
      [
        PAYSTACK_TRANSACTIONS_URL,
        {
          status: 200,
          body: JSON.stringify({ status: true, data: [{ id: 2001, currency: "KES", status: "success" }] }),
        },
      ],
      [
        `https://horizon-testnet.stellar.org/accounts/${FAKE_G_ACCOUNT}`,
        {
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
                asset_issuer: CORRIDOR_USDC_ISSUER_G,
              },
            ],
          }),
        },
      ],
      [
        "https://api.paystack.co/transfer",
        {
          status: 200,
          body: JSON.stringify({
            status: true,
            message: "Transfer created",
            data: { reference: CORRIDOR_TRANSFER_REFERENCE, transfer_code: CORRIDOR_TRANSFER_CODE, status: "pending" },
          }),
        },
      ],
      [
        `https://api.paystack.co/transfer/${CORRIDOR_TRANSFER_REFERENCE}`,
        {
          status: 200,
          body: JSON.stringify({
            status: true,
            message: "Transfer retrieved",
            data: { reference: CORRIDOR_TRANSFER_REFERENCE, transfer_code: CORRIDOR_TRANSFER_CODE, status: "success" },
          }),
        },
      ],
      [
        "https://horizon-testnet.stellar.org/transactions",
        { status: 200, body: JSON.stringify({ id: CORRIDOR_TX_HASH, success: true }) },
      ],
      [
        `https://horizon-testnet.stellar.org/transactions/${CORRIDOR_TX_HASH}`,
        { status: 200, body: JSON.stringify({ id: CORRIDOR_TX_HASH, success: true }) },
      ],
      [
        `https://horizon-testnet.stellar.org/transactions/${CORRIDOR_TX_HASH}/operations`,
        {
          status: 200,
          body: JSON.stringify({
            _embedded: { records: [{ type: "invoke_host_function", address: FAKE_C_CONTRACT }] },
          }),
        },
      ],
    ]);
    const fetchImpl = async (url: string): Promise<{ status: number; text(): Promise<string> }> => {
      const stub = fetchScript.get(url);
      if (stub === undefined) {
        throw new Error(`the seeder fetch has no scripted answer for ${url}`);
      }
      return { status: stub.status, text: async () => stub.body };
    };
    // FRESH instants (the rail snapshots' freshness policy is 3600s — the
    // seeded observations must outlive the CDP journey that follows).
    const nowMs = Date.now();
    const evidenceStore = await openProbeEvidenceStore({ fileSystem, directory: connectionsDir });
    const authority = new ConnectionSessionAuthority({
      fileSystem,
      directory: connectionsDir,
      broker: new DurableConnectionCredentialBroker(credentialService),
      nowMs: () => nowMs,
      nowIso: () => new Date(nowMs).toISOString(),
      createId: () => `conn-${Math.random().toString(36).slice(2, 10)}`,
    });
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      {
        connectionAuthority: authority,
        connectionProbe: { evidenceStore, fetchImpl, nowMs: () => nowMs },
      },
    );
    const flw = await service.connectionSeedSetup({ providerId: "flutterwave", useCaseRef: "own-store-test-mode" });
    if (flw.kind !== "CREATED") throw new Error("the flutterwave seed failed");
    await service.connectionSubmitFlutterwaveSecretKey({ connectionId: flw.connectionId, secretKey: FAKE_FLW_KEY });
    const paystack = await service.connectionSeedSetup({ providerId: "paystack", useCaseRef: "own-store-test-mode" });
    if (paystack.kind !== "CREATED") throw new Error("the paystack seed failed");
    await service.connectionSubmitPaystackSecretKey({ connectionId: paystack.connectionId, secretKey: FAKE_PAYSTACK_KEY });
    const stellar = await service.connectionSeedSetup({ providerId: "stellar:testnet", useCaseRef: "testnet-keypair-wallet" });
    if (stellar.kind !== "CREATED") throw new Error("the stellar rail seed failed");
    await service.connectionSubmitStellarSecretKey({
      connectionId: stellar.connectionId,
      publicKey: FAKE_G_ACCOUNT,
      secretKey: FAKE_S_SECRET,
    });
    for (const providerId of ["flutterwave", "paystack"] as const) {
      const outcome = await service.connectionRunVerificationProbe(providerId);
      const result = outcome.results.find((row) => row.state === "ACTIVE");
      if (result === undefined) {
        throw new Error(`the ${providerId} probe did not confirm a connection over the scripted transport`);
      }
    }
    const stellarProbe = await service.connectionRunStellarAccountReadProbe();
    if (stellarProbe.results.find((row) => row.state === "ACTIVE") === undefined) {
      throw new Error("the stellar account-read probe did not confirm the rail connection");
    }
    // The seeded state lands for the CDP harness to copy into the isolated
    // userData: THREE ACTIVE connections + the issuer-scoped USDC position
    // (the corridor's observed middle — the compile's grounding).
    const statuses = await authority.connectionStatuses();
    expect(statuses.filter((status) => status.state === "ACTIVE")).toHaveLength(3);
    expect(statuses.map((status) => status.providerId).sort()).toEqual([
      "flutterwave",
      "paystack",
      "stellar:testnet",
    ]);
    const evidence = await evidenceStore.latestProbeEvidence();
    const stellarRecord = evidence.find((entry) => entry.providerId === "stellar:testnet");
    expect(stellarRecord?.assetPositions).toEqual([
      `stellar:testnet/asset:USDC:${CORRIDOR_USDC_ISSUER_G}`,
    ]);
  });
});
