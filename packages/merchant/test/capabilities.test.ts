import { describe, expect, it } from "vitest";
import {
  payswapExternalConversionSettlementCapabilityDefinition,
  settlementRouteCapabilityId,
  stripeNativeCryptoSettlementCapabilityDefinition,
  validateMerchantCapabilityDescriptor,
} from "../src/capabilities.ts";
import type { MerchantCapabilityDescriptor } from "../src/capabilities.ts";
import {
  PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
  STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID,
  defineExternalConversionSettlementRoute,
  defineNativeStripeCryptoSettlementRoute,
} from "../src/settlement-routes.ts";
import { ValidationError } from "../src/errors.ts";
import type { PinnedConnectedInstance } from "../src/index.ts";
import { DESTINATION } from "./fixtures.ts";

/**
 * The settlement-capability suite (PORTED+ADAPTED from old
 * packages/merchant-crypto/test/capabilities.test.ts @ 8a735bf): the two
 * DISTINCT settlement capability declarations, the LOCAL fail-closed
 * descriptor validator (the old connector-lane validateCapabilityDefinition
 * seam is replaced by validateMerchantCapabilityDescriptor over the PINNED
 * execution-mode vocabulary), and family routing. The four old
 * nativeStripeCryptoEligibility sites belong to the connectivity/
 * eligibility suite; the old nativeOptimization assertions are folded
 * here (the pinned descriptor carries no nativeOptimization field by
 * design — asserted below).
 */

// The pinned connected instance the native route is derived from (INV-13:
// only a genuinely connected instance — never a catalogue entry — can
// scope a merchant settlement route).
const instance: PinnedConnectedInstance = {
  instanceId: "inst.stripe.fixture.1",
  capabilityId: "cap.stripe.fixture.1",
  implementationId: "impl.stripe.fixture.1",
  providerName: "stripe",
  providerVersion: "1.0.0",
  accountRef: "acct.stripe.fixture.1",
  tenantRef: "tenant.fixture.1",
  authorization: { status: "ACTIVE" },
  permissionState: { granted: [], requested: [], missing: [] },
  eligibility: { eligible: true, reasons: [] },
  currencies: ["USD"],
};

const nativeRoute = defineNativeStripeCryptoSettlementRoute(
  {
    connectedInstanceId: instance.instanceId,
    stripeAccountRef: instance.accountRef,
    settlementCurrency: "USD",
    supportedAssets: ["asset.usdc"],
    evidenceRefs: ["obs.stripe.crypto.fixture.1"],
  },
  instance,
);

const externalRoute = defineExternalConversionSettlementRoute({
  destination: DESTINATION,
  conversionChain: ["cap.fixture.convert.usdc"],
});

describe("stripeNativeCryptoSettlementCapabilityDefinition (the INV-15 baseline)", () => {
  const definition = stripeNativeCryptoSettlementCapabilityDefinition();

  // PORTED: old "declares PASS_THROUGH_NATIVE as its only execution mode
  // (INV-C08 baseline)" + "carries the constant capability ids and
  // version 1.0.0".
  it("declares PASS_THROUGH_NATIVE as its ONLY execution mode and carries the constant id + version 1.0.0", () => {
    expect(definition.executionModes).toEqual(["PASS_THROUGH_NATIVE"]);
    expect(definition.capabilityId).toBe(STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID);
    expect(definition.capabilityVersion).toBe("1.0.0");
    expect(definition.kind).toBe("ACTION");
    expect(definition.requiredPermissions).toContain("merchant:stripe:crypto-payments");
  });

  // PORTED: old "cannot bypass protocol authorization (INV-C07)" + the
  // idempotency/reconciliation half of "settles value and requires
  // reconciliation on retry".
  it("cannot bypass protocol authorization and is idempotent with a REQUIRES_RECONCILIATION retry policy", () => {
    expect(definition.authorization.protocolAuthorization).toBe(true);
    expect(definition.authorization.requiredScopes).toContain("merchant:settlement:execute");
    expect(definition.authorization.customerConsent).toBe("IMPLICIT");
    expect(definition.idempotency.idempotent).toBe(true);
    expect(definition.idempotency.keyScope).toBe("PROVIDER_ACCOUNT");
    expect(definition.idempotency.retryPolicy).toBe("REQUIRES_RECONCILIATION");
  });

  // PORTED: the financial-effect half of old "settles value and requires
  // reconciliation on retry" (INV-6 / INV-4 discipline).
  it("declares exactly one side effect — irreversible, SETTLES_VALUE, never compensable", () => {
    expect(definition.sideEffects).toHaveLength(1);
    expect(definition.sideEffects.every((effect) => effect.reversible === false)).toBe(true);
    expect(definition.sideEffects.some((effect) => effect.financialEffect === "SETTLES_VALUE")).toBe(
      true,
    );
    expect(definition.compensation.compensable).toBe(false);
    expect(definition.compensation.cancellation).toBe("NOT_SUPPORTED");
  });

  // ADAPTED: the old rails/adapters provider-state mapping sites
  // (STRIPE_PAYMENT_INTENT_STATUS_MAPPING) re-based onto the descriptor's
  // providerVocabulary; the honest-unavailability law (unknown is a
  // first-class OUTCOME_UNKNOWN, never a synthesized success).
  it("maps the provider state vocabulary: pending to PROCESSING, settled to SUCCEEDED, unknown to OUTCOME_UNKNOWN", () => {
    const states = definition.providerVocabulary.states;
    const byProviderState = (providerState: string) =>
      states.find((state) => state.providerState === providerState);
    expect(byProviderState("pending")?.canonicalState).toBe("PROCESSING");
    expect(byProviderState("pending")?.isTerminal).toBe(false);
    expect(byProviderState("settled")?.canonicalState).toBe("SUCCEEDED");
    expect(byProviderState("settled")?.isTerminal).toBe(true);
    expect(byProviderState("unknown")?.canonicalState).toBe("OUTCOME_UNKNOWN");
    expect(byProviderState("unknown")?.isTerminal).toBe(false);
    expect(states.map((state) => state.canonicalState)).toContain("OUTCOME_UNKNOWN");
  });

  // ADAPTED: the old onboarding "records are frozen" law applied to the
  // capability descriptor (validateMerchantCapabilityDescriptor deep-freezes
  // every recorded descriptor fact — INV-3).
  it("is frozen deep — every recorded descriptor fact is immutable (INV-3)", () => {
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.executionModes)).toBe(true);
    expect(Object.isFrozen(definition.authorization)).toBe(true);
    expect(Object.isFrozen(definition.idempotency)).toBe(true);
    expect(Object.isFrozen(definition.compensation)).toBe(true);
    expect(Object.isFrozen(definition.sideEffects)).toBe(true);
    expect(Object.isFrozen(definition.sideEffects[0])).toBe(true);
    expect(Object.isFrozen(definition.providerVocabulary)).toBe(true);
    expect(Object.isFrozen(definition.providerVocabulary.states)).toBe(true);
    expect(Object.isFrozen(definition.providerVocabulary.states[0])).toBe(true);
    expect(() => {
      (definition as { summary: string }).summary = "rewritten";
    }).toThrow();
  });
});

describe("payswapExternalConversionSettlementCapabilityDefinition", () => {
  const definition = payswapExternalConversionSettlementCapabilityDefinition();

  // PORTED: old "declares exactly the two composed execution modes and
  // never PASS_THROUGH_NATIVE" + "declares no nativeOptimization property
  // at all" + "declares both SETTLES_VALUE and MOVES_VALUE side effects"
  // (three sites folded into one family-law assertion block).
  it("declares exactly the two composed execution modes and NEVER PASS_THROUGH_NATIVE", () => {
    expect(definition.executionModes).toHaveLength(2);
    expect(definition.executionModes).toContain("COMPOSED_PAYSWAP");
    expect(definition.executionModes).toContain("OPTIMIZED_MULTI_PROVIDER");
    expect(definition.executionModes).not.toContain("PASS_THROUGH_NATIVE");
    expect("nativeOptimization" in definition).toBe(false);
    expect(definition.authorization.protocolAuthorization).toBe(true);
    expect(definition.authorization.customerConsent).toBe("EXPLICIT");
    expect(definition.sideEffects).toHaveLength(2);
    expect(definition.sideEffects.some((effect) => effect.financialEffect === "SETTLES_VALUE")).toBe(
      true,
    );
    expect(definition.sideEffects.some((effect) => effect.financialEffect === "MOVES_VALUE")).toBe(
      true,
    );
    expect(definition.sideEffects.every((effect) => effect.reversible === false)).toBe(true);
    expect(definition.capabilityId).toBe(PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID);
    expect(definition.capabilityVersion).toBe("1.0.0");
  });
});

describe("validateMerchantCapabilityDescriptor (fail-closed structural pin)", () => {
  const native = stripeNativeCryptoSettlementCapabilityDefinition();

  // ADAPTED: the old "both definitions pass validateCapabilityDefinition
  // without throwing" site is re-based onto the LOCAL validator with its
  // negative branches (authorization law + pinned execution-mode
  // vocabulary).
  it("rejects protocol-authorization bypass and out-of-vocabulary execution modes (an identical resubmission passes)", () => {
    const bypassingAuthorization: MerchantCapabilityDescriptor = {
      ...native,
      authorization: { ...native.authorization, protocolAuthorization: false as never },
    };
    expect(() => validateMerchantCapabilityDescriptor(bypassingAuthorization)).toThrow(
      ValidationError,
    );
    expect(() => validateMerchantCapabilityDescriptor(bypassingAuthorization)).toThrow(
      /protocol authorization/,
    );

    const outOfVocabulary: MerchantCapabilityDescriptor = {
      ...native,
      executionModes: ["PASS_THROUGH_OMNIVERSE"] as unknown as MerchantCapabilityDescriptor["executionModes"],
    };
    expect(() => validateMerchantCapabilityDescriptor(outOfVocabulary)).toThrow(ValidationError);
    expect(() => validateMerchantCapabilityDescriptor(outOfVocabulary)).toThrow(
      /pinned vocabulary/,
    );

    const modeless: MerchantCapabilityDescriptor = { ...native, executionModes: [] };
    expect(() => validateMerchantCapabilityDescriptor(modeless)).toThrow(ValidationError);
    expect(() => validateMerchantCapabilityDescriptor(modeless)).toThrow(
      /must declare execution modes/,
    );

    expect(() => validateMerchantCapabilityDescriptor({ ...native })).not.toThrow();
  });

  // ADAPTED (NET-NEW negative branches): idempotency (INV-6), the
  // requires-reconciliation retry law (INV-4) and the irreversible
  // side-effect law of the local validator.
  it("rejects non-idempotent descriptors, non-reconciliation retry policies and reversible side effects", () => {
    const nonIdempotent: MerchantCapabilityDescriptor = {
      ...native,
      idempotency: { ...native.idempotency, idempotent: false as never },
    };
    expect(() => validateMerchantCapabilityDescriptor(nonIdempotent)).toThrow(ValidationError);
    expect(() => validateMerchantCapabilityDescriptor(nonIdempotent)).toThrow(/idempotent/);

    const blindRetry: MerchantCapabilityDescriptor = {
      ...native,
      idempotency: { ...native.idempotency, retryPolicy: "BEST_EFFORT" as never },
    };
    expect(() => validateMerchantCapabilityDescriptor(blindRetry)).toThrow(ValidationError);
    expect(() => validateMerchantCapabilityDescriptor(blindRetry)).toThrow(/reconciliation/);

    const reversible: MerchantCapabilityDescriptor = {
      ...native,
      sideEffects: [
        { effect: "provider settles accepted crypto", financialEffect: "SETTLES_VALUE", reversible: true as never },
      ],
    };
    expect(() => validateMerchantCapabilityDescriptor(reversible)).toThrow(ValidationError);
    expect(() => validateMerchantCapabilityDescriptor(reversible)).toThrow(/irreversible/);
  });
});

describe("settlementRouteCapabilityId (routing by route family)", () => {
  // PORTED: old "maps each route family to its capability constant" +
  // the distinctness half of "carries the constant capability ids".
  it("routes each settlement route family to its own capability constant — the two ids are distinct", () => {
    expect(nativeRoute.routeFamily).toBe("NATIVE_STRIPE_CRYPTO");
    expect(externalRoute.routeFamily).toBe("EXTERNAL_PAYSWAP_CONVERSION");
    expect(settlementRouteCapabilityId(nativeRoute)).toBe(
      STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID,
    );
    expect(settlementRouteCapabilityId(externalRoute)).toBe(
      PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
    );
    expect(nativeRoute.capabilityId).toBe(STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID);
    expect(externalRoute.capabilityId).toBe(
      PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
    );
    expect(STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID).not.toBe(
      PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
    );
  });
});
