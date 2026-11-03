import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_VERSION,
  CLASS_REQUIREMENTS,
  CLASS_RESTRICTION_RANKS,
  TRANSACTION_CLASSES,
  evaluateClassificationEligibility,
  governingClassification,
  routeGoverningClassification,
  validateTransactionClassification,
} from "../src/index.ts";
import { ClassificationError } from "../src/index.ts";

/** A minimal valid commerce classification (hermetic fixture). */
function commerceClassification(overrides: Record<string, unknown> = {}) {
  return {
    classificationVersion: CLASSIFICATION_VERSION,
    transactionClass: "GENUINE_COMMERCE",
    derivedFrom: { intentRef: "intent:test-1", factsDigest: "fnv1a64:0000000000000001" },
    classifiedBy: "OPERATOR_REVIEW" as const,
    evidence: {
      purposeEvidenceRefs: ["evidence:invoice-1"],
      licenceRefs: [],
      providerProductApprovalRefs: [],
      custodyProgrammeRefs: [],
    },
    ...overrides,
  };
}

describe("the typed three-plane classification (ADR-0020 D1/D3)", () => {
  it("validates a well-formed classification and freezes it", () => {
    const classification = validateTransactionClassification(commerceClassification());
    expect(classification.transactionClass).toBe("GENUINE_COMMERCE");
    expect(Object.isFrozen(classification)).toBe(true);
    expect(Object.isFrozen(classification.evidence)).toBe(true);
  });

  it("rejects a stale/foreign classification version (fail closed, never coerced)", () => {
    expect(() =>
      validateTransactionClassification(commerceClassification({ classificationVersion: "0.9.0" })),
    ).toThrow(ClassificationError);
  });

  it("rejects a class outside the closed vocabulary (the class is never invented)", () => {
    expect(() =>
      validateTransactionClassification(commerceClassification({ transactionClass: "MISC" })),
    ).toThrow(ClassificationError);
    expect(() =>
      validateTransactionClassification(commerceClassification({ transactionClass: "GENUINE_P2P_GIFT" })),
    ).toThrow(ClassificationError);
  });

  it("rejects an unreviewable provenance (a class is never model-chosen)", () => {
    expect(() =>
      validateTransactionClassification(commerceClassification({ classifiedBy: "MODEL_GUESSED" })),
    ).toThrow(ClassificationError);
  });

  it("the vocabulary is exactly the seven typed classes of the §5 table", () => {
    expect([...TRANSACTION_CLASSES]).toEqual([
      "GENUINE_COMMERCE",
      "MARKETPLACE_SELLER_SETTLEMENT",
      "CONTRACTOR_SUPPLIER_PAYMENT",
      "REIMBURSEMENT",
      "REFUND",
      "REGULATED_REMITTANCE_P2P",
      "OTHER_UNCLEAR",
    ]);
  });

  it("REGULATED_REMITTANCE_P2P carries the full §5 burden; commerce does not", () => {
    expect(CLASS_REQUIREMENTS.REGULATED_REMITTANCE_P2P).toEqual({
      purposeEvidenceRequired: true,
      licenceEvidenceRequired: true,
      providerProductApprovalRequired: true,
      custodyProgrammeEvidenceRequired: true,
    });
    expect(CLASS_REQUIREMENTS.GENUINE_COMMERCE.licenceEvidenceRequired).toBe(false);
    expect(CLASS_REQUIREMENTS.GENUINE_COMMERCE.providerProductApprovalRequired).toBe(false);
  });
});

describe("classification eligibility (the §5 evidence burden, fail closed)", () => {
  it("commerce with purpose evidence is ELIGIBLE", () => {
    const outcome = evaluateClassificationEligibility(commerceClassification());
    expect(outcome.verdict).toBe("ELIGIBLE");
    expect(outcome.missing).toEqual([]);
  });

  it("commerce WITHOUT purpose evidence is refused with the typed missing requirement", () => {
    const noEvidence = commerceClassification({
      evidence: {
        purposeEvidenceRefs: [],
        licenceRefs: [],
        providerProductApprovalRefs: [],
        custodyProgrammeRefs: [],
      },
    });
    const outcome = evaluateClassificationEligibility(noEvidence);
    expect(outcome.verdict).toBe("REFUSED_CLASS_EVIDENCE_MISSING");
    expect(outcome.missing.map((entry) => entry.requirement)).toEqual(["PURPOSE_EVIDENCE"]);
  });

  it("P2P remittance without licences/approval/custody evidence is refused on all three (the §5 ✗ row)", () => {
    const p2p = commerceClassification({
      transactionClass: "REGULATED_REMITTANCE_P2P",
    });
    const outcome = evaluateClassificationEligibility(p2p);
    expect(outcome.verdict).toBe("REFUSED_CLASS_EVIDENCE_MISSING");
    expect(outcome.missing.map((entry) => entry.requirement)).toEqual([
      "LICENCE_EVIDENCE",
      "PROVIDER_PRODUCT_APPROVAL",
      "CUSTODY_PROGRAMME_EVIDENCE",
    ]);
  });

  it("P2P remittance WITH the full operator evidence bundle is eligible (the honest ✗→✓ path)", () => {
    const licensed = commerceClassification({
      transactionClass: "REGULATED_REMITTANCE_P2P",
      evidence: {
        purposeEvidenceRefs: ["evidence:remittance-agreement"],
        licenceRefs: ["licence:msb-2026"],
        providerProductApprovalRefs: ["approval:provider-written-2026"],
        custodyProgrammeRefs: ["custody:programme-2026"],
      },
    });
    const outcome = evaluateClassificationEligibility(licensed);
    expect(outcome.verdict).toBe("ELIGIBLE");
  });

  it("OTHER_UNCLEAR never routes (the model asks for facts — D3)", () => {
    const outcome = evaluateClassificationEligibility(
      commerceClassification({ transactionClass: "OTHER_UNCLEAR" }),
    );
    expect(outcome.verdict).toBe("REFUSED_UNCLASSIFIABLE");
  });
});

describe("the most-restrictive-classification rule (INV-30 / D2)", () => {
  it("the intent's class alone governs a direct route", () => {
    expect(governingClassification(["GENUINE_COMMERCE"])).toBe("GENUINE_COMMERCE");
  });

  it("a commerce-labelled leg NEVER lowers a P2P intent's governing class", () => {
    expect(
      routeGoverningClassification({
        intentClass: "REGULATED_REMITTANCE_P2P",
        legClasses: ["GENUINE_COMMERCE", "GENUINE_COMMERCE", "GENUINE_COMMERCE"],
      }),
    ).toBe("REGULATED_REMITTANCE_P2P");
  });

  it("a P2P-shaped leg RAISES a commerce intent's governing class (the whole route is governed)", () => {
    expect(
      routeGoverningClassification({
        intentClass: "GENUINE_COMMERCE",
        legClasses: ["GENUINE_COMMERCE", "REGULATED_REMITTANCE_P2P"],
      }),
    ).toBe("REGULATED_REMITTANCE_P2P");
  });

  it("OTHER_UNCLEAR dominates every decomposition (nothing routes until clarified)", () => {
    expect(
      routeGoverningClassification({
        intentClass: "GENUINE_COMMERCE",
        legClasses: ["GENUINE_COMMERCE", "OTHER_UNCLEAR", "REFUND"],
      }),
    ).toBe("OTHER_UNCLEAR");
    expect(CLASS_RESTRICTION_RANKS.OTHER_UNCLEAR).toBeGreaterThan(
      CLASS_RESTRICTION_RANKS.REGULATED_REMITTANCE_P2P,
    );
  });

  it("the rule is order-independent over arbitrary permutations (decomposition changes nothing)", () => {
    const classes = [
      "REFUND",
      "REGULATED_REMITTANCE_P2P",
      "GENUINE_COMMERCE",
      "MARKETPLACE_SELLER_SETTLEMENT",
    ];
    const permutations = [
      classes,
      [...classes].reverse(),
      [classes[2] as string, classes[0] as string, classes[3] as string, classes[1] as string],
    ];
    const governed = permutations.map((permutation) => governingClassification(permutation));
    expect(governed).toEqual([
      "REGULATED_REMITTANCE_P2P",
      "REGULATED_REMITTANCE_P2P",
      "REGULATED_REMITTANCE_P2P",
    ]);
  });

  it("an empty or malformed class list is a typed error (never a default class)", () => {
    expect(() => governingClassification([])).toThrow(ClassificationError);
    expect(() => governingClassification(["NOT_A_CLASS"])).toThrow(ClassificationError);
    expect(() =>
      routeGoverningClassification({
        intentClass: "GENUINE_COMMERCE",
        legClasses: "nope" as unknown as readonly string[],
      }),
    ).toThrow(ClassificationError);
  });
});
