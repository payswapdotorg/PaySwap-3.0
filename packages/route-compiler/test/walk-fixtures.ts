/**
 * @payswap/route-compiler test fixtures — walk faults + finality models
 * and scoring quote variants (P5-W1).
 */

import type { RouteLegFault } from "../src/route-walk.ts";
import type { PinnedChainFinalityModel } from "../src/pins/onchain.ts";
import { fixtureQuote } from "./venue-fixtures.ts";
import type { VenueQuote } from "../src/quote.ts";
import { CHAIN, NOW } from "./fixtures.ts";

/** The per-chain finality models (caller-supplied chain knowledge). */
export const ONCHAIN_FINALITY_MODES: Readonly<Record<string, PinnedChainFinalityModel>> = {
  "ethereum:mainnet": "PROBABILISTIC",
  "solana:mainnet-beta": "DETERMINISTIC",
};

/** The fault kinds per rail family (typed — cross-family throws). */
export const ONCHAIN_FAULTS: readonly RouteLegFault[] = [
  {
    kind: "ONCHAIN_PROTOCOL_FAILURE",
    failureClass: "INSUFFICIENT_FUNDS",
    description: "the fixture protocol failure (insufficient funds)",
    retryGuidance: "NOT_RETRYABLE",
  },
  { kind: "ONCHAIN_UNFINALIZED_BROADCAST" },
  { kind: "ONCHAIN_OUTCOME_UNKNOWN", reason: "the fixture reorg left the outcome unknown" },
];

export const FIAT_FAULTS: readonly RouteLegFault[] = [
  { kind: "FIAT_OUTCOME_UNKNOWN", reason: "the fixture provider could not observe the outcome" },
  { kind: "FIAT_DEFINITIVE_FAILED", reason: "the fixture provider definitively failed the leg" },
];

export const MERCHANT_FAULTS: readonly RouteLegFault[] = [
  { kind: "MERCHANT_OUTCOME_UNKNOWN", reason: "the fixture merchant verification outcome is unknown" },
];

/** A quote variant for scoring tests (dimension-level control). */
export function scoringQuote(options?: {
  quoteId?: string;
  worstCaseOutputMinor?: string;
  riskClass?: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
  estimatedSettlementMs?: number;
  optimizationOrigin?: "PROVIDER_NATIVE" | "COMPOSED";
  withFees?: boolean;
  withGas?: boolean;
}): VenueQuote {
  const base = fixtureQuote(options);
  const result: VenueQuote = {
    ...base,
    fees: options?.withFees === false ? [] : base.fees,
  };
  if (options?.withGas !== false && base.gasCost !== undefined) {
    (result as { gasCost?: VenueQuote["gasCost"] }).gasCost = base.gasCost;
  }
  return result;
}

/** A second venue id for competition tests (venue-neutral ids). */
export const SECOND_VENUE_ID = "fixture-dex-beta";

/** A quote bound to the second venue. */
export function secondVenueQuote(options?: { worstCaseOutputMinor?: string; riskClass?: "LOW" | "MODERATE" | "ELEVATED" | "HIGH" }): VenueQuote {
  const base = fixtureQuote(options);
  return {
    ...base,
    quoteId: "quote:fixture-dex:beta-001",
    venueId: SECOND_VENUE_ID,
    routeShape: [{ venue: SECOND_VENUE_ID, chain: CHAIN, description: "the second fixture venue's single hop" }],
    provenance: { ...base.provenance, evidenceRefs: ["fixture:venue-quote:beta-001"] },
  };
}

export { NOW, CHAIN };
