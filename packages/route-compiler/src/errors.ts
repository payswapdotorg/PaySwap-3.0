/**
 * @payswap/route-compiler — the error taxonomy (P5-W1).
 *
 * Every failure in this package is a typed, named error carrying a stable
 * machine code (the old-repo discipline, re-homed under the intelligence
 * layer). Validation failures never repair, never guess, never default —
 * they throw with the reason. A partial failure of a MULTI-part decision
 * (venue quote set, comparability gate) is never thrown mid-stream: the
 * decision carries the honest per-part results (UNKNOWN included) and only
 * malformed INPUTS fail closed (INV-C01/C02 — never success or failure
 * without a stated reason).
 */

/** Base class of every error this package throws (machine code + name). */
export class RouteCompilerError extends Error {
  readonly code: string;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "RouteCompilerError";
    this.code = code;
    if (details !== undefined) {
      (this as { details?: unknown }).details = details;
    }
  }
}

/** Fail-closed structural validation failure (never a repair). */
export class ValidationError extends RouteCompilerError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_FAILED", details);
    this.name = "ValidationError";
  }
}

/** A Money Movement Intent failed structural validation. */
export class InvalidMoneyMovementIntentError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyMovementIntentError";
  }
}

/** A route leg contract (custody / authorization / grounding / finality) failed validation. */
export class InvalidRouteLegContractError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRouteLegContractError";
  }
}

/** A route plan failed the plan-construction laws (hop order, continuity, evidence). */
export class InvalidRoutePlanError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRoutePlanError";
  }
}

/** A route shape family failed its assembly preconditions beyond honest exclusion. */
export class RouteCompilerInputError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "RouteCompilerInputError";
  }
}

/** A venue registration violated the registry law (duplicate id, declared-simulation-without-function). */
export class VenueRegistryError extends RouteCompilerError {
  constructor(message: string) {
    super(message, "VENUE_REGISTRY_FAILED");
    this.name = "VenueRegistryError";
  }
}

/** An onchain lane could not be discovered with the given inputs (fail-closed input class). */
export class OnchainLaneDiscoveryError extends RouteCompilerError {
  constructor(message: string) {
    super(message, "ONCHAIN_LANE_DISCOVERY_FAILED");
    this.name = "OnchainLaneDiscoveryError";
  }
}

/** An illegal quote-to-executed transition was attempted (the no-fake-quote seam). */
export class ExecutionTransitionError extends RouteCompilerError {
  constructor(message: string) {
    super(message, "EXECUTION_TRANSITION_FAILED");
    this.name = "ExecutionTransitionError";
  }
}

/** A stale (invalidated) route was pushed toward execution — re-run, never repair. */
export class RouteInvalidatedError extends RouteCompilerError {
  constructor(message: string) {
    super(message, "ROUTE_INVALIDATED");
    this.name = "RouteInvalidatedError";
  }
}

/** A Lab-tiered artifact was presented where a settleable artifact was demanded. */
export class LabTierSettlementRejectedError extends RouteCompilerError {
  constructor(message: string) {
    super(message, "LAB_TIER_SETTLEMENT_REJECTED");
    this.name = "LabTierSettlementRejectedError";
  }
}

/** A route walk was asked to walk an ineligible or malformed plan. */
export class RouteWalkError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "RouteWalkError";
  }
}

/** Deterministic identity helpers for the machine-code vocabulary. */
export const ROUTE_COMPILER_ERROR_CODES = Object.freeze([
  "VALIDATION_FAILED",
  "VENUE_REGISTRY_FAILED",
  "ONCHAIN_LANE_DISCOVERY_FAILED",
  "EXECUTION_TRANSITION_FAILED",
  "ROUTE_INVALIDATED",
  "LAB_TIER_SETTLEMENT_REJECTED",
] as const);

/** True iff the value is one of this package's errors (typed re-throw filters). */
export function isRouteCompilerError(value: unknown): value is RouteCompilerError {
  return value instanceof RouteCompilerError;
}
