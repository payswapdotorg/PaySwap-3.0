/**
 * The checkout FLOW suite (P5-W3, lane R3-W3; PORT of old
 * packages/merchant-checkout/test/checkout.test.ts @ 8a735bf — 15
 * sites → 14 tests here): openCheckoutFlow composes the intent +
 * session through the real constructors over an ACTIVE activation of
 * the SAME merchant narrowing the SAME base policy, validates the cart
 * (positive exact bigint money, expiry strictly after opening) and
 * every quote (offered-asset snapshot, accepted chain, rail binding,
 * matchesCryptoAcceptance, cart currency + exact cart amount, unique
 * option ids), and derives the customer-facing options — crypto
 * wallet options (INV-2 re-verified display amounts) BEFORE the
 * FIAT_FALLBACK options of the base policy's method catalog. The old
 * "validates flow ids" site lives in identifiers.test.ts (the shared
 * branded-id law); the session offered-asset snapshot law lives in
 * session.test.ts. Deterministic: fixed bigint instants only (no
 * clock, no randomness).
 */

import { describe, expect, it } from "vitest";
import {
  checkoutOption,
  deriveDisplayedCryptoAmount,
  isOptionExpired,
  openCheckoutFlow,
} from "../src/checkout.ts";
import { deactivateCryptoAcceptance } from "../src/activation.ts";
import { defineRailAssetBinding } from "../src/checkout-support.ts";
import { defineCryptoQuote } from "../src/quotes.ts";
import type { CryptoQuote } from "../src/quotes.ts";
import { defineCryptoAsset, defineCryptoAmount } from "../src/assets.ts";
import type { CryptoAmount } from "../src/assets.ts";
import { ValidationError } from "../src/errors.ts";
import type { PinnedMoney } from "../src/pins/protocol.ts";
import {
  BASE_POLICY,
  CRYPTO_POLICY,
  T0,
  T60,
  USDC,
  USDC_BASE_BINDING,
  USDC_ETH_BINDING,
  activeActivationFixture,
  canonicalQuote,
  eur,
  openFlowFixture,
  usd,
  usdcAmount,
} from "./fixtures.ts";

type FlowInput = Parameters<typeof openCheckoutFlow>[0];

const CRYPTO_OPTION_ID = "crypto:asset.usdc@chain.eth-mainnet";
const EXPIRY = T60 + 3_600_000n;

/** The pinned rejection law: the typed error class AND the documented message. */
function expectValidationError(action: () => unknown, pattern: RegExp): void {
  expect(action).toThrow(ValidationError);
  expect(action).toThrow(pattern);
}

/** The canonical flow input over the fixtures, with per-test overrides. */
function flowInput(overrides: Partial<FlowInput> = {}): FlowInput {
  return {
    id: "flow.fixture.1",
    merchantId: "merchant.fixture.1",
    activation: activeActivationFixture(),
    basePolicy: BASE_POLICY,
    cart: { amount: usd(10_000n) },
    quotes: [canonicalQuote()],
    railBindings: [USDC_ETH_BINDING, USDC_BASE_BINDING],
    now: T60,
    expiresAt: EXPIRY,
    ...overrides,
  };
}

/**
 * An exact-quote builder: any (fiat, crypto) pair priced exactly
 * `fiat.value : crypto.value` (numerator/denominator), so the INV-2
 * cross-multiplication holds by construction.
 */
function exactQuote(input: {
  readonly id: string;
  readonly fiat: PinnedMoney;
  readonly crypto: CryptoAmount;
  readonly chainId?: string;
}): CryptoQuote {
  return defineCryptoQuote({
    id: input.id,
    assetId: input.crypto.assetId,
    chainId: input.chainId ?? "chain.eth-mainnet",
    fiatAmount: input.fiat,
    cryptoAmount: input.crypto,
    ratio: { numerator: input.fiat.value, denominator: input.crypto.value },
    fees: { value: 0n, currency: input.fiat.currency },
    quotedAt: T0,
    validUntil: T0 + 7_200_000n,
    sourceRef: "source.psp.fixture",
  });
}

/** An asset OUTSIDE the fixture policy's offered snapshot (USDT). */
const USDT = defineCryptoAsset({
  id: "asset.usdt",
  displayName: "Tether USD",
  symbol: "USDT",
  decimals: 6,
  kind: "STABLECOIN",
});

describe("openCheckoutFlow — the built flow", () => {
  it("opens a frozen flow: intent + session through the real constructors, crypto options before fiat options", () => {
    const flow = openFlowFixture();
    expect(flow.id).toBe("flow.fixture.1");
    expect(flow.merchantId).toBe("merchant.fixture.1");
    expect(flow.openedAt).toBe(T60);
    expect(Object.isFrozen(flow)).toBe(true);
    // The intent is composed through defineMerchantPaymentIntent:
    expect(flow.intent.id).toBe("intent:flow.fixture.1");
    expect(flow.intent.state).toBe("REQUIRES_PAYMENT_METHOD");
    expect(flow.intent.merchantRef).toBe("merchant.fixture.1");
    expect(flow.intent.acceptancePolicyId).toBe(BASE_POLICY.id);
    expect(flow.intent.cryptoAcceptancePolicyId).toBe(CRYPTO_POLICY.id);
    expect(flow.intent.amount).toEqual(usd(10_000n));
    expect(flow.intent.createdAt).toBe(T60);
    expect(flow.intent.expiresAt).toBe(EXPIRY);
    // The session is composed through openMerchantCheckoutSession (the
    // deep offered-snapshot law is the session suite's):
    expect(flow.session.id).toBe("session:flow.fixture.1");
    expect(flow.session.state).toBe("OPEN");
    expect(flow.session.expiresAt).toBe(flow.intent.expiresAt);
    expect(flow.session.offeredAssets.map((asset) => asset.assetId)).toEqual([USDC.id, "asset.eth"]);
    // CRYPTO_WALLET_PAYMENT options first, then the FIAT fallbacks:
    expect(flow.options.map((option) => option.kind)).toEqual([
      "CRYPTO_WALLET_PAYMENT",
      "FIAT_FALLBACK",
    ]);
    const cryptoOption = checkoutOption(flow, CRYPTO_OPTION_ID);
    expect(cryptoOption.kind).toBe("CRYPTO_WALLET_PAYMENT");
    if (cryptoOption.kind !== "CRYPTO_WALLET_PAYMENT") {
      throw new Error("the fixture option must be a crypto option");
    }
    expect(cryptoOption.optionId).toBe(CRYPTO_OPTION_ID);
    // The quote rides along as an OBSERVATION:
    expect(cryptoOption.quote).toEqual(canonicalQuote());
    expect(cryptoOption.railBinding).toEqual(USDC_ETH_BINDING);
    expect(cryptoOption.displayAmount).toBe(cryptoOption.quote.cryptoAmount);
  });
});

describe("openCheckoutFlow — fail-closed opening laws", () => {
  it("requires an ACTIVE activation of THIS merchant narrowing THIS base policy", () => {
    const deactivated = deactivateCryptoAcceptance(activeActivationFixture(), {
      reason: "paused",
      now: T60 + 60_000n,
    });
    expectValidationError(
      () => openCheckoutFlow(flowInput({ activation: deactivated })),
      /ACTIVE crypto acceptance/,
    );
    expectValidationError(
      () => openCheckoutFlow(flowInput({ merchantId: "merchant.other" })),
      /must belong to the checkout merchant/,
    );
    const wrongBase = Object.freeze({ ...BASE_POLICY, id: "policy.base.other" });
    expectValidationError(
      () => openCheckoutFlow(flowInput({ basePolicy: wrongBase })),
      /composed crypto policy narrows/,
    );
  });

  it("the cart amount must be positive exact bigint Money", () => {
    expectValidationError(
      () => openCheckoutFlow(flowInput({ cart: { amount: usd(0n) } })),
      /must be positive/,
    );
    expectValidationError(
      () => openCheckoutFlow(flowInput({ cart: { amount: usd(-10_000n) } })),
      /must be positive/,
    );
    expectValidationError(
      () =>
        openCheckoutFlow(
          flowInput({ cart: { amount: { value: 10_000, currency: "USD" } as unknown as PinnedMoney } }),
        ),
      /exact Money/,
    );
  });

  it("the flow must expire strictly after opening", () => {
    expectValidationError(
      () => openCheckoutFlow(flowInput({ expiresAt: T60 })),
      /strictly after opening/,
    );
    expectValidationError(
      () => openCheckoutFlow(flowInput({ expiresAt: T60 - 1n })),
      /strictly after opening/,
    );
  });

  it("a quote's asset must be in the offered acceptance snapshot", () => {
    const offSnapshot = exactQuote({
      id: "quote.usdt.1",
      fiat: usd(10_000n),
      crypto: defineCryptoAmount(USDT, 10_000_000n),
    });
    expectValidationError(
      () => openCheckoutFlow(flowInput({ quotes: [offSnapshot] })),
      /not in the offered/,
    );
  });

  it("a quote's chain must be accepted for its asset", () => {
    const offChain = exactQuote({
      id: "quote.usdc.polygon",
      fiat: usd(10_000n),
      crypto: usdcAmount(100_000_000n),
      chainId: "chain.polygon-mainnet",
    });
    expectValidationError(
      () => openCheckoutFlow(flowInput({ quotes: [offChain] })),
      /not accepted for that asset/,
    );
  });

  it("the typed rail binding: kernel shape laws + a binding for every offered pair", () => {
    // The kernel side is validated by the kernel's own shape laws:
    expectValidationError(
      () =>
        defineRailAssetBinding({
          merchantAssetId: USDC.id,
          merchantChainId: "chain.eth-mainnet",
          chainRef: "not-a-chain-ref",
          assetIdentity: { symbol: "USDC", chain: "eth:mainnet", assetId: "asset.usdc.eth" },
        }),
      /kernel chain shape/,
    );
    expectValidationError(
      () =>
        defineRailAssetBinding({
          merchantAssetId: USDC.id,
          merchantChainId: "chain.eth-mainnet",
          chainRef: "eth:mainnet",
          assetIdentity: { symbol: "TOOLONGSYMBOL", chain: "eth:mainnet", assetId: "asset.usdc.eth" },
        }),
      /asset-identity shape law/,
    );
    // The kernel asset must live on the bound kernel chain:
    expectValidationError(
      () =>
        defineRailAssetBinding({
          merchantAssetId: USDC.id,
          merchantChainId: "chain.eth-mainnet",
          chainRef: "eth:mainnet",
          assetIdentity: {
            symbol: "USDC",
            chain: "solana:mainnet-beta",
            assetId: "asset.usdc.sol",
          },
        }),
      /must live on the bound kernel chain/,
    );
    // ... and the flow requires a rail binding for every offered pair:
    const onBase = exactQuote({
      id: "quote.usdc.base",
      fiat: usd(10_000n),
      crypto: usdcAmount(100_000_000n),
      chainId: "chain.base-mainnet",
    });
    expectValidationError(
      () => openCheckoutFlow(flowInput({ quotes: [onBase], railBindings: [USDC_ETH_BINDING] })),
      /no rail binding was supplied/,
    );
  });

  it("every quote must match the composed acceptance — the matcher's typed reasons are reported", () => {
    const belowMinimum = exactQuote({
      id: "quote.usdc.below",
      fiat: usd(10n),
      crypto: usdcAmount(100_000n),
    });
    expectValidationError(
      () => openCheckoutFlow(flowInput({ quotes: [belowMinimum] })),
      /does not match the acceptance policy/,
    );
    expectValidationError(
      () => openCheckoutFlow(flowInput({ quotes: [belowMinimum] })),
      /AMOUNT_BELOW_MINIMUM/,
    );
  });

  it("a quote must be denominated in the cart currency and price the exact cart amount", () => {
    const euroPriced = exactQuote({
      id: "quote.usdc.eur",
      fiat: eur(10_000n),
      crypto: usdcAmount(100_000_000n),
    });
    expectValidationError(
      () => openCheckoutFlow(flowInput({ quotes: [euroPriced] })),
      /denominated in the cart's pricing currency/,
    );
    const wrongTotal = exactQuote({
      id: "quote.usdc.half",
      fiat: usd(5_000n),
      crypto: usdcAmount(50_000_000n),
    });
    expectValidationError(
      () => openCheckoutFlow(flowInput({ quotes: [wrongTotal] })),
      /price the exact cart amount/,
    );
  });

  it("crypto option ids must not repeat (one option per asset×chain)", () => {
    const duplicatePair = [canonicalQuote("quote.usdc.1"), canonicalQuote("quote.usdc.2")];
    expectValidationError(
      () => openCheckoutFlow(flowInput({ quotes: duplicatePair })),
      /must not repeat/,
    );
  });

  it("FIAT_FALLBACK options derive from the base policy catalog (non-STABLECOIN_CRYPTO, serving the currency)", () => {
    const usdFlow = openFlowFixture();
    const usdFiat = usdFlow.options.filter((option) => option.kind === "FIAT_FALLBACK");
    // USD cart: the card method serves USD; the STABLECOIN_CRYPTO catalog
    // entry never surfaces as a fallback; the EUR-only bank is omitted.
    expect(usdFiat.map((option) => option.optionId)).toEqual(["fiat:method.card"]);
    if (usdFiat[0]?.kind !== "FIAT_FALLBACK") {
      throw new Error("the fixture flow must carry a fiat fallback");
    }
    // Deterministic option ids: `fiat:${method.id}`.
    expect(usdFiat[0].methodId).toBe("method.card");
    expect(usdFiat[0].displayName).toBe("Card");
    // EUR cart: every non-STABLECOIN_CRYPTO method serving EUR, in catalog order.
    const eurFlow = openCheckoutFlow(
      flowInput({
        id: "flow.fixture.eur",
        cart: { amount: eur(10_000n) },
        quotes: [
          exactQuote({ id: "quote.usdc.eur1", fiat: eur(10_000n), crypto: usdcAmount(100_000_000n) }),
        ],
      }),
    );
    expect(
      eurFlow.options
        .filter((option) => option.kind === "FIAT_FALLBACK")
        .map((option) => option.optionId),
    ).toEqual(["fiat:method.card", "fiat:method.bank"]);
  });
});

describe("checkout flow — displayed amounts, option lookup, expiry", () => {
  it("deriveDisplayedCryptoAmount re-verifies the INV-2 cross-multiplication", () => {
    const quote = canonicalQuote();
    const display = deriveDisplayedCryptoAmount(quote);
    // The displayed amount is EXACTLY the quote's crypto amount...
    expect(display).toBe(quote.cryptoAmount);
    // ... because the cross-multiplication holds:
    expect(quote.fiatAmount.value * quote.ratio.denominator).toBe(
      quote.cryptoAmount.value * quote.ratio.numerator,
    );
    // A tampered quote with an inconsistent ratio is rejected fail-closed:
    const tampered = {
      ...quote,
      cryptoAmount: { ...quote.cryptoAmount, value: quote.cryptoAmount.value + 1n },
    } as CryptoQuote;
    expectValidationError(() => deriveDisplayedCryptoAmount(tampered), /cross-multiplication/);
  });

  it("checkoutOption looks options up by id and rejects unknown ids", () => {
    const flow = openFlowFixture();
    const crypto = checkoutOption(flow, CRYPTO_OPTION_ID);
    expect(crypto.kind).toBe("CRYPTO_WALLET_PAYMENT");
    expect(crypto.optionId).toBe(CRYPTO_OPTION_ID);
    const fiat = checkoutOption(flow, "fiat:method.card");
    expect(fiat.kind).toBe("FIAT_FALLBACK");
    expect(fiat.optionId).toBe("fiat:method.card");
    expectValidationError(() => checkoutOption(flow, "no-such-option"), /no such checkout option/);
  });

  it("crypto options expire AT validUntil (last usable instant is validUntil - 1); fiat options never", () => {
    const flow = openFlowFixture();
    const crypto = checkoutOption(flow, CRYPTO_OPTION_ID);
    expect(crypto.kind).toBe("CRYPTO_WALLET_PAYMENT");
    if (crypto.kind !== "CRYPTO_WALLET_PAYMENT") {
      throw new Error("the fixture option must be a crypto option");
    }
    const validUntil = crypto.quote.validUntil;
    expect(isOptionExpired(crypto, validUntil - 1n)).toBe(false);
    expect(isOptionExpired(crypto, validUntil)).toBe(true);
    const fiat = checkoutOption(flow, "fiat:method.card");
    expect(isOptionExpired(fiat, validUntil)).toBe(false);
    expect(isOptionExpired(fiat, validUntil + 600_000n)).toBe(false);
  });
});
