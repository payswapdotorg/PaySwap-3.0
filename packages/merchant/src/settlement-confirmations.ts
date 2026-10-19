/**
 * @payswap/merchant — route-family discrimination + the Stripe
 * settlement confirmation (P5-W3, lane R3-W3; the second half of the
 * PORT of old packages/merchant-crypto/src/settlement.ts @ 8a735bf).
 *
 * The runtime anti-conflation guard for settlement routes arriving
 * from untyped sources (a route carrying the OTHER family's fields is
 * rejected with `RouteFamilyConflationError`), and the
 * provider-verified Stripe settlement confirmation — impossible
 * without provider evidence (SyntheticStripeBalanceError otherwise: a
 * synthetic balance effect is unconstructible).
 */

import { ValidationError } from "./errors.ts";
import { RouteFamilyConflationError, SyntheticStripeBalanceError } from "./errors.ts";
import type { PinnedMoney, PinnedTimestampMs } from "./pins/protocol.ts";
import type { MerchantCryptoSettlementRoute } from "./settlement-routes.ts";
import { requireNonEmptyString } from "./secrets.ts";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Runtime anti-conflation guard for routes arriving from untyped
 * sources. `routeFamily` must be one of the two declared families; a
 * route carrying fields of the OTHER family is rejected with
 * `RouteFamilyConflationError`, malformed basics with
 * `ValidationError`.
 */
export function assertRouteFamilyDiscriminated(
  route: unknown,
): asserts route is MerchantCryptoSettlementRoute {
  if (route === null || typeof route !== "object") {
    throw new ValidationError("settlement route must be an object");
  }
  const record = route as Readonly<Record<string, unknown>>;
  const family = record["routeFamily"];
  if (family === "NATIVE_STRIPE_CRYPTO") {
    if ("destination" in record || "conversionChain" in record) {
      throw new RouteFamilyConflationError(
        "a NATIVE_STRIPE_CRYPTO settlement route must not carry EXTERNAL_PAYSWAP_CONVERSION fields (destination/conversionChain)",
        { routeFamily: family },
      );
    }
    if (!isNonEmptyString(record["connectedInstanceId"])) {
      throw new ValidationError("native settlement route requires a non-empty connectedInstanceId");
    }
    if (!isNonEmptyString(record["stripeAccountRef"])) {
      throw new ValidationError("native settlement route requires a non-empty stripeAccountRef");
    }
    if (
      !Array.isArray(record["evidenceRefs"]) ||
      record["evidenceRefs"].length === 0 ||
      !record["evidenceRefs"].every((ref) => isNonEmptyString(ref))
    ) {
      throw new ValidationError(
        "native settlement route requires non-empty provider evidenceRefs",
      );
    }
    if (record["providerVerified"] !== true) {
      throw new ValidationError(
        "native settlement route must be provider-verified (providerVerified === true)",
      );
    }
    return;
  }
  if (family === "EXTERNAL_PAYSWAP_CONVERSION") {
    if (
      "connectedInstanceId" in record ||
      "stripeAccountRef" in record ||
      "settlementCurrency" in record ||
      "supportedAssets" in record ||
      "providerVerified" in record ||
      "evidenceRefs" in record
    ) {
      throw new RouteFamilyConflationError(
        "an EXTERNAL_PAYSWAP_CONVERSION settlement route must not carry NATIVE_STRIPE_CRYPTO fields (connectedInstanceId/stripeAccountRef/settlementCurrency/supportedAssets/providerVerified/evidenceRefs)",
        { routeFamily: family },
      );
    }
    const destination = record["destination"];
    if (destination === null || typeof destination !== "object") {
      throw new ValidationError("external conversion route requires a settlement destination");
    }
    if (
      !Array.isArray(record["conversionChain"]) ||
      record["conversionChain"].length === 0 ||
      !record["conversionChain"].every((ref) => isNonEmptyString(ref))
    ) {
      throw new ValidationError(
        "external conversion route requires a non-empty conversion chain",
      );
    }
    return;
  }
  throw new ValidationError(
    "settlement route routeFamily must be NATIVE_STRIPE_CRYPTO or EXTERNAL_PAYSWAP_CONVERSION",
    { routeFamily: family },
  );
}

// ---------------------------------------------------------------------------
// Stripe settlement confirmation (provider-verified only)
// ---------------------------------------------------------------------------

/**
 * A provider-verified confirmation that the connected Stripe account
 * settled accepted crypto into its own balance. `routeFamily` and
 * `confirmedByProvider` are constructor-set literals; the confirmation
 * carries the lossless provider-state envelope reference (INV-14) and
 * is impossible without provider evidence.
 */
export interface StripeSettlementConfirmation {
  readonly confirmationId: string;
  readonly routeFamily: "NATIVE_STRIPE_CRYPTO";
  readonly connectedInstanceId: string;
  readonly stripeBalanceTxRef: string;
  readonly amount: PinnedMoney;
  readonly providerStateEnvelopeRef: string;
  readonly evidenceIds: readonly string[];
  readonly confirmedByProvider: true;
}

/**
 * Record a provider-verified Stripe settlement confirmation. Shape is
 * validated FIRST and provider evidence LAST, so a malformed
 * confirmation is a `ValidationError` while a well-formed
 * confirmation without evidence is a `SyntheticStripeBalanceError`.
 * `routeFamily` and `confirmedByProvider` are set by this constructor
 * — the input cannot supply them.
 */
export function recordStripeSettlementConfirmation(input: {
  readonly confirmationId: string;
  readonly connectedInstanceId: string;
  readonly stripeBalanceTxRef: string;
  readonly amount: PinnedMoney;
  readonly providerStateEnvelopeRef: string;
  readonly evidenceIds: readonly string[];
}): StripeSettlementConfirmation {
  const confirmationId = requireNonEmptyString(input.confirmationId, "confirmationId");
  const connectedInstanceId = requireNonEmptyString(
    input.connectedInstanceId,
    "connectedInstanceId",
  );
  const stripeBalanceTxRef = requireNonEmptyString(
    input.stripeBalanceTxRef,
    "stripeBalanceTxRef",
  );
  const amount = input.amount;
  if (amount === null || typeof amount !== "object" || typeof amount.value !== "bigint") {
    throw new ValidationError("stripe settlement confirmation amount must be exact Money", {
      confirmationId,
    });
  }
  if (typeof amount.currency !== "string" || amount.currency.length === 0) {
    throw new ValidationError("stripe settlement confirmation amount needs a currency", {
      confirmationId,
    });
  }
  if (amount.value <= 0n) {
    throw new ValidationError("stripe settlement confirmation amount must be positive", {
      confirmationId,
    });
  }
  // INV-14: the lossless provider-state record backing this confirmation.
  const providerStateEnvelopeRef = requireNonEmptyString(
    input.providerStateEnvelopeRef,
    "providerStateEnvelopeRef",
  );
  // Evidence LAST: without provider evidence this would be a synthetic
  // Stripe balance effect.
  if (
    !Array.isArray(input.evidenceIds) ||
    input.evidenceIds.length === 0 ||
    !input.evidenceIds.every((id) => isNonEmptyString(id))
  ) {
    throw new SyntheticStripeBalanceError(
      "Stripe balance effects are provider-verified or UNKNOWN — a confirmation without provider evidence is a synthetic balance effect",
      { confirmationId, connectedInstanceId },
    );
  }
  const confirmation: StripeSettlementConfirmation = {
    confirmationId,
    routeFamily: "NATIVE_STRIPE_CRYPTO",
    connectedInstanceId,
    stripeBalanceTxRef,
    amount,
    providerStateEnvelopeRef,
    evidenceIds: Object.freeze([...input.evidenceIds]),
    confirmedByProvider: true,
  };
  return Object.freeze(confirmation);
}

/**
 * Structural guard: whether the value is a provider-verified Stripe
 * settlement confirmation (native family, confirmed by provider,
 * carrying provider evidence and all identity refs).
 */
export function isProviderVerifiedStripeSettlement(
  value: unknown,
): value is StripeSettlementConfirmation {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StripeSettlementConfirmation>;
  return (
    candidate.routeFamily === "NATIVE_STRIPE_CRYPTO" &&
    candidate.confirmedByProvider === true &&
    Array.isArray(candidate.evidenceIds) &&
    candidate.evidenceIds.length > 0 &&
    isNonEmptyString(candidate.confirmationId) &&
    isNonEmptyString(candidate.connectedInstanceId) &&
    isNonEmptyString(candidate.stripeBalanceTxRef) &&
    isNonEmptyString(candidate.providerStateEnvelopeRef) &&
    candidate.amount !== null &&
    typeof candidate.amount === "object" &&
    typeof candidate.amount.value === "bigint"
  );
}

/** The observed-at instant type carried by refund-support observations. */
export type ObservedAt = PinnedTimestampMs;
