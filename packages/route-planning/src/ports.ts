/**
 * @payswap/route-planning — the fail-closed injected engine ports
 * (P16-A, ADR-0009 D2; the node-offer admission port added by P27-D,
 * ADR-0020 D5).
 *
 * THE COMPOSITION LAW: this package's src NEVER imports a sibling
 * package. Every REAL engine (the capability lane's corridor projection,
 * the route compiler, the capability lane's node-offer admission chain)
 * is reached ONLY through these INJECTED PORTS, and every DEFAULT
 * implementation here FAILS CLOSED with a typed PortUnboundError carrying
 * the EXACT unbound stage name. No default may fabricate data, fall back,
 * or return partial results — an unbound engine is an honest typed error,
 * never an LLM-only routing fallback (the ROUTINE-CONTRACT acceptance
 * law). The REAL engines are bound at the TEST tier (relative
 * cross-package imports — the established pattern) and later at the
 * platform host's composition root.
 */

import { PortUnboundError } from "./errors.ts";
import type { PinnedCorridorQuery, PinnedCorridorRouteChain, PinnedCorridorSideEvaluation } from "./pins/capability.ts";
import type {
  PinnedInstanceScope,
  PinnedObservationFreshnessPolicy,
  PinnedObservationScope,
} from "./pins/capability.ts";
import type { PinnedRouteCompilationResult } from "./pins/route-compiler.ts";
import type { RouteCompilerInputPin } from "./pins/route-compiler-input.ts";
import type {
  PinnedNodeOfferAdmission,
  PinnedVerifiedNodeOfferWire,
} from "./pins/node-network.ts";

/**
 * The routine stage names an engine binding serves (ROUTINE-CONTRACT
 * stage table; frozen — the unbound error names the exact stage).
 */
export const ROUTE_PLANNING_ENGINE_STAGES = Object.freeze([
  "stage-2:discover-sender-rails",
  "stage-3:discover-recipient-rails",
  "stage-4:compile-available-routes",
] as const);

export type RoutePlanningEngineStage = (typeof ROUTE_PLANNING_ENGINE_STAGES)[number];

/** The corridor side a per-side evaluation serves. */
export type CorridorSide = "SENDER" | "RECIPIENT";

/** The per-side corridor evaluation request (one side, one evaluation). */
export interface CorridorSideEvaluationRequest {
  readonly side: CorridorSide;
  readonly query: PinnedCorridorQuery;
  readonly freshnessPolicy: PinnedObservationFreshnessPolicy;
  /** The side's four-layer chains (definition/implementation/instance/observation). */
  readonly chains: readonly PinnedCorridorRouteChain[];
}

/**
 * THE CORRIDOR PROJECTION PORT (stages 2 and 3): runs the REAL capability
 * machinery per side — one corridor evaluation with its own observation
 * grounding and the caller-supplied query instant. Returns the pinned
 * CorridorView plus the per-route restriction sets (index-aligned).
 */
export interface CorridorProjectionPort {
  evaluateSide(input: CorridorSideEvaluationRequest): PinnedCorridorSideEvaluation;
}

/**
 * THE ROUTE COMPILATION PORT (stage 4): runs the REAL route compiler over
 * the pinned compiler input (the complete evidence surface) and returns
 * the pinned compilation result — plans, exclusions, observation version
 * pins and the compilation digest, all preserved verbatim.
 */
export interface RouteCompilationPort {
  compile(input: RouteCompilerInputPin): PinnedRouteCompilationResult;
}

/** The exact stage name a corridor side serves (the total projection). */
export function corridorSideStage(side: CorridorSide): RoutePlanningEngineStage {
  if (side === "SENDER") {
    return "stage-2:discover-sender-rails";
  }
  return "stage-3:discover-recipient-rails";
}

/**
 * The UNBOUND corridor projection port (fail closed): every call throws a
 * PortUnboundError naming the EXACT unbound stage for the requested side.
 * Never fabricates a view, never falls back, never returns partial data.
 */
export function unboundCorridorProjectionPort(): CorridorProjectionPort {
  return {
    evaluateSide(input: CorridorSideEvaluationRequest): PinnedCorridorSideEvaluation {
      throw new PortUnboundError(
        `the corridor projection engine is not bound for '${input.side}' rails — bind a real CorridorProjectionPort at the composition root (ADR-0009 D2: an unbound engine is an honest typed failure, never a fallback, never fabricated data)`,
        { stage: corridorSideStage(input.side), side: input.side },
      );
    },
  };
}

/**
 * The UNBOUND route compilation port (fail closed): every call throws a
 * PortUnboundError naming the exact unbound stage. Never fabricates
 * plans, never fabricates exclusions, never returns partial results.
 */
export function unboundRouteCompilationPort(): RouteCompilationPort {
  return {
    compile(input: RouteCompilerInputPin): PinnedRouteCompilationResult {
      void input;
      throw new PortUnboundError(
        "the route compiler engine is not bound — bind a real RouteCompilationPort at the composition root (ADR-0009 D2: an unbound engine is an honest typed failure, never a fallback, never fabricated plans)",
        { stage: "stage-4:compile-available-routes" as RoutePlanningEngineStage },
      );
    },
  };
}

/** Require an injected corridor port (fail closed on a missing binding). */
export function requireCorridorProjectionPort(
  candidate: unknown,
): CorridorProjectionPort {
  if (candidate === null || typeof candidate !== "object" || typeof (candidate as CorridorProjectionPort).evaluateSide !== "function") {
    throw new PortUnboundError(
      "a CorridorProjectionPort must be injected (an object implementing evaluateSide) — the rail snapshot never fabricates a corridor view",
      { stage: "stage-2:discover-sender-rails" as RoutePlanningEngineStage },
    );
  }
  return candidate as CorridorProjectionPort;
}

/** Require an injected compilation port (fail closed on a missing binding). */
export function requireRouteCompilationPort(candidate: unknown): RouteCompilationPort {
  if (candidate === null || typeof candidate !== "object" || typeof (candidate as RouteCompilationPort).compile !== "function") {
    throw new PortUnboundError(
      "a RouteCompilationPort must be injected (an object implementing compile) — the candidate enumeration never fabricates plans",
      { stage: "stage-4:compile-available-routes" as RoutePlanningEngineStage },
    );
  }
  return candidate as RouteCompilationPort;
}

/**
 * THE NODE-OFFER ADMISSION PORT (P27-D, ADR-0020 D5 — serves stages 2 and
 * 3): runs the REAL capability-lane node-offer admission chain (the
 * INV-13 seam: a verified node offer is revalidated against the ACCEPTING
 * authority's own provider evidence before it admits a route CANDIDATE
 * FACT). The request carries the side whose rail discovery the admission
 * serves; the unbound default names that side's exact stage.
 */
export interface NodeOfferAdmissionRequest {
  readonly side: CorridorSide;
  /** The verified offer wire (node-network's verification output, pinned). */
  readonly offer: PinnedVerifiedNodeOfferWire;
  /** The local connected-instance scope (layer 3 — the INV-13 surface). */
  readonly instance: PinnedInstanceScope;
  /** The local current observation (layer 4 — the freshness/eligibility evidence). */
  readonly observation: PinnedObservationScope;
}

export interface NodeOfferAdmissionPort {
  admitNodeOffer(request: NodeOfferAdmissionRequest): PinnedNodeOfferAdmission;
}

/**
 * The UNBOUND node-offer admission port (fail closed): every call throws a
 * PortUnboundError naming the EXACT unbound stage for the requested side.
 * Never fabricates a fact, never admits on a signature alone (provider
 * evidence stays decisive — §6), never returns partial results.
 */
export function unboundNodeOfferAdmissionPort(): NodeOfferAdmissionPort {
  return {
    admitNodeOffer(request: NodeOfferAdmissionRequest): PinnedNodeOfferAdmission {
      throw new PortUnboundError(
        `the node-offer admission engine is not bound for '${request.side}' rails — bind a real NodeOfferAdmissionPort at the composition root (ADR-0009 D2/ADR-0020 D5: an unbound engine is an honest typed failure; a node offer is never admitted without the real capability chain revalidating it against local provider evidence)`,
        { stage: corridorSideStage(request.side), side: request.side },
      );
    },
  };
}

/** Require an injected node-offer admission port (fail closed on a missing binding). */
export function requireNodeOfferAdmissionPort(
  candidate: unknown,
): NodeOfferAdmissionPort {
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    typeof (candidate as NodeOfferAdmissionPort).admitNodeOffer !== "function"
  ) {
    throw new PortUnboundError(
      "a NodeOfferAdmissionPort must be injected (an object implementing admitNodeOffer) — the rail snapshot never fabricates a node-offer admission",
      { stage: "stage-2:discover-sender-rails" as RoutePlanningEngineStage },
    );
  }
  return candidate as NodeOfferAdmissionPort;
}
