/**
 * The simulation ENGINE scheduler (P6-W1; the P6 rebuild of the old
 * payswap.org@8a735bf packages/lab simulation.ts engine body, W2-004).
 *
 * INV-L01 / canonical INV-11 — SIMULATION IS NOT PRODUCTION TRUTH: this
 * module and its family import ONLY deterministic local utilities — never
 * any pin, seam, rail adapter, connector execution, ledger or
 * authorization code. No export path from here reaches production.
 *
 * Structure: schedule demands (immediate or deferred into a batching
 * window, adversarial screening at arrival) -> apply incidents step by
 * step (outage / liquidity drain / FX volatility / congestion / delayed
 * write / approval delay / stale observation) -> settle each demand
 * through the settle machinery (simulation-settle.ts) -> coalesce batches
 * when netting is enabled. Deterministic by construction: behaviour is a
 * pure function of (scenario plan, world, program, seed); the caller's
 * objects are never mutated.
 */

import type { SimulatedWorld } from "./simulation-world.ts";
import type {
  DemandPlan,
  ScenarioIncident,
  SimulationProgram,
  SimulationScenarioPlan,
} from "./simulation-plan.ts";
import type {
  DemandOutcomeRecord,
  MutableSimulationMetrics,
} from "./simulation-metrics.ts";
import {
  coalesceBatches,
  createEngineState,
  settleOne,
} from "./simulation-settle.ts";

interface DeferredDemand {
  readonly demand: DemandPlan;
  readonly effectiveStep: number;
  readonly deferredSteps: number;
}

/** The engine's raw output before namespacing/freezing/digesting. */
export interface EngineOutput {
  readonly metrics: MutableSimulationMetrics;
  readonly outcomes: readonly DemandOutcomeRecord[];
}

/**
 * Executes one scenario against the world under the program. Returns the
 * raw (metrics, outcomes); the public `runSimulation` (simulation.ts)
 * freezes, namespaces and digests them. Deterministic: the same inputs
 * always produce the same output. A scenario with no events is legal
 * (empty world proof) and still produces a deterministic result.
 */
export function executeScenario(
  scenario: SimulationScenarioPlan,
  world: SimulatedWorld,
  program: SimulationProgram,
  seed: string,
): EngineOutput {
  const state = createEngineState(world, program, `${seed}:${scenario.scenarioId}`);
  state.metrics.totalDemands = scenario.demands.length;

  // -- schedule demands: immediate or deferred into a batching window -----
  const deferred: DeferredDemand[] = [];
  const immediate: DemandPlan[] = [];
  const window =
    program.useNetting || program.delayToleranceSteps > 0
      ? program.delayToleranceSteps
      : 0;
  for (const demand of scenario.demands) {
    // Adversarial screening (fraud/collusion/malicious/gaming) happens at
    // arrival, before any routing.
    if (program.fraudScreening === true && demand.adversarial !== undefined) {
      state.metrics.blockedAdversarial += 1;
      state.outcomes.push({
        demandId: demand.demandId,
        outcome: "BLOCKED_FRAUD",
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
      state.metrics.liquidityLockedMinor += demand.amountMinor;
    } else {
      immediate.push(demand);
    }
  }

  const pending: DeferredDemand[] = [...deferred];
  const lastDemandStep = scenario.demands.reduce(
    (max, demand) => Math.max(max, demand.atStep),
    0,
  );
  const horizon = lastDemandStep + window + 1;

  const incidentsByStep = new Map<number, ScenarioIncident[]>();
  for (const incident of scenario.incidents) {
    const list = incidentsByStep.get(incident.atStep) ?? [];
    list.push(incident);
    incidentsByStep.set(incident.atStep, list);
  }

  for (let step = 0; step <= horizon; step += 1) {
    const incidents = incidentsByStep.get(step) ?? [];
    for (const incident of incidents) {
      switch (incident.incidentType) {
        case "PROVIDER_OUTAGE": {
          const rail = state.rails.get(incident.railId);
          if (rail !== undefined) {
            rail.available = false;
          }
          break;
        }
        case "LIQUIDITY_SHORTAGE": {
          const pool = state.pools.get(incident.poolId);
          if (pool !== undefined) {
            pool.availableMinor =
              pool.availableMinor > incident.drainedMinor
                ? pool.availableMinor - incident.drainedMinor
                : 0n;
          }
          break;
        }
        case "FX_VOLATILITY": {
          state.fxExtraBps += incident.spreadIncreaseBps;
          break;
        }
        case "CONGESTION": {
          state.congestionMs += incident.addedLatencyMs;
          for (const rail of state.rails.values()) {
            rail.degraded = true;
          }
          break;
        }
        case "DELAYED_WRITE": {
          const rail = state.rails.get(incident.railId);
          if (rail !== undefined) {
            rail.pendingUnknown = true;
          }
          break;
        }
        case "APPROVAL_DELAY": {
          state.approvalDelayMs += incident.delayMs;
          break;
        }
        case "STALE_OBSERVATION": {
          // The rail's observed facts go STALE from this step on (the
          // freshness degradation). The rail stays in the program's
          // preference — the program routes on its recorded facts and
          // cannot know they are stale (the epistemic trap the incident
          // models); the honest replay consequence lands in the settle
          // path: a settlement grounded on stale observed facts cannot
          // be CLAIMED (UNKNOWN-tier). The production answer to this
          // trap is the freshness law — a stale observation never
          // matches (evaluateWaitCriteria / the rail snapshot's
          // STALE_OBSERVATION exclusion).
          const rail = state.rails.get(incident.railId);
          if (rail !== undefined) {
            rail.observedStale = true;
            rail.degraded = true;
          }
          break;
        }
      }
    }

    // Immediate demands fire at their own step.
    for (const demand of immediate) {
      if (demand.atStep === step) {
        settleOne(state, demand, step, 0);
      }
    }
    // Deferred demands fire at their effective step.
    for (const entry of pending) {
      if (entry.effectiveStep === step) {
        settleOne(state, entry.demand, entry.effectiveStep, entry.deferredSteps);
      }
    }
  }

  coalesceBatches(state);

  return { metrics: state.metrics, outcomes: state.outcomes };
}
