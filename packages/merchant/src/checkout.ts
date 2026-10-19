/**
 * @payswap/merchant — checkout flow construction (P5-W3, lane R3-W3;
 * PORT of old packages/merchant-checkout/src/checkout.ts flow half @
 * 8a735bf).
 *
 * Checkout-flow construction for a merchant cart/amount: CONSUMES the
 * checkout session mapping (`openMerchantCheckoutSession`) and
 * produces the customer-facing payment options on top:
 *
 * - CRYPTO_WALLET_PAYMENT options, one per accepted asset×chain with
 *   an attached quote held as an OBSERVATION with expiry-at-boundary
 *   semantics; the displayed crypto amount is DERIVED by exact
 *   cross-multiplication (integer bigint arithmetic — INV-2, no
 *   floats, no rounding);
 * - FIAT_FALLBACK options per merchant config (the base canonical
 *   policy's non-crypto methods).
 */

import { ValidationError } from "./errors.ts";
import { asCheckoutFlowId } from "./identifiers.ts";
import type { CheckoutFlowId } from "./identifiers.ts";
import type { PinnedMoney, PinnedTimestampMs } from "./pins/protocol.ts";
import type { PinnedPaymentAcceptancePolicy } from "./pins/payment.ts";
import { matchesCryptoAcceptance } from "./acceptance-evaluate.ts";
import { acceptanceOfferView } from "./activation.ts";
import type { CryptoAcceptanceActivation } from "./activation.ts";
import type { CryptoAssetAcceptance } from "./acceptance-policy.ts";
import { defineMerchantPaymentIntent } from "./intent.ts";
import type { MerchantPaymentIntent } from "./intent.ts";
import { openMerchantCheckoutSession } from "./session.ts";
import type { MerchantCheckoutSession } from "./session.ts";
import type { CryptoQuote } from "./quotes.ts";
import type { CryptoAmount } from "./assets.ts";
import type { CryptoAssetId, ChainId } from "./identifiers.ts";
import { findRailBinding } from "./checkout-support.ts";
import type { RailAssetBinding } from "./checkout-support.ts";

/** One customer-facing crypto wallet payment option. */
export interface CustomerPaymentOption {
  readonly kind: "CRYPTO_WALLET_PAYMENT";
  readonly optionId: string;
  readonly assetId: CryptoAssetId;
  readonly chainId: ChainId;
  readonly railBinding: RailAssetBinding;
  /** The quote, attached as an OBSERVATION (quotes never authorize by themselves). */
  readonly quote: CryptoQuote;
  /**
   * The displayed crypto amount: EXACTLY the quote's crypto amount,
   * and always re-derived through exact cross-multiplication at
   * construction.
   */
  readonly displayAmount: CryptoAmount;
}

/** One customer-facing fiat fallback option (per merchant base config). */
export interface FiatPaymentOption {
  readonly kind: "FIAT_FALLBACK";
  readonly optionId: string;
  readonly methodId: string;
  readonly displayName: string;
}

/** Either option kind. */
export type CheckoutPaymentOption = CustomerPaymentOption | FiatPaymentOption;

/** The composed checkout flow: intent + session + customer-facing options. */
export interface CheckoutFlow {
  readonly id: CheckoutFlowId;
  readonly merchantId: string;
  readonly intent: MerchantPaymentIntent;
  readonly session: MerchantCheckoutSession;
  readonly options: readonly CheckoutPaymentOption[];
  readonly openedAt: PinnedTimestampMs;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Derive the DISPLAYED crypto amount from a quote by EXACT
 * cross-multiplication: the quote's invariant
 * `fiatAmount.value * ratio.denominator === cryptoAmount.value * ratio.numerator`
 * is RE-VERIFIED here (bigint equality — INV-2) and the quote's exact
 * crypto amount is returned. A quote whose cross-multiplication does
 * not hold exactly is rejected fail-closed (it never happens for
 * quotes built through `defineCryptoQuote`; this guard protects
 * against untyped input).
 */
export function deriveDisplayedCryptoAmount(quote: CryptoQuote): CryptoAmount {
  if (quote === null || typeof quote !== "object" || !isNonEmptyString(quote.id)) {
    throw new ValidationError("deriveDisplayedCryptoAmount requires a CryptoQuote");
  }
  if (
    quote.fiatAmount.value * quote.ratio.denominator !==
    quote.cryptoAmount.value * quote.ratio.numerator
  ) {
    throw new ValidationError(
      "the displayed amount must satisfy exact cross-multiplication (INV-2) — the quote is inconsistent",
      { quoteId: quote.id },
    );
  }
  return quote.cryptoAmount;
}

/** Deterministic option id for an asset×chain pair. */
function cryptoOptionId(assetId: string, chainId: string): string {
  return `crypto:${assetId}@${chainId}`;
}

/**
 * Open a checkout flow for a merchant cart/amount.
 *
 * Fail-closed laws:
 * - the activation must be ACTIVE;
 * - the cart amount must be positive exact Money in the merchant's
 *   pricing currency, and the intent must expire strictly after
 *   opening;
 * - every supplied quote must MATCH the composed acceptance (asset,
 *   chain, amount bounds, unexpired at open — via
 *   `matchesCryptoAcceptance`) and its asset×chain must be in the
 *   offered snapshot with a rail binding;
 * - the intent + session are constructed through
 *   `defineMerchantPaymentIntent` / `openMerchantCheckoutSession` (the
 *   session's offered-assets snapshot is the acceptance law).
 *
 * Fiat fallback options are derived from the base policy's method
 * catalog (every non-STABLECOIN_CRYPTO method serving the cart
 * currency) — per merchant configuration.
 */
export function openCheckoutFlow(input: {
  readonly id: string;
  readonly merchantId: string;
  readonly activation: CryptoAcceptanceActivation;
  readonly basePolicy: PinnedPaymentAcceptancePolicy;
  readonly cart: { readonly amount: PinnedMoney };
  readonly quotes: readonly CryptoQuote[];
  readonly railBindings: readonly RailAssetBinding[];
  readonly now: PinnedTimestampMs;
  readonly expiresAt: PinnedTimestampMs;
}): CheckoutFlow {
  const id = asCheckoutFlowId(input.id);
  if (input.activation === null || typeof input.activation !== "object") {
    throw new ValidationError("a checkout flow requires a CryptoAcceptanceActivation", { id });
  }
  if (input.activation.state !== "ACTIVE") {
    throw new ValidationError(
      "a checkout flow can only be opened against an ACTIVE crypto acceptance activation",
      { id, activationId: input.activation.id, activationState: input.activation.state },
    );
  }
  if (input.activation.merchantId !== input.merchantId) {
    throw new ValidationError("the activation must belong to the checkout merchant", {
      id,
      merchantId: input.merchantId,
      activationMerchantId: input.activation.merchantId,
    });
  }
  if (input.activation.policy.basePolicyId !== input.basePolicy.id) {
    throw new ValidationError(
      "the base policy must be the one the composed crypto policy narrows",
      { id, basePolicyId: input.basePolicy.id, composedBasePolicyId: input.activation.policy.basePolicyId },
    );
  }
  const amount = input.cart.amount;
  if (amount === null || typeof amount !== "object" || typeof amount.value !== "bigint") {
    throw new ValidationError("the cart amount must be exact Money", { id });
  }
  if (amount.value <= 0n) {
    throw new ValidationError("the cart amount must be positive", { id });
  }
  if (typeof input.now !== "bigint" || typeof input.expiresAt !== "bigint") {
    throw new ValidationError("checkout bounds must be bigint TimestampMs", { id });
  }
  if (input.expiresAt <= input.now) {
    throw new ValidationError("the checkout flow must expire strictly after opening", { id });
  }
  if (!Array.isArray(input.quotes)) {
    throw new ValidationError("quotes must be an array", { id });
  }
  if (!Array.isArray(input.railBindings) || input.railBindings.length === 0) {
    throw new ValidationError("at least one rail binding is required to open crypto options", {
      id,
    });
  }

  const view = acceptanceOfferView(input.activation);
  const findOffered = (assetId: string): CryptoAssetAcceptance | undefined =>
    view.assets.find((asset) => asset.assetId === assetId);

  const options: CustomerPaymentOption[] = [];
  const seenOptionIds = new Set<string>();
  for (const quote of input.quotes) {
    if (quote === null || typeof quote !== "object" || !isNonEmptyString(quote.id)) {
      throw new ValidationError("each supplied quote must be a CryptoQuote", { id });
    }
    const offered = findOffered(quote.assetId);
    if (offered === undefined) {
      throw new ValidationError(
        "a checkout quote's asset is not in the offered acceptance snapshot",
        { id, quoteId: quote.id, assetId: quote.assetId },
      );
    }
    if (!offered.chains.includes(quote.chainId)) {
      throw new ValidationError(
        "a checkout quote's chain is not accepted for that asset",
        { id, quoteId: quote.id, assetId: quote.assetId, chainId: quote.chainId },
      );
    }
    const binding = findRailBinding(input.railBindings, quote.assetId, quote.chainId);
    if (binding === undefined) {
      throw new ValidationError(
        "no rail binding was supplied for an offered asset×chain quote",
        { id, assetId: quote.assetId, chainId: quote.chainId },
      );
    }
    const decision = matchesCryptoAcceptance(
      input.activation.policy,
      {
        assetId: quote.assetId,
        chainId: quote.chainId,
        amount: quote.cryptoAmount,
        quote,
      },
      input.now,
    );
    if (!decision.accepted) {
      throw new ValidationError(
        `a checkout quote does not match the acceptance policy (reasons: ${decision.reasons.join(", ")})`,
        { id, quoteId: quote.id, reasons: [...decision.reasons] },
      );
    }
    if (quote.fiatAmount.currency !== amount.currency) {
      throw new ValidationError(
        "a checkout quote must be denominated in the cart's pricing currency",
        { id, quoteId: quote.id, quoteCurrency: quote.fiatAmount.currency, cartCurrency: amount.currency },
      );
    }
    if (quote.fiatAmount.value !== amount.value) {
      throw new ValidationError(
        "a checkout quote must price the exact cart amount",
        { id, quoteId: quote.id, quoteValue: quote.fiatAmount.value, cartValue: amount.value },
      );
    }
    const optionId = cryptoOptionId(quote.assetId, quote.chainId);
    if (seenOptionIds.has(optionId)) {
      throw new ValidationError("crypto option ids must not repeat", { id, optionId });
    }
    seenOptionIds.add(optionId);
    options.push(
      Object.freeze({
        kind: "CRYPTO_WALLET_PAYMENT" as const,
        optionId,
        assetId: quote.assetId,
        chainId: quote.chainId,
        railBinding: binding,
        quote,
        displayAmount: deriveDisplayedCryptoAmount(quote),
      }),
    );
  }

  const fiatOptions: FiatPaymentOption[] = [];
  for (const method of input.basePolicy.methodCatalog) {
    if (method.kind === "STABLECOIN_CRYPTO") {
      continue;
    }
    if (!method.currencies.includes(amount.currency)) {
      continue;
    }
    const optionId = `fiat:${method.id}`;
    if (seenOptionIds.has(optionId)) {
      continue;
    }
    seenOptionIds.add(optionId);
    fiatOptions.push(
      Object.freeze({
        kind: "FIAT_FALLBACK" as const,
        optionId,
        methodId: method.id,
        displayName: method.displayName,
      }),
    );
  }

  const intent = defineMerchantPaymentIntent({
    id: `intent:${id}`,
    merchantRef: input.merchantId,
    acceptancePolicyId: input.basePolicy.id,
    cryptoAcceptancePolicyId: input.activation.policy.id,
    amount,
    createdAt: input.now,
    expiresAt: input.expiresAt,
  });
  const session = openMerchantCheckoutSession({
    id: `session:${id}`,
    intent,
    cryptoPolicy: input.activation.policy,
    now: input.now,
  });

  return Object.freeze({
    id,
    merchantId: input.merchantId,
    intent,
    session,
    options: Object.freeze([...options, ...fiatOptions]),
    openedAt: input.now,
  });
}

/** Look up one option by id (deterministic, fail-closed when absent). */
export function checkoutOption(
  flow: CheckoutFlow,
  optionId: string,
): CheckoutPaymentOption {
  if (flow === null || typeof flow !== "object" || !isNonEmptyString(flow.id)) {
    throw new ValidationError("checkoutOption requires a CheckoutFlow");
  }
  if (!isNonEmptyString(optionId)) {
    throw new ValidationError("optionId must be a non-empty string", { flowId: flow.id });
  }
  const option = flow.options.find((candidate) => candidate.optionId === optionId);
  if (option === undefined) {
    throw new ValidationError("no such checkout option", { flowId: flow.id, optionId });
  }
  return option;
}

/** Whether a crypto option's quote is expired at `now` (expiry AT boundary). */
export function isOptionExpired(option: CheckoutPaymentOption, now: PinnedTimestampMs): boolean {
  if (option === null || typeof option !== "object") {
    throw new ValidationError("isOptionExpired requires a CheckoutPaymentOption");
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs");
  }
  if (option.kind !== "CRYPTO_WALLET_PAYMENT") {
    return false;
  }
  return now >= option.quote.validUntil;
}
