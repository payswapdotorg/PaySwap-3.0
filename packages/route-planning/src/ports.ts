/**
 * @payswap/route-planning — the fail-closed injected engine ports
 * (P16-A, ADR-0009 D2).
 *
 * THE COMPOSITION LAW: this package's src NEVER imports a sibling
 * package. Every REAL engine (the capability lane's corridor projection,
 * the route compiler) is reached ONLY through these INJECTED PORTS, and
 * every DEFAULT implementation here FAILS CLOSED with a typed
 * PortUnboundError carrying the EXACT unbound stage name. No default may
 * fabricate data, fall back, or return partial results — an unbound
 * engine is an honest typed error, never an LLM-only routing fallback
 * (the ROUTINE-CONTRACT acceptance law). The REAL engines are bound at
 * the TEST tier (relative cross-package imports — the established
 * pattern) and later at the platform host's composition root.
 */

import { PortUnboundError } from "./errors.ts";
import type { PinnedCorridorQuery, PinnedCorridorRouteChain, PinnedCorridorSideEvaluation } from "./pins/capability.ts";
import type { PinnedObservationFreshnessPolicy } from "./pins/capability.ts";
import type { PinnedRouteCompilationResult } from "./pins/route-compiler.ts";
import type { RouteCompilerInputPin } from "./pins/route-compiler-input.ts";

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
