/**
 * PaySwap Desktop (P7-W2) — structural pins of the @payswap/surface quote
 * terms disclosure contract (mirrors packages/surface/src/quote-terms.ts at
 * the base commit recorded in pin-registry.ts; pin surface.quote-terms).
 *
 * DISCLOSURE LAW (ported with the pin): every fee line disclosed verbatim
 * (never hidden, never summed by the surface), rate value + provenance +
 * as-of time displayed verbatim, expiry with its declared material-change
 * policy, delivery estimate labeled ESTIMATE or GUARANTEE — never conflated
 * — and a GUARANTEE without provider backing is refused (a fabricated
 * guarantee, INV-24 discipline). The surface never invents a quote.
 */

import type { PinnedAmountSpec, PinnedMoneyDisplayInput } from "./surface-pins.js";

// ---------------------------------------------------------------------------
// Fee lines
// ---------------------------------------------------------------------------

/** Mirrors QuoteFeeBasis — how a fee line is charged (display metadata, never a computation). */
export type PinnedQuoteFeeBasis =
  | "FLAT"
  | "PERCENTAGE_OF_SOURCE"
  | "PERCENTAGE_OF_TARGET"
  | "PROVIDER_DISCLOSED";

/** Mirrors QuoteFeeLine — one fee line item, disclosed verbatim. */
export interface PinnedQuoteFeeLine {
  readonly feeId: string;
  readonly label: string;
  readonly amount: PinnedAmountSpec;
  readonly basis: PinnedQuoteFeeBasis;
  /** True when the fee is already inside the quoted source/target amounts. */
  readonly includedInQuotedAmount: boolean;
}

// ---------------------------------------------------------------------------
// Delivery estimate, rate, expiry
// ---------------------------------------------------------------------------

/** Mirrors DeliveryEstimateKind — an estimate is NEVER displayed as a guarantee. */
export const PINNED_DELIVERY_ESTIMATE_KINDS = ["ESTIMATE", "GUARANTEE"] as const;

export type PinnedDeliveryEstimateKind = (typeof PINNED_DELIVERY_ESTIMATE_KINDS)[number];

/** Mirrors QuoteDeliveryEstimate — with the EXPLICIT guarantee-vs-estimate label. */
export interface PinnedQuoteDeliveryEstimate {
  readonly kind: PinnedDeliveryEstimateKind;
  readonly estimateLabel: string;
  /** REQUIRED when kind === "GUARANTEE" — provider backing, or the fold refuses. */
  readonly guaranteeBasis?: string;
}

/** Mirrors QuoteRate — rate value, provenance, as-of time (displayed verbatim). */
export interface PinnedQuoteRate {
  readonly value: string;
  readonly provenance: string;
  readonly asOf: string;
  readonly roundingRule?: string;
}

/** Mirrors QuoteExpiry — a time-bounded offer; a quote is never an authorization. */
export interface PinnedQuoteExpiry {
  readonly at: string;
  readonly onExpiry: "REVALIDATE_REQUIRED" | "QUOTE_VOID";
}

// ---------------------------------------------------------------------------
// Conditions + assumptions + source
// ---------------------------------------------------------------------------

/** Mirrors QuoteFundingAssumption — the funding-route assumption. */
export interface PinnedQuoteFundingAssumption {
  readonly method: string;
  readonly note: string;
}

/** Mirrors QuoteRecipientAssumption — the recipient-side assumption. */
export interface PinnedQuoteRecipientAssumption {
  readonly accountType: string;
  readonly note: string;
}

/** Mirrors QuoteConditions — locking/refresh/material-change conditions. */
export interface PinnedQuoteConditions {
  readonly rateLocked: boolean;
  readonly refreshAvailable: boolean;
  readonly materialChangePolicy: string;
}

/** Mirrors QuoteTermsSource — what the fold reads (never a surface-side invention). */
export interface PinnedQuoteTermsSource {
  readonly quoteId: string;
  readonly quoteVersion: string;
  readonly sourceAmount: PinnedAmountSpec;
  readonly targetAmount: PinnedAmountSpec;
  readonly feeLines: readonly PinnedQuoteFeeLine[];
  /** Total fees DECLARED by the quote authority — absent means not declared (the surface never sums). */
  readonly declaredTotalFees?: PinnedAmountSpec;
  readonly rate: PinnedQuoteRate;
  readonly expiry: PinnedQuoteExpiry;
  readonly delivery: PinnedQuoteDeliveryEstimate;
  readonly fundingAssumption?: PinnedQuoteFundingAssumption;
  readonly recipientAssumption?: PinnedQuoteRecipientAssumption;
  readonly conditions: PinnedQuoteConditions;
}

/** Mirrors QuoteFoldInput — the clock is an INPUT, never ambient. */
export interface PinnedQuoteFoldInput {
  readonly now: string;
  readonly display: PinnedMoneyDisplayInput;
}

/** Mirrors QuoteFreshness — VALID or EXPIRED against the explicit now. */
export type PinnedQuoteFreshness =
  | { readonly status: "VALID"; readonly expiryAt: string }
  | { readonly status: "EXPIRED"; readonly expiryAt: string; readonly headline: string };

// ---------------------------------------------------------------------------
// View (the desktop quote disclosure wire shape)
// ---------------------------------------------------------------------------

/**
 * The desktop's folded quote disclosure view. Mirrors the two-level
 * QuoteTermsView structure: the SIMPLE outcome line (level 1) plus the
 * ADVANCED disclosure (level 2 — rendered only on explicit drill-down).
 */
export interface PinnedQuoteTermsView {
  readonly outcomeLine: string;
  readonly freshness: PinnedQuoteFreshness;
  /** Exact display strings for the amounts (integer arithmetic only). */
  readonly amounts: { readonly source: string; readonly target: string };
  readonly fees: {
    readonly lines: readonly {
      readonly feeId: string;
      readonly label: string;
      readonly display: string;
      readonly basis: PinnedQuoteFeeBasis;
      readonly includedInQuotedAmount: boolean;
    }[];
    readonly total:
      | { readonly kind: "DECLARED"; readonly display: string }
      | { readonly kind: "NOT_DECLARED"; readonly note: string };
  };
  readonly rate: {
    readonly value: string;
    readonly provenance: string;
    readonly asOf: string;
    readonly roundingRule?: string;
  };
  readonly delivery: { readonly kind: PinnedDeliveryEstimateKind; readonly line: string };
  readonly assumptions: readonly string[];
  readonly conditions: readonly string[];
}

/** Guard: a delivery estimate kind is in the pinned (mirrored) vocabulary. */
export function isPinnedDeliveryEstimateKind(
  value: unknown,
): value is PinnedDeliveryEstimateKind {
  return (
    typeof value === "string" &&
    (PINNED_DELIVERY_ESTIMATE_KINDS as readonly unknown[]).includes(value)
  );
}

/** Guard: a fee basis is in the pinned (mirrored) vocabulary. */
export function isPinnedQuoteFeeBasis(value: unknown): value is PinnedQuoteFeeBasis {
  return (
    typeof value === "string" &&
    ["FLAT", "PERCENTAGE_OF_SOURCE", "PERCENTAGE_OF_TARGET", "PROVIDER_DISCLOSED"].includes(value)
  );
}
