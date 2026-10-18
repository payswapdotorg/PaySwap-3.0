/**
 * @payswap/route-compiler test fixtures — scoring quote variants (P5-W1).
 * Extracted from walk-fixtures so each fixture module stays under the
 * file law; re-exports the shared builders for one-line imports.
 */

export { scoringQuote, secondVenueQuote, SECOND_VENUE_ID } from "./walk-fixtures.ts";
import { scoringQuote } from "./walk-fixtures.ts";
import type { VenueQuote } from "../src/quote.ts";

/** A tie-mate quote: identical dimensions, different candidate id (tie laws). */
export function tieMateQuote(quoteId: string): VenueQuote {
  return scoringQuote({ quoteId });
}

/** A lower-risk variant (LOW is the tie-breaker's first key). */
export function lowerRiskQuote(quoteId: string): VenueQuote {
  return scoringQuote({ quoteId, riskClass: "LOW" });
}

/** A faster variant (FASTER_SETTLEMENT). */
export function fasterQuote(quoteId: string, estimatedSettlementMs: number): VenueQuote {
  return scoringQuote({ quoteId, estimatedSettlementMs });
}
