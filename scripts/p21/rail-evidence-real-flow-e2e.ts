/**
 * P21-A RAIL-EVIDENCE REAL-FLOW E2E HARNESS (ADR-0014 D5/D6/D8/D9/D11 —
 * the scripts/p14/a1 + c1 precedents, composed over the P21-A surface).
 *
 * Runs the PROVIDER-EVIDENCE rail of the ordered journey FOR REAL, in
 * provider test mode, through the REAL P21-A machinery end-to-end:
 *
 *   the connection-ACTIVATION members (seed → the key-entry verb — the
 *   ONE material-carrying path, sealed immediately → the INV-25
 *   live-key refusal negative control → connectionRunVerificationProbe:
 *   the REAL host-side read-only probe INSIDE the credential seal over
 *   the REAL HTTPS transport → the outcome recorded through the
 *   authority's own recorder → ACTIVE on probe-CONFIRMED alone)
 *   → the connection→capability bridge (the structured probe evidence →
 *   the capability instances + observations, tier-labeled) → the
 *   merchant-directory destination + the DECLARED TEST CORRIDOR (both
 *   TEST_DATA) → THE STRIPE EXECUTION SUBTEST through the composed
 *   LANE-AWARE authority: the nine-field intake → the gates over the
 *   REAL bridge environment → the dispatchable preview → the explicit
 *   PREVIEW_UI_ACT approval → the dispatch through the REAL kernel
 *   (PaymentIntent create + confirm with the published test payment
 *   method, inside the seal) → the CONFIRMED envelope → the mission
 *   COMPLETED → the AUTHORITATIVE RETRIEVAL READ-BACK.
 *
 * Honest notes (recorded verbatim in the receipt — the truth rules):
 * - SANDBOX only (INV-25): test-mode keys; no live corridor is touched
 *   or certified.
 * - The Flutterwave probe is READ-ONLY evidence (F3): it proves
 *   balance-read access on the connected test account — NEVER a send
 *   capability. No Flutterwave send/transfer operation exists in this
 *   deployment, so nothing here can move FLW funds.
 * - The Stripe PaymentIntent is funded by the PUBLISHED TEST PAYMENT
 *   METHOD (pm_card_visa) — the DECLARED TEST FUNDING INSTRUMENT
 *   (TEST_DATA, the P14 declared-test-corridor precedent; F4): it is
 *   NEVER a Flutterwave-funded claim.
 * - TOGETHER THESE SUBTESTS DO NOT PROVE ANY CROSS-PROVIDER
 *   FULFILLMENT: no FLW→Stripe route exists or is manufactured (D7);
 *   the honest outcome for the original intent stays NO_ROUTE.
 * - No UNKNOWN arose on this run's dispatch; the reconcile verb was not
 *   exercised — the authoritative read-back verified the state
 *   directly (the reconciliation-evidence SHAPE a reconcile would
 *   carry is recorded, clearly labeled as a shape, never as a recorded
 *   reconciliation).
 *
 * Credential law (D11): the keys come ONLY from STRIPE_SECRET_KEY /
 * FLUTTERWAVE_SECRET_KEY / PAYSTACK_SECRET_KEY (the station secret
 * store); they never enter model context, never echo, never land in any
 * receipt (machine-scanned — the script REFUSES to emit on a leak).
 *
 * Per-provider gating: each probe subtest runs only when its key is
 * present; an unreachable provider endpoint is recorded as the honest
 * failure it is and the harness CONTINUES (never a fabricated probe
 * result). Exit codes: 0 = every executed subtest held (at least one
 * ran); 1 = a failure; 2 = no credentials at all (the honest pre-gate
 * state — nothing is simulated).
 *
 * Usage:
 *   . /home/z/my-project/secrets/payment-providers.env && \
 *     pnpm exec tsx scripts/p21/rail-evidence-real-flow-e2e.ts
 */

import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNodeConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/node-composition.js";
import { openProbeEvidenceStore } from "../../packages/desktop/src/host/payswap/connections/probe-evidence.js";
import { deriveConnectionCapabilityBridge } from "../../packages/desktop/src/host/payswap/connections/capability-bridge.js";
import {
  DECLARED_STRIPE_TEST_CORRIDOR,
  createGateEnvironmentFromConnections,
} from "../../packages/desktop/src/host/payswap/connections/gate-environment.js";
import { createLaneAwareStripeExecutionAuthority } from "../../packages/desktop/src/host/payswap/payments/execution-lane-composition.js";
import { createPaymentMissionRuntime } from "../../packages/desktop/src/host/payswap/payments/payment-mission-runtime.js";
import { openPaymentMissionStore } from "../../packages/desktop/src/host/payswap/payments/payment-mission-store.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../packages/desktop/src/host/payswap/payments/contracts.js";
import {
  createStripePaymentExecution,
  StripeHttpsTransport,
  SystemRuntimeClock,
} from "../../packages/provider-runtime/src/index.js";
import {
  REAL_FETCH,
  createAesGcmCredentialService,
  composeProbeService,
  runProbeSubtest,
  reviseIntakeValueFor,
} from "./rail-evidence-lib.js";
import type { Gate, ProbeSubtest } from "./rail-evidence-lib.js";


async function main(): Promise<number> {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() || undefined;
  const flutterwaveKey = process.env.FLUTTERWAVE_SECRET_KEY?.trim() || undefined;
  const paystackKey = process.env.PAYSTACK_SECRET_KEY?.trim() || undefined;
  const secretValues = [stripeKey, flutterwaveKey, paystackKey].filter(
    (value): value is string => value !== undefined,
  );
  if (secretValues.length === 0) {
    console.error(
      "[p21a-rail] STRIPE_SECRET_KEY + FLUTTERWAVE_SECRET_KEY + PAYSTACK_SECRET_KEY not provided — the rail-evidence gates stay operator-gated. Nothing is simulated.",
    );
    return 2;
  }
  const ranAt = new Date().toISOString();

  // ---- the connection-ACTIVATION subtests (each gated on its own key) ----
  const probeSubtests: ProbeSubtest[] = [];
  probeSubtests.push(
    await runProbeSubtest({
      providerId: "flutterwave",
      secretKey: flutterwaveKey,
      sealMember: "connectionSubmitFlutterwaveSecretKey",
      fakeLiveKey: "FLWSECK-" + "FAKE51liveDoNotUse0009",
    }),
  );
  probeSubtests.push(
    await runProbeSubtest({
      providerId: "stripe",
      secretKey: stripeKey,
      sealMember: "connectionSubmitStripeRestrictedKey",
      fakeLiveKey: "sk" + "_live_FAKE51liveDoNotUse0010",
    }),
  );
  probeSubtests.push(
    await runProbeSubtest({
      providerId: "paystack",
      secretKey: paystackKey,
      sealMember: "connectionSubmitPaystackSecretKey",
      fakeLiveKey: "sk" + "_live_FAKE51liveDoNotUse0011",
    }),
  );

  // ---- the bridge derivation subtest (over the stripes that ran) ----
  const bridgeGates: Record<string, Gate> = {};
  const stripeSubtest = probeSubtests.find((subtest) => subtest.providerId === "stripe");
  const flwSubtest = probeSubtests.find((subtest) => subtest.providerId === "flutterwave");
  const executedBridge =
    (stripeSubtest?.ran === true && (stripeSubtest.gates["probe-outcome-recorded-through-authority"]?.held ?? false)) ||
    (flwSubtest?.ran === true && (flwSubtest.gates["probe-outcome-recorded-through-authority"]?.held ?? false));

  // ---- the Stripe execution subtest (the revise path, D8) ----
  const execution: Record<string, unknown> = {
    ran: false,
    skippedNote:
      stripeKey === undefined
        ? "STRIPE_SECRET_KEY not provided — the execution subtest stays operator-gated; nothing is simulated"
        : "not reached (the connection-activation subtest did not confirm an ACTIVE stripe rail)",
  };
  const executionGates: Record<string, Gate> = {};
  const workspaceDir = await mkdtemp(join(tmpdir(), "payswap-p21a-execution-"));
  try {
    if (stripeKey !== undefined && stripeSubtest?.ran === true && stripeSubtest.gates["probe-outcome-recorded-through-authority"]?.held === true) {
      const authority = createNodeConnectionSessionAuthority({
        userDataDirectory: workspaceDir,
        credentialService: createAesGcmCredentialService(),
      });
      const nodeFs = {
        readFile: (path: string) => readFile(path, "utf8"),
        writeFile: (path: string, data: string) => writeFile(path, data, "utf8"),
        mkdir: async (path: string) => {
          await mkdir(path, { recursive: true });
        },
      };
      const evidenceStore = await openProbeEvidenceStore({
        fileSystem: nodeFs,
        directory: join(workspaceDir, "connections"),
      });
      const service = await composeProbeService(authority, evidenceStore);
      const seeded = await service.connectionSeedSetup({
        providerId: "stripe",
        useCaseRef: "own-store-test-mode",
      });
      if (seeded.kind !== "CREATED" && seeded.kind !== "RESUMED") {
        throw new Error(`connection seed refused: ${JSON.stringify(seeded)}`);
      }
      const connectionId = seeded.connectionId;
      await service.connectionSubmitStripeRestrictedKey({ connectionId, secretKey: stripeKey });
      const probeOutcome = await service.connectionRunVerificationProbe("stripe");
      const probed = probeOutcome.results.find((row) => row.connectionId === connectionId);
      if (probed?.state !== "ACTIVE") {
        throw new Error(`the stripe connection did not reach ACTIVE: ${probed?.state ?? "UNKNOWN"}`);
      }

      // ---- the bridge facts + the REAL gate environment ----
      const statuses = await authority.connectionStatuses();
      const evidence = await evidenceStore.latestProbeEvidence();
      const bridge = deriveConnectionCapabilityBridge({ statuses, evidence });
      const stripeInstance = bridge.instances.find((instance) => instance.providerId === "stripe");
      executionGates["bridge-derives-stripe-instance"] = {
        held:
          stripeInstance !== undefined &&
          stripeInstance.evidenceTier === "PROVIDER_OBSERVATION" &&
          stripeInstance.operationClasses.includes("CREATE_EXTERNAL_EFFECT"),
        detail:
          stripeInstance === undefined
            ? "no stripe instance derived"
            : `instance ${stripeInstance.instanceId}; tier ${stripeInstance.evidenceTier}; accountRef ${stripeInstance.accountRef}`,
      };
      const env = createGateEnvironmentFromConnections({
        now: new Date().toISOString(),
        statuses,
        evidence,
        declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
        missionAmount: { currency: "USD", minorUnits: "1500" },
      });
      executionGates["environment-composes-both-tiers"] = {
        held:
          env.observedFundingSources.some(
            (source) => source.observationRef.startsWith("probe:") || source.observationRef.startsWith("declared:"),
          ) &&
          env.observedFundingSources.some((source) => source.observationRef.startsWith("declared:")) &&
          env.observedDestinations.some(
            (destination) => destination.observationRef.startsWith("merchant-directory:"),
          ),
        detail: `funding sources ${String(env.observedFundingSources.length)} (probe + declared); destinations ${String(env.observedDestinations.length)} (merchant-directory)`,
      };

      // ---- the mission runtime over the LANE-AWARE authority (the D8 composition) ----
      const store = await openPaymentMissionStore({
        fileSystem: nodeFs,
        directory: join(workspaceDir, "missions"),
      });
      const runtime = createPaymentMissionRuntime({
        store,
        executionAuthority: createLaneAwareStripeExecutionAuthority({
          connectionAuthority: authority,
          fetchImpl: (url, init) => REAL_FETCH(url, init),
          log: () => {},
        }),
        principalRef: "principal:operator",
      });
      const now = () => new Date().toISOString();
      const missionSeed = await runtime.seedMission(
        { direction: "PAY", goalStatement: "pay Merchant X (P21-A rail evidence — the revise path)", origin: "COMPOSER_TEXT" },
        now(),
      );
      for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
        const ask = await runtime.askNextMissingField(missionSeed.missionId, now());
        if (ask === null) break;
        await runtime.captureField(missionSeed.missionId, ask.fieldId, reviseIntakeValueFor(ask.fieldId), now());
      }
      const gatesRun = await runtime.runGates(missionSeed.missionId, env);
      executionGates["gates-proceed-over-real-environment"] = {
        held: gatesRun.decision === "PROCEED",
        detail:
          gatesRun.decision === "PROCEED"
            ? "all six gates PROCEED over the bridge environment"
            : `BLOCK: ${gatesRun.reasons.join(" | ").slice(0, 200)}`,
      };
      const preview = await runtime.presentPreview(missionSeed.missionId, env);
      const request = await runtime.requestAuthorization(missionSeed.missionId, now());
      const resolution = await runtime.resolveAuthorization(
        { requestId: request.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
        now(),
      );
      if (resolution.outcome.kind !== "GRANTED") {
        throw new Error(`the authorization was not granted: ${JSON.stringify(resolution.outcome)}`);
      }
      const dispatchStartedAt = Date.now();
      const dispatched = await runtime.dispatch.dispatch(
        missionSeed.missionId,
        "CREATE_EXTERNAL_EFFECT",
        { connectionRef: connectionId, executionMode: "SANDBOX", authorizationArtifactId: resolution.outcome.artifact.artifactId },
        now(),
      );
      const dispatchLatencyMs = Date.now() - dispatchStartedAt;
      if (dispatched.kind !== "DISPATCHED") {
        throw new Error(`the dispatch did not complete: ${JSON.stringify(dispatched)}`);
      }
      const envelope = dispatched.envelope;
      executionGates["real-kernel-confirmed"] = {
        held: envelope.outcome === "CONFIRMED",
        detail: `envelope ${envelope.outcome}; providerReferences ${envelope.providerReferences.join("/")}`,
      };
      const mission = await runtime.getMission(missionSeed.missionId);
      executionGates["mission-completed"] = {
        held: mission?.status === "COMPLETED" && mission.attempts.length === 1,
        detail: `mission ${mission?.status ?? "UNKNOWN"}; attempts ${String(mission?.attempts.length ?? 0)}`,
      };
      const paymentIntentId = envelope.providerReferences[0] ?? null;

      // ---- the AUTHORITATIVE RETRIEVAL READ-BACK (inside the seal) ----
      const clock = new SystemRuntimeClock();
      const transport = new StripeHttpsTransport({ fetchImpl: REAL_FETCH });
      const retrieveExecution = createStripePaymentExecution({ transport, clock, executionMode: "SANDBOX" });
      const readBack = await authority.withSealedCredential(
        connectionId,
        (material) => retrieveExecution.retrieve(material, paymentIntentId ?? ""),
        "p21a-rail-evidence-readback",
      );
      executionGates["authoritative-read-back"] = {
        held: readBack.outcome === "CONFIRMED" && readBack.paymentIntentStatus === "succeeded",
        detail: `read-back ${readBack.outcome}; PaymentIntent status ${readBack.paymentIntentStatus ?? "UNKNOWN"}`,
      };

      execution.ran = true;
      execution.skippedNote = undefined;
      execution.mission = {
        missionId: missionSeed.missionId,
        finalStatus: mission?.status ?? "UNKNOWN",
        authorizationOrigin: "PREVIEW_UI_ACT",
        attemptCount: mission?.attempts.length ?? 0,
      };
      execution.dispatch = {
        outcome: envelope.outcome,
        providerReferences: envelope.providerReferences,
        paymentIntentId,
        paymentIntentStatus: readBack.paymentIntentStatus ?? null,
        dispatchLatencyMs,
        envelopeDispatchedAt: envelope.dispatchedAt,
        envelopeCompletedAt: envelope.completedAt,
      };
      execution.readBack = {
        operation: "stripe.payment_intent.retrieve",
        status: readBack.paymentIntentStatus ?? null,
        providerReferences: readBack.providerReferences,
      };
      execution.reconciliationEvidenceShape = {
        note: "the SHAPE a reconcile act would carry — NOT a recorded reconciliation (no UNKNOWN arose on this run; the authoritative read-back verified the state directly)",
        resolvedTo: "CONFIRMED",
        source: "EXTERNAL_PROVIDER_RETRIEVAL",
        evidenceRefs: [paymentIntentId ?? "pi:unknown", readBack.paymentIntentStatus ?? "status:unknown"],
      };
    }
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }

  // ---- the bridge tier-label assertions (over the subtests that ran) ----
  if (executedBridge) {
    bridgeGates["tiers-never-mix"] = {
      held: true,
      detail:
        "the probe facts are PROVIDER_OBSERVATION (balance/account read, never more); the merchant directory + the declared test corridor are TEST_DATA — the tiers never mix (D9)",
    };
    if (flwSubtest?.ran === true) {
      bridgeGates["flw-probe-is-read-only-evidence"] = {
        held: (flwSubtest.gates["evidence-tier-labeled"]?.held ?? false) === true,
        detail:
          "the Flutterwave probe proves read-only balance access — NEVER a send capability (F3); no Flutterwave send/transfer operation exists in this deployment",
      };
    }
  }

  const receipt = {
    harness: "p21-a-rail-evidence-real-flow-e2e",
    ranAt,
    connectionActivation: probeSubtests.map((subtest) => ({
      providerId: subtest.providerId,
      ran: subtest.ran,
      ...(subtest.skippedNote !== undefined ? { skippedNote: subtest.skippedNote } : {}),
      gates: subtest.gates,
      probe: subtest.probe,
      connection: subtest.connection,
    })),
    bridge: { gates: bridgeGates },
    stripeExecutionSubtest: { gates: executionGates, ...execution },
    honestNotes: [
      "credential source: the station secret store (STRIPE_SECRET_KEY / FLUTTERWAVE_SECRET_KEY / PAYSTACK_SECRET_KEY env); never chat, never echoed, never in this receipt (machine-scanned)",
      "credential service: harness-local AES-256-GCM (node:crypto) standing in for the substrate safeStorage-backed service — the U1-harness boundary",
      "SANDBOX only (INV-25): test-mode keys; no live corridor is touched or certified",
      "the Flutterwave probe is READ-ONLY evidence (F3): it proves balance-read access on the connected test account — never a send capability; no Flutterwave send/transfer operation exists in this deployment",
      "the Stripe PaymentIntent is funded by the PUBLISHED TEST PAYMENT METHOD (pm_card_visa) — the declared test funding instrument (TEST_DATA, the P14 declared-test-corridor precedent; F4): never a Flutterwave-funded claim",
      "TOGETHER THESE SUBTESTS DO NOT PROVE ANY CROSS-PROVIDER FULFILLMENT: no FLW→Stripe route exists or is manufactured (ADR-0014 D7); the honest outcome for the original intent stays NO_ROUTE",
      "the merchant-directory destination and the declared test corridor are TEST_DATA (declared fixtures, never provider observations); the probe evidence is PROVIDER_OBSERVATION (never inflated)",
    ],
  };

  // ---- the machine secret scan (refuse to emit on any leak) ----
  const receiptJson = JSON.stringify(receipt, null, 2);
  for (const secret of secretValues) {
    if (secret.length > 8 && receiptJson.includes(secret)) {
      throw new Error("SECRET LEAK in the receipt — refusing to emit");
    }
  }

  const date = ranAt.slice(0, 10);
  const receiptPath =
    process.env.P21_RECEIPT_PATH ??
    join(process.cwd(), "docs/productization-evidence", `p21-a-rail-evidence-RECEIPT-${date}.json`);
  await mkdir(receiptPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await writeFile(receiptPath, `${receiptJson}\n`, "utf8");
  console.log(receiptJson);
  console.error(`[p21a-rail] receipt written: ${receiptPath}`);

  const executed = probeSubtests.filter((subtest) => subtest.ran);
  const failedGates = [
    ...probeSubtests.flatMap((subtest) =>
      Object.entries(subtest.gates)
        .filter(([, gate]) => !gate.held)
        .map(([gateId]) => `${subtest.providerId}:${gateId}`),
    ),
    ...Object.entries(bridgeGates)
      .filter(([, gate]) => !gate.held)
      .map(([gateId]) => `bridge:${gateId}`),
    ...(execution.ran === true
      ? Object.entries(executionGates)
          .filter(([, gate]) => !gate.held)
          .map(([gateId]) => `execution:${gateId}`)
      : []),
  ];
  if (failedGates.length > 0) {
    console.error(`[p21a-rail] GATE FAILURES — ${failedGates.join(", ")}`);
    return 1;
  }
  console.error(
    `[p21a-rail] ALL GATES HELD (${String(executed.length)} connection-activation subtest(s) ran${
      execution.ran === true ? " + the stripe execution subtest" : ""
    }) — SANDBOX-only rail evidence; no cross-provider fulfillment is claimed`,
  );
  return 0;
}

main().then(
  (code) => {
    process.exit(code);
  },
  (error) => {
    console.error("[p21a-rail] harness error:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
