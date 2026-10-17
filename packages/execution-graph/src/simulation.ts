/**
 * @payswap/execution-graph — the SIMULATION ENGINE (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/lab/src/simulation.ts, W2-004 engine half).
 *
 * INV-11: SIMULATION IS NOT PRODUCTION FINANCIAL AUTHORITY. Results are
 * namespaced, frozen and advisory; there is intentionally NO exported
 * conversion from a simulation result to any production-evidence type.
 *
 * Determinism: behaviour is a pure function of (scenario plan, world,
 * program, seed). The only pseudo-entropy is the caller-seeded splitmix64
 * PRNG (simulation-support.ts). Money is exact integer minor-unit bigint
 * arithmetic (INV-02) — no floating point in the financial results.
 */

import { ValidationError } from './errors.ts';
import { deepFreeze } from './canonical.ts';
import {
  DeterministicRandom,
  applyIncident,
  emptyMetrics,
  simulationDigest,
  type BatchRecord,
  type DeferredDemand,
  type IncidentEffects,
  type WorkingPool,
  type WorkingRail,
} from './simulation-support.ts';
import type {
  DemandOutcome,
  DemandOutcomeRecord,
  DemandPlan,
  ScenarioIncident,
  SimulationMetrics,
  SimulationRunInput,
  SimulationRunResult,
} from './simulation-contract.ts';
import { SIMULATION_NAMESPACE } from './simulation-contract.ts';

/**
 * Runs one deterministic simulation. Same (scenario, world, program, seed)
 * -> deep-equal result, always. Inputs are never mutated; the result is
 * deep-frozen and namespaced (INV-11).
 */
export function runSimulation(input: SimulationRunInput): SimulationRunResult {
  const { scenario, world, program, seed } = input;
  if (scenario === null || typeof scenario !== 'object') {
    throw new ValidationError('a simulation scenario plan is required');
  }
  if (world === null || typeof world !== 'object') {
    throw new ValidationError('a simulated world is required');
  }
  const random = new DeterministicRandom(`${seed}:${scenario.scenarioId}`);

  const rails = new Map<string, WorkingRail>();
  for (const rail of world.rails) {
    rails.set(rail.railId, {
      railId: rail.railId,
      currency: rail.currency,
      latencyMs: rail.latencyMs,
      fixedFeeMinor: rail.fixedFeeMinor,
      variableFeeBps: rail.variableFeeBps,
      fxSpreadBps: rail.fxSpreadBps ?? 0n,
      available: true,
      degraded: false,
      pendingUnknown: false,
    });
  }
  const pools = new Map<string, WorkingPool>();
  for (const pool of world.pools) {
    pools.set(pool.poolId, {
      poolId: pool.poolId,
      railId: pool.railId,
      availableMinor: pool.availableMinor,
    });
  }

  const effects: IncidentEffects = { fxExtraBps: 0n, congestionMs: 0, approvalDelayMs: 0 };
  const metrics = emptyMetrics();
  metrics.totalDemands = scenario.demands.length;

  const outcomes: DemandOutcomeRecord[] = [];

  // -- schedule demands: immediate or deferred into a batching window ------
  const deferred: DeferredDemand[] = [];
  const immediate: DemandPlan[] = [];
  const window =
    program.useNetting || program.delayToleranceSteps > 0 ? program.delayToleranceSteps : 0;
  for (const demand of scenario.demands) {
    // Adversarial screening (fraud/collusion/malicious/gaming) happens at
    // arrival, before any routing.
    if (program.fraudScreening === true && demand.adversarial !== undefined) {
      metrics.blockedAdversarial += 1;
      outcomes.push({
        demandId: demand.demandId,
        outcome: 'BLOCKED_FRAUD',
        effectiveStep: demand.atStep,
        latencyMs: 0,
        movedMinor: 0n,
        feesMinor: 0n,
      });
      continue;
    }
    if (window > 0) {
      deferred.push({
        demand,
        effectiveStep: demand.atStep + window,
        deferredSteps: window,
      });
      metrics.liquidityLockedMinor += demand.amountMinor;
    } else {
      immediate.push(demand);
    }
  }
  const pending: DeferredDemand[] = [...deferred];

  const lastDemandStep = scenario.demands.reduce((max, demand) => Math.max(max, demand.atStep), 0);
  const horizon = lastDemandStep + window + 1;
  const batches: BatchRecord[] = [];

  const poolForRail = (railId: string): WorkingPool | undefined => {
    for (const pool of pools.values()) {
      if (pool.railId === railId) {
        return pool;
      }
    }
    return undefined;
  };

  const chooseRail = (
    demand: DemandPlan,
  ): { rail: WorkingRail; usedCreditMinor: bigint } | undefined => {
    // Pass 1: currency-matching rails only (no FX). Pass 2: fall back to
    // cross-currency rails, which convert at their spread (exact bigint
    // minor units, INV-02).
    const tryRails = (
      matchingOnly: boolean,
    ): { rail: WorkingRail; usedCreditMinor: bigint } | undefined => {
      for (const railId of program.routePreference) {
        const rail = rails.get(railId);
        if (rail === undefined || !rail.available) {
          continue;
        }
        if (matchingOnly && rail.currency !== demand.currency) {
          continue;
        }
        const pool = poolForRail(rail.railId);
        if (pool !== undefined && pool.availableMinor < demand.amountMinor) {
          if (program.useNetworkCredit) {
            const gap = demand.amountMinor - pool.availableMinor;
            pool.availableMinor = 0n;
            return { rail, usedCreditMinor: gap };
          }
          continue; // insufficient liquidity without credit -> next rail
        }
        if (pool !== undefined) {
          pool.availableMinor -= demand.amountMinor;
        }
        return { rail, usedCreditMinor: 0n };
      }
      return undefined;
    };
    return tryRails(true) ?? tryRails(false);
  };

  const settleOne = (demand: DemandPlan, effectiveStep: number, deferredSteps: number): void => {
    const chosen = chooseRail(demand);
    if (chosen === undefined) {
      outcomes.push({
        demandId: demand.demandId,
        outcome: 'FAILED_NO_VIABLE_ROUTE',
        effectiveStep,
        latencyMs: 0,
        movedMinor: 0n,
        feesMinor: 0n,
      });
      metrics.failedNoViableRoute += 1;
      return;
    }
    const { rail, usedCreditMinor } = chosen;
    metrics.creditExposureMinor += usedCreditMinor;

    const conversion = rail.currency !== demand.currency;
    const conversionSpreadBps = conversion ? rail.fxSpreadBps + effects.fxExtraBps : 0n;
    const variableBps = rail.variableFeeBps;

    let movedMinor = demand.amountMinor;
    let outcome: DemandOutcome = 'SETTLED';
    if (demand.partialBps !== undefined) {
      movedMinor = (demand.amountMinor * demand.partialBps) / 10_000n;
      outcome = 'PARTIALLY_SETTLED';
    }

    const fees =
      rail.fixedFeeMinor + (movedMinor * (variableBps + conversionSpreadBps)) / 10_000n;
    const fxSpread = (movedMinor * conversionSpreadBps) / 10_000n;

    const jitterMs = random.nextBounded(101);
    const latencyMs =
      rail.latencyMs + effects.congestionMs + deferredSteps * world.stepLatencyMs + jitterMs;

    if (rail.pendingUnknown) {
      // The external write is delayed: the outcome is UNKNOWN and requires
      // reconciliation (INV-04: UNKNOWN is never FAILED and never success).
      outcomes.push({
        demandId: demand.demandId,
        outcome: 'UNKNOWN_REQUIRES_RECONCILIATION',
        railId: rail.railId,
        effectiveStep,
        latencyMs,
        movedMinor: 0n,
        feesMinor: fees,
      });
      metrics.unknownOutcomes += 1;
      metrics.feesMinor += fees;
      return;
    }

    if (demand.requiresApproval === true) {
      const approvalLatency = latencyMs + effects.approvalDelayMs;
      if (approvalLatency > demand.deadlineMs) {
        // A pending customer approval is a legitimate waiting terminal
        // state, not a failure and not UNKNOWN.
        outcomes.push({
          demandId: demand.demandId,
          outcome: 'USER_ACTION_REQUIRED',
          railId: rail.railId,
          effectiveStep,
          latencyMs: approvalLatency,
          movedMinor: 0n,
          feesMinor: 0n,
        });
        metrics.userActionRequired += 1;
        return;
      }
    }

    if (latencyMs > demand.deadlineMs) {
      outcomes.push({
        demandId: demand.demandId,
        outcome: 'EXPIRED',
        railId: rail.railId,
        effectiveStep,
        latencyMs,
        movedMinor: 0n,
        feesMinor: 0n,
      });
      metrics.expired += 1;
      metrics.deadlineMisses += 1;
      return;
    }

    if (outcome === 'SETTLED') {
      metrics.settled += 1;
      if (demand.adversarial !== undefined) {
        metrics.adversarialSettled += 1;
      }
      if (program.authorizationMode === 'DECLARED_BYPASS') {
        metrics.authorizationBypassEvents += 1;
      }
    } else {
      metrics.partiallySettled += 1;
    }

    batches.push({
      railId: rail.railId,
      effectiveStep,
      outboundMinor: demand.direction === 'OUTBOUND' ? movedMinor : 0n,
      inboundMinor: demand.direction === 'INBOUND' ? movedMinor : 0n,
      fixedFeeMinor: rail.fixedFeeMinor,
      variableFeesMinor: (movedMinor * (variableBps + conversionSpreadBps)) / 10_000n,
      fxSpreadPaidMinor: fxSpread,
    });
    outcomes.push({
      demandId: demand.demandId,
      outcome,
      railId: rail.railId,
      effectiveStep,
      latencyMs,
      movedMinor,
      feesMinor: fees,
    });
    metrics.totalLatencyMs += latencyMs;
    if (rail.degraded) {
      metrics.degradedRouteExposureMinor += movedMinor;
    }
  };

  // Merge same-(rail, step) batches when netting is enabled: internalized
  // value never moves externally (economic compression).
  const coalesceBatches = (): void => {
    if (!program.useNetting) {
      for (const batch of batches) {
        metrics.externalValueMovedMinor += batch.outboundMinor + batch.inboundMinor;
        metrics.feesMinor += batch.fixedFeeMinor + batch.variableFeesMinor;
        metrics.fxSpreadPaidMinor += batch.fxSpreadPaidMinor;
        metrics.hops += 1;
      }
      return;
    }
    const groups = new Map<string, BatchRecord[]>();
    for (const batch of batches) {
      const key = `${batch.railId}@${batch.effectiveStep}`;
      const list = groups.get(key) ?? [];
      list.push(batch);
      groups.set(key, list);
    }
    for (const group of groups.values()) {
      const first = group[0];
      if (first === undefined) {
        continue;
      }
      const outboundMinor = group.reduce((sum, b) => sum + b.outboundMinor, 0n);
      const inboundMinor = group.reduce((sum, b) => sum + b.inboundMinor, 0n);
      const internalized = 2n * (outboundMinor < inboundMinor ? outboundMinor : inboundMinor);
      metrics.nettedInternallyMinor += internalized;
      metrics.externalValueMovedMinor += outboundMinor + inboundMinor - internalized;
      metrics.feesMinor += group.reduce((sum, b) => sum + b.fixedFeeMinor + b.variableFeesMinor, 0n);
      metrics.fxSpreadPaidMinor += group.reduce((sum, b) => sum + b.fxSpreadPaidMinor, 0n);
      metrics.hops += 1;
    }
  };

  const incidentsByStep = new Map<number, ScenarioIncident[]>();
  for (const incident of scenario.incidents) {
    const list = incidentsByStep.get(incident.atStep) ?? [];
    list.push(incident);
    incidentsByStep.set(incident.atStep, list);
  }

  const processDemand = (demand: DemandPlan, effectiveStep: number, deferredSteps: number): void => {
    // Privacy discipline: a program that is not privacy-bounded pulls more
    // context than the minimum required for every demand it processes.
    if (program.privacyBounded === false) {
      metrics.privacyViolations += 1;
    }
    settleOne(demand, effectiveStep, deferredSteps);
  };

  for (let step = 0; step <= horizon; step += 1) {
    const incidents = incidentsByStep.get(step) ?? [];
    for (const incident of incidents) {
      applyIncident(incident, rails, pools, effects);
    }
    for (const demand of immediate) {
      if (demand.atStep === step) {
        processDemand(demand, step, 0);
      }
    }
    for (const entry of pending) {
      if (entry.effectiveStep === step) {
        processDemand(entry.demand, entry.effectiveStep, entry.deferredSteps);
      }
    }
  }

  coalesceBatches();

  const frozenMetrics: SimulationMetrics = deepFreeze({ ...metrics }) as SimulationMetrics;
  const frozenOutcomes = deepFreeze([...outcomes]) as readonly DemandOutcomeRecord[];
  const digest = simulationDigest(scenario.scenarioId, program, seed, frozenMetrics, frozenOutcomes);

  return deepFreeze({
    namespace: SIMULATION_NAMESPACE,
    __payswapSimulationNamespace: SIMULATION_NAMESPACE,
    scenarioId: scenario.scenarioId,
    programId: program.programId,
    programVersion: program.programVersion,
    seed,
    digest,
    metrics: frozenMetrics,
    outcomes: frozenOutcomes,
  }) as SimulationRunResult;
}
