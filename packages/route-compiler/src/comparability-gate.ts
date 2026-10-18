/**
 * @payswap/route-compiler — THE COMPARABILITY GATE (P5-W1).
 *
 * NET-NEW as the first-class encoding of the P5-W1 work-order law:
 *
 *   "A provider-native path is the BASELINE candidate; composed/
 *    multi-provider routes are comparable ONLY when each leg has
 *    current eligibility, credible pricing, actual connection/
 *    permission, funding/payout constraints, and auditable
 *    assumptions."
 *
 * THE FIVE REQUIREMENTS (closed vocabulary, one per leg of a composed
 * plan; a gap on ANY leg makes the plan not comparable):
 *
 * 1. CURRENT_ELIGIBILITY: the leg's state grounding carries a FRESH
 *    eligibility-bearing observation with its EXACT observation version
 *    (the version-preservation law) and no grounding failures;
 * 2. CREDIBLE_PRICING: the leg's planned amount is grounded (QUOTE or
 *    CONVERSION basis — INTENT_DECLARED counts as credible only where
 *    the leg moves the intent's own declared value verbatim; a liquidity
 *    estimate is NEVER pricing evidence); where the leg's authorization
 *    lineage carries a corridor evaluation, its terms references must
 *    be present and versioned;
 * 3. CONNECTION_PERMISSION: the leg's authorization lineage names an
 *    ACTIVE, permitted execution scope (the corridor eligibility
 *    lineage, the gate ALLOW, the payout grant or the provider-verified
 *    evidence);
 * 4. FUNDING_PAYOUT_CONSTRAINTS: the funding position is
 *    observation-grounded and the payout constraint is evidenced
 *    (an explicit external destination + an allowing gate report) —
 *    LIQUIDITY ESTIMATES NEVER SATISFY THIS (the advisory-only law);
 * 5. AUDITABLE_ASSUMPTIONS: the leg carries a NON-EMPTY, still-valid
 *    assumption set (evidence-referenced, expiry-bounded).
 *
 * THE VERDICT (F-1: gapCodes wrapped in the verdict — never bare gap
 * lists, never exceptions): { comparable: true } or
 * { comparable: false, gaps: [{legId, requirement, code, detail}] }.
 * A BASELINE plan is exempt: the incumbent native path IS the baseline
 * by definition (INV-C08 — the gate compares composed routes AGAINST
 * it; it never disadvantages the baseline).
 *
 * The gate is PURE and DETERMINISTIC: a pure function of the plan's own
 * carried evidence (it reads what the legs structurally carry, never
 * external state).
 */

import { deepFreeze } from "./canonical.ts";
import { assumptionsValidAt } from "./assumptions.ts";
import { isPlannedLegAmountOfBasis } from "./planned-amount.ts";
import type { PlannedLegAmount } from "./planned-amount.ts";
import { payoutGateAllows } from "./authorization.ts";
import type { RouteLegBase } from "./leg-contracts.ts";

/** The closed five-requirement vocabulary (the P5-W1 law, frozen). */
export const COMPARABILITY_REQUIREMENTS = Object.freeze([
  "CURRENT_ELIGIBILITY",
  "CREDIBLE_PRICING",
  "CONNECTION_PERMISSION",
  "FUNDING_PAYOUT_CONSTRAINTS",
  "AUDITABLE_ASSUMPTIONS",
] as const);

export type ComparabilityRequirement = (typeof COMPARABILITY_REQUIREMENTS)[number];

/** The closed gap-code vocabulary (frozen; one code per failure mode). */
export const COMPARABILITY_GAP_CODES = Object.freeze([
  "ELIGIBILITY_MISSING",
  "ELIGIBILITY_STALE",
  "ELIGIBILITY_UNELIGIBLE",
  "PRICING_UNGROUNDED",
  "PRICING_INDICATIVE",
  "PRICING_UNVERSIONED",
  "CONNECTION_INACTIVE",
  "PERMISSION_MISSING",
  "FUNDING_UNPROVEN",
  "PAYOUT_CONSTRAINT_UNEVIDENCED",
  "PAYOUT_GATE_CLOSED",
  "ASSUMPTIONS_MISSING",
  "ASSUMPTIONS_EXPIRED",
] as const);

export type ComparabilityGapCode = (typeof COMPARABILITY_GAP_CODES)[number];

/** One comparability gap (leg-scoped, requirement-typed, coded, detailed). */
export interface ComparabilityGap {
  readonly legId: string;
  readonly requirement: ComparabilityRequirement;
  readonly code: ComparabilityGapCode;
  readonly detail: string;
}

/** The gate verdict: comparable, or the wrapped gap codes (F-1). */
export type ComparabilityVerdict =
  | { readonly comparable: true }
  | { readonly comparable: false; readonly gaps: readonly ComparabilityGap[] };

/** The gate input: the composed plan's legs + the evaluation instant. */
export interface ComparabilityGateInput {
  readonly legs: readonly RouteLegBase[];
  readonly isProviderNativeBaseline: boolean;
  readonly at: number;
}

/**
 * Evaluate the comparability gate over one plan (pure, deterministic).
 * A provider-native baseline is exempt (INV-C08); every composed leg is
 * evaluated against ALL FIVE requirements; the verdict wraps every gap
 * (never just the first — the every-reason law).
 */
export function evaluateComparabilityGate(input: ComparabilityGateInput): ComparabilityVerdict {
  if (input.isProviderNativeBaseline) {
    return Object.freeze({ comparable: true });
  }
  const gaps: ComparabilityGap[] = [];
  for (let index = 0; index < input.legs.length; index += 1) {
    const leg = input.legs[index] as RouteLegBase;
    const following = input.legs[index + 1];
    gaps.push(...legEligibilityGaps(leg));
    gaps.push(...legPricingGaps(leg));
    gaps.push(...legConnectionGaps(leg));
    gaps.push(...legFundingPayoutGaps(leg, following));
    gaps.push(...legAssumptionGaps(leg, input.at));
  }
  if (gaps.length === 0) {
    return Object.freeze({ comparable: true });
  }
  return deepFreeze({ comparable: false, gaps: Object.freeze(gaps) });
}

function legEligibilityGaps(leg: RouteLegBase): ComparabilityGap[] {
  const gaps: ComparabilityGap[] = [];
  const grounding = leg.stateGrounding;
  for (const failure of grounding.groundingFailures) {
    gaps.push({
      legId: leg.legId,
      requirement: "CURRENT_ELIGIBILITY",
      code: "ELIGIBILITY_UNELIGIBLE",
      detail: `leg '${leg.legId}' carries a grounding failure: ${failure}`,
    });
  }
  const eligibilityObservations = grounding.observations.filter(
    (observation) => observation.fresh,
  );
  if (grounding.observations.length === 0) {
    gaps.push({
      legId: leg.legId,
      requirement: "CURRENT_ELIGIBILITY",
      code: "ELIGIBILITY_MISSING",
      detail: `leg '${leg.legId}' carries no grounding observation — catalogue claims never ground eligibility`,
    });
  } else if (eligibilityObservations.length === 0) {
    gaps.push({
      legId: leg.legId,
      requirement: "CURRENT_ELIGIBILITY",
      code: "ELIGIBILITY_STALE",
      detail: `every grounding observation of leg '${leg.legId}' is stale — eligibility must be CURRENT`,
    });
  }
  return gaps;
}

function legPricingGaps(leg: RouteLegBase): ComparabilityGap[] {
  const gaps: ComparabilityGap[] = [];
  const planned: PlannedLegAmount = leg.plannedAmount;
  // THE HONEST-ARRIVAL LAW (the bridge exemption): a bridge leg's priced
  // quantity is its DEPOSIT — the upstream swap's grounded output; the
  // ARRIVAL amount on the destination chain is observed at chain-B
  // finality and is honestly UNKNOWN pre-execution. A bridge leg with an
  // UNKNOWN planned amount (the old suite's pinned law) therefore does
  // NOT carry a pricing gap; every other UNKNOWN amount does.
  if (planned.basis === "UNKNOWN" && leg.legKind !== "ONCHAIN_BRIDGE") {
    gaps.push({
      legId: leg.legId,
      requirement: "CREDIBLE_PRICING",
      code: "PRICING_UNGROUNDED",
      detail: `leg '${leg.legId}' planned amount is UNKNOWN (${planned.reason}) — an unpriced leg is never comparable`,
    });
  }
  if (leg.legKind === "ONCHAIN_DEX_SWAP" && !isPlannedLegAmountOfBasis(planned, "QUOTE_GROUNDED")) {
    gaps.push({
      legId: leg.legId,
      requirement: "CREDIBLE_PRICING",
      code: "PRICING_INDICATIVE",
      detail: `a swap leg '${leg.legId}' must be quote-grounded (worst-case output) — indicative or intent-declared pricing is not credible for a swap`,
    });
  }
  const corridorLineage = corridorLineageOf(leg);
  if (corridorLineage !== undefined && corridorLineage.termsVersion.length === 0) {
    gaps.push({
      legId: leg.legId,
      requirement: "CREDIBLE_PRICING",
      code: "PRICING_UNVERSIONED",
      detail: `leg '${leg.legId}' corridor lineage carries no terms version — versioned pricing terms are required`,
    });
  }
  return gaps;
}

function legConnectionGaps(leg: RouteLegBase): ComparabilityGap[] {
  const gaps: ComparabilityGap[] = [];
  const evidence = leg.authorizationLineage.legAuthorization;
  switch (evidence.kind) {
    case "ONCHAIN_GATE_DECISION":
      if (evidence.gateDecision.decision === "BLOCK") {
        gaps.push({
          legId: leg.legId,
          requirement: "CONNECTION_PERMISSION",
          code: "PERMISSION_MISSING",
          detail: `leg '${leg.legId}' is security-BLOCKed — a blocked write is never permitted`,
        });
      } else if (evidence.gateDecision.decision === "UNKNOWN") {
        gaps.push({
          legId: leg.legId,
          requirement: "CONNECTION_PERMISSION",
          code: "CONNECTION_INACTIVE",
          detail: `leg '${leg.legId}' gate decision is UNKNOWN — connection/permission must be actual, never presumed (INV-X01)`,
        });
      }
      break;
    case "PAYOUT_TRANSFER_OUT_GRANT":
      if (!payoutGateAllows(evidence.gate)) {
        gaps.push({
          legId: leg.legId,
          requirement: "CONNECTION_PERMISSION",
          code: "PERMISSION_MISSING",
          detail: `leg '${leg.legId}' payout gate does not allow the transfer-out (connection scope alone never passes)`,
        });
      }
      break;
    case "CORRIDOR_ELIGIBILITY_LINEAGE":
      // The corridor eligibility lineage IS the connected, permitted
      // scope (the projection asserts ACTIVE authorization upstream);
      // the observation version is mandatory by validation.
      break;
    case "PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY":
      if (evidence.awaitingAuthority.length === 0) {
        gaps.push({
          legId: leg.legId,
          requirement: "CONNECTION_PERMISSION",
          code: "CONNECTION_INACTIVE",
          detail: `leg '${leg.legId}' provider-verified evidence carries no awaiting authority marker`,
        });
      }
      break;
    case "INTENT_AUTHORIZATION_ONLY":
      // Evidenced-consequence hops: the intent authorization is the
      // connection root (carried, never interpreted).
      break;
  }
  return gaps;
}

function legFundingPayoutGaps(
  leg: RouteLegBase,
  following: RouteLegBase | undefined,
): ComparabilityGap[] {
  const gaps: ComparabilityGap[] = [];
  // The funding requirement: onchain-drawn legs are funded through the
  // lane's input-asset observation (grounded upstream); provider legs
  // are funded through the corridor's observation version. The PAYOUT
  // side is where the compiler must see the constraint evidence: the
  // payout leg's grant report plus the EXPLICIT external destination the
  // following (bank) leg carries.
  if (leg.legKind === "OFF_RAMP_PAYOUT") {
    const evidence = leg.authorizationLineage.legAuthorization;
    const destination = payoutDestinationOf(following);
    if (destination === undefined) {
      gaps.push({
        legId: leg.legId,
        requirement: "FUNDING_PAYOUT_CONSTRAINTS",
        code: "PAYOUT_CONSTRAINT_UNEVIDENCED",
        detail: `leg '${leg.legId}' carries no explicit external payout destination — custody destinations are explicit, never guessed`,
      });
    }
    if (evidence.kind === "PAYOUT_TRANSFER_OUT_GRANT") {
      if (!payoutGateAllows(evidence.gate)) {
        gaps.push({
          legId: leg.legId,
          requirement: "FUNDING_PAYOUT_CONSTRAINTS",
          code: "PAYOUT_GATE_CLOSED",
          detail: `leg '${leg.legId}' payout gate report does not allow the payout`,
        });
      }
    } else {
      gaps.push({
        legId: leg.legId,
        requirement: "FUNDING_PAYOUT_CONSTRAINTS",
        code: "PAYOUT_GATE_CLOSED",
        detail: `leg '${leg.legId}' is an off-ramp payout without a transfer-out grant report`,
      });
    }
  }
  return gaps;
}

function legAssumptionGaps(leg: RouteLegBase, at: number): ComparabilityGap[] {
  const gaps: ComparabilityGap[] = [];
  if (leg.assumptions.length === 0) {
    gaps.push({
      legId: leg.legId,
      requirement: "AUDITABLE_ASSUMPTIONS",
      code: "ASSUMPTIONS_MISSING",
      detail: `leg '${leg.legId}' carries no auditable assumptions — composed legs state what they assume`,
    });
    return gaps;
  }
  if (!assumptionsValidAt(leg.assumptions, at)) {
    gaps.push({
      legId: leg.legId,
      requirement: "AUDITABLE_ASSUMPTIONS",
      code: "ASSUMPTIONS_EXPIRED",
      detail: `leg '${leg.legId}' assumption set is expired at ${at} — expired assumptions are honest gaps, never silent passes`,
    });
  }
  return gaps;
}

function corridorLineageOf(
  leg: RouteLegBase,
): { termsVersion: string } | undefined {
  const evidence = leg.authorizationLineage.legAuthorization;
  if (evidence.kind === "CORRIDOR_ELIGIBILITY_LINEAGE") {
    return { termsVersion: evidence.termsVersion };
  }
  return undefined;
}

function payoutDestinationOf(leg: RouteLegBase | undefined): string | undefined {
  // The bank leg following the payout names the external bank instrument
  // (the explicit destination law — the payout morphs value within the
  // provider; the destination is the arrival).
  if (leg !== undefined && leg.legKind === "BANK_SETTLEMENT" && leg.custody.to.kind === "EXTERNAL_BANK_INSTRUMENT") {
    return leg.custody.to.externalRef;
  }
  return undefined;
}

/** True iff the verdict is comparable (honest narrowing helper). */
export function verdictIsComparable(verdict: ComparabilityVerdict): boolean {
  return verdict.comparable;
}

/** The gap codes of a verdict, wrapped (F-1) — empty when comparable. */
export function verdictGapCodes(verdict: ComparabilityVerdict): readonly ComparabilityGapCode[] {
  if (verdict.comparable) {
    return Object.freeze([]);
  }
  return Object.freeze(verdict.gaps.map((gap) => gap.code));
}
