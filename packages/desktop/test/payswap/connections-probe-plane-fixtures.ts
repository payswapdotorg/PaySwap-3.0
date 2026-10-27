/**
 * PaySwap Desktop (P21-A, ADR-0014 D5) — the connection-ACTIVATION
 * plane fixtures (split from connections-probe-plane.test.ts at the
 * ≤400-line file law — the payment-reconcile-plane-fixtures precedent):
 * the fake world (files + credential service + a URL-keyed fetch
 * script), the fake authority with pinned clocks and the probe-world
 * service composition the battery drives.
 *
 * The battery NEVER touches the network: the fetch script answers by
 * URL through the INJECTED binding (the composition edge binds
 * globalThis.fetch; tests inject this deterministic fake).
 */

import {
  ConnectionSessionAuthority,
  DurableConnectionCredentialBroker,
  createPaySwapDesktopService,
} from "../../src/host/payswap/index.js";
import { openProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import type { WorkspaceStoreFileSystem } from "../../src/host/payswap/product/workspace-store-persistence.js";

/** Fake test-mode keys (test material ONLY — non-contiguous construction). */
export const FAKE_FLW_KEY = "FLWSECK_TEST-" + "FAKE51flwDoNotUse0001";
export const FAKE_FLW_LIVE_KEY = "FLWSECK-" + "FAKE51liveDoNotUse0009";
export const FAKE_PAYSTACK_KEY = "sk" + "_test_FAKE51paystackDoNotUse02";
export const FAKE_PAYSTACK_LIVE_KEY = "sk" + "_live_FAKE51liveDoNotUse0010";
export const FAKE_STRIPE_FULL_KEY = "sk" + "_test_FAKE51stripeDoNotUse03";

/** The canonical provider URLs the host transports drive. */
export const FLW_BALANCES_URL = "https://api.flutterwave.com/v3/balances";
export const PAYSTACK_TRANSACTIONS_URL = "https://api.paystack.co/transaction";
export const STRIPE_BALANCE_URL = "https://api.stripe.com/v1/balance";
export const STRIPE_ACCOUNT_URL = "https://api.stripe.com/v1/account";

/** The seeded use-case refs. */
export const FLW_SEED = { providerId: "flutterwave", useCaseRef: "own-store-test-mode" } as const;
export const PAYSTACK_SEED = { providerId: "paystack", useCaseRef: "own-store-test-mode" } as const;
export const STRIPE_SEED = { providerId: "stripe", useCaseRef: "own-store-test-mode" } as const;

/** A fetch response stub (the minimal shape the transports need). */
export interface FetchStub {
  readonly status: number;
  readonly body: string;
}

/** The world: files + credential service + a URL-keyed fetch script. */
export function fakeWorld() {
  const files = new Map<string, string>();
  const fileSystem: WorkspaceStoreFileSystem = {
    readFile: async (path) => {
      const data = files.get(path);
      if (data === undefined) {
        throw new Error("ENOENT");
      }
      return data;
    },
    writeFile: async (path, data) => {
      files.set(path, data);
    },
    mkdir: async () => {},
  };
  const credentialService = {
    load: async (key: string) => files.get(key) ?? null,
    save: async (key: string, value: string) => {
      files.set(key, value);
    },
    delete: async (key: string) => {
      files.delete(key);
    },
  };
  const fetchScript = new Map<string, FetchStub>();
  const fetchImpl = async (url: string): Promise<{ status: number; text(): Promise<string> }> => {
    const stub = fetchScript.get(url);
    if (stub === undefined) {
      throw new Error(`the test fetch has no scripted answer for ${url}`);
    }
    return { status: stub.status, text: async () => stub.body };
  };
  return { files, fileSystem, credentialService, fetchScript, fetchImpl };
}

export type World = ReturnType<typeof fakeWorld>;

/** A fake authority with pinned clocks (deterministic instants). */
export function fakeAuthority(world: World) {
  let ms = 1_000_000;
  let iso = "2026-10-27T12:00:00Z";
  let idSeq = 0;
  const authority = new ConnectionSessionAuthority({
    fileSystem: world.fileSystem,
    directory: "/tmp/payswap-probe-test",
    broker: new DurableConnectionCredentialBroker(world.credentialService),
    nowMs: () => ms,
    nowIso: () => iso,
    createId: () => `fake-${(idSeq += 1)}`,
  });
  return {
    authority,
    advanceMs: (delta: number) => {
      ms += delta;
    },
    setIso: (value: string) => {
      iso = value;
    },
  };
}

/** A probe-world: authority + evidence store + service over the fake fetch. */
export async function probeWorld(world: World) {
  const evidenceStore = await openProbeEvidenceStore({
    fileSystem: world.fileSystem,
    directory: "/tmp/payswap-probe-test",
  });
  const ctx = fakeAuthority(world);
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
  return { ctx, evidenceStore, service };
}

/** The canonical Flutterwave /v3/balances answer (currency wallets). */
export const FLW_BALANCES_OK: FetchStub = {
  status: 200,
  body: JSON.stringify({
    status: "success",
    data: [
      { currency: "NGN", available_balance: 1000, ledger_balance: 1000 },
      { currency: "KES", available_balance: 500, ledger_balance: 500 },
    ],
  }),
};
