/**
 * @payswap/merchant — branded identifiers (P5-W3, lane R3-W3).
 *
 * Every merchant-scoped reference is a BRAND-TYPED id validated by one
 * shared law (ADAPT of the protocol lane's id law, re-declared
 * locally): non-empty, at most 256 characters, no surrounding
 * whitespace. The SettlementInstructionId additionally enforces the
 * PINNED protocol-lane law (pins/protocol.ts) and brands into the
 * PINNED type — the delegation handle (money movement is referenced,
 * never owned).
 */

import { InvalidIdentifierError } from "./errors.ts";
import { LIMITS } from "./kernel.ts";
import {
  PINNED_SETTLEMENT_INSTRUCTION_ID_MAX_LENGTH,
  type PinnedSettlementInstructionId,
} from "./pins/protocol.ts";

// ---------------------------------------------------------------------------
// The merchant id family (local brands)
// ---------------------------------------------------------------------------

declare const MerchantIdBrand: unique symbol;
/** Branded id of one merchant. */
export type MerchantId = string & { readonly [MerchantIdBrand]: "MerchantId" };

declare const MerchantPaymentIntentIdBrand: unique symbol;
/** Branded id of one merchant payment intent. */
export type MerchantPaymentIntentId = string & {
  readonly [MerchantPaymentIntentIdBrand]: "MerchantPaymentIntentId";
};

declare const MerchantPaymentAttemptIdBrand: unique symbol;
/** Branded id of one merchant payment attempt. */
export type MerchantPaymentAttemptId = string & {
  readonly [MerchantPaymentAttemptIdBrand]: "MerchantPaymentAttemptId";
};

declare const MerchantCheckoutSessionIdBrand: unique symbol;
/** Branded id of one merchant checkout session. */
export type MerchantCheckoutSessionId = string & {
  readonly [MerchantCheckoutSessionIdBrand]: "MerchantCheckoutSessionId";
};

declare const CheckoutFlowIdBrand: unique symbol;
/** Branded id of one checkout flow. */
export type CheckoutFlowId = string & { readonly [CheckoutFlowIdBrand]: "CheckoutFlowId" };

declare const QuoteIdBrand: unique symbol;
/** Branded id of one crypto quote. */
export type QuoteId = string & { readonly [QuoteIdBrand]: "QuoteId" };

declare const CryptoAssetIdBrand: unique symbol;
/** Branded id of one crypto asset definition. */
export type CryptoAssetId = string & { readonly [CryptoAssetIdBrand]: "CryptoAssetId" };

declare const ChainIdBrand: unique symbol;
/** Branded id of one chain/network reference (opaque to this package). */
export type ChainId = string & { readonly [ChainIdBrand]: "ChainId" };

declare const MerchantCryptoAcceptancePolicyIdBrand: unique symbol;
/** Branded id of one merchant crypto acceptance policy. */
export type MerchantCryptoAcceptancePolicyId = string & {
  readonly [MerchantCryptoAcceptancePolicyIdBrand]: "MerchantCryptoAcceptancePolicyId";
};

declare const CryptoAcceptanceActivationIdBrand: unique symbol;
/** Branded id of one crypto acceptance activation. */
export type CryptoAcceptanceActivationId = string & {
  readonly [CryptoAcceptanceActivationIdBrand]: "CryptoAcceptanceActivationId";
};

declare const RefundIdBrand: unique symbol;
/** Branded id of one refund. */
export type RefundId = string & { readonly [RefundIdBrand]: "RefundId" };

declare const WebhookEventIdBrand: unique symbol;
/** Branded id of one webhook event (the idempotency key). */
export type WebhookEventId = string & { readonly [WebhookEventIdBrand]: "WebhookEventId" };

// ---------------------------------------------------------------------------
// The shared brand law
// ---------------------------------------------------------------------------

function brandId<TBranded extends string>(value: unknown, kind: string): TBranded {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidIdentifierError(`${kind} must be a non-empty string`, { kind, value });
  }
  if (value.length > LIMITS.refMaxLength) {
    throw new InvalidIdentifierError(
      `${kind} exceeds ${LIMITS.refMaxLength} characters`,
      { kind, value },
    );
  }
  if (value.trim() !== value) {
    throw new InvalidIdentifierError(
      `${kind} must not carry surrounding whitespace`,
      { kind, value },
    );
  }
  return value as TBranded;
}

/** Brand a validated string as a `MerchantId`. */
export function asMerchantId(value: string): MerchantId {
  return brandId(value, "MerchantId");
}

/** Brand a validated string as a `MerchantPaymentIntentId`. */
export function asMerchantPaymentIntentId(value: string): MerchantPaymentIntentId {
  return brandId(value, "MerchantPaymentIntentId");
}

/** Brand a validated string as a `MerchantPaymentAttemptId`. */
export function asMerchantPaymentAttemptId(value: string): MerchantPaymentAttemptId {
  return brandId(value, "MerchantPaymentAttemptId");
}

/** Brand a validated string as a `MerchantCheckoutSessionId`. */
export function asMerchantCheckoutSessionId(value: string): MerchantCheckoutSessionId {
  return brandId(value, "MerchantCheckoutSessionId");
}

/** Brand a validated string as a `CheckoutFlowId`. */
export function asCheckoutFlowId(value: string): CheckoutFlowId {
  return brandId(value, "CheckoutFlowId");
}

/** Brand a validated string as a `QuoteId`. */
export function asQuoteId(value: string): QuoteId {
  return brandId(value, "QuoteId");
}

/** Brand a validated string as a `CryptoAssetId`. */
export function asCryptoAssetId(value: string): CryptoAssetId {
  return brandId(value, "CryptoAssetId");
}

/** Brand a validated string as a `ChainId`. */
export function asChainId(value: string): ChainId {
  return brandId(value, "ChainId");
}

/** Brand a validated string as a `MerchantCryptoAcceptancePolicyId`. */
export function asMerchantCryptoAcceptancePolicyId(
  value: string,
): MerchantCryptoAcceptancePolicyId {
  return brandId(value, "MerchantCryptoAcceptancePolicyId");
}

/** Brand a validated string as a `CryptoAcceptanceActivationId`. */
export function asCryptoAcceptanceActivationId(value: string): CryptoAcceptanceActivationId {
  return brandId(value, "CryptoAcceptanceActivationId");
}

/** Brand a validated string as a `RefundId`. */
export function asRefundId(value: string): RefundId {
  return brandId(value, "RefundId");
}

/** Brand a validated string as a `WebhookEventId`. */
export function asWebhookEventId(value: string): WebhookEventId {
  return brandId(value, "WebhookEventId");
}

// ---------------------------------------------------------------------------
// The settlement-instruction TYPED REFERENCE (the delegation handle)
// ---------------------------------------------------------------------------

/**
 * Brand a validated string as the PINNED `SettlementInstructionId`
 * typed reference — THE DELEGATION HANDLE. The validation law is the
 * protocol lane's own, pinned byte-identical in pins/protocol.ts
 * (non-empty, at most 256 characters, no surrounding whitespace).
 * Settlement-instruction SEMANTICS stay with the protocol lane; this
 * package only carries the typed reference.
 */
export function asSettlementInstructionId(value: string): PinnedSettlementInstructionId {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidIdentifierError(
      "SettlementInstructionId must be a non-empty string",
      { value },
    );
  }
  if (value.length > PINNED_SETTLEMENT_INSTRUCTION_ID_MAX_LENGTH) {
    throw new InvalidIdentifierError(
      `SettlementInstructionId exceeds ${PINNED_SETTLEMENT_INSTRUCTION_ID_MAX_LENGTH} characters`,
      { value },
    );
  }
  if (value.trim() !== value) {
    throw new InvalidIdentifierError(
      "SettlementInstructionId must not carry surrounding whitespace",
      { value },
    );
  }
  return value as PinnedSettlementInstructionId;
}
