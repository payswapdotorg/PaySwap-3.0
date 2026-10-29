/**
 * PaySwap Desktop (P23-D, ADR-0015 D10 — the E2E law's desktop half) —
 * THE CDP JOURNEY'S CONNECTION-STATE SEEDER.
 *
 * The station holds ZERO live provider credentials (the seventh-reset
 * loss; the a51a30c receipts remain the accepted live evidence), and the
 * shipped app's probe transports hardcode the REAL provider endpoints —
 * so a zero-credential CDP run can never compose the no-route corridor
 * (no ACTIVE connection → no chains → no rails → no exclusions → no
 * cards, the honest empty set). This seeder closes that gap HONESTLY:
 * it composes the REAL connection plane (the ConnectionSessionAuthority
 * + the probe-evidence ledger + the REAL probe runner) over the
 * SCRIPTED provider transport (the p21-journey-bridge fixtures' own
 * answers — the same six scripted HTTPS responses the bridge battery
 * rides) and drives the REAL member path (seed → key-entry seal → the
 * read-only probe over the scripted answers → CONFIRMED → ACTIVE), so
 * the isolated CDP userData starts from the scripted test world's
 * CONNECTED state. The REAL app then derives its bridge, chains, rails,
 * exclusions and CARDS from that state exactly as it would from live
 * probes — every derived fact is the REAL composition's own output; the
 * only scripted tier is the transport the probes rode (disclosed in the
 * CDP receipt; never a claim of a live probe).
 *
 * ENV-GATED (P23_CDP_SEED_DIR): the battery's default run SKIPS this
 * file — only scripts/p23/desktop-cdp-emergence-journey.mjs drives it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  ConnectionSessionAuthority,
  DurableConnectionCredentialBroker,
  createPaySwapDesktopService,
} from "../../src/host/payswap/index.js";
import { openProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import {
  FAKE_FLW_KEY,
  FAKE_STRIPE_FULL_KEY,
  FLW_BALANCES_OK,
  FLW_BALANCES_URL,
  STRIPE_ACCOUNT_URL,
  STRIPE_BALANCE_URL,
} from "./connections-probe-plane-fixtures.js";

const SEED_DIR = process.env.P23_CDP_SEED_DIR ?? "";

const seed = SEED_DIR.length > 0 ? describe : describe.skip;

seed("the P23-D CDP connection-state seeder (the scripted test world over the REAL member path)", () => {
  it("seeds BOTH connections ACTIVE through the REAL member path (seed → seal → the scripted probe → CONFIRMED → ACTIVE)", async () => {
    const connectionsDir = `${SEED_DIR.replace(/\/+$/, "")}/connections`;
    await mkdir(connectionsDir, { recursive: true });
    // The credential blobs as plain files under the seed dir (the app's
    // substrate credential service never reads them in this journey — the
    // bridge consumes statuses + evidence only, and the no-route corridor
    // never dispatches; the sealed-key path stays unexercised, honestly).
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
    // The scripted provider transport (the bridge battery's own six answers;
    // the FLW balances carry the NGN wallet the journey's funding answer names).
    const fetchScript = new Map<string, { status: number; body: string }>([
      [FLW_BALANCES_URL, FLW_BALANCES_OK],
      [STRIPE_BALANCE_URL, { status: 200, body: JSON.stringify({ object: "balance", available: [{ amount: 5000, currency: "usd" }] }) }],
      [STRIPE_ACCOUNT_URL, { status: 200, body: JSON.stringify({ id: "acct_FAKE0001", livemode: false }) }],
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
    const stripe = await service.connectionSeedSetup({ providerId: "stripe", useCaseRef: "own-store-test-mode" });
    if (stripe.kind !== "CREATED") throw new Error("the stripe seed failed");
    await service.connectionSubmitStripeRestrictedKey({ connectionId: stripe.connectionId, secretKey: FAKE_STRIPE_FULL_KEY });
    for (const providerId of ["flutterwave", "stripe"] as const) {
      const outcome = await service.connectionRunVerificationProbe(providerId);
      const result = outcome.results.find((row) => row.state === "ACTIVE");
      if (result === undefined) {
        throw new Error(`the ${providerId} probe did not confirm a connection over the scripted transport`);
      }
    }
    // The seeded state lands for the CDP harness to copy into the isolated userData.
    const statuses = await authority.connectionStatuses();
    expect(statuses.filter((status) => status.state === "ACTIVE")).toHaveLength(2);
    expect(statuses.map((status) => status.providerId).sort()).toEqual(["flutterwave", "stripe"]);
  });
});
