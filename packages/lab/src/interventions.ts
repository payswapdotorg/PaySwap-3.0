/**
 * NAMED single interventions over frozen recorded facts (P16-B, gap-matrix
 * row B4; ADR-0009 D5/D6). A ScenarioIntervention names exactly ONE changed
 * assumption; applyIntervention NEVER rewrites the base facts — it
 * tamper-checks the base digest FIRST, validates fail-closed, then builds a
 * NEW frozen fact set through the EXISTING recordProductionFacts machinery
 * with factsId `variant:<baseFactsId>:<interventionId>` — Lab evidence only,
 * never production financial authority (INV-L01 / canonical INV-11).
 *
 * Step mapping law: observedAtMs = atStep x stepLatencyMs of the base
 * fact set — replay's inverse floor quantization, so replaying at
 * stepMs === stepLatencyMs reproduces the declared step. Determinism law:
 * no clock/randomness/I/O; identical inputs give byte-identical digests.
 */

import { canonicalize, deepFreeze, fnv1a64 } from "./canonical.ts";
import { ADVERSARIAL_DEMAND_KINDS, DEMAND_DIRECTIONS, SCENARIO_INCIDENT_TYPES } from "./simulation-plan.ts";
import type { AdversarialDemandKind, DemandDirection, ScenarioIncident, SimulationProgram } from "./simulation-plan.ts";
import type { SimulatedLiquidityPool, SimulatedRail } from "./simulation-world.ts";
import type { ReplayDelta } from "./counterfactual.ts";
import type { RecordedDemandFact, RecordedIncidentFact, RecordedProductionFacts, ReplayNamespaceBrand, ReplayResult } from "./replay.ts";
import { REPLAY_NAMESPACE, recordProductionFacts, recordedFactsDigest, runReplay } from "./replay.ts";
import { LabError, RecordedFactsError } from "./errors.ts";

/** An intervention is invalid or cannot be applied to the base facts. */
export class InterventionError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = "InterventionError";
  }
}

/** The closed intervention-kind vocabulary, canonical order (P16-D pins this list byte-identical). */
export const INTERVENTION_KINDS = Object.freeze([
  "RAIL_ADDED", "RAIL_REMOVED", "POOL_FUNDED", "THIRD_PARTY_NODE_JOINS",
  "GROUP_DEMAND_ADDED", "INCIDENT_APPLIED", "CREDIT_COMMITMENT",
] as const);

/** One kind of named intervention. */
export type InterventionKind = (typeof INTERVENTION_KINDS)[number];

/** The roles a joining third-party node may declare (P16-D pins this list byte-identical). */
export const THIRD_PARTY_NODE_ROLES = Object.freeze(["intermediary", "liquidity_source", "payout_endpoint"] as const);

/** The role a joining third-party node plays in the variant world. */
export type ThirdPartyNodeRole = (typeof THIRD_PARTY_NODE_ROLES)[number];

/** A new rail enters the variant world, optionally bringing pools. */
export interface RailAddedIntervention {
  readonly kind: "RAIL_ADDED"; readonly interventionId: string; readonly name: string; readonly rail: SimulatedRail;
  readonly pools?: readonly SimulatedLiquidityPool[];
}
/** A rail leaves; its bound pools leave with it (pools-reference-real-rails). */
export interface RailRemovedIntervention {
  readonly kind: "RAIL_REMOVED"; readonly interventionId: string; readonly railId: string;
}
/** An existing pool receives an exact bigint funding increase. */
export interface PoolFundedIntervention {
  readonly kind: "POOL_FUNDED"; readonly interventionId: string; readonly poolId: string; readonly addedMinor: bigint;
}
/** A third-party node joins; the added rails belong to the declared node. */
export interface ThirdPartyNodeJoinsIntervention {
  readonly kind: "THIRD_PARTY_NODE_JOINS"; readonly interventionId: string; readonly nodeId: string;
  readonly role: ThirdPartyNodeRole; readonly rails: readonly SimulatedRail[];
  readonly pools?: readonly SimulatedLiquidityPool[];
}

/**
 * One declared demand in a group/batch addition: `atStep` follows the step
 * mapping law, and the optional debtor/creditor annotations carry the
 * multi-party attribution (the simulation's demand shape is party-free, so
 * the parties live on the intervention record, never invented or dropped).
 */
export interface InterventionDemand {
  readonly demandId: string; readonly atStep: number; readonly amountMinor: bigint;
  readonly currency: string; readonly direction: DemandDirection; readonly deadlineMs: number;
  readonly debtor?: string; readonly creditor?: string; readonly adversarial?: AdversarialDemandKind;
  readonly partialBps?: bigint; readonly requiresApproval?: boolean;
}

/** A batch of multi-party demands enters the variant world at declared steps. */
export interface GroupDemandAddedIntervention {
  readonly kind: "GROUP_DEMAND_ADDED"; readonly interventionId: string; readonly demands: readonly InterventionDemand[];
}

/** One incident from the taxonomy enters the variant world at a declared step. */
export interface IncidentAppliedIntervention {
  readonly kind: "INCIDENT_APPLIED"; readonly interventionId: string; readonly incident: ScenarioIncident;
}

/**
 * An evidenced credit commitment STAND-IN. Credit is NEVER liquidity:
 * rails/pools are untouched, and the commitment is drawn against only under
 * the variant program's useNetworkCredit flag (the settle path treats an
 * uncovered gap as credit exposure, never as free money).
 */
export interface CreditCommitmentIntervention {
  readonly kind: "CREDIT_COMMITMENT"; readonly interventionId: string; readonly nodeId: string;
  readonly currency: string; readonly limitMinor: bigint; readonly priceBps: bigint;
  readonly expiresAtStep: number;
}

/** A named single intervention over an immutable recorded fact set. */
export type ScenarioIntervention =
  | RailAddedIntervention | RailRemovedIntervention | PoolFundedIntervention
  | ThirdPartyNodeJoinsIntervention | GroupDemandAddedIntervention
  | IncidentAppliedIntervention | CreditCommitmentIntervention;

/** The variant fact set plus its provenance (base facts + intervention). */
export interface VariantFacts {
  readonly facts: RecordedProductionFacts; readonly intervention: ScenarioIntervention; readonly baseFactsId: string;
  readonly baseFactsDigest: string;
}
// Fail-closed validation -----------------------------------------------------
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new InterventionError(`${field} must be a non-empty string`);
  return value;
}
function expectBigInt(value: unknown, field: string, minimum: bigint): bigint {
  if (typeof value === "number") throw new InterventionError(`${field} must be a bigint, not a JS number`);
  if (typeof value !== "bigint" || value < minimum) throw new InterventionError(`${field} must be a bigint of at least ${minimum}`);
  return value;
}
function expectInt(value: unknown, field: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) throw new InterventionError(`${field} must be an integer of at least ${minimum}`);
  return value;
}
function expectOneOf<T extends string>(value: unknown, field: string, vocabulary: readonly T[]): T {
  if (typeof value !== "string" || !(vocabulary as readonly string[]).includes(value)) throw new InterventionError(`${field} must be one of: ${vocabulary.join(", ")}`);
  return value as T;
}
function railShape(rail: unknown, field: string): SimulatedRail {
  if (!isObject(rail)) throw new InterventionError(`${field} must be a SimulatedRail object`);
  return {
    railId: expectString(rail.railId, `${field}.railId`), currency: expectString(rail.currency, `${field}.currency`),
    latencyMs: expectInt(rail.latencyMs, `${field}.latencyMs`, 0), fixedFeeMinor: expectBigInt(rail.fixedFeeMinor, `${field}.fixedFeeMinor`, 0n),
    variableFeeBps: expectBigInt(rail.variableFeeBps, `${field}.variableFeeBps`, 0n),
    ...(rail.fxSpreadBps === undefined ? {} : { fxSpreadBps: expectBigInt(rail.fxSpreadBps, `${field}.fxSpreadBps`, 0n) }),
  };
}
function poolShape(pool: unknown, field: string): SimulatedLiquidityPool {
  if (!isObject(pool)) throw new InterventionError(`${field} must be a SimulatedLiquidityPool object`);
  return {
    poolId: expectString(pool.poolId, `${field}.poolId`), railId: expectString(pool.railId, `${field}.railId`),
    availableMinor: expectBigInt(pool.availableMinor, `${field}.availableMinor`, 0n),
  };
}
function uniqueIds<T>(items: readonly T[], idOf: (item: T) => string, field: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const id = idOf(item);
    if (seen.has(id)) throw new InterventionError(`${field}: duplicate id '${id}'`);
    seen.add(id);
  }
}
function arrayField<T>(value: unknown, field: string, minimum: number, shape: (item: unknown, itemField: string) => T, idOf: (item: T) => string): readonly T[] {
  if (!Array.isArray(value) || value.length < minimum) throw new InterventionError(`${field} must be an array of at least ${minimum} entr${minimum === 1 ? "y" : "ies"}`);
  const items = value.map((item, index) => shape(item, `${field}[${index}]`));
  uniqueIds(items, idOf, field);
  return items;
}
function incidentShape(incident: unknown): ScenarioIncident {
  if (!isObject(incident)) throw new InterventionError("incident must be a ScenarioIncident object");
  const incidentType = expectOneOf(incident.incidentType, "incident.incidentType", SCENARIO_INCIDENT_TYPES);
  const atStep = expectInt(incident.atStep, "incident.atStep", 0);
  switch (incidentType) {
    case "PROVIDER_OUTAGE": case "DELAYED_WRITE": case "STALE_OBSERVATION":
      return { incidentType, atStep, railId: expectString(incident.railId, "incident.railId") };
    case "LIQUIDITY_SHORTAGE":
      return { incidentType, atStep, poolId: expectString(incident.poolId, "incident.poolId"), drainedMinor: expectBigInt(incident.drainedMinor, "incident.drainedMinor", 0n) };
    case "FX_VOLATILITY": return { incidentType, atStep, spreadIncreaseBps: expectBigInt(incident.spreadIncreaseBps, "incident.spreadIncreaseBps", 0n) };
    case "CONGESTION": return { incidentType, atStep, addedLatencyMs: expectInt(incident.addedLatencyMs, "incident.addedLatencyMs", 0) };
    case "APPROVAL_DELAY": return { incidentType, atStep, delayMs: expectInt(incident.delayMs, "incident.delayMs", 0) };
  }
}
function demandShape(demand: unknown, field: string): InterventionDemand {
  if (!isObject(demand)) throw new InterventionError(`${field} must be an InterventionDemand object`);
  if (demand.debtor !== undefined && demand.creditor !== undefined && demand.debtor === demand.creditor) throw new InterventionError(`${field}: debtor and creditor must differ`);
  if (demand.requiresApproval !== undefined && typeof demand.requiresApproval !== "boolean") throw new InterventionError(`${field}.requiresApproval must be a boolean`);
  return {
    demandId: expectString(demand.demandId, `${field}.demandId`), atStep: expectInt(demand.atStep, `${field}.atStep`, 0),
    amountMinor: expectBigInt(demand.amountMinor, `${field}.amountMinor`, 1n), currency: expectString(demand.currency, `${field}.currency`),
    direction: expectOneOf(demand.direction, `${field}.direction`, DEMAND_DIRECTIONS), deadlineMs: expectInt(demand.deadlineMs, `${field}.deadlineMs`, 1),
    ...(demand.debtor === undefined ? {} : { debtor: expectString(demand.debtor, `${field}.debtor`) }),
    ...(demand.creditor === undefined ? {} : { creditor: expectString(demand.creditor, `${field}.creditor`) }),
    ...(demand.adversarial === undefined ? {} : { adversarial: expectOneOf(demand.adversarial, `${field}.adversarial`, ADVERSARIAL_DEMAND_KINDS) }),
    ...(demand.partialBps === undefined ? {} : { partialBps: expectBigInt(demand.partialBps, `${field}.partialBps`, 0n) }),
    ...(demand.requiresApproval === undefined ? {} : { requiresApproval: demand.requiresApproval }),
  };
}

/**
 * Fail-closed structural validator (unknown-typed input; unconstructible
 * shapes throw InterventionError). Facts-relative checks — collisions with
 * existing rails/pools/demands, unknown remove/fund targets — are applied
 * by applyIntervention against the base facts.
 */
export function validateIntervention(intervention: unknown): ScenarioIntervention {
  if (!isObject(intervention)) throw new InterventionError("intervention must be an object");
  const interventionId = expectString(intervention.interventionId, "interventionId");
  const kind = expectOneOf(intervention.kind, "intervention.kind", INTERVENTION_KINDS);
  const poolsOf = (field: string): readonly SimulatedLiquidityPool[] | undefined =>
    intervention.pools === undefined ? undefined : arrayField(intervention.pools, field, 0, poolShape, (pool) => pool.poolId);
  switch (kind) {
    case "RAIL_ADDED": {
      const pools = poolsOf("RAIL_ADDED.pools");
      return { kind, interventionId, name: expectString(intervention.name, "RAIL_ADDED.name"), rail: railShape(intervention.rail, "RAIL_ADDED.rail"), ...(pools === undefined ? {} : { pools }) };
    }
    case "RAIL_REMOVED":
      return { kind, interventionId, railId: expectString(intervention.railId, "RAIL_REMOVED.railId") };
    case "POOL_FUNDED":
      return { kind, interventionId, poolId: expectString(intervention.poolId, "POOL_FUNDED.poolId"), addedMinor: expectBigInt(intervention.addedMinor, "POOL_FUNDED.addedMinor", 1n) };
    case "THIRD_PARTY_NODE_JOINS": {
      const pools = poolsOf("THIRD_PARTY_NODE_JOINS.pools");
      return {
        kind, interventionId, nodeId: expectString(intervention.nodeId, "THIRD_PARTY_NODE_JOINS.nodeId"),
        role: expectOneOf(intervention.role, "THIRD_PARTY_NODE_JOINS.role", THIRD_PARTY_NODE_ROLES),
        rails: arrayField(intervention.rails, "THIRD_PARTY_NODE_JOINS.rails", 1, railShape, (rail) => rail.railId), ...(pools === undefined ? {} : { pools }),
      };
    }
    case "GROUP_DEMAND_ADDED":
      return { kind, interventionId, demands: arrayField(intervention.demands, "GROUP_DEMAND_ADDED.demands", 1, demandShape, (demand) => demand.demandId) };
    case "INCIDENT_APPLIED":
      return { kind, interventionId, incident: incidentShape(intervention.incident) };
    case "CREDIT_COMMITMENT":
      return {
        kind, interventionId, nodeId: expectString(intervention.nodeId, "CREDIT_COMMITMENT.nodeId"),
        currency: expectString(intervention.currency, "CREDIT_COMMITMENT.currency"), limitMinor: expectBigInt(intervention.limitMinor, "CREDIT_COMMITMENT.limitMinor", 1n),
        priceBps: expectBigInt(intervention.priceBps, "CREDIT_COMMITMENT.priceBps", 0n), expiresAtStep: expectInt(intervention.expiresAtStep, "CREDIT_COMMITMENT.expiresAtStep", 1),
      };
  }
}

// applyIntervention (base facts are NEVER rewritten) ------------------------
function requireStepLatency(facts: RecordedProductionFacts): number {
  if (typeof facts.stepLatencyMs !== "number" || facts.stepLatencyMs <= 0) {
    throw new InterventionError(`base fact set '${facts.factsId}' must carry a positive stepLatencyMs for the step mapping law`);
  }
  return facts.stepLatencyMs;
}
function ensureAbsent(ids: ReadonlySet<string>, id: string, what: string): void {
  if (ids.has(id)) throw new InterventionError(`${what}: id '${id}' already exists in the base facts`);
}
function ensurePresent(ids: ReadonlySet<string>, id: string, what: string, verb: string): void {
  if (!ids.has(id)) throw new InterventionError(`${what}: ${verb} target — '${id}' is not in the base facts`);
}
function appendPools(basePools: readonly SimulatedLiquidityPool[], added: readonly SimulatedLiquidityPool[] | undefined, resultingRails: readonly SimulatedRail[]): readonly SimulatedLiquidityPool[] {
  if (added === undefined || added.length === 0) return basePools;
  const railIds = new Set(resultingRails.map((rail) => rail.railId));
  const poolIds = new Set(basePools.map((pool) => pool.poolId));
  for (const pool of added) {
    ensureAbsent(poolIds, pool.poolId, "pool");
    if (!railIds.has(pool.railId)) throw new InterventionError(`pool '${pool.poolId}' references a foreign rail '${pool.railId}' (pools-reference-real-rails law)`);
    poolIds.add(pool.poolId);
  }
  return [...basePools, ...added];
}

/**
 * Applies one named intervention to an immutable recorded fact set,
 * producing a NEW variant fact set: base digest tamper-checked FIRST,
 * intervention validated fail-closed, every facts-relative collision
 * rejected (typed InterventionError), variant built through the EXISTING
 * recordProductionFacts machinery. The base facts are never mutated.
 */
export function applyIntervention(facts: RecordedProductionFacts, intervention: ScenarioIntervention): VariantFacts {
  if (recordedFactsDigest(facts) !== facts.factsDigest) {
    throw new RecordedFactsError(`recorded facts '${facts.factsId}' digest mismatch: the base fact set was tampered with after recording`);
  }
  const validated = validateIntervention(intervention);
  const variantId = `variant:${facts.factsId}:${validated.interventionId}`;
  let rails: readonly SimulatedRail[] = facts.rails;
  let pools: readonly SimulatedLiquidityPool[] = facts.pools;
  let demands: readonly RecordedDemandFact[] = facts.demands; let incidents: readonly RecordedIncidentFact[] = facts.incidents;
  const railIds = new Set(facts.rails.map((rail) => rail.railId));
  switch (validated.kind) {
    case "RAIL_ADDED": {
      ensureAbsent(railIds, validated.rail.railId, "RAIL_ADDED railId");
      rails = [...facts.rails, validated.rail];
      pools = appendPools(facts.pools, validated.pools, rails);
      break;
    }
    case "RAIL_REMOVED": {
      ensurePresent(railIds, validated.railId, "RAIL_REMOVED", "unknown remove");
      rails = facts.rails.filter((rail) => rail.railId !== validated.railId);
      // Cascade: pools bound to the removed rail leave with it (pools-reference-real-rails).
      pools = facts.pools.filter((pool) => pool.railId !== validated.railId);
      break;
    }
    case "POOL_FUNDED": {
      const poolIds = new Set(facts.pools.map((pool) => pool.poolId));
      ensurePresent(poolIds, validated.poolId, "POOL_FUNDED", "unknown fund");
      // Exact bigint add; no other pool is touched.
      pools = facts.pools.map((pool) => pool.poolId === validated.poolId ? { ...pool, availableMinor: pool.availableMinor + validated.addedMinor } : pool);
      break;
    }
    case "THIRD_PARTY_NODE_JOINS": {
      for (const rail of validated.rails) {
        ensureAbsent(railIds, rail.railId, "THIRD_PARTY_NODE_JOINS railId");
        railIds.add(rail.railId);
      }
      rails = [...facts.rails, ...validated.rails];
      pools = appendPools(facts.pools, validated.pools, rails);
      break;
    }
    case "GROUP_DEMAND_ADDED": {
      const stepLatencyMs = requireStepLatency(facts);
      const known = new Set(facts.demands.map((demand) => demand.demandId));
      for (const demand of validated.demands) {
        ensureAbsent(known, demand.demandId, "GROUP_DEMAND_ADDED");
        known.add(demand.demandId);
      }
      demands = [...facts.demands, ...validated.demands.map((demand) => ({
        demandId: demand.demandId, observedAtMs: demand.atStep * stepLatencyMs,
        amountMinor: demand.amountMinor, currency: demand.currency,
        direction: demand.direction, deadlineMs: demand.deadlineMs,
        ...(demand.adversarial === undefined ? {} : { adversarial: demand.adversarial }),
        ...(demand.partialBps === undefined ? {} : { partialBps: demand.partialBps }),
        ...(demand.requiresApproval === undefined ? {} : { requiresApproval: demand.requiresApproval }),
      }))];
      break;
    }
    case "INCIDENT_APPLIED": {
      const stepLatencyMs = requireStepLatency(facts);
      incidents = [...facts.incidents, { ...validated.incident, observedAtMs: validated.incident.atStep * stepLatencyMs }];
      break;
    }
    case "CREDIT_COMMITMENT":
      // Credit is never liquidity: rails/pools/demands/incidents are carried
      // unchanged; only the factsId (and thus the digest) differs. Drawn
      // against only under the variant program's useNetworkCredit flag.
      break;
  }
  const facts2 = recordProductionFacts({ factsId: variantId, rails: [...rails], pools: [...pools],
    stepLatencyMs: facts.stepLatencyMs, demands: [...demands], incidents: [...incidents] });
  return deepFreeze({ facts: facts2, intervention: validated, baseFactsId: facts.factsId, baseFactsDigest: facts.factsDigest });
}

// runInterventionCounterfactual (advisory evidence over frozen base facts) ---
export interface InterventionCounterfactualInput {
  readonly facts: RecordedProductionFacts; readonly intervention: ScenarioIntervention; readonly seed: string;
  readonly baseProgram: SimulationProgram; readonly variantProgram: SimulationProgram; readonly stepMs: number;
}

export interface InterventionCounterfactualResult extends ReplayNamespaceBrand {
  readonly namespace: typeof REPLAY_NAMESPACE; readonly counterfactualId: string; readonly interventionId: string;
  readonly base: ReplayResult; readonly variantFacts: VariantFacts; readonly variant: ReplayResult;
  /** variant − base per metric (positive = variant moved more/paid more). */
  readonly delta: ReplayDelta; readonly digest: string;
}

/**
 * Runs a named-intervention counterfactual: the base facts replay under the
 * base program and the VARIANT facts replay under the variant program — both
 * through the SAME unmodified runReplay machinery — and the delta is the
 * existing ReplayDelta (variant − base, exact bigint money). Deterministic;
 * REPLAY-namespace branded, advisory Lab evidence only.
 */
export function runInterventionCounterfactual(input: InterventionCounterfactualInput): InterventionCounterfactualResult {
  const variantFacts = applyIntervention(input.facts, input.intervention);
  const base = runReplay({ facts: input.facts, program: input.baseProgram, seed: input.seed, stepMs: input.stepMs });
  const variant = runReplay({ facts: variantFacts.facts, program: input.variantProgram, seed: input.seed, stepMs: input.stepMs });
  const baseMetrics = base.run.metrics; const variantMetrics = variant.run.metrics;
  const delta: ReplayDelta = {
    settled: variantMetrics.settled - baseMetrics.settled,
    partiallySettled: variantMetrics.partiallySettled - baseMetrics.partiallySettled,
    failedNoViableRoute: variantMetrics.failedNoViableRoute - baseMetrics.failedNoViableRoute,
    unknownOutcomes: variantMetrics.unknownOutcomes - baseMetrics.unknownOutcomes, feesMinor: variantMetrics.feesMinor - baseMetrics.feesMinor,
    fxSpreadPaidMinor: variantMetrics.fxSpreadPaidMinor - baseMetrics.fxSpreadPaidMinor,
    externalValueMovedMinor: variantMetrics.externalValueMovedMinor - baseMetrics.externalValueMovedMinor,
    adversarialSettled: variantMetrics.adversarialSettled - baseMetrics.adversarialSettled, deadlineMisses: variantMetrics.deadlineMisses - baseMetrics.deadlineMisses,
  };
  const digest = fnv1a64(canonicalize({
    interventionId: variantFacts.intervention.interventionId,
    baseFactsDigest: base.factsDigest, variantFactsDigest: variant.factsDigest,
    baseRunDigest: base.digest, variantRunDigest: variant.digest, delta,
  }));
  return deepFreeze({
    namespace: REPLAY_NAMESPACE, __payswapLabReplayNamespace: REPLAY_NAMESPACE,
    counterfactualId: `intervention:${digest}`, interventionId: variantFacts.intervention.interventionId,
    base, variantFacts, variant, delta, digest,
  });
}
