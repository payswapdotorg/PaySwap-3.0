/**
 * @payswap/opportunities — evidence-backed discovery (P6-W2, lane r4-w2;
 * ADAPTED from payswap.org@8a735bf
 * packages/onchain-opportunities/src/discovery.ts: the input carries the
 * VERSIONED primary observation + supporting lineage; the rail scope
 * replaces chainKey; input validation in ./discovery-input.ts, the
 * estimation laws in ./estimation.ts — the file law).
 *
 * `discoverOpportunity` is the ONE constructor: DETERMINISTIC (caller-
 * supplied instants, exact amounts, no ambient clock/randomness/floats);
 * EVIDENCE-GROUNDED (versioned provenance, NON-EMPTY evidence chain,
 * bounded freshness — NO constructor path without evidence); HONEST
 * (./estimation.ts); STRUCTURALLY NEVER AUTHORIZATION (the tier brand +
 * the full model validator as the construction gate).
 */

import { OpportunityDiscoveryError } from "./errors.ts";
import { validateEvidenceFreshness } from "./freshness.ts";
import { validateExactRational } from "./rational.ts";
import type { ExactRational } from "./rational.ts";
import { DISCOVERY_TIER } from "./discovery-tier.ts";
import { evaluateDiscoveryPolicy } from "./eligibility.ts";
import {
  deriveArbitrageComponents,
  estimateExpectedReturn,
} from "./estimation.ts";
import { isOpportunityFamily, opportunityId } from "./model.ts";
import { validateFinancialOpportunity } from "./model-validation.ts";
import { validateDiscoveryInput } from "./discovery-input.ts";
import type { EvidenceFreshness } from "./freshness.ts";
import type {
  ArbitrageLeg,
  CapitalRequirement,
  ExitPathAssessment,
  FeeSchedule,
  FinancialOpportunity,
  LiquidityProfile,
  LockUp,
  MaxLossBound,
  OpportunityFamily,
  RailKind,
  RailScope,
  ReturnComponent,
  RiskRating,
  SupportingObservation,
} from "./model.ts";
import { PINNED_INTENT_ARCHETYPES } from "./pins/economic.ts";

// ---------------------------------------------------------------------------
// The observation input (what an adapter-sourced evidence feed supplies)
// ---------------------------------------------------------------------------

/**
 * One observed opportunity with its VERSIONED evidence. Per family:
 * `arbitrage` requires exactly two legs (derives the price difference);
 * `other` requires a policyApprovalRef for eligibility (an unapproved
 * strategy is still discovered — surfaced ineligible, never hidden);
 * `returnComponents` supply the non-arbitrage estimation inputs;
 * `additionalSupportingObservations` extend the lineage (the primary is
 * always element zero of the record's lineage).
 */
export interface OpportunityObservationInput {
  readonly family: OpportunityFamily;
  readonly observationId: string;
  /** The primary observation's VERSION (positive integer — evidence is versioned). */
  readonly observationVersion: number;
  readonly venueId: string;
  readonly protocolKey?: string;
  readonly railKind: RailKind;
  /** Canonical rail key: `${namespace}:${network}` (the pinned law). */
  readonly railKey: string;
  readonly adapterId: string;
  readonly observerId: string;
  readonly freshness: EvidenceFreshness;
  readonly evidenceRefs: readonly string[];
  readonly additionalSupportingObservations?: readonly SupportingObservation[];
  readonly title: string;
  readonly description: string;
  readonly capitalRequired?: CapitalRequirement;
  readonly fees?: FeeSchedule;
  readonly liquidity?: LiquidityProfile;
  readonly exitPath: ExitPathAssessment;
  readonly lockUp: LockUp;
  readonly smartContractRisk: RiskRating;
  readonly oracleBridgeRisk: RiskRating;
  readonly maxLoss?: { readonly fractionOfCapital: ExactRational };
  readonly returnComponents?: readonly ReturnComponent[];
  readonly arbitrageLegs?: readonly ArbitrageLeg[];
  /** Observed execution cost fraction (arbitrage lower-bound reduction). */
  readonly executionCostFraction?: ExactRational;
  readonly policyApprovalRef?: string;
  /** Advisory demand lineage ref (the pinned economic-lane archetype). */
  readonly servesIntentArchetype?: (typeof PINNED_INTENT_ARCHETYPES)[number];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// ---------------------------------------------------------------------------
// The discovery constructor
// ---------------------------------------------------------------------------

/**
 * Discovers one financial opportunity: EVERY mandated first-class field
 * (typed, validated, frozen); the FULL versioned evidence chain verbatim;
 * the discovery-time policy evaluation (re-derivable at read time —
 * defense in depth); the DISCOVERY_NEVER_AUTHORIZATION tier. Constructs
 * DATA ONLY — never a step toward execution (./discovery-tier.ts,
 * ./proposal-seam.ts).
 */
export function discoverOpportunity(
  input: OpportunityObservationInput,
  at: number,
): FinancialOpportunity {
  if (!Number.isSafeInteger(at) || at < 0) {
    throw new OpportunityDiscoveryError(
      "the discovery instant `at` must be a non-negative integer (ms; no ambient clock)",
    );
  }
  validateDiscoveryInput(input);

  const components: readonly ReturnComponent[] =
    input.family === "arbitrage"
      ? deriveArbitrageComponents(input.arbitrageLegs ?? [])
      : Object.freeze([...(input.returnComponents ?? [])]);
  const expectedReturn =
    input.family === "arbitrage"
      ? estimateExpectedReturn(components, {
          ...(input.executionCostFraction !== undefined
            ? { executionCostFraction: input.executionCostFraction }
            : {}),
        })
      : estimateExpectedReturn(components);

  const primary: SupportingObservation = Object.freeze({
    observationId: input.observationId,
    version: input.observationVersion,
    venueId: input.venueId,
    ...(input.protocolKey !== undefined
      ? { protocolKey: input.protocolKey }
      : {}),
    adapterId: input.adapterId,
    observerId: input.observerId,
    freshness: input.freshness,
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
  });
  const supportingObservations: readonly SupportingObservation[] =
    Object.freeze([
      primary,
      ...(input.additionalSupportingObservations ?? []).map((observation) =>
        Object.freeze({
          observationId: observation.observationId,
          version: observation.version,
          venueId: observation.venueId,
          ...(observation.protocolKey !== undefined
            ? { protocolKey: observation.protocolKey }
            : {}),
          adapterId: observation.adapterId,
          observerId: observation.observerId,
          freshness: observation.freshness,
          evidenceRefs: Object.freeze([...observation.evidenceRefs]),
        }),
      ),
    ]);

  const rail: RailScope = Object.freeze({
    railKind: input.railKind,
    railKey: input.railKey,
  });

  // The record is built first with a placeholder discovery-policy decision
  // (evaluateDiscoveryPolicy never reads policyEligibility — it re-derives
  // from the typed first-class fields), then the REAL deterministic
  // evaluation at the discovery instant is stamped in.
  const base: FinancialOpportunity = {
    observationKind: "FinancialOpportunity",
    opportunityId: opportunityId(
      input.family,
      input.railKey,
      input.venueId,
      input.observationId,
    ),
    family: input.family,
    rail,
    title: input.title,
    description: input.description,
    capitalRequired:
      input.capitalRequired !== undefined
        ? Object.freeze({ kind: "KNOWN", value: input.capitalRequired })
        : Object.freeze({
            kind: "UNKNOWN",
            reason:
              "the observation did not determine a capital requirement (honest UNKNOWN — never guessed)",
          }),
    expectedReturn,
    liquidity:
      input.liquidity ??
      Object.freeze({
        depthMinorUnits: null,
        withdrawalLiquidityMinorUnits: null,
      }),
    fees:
      input.fees !== undefined
        ? Object.freeze({ kind: "KNOWN", value: input.fees })
        : Object.freeze({
            kind: "UNKNOWN",
            reason:
              "the observation did not determine a fee schedule (honest UNKNOWN — never guessed)",
          }),
    exitPath: input.exitPath,
    lockUp: input.lockUp,
    smartContractRisk: input.smartContractRisk,
    oracleBridgeRisk: input.oracleBridgeRisk,
    maxLossBound:
      input.maxLoss !== undefined
        ? Object.freeze({
            kind: "KNOWN",
            value: Object.freeze({
              fractionOfCapital: input.maxLoss.fractionOfCapital,
            }),
          })
        : Object.freeze({
            kind: "UNKNOWN",
            reason:
              "the evidence does not bound the maximum loss (honest UNKNOWN — a maximum-loss bound is surfaced only where knowable)",
          }),
    evidenceFreshness: input.freshness,
    policyEligibility: Object.freeze({
      eligible: true,
      reasons: Object.freeze([]),
      decidedBy: "discovery-policy",
    }),
    primaryObservation: primary,
    supportingObservations,
    ...(input.servesIntentArchetype !== undefined
      ? { servesIntentArchetype: input.servesIntentArchetype }
      : {}),
    ...(input.arbitrageLegs !== undefined
      ? { arbitrageLegs: Object.freeze([...input.arbitrageLegs]) }
      : {}),
    ...(input.policyApprovalRef !== undefined
      ? { policyApprovalRef: input.policyApprovalRef }
      : {}),
    discoveryTier: DISCOVERY_TIER,
  };

  const policy = evaluateDiscoveryPolicy(base, at);
  const record: FinancialOpportunity = {
    ...base,
    policyEligibility: Object.freeze({
      eligible: policy.eligible,
      reasons: policy.reasons,
      decidedBy: "discovery-policy",
    }),
  };

  // Defense in depth: the FULL model validator is the construction gate.
  return validateFinancialOpportunity(record);
}

// ---------------------------------------------------------------------------
// Validated-shape helpers (the old discovery.ts helper section)
// ---------------------------------------------------------------------------

/** The maximum-loss bound helper (KNOWN where knowable). */
export function knownMaxLoss(fractionOfCapital: ExactRational): MaxLossBound {
  validateExactRational(fractionOfCapital);
  return { kind: "KNOWN", value: { fractionOfCapital } };
}

/** The honest UNKNOWN maximum-loss bound. */
export function unknownMaxLoss(reason: string): MaxLossBound {
  if (!isNonEmptyString(reason)) {
    throw new OpportunityDiscoveryError(
      "an UNKNOWN maximum-loss bound requires a reason",
    );
  }
  return { kind: "UNKNOWN", reason };
}

/** Discovery input provenance helper (validated shape builder). */
export function observationProvenance(input: {
  readonly observationId: string;
  readonly version: number;
  readonly venueId: string;
  readonly adapterId: string;
  readonly observerId: string;
  readonly freshness: EvidenceFreshness;
  readonly evidenceRefs: readonly string[];
  readonly protocolKey?: string;
}): SupportingObservation {
  const errors: string[] = [];
  for (const field of [
    "observationId",
    "venueId",
    "adapterId",
    "observerId",
  ] as const) {
    if (!isNonEmptyString(input[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (
    typeof input.version !== "number" ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1
  ) {
    errors.push("version must be a positive integer (versioned evidence)");
  }
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) {
    errors.push("evidenceRefs must be a non-empty array");
  }
  if (errors.length > 0) {
    throw new OpportunityDiscoveryError(
      `Invalid observation provenance: ${errors.join("; ")}`,
    );
  }
  return Object.freeze({
    observationId: input.observationId,
    version: input.version,
    venueId: input.venueId,
    ...(input.protocolKey !== undefined
      ? { protocolKey: input.protocolKey }
      : {}),
    adapterId: input.adapterId,
    observerId: input.observerId,
    freshness: validateEvidenceFreshness(
      input.freshness,
      "observationProvenance.freshness",
    ),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
  });
}
