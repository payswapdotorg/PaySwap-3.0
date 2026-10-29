/**
 * @payswap/route-planning — the stage-6 Lab seam (P16-D part 1; gap-matrix
 * row D3; ADR-0009 D2/D5/D6).
 *
 * TYPE-ONLY/VALUE-PINNED surface of the Lane-B lab machinery: zero
 * sibling imports in src (the leaf-in-flight law) — the four Lane-B
 * vocabularies (INTERVENTION_KINDS, the scenario-budget dimension order,
 * THIRD_PARTY_NODE_ROLES, SCENARIO_INCIDENT_TYPES) are pinned
 * byte-identical as frozen const VALUE PINS in the AUTHORITY's declared
 * order, and the REAL lab machinery (recordProductionFacts /
 * planScenarioSuite / runInterventionCounterfactual) is reached ONLY
 * through the INJECTED ScenarioExplorationPort, whose default
 * implementation FAILS CLOSED with a typed PortUnboundError naming the
 * exact stage "stage-6:explore-bounded-counterfactuals" (the local stage
 * constant keeps ports.ts — the Lane-A seam — untouched). The REAL lab
 * engines are bound at the TEST tier (relative imports) and later at the
 * platform host's composition root.
 *
 * ADVISORY LAW (ADR-0009 D5 / INV-11): scenario exploration is advisory
 * evidence over IMMUTABLE base facts — it never updates production
 * facts, obligations, balances, authority or opportunities, and it never
 * permits execution (`scenariosPermitExecution()` is the literal false).
 * The lab package's own digest flavor appears ONLY through the port's
 * returned values (carried verbatim); THIS adapter digests with THIS
 * package's canonical.ts value-form flavor over the port's returned
 * projection (ADR-0009 D4 — one namespace per package, never mixed).
 */

import { PortUnboundError, RoutePlanningError } from "./errors.ts";
import { contentDigest, deepFreeze, isNonEmptyString, requireObject } from "./canonical.ts";

/** The stage this seam serves (frozen; the unbound error names it exactly). */
export const SCENARIO_EXPLORATION_STAGE = "stage-6:explore-bounded-counterfactuals" as const;

/**
 * VALUE PIN — authority: @payswap/lab src/interventions.ts
 * `INTERVENTION_KINDS` (the closed intervention-kind vocabulary,
 * canonical order). Pinned byte-identical; test-enforced fidelity.
 */
export const PINNED_INTERVENTION_KINDS = Object.freeze([
  "RAIL_ADDED", "RAIL_REMOVED", "POOL_FUNDED", "THIRD_PARTY_NODE_JOINS",
  "GROUP_DEMAND_ADDED", "INCIDENT_APPLIED", "CREDIT_COMMITMENT",
] as const);

/**
 * VALUE PIN — authority: @payswap/lab src/scenario-budget.ts
 * `BUDGET_DIMENSIONS` (the scenario-budget dimension order), byte-identical.
 */
export const PINNED_SCENARIO_BUDGET_DIMENSIONS = Object.freeze([
  "maxScenarios", "maxInterventionsPerRun", "maxDemands", "maxPools", "maxRails",
] as const);

/**
 * VALUE PIN — authority: @payswap/lab src/interventions.ts
 * `THIRD_PARTY_NODE_ROLES` (the joining-node roles), byte-identical.
 */
export const PINNED_THIRD_PARTY_NODE_ROLES = Object.freeze([
  "intermediary", "liquidity_source", "payout_endpoint",
] as const);

/**
 * VALUE PIN — authority: @payswap/lab src/simulation-plan.ts
 * `SCENARIO_INCIDENT_TYPES` (the Lab incident taxonomy), byte-identical.
 */
export const PINNED_SCENARIO_INCIDENT_TYPES = Object.freeze([
  "PROVIDER_OUTAGE", "LIQUIDITY_SHORTAGE", "FX_VOLATILITY",
  "CONGESTION", "DELAYED_WRITE", "APPROVAL_DELAY", "STALE_OBSERVATION",
] as const);

/**
 * VALUE PIN — authority: @payswap/lab src/canonical.ts `fnv1a64` (the
 * Lab's namespaced digest flavor `labfnv1a64:<16-hex>`). Carried values
 * are validated against this shape; this package never RE-derives them.
 */
const LAB_DIGEST_PATTERN = /^labfnv1a64:[0-9a-f]{16}$/;

export type PinnedInterventionKind = (typeof PINNED_INTERVENTION_KINDS)[number];
export type PinnedScenarioBudgetDimension = (typeof PINNED_SCENARIO_BUDGET_DIMENSIONS)[number];
export type PinnedThirdPartyNodeRole = (typeof PINNED_THIRD_PARTY_NODE_ROLES)[number];
export type PinnedScenarioIncidentType = (typeof PINNED_SCENARIO_INCIDENT_TYPES)[number];

/** STRUCTURAL PIN (subset) — authority: @payswap/lab `SimulatedRail`. */
export interface PinnedSimulatedRail {
  readonly railId: string; readonly currency: string; readonly latencyMs: number;
  readonly fixedFeeMinor: bigint; readonly variableFeeBps: bigint; readonly fxSpreadBps?: bigint;
}
/** STRUCTURAL PIN (subset) — authority: @payswap/lab `SimulatedLiquidityPool`. */
export interface PinnedSimulatedLiquidityPool {
  readonly poolId: string; readonly railId: string; readonly availableMinor: bigint;
}
/** STRUCTURAL PIN (subset) — authority: @payswap/lab `RecordedDemandFact`. */
export interface PinnedRecordedDemandFact {
  readonly demandId: string; readonly observedAtMs: number; readonly amountMinor: bigint;
  readonly currency: string; readonly direction: string; readonly deadlineMs: number;
}
/** STRUCTURAL PIN (subset) — authority: @payswap/lab `RecordedIncidentFact`. */
export interface PinnedRecordedIncidentFact {
  readonly incidentType: PinnedScenarioIncidentType; readonly observedAtMs: number;
}
/** STRUCTURAL PIN (subset) — authority: @payswap/lab `RecordedProductionFacts` (immutable base facts). */
export interface PinnedRecordedProductionFacts {
  readonly factsId: string; readonly rails: readonly PinnedSimulatedRail[];
  readonly pools: readonly PinnedSimulatedLiquidityPool[]; readonly stepLatencyMs: number;
  readonly demands: readonly PinnedRecordedDemandFact[]; readonly incidents: readonly PinnedRecordedIncidentFact[];
  readonly factsDigest: string;
}
/** STRUCTURAL PIN (subset) — authority: @payswap/lab `ScenarioIntervention` (named kind + unique id; the payload passes through the port). */
export interface PinnedScenarioIntervention {
  readonly kind: PinnedInterventionKind; readonly interventionId: string;
}
/** STRUCTURAL PIN — authority: @payswap/lab `ScenarioSearchBudget` (five count-based dimensions; counts only — no wall clock). */
export interface PinnedScenarioSearchBudget {
  readonly maxScenarios: number; readonly maxInterventionsPerRun: number; readonly maxDemands: number;
  readonly maxPools: number; readonly maxRails: number;
}
/** STRUCTURAL PIN (subset) — authority: @payswap/lab `SimulationProgram`. */
export interface PinnedSimulationProgram {
  readonly programId: string; readonly programVersion: string;
}
/** STRUCTURAL PIN — authority: @payswap/lab `ReplayDelta` (variant − base, exact bigint money). */
export interface PinnedReplayDelta {
  readonly settled: number; readonly partiallySettled: number; readonly failedNoViableRoute: number;
  readonly unknownOutcomes: number; readonly feesMinor: bigint; readonly fxSpreadPaidMinor: bigint;
  readonly externalValueMovedMinor: bigint; readonly adversarialSettled: number; readonly deadlineMisses: number;
}
/** One scenario truncation receipt (the TRUE pre-cut count — ADR-0009 D6). */
export interface PinnedScenarioTruncationReceipt {
  readonly dimension: PinnedScenarioBudgetDimension; readonly limit: number;
  readonly actualCount: number; readonly disclosedAs: "TRUNCATED";
}
/** One explored scenario: the named intervention + its advisory counterfactual evidence. */
export interface PinnedScenarioOutcome {
  readonly interventionId: string; readonly kind: PinnedInterventionKind;
  readonly counterfactualId: string; readonly counterfactualDigest: string; readonly delta: PinnedReplayDelta;
}
/** The port's returned projection (the REAL lab machinery's honest results). */
export interface PinnedScenarioExploration {
  readonly baseFactsId: string; readonly baseFactsDigest: string; readonly suiteDigest: string;
  readonly selectedInterventionIds: readonly string[]; readonly receipts: readonly PinnedScenarioTruncationReceipt[];
  readonly coverage: "COMPLETE" | "TRUNCATED"; readonly scenarios: readonly PinnedScenarioOutcome[];
}
/** The injected stage-6 port (the REAL lab machinery binds at the composition root). */
export interface ScenarioExplorationPort {
  explore(input: ScenarioExplorationRequest): PinnedScenarioExploration;
}
/** The bounded scenario-exploration request (caller-supplied everywhere). */
export interface ScenarioExplorationRequest {
  readonly baseFacts: PinnedRecordedProductionFacts; readonly interventions: readonly PinnedScenarioIntervention[];
  readonly budget: PinnedScenarioSearchBudget; readonly baseProgram: PinnedSimulationProgram;
  readonly variantProgram: PinnedSimulationProgram; readonly seed: string; readonly stepMs: number;
}
/** The advisory bounded scenario exploration (the stage-6 output contract). */
export interface BoundedScenarioExploration {
  readonly stage: typeof SCENARIO_EXPLORATION_STAGE;
  readonly baseFactsId: string; readonly baseFactsDigest: string; readonly budget: PinnedScenarioSearchBudget;
  readonly selectedInterventionIds: readonly string[]; readonly receipts: readonly PinnedScenarioTruncationReceipt[];
  readonly coverage: "COMPLETE" | "TRUNCATED"; readonly scenarios: readonly PinnedScenarioOutcome[];
  readonly suiteDigest: string; readonly explorationDigest: string;
  readonly advisoryOnly: true; readonly scenariosPermitExecution: false;
}
/** A scenario exploration input or port result violated the stage-6 laws. */
export class ScenarioExplorationError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "SCENARIO_EXPLORATION_FAILED", details);
    this.name = "ScenarioExplorationError";
  }
}

/**
 * THE ADVISORY LAW (first-class predicate): bounded scenario exploration
 * NEVER permits execution — the literal false, never a derived value.
 */
export function scenariosPermitExecution(): false {
  return false;
}

/**
 * The UNBOUND scenario exploration port (fail closed): every call throws a
 * PortUnboundError naming the EXACT unbound stage. Never fabricates a
 * scenario, never falls back, never returns partial results.
 */
export function unboundScenarioExplorationPort(): ScenarioExplorationPort {
  return {
    explore(input: ScenarioExplorationRequest): PinnedScenarioExploration {
      void input;
      throw new PortUnboundError(
        "the scenario exploration engine is not bound — bind a real ScenarioExplorationPort at the composition root (ADR-0009 D2: an unbound engine is an honest typed failure, never a fallback, never fabricated scenarios)",
        { stage: SCENARIO_EXPLORATION_STAGE },
      );
    },
  };
}

/** Require an injected scenario exploration port (fail closed on a missing binding). */
export function requireScenarioExplorationPort(candidate: unknown): ScenarioExplorationPort {
  if (candidate === null || typeof candidate !== "object" || typeof (candidate as ScenarioExplorationPort).explore !== "function") {
    throw new PortUnboundError(
      "a ScenarioExplorationPort must be injected (an object implementing explore) — scenario exploration never fabricates counterfactuals",
      { stage: SCENARIO_EXPLORATION_STAGE },
    );
  }
  return candidate as ScenarioExplorationPort;
}

function requirePositiveInt(value: unknown, subject: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ScenarioExplorationError(`${subject} must be a positive integer (count-based, caller-supplied)`);
  }
  return value;
}

/** Fail-closed validation of the count-based scenario budget (all five dimensions). */
function validateScenarioBudget(candidate: unknown): PinnedScenarioSearchBudget {
  const record = requireObject(candidate, "a PinnedScenarioSearchBudget");
  const budget: Record<PinnedScenarioBudgetDimension, number> = {
    maxScenarios: 0, maxInterventionsPerRun: 0, maxDemands: 0, maxPools: 0, maxRails: 0,
  };
  for (const dimension of PINNED_SCENARIO_BUDGET_DIMENSIONS) {
    budget[dimension] = requirePositiveInt(record[dimension], `budget.${dimension}`);
  }
  return deepFreeze(budget);
}

function validateBaseFacts(candidate: unknown): PinnedRecordedProductionFacts {
  const record = requireObject(candidate, "the recorded base facts");
  if (!isNonEmptyString(record["factsId"])) throw new ScenarioExplorationError("baseFacts.factsId must be a non-empty string");
  const factsDigest = record["factsDigest"];
  if (typeof factsDigest !== "string" || !LAB_DIGEST_PATTERN.test(factsDigest)) {
    throw new ScenarioExplorationError(
      "baseFacts.factsDigest must be the Lab's namespaced digest (labfnv1a64:<16-hex>) — the immutable base facts carry their own tamper-evident digest",
    );
  }
  for (const field of ["rails", "pools", "demands", "incidents"] as const) {
    if (!Array.isArray(record[field])) throw new ScenarioExplorationError(`baseFacts.${field} must be an array`);
  }
  requirePositiveInt(record["stepLatencyMs"], "baseFacts.stepLatencyMs");
  return record as unknown as PinnedRecordedProductionFacts;
}

function validateInterventions(candidate: unknown): readonly PinnedScenarioIntervention[] {
  if (!Array.isArray(candidate)) throw new ScenarioExplorationError("interventions must be an array of named interventions");
  const seen = new Set<string>();
  for (const intervention of candidate) {
    const record = requireObject(intervention, "an intervention");
    const kind = record["kind"];
    if (typeof kind !== "string" || !(PINNED_INTERVENTION_KINDS as readonly string[]).includes(kind)) {
      throw new ScenarioExplorationError(`intervention kind '${String(kind)}' is not a member of the closed intervention vocabulary`);
    }
    const interventionId = record["interventionId"];
    if (!isNonEmptyString(interventionId)) throw new ScenarioExplorationError("every intervention must carry a non-empty interventionId");
    if (seen.has(interventionId)) throw new ScenarioExplorationError(`duplicate interventionId '${interventionId}' is rejected`);
    seen.add(interventionId);
  }
  return candidate as readonly PinnedScenarioIntervention[];
}

function validateProgram(candidate: unknown, subject: string): PinnedSimulationProgram {
  const record = requireObject(candidate, subject);
  if (!isNonEmptyString(record["programId"]) || !isNonEmptyString(record["programVersion"])) {
    throw new ScenarioExplorationError(`${subject} must carry non-empty programId and programVersion`);
  }
  return record as unknown as PinnedSimulationProgram;
}

function requireDelta(value: unknown, subject: string): PinnedReplayDelta {
  const record = requireObject(value, subject);
  for (const field of [
    "settled", "partiallySettled", "failedNoViableRoute", "unknownOutcomes",
    "adversarialSettled", "deadlineMisses",
  ] as const) {
    if (typeof record[field] !== "number" || !Number.isSafeInteger(record[field])) {
      throw new ScenarioExplorationError(`${subject}.${field} must be an integer counter`);
    }
  }
  for (const field of ["feesMinor", "fxSpreadPaidMinor", "externalValueMovedMinor"] as const) {
    if (typeof record[field] !== "bigint") throw new ScenarioExplorationError(`${subject}.${field} must be exact bigint minor units`);
  }
  return value as PinnedReplayDelta;
}

/** Fail-closed validation of the port's returned projection (a lying port never composes). */
function validateExplorationResult(
  result: unknown,
  request: ScenarioExplorationRequest,
): PinnedScenarioExploration {
  const record = requireObject(result, "the scenario exploration result");
  if (record["baseFactsId"] !== request.baseFacts.factsId || record["baseFactsDigest"] !== request.baseFacts.factsDigest) {
    throw new ScenarioExplorationError("the exploration result must be grounded on the requested immutable base facts (id + digest) — a port that swaps facts never composes");
  }
  for (const field of ["baseFactsId", "baseFactsDigest", "suiteDigest"] as const) {
    if (!isNonEmptyString(record[field])) throw new ScenarioExplorationError(`the exploration result.${field} must be a non-empty string`);
  }
  const selected = record["selectedInterventionIds"];
  if (!Array.isArray(selected) || !selected.every((id) => isNonEmptyString(id))) {
    throw new ScenarioExplorationError("the exploration result.selectedInterventionIds must be an array of strings");
  }
  const requested = new Set(request.interventions.map((intervention) => intervention.interventionId));
  for (const id of selected) {
    if (!requested.has(id)) throw new ScenarioExplorationError(`selected intervention '${id}' was never requested — the port never invents candidates`);
  }
  const receipts = record["receipts"];
  if (!Array.isArray(receipts)) throw new ScenarioExplorationError("the exploration result.receipts must be an array");
  for (const receipt of receipts) {
    const entry = requireObject(receipt, "a truncation receipt");
    if (
      typeof entry["dimension"] !== "string" ||
      !(PINNED_SCENARIO_BUDGET_DIMENSIONS as readonly string[]).includes(entry["dimension"]) ||
      typeof entry["limit"] !== "number" || typeof entry["actualCount"] !== "number" ||
      entry["disclosedAs"] !== "TRUNCATED"
    ) {
      throw new ScenarioExplorationError("every truncation receipt must carry a budget dimension, its limit, the TRUE pre-cut count and disclosedAs TRUNCATED");
    }
  }
  const coverage = record["coverage"];
  if (coverage !== "COMPLETE" && coverage !== "TRUNCATED") {
    throw new ScenarioExplorationError("the exploration result.coverage must be COMPLETE or TRUNCATED");
  }
  if (receipts.length > 0 && coverage !== "TRUNCATED") {
    throw new ScenarioExplorationError("a receipt implies an exclusion — coverage can never claim COMPLETE while a truncation receipt exists (ADR-0009 D6)");
  }
  const scenarios = record["scenarios"];
  if (!Array.isArray(scenarios)) throw new ScenarioExplorationError("the exploration result.scenarios must be an array");
  const scenarioIds = scenarios.map((scenario) => {
    const entry = requireObject(scenario, "a scenario outcome");
    if (
      !isNonEmptyString(entry["interventionId"]) || typeof entry["kind"] !== "string" ||
      !(PINNED_INTERVENTION_KINDS as readonly string[]).includes(entry["kind"]) ||
      !isNonEmptyString(entry["counterfactualId"]) ||
      typeof entry["counterfactualDigest"] !== "string" || !LAB_DIGEST_PATTERN.test(entry["counterfactualDigest"])
    ) {
      throw new ScenarioExplorationError("every scenario must carry its interventionId, named kind, counterfactualId and the Lab-flavored counterfactual digest");
    }
    requireDelta(entry["delta"], `scenario '${String(entry["interventionId"])}'.delta`);
    return entry["interventionId"] as string;
  });
  if (new Set(scenarioIds).size !== scenarioIds.length || scenarios.length !== selected.length) {
    throw new ScenarioExplorationError("the scenarios must be exactly the selected interventions' outcomes (one per admitted scenario, no duplicates)");
  }
  return record as unknown as PinnedScenarioExploration;
}

/**
 * Explore bounded counterfactual scenarios through the INJECTED port
 * (stage 6): validates every input fail-closed (the count-based budget,
 * the closed intervention vocabulary, unique ids, the immutable base
 * facts' Lab digest, the caller-supplied seed/stepMs), calls the REAL
 * lab machinery through the port, validates the returned projection
 * fail-closed (facts grounding, honest receipts, the
 * receipt-implies-TRUNCATED law), and returns the ADVISORY deep-frozen
 * exploration with THIS package's value-form digest.
 */
export function exploreBoundedScenarios(input: {
  readonly port: ScenarioExplorationPort; readonly baseFacts: PinnedRecordedProductionFacts;
  readonly interventions: readonly PinnedScenarioIntervention[]; readonly budget: PinnedScenarioSearchBudget;
  readonly baseProgram: PinnedSimulationProgram; readonly variantProgram: PinnedSimulationProgram;
  readonly seed: string; readonly stepMs: number;
}): BoundedScenarioExploration {
  const request = requireObject(input, "the scenario exploration request");
  const port = requireScenarioExplorationPort(request["port"]);
  const baseFacts = validateBaseFacts(request["baseFacts"]);
  const interventions = validateInterventions(request["interventions"]);
  const budget = validateScenarioBudget(request["budget"]);
  const baseProgram = validateProgram(request["baseProgram"], "the base program");
  const variantProgram = validateProgram(request["variantProgram"], "the variant program");
  if (!isNonEmptyString(request["seed"])) {
    throw new ScenarioExplorationError("the exploration seed must be a non-empty string (caller-supplied)");
  }
  const stepMs = requirePositiveInt(request["stepMs"], "the exploration stepMs");
  const explorationRequest: ScenarioExplorationRequest = deepFreeze({
    baseFacts, interventions, budget, baseProgram, variantProgram, seed: request["seed"], stepMs,
  });
  const result = validateExplorationResult(port.explore(explorationRequest), explorationRequest);
  const explorationDigest = contentDigest({
    stage: SCENARIO_EXPLORATION_STAGE,
    baseFactsId: result.baseFactsId, baseFactsDigest: result.baseFactsDigest,
    suiteDigest: result.suiteDigest, budget,
    selectedInterventionIds: result.selectedInterventionIds,
    receipts: result.receipts, coverage: result.coverage,
    scenarios: result.scenarios.map((scenario) => ({
      interventionId: scenario.interventionId, kind: scenario.kind,
      counterfactualId: scenario.counterfactualId, counterfactualDigest: scenario.counterfactualDigest,
      delta: scenario.delta,
    })),
    scenariosPermitExecution: false,
  });
  return deepFreeze({
    stage: SCENARIO_EXPLORATION_STAGE,
    baseFactsId: result.baseFactsId, baseFactsDigest: result.baseFactsDigest, budget,
    selectedInterventionIds: result.selectedInterventionIds, receipts: result.receipts,
    coverage: result.coverage, scenarios: result.scenarios, suiteDigest: result.suiteDigest,
    explorationDigest, advisoryOnly: true, scenariosPermitExecution: false,
  });
}

/** The P23-C real-facts path (the substance in ./lab-facts.ts, the 400-line file law). */
export * from "./lab-facts.ts";
