/**
 * P13 U1 REAL-FLOW E2E HARNESS (ADR-0007 D1/D8 — the credentials gate).
 *
 * Runs the COMPLETE U1 own-store test-mode slice against the REAL Stripe
 * test API with an operator-supplied test-mode key:
 *
 *   seed → seal (broker, AES-256-GCM at rest) → PENDING_VERIFICATION →
 *   the read-only probe (GET /v1/balance + GET /v1/account) INSIDE the
 *   credential seal, through the REAL HTTPS transport →
 *   recordVerificationOutcome → ACTIVE (the ONLY ACTIVE path).
 *
 * Plus the pinned negative controls (each must hold, or the run FAILS):
 *   N1 NEVER-ACTIVE before the probe (seed and seal both leave the
 *      connection non-ACTIVE).
 *   N2 INV-25 live-key refusal: a fake live key (non-contiguous
 *      construction) is REFUSED by the seal verb.
 *   N3 THE SEAL: a consumer whose RESULT carries the secret THROWS
 *      (fail-closed escape scan — never silently sanitized).
 *   N4 CONVERGENCE: re-seeding the same (provider, useCase) RESUMES the
 *      same connection id — never a duplicate.
 *   N5 RESTART STABILITY: a fresh authority over the same user-data
 *      directory sees the ACTIVE record with its evidence.
 *
 * Credential law: the key comes ONLY from the STRIPE_SECRET_KEY
 * environment variable (the station secret store); it is NEVER written
 * to any output, receipt, or log. The receipt records provider evidence
 * only (account ref, live-mode flag, timings, transport identity).
 *
 * Exit codes: 0 = all gates held (ACTIVE reached); 1 = a gate failed;
 * 2 = credentials not provided (the honest pre-P13 state).
 *
 * Usage: STRIPE_SECRET_KEY=sk_test_… pnpm exec tsx scripts/p13/u1-stripe-real-flow-e2e.ts
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { createNodeConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/node-composition.js";
import {
  connectionCredentialStorageKey,
  ConnectionSessionAuthority,
} from "../../packages/desktop/src/host/payswap/connections/index.js";
import {
  StripeHttpsTransport,
  createStripeVerificationProbe,
  SystemRuntimeClock,
  type StripeProbeResult,
} from "../../packages/provider-runtime/src/index.js";

/** A REAL AES-256-GCM credential service (the substrate contract). */
function createAesGcmCredentialService(workspaceDir: string) {
  const keyPath = join(workspaceDir, "harness-master.key");
  const storePath = join(workspaceDir, "credential-store.json");
  // The master key: 256 random bits, mode-600 file in the harness
  // workspace. (The real substrate derives it from OS safe storage; the
  // harness boundary is documented honestly in the receipt.)
  const master = randomBytes(32);
  const store = new Map<string, string>();
  const seal = (plaintext: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", master, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
  };
  const open = (sealed: string): string => {
    const [ivB64, tagB64, dataB64] = sealed.split(".");
    const decipher = createDecipheriv("aes-256-gcm", master, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  };
  return {
    service: {
      load: async (key: string): Promise<string | null> => {
        const sealed = store.get(key);
        return sealed === undefined ? null : open(sealed);
      },
      save: async (key: string, value: string): Promise<void> => {
        store.set(key, seal(value));
        await writeFile(keyPath, master.toString("base64"), { mode: 0o600 });
        await writeFile(
          storePath,
          JSON.stringify(Object.fromEntries(store.entries()), null, 2),
          { mode: 0o600 },
        );
      },
      delete: async (key: string): Promise<void> => {
        store.delete(key);
      },
    },
    storageObservations: store,
  };
}

interface Receipt {
  readonly harness: "p13-u1-real-flow-e2e";
  readonly ranAt: string;
  readonly gates: Record<string, { held: boolean; detail: string }>;
  readonly probe: {
    readonly outcome: string;
    readonly accountRef: string | null;
    readonly providerLiveMode: boolean | null;
    readonly transportClass: string;
    readonly transportId: string;
    readonly providerReferences: readonly string[];
    readonly dispatchedAt: string;
    readonly completedAt: string;
    readonly latencyMs: number;
  } | null;
  readonly connection: {
    readonly connectionId: string;
    readonly finalState: string;
    readonly transitions: readonly { at: string; from: string; to: string; cause: string }[];
  } | null;
  readonly honestNotes: readonly string[];
}

async function main(): Promise<number> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (typeof secretKey !== "string" || secretKey.trim() === "") {
    console.error(
      "[u1-e2e] STRIPE_SECRET_KEY not provided — the real-flow gate stays operator-gated (ADR-0007 D1/D8). Nothing is simulated.",
    );
    return 2;
  }

  const gates: Record<string, { held: boolean; detail: string }> = {};
  const honestNotes: string[] = [
    "credential source: the station secret store (STRIPE_SECRET_KEY env); never chat, never committed, never echoed",
    "credential service: harness-local AES-256-GCM (node:crypto) standing in for the substrate safeStorage-backed service — real authenticated encryption, documented boundary",
  ];
  let probeResult: StripeProbeResult | null = null;
  let connectionSnapshot: Receipt["connection"] = null;
  const ranAt = new Date().toISOString();
  const workspaceDir = await mkdtemp(join(tmpdir(), "payswap-u1-real-flow-"));

  try {
    // ---- composition (the REAL node composition edge) ----
    const credentialService = createAesGcmCredentialService(workspaceDir);
    const authority = createNodeConnectionSessionAuthority({
      userDataDirectory: workspaceDir,
      credentialService: credentialService.service,
    });
    const U1 = { providerId: "stripe", useCaseRef: "own-store-test-mode" } as const;

    // ---- the U1 flow ----
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") {
      gates["seed"] = { held: false, detail: `expected CREATED, got ${seeded.kind}` };
      throw new Error("seed gate failed");
    }
    const connectionId = seeded.connectionId;
    let statuses = await authority.connectionStatuses();
    let current = statuses.find((s) => s.connectionId === connectionId);
    gates["N1-never-active-before-probe"] = {
      held: current?.state !== "ACTIVE",
      detail: `seeded state ${current?.state ?? "UNKNOWN"} (PROPOSED expected, never ACTIVE)`,
    };

    // seal the operator's test key
    const sealReceipt = await authority.submitStripeRestrictedKey({ connectionId, secretKey });
    statuses = await authority.connectionStatuses();
    current = statuses.find((s) => s.connectionId === connectionId);
    gates["seal"] = {
      held:
        sealReceipt.nextState === "PENDING_VERIFICATION" &&
        current?.state === "PENDING_VERIFICATION" &&
        typeof sealReceipt.credentialHandleRef === "string" &&
        sealReceipt.credentialHandleRef.length > 0,
      detail: `sealed ${sealReceipt.sealedSecretCount} secret(s); state ${current?.state}; handle opaque`,
    };
    gates["N1-never-active-after-seal"] = {
      held: current?.state === "PENDING_VERIFICATION",
      detail: "sealed ≠ verified: the connection is PENDING_VERIFICATION, never ACTIVE",
    };
    const storageKey = connectionCredentialStorageKey(connectionId);
    honestNotes.push(
      `broker storage-key law held: ${storageKey} (payswap.connection.<connectionId>.credential)`,
    );

    // ---- N2: INV-25 live-key refusal (fake live key, non-contiguous) ----
    try {
      await authority.submitStripeRestrictedKey({
        connectionId,
        secretKey: "rk" + "_live_FAKE51keyDoNotUse0009",
      });
      gates["N2-inv25-live-key-refused"] = {
        held: false,
        detail: "the fake LIVE key was NOT refused — INV-25 violation",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gates["N2-inv25-live-key-refused"] = {
        held: /INV-25|SANDBOX-only|test-mode restricted key/i.test(message),
        detail: `refused: ${message.slice(0, 140)}`,
      };
    }

    // ---- N3: the seal escape scan (a leaking consumer THROWS) ----
    try {
      await authority.withSealedCredential(
        connectionId,
        (material) => {
          const apiKey = (material as { apiKey: string }).apiKey;
          return `leak-attempt:${apiKey}`;
        },
        "n3-escape-scan-control",
      );
      gates["N3-seal-escape-scan"] = {
        held: false,
        detail: "a consumer result carrying the secret did NOT throw — seal violation",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gates["N3-seal-escape-scan"] = {
        held: /secret|leak|material/i.test(message),
        detail: `threw as designed: ${message.slice(0, 140)}`,
      };
    }

    // ---- the REAL probe, INSIDE the seal, through the REAL transport ----
    const clock = new SystemRuntimeClock();
    const transport = new StripeHttpsTransport({ fetchImpl: globalThis.fetch });
    const probe = createStripeVerificationProbe({
      transport,
      clock,
      executionMode: "SANDBOX",
    });
    const probeStartedAt = Date.now();
    probeResult = await authority.withSealedCredential(connectionId, probe, "u1-real-flow-e2e");
    const latencyMs = Date.now() - probeStartedAt;

    gates["probe"] = {
      held: probeResult.outcome === "CONFIRMED",
      detail:
        probeResult.outcome === "CONFIRMED"
          ? `CONFIRMED — account ${probeResult.accountRef}, provider live-mode ${probeResult.providerLiveMode}`
          : `outcome ${probeResult.outcome}${probeResult.failure ? ` (${probeResult.failure.code}: ${probeResult.failure.message})` : ""}${probeResult.ambiguityReason ? ` ambiguity ${probeResult.ambiguityReason}` : ""}`,
    };

    // ---- record the outcome (the ONLY ACTIVE path) ----
    const evidenceSummary =
      probeResult.outcome === "CONFIRMED"
        ? `read-only probe CONFIRMED via ${probeResult.transportId} (${probeResult.transportClass}): balance + account read OK, account ${probeResult.accountRef}, provider live-mode ${String(probeResult.providerLiveMode)}`
        : `read-only probe ${probeResult.outcome} — recorded honestly, no ACTIVE transition`;
    await authority.recordVerificationOutcome({
      connectionId,
      outcome: probeResult.outcome,
      evidenceSummary,
    });

    // ---- N4: convergence (re-seed RESUMES the same connection) ----
    const reseeded = await authority.seedConnectionSetup(U1);
    gates["N4-convergence-resume"] = {
      held: reseeded.kind === "RESUMED" && reseeded.connectionId === connectionId,
      detail: `re-seed → ${reseeded.kind} ${"connectionId" in reseeded ? reseeded.connectionId : ""} (same id expected)`,
    };

    // ---- final state ----
    statuses = await authority.connectionStatuses();
    current = statuses.find((s) => s.connectionId === connectionId);
    gates["active-on-real-evidence"] = {
      held: probeResult.outcome === "CONFIRMED" && current?.state === "ACTIVE",
      detail: `final state ${current?.state ?? "UNKNOWN"}`,
    };

    // ---- N5: restart stability (fresh authority, same user-data dir) ----
    const freshCredentialService = createAesGcmCredentialService(workspaceDir);
    // NOTE: the fresh service seals under a NEW master key, so it cannot
    // open the earlier blob — the honest restart check pins the RECORD
    // store persistence; credential re-unseal across restarts is the
    // substrate safeStorage migration path (out of the P13-B slice).
    const freshAuthority = createNodeConnectionSessionAuthority({
      userDataDirectory: workspaceDir,
      credentialService: freshCredentialService.service,
    });
    const freshStatuses = await freshAuthority.connectionStatuses();
    const freshCurrent = freshStatuses.find((s) => s.connectionId === connectionId);
    gates["N5-restart-record-stability"] = {
      held: freshCurrent?.state === "ACTIVE",
      detail: `fresh authority over the same dir → ${freshCurrent?.state ?? "UNKNOWN"} with ${freshCurrent?.transitionHistory?.length ?? 0} transitions`,
    };
    honestNotes.push(
      "N5 boundary: the RECORD store persists across restart; unsealing the credential blob across restarts is the substrate safeStorage migration path (out of the P13-B slice) — the harness master key is per-run",
    );

    connectionSnapshot = {
      connectionId,
      finalState: current?.state ?? "UNKNOWN",
      transitions: (current?.transitionHistory ?? []).map((t) => ({
        at: t.at,
        from: t.from,
        to: t.to,
        cause: t.cause,
      })),
    };

    const receipt: Receipt = {
      harness: "p13-u1-real-flow-e2e",
      ranAt,
      gates,
      probe:
        probeResult === null
          ? null
          : {
              outcome: probeResult.outcome,
              accountRef: probeResult.accountRef,
              providerLiveMode: probeResult.providerLiveMode,
              transportClass: probeResult.transportClass,
              transportId: probeResult.transportId,
              providerReferences: probeResult.providerReferences,
              dispatchedAt: new Date(Number(probeResult.dispatchedAt)).toISOString(),
              completedAt: new Date(Number(probeResult.completedAt)).toISOString(),
              latencyMs,
            },
      connection: connectionSnapshot,
      honestNotes,
    };

    const allHeld = Object.values(gates).every((g) => g.held);
    const receiptPath = process.env.U1_RECEIPT_PATH;
    const receiptJson = JSON.stringify(receipt, null, 2);
    if (receiptPath !== undefined && receiptPath !== "") {
      await mkdir(join(receiptPath, "..").split("/").slice(0, -1).join("/") || ".", {
        recursive: true,
      });
      await writeFile(receiptPath, receiptJson, "utf8");
    }
    console.log(receiptJson);
    console.error(
      `[u1-e2e] ${allHeld ? "ALL GATES HELD" : "GATE FAILURE"} — ${
        Object.keys(gates)
          .filter((k) => !gates[k]?.held)
          .join(", ") || "none failed"
      }`,
    );
    return allHeld ? 0 : 1;
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

main().then(
  (code) => {
    process.exit(code);
  },
  (error) => {
    console.error("[u1-e2e] harness error:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
