/**
 * @payswap/merchant — the merchant crypto acceptance POLICY (P5-W3,
 * lane R3-W3; PORT of old packages/merchant-crypto/src/acceptance.ts
 * policy-construction half @ 8a735bf).
 *
 * Narrows the canonical payment acceptance policy (which must already
 * declare the STABLECOIN_CRYPTO method kind) to the specific crypto
 * assets/chains a merchant accepts, with per-asset constraints
 * (min/max, confirmations) and quote-expiry semantics. This policy is
 * a POLICY STATEMENT, never execution authority; evaluation is
 * deterministic with typed rejection reasons (see
 * acceptance-evaluate.ts).
 */

import { ValidationError } from "./errors.ts";
import { asChainId, asCryptoAssetId, asMerchantCryptoAcceptancePolicyId } from "./identifiers.ts";
import type { ChainId, CryptoAssetId, MerchantCryptoAcceptancePolicyId } from "./identifiers.ts";
import { compareCryptoAmounts } from "./assets.ts";
import type { CryptoAmount } from "./assets.ts";
import { isQuoteExpired } from "./quotes.ts";
import type { CryptoQuote } from "./quotes.ts";
import { requireNonEmptyString } from "./secrets.ts";
import type { PinnedPaymentAcceptancePolicy } from "./pins/payment.ts";

/** How many confirmations the merchant requires before treating a payment as settled. */
export interface ConfirmationPolicy {
  readonly requiredConfirmations: bigint;
}

/**
 * One accepted crypto asset: the chains it may be paid on, optional
 * exact min/max amounts (in the asset's OWN minor units, matching the
 * assetId) and the confirmation policy. `minAmount`/`maxAmount` are
 * lower/upper bounds on the payer-facing crypto amount.
 */
export interface CryptoAssetAcceptance {
  readonly assetId: CryptoAssetId;
  readonly chains: readonly ChainId[];
  readonly minAmount?: CryptoAmount;
  readonly maxAmount?: CryptoAmount;
  readonly confirmations: ConfirmationPolicy;
}

/** The merchant-scoped crypto acceptance policy (a narrowing statement). */
export interface MerchantCryptoAcceptancePolicy {
  readonly id: MerchantCryptoAcceptancePolicyId;
  readonly merchantRef: string;
  /** Id of the canonical payment acceptance policy this policy narrows. */
  readonly basePolicyId: string;
  readonly assets: readonly CryptoAssetAcceptance[];
  /** How long quotes offered under this policy stay valid. */
  readonly quoteValidityMs: bigint;
}

/** A crypto acceptance request evaluated against the policy. */
export interface CryptoAcceptanceRequest {
  readonly assetId: CryptoAssetId;
  readonly chainId: ChainId;
  readonly amount: CryptoAmount;
  readonly quote?: CryptoQuote;
}

/** The typed rejection reasons of the crypto acceptance matcher. */
export type CryptoAcceptanceRejectionReason =
  | "ASSET_NOT_ACCEPTED"
  | "CHAIN_NOT_ACCEPTED"
  | "AMOUNT_BELOW_MINIMUM"
  | "AMOUNT_ABOVE_MAXIMUM"
  | "QUOTE_EXPIRED"
  | "QUOTE_ASSET_MISMATCH"
  | "QUOTE_CHAIN_MISMATCH"
  | "BASE_POLICY_REJECTED";

/** The explicit, deterministic crypto acceptance decision. */
export interface CryptoAcceptanceDecision {
  readonly accepted: boolean;
  readonly reasons: readonly CryptoAcceptanceRejectionReason[];
  /** The resolved per-asset acceptance, when the asset is accepted at all. */
  readonly asset?: CryptoAssetAcceptance;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Structural check on a bound amount: it must be a CryptoAmount object
 * whose assetId matches the acceptance's asset (bounds live in the
 * asset's own minor units) and whose value is a non-negative bigint.
 */
function assertBoundAmount(
  amount: CryptoAmount,
  brandedAssetId: CryptoAssetId,
  label: string,
): void {
  if (amount === null || typeof amount !== "object") {
    throw new ValidationError(`${label} must be a CryptoAmount`, { assetId: brandedAssetId });
  }
  if (typeof amount.value !== "bigint" || amount.value < 0n) {
    throw new ValidationError(`${label}.value must be a non-negative bigint of minor units`, {
      assetId: brandedAssetId,
    });
  }
  if (amount.assetId !== brandedAssetId) {
    throw new ValidationError(
      `${label} must be denominated in the accepted asset (bounds live in the asset's own minor units)`,
      { assetId: brandedAssetId, boundAssetId: amount.assetId },
    );
  }
}

/**
 * Construct a validated, frozen per-asset acceptance. Chains are
 * branded and must be non-empty and unique; `requiredConfirmations`
 * must be at least one; optional min/max bounds must match the asset
 * and, when both are present, satisfy min ≤ max (exact bigint
 * comparison).
 */
export function defineCryptoAssetAcceptance(input: {
  readonly assetId: string;
  readonly chains: readonly string[];
  readonly minAmount?: CryptoAmount;
  readonly maxAmount?: CryptoAmount;
  readonly requiredConfirmations: bigint;
}): CryptoAssetAcceptance {
  const assetId = asCryptoAssetId(input.assetId);
  if (!Array.isArray(input.chains) || input.chains.length === 0) {
    throw new ValidationError("a crypto asset acceptance must declare at least one chain", {
      assetId,
    });
  }
  const chains = input.chains.map((chain) => asChainId(chain));
  if (new Set<string>(chains).size !== chains.length) {
    throw new ValidationError("accepted chains must not repeat", { assetId, chains: [...chains] });
  }
  if (typeof input.requiredConfirmations !== "bigint" || input.requiredConfirmations < 1n) {
    throw new ValidationError("requiredConfirmations must be a bigint of at least one", {
      assetId,
    });
  }
  if (input.minAmount !== undefined) {
    assertBoundAmount(input.minAmount, assetId, "minAmount");
  }
  if (input.maxAmount !== undefined) {
    assertBoundAmount(input.maxAmount, assetId, "maxAmount");
  }
  if (input.minAmount !== undefined && input.maxAmount !== undefined) {
    if (compareCryptoAmounts(input.minAmount, input.maxAmount) > 0) {
      throw new ValidationError("minAmount must not exceed maxAmount", { assetId });
    }
  }
  return Object.freeze({
    assetId,
    chains: Object.freeze(chains),
    ...(input.minAmount !== undefined ? { minAmount: input.minAmount } : {}),
    ...(input.maxAmount !== undefined ? { maxAmount: input.maxAmount } : {}),
    confirmations: Object.freeze({ requiredConfirmations: input.requiredConfirmations }),
  });
}

function isCryptoAssetAcceptanceShape(value: unknown): value is CryptoAssetAcceptance {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<CryptoAssetAcceptance>;
  return (
    isNonEmptyString(candidate.assetId) &&
    Array.isArray(candidate.chains) &&
    candidate.chains.length > 0 &&
    candidate.confirmations !== null &&
    typeof candidate.confirmations === "object" &&
    typeof candidate.confirmations.requiredConfirmations === "bigint" &&
    candidate.confirmations.requiredConfirmations >= 1n
  );
}

/**
 * Construct a validated, frozen merchant crypto acceptance policy. The
 * base canonical policy MUST already declare the STABLECOIN_CRYPTO
 * method kind (this policy narrows it, never widens it) and
 * `input.basePolicyId` must reference it exactly. Assets must be
 * non-empty with unique assetIds (construct them through
 * `defineCryptoAssetAcceptance`).
 */
export function defineMerchantCryptoAcceptancePolicy(
  input: {
    readonly id: string;
    readonly merchantRef: string;
    readonly basePolicyId: string;
    readonly assets: readonly CryptoAssetAcceptance[];
    readonly quoteValidityMs: bigint;
  },
  basePolicy: PinnedPaymentAcceptancePolicy,
): MerchantCryptoAcceptancePolicy {
  const id = asMerchantCryptoAcceptancePolicyId(input.id);
  const merchantRef = requireNonEmptyString(input.merchantRef, "merchantRef");
  const basePolicyId = requireNonEmptyString(input.basePolicyId, "basePolicyId");
  if (basePolicy === null || typeof basePolicy !== "object" || !Array.isArray(basePolicy.methods)) {
    throw new ValidationError("basePolicy must be a PaymentAcceptancePolicy", { id });
  }
  if (!basePolicy.methods.includes("STABLECOIN_CRYPTO")) {
    throw new ValidationError(
      "the base acceptance policy must declare the STABLECOIN_CRYPTO method kind",
      { id, basePolicyMethods: [...basePolicy.methods] },
    );
  }
  if (basePolicyId !== basePolicy.id) {
    throw new ValidationError(
      "basePolicyId must reference the base acceptance policy exactly",
      { id, basePolicyId, basePolicyActualId: basePolicy.id },
    );
  }
  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    throw new ValidationError(
      "a merchant crypto acceptance policy must declare at least one asset",
      { id },
    );
  }
  const seenAssetIds = new Set<string>();
  for (const asset of input.assets) {
    if (!isCryptoAssetAcceptanceShape(asset)) {
      throw new ValidationError(
        "each asset acceptance must be a CryptoAssetAcceptance built through defineCryptoAssetAcceptance",
        { id, assetId: (asset as Partial<CryptoAssetAcceptance>)?.assetId },
      );
    }
    if (seenAssetIds.has(asset.assetId)) {
      throw new ValidationError("accepted asset ids must not repeat", { id, assetId: asset.assetId });
    }
    seenAssetIds.add(asset.assetId);
  }
  if (typeof input.quoteValidityMs !== "bigint" || input.quoteValidityMs <= 0n) {
    throw new ValidationError("quoteValidityMs must be a positive bigint", { id });
  }
  return Object.freeze({
    id,
    merchantRef,
    basePolicyId,
    assets: Object.freeze([...input.assets]),
    quoteValidityMs: input.quoteValidityMs,
  });
}

/**
 * A NEW frozen snapshot of the policy's offered assets (shallow copies
 * of the frozen entries) for checkout sessions: historical facts are
 * immutable, so later policy edits can never rewrite an open session's
 * offer.
 */
export function offeredAssets(
  policy: MerchantCryptoAcceptancePolicy,
): readonly CryptoAssetAcceptance[] {
  if (policy === null || typeof policy !== "object" || !Array.isArray(policy.assets)) {
    throw new ValidationError("policy must be a MerchantCryptoAcceptancePolicy");
  }
  return Object.freeze(policy.assets.map((asset) => Object.freeze({ ...asset })));
}

/**
 * Deterministic expiry of the request's quote (the shared matcher
 * precondition): a request quote is expired AT its boundary.
 */
export function requestQuoteIsExpired(request: CryptoAcceptanceRequest, now: bigint): boolean {
  if (request.quote === undefined) {
    return false;
  }
  return isQuoteExpired(request.quote, now);
}
