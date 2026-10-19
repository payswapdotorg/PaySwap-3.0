/**
 * @payswap/merchant — the Stripe surface byte-verification suite (P5-W3,
 * lane R3-W3, Task 3-g).
 *
 * NET-NEW tests: every assertion is a BYTE-VERIFICATION against the old
 * rails/adapters Stripe evidence (read-only @ 8a735bf):
 * - packages/rails/src/stripe.ts L91-110: STRIPE_PROVIDER_NAME "stripe",
 *   STRIPE_API_VERSION "2025-08-27.basil", STRIPE_DEFAULT_API_BASE
 *   "https://api.stripe.com", STRIPE_CREDENTIAL_CONFIG_KEY derived
 *   through providerCredentialConfigKey("stripe")
 *   = "PROVIDER_STRIPE_CREDENTIAL_REF"
 *   (packages/adapters/src/credential-broker.ts L176-194);
 * - L138-144: STRIPE_PAYMENT_INTENT_STATUS_MAPPING — the seven rows;
 *   the only terminal states are succeeded + canceled;
 * - L1764-1769: stripeIdempotencyKey = `payswap:<protocol key>`, empty
 *   rejected (the namespaced header derivation);
 * - the rail's provider-call path strings: /v1/account, /v1/balance,
 *   /v1/payouts, /v1/charges, /v1/payment_intents (+ confirm / capture /
 *   cancel), /v1/refunds, /v1/disputes, /v1/subscriptions,
 *   /v1/balance_transactions.
 *
 * THE NO-NETWORK LAW: this package never calls Stripe — descriptors are
 * typed pure data over the pinned surface; responses are typed EVIDENCE
 * consumed locally (evidence, never authority). Credentials appear only
 * through the opaque vault-backed credential ref.
 */

import { describe, expect, it } from "vitest";
import {
  STRIPE_API_BASE,
  STRIPE_API_VERSION,
  STRIPE_CREDENTIAL_REF_KEY,
  STRIPE_PAYMENT_INTENT_STATUS_MAPPING,
  STRIPE_PROVIDER,
  STRIPE_RESOURCE_PATHS,
  STRIPE_TERMINAL_PAYMENT_INTENT_STATES,
  assertStripeRequestDescriptor,
  buildStripeRequestDescriptor,
  classifyStripePaymentIntentState,
  stripeIdempotencyHeaderValue,
  stripeIdempotencyKey,
  stripePaymentIntentIsTerminal,
  stripeRequestIdentity,
} from "../src/stripe-paths.ts";
import { StripeSurfaceError, ValidationError } from "../src/errors.ts";
import { assertNoSecretMaterial, scanForSecretMaterial } from "../src/secrets.ts";
import {
  PI_CANCELED_PAYLOAD,
  PI_FOREIGN_PAYLOAD,
  PI_PROCESSING_PAYLOAD,
  PI_SUCCEEDED_PAYLOAD,
  replayedResponseEvidenceFixture,
  responseEvidenceFixture,
} from "./stripe-fixtures.ts";

const CREDENTIAL_REF = "vault://stripe/merchant-1";

type DescriptorInput = Parameters<typeof buildStripeRequestDescriptor>[0];

/** A declared input with hostile overrides applied (double-cast on purpose). */
function hostileDescriptorInput(overrides: Record<string, unknown>): DescriptorInput {
  return {
    method: "GET",
    path: STRIPE_RESOURCE_PATHS.account,
    credentialRef: CREDENTIAL_REF,
    ...overrides,
  } as unknown as DescriptorInput;
}

describe("the pinned Stripe surface (byte-verified vs the old rails evidence)", () => {
  it("the pinned wire constants are byte-identical to the old rails evidence", () => {
    expect(STRIPE_PROVIDER).toBe("stripe");
    expect(STRIPE_API_BASE).toBe("https://api.stripe.com");
    expect(STRIPE_API_VERSION).toBe("2025-08-27.basil");
    expect(STRIPE_CREDENTIAL_REF_KEY).toBe("PROVIDER_STRIPE_CREDENTIAL_REF");
  });

  it("STRIPE_RESOURCE_PATHS matches the old rail's provider-call path strings exactly", () => {
    expect(STRIPE_RESOURCE_PATHS).toEqual({
      account: "/v1/account",
      balance: "/v1/balance",
      payouts: "/v1/payouts",
      charges: "/v1/charges",
      paymentIntents: "/v1/payment_intents",
      paymentIntentConfirm: "/v1/payment_intents/{id}/confirm",
      paymentIntentCapture: "/v1/payment_intents/{id}/capture",
      paymentIntentCancel: "/v1/payment_intents/{id}/cancel",
      refunds: "/v1/refunds",
      disputes: "/v1/disputes",
      subscriptions: "/v1/subscriptions",
      balanceTransactions: "/v1/balance_transactions",
    });
    expect(Object.isFrozen(STRIPE_RESOURCE_PATHS)).toBe(true);
  });

  it("STRIPE_PAYMENT_INTENT_STATUS_MAPPING carries the seven byte-identical old-rail rows", () => {
    expect(STRIPE_PAYMENT_INTENT_STATUS_MAPPING).toEqual([
      { providerState: "requires_payment_method", family: "other", lifecycleStep: "requires_payment_method", isTerminal: false, requiresCustomerAction: false },
      { providerState: "requires_confirmation", family: "customer_action_required", lifecycleStep: "requires_confirmation", isTerminal: false, requiresCustomerAction: true },
      { providerState: "requires_action", family: "customer_action_required", lifecycleStep: "requires_action", isTerminal: false, requiresCustomerAction: true },
      { providerState: "processing", family: "async_processing", lifecycleStep: "processing", isTerminal: false, requiresCustomerAction: false },
      { providerState: "requires_capture", family: "capture", lifecycleStep: "requires_capture", isTerminal: false, requiresCustomerAction: false },
      { providerState: "succeeded", family: "other", lifecycleStep: "succeeded", isTerminal: true, requiresCustomerAction: false },
      { providerState: "canceled", family: "other", lifecycleStep: "canceled", isTerminal: true, requiresCustomerAction: false },
    ]);
    expect(Object.isFrozen(STRIPE_PAYMENT_INTENT_STATUS_MAPPING)).toBe(true);
  });

  it("the terminal PaymentIntent provider states are exactly succeeded and canceled — and the terminal predicate agrees", () => {
    expect(STRIPE_TERMINAL_PAYMENT_INTENT_STATES).toEqual(["succeeded", "canceled"]);
    expect(
      STRIPE_PAYMENT_INTENT_STATUS_MAPPING
        .filter((row) => row.isTerminal)
        .map((row) => row.providerState),
    ).toEqual([...STRIPE_TERMINAL_PAYMENT_INTENT_STATES]);
    expect(stripePaymentIntentIsTerminal(responseEvidenceFixture(PI_SUCCEEDED_PAYLOAD))).toBe(
      true,
    );
    expect(stripePaymentIntentIsTerminal(responseEvidenceFixture(PI_CANCELED_PAYLOAD))).toBe(
      true,
    );
    expect(stripePaymentIntentIsTerminal(responseEvidenceFixture(PI_PROCESSING_PAYLOAD))).toBe(
      false,
    );
  });

  it("stripeIdempotencyKey derives the namespaced payswap:<key> header, rejects an empty key, and the header value equals it", () => {
    expect(stripeIdempotencyKey("op-1")).toBe("payswap:op-1");
    expect(stripeIdempotencyKey("op-1")).toBe(stripeIdempotencyKey("op-1"));
    expect(() => stripeIdempotencyKey("")).toThrow(/idempotency/);
    expect(stripeIdempotencyHeaderValue("op-1")).toBe("payswap:op-1");
    expect(stripeIdempotencyHeaderValue("op-1")).toBe(stripeIdempotencyKey("op-1"));
    expect(() => stripeIdempotencyHeaderValue("")).toThrow(/idempotency/);
  });

  it("buildStripeRequestDescriptor — the happy path: frozen pure data over the pinned surface, clean under the secret scan", () => {
    const descriptor = buildStripeRequestDescriptor({
      method: "POST",
      path: STRIPE_RESOURCE_PATHS.paymentIntents,
      credentialRef: CREDENTIAL_REF,
      protocolIdempotencyKey: "op-1",
      body: { amount: 10000, currency: "usd" },
    });
    expect(descriptor).toEqual({
      provider: "stripe",
      method: "POST",
      path: "/v1/payment_intents",
      credentialRef: CREDENTIAL_REF,
      idempotencyKey: "op-1",
      body: { amount: 10000, currency: "usd" },
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(() => assertNoSecretMaterial(descriptor, "stripe request descriptor")).not.toThrow();
    expect(scanForSecretMaterial(descriptor)).toEqual([]);
    const observation = buildStripeRequestDescriptor({
      method: "GET",
      path: STRIPE_RESOURCE_PATHS.balance,
      credentialRef: CREDENTIAL_REF,
    });
    expect("idempotencyKey" in observation).toBe(false);
    expect("body" in observation).toBe(false);
    expect(Object.keys(observation)).toEqual(["provider", "method", "path", "credentialRef"]);
  });

  it("buildStripeRequestDescriptor — fail-closed: undeclared method, unpinned path, non-object body, empty refs", () => {
    expect(() =>
      buildStripeRequestDescriptor(hostileDescriptorInput({ method: "DELETE" })),
    ).toThrow(StripeSurfaceError);
    expect(() =>
      buildStripeRequestDescriptor(hostileDescriptorInput({ path: "/v1/tampered" })),
    ).toThrow(/pinned resource path/);
    expect(() =>
      buildStripeRequestDescriptor(hostileDescriptorInput({ body: null })),
    ).toThrow(StripeSurfaceError);
    expect(() =>
      buildStripeRequestDescriptor(hostileDescriptorInput({ body: ["array"] })),
    ).toThrow(StripeSurfaceError);
    expect(() =>
      buildStripeRequestDescriptor(hostileDescriptorInput({ credentialRef: "" })),
    ).toThrow(ValidationError);
    expect(() =>
      buildStripeRequestDescriptor(hostileDescriptorInput({ protocolIdempotencyKey: "" })),
    ).toThrow(ValidationError);
  });

  it("assertStripeRequestDescriptor — the shape guard accepts real descriptors and rejects every tampered shape", () => {
    const real = buildStripeRequestDescriptor({
      method: "POST",
      path: STRIPE_RESOURCE_PATHS.paymentIntents,
      credentialRef: CREDENTIAL_REF,
      protocolIdempotencyKey: "op-1",
      body: { amount: 10000, currency: "usd" },
    });
    expect(() => assertStripeRequestDescriptor(real)).not.toThrow();
    for (const probe of [
      null,
      "stripe descriptor",
      {},
      { ...real, provider: "not-stripe" },
      { ...real, method: "PUT" },
      { ...real, path: "/v1/evil" },
      { ...real, credentialRef: "" },
    ] as unknown[]) {
      expect(() => assertStripeRequestDescriptor(probe)).toThrow(StripeSurfaceError);
    }
  });

  it("stripeRequestIdentity — deterministic content binding: the same descriptor yields the same digest; a different body yields a different one", () => {
    const base = {
      method: "POST",
      path: STRIPE_RESOURCE_PATHS.paymentIntents,
      credentialRef: CREDENTIAL_REF,
      protocolIdempotencyKey: "op-1",
    } as const;
    const withBodyA = buildStripeRequestDescriptor({
      ...base,
      body: { amount: 10000, currency: "usd" },
    });
    // key order inside the body never matters (canonical digest sorts):
    const withBodyAAgain = buildStripeRequestDescriptor({
      ...base,
      body: { currency: "usd", amount: 10000 },
    });
    const withBodyB = buildStripeRequestDescriptor({
      ...base,
      body: { amount: 20000, currency: "usd" },
    });
    const identityA = stripeRequestIdentity(withBodyA);
    expect(identityA).toBe(stripeRequestIdentity(withBodyAAgain));
    expect(identityA).not.toBe(stripeRequestIdentity(withBodyB));
    expect(identityA).toMatch(/^[0-9a-f]{16}$/);
  });

  it("classifyStripePaymentIntentState — pinned payload classifications; a FOREIGN state is undefined, never guessed", () => {
    const evidence = classifyStripePaymentIntentState(responseEvidenceFixture(PI_PROCESSING_PAYLOAD));
    expect(evidence.providerState).toBe("processing");
    expect(evidence.classification?.family).toBe("async_processing");
    expect(evidence.classification?.lifecycleStep).toBe("processing");
    expect(evidence.classification?.isTerminal).toBe(false);
    expect(evidence.classification?.requiresCustomerAction).toBe(false);
    const succeeded = classifyStripePaymentIntentState(
      responseEvidenceFixture(PI_SUCCEEDED_PAYLOAD),
    );
    expect(succeeded.providerState).toBe("succeeded");
    expect(succeeded.classification?.family).toBe("other");
    expect(succeeded.classification?.isTerminal).toBe(true);
    const foreign = classifyStripePaymentIntentState(responseEvidenceFixture(PI_FOREIGN_PAYLOAD));
    expect(foreign.providerState).toBe("some_future_state");
    expect(foreign.classification).toBeUndefined();
    expect(() =>
      classifyStripePaymentIntentState(
        responseEvidenceFixture({ object: "payment_intent", id: "pi_fixture_none" }),
      ),
    ).toThrow(ValidationError);
  });

  it("the replay evidence record — idempotentReplay true, evidence preserved verbatim, never authority", () => {
    const replay = replayedResponseEvidenceFixture(PI_SUCCEEDED_PAYLOAD);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.httpStatus).toBe(200);
    expect(replay.requestId).toBe("req_fixture_2");
    expect(replay.payload).toBe(PI_SUCCEEDED_PAYLOAD);
    const original = responseEvidenceFixture(PI_SUCCEEDED_PAYLOAD);
    expect(original.idempotentReplay).toBe(false);
    expect(original.payload).toBe(PI_SUCCEEDED_PAYLOAD);
    // the marker is a fact on the record — classification and terminality
    // are pure projections of the payload, identical for replay + original:
    expect(classifyStripePaymentIntentState(replay)).toEqual(
      classifyStripePaymentIntentState(original),
    );
    expect(stripePaymentIntentIsTerminal(replay)).toBe(true);
  });
});
