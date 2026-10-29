import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveRailSnapshotPair, evaluateHardGates } from "@payswap/route-planning";
import { deriveOpportunityEmergence } from "../../src/renderer/src/opportunityEmergenceAdapter.js";
import { emptyEvidenceBundle, compositionDefaultBestExecutionPolicy } from "../../src/renderer/src/routePlanningEngineAdapter.js";
import {
  flwSenderChain,
  noRouteCorridorQuery,
  noRouteIntentFixture,
  stripeRecipientChain,
} from "../../../route-planning/test/no-route-fixtures.ts";
import { realCorridorProjectionPort } from "../../../route-planning/test/fixtures.ts";
import { realCompilationPortStub } from "./p23-emergence-fixtures.ts";

/**
 * THE P23-B OPPORTUNITY-EMERGENCE COMPOSITION (ADR-0015 D9): the REAL
 * general derivation + the REAL conditional construction + the REAL
 * hypothesis stage + the model-proposal state + stage 6's real facts —
 * composed at the renderer and proven over the REAL no-route world (the
 * FLW-only sender → the Stripe-only merchant, the P21 fixtures). The
 * reviewer's core finding (the conditional opportunities never displayed)
 * closes here: the composition produces the CARDS the panel renders.
 */

const NOW = Date.parse("2026-10-05T00:00:00Z");

function noRouteEmergence() {
  const pair = deriveRailSnapshotPair({
    sender: {
      side: "SENDER", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort(),
    },
    recipient: {
      side: "RECIPIENT", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort(),
    },
  });
  const movement = noRouteIntentFixture();
  return deriveOpportunityEmergence({
    senderSnapshot: pair.sender,
    recipientSnapshot: pair.recipient,
    hardGates: evaluateHardGates({ intent: movement, at: NOW, candidates: [] }),
    movement,
    query: noRouteCorridorQuery() as never,
    at: NOW,
    evidence: emptyEvidenceBundle(),
    searchBudget: { maxCandidates: 12, maxShapes: 9, maxCandidatesPerShape: 4 } as never,
    scenarioBudget: { maxScenarios: 4 },
    compilationPort: realCompilationPortStub(),
    policy: compositionDefaultBestExecutionPolicy() as never,
    intentPrincipalRef: movement.principalRef,
    intentExpiresAt: movement.expiresAt,
  });
}

describe("the P23-B opportunity-emergence composition (ADR-0015 D9, the reviewer's core finding closed)", () => {
  it("the no-route world composes the THREE P21 conditional CARDS with the people-language titles + the verification pairing", () => {
    const emergence = noRouteEmergence();
    expect(emergence.conditionalOpportunities.length).toBe(3);
    expect(emergence.conditionalOpportunities.map((card) => card.title)).toEqual([
      "the recipient enables an eligible Flutterwave receiving method",
      "the sender adds a genuinely supported Stripe-compatible payment instrument",
      "a verified intermediary is introduced",
    ]);
    // Every card carries the full D8 contract: preconditions, assumptions, expiry, the verification pairing.
    for (const card of emergence.conditionalOpportunities) {
      expect(card.requiredPartyChanges.length).toBe(1);
      expect(card.assumptions.length).toBeGreaterThan(0);
      expect(card.expiresAt).toBeGreaterThan(NOW);
      expect(["PLANNER_VERIFIED", "UNVERIFIED"]).toContain(card.verification);
      expect(card.verificationReason.length).toBeGreaterThan(0);
    }
    // The FLW-receiving card carries the platform-prerequisite note DISTINCT (the D8 labeling law).
    const flwCard = emergence.conditionalOpportunities[0]!;
    expect(flwCard.platformPrerequisites.map((prerequisite) => prerequisite.gapId)).toEqual([
      "platform:flutterwave-send-operation",
    ]);
  });

  it("the platform-work cards: the three gaps with their verbatim evidence", () => {
    const emergence = noRouteEmergence();
    expect(emergence.platformWork.map((card) => card.gapId).sort()).toEqual([
      "platform:connector-operation",
      "platform:cross-provider-route-shape",
      "platform:flutterwave-send-operation",
    ]);
    for (const card of emergence.platformWork) {
      expect(card.evidenceBasis.length).toBeGreaterThan(0);
      expect(card.requiredByOperatorIds.length).toBeGreaterThan(0);
    }
  });

  it("the hypothesis cards: bounded by the scenario budget, never executable, the verified/assumed segments labeled", () => {
    const emergence = noRouteEmergence();
    expect(emergence.hypotheses.length).toBe(2);
    expect(emergence.hypotheses.map((card) => card.operatorId)).toEqual([
      "repair:bridge-via-intermediary-rail",
      "repair:intermediary-introduced",
    ]);
    for (const card of emergence.hypotheses) {
      expect(card.neverExecutable).toBe(true);
      expect(card.advisoryOnly).toBe(true);
      expect(card.assumedSegmentIds.length).toBe(1);
      expect(["PLANNER_VERIFIED", "UNVERIFIED"]).toContain(card.verification);
    }
  });

  it("the model-proposal state: the honest UNBOUND_NO_MODEL truth (the CDP-proven zero-model deployment)", () => {
    const emergence = noRouteEmergence();
    expect(emergence.modelProposals).toEqual({ kind: "UNBOUND_NO_MODEL" });
  });

  it("stage 6's REAL facts: the snapshot rails (never the empty set) + the derived interventions over the EXISTING Lab kinds", () => {
    const emergence = noRouteEmergence();
    expect(emergence.labFacts.rails.map((rail) => rail.railId)).toEqual([
      "inst:sender-flw-readonly",
      "inst:recipient-stripe-test",
    ]);
    expect(emergence.labFacts.pools).toEqual([]);
    expect(emergence.scenarioInterventions.length).toBe(2);
    expect(emergence.scenarioInterventions.every((intervention) => intervention.kind === "THIRD_PARTY_NODE_JOINS")).toBe(true);
  });

  it("the repair derivation receipt: the P21 operators applied, the general funding operators suppressed (never silent)", () => {
    const emergence = noRouteEmergence();
    expect(emergence.repairDerivation.suppressedOperators.map((entry) => entry.operatorId)).toEqual([
      "repair:recipient-enables-served-funding-method",
      "repair:sender-adds-served-funding-instrument",
    ]);
    expect(emergence.repairDerivation.repairsPermitExecution).toBe(false);
  });

  it("the determinism law: identical inputs compose byte-identical card sections", () => {
    const first = noRouteEmergence();
    const second = noRouteEmergence();
    expect(JSON.stringify(second.conditionalOpportunities)).toBe(JSON.stringify(first.conditionalOpportunities));
    expect(JSON.stringify(second.platformWork)).toBe(JSON.stringify(first.platformWork));
    expect(JSON.stringify(second.hypotheses)).toBe(JSON.stringify(first.hypotheses));
  });
});

describe("the P23-B boot laws (ADR-0015 D9d)", () => {
  const rendererRoot = join(import.meta.dirname, "../../src/renderer/src");

  it("main.tsx BOOTS composeWaitRecheckBinding with the chains-derived observations source, BEFORE the route-planning composition (the boot-order law)", () => {
    const source = readFileSync(join(rendererRoot, "main.tsx"), "utf8");
    const bootIndex = source.indexOf("composeWaitRecheckBinding({");
    const routePlanningIndex = source.indexOf("composeRoutePlanningBinding({ services })");
    expect(bootIndex).toBeGreaterThan(-1);
    expect(routePlanningIndex).toBeGreaterThan(bootIndex);
    expect(source).toContain("chainDerivedWaitRecheckObservations(services)");
  });

  it("the engine adapter composes the emergence and feeds the view's three sections + stage 6's real facts", () => {
    const source = readFileSync(join(rendererRoot, "routePlanningEngineAdapter.ts"), "utf8");
    expect(source).toContain("deriveOpportunityEmergence({");
    expect(source).toContain("emergence.labFacts");
    expect(source).toContain("emergence?.scenarioInterventions ?? []");
    expect(source).toContain("conditionalOpportunities: emergence.conditionalOpportunities");
  });

  it("the host shell is UNTOUCHED (no new members — the census/mirror law)", () => {
    const shellContracts = readFileSync(join(import.meta.dirname, "../../src/host/payswap/shell/contracts.ts"), "utf8");
    expect(shellContracts).not.toContain("opportunityEmergence");
    expect(shellContracts).not.toContain("waitRecheck");
  });
});
