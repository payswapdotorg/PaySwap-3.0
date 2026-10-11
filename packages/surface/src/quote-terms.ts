/**
 * @payswap/surface — the quote/terms disclosure projection (P2-W3).
 *
 * NET-NEW module implementing the work order's QUOTE/TERMS PROJECTION with
 * the Wise §4.2 discipline (quote-as-versioned-terms disclosure — advisory
 * research mapped to the frozen architecture; see
 * spec/research/WISE-OPERATING-MODEL.md §4.2 and the acceptance checklist
 * §6: "Quote terms are exact, time-bounded, auditable, versioned and
 * displayed without hiding fees or converting estimates into guarantees").
 *
 * DISCIPLINE PORTED from the old repo's convert-preview fold
 * (payswap.org@8a735bf packages/surface/src/convert-preview.ts, 164L):
 * two-level progressive disclosure (simple outcome line + advanced
 * drill-down), honest counts, nothing silently dropped, pure data
 * derivation. The old fold itself (over route-compiler output) is NOT
 * ported — route compilation is P5-W1 territory; what is ported is the
 * disclosure-fold LAW applied to quote/terms-shaped data.
 *
 * PROJECTION LAW (INV-23): the fold DISPLAYS the terms the quote authority
 * declared; it never computes financial truth. No money arithmetic exists
 * here — fee totals are displayed verbatim as DECLARED by the source (or
 * honestly "not declared"), never summed by the surface. Rate values are
 * displayed verbatim with provenance; cross-checking source*rate=target is
 * owned by the financial authority, never by a display fold.
 *
 * STRUCTURAL PIN: QuoteTermsSource pins what the sibling lanes own
 * (P2-W1 capability fabric owns corridor/quote-shaped terms; the TL wires
 * imports at integration). Every amount is the pinned AmountSpec wire
 * shape (src/amount-spec.ts). Deterministic: `now` is an EXPLICIT input —
 * no ambient clock anywhere in this library.
 */

import { requireSurfaceAmountSpec, type AmountSpec } from "./amount-spec.ts";
import { formatMoneyAmount, type MoneyDisplayInput } from "./money-view.ts";
import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** Raised when a quote/terms source is structurally invalid (fail-closed). */
export class InvalidQuoteTermsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQuoteTermsError";
  }
}

/** How a fee line is charged (display metadata, never a computation). */
export type QuoteFeeBasis =
  | "FLAT"
  | "PERCENTAGE_OF_SOURCE"
  | "PERCENTAGE_OF_TARGET"
  | "PROVIDER_DISCLOSED";

/** One fee line item, disclosed verbatim (never hidden, never summed by the surface). */
export interface QuoteFeeLine {
  readonly feeId: string;
  /** People-language label, e.g. "Transfer fee". */
  readonly label: string;
  /** The exact fee amount on the wire (may be zero — zero-fee corridors exist and are disclosed as such). */
  readonly amount: AmountSpec;
  readonly basis: QuoteFeeBasis;
  /** True when the fee is already inside the quoted source/target amounts (transparency). */
  readonly includedInQuotedAmount: boolean;
}

/** Delivery estimate kind — an estimate is NEVER displayed as a guarantee. */
export type DeliveryEstimateKind = "ESTIMATE" | "GUARANTEE";

/** The delivery estimate with its EXPLICIT guarantee-vs-estimate label. */
export interface QuoteDeliveryEstimate {
  readonly kind: DeliveryEstimateKind;
  /** People-language estimate, e.g. "1–2 business days". */
  readonly estimateLabel: string;
  /**
   * The provider-backed contract citation. REQUIRED when kind ===
   * "GUARANTEE" — a guarantee without provider backing is a fabricated
   * guarantee and the fold refuses it (INV-24 discipline).
   */
  readonly guaranteeBasis?: string;
}

/** Exchange rate with provenance (displayed verbatim; never a surface-side calculation). */
export interface QuoteRate {
  /** The rate value in explicit string form (a dimensionless ratio, not money). */
  readonly value: string;
  /** Where the rate came from, e.g. "mid-market" or the provider's declared source. */
  readonly provenance: string;
  /** When the rate was observed/locked (explicit input; ISO-8601 string). */
  readonly asOf: string;
  /** The provider's rounding rule, declared verbatim when present. */
  readonly roundingRule?: string;
}

/** Quote expiry (time-bounded offer — a quote is never an authorization). */
export interface QuoteExpiry {
  /** ISO-8601 string; compared lexicographically against the explicit `now` input. */
  readonly at: string;
  /** What happens when the quote expires. */
  readonly onExpiry: "REVALIDATE_REQUIRED" | "QUOTE_VOID";
}

/** Funding-route assumption declared with the quote. */
export interface QuoteFundingAssumption {
  /** e.g. "BANK_TRANSFER" — provider-neutral method label. */
  readonly method: string;
  readonly note: string;
}

/** Recipient assumption declared with the quote. */
export interface QuoteRecipientAssumption {
  /** e.g. "BUSINESS_BANK_ACCOUNT" — provider-neutral account-type label. */
  readonly accountType: string;
  readonly note: string;
}

/** Locking/refresh/material-change conditions (Wise §4.2 discipline). */
export interface QuoteConditions {
  /** Whether the rate is locked for the quote's lifetime. */
  readonly rateLocked: boolean;
  /** Whether the customer can refresh the quote before expiry. */
  readonly refreshAvailable: boolean;
  /** Declared material-change policy, verbatim (e.g. "recipient or amount changes void the quote"). */
  readonly materialChangePolicy: string;
}

/**
 * What the fold reads from quote/terms-shaped data (STRUCTURAL pin of the
 * sibling-lane contract — P2-W1 owns the real shapes; typed envelopes with
 * explicit content, opaque here, TL-wired at integration).
 */
export interface QuoteTermsSource {
  readonly quoteId: string;
  readonly quoteVersion: string;
  /** Exact source amount (what the customer pays). */
  readonly sourceAmount: AmountSpec;
  /** Exact target amount (what the recipient receives). */
  readonly targetAmount: AmountSpec;
  readonly feeLines: readonly QuoteFeeLine[];
  /**
   * The total fees DECLARED by the quote authority, displayed verbatim.
   * Absent means the authority did not declare a total — the surface never
   * sums (no money arithmetic; INV-01/INV-23).
   */
  readonly declaredTotalFees?: AmountSpec;
  readonly rate: QuoteRate;
  readonly expiry: QuoteExpiry;
  readonly delivery: QuoteDeliveryEstimate;
  readonly fundingAssumption?: QuoteFundingAssumption;
  readonly recipientAssumption?: QuoteRecipientAssumption;
  readonly conditions: QuoteConditions;
}

/** Explicit fold inputs — the clock is an INPUT, never ambient. */
export interface QuoteFoldInput {
  /** ISO-8601 now (deterministic freshness computation). */
  readonly now: string;
  /** Display context for exact money formatting (explicit locale/currency data). */
  readonly display: MoneyDisplayInput;
}

/** Freshness of the quote against the explicit now. */
export type QuoteFreshness =
  | { readonly status: "VALID"; readonly expiryAt: string }
  | {
      readonly status: "EXPIRED";
      readonly expiryAt: string;
      readonly headline: string;
    };

/** The full two-level quote/terms disclosure view. */
export interface QuoteTermsView {
  /** The SIMPLE outcome line (progressive disclosure level 1). */
  readonly outcomeLine: string;
  readonly freshness: QuoteFreshness;
  /** Exact display strings for the amounts (integer arithmetic only). */
  readonly amounts: { readonly source: string; readonly target: string };
  /** ADVANCED disclosure (level 2 — rendered only on explicit drill-down). */
  readonly fees: {
    readonly lines: readonly {
      readonly feeId: string;
      readonly label: string;
      readonly display: string;
      readonly basis: QuoteFeeBasis;
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
  /** Delivery with the EXPLICIT guarantee-vs-estimate label. */
  readonly delivery: { readonly kind: DeliveryEstimateKind; readonly line: string };
  /** Funding + recipient assumptions in people language. */
  readonly assumptions: readonly string[];
  /** Locking/refresh/material-change handling in people language. */
  readonly conditions: readonly string[];
  readonly provenance: SurfaceContractProvenance;
}

function feeLineView(
  line: QuoteFeeLine,
  display: MoneyDisplayInput,
): QuoteTermsView["fees"]["lines"][number] {
  return {
    feeId: line.feeId,
    label: line.label,
    display: formatMoneyAmount(line.amount, display),
    basis: line.basis,
    includedInQuotedAmount: line.includedInQuotedAmount,
  };
}

function deliveryLine(delivery: QuoteDeliveryEstimate): string {
  if (delivery.kind === "GUARANTEE") {
    return `Guaranteed delivery: ${delivery.estimateLabel} (provider-backed: ${delivery.guaranteeBasis ?? ""})`;
  }
  return `Estimated delivery: ${delivery.estimateLabel} — an estimate, not a guarantee.`;
}

/**
 * Fold quote/terms-shaped data into the disclosure view. Pure: same input,
 * same view, no clock, no env, no hidden state. Fail-closed: malformed wire
 * amounts, a guarantee without provider backing, and structurally invalid
 * sources throw (never silently degrade into a fabricated disclosure).
 */
export function foldQuoteTerms(source: QuoteTermsSource, input: QuoteFoldInput): QuoteTermsView {
  if (typeof source.quoteId !== "string" || source.quoteId.length === 0) {
    throw new InvalidQuoteTermsError("quoteId must be a non-empty string");
  }
  if (typeof source.quoteVersion !== "string" || source.quoteVersion.length === 0) {
    throw new InvalidQuoteTermsError("quoteVersion must be a non-empty string");
  }
  const sourceAmount = requireSurfaceAmountSpec(source.sourceAmount, "sourceAmount");
  const targetAmount = requireSurfaceAmountSpec(source.targetAmount, "targetAmount");
  for (const line of source.feeLines) {
    requireSurfaceAmountSpec(line.amount, `feeLines[${line.feeId}].amount`);
  }
  if (source.declaredTotalFees !== undefined) {
    requireSurfaceAmountSpec(source.declaredTotalFees, "declaredTotalFees");
  }
  if (source.delivery.kind === "GUARANTEE" && !source.delivery.guaranteeBasis) {
    throw new InvalidQuoteTermsError(
      "delivery.kind GUARANTEE requires guaranteeBasis (provider-backed contract) — a guarantee without provider backing is a fabricated guarantee",
    );
  }

  const freshness: QuoteFreshness =
    input.now >= source.expiry.at
      ? {
          status: "EXPIRED",
          expiryAt: source.expiry.at,
          headline:
            "This quote has expired — the quoted terms are no longer offered. A fresh quote is required before anything moves; if the approved terms changed, renewed customer authorization is required.",
        }
      : { status: "VALID", expiryAt: source.expiry.at };

  const feeLines = source.feeLines.map((line) => feeLineView(line, input.display));
  const total: QuoteTermsView["fees"]["total"] =
    source.declaredTotalFees !== undefined
      ? {
          kind: "DECLARED",
          display: formatMoneyAmount(source.declaredTotalFees, input.display),
        }
      : {
          kind: "NOT_DECLARED",
          note: "Total fees were not declared by the quote authority — the surface lists every fee line verbatim and never invents a total.",
        };

  const assumptions: string[] = [];
  if (source.fundingAssumption) {
    assumptions.push(
      `Assumes funding by ${source.fundingAssumption.method} — ${source.fundingAssumption.note}`,
    );
  }
  if (source.recipientAssumption) {
    assumptions.push(
      `Assumes recipient account type ${source.recipientAssumption.accountType} — ${source.recipientAssumption.note}`,
    );
  }

  const conditions: string[] = [
    source.conditions.rateLocked
      ? "The rate is locked for this quote's lifetime."
      : "The rate is not locked — it can change before execution.",
    source.conditions.refreshAvailable
      ? "The quote can be refreshed before expiry."
      : "The quote cannot be refreshed — a new quote replaces it.",
    `Material changes: ${source.conditions.materialChangePolicy}`,
  ];

  const outcomeLine = `${formatMoneyAmount(sourceAmount, input.display)} → ${formatMoneyAmount(
    targetAmount,
    input.display,
  )} — ${feeLines.length} fee line${feeLines.length === 1 ? "" : "s"} disclosed, rate ${
    source.rate.value
  } (${source.rate.provenance}, as of ${source.rate.asOf}), expires ${source.expiry.at}, ${deliveryLine(
    source.delivery,
  )}`;

  return {
    outcomeLine:
      freshness.status === "EXPIRED"
        ? `${freshness.headline} ${outcomeLine}`
        : outcomeLine,
    freshness,
    amounts: {
      source: formatMoneyAmount(sourceAmount, input.display),
      target: formatMoneyAmount(targetAmount, input.display),
    },
    fees: { lines: feeLines, total },
    rate: {
      value: source.rate.value,
      provenance: source.rate.provenance,
      asOf: source.rate.asOf,
      ...(source.rate.roundingRule !== undefined
        ? { roundingRule: source.rate.roundingRule }
        : {}),
    },
    delivery: { kind: source.delivery.kind, line: deliveryLine(source.delivery) },
    assumptions,
    conditions,
    provenance: surfaceProvenance("P2-W3"),
  };
}
