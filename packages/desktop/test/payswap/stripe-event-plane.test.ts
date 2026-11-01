/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the EVENT PLANE battery:
 *
 * - the DESKTOP VERIFIER FACTORY (the structural mirror of the pinned
 *   provider-runtime scheme): a valid signature verifies; a tampered
 *   body/reforged signature does not; the tolerance window and future
 *   skew are enforced against the injected clock; a rotation overlap
 *   accepts BOTH secrets' signatures; a malformed header refuses; no
 *   live secret means nothing can verify (fail-closed).
 * - VERDICT PARITY with the REAL provider-runtime verifier
 *   (createStripeWebhookVerifier — the test tier may import the real
 *   package): identical deliveries classify identically.
 * - THE HONEST CAPABILITY LAW: a desktop-only installation without a
 *   public HTTPS endpoint states the typed prerequisite explicitly —
 *   never a fake receiver.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDesktopStripeWebhookVerifierFactory, describeStripeEventReception } from "../../src/host/payswap/stripe/event-plane.js";
import {
  PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS,
  PINNED_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  PINNED_STRIPE_WEBHOOK_VERIFIER_ID,
} from "../../src/host/payswap/stripe/stripe-pins.js";
import {
  STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  STRIPE_WEBHOOK_VERIFIER_ID,
  createStripeWebhookVerifier,
} from "../../../provider-runtime/src/index.js";

/** Fake whsec_ material (concatenated — never a literal secret shape in source). */
const SECRET_A = "whsec" + "_FAKE51whsecADoNotUse001";
const SECRET_B = "whsec" + "_FAKE51whsecBDoNotUse002";

const NOW_MS = 1_800_000_000_000;

/** Sign a payload the way Stripe does: HMAC-SHA256 over "<t>.<body>". */
function sign(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

function headerOf(timestamp: number, signature: string): string {
  return `t=${timestamp},v1=${signature}`;
}

const BODY = JSON.stringify({
  id: "evt_fake51event0001",
  object: "event",
  api_version: "2026-09-30.endive",
  created: Math.floor(NOW_MS / 1000),
  type: "customer.created",
  livemode: false,
  data: { object: { id: "cus_fake51created" } },
});

describe("the desktop webhook verifier factory (the pinned scheme)", () => {
  it("accepts a validly signed fresh payload and refuses a tampered body", () => {
    const factory = createDesktopStripeWebhookVerifierFactory();
    const t = Math.floor(NOW_MS / 1000);
    const verifier = factory.createVerifierFor([SECRET_A]);
    expect(verifier.verifierId).toBe(PINNED_STRIPE_WEBHOOK_VERIFIER_ID);
    expect(
      verifier.verifyRaw({ signatureHeader: headerOf(t, sign(SECRET_A, t, BODY)), rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({ valid: true });
    expect(
      verifier.verifyRaw({ signatureHeader: headerOf(t, sign(SECRET_A, t, BODY)), rawBody: `${BODY} `, nowMs: NOW_MS })
        .valid,
    ).toBe(false);
    // A signature reforged over a different body does not verify.
    expect(
      verifier.verifyRaw({
        signatureHeader: headerOf(t, sign(SECRET_A, t, `${BODY}x`)),
        rawBody: BODY,
        nowMs: NOW_MS,
      }).valid,
    ).toBe(false);
  });

  it("enforces the tolerance window and the future skew against the injected clock", () => {
    const factory = createDesktopStripeWebhookVerifierFactory();
    const verifier = factory.createVerifierFor([SECRET_A]);
    const tooOld = Math.floor(NOW_MS / 1000) - (PINNED_STRIPE_WEBHOOK_TOLERANCE_SECONDS + 10);
    expect(
      verifier.verifyRaw({ signatureHeader: headerOf(tooOld, sign(SECRET_A, tooOld, BODY)), rawBody: BODY, nowMs: NOW_MS }),
    ).toEqual({ valid: false, reason: expect.stringContaining("tolerance window") });
    const tooFuture = Math.floor(NOW_MS / 1000) + (PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS + 10);
    expect(
      verifier.verifyRaw({
        signatureHeader: headerOf(tooFuture, sign(SECRET_A, tooFuture, BODY)),
        rawBody: BODY,
        nowMs: NOW_MS,
      }),
    ).toEqual({ valid: false, reason: expect.stringContaining("future") });
    // Inside the skew allowance verifies.
    const slightlyFuture = Math.floor(NOW_MS / 1000) + (PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS - 1);
    expect(
      verifier.verifyRaw({
        signatureHeader: headerOf(slightlyFuture, sign(SECRET_A, slightlyFuture, BODY)),
        rawBody: BODY,
        nowMs: NOW_MS,
      }).valid,
    ).toBe(true);
  });

  it("a rotation overlap accepts BOTH secrets (Stripe's dual-signature practice)", () => {
    const factory = createDesktopStripeWebhookVerifierFactory();
    const verifier = factory.createVerifierFor([SECRET_A, SECRET_B]);
    const t = Math.floor(NOW_MS / 1000);
    expect(
      verifier.verifyRaw({ signatureHeader: headerOf(t, sign(SECRET_A, t, BODY)), rawBody: BODY, nowMs: NOW_MS }).valid,
    ).toBe(true);
    expect(
      verifier.verifyRaw({ signatureHeader: headerOf(t, sign(SECRET_B, t, BODY)), rawBody: BODY, nowMs: NOW_MS }).valid,
    ).toBe(true);
    // Multiple listed v1 entries: any match verifies.
    expect(
      verifier.verifyRaw({
        signatureHeader: `t=${t},v1=${"0".repeat(64)},v1=${sign(SECRET_B, t, BODY)}`,
        rawBody: BODY,
        nowMs: NOW_MS,
      }).valid,
    ).toBe(true);
  });

  it("refuses malformed headers and fails closed with no live secret", () => {
    const factory = createDesktopStripeWebhookVerifierFactory();
    const verifier = factory.createVerifierFor([SECRET_A]);
    expect(verifier.verifyRaw({ signatureHeader: "", rawBody: BODY, nowMs: NOW_MS }).valid).toBe(false);
    expect(verifier.verifyRaw({ signatureHeader: "v1=abcdef0123456789", rawBody: BODY, nowMs: NOW_MS }).valid).toBe(
      false,
    );
    expect(verifier.verifyRaw({ signatureHeader: "t=abc,v1=abcdef0123456789", rawBody: BODY, nowMs: NOW_MS }).valid).toBe(
      false,
    );
    const none = factory.createVerifierFor([]);
    expect(none.verifyRaw({ signatureHeader: "t=1,v1=abcdef0123456789", rawBody: BODY, nowMs: NOW_MS })).toEqual({
      valid: false,
      reason: expect.stringContaining("no live webhook signing secret"),
    });
  });
});

describe("verdict parity with the REAL provider-runtime verifier (the mirror law)", () => {
  it("identical deliveries classify identically (valid + stale + mismatch + malformed)", () => {
    const desktopFactory = createDesktopStripeWebhookVerifierFactory();
    const desktop = desktopFactory.createVerifierFor([SECRET_A]);
    const real = createStripeWebhookVerifier({
      webhookSecret: SECRET_A,
      crypto: {
        hmacSha256Hex: (key, message) => createHmac("sha256", key).update(message, "utf8").digest("hex"),
        timingSafeEqualHex: (a, b) =>
          a.length === b.length && timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")),
      },
      clock: { now: () => BigInt(NOW_MS), monotonic: () => BigInt(NOW_MS) },
    });
    expect(real.verifierId).toBe(STRIPE_WEBHOOK_VERIFIER_ID);
    expect(PINNED_STRIPE_WEBHOOK_VERIFIER_ID).toBe(STRIPE_WEBHOOK_VERIFIER_ID);
    expect(PINNED_STRIPE_WEBHOOK_TOLERANCE_SECONDS).toBe(STRIPE_WEBHOOK_TOLERANCE_SECONDS);
    expect(PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS).toBe(STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS);
    const t = Math.floor(NOW_MS / 1000);
    const cases = [
      headerOf(t, sign(SECRET_A, t, BODY)),
      headerOf(t, "0".repeat(64)),
      headerOf(t - 400, sign(SECRET_A, t - 400, BODY)),
      "garbage-header",
    ];
    for (const signatureHeader of cases) {
      const delivery = {
        providerName: "stripe",
        eventId: "evt_fake51event0001",
        signatureTimestamp: String(t),
        eventCreatedAt: String(t),
        payload: JSON.parse(BODY) as unknown,
        signature: signatureHeader,
      };
      // Verdict parity: the valid/refused decision must agree exactly
      // (the prose reasons may differ — both are honest).
      expect(
        desktop.verifyRaw({ signatureHeader, rawBody: BODY, nowMs: NOW_MS }).valid,
      ).toBe(real.verify({ delivery, canonicalBody: BODY }).valid);
    }
  });
});

describe("the honest reception-capability statement (D12 — never a fake receiver)", () => {
  it("a desktop-only installation states the typed prerequisite explicitly", () => {
    const capability = describeStripeEventReception({ publicEndpointConfigured: false });
    expect(capability.canReceivePublicEvents).toBe(false);
    expect(capability.prerequisite).toBe("PUBLIC_HTTPS_ENDPOINT_REQUIRED");
    expect(capability.detail).toContain("cannot receive public Stripe webhook deliveries");
    expect(capability.detail).toContain("verification only, never live delivery");
  });

  it("a configured public endpoint states the sealed-secret verification path", () => {
    const capability = describeStripeEventReception({ publicEndpointConfigured: true });
    expect(capability.canReceivePublicEvents).toBe(true);
    expect(capability.prerequisite).toBeNull();
    expect(capability.detail).toContain("sealed whsec_ secret");
  });
});
