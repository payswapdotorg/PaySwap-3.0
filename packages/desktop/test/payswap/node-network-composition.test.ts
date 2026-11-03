/**
 * PaySwap Desktop (P27-E, the P27-D lane report §6.4 — THE MERGE GATE
 * battery) — the NODE-NETWORK COMPOSITION at the platform host's
 * composition root: the REAL NodeOfferAdmissionPort (capability's
 * admitNodeOffer chain through the pinned wire) + the search ->
 * eligibility-gates -> baseline-comparison discovery chain
 * (renderer/src/routePlanningNodeNetwork.ts — the routePlanning*
 * composition family).
 *
 * THE MERGE-GATE LAW (the pin-fidelity battery's desktop companion):
 * the node-network <-> capability wire shapes are pinned by
 * route-planning/test/node-network-pins.test.ts (the lane's merge
 * gate); THIS battery proves the COMPOSITION drives the REAL chain
 * end-to-end and carries the newest wire member — custodyProgrammeRefs
 * — verbatim from the offer wire to the admitted candidate fact.
 *
 * HERMETIC: zero network, zero credentials; every fixture is clearly a
 * fixture (D11 — no fixture node is ever promotable; the shipped
 * registry is EMPTY by law, the honest no-nodes default is asserted).
 */

import { describe, expect, it } from "vitest";
import {
  composeNodeRelayRouteDiscovery,
  nodeRouteBaselineComparisonOf,
  realNodeOfferAdmissionPort,
  type NodeOfferPresentation,
} from "../../src/renderer/src/routePlanningNodeNetwork.js";
import {
  routeCandidateMetricsOf,
  unboundNodeOfferAdmissionPort,
  type HardGateSurvivor,
  type PinnedInstanceScope,
  type PinnedObservationScope,
  type PinnedVerifiedNodeOfferWire,
} from "@payswap/route-planning";
import {
  ALL_ELIGIBLE,
  COMMERCE_INTENT_EVIDENCED,
  classification,
} from "../../../route-planning/test/node-network-fixtures.ts";

/* ---------------- fixtures (pinned-scope; clearly fixtures — D11) ---------------- */

/** A pinned-scope connected instance (ACTIVE + eligible — the decisive local evidence). */
function instanceScope(overrides: Partial<PinnedInstanceScope> = {}): PinnedInstanceScope {
  return {
    instanceId: "inst:acct-1-payments",
    capabilityId: "cap:psp-a-payouts",
    implementationId: "impl:psp-a-1",
    providerName: "psp-a",
    providerVersion: "2026-01",
    accountRef: "acct:merchant-1",
    tenantRef: "tenant:merchant-1",
    authorization: { status: "ACTIVE", grantedAt: "2026-09-01T00:00:00Z" },
    permissionState: { granted: ["payouts:write"], requested: ["payouts:write"], missing: [] },
    eligibility: { eligible: true, reasons: [] },
    geography: { countries: ["US", "KE"] },
    currencies: ["USD", "KES"],
    ...overrides,
  };
}

/** A pinned-scope healthy observation (AVAILABLE + ELIGIBLE). */
function observationScope(overrides: Partial<PinnedObservationScope> = {}): PinnedObservationScope {
  return {
    instanceId: "inst:acct-1-payments",
    observedAt: "2026-11-03T12:00:05Z",
    observationVersion: 1,
    capabilityState: "AVAILABLE",
    sourceAvailability: "REACHABLE",
    availability: "AVAILABLE",
    eligibility: "ELIGIBLE",
    health: { status: "HEALTHY", lastCheckedAt: "2026-11-03T12:00:04Z" },
    provenance: { providerName: "psp-a", source: "PROVIDER_API", capturedAt: "2026-11-03T12:00:00Z" },
    ...overrides,
  } as PinnedObservationScope;
}

/** A VERIFIED offer wire fixture (node-network's verification output shape). */
function verifiedWire(overrides: Partial<PinnedVerifiedNodeOfferWire> = {}): PinnedVerifiedNodeOfferWire {
  return {
    offerId: "offer:us-ke-relay-1",
    nodeId: "node:us-router-1",
    boundInstanceIds: ["inst:acct-1-payments"],
    custodyRole: "TECHNICAL_ROUTER",
    custodyProgrammeRefs: [],
    constraints: {
      sourceCountries: ["US"],
      destinationCountries: ["KE"],
      currencies: ["USD", "KES"],
      purposes: ["GENUINE_COMMERCE"],
    },
    verification: {
      verdict: "VERIFIED",
      verifiedAt: "2026-11-03T12:00:00Z",
      nodeEnrollmentMode: "OPERATOR_ENROLLED",
    },
    ...overrides,
  };
}

/** The two-hop US -> node -> KE route graph (typed vertices + edges, bounded by construction). */
function relayGraph() {
  return {
    vertices: [
      { vertexId: "sender:us", kind: "SENDER", jurisdiction: "US" },
      { vertexId: "node:us-router-1", kind: "VERIFIED_NODE", jurisdiction: "US", nodeId: "node:us-router-1" },
      { vertexId: "beneficiary:ke", kind: "BENEFICIARY", jurisdiction: "KE" },
    ],
    edges: [
      {
        edgeId: "edge:collect",
        kind: "PROVIDER_OPERATION",
        fromVertexId: "sender:us",
        toVertexId: "node:us-router-1",
        operation: "psp_a.collect",
        operatingNodeId: null,
        amount: { currency: "USD", minorUnits: "1000" },
      },
      {
        edgeId: "edge:relay-payout",
        kind: "NODE_RELAY",
        fromVertexId: "node:us-router-1",
        toVertexId: "beneficiary:ke",
        operation: "psp_a.payout",
        operatingNodeId: "node:us-router-1",
        amount: { currency: "KES", minorUnits: "128000" },
      },
    ],
  };
}

const BUDGET = { maxPathCandidates: 16, maxDistinctVertices: 64, maxDistinctEdges: 256 } as const;

function presentation(
  overrides: { readonly offer?: Partial<PinnedVerifiedNodeOfferWire> } = {},
): NodeOfferPresentation {
  const offer = verifiedWire(overrides.offer);
  return {
    side: "SENDER",
    offer,
    instance: instanceScope(),
    observation: observationScope(),
  };
}

/* ---------------- the admission port (the INV-13 seam) ---------------- */

describe("the REAL node-offer admission port at the composition root", () => {
  it("admits a verified offer over a fully ACTIVE local chain as a CANDIDATE FACT — never an entitlement", () => {
    const port = realNodeOfferAdmissionPort();
    const admission = port.admitNodeOffer({
      side: "SENDER",
      offer: verifiedWire(),
      instance: instanceScope(),
      observation: observationScope(),
    });
    expect(admission.admitted).toBe(true);
    if (admission.admitted) {
      expect(admission.fact.discoveryTier).toBe("CANDIDATE_FACT");
      expect(admission.fact.isEntitlement).toBe(false);
      expect(admission.fact.admitsExecution).toBe(false);
      expect(admission.fact.nodeId).toBe("node:us-router-1");
    }
  });

  it("carries custodyProgrammeRefs VERBATIM from the offer wire to the admitted fact (the newest wire member — the merge gate)", () => {
    const port = realNodeOfferAdmissionPort();
    const admission = port.admitNodeOffer({
      side: "RECIPIENT",
      offer: verifiedWire({ custodyProgrammeRefs: ["licence:msb-2026-77", "programme:safeguarding-1"] }),
      instance: instanceScope(),
      observation: observationScope(),
    });
    expect(admission.admitted).toBe(true);
    if (admission.admitted) {
      expect(admission.fact.custodyProgrammeRefs).toEqual(["licence:msb-2026-77", "programme:safeguarding-1"]);
    }
  });

  it("a FIXTURE enrollment admits NOTHING through the REAL chain (the D11 gate)", () => {
    const port = realNodeOfferAdmissionPort();
    const admission = port.admitNodeOffer({
      side: "SENDER",
      offer: verifiedWire({
        verification: { verdict: "VERIFIED", verifiedAt: "2026-11-03T12:00:00Z", nodeEnrollmentMode: "FIXTURE" },
      }),
      instance: instanceScope(),
      observation: observationScope(),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toContain("OFFER_FIXTURE_NODE");
    }
  });

  it("provider evidence is DECISIVE: a non-ACTIVE local authorization refuses admission (INV-13)", () => {
    const port = realNodeOfferAdmissionPort();
    const admission = port.admitNodeOffer({
      side: "SENDER",
      offer: verifiedWire(),
      instance: instanceScope({ authorization: { status: "PENDING", grantedAt: "2026-09-01T00:00:00Z" } }),
      observation: observationScope(),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toContain("INSTANCE_NOT_ACTIVE");
    }
  });

  it("an offer bound to a DIFFERENT instance does not complete the chain", () => {
    const port = realNodeOfferAdmissionPort();
    const admission = port.admitNodeOffer({
      side: "SENDER",
      offer: verifiedWire({ boundInstanceIds: ["inst:somebody-else"] }),
      instance: instanceScope(),
      observation: observationScope(),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toContain("OFFER_INSTANCE_NOT_BOUND");
    }
  });

  it("the UNBOUND port fails closed with the exact unbound stage (ADR-0009 D2 — the composition must bind a REAL port)", () => {
    const port = unboundNodeOfferAdmissionPort();
    expect(() =>
      port.admitNodeOffer({
        side: "SENDER",
        offer: verifiedWire(),
        instance: instanceScope(),
        observation: observationScope(),
      }),
    ).toThrow(/node-offer admission engine is not bound/);
  });
});

/* ---------------- the discovery chain (search -> gates -> baseline) ---------------- */

describe("the node-relay discovery chain at the composition root", () => {
  it("a genuinely eligible commerce route through an admitted technical-router node is ELIGIBLE (positive control)", () => {
    const discovery = composeNodeRelayRouteDiscovery({
      graph: relayGraph(),
      originVertexId: "sender:us",
      destinationVertexId: "beneficiary:ke",
      maxHops: 4,
      budget: BUDGET,
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      countryVerdicts: { ...ALL_ELIGIBLE },
      localProductPurposes: ["GENUINE_COMMERCE"],
      edgeDeclaredClasses: { "edge:collect": "GENUINE_COMMERCE", "edge:relay-payout": "GENUINE_COMMERCE" },
      offers: [presentation()],
    });
    expect(discovery.search.coverage).toBe("COMPLETE");
    expect(discovery.search.admitted.length).toBe(1);
    expect(discovery.eligiblePathIds).toEqual([discovery.pathEvaluations[0]!.pathId]);
    expect(discovery.pathEvaluations[0]!.eligibility.verdict).toBe("ELIGIBLE");
    expect(discovery.pathEvaluations[0]!.eligibility.eligibilityPermitsExecution).toBe(false);
    expect(discovery.discoveryPermitsExecution).toBe(false);
    expect(discovery.admissions["node:us-router-1"]!.admitted).toBe(true);
  });

  it("THE HONEST DEFAULT: with ZERO verified offers (this deployment's state — the registry ships EMPTY) every node leg refuses NODE_LEG_WITHOUT_ADMISSION", () => {
    const discovery = composeNodeRelayRouteDiscovery({
      graph: relayGraph(),
      originVertexId: "sender:us",
      destinationVertexId: "beneficiary:ke",
      maxHops: 4,
      budget: BUDGET,
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      countryVerdicts: { ...ALL_ELIGIBLE },
      localProductPurposes: ["GENUINE_COMMERCE"],
      edgeDeclaredClasses: { "edge:collect": "GENUINE_COMMERCE", "edge:relay-payout": "GENUINE_COMMERCE" },
      offers: [],
    });
    expect(discovery.eligiblePathIds).toEqual([]);
    expect(discovery.pathEvaluations[0]!.eligibility.verdict).toBe("REFUSED");
    expect(
      discovery.pathEvaluations[0]!.eligibility.refusals.map((refusal) => refusal.code),
    ).toContain("NODE_LEG_WITHOUT_ADMISSION");
  });

  it("an unadmitted offer contributes NOTHING: the node leg refuses NODE_OFFER_NOT_ADMITTED (fail closed, every reason retained)", () => {
    const discovery = composeNodeRelayRouteDiscovery({
      graph: relayGraph(),
      originVertexId: "sender:us",
      destinationVertexId: "beneficiary:ke",
      maxHops: 4,
      budget: BUDGET,
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      countryVerdicts: { ...ALL_ELIGIBLE },
      localProductPurposes: ["GENUINE_COMMERCE"],
      edgeDeclaredClasses: { "edge:collect": "GENUINE_COMMERCE", "edge:relay-payout": "GENUINE_COMMERCE" },
      offers: [presentation({ offer: { verification: { verdict: "VERIFIED", verifiedAt: "2026-11-03T12:00:00Z", nodeEnrollmentMode: "FIXTURE" } } })],
    });
    expect(discovery.eligiblePathIds).toEqual([]);
    expect(
      discovery.pathEvaluations[0]!.eligibility.refusals.map((refusal) => refusal.code),
    ).toContain("NODE_OFFER_NOT_ADMITTED");
  });

  it("a sanctioned middle-hop jurisdiction refuses the WHOLE route (hop-chaining changes nothing — INV-30)", () => {
    const discovery = composeNodeRelayRouteDiscovery({
      graph: {
        vertices: [
          { vertexId: "sender:us", kind: "SENDER", jurisdiction: "US" },
          { vertexId: "node: sanctioned-hop", kind: "VERIFIED_NODE", jurisdiction: "XX", nodeId: "node:sanctioned-hop" },
          { vertexId: "beneficiary:ke", kind: "BENEFICIARY", jurisdiction: "KE" },
        ],
        edges: [
          {
            edgeId: "edge:to-sanctioned",
            kind: "PROVIDER_OPERATION",
            fromVertexId: "sender:us",
            toVertexId: "node: sanctioned-hop",
            operation: "psp_a.collect",
            operatingNodeId: null,
            amount: { currency: "USD", minorUnits: "1000" },
          },
          {
            edgeId: "edge:from-sanctioned",
            kind: "NODE_RELAY",
            fromVertexId: "node: sanctioned-hop",
            toVertexId: "beneficiary:ke",
            operation: "psp_a.payout",
            operatingNodeId: "node:sanctioned-hop",
            amount: { currency: "KES", minorUnits: "128000" },
          },
        ],
      },
      originVertexId: "sender:us",
      destinationVertexId: "beneficiary:ke",
      maxHops: 4,
      budget: BUDGET,
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      countryVerdicts: { US: "ELIGIBLE", KE: "ELIGIBLE", XX: "REFUSED_SANCTIONED" },
      localProductPurposes: ["GENUINE_COMMERCE"],
      edgeDeclaredClasses: { "edge:to-sanctioned": "GENUINE_COMMERCE", "edge:from-sanctioned": "GENUINE_COMMERCE" },
      offers: [],
    });
    expect(discovery.eligiblePathIds).toEqual([]);
    expect(
      discovery.pathEvaluations[0]!.eligibility.refusals.map((refusal) => refusal.code),
    ).toContain("COUNTRY_SANCTIONED");
  });

  it("commerce-labelled legs never launder a P2P intent (the governing class is the max rank — INV-30)", () => {
    const discovery = composeNodeRelayRouteDiscovery({
      graph: relayGraph(),
      originVertexId: "sender:us",
      destinationVertexId: "beneficiary:ke",
      maxHops: 4,
      budget: BUDGET,
      intentClassification: classification("REGULATED_REMITTANCE_P2P"),
      countryVerdicts: { ...ALL_ELIGIBLE },
      localProductPurposes: ["GENUINE_COMMERCE"],
      edgeDeclaredClasses: { "edge:collect": "GENUINE_COMMERCE", "edge:relay-payout": "GENUINE_COMMERCE" },
      offers: [presentation()],
    });
    expect(discovery.eligiblePathIds).toEqual([]);
    expect(discovery.pathEvaluations[0]!.eligibility.governingClass).toBe("REGULATED_REMITTANCE_P2P");
    const codes = discovery.pathEvaluations[0]!.eligibility.refusals.map((refusal) => refusal.code);
    expect(codes).toContain("CLASS_EVIDENCE_MISSING");
  });

  it("the mandatory direct/native baseline comparison: an inferior multi-leg plan is NOT returned; parity favors the baseline", () => {
    // The survivor fixture shape of the lane's own baseline battery
    // (route-planning/test/baseline-comparison.test.ts) — the REAL
    // metrics derivation through routeCandidateMetricsOf.
    const survivorOf = (planId: string, net: string | undefined, baseline: boolean): HardGateSurvivor => {
      const legs = Array.from({ length: 2 }, (_unused, index) => ({
        legId: `${planId}-leg-${index}`,
        legKind: "PROVIDER_OPERATION",
        hopIndex: index,
        intentRef: "intent:p27e-baseline",
        custody: {
          from: { kind: "PROVIDER" },
          to: { kind: "PROVIDER" },
          assetRef: "asset:usd",
          amount: { currency: "USD", minorUnits: "100" },
          evidenceRefs: [],
        },
        plannedAmount: { basis: "QUOTE" },
        stateGrounding: { groundingFailures: [] },
        assumptions: [],
        evidenceRefs: [],
      }));
      const plan = {
        planId,
        shapeId: baseline ? "provider-native-offramp" : "mixed-dex-offramp",
        intentRef: "intent:p27e-baseline",
        compositionClass: "MIXED",
        executionMode: baseline ? "PASS_THROUGH_NATIVE" : "OPTIMIZED_MULTI_PROVIDER",
        isProviderNativeBaseline: baseline,
        candidateStatus: "EXECUTABLE_CANDIDATE",
        comparability: { comparable: true },
        ineligibilityReasons: [],
        legs,
        evidenceRefs: [],
        planDigest: `fnv1a64:${planId.length.toString(16).padStart(16, "0")}`,
        railCrossings: { crossings: 1, legs: [] },
        environmentClasses: [],
        ...(net !== undefined
          ? {
              score: {
                candidateId: planId,
                numeraire: "USC",
                components: [{ kind: "OUTPUT", description: "arrival", numeraireMinorUnits: net }],
                netNumeraireMinorUnits: net,
              },
            }
          : {}),
      } as never;
      return { plan, metrics: routeCandidateMetricsOf(plan) };
    };
    const inferior = nodeRouteBaselineComparisonOf([
      survivorOf("plan:direct-baseline", "1000000", true),
      survivorOf("plan:multi-leg-worse", "900000", false),
    ]);
    expect(inferior.returnedPlanIds).toEqual(["plan:direct-baseline"]);
    const parity = nodeRouteBaselineComparisonOf([
      survivorOf("plan:direct-baseline", "1000000", true),
      survivorOf("plan:multi-leg-parity", "1000000", false),
    ]);
    expect(parity.returnedPlanIds).toEqual(["plan:direct-baseline"]);
    expect(parity.simplestEligibleRouteWins).toBe(true);
    expect(parity.baselineComparisonPermitsExecution).toBe(false);
  });
});
