/**
 * PaySwap Desktop (P23-D, ADR-0015 D7) — THE NO-BYPASS BATTERY: the
 * deterministic-gate inviolability, consolidated at the composition tier
 * over the REAL composed emergence (deriveOpportunityEmergence over the
 * no-route world — the same composition the shipped engine adapter runs).
 *
 * THE D7 CLAUSES, each proven here or cited to its pinned home:
 *  (a) no advisory artifact (a conditional, a hypothesis, a platform work
 *      item, a model-proposal state) can ENTER the stage-4/5 compile/rank
 *      path as a candidate — the typed refusals (HardGateError) + the
 *      enumeration's compiler-only candidates;
 *  (b) the hard-gate evaluation + the ranking + the candidate enumeration
 *      are BYTE-IDENTICAL with vs without the emergence composition (the
 *      composition mutates nothing the gates read);
 *  (c) the AUTHORIZATION GATE: a non-dispatchable preview (the only
 *      "route" an advisory artifact could ever claim) can never arm
 *      authorization — the pure gate's typed GATES_BLOCKED refusal here,
 *      AND the REAL-channel proof (the no-route mission with the cards
 *      composed → GATES_BLOCKED) in ./p23-journey-emergence.test.ts;
 *  (d) available-now stays EMPTY and the per-side eligible route ids are
 *      UNCHANGED by the emergence composition;
 *  (e) NO protocol-command marker field at ANY nesting depth (the deep
 *      scan over every artifact family + the positive control).
 *
 * The STRUCTURAL FALSES are re-asserted through the composed artifacts
 * (discoveryPermitsExecution, agentCanExecuteOpportunities,
 * repairsPermitExecution, rejectConditionalForExecution, the hypotheses'
 * neverExecutable/advisoryOnly literals). The per-package pins (the A.8
 * model-proposal rejection codes, the marker scans on every lane-A DTO,
 * the route-compiler "RE-RUN, NEVER REPAIR" law, the Lab
 * never-authorization gates) stay in their own batteries — cited, never
 * duplicated. The architecture check stays 0/0/0 (the closure gate).
 */

import { describe, expect, it } from "vitest";

import {
  deriveRailSnapshotPair,
  enumerateRouteCandidates,
  evaluateHardGates,
  rankRoutes,
} from "@payswap/route-planning";
import {
  agentCanExecuteOpportunities,
  discoveryPermitsExecution,
  pinnedAssertNotProtocolCommand,
  rejectConditionalForExecution,
} from "@payswap/opportunities";

import { deriveOpportunityEmergence } from "../../src/renderer/src/opportunityEmergenceAdapter.js";
import {
  compositionDefaultBestExecutionPolicy,
  emptyEvidenceBundle,
} from "../../src/renderer/src/routePlanningEngineAdapter.js";
import { createAuthorizationGate } from "../../src/host/payswap/payments/authorization-gate.js";
import {
  flwSenderChain,
  noRouteCorridorQuery,
  noRouteIntentFixture,
  stripeRecipientChain,
} from "../../../route-planning/test/no-route-fixtures.ts";
import { realCorridorProjectionPort } from "../../../route-planning/test/fixtures.ts";
import { realCompilationPortStub } from "./p23-emergence-fixtures.ts";

const NOW = Date.parse("2026-10-05T00:00:00Z");
const SEARCH_BUDGET = { maxCandidates: 12, maxShapes: 9, maxCandidatesPerShape: 4 } as never;

/** The no-route world (the emergence battery's own fixtures — the shipped adapter's composition context). */
function noRouteWorld() {
  const pair = deriveRailSnapshotPair({
    sender: { side: "SENDER", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 }, chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort() },
    recipient: { side: "RECIPIENT", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 }, chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort() },
  });
  return { pair, movement: noRouteIntentFixture() };
}

/** The REAL composed emergence over the no-route world (the engine adapter's wiring, verbatim). */
function noRouteEmergence(world: ReturnType<typeof noRouteWorld>) {
  return deriveOpportunityEmergence({
    senderSnapshot: world.pair.sender,
    recipientSnapshot: world.pair.recipient,
    hardGates: evaluateHardGates({ intent: world.movement, at: NOW, candidates: [] }),
    movement: world.movement,
    query: noRouteCorridorQuery() as never,
    at: NOW,
    evidence: emptyEvidenceBundle(),
    searchBudget: SEARCH_BUDGET,
    scenarioBudget: { maxScenarios: 4 },
    compilationPort: realCompilationPortStub(),
    policy: compositionDefaultBestExecutionPolicy() as never,
    intentPrincipalRef: world.movement.principalRef,
    intentExpiresAt: world.movement.expiresAt,
  });
}

/** The stage-4/5 run (the compiler through the port → the typed gates → the transparent ranking). */
function stageFourFive(world: ReturnType<typeof noRouteWorld>) {
  const enumeration = enumerateRouteCandidates({
    intent: world.movement,
    at: NOW,
    senderSnapshot: world.pair.sender,
    recipientSnapshot: world.pair.recipient,
    corridorQuery: noRouteCorridorQuery(),
    evidence: emptyEvidenceBundle(),
    budget: SEARCH_BUDGET,
    compilationPort: realCompilationPortStub(),
  });
  const gates = evaluateHardGates({ intent: world.movement, at: NOW, candidates: enumeration.candidates });
  const ranking = rankRoutes({ evaluation: gates, policy: compositionDefaultBestExecutionPolicy() as never });
  return {
    candidates: JSON.stringify(enumeration.candidates),
    gates: JSON.stringify(gates),
    ranked: JSON.stringify(ranking.ranked),
  };
}

describe("the P23 no-bypass battery (ADR-0015 D7 — the deterministic-gate inviolability over the REAL composed emergence)", () => {
  it("(a) the advisory artifacts are TYPED-REFUSED as stage-4/5 candidates — they never enter the compile/rank path", () => {
    const world = noRouteWorld();
    const emergence = noRouteEmergence(world);
    const smuggles = [
      emergence.conditionalOpportunities[0]!,
      emergence.platformWork[0]!,
      emergence.hypotheses[0]!,
      emergence.modelProposals,
    ];
    for (const smuggled of smuggles) {
      expect(() => evaluateHardGates({ intent: world.movement, at: NOW, candidates: [smuggled as unknown as never] }))
        .toThrow(/every candidate must carry a non-empty planId/);
    }
    // The enumeration's candidates come from the compiler ONLY (here: the
    // honest empty set — an advisory artifact is structurally not a candidate).
    expect(JSON.parse(stageFourFive(world).candidates)).toEqual([]);
  });

  it("(b) the hard-gate evaluation, the ranking and the candidate enumeration are BYTE-IDENTICAL with vs without the emergence composition", () => {
    const world = noRouteWorld();
    const before = stageFourFive(world);
    const emergence = noRouteEmergence(world);
    expect(emergence.conditionalOpportunities.length).toBe(3);
    const after = stageFourFive(world);
    expect(after.candidates).toBe(before.candidates);
    expect(after.gates).toBe(before.gates);
    expect(after.ranked).toBe(before.ranked);
    expect(JSON.parse(before.ranked)).toEqual([]);
  });

  it("(c) the authorization gate: a non-dispatchable preview can never arm authorization (the typed GATES_BLOCKED refusal)", () => {
    const gate = createAuthorizationGate();
    // The smuggle-proof shape: an advisory artifact dressed as a preview —
    // the gate checks dispatchable (gates PROCEED requires a ranked route,
    // which the artifacts can never be), never the payload's claims.
    const blockedPreview = {
      missionId: "mission:no-route",
      previewId: "pmt-preview:blocked",
      dispatchable: false,
      gates: { decision: "BLOCK", reasons: ["NO_ROUTE_FOR_CORRIDOR"] },
    } as never;
    const scope = {
      missionId: "mission:no-route",
      direction: "PAY",
      amount: { currency: "NGN", minorUnits: "1" },
      destinationSummary: "stated (unverified) destination",
      intentDigest: "intent-digest:test",
    } as never;
    expect(() => gate.requestAuthorization(blockedPreview, scope, new Date(NOW).toISOString()))
      .toThrow(/blocked preview can never arm authorization/);
    // The REAL-channel proof (the no-route mission with the cards composed →
    // GATES_BLOCKED through paymentMissionRequestApproval) lives in
    // ./p23-journey-emergence.test.ts — the D7c clause is proven at BOTH tiers.
  });

  it("(d) available-now stays EMPTY and the per-side eligible route ids are UNCHANGED by the emergence composition", () => {
    const world = noRouteWorld();
    const senderEligibleBefore = JSON.stringify(world.pair.sender.eligibleRouteIds);
    const recipientEligibleBefore = JSON.stringify(world.pair.recipient.eligibleRouteIds);
    expect(senderEligibleBefore).toBe("[]");
    expect(recipientEligibleBefore).toBe("[]");
    const emergence = noRouteEmergence(world);
    expect(emergence.conditionalOpportunities.length).toBe(3);
    expect(emergence.platformWork.length).toBe(3);
    expect(emergence.hypotheses.length).toBe(2);
    expect(JSON.stringify(world.pair.sender.eligibleRouteIds)).toBe(senderEligibleBefore);
    expect(JSON.stringify(world.pair.recipient.eligibleRouteIds)).toBe(recipientEligibleBefore);
    expect(JSON.parse(stageFourFive(world).ranked)).toEqual([]);
  });

  it("(e) NO protocol-command marker field at ANY nesting depth — the deep scan over every artifact family + the positive control", () => {
    const emergence = noRouteEmergence(noRouteWorld());
    expect(() => pinnedAssertNotProtocolCommand(emergence.conditionalOpportunities)).not.toThrow();
    expect(() => pinnedAssertNotProtocolCommand(emergence.platformWork)).not.toThrow();
    expect(() => pinnedAssertNotProtocolCommand(emergence.hypotheses)).not.toThrow();
    expect(() => pinnedAssertNotProtocolCommand(emergence.modelProposals)).not.toThrow();
    expect(() => pinnedAssertNotProtocolCommand(emergence.repairDerivation)).not.toThrow();
    // The whole composed result, one scan (cycles handled by the pinned walker):
    expect(() => pinnedAssertNotProtocolCommand({
      conditionalOpportunities: emergence.conditionalOpportunities,
      platformWork: emergence.platformWork,
      hypotheses: emergence.hypotheses,
      modelProposals: emergence.modelProposals,
      repairDerivation: emergence.repairDerivation,
    })).not.toThrow();
    // The positive control: a smuggled marker field at depth FAILS the scan
    // (the scan itself is proven live, never assumed).
    expect(() => pinnedAssertNotProtocolCommand({ cards: [{ inner: { commandType: "DISPATCH" } }] }))
      .toThrow(/protocol command field/);
  });

  it("the STRUCTURAL FALSES re-asserted through the composed artifacts (the D7 tail)", () => {
    const emergence = noRouteEmergence(noRouteWorld());
    expect(discoveryPermitsExecution()).toBe(false);
    expect(agentCanExecuteOpportunities()).toBe(false);
    expect(emergence.repairDerivation.repairsPermitExecution).toBe(false);
    expect(() => rejectConditionalForExecution(emergence.conditionalOpportunities[0])).toThrow();
    expect(() => rejectConditionalForExecution({})).toThrow();
    for (const card of emergence.hypotheses) {
      expect(card.neverExecutable).toBe(true);
      expect(card.advisoryOnly).toBe(true);
    }
    // The D6 tier's honest unbound truth over this world (no session model):
    // never a fabricated proposal (the A.8 rejection codes are pinned in the
    // opportunities repair-proposals battery — cited, not duplicated).
    expect(emergence.modelProposals).toEqual({ kind: "UNBOUND_NO_MODEL" });
  });
});
