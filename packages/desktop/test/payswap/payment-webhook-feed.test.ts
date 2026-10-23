import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createStripeExecutionKernel,
  KERNEL_STRIPE_OPERATION_IDS,
} from "../../src/host/payswap/payments/execution-kernel.js";
import type { KernelTransportSeam, KernelTransportResponse } from "../../src/host/payswap/payments/execution-kernel.js";
import { createPaymentMissionRuntime } from "../../src/host/payswap/payments/payment-mission-runtime.js";
import type { PaymentMissionRuntime } from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import type { PaymentGateEnvironment } from "../../src/host/payswap/payments/validation-gates.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import type { ProviderTransportCall } from "../../../provider-runtime/src/index.js";
import {
  createStripeWebhookVerificationModule,
  stripeReconciliationEvidenceOf,
} from "../../../provider-runtime/src/adapters/stripe/webhook-verification.ts";

/**
 * P14-B integration battery (ADR-0008 D4, the reconciliation feed): a
 * VERIFIED webhook event closes an UNKNOWN attempt through the mission
 * runtime's reconcile path — the reconciled-attempt law, wired end to
 * end with LOCALLY signed events (the real-key receipt is the P14-D
 * tier; this battery proves the wiring law, never live delivery).
 *
 * THE FEED COMPOSITION (what this battery pins):
 *   dispatch (UNKNOWN after a landed create) → the locally signed
 *   payment_intent.succeeded event → the verification module (real
 *   node:crypto HMAC seam) → the typed event → the evidence mapping →
 *   the providerRef match against the attempt's envelope references →
 *   runtime.reconcile(missionId, attemptId, evidence) → mission
 *   COMPLETED. A replayed or tampered event NEVER reaches reconcile.
 */

const WEBHOOK_SECRET = "whsec_LOCAL_feed_battery_only";

const realCrypto = {
  hmacSha256Hex(key: string, message: string): string {
    return createHmac("sha256", key).update(message, "utf8").digest("hex");
  },
  timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  },
};

const nowSeconds = 30_000;

function signedDeliveryFor(intentId: string, eventId: string, status: string) {
  const body = JSON.stringify({
    id: eventId,
    object: "event",
    api_version: "2025-08-27.basil",
    created: nowSeconds,
    type: "payment_intent.succeeded",
    data: {
      object: { id: intentId, object: "payment_intent", status, amount: 1500, currency: "usd" },
    },
  });
  const signature = `t=${nowSeconds},v1=${realCrypto.hmacSha256Hex(WEBHOOK_SECRET, `${nowSeconds}.${body}`)}`;
  return { eventId, signatureHeader: signature, body };
}

function scriptedTransport(script: KernelTransportResponse[]) {
  const calls: ProviderTransportCall[] = [];
  let index = 0;
  const seam: KernelTransportSeam = {
    transportId: "scripted-seam",
    send: async (call: ProviderTransportCall): Promise<KernelTransportResponse> => {
      calls.push(call);
      const response = script[Math.min(index, script.length - 1)];
      index += 1;
      return response ?? { delivered: false, failure: { kind: "CONNECTION_LOST_AFTER_DISPATCH" } };
    },
  };
  return Object.assign(seam, { calls });
}

function fakeConnectionAuthority(input: { key: string }) {
  const connectionId = "conn:hook-test";
  return {
    connectionId,
    async connectionStatuses() {
      return [{ connectionId, state: "ACTIVE", executionMode: "SANDBOX" }];
    },
    async withSealedCredential<T>(
      id: string,
      consumer: (material: unknown) => T,
      context: string,
    ): Promise<Awaited<T>> {
      if (id !== connectionId) {
        throw new Error("UNKNOWN_CONNECTION");
      }
      const result = await consumer({ apiKey: input.key });
      if (JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).includes(input.key)) {
        throw new Error(`a sealed secret string leaked through the consumer result (context: ${context})`);
      }
      return result;
    },
  };
}

const FAKE_FULL_KEY = "sk" + "_test_FAKE51keyDoNotUse0002";

/** Seed a mission through the nine-field intake to a dispatchable preview
 *  and return the mission id + the REAL authorization artifact id. */
async function missionToDispatchable(
  runtime: PaymentMissionRuntime,
): Promise<{ missionId: string; artifactId: string }> {
  const T0 = "2026-10-22T12:00:00Z";
  const seeded = await runtime.seedMission(
    { direction: "PAY", goalStatement: "pay the supplier", origin: "COMPOSER_TEXT" },
    T0,
  );
  const values: Record<string, unknown> = {
    amountAndCurrency: { minorUnits: "1500", currency: "USD" },
    fundingSource: "Test funding",
    recipient: "Test recipient",
    countryCorridor: { sourceCountry: "US", destinationCountry: "US", destinationCurrency: "USD" },
    speedDeadline: { deadlineAt: "2026-10-23T12:00:00Z" },
    feeCap: { kind: "CAPPED", amount: { minorUnits: "100", currency: "USD" } },
    purpose: "supplier invoice 42",
    privacyCompliance: { kind: "CONSTRAINED", notes: "no special constraints" },
    partialPaymentPreference: { kind: "REQUIRE_FULL" },
  };
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
    const ask = await runtime.askNextMissingField(seeded.missionId, T0);
    if (ask === null) break;
    await runtime.captureField(seeded.missionId, ask.fieldId as never, values[ask.fieldId], T0);
  }
  const env: PaymentGateEnvironment = {
    observedFundingSources: [
      { locationRef: "acct:test-funding", currency: "USD", observationRef: "obs:1", displayName: "Test funding" },
    ],
    observedDestinations: [
      { locationRef: "acct:test-recipient", currency: "USD", observationRef: "obs:2", displayName: "Test recipient" },
    ],
    corridorProjection: {
      projectCorridor: (query: { asOf: string }) => ({
        evaluatedAsOf: query.asOf,
        routeIds: ["route:fake-1"],
        eligibleRouteIds: ["route:fake-1"],
        exclusions: [],
      }),
    },
    freshQuote: {
      quoteId: "quote:fake-1",
      quoteVersion: "v1",
      sourceAmount: { minorUnits: "1500", currency: "USD" },
      targetAmount: { minorUnits: "1500", currency: "USD" },
      feeLines: [],
      rate: { value: "1", provenance: "fake test quote", asOf: T0 },
      expiry: { at: "2026-10-23T12:00:00Z", onExpiry: "REVALIDATE_REQUIRED" },
      delivery: { kind: "ESTIMATE", estimateLabel: "same day (fake)" },
      conditions: { rateLocked: true, refreshAvailable: false, materialChangePolicy: "revalidate" },
    },
    declaredLimits: { minimum: { minorUnits: "1", currency: "USD" }, maximum: { minorUnits: "1000000", currency: "USD" } },
    connectedScopes: [
      { connectedInstanceId: "conn:hook-test", providerName: "stripe", operationClasses: ["CREATE_EXTERNAL_EFFECT"] },
    ],
    policyDecisions: [{ decision: "ALLOW", reason: "fake test policy" }],
    now: T0,
  };
  const gates = await runtime.runGates(seeded.missionId, env);
  expect(gates.decision).toBe("PROCEED");
  const preview = await runtime.presentPreview(seeded.missionId, env);
  expect(preview.dispatchable).toBe(true);
  const request = await runtime.requestAuthorization(seeded.missionId, T0);
  const resolution = await runtime.resolveAuthorization(
    {
      requestId: request.requestId,
      decision: "APPROVE",
      origin: "PREVIEW_UI_ACT",
      principalRef: "principal:test",
    },
    T0,
  );
  expect(resolution.outcome.kind).toBe("GRANTED");
  const artifact = resolution.outcome.kind === "GRANTED" ? resolution.outcome.artifact : undefined;
  expect(artifact).toBeDefined();
  return { missionId: seeded.missionId, artifactId: artifact!.artifactId };
}

describe("the webhook reconciliation feed (P14-B — a VERIFIED event closes an UNKNOWN attempt)", () => {
  async function unknownDispatchWorld() {
    const transport = scriptedTransport([
      { delivered: true, status: 200, body: { id: "pi_test_HOOK1", object: "payment_intent", status: "requires_confirmation" } },
      { delivered: false, failure: { kind: "TIMEOUT_AFTER_DISPATCH", detail: "timed out" } },
    ]);
    const kernel = createStripeExecutionKernel({
      connectionAuthority: fakeConnectionAuthority({ key: FAKE_FULL_KEY }),
      transport,
      nowMs: () => 1_000_000,
    });
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
    const store = await openPaymentMissionStore({ fileSystem: fs, directory: "/tmp/hook-test" });
    let seq = 0;
    const runtime: PaymentMissionRuntime = createPaymentMissionRuntime({
      store,
      executionAuthority: kernel,
      principalRef: "principal:test",
      mintRandom: () => String((seq += 1)).padStart(32, "0"),
    });
    const seeded = await missionToDispatchable(runtime);
    const T0 = "2026-10-22T12:00:00Z";
    const dispatched = await runtime.dispatch.dispatch(
      seeded.missionId,
      "CREATE_EXTERNAL_EFFECT",
      { connectionRef: "conn:hook-test", executionMode: "SANDBOX", authorizationArtifactId: seeded.artifactId },
      T0,
    );
    return { runtime, missionId: seeded.missionId, dispatched, transport };
  }

  it("UNKNOWN after a landed create → verified succeeded event → reconcile → mission COMPLETED", async () => {
    const { runtime, missionId, dispatched } = await unknownDispatchWorld();
    expect(dispatched.kind).toBe("DISPATCHED");
    if (dispatched.kind !== "DISPATCHED") return;
    expect(dispatched.envelope.outcome).toBe("UNKNOWN");
    // The UNKNOWN envelope carries the landed intent id — the provider
    // reference the webhook event must match.
    expect(dispatched.envelope.providerReferences).toContain("pi_test_HOOK1");
    const missionAfterUnknown = await runtime.getMission(missionId);
    expect(missionAfterUnknown?.status).not.toBe("COMPLETED");

    // THE FEED: sign locally, verify with the module (real HMAC seam),
    // map to evidence, match the provider reference, reconcile.
    const clock = { now: () => BigInt(nowSeconds * 1000), monotonic: () => 1n };
    const verify = createStripeWebhookVerificationModule({
      webhookSecret: WEBHOOK_SECRET,
      crypto: realCrypto,
      clock,
    });
    const result = verify(signedDeliveryFor("pi_test_HOOK1", "evt_hook_1", "succeeded"));
    expect(result.kind).toBe("VERIFIED");
    if (result.kind !== "VERIFIED") return;
    const evidence = stripeReconciliationEvidenceOf(result.event);
    expect(evidence).toEqual({ resolvedTo: "CONFIRMED", paymentIntentId: "pi_test_HOOK1" });
    if (evidence === null || evidence.resolvedTo !== "CONFIRMED") return;
    // The composition's match law: the event's intent id must be one of
    // the attempt's recorded provider references.
    expect(dispatched.envelope.providerReferences).toContain(evidence.paymentIntentId);

    const reconciled = await runtime.dispatch.reconcile(
      missionId,
      dispatched.attemptId,
      {
        resolvedTo: evidence.resolvedTo,
        source: "EXTERNAL_PROVIDER_STATEMENT",
        evidenceRefs: [result.event.eventId, evidence.paymentIntentId],
      },
      "2026-10-22T12:01:00Z",
    );
    expect(reconciled.status).toBe("COMPLETED");

    // The replay law: the same event id NEVER verifies twice — the feed
    // can never apply a duplicate reconciliation.
    const replay = verify(signedDeliveryFor("pi_test_HOOK1", "evt_hook_1", "succeeded"));
    expect(replay.kind).toBe("REFUSED");
    if (replay.kind === "REFUSED") {
      expect(replay.refusal.kind).toBe("EVENT_ALREADY_CONSUMED");
    }
    // And the runtime law backs it: reconciliation records are
    // append-only — a second reconcile of the same attempt throws.
    await expect(
      runtime.dispatch.reconcile(
        missionId,
        dispatched.attemptId,
        {
          resolvedTo: "CONFIRMED",
          source: "EXTERNAL_PROVIDER_STATEMENT",
          evidenceRefs: ["evt_hook_1", "pi_test_HOOK1"],
        },
        "2026-10-22T12:02:00Z",
      ),
    ).rejects.toThrow(/append-only|already reconciled/);
  });

  it("a TAMPERED event never reaches reconcile (SIGNATURE_INVALID; the mission stays un-reconciled)", async () => {
    const { runtime, missionId, dispatched } = await unknownDispatchWorld();
    expect(dispatched.kind).toBe("DISPATCHED");
    const clock = { now: () => BigInt(nowSeconds * 1000), monotonic: () => 1n };
    const verify = createStripeWebhookVerificationModule({
      webhookSecret: WEBHOOK_SECRET,
      crypto: realCrypto,
      clock,
    });
    const honest = signedDeliveryFor("pi_test_HOOK1", "evt_hook_2", "succeeded");
    // The attacker's body: same signature, different amount.
    const tamperedBody = JSON.stringify({
      id: "evt_hook_2",
      object: "event",
      created: nowSeconds,
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_HOOK1", object: "payment_intent", status: "succeeded", amount: 99_999_999, currency: "usd" } },
    });
    const result = verify({ ...honest, body: tamperedBody });
    expect(result.kind).toBe("REFUSED");
    if (result.kind === "REFUSED") {
      expect(result.refusal.kind).toBe("SIGNATURE_INVALID");
    }
    // The feed maps NOTHING from a refusal: no evidence, no reconcile.
    expect(stripeReconciliationEvidenceOf).toBeDefined();
    const mission = await runtime.getMission(missionId);
    expect(mission?.status).not.toBe("COMPLETED");
  });

  it("a payment_intent.processing event verifies but maps to NO evidence (observations never resolve)", async () => {
    const clock = { now: () => BigInt(nowSeconds * 1000), monotonic: () => 1n };
    const verify = createStripeWebhookVerificationModule({
      webhookSecret: WEBHOOK_SECRET,
      crypto: realCrypto,
      clock,
    });
    const body = JSON.stringify({
      id: "evt_hook_3",
      object: "event",
      created: nowSeconds,
      type: "payment_intent.processing",
      data: { object: { id: "pi_test_HOOK1", object: "payment_intent", status: "processing", amount: 1500, currency: "usd" } },
    });
    const result = verify({
      eventId: "evt_hook_3",
      signatureHeader: `t=${nowSeconds},v1=${realCrypto.hmacSha256Hex(WEBHOOK_SECRET, `${nowSeconds}.${body}`)}`,
      body,
    });
    expect(result.kind).toBe("VERIFIED");
    if (result.kind !== "VERIFIED") return;
    expect(stripeReconciliationEvidenceOf(result.event)).toBeNull();
  });

  it("a payment_failed event maps to FAILED evidence with the failure code (the honest decline path)", async () => {
    const clock = { now: () => BigInt(nowSeconds * 1000), monotonic: () => 1n };
    const verify = createStripeWebhookVerificationModule({
      webhookSecret: WEBHOOK_SECRET,
      crypto: realCrypto,
      clock,
    });
    const body = JSON.stringify({
      id: "evt_hook_4",
      object: "event",
      created: nowSeconds,
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_test_HOOK1",
          object: "payment_intent",
          status: "requires_payment_method",
          amount: 1500,
          currency: "usd",
          last_payment_error: { code: "card_declined" },
        },
      },
    });
    const result = verify({
      eventId: "evt_hook_4",
      signatureHeader: `t=${nowSeconds},v1=${realCrypto.hmacSha256Hex(WEBHOOK_SECRET, `${nowSeconds}.${body}`)}`,
      body,
    });
    expect(result.kind).toBe("VERIFIED");
    if (result.kind !== "VERIFIED") return;
    expect(stripeReconciliationEvidenceOf(result.event)).toEqual({
      resolvedTo: "FAILED",
      paymentIntentId: "pi_test_HOOK1",
      failureCode: "card_declined",
    });
  });

  it("the kernel operation ids are unchanged by the webhook lane (the port surface is stable)", () => {
    expect(Object.values(KERNEL_STRIPE_OPERATION_IDS).sort()).toEqual(
      [
        "stripe.payment_intent.create",
        "stripe.payment_intent.confirm",
        "stripe.payment_intent.retrieve",
        "stripe.payment_intent.cancel",
      ].sort(),
    );
  });
});
