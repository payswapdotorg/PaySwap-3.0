/**
 * P14-B REAL-KEY WEBHOOK VERIFICATION RECEIPT HARNESS (ADR-0008 D4).
 *
 * Signs events LOCALLY with the REAL operator whsec_ endpoint secret and
 * runs the full verification machinery against them — the machinery is
 * verified with REAL key material (the same HMAC-SHA256 scheme a live
 * Stripe delivery would carry).
 *
 * THE HONEST DELIVERY BOUNDARY (verbatim, the ADR-0008 D4 law): no
 * inbound public endpoint exists in this station, so live provider→
 * station delivery is NOT claimed and never simulated. This receipt
 * proves the verification machinery + the typed extraction + the replay
 * law on real key material — nothing more.
 *
 * Gates run (all must hold):
 *  G1  a locally-signed payment_intent.succeeded event VERIFIES and
 *      extracts typed fields (intent id, status, amount, currency)
 *  G2  an unmapped event type VERIFIES_UNMAPPED (nothing invented)
 *  G3  a tampered body is refused SIGNATURE_INVALID
 *  G4  a signature from a different (wrong) key is refused SIGNATURE_INVALID
 *  G5  an expired timestamp (301 s old) is refused TIMESTAMP_OUTSIDE_WINDOW
 *  G6  a future timestamp (beyond the 5 s skew) is refused FUTURE_TIMESTAMP
 *  G7  a replayed event id is refused EVENT_ALREADY_CONSUMED (single
 *      consumption — VERIFIED is answered at most once per id)
 *  G8  no result shape carries the secret (machine-scanned receipt)
 *
 * Credential law: the whsec_ secret comes ONLY from
 * STRIPE_WEBHOOK_SECRET (the station secret store); never echoed, never
 * in any receipt (machine-scanned).
 *
 * Exit codes: 0 = all gates held; 1 = failure;
 * 2 = the webhook secret was not provided (the honest pre-gate state).
 *
 * Usage: STRIPE_WEBHOOK_SECRET=whsec_… pnpm exec tsx scripts/p14/b1-stripe-webhook-real-key-receipt.ts
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  createStripeWebhookVerificationModule,
  stripeReconciliationEvidenceOf,
} from "../../packages/provider-runtime/src/index.js";

const REAL_CRYPTO = {
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

function sign(secret: string, timestampSeconds: number, body: string): string {
  return `t=${timestampSeconds},v1=${REAL_CRYPTO.hmacSha256Hex(secret, `${timestampSeconds}.${body}`)}`;
}

function paymentIntentEventBody(input: {
  eventId: string;
  type: string;
  intentId: string;
  status: string;
  nowSeconds: number;
}): string {
  return JSON.stringify({
    id: input.eventId,
    object: "event",
    api_version: "2025-08-27.basil",
    created: input.nowSeconds,
    type: input.type,
    data: {
      object: {
        id: input.intentId,
        object: "payment_intent",
        status: input.status,
        amount: 1500,
        currency: "usd",
      },
    },
  });
}

async function main(): Promise<number> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (typeof webhookSecret !== "string" || webhookSecret.trim() === "") {
    console.error("[b1-receipt] STRIPE_WEBHOOK_SECRET not provided — the real-key webhook gate stays operator-gated. Nothing is simulated.");
    return 2;
  }

  const ranAt = new Date().toISOString();
  const nowSeconds = Math.floor(Date.now() / 1000);
  // The injected clock reads the real wall clock ONCE (the composition
  // edge may read the host clock; the package never does).
  const clock = { now: () => BigInt(nowSeconds * 1000), monotonic: () => BigInt(nowSeconds) };
  const verify = createStripeWebhookVerificationModule({ webhookSecret, crypto: REAL_CRYPTO, clock });
  const gates: Record<string, string> = {};
  const observations: string[] = [];

  // G1 — the positive path on REAL key material.
  const eventId = `evt_b1_${randomBytes(6).toString("hex")}`;
  const intentId = `pi_b1_${randomBytes(6).toString("hex")}`;
  const goodBody = paymentIntentEventBody({
    eventId,
    type: "payment_intent.succeeded",
    intentId,
    status: "succeeded",
    nowSeconds,
  });
  const goodDelivery = { eventId, signatureHeader: sign(webhookSecret, nowSeconds, goodBody), body: goodBody };
  const g1 = verify(goodDelivery);
  if (g1.kind !== "VERIFIED") {
    console.error("[b1-receipt] G1 FAILED: a correctly signed event did not verify", g1);
    return 1;
  }
  gates.G1_verified_typed_extraction =
    `${g1.event.eventType} → intent ${g1.event.paymentIntentId} (${g1.event.status}, ${g1.event.amount} ${g1.event.currency})`;
  const evidence = stripeReconciliationEvidenceOf(g1.event);
  if (evidence === null || evidence.resolvedTo !== "CONFIRMED") {
    console.error("[b1-receipt] G1 FAILED: succeeded did not map to CONFIRMED evidence");
    return 1;
  }
  observations.push(`evidence mapping: succeeded → resolvedTo CONFIRMED (paymentIntentId ${evidence.paymentIntentId})`);

  // G2 — unmapped type verifies without invention.
  const unmappedId = `evt_b1_unmapped_${randomBytes(4).toString("hex")}`;
  const unmappedBody = JSON.stringify({
    id: unmappedId,
    object: "event",
    created: nowSeconds,
    type: "charge.refunded",
    data: { object: { id: "ch_b1", object: "charge", status: "succeeded" } },
  });
  const g2 = verify({ eventId: unmappedId, signatureHeader: sign(webhookSecret, nowSeconds, unmappedBody), body: unmappedBody });
  if (g2.kind !== "VERIFIED_UNMAPPED" || g2.eventType !== "charge.refunded") {
    console.error("[b1-receipt] G2 FAILED: unmapped event not verified-unmapped", g2);
    return 1;
  }
  gates.G2_unmapped_type_honest = `charge.refunded → VERIFIED_UNMAPPED (nothing invented)`;

  // G3 — tampered body.
  const tamperId = `evt_b1_tamper_${randomBytes(4).toString("hex")}`;
  const honestBody = paymentIntentEventBody({
    eventId: tamperId,
    type: "payment_intent.succeeded",
    intentId,
    status: "succeeded",
    nowSeconds,
  });
  const tamperedBody = JSON.stringify({
    id: tamperId,
    object: "event",
    created: nowSeconds,
    type: "payment_intent.succeeded",
    data: { object: { id: intentId, object: "payment_intent", status: "succeeded", amount: 99_999_999, currency: "usd" } },
  });
  const g3 = verify({ eventId: tamperId, signatureHeader: sign(webhookSecret, nowSeconds, honestBody), body: tamperedBody });
  if (g3.kind !== "REFUSED" || g3.refusal.kind !== "SIGNATURE_INVALID") {
    console.error("[b1-receipt] G3 FAILED: tampered body not refused", g3);
    return 1;
  }
  gates.G3_tamper_refused = "SIGNATURE_INVALID";

  // G4 — wrong key.
  const wrongKey = `whsec_wrong_${randomBytes(16).toString("hex")}`;
  const wrongKeyId = `evt_b1_wrongkey_${randomBytes(4).toString("hex")}`;
  const wrongKeyBody = paymentIntentEventBody({
    eventId: wrongKeyId,
    type: "payment_intent.succeeded",
    intentId,
    status: "succeeded",
    nowSeconds,
  });
  const g4 = verify({ eventId: wrongKeyId, signatureHeader: sign(wrongKey, nowSeconds, wrongKeyBody), body: wrongKeyBody });
  if (g4.kind !== "REFUSED" || g4.refusal.kind !== "SIGNATURE_INVALID") {
    console.error("[b1-receipt] G4 FAILED: wrong-key signature not refused", g4);
    return 1;
  }
  gates.G4_wrong_key_refused = "SIGNATURE_INVALID";

  // G5 — expired timestamp (tolerance + 1).
  const expiredId = `evt_b1_expired_${randomBytes(4).toString("hex")}`;
  const expiredBody = paymentIntentEventBody({
    eventId: expiredId,
    type: "payment_intent.succeeded",
    intentId,
    status: "succeeded",
    nowSeconds,
  });
  const g5 = verify({
    eventId: expiredId,
    signatureHeader: sign(webhookSecret, nowSeconds - STRIPE_WEBHOOK_TOLERANCE_SECONDS - 1, expiredBody),
    body: expiredBody,
  });
  if (g5.kind !== "REFUSED" || g5.refusal.kind !== "TIMESTAMP_OUTSIDE_WINDOW") {
    console.error("[b1-receipt] G5 FAILED: expired timestamp not refused", g5);
    return 1;
  }
  gates.G5_expired_refused = `TIMESTAMP_OUTSIDE_WINDOW (>${STRIPE_WEBHOOK_TOLERANCE_SECONDS}s)`;

  // G6 — future timestamp (skew + 1).
  const futureId = `evt_b1_future_${randomBytes(4).toString("hex")}`;
  const futureBody = paymentIntentEventBody({
    eventId: futureId,
    type: "payment_intent.succeeded",
    intentId,
    status: "succeeded",
    nowSeconds,
  });
  const g6 = verify({
    eventId: futureId,
    signatureHeader: sign(webhookSecret, nowSeconds + STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS + 1, futureBody),
    body: futureBody,
  });
  if (g6.kind !== "REFUSED" || g6.refusal.kind !== "FUTURE_TIMESTAMP") {
    console.error("[b1-receipt] G6 FAILED: future timestamp not refused", g6);
    return 1;
  }
  gates.G6_future_refused = `FUTURE_TIMESTAMP (>${STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS}s skew)`;

  // G7 — replay of the G1 event id.
  const g7 = verify(goodDelivery);
  if (g7.kind !== "REFUSED" || g7.refusal.kind !== "EVENT_ALREADY_CONSUMED") {
    console.error("[b1-receipt] G7 FAILED: replay not refused", g7);
    return 1;
  }
  gates.G7_replay_refused = "EVENT_ALREADY_CONSUMED (single consumption)";

  // G8 — the receipt secret scan (below) + the in-module escape scans
  // already threw on any leak; record the law.
  gates.G8_secret_free_results = "escape-scan clean on every result shape (in-module + receipt scan)";

  const receipt = {
    harness: "p14-b1-stripe-webhook-real-key-receipt",
    ranAt,
    scheme: "Stripe-Signature t=/v1= HMAC-SHA256 over t.body (the pinned scheme; constant-time compare; 300s tolerance; 5s future skew; event-id single consumption)",
    keyMaterial: "the REAL operator whsec_ endpoint secret (STRIPE_WEBHOOK_SECRET from the station secret store; never echoed, never in this receipt)",
    signing: "LOCAL (events signed by this harness with the real key — the machinery is verified with real key material)",
    honestBoundary:
      "NO LIVE DELIVERY CLAIMED: no inbound public endpoint exists in this station; live provider→station delivery is a future deployment concern, never simulated (ADR-0008 D4, verbatim law)",
    gates,
    observations,
  };
  const receiptJson = JSON.stringify(receipt, null, 2);
  if (receiptJson.includes(webhookSecret)) {
    throw new Error("SECRET LEAK in the receipt — refusing to emit");
  }
  const receiptPath = process.env.B1_RECEIPT_PATH;
  if (receiptPath !== undefined && receiptPath !== "") {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(receiptPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
    await writeFile(receiptPath, receiptJson, "utf8");
  }
  console.log(receiptJson);
  console.error("[b1-receipt] ALL 8 GATES HELD on real key material (locally signed; no live-delivery claim)");
  return 0;
}

main().then(
  (code) => {
    process.exit(code);
  },
  (error) => {
    console.error("[b1-receipt] harness error:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
