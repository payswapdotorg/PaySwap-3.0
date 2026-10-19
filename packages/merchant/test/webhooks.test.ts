/**
 * @payswap/merchant — the typed webhooks suite (P5-W3, lane R3-W3, Task 3-h;
 * PORT of old packages/merchant-checkout/test/webhooks.test.ts @ 8a735bf —
 * 15 sites -> 14 sites: the per-family typed-shape laws consolidated, the
 * rejection/replay and status-view laws regrouped; the local error taxonomy
 * (WebhookShapeError/SecretShapeError) replaces the old shared ValidationError,
 * and the secret scan is the package's own INV-19 law (key-shaped fixtures are
 * assembled at RUNTIME from fragments — no secret literal ever appears here).
 *
 * Laws: a webhook is EVIDENCE, never authority (evidence ids mandatory
 * wherever an event claims state); the envelope is frozen + secret-scanned
 * (a key-shaped payload is unconstructible); processing is IDEMPOTENT by
 * event id (a replay is a DUPLICATE and never re-runs the handler); an
 * illegal claimed transition is REJECTED with the typed reason, never
 * force-applied; status views are read-only projections.
 *
 * Deterministic: fixed bigint instants only (no clock/random/timers).
 */

import { describe, expect, it } from "vitest";
import {
  asWebhookEventId, attachMethodToIntent, beginMerchantPaymentAttempt, checkoutStatusView,
  confirmIntentSubmission, defineWebhookEvent, emptyWebhookInbox, observeAttemptOutcome,
  processWebhookEvent, scanForSecretMaterial, submitMerchantPaymentAttempt,
  walletPaymentAuthorizationLineage,
} from "../src/index.ts";
import type { CheckoutPaymentAttempt, MerchantCheckoutWebhookEvent, WebhookInbox } from "../src/index.ts";
import { InvalidIdentifierError, SecretShapeError, ValidationError, WebhookShapeError } from "../src/errors.ts";
import { T60, canonicalQuote } from "./fixtures.ts";
import { authorizationBundleFixture, performSubmittedHandoffFixture } from "./port-fixtures.ts";
import { attemptSubmittedWebhookFixture, intentFixture } from "./journey-fixtures.ts";

const EVENT_AT = T60; // the pinned event instants (fixed bigints)
const LATER_EVENT_AT = T60 + 4_000n;

/** Assert both the typed error class and the message law (sibling pattern). */
function expectReject(fn: () => unknown, message: RegExp, error: new (...args: never[]) => Error = WebhookShapeError): void {
  expect(fn).toThrow(error);
  expect(fn).toThrow(message);
}

// The per-family canonical payloads (overridden per case; empty strings hit
// the same fail-closed branch as a missing field — the shapes require non-empty).
const SESSION_PAYLOAD = { eventType: "checkout_session.completed" as const, sessionId: "session:fixture-1", intentId: "intent:fixture-1" };
const SUBMITTED_PAYLOAD = { eventType: "payment_attempt.submitted" as const, attemptId: "attempt:webhooks-1", intentId: "intent:fixture-1", authorizationRequestHash: "digest:authreq:webhooks", externalTxRef: "tx:fixture-handoff.fixture.1", evidenceIds: ["evidence:submission-1"] };
const TRANSITION_PAYLOAD = { eventType: "payment_attempt.confirmed" as const, attemptId: "attempt:webhooks-1", intentId: "intent:fixture-1", evidenceIds: ["evidence:transition-1"] };
const RESOLVED_PAYLOAD = { eventType: "payment_attempt.resolved" as const, attemptId: "attempt:webhooks-1", intentId: "intent:fixture-1", resolvedOutcome: "CONFIRMED_SUCCEEDED" as const, evidenceIds: ["evidence:resolution-1"] };
const SETTLEMENT_PAYLOAD = { eventType: "settlement.recorded" as const, attemptId: "attempt:webhooks-1", routeFamily: "NATIVE_STRIPE_CRYPTO" as const, evidenceIds: ["evidence:settlement-1"] };
const REFUND_PAYLOAD = { eventType: "refund.created" as const, refundId: "refund:fixture-1", attemptId: "attempt:webhooks-1", evidenceIds: ["evidence:refund-1"] };

/** A canonical payment_attempt.submitted event. */
function submittedEventFixture(eventId: string): MerchantCheckoutWebhookEvent {
  return defineWebhookEvent({ eventId, payload: SUBMITTED_PAYLOAD, occurredAt: EVENT_AT });
}
/** A canonical payment_attempt.confirmed event. */
function confirmedEventFixture(eventId: string): MerchantCheckoutWebhookEvent {
  return defineWebhookEvent({ eventId, payload: { ...TRANSITION_PAYLOAD, eventType: "payment_attempt.confirmed" }, occurredAt: LATER_EVENT_AT });
}

/**
 * A composite for the READ-ONLY projection laws: hand-composed over REAL
 * records (a real submitted attempt over the canonical quote + the real
 * authorization lineage minted from the port fixtures) — the view projects
 * existing truth; the chain-vocabulary composite walk belongs to the
 * lifecycle suite, the view only reads what is already there.
 */
function viewCompositeFixture(): CheckoutPaymentAttempt {
  const intent = confirmIntentSubmission(attachMethodToIntent(intentFixture(), T60), T60 + 1_000n);
  const submittedAttempt = submitMerchantPaymentAttempt(
    beginMerchantPaymentAttempt({ id: "attempt:webhooks-1", intent, quote: canonicalQuote(), now: T60 + 2_000n }),
    canonicalQuote(),
    T60 + 3_000n,
  );
  return Object.freeze({
    attempt: submittedAttempt,
    authorization: walletPaymentAuthorizationLineage({ bundle: authorizationBundleFixture(), handoffReceipt: performSubmittedHandoffFixture().receipt }),
  });
}

describe("defineWebhookEvent — typed payloads per event family (fail-closed)", () => {
  it("checkout-session events must reference their session and intent", () => {
    for (const eventType of ["checkout_session.completed", "checkout_session.expired", "checkout_session.cancelled"] as const) {
      const event = defineWebhookEvent({ eventId: "evt:session-1", payload: { ...SESSION_PAYLOAD, eventType }, occurredAt: EVENT_AT });
      expect(event.payload.eventType).toBe(eventType);
      expect(event.occurredAt).toBe(EVENT_AT);
    }
    expectReject(() => defineWebhookEvent({ eventId: "evt:session-bad", payload: { ...SESSION_PAYLOAD, sessionId: "" }, occurredAt: EVENT_AT }), /must reference its session and intent/);
    expectReject(() => defineWebhookEvent({ eventId: "evt:session-bad", payload: { ...SESSION_PAYLOAD, intentId: "" }, occurredAt: EVENT_AT }), /must reference its session and intent/);
  });

  it("payment_attempt.submitted must carry the attempt, intent, authorization and external submission references", () => {
    const event = submittedEventFixture("evt:submitted-1");
    expect(event.eventId).toBe("evt:submitted-1");
    expect(event.payload.eventType).toBe("payment_attempt.submitted");
    for (const key of ["attemptId", "intentId", "authorizationRequestHash", "externalTxRef"] as const) {
      expectReject(() => defineWebhookEvent({ eventId: "evt:submitted-bad", payload: { ...SUBMITTED_PAYLOAD, [key]: "" }, occurredAt: EVENT_AT }), /attempt, intent, authorization and external submission references/);
    }
    // evidence ids are mandatory wherever the event claims state:
    expectReject(() => defineWebhookEvent({ eventId: "evt:submitted-bad", payload: { ...SUBMITTED_PAYLOAD, evidenceIds: [] }, occurredAt: EVENT_AT }), /a webhook is evidence, never authority/);
  });

  it("attempt-transition events (confirmed/failed/outcome_unknown) reference attempt+intent and REQUIRE evidence (a webhook is evidence, never authority)", () => {
    for (const eventType of ["payment_attempt.confirmed", "payment_attempt.failed", "payment_attempt.outcome_unknown"] as const) {
      const event = defineWebhookEvent({ eventId: "evt:transition-1", payload: { ...TRANSITION_PAYLOAD, eventType }, occurredAt: EVENT_AT });
      expect(event.payload.eventType).toBe(eventType);
      expectReject(() => defineWebhookEvent({ eventId: "evt:transition-bad", payload: { ...TRANSITION_PAYLOAD, eventType, evidenceIds: [] }, occurredAt: EVENT_AT }), /a webhook is evidence, never authority/);
    }
    expectReject(() => defineWebhookEvent({ eventId: "evt:transition-bad", payload: { ...TRANSITION_PAYLOAD, attemptId: "" }, occurredAt: EVENT_AT }), /must reference its attempt and intent/);
    expectReject(() => defineWebhookEvent({ eventId: "evt:transition-bad", payload: { ...TRANSITION_PAYLOAD, intentId: "" }, occurredAt: EVENT_AT }), /must reference its attempt and intent/);
  });

  it("payment_attempt.resolved must declare a TYPED resolvedOutcome", () => {
    for (const resolvedOutcome of ["CONFIRMED_SUCCEEDED", "CONFIRMED_FAILED"] as const) {
      const event = defineWebhookEvent({ eventId: "evt:resolved-1", payload: { ...RESOLVED_PAYLOAD, resolvedOutcome }, occurredAt: EVENT_AT });
      expect(event.payload.eventType).toBe("payment_attempt.resolved");
    }
    expectReject(() => defineWebhookEvent({ eventId: "evt:resolved-bad", payload: { ...RESOLVED_PAYLOAD, resolvedOutcome: "CONFIRMED_MAYBE" } as never, occurredAt: EVENT_AT }), /must declare a typed resolvedOutcome/);
    expectReject(() => defineWebhookEvent({ eventId: "evt:resolved-bad", payload: { ...RESOLVED_PAYLOAD, evidenceIds: [] }, occurredAt: EVENT_AT }), /a webhook is evidence, never authority/);
  });

  it("settlement.recorded must declare one of the two declared route families", () => {
    for (const routeFamily of ["NATIVE_STRIPE_CRYPTO", "EXTERNAL_PAYSWAP_CONVERSION"] as const) {
      const event = defineWebhookEvent({ eventId: `evt:settlement-${routeFamily}`, payload: { ...SETTLEMENT_PAYLOAD, routeFamily }, occurredAt: EVENT_AT });
      expect(event.payload.eventType).toBe("settlement.recorded");
    }
    expectReject(() => defineWebhookEvent({ eventId: "evt:settlement-bad", payload: { ...SETTLEMENT_PAYLOAD, routeFamily: "SOME_THIRD_FAMILY" } as never, occurredAt: EVENT_AT }), /must declare one of the two declared route families/);
    expectReject(() => defineWebhookEvent({ eventId: "evt:settlement-bad", payload: { ...SETTLEMENT_PAYLOAD, attemptId: "" }, occurredAt: EVENT_AT }), /a settlement webhook must reference its attempt/);
  });

  it("refund events must reference their refund and attempt (the refund lifecycle family)", () => {
    for (const eventType of ["refund.created", "refund.confirmed", "refund.failed", "refund.outcome_unknown"] as const) {
      const event = defineWebhookEvent({ eventId: "evt:refund-1", payload: { ...REFUND_PAYLOAD, eventType }, occurredAt: EVENT_AT });
      expect(event.payload.eventType).toBe(eventType);
    }
    expectReject(() => defineWebhookEvent({ eventId: "evt:refund-bad", payload: { ...REFUND_PAYLOAD, refundId: "" }, occurredAt: EVENT_AT }), /must reference its refund and attempt/);
    expectReject(() => defineWebhookEvent({ eventId: "evt:refund-bad", payload: { ...REFUND_PAYLOAD, attemptId: "" }, occurredAt: EVENT_AT }), /must reference its refund and attempt/);
    expectReject(() => defineWebhookEvent({ eventId: "evt:refund-bad", payload: { ...REFUND_PAYLOAD, evidenceIds: [] }, occurredAt: EVENT_AT }), /a webhook is evidence, never authority/);
  });

  it("rejects an undeclared eventType (and an untyped payload) fail-closed", () => {
    expectReject(() => defineWebhookEvent({ eventId: "evt:undeclared-1", payload: { ...SUBMITTED_PAYLOAD, eventType: "payment_attempt.exploded" } as never, occurredAt: EVENT_AT }), /eventType is not declared by the merchant checkout flow/);
    expectReject(() => defineWebhookEvent({ eventId: "evt:undeclared-1", payload: null as never, occurredAt: EVENT_AT }), /a webhook event requires a typed payload/);
  });

  it("freezes the whole envelope and secret-scans every event (a key-shaped payload is unconstructible)", () => {
    const event = attemptSubmittedWebhookFixture();
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    // the package's own INV-19 scan finds nothing on the canonical shapes:
    expect(scanForSecretMaterial(event)).toEqual([]);
    // a raw 32-byte key shape, assembled at RUNTIME from fragments:
    const rawKey = Array.from({ length: 64 }, () => "a").join("");
    expect(() => defineWebhookEvent({ eventId: "evt:secret-1", payload: { ...TRANSITION_PAYLOAD, intentId: rawKey }, occurredAt: EVENT_AT })).toThrow(SecretShapeError);
    // a BIP-39 mnemonic shape, also assembled at RUNTIME from fragments:
    const mnemonic = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"].join(" ");
    expect(() => defineWebhookEvent({ eventId: "evt:secret-2", payload: { ...REFUND_PAYLOAD, refundId: mnemonic }, occurredAt: EVENT_AT })).toThrow(SecretShapeError);
  });

  it("asWebhookEventId: the shared brand law (identity-preserving, fail-closed)", () => {
    expect(asWebhookEventId("evt:brand-law-1")).toBe("evt:brand-law-1"); // branded === raw string
    expect(() => asWebhookEventId("")).toThrow(InvalidIdentifierError);
    expectReject(() => asWebhookEventId(" x "), /whitespace/, InvalidIdentifierError);
    expectReject(() => asWebhookEventId("x".repeat(257)), /exceeds 256 characters/, InvalidIdentifierError);
  });
});

describe("processWebhookEvent — idempotent by event id (replay-safe)", () => {
  it("applies a valid event exactly once; the replay is a DUPLICATE that never re-runs the handler", () => {
    const event = attemptSubmittedWebhookFixture(); // the journey fixture is a valid event
    expect(event.eventId).toBe("evt:fixture-submitted-1");
    expect(event.payload.eventType).toBe("payment_attempt.submitted");
    let applications = 0;
    let observedAuthorization = "";
    const handler = (ev: MerchantCheckoutWebhookEvent) => {
      applications += 1;
      if (ev.payload.eventType === "payment_attempt.submitted") {
        observedAuthorization = ev.payload.authorizationRequestHash;
      }
    };
    const first = processWebhookEvent(emptyWebhookInbox(), event, handler);
    expect(first.result.status).toBe("APPLIED");
    expect(first.result.eventId).toBe(event.eventId);
    expect(applications).toBe(1);
    // the event supplies references + evidence only (never authority):
    expect(observedAuthorization).toBe("digest:authreq:fixture");
    expect(first.inbox.appliedEventIds).toEqual([event.eventId]);
    const replay = processWebhookEvent(first.inbox, event, handler);
    expect(replay.result.status).toBe("DUPLICATE");
    expect(applications).toBe(1); // the handler was NOT re-run
    expect(replay.inbox.appliedEventIds).toEqual([event.eventId]); // the applied ledger is unchanged
    expect(replay.inbox.duplicates).toEqual([event.eventId]); // the replay is audited in arrival order
  });

  it("an event claiming an illegal transition is REJECTED with the typed reason, never force-applied (and never re-run)", () => {
    const event = defineWebhookEvent({ eventId: "evt:rejected-1", payload: { ...TRANSITION_PAYLOAD, eventType: "payment_attempt.outcome_unknown", evidenceIds: ["evidence:late-ambiguity"] }, occurredAt: EVENT_AT });
    let attempts = 0;
    // the handler runs the LIFECYCLE rules — an UNKNOWN observation on a terminal attempt throws a typed merchant error:
    const handler = () => {
      attempts += 1;
      throw new ValidationError("terminal states are monotonic");
    };
    const rejected = processWebhookEvent(emptyWebhookInbox(), event, handler);
    expect(rejected.result.status).toBe("REJECTED");
    if (rejected.result.status === "REJECTED") {
      expect(rejected.result.reason).toContain("ValidationError"); // the typed reason
      expect(rejected.result.reason).toContain("terminal states are monotonic");
    }
    expect(rejected.inbox.appliedEventIds).toEqual([]); // never force-applied
    expect(rejected.inbox.rejections).toEqual([{ eventId: "evt:rejected-1", reason: "ValidationError: terminal states are monotonic" }]);
    // the rejection is FINAL for that event id — a redelivery is a DUPLICATE:
    const replay = processWebhookEvent(rejected.inbox, event, handler);
    expect(replay.result.status).toBe("DUPLICATE");
    expect(attempts).toBe(1); // the handler was never re-run
  });

  it("a NON-merchant error propagates (never classified as a rejection)", () => {
    const event = submittedEventFixture("evt:nonmerchant-1");
    const inbox = emptyWebhookInbox();
    expect(() => processWebhookEvent(inbox, event, () => { throw new Error("a plain error is not a typed merchant error"); })).toThrow(/a plain error is not a typed merchant error/);
    // the crash left the inbox untouched — the event was neither applied nor classified:
    expect(inbox.appliedEventIds).toEqual([]);
    expect(inbox.rejections).toEqual([]);
    expect(inbox.duplicates).toEqual([]);
    // fail-closed preconditions: a non-inbox / non-handler input is rejected, never coerced:
    expect(() => processWebhookEvent(null as unknown as WebhookInbox, event, () => undefined)).toThrow(ValidationError);
    expect(() => processWebhookEvent(inbox, event, "not-a-handler" as unknown as () => void)).toThrow(ValidationError);
  });

  it("the inbox evolves functionally: emptyWebhookInbox is frozen, records are append-only, duplicates keep arrival order", () => {
    const empty = emptyWebhookInbox();
    expect(empty.appliedEventIds).toEqual([]);
    expect(empty.rejections).toEqual([]);
    expect(empty.duplicates).toEqual([]);
    expect(Object.isFrozen(empty)).toBe(true);
    expect(Object.isFrozen(empty.appliedEventIds)).toBe(true);
    const first = submittedEventFixture("evt:evolution-1");
    const second = confirmedEventFixture("evt:evolution-2");
    const afterFirst = processWebhookEvent(empty, first, () => undefined);
    const afterSecond = processWebhookEvent(afterFirst.inbox, second, () => undefined);
    expect(afterSecond.inbox.appliedEventIds).toEqual(["evt:evolution-1", "evt:evolution-2"]); // arrival order
    // append-only: the earlier inboxes are never rewritten:
    expect(empty.appliedEventIds).toEqual([]);
    expect(afterFirst.inbox.appliedEventIds).toEqual(["evt:evolution-1"]);
    expect(Object.isFrozen(afterFirst.inbox)).toBe(true);
    expect(Object.isFrozen(afterSecond.inbox)).toBe(true);
    // replays append to the duplicates ledger in arrival order (a repeated replay keeps appending):
    const mustNotRun = () => { throw new Error("a replayed event must never re-run the handler"); };
    const replayOnce = processWebhookEvent(afterSecond.inbox, first, mustNotRun);
    expect(replayOnce.result.status).toBe("DUPLICATE");
    expect(replayOnce.inbox.duplicates).toEqual(["evt:evolution-1"]);
    const replayTwice = processWebhookEvent(replayOnce.inbox, first, mustNotRun);
    expect(replayTwice.result.status).toBe("DUPLICATE");
    expect(replayTwice.inbox.duplicates).toEqual(["evt:evolution-1", "evt:evolution-1"]);
    expect(replayTwice.inbox.appliedEventIds).toEqual(["evt:evolution-1", "evt:evolution-2"]); // the applied ledger is untouched
  });

  it("checkoutStatusView: the read-only projection (attempt view + the applied webhook history)", () => {
    const confirmed = observeAttemptOutcome(viewCompositeFixture(), { kind: "SUCCEEDED", evidenceIds: ["evidence:confirmed-1"] }, LATER_EVENT_AT);
    const evtSubmitted = defineWebhookEvent({ eventId: "evt:status-1", payload: { ...SUBMITTED_PAYLOAD, authorizationRequestHash: confirmed.authorization.authorizationRequestHash }, occurredAt: EVENT_AT });
    const evtConfirmed = defineWebhookEvent({ eventId: "evt:status-2", payload: { ...TRANSITION_PAYLOAD, evidenceIds: ["evidence:confirmed-1"] }, occurredAt: LATER_EVENT_AT });
    let inbox = processWebhookEvent(emptyWebhookInbox(), evtSubmitted, () => undefined).inbox;
    inbox = processWebhookEvent(inbox, evtConfirmed, () => undefined).inbox;
    const view = checkoutStatusView(confirmed, inbox);
    expect(view.attempt.attemptId).toBe("attempt:webhooks-1");
    expect(view.attempt.state).toBe("CONFIRMED");
    expect(view.attempt.outcome).toBe("SUCCEEDED");
    expect(view.attempt.evidenceIds).toEqual(["evidence:confirmed-1"]);
    expect(view.attempt.authorizationRequestHash).toBe(confirmed.authorization.authorizationRequestHash);
    expect(view.lastEventTypes).toEqual(["evt:status-1", "evt:status-2"]); // the applied history
    expect(Object.isFrozen(view)).toBe(true); // a projection, never a mutation path
    expect(Object.isFrozen(view.attempt)).toBe(true);
    // read-only: the records the view was built over are untouched:
    expect(confirmed.attempt.state).toBe("CONFIRMED");
    expect(inbox.appliedEventIds).toEqual(["evt:status-1", "evt:status-2"]);
  });
});
