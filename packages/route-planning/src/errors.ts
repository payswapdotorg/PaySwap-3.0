/**
 * @payswap/route-planning — the error taxonomy (P16-A).
 *
 * Every failure in this package is a typed, named error carrying a stable
 * machine code (the route-compiler errors.ts discipline, re-homed here):
 * validation failures never repair, never guess, never default — they
 * throw with the reason and a frozen details payload. The port-unbound
 * error is the ADR-0009 D2 fail-closed seam: an unbound engine is an
 * honest typed error naming the EXACT unbound stage, never a fallback,
 * never fabricated data, never a partial result.
 */

/** Base class of every error this package throws (machine code + frozen details). */
export class RoutePlanningError extends Error {
  readonly code: string;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "RoutePlanningError";
    this.code = code;
    if (details !== undefined) {
      (this as { details?: unknown }).details = details;
    }
  }
}

/** Fail-closed structural validation failure (never a repair). */
export class RoutePlanningValidationError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "ROUTE_PLANNING_VALIDATION_FAILED", details);
    this.name = "RoutePlanningValidationError";
  }
}

/**
 * An injected engine (port) was invoked while UNBOUND (ADR-0009 D2). The
 * details carry the exact unbound stage name — the caller sees precisely
 * which routine stage failed to bind its real engine.
 */
export class PortUnboundError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "PORT_UNBOUND", details);
    this.name = "PortUnboundError";
  }
}

/** A search budget violated the bounded-search law (ADR-0009 D6). */
export class RouteSearchBudgetError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "ROUTE_SEARCH_BUDGET_FAILED", details);
    this.name = "RouteSearchBudgetError";
  }
}

/** A rail-snapshot derivation violated its per-side independence laws. */
export class RailSnapshotError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "RAIL_SNAPSHOT_FAILED", details);
    this.name = "RailSnapshotError";
  }
}

/**
 * A provider CATALOGUE entry was presented where a ConnectedCapabilityInstance
 * is required (INV-13 — catalogue claims never qualify a rail).
 */
export class CatalogueRailRejectedError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "CATALOGUE_RAIL_REJECTED", details);
    this.name = "CatalogueRailRejectedError";
  }
}

/** A candidate enumeration violated the composition laws. */
export class CandidateEnumerationError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "CANDIDATE_ENUMERATION_FAILED", details);
    this.name = "CandidateEnumerationError";
  }
}

/** A hard-gate evaluation violated the gates-before-ranking law. */
export class HardGateError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "HARD_GATE_FAILED", details);
    this.name = "HardGateError";
  }
}

/** A ranking projection violated the deterministic ordering laws. */
export class RouteRankingError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "ROUTE_RANKING_FAILED", details);
    this.name = "RouteRankingError";
  }
}

/**
 * A cross-provider corridor plan-level law was violated (P22-C,
 * ADR-0016 D6/D11): a leg outside the pinned skeleton, a silently
 * skipped leg, a later leg dispatched after an earlier leg's
 * non-CONFIRMED outcome (the custody-continuity law), or a corridor
 * demand riding a non-corridor direction class / hop bound.
 */
export class CorridorPlanLawError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "CORRIDOR_PLAN_LAW_FAILED", details);
    this.name = "CorridorPlanLawError";
  }
}

/** The closed machine-code vocabulary (frozen; stable identities). */
export const ROUTE_PLANNING_ERROR_CODES = Object.freeze([
  "ROUTE_PLANNING_VALIDATION_FAILED",
  "PORT_UNBOUND",
  "ROUTE_SEARCH_BUDGET_FAILED",
  "RAIL_SNAPSHOT_FAILED",
  "CATALOGUE_RAIL_REJECTED",
  "CANDIDATE_ENUMERATION_FAILED",
  "HARD_GATE_FAILED",
  "ROUTE_RANKING_FAILED",
  // P22-C growth (ADR-0016 D6/D11): the corridor plan-level laws.
  "CORRIDOR_PLAN_LAW_FAILED",
] as const);

/** True iff the value is one of this package's errors (typed re-throw filters). */
export function isRoutePlanningError(value: unknown): value is RoutePlanningError {
  return value instanceof RoutePlanningError;
}
