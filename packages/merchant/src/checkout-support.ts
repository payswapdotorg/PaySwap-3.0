/**
 * @payswap/merchant — checkout support: the typed rail binding + the
 * customer-facing payment summary (P5-W3, lane R3-W3; the merged
 * rail-binding and payment-summary halves of old
 * packages/merchant-checkout/src/checkout.ts and payment.ts @ 8a735bf;
 * the kernel validators are re-based onto the PINNED onchain shape
 * laws).
 *
 * The `RailAssetBinding` is the typed bridge between the crypto
 * acceptance vocabulary (opaque CryptoAssetId/ChainId) and the
 * onchain-security kernel vocabulary (structural ChainRef + symbol
 * AssetIdentity): both sides are validated by THEIR OWN owners' laws,
 * and consistency between them is enforced at construction time.
 *
 * THE ACCEPTANCE LAW: the customer SEES what they are signing. The
 * payment summary is a deterministic pure function of the exact facts
 * of the payment (merchant, fiat amount + fees, the exact crypto
 * amount + asset + chain, source and destination, quote validity)
 * rendered as plain sentences, so it can never drift from the write
 * the customer authorizes. The summary is secret-scanned: no
 * credential material can ride along.
 */

import { ValidationError } from "./errors.ts";
import { canonicalDigest } from "./kernel.ts";
import { asChainId, asCryptoAssetId } from "./identifiers.ts";
import type { ChainId, CryptoAssetId } from "./identifiers.ts";
import type { PinnedMoney } from "./pins/protocol.ts";
import { pinnedAssetIdentityIsShaped, pinnedChainRefIsShaped } from "./pins/onchain.ts";
import type { PinnedAssetIdentity } from "./pins/onchain.ts";
import type { CustomerPaymentOption } from "./checkout.ts";
import { assertNoSecretMaterial } from "./secrets.ts";
import { requireNonEmptyString } from "./secrets.ts";

// ---------------------------------------------------------------------------
// The typed rail binding
// ---------------------------------------------------------------------------

/**
 * The typed rail binding for one accepted asset×chain: the crypto
 * identity pair (opaque) PLUS the kernel-side structural identity,
 * each validated by its own owner's law. `merchantChainId` must appear
 * in the acceptance's chains for `merchantAssetId`; `chainRef`/
 * `assetIdentity` must pass the pinned kernel shape laws.
 */
export interface RailAssetBinding {
  readonly merchantAssetId: CryptoAssetId;
  readonly merchantChainId: ChainId;
  /** Kernel-side chain reference (`<network>:<segment>`). */
  readonly chainRef: string;
  /** Kernel-side asset identity (the symbol law on the bound chain). */
  readonly assetIdentity: PinnedAssetIdentity;
}

/**
 * Validate a typed rail binding: the kernel side must pass the
 * kernel's own shape laws (chain shape + asset identity), the kernel
 * asset must live on the kernel chain, and the crypto side must be
 * non-empty. The acceptance-snapshot consistency (binding ∈ offered
 * assets/chains) is enforced separately by `openCheckoutFlow` against
 * the actual snapshot.
 */
export function defineRailAssetBinding(input: {
  readonly merchantAssetId: string;
  readonly merchantChainId: string;
  readonly chainRef: string;
  readonly assetIdentity: PinnedAssetIdentity;
}): RailAssetBinding {
  if (typeof input.merchantAssetId !== "string" || input.merchantAssetId.length === 0) {
    throw new ValidationError("rail binding requires a merchantAssetId");
  }
  if (typeof input.merchantChainId !== "string" || input.merchantChainId.length === 0) {
    throw new ValidationError("rail binding requires a merchantChainId");
  }
  if (!pinnedChainRefIsShaped(input.chainRef)) {
    throw new ValidationError(
      "rail binding chainRef must have the kernel chain shape `<network>:<segment>`",
      { chainRef: input.chainRef },
    );
  }
  if (input.assetIdentity === null || typeof input.assetIdentity !== "object") {
    throw new ValidationError("rail binding requires an AssetIdentity", {
      chainRef: input.chainRef,
    });
  }
  if (!pinnedAssetIdentityIsShaped(input.assetIdentity)) {
    throw new ValidationError(
      "rail binding assetIdentity must satisfy the kernel asset-identity shape law (2..8 A-Z/0-9 symbol on the bound chain, non-empty assetId)",
      { chainRef: input.chainRef },
    );
  }
  if (input.assetIdentity.chain !== input.chainRef) {
    throw new ValidationError(
      "the rail binding's kernel asset identity must live on the bound kernel chain",
      { assetChain: input.assetIdentity.chain, chainRef: input.chainRef },
    );
  }
  return Object.freeze({
    merchantAssetId: asCryptoAssetId(input.merchantAssetId),
    merchantChainId: asChainId(input.merchantChainId),
    chainRef: input.chainRef,
    assetIdentity: Object.freeze({ ...input.assetIdentity }),
  });
}

/** The deterministic binding lookup for an asset×chain pair. */
export function findRailBinding(
  bindings: readonly RailAssetBinding[],
  assetId: string,
  chainId: string,
): RailAssetBinding | undefined {
  if (!Array.isArray(bindings)) {
    throw new ValidationError("rail bindings must be an array");
  }
  return bindings.find(
    (candidate) =>
      candidate.merchantAssetId === assetId && candidate.merchantChainId === chainId,
  );
}

/** Structural equality of two rail bindings (all four identity axes). */
export function equalsRailBinding(a: RailAssetBinding, b: RailAssetBinding): boolean {
  return (
    a.merchantAssetId === b.merchantAssetId &&
    a.merchantChainId === b.merchantChainId &&
    a.chainRef === b.chainRef &&
    a.assetIdentity.symbol === b.assetIdentity.symbol &&
    a.assetIdentity.assetId === b.assetIdentity.assetId &&
    a.assetIdentity.chain === b.assetIdentity.chain
  );
}

// ---------------------------------------------------------------------------
// The customer-facing payment summary
// ---------------------------------------------------------------------------

/** The typed input of the human-readable payment summary. */
export interface PaymentSummaryInput {
  readonly merchantName: string;
  readonly fiatAmount: PinnedMoney;
  readonly fees: PinnedMoney;
  readonly option: CustomerPaymentOption;
  readonly customerWalletAddress: string;
  readonly destinationAddress: string;
}

/**
 * Render the human-readable payment summary (deterministic plain
 * sentences). The customer sees: merchant, fiat amount + fees, the
 * exact crypto amount + asset + chain, source and destination
 * addresses, quote validity and the expiry boundary.
 */
export function renderPaymentSummary(input: PaymentSummaryInput): readonly string[] {
  if (input === null || typeof input !== "object") {
    throw new ValidationError("renderPaymentSummary requires a PaymentSummaryInput");
  }
  if (typeof input.merchantName !== "string" || input.merchantName.length === 0) {
    throw new ValidationError("renderPaymentSummary requires a merchantName");
  }
  if (typeof input.customerWalletAddress !== "string" || input.customerWalletAddress.length === 0) {
    throw new ValidationError("renderPaymentSummary requires a customerWalletAddress");
  }
  if (typeof input.destinationAddress !== "string" || input.destinationAddress.length === 0) {
    throw new ValidationError("renderPaymentSummary requires a destinationAddress");
  }
  if (input.option === null || typeof input.option !== "object") {
    throw new ValidationError("renderPaymentSummary requires a checkout option");
  }
  if (input.option.kind !== "CRYPTO_WALLET_PAYMENT") {
    throw new ValidationError(
      "a payment summary describes a CRYPTO_WALLET_PAYMENT option",
      { optionId: input.option.optionId },
    );
  }
  const quote = input.option.quote;
  const lines: string[] = [
    `Pay ${input.merchantName}`,
    `Amount: ${quote.fiatAmount.value} minor units of ${quote.fiatAmount.currency}` +
      ` (fees: ${quote.fees.value} minor units of ${quote.fees.currency})`,
    `You will send exactly ${quote.cryptoAmount.value} minor units of ` +
      `${input.option.railBinding.assetIdentity.symbol} on ${input.option.railBinding.chainRef}`,
    `From your wallet ${input.customerWalletAddress}`,
    `To destination ${input.destinationAddress}`,
    `Quote ${quote.id} is valid until ${quote.validUntil} (the last instant it is usable is ${quote.validUntil - 1n})`,
  ];
  const summary = Object.freeze(lines);
  assertNoSecretMaterial(summary, "payment summary");
  return summary;
}

/**
 * Deterministic digest of the rendered payment summary (the
 * bigint-aware canonical digest over the summary lines).
 */
export function paymentSummaryDigest(summary: readonly string[]): string {
  if (!Array.isArray(summary) || summary.length === 0) {
    throw new ValidationError("a payment summary digest requires the summary lines");
  }
  if (!summary.every((line) => typeof line === "string" && line.length > 0)) {
    throw new ValidationError("payment summary lines must be non-empty strings");
  }
  return canonicalDigest({ lines: [...summary] });
}
