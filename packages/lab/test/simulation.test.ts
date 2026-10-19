import { describe, expect, it } from "vitest";
import {
  ADVERSARIAL_DEMAND_KINDS,
  DEMAND_DIRECTIONS,
  DEMAND_OUTCOMES,
  DeterministicRandom,
  SCENARIO_INCIDENT_TYPES,
  isAdversarialDemandKind,
  isDemandDirection,
  isDemandOutcome,
  isScenarioIncidentType,
  isSimulationResult,
  runSimulation,
  SIMULATION_NAMESPACE,
} from "@payswap/lab";
import type {
  DemandPlan,
  SimulationProgram,
  SimulationScenarioPlan,
  SimulatedWorld,
} from "@payswap/lab";

/**
 * Simulation determinism, namespacing and behaviour (P6-W1 rebuild of the
 * old W2-004 simulation suite; INV-L01 / canonical INV-11 + INV-2 exact
 * money + INV-4 outcome taxonomy).
 *
 * Site classification (this file): 21 old sites PORTED (the full old
 * simulation corpus: determinism, namespacing, economics, failure
 * taxonomy, adversarial taxonomy, program discipline) + 5 NET-NEW sites
 * (digest byte-stability receipt, PRNG sequence determinism, outcome/
 * direction/incident vocabulary predicates, batching-window liquidity
 * lock, congestion degraded-exposure metering) = 26 tests.
 */

const WORLD: SimulatedWorld = {
  worldId: "test-world",
  baseCurrency: "EUR",
  stepLatencyMs: 100,
  rails: [
    { railId: "rail-eur", currency: "EUR", latencyMs: 300, fixedFeeMinor: 10n, variableFeeBps: 5n },
    { railId: "rail-usd", currency: "USD", latencyMs: 500, fixedFeeMinor: 20n, variableFeeBps: 8n, fxSpreadBps: 25n },
  ],
  pools: [
    { poolId: "pool-eur", railId: "rail-eur", availableMinor: 1_000_000n },
    { poolId: "pool-usd", railId: "rail-usd", availableMinor: 500_000n },
  ],
};
const run = (scenario: SimulationScenarioPlan, program: SimulationProgram = PROGRAM, seed = SEED) =>
  runSimulation({ scenario, world: WORLD, program, seed });

const PROGRAM: SimulationProgram = {
  programId: "test.program",
  programVersion: "1.0.0",
  routePreference: ["rail-eur", "rail-usd"],
  useNetting: false,
  useNetworkCredit: false,
  delayToleranceSteps: 0,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

function plan(
  scenarioId: string,
  demands: readonly DemandPlan[],
  incidents: SimulationScenarioPlan["incidents"] = [],
): SimulationScenarioPlan {
  return { scenarioId, demands: [...demands], incidents: [...incidents] };
}

function demand(demandId: string, amountMinor: bigint, extra?: Partial<DemandPlan>): DemandPlan {
  return {
    demandId,
    atStep: 0,
    amountMinor,
    currency: "EUR",
    direction: "OUTBOUND",
    deadlineMs: 60_000,
    ...(extra ?? {}),
  };
}

const SEED = "test-seed";

describe("simulation determinism (reproducibility discipline)", () => {
  it("same (scenario, world, program, seed) -> deep-equal results", () => {
    const scenario = plan("s1", [
      demand("d1", 100_000n),
      demand("d2", 50_000n, { direction: "INBOUND", atStep: 1 }),
    ]);
    const runA = runSimulation({ scenario, world: WORLD, program: PROGRAM, seed: SEED });
    const runB = runSimulation({ scenario, world: WORLD, program: PROGRAM, seed: SEED });
    expect(runA).toEqual(runB);
    expect(runA.digest).toBe(runB.digest);
  });

  it("a different seed produces a different digest", () => {
    const scenario = plan("s1", [demand("d1", 100_000n)]);
    const runA = runSimulation({ scenario, world: WORLD, program: PROGRAM, seed: SEED });
    const runB = runSimulation({ scenario, world: WORLD, program: PROGRAM, seed: "other-seed" });
    expect(runA.digest).not.toBe(runB.digest);
  });

  it("a different program version produces a different digest", () => {
    const scenario = plan("s1", [demand("d1", 100_000n)]);
    const programV2: SimulationProgram = { ...PROGRAM, programVersion: "2.0.0" };
    const runA = runSimulation({ scenario, world: WORLD, program: PROGRAM, seed: SEED });
    const runB = runSimulation({ scenario, world: WORLD, program: programV2, seed: SEED });
    expect(runA.digest).not.toBe(runB.digest);
  });

  it("inputs are never mutated and results are frozen", () => {
    const bigintSafe = (value: unknown) =>
      JSON.stringify(value, (_, inner) =>
        typeof inner === "bigint" ? `bigint:${inner}` : inner,
      );
    const scenario = plan("s1", [demand("d1", 100_000n)]);
    const scenarioSnapshot = bigintSafe(scenario);
    const worldSnapshot = bigintSafe(WORLD);
    const result = runSimulation({ scenario, world: WORLD, program: PROGRAM, seed: SEED });
    expect(bigintSafe(scenario)).toBe(scenarioSnapshot);
    expect(bigintSafe(WORLD)).toBe(worldSnapshot);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.metrics)).toBe(true);
    expect(Object.isFrozen(result.outcomes)).toBe(true);
  });

  it("an empty scenario still yields a deterministic namespaced result", () => {
    const result = run(plan("empty", []));
    expect(result.namespace).toBe(SIMULATION_NAMESPACE);
    expect(result.metrics.totalDemands).toBe(0);
    expect(result.outcomes).toEqual([]);
  });

  it("the digest is byte-stable across repeated constructions (hard receipt)", () => {
    const scenario = plan("s-stable", [demand("d1", 100_000n)]);
    const first = runSimulation({ scenario, world: WORLD, program: PROGRAM, seed: SEED });
    const second = runSimulation({ scenario, world: WORLD, program: PROGRAM, seed: SEED });
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^labfnv1a64:[0-9a-f]{16}$/);
  });

  it("the PRNG sequence is a pure function of the seed (the only entropy source)", () => {
    const a1 = new DeterministicRandom("seed-x");
    const a2 = new DeterministicRandom("seed-x");
    const b = new DeterministicRandom("seed-y");
    const seqA1 = [a1.nextUint64(), a1.nextUint64(), a1.nextBounded(101)];
    const seqA2 = [a2.nextUint64(), a2.nextUint64(), a2.nextBounded(101)];
    const seqB = [b.nextUint64(), b.nextUint64(), b.nextBounded(101)];
    expect(seqA1).toEqual(seqA2);
    expect(seqA1[0]).not.toBe(seqB[0]);
    expect(new DeterministicRandom("s").nextBounded(0)).toBe(0);
  });
});

describe("simulation namespacing (INV-L01)", () => {
  it("results carry the simulation namespace brand and pass the runtime guard", () => {
    const result = run(plan("s1", [demand("d1", 100_000n)]));
    expect(isSimulationResult(result)).toBe(true);
    expect(result.__payswapLabSimulationNamespace).toBe(SIMULATION_NAMESPACE);
  });

  it("the runtime guard rejects non-simulation values", () => {
    expect(isSimulationResult(null)).toBe(false);
    expect(isSimulationResult(42)).toBe(false);
    expect(isSimulationResult({ namespace: "SOMETHING_ELSE" })).toBe(false);
    expect(isSimulationResult({})).toBe(false);
  });

  it("the outcome/direction/incident vocabularies are total predicates", () => {
    for (const outcome of DEMAND_OUTCOMES) expect(isDemandOutcome(outcome)).toBe(true);
    expect(isDemandOutcome("FAILED")).toBe(false);
    for (const direction of DEMAND_DIRECTIONS) expect(isDemandDirection(direction)).toBe(true);
    expect(isDemandDirection("SIDEWAYS")).toBe(false);
    for (const incidentType of SCENARIO_INCIDENT_TYPES) {
      expect(isScenarioIncidentType(incidentType)).toBe(true);
    }
    expect(isScenarioIncidentType("MeteOR")).toBe(false);
  });
});

describe("simulation economics (exact bigint arithmetic)", () => {
  it("settles a normal demand with exact fees on the preferred rail", () => {
    const result = run(plan("s1", [demand("d1", 100_000n)]));
    expect(result.metrics.settled).toBe(1);
    expect(result.outcomes[0]?.railId).toBe("rail-eur");
    // fees = fixed 10 + 100_000 * 5bps / 10_000 = 10 + 50 = 60
    expect(result.metrics.feesMinor).toBe(60n);
    expect(result.metrics.externalValueMovedMinor).toBe(100_000n);
    expect(result.metrics.hops).toBe(1);
  });

  it("netting internalizes matching opposite flows on the same rail and step", () => {
    const nettingProgram: SimulationProgram = {
      ...PROGRAM,
      useNetting: true,
      delayToleranceSteps: 1,
    };
    const result = runSimulation({
      scenario: plan("s-net", [
        demand("d-out", 100_000n, { direction: "OUTBOUND", atStep: 0 }),
        demand("d-in", 60_000n, { direction: "INBOUND", atStep: 0 }),
      ]),
      world: WORLD,
      program: nettingProgram,
      seed: SEED,
    });
    // internalized = 2 * min(100k, 60k) = 120k; external = 160k - 120k = 40k
    expect(result.metrics.nettedInternallyMinor).toBe(120_000n);
    expect(result.metrics.externalValueMovedMinor).toBe(40_000n);
    expect(result.metrics.settled).toBe(2);
  });

  it("cross-currency routing pays the declared FX spread exactly", () => {
    const usdProgram: SimulationProgram = { ...PROGRAM, routePreference: ["rail-usd"] };
    const result = runSimulation({
      scenario: plan("s-fx", [demand("d1", 200_000n)]),
      world: WORLD,
      program: usdProgram,
      seed: SEED,
    });
    // fxSpread = 200_000 * 25bps / 10_000 = 500
    expect(result.metrics.fxSpreadPaidMinor).toBe(500n);
    // fees = fixed 20 + 200_000 * (8+25)bps / 10_000 = 20 + 660 = 680
    expect(result.metrics.feesMinor).toBe(680n);
    expect(result.outcomes[0]?.railId).toBe("rail-usd");
  });

  it("FX volatility widens the spread paid on conversions", () => {
    const usdProgram: SimulationProgram = { ...PROGRAM, routePreference: ["rail-usd"] };
    const calm = runSimulation({
      scenario: plan("s-fx-calm", [demand("d1", 200_000n)]),
      world: WORLD,
      program: usdProgram,
      seed: SEED,
    });
    const volatile = runSimulation({
      scenario: plan("s-fx-vol", [demand("d1", 200_000n)], [
        { incidentType: "FX_VOLATILITY", atStep: 0, spreadIncreaseBps: 100n },
      ]),
      world: WORLD,
      program: usdProgram,
      seed: SEED,
    });
    expect(volatile.metrics.fxSpreadPaidMinor).toBe(2_500n); // (25+100)bps on 200k
    expect(volatile.metrics.fxSpreadPaidMinor).toBeGreaterThan(calm.metrics.fxSpreadPaidMinor);
  });

  it("an outage forces fallback to the next rail in the preference", () => {
    const result = runSimulation({
      scenario: plan(
        "s-outage",
        [demand("d1", 100_000n, { atStep: 1 })],
        [{ incidentType: "PROVIDER_OUTAGE", atStep: 0, railId: "rail-eur" }],
      ),
      world: WORLD,
      program: PROGRAM,
      seed: SEED,
    });
    expect(result.metrics.settled).toBe(1);
    expect(result.outcomes[0]?.railId).toBe("rail-usd");
  });

  it("insufficient liquidity without credit fails over; with credit it draws explicit credit", () => {
    const big = demand("d1", 2_000_000n, { currency: "USD" }); // pool-usd 500k, pool-eur 1M
    const noCredit = runSimulation({
      scenario: plan("s-liquidity", [big]),
      world: WORLD,
      program: PROGRAM,
      seed: SEED,
    });
    expect(noCredit.metrics.failedNoViableRoute).toBe(1);
    expect(noCredit.metrics.settled).toBe(0);

    const withCredit = runSimulation({
      scenario: plan("s-liquidity", [big]),
      world: WORLD,
      program: { ...PROGRAM, useNetworkCredit: true },
      seed: SEED,
    });
    expect(withCredit.metrics.settled).toBe(1);
    expect(withCredit.metrics.creditExposureMinor).toBe(1_500_000n);
  });

  it("a batching window meters liquidity locked for deferred demands", () => {
    const batching: SimulationProgram = { ...PROGRAM, useNetting: true, delayToleranceSteps: 2 };
    const result = run(
      plan("s-defer", [demand("d1", 100_000n, { atStep: 0 }), demand("d2", 50_000n, { atStep: 1 })]),
      batching,
    );
    expect(result.metrics.liquidityLockedMinor).toBe(150_000n);
    expect(result.metrics.settled).toBe(2);
  });

  it("congestion degrades every rail and meters degraded-route exposure exactly", () => {
    const result = run(
      plan("s-congestion", [demand("d1", 100_000n, { atStep: 1 })], [
        { incidentType: "CONGESTION", atStep: 0, addedLatencyMs: 2_000 },
      ]),
    );
    expect(result.metrics.settled).toBe(1);
    expect(result.metrics.degradedRouteExposureMinor).toBe(100_000n);
    expect(result.metrics.totalLatencyMs).toBeGreaterThan(2_000n);
  });
});

describe("failure taxonomy (UNKNOWN is not FAILED)", () => {
  it("a delayed write yields UNKNOWN_REQUIRES_RECONCILIATION, never FAILED", () => {
    const result = runSimulation({
      scenario: plan(
        "s-delayed-write",
        [demand("d1", 100_000n, { atStep: 1 })],
        [{ incidentType: "DELAYED_WRITE", atStep: 0, railId: "rail-eur" }],
      ),
      world: WORLD,
      program: PROGRAM,
      seed: SEED,
    });
    expect(result.metrics.unknownOutcomes).toBe(1);
    expect(result.outcomes[0]?.outcome).toBe("UNKNOWN_REQUIRES_RECONCILIATION");
    expect(result.metrics.failedNoViableRoute).toBe(0);
    expect(result.metrics.settled).toBe(0);
  });

  it("an approval that misses the deadline becomes USER_ACTION_REQUIRED, not a failure", () => {
    const result = runSimulation({
      scenario: plan(
        "s-approval",
        [demand("d1", 100_000n, { requiresApproval: true, deadlineMs: 100 })],
        [{ incidentType: "APPROVAL_DELAY", atStep: 0, delayMs: 5_000 }],
      ),
      world: WORLD,
      program: PROGRAM,
      seed: SEED,
    });
    expect(result.metrics.userActionRequired).toBe(1);
    expect(result.outcomes[0]?.outcome).toBe("USER_ACTION_REQUIRED");
    expect(result.metrics.failedNoViableRoute).toBe(0);
  });

  it("a partial payment is recorded as PARTIALLY_SETTLED", () => {
    const result = run(plan("s-partial", [demand("d1", 100_000n, { partialBps: 6_000n })]));
    expect(result.outcomes[0]?.outcome).toBe("PARTIALLY_SETTLED");
    expect(result.outcomes[0]?.movedMinor).toBe(60_000n);
    expect(result.metrics.partiallySettled).toBe(1);
    expect(result.metrics.settled).toBe(0);
  });
});

describe("adversarial demand taxonomy (LAB.md scenario generation)", () => {
  it("screens every adversarial kind when screening is enabled", () => {
    for (const adversarial of ADVERSARIAL_DEMAND_KINDS) {
      const result = run(plan(`s-adv-${adversarial}`, [demand("d1", 100_000n, { adversarial })]));
      expect(result.metrics.blockedAdversarial).toBe(1);
      expect(result.outcomes[0]?.outcome).toBe("BLOCKED_FRAUD");
      expect(result.metrics.adversarialSettled).toBe(0);
    }
  });

  it("an unscreened adversarial demand settles and is counted (compliance violation)", () => {
    const result = run(
      plan("s-adv-unscrened", [demand("d1", 100_000n, { adversarial: "FRAUD" })]),
      { ...PROGRAM, fraudScreening: false },
    );
    expect(result.metrics.adversarialSettled).toBe(1);
    expect(result.metrics.blockedAdversarial).toBe(0);
  });

  it("isAdversarialDemandKind guards the taxonomy", () => {
    for (const kind of ADVERSARIAL_DEMAND_KINDS) {
      expect(isAdversarialDemandKind(kind)).toBe(true);
    }
    expect(isAdversarialDemandKind("MONEY_LAUNDERING")).toBe(false);
    expect(isAdversarialDemandKind(42)).toBe(false);
  });
});

describe("program discipline metrics (authorization, privacy)", () => {
  it("a declared authorization bypass is recorded per settled demand", () => {
    const result = run(
      plan("s-bypass", [demand("d1", 100_000n), demand("d2", 50_000n, { atStep: 1 })]),
      { ...PROGRAM, authorizationMode: "DECLARED_BYPASS" },
    );
    expect(result.metrics.authorizationBypassEvents).toBe(2);
    expect(result.metrics.settled).toBe(2);
  });

  it("a non-privacy-bounded program records one violation per processed demand", () => {
    const result = run(
      plan("s-privacy", [demand("d1", 100_000n), demand("d2", 50_000n, { atStep: 1 })]),
      { ...PROGRAM, privacyBounded: false },
    );
    expect(result.metrics.privacyViolations).toBe(2);
    expect(result.metrics.settled).toBe(2);
  });
});
