/**
 * @payswap/merchant — the deterministic crypto acceptance MATCHERS
 * (P5-W3, lane R3-W3; PORT+ADAPT of old
 * packages/merchant-crypto/src/acceptance.ts evaluation half @
 * 8a735bf; the base-plane matcher is a LOCAL implementation of the
 * payment plane's law over the PINNED acceptance shapes — the
 * leaf-in-flight law).
 *
 * `matchesCryptoAcceptance` evaluates one request against the crypto
 * policy; `matchesBaseAcceptance` evaluates the base canonical policy
 * (method catalog, currencies, geography — the pinned subset);
 * `evaluateCryptoAcceptance` evaluates BOTH planes (base first; when
 * the base policy rejects, the merged decision lists
 * BASE_POLICY_REJECTED plus whatever crypto reasons also apply).
 */

import { ValidationError } from "./errors.ts";
import { compareCryptoAmounts } from "./assets.ts";
import { isQuoteExpired } from "./quotes.ts";
import type { CryptoAcceptanceDecision, CryptoAcceptanceRejectionReason, CryptoAcceptanceRequest, MerchantCryptoAcceptancePolicy } from "./acceptance-policy.ts";
import { asChainId, asCryptoAssetId } from "./identifiers.ts";
import type {
  PinnedAcceptanceDecision,
  PinnedAcceptanceRejectionReason,
  PinnedAcceptanceRequest,
  PinnedPaymentAcceptancePolicy,
} from "./pins/payment.ts";
import { PINNED_PAYMENT_METHOD_KINDS } from "./pins/payment.ts";

// ---------------------------------------------------------------------------
// The base-plane matcher (LOCAL implementation of the payment law)
// ---------------------------------------------------------------------------

/**
 * Deterministically evaluate a payment request against the BASE
 * canonical acceptance policy (the pinned subset surface: method
 * catalog, kinds, currencies, geography). Every failure mode is a
 * typed reason on the decision (deduplicated, frozen) — the decision
 * is explicit, never silently inferred. Byte-faithful to the old
 * payment plane's `matchesAcceptance` over the pinned subset.
 */
export function matchesBaseAcceptance(
  policy: PinnedPaymentAcceptancePolicy,
  request: PinnedAcceptanceRequest,
): PinnedAcceptanceDecision {
  if (policy === null || typeof policy !== "object") {
    throw new ValidationError("policy must be a PaymentAcceptancePolicy");
  }
  if (request === null || typeof request !== "object") {
    throw new ValidationError("request must be an AcceptanceRequest");
  }
  if (typeof request.methodId !== "string" || request.methodId.length === 0) {
    throw new ValidationError("request.methodId must be a PaymentMethodId");
  }
  const reasons: PinnedAcceptanceRejectionReason[] = [];

  const method = policy.methodCatalog.find((candidate) => candidate.id === request.methodId);
  if (method === undefined) {
    reasons.push("METHOD_NOT_IN_CATALOG");
  } else {
    if (!policy.methods.includes(method.kind)) {
      reasons.push("METHOD_KIND_NOT_ACCEPTED");
    }
  }

  if (!policy.currencies.includes(request.currency)) {
    reasons.push("CURRENCY_NOT_ACCEPTED");
  }

  if (request.country !== undefined) {
    if (typeof request.country !== "string" || request.country.length === 0) {
      reasons.push("COUNTRY_NOT_LISTED");
    } else if (!policy.geography.includes(request.country.toUpperCase())) {
      reasons.push("GEOGRAPHY_NOT_SERVED");
    }
  }

  const deduplicated = [...new Set(reasons)];
  return Object.freeze({
    accepted: deduplicated.length === 0,
    reasons: Object.freeze(deduplicated),
    method,
  });
}

// ---------------------------------------------------------------------------
// The crypto-plane matcher
// ---------------------------------------------------------------------------

/**
 * Deterministically evaluate a crypto acceptance request against the
 * crypto policy. Every failure mode is a typed reason on the decision
 * (deduplicated, frozen). Amount/asset coherence:
 * `request.amount.assetId` must equal `request.assetId` — an amount
 * denominated in a different asset is treated as ASSET_NOT_ACCEPTED
 * (the requested asset/amount pair is not one this policy accepts),
 * and the per-asset min/max bounds are not evaluated against an
 * incoherent amount (exact comparison requires a single asset).
 */
export function matchesCryptoAcceptance(
  policy: MerchantCryptoAcceptancePolicy,
  request: CryptoAcceptanceRequest,
  now: bigint,
): CryptoAcceptanceDecision {
  if (policy === null || typeof policy !== "object") {
    throw new ValidationError("policy must be a MerchantCryptoAcceptancePolicy");
  }
  if (
    request === null ||
    typeof request !== "object" ||
    typeof request.assetId !== "string" ||
    typeof request.chainId !== "string" ||
    request.amount === null ||
    typeof request.amount !== "object"
  ) {
    throw new ValidationError("request must be a CryptoAcceptanceRequest");
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs");
  }
  const reasons: CryptoAcceptanceRejectionReason[] = [];

  const asset = policy.assets.find((candidate) => candidate.assetId === request.assetId);
  if (asset === undefined) {
    reasons.push("ASSET_NOT_ACCEPTED");
  }
  const amountCoherent = request.amount.assetId === request.assetId;
  if (!amountCoherent) {
    reasons.push("ASSET_NOT_ACCEPTED");
  }

  if (asset !== undefined) {
    if (!asset.chains.includes(request.chainId)) {
      reasons.push("CHAIN_NOT_ACCEPTED");
    }
    if (amountCoherent && asset.minAmount !== undefined) {
      if (compareCryptoAmounts(request.amount, asset.minAmount) < 0) {
        reasons.push("AMOUNT_BELOW_MINIMUM");
      }
    }
    if (amountCoherent && asset.maxAmount !== undefined) {
      if (compareCryptoAmounts(request.amount, asset.maxAmount) > 0) {
        reasons.push("AMOUNT_ABOVE_MAXIMUM");
      }
    }
  }

  if (request.quote !== undefined) {
    const quote = request.quote;
    if (quote.assetId !== request.assetId) {
      reasons.push("QUOTE_ASSET_MISMATCH");
    }
    if (quote.chainId !== request.chainId) {
      reasons.push("QUOTE_CHAIN_MISMATCH");
    }
    if (isQuoteExpired(quote, now)) {
      reasons.push("QUOTE_EXPIRED");
    }
  }

  return Object.freeze({
    accepted: reasons.length === 0,
    reasons: Object.freeze([...new Set(reasons)]),
    ...(asset !== undefined ? { asset } : {}),
  });
}

/**
 * Evaluate a crypto acceptance request against BOTH planes: the
 * canonical acceptance law runs FIRST (`matchesBaseAcceptance`); when
 * the base policy rejects, the merged decision lists
 * BASE_POLICY_REJECTED plus whatever crypto reasons also apply (the
 * crypto matcher runs too, and reasons are unioned). When the base
 * policy accepts, the decision is the crypto matcher's result alone.
 * Frozen either way.
 */
export function evaluateCryptoAcceptance(
  policy: MerchantCryptoAcceptancePolicy,
  basePolicy: PinnedPaymentAcceptancePolicy,
  request: CryptoAcceptanceRequest,
  baseRequest: PinnedAcceptanceRequest,
  now: bigint,
): CryptoAcceptanceDecision {
  const baseDecision = matchesBaseAcceptance(basePolicy, baseRequest);
  const cryptoDecision = matchesCryptoAcceptance(policy, request, now);
  if (baseDecision.accepted) {
    return cryptoDecision;
  }
  const merged: CryptoAcceptanceRejectionReason[] = ["BASE_POLICY_REJECTED"];
  for (const reason of cryptoDecision.reasons) {
    if (!merged.includes(reason)) {
      merged.push(reason);
    }
  }
  return Object.freeze({
    accepted: false,
    reasons: Object.freeze(merged),
    ...(cryptoDecision.asset !== undefined ? { asset: cryptoDecision.asset } : {}),
  });
}

/**
 * Brand loose request parts into the typed request (the checkout path
 * assembles requests from flow options): asset id, chain id.
 */
export function brandCryptoAcceptanceRequest(
  assetId: string,
  chainId: string,
  amount: CryptoAcceptanceRequest["amount"],
): Omit<CryptoAcceptanceRequest, "quote"> {
  return {
    assetId: asCryptoAssetId(assetId),
    chainId: asChainId(chainId),
    amount,
  };
}

/** The pinned method-kind vocabulary (exposed for matcher assertions). */
export const METHOD_KIND_VOCABULARY = PINNED_PAYMENT_METHOD_KINDS;
