/**
 * The simulation settle machinery (P6-W1; extracted from the old
 * payswap.org@8a735bf packages/lab simulation.ts engine body, W2-004).
 *
 * INV-L01 / canonical INV-11: this module imports ONLY deterministic local
 * utilities — never any pin, seam, rail adapter, connector execution,
 * ledger or authorization code.
 *
 * Rail choice is a two-pass deterministic policy over the program's
 * preference: currency-matching rails first (no FX), cross-currency rails
 * second (converting at the rail's declared spread plus any scenario FX
 * volatility, tracked exactly in bigint minor units). Liquidity gaps are
 * covered by EXPLICIT network credit only when the program declares it
 * (credit exposure is always surfaced, never hidden). The settle path
 * preserves the canonical INV-4 discipline: a delayed write yields
 * UNKNOWN_REQUIRES_RECONCILIATION (never FAILED, never success); a pending
 * customer approval past its deadline is USER_ACTION_REQUIRED (a
 * legitimate waiting terminal state); a latency miss is EXPIRED. Netting
 * coalesces same-(rail, step) batches so internalized value never moves
 * externally (economic compression).
 */

import { DeterministicRandom } from "./canonical.ts";
import type { SimulatedWorld } from "./simulation-world.ts";
import type { DemandPlan, SimulationProgram } from "./simulation-plan.ts";
import type {
  DemandOutcome,
  DemandOutcomeRecord,
  MutableSimulationMetrics,
} from "./simulation-metrics.ts";
import { emptyMetrics } from "./simulation-metrics.ts";

// ---------------------------------------------------------------------------
// Working state (internal, copied from the immutable inputs)
// ---------------------------------------------------------------------------

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

export interface BatchRecord {
  readonly railId: string;
  readonly effectiveStep: number;
  readonly outboundMinor: bigint;
  readonly inboundMinor: bigint;
  readonly fixedFeeMinor: bigint;
  readonly variableFeesMinor: bigint;
  readonly fxSpreadPaidMinor: bigint;
  readonly memberDemandIds: readonly string[];
}

/** The shared mutable engine state (created once per run). */
export interface EngineState {
  readonly rails: Map<string, WorkingRail>;
  readonly pools: Map<string, WorkingPool>;
  readonly batches: BatchRecord[];
  readonly outcomes: DemandOutcomeRecord[];
  readonly metrics: MutableSimulationMetrics;
  readonly random: DeterministicRandom;
  readonly program: SimulationProgram;
  readonly world: SimulatedWorld;
  fxExtraBps: bigint;
  congestionMs: number;
  approvalDelayMs: number;
}

/** Builds the working state for one run (inputs are never mutated). */
export function createEngineState(
  world: SimulatedWorld,
  program: SimulationProgram,
  seed: string,
): EngineState {
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
  return {
    rails,
    pools,
    batches: [],
    outcomes: [],
    metrics: emptyMetrics(),
    random: new DeterministicRandom(seed),
    program,
    world,
    fxExtraBps: 0n,
    congestionMs: 0,
    approvalDelayMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Rail choice (two-pass, deterministic)
// ---------------------------------------------------------------------------

function poolForRail(
  state: EngineState,
  railId: string,
): WorkingPool | undefined {
  for (const pool of state.pools.values()) {
    if (pool.railId === railId) {
      return pool;
    }
  }
  return undefined;
}

/**
 * Chooses a rail for a demand. Pass 1: currency-matching rails only (no
 * FX). Pass 2: fall back to cross-currency rails, which convert at their
 * spread (rail.fxSpreadBps + scenario FX volatility), tracked exactly in
 * bigint minor units. Insufficient liquidity fails over to the next rail
 * unless the program declared explicit network credit (the gap becomes
 * surfaced credit exposure).
 */
export function chooseRail(
  state: EngineState,
  demand: DemandPlan,
): { rail: WorkingRail; usedCreditMinor: bigint } | undefined {
  const tryRails = (
    matchingOnly: boolean,
  ): { rail: WorkingRail; usedCreditMinor: bigint } | undefined => {
    for (const railId of state.program.routePreference) {
      const rail = state.rails.get(railId);
      if (rail === undefined || !rail.available) {
        continue;
      }
      if (matchingOnly && rail.currency !== demand.currency) {
        continue;
      }
      const pool = poolForRail(state, rail.railId);
      if (pool !== undefined && pool.availableMinor < demand.amountMinor) {
        if (state.program.useNetworkCredit) {
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
}

// ---------------------------------------------------------------------------
// Settling one demand
// ---------------------------------------------------------------------------

/**
 * Settles one demand at its effective step. The outcome taxonomy honours
 * INV-4 (UNKNOWN is not FAILED; USER_ACTION_REQUIRED is a legitimate
 * waiting state) and the privacy/authorization/credit disciplines are
 * metered into the metrics.
 */
export function settleOne(
  state: EngineState,
  demand: DemandPlan,
  effectiveStep: number,
  deferredSteps: number,
): void {
  const { metrics } = state;
  // Privacy discipline: a program that is not privacy-bounded pulls more
  // context than the minimum required for every demand it processes.
  if (state.program.privacyBounded === false) {
    metrics.privacyViolations += 1;
  }

  const chosen = chooseRail(state, demand);
  if (chosen === undefined) {
    state.outcomes.push({
      demandId: demand.demandId,
      outcome: "FAILED_NO_VIABLE_ROUTE",
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
  const conversionSpreadBps = conversion
    ? rail.fxSpreadBps + state.fxExtraBps
    : 0n;
  const variableBps = rail.variableFeeBps;

  let movedMinor = demand.amountMinor;
  let outcome: DemandOutcome = "SETTLED";
  if (demand.partialBps !== undefined) {
    movedMinor = (demand.amountMinor * demand.partialBps) / 10_000n;
    outcome = "PARTIALLY_SETTLED";
  }

  const fees =
    rail.fixedFeeMinor +
    (movedMinor * (variableBps + conversionSpreadBps)) / 10_000n;
  const fxSpread = (movedMinor * conversionSpreadBps) / 10_000n;

  const jitterMs = state.random.nextBounded(101);
  const latencyMs =
    rail.latencyMs +
    state.congestionMs +
    deferredSteps * state.world.stepLatencyMs +
    jitterMs;

  if (rail.pendingUnknown) {
    // The external write is delayed: the outcome is UNKNOWN and requires
    // reconciliation (INV-4: UNKNOWN is never FAILED and never success).
    state.outcomes.push({
      demandId: demand.demandId,
      outcome: "UNKNOWN_REQUIRES_RECONCILIATION",
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
    const approvalLatency = latencyMs + state.approvalDelayMs;
    if (approvalLatency > demand.deadlineMs) {
      // A pending customer approval is a legitimate waiting terminal
      // state, not a failure and not UNKNOWN.
      state.outcomes.push({
        demandId: demand.demandId,
        outcome: "USER_ACTION_REQUIRED",
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
    state.outcomes.push({
      demandId: demand.demandId,
      outcome: "EXPIRED",
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

  if (outcome === "SETTLED") {
    metrics.settled += 1;
    if (demand.adversarial !== undefined) {
      metrics.adversarialSettled += 1;
    }
    if (state.program.authorizationMode === "DECLARED_BYPASS") {
      metrics.authorizationBypassEvents += 1;
    }
  } else {
    metrics.partiallySettled += 1;
  }

  // Record a batch (netting coalesces same-rail same-step demands).
  state.batches.push({
    railId: rail.railId,
    effectiveStep,
    outboundMinor: demand.direction === "OUTBOUND" ? movedMinor : 0n,
    inboundMinor: demand.direction === "INBOUND" ? movedMinor : 0n,
    fixedFeeMinor: rail.fixedFeeMinor,
    variableFeesMinor:
      (movedMinor * (variableBps + conversionSpreadBps)) / 10_000n,
    fxSpreadPaidMinor: fxSpread,
    memberDemandIds: [demand.demandId],
  });
  state.outcomes.push({
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
}

// ---------------------------------------------------------------------------
// Batch coalescing (netting / economic compression)
// ---------------------------------------------------------------------------

/**
 * Merges same-(rail, step) batches when netting is enabled: internalized
 * value never moves externally (economic compression). Fees and FX spread
 * are summed per group; hops become one per group.
 */
export function coalesceBatches(state: EngineState): void {
  const { metrics, program } = state;
  if (!program.useNetting) {
    for (const batch of state.batches) {
      metrics.externalValueMovedMinor += batch.outboundMinor + batch.inboundMinor;
      metrics.feesMinor += batch.fixedFeeMinor + batch.variableFeesMinor;
      metrics.fxSpreadPaidMinor += batch.fxSpreadPaidMinor;
      metrics.hops += 1;
    }
    return;
  }
  const groups = new Map<string, BatchRecord[]>();
  for (const batch of state.batches) {
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
    const internalized =
      2n * (outboundMinor < inboundMinor ? outboundMinor : inboundMinor);
    metrics.nettedInternallyMinor += internalized;
    metrics.externalValueMovedMinor +=
      outboundMinor + inboundMinor - internalized;
    const fixedFees = group.reduce((sum, b) => sum + b.fixedFeeMinor, 0n);
    const variableFees = group.reduce((sum, b) => sum + b.variableFeesMinor, 0n);
    const fxSpread = group.reduce((sum, b) => sum + b.fxSpreadPaidMinor, 0n);
    metrics.feesMinor += fixedFees + variableFees;
    metrics.fxSpreadPaidMinor += fxSpread;
    metrics.hops += 1;
  }
}
