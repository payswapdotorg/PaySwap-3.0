import { describe, expect, it } from "vitest";
import {
  REPLAY_NAMESPACE,
  isReplayResult,
  recordProductionFacts,
  runReplay,
} from "@payswap/lab";
import type { RecordedProductionFacts, SimulationProgram } from "@payswap/lab";
import {
  INTERVENTION_KINDS,
  InterventionError,
  THIRD_PARTY_NODE_ROLES,
  applyIntervention,
  runInterventionCounterfactual,
  validateIntervention,
} from "../src/interventions.ts";
import { RecordedFactsError } from "../src/errors.ts";

/**
 * Named interventions over frozen recorded facts (P16-B, B4). The pinned
 * laws: the base facts are NEVER rewritten (snapshot + frozen assertions
 * across all intervention kinds); the variant facts are a NEW fact set
 * built through the EXISTING recordProductionFacts machinery; tampered
 * base facts are rejected; both branches of the counterfactual replay
 * through the UNMODIFIED runReplay machinery; identical inputs give
 * byte-identical digests; credit is never liquidity (drawn only under the
 * variant program's useNetworkCredit flag).
 *
 * Site classification (this file): 13 NET-NEW sites.
 */

const BASE_PROGRAM: SimulationProgram = {
  programId: "iv.base", programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b"], useNetting: false, useNetworkCredit: false,
  delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

const CREDIT_PROGRAM: SimulationProgram = {
  ...BASE_PROGRAM, programId: "iv.credit", useNetworkCredit: true,
};

function makeFacts(): RecordedProductionFacts {
  return recordProductionFacts({
    factsId: "iv-facts",
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

/** A liquidity-starved world: the demand exceeds every pool (credit flag is the only way through). */
function starvedFacts(): RecordedProductionFacts {
  return recordProductionFacts({
    factsId: "iv-starved",
    rails: [{ railId: "rail-a", currency: "EUR", latencyMs: 400, fixedFeeMinor: 25n, variableFeeBps: 10n }],
    pools: [{ poolId: "pool-a", railId: "rail-a", availableMinor: 100_000n }],
    stepLatencyMs: 250,
    demands: [
      { demandId: "d1", observedAtMs: 0, amountMinor: 500_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 30_000 },
    ],
    incidents: [],
  });
}

const RAIL_ADDED = {
  kind: "RAIL_ADDED", interventionId: "add-rail-c", name: "rail c enters",
  rail: { railId: "rail-c", currency: "EUR", latencyMs: 500, fixedFeeMinor: 10n, variableFeeBps: 5n },
  pools: [{ poolId: "pool-c", railId: "rail-c", availableMinor: 5_000_000n }],
} as const;

describe("named interventions over frozen recorded facts (P16-B, B4)", () => {
  it("the intervention vocabularies are frozen, closed and canonically ordered", () => {
    expect(Object.isFrozen(INTERVENTION_KINDS)).toBe(true);
    expect(INTERVENTION_KINDS).toEqual([
      "RAIL_ADDED", "RAIL_REMOVED", "POOL_FUNDED", "THIRD_PARTY_NODE_JOINS",
      "GROUP_DEMAND_ADDED", "INCIDENT_APPLIED", "CREDIT_COMMITMENT",
    ]);
    expect(Object.isFrozen(THIRD_PARTY_NODE_ROLES)).toBe(true);
    expect(THIRD_PARTY_NODE_ROLES).toEqual(["intermediary", "liquidity_source", "payout_endpoint"]);
    expect(() => validateIntervention({ kind: "RAIL_TELEPORTED", interventionId: "x" })).toThrow(InterventionError);
    expect(() => validateIntervention({ kind: "THIRD_PARTY_NODE_JOINS", interventionId: "x", nodeId: "n", role: "oracle", rails: [] })).toThrow(/role/);
  });

  it("applyIntervention builds a NEW variant fact set and NEVER rewrites the base facts", () => {
    const facts = makeFacts();
    const snapshot = { factsId: facts.factsId, digest: facts.factsDigest, rails: facts.rails, pools: facts.pools, demands: facts.demands };
    const variant = applyIntervention(facts, RAIL_ADDED);
    expect(facts.factsId).toBe(snapshot.factsId);
    expect(facts.factsDigest).toBe(snapshot.digest);
    expect(facts.rails).toEqual(snapshot.rails);
    expect(facts.pools).toEqual(snapshot.pools);
    expect(facts.demands).toEqual(snapshot.demands);
    expect(facts.rails).toHaveLength(2); // the BASE is untouched
    expect(Object.isFrozen(facts.rails)).toBe(true);
    // The variant is a distinct frozen fact set with variant-namespaced id + provenance.
    expect(variant.facts.factsId).toBe("variant:iv-facts:add-rail-c");
    expect(variant.facts.rails).toHaveLength(3);
    expect(variant.facts.pools).toHaveLength(3);
    expect(variant.baseFactsId).toBe("iv-facts");
    expect(variant.baseFactsDigest).toBe(facts.factsDigest);
    expect(variant.intervention.interventionId).toBe("add-rail-c");
    expect(Object.isFrozen(variant.facts.rails)).toBe(true);
    expect(variant.facts.factsDigest).not.toBe(facts.factsDigest);
  });

  it("POOL_FUNDED adds exact bigint liquidity to exactly one pool", () => {
    const variant = applyIntervention(makeFacts(), { kind: "POOL_FUNDED", interventionId: "fund-pool-a", poolId: "pool-a", addedMinor: 250_000n });
    expect(variant.facts.pools).toEqual([
      { poolId: "pool-a", railId: "rail-a", availableMinor: 1_250_000n },
      { poolId: "pool-b", railId: "rail-b", availableMinor: 800_000n },
    ]);
    expect(() => applyIntervention(makeFacts(), { kind: "POOL_FUNDED", interventionId: "fund-x", poolId: "pool-x", addedMinor: 1n })).toThrow(/unknown fund target/);
    expect(() => applyIntervention(makeFacts(), { kind: "POOL_FUNDED", interventionId: "zero", poolId: "pool-a", addedMinor: 0n })).toThrow(InterventionError);
  });

  it("RAIL_REMOVED cascades its bound pools out of the variant world", () => {
    const variant = applyIntervention(makeFacts(), { kind: "RAIL_REMOVED", interventionId: "rm-rail-a", railId: "rail-a" });
    expect(variant.facts.rails.map((rail) => rail.railId)).toEqual(["rail-b"]);
    expect(variant.facts.pools.map((pool) => pool.poolId)).toEqual(["pool-b"]); // pool-a left with rail-a
    expect(() => applyIntervention(makeFacts(), { kind: "RAIL_REMOVED", interventionId: "rm-x", railId: "rail-x" })).toThrow(/unknown remove target/);
  });

  it("THIRD_PARTY_NODE_JOINS is party-carrying: the added rails belong to the declared node", () => {
    const intervention = {
      kind: "THIRD_PARTY_NODE_JOINS", interventionId: "node-joins", nodeId: "node-zeta", role: "intermediary",
      rails: [{ railId: "rail-z", currency: "EUR", latencyMs: 300, fixedFeeMinor: 12n, variableFeeBps: 6n }],
      pools: [{ poolId: "pool-z", railId: "rail-z", availableMinor: 2_000_000n }],
    } as const;
    const variant = applyIntervention(makeFacts(), intervention);
    expect(variant.facts.rails.map((rail) => rail.railId)).toEqual(["rail-a", "rail-b", "rail-z"]);
    expect(variant.intervention).toEqual(intervention);
    // A pool referencing a rail that is not real (foreign rail) is rejected.
    expect(() => applyIntervention(makeFacts(), {
      ...intervention, interventionId: "node-foreign",
      pools: [{ poolId: "pool-f", railId: "rail-ghost", availableMinor: 1n }],
    })).toThrow(/foreign rail/);
  });

  it("GROUP_DEMAND_ADDED maps atStep to observedAtMs via the base stepLatencyMs and rejects id collisions", () => {
    const intervention = {
      kind: "GROUP_DEMAND_ADDED", interventionId: "group-1",
      demands: [
        { demandId: "g1", atStep: 2, amountMinor: 60_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 20_000, debtor: "party-a", creditor: "party-b" },
        { demandId: "g2", atStep: 4, amountMinor: 30_000n, currency: "EUR", direction: "INBOUND", deadlineMs: 20_000 },
      ],
    } as const;
    const variant = applyIntervention(makeFacts(), intervention);
    expect(variant.facts.demands).toHaveLength(3);
    expect(variant.facts.demands[1]).toEqual({ demandId: "g1", observedAtMs: 500, amountMinor: 60_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 20_000 });
    expect(variant.facts.demands[2]).toEqual({ demandId: "g2", observedAtMs: 1000, amountMinor: 30_000n, currency: "EUR", direction: "INBOUND", deadlineMs: 20_000 });
    expect(() => applyIntervention(makeFacts(), { ...intervention, interventionId: "group-2", demands: [{ ...intervention.demands[0], demandId: "d1" }] })).toThrow(/d1/);
    // The multi-party annotations stay on the intervention record (party-free facts shape).
    expect(intervention.demands[0].debtor).toBe("party-a");
  });

  it("INCIDENT_APPLIED maps the declared step and enforces the incident taxonomy", () => {
    const variant = applyIntervention(makeFacts(), {
      kind: "INCIDENT_APPLIED", interventionId: "incident-1",
      incident: { incidentType: "PROVIDER_OUTAGE", atStep: 3, railId: "rail-b" },
    });
    expect(variant.facts.incidents).toEqual([{ incidentType: "PROVIDER_OUTAGE", atStep: 3, railId: "rail-b", observedAtMs: 750 }]);
    expect(() => applyIntervention(makeFacts(), {
      kind: "INCIDENT_APPLIED", interventionId: "bad",
      incident: { incidentType: "SOLAR_FLARE", atStep: 1 },
    } as unknown as Parameters<typeof applyIntervention>[1])).toThrow(/incidentType/);
  });

  it("CREDIT_COMMITMENT is an annotation stand-in: rails/pools/demands/incidents are carried unchanged", () => {
    const facts = makeFacts();
    const variant = applyIntervention(facts, {
      kind: "CREDIT_COMMITMENT", interventionId: "credit-1", nodeId: "node-beta",
      currency: "EUR", limitMinor: 750_000n, priceBps: 40n, expiresAtStep: 12,
    });
    expect(variant.facts.rails).toEqual(facts.rails);
    expect(variant.facts.pools).toEqual(facts.pools);
    expect(variant.facts.demands).toEqual(facts.demands);
    expect(variant.facts.incidents).toEqual(facts.incidents);
    expect(variant.facts.factsId).toBe("variant:iv-facts:credit-1"); // only the identity differs
    expect(() => validateIntervention({ kind: "CREDIT_COMMITMENT", interventionId: "x", nodeId: "n", currency: "EUR", limitMinor: 0n, priceBps: 1n, expiresAtStep: 1 })).toThrow(InterventionError);
  });

  it("a tampered base fact set is rejected with RecordedFactsError before any derivation", () => {
    const facts = makeFacts();
    const tampered = { ...facts, factsDigest: "labfnv1a64:0000000000000000" };
    expect(() => applyIntervention(tampered as RecordedProductionFacts, RAIL_ADDED)).toThrow(RecordedFactsError);
  });

  it("fail-closed validation: unconstructible shapes throw typed InterventionError", () => {
    expect(() => validateIntervention(null)).toThrow(InterventionError);
    expect(() => validateIntervention({ kind: "RAIL_ADDED", interventionId: "" })).toThrow(/interventionId/);
    expect(() => validateIntervention({ kind: "RAIL_ADDED", interventionId: "x", name: "n", rail: { railId: "r", currency: "EUR", latencyMs: -1, fixedFeeMinor: 1n, variableFeeBps: 1n } })).toThrow(/latencyMs/);
    expect(() => validateIntervention({ kind: "GROUP_DEMAND_ADDED", interventionId: "x", demands: [] })).toThrow(/array of at least 1/);
    expect(() => validateIntervention({ kind: "GROUP_DEMAND_ADDED", interventionId: "x", demands: [{ demandId: "a", atStep: 0, amountMinor: 10, currency: "EUR", direction: "OUTBOUND", deadlineMs: 10 }] })).toThrow(/bigint/);
    expect(() => validateIntervention({ kind: "GROUP_DEMAND_ADDED", interventionId: "x", demands: [
      { demandId: "a", atStep: 0, amountMinor: 1n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 10, debtor: "p", creditor: "p" },
    ] })).toThrow(/differ/);
    expect(() => validateIntervention({ kind: "POOL_FUNDED", interventionId: "x", poolId: "p", addedMinor: -5n })).toThrow(InterventionError);
    expect(() => validateIntervention({ kind: "RAIL_ADDED", interventionId: "x", name: "n", rail: { railId: "r", currency: "EUR", latencyMs: 1, fixedFeeMinor: 1n, variableFeeBps: 1n }, pools: [{ poolId: "p", railId: "r", availableMinor: 1n }, { poolId: "p", railId: "r", availableMinor: 2n }] })).toThrow(/duplicate/);
    // Facts-relative: a rail id colliding with the base facts is rejected at apply time.
    expect(() => applyIntervention(makeFacts(), { kind: "RAIL_ADDED", interventionId: "x", name: "n", rail: { railId: "rail-a", currency: "EUR", latencyMs: 1, fixedFeeMinor: 1n, variableFeeBps: 1n } })).toThrow(/rail-a/);
  });

  it("runInterventionCounterfactual replays both branches through the unmodified runReplay machinery", () => {
    const facts = makeFacts();
    const result = runInterventionCounterfactual({
      facts, intervention: RAIL_ADDED, baseProgram: BASE_PROGRAM, variantProgram: CREDIT_PROGRAM, seed: "iv-seed", stepMs: 250,
    });
    // The base branch is byte-identical to a standalone runReplay of the base facts.
    const standaloneBase = runReplay({ facts, program: BASE_PROGRAM, seed: "iv-seed", stepMs: 250 });
    expect(result.base.digest).toBe(standaloneBase.digest);
    expect(result.base.factsDigest).toBe(facts.factsDigest);
    // The variant branch replays the VARIANT fact set (digest-verified).
    expect(result.variant.factsDigest).toBe(result.variantFacts.facts.factsDigest);
    expect(result.variant.factsId).toBe("variant:iv-facts:add-rail-c");
    expect(result.variantFacts.facts.factsDigest).toBe(recordProductionFactsDigestOf(result));
    // Both branches carry the REPLAY namespace brand.
    expect(result.namespace).toBe(REPLAY_NAMESPACE);
    expect(isReplayResult(result.base)).toBe(true);
    expect(isReplayResult(result.variant)).toBe(true);
    expect(result.digest.startsWith("labfnv1a64:")).toBe(true);
    expect(result.counterfactualId).toBe(`intervention:${result.digest}`);
  });

  it("the delta is exact and recomputable, and identical inputs give byte-identical digests", () => {
    const facts = makeFacts();
    const input = { facts, intervention: RAIL_ADDED, baseProgram: BASE_PROGRAM, variantProgram: CREDIT_PROGRAM, seed: "iv-seed", stepMs: 250 };
    const first = runInterventionCounterfactual(input);
    const second = runInterventionCounterfactual(input);
    expect(first.digest).toBe(second.digest);
    expect(first.counterfactualId).toBe(second.counterfactualId);
    expect(first.variantFacts.facts.factsDigest).toBe(second.variantFacts.facts.factsDigest);
    // Independent recomputation of the delta from the two replay metrics.
    expect(first.delta.settled).toBe(second.variant.run.metrics.settled - second.base.run.metrics.settled);
    expect(first.delta.feesMinor).toBe(second.variant.run.metrics.feesMinor - second.base.run.metrics.feesMinor);
    expect(first.delta.externalValueMovedMinor).toBe(second.variant.run.metrics.externalValueMovedMinor - second.base.run.metrics.externalValueMovedMinor);
  });

  it("credit changes outcomes only under the variant program's useNetworkCredit flag (never as fact-level liquidity)", () => {
    const facts = starvedFacts();
    const intervention = { kind: "CREDIT_COMMITMENT", interventionId: "credit-1", nodeId: "node-beta", currency: "EUR", limitMinor: 750_000n, priceBps: 40n, expiresAtStep: 12 } as const;
    // Without the flag: the starved pool fails the demand in BOTH branches.
    const withoutCredit = runInterventionCounterfactual({ facts, intervention, baseProgram: BASE_PROGRAM, variantProgram: BASE_PROGRAM, seed: "s", stepMs: 250 });
    expect(withoutCredit.delta.settled).toBe(0);
    expect(withoutCredit.base.run.metrics.failedNoViableRoute).toBe(1);
    // With the flag: the variant program settles through surfaced credit exposure — the intervention itself added NO liquidity.
    const withCredit = runInterventionCounterfactual({ facts, intervention, baseProgram: BASE_PROGRAM, variantProgram: CREDIT_PROGRAM, seed: "s", stepMs: 250 });
    expect(withCredit.variantFacts.facts.pools).toEqual(facts.pools);
    expect(withCredit.delta.settled).toBe(1);
    expect(withCredit.variant.run.metrics.creditExposureMinor).toBe(400_000n);
  });
});

/** Digest of the variant fact set as recomputed through the public recording machinery. */
function recordProductionFactsDigestOf(result: ReturnType<typeof runInterventionCounterfactual>): string {
  const facts = result.variantFacts.facts;
  const rebuilt = recordProductionFacts({
    factsId: facts.factsId, rails: [...facts.rails], pools: [...facts.pools],
    stepLatencyMs: facts.stepLatencyMs, demands: [...facts.demands], incidents: [...facts.incidents],
  });
  return rebuilt.factsDigest;
}
