/**
 * The simulated world model (P6-W1; the P6 rebuild of the old
 * payswap.org@8a735bf packages/lab simulation.ts world section, W2-004).
 *
 * LAB.md "Simulation and replay": accounts, obligations, rails,
 * liquidity, FX, incidents. The world is PURE INPUT data: a simulation
 * never mutates the caller's world object (the engine copies into working
 * state). Money is exact integer minor-unit bigint arithmetic (canonical
 * INV-2: exact/lossless only) — no floating point anywhere in the
 * financial results.
 *
 * INV-L01 (canonical INV-11): this family carries the simulation
 * namespace; no export path from here reaches any production rail
 * adapter, connector execution, ledger or authorization code.
 */

// ---------------------------------------------------------------------------
// Rails and liquidity
// ---------------------------------------------------------------------------

/**
 * One simulated payment rail with exact economics (INV-2: bigint minor
 * units; variable fees in basis points of the moved amount).
 */
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

/**
 * The simulated world a scenario runs against. Inputs are never mutated;
 * `stepLatencyMs` is the latency added per deferred step when a program
 * delays/batches demands.
 */
export interface SimulatedWorld {
  readonly worldId: string;
  readonly baseCurrency: string;
  /** Latency added per deferred step when a program delays/batches. */
  readonly stepLatencyMs: number;
  readonly rails: readonly SimulatedRail[];
  readonly pools: readonly SimulatedLiquidityPool[];
}

/** Structural guard: does this value look like a simulated world? */
export function isSimulatedWorld(value: unknown): value is SimulatedWorld {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SimulatedWorld>;
  return (
    typeof candidate.worldId === "string" &&
    typeof candidate.baseCurrency === "string" &&
    typeof candidate.stepLatencyMs === "number" &&
    Array.isArray(candidate.rails) &&
    Array.isArray(candidate.pools)
  );
}
