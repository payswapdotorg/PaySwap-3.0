/**
 * @payswap/merchant — the journey fixtures (P5-W3, lane R3-W3): the
 * connected instances (the pinned capability shapes), the settlement
 * routes, the intent + webhook events and the reconciliation
 * resolutions. Deterministic, frozen, evidence-bearing.
 */

import {
  defineNativeStripeCryptoSettlementRoute,
  defineExternalConversionSettlementRoute,
  defineMerchantPaymentIntent,
  defineWebhookEvent,
} from "../src/index.ts";
import type {
  ExternalConversionSettlementRoute,
  MerchantCheckoutWebhookEvent,
  NativeStripeCryptoSettlementRoute,
  PinnedConnectedInstance,
} from "../src/index.ts";
import { BASE_POLICY, CRYPTO_POLICY, DESTINATION, T60, USDC, usd } from "./fixtures.ts";

// Connected instances (the pinned capability shapes)
// ---------------------------------------------------------------------------

/** An ACTIVE, eligible connected Stripe instance (USD scope). */
export const CONNECTED_INSTANCE: PinnedConnectedInstance = Object.freeze({
  instanceId: "instance.stripe.fixture.1",
  capabilityId: "cap.merchant.stripe.native-crypto-settlement",
  implementationId: "impl.stripe.fixture.1",
  providerName: "stripe",
  providerVersion: "1",
  accountRef: "acct_fixture_1",
  tenantRef: "tenant.fixture.1",
  authorization: Object.freeze({
    status: "ACTIVE",
    grantedAt: "2026-10-01T00:00:00Z",
    authorizationRef: "authz:fixture-1",
  }),
  permissionState: Object.freeze({
    granted: Object.freeze(["merchant:stripe:crypto-payments"]),
    requested: Object.freeze([]),
    missing: Object.freeze([]),
  }),
  eligibility: Object.freeze({ eligible: true, reasons: Object.freeze([]) }),
  currencies: Object.freeze(["USD", "EUR"]),
});

/** A PENDING-authorization connected instance (honest ineligibility). */
export const PENDING_INSTANCE: PinnedConnectedInstance = Object.freeze({
  ...CONNECTED_INSTANCE,
  instanceId: "instance.stripe.fixture.pending",
  authorization: Object.freeze({ status: "PENDING" }),
});

/** A catalogue-shaped value (INV-13: never a connected instance). */
export const CATALOGUE_ENTRY = Object.freeze({
  catalogueEntryId: "catalogue.stripe.1",
  providerName: "stripe",
  providerVersion: "1",
  capabilityId: "cap.merchant.stripe.native-crypto-settlement",
  summary: "platform-wide advertised crypto settlement",
});

// ---------------------------------------------------------------------------
// Settlement routes
// ---------------------------------------------------------------------------

/** A provider-verified NATIVE_STRIPE_CRYPTO settlement route. */
export function nativeRouteFixture(): NativeStripeCryptoSettlementRoute {
  return defineNativeStripeCryptoSettlementRoute(
    {
      connectedInstanceId: CONNECTED_INSTANCE.instanceId,
      stripeAccountRef: CONNECTED_INSTANCE.accountRef,
      settlementCurrency: "USD",
      supportedAssets: [USDC.id],
      evidenceRefs: ["provider-evidence:stripe-1"],
    },
    CONNECTED_INSTANCE,
  );
}

/** An EXTERNAL_PAYSWAP_CONVERSION settlement route. */
export function externalRouteFixture(): ExternalConversionSettlementRoute {
  return defineExternalConversionSettlementRoute({
    destination: DESTINATION,
    conversionChain: ["cap.convert.usdc-usd", "cap.offramp.bank"],
  });
}

// ---------------------------------------------------------------------------
// The intent + webhook fixtures
// ---------------------------------------------------------------------------

/** A merchant payment intent over the fixtures. */
export function intentFixture() {
  return defineMerchantPaymentIntent({
    id: "intent:fixture-1",
    merchantRef: "merchant.fixture.1",
    acceptancePolicyId: BASE_POLICY.id,
    cryptoAcceptancePolicyId: CRYPTO_POLICY.id,
    amount: usd(10_000n),
    createdAt: T60,
    expiresAt: T60 + 3_600_000n,
  });
}

/** A submitted-attempt webhook event over the fixtures. */
export function attemptSubmittedWebhookFixture(): MerchantCheckoutWebhookEvent {
  return defineWebhookEvent({
    eventId: "evt:fixture-submitted-1",
    payload: {
      eventType: "payment_attempt.submitted",
      attemptId: "attempt:fixture-1",
      intentId: "intent:fixture-1",
      authorizationRequestHash: "digest:authreq:fixture",
      externalTxRef: "tx:fixture-handoff.fixture.1",
      evidenceIds: ["handoff-evidence:handoff.fixture.1"],
    },
    occurredAt: T60,
  });
}

// ---------------------------------------------------------------------------
// The reconciliation resolution (the pinned protocol-plane shape)
// ---------------------------------------------------------------------------

/** A success-resolution record (the ONLY ambiguity exit). */
export function resolveSucceededFixture() {
  return Object.freeze({
    resolvedOutcome: "CONFIRMED_SUCCEEDED" as const,
    resolvedBy: "reconciler:fixture",
    caseId: "case:fixture-1",
    evidenceIds: Object.freeze(["reconciliation-evidence:1"]),
  });
}

/** A failure-resolution record (the ONLY ambiguity exit). */
export function resolveFailedFixture() {
  return Object.freeze({
    resolvedOutcome: "CONFIRMED_FAILED" as const,
    resolvedBy: "reconciler:fixture",
    caseId: "case:fixture-2",
    evidenceIds: Object.freeze(["reconciliation-evidence:2"]),
  });
}

// ---------------------------------------------------------------------------