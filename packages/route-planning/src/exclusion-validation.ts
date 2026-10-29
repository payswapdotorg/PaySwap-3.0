/**
 * @payswap/route-planning — the stage-7 general exclusion→repair
 * VALIDATION + construction split (P23-C, lane C; ADR-0015 D3), split from
 * ./exclusion-repair.ts under the 400-line file law (the
 * ./conditional-validation.ts discipline).
 *
 * Fail-closed laws:
 * - the CATALOGUE-ROW validation: an operator id / kind / side condition /
 *   applicable-code list / shadowedBy entry outside the frozen ADR-0015
 *   appendix vocabularies, or a proposal-inconsistent kind, never composes
 *   (unknown vocabulary -> the typed error, never a guess);
 * - the CORRIDOR-STATE projection: the typed side conditions ground in the
 *   snapshots' verbatim facts (the no-route state, the receiving rails,
 *   the provider pairs) — never prose, never re-derived differently from
 *   the P21 path's own predicates;
 * - the CONSTRUCTION builders: the conditional requests are built from the
 *   catalogue's party-change proposals over the SAME P21 evidence chain +
 *   disclosure scope projections, so the general path's requests are
 *   byte-identical to the P21 path's over the P21 corridor; the hypothesis
 *   requests ground the assumed payloads' dimensions in the corridor's
 *   REAL query (never invented).
 */

import { deepFreeze, isNonEmptyString, requireObject } from "./canonical.ts";
import type { EligibleRailSnapshot } from "./rail-snapshot.ts";
import type { HardGateEvaluation } from "./hard-gates.ts";
import {
  PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE,
  PINNED_P21_FLW_WALLET_FUNDING_METHOD,
  PINNED_P21_STRIPE_PROVIDER_NAME,
} from "./pins/opportunities.ts";
import type {
  PinnedDisclosureScope,
  PinnedOfferOptIn,
  PinnedOpportunityRailKind,
  PinnedSupportingObservation,
} from "./pins/opportunities.ts";
import {
  PINNED_NON_OPERATOR_CLASSIFICATIONS,
  PINNED_OPERATOR_APPLICABLE_EXCLUSION_CODES,
  PINNED_P21_FLW_PROVIDER_NAME,
  PINNED_REPAIR_OPERATOR_IDS,
  PINNED_REPAIR_OPERATOR_KINDS,
} from "./pins/repairs.ts";
import type {
  PinnedGroundedFactRef,
  PinnedHypothesisRequest,
  PinnedRepairOperator,
  PinnedRepairSideCondition,
} from "./pins/repairs.ts";
import type { PinnedHypotheticalAugmentation } from "./pins/hypotheses.ts";
import type {
  ConditionalConstructionRequest,
  GroundedExclusionFact,
} from "./conditional-stage.ts";
import { groundingObservationOf } from "./conditional-validation.ts";
import { ExclusionRepairError } from "./exclusion-repair.ts";

/** The corridor state the typed side conditions ground in (never prose). */
export interface CorridorState {
  readonly corridorFundingMethod: string;
  readonly noRoute: boolean;
  readonly stripeReceiving: boolean;
  readonly anyReceiving: boolean;
  readonly crossProviderPair: boolean;
  readonly flwProviderRail: boolean;
}

/** The fact-level P21 pattern: an FLW-wallet funding fact on the receiving side (ADR-0015 D2). */
export function factMatchesP21Pattern(fact: GroundedExclusionFact, state: CorridorState): boolean {
  return (
    fact.side === "RECIPIENT" &&
    fact.code === PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE &&
    fact.fundingMethod === PINNED_P21_FLW_WALLET_FUNDING_METHOD &&
    fact.fundingMethod === state.corridorFundingMethod
  );
}

/** The corridor state projection (the SAME predicates the P21 path derives). */
export function corridorStateOf(
  sender: EligibleRailSnapshot,
  recipient: EligibleRailSnapshot,
  hardGates: HardGateEvaluation,
  corridorFundingMethod: string,
): CorridorState {
  return {
    corridorFundingMethod,
    noRoute:
      sender.rails.length > 0 &&
      recipient.rails.length > 0 &&
      sender.eligibleRouteIds.length === 0 &&
      recipient.eligibleRouteIds.length === 0 &&
      hardGates.rankEligible.length === 0,
    stripeReceiving: recipient.rails.some((rail) => rail.lineage.providerName === PINNED_P21_STRIPE_PROVIDER_NAME),
    anyReceiving: recipient.rails.length > 0,
    crossProviderPair:
      sender.rails.length > 0 &&
      recipient.rails.length > 0 &&
      sender.rails.every((rail) => !recipient.rails.some((other) => other.lineage.providerName === rail.lineage.providerName)),
    flwProviderRail:
      sender.rails.some((rail) => rail.lineage.providerName === PINNED_P21_FLW_PROVIDER_NAME) ||
      recipient.rails.some((rail) => rail.lineage.providerName === PINNED_P21_FLW_PROVIDER_NAME),
  };
}

const SIDE_CONDITION_KINDS: readonly string[] = [
  "P21_FLW_WALLET_FUNDING_PATTERN", "STRIPE_RECEIVING_RAIL", "ANY_RECEIVING_RAIL",
  "NO_ROUTE_STATE", "CROSS_PROVIDER_PAIR", "FLW_PROVIDER_RAIL",
];

/** Fail-closed validation of one catalogue row (unknown vocabulary never composes). */
export function validatedRepairOperator(candidate: unknown): PinnedRepairOperator {
  const record = requireObject(candidate, "a repair-operator catalogue row");
  const operatorId = record["operatorId"];
  if (typeof operatorId !== "string" || !(PINNED_REPAIR_OPERATOR_IDS as readonly string[]).includes(operatorId)) {
    throw new ExclusionRepairError(
      `the catalogue returned operator id '${String(operatorId)}' outside the frozen ADR-0015 A.3 vocabulary — unknown vocabulary fails closed, never a guess`,
      { operatorId },
    );
  }
  const kind = record["kind"];
  if (typeof kind !== "string" || !(PINNED_REPAIR_OPERATOR_KINDS as readonly string[]).includes(kind)) {
    throw new ExclusionRepairError(`operator '${operatorId}' carries kind '${String(kind)}' outside the closed A.2 vocabulary`);
  }
  const codes = record["applicableExclusionCodes"];
  if (
    !Array.isArray(codes) ||
    !codes.every((code) => typeof code === "string" && (PINNED_OPERATOR_APPLICABLE_EXCLUSION_CODES as readonly string[]).includes(code))
  ) {
    throw new ExclusionRepairError(`operator '${operatorId}' lists an applicableExclusionCodes entry outside the 16-code operator-applicable set (the amended A.3/A.4 totality law)`);
  }
  const shadowedBy = record["shadowedBy"];
  if (
    shadowedBy !== undefined &&
    (!Array.isArray(shadowedBy) || !shadowedBy.every((id) => typeof id === "string" && (PINNED_REPAIR_OPERATOR_IDS as readonly string[]).includes(id)))
  ) {
    throw new ExclusionRepairError(`operator '${operatorId}' carries a shadowedBy entry outside the frozen operator-id vocabulary`);
  }
  const conditions = record["sideConditions"];
  if (
    conditions !== undefined &&
    (!Array.isArray(conditions) ||
      !conditions.every((entry) => isNonEmptyString((entry as PinnedRepairSideCondition)?.kind) && SIDE_CONDITION_KINDS.includes(String((entry as PinnedRepairSideCondition).kind))))
  ) {
    throw new ExclusionRepairError(`operator '${operatorId}' carries a side condition outside the closed typed vocabulary`);
  }
  if (kind === "PARTY_CHANGE" && !isNonEmptyString((record["partyChangeProposal"] as { title?: unknown } | undefined)?.["title"])) {
    throw new ExclusionRepairError(`PARTY_CHANGE operator '${operatorId}' must carry a partyChangeProposal with a title — a kind is proposal-consistent`);
  }
  if (kind === "PLATFORM_WORK" && !isNonEmptyString((record["platformWorkProposal"] as { gapId?: unknown } | undefined)?.["gapId"])) {
    throw new ExclusionRepairError(`PLATFORM_WORK operator '${operatorId}' must carry a platformWorkProposal with a gapId — a kind is proposal-consistent`);
  }
  if (kind === "MULTI_HOP" && !isNonEmptyString((record["hypothesisProposal"] as { assumptionSummary?: unknown } | undefined)?.["assumptionSummary"])) {
    throw new ExclusionRepairError(`MULTI_HOP operator '${operatorId}' must carry a hypothesisProposal with an assumptionSummary — a kind is proposal-consistent`);
  }
  return record as unknown as PinnedRepairOperator;
}

/** Fail-closed validation of a non-operator classification row. */
export function validatedNonOperatorClassification(candidate: unknown, code: string): void {
  const record = requireObject(candidate, "a non-operator classification row");
  const classification = record["classification"];
  if (
    typeof classification !== "string" ||
    !(PINNED_NON_OPERATOR_CLASSIFICATIONS as readonly string[]).includes(classification) ||
    !isNonEmptyString(record["reason"])
  ) {
    throw new ExclusionRepairError(
      `the catalogue returned an invalid non-operator classification for code '${code}' (the classification kind and reason are closed vocabulary)`,
    );
  }
}

/** True iff every corridor-level side condition holds (the fact-level pattern is evaluated per fact). */
export function corridorConditionsHold(operator: PinnedRepairOperator, state: CorridorState): boolean {
  for (const condition of operator.sideConditions ?? []) {
    switch (condition.kind) {
      case "P21_FLW_WALLET_FUNDING_PATTERN":
        break;
      case "STRIPE_RECEIVING_RAIL":
        if (!state.stripeReceiving) return false;
        break;
      case "ANY_RECEIVING_RAIL":
        if (!state.anyReceiving) return false;
        break;
      case "NO_ROUTE_STATE":
        if (!state.noRoute) return false;
        break;
      case "CROSS_PROVIDER_PAIR":
        if (!state.crossProviderPair) return false;
        break;
      case "FLW_PROVIDER_RAIL":
        if (!state.flwProviderRail) return false;
        break;
      default:
        throw new ExclusionRepairError(
          `operator '${operator.operatorId}' carries the unknown side condition '${String((condition as PinnedRepairSideCondition).kind)}'`,
        );
    }
  }
  return true;
}

/** The construction context the builders share (the P21-compatible projections). */
export interface RepairConstructionContext {
  readonly corridorRail: { readonly railKind: PinnedOpportunityRailKind; readonly railKey: string };
  readonly corridor: { readonly sourceCurrency: string; readonly destinationCurrency: string };
  readonly at: number;
  readonly optIn: PinnedOfferOptIn;
  readonly expiresAt: number;
  readonly evidence: readonly PinnedSupportingObservation[];
  readonly disclosureScope: PinnedDisclosureScope;
}

/** The SAME P21 grounding-evidence projection (every excluded rail record, sender side first, canonical order). */
export function groundingEvidenceChainOf(
  sender: EligibleRailSnapshot,
  recipient: EligibleRailSnapshot,
): readonly PinnedSupportingObservation[] {
  const byRouteId = (a: { routeId: string }, b: { routeId: string }) => (a.routeId < b.routeId ? -1 : 1);
  return Object.freeze([
    ...[...sender.rails].filter((rail) => rail.exclusions.length > 0).sort(byRouteId).map((rail) => groundingObservationOf("SENDER", rail)),
    ...[...recipient.rails].filter((rail) => rail.exclusions.length > 0).sort(byRouteId).map((rail) => groundingObservationOf("RECIPIENT", rail)),
  ]);
}

/** The SAME P21 disclosure-scope projection. */
export function disclosureScopeOf(purpose: string): PinnedDisclosureScope {
  return deepFreeze({
    fields: Object.freeze(["conditional_id", "required_party_changes", "assumptions", "platform_prerequisites"]),
    purpose,
  });
}

/** Build one conditional construction request from a party-change proposal (the `{facts}` token substituted with the verbatim fact messages). */
export function buildConditionalRequest(
  operator: PinnedRepairOperator,
  facts: readonly GroundedExclusionFact[],
  context: RepairConstructionContext,
): ConditionalConstructionRequest {
  const proposal = operator.partyChangeProposal;
  if (proposal === undefined) {
    throw new ExclusionRepairError(`operator '${operator.operatorId}' carries no party-change proposal — a conditional request is never invented`);
  }
  const factsMessage = facts.map((fact) => fact.message).join("; ");
  const description = factsMessage.length > 0 && proposal.description.includes("{facts}")
    ? proposal.description.split("{facts}").join(factsMessage)
    : proposal.description;
  return deepFreeze({
    family: "other",
    railKind: context.corridorRail.railKind,
    railKey: context.corridorRail.railKey,
    title: proposal.title,
    description,
    at: context.at,
    optIn: context.optIn,
    expiresAt: context.expiresAt,
    requiredPartyChanges: Object.freeze([{ party: proposal.party, change: proposal.change }]),
    assumptions: Object.freeze([...proposal.assumptions]),
    platformPrerequisites: deepFreeze(proposal.platformPrerequisites.map((prerequisite) => ({ ...prerequisite }))),
    groundingEvidence: context.evidence,
    disclosureScope: context.disclosureScope,
  });
}

/** The assumed augmentation an operator proposes, grounded in the corridor's real dimensions. */
export function assumedAugmentationOf(
  operatorId: string,
  proposal: { readonly augmentationKind: string; readonly assumptionSummary: string; readonly operationKind?: string },
  context: RepairConstructionContext,
): PinnedHypotheticalAugmentation {
  const corridor = context.corridor;
  switch (proposal.augmentationKind) {
    case "ADD_ASSUMED_RAIL":
      return deepFreeze({
        kind: "ADD_ASSUMED_RAIL",
        rail: deepFreeze({
          assumed: true,
          assumedRailId: `assumed-rail:${operatorId}`,
          providerName: `assumed:${operatorId}`,
          railKind: context.corridorRail.railKind,
          sourceCurrency: corridor.sourceCurrency,
          destinationCurrency: corridor.destinationCurrency,
          summary: proposal.assumptionSummary,
        }),
      });
    case "ADD_ASSUMED_CONVERSION_ASSET":
      return deepFreeze({
        kind: "ADD_ASSUMED_CONVERSION_ASSET",
        asset: deepFreeze({
          assumed: true,
          assumedAssetId: `assumed-asset:${operatorId}`,
          fromCurrency: corridor.sourceCurrency,
          toCurrency: corridor.destinationCurrency,
          summary: proposal.assumptionSummary,
        }),
      });
    case "ADD_ASSUMED_CONNECTOR_OPERATION":
      return deepFreeze({
        kind: "ADD_ASSUMED_CONNECTOR_OPERATION",
        operation: deepFreeze({
          assumed: true,
          assumedOperationId: `assumed-operation:${operatorId}`,
          providerName: `assumed:${operatorId}`,
          operationKind: proposal.operationKind ?? operatorId,
          sourceCurrency: corridor.sourceCurrency,
          destinationCurrency: corridor.destinationCurrency,
          summary: proposal.assumptionSummary,
        }),
      });
    default:
      throw new ExclusionRepairError(`operator '${operatorId}' proposes the unknown augmentation kind '${proposal.augmentationKind}' (the A.5 kinds are frozen)`);
  }
}

/** Build one multi-hop hypothesis request (the operator, the verbatim assumed augmentation, the cited facts). */
export function buildHypothesisRequest(
  operator: PinnedRepairOperator,
  facts: readonly PinnedGroundedFactRef[],
  context: RepairConstructionContext,
): PinnedHypothesisRequest {
  const proposal = operator.hypothesisProposal;
  if (proposal === undefined) {
    throw new ExclusionRepairError(`operator '${operator.operatorId}' carries no hypothesis proposal — a hypothesis request is never invented`);
  }
  return deepFreeze({
    operatorId: operator.operatorId,
    assumption: assumedAugmentationOf(operator.operatorId, proposal, context),
    citedFacts: Object.freeze([...facts]),
    summary: proposal.assumptionSummary,
  });
}
