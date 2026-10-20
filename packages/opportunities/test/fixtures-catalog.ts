/**
 * The across-rails, versioned-lineage, adversarial and catalog fixtures
 * (P6-W2, lane r4-w2; ADAPTED from the old
 * payswap.org@8a735bf fixtures.ts catalog section — split out under the
 * 400-line file law). Family counts: liquidity 9, lending 4, staking 4,
 * incentives 4, arbitrage 4, other 3 — 28 opportunities total.
 */

import type { ArbitrageLeg, OpportunityObservationInput } from "../src/index.ts";
import type { SupportingObservation } from "../src/index.ts";
import {
  FIAT_RAIL,
  FX_RAIL,
  MAX_AGE_MS,
  capitalOn,
  component,
  evidenceAged,
  freshEvidence,
  healthyArbitrageObservation,
  healthyIncentivesObservation,
  healthyLendingObservation,
  healthyLiquidityObservation,
  healthyOtherObservation,
  healthyStakingObservation,
} from "./fixtures.ts";

// Re-export the shared fixture surface (the single import point for tests).
export {
  FIAT_RAIL,
  FX_RAIL,
  MAX_AGE_MS,
  NOW,
  ONCHAIN_RAIL,
  capitalOn,
  component,
  evidenceAged,
  freshEvidence,
  healthyArbitrageObservation,
  healthyIncentivesObservation,
  healthyLendingObservation,
  healthyLiquidityObservation,
  healthyOtherObservation,
  healthyStakingObservation,
  healthyExitPath,
  noLockUp,
  lockedFor,
  auditedLowRisk,
  unknownOracleRisk,
  standardFees,
} from "./fixtures.ts";
export { NOW_ISO } from "./fixtures.ts";

// --- the across-rails fixtures (FIAT + FX healthy opportunities) ---------

export function healthyFiatLiquidityObservation(): OpportunityObservationInput {
  return {
    ...healthyLiquidityObservation({
      observationId: "obs:fiat:liq:001",
      venueId: "venue:fiat-sweep-program",
    }),
    railKind: "FIAT",
    railKey: FIAT_RAIL,
    protocolKey: "protocol:fiat-sweep",
    adapterId: "adapter:fiat:bank",
    observerId: "observer:bank-feed:001",
    evidenceRefs: ["evidence:account-sweep-terms:001", "evidence:interest-schedule:001"],
    title: "FIAT sweep liquidity program participation",
    description:
      "observed bank sweep program on a fiat payment rail; the estimate is derived from the published interest schedule with uncertainty bounds",
    capitalRequired: capitalOn(FIAT_RAIL, "250000000"),
    liquidity: { depthMinorUnits: "9000000000", withdrawalLiquidityMinorUnits: "8800000000" },
  };
}

export function healthyFxArbitrageObservation(): OpportunityObservationInput {
  return {
    ...healthyArbitrageObservation({
      observationId: "obs:fx:arb:001",
      legAVenue: "venue:fx-quote-a",
      legBVenue: "venue:fx-quote-b",
    }),
    railKind: "FX",
    railKey: FX_RAIL,
    adapterId: "adapter:fx:venue",
    observerId: "observer:fx-feed:001",
    evidenceRefs: ["evidence:fx-venue-a-quote:001", "evidence:fx-venue-b-quote:001"],
    title: "EUR/USD price difference between two FX venues",
    description:
      "observed price difference between two FX venue quotes on an FX corridor rail; the estimate is the exact observed spread with a lower bound net of observed execution costs",
    capitalRequired: capitalOn(FX_RAIL, "50000000"),
  };
}

// ---------------------------------------------------------------------------
// The versioned-lineage fixtures (the P6-W2 hard law 1 evidence)
// ---------------------------------------------------------------------------

/** An additional fresh versioned supporting observation. */
export function supportingPoolTelemetryObservation(): SupportingObservation {
  return {
    observationId: "obs:liq:telemetry:001",
    version: 2,
    venueId: "venue:stable-pair",
    protocolKey: "protocol:amm-v2",
    adapterId: "adapter:onchain:evm",
    observerId: "observer:indexer:009",
    freshness: freshEvidence(),
    evidenceRefs: ["evidence:pool-telemetry:001"],
  };
}

/** An additional STALE versioned supporting observation (primary stays fresh). */
export function staleSupportingOracleObservation(): SupportingObservation {
  return {
    observationId: "obs:liq:oracle-check:001",
    version: 1,
    venueId: "venue:oracle-feed",
    adapterId: "adapter:onchain:evm",
    observerId: "observer:indexer:010",
    freshness: evidenceAged(45_000),
    evidenceRefs: ["evidence:oracle-check:001"],
  };
}

/** A healthy liquidity observation with an EXTENDED versioned lineage. */
export function lineageExtendedLiquidityObservation(): OpportunityObservationInput {
  return healthyLiquidityObservation({
    observationId: "obs:liq:lineage-001",
    additionalSupportingObservations: [
      supportingPoolTelemetryObservation(),
      staleSupportingOracleObservation(),
    ],
  });
}

// ---------------------------------------------------------------------------
// The adversarial fixtures (the old task packet's hard requirement 5)
// ---------------------------------------------------------------------------

/** A liquidity observation whose evidence went stale. */
export function staleQuoteObservation(): OpportunityObservationInput {
  return {
    ...healthyLiquidityObservation({ observationId: "obs:liq:stale-001" }),
    freshness: evidenceAged(MAX_AGE_MS + 30_000),
  };
}

/** A lending observation with a manipulated APY (800,000%/yr). */
export function manipulatedApyObservation(): OpportunityObservationInput {
  return {
    ...healthyLendingObservation({ observationId: "obs:len:manip-001" }),
    returnComponents: [component("len:supply-apy", "SUPPLY_APY", "8000", "1")],
  };
}

/** An incentives observation whose reward component is unverified (fake). */
export function fakeIncentiveObservation(): OpportunityObservationInput {
  return {
    ...healthyIncentivesObservation({ observationId: "obs:inc:fake-001" }),
    returnComponents: [
      component("inc:rebate", "INCENTIVE_YIELD", "950", "10000", {
        evidenceVerified: false,
        budgetReserved: false,
      }),
    ],
  };
}

/** An incentives observation whose reward budget is NOT reserved (rule 13). */
export function unreservedBudgetObservation(): OpportunityObservationInput {
  return {
    ...healthyIncentivesObservation({ observationId: "obs:inc:unreserved-001" }),
    returnComponents: [
      component("inc:rebate", "INCENTIVE_YIELD", "950", "10000", {
        evidenceVerified: true,
        budgetReserved: false,
      }),
    ],
  };
}

/** An arbitrage observation where one venue's exit liquidity vanished. */
export function vanishedLiquidityObservation(): OpportunityObservationInput {
  return healthyArbitrageObservation({
    observationId: "obs:arb:vanished-001",
    legBWithdrawalLiquidity: "0",
  });
}

/** A liquidity observation whose exit path is a suspected honeypot. */
export function honeypotObservation(): OpportunityObservationInput {
  return {
    ...healthyLiquidityObservation({ observationId: "obs:liq:honeypot-001" }),
    exitPath: {
      status: "SUSPECT_HONEYPOT",
      description:
        "deposits are open; withdrawals require an operator approval that has never been observed onchain",
      constraints: ["no withdrawal has ever been observed on this venue"],
    },
  };
}

/** An "other" strategy observation without a policy approval reference. */
export function unapprovedOtherObservation(): OpportunityObservationInput {
  return healthyOtherObservation({
    observationId: "obs:oth:unapproved-001",
    withApproval: false,
  });
}

/** A staking observation whose unbonding evidence went stale. */
export function staleStakingObservation(): OpportunityObservationInput {
  return {
    ...healthyStakingObservation({ observationId: "obs:stk:stale-001" }),
    freshness: evidenceAged(MAX_AGE_MS * 3),
  };
}

/** A liquidity observation with a BLOCKED exit path. */
export function blockedExitObservation(): OpportunityObservationInput {
  return {
    ...healthyLiquidityObservation({ observationId: "obs:liq:blocked-001" }),
    exitPath: {
      status: "BLOCKED",
      description:
        "withdrawals are paused by the venue operator at the evidence instant; no exit transaction was observed",
      constraints: ["operator pause observed in the evidence chain"],
    },
  };
}

/** A liquidity observation whose own withdrawal liquidity vanished. */
export function vanishedOwnLiquidityObservation(): OpportunityObservationInput {
  return {
    ...healthyLiquidityObservation({ observationId: "obs:liq:own-vanished-001" }),
    liquidity: { depthMinorUnits: "500000000000", withdrawalLiquidityMinorUnits: "0" },
  };
}

// ---------------------------------------------------------------------------
// The discovery catalog (deterministic; the report's family counts)
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  readonly label: string;
  readonly input: OpportunityObservationInput;
}

/**
 * The full discovery catalog: healthy opportunities in all six families
 * (across onchain + fiat + fx rails) plus every adversarial fixture and
 * the versioned-lineage fixture. Family counts: liquidity 9, lending 4,
 * staking 4, incentives 4, arbitrage 4, other 3 — 28 opportunities.
 */
export function discoveryCatalog(): readonly CatalogEntry[] {
  return [
    // liquidity: healthy x4 (onchain x3 + fiat) + lineage + stale + honeypot + blocked + own-vanished = 10
    { label: "liquidity:healthy-1", input: healthyLiquidityObservation() },
    {
      label: "liquidity:healthy-2",
      input: healthyLiquidityObservation({
        observationId: "obs:liq:002",
        venueId: "venue:volatile-pair",
        maxLossKnown: false,
      }),
    },
    {
      label: "liquidity:healthy-3",
      input: healthyLiquidityObservation({
        observationId: "obs:liq:003",
        venueId: "venue:correlated-pair",
      }),
    },
    { label: "liquidity:healthy-fiat", input: healthyFiatLiquidityObservation() },
    { label: "liquidity:lineage-extended", input: lineageExtendedLiquidityObservation() },
    { label: "liquidity:adversarial-stale", input: staleQuoteObservation() },
    { label: "liquidity:adversarial-honeypot", input: honeypotObservation() },
    { label: "liquidity:adversarial-blocked-exit", input: blockedExitObservation() },
    { label: "liquidity:adversarial-own-vanished", input: vanishedOwnLiquidityObservation() },
    // lending: 3 healthy + manipulated = 4
    { label: "lending:healthy-1", input: healthyLendingObservation() },
    {
      label: "lending:healthy-2",
      input: healthyLendingObservation({
        observationId: "obs:len:002",
        venueId: "venue:lending-market-b",
      }),
    },
    {
      label: "lending:healthy-3",
      input: healthyLendingObservation({
        observationId: "obs:len:003",
        venueId: "venue:isolated-market",
      }),
    },
    { label: "lending:adversarial-manipulated-apy", input: manipulatedApyObservation() },
    // staking: 3 healthy + stale = 4
    { label: "staking:healthy-1", input: healthyStakingObservation() },
    {
      label: "staking:healthy-2",
      input: healthyStakingObservation({
        observationId: "obs:stk:002",
        venueId: "venue:liquid-staking",
      }),
    },
    {
      label: "staking:healthy-3",
      input: healthyStakingObservation({
        observationId: "obs:stk:003",
        venueId: "venue:validator-pool",
      }),
    },
    { label: "staking:adversarial-stale", input: staleStakingObservation() },
    // incentives: 2 healthy + fake + unreserved = 4
    { label: "incentives:healthy-1", input: healthyIncentivesObservation() },
    {
      label: "incentives:healthy-2",
      input: healthyIncentivesObservation({
        observationId: "obs:inc:002",
        venueId: "venue:airdrop-program",
      }),
    },
    { label: "incentives:adversarial-fake", input: fakeIncentiveObservation() },
    { label: "incentives:adversarial-unreserved", input: unreservedBudgetObservation() },
    // arbitrage: 2 healthy (onchain + fx) + vanished = 3
    { label: "arbitrage:healthy-1", input: healthyArbitrageObservation() },
    {
      label: "arbitrage:healthy-2",
      input: healthyArbitrageObservation({
        observationId: "obs:arb:002",
        legAVenue: "venue:quote-c",
        legBVenue: "venue:quote-d",
      }),
    },
    { label: "arbitrage:healthy-fx", input: healthyFxArbitrageObservation() },
    { label: "arbitrage:adversarial-vanished-liquidity", input: vanishedLiquidityObservation() },
    // other: 2 healthy + unapproved = 3
    { label: "other:healthy-1", input: healthyOtherObservation() },
    { label: "other:healthy-2", input: healthyOtherObservation({ observationId: "obs:oth:002" }) },
    { label: "other:adversarial-unapproved", input: unapprovedOtherObservation() },
  ];
}

/** The adversarial entries of the catalog, by label. */
export function adversarialEntries(): readonly CatalogEntry[] {
  return discoveryCatalog().filter((entry) => entry.label.includes("adversarial"));
}

/** One healthy entry per family (the six-family smoke set). */
export function healthyEntries(): readonly CatalogEntry[] {
  return discoveryCatalog().filter((entry) => entry.label.includes("healthy-1"));
}

/** The arbitrage legs of the healthy fixture (evidence-chain assertions). */
export function healthyArbitrageLegs(): readonly ArbitrageLeg[] {
  return healthyArbitrageObservation().arbitrageLegs ?? [];
}
