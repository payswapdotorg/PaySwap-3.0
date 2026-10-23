/**
 * P14-A REAL-FLOW EXECUTION E2E HARNESS (ADR-0008 D1/D2/D3).
 *
 * Runs the FULL consequential path FOR REAL in Stripe test mode, through
 * the REAL machinery end-to-end:
 *
 *   the U1 connection (seed → seal → the REAL read-only probe → ACTIVE)
 *   → the mission runtime (nine-field intake → six gates → preview →
 *   the explicit PREVIEW_UI_ACT authorization) → THE DISPATCH through
 *   the desktop execution kernel (inside the credential seal, via the
 *   REAL Stripe HTTPS transport): PaymentIntent create + confirm with
 *   the published test payment-method token → the CONFIRMED envelope →
 *   mission COMPLETED.
 *
 * Then verifies the provider evidence by READING the intent back (the
 * reconcile-read operation): status + metadata round-trip.
 *
 * Negative controls at this tier (honest scope): the restricted-key and
 * live-key grant refusals, the UNKNOWN-reconcile loop and the reversal
 * path are CONTRACT-TIER battery-proven (a fake restricted key cannot
 * honestly reach ACTIVE through the real probe; a succeeded intent
 * cannot be cancelled) — this harness proves the POSITIVE consequential
 * path only, and says so in the receipt.
 *
 * Credential law: the key comes ONLY from STRIPE_SECRET_KEY (the station
 * secret store); never echoed, never in any receipt (machine-scanned).
 *
 * Exit codes: 0 = the full path ran and CONFIRMED; 1 = failure;
 * 2 = credentials not provided (the honest pre-P13 state).
 *
 * Usage: STRIPE_SECRET_KEY=sk_test_… pnpm exec tsx scripts/p14/a1-stripe-execution-real-flow-e2e.ts
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { createNodeConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/node-composition.js";
import type { ConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/index.js";
import { createStripeExecutionKernel } from "../../packages/desktop/src/host/payswap/payments/execution-kernel.js";
import { createPaymentMissionRuntime } from "../../packages/desktop/src/host/payswap/payments/payment-mission-runtime.js";
import { openPaymentMissionStore } from "../../packages/desktop/src/host/payswap/payments/payment-mission-store.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../packages/desktop/src/host/payswap/payments/contracts.js";
import type { PaymentGateEnvironment } from "../../packages/desktop/src/host/payswap/payments/validation-gates.js";
import {
  StripeHttpsTransport,
  createStripePaymentExecution,
  createStripeVerificationProbe,
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

async function main(): Promise<number> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (typeof secretKey !== "string" || secretKey.trim() === "") {
    console.error("[a1-e2e] STRIPE_SECRET_KEY not provided — the execution real-flow gate stays operator-gated. Nothing is simulated.");
    return 2;
  }

  const workspaceDir = await mkdtemp(join(tmpdir(), "payswap-a1-execution-"));
  const ranAt = new Date().toISOString();
  const honestNotes: string[] = [
    "credential source: the station secret store (STRIPE_SECRET_KEY env); never chat, never echoed, never in this receipt",
    "credential service: harness-local AES-256-GCM (node:crypto) standing in for the substrate safeStorage-backed service — the U1-harness boundary",
    "gate-environment inputs: the funding source + connected scope are REAL (the probed account + the ACTIVE connection); the corridor projection, quote terms, limits and policy decision are DECLARED test-corridor inputs (recorded here — never presented as provider facts)",
    "negative controls (restricted-key/live-key grant refusals, UNKNOWN-reconcile, the reversal path) are CONTRACT-TIER battery-proven — this harness proves the positive consequential path only",
    "SANDBOX corridor only (INV-25): test mode, the published pm_card_visa test payment method; no live corridor is touched or certified",
  ];

  try {
    // ---- the REAL transport + clock ----
    const transport = new StripeHttpsTransport({ fetchImpl: globalThis.fetch });
    const clock = new SystemRuntimeClock();

    // ---- the U1 connection, for real (the P13 flow) ----
    const credentialService = createAesGcmCredentialService();
    const authority: ConnectionSessionAuthority = createNodeConnectionSessionAuthority({
      userDataDirectory: workspaceDir,
      credentialService,
    });
    const U1 = { providerId: "stripe", useCaseRef: "own-store-test-mode" } as const;
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED" && seeded.kind !== "RESUMED") {
      throw new Error(`connection seed refused: ${JSON.stringify(seeded)}`);
    }
    const connectionId = seeded.connectionId;
    await authority.submitStripeRestrictedKey({ connectionId, secretKey });
    const probe = createStripeVerificationProbe({ transport, clock, executionMode: "SANDBOX" });
    const probeResult = await authority.withSealedCredential(connectionId, probe, "a1-real-flow-connection-probe");
    if (probeResult.outcome !== "CONFIRMED") {
      throw new Error(`the connection probe did not confirm: ${probeResult.outcome}`);
    }
    await authority.recordVerificationOutcome({
      connectionId,
      outcome: "CONFIRMED",
      evidenceSummary: `read-only probe CONFIRMED via ${probeResult.transportId}: account ${probeResult.accountRef}`,
    });
    const statuses = await authority.connectionStatuses();
    const connection = statuses.find((s) => s.connectionId === connectionId);
    if (connection?.state !== "ACTIVE") {
      throw new Error(`the connection is not ACTIVE after the confirmed probe: ${connection?.state}`);
    }

    // ---- the kernel (the REAL transport behind the desktop port) ----
    const kernel = createStripeExecutionKernel({
      connectionAuthority: authority,
      transport,
    });

    // ---- the mission runtime (in-memory store over the harness fs) ----
    const files = new Map<string, string>();
    const fs = {
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
    const store = await openPaymentMissionStore({ fileSystem: fs, directory: join(workspaceDir, "missions") });
    const runtime = createPaymentMissionRuntime({
      store,
      executionAuthority: kernel,
      principalRef: "principal:operator",
    });

    // ---- the nine-field intake ----
    const T0 = new Date().toISOString();
    const missionSeed = await runtime.seedMission(
      { direction: "PAY", goalStatement: "pay the supplier (P14-A real-flow)", origin: "COMPOSER_TEXT" },
      T0,
    );
    const FUNDING_NAME = `Stripe test account ${probeResult.accountRef}`;
    const values: Record<string, unknown> = {
      amountAndCurrency: { minorUnits: "1500", currency: "USD" },
      fundingSource: FUNDING_NAME,
      recipient: "Test recipient",
      countryCorridor: { sourceCountry: "US", destinationCountry: "US", destinationCurrency: "USD" },
      speedDeadline: { deadlineAt: new Date(Date.now() + 86_400_000).toISOString() },
      feeCap: { kind: "CAPPED", amount: { minorUnits: "100", currency: "USD" } },
      purpose: "P14-A real-flow execution verification",
      privacyCompliance: { kind: "CONSTRAINED", notes: "no special constraints" },
      partialPaymentPreference: { kind: "REQUIRE_FULL" },
    };
    for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
      const ask = await runtime.askNextMissingField(missionSeed.missionId, T0);
      if (ask === null) break;
      await runtime.captureField(missionSeed.missionId, ask.fieldId as never, values[ask.fieldId], T0);
    }

    // ---- the gates (REAL funding source + connection scope; declared corridor inputs) ----
    const env: PaymentGateEnvironment = {
      observedFundingSources: [
        { locationRef: probeResult.accountRef ?? "acct:unknown", currency: "USD", observationRef: `probe:${probeResult.accountRef}`, displayName: FUNDING_NAME },
      ],
      observedDestinations: [
        { locationRef: "acct:test-recipient", currency: "USD", observationRef: "declared:test-recipient", displayName: "Test recipient" },
      ],
      corridorProjection: {
        projectCorridor: (query: { asOf: string }) => ({
          evaluatedAsOf: query.asOf,
          routeIds: ["route:declared-us-us-test"],
          eligibleRouteIds: ["route:declared-us-us-test"],
          exclusions: [],
        }),
      },
      freshQuote: {
        quoteId: "quote:declared-test-1",
        quoteVersion: "v1",
        sourceAmount: { minorUnits: "1500", currency: "USD" },
        targetAmount: { minorUnits: "1500", currency: "USD" },
        feeLines: [],
        rate: { value: "1", provenance: "declared test-corridor quote (P14-A harness)", asOf: T0 },
        expiry: { at: new Date(Date.now() + 3_600_000).toISOString(), onExpiry: "REVALIDATE_REQUIRED" },
        delivery: { kind: "ESTIMATE", estimateLabel: "immediate (test corridor)" },
        conditions: { rateLocked: true, refreshAvailable: false, materialChangePolicy: "revalidate" },
      },
      declaredLimits: { minimum: { minorUnits: "1", currency: "USD" }, maximum: { minorUnits: "1000000", currency: "USD" } },
      connectedScopes: [
        { connectedInstanceId: connectionId, providerName: "stripe", operationClasses: ["CREATE_EXTERNAL_EFFECT"] },
      ],
      policyDecisions: [{ decision: "ALLOW", reason: "declared test-corridor policy (P14-A harness)" }],
      now: T0,
    };
    const gates = await runtime.runGates(missionSeed.missionId, env);
    if (gates.decision !== "PROCEED") {
      throw new Error(`the gates blocked the mission: ${JSON.stringify(gates.reasons)}`);
    }
    const preview = await runtime.presentPreview(missionSeed.missionId, env);
    if (!preview.dispatchable) {
      throw new Error("the preview is not dispatchable");
    }

    // ---- the explicit scoped authorization (PREVIEW_UI_ACT — never NLP) ----
    const request = await runtime.requestAuthorization(missionSeed.missionId, T0);
    const resolution = await runtime.resolveAuthorization(
      { requestId: request.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT", principalRef: "principal:operator" },
      T0,
    );
    if (resolution.outcome.kind !== "GRANTED") {
      throw new Error(`the authorization was not granted: ${JSON.stringify(resolution.outcome)}`);
    }
    const artifact = resolution.outcome.artifact;

    // ---- THE DISPATCH — the real test-mode consequential effect ----
    const dispatchStartedAt = Date.now();
    const dispatched = await runtime.dispatch.dispatch(
      missionSeed.missionId,
      "CREATE_EXTERNAL_EFFECT",
      { connectionRef: connectionId, executionMode: "SANDBOX", authorizationArtifactId: artifact.artifactId },
      T0,
    );
    const dispatchLatencyMs = Date.now() - dispatchStartedAt;
    if (dispatched.kind !== "DISPATCHED") {
      throw new Error(`the dispatch did not complete: ${JSON.stringify(dispatched)}`);
    }
    const envelope = dispatched.envelope;
    if (envelope.outcome !== "CONFIRMED") {
      throw new Error(`the dispatch envelope is not CONFIRMED: ${JSON.stringify(envelope)}`);
    }
    const paymentIntentId = envelope.providerReferences[0] ?? null;
    const mission = await runtime.getMission(missionSeed.missionId);
    if (mission?.status !== "COMPLETED") {
      throw new Error(`the mission is not COMPLETED: ${mission?.status}`);
    }

    // ---- the provider-evidence read-back (the reconcile operation) ----
    const execution = createStripePaymentExecution({ transport, clock, executionMode: "SANDBOX" });
    const readBack = await authority.withSealedCredential(
      connectionId,
      (material) => execution.retrieve(material, paymentIntentId ?? ""),
      "a1-real-flow-readback",
    );
    if (readBack.outcome !== "CONFIRMED" || readBack.paymentIntentStatus !== "succeeded") {
      throw new Error(`the read-back did not confirm success: ${JSON.stringify(readBack)}`);
    }

    // ---- the receipt (secret-free) ----
    const receipt = {
      harness: "p14-a1-stripe-execution-real-flow-e2e",
      ranAt,
      connection: { connectionId, state: "ACTIVE", verifiedVia: `probe CONFIRMED (${probeResult.accountRef})` },
      mission: {
        missionId: missionSeed.missionId,
        finalStatus: mission.status,
        authorizationOrigin: "PREVIEW_UI_ACT",
        attemptCount: mission.attempts.length,
      },
      dispatch: {
        outcome: envelope.outcome,
        providerReferences: envelope.providerReferences,
        paymentIntentId,
        paymentIntentStatus: readBack.paymentIntentStatus,
        dispatchLatencyMs,
        envelopeDispatchedAt: envelope.dispatchedAt,
        envelopeCompletedAt: envelope.completedAt,
      },
      readBack: {
        operation: "stripe.payment_intent.retrieve",
        status: readBack.paymentIntentStatus,
        providerReferences: readBack.providerReferences,
      },
      honestNotes,
    };
    const receiptJson = JSON.stringify(receipt, null, 2);
    if (receiptJson.includes(secretKey)) {
      throw new Error("SECRET LEAK in the receipt — refusing to emit");
    }
    const receiptPath = process.env.A1_RECEIPT_PATH;
    if (receiptPath !== undefined && receiptPath !== "") {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(receiptPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
      await writeFile(receiptPath, receiptJson, "utf8");
    }
    console.log(receiptJson);
    console.error(`[a1-e2e] FULL CONSEQUENTIAL PATH GREEN — mission ${missionSeed.missionId} COMPLETED; intent ${paymentIntentId} succeeded (read-back verified)`);
    return 0;
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

main().then(
  (code) => {
    process.exit(code);
  },
  (error) => {
    console.error("[a1-e2e] harness error:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
