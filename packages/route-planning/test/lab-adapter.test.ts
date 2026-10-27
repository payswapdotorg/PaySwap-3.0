import { describe, expect, it } from "vitest";
import {
  exploreBoundedScenarios,
  PINNED_INTERVENTION_KINDS,
  PINNED_SCENARIO_BUDGET_DIMENSIONS,
  PINNED_SCENARIO_INCIDENT_TYPES,
  PINNED_THIRD_PARTY_NODE_ROLES,
  requireScenarioExplorationPort,
  ScenarioExplorationError,
  scenariosPermitExecution,
  SCENARIO_EXPLORATION_STAGE,
  unboundScenarioExplorationPort,
} from "../src/lab-adapter.ts";
import type {
  PinnedScenarioExploration,
  PinnedScenarioIntervention,
  ScenarioExplorationPort,
  ScenarioExplorationRequest,
} from "../src/lab-adapter.ts";
import { PortUnboundError } from "../src/errors.ts";
import { INTERVENTION_KINDS, THIRD_PARTY_NODE_ROLES } from "../../lab/src/interventions.ts";
import { BUDGET_DIMENSIONS } from "../../lab/src/scenario-budget.ts";
import { SCENARIO_INCIDENT_TYPES } from "../../lab/src/simulation-plan.ts";
import { recordProductionFacts } from "../../lab/src/replay.ts";
import { runInterventionCounterfactual } from "../../lab/src/interventions.ts";
import { planScenarioSuite } from "../../lab/src/scenario-budget.ts";
import type { RecordedProductionFacts, SimulationProgram } from "../../lab/src/index.ts";
import type { ScenarioIntervention } from "../../lab/src/interventions.ts";

/**
 * The stage-6 lab seam battery (gap-matrix D3; ADR-0009 D2/D5/D6): the
 * four Lane-B vocabularies are pinned BYTE-IDENTICAL to the REAL lab
 * modules (relative imports — the established test-tier pattern), the
 * unbound port FAILS CLOSED naming the exact stage, and
 * exploreBoundedScenarios composes the REAL lab machinery
 * (planScenarioSuite + runInterventionCounterfactual + recordProductionFacts)
 * through the injected port into bounded, advisory-branded, deterministic
 * scenario evidence with honest truncation receipts.
 */

const BASE_PROGRAM: SimulationProgram = {
  programId: "rp.stage6.base", programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b"], useNetting: false, useNetworkCredit: false,
  delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

const VARIANT_PROGRAM: SimulationProgram = { ...BASE_PROGRAM, programId: "rp.stage6.variant" };

const SEED = "rp-stage6-seed";

function scenarioBaseFacts(): RecordedProductionFacts {
  return recordProductionFacts({
    factsId: "rp-stage6-facts",
    rails: [
      { railId: "rail-a", currency: "EUR", latencyMs: 400, fixedFeeMinor: 25n, variableFeeBps: 10n },
      { railId: "rail-b", currency: "EUR", latencyMs: 350, fixedFeeMinor: 40n, variableFeeBps: 8n },
    ],
    pools: [
      { poolId: "pool-a", railId: "rail-a", availableMinor: 1_000_000n },
      { poolId: "pool-b", railId: "rail-b", availableMinor: 800_000n },
    ],
    stepLatencyMs: 250,
    demands: [
      { demandId: "d1", observedAtMs: 0, amountMinor: 120_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 30_000 },
    ],
    incidents: [],
  });
}

const INTERVENTIONS: readonly ScenarioIntervention[] = [
  {
    kind: "RAIL_ADDED", interventionId: "add-rail-c", name: "rail c enters",
    rail: { railId: "rail-c", currency: "EUR", latencyMs: 500, fixedFeeMinor: 10n, variableFeeBps: 5n },
    pools: [{ poolId: "pool-c", railId: "rail-c", availableMinor: 5_000_000n }],
  },
  { kind: "POOL_FUNDED", interventionId: "fund-pool-a", poolId: "pool-a", addedMinor: 500_000n },
];

/**
 * The REAL lab machinery bound through the port (the composition-root
 * adapter — the only place the real engines are bound): the REAL
 * planScenarioSuite admission + the REAL runInterventionCounterfactual
 * per selected intervention, returned as the pinned projection.
 */
function realScenarioExplorationPort(): ScenarioExplorationPort {
  return {
    explore(input: ScenarioExplorationRequest): PinnedScenarioExploration {
      const plan = planScenarioSuite({ budget: input.budget, candidates: [...input.interventions] });
      const scenarios = plan.selected.map((intervention) => {
        const result = runInterventionCounterfactual({
          facts: input.baseFacts as unknown as RecordedProductionFacts,
          intervention,
          seed: input.seed,
          baseProgram: input.baseProgram as unknown as SimulationProgram,
          variantProgram: input.variantProgram as unknown as SimulationProgram,
          stepMs: input.stepMs,
        });
        return {
          interventionId: intervention.interventionId,
          kind: intervention.kind,
          counterfactualId: result.counterfactualId,
          counterfactualDigest: result.digest,
          delta: result.delta,
        };
      });
      return {
        baseFactsId: input.baseFacts.factsId,
        baseFactsDigest: input.baseFacts.factsDigest,
        suiteDigest: plan.digest,
        selectedInterventionIds: plan.selected.map((intervention) => intervention.interventionId),
        receipts: plan.receipts,
        coverage: plan.coverage,
        scenarios,
      };
    },
  };
}

function explore(options?: { budget?: ScenarioExplorationRequest["budget"] }) {
  return exploreBoundedScenarios({
    port: realScenarioExplorationPort(),
    baseFacts: scenarioBaseFacts(),
    interventions: INTERVENTIONS,
    budget: options?.budget ?? { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
    baseProgram: BASE_PROGRAM,
    variantProgram: VARIANT_PROGRAM,
    seed: SEED,
    stepMs: 250,
  });
}

describe("the four Lane-B vocabulary pins (byte-identical to the REAL lab authorities)", () => {
  it("INTERVENTION_KINDS / THIRD_PARTY_NODE_ROLES / BUDGET_DIMENSIONS / SCENARIO_INCIDENT_TYPES are pinned exactly, frozen", () => {
    expect([...PINNED_INTERVENTION_KINDS]).toEqual([...INTERVENTION_KINDS]);
    expect([...PINNED_THIRD_PARTY_NODE_ROLES]).toEqual([...THIRD_PARTY_NODE_ROLES]);
    expect([...PINNED_SCENARIO_BUDGET_DIMENSIONS]).toEqual([...BUDGET_DIMENSIONS]);
    expect([...PINNED_SCENARIO_INCIDENT_TYPES]).toEqual([...SCENARIO_INCIDENT_TYPES]);
    expect([...PINNED_INTERVENTION_KINDS]).toEqual([
      "RAIL_ADDED", "RAIL_REMOVED", "POOL_FUNDED", "THIRD_PARTY_NODE_JOINS",
      "GROUP_DEMAND_ADDED", "INCIDENT_APPLIED", "CREDIT_COMMITMENT",
    ]);
    expect([...PINNED_SCENARIO_BUDGET_DIMENSIONS]).toEqual([
      "maxScenarios", "maxInterventionsPerRun", "maxDemands", "maxPools", "maxRails",
    ]);
    expect([...PINNED_THIRD_PARTY_NODE_ROLES]).toEqual(["intermediary", "liquidity_source", "payout_endpoint"]);
    expect([...PINNED_SCENARIO_INCIDENT_TYPES]).toEqual([
      "PROVIDER_OUTAGE", "LIQUIDITY_SHORTAGE", "FX_VOLATILITY",
      "CONGESTION", "DELAYED_WRITE", "APPROVAL_DELAY", "STALE_OBSERVATION",
    ]);
    for (const pin of [PINNED_INTERVENTION_KINDS, PINNED_THIRD_PARTY_NODE_ROLES, PINNED_SCENARIO_BUDGET_DIMENSIONS, PINNED_SCENARIO_INCIDENT_TYPES]) {
      expect(Object.isFrozen(pin)).toBe(true);
    }
  });
});

describe("the unbound scenario exploration port (fail closed)", () => {
  it("every call throws the typed PortUnboundError naming the EXACT stage", () => {
    let stage = "";
    try {
      unboundScenarioExplorationPort().explore({
        baseFacts: scenarioBaseFacts(), interventions: [], budget: { maxScenarios: 1, maxInterventionsPerRun: 1, maxDemands: 1, maxPools: 1, maxRails: 1 },
        baseProgram: BASE_PROGRAM, variantProgram: VARIANT_PROGRAM, seed: SEED, stepMs: 250,
      });
      expect.unreachable("the unbound port must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-6:explore-bounded-counterfactuals");
    expect(SCENARIO_EXPLORATION_STAGE).toBe("stage-6:explore-bounded-counterfactuals");
  });

  it("requireScenarioExplorationPort rejects non-ports with the same stage name", () => {
    for (const candidate of [null, undefined, {}, { explore: "not-a-function" }]) {
      let stage = "";
      try {
        requireScenarioExplorationPort(candidate);
        expect.unreachable("a non-port must be rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(PortUnboundError);
        stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
      }
      expect(stage).toBe("stage-6:explore-bounded-counterfactuals");
    }
  });
});

describe("exploreBoundedScenarios with the REAL lab machinery bound", () => {
  it("produces bounded advisory scenarios with named kinds, deterministic digests and verbatim Lab digests", () => {
    const exploration = explore();
    expect(exploration.stage).toBe(SCENARIO_EXPLORATION_STAGE);
    expect(exploration.coverage).toBe("COMPLETE");
    expect(exploration.receipts).toEqual([]);
    expect(exploration.selectedInterventionIds).toEqual(["add-rail-c", "fund-pool-a"]);
    expect(exploration.scenarios.map((scenario) => scenario.kind)).toEqual(["RAIL_ADDED", "POOL_FUNDED"]);
    expect(exploration.explorationDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(exploration.baseFactsDigest).toMatch(/^labfnv1a64:[0-9a-f]{16}$/);
    expect(exploration.suiteDigest).toMatch(/^labfnv1a64:[0-9a-f]{16}$/);
    for (const scenario of exploration.scenarios) {
      expect(scenario.counterfactualDigest).toMatch(/^labfnv1a64:[0-9a-f]{16}$/);
      expect(scenario.counterfactualId).toContain("intervention:");
    }
    // The Lab digests are carried VERBATIM: the port's own outputs equal a
    // direct REAL-machinery invocation (this package never re-derives them).
    const plan = planScenarioSuite({ budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 }, candidates: [...INTERVENTIONS] });
    expect(exploration.suiteDigest).toBe(plan.digest);
    const direct = runInterventionCounterfactual({
      facts: scenarioBaseFacts(),
      intervention: plan.selected[0]!,
      seed: SEED, baseProgram: BASE_PROGRAM, variantProgram: VARIANT_PROGRAM, stepMs: 250,
    });
    expect(exploration.scenarios[0]?.counterfactualDigest).toBe(direct.digest);
    expect(exploration.scenarios[0]?.delta).toEqual(direct.delta);
  });

  it("byte-identical replays (the determinism law); a different seed moves the digest", () => {
    const first = explore();
    const second = explore();
    expect(second.explorationDigest).toBe(first.explorationDigest);
    expect(second.scenarios).toEqual(first.scenarios);
    const otherSeed = exploreBoundedScenarios({
      port: realScenarioExplorationPort(), baseFacts: scenarioBaseFacts(), interventions: INTERVENTIONS,
      budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
      baseProgram: BASE_PROGRAM, variantProgram: VARIANT_PROGRAM, seed: "rp-stage6-other-seed", stepMs: 250,
    });
    expect(otherSeed.explorationDigest).not.toBe(first.explorationDigest);
  });

  it("ADVISORY-BRANDED literals: scenarios never permit execution; the output is deep-frozen", () => {
    const exploration = explore();
    expect(exploration.scenariosPermitExecution).toBe(false);
    expect(exploration.advisoryOnly).toBe(true);
    expect(scenariosPermitExecution()).toBe(false);
    expect(Object.isFrozen(exploration)).toBe(true);
    expect(Object.isFrozen(exploration.scenarios)).toBe(true);
    expect(Object.isFrozen(exploration.budget)).toBe(true);
  });

  it("a tight budget truncates with the TRUE pre-cut count disclosed (ADR-0009 D6)", () => {
    const exploration = explore({ budget: { maxScenarios: 1, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 } });
    expect(exploration.coverage).toBe("TRUNCATED");
    expect(exploration.receipts).toEqual([
      { dimension: "maxScenarios", limit: 1, actualCount: 2, disclosedAs: "TRUNCATED" },
    ]);
    expect(exploration.selectedInterventionIds).toEqual(["add-rail-c"]);
    expect(exploration.scenarios).toHaveLength(1);
    expect(exploration.explorationDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("fail-closed inputs: bad budgets, unknown kinds, duplicate ids, bad seeds/stepMs/facts never explore", () => {
    const base = {
      port: realScenarioExplorationPort(), baseFacts: scenarioBaseFacts(), interventions: INTERVENTIONS,
      budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
      baseProgram: BASE_PROGRAM, variantProgram: VARIANT_PROGRAM, seed: SEED, stepMs: 250,
    } as const;
    expect(() => exploreBoundedScenarios({ ...base, budget: { maxScenarios: 0, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 } })).toThrow(ScenarioExplorationError);
    expect(() => exploreBoundedScenarios({ ...base, budget: { maxScenarios: 1.5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 } })).toThrow(ScenarioExplorationError);
    expect(() => exploreBoundedScenarios({ ...base, interventions: [{ kind: "RAIL_TELEPORTED", interventionId: "x" }] as unknown as readonly PinnedScenarioIntervention[] })).toThrow(ScenarioExplorationError);
    expect(() => exploreBoundedScenarios({ ...base, interventions: [INTERVENTIONS[0]!, INTERVENTIONS[0]!] })).toThrow(ScenarioExplorationError);
    expect(() => exploreBoundedScenarios({ ...base, seed: "" })).toThrow(ScenarioExplorationError);
    expect(() => exploreBoundedScenarios({ ...base, stepMs: 0 })).toThrow(ScenarioExplorationError);
    const badFacts = { ...scenarioBaseFacts(), factsDigest: "not-a-lab-digest" };
    expect(() => exploreBoundedScenarios({ ...base, baseFacts: badFacts })).toThrow(ScenarioExplorationError);
  });

  it("a LYING port never composes (facts grounding + honest coverage are validated fail-closed)", () => {
    const honest = explore();
    const swappedFacts: ScenarioExplorationPort = {
      explore: () => ({
        baseFactsId: "rp-stage6-facts", baseFactsDigest: "labfnv1a64:0000000000000000",
        suiteDigest: honest.suiteDigest, selectedInterventionIds: [], receipts: [], coverage: "COMPLETE", scenarios: [],
      }),
    };
    expect(() => exploreBoundedScenarios({
      port: swappedFacts, baseFacts: scenarioBaseFacts(), interventions: INTERVENTIONS,
      budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
      baseProgram: BASE_PROGRAM, variantProgram: VARIANT_PROGRAM, seed: SEED, stepMs: 250,
    })).toThrow(ScenarioExplorationError);
    const lyingCoverage: ScenarioExplorationPort = {
      explore: () => ({
        baseFactsId: "rp-stage6-facts", baseFactsDigest: honest.baseFactsDigest, suiteDigest: honest.suiteDigest,
        selectedInterventionIds: ["add-rail-c"],
        receipts: [{ dimension: "maxScenarios", limit: 1, actualCount: 2, disclosedAs: "TRUNCATED" }],
        coverage: "COMPLETE",
        scenarios: [{ interventionId: "add-rail-c", kind: "RAIL_ADDED", counterfactualId: "intervention:x", counterfactualDigest: "labfnv1a64:0000000000000000", delta: honest.scenarios[0]!.delta }],
      }),
    };
    expect(() => exploreBoundedScenarios({
      port: lyingCoverage, baseFacts: scenarioBaseFacts(), interventions: INTERVENTIONS,
      budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
      baseProgram: BASE_PROGRAM, variantProgram: VARIANT_PROGRAM, seed: SEED, stepMs: 250,
    })).toThrow(ScenarioExplorationError);
  });

  it("the STALE_OBSERVATION incident binds through the adapter with the honest UNKNOWN-tier delta (P21-C, ADR-0014 D9 — the one-change law companion)", () => {
    // The staleness incident kind (the P21-C vocabulary growth) explores
    // through the stage-6 port over the REAL lab machinery: a settlement
    // grounded on stale-marked observed facts cannot be CLAIMED — the
    // demand that would have settled on the rail becomes
    // UNKNOWN-requires-reconciliation (variant − base: settled −1,
    // unknownOutcomes +1), deterministically.
    const interventions: readonly ScenarioIntervention[] = [
      {
        kind: "INCIDENT_APPLIED", interventionId: "stale-rail-a",
        incident: { incidentType: "STALE_OBSERVATION", atStep: 0, railId: "rail-a" },
      },
    ];
    const run = () => exploreBoundedScenarios({
      port: realScenarioExplorationPort(), baseFacts: scenarioBaseFacts(), interventions,
      budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
      baseProgram: BASE_PROGRAM, variantProgram: VARIANT_PROGRAM, seed: SEED, stepMs: 250,
    });
    const exploration = run();
    expect(exploration.coverage).toBe("COMPLETE");
    expect(exploration.scenarios).toHaveLength(1);
    expect(exploration.scenarios[0]?.kind).toBe("INCIDENT_APPLIED");
    expect(exploration.scenarios[0]?.delta.unknownOutcomes).toBe(1);
    expect(exploration.scenarios[0]?.delta.settled).toBe(-1);
    expect(run().explorationDigest).toBe(exploration.explorationDigest);
  });
});
