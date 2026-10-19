/**
 * Simulation outcomes and metrics (P6-W1; the P6 rebuild of the old
 * payswap.org@8a735bf packages/lab simulation.ts outcomes section,
 * W2-004).
 *
 * The failure taxonomy honours canonical INV-4: UNKNOWN is distinct from
 * FAILED and is reconciled rather than blindly retried — a delayed write
 * yields UNKNOWN_REQUIRES_RECONCILIATION, never a failure; a pending
 * customer approval is USER_ACTION_REQUIRED, neither failure nor success.
 *
 * All money-like metrics are exact bigint minor units (INV-2). All
 * results carry the SIMULATION namespace brand (INV-L01 / canonical
 * INV-11) so they can never be confused with production evidence — there
 * is intentionally NO exported conversion from a simulation result to any
 * production-evidence type.
 */

import type {
  SimulatedWorld,
} from "./simulation-world.ts";
import type {
  SimulationProgram,
  SimulationScenarioPlan,
} from "./simulation-plan.ts";

// ---------------------------------------------------------------------------
// The simulation namespace (INV-L01)
// ---------------------------------------------------------------------------

export const SIMULATION_NAMESPACE = "PAYSWAP_LAB_SIMULATION" as const;

/**
 * Phantom brand carried by every simulation result. It exists only at the
 * type level so a SimulationRunResult is structurally distinct from any
 * production evidence artifact and cannot be assigned where production
 * evidence is demanded (INV-L01).
 */
export interface SimulationNamespaceBrand {
  readonly __payswapLabSimulationNamespace: typeof SIMULATION_NAMESPACE;
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/**
 * The per-demand outcome taxonomy. UNKNOWN_REQUIRES_RECONCILIATION is
 * first-class (INV-4); BLOCKED_FRAUD is the screened-adversarial exit;
 * USER_ACTION_REQUIRED is a legitimate waiting terminal state.
 */
export type DemandOutcome =
  | "SETTLED"
  | "PARTIALLY_SETTLED"
  | "FAILED_NO_VIABLE_ROUTE"
  | "UNKNOWN_REQUIRES_RECONCILIATION"
  | "USER_ACTION_REQUIRED"
  | "BLOCKED_FRAUD"
  | "EXPIRED";

/** The per-demand outcome vocabulary (INV-4 discipline). */
export const DEMAND_OUTCOMES: readonly DemandOutcome[] = [
  "SETTLED",
  "PARTIALLY_SETTLED",
  "FAILED_NO_VIABLE_ROUTE",
  "UNKNOWN_REQUIRES_RECONCILIATION",
  "USER_ACTION_REQUIRED",
  "BLOCKED_FRAUD",
  "EXPIRED",
];

/** Total predicate over the demand-outcome vocabulary. */
export function isDemandOutcome(value: unknown): value is DemandOutcome {
  return (
    typeof value === "string" &&
    (DEMAND_OUTCOMES as readonly unknown[]).includes(value)
  );
}

/** One demand's terminal outcome record inside a run. */
export interface DemandOutcomeRecord {
  readonly demandId: string;
  readonly outcome: DemandOutcome;
  readonly railId?: string;
  readonly effectiveStep: number;
  readonly latencyMs: number;
  readonly movedMinor: bigint;
  readonly feesMinor: bigint;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Exact economic/work metrics of a run (LAB.md "Evaluation"). All money is
 * bigint minor units — never floating point (INV-2).
 */
export interface SimulationMetrics {
  readonly totalDemands: number;
  readonly settled: number;
  readonly partiallySettled: number;
  readonly failedNoViableRoute: number;
  readonly unknownOutcomes: number;
  readonly userActionRequired: number;
  readonly blockedAdversarial: number;
  readonly expired: number;
  /**
   * Adversarial (fraud/collusion/malicious/gaming) demands that settled —
   * a compliance hard-constraint failure.
   */
  readonly adversarialSettled: number;
  readonly deadlineMisses: number;
  readonly externalValueMovedMinor: bigint;
  readonly nettedInternallyMinor: bigint;
  readonly hops: number;
  readonly liquidityLockedMinor: bigint;
  readonly feesMinor: bigint;
  readonly fxSpreadPaidMinor: bigint;
  readonly totalLatencyMs: number;
  readonly degradedRouteExposureMinor: bigint;
  readonly creditExposureMinor: bigint;
  readonly authorizationBypassEvents: number;
  readonly privacyViolations: number;
}

/** Every field of SimulationMetrics except the readonly modifier. */
export type MutableSimulationMetrics = {
  -readonly [K in keyof SimulationMetrics]: SimulationMetrics[K];
};

/** A fresh all-zero metrics record (the engine's starting point). */
export function emptyMetrics(): MutableSimulationMetrics {
  return {
    totalDemands: 0,
    settled: 0,
    partiallySettled: 0,
    failedNoViableRoute: 0,
    unknownOutcomes: 0,
    userActionRequired: 0,
    blockedAdversarial: 0,
    expired: 0,
    adversarialSettled: 0,
    deadlineMisses: 0,
    externalValueMovedMinor: 0n,
    nettedInternallyMinor: 0n,
    hops: 0,
    liquidityLockedMinor: 0n,
    feesMinor: 0n,
    fxSpreadPaidMinor: 0n,
    totalLatencyMs: 0,
    degradedRouteExposureMinor: 0n,
    creditExposureMinor: 0n,
    authorizationBypassEvents: 0,
    privacyViolations: 0,
  };
}

// ---------------------------------------------------------------------------
// Run results (namespaced — INV-L01)
// ---------------------------------------------------------------------------

/** Input accepted by `runSimulation`. */
export interface SimulationRunInput {
  readonly scenario: SimulationScenarioPlan;
  readonly world: SimulatedWorld;
  readonly program: SimulationProgram;
  readonly seed: string;
}

/**
 * A namespaced, frozen, deterministic simulation run result (INV-11: test
 * evidence only — never production financial authority).
 */
export interface SimulationRunResult extends SimulationNamespaceBrand {
  readonly namespace: typeof SIMULATION_NAMESPACE;
  readonly scenarioId: string;
  readonly programId: string;
  readonly programVersion: string;
  readonly seed: string;
  /** Deterministic digest over (scenario, program id+version, seed, outcomes). */
  readonly digest: string;
  readonly metrics: SimulationMetrics;
  readonly outcomes: readonly DemandOutcomeRecord[];
}

/**
 * Runtime guard: is this value a namespaced simulation result? (INV-L01
 * structural isolation — a plain object without the double namespace
 * markers is not a simulation result.)
 */
export function isSimulationResult(
  value: unknown,
): value is SimulationRunResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SimulationRunResult>;
  return (
    candidate.namespace === SIMULATION_NAMESPACE &&
    candidate.__payswapLabSimulationNamespace === SIMULATION_NAMESPACE &&
    typeof candidate.scenarioId === "string" &&
    typeof candidate.digest === "string" &&
    typeof candidate.metrics === "object" &&
    candidate.metrics !== null &&
    Array.isArray(candidate.outcomes)
  );
}
