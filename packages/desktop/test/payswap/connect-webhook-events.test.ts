/**
 * PaySwap Desktop (P27-A) — the U3 CONNECTED-ACCOUNT WEBHOOK battery
 * (hermetic: events are signed LOCALLY with node:crypto against the
 * injected whsec; ZERO network, zero inbound endpoint claims). Machine-
 * checks:
 * - THE GATE: without the operator-delivered STRIPE_CONNECT_WEBHOOK_SECRET
 *   (whsec_-shaped) every delivery is the typed UNCONFIGURED refusal — a
 *   connected-account event is never accepted unsigned or unconfigured.
 * - THE SIGNATURE LAW: verification rides the EXISTING pinned Stripe
 *   scheme (t=…/v1=… HMAC-SHA256, 300s tolerance) through the injected
 *   verifier (composed from the provider-runtime machinery — the test
 *   binds the REAL createStripeWebhookVerifier); a bad signature is
 *   SIGNATURE_INVALID.
 * - THE TYPED EXTRACTION: account.updated → the dated observation of the
 *   account's own objects; account.application.deauthorized → the
 *   disconnect signal; payout.paid/failed → payout observations; anything
 *   else signed → VERIFIED_UNMAPPED (never invented).
 * - THE CONSUMPTION LAW: only a complete verification consumes the event
 *   id; a replayed id is EVENT_ALREADY_CONSUMED; refusals leave the id
 *   re-deliverable.
 * - THE ESCAPE LAW: no result carries the whsec material.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createStripeWebhookVerifier } from "../../../provider-runtime/src/adapters/stripe/webhook-signature.ts";
import type { RuntimeClock } from "../../../provider-runtime/src/clock.ts";
import {
  createStripeConnectWebhookModule,
  STRIPE_CONNECT_WEBHOOK_MISSING_ITEMS,
} from "../../src/host/payswap/stripe/connect-webhook-events.js";

const CONNECT_SECRET = "whsec_TESTCONNECTSECRET00000000000";
const NOW_MS = 1_762_166_400_000n;

/** The REAL provider-runtime crypto + verifier, bound exactly as the composition edge binds it. */
const realCrypto = {
  hmacSha256Hex(key: string, message: string): string {
    return createHmac("sha256", key).update(message, "utf8").digest("hex");
  },
  timingSafeEqualHex(a: string, b: string): boolean {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  },
};
const clock: RuntimeClock = { now: () => NOW_MS, monotonic: () => NOW_MS };
const verifier = createStripeWebhookVerifier({
  webhookSecret: CONNECT_SECRET,
  crypto: realCrypto,
  clock,
});
/** Adapt the module's narrow seam onto the provider-runtime verifier's real input shape. */
const moduleVerifier = {
  verify(input: { signature: string; canonicalBody: string }) {
    return verifier.verify({
      delivery: {
        providerName: "stripe",
        eventId: "evt_adapter",
        signature: input.signature,
        signatureTimestamp: "0",
        eventCreatedAt: "0",
        payload: null,
      },
      canonicalBody: input.canonicalBody,
    });
  },
};

/** Sign a body locally exactly as Stripe's documented scheme does. */
function sign(body: string, timestampSeconds: string, secret: string = CONNECT_SECRET): string {
  const signature = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

function moduleWith(secret?: string) {
  return createStripeConnectWebhookModule({
    connectWebhookSecret: secret,
    signatureVerifier: moduleVerifier,
    nowIso: () => "2026-11-03T12:00:00.000Z",
  });
}

const ACCOUNT_UPDATED_BODY = JSON.stringify({
  id: "evt_00000000000000",
  object: "event",
  type: "account.updated",
  created: 1_762_166_400,
  data: {
    object: {
      id: "acct_00000000000000",
      object: "account",
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
      country: "US",
      capabilities: { transfers: { status: "active" } },
      requirements: { currently_due: [], past_due: [] },
    },
  },
});

describe("the STRIPE_CONNECT_WEBHOOK_SECRET gate (run card §B.3/§B.4)", () => {
  it("without the secret every delivery is the typed UNCONFIGURED refusal", () => {
    const module = moduleWith(undefined);
    const result = module.verify({
      eventId: "evt_00000000000000",
      signatureHeader: sign(ACCOUNT_UPDATED_BODY, "1762166400"),
      body: ACCOUNT_UPDATED_BODY,
    });
    expect(result.kind).toBe("UNCONFIGURED");
    if (result.kind !== "UNCONFIGURED") return;
    expect(result.missingItems).toEqual(STRIPE_CONNECT_WEBHOOK_MISSING_ITEMS);
    expect(result.missingItems[0]).toContain("run card §B.3");
  });

  it("a non-whsec_-shaped secret is the same typed gate (never a downgrade)", () => {
    const module = moduleWith("not-a-whsec");
    const result = module.verify({
      eventId: "evt_00000000000000",
      signatureHeader: sign(ACCOUNT_UPDATED_BODY, "1762166400"),
      body: ACCOUNT_UPDATED_BODY,
    });
    expect(result.kind).toBe("UNCONFIGURED");
  });
});

describe("the signature law (the existing pinned scheme, reused)", () => {
  it("a properly signed account.updated delivery verifies and extracts the dated observation", () => {
    const module = moduleWith(CONNECT_SECRET);
    const result = module.verify({
      eventId: "evt_00000000000000",
      signatureHeader: sign(ACCOUNT_UPDATED_BODY, "1762166400"),
      body: ACCOUNT_UPDATED_BODY,
    });
    expect(result.kind).toBe("VERIFIED_ACCOUNT_UPDATED");
    if (result.kind !== "VERIFIED_ACCOUNT_UPDATED") return;
    expect(result.eventId).toBe("evt_00000000000000");
    expect(result.observation.accountRef).toBe("acct_00000000000000");
    expect(result.observation.payoutsEnabled).toBe(true);
    expect(result.observation.capabilities.find((c) => c.capability === "transfers")?.status).toBe("active");
    expect(result.observation.observedAt).toBe("2026-11-03T12:00:00.000Z");
  });

  it("a bad signature is SIGNATURE_INVALID (the secret never leaks into the reason)", () => {
    const module = moduleWith(CONNECT_SECRET);
    const result = module.verify({
      eventId: "evt_00000000000000",
      signatureHeader: sign(ACCOUNT_UPDATED_BODY, "1762166400", "whsec_WRONGSECRET0000000000000000"),
      body: ACCOUNT_UPDATED_BODY,
    });
    expect(result.kind).toBe("REFUSED");
    if (result.kind !== "REFUSED") return;
    expect(result.refusal).toBe("SIGNATURE_INVALID");
    expect(result.detail).not.toContain(CONNECT_SECRET);
  });

  it("a stale timestamp is refused by the pinned tolerance window", () => {
    const module = moduleWith(CONNECT_SECRET);
    const result = module.verify({
      eventId: "evt_00000000000000",
      signatureHeader: sign(ACCOUNT_UPDATED_BODY, "1762166000"),
      body: ACCOUNT_UPDATED_BODY,
    });
    expect(result.kind).toBe("REFUSED");
    if (result.kind !== "REFUSED") return;
    expect(result.refusal).toBe("SIGNATURE_INVALID");
  });
});

describe("the consumption law (single-use event ids)", () => {
  it("a replayed event id is EVENT_ALREADY_CONSUMED", () => {
    const module = moduleWith(CONNECT_SECRET);
    const delivery = {
      eventId: "evt_00000000000000",
      signatureHeader: sign(ACCOUNT_UPDATED_BODY, "1762166400"),
      body: ACCOUNT_UPDATED_BODY,
    };
    const first = module.verify(delivery);
    expect(first.kind).toBe("VERIFIED_ACCOUNT_UPDATED");
    const replay = module.verify(delivery);
    expect(replay.kind).toBe("REFUSED");
    if (replay.kind !== "REFUSED") return;
    expect(replay.refusal).toBe("EVENT_ALREADY_CONSUMED");
  });

  it("a signature refusal does NOT consume the event id (re-deliverable)", () => {
    const module = moduleWith(CONNECT_SECRET);
    const bad = {
      eventId: "evt_00000000000001",
      signatureHeader: "t=1762166400,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      body: ACCOUNT_UPDATED_BODY.replace("evt_00000000000000", "evt_00000000000001"),
    };
    const refused = module.verify(bad);
    expect(refused.kind).toBe("REFUSED");
    // Now deliver it properly signed — the id was not consumed by the refusal.
    const body = bad.body;
    const good = module.verify({ ...bad, signatureHeader: sign(body, "1762166400") });
    expect(good.kind).toBe("VERIFIED_ACCOUNT_UPDATED");
  });
});

describe("the typed event vocabulary (never invented)", () => {
  it("account.application.deauthorized extracts the disconnect signal", () => {
    const body = JSON.stringify({
      id: "evt_00000000000002",
      object: "event",
      type: "account.application.deauthorized",
      created: 1_762_166_400,
      data: { object: { id: "acct_00000000000000", object: "account" } },
    });
    const module = moduleWith(CONNECT_SECRET);
    const result = module.verify({
      eventId: "evt_00000000000002",
      signatureHeader: sign(body, "1762166400"),
      body,
    });
    expect(result.kind).toBe("VERIFIED_DEAUTHORIZED");
    if (result.kind !== "VERIFIED_DEAUTHORIZED") return;
    expect(result.accountRef).toBe("acct_00000000000000");
  });

  it("payout.paid is a payout observation (never a charge resolution)", () => {
    const body = JSON.stringify({
      id: "evt_00000000000003",
      object: "event",
      type: "payout.paid",
      created: 1_762_166_400,
      data: { object: { id: "po_00000000000000", object: "payout", destination: "acct_00000000000000" } },
    });
    const module = moduleWith(CONNECT_SECRET);
    const result = module.verify({
      eventId: "evt_00000000000003",
      signatureHeader: sign(body, "1762166400"),
      body,
    });
    expect(result.kind).toBe("VERIFIED_PAYOUT_OBSERVATION");
    if (result.kind !== "VERIFIED_PAYOUT_OBSERVATION") return;
    expect(result.payoutOutcome).toBe("paid");
    expect(result.payoutRef).toBe("po_00000000000000");
    expect(result.accountRef).toBe("acct_00000000000000");
  });

  it("a signed event outside the vocabulary is VERIFIED_UNMAPPED (recorded, nothing invented)", () => {
    const body = JSON.stringify({
      id: "evt_00000000000004",
      object: "event",
      type: "balance.available",
      created: 1_762_166_400,
      data: { object: { id: "ba_1" } },
    });
    const module = moduleWith(CONNECT_SECRET);
    const result = module.verify({
      eventId: "evt_00000000000004",
      signatureHeader: sign(body, "1762166400"),
      body,
    });
    expect(result.kind).toBe("VERIFIED_UNMAPPED");
    if (result.kind !== "VERIFIED_UNMAPPED") return;
    expect(result.eventType).toBe("balance.available");
  });

  it("an id-mismatched body is UNPARSEABLE (the signed body must match the delivered id)", () => {
    const module = moduleWith(CONNECT_SECRET);
    const result = module.verify({
      eventId: "evt_DIFFERENT000000000",
      signatureHeader: sign(ACCOUNT_UPDATED_BODY, "1762166400"),
      body: ACCOUNT_UPDATED_BODY,
    });
    expect(result.kind).toBe("REFUSED");
    if (result.kind !== "REFUSED") return;
    expect(result.refusal).toBe("UNPARSEABLE_EVENT_BODY");
  });
});

describe("the escape law", () => {
  it("no result carries the whsec material", () => {
    const module = moduleWith(CONNECT_SECRET);
    const result = module.verify({
      eventId: "evt_00000000000000",
      signatureHeader: sign(ACCOUNT_UPDATED_BODY, "1762166400"),
      body: ACCOUNT_UPDATED_BODY,
    });
    expect(JSON.stringify(result)).not.toContain(CONNECT_SECRET);
  });
});
