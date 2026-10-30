import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  corridorViewDigest,
  deriveHypotheticalView,
  deriveRailSnapshotPair,
  deriveRouteHypothesis,
  evaluateHardGates,
  mergedCorridorView,
} from "@payswap/route-planning";
import { deriveOpportunityEmergence, realPlannerReRunPort } from "../../src/renderer/src/opportunityEmergenceAdapter.js";
import { emptyEvidenceBundle, compositionDefaultBestExecutionPolicy } from "../../src/renderer/src/routePlanningEngineAdapter.js";
import {
  flwSenderChain,
  noRouteCorridorQuery,
  noRouteIntentFixture,
  stripeRecipientChain,
} from "../../../route-planning/test/no-route-fixtures.ts";
import { realCorridorProjectionPort } from "../../../route-planning/test/fixtures.ts";
import {
  movementCorridorQuery,
  movementIntentFixture,
  recipientChain as p16RecipientChain,
  senderChain as p16SenderChain,
} from "../../../route-planning/test/fixtures.ts";
import { planningBestExecutionPolicy, planningEvidenceBundle, realRouteCompilationPort } from "../../../route-planning/test/compiler-evidence.ts";
import { realCompilationPortStub } from "./p23-emergence-fixtures.ts";
import { countryBlockedCorridorQuery, countryBlockedRecipientChain, countryBlockedSenderChain } from "./p23-bridge-proof-worlds.ts";

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

  it("the hypothesis cards: bounded by the scenario budget, never executable, the verified/assumed segments labeled — the no-route world's TWO hypotheses stay honestly UNVERIFIED (the P23 correctness patch)", () => {
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
      // The bridge proof honestly FAILS on this world: the remaining REAL
      // blockers (the read-only FLW rail, the unserved funding method) are
      // NOT answered by an assumed rail's existence — the pre-patch law
      // verified these cards whenever any real route was eligible; the
      // patched law requires the proof and stays UNVERIFIED here.
      expect(card.verification).toBe("UNVERIFIED");
      expect(card.verificationReason).toContain("no bridge proof was returned");
      expect(card.wouldCompose).toBe(false);
    }
  });

  it("THE P23 CORRECTNESS REGRESSION (the handoff §2.2 law, adapter-level): a valid REAL route and an UNRELATED assumed element NEVER verify through the REAL re-run port", () => {
    // The P16 world: a REAL corridor with REAL rank-eligible routes (the
    // real compiler + real evidence + real ranking through the port).
    const pair = deriveRailSnapshotPair({
      sender: {
        side: "SENDER", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [p16SenderChain()], corridorPort: realCorridorProjectionPort(),
      },
      recipient: {
        side: "RECIPIENT", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [p16RecipientChain()], corridorPort: realCorridorProjectionPort(),
      },
    });
    const movement = movementIntentFixture();
    const query = movementCorridorQuery();
    const baseView = mergedCorridorView(pair.sender, pair.recipient, {
      sourceCountry: query.sourceCountry,
      destinationCountry: query.destinationCountry,
      sourceCurrency: query.sourceCurrency,
      destinationCurrency: query.destinationCurrency,
      asOf: query.asOf,
    });
    // The UNRELATED assumed element: a KES->GHS rail inside the ETH->EUR
    // corridor — it does not span the corridor's declared pair, so no
    // bridge proof can issue for it.
    const view = deriveHypotheticalView({
      baseView,
      declaredBaseViewDigest: corridorViewDigest(baseView),
      operatorId: "repair:bridge-via-intermediary-rail",
      augmentations: [
        {
          kind: "ADD_ASSUMED_RAIL",
          rail: {
            assumed: true,
            assumedRailId: "assumed-rail:unrelated-kes-ghs",
            providerName: "assumed:unrelated",
            railKind: "FIAT",
            sourceCurrency: "KES",
            destinationCurrency: "GHS",
            summary: "an unrelated rail that does not span this corridor",
          },
        },
      ],
    });
    const port = realPlannerReRunPort({
      movement,
      at: Date.parse(query.asOf),
      senderSnapshot: pair.sender,
      recipientSnapshot: pair.recipient,
      query: query as never,
      evidence: planningEvidenceBundle(),
      budget: { maxCandidates: 12, maxShapes: 9, maxCandidatesPerShape: 4 } as never,
      compilationPort: realRouteCompilationPort(),
      policy: planningBestExecutionPolicy() as never,
      declaredBaseViewDigest: corridorViewDigest(baseView),
    });
    const reRun = port.compileCorridorView(view);
    // A REAL rank-eligible route exists over the real sub-views…
    expect(reRun.rankedEligible.length).toBeGreaterThan(0);
    // …and the UNRELATED assumed element earns NO bridge proof.
    expect(reRun.assumedElementPlanIds).toEqual([]);
    // The hypothesis therefore stays UNVERIFIED — the pre-patch law
    // computed wouldCompose from (real segments > 0 && assumed element
    // exists) and produced a FALSE PLANNER_VERIFIED here.
    const hypothesis = deriveRouteHypothesis({
      view,
      reRunPort: port,
      citedShapeSkeleton: { shapeId: "provider-native-bridge", legKindSequence: ["ONCHAIN_BRIDGE"] },
      operatorId: "repair:bridge-via-intermediary-rail",
      at: Date.parse(query.asOf),
    });
    expect(hypothesis.verifiedSegments.length).toBeGreaterThan(0);
    expect(hypothesis.wouldCompose).toBe(false);
    expect(hypothesis.verification).toBe("UNVERIFIED");
    expect(hypothesis.verificationReason).toContain("no bridge proof was returned");
  });

  it("THE POSITIVE CONTROL (the handoff §2.2 law): an element that REALLY bridges the relevant segments earns PLANNER_VERIFIED through the full composition", () => {
    // The country-blocked world: the ONLY blockers are the country codes
    // (both rails executable, currencies/funding/payout/customer-type/
    // required-fields all served) — exactly the world an intermediary rail
    // spanning the declared pair really bridges.
    const pair = deriveRailSnapshotPair({
      sender: {
        side: "SENDER", query: countryBlockedCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [countryBlockedSenderChain()], corridorPort: realCorridorProjectionPort(),
      },
      recipient: {
        side: "RECIPIENT", query: countryBlockedCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [countryBlockedRecipientChain()], corridorPort: realCorridorProjectionPort(),
      },
    });
    const movement = noRouteIntentFixture();
    const emergence = deriveOpportunityEmergence({
      senderSnapshot: pair.sender,
      recipientSnapshot: pair.recipient,
      hardGates: evaluateHardGates({ intent: movement, at: Date.parse("2026-10-05T00:00:00Z"), candidates: [] }),
      movement,
      query: countryBlockedCorridorQuery() as never,
      at: Date.parse("2026-10-05T00:00:00Z"),
      evidence: emptyEvidenceBundle(),
      searchBudget: { maxCandidates: 12, maxShapes: 9, maxCandidatesPerShape: 4 } as never,
      scenarioBudget: { maxScenarios: 4 },
      compilationPort: realCompilationPortStub(),
      policy: compositionDefaultBestExecutionPolicy() as never,
      intentPrincipalRef: movement.principalRef,
      intentExpiresAt: movement.expiresAt,
    });
    // Both rails are ineligible with ONLY the country-code facts (the
    // honest grounding for the bridge operators).
    expect(pair.sender.eligibleRouteIds).toEqual([]);
    expect(pair.recipient.eligibleRouteIds).toEqual([]);
    const blockerCodes = pair.sender.rails.flatMap((rail) => rail.exclusions.map((exclusion) => exclusion.code))
      .concat(pair.recipient.rails.flatMap((rail) => rail.exclusions.map((exclusion) => exclusion.code)));
    expect(blockerCodes.sort()).toEqual(["DESTINATION_COUNTRY_NOT_SERVED", "SOURCE_COUNTRY_NOT_SERVED"]);
    // The two bridge hypotheses derive and BOTH earn the bridge proof:
    // the assumed rail spans the declared NGN->USD pair and every
    // remaining blocker is answered by its augmentation kind.
    expect(emergence.hypotheses.length).toBe(2);
    for (const card of emergence.hypotheses) {
      expect(card.neverExecutable).toBe(true);
      expect(card.advisoryOnly).toBe(true);
      expect(card.verification).toBe("PLANNER_VERIFIED");
      expect(card.wouldCompose).toBe(true);
      expect(card.verificationReason).toContain("bridge proof");
    }
    // The paired intermediary conditional carries the verified badge too
    // (the hypothesis-paired card, not the no-rerun cards).
    const verified = emergence.conditionalOpportunities.filter((card) => card.verification === "PLANNER_VERIFIED");
    expect(verified.length).toBe(1);
    expect(verified[0]!.verificationReason).toContain("bridge proof");
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
