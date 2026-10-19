/**
 * @payswap/merchant — the Stripe-surface fixtures (P5-W3, lane R3-W3):
 * typed response EVIDENCE records over the pinned PSP surface (raw
 * provider JSON payloads preserved verbatim — INV-14). No network I/O
 * ever happens; no key material appears (publishable ids only).
 */

import type { PinnedStripeResponseEvidence } from "../src/index.ts";

/** A provider PaymentIntent JSON payload (processing — not terminal). */
export const PI_PROCESSING_PAYLOAD = Object.freeze({
  object: "payment_intent",
  id: "pi_fixture_0001",
  status: "processing",
  amount: 10000,
  currency: "usd",
});

/** A provider PaymentIntent JSON payload (terminal: succeeded). */
export const PI_SUCCEEDED_PAYLOAD = Object.freeze({
  object: "payment_intent",
  id: "pi_fixture_0002",
  status: "succeeded",
  amount: 10000,
  currency: "usd",
});

/** A provider PaymentIntent JSON payload (terminal: canceled). */
export const PI_CANCELED_PAYLOAD = Object.freeze({
  object: "payment_intent",
  id: "pi_fixture_0003",
  status: "canceled",
  amount: 10000,
  currency: "usd",
});

/** A provider PaymentIntent JSON payload (FOREIGN status — undeclared). */
export const PI_FOREIGN_PAYLOAD = Object.freeze({
  object: "payment_intent",
  id: "pi_fixture_0004",
  status: "some_future_state",
  amount: 10000,
  currency: "usd",
});

/** A typed response evidence record for a payload. */
export function responseEvidenceFixture(payload: unknown): PinnedStripeResponseEvidence {
  return Object.freeze({
    httpStatus: 200,
    requestId: "req_fixture_1",
    idempotentReplay: false,
    payload,
  });
}

/** A typed IDEMPOTENT-REPLAY response evidence record. */
export function replayedResponseEvidenceFixture(payload: unknown): PinnedStripeResponseEvidence {
  return Object.freeze({
    httpStatus: 200,
    requestId: "req_fixture_2",
    idempotentReplay: true,
    payload,
  });
}
