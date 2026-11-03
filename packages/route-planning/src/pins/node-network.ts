/**
 * @payswap/route-planning — the PINNED WIRE SHAPES of the node-network
 * intelligence surfaces (P27-D, ADR-0009 D2 + ADR-0020 D5/D6/D12).
 *
 * LAYER LAW: zero sibling imports. Every mirror below names its AUTHORITY
 * — @payswap/capability src/node-offer.ts (the offer chain that admits a
 * node offer as a CANDIDATE FACT over the local four-layer evidence) and
 * @payswap/node-network src/classification.ts (the three-plane regulatory
 * classification, ADR-0020 D1/D2/D3). The mirrors are deliberately
 * SUBSET-typed (any genuine authority value remains structurally
 * assignable; a pin can never widen an authority law). Vocabulary VALUES
 * are pinned byte-identical and their cross-lane consistency is asserted
 * by test/node-network-pins.test.ts against the REAL capability source
 * (the established cross-package relative test-import pattern) — the
 * node-network-side values are pinned locally with the merge-time
 * fidelity gate recorded for P27-E (the merge-fidelity precedent).
 */

/**
 * VALUE PIN — authority: @payswap/node-network src/classification.ts
 * `TRANSACTION_CLASSES` (byte-identical; the closed §5 vocabulary — the
 * P27-0 capability-and-eligibility matrix, dated 2026-11-03).
 */
export const PINNED_TRANSACTION_CLASSES = Object.freeze([
  "GENUINE_COMMERCE",
  "MARKETPLACE_SELLER_SETTLEMENT",
  "CONTRACTOR_SUPPLIER_PAYMENT",
  "REIMBURSEMENT",
  "REFUND",
  "REGULATED_REMITTANCE_P2P",
  "OTHER_UNCLEAR",
] as const);

export type PinnedTransactionClass = (typeof PINNED_TRANSACTION_CLASSES)[number];

/**
 * VALUE PIN — authority: @payswap/node-network src/classification.ts
 * `CLASS_RESTRICTION_RANKS` (byte-identical; the disclosed deterministic
 * total order of the most-restrictive-classification rule — INV-30/D2:
 * the governing class of a route is the maximum rank among the intent's
 * class and every leg's class, and decomposition/relabeling can never
 * lower it).
 */
export const PINNED_CLASS_RESTRICTION_RANKS: Readonly<Record<PinnedTransactionClass, number>> =
  Object.freeze({
    GENUINE_COMMERCE: 0,
    REFUND: 1,
    REIMBURSEMENT: 2,
    CONTRACTOR_SUPPLIER_PAYMENT: 3,
    MARKETPLACE_SELLER_SETTLEMENT: 4,
    REGULATED_REMITTANCE_P2P: 5,
    OTHER_UNCLEAR: 6,
  });

/**
 * VALUE PIN — authority: @payswap/capability src/node-offer.ts
 * `NODE_OFFER_REFUSAL_CODES` (byte-identical; the typed admission-refusal
 * vocabulary of the offer chain).
 */
export const PINNED_NODE_OFFER_REFUSAL_CODES = Object.freeze([
  "OFFER_NOT_VERIFIED",
  "OFFER_FIXTURE_NODE",
  "OFFER_INSTANCE_NOT_BOUND",
  "INSTANCE_NOT_ACTIVE",
  "INSTANCE_NOT_ELIGIBLE",
  "OBSERVATION_NOT_AVAILABLE",
  "OBSERVATION_INSTANCE_MISMATCH",
  "OBSERVATION_ELIGIBILITY_UNKNOWN",
] as const);

export type PinnedNodeOfferRefusalCode = (typeof PINNED_NODE_OFFER_REFUSAL_CODES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/node-offer.ts
 * `VerifiedNodeOfferWire` (SUBSET: the verified-offer wire the admission
 * port carries; the constraint set's method/limit members stay with the
 * capability lane, opaque here).
 */
export interface PinnedVerifiedNodeOfferWire {
  readonly offerId: string;
  readonly nodeId: string;
  readonly boundInstanceIds: readonly string[];
  readonly custodyRole: string;
  /**
   * The node's D8 licence/programme approval references (authority:
   * @payswap/node-network src/enrollment.ts `CustodyDeclaration
   * .licenceProgrammeRefs`, carried onto the signed offer; EMPTY is
   * honest absence — a custody-bearing leg without them is refused by
   * the eligibility gates, never fabricated).
   */
  readonly custodyProgrammeRefs: readonly string[];
  readonly constraints: {
    readonly sourceCountries: readonly string[];
    readonly destinationCountries: readonly string[];
    readonly currencies: readonly string[];
    readonly purposes: readonly string[];
  };
  readonly verification: {
    readonly verdict: "VERIFIED";
    readonly verifiedAt: string;
    readonly nodeEnrollmentMode: "OPERATOR_ENROLLED" | "FIXTURE";
  };
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/node-offer.ts
 * `NodeOfferCapabilityFact` (SUBSET): the admitted CANDIDATE FACT — a
 * discovery input with the isEntitlement/admitsExecution literals false
 * (INV-13: provider evidence decisive; an offer never substitutes for
 * provider/account eligibility).
 */
export interface PinnedNodeOfferCapabilityFact {
  readonly factVersion: string;
  readonly discoveryTier: "CANDIDATE_FACT";
  readonly offerId: string;
  readonly nodeId: string;
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly providerName: string;
  readonly constraints: PinnedVerifiedNodeOfferWire["constraints"];
  readonly custodyRole: string;
  readonly custodyProgrammeRefs: readonly string[];
  readonly lineage: {
    readonly instanceId: string;
    readonly implementationId: string;
    readonly capabilityId: string;
    readonly observationVersion: number;
    readonly observedAt: string;
    readonly offerVerifiedAt: string;
  };
  readonly revalidationEvidence: {
    readonly instanceAuthorization: "ACTIVE";
    readonly effectiveAvailability: "AVAILABLE";
    readonly instanceEligible: true;
    readonly observationEligibility: "ELIGIBLE";
  };
  readonly isEntitlement: false;
  readonly admitsExecution: false;
}

/**
 * STRUCTURAL PIN — the admission outcome (the port's return): the fact,
 * or the typed refusals with every reason retained.
 */
export type PinnedNodeOfferAdmission =
  | { readonly admitted: true; readonly fact: PinnedNodeOfferCapabilityFact }
  | {
      readonly admitted: false;
      readonly offerId: string;
      readonly refusals: readonly {
        readonly code: PinnedNodeOfferRefusalCode;
        readonly message: string;
      }[];
    };

/**
 * VALUE PIN — authority: @payswap/node-network src/enrollment.ts
 * `NODE_ROLES` (byte-identical; the explicit ADR-0020 D5 role vocabulary
 * — the role is explicit, never inferred).
 */
export const PINNED_NODE_ROLES = Object.freeze([
  "TECHNICAL_ROUTER",
  "PAYMENT_FACILITATOR",
  "MERCHANT_OF_RECORD",
  "CUSTODIAN",
  "AGENT",
  "PAYOUT_ORIGINATOR",
  "REGULATED_PAYMENT_INSTITUTION",
] as const);

export type PinnedNodeRole = (typeof PINNED_NODE_ROLES)[number];

/**
 * VALUE PIN — authority: @payswap/node-network src/classification.ts
 * `CLASS_REQUIREMENTS` (the per-class §5 evidence-burden table,
 * byte-identical; the eligibility gates evaluate the GOVERNING class's
 * burden against the intent classification's evidence record — INV-30:
 * the burden is evaluated for the governing class, never the legs' own
 * declared labels).
 */
export const PINNED_CLASS_REQUIREMENTS: Readonly<
  Record<PinnedTransactionClass, PinnedRegulatoryRequirements>
> = Object.freeze({
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

/** STRUCTURAL PIN — the per-class regulatory burden (authority shape). */
export interface PinnedRegulatoryRequirements {
  readonly purposeEvidenceRequired: boolean;
  readonly licenceEvidenceRequired: boolean;
  readonly providerProductApprovalRequired: boolean;
  readonly custodyProgrammeEvidenceRequired: boolean;
}

/**
 * STRUCTURAL PIN — authority: @payswap/node-network src/classification.ts
 * `TransactionClassification` (SUBSET: the typed classification record —
 * derived from real facts, reviewable, never model-chosen; the evidence
 * references are opaque here).
 */
export interface PinnedTransactionClassification {
  readonly classificationVersion: string;
  readonly transactionClass: PinnedTransactionClass;
  readonly derivedFrom: { readonly intentRef: string; readonly factsDigest: string };
  readonly classifiedBy: "OPERATOR_REVIEW" | "DECLARED_FACTS";
  readonly evidence: {
    readonly purposeEvidenceRefs: readonly string[];
    readonly licenceRefs: readonly string[];
    readonly providerProductApprovalRefs: readonly string[];
    readonly custodyProgrammeRefs: readonly string[];
  };
}

/**
 * STRUCTURAL PIN — authority: @payswap/node-network src/classification.ts
 * `ClassificationEligibility` (the §5 evidence-burden verdict, an honest
 * DATA outcome — a typed exclusion, never a throw).
 */
export interface PinnedClassificationEligibility {
  readonly verdict: "ELIGIBLE" | "REFUSED_CLASS_EVIDENCE_MISSING" | "REFUSED_UNCLASSIFIABLE";
  readonly transactionClass: PinnedTransactionClass;
  readonly missing: readonly { readonly requirement: string; readonly message: string }[];
}
