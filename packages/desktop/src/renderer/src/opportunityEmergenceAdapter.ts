/**
 * PaySwap Desktop renderer (P23-B, lane B; ADR-0015 D3/D5/D6/D9) — the
 * OPPORTUNITY-EMERGENCE adapter: the composition module that makes the
 * product engine adapter's stage 6/7 REAL.
 *
 * THE WIRING (ADR-0015 D9):
 * - (a) The REAL ports: the repair-operator catalogue + the conditional
 *   construction port bind through ./repairCatalogueAdapter.ts (the REAL
 *   @payswap/opportunities machinery via the established alias triplet).
 * - (b) THE GENERAL DERIVATION: `deriveConditionalOpportunities` WITH the
 *   bound catalogue + the REAL construction port (the reviewer's core
 *   finding — "the product engine adapter never calls
 *   deriveConditionalOpportunities" — closed here), plus
 *   `deriveExclusionRepairs` over the SAME inputs for the presentation
 *   payloads (the deterministic zip: the constructed conditional at index
 *   i was built from the construction request at index i — verified, never
 *   assumed).
 * - (c) THE HYPOTHESIS STAGE: for each derived hypothesis request,
 *   `deriveHypotheticalView` over the merged corridor view (the one-change
 *   discipline, the base digest tamper-checked by the REAL derivation) +
 *   `deriveRouteHypothesis` through a PlannerReRunPort bound to the REAL
 *   planner path — the SAME stage-4/5 machinery the engine adapter runs
 *   (enumerateRouteCandidates + evaluateHardGates + rankRoutes re-run over
 *   the real sub-views), returning the rank-eligible ids + the remaining
 *   REAL exclusions. BOUNDED: at most the scenario budget's maxScenarios
 *   hypotheses (an honest overflow truncates WITH a receipt).
 * - (d) THE MODEL-PROPOSAL COMPOSITION (D6): the ModelProposalPort binds
 *   ONLY when a session model is selected AND the substrate's
 *   model-provider transport seam is supplied (the live-model binding is a
 *   NAMED CARRY-FORWARD — no live-model claim is made this wave); the
 *   honest zero-model / no-transport notes stand otherwise, and the
 *   proposals fold through the lane-A fold law (never a duplicate card).
 * - (e) STAGE 6's REAL FACTS: `recordedFactsFromSnapshots` over the rail
 *   snapshots + `repairInterventionsFromRepairs` over the derived repairs
 *   (the EXISTING Lab kinds — D13), for the engine adapter's
 *   `exploreBoundedScenarios` (replacing the empty interventions + empty
 *   facts — the ReplayDelta attaches to the matching hypothesis card as
 *   advisory measurement).
 *
 * ADVISORY ONLY: every output feeds the engine view's three ADVISORY
 * sections — nothing here dispatches, nothing enters available-now,
 * nothing feeds eligibility; the only route onward is fresh planning,
 * preview and NEW explicit authorization.
 */

import {
  corridorViewDigest,
  deriveConditionalOpportunities,
  deriveExclusionRepairs,
  deriveHypotheticalView,
  deriveRouteHypothesis,
  enumerateRouteCandidates,
  evaluateHardGates,
  groundedFactsOf,
  mergedCorridorView,
  rankRoutes,
  recordedFactsFromSnapshots,
  repairInterventionsFromRepairs,
  type EligibleRailSnapshot,
  type ExclusionRepairDerivation,
  type HardGateEvaluation,
  type MoneyMovementIntentPin,
  type PinnedCorridorQuery,
  type PinnedHypotheticalCorridorView,
  type PlannerReRunPort,
  type RouteCompilationPort,
  type SnapshotDerivedLabFacts,
} from "@payswap/route-planning";
import type {
  PinnedCitedShapeSkeleton,
  PinnedRepairIntervention,
} from "@payswap/route-planning";
import {
  REPAIR_OPERATORS,
  foldModelProposals,
  validateModelProposals,
  type ModelProposalPort,
  type ModelProposalRequest,
  type RepairExclusionFact,
} from "@payswap/opportunities";
import {
  type AgentTaskModelSelectionPin,
  type RoutePlanningConditionalOpportunityPin,
  type RoutePlanningGroundedFactRefPin,
  type RoutePlanningHypothesisPin,
  type RoutePlanningModelProposalStatePin,
  type RoutePlanningPlatformWorkPin,
} from "@payswap/app";

import { enrichedRepairOperatorById, realConditionalOpportunityPort, realRepairOperatorCatalogue } from "./repairCatalogueAdapter.js";

/* ---------------- the pinned composition constants (transparent, honest) ---------------- */

/** The composition's disclosure purpose (frozen, ≤200 chars — the derivation validates). */
export const COMPOSITION_DISCLOSURE_PURPOSE =
  "the operator's route-planning panel renders the derived conditional opportunities with their preconditions" as const;

/**
 * The composition root's pinned ADVISORY SIMULATION ECONOMICS (ADR-0015
 * D9c + the lab-facts caller-supplied law): the rail snapshots observe NO
 * fee or latency, so stage 6's counterfactual measurement runs over
 * CALLER-SUPPLIED simulation parameters. These constants are ADVISORY
 * SIMULATION PARAMETERS ONLY — never presented as real claims, never
 * market data (the same posture as the composition's identity-conversion
 * best-execution policy: fully declared, versioned, honest about being a
 * neutral default). Zero fees + the composition step latency are the
 * neutral identity defaults.
 */
export const COMPOSITION_ADVISORY_RAIL_ECONOMICS = Object.freeze({
  latencyMs: 250,
  fixedFeeMinor: 0n,
  variableFeeBps: 0n,
});

/** The assumed elements' advisory simulation parameters (the same honesty law). */
export const COMPOSITION_ADVISORY_ASSUMED_ECONOMICS = Object.freeze({
  latencyMs: 250,
  fixedFeeMinor: 0n,
  variableFeeBps: 0n,
});

/**
 * The cited frozen shape skeletons per augmentation kind (PROVENANCE ONLY —
 * a hypothesis CITES an existing skeleton, never compiles one; the P21-0 C8
 * law). The closest frozen skeleton by structure: an assumed rail plays the
 * BRIDGE role; a conversion asset plays the swap-then-bridge role; a
 * connector operation plays the composed PSP collect-issue-deliver role.
 * The leg sequences are the frozen route-compiler authority's own
 * (shapeLegSequence — mirrored here as pinned constants).
 */
const CITED_SKELETONS: Readonly<Record<string, PinnedCitedShapeSkeleton>> = Object.freeze({
  ADD_ASSUMED_RAIL: Object.freeze({ shapeId: "provider-native-bridge", legKindSequence: Object.freeze(["ONCHAIN_BRIDGE"]) }),
  ADD_ASSUMED_CONVERSION_ASSET: Object.freeze({ shapeId: "mixed-dex-bridge", legKindSequence: Object.freeze(["ONCHAIN_DEX_SWAP", "ONCHAIN_BRIDGE"]) }),
  ADD_ASSUMED_CONNECTOR_OPERATION: Object.freeze({ shapeId: "mixed-psp-onramp", legKindSequence: Object.freeze(["FIAT_PSP_COLLECT", "PSP_STABLECOIN_ISSUANCE", "ONCHAIN_TRANSFER"]) }),
});

/** The honest UNVERIFIED reason when no hypothetical re-run exists for a party change (frozen). */
const NO_RERUN_REASON =
  "no hypothetical re-run exists for this party change — the planner has not re-verified the party-changed view, so the conditional rests on the verbatim exclusion facts alone" as const;

/* ---------------- the REAL planner re-run port ---------------- */

/**
 * The REAL planner re-run seam: re-runs the SAME stage-4/5 machinery the
 * engine adapter runs (the REAL compiler through the port + the typed hard
 * gates + the transparent ranking) over the view's REAL base (the merged
 * corridor view the hypothetical view was derived over — the digest is
 * re-verified, never assumed), returning the rank-eligible plan ids over
 * the real sub-views (the segments verifiable TODAY) + the remaining REAL
 * exclusions (the corridor's verbatim typed facts).
 */
export function realPlannerReRunPort(context: {
  readonly movement: MoneyMovementIntentPin;
  readonly at: number;
  readonly senderSnapshot: EligibleRailSnapshot;
  readonly recipientSnapshot: EligibleRailSnapshot;
  readonly query: PinnedCorridorQuery;
  readonly evidence: Parameters<typeof enumerateRouteCandidates>[0]["evidence"];
  readonly budget: Parameters<typeof enumerateRouteCandidates>[0]["budget"];
  readonly compilationPort: RouteCompilationPort;
  readonly policy: Parameters<typeof rankRoutes>[0]["policy"];
  readonly declaredBaseViewDigest: string;
}): PlannerReRunPort {
  return {
    compileCorridorView(view: PinnedHypotheticalCorridorView) {
      // The honest wiring check: the re-run compiles the view's REAL base —
      // the same merged corridor view the hypothetical view was derived over.
      if (view.baseViewDigest !== context.declaredBaseViewDigest) {
        throw new Error(
          "the planner re-run was handed a hypothetical view over a foreign base — the composition never compiles a view it did not derive (the tamper-check law)",
        );
      }
      const enumeration = enumerateRouteCandidates({
        intent: context.movement,
        at: context.at,
        senderSnapshot: context.senderSnapshot,
        recipientSnapshot: context.recipientSnapshot,
        corridorQuery: context.query,
        evidence: context.evidence,
        budget: context.budget,
        compilationPort: context.compilationPort,
      });
      const gates = evaluateHardGates({ intent: context.movement, at: context.at, candidates: enumeration.candidates });
      const ranking = rankRoutes({ evaluation: gates, policy: context.policy });
      return {
        rankedEligible: ranking.ranked.map((candidate) => candidate.metrics.planId),
        exclusions: [
          ...groundedFactsOf("SENDER", context.senderSnapshot),
          ...groundedFactsOf("RECIPIENT", context.recipientSnapshot),
        ],
      };
    },
  };
}

/* ---------------- the emergence derivation ---------------- */

/** The emergence derivation input (the engine adapter's stage-2..5 context). */
export interface OpportunityEmergenceInput {
  readonly senderSnapshot: EligibleRailSnapshot;
  readonly recipientSnapshot: EligibleRailSnapshot;
  readonly hardGates: HardGateEvaluation;
  readonly movement: MoneyMovementIntentPin;
  readonly query: PinnedCorridorQuery;
  readonly at: number;
  readonly evidence: Parameters<typeof enumerateRouteCandidates>[0]["evidence"];
  readonly searchBudget: Parameters<typeof enumerateRouteCandidates>[0]["budget"];
  /** The scenario budget bounds the hypotheses (maxScenarios) — the D9b bound. */
  readonly scenarioBudget: { readonly maxScenarios: number };
  readonly compilationPort: RouteCompilationPort;
  readonly policy: Parameters<typeof rankRoutes>[0]["policy"];
  /** The corridor's party facts (the opt-in participant + the conditional expiry). */
  readonly intentPrincipalRef: string;
  readonly intentExpiresAt: number;
  /** (D6) The task's persisted model selection (absent = the honest zero-model note). */
  readonly modelSelection?: AgentTaskModelSelectionPin;
  /** (D6) The substrate's model-provider transport seam (a NAMED CARRY-FORWARD — unbound this wave). */
  readonly modelProposalPort?: ModelProposalPort;
}

/** The emergence derivation output (the engine view's three sections + stage 6's real inputs). */
export interface OpportunityEmergenceResult {
  readonly conditionalOpportunities: readonly RoutePlanningConditionalOpportunityPin[];
  readonly platformWork: readonly RoutePlanningPlatformWorkPin[];
  readonly hypotheses: readonly RoutePlanningHypothesisPin[];
  readonly modelProposals: RoutePlanningModelProposalStatePin;
  /** Stage 6's REAL recorded facts (the snapshot-derived Lab input projection). */
  readonly labFacts: SnapshotDerivedLabFacts;
  /** Stage 6's REAL interventions (the derived repairs over the EXISTING Lab kinds). */
  readonly scenarioInterventions: readonly PinnedRepairIntervention[];
  /** The honest hypotheses-truncation receipt (present iff the scenario budget capped the derived hypotheses). */
  readonly hypothesisTruncationReceipt: { readonly dimension: string; readonly limit: number; readonly actualCount: number; readonly disclosedAs: "TRUNCATED" } | null;
  /** The underlying repair derivation (the applied/suppressed operators — the bridge tier's receipt surface). */
  readonly repairDerivation: ExclusionRepairDerivation;
}

/** The corridor's rail identity (the caller-supplied corridor fact — deterministic from the query). */
function corridorRailOf(query: PinnedCorridorQuery): { railKind: "FIAT"; railKey: string } {
  return {
    railKind: "FIAT",
    railKey: `fiat:${query.sourceCurrency.toLowerCase()}-${query.destinationCurrency.toLowerCase()}`,
  };
}

/** Map one verbatim grounded fact onto the app's pinned fact ref. */
function factRefOf(fact: { readonly side: "SENDER" | "RECIPIENT"; readonly routeId: string; readonly code: string; readonly message: string; readonly fundingMethod?: string }): RoutePlanningGroundedFactRefPin {
  return {
    side: fact.side,
    routeId: fact.routeId,
    code: fact.code,
    message: fact.message,
    ...(fact.fundingMethod !== undefined ? { fundingMethod: fact.fundingMethod } : {}),
  };
}

/**
 * THE emergence derivation (deterministic, fail-closed, advisory only):
 * runs the REAL general derivation + the REAL conditional construction +
 * the REAL hypothesis stage within the scenario budget, maps the outputs
 * onto the app's pinned card sections, composes the model-proposal state
 * per the D6 binding law, and derives stage 6's REAL facts + interventions
 * from the rail snapshots + the derived repairs.
 */
export function deriveOpportunityEmergence(input: OpportunityEmergenceInput): OpportunityEmergenceResult {
  const catalogue = realRepairOperatorCatalogue();
  const port = realConditionalOpportunityPort();
  const base = {
    senderSnapshot: input.senderSnapshot,
    recipientSnapshot: input.recipientSnapshot,
    hardGates: input.hardGates,
    corridorRail: corridorRailOf(input.query),
    optIn: { participantRef: input.intentPrincipalRef, optedInAt: input.at },
    at: input.at,
    expiresAt: input.intentExpiresAt,
    disclosurePurpose: COMPOSITION_DISCLOSURE_PURPOSE,
  };

  // (b) THE GENERAL DERIVATION — the presentation payloads' source of truth…
  const repairDerivation = deriveExclusionRepairs({ ...base, catalogue });
  // …and THE composition: deriveConditionalOpportunities with the bound
  // catalogue + the REAL construction port (the ADR-0015 D9b call).
  const conditionalDerivation = deriveConditionalOpportunities({ ...base, port, repairCatalogue: catalogue });

  // The deterministic zip: the constructed conditional at index i was built
  // from the construction request at index i over the SAME inputs — the
  // titles are asserted equal (a drift is a composition bug, never a
  // fabricated presentation).
  const requests = repairDerivation.conditionalRequests;
  const constructed = conditionalDerivation.conditionalOpportunities;
  if (requests.length !== constructed.length) {
    throw new Error(
      `the exclusion-repair derivation emitted ${requests.length} conditional request(s) while the conditional derivation constructed ${constructed.length} — the deterministic zip drifted (never a fabricated presentation)`,
    );
  }
  for (let index = 0; index < requests.length; index += 1) {
    if (requests[index]!.title !== constructed[index]!.summary) {
      throw new Error(
        `the conditional derivation's summary at index ${index} disagrees with the construction request's title — the deterministic zip drifted (never a fabricated presentation)`,
      );
    }
  }
  // The conditional↔operator pairing (the appliedOperators walk, in order):
  // every applied operator carrying a party-change proposal emitted exactly
  // one conditional request, in the same order.
  const conditionalOperatorIds: string[] = [];
  for (const applied of repairDerivation.appliedOperators) {
    if (enrichedRepairOperatorById(applied.operatorId)?.partyChangeProposal !== undefined) {
      conditionalOperatorIds.push(applied.operatorId);
    }
  }
  if (conditionalOperatorIds.length !== requests.length) {
    throw new Error(
      "the applied-operator walk disagrees with the emitted conditional requests — the pairing drifted (never a fabricated verification)",
    );
  }

  // (c) THE HYPOTHESIS STAGE — bounded by the scenario budget, honest receipts.
  const hypothesisRequests = conditionalDerivation.hypotheses ?? [];
  const limit = input.scenarioBudget.maxScenarios;
  const truncated = hypothesisRequests.length > limit;
  const boundedRequests = truncated ? hypothesisRequests.slice(0, limit) : hypothesisRequests;
  const mergedBase = mergedCorridorView(input.senderSnapshot, input.recipientSnapshot, {
    sourceCountry: input.query.sourceCountry,
    destinationCountry: input.query.destinationCountry,
    sourceCurrency: input.query.sourceCurrency,
    destinationCurrency: input.query.destinationCurrency,
    asOf: input.query.asOf,
  });
  const declaredBaseViewDigest = corridorViewDigest(mergedBase);
  const reRunPort = realPlannerReRunPort({
    movement: input.movement,
    at: input.at,
    senderSnapshot: input.senderSnapshot,
    recipientSnapshot: input.recipientSnapshot,
    query: input.query,
    evidence: input.evidence,
    budget: input.searchBudget,
    compilationPort: input.compilationPort,
    policy: input.policy,
    declaredBaseViewDigest,
  });
  const hypotheses: RoutePlanningHypothesisPin[] = [];
  const verificationByOperator = new Map<string, { verification: "PLANNER_VERIFIED" | "UNVERIFIED"; reason: string }>();
  for (const request of boundedRequests) {
    const view = deriveHypotheticalView({
      baseView: mergedBase,
      declaredBaseViewDigest,
      operatorId: request.operatorId,
      augmentations: [request.assumption],
    });
    const skeleton = CITED_SKELETONS[request.assumption.kind];
    if (skeleton === undefined) {
      throw new Error(`the augmentation kind '${request.assumption.kind}' has no cited skeleton — the A.5 kinds are frozen`);
    }
    const hypothesis = deriveRouteHypothesis({ view, reRunPort, citedShapeSkeleton: skeleton, operatorId: request.operatorId, at: input.at });
    verificationByOperator.set(request.operatorId, { verification: hypothesis.verification, reason: hypothesis.verificationReason });
    hypotheses.push({
      hypothesisId: hypothesis.hypothesisId,
      operatorId: hypothesis.operatorId,
      assumptionSummary: request.summary,
      verifiedSegmentIds: hypothesis.verifiedSegments.map((segment) => segment.segmentId),
      assumedSegmentIds: hypothesis.hypotheticalSegments.map((segment) => segment.segmentId),
      citedShapeId: hypothesis.citedShapeSkeleton.shapeId,
      blockers: hypothesis.blockers.map(factRefOf),
      wouldCompose: hypothesis.wouldCompose,
      verification: hypothesis.verification,
      verificationReason: hypothesis.verificationReason,
      neverExecutable: hypothesis.neverExecutable,
      advisoryOnly: hypothesis.advisoryOnly,
    });
  }

  // The conditional cards (the A.6 verification pairing composed from the
  // hypothesis stage: PLANNER_VERIFIED iff the matching operator's re-run
  // composed a rank-eligible route over the party-changed view).
  const conditionalOpportunities: RoutePlanningConditionalOpportunityPin[] = constructed.map((conditional, index) => {
    const request = requests[index]!;
    const pairing = verificationByOperator.get(conditionalOperatorIds[index]!);
    return {
      conditionalId: conditional.conditionalId,
      title: request.title,
      description: request.description,
      requiredPartyChanges: conditional.requiredPartyChanges.map((change) => ({ party: change.party, change: change.change })),
      assumptions: [...conditional.assumptions],
      platformPrerequisites: conditional.platformPrerequisites.map((prerequisite) => ({ gapId: prerequisite.gapId, note: prerequisite.note })),
      expiresAt: conditional.expiresAt,
      verification: pairing?.verification ?? "UNVERIFIED",
      verificationReason: pairing?.reason ?? NO_RERUN_REASON,
    };
  });

  // The platform-work cards (the D4 derivations, verbatim).
  const platformWork: RoutePlanningPlatformWorkPin[] = (conditionalDerivation.platformWork ?? []).map((work) => ({
    workItemId: work.workItemId,
    gapId: work.gapId,
    title: work.title,
    requiredByOperatorIds: [...work.requiredByOperatorIds],
    evidenceBasis: work.evidenceBasis.map(factRefOf),
  }));

  // (d) THE MODEL-PROPOSAL COMPOSITION (the D6 binding law).
  const modelProposals = composeModelProposalState(input, repairDerivation);

  // (e) STAGE 6's REAL FACTS + the derived repair interventions.
  // BOTH sides evaluate the SAME chain set (the composition feeds one set to
  // sender and recipient alike — the merged view dedupes by routeId), so the
  // economics table must DEDUPE the route ids or the facts derivation's
  // duplicate-economics law fails closed (the bridge battery's finding).
  const railEconomics = [
    ...new Set([
      ...input.senderSnapshot.rails.map((rail) => rail.routeId),
      ...input.recipientSnapshot.rails.map((rail) => rail.routeId),
    ]),
  ].map((routeId) => ({ routeId, ...COMPOSITION_ADVISORY_RAIL_ECONOMICS }));
  const labFacts = recordedFactsFromSnapshots({
    senderSnapshot: input.senderSnapshot,
    recipientSnapshot: input.recipientSnapshot,
    factsId: `composition:${input.movement.intentId}`,
    stepLatencyMs: COMPOSITION_ADVISORY_RAIL_ECONOMICS.latencyMs,
    railEconomics,
  });
  const scenarioInterventions = repairInterventionsFromRepairs({
    repairs: repairDerivation,
    assumedEconomics: COMPOSITION_ADVISORY_ASSUMED_ECONOMICS,
  });

  return {
    conditionalOpportunities,
    platformWork,
    hypotheses,
    modelProposals,
    labFacts,
    scenarioInterventions,
    hypothesisTruncationReceipt: truncated
      ? { dimension: "hypotheses", limit, actualCount: hypothesisRequests.length, disclosedAs: "TRUNCATED" as const }
      : null,
    repairDerivation,
  };
}

/** Compose the model-proposal state per the D6 binding law (honest, never fabricated). */
function composeModelProposalState(
  input: OpportunityEmergenceInput,
  repairDerivation: ExclusionRepairDerivation,
): RoutePlanningModelProposalStatePin {
  if (input.modelSelection === undefined) {
    // The CDP-proven zero-model deployment truth.
    return { kind: "UNBOUND_NO_MODEL" };
  }
  if (input.modelProposalPort === undefined) {
    // A session model is selected but the substrate's model-provider
    // transport is not bound — the live-model binding is a named carry-forward.
    return { kind: "UNBOUND_NO_TRANSPORT" };
  }
  // The bounded, grounded request: the derivation's verbatim facts + the
  // REAL catalogue snapshot (the frozen 15-row lane-A catalogue) + the
  // count-based difficulty budget (the search budget's candidate bound —
  // the same knob that bounds the deterministic candidate work).
  const request: ModelProposalRequest = {
    facts: repairDerivation.groundedFacts.map((fact) => ({
      side: fact.side,
      routeId: fact.routeId,
      code: fact.code as RepairExclusionFact["code"],
      message: fact.message,
      ...(fact.fundingMethod !== undefined ? { fundingMethod: fact.fundingMethod } : {}),
    })) as readonly RepairExclusionFact[],
    catalogue: REPAIR_OPERATORS,
    maxProposals: input.searchBudget.maxCandidates,
    at: input.at,
  };
  const validated = validateModelProposals(input.modelProposalPort.propose(request), request);
  const fold = foldModelProposals(validated.proposals, repairDerivation.appliedOperators.map((applied) => applied.operatorId));
  return {
    kind: "BOUND",
    modelId: input.modelSelection.modelId,
    foldedOperatorIds: fold.folded.map((group) => group.operatorId),
    novelProposalIds: fold.novel.map((proposal) => proposal.proposalId),
  };
}
