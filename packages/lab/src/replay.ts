/**
 * Lab replay over RECORDED PRODUCTION FACTS (P6-W1; the P6 rebuild of the
 * old payswap.org@8a735bf packages/lab replay.ts, W2-004).
 *
 * Replay uses RECORDED PRODUCTION FACTS WITHOUT REWRITING THEM: the fact
 * set is digested before anything runs, the simulation only ever sees a
 * derived (newly constructed) scenario plan, and the caller's fact objects
 * are never mutated. The replay result references the facts by id +
 * digest only. A tampered fact set (digest mismatch) is rejected.
 *
 * Deterministic reproducibility: same facts + same program id/version +
 * same seed -> byte-identical result.
 *
 * INV-L01 (canonical INV-11): every result carries the REPLAY namespace
 * brand and there is no exported conversion from replay results to any
 * production-evidence type. A replay result is advisory/test evidence
 * only — never production financial authority.
 */

import { canonicalize, deepFreeze, fnv1a64 } from "./canonical.ts";
import { runSimulation } from "./simulation.ts";
import type {
  DemandOutcome,
  DemandPlan,
  ScenarioIncident,
  SimulatedLiquidityPool,
  SimulatedRail,
  SimulationRunResult,
} from "./simulation.ts";
import type { SimulationProgram } from "./simulation-plan.ts";
import { RecordedFactsError } from "./errors.ts";

export const REPLAY_NAMESPACE = "PAYSWAP_LAB_REPLAY" as const;

/** Phantom brand: replay results are Lab artifacts, never production evidence. */
export interface ReplayNamespaceBrand {
  readonly __payswapLabReplayNamespace: typeof REPLAY_NAMESPACE;
}

// ---------------------------------------------------------------------------
// Recorded production facts (immutable inputs)
// ---------------------------------------------------------------------------

export type RecordedDemandFact = Readonly<
  Omit<DemandPlan, "atStep"> & { readonly observedAtMs: number }
>;

export type RecordedIncidentFact = Readonly<
  ScenarioIncident & { readonly observedAtMs: number }
>;

/**
 * A recorded production fact set: observed world, observed demands and
 * observed incidents. Constructed via `recordProductionFacts`, which
 * content-digests and deep-freezes it. Historical facts are immutable:
 * replay NEVER rewrites them.
 */
export interface RecordedProductionFacts {
  readonly factsId: string;
  readonly description?: string;
  readonly rails: readonly SimulatedRail[];
  readonly pools: readonly SimulatedLiquidityPool[];
  readonly stepLatencyMs: number;
  readonly demands: readonly RecordedDemandFact[];
  readonly incidents: readonly RecordedIncidentFact[];
  readonly factsDigest: string;
}

/** Records a production fact set: digests and freezes it immutably. */
export function recordProductionFacts(input: {
  factsId: string;
  description?: string;
  rails: readonly SimulatedRail[];
  pools: readonly SimulatedLiquidityPool[];
  stepLatencyMs: number;
  demands: readonly RecordedDemandFact[];
  incidents: readonly RecordedIncidentFact[];
}): RecordedProductionFacts {
  if (input.factsId.length === 0) {
    throw new RecordedFactsError("factsId must not be empty");
  }
  const digestInput = {
    factsId: input.factsId,
    rails: input.rails,
    pools: input.pools,
    stepLatencyMs: input.stepLatencyMs,
    demands: input.demands,
    incidents: input.incidents,
  };
  const factsDigest = fnv1a64(canonicalize(digestInput));
  return deepFreeze({
    factsId: input.factsId,
    ...(input.description !== undefined ? { description: input.description } : {}),
    rails: [...input.rails],
    pools: [...input.pools],
    stepLatencyMs: input.stepLatencyMs,
    demands: [...input.demands],
    incidents: [...input.incidents],
    factsDigest,
  });
}

/** Recomputes a fact set's digest (tamper detection). */
export function recordedFactsDigest(facts: RecordedProductionFacts): string {
  return fnv1a64(
    canonicalize({
      factsId: facts.factsId,
      rails: facts.rails,
      pools: facts.pools,
      stepLatencyMs: facts.stepLatencyMs,
      demands: facts.demands,
      incidents: facts.incidents,
    }),
  );
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export interface ReplayInput {
  readonly facts: RecordedProductionFacts;
  readonly program: SimulationProgram;
  readonly seed: string;
  /** Quantization: one simulation step per stepMs of observed time. */
  readonly stepMs: number;
}

export interface ReplayResult extends ReplayNamespaceBrand {
  readonly namespace: typeof REPLAY_NAMESPACE;
  readonly replayId: string;
  readonly factsId: string;
  readonly factsDigest: string;
  readonly program: SimulationProgram;
  readonly seed: string;
  readonly stepMs: number;
  readonly run: SimulationRunResult;
  readonly digest: string;
}

function stepOf(observedAtMs: number, stepMs: number): number {
  if (stepMs <= 0) {
    throw new RecordedFactsError("stepMs must be positive");
  }
  return Math.floor(observedAtMs / stepMs);
}

/** Maps recorded facts into a derived scenario plan (no fact is mutated). */
function deriveScenarioPlan(input: ReplayInput): {
  scenarioId: string;
  demands: DemandPlan[];
  incidents: ScenarioIncident[];
} {
  const demands: DemandPlan[] = input.facts.demands.map((fact) => ({
    demandId: fact.demandId,
    atStep: stepOf(fact.observedAtMs, input.stepMs),
    amountMinor: fact.amountMinor,
    currency: fact.currency,
    direction: fact.direction,
    deadlineMs: fact.deadlineMs,
    ...(fact.adversarial !== undefined ? { adversarial: fact.adversarial } : {}),
    ...(fact.partialBps !== undefined ? { partialBps: fact.partialBps } : {}),
    ...(fact.requiresApproval !== undefined
      ? { requiresApproval: fact.requiresApproval }
      : {}),
  }));
  const incidents: ScenarioIncident[] = input.facts.incidents.map((fact) => {
    const atStep = stepOf(fact.observedAtMs, input.stepMs);
    switch (fact.incidentType) {
      case "PROVIDER_OUTAGE":
        return { incidentType: "PROVIDER_OUTAGE", atStep, railId: fact.railId };
      case "LIQUIDITY_SHORTAGE":
        return {
          incidentType: "LIQUIDITY_SHORTAGE",
          atStep,
          poolId: fact.poolId,
          drainedMinor: fact.drainedMinor,
        };
      case "FX_VOLATILITY":
        return { incidentType: "FX_VOLATILITY", atStep, spreadIncreaseBps: fact.spreadIncreaseBps };
      case "CONGESTION":
        return { incidentType: "CONGESTION", atStep, addedLatencyMs: fact.addedLatencyMs };
      case "DELAYED_WRITE":
        return { incidentType: "DELAYED_WRITE", atStep, railId: fact.railId };
      case "APPROVAL_DELAY":
        return { incidentType: "APPROVAL_DELAY", atStep, delayMs: fact.delayMs };
      case "STALE_OBSERVATION":
        return { incidentType: "STALE_OBSERVATION", atStep, railId: fact.railId };
    }
  });
  return { scenarioId: `replay:${input.facts.factsId}`, demands, incidents };
}

/**
 * Replays recorded production facts under a program. Deterministic: the
 * same (facts, program, seed, stepMs) always produces the same result. The
 * facts are used READ-ONLY (replay never rewrites recorded production
 * facts); a digest mismatch — a tampered fact set — is rejected.
 */
export function runReplay(input: ReplayInput): ReplayResult {
  const factsDigest = recordedFactsDigest(input.facts);
  if (factsDigest !== input.facts.factsDigest) {
    throw new RecordedFactsError(
      `recorded facts '${input.facts.factsId}' digest mismatch: the fact set was tampered with after recording`,
    );
  }
  const plan = deriveScenarioPlan(input);
  const run = runSimulation({
    scenario: {
      scenarioId: plan.scenarioId,
      demands: plan.demands,
      incidents: plan.incidents,
    },
    world: {
      worldId: `replay-world:${input.facts.factsId}`,
      baseCurrency: input.facts.rails[0]?.currency ?? "EUR",
      stepLatencyMs: input.facts.stepLatencyMs,
      rails: input.facts.rails,
      pools: input.facts.pools,
    },
    program: input.program,
    seed: input.seed,
  });
  const digest = fnv1a64(
    canonicalize({
      factsId: input.facts.factsId,
      factsDigest,
      programId: input.program.programId,
      programVersion: input.program.programVersion,
      seed: input.seed,
      stepMs: input.stepMs,
      runDigest: run.digest,
    }),
  );
  return deepFreeze({
    namespace: REPLAY_NAMESPACE,
    __payswapLabReplayNamespace: REPLAY_NAMESPACE,
    replayId: `replay:${digest}`,
    factsId: input.facts.factsId,
    factsDigest,
    program: input.program,
    seed: input.seed,
    stepMs: input.stepMs,
    run,
    digest,
  });
}

/** Runtime guard: is this value a namespaced replay result? */
export function isReplayResult(value: unknown): value is ReplayResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ReplayResult>;
  return (
    candidate.namespace === REPLAY_NAMESPACE &&
    candidate.__payswapLabReplayNamespace === REPLAY_NAMESPACE &&
    typeof candidate.replayId === "string" &&
    typeof candidate.digest === "string" &&
    typeof candidate.factsDigest === "string"
  );
}

// ---------------------------------------------------------------------------
// Outcome observation helpers (used by evidence builders)
// ---------------------------------------------------------------------------

/** Outcome counters for one replay run (deterministic fold). */
export function countOutcomes(
  run: SimulationRunResult,
): Record<DemandOutcome, number> {
  const counters: Record<DemandOutcome, number> = {
    SETTLED: 0,
    PARTIALLY_SETTLED: 0,
    FAILED_NO_VIABLE_ROUTE: 0,
    UNKNOWN_REQUIRES_RECONCILIATION: 0,
    USER_ACTION_REQUIRED: 0,
    BLOCKED_FRAUD: 0,
    EXPIRED: 0,
  };
  for (const outcome of run.outcomes) {
    counters[outcome.outcome] += 1;
  }
  return counters;
}

// ---------------------------------------------------------------------------
// The recorded-facts discipline (old AGENTS.md rule 8 -> canonical
// "historical financial facts are immutable")
// ---------------------------------------------------------------------------
// recordProductionFacts digests + freezes the fact set at recording time;
// runReplay verifies the digest BEFORE deriving anything (tamper
// detection) and constructs a NEW scenario plan from the facts — the
// caller's fact objects are never rewritten, never mutated, and the
// replay result references them only by id + digest.
