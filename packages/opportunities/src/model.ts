/**
 * @payswap/opportunities — the FinancialOpportunity model (P6-W2, lane
 * r4-w2; ADAPTED from payswap.org@8a735bf
 * packages/onchain-opportunities/src/model.ts: chainKey generalized to
 * the rail-aware RailScope; provenance upgraded to the VERSIONED
 * SupportingObservation lineage — hard law 1).
 *
 * Discipline (mirrored from the merged authorities, never redefined):
 * - EXACT MONEY: integer minor-unit strings + ExactRationals — no
 *   floating point anywhere in this package.
 * - VERSIONED, LINEAGE-PRESERVED EVIDENCE: a non-empty chain of
 *   SupportingObservations (positive versions, own freshness, own
 *   provenance, NON-EMPTY evidence refs); the PRIMARY (element zero)
 *   grounds identity + opportunity-level freshness.
 * - RAIL-AWARE: observed ON A RAIL (ONCHAIN chain, FIAT scheme, FX
 *   corridor) under the pinned canonical `${namespace}:${network}` law.
 * - KNOWABLE VALUES: UNKNOWN is honest disclosure, never failure.
 * - NO-GUARANTEE LANGUAGE: every human-readable surface is scanned
 *   (./vocabulary.ts).
 * - NEVER AUTHORIZATION: the structural discovery tier brand; no
 *   execution-shaped field anywhere in this model.
 */

import type { EvidenceFreshness } from "./freshness.ts";
import type { ExactRational } from "./rational.ts";
import type { Knowable } from "./knowable.ts";
import type { PinnedIntentArchetype } from "./pins/economic.ts";
import { DISCOVERY_TIER } from "./discovery-tier.ts";

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

/** The six policy-approved opportunity families (frozen vocabulary). */
export const OPPORTUNITY_FAMILIES = [
  "liquidity",
  "lending",
  "staking",
  "incentives",
  "arbitrage",
  "other",
] as const;

export type OpportunityFamily = (typeof OPPORTUNITY_FAMILIES)[number];

export function isOpportunityFamily(value: unknown): value is OpportunityFamily {
  return typeof value === "string" && (OPPORTUNITY_FAMILIES as readonly unknown[]).includes(value);
}

// ---------------------------------------------------------------------------
// Rails (the P6-W2 across-rails generalization of the old chainKey law)
// ---------------------------------------------------------------------------

/** The rail kinds an opportunity may be observed on (frozen vocabulary). */
export const RAIL_KINDS = ["ONCHAIN", "FIAT", "FX"] as const;

export type RailKind = (typeof RAIL_KINDS)[number];

export function isRailKind(value: unknown): value is RailKind {
  return typeof value === "string" && (RAIL_KINDS as readonly unknown[]).includes(value);
}

/**
 * The rail an opportunity was observed on. The rail key is the pinned
 * canonical `${namespace}:${network}` law (onchain: ethereum:mainnet;
 * fiat: fiat:sepa; fx: fx:eur-usd); an ONCHAIN-kind rail key must be a
 * canonical chain key in the onchain-domain vocabulary (test-enforced).
 */
export interface RailScope {
  readonly railKind: RailKind;
  /** Canonical rail key: `${namespace}:${network}` (the pinned law). */
  readonly railKey: string;
}

// ---------------------------------------------------------------------------
// Versioned supporting observations (the evidence lineage — hard law 1)
// ---------------------------------------------------------------------------

/**
 * One versioned supporting observation in the evidence lineage: WHO
 * observed (venue/protocol/adapter/observer), WHEN with what bound
 * (freshness), WHAT evidence backs it (non-empty refs), at WHICH VERSION
 * (positive integer — the pinned capability-lane monotonic-version
 * discipline: higher versions supersede lower ones deterministically).
 */
export interface SupportingObservation {
  readonly observationId: string;
  /** Monotonic observation version (positive integer). */
  readonly version: number;
  readonly venueId: string;
  readonly protocolKey?: string;
  readonly adapterId: string;
  readonly observerId: string;
  readonly freshness: EvidenceFreshness;
  /** Evidence node references (non-empty — an observation without linked evidence is not evidence). */
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// First-class field types
// ---------------------------------------------------------------------------

/**
 * Exact capital requirement: the canonical rail asset ref + integer minor
 * units. The asset ref is the pinned canonical `${railKey}/asset:SYMBOL`
 * identity (the onchain-domain asset-ref law, generalized to rails).
 */
export interface CapitalRequirement {
  /** Canonical asset identity: `${railKey}/asset:${SYMBOL}`. */
  readonly assetRef: string;
  /** Exact integer minor units (canonical decimal string). */
  readonly minorUnits: string;
}

/** Observed liquidity profile (null fields are UNKNOWN, surfaced honestly). */
export interface LiquidityProfile {
  /** Total observed pool/venue depth in minor units, when observed. */
  readonly depthMinorUnits: string | null;
  /** Liquidity actually available to EXIT the position, when observed. */
  readonly withdrawalLiquidityMinorUnits: string | null;
}


/** Fee schedule as exact fractions of the position (never floating point). */
export interface FeeSchedule {
  readonly entryFeeFraction: ExactRational;
  readonly exitFeeFraction: ExactRational;
  readonly ongoingFeeFractionPerYear: ExactRational;
}

export const EXIT_PATH_STATUSES = [
  "AVAILABLE",
  "RESTRICTED",
  "UNKNOWN",
  "BLOCKED",
  "SUSPECT_HONEYPOT",
] as const;

export type ExitPathStatus = (typeof EXIT_PATH_STATUSES)[number];

export function isExitPathStatus(value: unknown): value is ExitPathStatus {
  return typeof value === "string" && (EXIT_PATH_STATUSES as readonly unknown[]).includes(value);
}

/**
 * The exit path assessment: how capital LEAVES. A deposit that cannot be
 * honestly withdrawn (BLOCKED) or only LOOKS withdrawable
 * (SUSPECT_HONEYPOT) is surfaced as such — never as attractive.
 */
export interface ExitPathAssessment {
  readonly status: ExitPathStatus;
  /** Human-readable, vocabulary-scanned description of the exit route. */
  readonly description: string;
  /** Machine-readable constraints on the exit (delays, conditions, caps). */
  readonly constraints: readonly string[];
}

/** Lock-up: whether capital is committed and for how long. */
export interface LockUp {
  readonly locked: boolean;
  /** Lock duration in ms when locked and knowable; null when unknown. */
  readonly durationMs: number | null;
  /** Conditions under which the lock releases (may be empty). */
  readonly unlockConditions: readonly string[];
}

export const RISK_LEVELS = ["LOW", "MODERATE", "HIGH", "UNKNOWN"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === "string" && (RISK_LEVELS as readonly unknown[]).includes(value);
}

/** A risk rating: level, audit status (null = not knowable) and summary. */
export interface RiskRating {
  readonly level: RiskLevel;
  /** Whether an audit is known to exist; null when not knowable. */
  readonly audited: boolean | null;
  /** Human-readable, vocabulary-scanned risk summary. */
  readonly summary: string;
}

/**
 * The maximum-loss bound WHERE KNOWABLE: KNOWN only when the evidence
 * bounds the loss; UNKNOWN otherwise — never a fabricated comfort number.
 */
export type MaxLossBound = Knowable<{
  readonly fractionOfCapital: ExactRational;
}>;

// ---------------------------------------------------------------------------
// The expected-return ESTIMATE (never a claim)
// ---------------------------------------------------------------------------

export const RETURN_COMPONENT_KINDS = [
  "FEE_YIELD",
  "INCENTIVE_YIELD",
  "STAKING_YIELD",
  "SUPPLY_APY",
  "PRICE_DIFFERENCE",
] as const;

export type ReturnComponentKind = (typeof RETURN_COMPONENT_KINDS)[number];

export function isReturnComponentKind(value: unknown): value is ReturnComponentKind {
  return typeof value === "string" && (RETURN_COMPONENT_KINDS as readonly unknown[]).includes(value);
}

/**
 * One evidence-backed return component: an exact ANNUALIZED rate.
 * `budgetReserved` applies to incentive components (the old AGENTS.md
 * rule 13: incentive budgets are reserved before a program can promise
 * funded rewards — an unreserved promise is not verified).
 */
export interface ReturnComponent {
  readonly componentId: string;
  readonly kind: ReturnComponentKind;
  readonly ratePerYear: ExactRational;
  readonly evidenceVerified: boolean;
  /** Incentive components only: whether the reward budget is reserved. */
  readonly budgetReserved?: boolean;
  /** Human-readable, vocabulary-scanned component description. */
  readonly description: string;
}

/**
 * The expected-return estimate — an ESTIMATE with EXPLICIT uncertainty
 * bounds, never a claim: `point` = sum of ALL observed components;
 * `bounds.low` = sum of VERIFIED components only; `bounds.high` = the
 * point; when NO component is verified, point and bounds are null
 * (honestly UNKNOWN rather than an unverified number).
 */
export interface ExpectedReturnEstimate {
  readonly estimateKind: "EVIDENCE_BACKED_ESTIMATE";
  readonly point: ExactRational | null;
  readonly bounds:
    | { readonly low: ExactRational; readonly high: ExactRational }
    | null;
  /** The observed components the estimate was derived from (verbatim). */
  readonly components: readonly ReturnComponent[];
  /** Human-readable, vocabulary-scanned derivation basis. */
  readonly basis: string;
}

// ---------------------------------------------------------------------------
// Provenance + policy
// ---------------------------------------------------------------------------

/**
 * The primary supporting observation (element zero of the lineage),
 * re-typed for consumer convenience; the validator enforces identity AND
 * version coherence with `supportingObservations[0]`.
 */
export type OpportunityProvenance = SupportingObservation;

/** Deterministic discovery-policy eligibility (re-derivable, never declared). */
export interface PolicyEligibility {
  readonly eligible: boolean;
  /** Machine-readable ineligibility reasons (empty when eligible). */
  readonly reasons: readonly string[];
  readonly decidedBy: "discovery-policy";
}

/** One venue price observation leg of an arbitrage opportunity. */
export interface ArbitrageLeg {
  readonly legId: string;
  readonly venueId: string;
  /** Exact price of one whole unit of the reference asset, in numeraire. */
  readonly price: ExactRational;
  readonly freshness: EvidenceFreshness;
  /** Exit liquidity on this leg's venue, when observed (null = UNKNOWN). */
  readonly withdrawalLiquidityMinorUnits: string | null;
}

// ---------------------------------------------------------------------------
// The FinancialOpportunity
// ---------------------------------------------------------------------------

/** Nominal brand: this value is an opportunity observation, never authority. */
export const OPPORTUNITY_KIND = "FinancialOpportunity" as const;

/**
 * A discovered financial opportunity (pure frozen data): every
 * human-readable surface is vocabulary-scanned and the structural
 * discovery tier brands the record NEVER authorization. There is
 * deliberately no method, no closure and no execution-shaped field on
 * this type.
 */
export interface FinancialOpportunity {
  readonly observationKind: typeof OPPORTUNITY_KIND;
  /**
   * Deterministic identity:
   * `opportunity:${family}:${railKey}:${venueId}:${observationId}`.
   */
  readonly opportunityId: string;
  readonly family: OpportunityFamily;
  /** The rail the opportunity was observed on (canonical rail key). */
  readonly rail: RailScope;
  readonly title: string;
  readonly description: string;

  // -- the mandated first-class fields -------------------------------------
  readonly capitalRequired: Knowable<CapitalRequirement>;
  readonly expectedReturn: ExpectedReturnEstimate;
  readonly liquidity: LiquidityProfile;
  readonly fees: Knowable<FeeSchedule>;
  readonly exitPath: ExitPathAssessment;
  readonly lockUp: LockUp;
  readonly smartContractRisk: RiskRating;
  readonly oracleBridgeRisk: RiskRating;
  readonly maxLossBound: MaxLossBound;
  readonly evidenceFreshness: EvidenceFreshness;
  readonly policyEligibility: PolicyEligibility;

  // -- the versioned evidence lineage (the observation law) -----------------
  /** The primary supporting observation (grounds identity + freshness). */
  readonly primaryObservation: OpportunityProvenance;
  /**
   * The FULL versioned supporting-observation chain, verbatim: element
   * zero IS the primary; NON-EMPTY always (no evidence-free opportunity).
   */
  readonly supportingObservations: readonly SupportingObservation[];

  // -- advisory demand lineage (the pinned economic-lane ref) ---------------
  /**
   * The intent archetype this opportunity is evidence FOR (an ADVISORY
   * lineage ref to the economic lane's demand model — never authority).
   */
  readonly servesIntentArchetype?: PinnedIntentArchetype;

  // -- family-scoped evidence preservation -----------------------------------
  /** Arbitrage legs (family evidence), preserved verbatim when present. */
  readonly arbitrageLegs?: readonly ArbitrageLeg[];
  /** Policy approval reference (family "other" eligibility evidence). */
  readonly policyApprovalRef?: string;

  // -- the structural never-authorization tier --------------------------------
  readonly discoveryTier: typeof DISCOVERY_TIER;
}

/** Deterministic opportunity identity. */
export function opportunityId(
  family: OpportunityFamily,
  railKey: string,
  venueId: string,
  observationId: string,
): string {
  return `opportunity:${family}:${railKey}:${venueId}:${observationId}`;
}

