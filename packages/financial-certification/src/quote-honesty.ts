/**
 * @payswap/financial-certification — LAW 1: quote honesty (P8-W1).
 *
 * - EXPIRED QUOTES ARE INERT: a quote at or past its validity boundary
 *   (the pinned merchant law: expired iff now >= validUntil — expiry AT
 *   the boundary) or past its bounded observation window (the pinned
 *   route-compiler law: stale iff (at − asOfMs) > maxAgeMs, inclusive
 *   bound) is NEVER executable, and any command grounded in it is
 *   invalid.
 * - MATERIAL CHANGE INVALIDATES: a change on any material axis
 *   (beneficiary, payout amount, payout currency, fiat price, rail)
 *   between the authorized quote terms and the terms a command presents
 *   invalidates the quote AND the command — a translation that changes
 *   material terms requires fresh reauthorization (the pinned
 *   merchant material-terms law).
 * - FRESHNESS IS CARRIED, NOT ASSUMED: every certified quote
 *   observation carries BOTH windows (the validity window and the
 *   bounded freshness window); an INDICATIVE quote (the pinned
 *   route-compiler semantics) can never ground a command.
 *
 * Deterministic only: both evaluation instants are caller-supplied (the
 * two pinned clocks — bigint window + number freshness); no ambient
 * time.
 */

import { contentDigest } from "./digest.ts";
import { ConformanceError } from "./errors.ts";
import { conformanceVerdict, type ConformanceVerdict } from "./laws.ts";
import type { PinnedQuoteFreshness, PinnedQuoteSemantics } from "./pins/route-compiler.ts";
import { pinnedIsQuoteStale } from "./pins/route-compiler.ts";
import { pinnedIsQuoteExpired } from "./pins/merchant.ts";

/** The material axes of a quote (a change on ANY invalidates). */
export const MATERIAL_CHANGE_AXES = [
  "BENEFICIARY",
  "PAYOUT_AMOUNT",
  "PAYOUT_CURRENCY",
  "FIAT_PRICE",
  "RAIL",
] as const;

export type MaterialChangeAxis = (typeof MATERIAL_CHANGE_AXES)[number];

/** The material terms a quote authorizes (the certification view). */
export interface QuoteMaterialTerms {
  readonly beneficiaryId: string;
  readonly payoutCurrency: string;
  readonly payoutAmountMinor: bigint;
  readonly fiatPriceMinor: bigint;
  readonly railId: string;
}

/** A certified quote observation: both windows + semantics + terms. */
export interface CertifiedQuoteObservation {
  readonly quoteId: string;
  readonly quotedAt: bigint;
  readonly validUntil: bigint;
  readonly freshness: PinnedQuoteFreshness;
  readonly quoteSemantics: PinnedQuoteSemantics;
  readonly materialTerms: QuoteMaterialTerms;
  readonly sourceRef: string;
}

/** Fail-closed construction of a certified quote observation. */
export function defineCertifiedQuoteObservation(
  input: CertifiedQuoteObservation,
): CertifiedQuoteObservation {
  if (input.quoteId.length === 0) {
    throw new ConformanceError("a certified quote requires a quoteId");
  }
  if (typeof input.quotedAt !== "bigint" || typeof input.validUntil !== "bigint") {
    throw new ConformanceError("quote windows must be bigint TimestampMs");
  }
  if (input.validUntil <= input.quotedAt) {
    throw new ConformanceError(
      `quote '${input.quoteId}': validUntil must be strictly after quotedAt (a quote born expired is unrepresentable)`,
    );
  }
  if (
    typeof input.freshness?.asOfMs !== "number" ||
    !Number.isSafeInteger(input.freshness.asOfMs) ||
    input.freshness.asOfMs < 0 ||
    typeof input.freshness.maxAgeMs !== "number" ||
    !Number.isSafeInteger(input.freshness.maxAgeMs) ||
    input.freshness.maxAgeMs < 1
  ) {
    throw new ConformanceError(
      `quote '${input.quoteId}': freshness must be a bounded window (asOfMs >= 0, maxAgeMs >= 1 — freshness is carried, not assumed)`,
    );
  }
  if (input.quoteSemantics !== "INDICATIVE" && input.quoteSemantics !== "EXECUTABLE") {
    throw new ConformanceError(
      `quote '${input.quoteId}': unknown quote semantics '${input.quoteSemantics}'`,
    );
  }
  const terms = input.materialTerms;
  if (
    terms === null ||
    typeof terms !== "object" ||
    terms.beneficiaryId.length === 0 ||
    terms.payoutCurrency.length !== 3 ||
    typeof terms.payoutAmountMinor !== "bigint" ||
    terms.payoutAmountMinor <= 0n ||
    typeof terms.fiatPriceMinor !== "bigint" ||
    terms.fiatPriceMinor <= 0n ||
    terms.railId.length === 0
  ) {
    throw new ConformanceError(
      `quote '${input.quoteId}': material terms must be complete (beneficiary, 3-letter currency, positive amount/price, rail)`,
    );
  }
  if (input.sourceRef.length === 0) {
    throw new ConformanceError("a certified quote requires a sourceRef");
  }
  return Object.freeze({
    quoteId: input.quoteId,
    quotedAt: input.quotedAt,
    validUntil: input.validUntil,
    freshness: Object.freeze({ ...input.freshness }),
    quoteSemantics: input.quoteSemantics,
    materialTerms: Object.freeze({ ...terms }),
    sourceRef: input.sourceRef,
  });
}

/** The two caller-supplied evaluation instants (the two pinned clocks). */
export interface QuoteProbeInstant {
  /** For the validity window (the pinned bigint merchant clock). */
  readonly windowAt: bigint;
  /** For the bounded freshness window (the pinned number route clock). */
  readonly freshnessAt: number;
}

export type QuoteStatusAtInstant =
  | { readonly status: "EXECUTABLE" }
  | { readonly status: "EXPIRED"; readonly reason: string };

/**
 * The inertness law: expired iff at >= validUntil (expiry AT the
 * boundary) OR stale iff (freshnessAt − asOfMs) > maxAgeMs (the
 * inclusive bound). An expired/stale quote is NEVER executable.
 */
export function quoteStatusAt(
  quote: CertifiedQuoteObservation,
  at: QuoteProbeInstant,
): QuoteStatusAtInstant {
  if (pinnedIsQuoteExpired({ quotedAt: quote.quotedAt, validUntil: quote.validUntil }, at.windowAt)) {
    return {
      status: "EXPIRED",
      reason: `the validity window closed at ${quote.validUntil.toString()} (expiry AT the boundary; the last usable instant is ${(quote.validUntil - 1n).toString()})`,
    };
  }
  if (pinnedIsQuoteStale(quote.freshness, at.freshnessAt)) {
    return {
      status: "EXPIRED",
      reason: `the observation window is stale (age ${at.freshnessAt - quote.freshness.asOfMs}ms exceeds the bound ${quote.freshness.maxAgeMs}ms)`,
    };
  }
  return { status: "EXECUTABLE" };
}

/** The material change between authorized and presented terms, if any. */
export function materialChangeBetween(
  authorized: QuoteMaterialTerms,
  presented: QuoteMaterialTerms,
): { readonly changed: false } | { readonly changed: true; readonly axes: readonly MaterialChangeAxis[] } {
  const axes: MaterialChangeAxis[] = [];
  if (authorized.beneficiaryId !== presented.beneficiaryId) {
    axes.push("BENEFICIARY");
  }
  if (authorized.payoutAmountMinor !== presented.payoutAmountMinor) {
    axes.push("PAYOUT_AMOUNT");
  }
  if (authorized.payoutCurrency !== presented.payoutCurrency) {
    axes.push("PAYOUT_CURRENCY");
  }
  if (authorized.fiatPriceMinor !== presented.fiatPriceMinor) {
    axes.push("FIAT_PRICE");
  }
  if (authorized.railId !== presented.railId) {
    axes.push("RAIL");
  }
  if (axes.length === 0) {
    return { changed: false };
  }
  return { changed: true, axes: Object.freeze(axes) };
}

/** A command as the certification sees it (what the subject submitted). */
export interface CertifiedQuoteCommand {
  readonly commandId: string;
  readonly quoteId: string;
  /** The digest of the quote bytes the command claims to be built on. */
  readonly quoteDigest: string;
  /** The material terms the command presents. */
  readonly presentedTerms: QuoteMaterialTerms;
  readonly evidenceRefs: readonly string[];
}

/**
 * The quote digest binding: the byte-deterministic digest of the quote
 * observation (the grounding a command must cite).
 */
export function certifiedQuoteDigest(quote: CertifiedQuoteObservation): string {
  return contentDigest(quote);
}

/**
 * CERTIFIES the quote-honesty law over one (quote, command, instant)
 * probe: an expired quote is inert (any command grounded in it is a
 * violation), an INDICATIVE quote cannot ground a command, the command
 * must cite the quote's digest, and any material change between the
 * quote's terms and the command's presented terms invalidates both.
 * The scenario family (QUOTE_EXPIRY / QUOTE_MATERIAL_CHANGE) is
 * caller-declared — the probe knows which family it exercises.
 */
export function certifyQuoteGrounding(input: {
  readonly subjectRef: string;
  readonly quote: CertifiedQuoteObservation;
  readonly at: QuoteProbeInstant;
  readonly command: CertifiedQuoteCommand;
  readonly scenarioId: "QUOTE_EXPIRY" | "QUOTE_MATERIAL_CHANGE";
}): ConformanceVerdict {
  const violations: string[] = [];
  const quote = input.quote;
  const command = input.command;
  if (command.commandId.length === 0) {
    throw new ConformanceError("a quote command requires a commandId");
  }
  if (command.quoteId !== quote.quoteId) {
    violations.push(
      `command '${command.commandId}' cites quote '${command.quoteId}' but was probed against '${quote.quoteId}'`,
    );
  }
  const status = quoteStatusAt(quote, input.at);
  if (status.status === "EXPIRED") {
    violations.push(
      `FIN-LAW-01 (inertness): command '${command.commandId}' is grounded in an EXPIRED quote '${quote.quoteId}' — ${status.reason}; expired quotes are never executable`,
    );
  }
  if (quote.quoteSemantics !== "EXECUTABLE") {
    violations.push(
      `FIN-LAW-01 (semantics): command '${command.commandId}' is grounded in an INDICATIVE quote '${quote.quoteId}' — only EXECUTABLE quotes can ground commands`,
    );
  }
  if (command.quoteDigest !== certifiedQuoteDigest(quote)) {
    violations.push(
      `FIN-LAW-01 (binding): command '${command.commandId}' does not carry the digest of the quote it cites (freshness is carried, not assumed)`,
    );
  }
  const change = materialChangeBetween(quote.materialTerms, command.presentedTerms);
  if (change.changed) {
    violations.push(
      `FIN-LAW-01 (material change): command '${command.commandId}' presents terms that MATERIALLY changed from quote '${quote.quoteId}' on axes [${change.axes.join(", ")}] — the change invalidates the quote and every command built on it (fresh reauthorization required)`,
    );
  }
  return conformanceVerdict({
    lawId: "FIN-LAW-01",
    scenarioId: input.scenarioId,
    subjectRef: input.subjectRef,
    violations,
    evidenceRefs: command.evidenceRefs,
  });
}
