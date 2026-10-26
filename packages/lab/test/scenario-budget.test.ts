import { describe, expect, it } from "vitest";
import {
  BUDGET_DIMENSIONS,
  ScenarioBudgetError,
  planScenarioSuite,
} from "../src/scenario-budget.ts";
import type { ScenarioIntervention } from "../src/interventions.ts";
import { InterventionError } from "../src/interventions.ts";
import { LabError } from "../src/errors.ts";

/**
 * The scenario search budget (P16-B, gap-matrix row B5; ADR-0009 D6):
 * count-based only, fail-closed validation, canonical ordering, greedy
 * admission while all five counters fit, truncation receipts that disclose
 * the TRUE pre-cut candidate counts, a coverage verdict that can never
 * claim COMPLETE while a receipt exists, and an input-order-independent
 * digest.
 *
 * Site classification (this file): 9 NET-NEW sites.
 */

const BUDGET = { maxScenarios: 10, maxInterventionsPerRun: 10, maxDemands: 10, maxPools: 10, maxRails: 10 };

function groupDemand(id: string, demandCount: number): ScenarioIntervention {
  return {
    kind: "GROUP_DEMAND_ADDED", interventionId: id,
    demands: Array.from({ length: demandCount }, (_, index) => ({
      demandId: `${id}-d${index}`, atStep: index, amountMinor: 100n, currency: "EUR",
      direction: "OUTBOUND" as const, deadlineMs: 10_000,
    })),
  };
}

function railAdded(id: string, poolCount = 0): ScenarioIntervention {
  return {
    kind: "RAIL_ADDED", interventionId: id, name: id,
    rail: { railId: `rail-${id}`, currency: "EUR", latencyMs: 100, fixedFeeMinor: 1n, variableFeeBps: 1n },
    ...(poolCount > 0 ? { pools: Array.from({ length: poolCount }, (_, index) => ({ poolId: `pool-${id}-${index}`, railId: `rail-${id}`, availableMinor: 1_000n })) } : {}),
  };
}

function creditCommitment(id: string): ScenarioIntervention {
  return {
    kind: "CREDIT_COMMITMENT", interventionId: id, nodeId: "node-beta",
    currency: "EUR", limitMinor: 750_000n, priceBps: 40n, expiresAtStep: 12,
  };
}

describe("the scenario search budget (P16-B, B5; ADR-0009 D6)", () => {
  it("BUDGET_DIMENSIONS is frozen and canonically ordered", () => {
    expect(Object.isFrozen(BUDGET_DIMENSIONS)).toBe(true);
    expect(BUDGET_DIMENSIONS).toEqual([
      "maxScenarios", "maxInterventionsPerRun", "maxDemands", "maxPools", "maxRails",
    ]);
  });

  it("an invalid budget fails CLOSED (positive integers only, count-based)", () => {
    for (const bad of [
      { ...BUDGET, maxScenarios: 0 }, { ...BUDGET, maxDemands: -1 },
      { ...BUDGET, maxPools: 1.5 }, { ...BUDGET, maxRails: Number.NaN },
      { ...BUDGET, maxInterventionsPerRun: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => planScenarioSuite({ budget: bad, candidates: [] })).toThrow(ScenarioBudgetError);
    }
    expect(() => planScenarioSuite({ budget: null as never, candidates: [] })).toThrow(ScenarioBudgetError);
    expect(() => planScenarioSuite({ budget: BUDGET, candidates: "no" as never })).toThrow(ScenarioBudgetError);
    expect(new ScenarioBudgetError("x")).toBeInstanceOf(LabError);
  });

  it("unconstructible candidates fail CLOSED through validateIntervention", () => {
    expect(() => planScenarioSuite({ budget: BUDGET, candidates: [{ kind: "RAIL_TELEPORTED", interventionId: "x" }] })).toThrow(InterventionError);
    expect(() => planScenarioSuite({ budget: BUDGET, candidates: [null] })).toThrow(InterventionError);
    expect(() => planScenarioSuite({ budget: BUDGET, candidates: [{ kind: "POOL_FUNDED", interventionId: "x", poolId: "p", addedMinor: 0n }] })).toThrow(InterventionError);
  });

  it("duplicate interventionIds are rejected before any selection", () => {
    expect(() => planScenarioSuite({
      budget: BUDGET, candidates: [creditCommitment("dupe"), railAdded("other"), creditCommitment("dupe")],
    })).toThrow(/duplicate interventionId 'dupe'/);
  });

  it("candidates are sorted canonically by interventionId and admitted greedily", () => {
    const plan = planScenarioSuite({
      budget: BUDGET, candidates: [railAdded("c-rail"), groupDemand("a-group", 2), creditCommitment("b-credit")],
    });
    expect(plan.selected.map((intervention) => intervention.interventionId)).toEqual(["a-group", "b-credit", "c-rail"]);
    expect(plan.coverage).toBe("COMPLETE");
    expect(plan.receipts).toEqual([]);
  });

  it("truncation receipts disclose the TRUE pre-cut candidate count, never the post-cut count", () => {
    // Three group-demand interventions, one demand each; the budget admits two.
    const plan = planScenarioSuite({
      budget: { ...BUDGET, maxDemands: 2 },
      candidates: [groupDemand("g-b", 1), groupDemand("g-a", 1), groupDemand("g-c", 1)],
    });
    expect(plan.selected.map((intervention) => intervention.interventionId)).toEqual(["g-a", "g-b"]);
    expect(plan.receipts).toEqual([
      { dimension: "maxDemands", limit: 2, actualCount: 3, disclosedAs: "TRUNCATED" },
    ]);
    expect(plan.coverage).toBe("TRUNCATED");
  });

  it("coverage is COMPLETE only when NO receipt exists (a receipt implies an exclusion)", () => {
    const fits = planScenarioSuite({ budget: BUDGET, candidates: [railAdded("r-1", 2), groupDemand("g-1", 3)] });
    expect(fits.receipts).toHaveLength(0);
    expect(fits.coverage).toBe("COMPLETE");
    // maxScenarios alone truncates; maxInterventionsPerRun alone truncates too.
    const byScenarios = planScenarioSuite({ budget: { ...BUDGET, maxScenarios: 1 }, candidates: [railAdded("r-1"), railAdded("r-2")] });
    expect(byScenarios.coverage).toBe("TRUNCATED");
    expect(byScenarios.receipts.map((receipt) => receipt.dimension)).toEqual(["maxScenarios"]);
    expect(byScenarios.receipts[0]).toMatchObject({ limit: 1, actualCount: 2 });
    const byRun = planScenarioSuite({ budget: { ...BUDGET, maxInterventionsPerRun: 1 }, candidates: [railAdded("r-1"), railAdded("r-2")] });
    expect(byRun.receipts.map((receipt) => receipt.dimension)).toEqual(["maxInterventionsPerRun"]);
  });

  it("the digest is INPUT-ORDER INDEPENDENT: the same candidates in any order give the byte-identical plan", () => {
    const candidates = [railAdded("c-rail", 1), groupDemand("a-group", 2), creditCommitment("b-credit"), groupDemand("d-group", 1)];
    const forward = planScenarioSuite({ budget: { ...BUDGET, maxDemands: 2 }, candidates });
    const scrambled = planScenarioSuite({ budget: { ...BUDGET, maxDemands: 2 }, candidates: [...candidates].reverse() });
    expect(forward.digest).toBe(scrambled.digest);
    expect(forward.selected).toEqual(scrambled.selected);
    expect(forward.receipts).toEqual(scrambled.receipts);
    expect(forward.coverage).toBe(scrambled.coverage);
    expect(forward.digest.startsWith("labfnv1a64:")).toBe(true);
  });

  it("dimension counters are honest per kind: rails/pools/demands only count the kinds that add them", () => {
    // railAdded("r-1", 2) adds 1 rail + 2 pools; groupDemand adds 3 demands; credit/rail-removal add neither.
    const plan = planScenarioSuite({
      budget: { ...BUDGET, maxRails: 1, maxPools: 2, maxDemands: 3 },
      candidates: [
        railAdded("r-1", 2), groupDemand("g-1", 3),
        { kind: "RAIL_REMOVED", interventionId: "rm-1", railId: "rail-x" },
        creditCommitment("c-1"),
      ],
    });
    expect(plan.selected.map((intervention) => intervention.interventionId)).toEqual(["c-1", "g-1", "r-1", "rm-1"]);
    expect(plan.coverage).toBe("COMPLETE");
    // maxRails=0-style caps are impossible (positive ints), so pin the boundary from the other side:
    // one more rail would not fit -> only the rail-adding kinds are excluded.
    const capped = planScenarioSuite({
      budget: { ...BUDGET, maxRails: 1 },
      candidates: [railAdded("r-1"), railAdded("r-2"), creditCommitment("c-1"), groupDemand("g-1", 1)],
    });
    expect(capped.selected.map((intervention) => intervention.interventionId)).toEqual(["c-1", "g-1", "r-1"]);
    expect(capped.receipts.map((receipt) => receipt.dimension)).toEqual(["maxRails"]);
    expect(capped.receipts[0]).toMatchObject({ limit: 1, actualCount: 2 });
  });
});
