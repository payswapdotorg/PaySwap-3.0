/**
 * PaySwap Desktop renderer (P27-E, ADR-0020 D5/D6 + ADR-0009 D2 — the
 * P27-D lane report §6.4 composition seam) — the NODE-NETWORK
 * composition root member: binds the REAL node-offer admission chain
 * and the search -> eligibility-gates -> baseline-comparison stage
 * chain at the platform host's composition root.
 *
 * This module is a member of the routePlanning* composition family
 * (the ADR-0010 additive annotation's `src/renderer/src/routePlanning*.ts`
 * glob — the routePlanningEngineAdapter precedent; NO other renderer
 * file may import the engine packages).
 *
 * THE LAWS (P27-D, ADR-0020 §5/§6):
 * - THE ADMISSION PORT (ADR-0009 D2): a NodeOfferAdmissionPort bound to
 *   the REAL capability chain (admitNodeOffer — the INV-13 seam): a
 *   node's signed+fresh offer is NECESSARY, the accepting authority's
 *   OWN provider evidence (the ACTIVE bound instance + the AVAILABLE
 *   ELIGIBLE observation) is DECISIVE. The pinned wire shapes are
 *   structural SUBSETS of the authority's shapes, so the composition
 *   hands them through with the established thin cast (the acceptance
 *   battery's precedent) — the REAL chain revalidates every field it
 *   reads; nothing is fabricated at this boundary.
 * - THE DISCOVERY CHAIN: buildRouteGraph -> searchRoutePaths (bounded,
 *   COMPLETE only with no truncation receipt) -> evaluateNodeRouteEligibility
 *   per admitted path (the INV-30 gates HARD BEFORE ranking) ->
 *   compareAgainstDirectBaseline over the hard-gate survivors (the
 *   MANDATORY D6 baseline). Every stage's discovery NEVER permits
 *   execution — the literals stay false end to end; no new route
 *   becomes executable by graph compilation alone.
 * - THE HONEST DEFAULT: this deployment has ZERO operator-enrolled
 *   nodes (the shipped registry is EMPTY by law — D11). With no
 *   verified offers the chain refuses every node leg
 *   (NODE_LEG_WITHOUT_ADMISSION) — fail closed, never a fabricated
 *   admission, never a silent pass.
 */

import {
  buildRouteGraph,
  compareAgainstDirectBaseline,
  evaluateNodeRouteEligibility,
  requireNodeOfferAdmissionPort,
  searchRoutePaths,
  type BudgetedRoutePathSearch,
  type CorridorSide,
  type HardGateSurvivor,
  type NodeOfferAdmissionPort,
  type NodeRouteLegDeclaration,
  type PinnedCountryVerdict,
  type PinnedNodeOfferAdmission,
  type PinnedObservationScope,
  type PinnedInstanceScope,
  type PinnedTransactionClass,
  type PinnedTransactionClassification,
  type PinnedVerifiedNodeOfferWire,
  type RouteBaselineComparison,
  type RouteGraph,
  type RouteGraphSearchBudget,
} from "@payswap/route-planning";
import { admitNodeOffer } from "@payswap/capability";
import type { ConnectedCapabilityInstance, CapabilityObservation } from "@payswap/capability";

/* ------------- the REAL node-offer admission port (the INV-13 seam) ------------- */

/**
 * The REAL NodeOfferAdmissionPort over the capability chain: the
 * composition root's binding of the P27-D port (route-planning
 * ports.ts) to the REAL admitNodeOffer chain (capability
 * src/node-offer.ts). The offer wire arrives as DATA (node-network's
 * verification output, pinned); the local four-layer evidence is
 * decisive (§6).
 */
export function realNodeOfferAdmissionPort(): NodeOfferAdmissionPort {
  return {
    admitNodeOffer(request) {
      // The thin cast at the composition boundary: the pinned scopes are
      // structural SUBSETS of the capability authority's shapes (a
      // genuine chain value is assignable in this direction); the REAL
      // chain revalidates every field it reads — an unbound port never
      // fabricates an instance, observation or fact.
      return admitNodeOffer({
        offer: request.offer,
        instance: request.instance as unknown as ConnectedCapabilityInstance,
        observation: request.observation as unknown as CapabilityObservation,
      }) as unknown as PinnedNodeOfferAdmission;
    },
  };
}

/** One verified node offer presentation: the wire + the local evidence it must revalidate against. */
export interface NodeOfferPresentation {
  readonly side: CorridorSide;
  readonly offer: PinnedVerifiedNodeOfferWire;
  readonly instance: PinnedInstanceScope;
  readonly observation: PinnedObservationScope;
}

/* ------------- the search -> gates -> baseline discovery chain ------------- */

/** The composed node-relay discovery input (every stage's REAL inputs, injected). */
export interface NodeRelayRouteDiscoveryInput {
  /** The typed route graph (bounded by construction: 64 vertices / 256 edges). */
  readonly graph: { readonly vertices: readonly unknown[]; readonly edges: readonly unknown[] };
  readonly originVertexId: string;
  readonly destinationVertexId: string;
  /** The intent's own hop bound ([1,8]). */
  readonly maxHops: number;
  readonly budget: RouteGraphSearchBudget;
  /** The intent's typed classification (the governing-class seed). */
  readonly intentClassification: PinnedTransactionClassification;
  /** The dated country-gate policy decisions (D10 — every touched country must be covered). */
  readonly countryVerdicts: Readonly<Record<string, PinnedCountryVerdict>>;
  /** The transaction classes the LOCAL connected products serve. */
  readonly localProductPurposes: readonly PinnedTransactionClass[];
  /**
   * The caller-declared per-edge transaction classes (a LABEL — it can
   * only RAISE the governing class, never lower it; INV-30).
   */
  readonly edgeDeclaredClasses: Readonly<Record<string, PinnedTransactionClass>>;
  /**
   * The verified offers + their local instance/observation scopes.
   * EMPTY = this deployment's honest state (no operator-enrolled
   * nodes — every node leg then refuses NODE_LEG_WITHOUT_ADMISSION).
   */
  readonly offers: readonly NodeOfferPresentation[];
  /** The admission port (defaults to the REAL binding — injectable for the battery). */
  readonly admissionPort?: NodeOfferAdmissionPort;
}

/** One admitted path's eligibility evaluation (the INV-30 gates, verbatim). */
export interface NodeRelayPathEvaluation {
  readonly pathId: string;
  readonly legDeclarations: readonly NodeRouteLegDeclaration[];
  readonly countries: readonly string[];
  readonly eligibility: ReturnType<typeof evaluateNodeRouteEligibility>;
}

/** The composed discovery output (every stage's honest record; never a permission). */
export interface NodeRelayRouteDiscovery {
  readonly search: BudgetedRoutePathSearch;
  /** The admission outcome per operating node (every reason retained). */
  readonly admissions: Readonly<Record<string, PinnedNodeOfferAdmission>>;
  readonly pathEvaluations: readonly NodeRelayPathEvaluation[];
  readonly eligiblePathIds: readonly string[];
  /** LITERAL: discovery NEVER permits execution (per-leg authorization stays in the host authority). */
  readonly discoveryPermitsExecution: false;
}

/**
 * Compose the node-relay discovery chain over the REAL engines: the
 * bounded graph search discovers simple origin->destination paths, the
 * REAL admission port revalidates every presented offer against the
 * local provider evidence, and the INV-30 eligibility gates evaluate
 * every admitted path HARD BEFORE ranking. Fail-closed throughout: an
 * unadmitted node leg refuses its path; an unknown country verdict
 * refuses the whole path; the output is discovery DATA, never a
 * permission (the composite act + the host authority own execution).
 */
export function composeNodeRelayRouteDiscovery(
  input: NodeRelayRouteDiscoveryInput,
): NodeRelayRouteDiscovery {
  const port = requireNodeOfferAdmissionPort(input.admissionPort ?? realNodeOfferAdmissionPort());
  const graph: RouteGraph = buildRouteGraph({
    vertices: input.graph.vertices,
    edges: input.graph.edges,
  });
  const search = searchRoutePaths({
    graph,
    originVertexId: input.originVertexId,
    destinationVertexId: input.destinationVertexId,
    maxHops: input.maxHops,
    budget: input.budget,
  });

  // The admissions over the REAL chain (keyed by the operating node).
  const admissions: Record<string, PinnedNodeOfferAdmission> = {};
  for (const presentation of input.offers) {
    admissions[presentation.offer.nodeId] = port.admitNodeOffer({
      side: presentation.side,
      offer: presentation.offer,
      instance: presentation.instance,
      observation: presentation.observation,
    });
  }

  // The per-path INV-30 gates (the edges' operating nodes + declared
  // classes; the jurisdictions the path touches; the admissions).
  const edgeOf = new Map(graph.edges.map((edge) => [edge.edgeId, edge]));
  const pathEvaluations: NodeRelayPathEvaluation[] = [];
  for (const path of search.admitted) {
    const legDeclarations: NodeRouteLegDeclaration[] = path.edgeIds.map((edgeId) => {
      const edge = edgeOf.get(edgeId)!;
      return {
        legId: edgeId,
        declaredClass: input.edgeDeclaredClasses[edgeId] ?? "OTHER_UNCLEAR",
        operatingNodeId: edge.operatingNodeId,
      };
    });
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: input.intentClassification,
      legs: legDeclarations,
      countries: [...path.jurisdictions],
      countryVerdicts: input.countryVerdicts,
      nodeAdmissions: admissions,
      localProductPurposes: input.localProductPurposes,
    });
    pathEvaluations.push({
      pathId: path.pathId,
      legDeclarations,
      countries: [...path.jurisdictions],
      eligibility: evaluation,
    });
  }

  return Object.freeze({
    search,
    admissions: Object.freeze(admissions),
    pathEvaluations: Object.freeze(pathEvaluations),
    eligiblePathIds: Object.freeze(
      pathEvaluations.filter((row) => row.eligibility.verdict === "ELIGIBLE").map((row) => row.pathId),
    ),
    discoveryPermitsExecution: false as const,
  });
}

/**
 * The MANDATORY direct/native baseline comparison (ADR-0020 D6) as the
 * chain's post-hard-gates stage: every hard-eligible multi-leg plan is
 * compared against the BEST hard-eligible provider-native baseline in
 * exact BigInt money — parity or worse is NOT returned (the simplest
 * eligible route wins); a missing/unscored baseline justifies every
 * multi-leg candidate with the typed disclosure.
 */
export function nodeRouteBaselineComparisonOf(
  survivors: readonly HardGateSurvivor[],
): RouteBaselineComparison {
  return compareAgainstDirectBaseline({ candidates: survivors });
}
