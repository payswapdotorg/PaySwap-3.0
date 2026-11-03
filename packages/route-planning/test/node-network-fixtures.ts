import type {
  PinnedNodeOfferAdmission,
  PinnedNodeOfferCapabilityFact,
  PinnedTransactionClassification,
} from "../src/pins/node-network.ts";

/**
 * Shared P27-D fixtures for the eligibility-gate + no-bypass batteries:
 * pinned-shaped classification records, admitted node facts, refused
 * admissions and country verdicts. Everything here is TEST-TIER data (the
 * D11 law: a fixture is clearly a fixture — the real enrollment of a node
 * is operator-gated key-ready work, never a shipped default).
 */

export function classification(
  transactionClass: PinnedTransactionClassification["transactionClass"],
  evidence: Partial<PinnedTransactionClassification["evidence"]> = {},
): PinnedTransactionClassification {
  return {
    classificationVersion: "1.0.0",
    transactionClass,
    derivedFrom: { intentRef: "intent:no-bypass:001", factsDigest: "fnv1a64:0123456789abcdef" },
    classifiedBy: "OPERATOR_REVIEW",
    evidence: {
      purposeEvidenceRefs: [],
      licenceRefs: [],
      providerProductApprovalRefs: [],
      custodyProgrammeRefs: [],
      ...evidence,
    },
  };
}

export const P2P_INTENT_NO_EVIDENCE = classification("REGULATED_REMITTANCE_P2P");
export const P2P_INTENT_FULL_EVIDENCE = classification("REGULATED_REMITTANCE_P2P", {
  purposeEvidenceRefs: ["invoice:p2p-1"],
  licenceRefs: ["licence:msb-2026-77"],
  providerProductApprovalRefs: ["approval:provider-written-1"],
  custodyProgrammeRefs: ["programme:safeguarding-1"],
});
export const COMMERCE_INTENT_EVIDENCED = classification("GENUINE_COMMERCE", {
  purposeEvidenceRefs: ["invoice:commerce-1"],
});

export function admittedFact(
  overrides: Partial<PinnedNodeOfferCapabilityFact> = {},
): PinnedNodeOfferAdmission {
  const fact: PinnedNodeOfferCapabilityFact = {
    factVersion: "1.0.0",
    discoveryTier: "CANDIDATE_FACT",
    offerId: "offer:no-bypass-1",
    nodeId: "node:test-1",
    instanceId: "inst:test-1",
    capabilityId: "cap:test-collect",
    implementationId: "impl:test-1",
    providerName: "psp-test",
    constraints: {
      sourceCountries: ["US"],
      destinationCountries: ["KE"],
      currencies: ["USD", "KES"],
      purposes: ["GENUINE_COMMERCE"],
    },
    custodyRole: "TECHNICAL_ROUTER",
    custodyProgrammeRefs: [],
    lineage: {
      instanceId: "inst:test-1",
      implementationId: "impl:test-1",
      capabilityId: "cap:test-collect",
      observationVersion: 1,
      observedAt: "2026-11-03T12:00:00Z",
      offerVerifiedAt: "2026-11-03T12:00:00Z",
    },
    revalidationEvidence: {
      instanceAuthorization: "ACTIVE",
      effectiveAvailability: "AVAILABLE",
      instanceEligible: true,
      observationEligibility: "ELIGIBLE",
    },
    isEntitlement: false,
    admitsExecution: false,
    ...overrides,
  };
  return { admitted: true, fact };
}

export function refusedAdmission(
  codes: readonly string[],
  nodeId = "node:test-1",
): PinnedNodeOfferAdmission {
  return {
    admitted: false,
    offerId: `offer:${nodeId}`,
    refusals: codes.map((code) => ({ code: code as never, message: `refused: ${code}` })),
  };
}

export const ALL_ELIGIBLE = {
  US: "ELIGIBLE",
  GB: "ELIGIBLE",
  GH: "ELIGIBLE",
  KE: "ELIGIBLE",
} as const;

export const COMMERCE_LOCAL_PURPOSES = ["GENUINE_COMMERCE", "CONTRACTOR_SUPPLIER_PAYMENT"] as const;
