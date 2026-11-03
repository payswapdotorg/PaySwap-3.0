/**
 * @payswap/node-network — the typed three-plane transaction semantics and
 * the INV-30 non-laundering law (P27-D, ADR-0020 D1/D2/D3).
 *
 * THE THREE PLANES (D1), typed, recorded, never conflated:
 *  1. the economic intent (what the user wants — referenced opaquely here;
 *     its typed pins live in @payswap/economic, never re-interpreted);
 *  2. the provider operations (mechanism facts — a PaymentIntent, a Connect
 *     charge, a payout — NEVER permission facts);
 *  3. the regulatory classification (the transaction class the ACTUAL FACTS
 *     determine, with the jurisdiction/licensing/provider-product permission
 *     burden that class requires — the P27-0 matrix §5 table, dated).
 *
 * INV-30 (D2): route decomposition, distribution, relabeling or hop-chaining
 * NEVER changes the classification. The class is computed from the intent's
 * real facts (D3), is carried by the route AS A WHOLE, and the MOST
 * RESTRICTIVE classification among the intent and any leg GOVERNS THE
 * ENTIRE ROUTE. A leg's declared commerce label on a personal remittance
 * changes nothing: the governing class stays REGULATED_REMITTANCE_P2P.
 *
 * The classification arrives as DATA (the accepting authority derives it
 * from the real facts and it is reviewable — D3); this module validates it,
 * evaluates the class's evidence burden, and computes the governing class.
 * It NEVER chooses a class (a class change is a new intent, new digest).
 */

import { ClassificationError } from "./errors.ts";
import {
  LIMITS,
  deepFreeze,
  isNonEmptyString,
  isRecord,
  requireBoundedString,
} from "./canonical.ts";

/** The classification vocabulary version (part of every governing digest). */
export const CLASSIFICATION_VERSION = "1.0.0" as const;

/**
 * VALUE PIN — the typed transaction classes (authority: the P27-0
 * capability-and-eligibility matrix §5, retrieved 2026-11-03; re-verified
 * per D10 before any encoding change). REGULATED_REMITTANCE_P2P is ✗ on
 * ordinary merchant/Connect/collection products — licences + explicit
 * provider product approval + the D8 custody evidence or a typed exclusion.
 */
export const TRANSACTION_CLASSES = Object.freeze([
  "GENUINE_COMMERCE",
  "MARKETPLACE_SELLER_SETTLEMENT",
  "CONTRACTOR_SUPPLIER_PAYMENT",
  "REIMBURSEMENT",
  "REFUND",
  "REGULATED_REMITTANCE_P2P",
  "OTHER_UNCLEAR",
] as const);

export type TransactionClass = (typeof TRANSACTION_CLASSES)[number];

/**
 * The pinned restriction rank (deterministic, disclosed policy — the
 * most-restrictive-classification rule's total order). HIGHER IS MORE
 * RESTRICTIVE: OTHER_UNCLEAR dominates (nothing routes until the facts
 * clarify), REGULATED_REMITTANCE_P2P next (regulated activity — routes
 * only on the full §5 evidence bundle), then the commerce classes by
 * their evidence burden (platform/liability > third-party payout
 * entitlement > provider-supported mechanism riders > plain commerce).
 */
export const CLASS_RESTRICTION_RANKS: Readonly<Record<TransactionClass, number>> = Object.freeze({
  GENUINE_COMMERCE: 0,
  REFUND: 1,
  REIMBURSEMENT: 2,
  CONTRACTOR_SUPPLIER_PAYMENT: 3,
  MARKETPLACE_SELLER_SETTLEMENT: 4,
  REGULATED_REMITTANCE_P2P: 5,
  OTHER_UNCLEAR: 6,
});

/** The per-class regulatory burden (the §5 "required before eligible" column). */
export interface RegulatoryRequirements {
  /** Purpose/transaction evidence (invoice, order, contract) is required. */
  readonly purposeEvidenceRequired: boolean;
  /** Money-transmission/licence evidence is required (regulated classes). */
  readonly licenceEvidenceRequired: boolean;
  /** Explicit provider product approval for the disclosed model is required. */
  readonly providerProductApprovalRequired: boolean;
  /** ADR-0020 D8 custody/safeguarding programme evidence is required. */
  readonly custodyProgrammeEvidenceRequired: boolean;
}

/** VALUE PIN — the per-class requirements table (the §5 law, dated 2026-11-03). */
export const CLASS_REQUIREMENTS: Readonly<Record<TransactionClass, RegulatoryRequirements>> =
  Object.freeze({
    GENUINE_COMMERCE: Object.freeze({
      purposeEvidenceRequired: true,
      licenceEvidenceRequired: false,
      providerProductApprovalRequired: false,
      custodyProgrammeEvidenceRequired: false,
    }),
    MARKETPLACE_SELLER_SETTLEMENT: Object.freeze({
      purposeEvidenceRequired: true,
      licenceEvidenceRequired: false,
      providerProductApprovalRequired: false,
      custodyProgrammeEvidenceRequired: false,
    }),
    CONTRACTOR_SUPPLIER_PAYMENT: Object.freeze({
      purposeEvidenceRequired: true,
      licenceEvidenceRequired: false,
      providerProductApprovalRequired: false,
      custodyProgrammeEvidenceRequired: false,
    }),
    REIMBURSEMENT: Object.freeze({
      purposeEvidenceRequired: true,
      licenceEvidenceRequired: false,
      providerProductApprovalRequired: false,
      custodyProgrammeEvidenceRequired: false,
    }),
    REFUND: Object.freeze({
      purposeEvidenceRequired: false,
      licenceEvidenceRequired: false,
      providerProductApprovalRequired: false,
      custodyProgrammeEvidenceRequired: false,
    }),
    REGULATED_REMITTANCE_P2P: Object.freeze({
      purposeEvidenceRequired: true,
      licenceEvidenceRequired: true,
      providerProductApprovalRequired: true,
      custodyProgrammeEvidenceRequired: true,
    }),
    OTHER_UNCLEAR: Object.freeze({
      purposeEvidenceRequired: true,
      licenceEvidenceRequired: true,
      providerProductApprovalRequired: true,
      custodyProgrammeEvidenceRequired: true,
    }),
  });

/** True iff the value is a member of the closed class vocabulary. */
export function isTransactionClass(value: unknown): value is TransactionClass {
  return (
    typeof value === "string" && (TRANSACTION_CLASSES as readonly unknown[]).includes(value)
  );
}

/**
 * The typed classification record (D3): derived from the intent's real
 * facts, reviewable, never model-chosen. The evidence refs are
 * operator-supplied (the station secret/attestation channel); EMPTY
 * evidence is HONEST (the class then simply is not satisfiable — a typed
 * exclusion, never a fabricated approval).
 */
export interface TransactionClassification {
  readonly classificationVersion: string;
  readonly transactionClass: TransactionClass;
  /** The intent the class was derived from (opaque ref) + the facts digest. */
  readonly derivedFrom: { readonly intentRef: string; readonly factsDigest: string };
  /** The declared classification provenance (never model-chosen). */
  readonly classifiedBy: "OPERATOR_REVIEW" | "DECLARED_FACTS";
  /** Operator-supplied evidence references (may be empty = honestly none). */
  readonly evidence: {
    readonly purposeEvidenceRefs: readonly string[];
    readonly licenceRefs: readonly string[];
    readonly providerProductApprovalRefs: readonly string[];
    readonly custodyProgrammeRefs: readonly string[];
  };
}

/** Fail-closed validation of a classification record (never a repair). */
export function validateTransactionClassification(candidate: unknown): TransactionClassification {
  const record = isRecord(candidate) ? candidate : null;
  if (record === null) {
    throw new ClassificationError("a transaction classification must be an object");
  }
  if (record["classificationVersion"] !== CLASSIFICATION_VERSION) {
    throw new ClassificationError(
      `classification.classificationVersion must be '${CLASSIFICATION_VERSION}' (stale or foreign input is refused)`,
    );
  }
  if (!isTransactionClass(record["transactionClass"])) {
    throw new ClassificationError(
      "classification.transactionClass must be a member of the closed class vocabulary (the class is derived from real facts, never invented)",
    );
  }
  const derivedFrom = record["derivedFrom"];
  if (
    !isRecord(derivedFrom) ||
    !isNonEmptyString(derivedFrom["intentRef"]) ||
    !isNonEmptyString(derivedFrom["factsDigest"])
  ) {
    throw new ClassificationError(
      "classification.derivedFrom must carry the intentRef and the real-facts digest the class was derived from (reviewable, D3)",
    );
  }
  if (
    record["classifiedBy"] !== "OPERATOR_REVIEW" &&
    record["classifiedBy"] !== "DECLARED_FACTS"
  ) {
    throw new ClassificationError(
      "classification.classifiedBy must be OPERATOR_REVIEW or DECLARED_FACTS — a class is never model-chosen",
    );
  }
  const evidence = record["evidence"];
  if (!isRecord(evidence)) {
    throw new ClassificationError("classification.evidence must be the evidence reference record");
  }
  for (const field of [
    "purposeEvidenceRefs",
    "licenceRefs",
    "providerProductApprovalRefs",
    "custodyProgrammeRefs",
  ] as const) {
    const refs = evidence[field];
    if (!Array.isArray(refs) || refs.some((ref) => !isNonEmptyString(ref))) {
      throw new ClassificationError(
        `classification.evidence.${field} must be an array of non-empty evidence references`,
      );
    }
    if (refs.length > LIMITS.refMaxLength) {
      throw new ClassificationError(
        `classification.evidence.${field} must carry at most ${LIMITS.refMaxLength} references`,
      );
    }
  }
  const classification: TransactionClassification = {
    classificationVersion: record["classificationVersion"] as string,
    transactionClass: record["transactionClass"] as TransactionClass,
    derivedFrom: {
      intentRef: requireBoundedString(
        derivedFrom["intentRef"],
        "classification.derivedFrom.intentRef",
        LIMITS.refMaxLength,
      ),
      factsDigest: requireBoundedString(
        derivedFrom["factsDigest"],
        "classification.derivedFrom.factsDigest",
        LIMITS.refMaxLength,
      ),
    },
    classifiedBy: record["classifiedBy"] as "OPERATOR_REVIEW" | "DECLARED_FACTS",
    evidence: {
      purposeEvidenceRefs: Object.freeze([...(evidence["purposeEvidenceRefs"] as string[])]),
      licenceRefs: Object.freeze([...(evidence["licenceRefs"] as string[])]),
      providerProductApprovalRefs: Object.freeze([
        ...(evidence["providerProductApprovalRefs"] as string[]),
      ]),
      custodyProgrammeRefs: Object.freeze([...(evidence["custodyProgrammeRefs"] as string[])]),
    },
  };
  return deepFreeze(classification);
}

/** The typed classification-eligibility verdict vocabulary. */
export const CLASSIFICATION_ELIGIBILITY_VERDICTS = Object.freeze([
  "ELIGIBLE",
  "REFUSED_CLASS_EVIDENCE_MISSING",
  "REFUSED_UNCLASSIFIABLE",
] as const);

export type ClassificationEligibilityVerdict =
  (typeof CLASSIFICATION_ELIGIBILITY_VERDICTS)[number];

/** The typed eligibility outcome (an honest DATA verdict, never a throw). */
export interface ClassificationEligibility {
  readonly verdict: ClassificationEligibilityVerdict;
  readonly transactionClass: TransactionClass;
  /** Empty iff eligible; every missing requirement, typed. */
  readonly missing: readonly {
    readonly requirement: string;
    readonly message: string;
  }[];
}

/**
 * Evaluate one classification against its class's evidence burden (the §5
 * eligibility-decision order's FIRST gate). Fail closed: a required
 * evidence reference that is absent keeps the class refused — an honest
 * typed exclusion, never a fabricated approval (INV-13 discipline).
 */
export function evaluateClassificationEligibility(
  candidate: unknown,
): ClassificationEligibility {
  const classification = validateTransactionClassification(candidate);
  const requirements = CLASS_REQUIREMENTS[classification.transactionClass];
  const missing: { requirement: string; message: string }[] = [];
  if (classification.transactionClass === "OTHER_UNCLEAR") {
    return deepFreeze({
      verdict: "REFUSED_UNCLASSIFIABLE",
      transactionClass: classification.transactionClass,
      missing: Object.freeze([
        {
          requirement: "CLASSIFICATION_FACTS",
          message:
            "the transaction class is OTHER_UNCLEAR — the model asks for the missing facts; nothing routes until the class is derived from reviewable facts (D3)",
        },
      ]),
    });
  }
  if (
    requirements.purposeEvidenceRequired &&
    classification.evidence.purposeEvidenceRefs.length === 0
  ) {
    missing.push({
      requirement: "PURPOSE_EVIDENCE",
      message: "the class requires purpose/transaction evidence (invoice, order, contract)",
    });
  }
  if (requirements.licenceEvidenceRequired && classification.evidence.licenceRefs.length === 0) {
    missing.push({
      requirement: "LICENCE_EVIDENCE",
      message: "the class is regulated activity — licence evidence is required before any route is eligible (§5)",
    });
  }
  if (
    requirements.providerProductApprovalRequired &&
    classification.evidence.providerProductApprovalRefs.length === 0
  ) {
    missing.push({
      requirement: "PROVIDER_PRODUCT_APPROVAL",
      message: "the class requires the provider's explicit written product approval for the disclosed model (§5)",
    });
  }
  if (
    requirements.custodyProgrammeEvidenceRequired &&
    classification.evidence.custodyProgrammeRefs.length === 0
  ) {
    missing.push({
      requirement: "CUSTODY_PROGRAMME_EVIDENCE",
      message: "the class involves custody/transmission of funds — ADR-0020 D8 custody/safeguarding programme evidence is a route precondition",
    });
  }
  return deepFreeze({
    verdict: missing.length === 0 ? "ELIGIBLE" : "REFUSED_CLASS_EVIDENCE_MISSING",
    transactionClass: classification.transactionClass,
    missing: Object.freeze(missing),
  });
}

/**
 * THE MOST-RESTRICTIVE-CLASSIFICATION RULE (INV-30/D2): the governing
 * class of a route is the maximum restriction rank among the intent's
 * class and every leg's class. Decomposition, distribution, relabeling
 * and hop-chaining are STRUCTURALLY UNABLE to lower it — a leg labelled
 * GENUINE_COMMERCE on a REGULATED_REMITTANCE_P2P intent governs nothing.
 */
export function governingClassification(classes: readonly unknown[]): TransactionClass {
  if (!Array.isArray(classes) || classes.length === 0) {
    throw new ClassificationError(
      "the governing classification needs at least the intent's class (an empty route has no class)",
    );
  }
  let governing: TransactionClass | undefined;
  for (const candidate of classes) {
    if (!isTransactionClass(candidate)) {
      throw new ClassificationError(
        "every route participant's class must be a member of the closed vocabulary (the intent's and every leg's)",
      );
    }
    if (
      governing === undefined ||
      CLASS_RESTRICTION_RANKS[candidate] > CLASS_RESTRICTION_RANKS[governing]
    ) {
      governing = candidate;
    }
  }
  return governing as TransactionClass;
}

/**
 * THE NO-RELABELING ASSERTION (the INV-30 machine check this package
 * exports): given the intent's classification and the per-leg DECLARED
 * labels, the governing class of the whole route equals the governing
 * class of (intent class + leg classes) — and a leg's declared label can
 * never lower it below the intent's own class. This function is pure: it
 * exists so the no-bypass battery (and any future consumer) can assert
 * the invariant over arbitrary decompositions.
 */
export function routeGoverningClassification(input: {
  readonly intentClass: unknown;
  readonly legClasses: readonly unknown[];
}): TransactionClass {
  if (!isRecord(input)) {
    throw new ClassificationError("the route classification input must be an object");
  }
  const legClasses = input["legClasses"];
  if (!Array.isArray(legClasses)) {
    throw new ClassificationError("legClasses must be an array (possibly empty)");
  }
  return governingClassification([input["intentClass"], ...legClasses]);
}
