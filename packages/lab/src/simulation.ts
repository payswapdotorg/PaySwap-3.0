/**
 * The deterministic simulation engine — public surface (P6-W1; the P6
 * rebuild of the old payswap.org@8a735bf packages/lab simulation.ts,
 * W2-004).
 *
 * INV-L01 / canonical INV-11 — SIMULATION IS NOT PRODUCTION TRUTH: the
 * simulation family (simulation-world/-plan/-metrics/-engine and this
 * module) imports ONLY deterministic local utilities — never any pin,
 * seam, rail adapter, connector execution, ledger or authorization code.
 * Every result is branded with the SIMULATION namespace so it can never be
 * confused with production evidence (there is intentionally NO exported
 * conversion from a simulation result to any production-evidence type).
 *
 * Deterministic by construction: behaviour is a pure function of
 * (scenario plan, world, program, seed). No ambient clock, no Math.random,
 * no Date.now — the only pseudo-entropy is the splitmix64 PRNG seeded from
 * the caller-supplied seed string. Money is exact integer minor-unit
 * bigint arithmetic (INV-2); no floating point anywhere in the financial
 * results.
 */

import { canonicalize, deepFreeze, fnv1a64 } from "./canonical.ts";
import type { SimulatedWorld } from "./simulation-world.ts";
import type { SimulationProgram } from "./simulation-plan.ts";
import { SIMULATION_NAMESPACE } from "./simulation-metrics.ts";
import type {
  DemandOutcomeRecord,
  SimulationMetrics,
  SimulationRunInput,
  SimulationRunResult,
} from "./simulation-metrics.ts";
import { executeScenario } from "./simulation-engine.ts";

// ---------------------------------------------------------------------------
// Canonical digest of a simulation run's truth-relevant content
// ---------------------------------------------------------------------------

/**
 * Deterministic digest of a simulation run's truth-relevant content:
 * (scenarioId, program id+version+policy fields, seed, metrics,
 * outcomes). Same inputs -> same digest, always.
 */
export function simulationDigest(
  scenarioId: string,
  program: SimulationProgram,
  seed: string,
  metrics: SimulationMetrics,
  outcomes: readonly DemandOutcomeRecord[],
): string {
  return fnv1a64(
    canonicalize({
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
    }),
  );
}

// ---------------------------------------------------------------------------
// The engine entry
// ---------------------------------------------------------------------------

/**
 * Runs one deterministic simulation. Same (scenario, world, program, seed)
 * -> deep-equal result, always. Inputs are never mutated; the result is
 * deep-frozen and namespaced (INV-L01). A scenario with no events is legal
 * (empty world proof) and still produces a deterministic, namespaced
 * result.
 */
export function runSimulation(input: SimulationRunInput): SimulationRunResult {
  const { scenario, world, program, seed } = input;
  const { metrics, outcomes } = executeScenario(
    scenario,
    world,
    program,
    seed,
  );

  const frozenMetrics: SimulationMetrics = deepFreeze({
    ...metrics,
  }) as SimulationMetrics;
  const frozenOutcomes = deepFreeze(
    [...outcomes],
  ) as readonly DemandOutcomeRecord[];

  const digest = simulationDigest(
    scenario.scenarioId,
    program,
    seed,
    frozenMetrics,
    frozenOutcomes,
  );

  return deepFreeze({
    namespace: SIMULATION_NAMESPACE,
    __payswapLabSimulationNamespace: SIMULATION_NAMESPACE,
    scenarioId: scenario.scenarioId,
    programId: program.programId,
    programVersion: program.programVersion,
    seed,
    digest,
    metrics: frozenMetrics,
    outcomes: frozenOutcomes,
  }) as SimulationRunResult;
}

// ---------------------------------------------------------------------------
// The simulation family re-exports (one import surface for consumers)
// ---------------------------------------------------------------------------

export {
  SIMULATION_NAMESPACE,
  isSimulationResult,
  isDemandOutcome,
  emptyMetrics,
  DEMAND_OUTCOMES,
} from "./simulation-metrics.ts";
export type {
  DemandOutcome,
  DemandOutcomeRecord,
  SimulationMetrics,
  SimulationRunInput,
  SimulationRunResult,
  SimulationNamespaceBrand,
  MutableSimulationMetrics,
} from "./simulation-metrics.ts";
export { isSimulatedWorld } from "./simulation-world.ts";
export type {
  SimulatedRail,
  SimulatedLiquidityPool,
  SimulatedWorld,
} from "./simulation-world.ts";
export {
  DEMAND_DIRECTIONS,
  ADVERSARIAL_DEMAND_KINDS,
  isAdversarialDemandKind,
  isDemandDirection,
  SCENARIO_INCIDENT_TYPES,
  isScenarioIncidentType,
} from "./simulation-plan.ts";
export type {
  DemandDirection,
  AdversarialDemandKind,
  DemandPlan,
  ScenarioIncident,
  ScenarioIncidentType,
  SimulationScenarioPlan,
  SimulationProgram,
} from "./simulation-plan.ts";
