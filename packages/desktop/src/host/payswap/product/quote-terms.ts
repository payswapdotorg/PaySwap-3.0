/**
 * PaySwap Desktop (P7-W2) — the quote disclosure fold.
 *
 * Composes the pinned quote-terms contract (surface.quote-terms) into the
 * desktop disclosure view. Pure: same input, same view; the clock is an
 * EXPLICIT input, never ambient.
 *
 * PORTED LAW: every fee line disclosed verbatim (never hidden, never
 * summed by the desktop — the declared total is displayed as declared or
 * noted as NOT declared); rate value/provenance/as-of verbatim; expiry
 * compared lexicographically against the explicit now; delivery estimate
 * labeled ESTIMATE or GUARANTEE — never conflated — and a GUARANTEE
 * without provider backing REFUSES the fold (a fabricated guarantee,
 * INV-24 discipline). The desktop never invents a quote.
 */

import type {
  DesktopQuoteDisclosureInput,
  DesktopQuoteDisclosureView,
} from "./contracts.js";
import { DESKTOP_PIN_PROVENANCE } from "../pins/index.js";
import type {
  PinnedQuoteFeeLine,
  PinnedQuoteTermsSource,
  PinnedQuoteTermsView,
} from "../pins/index.js";
import { validatePinnedAmountSpec } from "../pins/index.js";
import { formatDesktopMoneyAmount } from "./money-view.js";

function feeLineView(
  line: PinnedQuoteFeeLine,
  display: DesktopQuoteDisclosureInput["display"],
): PinnedQuoteTermsView["fees"]["lines"][number] {
  return {
    feeId: line.feeId,
    label: line.label,
    display: formatDesktopMoneyAmount(line.amount, display),
    basis: line.basis,
    includedInQuotedAmount: line.includedInQuotedAmount,
  };
}

function deliveryLine(delivery: PinnedQuoteTermsSource["delivery"]): string {
  if (delivery.kind === "GUARANTEE") {
    return `Guaranteed delivery: ${delivery.estimateLabel} (provider-backed: ${delivery.guaranteeBasis ?? ""})`;
  }
  return `Estimated delivery: ${delivery.estimateLabel} — an estimate, not a guarantee.`;
}

/**
 * Fold quote/terms-shaped data into the desktop disclosure view.
 * Fail-closed: malformed wire amounts, a guarantee without provider
 * backing, and structurally invalid sources throw — never a silently
 * degraded or fabricated disclosure.
 */
export function foldDesktopQuoteTerms(
  input: DesktopQuoteDisclosureInput,
): DesktopQuoteDisclosureView {
  const { source, now, display } = input;
  if (typeof source.quoteId !== "string" || source.quoteId.length === 0) {
    throw new Error("foldDesktopQuoteTerms: quoteId must be a non-empty string");
  }
  if (typeof source.quoteVersion !== "string" || source.quoteVersion.length === 0) {
    throw new Error("foldDesktopQuoteTerms: quoteVersion must be a non-empty string");
  }
  validatePinnedAmountSpec(source.sourceAmount);
  validatePinnedAmountSpec(source.targetAmount);
  for (const line of source.feeLines) {
    validatePinnedAmountSpec(line.amount);
  }
  if (source.declaredTotalFees !== undefined) {
    validatePinnedAmountSpec(source.declaredTotalFees);
  }
  if (source.delivery.kind === "GUARANTEE" && !source.delivery.guaranteeBasis) {
    throw new Error(
      "foldDesktopQuoteTerms: a GUARANTEE delivery estimate requires its provider backing — a guarantee without provider backing is a fabricated guarantee (INV-24)",
    );
  }
  if (typeof now !== "string" || now.length === 0) {
    throw new Error("foldDesktopQuoteTerms: now must be a non-empty ISO-8601 string");
  }

  const sourceDisplay = formatDesktopMoneyAmount(source.sourceAmount, display);
  const targetDisplay = formatDesktopMoneyAmount(source.targetAmount, display);
  const expired = now >= source.expiry.at;
  const freshness: PinnedQuoteTermsView["freshness"] = expired
    ? {
        status: "EXPIRED",
        expiryAt: source.expiry.at,
        headline: `This quote expired at ${source.expiry.at} — the quoted terms are no longer offered. ${
          source.expiry.onExpiry === "REVALIDATE_REQUIRED"
            ? "Accepting a new quote requires revalidation; the expired terms never silently extend."
            : "The quote is void; a new quote must be requested."
        }`,
      }
    : { status: "VALID", expiryAt: source.expiry.at };

  const total: PinnedQuoteTermsView["fees"]["total"] =
    source.declaredTotalFees !== undefined
      ? { kind: "DECLARED", display: formatDesktopMoneyAmount(source.declaredTotalFees, display) }
      : {
          kind: "NOT_DECLARED",
          note: "The quote authority did not declare a fee total — the desktop never sums fees (no money arithmetic on this surface).",
        };

  const assumptions: string[] = [];
  if (source.fundingAssumption) {
    assumptions.push(`Funding via ${source.fundingAssumption.method}: ${source.fundingAssumption.note}`);
  }
  if (source.recipientAssumption) {
    assumptions.push(
      `Recipient is a ${source.recipientAssumption.accountType}: ${source.recipientAssumption.note}`,
    );
  }

  const conditions: string[] = [
    source.conditions.rateLocked
      ? "The rate is locked for this quote's lifetime."
      : "The rate is NOT locked — it can change before acceptance.",
    source.conditions.refreshAvailable
      ? "You can refresh this quote before it expires."
      : "This quote cannot be refreshed — a new quote replaces it.",
    `Material changes: ${source.conditions.materialChangePolicy}`,
  ];

  const outcomeLine = `Send ${sourceDisplay}, receive ${targetDisplay} — ${deliveryLine(source.delivery)} Rate ${source.rate.value} (${source.rate.provenance}, as of ${source.rate.asOf}).`;

  const view: DesktopQuoteDisclosureView = {
    outcomeLine,
    freshness,
    amounts: { source: sourceDisplay, target: targetDisplay },
    fees: {
      lines: source.feeLines.map((line) => feeLineView(line, display)),
      total,
    },
    rate: {
      value: source.rate.value,
      provenance: source.rate.provenance,
      asOf: source.rate.asOf,
      ...(source.rate.roundingRule !== undefined
        ? { roundingRule: source.rate.roundingRule }
        : {}),
    },
    delivery: { kind: source.delivery.kind, line: deliveryLine(source.delivery) },
    assumptions: Object.freeze(assumptions),
    conditions: Object.freeze(conditions),
    pin: DESKTOP_PIN_PROVENANCE,
  };
  return view;
}
