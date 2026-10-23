/**
 * P14-D REAL-FLOW PROBE E2E HARNESS (ADR-0008 D5) — Flutterwave +
 * Paystack, the vertical-slice twins of the U1 real flow.
 *
 * For EACH provider, through the REAL machinery end-to-end:
 *
 *   seed (PROPOSED) → N1 never-ACTIVE → seal the operator's test secret
 *   key through the provider verb (PENDING_VERIFICATION) → N2 INV-25
 *   fake-live-key refusal → N3 the seal escape-scan THROWS → THE REAL
 *   READ-ONLY PROBE (GET /v3/balances for Flutterwave; GET /transaction
 *   for Paystack) through the REAL HTTPS transport INSIDE the credential
 *   seal → recordVerificationOutcome → ACTIVE (the ONLY ACTIVE path, on
 *   probe CONFIRMED alone) → N4 convergence (re-seed RESUMES the same
 *   id) → N5 restart record stability.
 *
 * Honest boundaries (recorded in the receipt):
 * - READ-ONLY: the probes observe provider state; no charge, transfer
 *   or any consequential operation exists for these providers in this
 *   wave (fail-closed by construction — refuseConsequential*Grant).
 * - SANDBOX only (INV-25): test-mode keys; no live corridor is touched
 *   or certified.
 * - N5 boundary: the RECORD store persists; unsealing across restarts
 *   is the substrate safeStorage migration path (the harness master key
 *   is per-run) — same boundary the U1 harness records.
 *
 * Credential law: the keys come ONLY from FLUTTERWAVE_SECRET_KEY and
 * PAYSTACK_SECRET_KEY (the station secret store); never echoed, never
 * in any receipt (machine-scanned).
 *
 * Exit codes: 0 = all gates held for both providers; 1 = failure;
 * 2 = one or both credentials not provided (the honest pre-gate state).
 *
 * Usage:
 *   FLUTTERWAVE_SECRET_KEY=… PAYSTACK_SECRET_KEY=… \
 *     pnpm exec tsx scripts/p14/c1-flw-paystack-probe-e2e.ts
 */

import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { createNodeConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/node-composition.js";
import type { ConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/index.js";
import { connectionCredentialStorageKey } from "../../packages/desktop/src/host/payswap/connections/credential-broker.js";
import {
  FlutterwaveHttpsTransport,
  PaystackHttpsTransport,
  createFlutterwaveVerificationProbe,
  createPaystackVerificationProbe,
  SystemRuntimeClock,
} from "../../packages/provider-runtime/src/index.js";

/** A REAL AES-256-GCM credential service (the substrate contract stand-in). */
function createAesGcmCredentialService() {
  const master = randomBytes(32);
  const store = new Map<string, string>();
  const seal = (plaintext: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", master, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
  };
  const open = (sealed: string): string => {
    const [ivB64, tagB64, dataB64] = sealed.split(".");
    const decipher = createDecipheriv("aes-256-gcm", master, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  };
  return {
    load: async (key: string): Promise<string | null> => {
      const sealed = store.get(key);
      return sealed === undefined ? null : open(sealed);
    },
    save: async (key: string, value: string): Promise<void> => {
      store.set(key, seal(value));
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
}

interface Gate {
  readonly held: boolean;
  readonly detail: string;
}

interface ProviderRun {
  readonly providerId: string;
  readonly gates: Record<string, Gate>;
  readonly probe: Record<string, unknown> | null;
  readonly connection: Record<string, unknown>;
  readonly honestNotes: string[];
  readonly secretValues: readonly string[];
}

interface ProviderPlan {
  readonly providerId: string;
  readonly label: string;
  readonly secretKey: string;
  readonly fakeLiveKey: string;
  readonly seal: (
    authority: ConnectionSessionAuthority,
    connectionId: string,
    secretKey: string,
  ) => Promise<unknown>;
  readonly runProbe: (
    authority: ConnectionSessionAuthority,
    connectionId: string,
    clock: SystemRuntimeClock,
  ) => Promise<{
    outcome: string;
    providerReferences: readonly string[];
    failure?: { code: string; message: string };
    ambiguityReason?: string;
    transportId: string;
    transportClass: string;
    latencyMs: number;
  }>;
  readonly evidenceOf: (probe: Awaited<ReturnType<ProviderPlan["runProbe"]>>) => string;
}

async function runProvider(plan: ProviderPlan): Promise<ProviderRun> {
  const gates: Record<string, Gate> = {};
  const honestNotes: string[] = [
    `credential source: the station secret store (${plan.providerId.toUpperCase()}_SECRET_KEY env); never chat, never echoed, never in this receipt`,
    "credential service: harness-local AES-256-GCM (node:crypto) standing in for the substrate safeStorage-backed service — the U1-harness boundary",
    "read-only slice: the probe observes provider state; NO Flutterwave/Paystack execution surface exists in this wave (fail-closed by construction)",
    "SANDBOX only (INV-25): test-mode keys; no live corridor is touched or certified",
  ];

  const workspaceDir = await mkdtemp(join(tmpdir(), `payswap-c1-${plan.providerId}-`));
  try {
    const authority = createNodeConnectionSessionAuthority({
      userDataDirectory: workspaceDir,
      credentialService: createAesGcmCredentialService(),
    });
    const useCase = { providerId: plan.providerId, useCaseRef: "own-store-test-mode" } as const;

    // ---- seed ----
    const seeded = await authority.seedConnectionSetup(useCase);
    if (seeded.kind !== "CREATED" && seeded.kind !== "RESUMED") {
      throw new Error(`connection seed refused: ${JSON.stringify(seeded)}`);
    }
    const connectionId = seeded.connectionId;
    let statuses = await authority.connectionStatuses();
    let current = statuses.find((s) => s.connectionId === connectionId);
    gates["N1-never-active-before-probe"] = {
      held: current?.state !== "ACTIVE",
      detail: `seeded state ${current?.state ?? "UNKNOWN"} (PROPOSED expected, never ACTIVE)`,
    };

    // ---- seal (the provider verb; the ONE material-carrying path) ----
    const sealReceipt = (await plan.seal(authority, connectionId, plan.secretKey)) as {
      nextState: string;
      credentialHandleRef: string;
      sealedSecretCount: number;
    };
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
    honestNotes.push(
      `broker storage-key law held: ${connectionCredentialStorageKey(connectionId)} (payswap.connection.<connectionId>.credential)`,
    );

    // ---- N2: INV-25 live-key refusal (fake live key, non-contiguous) ----
    try {
      await plan.seal(authority, connectionId, plan.fakeLiveKey);
      gates["N2-inv25-live-key-refused"] = {
        held: false,
        detail: "the fake LIVE key was NOT refused — INV-25 violation",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gates["N2-inv25-live-key-refused"] = {
        held: /INV-25|SANDBOX-only|test-mode secret key/i.test(message),
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
        "c1-escape-scan-control",
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

    // ---- THE REAL PROBE (inside the seal, through the REAL transport) ----
    const clock = new SystemRuntimeClock();
    const probeResult = await plan.runProbe(authority, connectionId, clock);
    gates["probe"] = {
      held: probeResult.outcome === "CONFIRMED",
      detail:
        probeResult.outcome === "CONFIRMED"
          ? `CONFIRMED — provider references ${probeResult.providerReferences.join(", ")}`
          : `outcome ${probeResult.outcome}${probeResult.failure ? ` (${probeResult.failure.code}: ${probeResult.failure.message})` : ""}${probeResult.ambiguityReason ? ` ambiguity ${probeResult.ambiguityReason}` : ""}`,
    };

    // ---- record the outcome (the ONLY ACTIVE path) ----
    await authority.recordVerificationOutcome({
      connectionId,
      outcome: probeResult.outcome as "CONFIRMED" | "UNKNOWN" | "FAILED",
      evidenceSummary: plan.evidenceOf(probeResult),
    });

    // ---- N4: convergence (re-seed RESUMES the same connection) ----
    const reseeded = await authority.seedConnectionSetup(useCase);
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

    // ---- N5: restart record stability (fresh authority, same dir) ----
    const freshAuthority = createNodeConnectionSessionAuthority({
      userDataDirectory: workspaceDir,
      credentialService: createAesGcmCredentialService(),
    });
    const freshStatuses = await freshAuthority.connectionStatuses();
    const freshCurrent = freshStatuses.find((s) => s.connectionId === connectionId);
    gates["N5-restart-record-stability"] = {
      held: freshCurrent?.state === "ACTIVE",
      detail: `fresh authority over the same dir → ${freshCurrent?.state ?? "UNKNOWN"} with ${freshCurrent?.transitionHistory?.length ?? 0} transitions`,
    };
    honestNotes.push(
      "N5 boundary: the RECORD store persists across restart; unsealing the credential blob across restarts is the substrate safeStorage migration path (out of the slice) — the harness master key is per-run",
    );

    const connection = {
      connectionId,
      finalState: current?.state ?? "UNKNOWN",
      transitionHistory: (current?.transitionHistory ?? []).map((t) => ({
        at: t.at,
        from: t.from,
        to: t.to,
        cause: t.cause,
      })),
    };

    return {
      providerId: plan.providerId,
      gates,
      probe: probeResult.outcome === "CONFIRMED" ? { ...probeResult } : { ...probeResult },
      connection,
      honestNotes,
      secretValues: [plan.secretKey, plan.fakeLiveKey],
    };
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const flutterwaveKey = process.env.FLUTTERWAVE_SECRET_KEY;
  const paystackKey = process.env.PAYSTACK_SECRET_KEY;
  const missing: string[] = [];
  if (typeof flutterwaveKey !== "string" || flutterwaveKey.trim() === "") {
    missing.push("FLUTTERWAVE_SECRET_KEY");
  }
  if (typeof paystackKey !== "string" || paystackKey.trim() === "") {
    missing.push("PAYSTACK_SECRET_KEY");
  }
  if (missing.length > 0) {
    console.error(
      `[c1-e2e] ${missing.join(" + ")} not provided — the Flutterwave/Paystack probe gates stay operator-gated. Nothing is simulated.`,
    );
    return 2;
  }

  const ranAt = new Date().toISOString();
  const plans: ProviderPlan[] = [
    {
      providerId: "flutterwave",
      label: "Flutterwave",
      secretKey: flutterwaveKey!,
      fakeLiveKey: "FLWSECK-" + "FAKE51liveDoNotUse0009",
      seal: (authority, connectionId, secretKey) =>
        authority.submitFlutterwaveSecretKey({ connectionId, secretKey }),
      runProbe: async (authority, connectionId, clock) => {
        const transport = new FlutterwaveHttpsTransport({ fetchImpl: globalThis.fetch });
        const probe = createFlutterwaveVerificationProbe({ transport, clock, executionMode: "SANDBOX" });
        const startedAt = Date.now();
        const result = await authority.withSealedCredential(connectionId, probe, "c1-flw-real-probe");
        return {
          outcome: result.outcome,
          providerReferences: result.providerReferences,
          failure: result.failure,
          ambiguityReason: result.ambiguityReason,
          transportId: result.transportId,
          transportClass: result.transportClass,
          latencyMs: Date.now() - startedAt,
        };
      },
      evidenceOf: (probe) =>
        probe.outcome === "CONFIRMED"
          ? `read-only balances probe CONFIRMED via ${probe.transportId} (${probe.transportClass}): wallets ${probe.providerReferences.join("/")}`
          : `read-only balances probe ${probe.outcome} — recorded honestly, no ACTIVE transition`,
    },
    {
      providerId: "paystack",
      label: "Paystack",
      secretKey: paystackKey!,
      fakeLiveKey: "sk" + "_live_FAKE51liveDoNotUse0010",
      seal: (authority, connectionId, secretKey) =>
        authority.submitPaystackSecretKey({ connectionId, secretKey }),
      runProbe: async (authority, connectionId, clock) => {
        const transport = new PaystackHttpsTransport({ fetchImpl: globalThis.fetch });
        const probe = createPaystackVerificationProbe({ transport, clock, executionMode: "SANDBOX" });
        const startedAt = Date.now();
        const result = await authority.withSealedCredential(connectionId, probe, "c1-paystack-real-probe");
        return {
          outcome: result.outcome,
          providerReferences: result.providerReferences,
          failure: result.failure,
          ambiguityReason: result.ambiguityReason,
          transportId: result.transportId,
          transportClass: result.transportClass,
          latencyMs: Date.now() - startedAt,
        };
      },
      evidenceOf: (probe) =>
        probe.outcome === "CONFIRMED"
          ? `read-only transactions probe CONFIRMED via ${probe.transportId} (${probe.transportClass}): ${probe.providerReferences.length} transaction reference(s) read`
          : `read-only transactions probe ${probe.outcome} — recorded honestly, no ACTIVE transition`,
    },
  ];

  const runs: ProviderRun[] = [];
  for (const plan of plans) {
    runs.push(await runProvider(plan));
  }

  const receipt = {
    harness: "p14-c1-flw-paystack-probe-e2e",
    ranAt,
    providers: runs.map((run) => ({
      providerId: run.providerId,
      gates: run.gates,
      probe: run.probe,
      connection: run.connection,
      honestNotes: run.honestNotes,
    })),
  };

  // The machine secret scan: no provider key (or fake key) may appear.
  const receiptJson = JSON.stringify(receipt, null, 2);
  for (const run of runs) {
    for (const secret of run.secretValues) {
      if (secret.length > 8 && receiptJson.includes(secret)) {
        throw new Error(`SECRET LEAK in the receipt (${run.providerId}) — refusing to emit`);
      }
    }
  }

  const receiptPath = process.env.C1_RECEIPT_PATH;
  if (receiptPath !== undefined && receiptPath !== "") {
    await mkdir(receiptPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
    await writeFile(receiptPath, receiptJson, "utf8");
  }
  console.log(receiptJson);

  const failedGates = runs.flatMap((run) =>
    Object.entries(run.gates)
      .filter(([, gate]) => !gate.held)
      .map(([gateId]) => `${run.providerId}:${gateId}`),
  );
  if (failedGates.length > 0) {
    console.error(`[c1-e2e] GATE FAILURES — ${failedGates.join(", ")}`);
    return 1;
  }
  console.error(
    `[c1-e2e] ALL GATES HELD for both providers — Flutterwave + Paystack connections ACTIVE on real read-only probe evidence`,
  );
  return 0;
}

main().then(
  (code) => {
    process.exit(code);
  },
  (error) => {
    console.error("[c1-e2e] harness error:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
