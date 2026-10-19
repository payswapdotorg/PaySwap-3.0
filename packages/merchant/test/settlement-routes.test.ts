import { describe, expect, it } from "vitest";
import {
  PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
  SETTLEMENT_ROUTE_FAMILIES,
  STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID,
  assertRouteFamilyDiscriminated,
  defineExternalConversionSettlementRoute,
  defineNativeStripeCryptoSettlementRoute,
  isExternalConversionRoute,
  isNativeStripeCryptoRoute,
  isProviderVerifiedStripeSettlement,
  nativeStripeCryptoEligibility,
  recordStripeSettlementConfirmation,
} from "../src/index.ts";
import type { PinnedConnectedInstance, PinnedMerchantSettlementDestination } from "../src/index.ts";
import { RouteFamilyConflationError, SyntheticStripeBalanceError, ValidationError } from "../src/errors.ts";
import { DESTINATION, USDC, usd } from "./fixtures.ts";
import {
  CATALOGUE_ENTRY,
  CONNECTED_INSTANCE,
  PENDING_INSTANCE,
  externalRouteFixture,
  nativeRouteFixture,
} from "./journey-fixtures.ts";

/**
 * The settlement ROUTE suite (P5-W3, lane R3-W3; PORT of old
 * packages/merchant-crypto/test/settlement.test.ts @ 8a735bf — its 26
 * sites consolidated into 19 here): the two structurally distinct route
 * families (never conflated), the INV-13 catalogue-vs-connection law,
 * the synthetic-balance law (Stripe balance effects are
 * provider-verified or UNKNOWN — never synthesized), the runtime
 * route-family discrimination guard, the provider-verified Stripe
 * settlement confirmation (shape first, evidence last), and the native
 * eligibility observation over a connected instance.
 */

type NativeRouteInput = Parameters<typeof defineNativeStripeCryptoSettlementRoute>[0];

function baseNativeInput(overrides: Partial<NativeRouteInput> = {}): NativeRouteInput {
  return {
    connectedInstanceId: CONNECTED_INSTANCE.instanceId,
    stripeAccountRef: CONNECTED_INSTANCE.accountRef,
    settlementCurrency: "USD",
    supportedAssets: [USDC.id],
    evidenceRefs: ["provider-evidence:stripe-1"],
    ...overrides,
  };
}

type ConfirmationInput = Parameters<typeof recordStripeSettlementConfirmation>[0];

function baseConfirmationInput(overrides: Partial<ConfirmationInput> = {}): ConfirmationInput {
  return {
    confirmationId: "confirmation:fixture-1",
    connectedInstanceId: CONNECTED_INSTANCE.instanceId,
    stripeBalanceTxRef: "txn_fixture_1",
    amount: usd(2_500n),
    providerStateEnvelopeRef: "envelope:fixture-1",
    evidenceIds: ["evidence:stripe-1"],
    ...overrides,
  };
}

/** An eligible-shaped instance that is nonetheless DISQUALIFIED. */
const INELIGIBLE_INSTANCE: PinnedConnectedInstance = Object.freeze({
  ...CONNECTED_INSTANCE,
  eligibility: Object.freeze({
    eligible: false,
    reasons: Object.freeze(["crypto-payments-not-enabled"]),
  }),
});

function malformedDestination(overrides: Record<string, unknown>): PinnedMerchantSettlementDestination {
  return { ...DESTINATION, ...overrides } as PinnedMerchantSettlementDestination;
}

describe("SETTLEMENT_ROUTE_FAMILIES", () => {
  it("pins exactly the two route families, frozen and in declared order", () => {
    expect(SETTLEMENT_ROUTE_FAMILIES.length).toBe(2);
    expect([...SETTLEMENT_ROUTE_FAMILIES]).toEqual([
      "NATIVE_STRIPE_CRYPTO",
      "EXTERNAL_PAYSWAP_CONVERSION",
    ]);
    expect(Object.isFrozen(SETTLEMENT_ROUTE_FAMILIES)).toBe(true);
  });
});

describe("defineNativeStripeCryptoSettlementRoute", () => {
  it("builds a frozen, provider-verified native route with the capability id set", () => {
    const route = nativeRouteFixture();
    expect(route.routeFamily).toBe("NATIVE_STRIPE_CRYPTO");
    // providerVerified is a constructor literal — always true.
    expect(route.providerVerified).toBe(true);
    expect(route.capabilityId).toBe(STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID);
    expect(route.connectedInstanceId).toBe(CONNECTED_INSTANCE.instanceId);
    expect(route.stripeAccountRef).toBe(CONNECTED_INSTANCE.accountRef);
    expect(route.settlementCurrency).toBe("USD");
    expect(route.supportedAssets).toEqual([USDC.id]);
    expect(route.evidenceRefs).toEqual(["provider-evidence:stripe-1"]);
    expect(Object.isFrozen(route)).toBe(true);
    expect(Object.isFrozen(route.supportedAssets)).toBe(true);
    expect(Object.isFrozen(route.evidenceRefs)).toBe(true);
  });

  it("rejects a provider catalogue entry with ValidationError (INV-13: catalogue presence is never connection)", () => {
    const asInstance = CATALOGUE_ENTRY as unknown as PinnedConnectedInstance;
    expect(() => defineNativeStripeCryptoSettlementRoute(baseNativeInput(), asInstance)).toThrow(
      ValidationError,
    );
    let caught: unknown;
    try {
      defineNativeStripeCryptoSettlementRoute(baseNativeInput(), asInstance);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).code).toBe("MERCHANT_VALIDATION");
    expect((caught as ValidationError).message).toMatch(/catalogue/);
  });

  it("rejects missing or empty evidence refs with SyntheticStripeBalanceError (/synthetic/)", () => {
    expect(() =>
      defineNativeStripeCryptoSettlementRoute(baseNativeInput({ evidenceRefs: [] }), CONNECTED_INSTANCE),
    ).toThrow(SyntheticStripeBalanceError);
    expect(() =>
      defineNativeStripeCryptoSettlementRoute(baseNativeInput({ evidenceRefs: [""] }), CONNECTED_INSTANCE),
    ).toThrow(SyntheticStripeBalanceError);
    // Missing entirely: the route would describe a synthetic Stripe balance.
    const { evidenceRefs: _omitted, ...withoutEvidence } = baseNativeInput();
    const input = withoutEvidence as NativeRouteInput;
    expect(() => defineNativeStripeCryptoSettlementRoute(input, CONNECTED_INSTANCE)).toThrow(
      SyntheticStripeBalanceError,
    );
    expect(() => defineNativeStripeCryptoSettlementRoute(input, CONNECTED_INSTANCE)).toThrow(
      /synthetic/,
    );
  });

  it("rejects a PENDING (not ACTIVE) connected instance", () => {
    const input = baseNativeInput({ connectedInstanceId: PENDING_INSTANCE.instanceId });
    expect(() => defineNativeStripeCryptoSettlementRoute(input, PENDING_INSTANCE)).toThrow(
      ValidationError,
    );
    expect(() => defineNativeStripeCryptoSettlementRoute(input, PENDING_INSTANCE)).toThrow(/ACTIVE/);
  });

  it("rejects an ineligible instance, carrying the disqualifying reasons", () => {
    expect(() =>
      defineNativeStripeCryptoSettlementRoute(baseNativeInput(), INELIGIBLE_INSTANCE),
    ).toThrow(ValidationError);
    expect(() =>
      defineNativeStripeCryptoSettlementRoute(baseNativeInput(), INELIGIBLE_INSTANCE),
    ).toThrow(/crypto-payments-not-enabled/);
  });

  it("rejects a settlement currency outside the connected instance scope", () => {
    const input = baseNativeInput({ settlementCurrency: "JPY" });
    expect(() => defineNativeStripeCryptoSettlementRoute(input, CONNECTED_INSTANCE)).toThrow(
      ValidationError,
    );
    expect(() => defineNativeStripeCryptoSettlementRoute(input, CONNECTED_INSTANCE)).toThrow(/scope/);
  });

  it("rejects empty or repeating supported assets", () => {
    const empty = baseNativeInput({ supportedAssets: [] });
    expect(() => defineNativeStripeCryptoSettlementRoute(empty, CONNECTED_INSTANCE)).toThrow(
      ValidationError,
    );
    const repeated = baseNativeInput({ supportedAssets: [USDC.id, USDC.id] });
    expect(() => defineNativeStripeCryptoSettlementRoute(repeated, CONNECTED_INSTANCE)).toThrow(
      ValidationError,
    );
    expect(() => defineNativeStripeCryptoSettlementRoute(repeated, CONNECTED_INSTANCE)).toThrow(
      /repeat/,
    );
  });
});

describe("defineExternalConversionSettlementRoute", () => {
  it("validates the destination shape (id/kind/currency/externalRef/provenance with bigint recordedAt)", () => {
    const malformed: PinnedMerchantSettlementDestination[] = [
      malformedDestination({ id: "" }),
      malformedDestination({ kind: "" }),
      malformedDestination({ currency: "US" }), // not 3 characters
      malformedDestination({ currency: "USDD" }), // not 3 characters
      malformedDestination({ externalRef: "" }),
      malformedDestination({ provenance: { ...DESTINATION.provenance, source: "" } }),
      malformedDestination({ provenance: { ...DESTINATION.provenance, recordedAt: 1 } }), // number
      malformedDestination({ provenance: null }),
    ];
    for (const destination of malformed) {
      expect(() =>
        defineExternalConversionSettlementRoute({ destination, conversionChain: ["cap.convert.usdc-usd"] }),
      ).toThrow(ValidationError);
    }
  });

  it("requires a non-empty, unique conversion capability chain", () => {
    expect(() =>
      defineExternalConversionSettlementRoute({ destination: DESTINATION, conversionChain: [] }),
    ).toThrow(ValidationError);
    expect(() =>
      defineExternalConversionSettlementRoute({
        destination: DESTINATION,
        conversionChain: ["cap.convert.usdc-usd", "cap.convert.usdc-usd"],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      defineExternalConversionSettlementRoute({ destination: DESTINATION, conversionChain: [""] }),
    ).toThrow(ValidationError);
  });
});

describe("settlement route family discriminators", () => {
  it("discriminate the constructor outputs of both families (external route frozen, destination passed through)", () => {
    const external = externalRouteFixture();
    expect(external.routeFamily).toBe("EXTERNAL_PAYSWAP_CONVERSION");
    expect(external.capabilityId).toBe(PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID);
    expect(external.destination).toBe(DESTINATION);
    expect(external.conversionChain).toEqual(["cap.convert.usdc-usd", "cap.offramp.bank"]);
    expect(Object.isFrozen(external)).toBe(true);
    expect(Object.isFrozen(external.conversionChain)).toBe(true);
    expect(isExternalConversionRoute(external)).toBe(true);
    expect(isNativeStripeCryptoRoute(external)).toBe(false);
    const native = nativeRouteFixture();
    expect(isNativeStripeCryptoRoute(native)).toBe(true);
    expect(isExternalConversionRoute(native)).toBe(false);
  });
});

describe("assertRouteFamilyDiscriminated", () => {
  it("rejects cross-family field carriage with RouteFamilyConflationError (both directions)", () => {
    // A NATIVE route carrying the EXTERNAL family's fields:
    expect(() =>
      assertRouteFamilyDiscriminated({ ...nativeRouteFixture(), destination: DESTINATION }),
    ).toThrow(RouteFamilyConflationError);
    expect(() =>
      assertRouteFamilyDiscriminated({
        ...nativeRouteFixture(),
        conversionChain: ["cap.convert.usdc-usd"],
      }),
    ).toThrow(RouteFamilyConflationError);
    // An EXTERNAL route carrying the NATIVE family's fields:
    expect(() =>
      assertRouteFamilyDiscriminated({
        ...externalRouteFixture(),
        connectedInstanceId: CONNECTED_INSTANCE.instanceId,
      }),
    ).toThrow(RouteFamilyConflationError);
    expect(() =>
      assertRouteFamilyDiscriminated({ ...externalRouteFixture(), providerVerified: true }),
    ).toThrow(RouteFamilyConflationError);
  });

  it("rejects malformed routeFamily values with ValidationError", () => {
    expect(() => assertRouteFamilyDiscriminated(null)).toThrow(ValidationError);
    expect(() => assertRouteFamilyDiscriminated({})).toThrow(ValidationError);
    expect(() => assertRouteFamilyDiscriminated({ routeFamily: "MYSTERY_FAMILY" })).toThrow(
      ValidationError,
    );
  });

  it("accepts the well-formed constructor outputs of both families", () => {
    expect(() => assertRouteFamilyDiscriminated(nativeRouteFixture())).not.toThrow();
    expect(() => assertRouteFamilyDiscriminated(externalRouteFixture())).not.toThrow();
  });
});

describe("recordStripeSettlementConfirmation", () => {
  it("records a provider-verified confirmation; routeFamily and confirmedByProvider are constructor literals", () => {
    const confirmation = recordStripeSettlementConfirmation(baseConfirmationInput());
    // The input cannot supply these two — the constructor sets them.
    expect(confirmation.routeFamily).toBe("NATIVE_STRIPE_CRYPTO");
    expect(confirmation.confirmedByProvider).toBe(true);
    expect(confirmation.confirmationId).toBe("confirmation:fixture-1");
    expect(confirmation.connectedInstanceId).toBe(CONNECTED_INSTANCE.instanceId);
    expect(confirmation.stripeBalanceTxRef).toBe("txn_fixture_1");
    expect(confirmation.amount.value).toBe(2_500n);
    expect(confirmation.amount.currency).toBe("USD");
    expect(confirmation.providerStateEnvelopeRef).toBe("envelope:fixture-1");
    expect(confirmation.evidenceIds).toEqual(["evidence:stripe-1"]);
    expect(Object.isFrozen(confirmation)).toBe(true);
    expect(Object.isFrozen(confirmation.evidenceIds)).toBe(true);
  });

  it("validates shape FIRST and evidence LAST (empty evidenceIds → SyntheticStripeBalanceError /synthetic/)", () => {
    // Shape first: a missing providerStateEnvelopeRef is a ValidationError
    // even though provider evidence IS present.
    const { providerStateEnvelopeRef: _omitted, ...withoutEnvelope } = baseConfirmationInput();
    const input = withoutEnvelope as ConfirmationInput;
    expect(() => recordStripeSettlementConfirmation(input)).toThrow(ValidationError);
    expect(() => recordStripeSettlementConfirmation(input)).not.toThrow(SyntheticStripeBalanceError);
    // Evidence last: a well-shaped confirmation without provider evidence
    // would be a synthetic Stripe balance effect.
    expect(() =>
      recordStripeSettlementConfirmation(baseConfirmationInput({ evidenceIds: [] })),
    ).toThrow(SyntheticStripeBalanceError);
    expect(() =>
      recordStripeSettlementConfirmation(baseConfirmationInput({ evidenceIds: [] })),
    ).toThrow(/synthetic/);
  });

  it("requires positive exact money", () => {
    expect(() =>
      recordStripeSettlementConfirmation(baseConfirmationInput({ amount: usd(0n) })),
    ).toThrow(ValidationError);
    expect(() =>
      recordStripeSettlementConfirmation(baseConfirmationInput({ amount: usd(-1n) })),
    ).toThrow(ValidationError);
    expect(() =>
      recordStripeSettlementConfirmation(baseConfirmationInput({ amount: usd(0n) })),
    ).toThrow(/positive/);
    const notExact = { value: 1, currency: "USD" } as unknown as ConfirmationInput["amount"];
    expect(() =>
      recordStripeSettlementConfirmation(baseConfirmationInput({ amount: notExact })),
    ).toThrow(ValidationError);
  });
});

describe("isProviderVerifiedStripeSettlement", () => {
  it("is a structural guard: true for the real record, false for partial or tampered values", () => {
    const confirmation = recordStripeSettlementConfirmation(baseConfirmationInput());
    expect(isProviderVerifiedStripeSettlement(confirmation)).toBe(true);
    // Tampered evidence (an emptied evidence list):
    expect(isProviderVerifiedStripeSettlement({ ...confirmation, evidenceIds: [] })).toBe(false);
    // Partial (no confirmedByProvider literal):
    const { confirmedByProvider: _omitted, ...partial } = confirmation;
    expect(isProviderVerifiedStripeSettlement(partial)).toBe(false);
    // Tampered amount (not exact Money):
    expect(
      isProviderVerifiedStripeSettlement({ ...confirmation, amount: { value: 1, currency: "USD" } }),
    ).toBe(false);
    // Non-records:
    expect(isProviderVerifiedStripeSettlement(null)).toBe(false);
    expect(isProviderVerifiedStripeSettlement({})).toBe(false);
  });
});

describe("nativeStripeCryptoEligibility", () => {
  it("observes eligibility over a connected instance (scope + authorization reasons)", () => {
    // Eligible: reasons empty.
    const eligible = nativeStripeCryptoEligibility(CONNECTED_INSTANCE, {
      settlementCurrency: "USD",
    });
    expect(eligible.eligible).toBe(true);
    expect(eligible.reasons).toEqual([]);
    expect(Object.isFrozen(eligible)).toBe(true);
    // An unscoped settlement currency carries the scope reason.
    const unscoped = nativeStripeCryptoEligibility(CONNECTED_INSTANCE, {
      settlementCurrency: "JPY",
    });
    expect(unscoped.eligible).toBe(false);
    expect(unscoped.reasons).toContain("SETTLEMENT_CURRENCY_NOT_IN_INSTANCE_SCOPE");
    // A PENDING authorization is honestly ineligible.
    const pending = nativeStripeCryptoEligibility(PENDING_INSTANCE, nativeRouteFixture());
    expect(pending.eligible).toBe(false);
    expect(pending.reasons).toContain("AUTHORIZATION_NOT_ACTIVE");
  });
});
