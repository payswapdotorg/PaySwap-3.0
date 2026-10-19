/**
 * @payswap/merchant — the checkout authorization bundle (P5-W3, lane
 * R3-W3; ADAPT of old
 * packages/merchant-checkout/src/payment.ts bundle half @ 8a735bf:
 * the onchain-security kernel pipeline is replaced by the PINNED
 * wallet-payment injection port — the leaf-in-flight law).
 *
 * THE ACCEPTANCE LAW (structural): a wallet payment cannot exist
 * without its explicit customer authorization lineage. This module
 * builds the customer-facing authorization bundle — the
 * human-readable payment summary plus the content-addressed
 * authorization request binding the EXACT transfer leg (asset, exact
 * amount, parties, chain, expiry) — and the lineage record minted
 * after the trusted-surface handoff. The authorization is
 * content-addressed through the bigint-aware canonical digest: the
 * customer approves an exact, replayable byte-stable shape.
 */

import { ValidationError } from "./errors.ts";
import { canonicalDigest, deepFreeze } from "./kernel.ts";
import type { PinnedTimestampMs } from "./pins/protocol.ts";
import type { CustomerPaymentOption } from "./checkout.ts";
import { checkoutOption } from "./checkout.ts";
import type { CheckoutFlow } from "./checkout.ts";
import { renderPaymentSummary, paymentSummaryDigest } from "./checkout-support.ts";
import type { PinnedWalletPaymentHandoffReceipt } from "./pins/wallet-payment.ts";
import { assertNoSecretMaterial } from "./secrets.ts";
import { requireNonEmptyString } from "./secrets.ts";

/**
 * The content-addressed checkout authorization request: EXACTLY the
 * consequential facts of the wallet payment (the transfer leg, the
 * option, the quote, the flow, the requesting surface, the expiry).
 * `requestHash` and `writeDigest` are derived — the input never
 * supplies them.
 */
export interface CheckoutAuthorizationRequest {
  readonly requestId: string;
  readonly flowId: string;
  readonly merchantId: string;
  readonly optionId: string;
  readonly quoteId: string;
  readonly chainRef: string;
  readonly transfer: {
    readonly assetSymbol: string;
    readonly assetId: string;
    readonly amount: bigint;
    readonly from: string;
    readonly to: string;
  };
  readonly requestedBy: string;
  readonly expiresAt: PinnedTimestampMs;
}

/** The customer-facing authorization bundle: what the trusted surface shows before signing. */
export interface CheckoutAuthorizationBundle {
  readonly request: CheckoutAuthorizationRequest;
  /** The canonical digest binding the whole request (replayable, byte-stable). */
  readonly requestHash: string;
  /** The canonical digest of the exact transfer leg. */
  readonly writeDigest: string;
  readonly paymentSummary: readonly string[];
  readonly summaryDigest: string;
}

/**
 * The authorization lineage every wallet payment attempt must carry
 * (ACCEPTANCE LAW — without this record a wallet payment is
 * structurally unrepresentable in the lifecycle layer). The lineage
 * binds the digests the customer approved to the trusted-surface
 * handoff receipt.
 */
export interface WalletAuthorizationLineage {
  /** Canonical digest of the authorization request the customer approved. */
  readonly authorizationRequestHash: string;
  /** Canonical digest of the exact transfer that was authorized. */
  readonly writeDigest: string;
  /** Digest of the payment summary the customer was shown. */
  readonly paymentSummaryDigest: string;
  /** The id of the handoff performed by the injected trusted surface. */
  readonly handoffId: string;
  /** The chain the payment was authorized on. */
  readonly chainRef: string;
  /** External submission reference from the handoff receipt. */
  readonly externalSubmissionRef: string;
  /** The append-only evidence references backing the handoff. */
  readonly evidenceRefs: readonly string[];
}

/**
 * Prepare the authorization request for one checkout option: builds
 * the typed request over the flow's exact facts and derives the
 * request/write digests. The write expires AT the quote's validity
 * boundary — a payment may only be authorized while the quote is
 * usable. `requestedBy` is the requesting service's principal
 * reference (NOT authority — authority is the customer's explicit
 * approval at the trusted surface).
 */
export function prepareCheckoutAuthorizationRequest(input: {
  readonly flow: CheckoutFlow;
  readonly optionId: string;
  readonly customerWalletAddress: string;
  readonly destinationAddress: string;
  readonly requestId: string;
  readonly requestedBy: string;
  readonly now: PinnedTimestampMs;
}): CheckoutAuthorizationRequest {
  if (input.flow === null || typeof input.flow !== "object") {
    throw new ValidationError("prepareCheckoutAuthorizationRequest requires a CheckoutFlow");
  }
  const option = checkoutOption(input.flow, input.optionId);
  if (option.kind !== "CRYPTO_WALLET_PAYMENT") {
    throw new ValidationError(
      "only a CRYPTO_WALLET_PAYMENT option prepares a wallet payment authorization",
      { optionId: option.optionId },
    );
  }
  const requestId = requireNonEmptyString(input.requestId, "requestId");
  const requestedBy = requireNonEmptyString(input.requestedBy, "requestedBy");
  if (typeof input.customerWalletAddress !== "string" || input.customerWalletAddress.length === 0) {
    throw new ValidationError("a wallet payment requires the customer wallet address");
  }
  if (typeof input.destinationAddress !== "string" || input.destinationAddress.length === 0) {
    throw new ValidationError("a wallet payment requires the destination address");
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs");
  }
  if (input.now >= option.quote.validUntil) {
    throw new ValidationError(
      "the quote is expired; a fresh checkout option is required (expiry at boundary)",
      { flowId: input.flow.id, optionId: option.optionId, validUntil: option.quote.validUntil, now: input.now },
    );
  }
  const binding = option.railBinding;
  const request: CheckoutAuthorizationRequest = Object.freeze({
    requestId,
    flowId: input.flow.id,
    merchantId: input.flow.merchantId,
    optionId: option.optionId,
    quoteId: option.quote.id,
    chainRef: binding.chainRef,
    transfer: Object.freeze({
      assetSymbol: binding.assetIdentity.symbol,
      assetId: binding.assetIdentity.assetId,
      amount: option.quote.cryptoAmount.value,
      from: input.customerWalletAddress,
      to: input.destinationAddress,
    }),
    requestedBy,
    // The authorization expires AT the quote's validity boundary.
    expiresAt: option.quote.validUntil,
  });
  assertNoSecretMaterial(request, "checkout authorization request");
  return request;
}

/** The canonical digest of the authorization request (content-addressed). */
export function checkoutAuthorizationRequestHash(
  request: CheckoutAuthorizationRequest,
): string {
  if (request === null || typeof request !== "object" || typeof request.requestId !== "string") {
    throw new ValidationError("checkoutAuthorizationRequestHash requires a request");
  }
  return canonicalDigest({
    requestId: request.requestId,
    flowId: request.flowId,
    merchantId: request.merchantId,
    optionId: request.optionId,
    quoteId: request.quoteId,
    chainRef: request.chainRef,
    transfer: {
      assetSymbol: request.transfer.assetSymbol,
      assetId: request.transfer.assetId,
      amount: request.transfer.amount,
      from: request.transfer.from,
      to: request.transfer.to,
    },
    requestedBy: request.requestedBy,
    expiresAt: request.expiresAt,
  });
}

/** The canonical digest of the exact transfer leg (the write digest). */
export function checkoutWriteDigest(request: CheckoutAuthorizationRequest): string {
  if (request === null || typeof request !== "object" || typeof request.requestId !== "string") {
    throw new ValidationError("checkoutWriteDigest requires a request");
  }
  return canonicalDigest({
    assetSymbol: request.transfer.assetSymbol,
    assetId: request.transfer.assetId,
    amount: request.transfer.amount,
    from: request.transfer.from,
    to: request.transfer.to,
    chainRef: request.chainRef,
    quoteId: request.quoteId,
  });
}

/**
 * Build the customer-facing authorization bundle: the payment summary
 * (deterministic plain sentences) plus the content-addressed request
 * with its request/write digests — everything the customer sees before
 * the trusted-surface handoff, bound to the same facts.
 */
export function buildCheckoutAuthorization(input: {
  readonly flow: CheckoutFlow;
  readonly optionId: string;
  readonly customerWalletAddress: string;
  readonly destinationAddress: string;
  readonly requestId: string;
  readonly requestedBy: string;
  readonly merchantName: string;
  readonly now: PinnedTimestampMs;
}): CheckoutAuthorizationBundle {
  const request = prepareCheckoutAuthorizationRequest({
    flow: input.flow,
    optionId: input.optionId,
    customerWalletAddress: input.customerWalletAddress,
    destinationAddress: input.destinationAddress,
    requestId: input.requestId,
    requestedBy: input.requestedBy,
    now: input.now,
  });
  const option = checkoutOption(input.flow, input.optionId);
  if (option.kind !== "CRYPTO_WALLET_PAYMENT") {
    throw new ValidationError(
      "an authorization bundle describes a CRYPTO_WALLET_PAYMENT option",
    );
  }
  const summary = renderPaymentSummary({
    merchantName: input.merchantName,
    fiatAmount: option.quote.fiatAmount,
    fees: option.quote.fees,
    option,
    customerWalletAddress: input.customerWalletAddress,
    destinationAddress: input.destinationAddress,
  });
  const bundle: CheckoutAuthorizationBundle = deepFreeze({
    request,
    requestHash: checkoutAuthorizationRequestHash(request),
    writeDigest: checkoutWriteDigest(request),
    paymentSummary: summary,
    summaryDigest: paymentSummaryDigest(summary),
  });
  assertNoSecretMaterial(bundle, "checkout authorization bundle");
  return bundle;
}

/**
 * Mint the wallet payment authorization lineage from a completed
 * trusted-surface handoff: binds the authorization request hash, the
 * write digest, the payment summary digest, the handoff id and the
 * external submission reference from the handoff receipt, plus the
 * receipt's evidence references. This record is MANDATORY on every
 * wallet payment attempt in lifecycle.ts (ACCEPTANCE LAW).
 */
export function walletPaymentAuthorizationLineage(input: {
  readonly bundle: CheckoutAuthorizationBundle;
  readonly handoffReceipt: PinnedWalletPaymentHandoffReceipt;
}): WalletAuthorizationLineage {
  if (input.bundle === null || typeof input.bundle !== "object") {
    throw new ValidationError("walletPaymentAuthorizationLineage requires a bundle");
  }
  const receipt = input.handoffReceipt;
  if (receipt === null || typeof receipt !== "object") {
    throw new ValidationError(
      "walletPaymentAuthorizationLineage requires a handoff receipt",
    );
  }
  if (
    !Array.isArray(receipt.evidenceRefs) ||
    receipt.evidenceRefs.length === 0 ||
    !receipt.evidenceRefs.every((ref) => typeof ref === "string" && ref.length > 0)
  ) {
    throw new ValidationError(
      "a handoff receipt backing an authorization lineage must carry non-empty evidence refs",
      { handoffId: receipt.handoffId },
    );
  }
  const chainRef = requireNonEmptyString(input.bundle.request.chainRef, "chainRef");
  const lineage: WalletAuthorizationLineage = Object.freeze({
    authorizationRequestHash: input.bundle.requestHash,
    writeDigest: input.bundle.writeDigest,
    paymentSummaryDigest: input.bundle.summaryDigest,
    handoffId: receipt.handoffId,
    chainRef,
    externalSubmissionRef: receipt.externalSubmissionRef,
    evidenceRefs: Object.freeze([
      `authorization:${input.bundle.requestHash}`,
      `handoff:${receipt.handoffId}`,
      `submission:${receipt.externalSubmissionRef}`,
      ...receipt.evidenceRefs,
    ]),
  });
  assertNoSecretMaterial(lineage, "wallet authorization lineage");
  return lineage;
}

/** Validate a lineage record (fail-closed; the lifecycle precondition). */
export function requireLineage(lineage: WalletAuthorizationLineage, label: string): void {
  if (
    lineage === null ||
    typeof lineage !== "object" ||
    typeof lineage.authorizationRequestHash !== "string" ||
    lineage.authorizationRequestHash.length === 0 ||
    typeof lineage.writeDigest !== "string" ||
    lineage.writeDigest.length === 0 ||
    typeof lineage.paymentSummaryDigest !== "string" ||
    lineage.paymentSummaryDigest.length === 0 ||
    typeof lineage.handoffId !== "string" ||
    lineage.handoffId.length === 0 ||
    typeof lineage.externalSubmissionRef !== "string" ||
    lineage.externalSubmissionRef.length === 0 ||
    !Array.isArray(lineage.evidenceRefs) ||
    lineage.evidenceRefs.length === 0
  ) {
    throw new ValidationError(`${label} requires a WalletAuthorizationLineage`, {
      reason:
        "a payment without explicit customer authorization lineage is structurally unrepresentable",
    });
  }
}
