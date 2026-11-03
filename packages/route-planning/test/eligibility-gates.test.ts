import { describe, expect, it } from "vitest";
import {
  CUSTODY_BEARING_NODE_ROLES,
  NODE_COUNTRY_VERDICTS,
  NODE_ELIGIBILITY_GATE_ORDER,
  NODE_ELIGIBILITY_REFUSAL_CODES,
  evaluateNodeRouteEligibility,
  type NodeRouteLegDeclaration,
} from "../src/eligibility-gates.ts";
import { classificationEligibilityOfGoverned } from "../src/eligibility-validation.ts";
import { RoutePlanningValidationError } from "../src/errors.ts";
import type { PinnedCountryVerdict } from "../src/eligibility-gates.ts";
import {
  COMMERCE_INTENT_EVIDENCED,
  COMMERCE_LOCAL_PURPOSES,
  ALL_ELIGIBLE,
  admittedFact,
} from "./node-network-fixtures.ts";

/**
 * The INV-30 node-route eligibility gates (ADR-0020 D2/D6/D8): the §5
 * decision order, the every-reason law, fail-closed inputs, the D8
 * custody precondition and the literal false. The end-to-end no-bypass
 * scenarios live in test/no-bypass.test.ts (the coverage map).
 */

function commerceLegs(count: number, nodeIds: readonly string[] = []): NodeRouteLegDeclaration[] {
  return Array.from({ length: count }, (_, index) => ({
    legId: `leg:${index}`,
    declaredClass: "GENUINE_COMMERCE",
    operatingNodeId: nodeIds[index % Math.max(nodeIds.length, 1)] ?? null,
  }));
}

describe("the pinned gate vocabulary", () => {
  it("the gate order is the §5 decision order, frozen", () => {
    expect(Object.isFrozen(NODE_ELIGIBILITY_GATE_ORDER)).toBe(true);
    expect([...NODE_ELIGIBILITY_GATE_ORDER]).toEqual([
      "PURPOSE_CLASS",
      "PROVIDER_PRODUCT_PERMISSION",
      "ACCOUNT_ENTITLEMENT",
      "COUNTRY",
      "CUSTODY_EVIDENCE",
    ]);
  });

  it("the refusal-code and country-verdict vocabularies are frozen and closed", () => {
    expect(Object.isFrozen(NODE_ELIGIBILITY_REFUSAL_CODES)).toBe(true);
    expect(NODE_ELIGIBILITY_REFUSAL_CODES).toHaveLength(10);
    expect(Object.isFrozen(NODE_COUNTRY_VERDICTS)).toBe(true);
    expect([...NODE_COUNTRY_VERDICTS]).toEqual([
      "ELIGIBLE",
      "REFUSED_SANCTIONED",
      "REFUSED_UNSUPPORTED",
      "UNKNOWN",
    ]);
  });

  it("the custody-bearing roles are the D5 vocabulary minus TECHNICAL_ROUTER", () => {
    expect([...CUSTODY_BEARING_NODE_ROLES]).toEqual([
      "PAYMENT_FACILITATOR",
      "MERCHANT_OF_RECORD",
      "CUSTODIAN",
      "AGENT",
      "PAYOUT_ORIGINATOR",
      "REGULATED_PAYMENT_INSTITUTION",
    ]);
  });
});

describe("evaluateNodeRouteEligibility — the gates", () => {
  it("a genuinely eligible commerce route through an admitted technical-router node is ELIGIBLE", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(3, ["node:test-1"]),
      countries: ["US", "GH", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: { "node:test-1": admittedFact() },
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.verdict).toBe("ELIGIBLE");
    expect(evaluation.refusals).toEqual([]);
    expect(evaluation.governingClass).toBe("GENUINE_COMMERCE");
    expect(evaluation.eligibilityPermitsExecution).toBe(false);
    expect(Object.isFrozen(evaluation)).toBe(true);
  });

  it("a local leg whose product does not serve the governing class is refused (permission for the WHOLE route)", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(2),
      countries: ["US", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: {},
      localProductPurposes: ["REIMBURSEMENT"],
    });
    expect(evaluation.verdict).toBe("REFUSED");
    // both local legs contribute their refusal (the every-reason law)
    expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual([
      "PRODUCT_DOES_NOT_SERVE_CLASS",
      "PRODUCT_DOES_NOT_SERVE_CLASS",
    ]);
  });

  it("a node leg without a presented admission outcome fails closed", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(2, ["node:ghost-1"]),
      countries: ["US", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: {},
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.verdict).toBe("REFUSED");
    expect(evaluation.refusals.map((refusal) => refusal.code)).toContain(
      "NODE_LEG_WITHOUT_ADMISSION",
    );
  });

  it("every country verdict is enforced: sanctioned / unsupported / UNKNOWN each refuse the WHOLE route", () => {
    for (const [verdict, code] of [
      ["REFUSED_SANCTIONED", "COUNTRY_SANCTIONED"],
      ["REFUSED_UNSUPPORTED", "COUNTRY_UNSUPPORTED"],
      ["UNKNOWN", "COUNTRY_VERDICT_UNKNOWN"],
    ] as const) {
      const evaluation = evaluateNodeRouteEligibility({
        intentClassification: COMMERCE_INTENT_EVIDENCED,
        legs: commerceLegs(2),
        countries: ["US", "KE"],
        countryVerdicts: { US: "ELIGIBLE", KE: verdict } as Record<string, PinnedCountryVerdict>,
        nodeAdmissions: {},
        localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
      });
      expect(evaluation.verdict).toBe("REFUSED");
      expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual([code]);
      expect(evaluation.refusals[0]?.country).toBe("KE");
    }
  });

  it("a MISSING country verdict is UNKNOWN (fail closed — the policy must cover every touched country)", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(2),
      countries: ["US", "KE"],
      countryVerdicts: { US: "ELIGIBLE" },
      nodeAdmissions: {},
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.verdict).toBe("REFUSED");
    expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual(["COUNTRY_VERDICT_UNKNOWN"]);
  });

  it("a custody-bearing node leg without D8 programme evidence is refused (D8)", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(2, ["node:test-1"]),
      countries: ["US", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: {
        "node:test-1": admittedFact({ custodyRole: "CUSTODIAN", custodyProgrammeRefs: [] }),
      },
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.verdict).toBe("REFUSED");
    // both node legs contribute their refusal (the every-reason law)
    expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual([
      "CUSTODY_EVIDENCE_MISSING",
      "CUSTODY_EVIDENCE_MISSING",
    ]);
  });

  it("a custody-bearing node leg WITH D8 programme evidence passes the custody gate", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(2, ["node:test-1"]),
      countries: ["US", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: {
        "node:test-1": admittedFact({
          custodyRole: "CUSTODIAN",
          custodyProgrammeRefs: ["licence:boj-psp-2026-014"],
        }),
      },
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.verdict).toBe("ELIGIBLE");
  });

  it("a custody role OUTSIDE the pinned D5 vocabulary fails closed", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(1, ["node:test-1"]),
      countries: ["US", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: {
        "node:test-1": admittedFact({ custodyRole: "SHADOW_BANK" }),
      },
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    });
    expect(evaluation.verdict).toBe("REFUSED");
    expect(evaluation.refusals.map((refusal) => refusal.code)).toEqual([
      "NODE_ROLE_OUTSIDE_VOCABULARY",
    ]);
  });

  it("the every-reason law: multiple violated gates ALL contribute their typed refusals", () => {
    const evaluation = evaluateNodeRouteEligibility({
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: [
        { legId: "leg:0", declaredClass: "GENUINE_COMMERCE", operatingNodeId: "node:test-1" },
        { legId: "leg:1", declaredClass: "REGULATED_REMITTANCE_P2P", operatingNodeId: null },
      ],
      countries: ["US", "IR"],
      countryVerdicts: { US: "ELIGIBLE", IR: "REFUSED_SANCTIONED" },
      nodeAdmissions: {},
      localProductPurposes: ["REIMBURSEMENT"],
    });
    expect(evaluation.verdict).toBe("REFUSED");
    const codes = evaluation.refusals.map((refusal) => refusal.code);
    expect(codes).toContain("CLASS_EVIDENCE_MISSING"); // the P2P leg raised the governing class
    expect(codes).toContain("PRODUCT_DOES_NOT_SERVE_CLASS");
    expect(codes).toContain("NODE_LEG_WITHOUT_ADMISSION");
    expect(codes).toContain("COUNTRY_SANCTIONED");
    expect(evaluation.governingClass).toBe("REGULATED_REMITTANCE_P2P");
  });

  it("input validation is fail-closed (malformed inputs never construct an evaluation)", () => {
    const base = {
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(1),
      countries: ["US"],
      countryVerdicts: { US: "ELIGIBLE" },
      nodeAdmissions: {},
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    } as const;
    expect(() =>
      evaluateNodeRouteEligibility({ ...base, legs: [] }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      evaluateNodeRouteEligibility({
        ...base,
        intentClassification: { transactionClass: "MAGIC_BEANS" } as never,
      }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      evaluateNodeRouteEligibility({ ...base, countries: ["USA"] }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      evaluateNodeRouteEligibility({ ...base, legs: [{ legId: "", declaredClass: "REFUND", operatingNodeId: null }] }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      evaluateNodeRouteEligibility({ ...base, countryVerdicts: null as never }),
    ).toThrow(RoutePlanningValidationError);
  });

  it("the evaluation digest is deterministic and the output frozen", () => {
    const input = {
      intentClassification: COMMERCE_INTENT_EVIDENCED,
      legs: commerceLegs(2, ["node:test-1"]),
      countries: ["US", "GH", "KE"],
      countryVerdicts: { ...ALL_ELIGIBLE },
      nodeAdmissions: { "node:test-1": admittedFact() },
      localProductPurposes: [...COMMERCE_LOCAL_PURPOSES],
    };
    const left = evaluateNodeRouteEligibility(input);
    const right = evaluateNodeRouteEligibility(input);
    expect(left.eligibilityDigest).toBe(right.eligibilityDigest);
    expect(left.eligibilityDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(Object.isFrozen(left.refusals)).toBe(true);
  });
});

describe("classificationEligibilityOfGoverned — the §5 evidence projection", () => {
  it("projects the honest DATA verdict for the governed class", () => {
    const p2p = classificationEligibilityOfGoverned("REGULATED_REMITTANCE_P2P", COMMERCE_INTENT_EVIDENCED);
    expect(p2p.verdict).toBe("REFUSED_CLASS_EVIDENCE_MISSING");
    expect(p2p.missing.map((entry) => entry.requirement)).toEqual([
      "LICENCE_EVIDENCE",
      "PROVIDER_PRODUCT_APPROVAL",
      "CUSTODY_PROGRAMME_EVIDENCE",
    ]);
    const unclear = classificationEligibilityOfGoverned("OTHER_UNCLEAR", COMMERCE_INTENT_EVIDENCED);
    expect(unclear.verdict).toBe("REFUSED_UNCLASSIFIABLE");
  });
});
