/**
 * @payswap/execution-graph — SIMULATION contracts (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/lab/src/simulation.ts, W2-004).
 *
 * INV-11 (canonical): SIMULATION IS NOT PRODUCTION FINANCIAL AUTHORITY.
 * Every simulation result is branded with the SIMULATION namespace so it can
 * never be confused with production evidence — there is intentionally NO
 * exported conversion from a simulation result to any production-evidence
 * type.
 *
 * Determinism law: behaviour is a pure function of (scenario plan, world,
 * program, seed). No ambient clock, no entropy source, no timers — the only
 * pseudo-entropy is a splitmix64 PRNG seeded from the caller-supplied seed
 * string. Money is exact integer minor-unit bigint arithmetic (INV-02); no
 * floating point anywhere in the financial results.
 */

import type { StrategyProgram } from './strategy-contract.ts';

/** The namespace brand every simulation result carries (INV-11). */
export const SIMULATION_NAMESPACE = 'PAYSWAP_EXECUTION_GRAPH_SIMULATION' as const;

/**
 * Phantom brand carried by every simulation result — exists only at the type
 * level so a SimulationRunResult is structurally distinct from any
 * production evidence artifact.
 */
export interface SimulationNamespaceBrand {
  readonly __payswapSimulationNamespace: typeof SIMULATION_NAMESPACE;
}

/** One simulated payment rail with exact economics (bigint minor units). */
export interface SimulatedRail {
  readonly railId: string;
  /** Currency the rail settles in (may differ from the demand currency -> FX). */
  readonly currency: string;
  readonly latencyMs: number;
  readonly fixedFeeMinor: bigint;
  /** Variable fee in basis points of the moved amount. */
  readonly variableFeeBps: bigint;
  /** Base FX spread (basis points) charged when converting into the rail currency. */
  readonly fxSpreadBps?: bigint;
}

/** One simulated liquidity pool backing a rail. */
export interface SimulatedLiquidityPool {
  readonly poolId: string;
  readonly railId: string;
  readonly availableMinor: bigint;
}

/** The simulated world a scenario runs against. Inputs are never mutated. */
export interface SimulatedWorld {
  readonly worldId: string;
  readonly baseCurrency: string;
  /** Latency added per deferred step when a program delays/batches. */
  readonly stepLatencyMs: number;
  readonly rails: readonly SimulatedRail[];
  readonly pools: readonly SimulatedLiquidityPool[];
}

/** Demand direction (netting coalesces opposite directions). */
export type DemandDirection = 'OUTBOUND' | 'INBOUND';

/**
 * The adversarial demand taxonomy the scenario generator must cover (fraud,
 * collusion, malicious agents, incentive gaming). A screened program blocks
 * all of them; a program that lets one settle fails the evaluator's
 * COMPLIANCE hard constraint.
 */
export const ADVERSARIAL_DEMAND_KINDS = [
  'FRAUD',
  'COLLUSION',
  'MALICIOUS_AGENT',
  'INCENTIVE_GAMING',
] as const;

export type AdversarialDemandKind = (typeof ADVERSARIAL_DEMAND_KINDS)[number];

/** Total predicate over the adversarial taxonomy. */
export function isAdversarialDemandKind(value: unknown): value is AdversarialDemandKind {
  return (
    typeof value === 'string' &&
    (ADVERSARIAL_DEMAND_KINDS as readonly unknown[]).includes(value)
  );
}

/** One planned money-movement demand arriving into the simulated world. */
export interface DemandPlan {
  readonly demandId: string;
  readonly atStep: number;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly direction: DemandDirection;
  readonly deadlineMs: number;
  /** Fraudulent/colluding/malicious/gaming demand; screened programs block it. */
  readonly adversarial?: AdversarialDemandKind;
  /** Provider executes only this fraction (basis points of the amount). */
  readonly partialBps?: bigint;
  /** Demand gated on a customer approval arriving via the approval surface. */
  readonly requiresApproval?: boolean;
}

/** The incident taxonomy a scenario may inject. */
export type ScenarioIncident =
  | {
      readonly incidentType: 'PROVIDER_OUTAGE';
      readonly atStep: number;
      readonly railId: string;
    }
  | {
      readonly incidentType: 'LIQUIDITY_SHORTAGE';
      readonly atStep: number;
      readonly poolId: string;
      readonly drainedMinor: bigint;
    }
  | {
      readonly incidentType: 'FX_VOLATILITY';
      readonly atStep: number;
      readonly spreadIncreaseBps: bigint;
    }
  | {
      readonly incidentType: 'CONGESTION';
      readonly atStep: number;
      readonly addedLatencyMs: number;
    }
  | {
      /** In-flight writes on the rail become UNKNOWN (requires reconciliation). */
      readonly incidentType: 'DELAYED_WRITE';
      readonly atStep: number;
      readonly railId: string;
    }
  | {
      readonly incidentType: 'APPROVAL_DELAY';
      readonly atStep: number;
      readonly delayMs: number;
    };

/** A scenario plan: normal demands plus injected incidents. */
export interface SimulationScenarioPlan {
  readonly scenarioId: string;
  readonly description?: string;
  readonly demands: readonly DemandPlan[];
  readonly incidents: readonly ScenarioIncident[];
}

/** The outcome taxonomy per demand (INV-04: UNKNOWN is not FAILED). */
export type DemandOutcome =
  | 'SETTLED'
  | 'PARTIALLY_SETTLED'
  | 'FAILED_NO_VIABLE_ROUTE'
  | 'UNKNOWN_REQUIRES_RECONCILIATION'
  | 'USER_ACTION_REQUIRED'
  | 'BLOCKED_FRAUD'
  | 'EXPIRED';

/** One demand's outcome record within a run. */
export interface DemandOutcomeRecord {
  readonly demandId: string;
  readonly outcome: DemandOutcome;
  readonly railId?: string;
  readonly effectiveStep: number;
  readonly latencyMs: number;
  readonly movedMinor: bigint;
  readonly feesMinor: bigint;
}

/**
 * Exact economic/work metrics of a run. All money is bigint minor units —
 * never floating point (INV-02).
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
  /** Adversarial demands that settled — a compliance hard-constraint failure. */
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

/** Input accepted by `runSimulation`. */
export interface SimulationRunInput {
  readonly scenario: SimulationScenarioPlan;
  readonly world: SimulatedWorld;
  readonly program: StrategyProgram;
  readonly seed: string;
}

/** A namespaced, frozen, deterministic simulation run result (INV-11). */
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
