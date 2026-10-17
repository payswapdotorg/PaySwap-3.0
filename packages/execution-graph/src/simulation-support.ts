/**
 * @payswap/execution-graph — simulation support (P3-W2; split from the
 * engine to honor the file-size law; ADAPT of the old lab simulation
 * internals, payswap.org@8a735bf packages/lab/src/simulation.ts).
 *
 * INV-11: the namespace brand and the runtime guard live here; there is
 * intentionally NO exported conversion from a simulation result to any
 * production-evidence type.
 */

import { canonicalDigest } from './canonical.ts';
import type {
  DemandOutcomeRecord,
  DemandPlan,
  MutableSimulationMetrics,
  ScenarioIncident,
  SimulationMetrics,
  SimulationRunResult,
} from './simulation-contract.ts';
import { SIMULATION_NAMESPACE } from './simulation-contract.ts';
import type { StrategyProgram } from './strategy-contract.ts';

const MASK64 = 0xffff_ffff_ffff_ffffn;

/** The ONLY entropy source: a caller-seeded splitmix64 PRNG. */
export class DeterministicRandom {
  #state: bigint;

  constructor(seed: string) {
    let hash = 0xcbf2_9ce4_8422_2325n;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= BigInt(seed.charCodeAt(index) & 0xff);
      hash = (hash * 0x100_0000_01b3n) & MASK64;
    }
    this.#state = hash & MASK64;
  }

  nextUint64(): bigint {
    this.#state = (this.#state + 0x9e37_79b9_7f4a_7c15n) & MASK64;
    let z = this.#state;
    z = ((z ^ (z >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d0_49bb_1331_11ebn) & MASK64;
    return z ^ (z >> 31n);
  }

  /** Deterministic bounded jitter in [0, maxExclusive). */
  nextBounded(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      return 0;
    }
    return Number(this.nextUint64() % BigInt(maxExclusive));
  }
}

/** Deterministic digest of a simulation run's truth-relevant content. */
export function simulationDigest(
  scenarioId: string,
  program: StrategyProgram,
  seed: string,
  metrics: SimulationMetrics,
  outcomes: readonly DemandOutcomeRecord[],
): string {
  return canonicalDigest({
    binding: 'simulation-run',
    scenarioId,
    program: {
      programId: program.programId,
      programVersion: program.programVersion,
      routePreference: [...program.routePreference],
      useNetting: program.useNetting,
      useNetworkCredit: program.useNetworkCredit,
      delayToleranceSteps: program.delayToleranceSteps,
      fraudScreening: program.fraudScreening,
      privacyBounded: program.privacyBounded,
      authorizationMode: program.authorizationMode,
    },
    seed,
    metrics,
    outcomes,
  });
}

/** Runtime guard: is this value a namespaced simulation result (INV-11)? */
export function isSimulationResult(value: unknown): value is SimulationRunResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<SimulationRunResult>;
  return (
    candidate.namespace === SIMULATION_NAMESPACE &&
    candidate.__payswapSimulationNamespace === SIMULATION_NAMESPACE &&
    typeof candidate.scenarioId === 'string' &&
    typeof candidate.digest === 'string' &&
    typeof candidate.metrics === 'object' &&
    candidate.metrics !== null &&
    Array.isArray(candidate.outcomes)
  );
}

/** Mutable working copies of the simulated rails/pools (engine internals). */
export interface WorkingRail {
  readonly railId: string;
  readonly currency: string;
  readonly latencyMs: number;
  readonly fixedFeeMinor: bigint;
  readonly variableFeeBps: bigint;
  readonly fxSpreadBps: bigint;
  available: boolean;
  degraded: boolean;
  pendingUnknown: boolean;
}

export interface WorkingPool {
  readonly poolId: string;
  readonly railId: string;
  availableMinor: bigint;
}

export interface DeferredDemand {
  readonly demand: DemandPlan;
  readonly effectiveStep: number;
  readonly deferredSteps: number;
}

export interface BatchRecord {
  readonly railId: string;
  readonly effectiveStep: number;
  readonly outboundMinor: bigint;
  readonly inboundMinor: bigint;
  readonly fixedFeeMinor: bigint;
  readonly variableFeesMinor: bigint;
  readonly fxSpreadPaidMinor: bigint;
}

/** A fresh zeroed metrics accumulator (all counts 0, all money 0n). */
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

/** Mutable incident effects accumulator (the engine's world-level state). */
export interface IncidentEffects {
  fxExtraBps: bigint;
  congestionMs: number;
  approvalDelayMs: number;
}

/** Apply one scenario incident to the working world (deterministic). */
export function applyIncident(
  incident: ScenarioIncident,
  rails: ReadonlyMap<string, WorkingRail>,
  pools: ReadonlyMap<string, WorkingPool>,
  effects: IncidentEffects,
): void {
  switch (incident.incidentType) {
    case 'PROVIDER_OUTAGE': {
      const rail = rails.get(incident.railId);
      if (rail !== undefined) {
        rail.available = false;
      }
      break;
    }
    case 'LIQUIDITY_SHORTAGE': {
      const pool = pools.get(incident.poolId);
      if (pool !== undefined) {
        pool.availableMinor =
          pool.availableMinor > incident.drainedMinor
            ? pool.availableMinor - incident.drainedMinor
            : 0n;
      }
      break;
    }
    case 'FX_VOLATILITY': {
      effects.fxExtraBps += incident.spreadIncreaseBps;
      break;
    }
    case 'CONGESTION': {
      effects.congestionMs += incident.addedLatencyMs;
      for (const rail of rails.values()) {
        rail.degraded = true;
      }
      break;
    }
    case 'DELAYED_WRITE': {
      const rail = rails.get(incident.railId);
      if (rail !== undefined) {
        rail.pendingUnknown = true;
      }
      break;
    }
    case 'APPROVAL_DELAY': {
      effects.approvalDelayMs += incident.delayMs;
      break;
    }
  }
}

