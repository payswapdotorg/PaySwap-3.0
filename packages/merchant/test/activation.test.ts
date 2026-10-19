/**
 * The crypto acceptance ACTIVATION suite (P5-W3, lane R3-W3; PORT of
 * old packages/merchant-checkout/test/acceptance.test.ts @ 8a735bf —
 * 15 sites → 12 tests here): activateCryptoAcceptance composes the
 * crypto acceptance policy through defineMerchantCryptoAcceptancePolicy
 * and requires the merchant to be VERIFIED-or-ACTIVE; deactivation
 * preserves immutable history (a NEW frozen record, the original
 * untouched, the policy snapshot shared verbatim); acceptanceOfferView
 * is the fresh frozen typed view over the composed policy;
 * activationMatches/activationEvaluate are the typed decision surfaces
 * (ACTIVATION_INACTIVE is a typed reason on the decision, never an
 * exception). The old "validates activation ids" site lives in
 * identifiers.test.ts (the shared branded-id law). Every instant is a
 * fixed bigint from the fixture clock (no Date, no randomness).
 */

import { describe, expect, it } from "vitest";
import {
  acceptanceOfferView,
  activateCryptoAcceptance,
  activationEvaluate,
  activationMatches,
  deactivateCryptoAcceptance,
} from "../src/activation.ts";
import {
  merchantMayActivateCryptoAcceptance,
  submitMerchantApplication,
  verifyMerchant,
} from "../src/onboarding.ts";
import type { MerchantProfile } from "../src/onboarding.ts";
import { asChainId } from "../src/identifiers.ts";
import type { ChainId } from "../src/identifiers.ts";
import type { CryptoAcceptanceRequest } from "../src/acceptance-policy.ts";
import type { CryptoAmount } from "../src/assets.ts";
import type { CryptoQuote } from "../src/quotes.ts";
import type { PinnedPaymentAcceptancePolicy } from "../src/pins/payment.ts";
import { ValidationError } from "../src/errors.ts";
import {
  BASE_POLICY,
  CRYPTO_POLICY,
  ETH,
  T1,
  T10,
  T60,
  USDC,
  activeActivationFixture,
  activeMerchantFixture,
  canonicalQuote,
  draftMerchantFixture,
  usdcAmount,
} from "./fixtures.ts";

const ETH_CHAIN = asChainId("chain.eth-mainnet");
const POLYGON_CHAIN = asChainId("chain.polygon-mainnet");

type ActivationInput = Parameters<typeof activateCryptoAcceptance>[0];

/** A base policy that does NOT declare STABLECOIN_CRYPTO (the narrowing law). */
const NO_CRYPTO_BASE: PinnedPaymentAcceptancePolicy = Object.freeze({
  ...BASE_POLICY,
  methods: Object.freeze(["CARD", "BANK_TRANSFER"] as const),
});

/** The pinned rejection law: the typed error class AND the documented message. */
function expectValidationError(action: () => unknown, pattern: RegExp): void {
  expect(action).toThrow(ValidationError);
  expect(action).toThrow(pattern);
}

/** The composed-policy input as activateCryptoAcceptance expects (derived from the fixture policy). */
function policyInput(overrides: { merchantRef?: string } = {}): ActivationInput["policyInput"] {
  return {
    id: CRYPTO_POLICY.id,
    merchantRef: overrides.merchantRef ?? CRYPTO_POLICY.merchantRef,
    basePolicyId: CRYPTO_POLICY.basePolicyId,
    assets: CRYPTO_POLICY.assets,
    quoteValidityMs: CRYPTO_POLICY.quoteValidityMs,
  };
}

/** A canonical activation input over the fixtures (ACTIVE merchant by default). */
function activateInput(
  overrides: {
    merchant?: MerchantProfile;
    merchantRef?: string;
    basePolicy?: PinnedPaymentAcceptancePolicy;
  } = {},
): ActivationInput {
  return {
    id: "activation.test.1",
    merchant: overrides.merchant ?? activeMerchantFixture(),
    policyInput: policyInput(
      overrides.merchantRef !== undefined ? { merchantRef: overrides.merchantRef } : {},
    ),
    basePolicy: overrides.basePolicy ?? BASE_POLICY,
    now: T60,
  };
}

/** A USDC-on-Ethereum acceptance request (in bounds by default). */
function request(overrides: { chainId?: ChainId; amount?: CryptoAmount; quote?: CryptoQuote } = {}): CryptoAcceptanceRequest {
  return {
    assetId: USDC.id,
    chainId: overrides.chainId ?? ETH_CHAIN,
    amount: overrides.amount ?? usdcAmount(2_000_000n),
    ...(overrides.quote !== undefined ? { quote: overrides.quote } : {}),
  };
}

describe("activateCryptoAcceptance — construction laws", () => {
  it("activates with the composed policy carried verbatim in a frozen ACTIVE record", () => {
    const activation = activeActivationFixture();
    expect(activation.id).toBe("activation.fixture.1");
    expect(activation.state).toBe("ACTIVE");
    expect(activation.merchantId).toBe("merchant.fixture.1");
    expect(activation.activatedAt).toBe(T60);
    expect(Object.isFrozen(activation)).toBe(true);
    // The policy is COMPOSED through defineMerchantCryptoAcceptancePolicy:
    // a fresh record, structurally verbatim to the fixture policy.
    expect(activation.policy).not.toBe(CRYPTO_POLICY);
    expect(activation.policy).toEqual(CRYPTO_POLICY);
    expect(activation.policy.basePolicyId).toBe(BASE_POLICY.id);
    expect(activation.policy.assets.map((asset) => asset.assetId)).toEqual([USDC.id, ETH.id]);
  });

  it("the merchantMayActivateCryptoAcceptance gate opens at VERIFIED — a verified merchant activates", () => {
    const draft = draftMerchantFixture();
    const submitted = submitMerchantApplication(draft, T1);
    const verified = verifyMerchant(submitted, {
      verificationRef: "verification:activation.1",
      now: T10,
    });
    expect(draft.state).toBe("DRAFT");
    expect(merchantMayActivateCryptoAcceptance(draft)).toBe(false);
    expect(verified.state).toBe("VERIFIED");
    expect(merchantMayActivateCryptoAcceptance(verified)).toBe(true);
    const activation = activateCryptoAcceptance({
      id: "activation.test.verified",
      merchant: verified,
      policyInput: policyInput(),
      basePolicy: BASE_POLICY,
      now: T10,
    });
    expect(activation.state).toBe("ACTIVE");
    expect(activation.merchantId).toBe(verified.id);
  });

  it("refuses activation for a DRAFT merchant (verified-or-active only)", () => {
    expectValidationError(
      () => activateCryptoAcceptance(activateInput({ merchant: draftMerchantFixture() })),
      /verified merchant/,
    );
  });

  it("refuses a composed policy that references a different merchant", () => {
    expectValidationError(
      () => activateCryptoAcceptance(activateInput({ merchantRef: "merchant.other" })),
      /reference the activating merchant exactly/,
    );
  });

  it("refuses a base policy that does not declare STABLECOIN_CRYPTO (the composition law)", () => {
    expectValidationError(
      () => activateCryptoAcceptance(activateInput({ basePolicy: NO_CRYPTO_BASE })),
      /STABLECOIN_CRYPTO/,
    );
  });
});

describe("deactivateCryptoAcceptance — immutable history", () => {
  it("deactivation returns a NEW frozen DEACTIVATED record; the original stays untouched", () => {
    const activation = activeActivationFixture();
    const deactivated = deactivateCryptoAcceptance(activation, {
      reason: "merchant paused crypto",
      now: T60 + 600_000n,
    });
    expect(deactivated).not.toBe(activation);
    expect(Object.isFrozen(deactivated)).toBe(true);
    expect(deactivated.state).toBe("DEACTIVATED");
    expect(deactivated.deactivatedAt).toBe(T60 + 600_000n);
    expect(deactivated.deactivationReason).toBe("merchant paused crypto");
    // The original record is immutable history — never rewritten:
    expect(activation.state).toBe("ACTIVE");
    expect(activation.deactivatedAt).toBeUndefined();
    expect(activation.deactivationReason).toBeUndefined();
    // The historical policy snapshot is shared VERBATIM inside both records:
    expect(deactivated.policy).toBe(activation.policy);
    expect(deactivated.policy.id).toBe(CRYPTO_POLICY.id);
  });

  it("only an ACTIVE activation can be deactivated (a DEACTIVATED record is terminal)", () => {
    const deactivated = deactivateCryptoAcceptance(activeActivationFixture(), {
      reason: "paused",
      now: T60 + 600_000n,
    });
    expectValidationError(
      () => deactivateCryptoAcceptance(deactivated, { reason: "again", now: T60 + 600_000n }),
      /only an ACTIVE/,
    );
  });

  it("deactivation requires a non-empty reason", () => {
    expectValidationError(
      () => deactivateCryptoAcceptance(activeActivationFixture(), { reason: "", now: T60 + 600_000n }),
      /non-empty reason/,
    );
  });
});

describe("the typed view + the decision surfaces over an activation", () => {
  it("acceptanceOfferView: ids, quoteValidityMs and a fresh frozen asset snapshot", () => {
    const activation = activeActivationFixture();
    const view = acceptanceOfferView(activation);
    expect(view.policyId).toBe(CRYPTO_POLICY.id);
    expect(view.basePolicyId).toBe(BASE_POLICY.id);
    expect(view.quoteValidityMs).toBe(300_000n);
    expect(Object.isFrozen(view)).toBe(true);
    expect(view.assets.map((asset) => asset.assetId)).toEqual([USDC.id, ETH.id]);
    expect(view.assets[0]?.chains).toEqual(["chain.eth-mainnet", "chain.base-mainnet"]);
    // A FRESH frozen snapshot — the view never aliases the policy's records:
    expect(Object.isFrozen(view.assets)).toBe(true);
    expect(view.assets[0]).not.toBe(activation.policy.assets[0]);
    expect(Object.isFrozen(view.assets[0])).toBe(true);
  });

  it("a DEACTIVATED activation rejects with the typed ACTIVATION_INACTIVE reason — never an exception", () => {
    const deactivated = deactivateCryptoAcceptance(activeActivationFixture(), {
      reason: "paused",
      now: T60 + 600_000n,
    });
    const decision = activationMatches(deactivated, request(), T60 + 600_000n);
    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toEqual(["ACTIVATION_INACTIVE"]);
    expect(() => activationMatches(deactivated, request(), T60 + 600_000n)).not.toThrow();
  });

  it("an ACTIVE activation delegates to the crypto matcher — rejection reasons pass through verbatim", () => {
    const activation = activeActivationFixture();
    // In bounds at T60: accepted, no reasons.
    const inBounds = activationMatches(activation, request(), T60);
    expect(inBounds.accepted).toBe(true);
    expect(inBounds.reasons).toEqual([]);
    // Below the per-asset minimum: the matcher's typed reason, verbatim.
    const below = activationMatches(activation, request({ amount: usdcAmount(1n) }), T60);
    expect(below.accepted).toBe(false);
    expect(below.reasons).toEqual(["AMOUNT_BELOW_MINIMUM"]);
    // Expiry-at-boundary semantics via the delegated matcher: a quote is
    // expired AT its validUntil (the old suite's boundary site).
    const quote = canonicalQuote();
    const atBoundary = activationMatches(activation, request({ quote }), quote.validUntil);
    expect(atBoundary.accepted).toBe(false);
    expect(atBoundary.reasons).toEqual(["QUOTE_EXPIRED"]);
  });

  it("the both-planes evaluation: a base rejection unions BASE_POLICY_REJECTED with the crypto reasons", () => {
    const activation = activeActivationFixture();
    // The base plane accepts (method.usdc + USD) → the decision is the
    // crypto matcher's alone:
    const accepted = activationEvaluate(
      activation,
      BASE_POLICY,
      request(),
      { methodId: "method.usdc", currency: "USD" },
      T60,
    );
    expect(accepted.accepted).toBe(true);
    expect(accepted.reasons).toEqual([]);
    // The base plane rejects (JPY is not a served currency — the fixture
    // base policy serves EUR, so the old suite's EUR rejection carrier is
    // adapted) while the crypto plane independently rejects the chain →
    // the typed union, in order:
    const rejected = activationEvaluate(
      activation,
      BASE_POLICY,
      request({ chainId: POLYGON_CHAIN }),
      { methodId: "method.usdc", currency: "JPY" },
      T60,
    );
    expect(rejected.accepted).toBe(false);
    expect(rejected.reasons).toEqual(["BASE_POLICY_REJECTED", "CHAIN_NOT_ACCEPTED"]);
  });
});
