/**
 * Shared deterministic fixtures for the @payswap/opportunities test suite
 * (Work Order P6-W2, lane r4-w2; ADAPTED from payswap.org@8a735bf
 * packages/onchain-opportunities/test/fixtures.ts — every identifier,
 * timestamp, amount and rate is a fixed constant; venue/protocol names
 * are obviously synthetic; the catalog spans RAILS (onchain, fiat, fx)
 * and carries VERSIONED observations).
 *
 * The catalog deliberately spans:
 * - HEALTHY opportunities in all six families across all three rail
 *   kinds — each surfacing every mandated first-class field with honest
 *   estimates;
 * - the old task packet's ADVERSARIAL fixtures: a stale quote, a
 *   manipulated APY, a fake incentive, an unreserved budget, vanished
 *   liquidity, a honeypot exit path and an unapproved "other" strategy —
 *   each must surface as ineligible/UNKNOWN/blocked, never as
 *   attractive;
 * - versioned-lineage fixtures: opportunities carrying additional
 *   versioned supporting observations (incl. a stale SUPPORTING
 *   observation whose primary is fresh).
 */

import type { OpportunityObservationInput } from "../src/index.ts";
import type {
  ArbitrageLeg,
  ReturnComponent,
  SupportingObservation,
} from "../src/index.ts";

// ---------------------------------------------------------------------------
// Deterministic constants
// ---------------------------------------------------------------------------

export const ONCHAIN_RAIL = "ethereum:mainnet" as const;
export const FIAT_RAIL = "fiat:sepa" as const;
export const FX_RAIL = "fx:eur-usd" as const;
export const NOW_ISO = "2026-10-04T00:00:00Z" as const;
export const NOW = Date.parse(NOW_ISO);
export const MAX_AGE_MS = 30_000;

/** Fresh evidence at the evaluation instant (age 0). */
export function freshEvidence(): { readonly asOfMs: number; readonly maxAgeMs: number } {
  return { asOfMs: NOW, maxAgeMs: MAX_AGE_MS };
}

/** Evidence exactly `ageMs` old at the evaluation instant. */
export function evidenceAged(ageMs: number): { readonly asOfMs: number; readonly maxAgeMs: number } {
  return { asOfMs: NOW - ageMs, maxAgeMs: MAX_AGE_MS };
}

// ---------------------------------------------------------------------------
// Shared surfaces (honest language only — the vocabulary law is tested
// separately with adversarial smuggled text)
// ---------------------------------------------------------------------------

export function healthyExitPath(): {
  readonly status: "AVAILABLE";
  readonly description: string;
  readonly constraints: readonly string[];
} {
  return {
    status: "AVAILABLE",
    description:
      "exit observed in one transaction through the venue router; withdrawal liquidity was observed at the evidence instant",
    constraints: ["exit size may be constrained by observed withdrawal liquidity"],
  };
}

export function noLockUp(): {
  readonly locked: boolean;
  readonly durationMs: number | null;
  readonly unlockConditions: readonly string[];
} {
  return { locked: false, durationMs: null, unlockConditions: [] };
}

export function lockedFor(durationMs: number): {
  readonly locked: boolean;
  readonly durationMs: number | null;
  readonly unlockConditions: readonly string[];
} {
  return {
    locked: true,
    durationMs,
    unlockConditions: ["the lock releases after the observed unbonding period"],
  };
}

export function auditedLowRisk(summary: string): {
  readonly level: "LOW";
  readonly audited: boolean | null;
  readonly summary: string;
} {
  return { level: "LOW", audited: true, summary };
}

export function unknownOracleRisk(): {
  readonly level: "UNKNOWN";
  readonly audited: null;
  readonly summary: string;
} {
  return {
    level: "UNKNOWN",
    audited: null,
    summary: "oracle and bridge dependencies were not determinable from the observation",
  };
}

export function capitalOn(
  railKey: string,
  minorUnits: string,
): { readonly assetRef: string; readonly minorUnits: string } {
  return { assetRef: `${railKey}/asset:USCD`, minorUnits };
}

export function standardFees(): {
  readonly entryFeeFraction: { readonly numerator: string; readonly denominator: string };
  readonly exitFeeFraction: { readonly numerator: string; readonly denominator: string };
  readonly ongoingFeeFractionPerYear: { readonly numerator: string; readonly denominator: string };
} {
  return {
    entryFeeFraction: { numerator: "0", denominator: "1" },
    exitFeeFraction: { numerator: "3", denominator: "1000" },
    ongoingFeeFractionPerYear: { numerator: "1", denominator: "10000" },
  };
}

export function component(
  componentId: string,
  kind: ReturnComponent["kind"],
  numerator: string,
  denominator: string,
  extras?: { readonly evidenceVerified?: boolean; readonly budgetReserved?: boolean },
): ReturnComponent {
  return {
    componentId,
    kind,
    ratePerYear: { numerator, denominator },
    evidenceVerified: extras?.evidenceVerified ?? true,
    ...(extras?.budgetReserved !== undefined ? { budgetReserved: extras.budgetReserved } : {}),
    description: `observed ${kind.replace("_", " ").toLowerCase()} component, annualized from venue observations`,
  };
}

// ---------------------------------------------------------------------------
// Healthy family observations (across rails)
// ---------------------------------------------------------------------------

export function healthyLiquidityObservation(input?: {
  readonly observationId?: string;
  readonly venueId?: string;
  readonly maxLossKnown?: boolean;
  readonly freshnessAgeMs?: number;
  readonly additionalSupportingObservations?: readonly SupportingObservation[];
}): OpportunityObservationInput {
  return {
    family: "liquidity",
    observationId: input?.observationId ?? "obs:liq:001",
    observationVersion: 3,
    venueId: input?.venueId ?? "venue:stable-pair",
    protocolKey: "protocol:amm-v2",
    railKind: "ONCHAIN",
    railKey: ONCHAIN_RAIL,
    adapterId: "adapter:onchain:evm",
    observerId: "observer:indexer:001",
    freshness: input?.freshnessAgeMs !== undefined ? evidenceAged(input.freshnessAgeMs) : freshEvidence(),
    evidenceRefs: ["evidence:pool-state:001", "evidence:fee-tier:001"],
    ...(input?.additionalSupportingObservations !== undefined
      ? { additionalSupportingObservations: input.additionalSupportingObservations }
      : {}),
    title: "StablePair USCD/WSC liquidity provisioning",
    description:
      "observed liquidity provisioning opportunity in a stable pair pool; the estimate is derived from observed fee yields with uncertainty bounds",
    capitalRequired: capitalOn(ONCHAIN_RAIL, "1000000000"),
    fees: standardFees(),
    liquidity: { depthMinorUnits: "500000000000", withdrawalLiquidityMinorUnits: "480000000000" },
    exitPath: healthyExitPath(),
    lockUp: noLockUp(),
    smartContractRisk: auditedLowRisk(
      "independent audit observed; source and bytecode hashes recorded in the evidence chain",
    ),
    oracleBridgeRisk: unknownOracleRisk(),
    ...(input?.maxLossKnown === false
      ? {}
      : { maxLoss: { fractionOfCapital: { numerator: "5", denominator: "100" } } }),
    returnComponents: [component("liq:fee-yield", "FEE_YIELD", "431", "10000")],
  };
}

export function healthyLendingObservation(input?: {
  readonly observationId?: string;
  readonly venueId?: string;
}): OpportunityObservationInput {
  return {
    family: "lending",
    observationId: input?.observationId ?? "obs:len:001",
    observationVersion: 2,
    venueId: input?.venueId ?? "venue:lending-market",
    protocolKey: "protocol:lending-v3",
    railKind: "ONCHAIN",
    railKey: ONCHAIN_RAIL,
    adapterId: "adapter:onchain:evm",
    observerId: "observer:indexer:002",
    freshness: freshEvidence(),
    evidenceRefs: ["evidence:reserve-state:001", "evidence:supply-rate:001"],
    title: "USCD supply position",
    description:
      "observed supply-side lending position; the estimate is derived from the observed supply rate with uncertainty bounds",
    capitalRequired: capitalOn(ONCHAIN_RAIL, "2500000000"),
    fees: standardFees(),
    liquidity: { depthMinorUnits: "9000000000000", withdrawalLiquidityMinorUnits: "1200000000000" },
    exitPath: healthyExitPath(),
    lockUp: noLockUp(),
    smartContractRisk: auditedLowRisk(
      "independent audit observed; proxy admin authority recorded in the evidence chain",
    ),
    oracleBridgeRisk: {
      level: "MODERATE",
      audited: false,
      summary: "the market references an oracle for utilization accounting",
    },
    returnComponents: [component("len:supply-apy", "SUPPLY_APY", "350", "10000")],
  };
}

export function healthyStakingObservation(input?: {
  readonly observationId?: string;
  readonly venueId?: string;
}): OpportunityObservationInput {
  return {
    family: "staking",
    observationId: input?.observationId ?? "obs:stk:001",
    observationVersion: 5,
    venueId: input?.venueId ?? "venue:staking-module",
    protocolKey: "protocol:staking",
    railKind: "ONCHAIN",
    railKey: ONCHAIN_RAIL,
    adapterId: "adapter:onchain:evm",
    observerId: "observer:indexer:003",
    freshness: freshEvidence(),
    evidenceRefs: ["evidence:validator-set:001", "evidence:staking-rate:001"],
    title: "native staking position with unbonding period",
    description:
      "observed staking position; the estimate is derived from the observed staking rate with uncertainty bounds and the unbonding lock is disclosed",
    capitalRequired: capitalOn(ONCHAIN_RAIL, "5000000000"),
    fees: standardFees(),
    liquidity: { depthMinorUnits: null, withdrawalLiquidityMinorUnits: null },
    exitPath: {
      status: "RESTRICTED",
      description:
        "exit requires an unbonding transaction and completes after the observed unbonding period",
      constraints: [
        "unbonding period observed at 14 days",
        "slashing exposure is disclosed in the risk summaries",
      ],
    },
    lockUp: lockedFor(1_209_600_000),
    smartContractRisk: auditedLowRisk("staking module audit observed in the evidence chain"),
    oracleBridgeRisk: unknownOracleRisk(),
    returnComponents: [component("stk:staking-yield", "STAKING_YIELD", "380", "10000")],
  };
}

export function healthyIncentivesObservation(input?: {
  readonly observationId?: string;
  readonly venueId?: string;
  readonly budgetReserved?: boolean;
}): OpportunityObservationInput {
  return {
    family: "incentives",
    observationId: input?.observationId ?? "obs:inc:001",
    observationVersion: 1,
    venueId: input?.venueId ?? "venue:rewards-program",
    protocolKey: "protocol:incentives",
    railKind: "ONCHAIN",
    railKey: ONCHAIN_RAIL,
    adapterId: "adapter:onchain:evm",
    observerId: "observer:indexer:004",
    freshness: freshEvidence(),
    evidenceRefs: ["evidence:program-terms:001", "evidence:reserved-budget:001"],
    title: "venue rebate program participation",
    description:
      "observed rebate program; the estimate is derived from the observed reward rate and the program budget is reserved onchain",
    capitalRequired: capitalOn(ONCHAIN_RAIL, "1000000000"),
    fees: standardFees(),
    liquidity: { depthMinorUnits: "75000000000", withdrawalLiquidityMinorUnits: "75000000000" },
    exitPath: healthyExitPath(),
    lockUp: noLockUp(),
    smartContractRisk: auditedLowRisk("rewards contract audit observed in the evidence chain"),
    oracleBridgeRisk: unknownOracleRisk(),
    returnComponents: [
      component("inc:rebate", "INCENTIVE_YIELD", "120", "10000", {
        budgetReserved: input?.budgetReserved ?? true,
      }),
    ],
  };
}

export function healthyArbitrageObservation(input?: {
  readonly observationId?: string;
  readonly legAVenue?: string;
  readonly legBVenue?: string;
  readonly legBWithdrawalLiquidity?: string;
}): OpportunityObservationInput {
  return {
    family: "arbitrage",
    observationId: input?.observationId ?? "obs:arb:001",
    observationVersion: 7,
    venueId: "venue:arb-survey",
    railKind: "ONCHAIN",
    railKey: ONCHAIN_RAIL,
    adapterId: "adapter:onchain:evm",
    observerId: "observer:indexer:005",
    freshness: freshEvidence(),
    evidenceRefs: ["evidence:venue-a-quote:001", "evidence:venue-b-quote:001"],
    title: "USCD price difference between two venues",
    description:
      "observed price difference between two venue quotes; the estimate is the exact observed spread with a lower bound net of observed execution costs",
    capitalRequired: capitalOn(ONCHAIN_RAIL, "100000000"),
    fees: standardFees(),
    liquidity: { depthMinorUnits: "30000000000", withdrawalLiquidityMinorUnits: "25000000000" },
    exitPath: healthyExitPath(),
    lockUp: noLockUp(),
    smartContractRisk: auditedLowRisk("both venue routers audited; digests in the evidence chain"),
    oracleBridgeRisk: unknownOracleRisk(),
    arbitrageLegs: [
      {
        legId: "leg:venue-a",
        venueId: input?.legAVenue ?? "venue:quote-a",
        price: { numerator: "1005", denominator: "1000" },
        freshness: freshEvidence(),
        withdrawalLiquidityMinorUnits: "15000000000",
      },
      {
        legId: "leg:venue-b",
        venueId: input?.legBVenue ?? "venue:quote-b",
        price: { numerator: "1020", denominator: "1000" },
        freshness: freshEvidence(),
        withdrawalLiquidityMinorUnits: input?.legBWithdrawalLiquidity ?? "12000000000",
      },
    ],
    executionCostFraction: { numerator: "5", denominator: "10000" },
  };
}

export function healthyOtherObservation(input?: {
  readonly observationId?: string;
  readonly withApproval?: boolean;
}): OpportunityObservationInput {
  return {
    family: "other",
    observationId: input?.observationId ?? "obs:oth:001",
    observationVersion: 4,
    venueId: "venue:policy-strategy",
    protocolKey: "protocol:rebalance",
    railKind: "ONCHAIN",
    railKey: ONCHAIN_RAIL,
    adapterId: "adapter:onchain:evm",
    observerId: "observer:indexer:006",
    freshness: freshEvidence(),
    evidenceRefs: ["evidence:strategy-terms:001", "evidence:policy-approval:001"],
    title: "policy-approved rebalancing strategy participation",
    description:
      "observed policy-approved strategy; the estimate is derived from observed component rates with uncertainty bounds and carries an explicit approval reference",
    capitalRequired: capitalOn(ONCHAIN_RAIL, "2000000000"),
    fees: standardFees(),
    liquidity: { depthMinorUnits: "40000000000", withdrawalLiquidityMinorUnits: "35000000000" },
    exitPath: healthyExitPath(),
    lockUp: noLockUp(),
    smartContractRisk: auditedLowRisk("strategy contract audit observed in the evidence chain"),
    oracleBridgeRisk: unknownOracleRisk(),
    returnComponents: [component("oth:strategy-yield", "FEE_YIELD", "210", "10000")],
    ...(input?.withApproval === false
      ? {}
      : { policyApprovalRef: "policy-approval:strategy:rebalance-001" }),
  };
}
