/**
 * @payswap/merchant — the shared deterministic test fixtures (P5-W3,
 * lane R3-W3). Every fixture is a pure frozen value built through the
 * REAL package constructors (no object literals bypassing validation),
 * so the fixtures are themselves evidence that the constructors work.
 * No clock, no randomness, no network: same fixtures, same bytes.
 */

import {
  defineCryptoAsset,
  defineCryptoAmount,
  defineCryptoQuote,
  defineCryptoAssetAcceptance,
  defineMerchantCryptoAcceptancePolicy,
  defineMerchantPaymentIntent,
  defineRailAssetBinding,
  draftMerchant,
  submitMerchantApplication,
  verifyMerchant,
  activateMerchant,
  activateCryptoAcceptance,
  openCheckoutFlow,
  buildCheckoutAuthorization,
  buildWalletPaymentHandoffRequest,
  performWalletPaymentHandoff,
  defineNativeStripeCryptoSettlementRoute,
  defineExternalConversionSettlementRoute,
  asSettlementInstructionId,
  defineWebhookEvent,
} from "../src/index.ts";
import type {
  CryptoAsset,
  CryptoAmount,
  CryptoQuote,
  MerchantCryptoAcceptancePolicy,
  PinnedPaymentAcceptancePolicy,
  PinnedConnectedInstance,
  PinnedMerchantSettlementDestination,
  MerchantProfile,
  CryptoAcceptanceActivation,
  CheckoutFlow,
  CheckoutAuthorizationBundle,
  PinnedWalletPaymentExecutionPort,
  PinnedWalletPaymentHandoffRequest,
  PinnedWalletPaymentHandoffReceipt,
  NativeStripeCryptoSettlementRoute,
  ExternalConversionSettlementRoute,
  MerchantCheckoutWebhookEvent,
  PinnedMoney,
} from "../src/index.ts";

// ---------------------------------------------------------------------------
// The pinned clock (every fixture instant is a fixed bigint)
// ---------------------------------------------------------------------------

/** The fixed epoch the fixtures live in (2026-10-19T00:00:00Z in ms). */
export const T0 = 1_761_628_800_000n;
/** One minute later. */
export const T1 = T0 + 60_000n;
/** Ten minutes later. */
export const T10 = T0 + 600_000n;
/** One hour later. */
export const T60 = T0 + 3_600_000n;

// ---------------------------------------------------------------------------
// Money + assets
// ---------------------------------------------------------------------------

/** Exact USD money (minor units). */
export function usd(value: bigint): PinnedMoney {
  return Object.freeze({ value, currency: "USD" });
}

/** Exact EUR money (minor units). */
export function eur(value: bigint): PinnedMoney {
  return Object.freeze({ value, currency: "EUR" });
}

/** The pinned stablecoin asset (USDC, 6 decimals). */
export const USDC: CryptoAsset = defineCryptoAsset({
  id: "asset.usdc",
  displayName: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  kind: "STABLECOIN",
});

/** The pinned native asset (ETH, 18 decimals). */
export const ETH: CryptoAsset = defineCryptoAsset({
  id: "asset.eth",
  displayName: "Ether",
  symbol: "ETH",
  decimals: 18,
  kind: "NATIVE_CRYPTO",
});

/** A USDC amount at the asset's scale. */
export function usdcAmount(value: bigint): CryptoAmount {
  return defineCryptoAmount(USDC, value);
}

/** An ETH amount at the asset's scale. */
export function ethAmount(value: bigint): CryptoAmount {
  return defineCryptoAmount(ETH, value);
}

// ---------------------------------------------------------------------------
// Quotes (exact cross-multiplication always holds)
// ---------------------------------------------------------------------------

/**
 * The canonical exact quote: 100.00 USD (10_000 minor units) for
 * 100.000000 USDC (100_000_000 minor units) — ratio 1:10_000, so
 * 10_000 * 10_000 === 100_000_000 * 1 exactly.
 */
export function canonicalQuote(id = "quote.usdc.1"): CryptoQuote {
  return defineCryptoQuote({
    id,
    assetId: USDC.id,
    chainId: "chain.eth-mainnet",
    fiatAmount: usd(10_000n),
    cryptoAmount: usdcAmount(100_000_000n),
    ratio: { numerator: 1n, denominator: 10_000n },
    fees: usd(30n),
    quotedAt: T0,
    validUntil: T0 + 7_200_000n,
    sourceRef: "source.psp.fixture",
  });
}

// ---------------------------------------------------------------------------
// Acceptance policies + the base policy
// ---------------------------------------------------------------------------

/** The merchant's base acceptance policy (STABLECOIN_CRYPTO declared). */
export const BASE_POLICY: PinnedPaymentAcceptancePolicy = Object.freeze({
  id: "policy.base.1",
  merchantRef: "merchant.fixture.1",
  methods: Object.freeze(["CARD", "STABLECOIN_CRYPTO", "BANK_TRANSFER"] as const),
  methodCatalog: Object.freeze([
    Object.freeze({
      id: "method.card",
      kind: "CARD",
      displayName: "Card",
      currencies: Object.freeze(["USD", "EUR"]),
    }),
    Object.freeze({
      id: "method.usdc",
      kind: "STABLECOIN_CRYPTO",
      displayName: "Stablecoin (USDC)",
      currencies: Object.freeze(["USD"]),
    }),
    Object.freeze({
      id: "method.bank",
      kind: "BANK_TRANSFER",
      displayName: "Bank transfer",
      currencies: Object.freeze(["EUR"]),
    }),
  ]),
  currencies: Object.freeze(["USD", "EUR"]),
  geography: Object.freeze(["US", "DE", "FR"]),
});

/** The composed crypto acceptance policy over the base policy. */
export const CRYPTO_POLICY: MerchantCryptoAcceptancePolicy =
  defineMerchantCryptoAcceptancePolicy(
    {
      id: "policy.crypto.1",
      merchantRef: "merchant.fixture.1",
      basePolicyId: BASE_POLICY.id,
      assets: Object.freeze([
        defineCryptoAssetAcceptance({
          assetId: USDC.id,
          chains: Object.freeze(["chain.eth-mainnet", "chain.base-mainnet"]),
          minAmount: usdcAmount(1_000_000n),
          maxAmount: usdcAmount(1_000_000_000_000n),
          requiredConfirmations: 3n,
        }),
        defineCryptoAssetAcceptance({
          assetId: ETH.id,
          chains: Object.freeze(["chain.eth-mainnet"]),
          requiredConfirmations: 12n,
        }),
      ]),
      quoteValidityMs: 300_000n,
    },
    BASE_POLICY,
  );

// ---------------------------------------------------------------------------
// The merchant profile journey (DRAFT → SUBMITTED → VERIFIED → ACTIVE)
// ---------------------------------------------------------------------------

/** The settlement destination (EXTERNAL only — provenance carried). */
export const DESTINATION: PinnedMerchantSettlementDestination = Object.freeze({
  id: "destination.bank.1",
  kind: "BANK_ACCOUNT",
  currency: "USD",
  externalRef: "external://bank/fixture-account",
  provenance: Object.freeze({
    source: "merchant-portal",
    reference: "kyc-record-1",
    recordedAt: T0,
  }),
});

/** A DRAFT merchant. */
export function draftMerchantFixture(): MerchantProfile {
  return draftMerchant({
    id: "merchant.fixture.1",
    businessName: "Fixture Coffee Roasters",
    country: "US",
    pricingCurrency: "USD",
    supportContact: "support@fixture.example",
    now: T0,
  });
}

/** The full DRAFT → SUBMITTED → VERIFIED → ACTIVE walk. */
export function activeMerchantFixture(): MerchantProfile {
  const submitted = submitMerchantApplication(draftMerchantFixture(), T1);
  const verified = verifyMerchant(submitted, {
    verificationRef: "verification:fixture-1",
    now: T10,
  });
  return activateMerchant(verified, {
    settlementDestination: DESTINATION,
    now: T60,
  });
}

/** An ACTIVE crypto acceptance activation over the fixtures. */
export function activeActivationFixture(): CryptoAcceptanceActivation {
  return activateCryptoAcceptance({
    id: "activation.fixture.1",
    merchant: activeMerchantFixture(),
    policyInput: {
      id: CRYPTO_POLICY.id,
      merchantRef: CRYPTO_POLICY.merchantRef,
      basePolicyId: CRYPTO_POLICY.basePolicyId,
      assets: CRYPTO_POLICY.assets,
      quoteValidityMs: CRYPTO_POLICY.quoteValidityMs,
    },
    basePolicy: BASE_POLICY,
    now: T60,
  });
}

// ---------------------------------------------------------------------------
// Rail bindings + the checkout flow
// ---------------------------------------------------------------------------

/** The canonical USDC-on-Ethereum rail binding. */
export const USDC_ETH_BINDING = defineRailAssetBinding({
  merchantAssetId: USDC.id,
  merchantChainId: "chain.eth-mainnet",
  chainRef: "eth:mainnet",
  assetIdentity: Object.freeze({
    symbol: "USDC",
    chain: "eth:mainnet",
    assetId: "asset.usdc.eth",
  }),
});

/** The canonical USDC-on-Base rail binding. */
export const USDC_BASE_BINDING = defineRailAssetBinding({
  merchantAssetId: USDC.id,
  merchantChainId: "chain.base-mainnet",
  chainRef: "base:mainnet",
  assetIdentity: Object.freeze({
    symbol: "USDC",
    chain: "base:mainnet",
    assetId: "asset.usdc.base",
  }),
});

/** An open checkout flow over the canonical fixtures. */
export function openFlowFixture(): CheckoutFlow {
  return openCheckoutFlow({
    id: "flow.fixture.1",
    merchantId: "merchant.fixture.1",
    activation: activeActivationFixture(),
    basePolicy: BASE_POLICY,
    cart: { amount: usd(10_000n) },
    quotes: [canonicalQuote()],
    railBindings: [USDC_ETH_BINDING, USDC_BASE_BINDING],
    now: T60,
    expiresAt: T60 + 3_600_000n,
  });
}

// ---------------------------------------------------------------------------
// The wallet-payment injection port (the handoff-only stub)
// ---------------------------------------------------------------------------
