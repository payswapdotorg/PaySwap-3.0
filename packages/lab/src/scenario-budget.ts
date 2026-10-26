/**
 * The scenario search budget (P16-B, gap-matrix row B5; ADR-0009 D6 —
 * bounded searches disclose truncation; completeness is never claimed when
 * capped). COUNT-BASED ONLY: five positive-integer dimensions, no wall
 * clock anywhere — a scenario suite plan is a pure function of
 * (budget, candidates).
 *
 * planScenarioSuite validates every candidate through the exported
 * validateIntervention (unconstructible interventions fail CLOSED),
 * rejects duplicate interventionIds, sorts canonically by interventionId,
 * then admits greedily while ALL five dimension counters stay within the
 * budget. Every truncating dimension emits exactly one receipt carrying
 * the TRUE pre-cut candidate count (`actualCount` is never the post-cut
 * count). The coverage verdict is COMPLETE only when NO receipt exists —
 * structurally, a receipt implies an exclusion, so a capped search can
 * never claim completeness.
 *
 * The digest covers budget + selection + receipts + coverage and is
 * INPUT-ORDER INDEPENDENT (the selection is canonically sorted and the
 * receipts are emitted in the fixed BUDGET_DIMENSIONS order), so the same
 * candidate set in any input order produces the byte-identical plan.
 */

import { canonicalize, deepFreeze, fnv1a64 } from "./canonical.ts";
import type { ScenarioIntervention } from "./interventions.ts";
import { validateIntervention } from "./interventions.ts";
import { LabError } from "./errors.ts";

/** A scenario budget is invalid (non-positive or non-integer dimension). */
export class ScenarioBudgetError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioBudgetError";
  }
}

/** The five budget dimensions, in the fixed receipt/counter order (P16-D pins this list byte-identical). */
export const BUDGET_DIMENSIONS = Object.freeze([
  "maxScenarios", "maxInterventionsPerRun", "maxDemands", "maxPools", "maxRails",
] as const);

/** One budget dimension. */
export type BudgetDimension = (typeof BUDGET_DIMENSIONS)[number];

/**
 * The count-based scenario search budget. Every dimension is a positive
 * integer; there is deliberately NO time/compute dimension (the Lab never
 * reads a clock).
 */
export interface ScenarioSearchBudget {
  /** Total variant scenarios the suite may admit. */
  readonly maxScenarios: number;
  /** Interventions one run may carry (each planned scenario carries exactly one in this lane). */
  readonly maxInterventionsPerRun: number;
  /** Total demands GROUP_DEMAND_ADDED admissions may add. */
  readonly maxDemands: number;
  /** Total pools RAIL_ADDED / THIRD_PARTY_NODE_JOINS admissions may add. */
  readonly maxPools: number;
  /** Total rails RAIL_ADDED / THIRD_PARTY_NODE_JOINS admissions may add. */
  readonly maxRails: number;
}

/** One truncation disclosure: the dimension, its limit and the TRUE pre-cut candidate count. */
export interface TruncationReceipt {
  readonly dimension: BudgetDimension;
  readonly limit: number;
  /** The TRUE candidate total for this dimension — NEVER the post-cut count. */
  readonly actualCount: number;
  readonly disclosedAs: "TRUNCATED";
}

/** The coverage verdict: COMPLETE only when NO truncation receipt exists. */
export type ScenarioCoverage = "COMPLETE" | "TRUNCATED";

/** The planned scenario suite: budget + canonical selection + receipts + verdict + digest. */
export interface ScenarioSuitePlan {
  readonly budget: ScenarioSearchBudget;
  /** The admitted interventions, canonically sorted by interventionId. */
  readonly selected: readonly ScenarioIntervention[];
  /** One receipt per truncating dimension, in BUDGET_DIMENSIONS order. */
  readonly receipts: readonly TruncationReceipt[];
  readonly coverage: ScenarioCoverage;
  /** Input-order-independent digest over budget + selection + receipts + coverage. */
  readonly digest: string;
}

/** The per-intervention footprint each admission adds to the five counters. */
interface InterventionFootprint {
  readonly scenarios: number;
  readonly interventions: number;
  readonly demands: number;
  readonly pools: number;
  readonly rails: number;
}

function footprintOf(intervention: ScenarioIntervention): InterventionFootprint {
  switch (intervention.kind) {
    case "RAIL_ADDED":
      return { scenarios: 1, interventions: 1, demands: 0, pools: intervention.pools?.length ?? 0, rails: 1 };
    case "RAIL_REMOVED":
      return { scenarios: 1, interventions: 1, demands: 0, pools: 0, rails: 0 };
    case "POOL_FUNDED":
      return { scenarios: 1, interventions: 1, demands: 0, pools: 0, rails: 0 };
    case "THIRD_PARTY_NODE_JOINS":
      return {
        scenarios: 1, interventions: 1, demands: 0,
        pools: intervention.pools?.length ?? 0, rails: intervention.rails.length,
      };
    case "GROUP_DEMAND_ADDED":
      return { scenarios: 1, interventions: 1, demands: intervention.demands.length, pools: 0, rails: 0 };
    case "INCIDENT_APPLIED":
      return { scenarios: 1, interventions: 1, demands: 0, pools: 0, rails: 0 };
    case "CREDIT_COMMITMENT":
      return { scenarios: 1, interventions: 1, demands: 0, pools: 0, rails: 0 };
  }
}

function validateBudget(budget: unknown): ScenarioSearchBudget {
  if (typeof budget !== "object" || budget === null) {
    throw new ScenarioBudgetError("budget must be a ScenarioSearchBudget object");
  }
  const candidate = budget as Record<string, unknown>;
  const out: { -readonly [K in keyof ScenarioSearchBudget]: ScenarioSearchBudget[K] } = {
    maxScenarios: 0, maxInterventionsPerRun: 0, maxDemands: 0, maxPools: 0, maxRails: 0,
  };
  for (const dimension of BUDGET_DIMENSIONS) {
    const value = candidate[dimension];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new ScenarioBudgetError(`${dimension} must be a positive integer (count-based budget)`);
    }
    out[dimension] = value;
  }
  return out;
}

/**
 * Plans a bounded scenario suite. Fail-closed: an invalid budget, an
 * unconstructible candidate (validateIntervention) or a duplicate
 * interventionId throws a typed error BEFORE any selection is made. Greedy
 * admission walks the canonically sorted candidates and admits each one
 * only while all five counters stay within the budget; a candidate that
 * would overflow any dimension is excluded and marks the overflowing
 * dimensions as truncating. Deterministic and input-order independent.
 */
export function planScenarioSuite(input: {
  readonly budget: ScenarioSearchBudget;
  readonly candidates: readonly unknown[];
}): ScenarioSuitePlan {
  const budget = validateBudget(input?.budget);
  if (!Array.isArray(input?.candidates)) {
    throw new ScenarioBudgetError("candidates must be an array of interventions");
  }
  const validated = input.candidates.map((candidate) => validateIntervention(candidate));
  const seen = new Set<string>();
  for (const intervention of validated) {
    if (seen.has(intervention.interventionId)) {
      throw new ScenarioBudgetError(`duplicate interventionId '${intervention.interventionId}'`);
    }
    seen.add(intervention.interventionId);
  }
  // Canonical order: sort by interventionId (unique after the check above).
  const ordered = [...validated].sort((a, b) =>
    a.interventionId < b.interventionId ? -1 : a.interventionId > b.interventionId ? 1 : 0,
  );
  const footprints = ordered.map((intervention) => footprintOf(intervention));
  // The TRUE pre-cut totals per dimension (disclosed in receipts, never the post-cut counts).
  const trueTotals: Record<BudgetDimension, number> = {
    maxScenarios: ordered.length,
    maxInterventionsPerRun: ordered.length,
    maxDemands: footprints.reduce((sum, footprint) => sum + footprint.demands, 0),
    maxPools: footprints.reduce((sum, footprint) => sum + footprint.pools, 0),
    maxRails: footprints.reduce((sum, footprint) => sum + footprint.rails, 0),
  };
  const limits: Record<BudgetDimension, number> = {
    maxScenarios: budget.maxScenarios,
    maxInterventionsPerRun: budget.maxInterventionsPerRun,
    maxDemands: budget.maxDemands,
    maxPools: budget.maxPools,
    maxRails: budget.maxRails,
  };
  let scenarios = 0;
  let interventions = 0;
  let demands = 0;
  let pools = 0;
  let rails = 0;
  const selected: ScenarioIntervention[] = [];
  const truncating = new Set<BudgetDimension>();
  for (const [index, intervention] of ordered.entries()) {
    const footprint = footprints[index]!;
    // Greedy admission: all five counters must stay within the budget.
    const scenariosAfter = scenarios + footprint.scenarios;
    const interventionsAfter = interventions + footprint.interventions;
    const demandsAfter = demands + footprint.demands;
    const poolsAfter = pools + footprint.pools;
    const railsAfter = rails + footprint.rails;
    const fits =
      scenariosAfter <= budget.maxScenarios &&
      interventionsAfter <= budget.maxInterventionsPerRun &&
      demandsAfter <= budget.maxDemands &&
      poolsAfter <= budget.maxPools &&
      railsAfter <= budget.maxRails;
    if (fits) {
      scenarios = scenariosAfter;
      interventions = interventionsAfter;
      demands = demandsAfter;
      pools = poolsAfter;
      rails = railsAfter;
      selected.push(intervention);
      continue;
    }
    if (scenariosAfter > budget.maxScenarios) truncating.add("maxScenarios");
    if (interventionsAfter > budget.maxInterventionsPerRun) truncating.add("maxInterventionsPerRun");
    if (demandsAfter > budget.maxDemands) truncating.add("maxDemands");
    if (poolsAfter > budget.maxPools) truncating.add("maxPools");
    if (railsAfter > budget.maxRails) truncating.add("maxRails");
  }
  // One receipt per truncating dimension, in the fixed canonical order.
  const receipts: TruncationReceipt[] = [];
  for (const dimension of BUDGET_DIMENSIONS) {
    if (truncating.has(dimension)) {
      receipts.push({
        dimension,
        limit: limits[dimension],
        actualCount: trueTotals[dimension],
        disclosedAs: "TRUNCATED",
      });
    }
  }
  // A receipt exists iff a candidate was excluded — COMPLETE is impossible
  // with a receipt (structural, not checked-after-the-fact).
  const coverage: ScenarioCoverage = receipts.length === 0 ? "COMPLETE" : "TRUNCATED";
  const digest = fnv1a64(
    canonicalize({
      budget: {
        maxScenarios: budget.maxScenarios, maxInterventionsPerRun: budget.maxInterventionsPerRun,
        maxDemands: budget.maxDemands, maxPools: budget.maxPools, maxRails: budget.maxRails,
      },
      selected: selected.map((intervention) => intervention.interventionId),
      receipts,
      coverage,
    }),
  );
  return deepFreeze({
    budget,
    selected: Object.freeze([...selected]),
    receipts: Object.freeze([...receipts]),
    coverage,
    digest,
  });
}
