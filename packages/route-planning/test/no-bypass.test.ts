import { describe, expect, it } from "vitest";
import {
  evaluateNodeRouteEligibility,
  type NodeRouteLegDeclaration,
} from "../src/eligibility-gates.ts";
import { searchRoutePaths, type BudgetedRoutePathSearch } from "../src/graph-search.ts";
import { buildRouteGraph, type RouteGraph } from "../src/graph-schema.ts";
import {
  PINNED_CLASS_RESTRICTION_RANKS,
  type PinnedTransactionClass,
} from "../src/pins/node-network.ts";
import {
  ALL_ELIGIBLE,
  COMMERCE_INTENT_EVIDENCED,
  COMMERCE_LOCAL_PURPOSES,
  P2P_INTENT_FULL_EVIDENCE,
  P2P_INTENT_NO_EVIDENCE,
  admittedFact,
  refusedAdmission,
} from "./node-network-fixtures.ts";

/**
 * THE NO-BYPASS BATTERY (P27-D — INV-30's enforcement made
 * machine-asserted; ADR-0020 D2/D6/D8; the P27-0 matrix §5/§6).
 *
 * COVERAGE MAP — every INV-30 enforcement path -> the test that asserts it:
 *  - decomposition/distribution/hop-chaining never lower the governing
 *    class ......... "the most restrictive classification governs"
 *  - a P2P remittance through N nodes with commerce-labelled legs stays
 *    REFUSED ....... "P2P through N nodes stays REFUSED"
 *  - relabeling never changes permission (the product permission is
 *    evaluated for the GOVERNING class) ............. "full P2P evidence is still not enough"
 *  - a sanctioned/unsupported country reached via two hops stays
 *    REFUSED ....... "a sanctioned country two hops away"
 *  - an expired, revoked or unsigned offer contributes nothing ........
 *    "unadmitted offers contribute nothing"
 *  - UNKNOWN is never success (country verdicts, baseline nets) .......
 *    the UNKNOWN cases in each block
 *  - the truncation receipt fires at the budget boundary ..............
 *    "the truncated search never claims completeness"
 *  - the direct baseline comparison rejects an inferior multi-leg plan .
 *    test/baseline-comparison.test.ts (the sibling suite of this battery)
 */

function legs(
  specs: readonly [string, string, string | null][],
): NodeRouteLegDeclaration[] {
  return specs.map(([legId, declaredClass, operatingNodeId]) => ({
    legId,
    declaredClass: declaredClass as NodeRouteLegDeclaration["declaredClass"],
    operatingNodeId,
  }));
}

describe("INV-30: the most restrictive classification among the intent and every leg governs the WHOLE route", () => {
  const CLASSES: readonly PinnedTransactionClass[] = [
    "GENUINE_COMMERCE",
    "REFUND",
    "REIMBURSEMENT",
    "CONTRACTOR_SUPPLIER_PAYMENT",
    "MARKETPLACE_SELLER_SETTLEMENT",
    "REGULATED_REMITTANCE_P2P",
    "OTHER_UNCLEAR",
  ];

  it("the governing class is the max restriction rank over the intent and every leg — over EVERY decomposition", () => {
    // Deterministic enumeration over representative decompositions: split a
    // transaction into 1..6 legs, label each leg with every class, and
    // assert the governing class is exactly the max-rank participant.
    const decompositions: readonly (readonly PinnedTransactionClass[])[] = [
      ["GENUINE_COMMERCE"],
      ["GENUINE_COMMERCE", "GENUINE_COMMERCE", "GENUINE_COMMERCE"],
      ["GENUINE_COMMERCE", "MARKETPLACE_SELLER_SETTLEMENT", "CONTRACTOR_SUPPLIER_PAYMENT"],
      ["REFUND", "REIMBURSEMENT", "GENUINE_COMMERCE", "GENUINE_COMMERCE"],
      ["REGULATED_REMITTANCE_P2P", "GENUINE_COMMERCE", "GENUINE_COMMERCE", "GENUINE_COMMERCE", "GENUINE_COMMERCE", "GENUINE_COMMERCE"],
      ["OTHER_UNCLEAR", "GENUINE_COMMERCE"],
    ];
    for (const legClasses of decompositions) {
      for (const intentClass of CLASSES) {
        const evaluation = evaluateNodeRouteEligibility({
          intentClassification: {
            ...COMMERCE_INTENT_EVIDENCED,
            transactionClass: intentClass,
          },
          legs: legClasses.map((declaredClass, index) => ({
            legId: `leg:${index}`,
            declaredClass,
            operatingNodeId: null,
          })),
          countries: ["US", "KE"],
          countryVerdicts: { ...ALL_ELIGIBLE },
          nodeAdmissions: {},
          localProductPurposes: [...CLASSES],
        });
        let expected: PinnedTransactionClass = intentClass;
        for (const legClass of legClasses) {
          if (PINNED_CLASS_RESTRICTION_RANKS[legClass] > PINNED_CLASS_RESTRICTION_RANKS[expected]) {
            expected = legClass;
          }
        }
        expect(evaluation.governingClass).toBe(expected);
      }
    }
  });

  it("commerce-labelled legs never lower a P2P intent — and order does not matter", () => {
    const orderings: readonly (readonly PinnedTransactionClass[])[] = [
      ["GENUINE_COMMERCE", "GENUINE_COMMERCE", "REGULATED_REMITTANCE_P2P", "GENUINE_COMMERCE"],
      ["REGULATED_REMITTANCE_P2P", "GENUINE_COMMERCE", "GENUINE_COMMERCE", "GENUINE_COMMERCE"],
      ["GENUINE_COMMERCE", "GENUINE_COMMERCE", "GENUINE_COMMERCE", "GENUINE_COMMERCE"],
    ];
    for (const legClasses of orderings) {
      const evaluation = evaluateNodeRouteEligibility({
        intentClassification: P2P_INTENT_NO_EVIDENCE,
        legs: legClasses.map((declaredClass, index) => ({
          legId: `leg:${index}`,
          declaredClass,
          operatingNodeId: null,
        })),
        countries: ["US", "KE"],
        countryVerdicts: { ...ALL_ELIGIBLE },
        nodeAdmissions: {},
        localProductPurposes: ["GENUINE_COMMERCE"],
      });
      expect(evaluation.governingClass).toBe("REGULATED_REMITTANCE_P2P");
      expect(evaluation.verdict).toBe("REFUSED");
    }
  });

  it("an OTHER_UNCLEAR leg ANYWHERE dominates the whole route (nothing routes until the facts clarify)", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: legs([
        ["leg:0", "GENUINE_COMMERCE", null],
        ["leg:1", "OTHER_UNCLEAR", null],
        ["leg:2", "GENUINE_COMMERCE", null],
      ]),
      countries: ["US", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: {},
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.governingClass).toBe("OTHER_UNCLEAR");
    expect(evaluation.verdict).toBe("REFUSED");
    expect(evaluation.refusals.map((refusal) => refusal.code)).toContain(
      "GOVERNING_CLASS_UNCLASSIFIABLE",
    );
  });
});

describe("INV-30: a P2P remittance routed through N nodes with commerce-labelled legs stays REFUSED", () => {
  it("five commerce-labelled legs across three admitted nodes never launder a P2P intent (§5: licences + provider approval + custody evidence)", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: P2P_INTENT_NO_EVIDENCE,
      legs: legs([
        ["leg:0", "GENUINE_COMMERCE", "node:router-1"],
        ["leg:1", "GENUINE_COMMERCE", "node:router-1"],
        ["leg:2", "GENUINE_COMMERCE", "node:router-2"],
        ["leg:3", "GENUINE_COMMERCE", "node:router-2"],
        ["leg:4", "GENUINE_COMMERCE", "node:router-3"],
      ]),
      countries: ["US", "GB", "GH", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: {
        "node:router-1": admittedFact({ nodeId: "node:router-1" }),
        "node:router-2": admittedFact({ nodeId: "node:router-2" }),
        "node:router-3": admittedFact({ nodeId: "node:router-3" }),
      },
      localProductPurposes: ["GENUINE_COMMERCE"],
    });
    expect(evaluation.governingClass).toBe("REGULATED_REMITTANCE_P2P");
    expect(evaluation.verdict).toBe("REFUSED");
    const codes = evaluation.refusals.map((refusal) => refusal.code);
    expect(codes).toContain("CLASS_EVIDENCE_MISSING"); // no licences, no provider approval, no custody programme
    expect(codes).toContain("PRODUCT_DOES_NOT_SERVE_CLASS"); // no product serves P2P (§5: ✗ on ordinary products)
  });

  it("full P2P evidence is still not enough when no product serves the class — relabeling never changes permission", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: P2P_INTENT_FULL_EVIDENCE,
      legs: legs([
        ["leg:0", "GENUINE_COMMERCE", "node:router-1"],
        ["leg:1", "GENUINE_COMMERCE", null],
      ]),
      countries: ["US", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: { "node:router-1": admittedFact({ nodeId: "node:router-1" }) },
      localProductPurposes: ["GENUINE_COMMERCE"], // the commerce products do NOT serve P2P
    });
    expect(evaluation.verdict).toBe("REFUSED");
    expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual([
      "PRODUCT_DOES_NOT_SERVE_CLASS",
      "PRODUCT_DOES_NOT_SERVE_CLASS",
    ]);
  });
});

describe("INV-30: a sanctioned/unsupported country reached via two hops stays REFUSED", () => {
  function twoHopGraph(): RouteGraph {
    return buildRouteGraph({
      vertices: [
        { vertexId: "v:origin", kind: "SENDER", jurisdiction: "US" },
        { vertexId: "v:mid", kind: "VERIFIED_NODE", jurisdiction: "IR", nodeId: "node:mid-1" },
        { vertexId: "v:dest", kind: "BENEFICIARY", jurisdiction: "KE" },
      ],
      edges: [
        {
          edgeId: "e:1",
          kind: "NODE_RELAY",
          fromVertexId: "v:origin",
          toVertexId: "v:mid",
          operation: "op:relay-1",
          operatingNodeId: "node:mid-1",
          amount: { currency: "USD", minorUnits: "1000" },
          sourceOfferFactRef: "fact:offer-mid-1",
        },
        {
          edgeId: "e:2",
          kind: "PROVIDER_OPERATION",
          fromVertexId: "v:mid",
          toVertexId: "v:dest",
          operation: "op:payout-1",
          operatingNodeId: null,
          amount: { currency: "KES", minorUnits: "128000" },
        },
      ],
    });
  }

  it("the searched path's middle-hop jurisdiction IR refuses the WHOLE route (origin and destination are fine)", () => {
    const search: BudgetedRoutePathSearch = searchRoutePaths({
      graph: twoHopGraph(),
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: { maxPathCandidates: 8, maxDistinctVertices: 8, maxDistinctEdges: 8 },
    });
    expect(search.admitted).toHaveLength(1);
    const path = search.admitted[0];
    expect(path?.jurisdictions).toEqual(["US", "IR", "KE"]);
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: legs([
        ["leg:0", "GENUINE_COMMERCE", "node:mid-1"],
        ["leg:1", "GENUINE_COMMERCE", null],
      ]),
      countries: [...(path?.jurisdictions ?? [])],
      countryVerdicts: { US: "ELIGIBLE", KE: "ELIGIBLE", IR: "REFUSED_SANCTIONED" },
      nodeAdmissions: { "node:mid-1": admittedFact({ nodeId: "node:mid-1" }) },
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.verdict).toBe("REFUSED");
    expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual(["COUNTRY_SANCTIONED"]);
    expect(evaluation.refusals[0]?.country).toBe("IR");
  });

  it("the same two-hop path through an UNSUPPORTED or UNKNOWN middle country is equally refused (fail closed)", () => {
    for (const [verdict, code] of [
      ["REFUSED_UNSUPPORTED", "COUNTRY_UNSUPPORTED"],
      ["UNKNOWN", "COUNTRY_VERDICT_UNKNOWN"],
    ] as const) {
      const evaluation = evaluateNodeRouteEligibility({
        intentClassification: COMMERCE_INTENT_EVIDENCED,
        legs: legs([
          ["leg:0", "GENUINE_COMMERCE", "node:mid-1"],
          ["leg:1", "GENUINE_COMMERCE", null],
        ]),
        countries: ["US", "IR", "KE"],
        countryVerdicts: { US: "ELIGIBLE", KE: "ELIGIBLE", IR: verdict },
        nodeAdmissions: { "node:mid-1": admittedFact({ nodeId: "node:mid-1" }) },
        localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
      });
      expect(evaluation.verdict).toBe("REFUSED");
      expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual([code]);
    }
  });
});

describe("INV-30: an expired, revoked or unsigned offer contributes nothing (§6: provider-evidenced is decisive)", () => {
  it("a node leg whose offer the capability chain did NOT admit refuses the route — every chain refusal carried", () => {
    for (const code of ["OFFER_NOT_VERIFIED", "INSTANCE_NOT_ACTIVE", "OBSERVATION_NOT_AVAILABLE"]) {
      const evaluation = evaluateNodeRouteEligibility({
        intentClassification: COMMERCE_INTENT_EVIDENCED,
        legs: legs([
          ["leg:0", "GENUINE_COMMERCE", "node:expired-1"],
          ["leg:1", "GENUINE_COMMERCE", null],
        ]),
        countries: ["US", "KE"],
        countryVerdicts: { ...ALL_ELIGIBLE },
        nodeAdmissions: {
          "node:expired-1": refusedAdmission([code], "node:expired-1"),
        },
        localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
      });
      expect(evaluation.verdict).toBe("REFUSED");
      expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual([
        "NODE_OFFER_NOT_ADMITTED",
      ]);
      expect(evaluation.refusals[0]?.message).toContain(code);
    }
  });

  it("mixing one unadmitted node into an otherwise admitted route still refuses the WHOLE route", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: legs([
        ["leg:0", "GENUINE_COMMERCE", "node:good-1"],
        ["leg:1", "GENUINE_COMMERCE", "node:revoked-1"],
        ["leg:2", "GENUINE_COMMERCE", null],
      ]),
      countries: ["US", "GH", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: {
        "node:good-1": admittedFact({ nodeId: "node:good-1" }),
        "node:revoked-1": refusedAdmission(["OFFER_NOT_VERIFIED"], "node:revoked-1"),
      },
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.verdict).toBe("REFUSED");
    expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual(["NODE_OFFER_NOT_ADMITTED"]);
  });
});

describe("the truncated search never claims completeness (ADR-0009 D6 receipts — the discovery-honesty path)", () => {
  it("a budget-capped graph search emits the truncation receipt with the TRUE pre-cut total", () => {
    const graph = buildRouteGraph({
      vertices: [
        { vertexId: "v:origin", kind: "SENDER", jurisdiction: "US" },
        { vertexId: "v:a", kind: "PROVIDER_ACCOUNT", jurisdiction: "US" },
        { vertexId: "v:b", kind: "PROVIDER_ACCOUNT", jurisdiction: "GB" },
        { vertexId: "v:c", kind: "VERIFIED_NODE", jurisdiction: "GH", nodeId: "node:g-1" },
        { vertexId: "v:dest", kind: "BENEFICIARY", jurisdiction: "KE" },
      ],
      edges: [
        { edgeId: "e:o-a", kind: "PROVIDER_OPERATION", fromVertexId: "v:origin", toVertexId: "v:a", operation: "op:1", operatingNodeId: null, amount: { currency: "USD", minorUnits: "100" } },
        { edgeId: "e:o-b", kind: "PROVIDER_OPERATION", fromVertexId: "v:origin", toVertexId: "v:b", operation: "op:2", operatingNodeId: null, amount: { currency: "USD", minorUnits: "100" } },
        { edgeId: "e:o-c", kind: "NODE_RELAY", fromVertexId: "v:origin", toVertexId: "v:c", operation: "op:3", operatingNodeId: "node:g-1", amount: { currency: "USD", minorUnits: "100" } },
        { edgeId: "e:a-d", kind: "PROVIDER_OPERATION", fromVertexId: "v:a", toVertexId: "v:dest", operation: "op:4", operatingNodeId: null, amount: { currency: "KES", minorUnits: "100" } },
        { edgeId: "e:b-d", kind: "PROVIDER_OPERATION", fromVertexId: "v:b", toVertexId: "v:dest", operation: "op:5", operatingNodeId: null, amount: { currency: "KES", minorUnits: "100" } },
        { edgeId: "e:c-d", kind: "NODE_RELAY", fromVertexId: "v:c", toVertexId: "v:dest", operation: "op:6", operatingNodeId: "node:g-1", amount: { currency: "KES", minorUnits: "100" } },
      ],
    });
    const capped = searchRoutePaths({
      graph,
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: { maxPathCandidates: 2, maxDistinctVertices: 8, maxDistinctEdges: 8 },
    });
    expect(capped.coverage).toBe("TRUNCATED");
    expect(capped.receipts[0]?.dimension).toBe("maxPathCandidates");
    expect(capped.receipts[0]?.actualCount).toBe(3);
    expect(capped.receipts[0]?.limit).toBe(2);
    const complete = searchRoutePaths({
      graph,
      originVertexId: "v:origin",
      destinationVertexId: "v:dest",
      maxHops: 2,
      budget: { maxPathCandidates: 8, maxDistinctVertices: 8, maxDistinctEdges: 8 },
    });
    expect(complete.coverage).toBe("COMPLETE");
    expect(complete.admitted).toHaveLength(3);
  });
});
