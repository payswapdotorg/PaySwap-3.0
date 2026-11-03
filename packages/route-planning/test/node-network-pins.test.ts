import { describe, expect, it } from "vitest";
// The REAL authority modules, imported from the TEST tier only (the
// established cross-package relative import pattern — test/pins-fidelity.test.ts).
import {
  CLASS_REQUIREMENTS,
  CLASS_RESTRICTION_RANKS,
  TRANSACTION_CLASSES,
} from "../../node-network/src/classification.ts";
import { NODE_ROLES } from "../../node-network/src/enrollment.ts";
import {
  NODE_OFFER_REFUSAL_CODES,
  type NodeOfferAdmission,
  type VerifiedNodeOfferWire,
} from "../../capability/src/node-offer.ts";
import {
  PINNED_CLASS_REQUIREMENTS,
  PINNED_CLASS_RESTRICTION_RANKS,
  PINNED_NODE_OFFER_REFUSAL_CODES,
  PINNED_NODE_ROLES,
  PINNED_TRANSACTION_CLASSES,
  type PinnedNodeOfferAdmission,
  type PinnedNodeOfferCapabilityFact,
  type PinnedVerifiedNodeOfferWire,
} from "../src/pins/node-network.ts";

/**
 * NODE-NETWORK PIN FIDELITY (ADR-0009 D2 + ADR-0020 D5/D6/D12): every
 * pinned vocabulary equals the REAL authority module's byte-identically,
 * and REAL authority values remain structurally assignable to every pin
 * (a pin can never widen an authority law). The route-planning INV-30
 * gates compute over these pins; their fidelity to the intelligence
 * authority is what makes the enforcement honest.
 */

describe("classification pins (authority: @payswap/node-network src/classification.ts)", () => {
  it("the transaction-class vocabulary is byte-identical in the authority's order", () => {
    expect([...PINNED_TRANSACTION_CLASSES]).toEqual([...TRANSACTION_CLASSES]);
    expect(Object.isFrozen(PINNED_TRANSACTION_CLASSES)).toBe(true);
  });

  it("the restriction-rank table is byte-identical (the INV-30 most-restrictive total order)", () => {
    expect(PINNED_CLASS_RESTRICTION_RANKS).toEqual(CLASS_RESTRICTION_RANKS);
    expect(PINNED_CLASS_RESTRICTION_RANKS.REGULATED_REMITTANCE_P2P).toBeGreaterThan(
      PINNED_CLASS_RESTRICTION_RANKS.GENUINE_COMMERCE,
    );
    expect(PINNED_CLASS_RESTRICTION_RANKS.OTHER_UNCLEAR).toBeGreaterThan(
      PINNED_CLASS_RESTRICTION_RANKS.REGULATED_REMITTANCE_P2P,
    );
  });

  it("the per-class §5 requirements table is byte-identical (the governing-class burden)", () => {
    expect(PINNED_CLASS_REQUIREMENTS).toEqual(CLASS_REQUIREMENTS);
    // The load-bearing rows, re-asserted at the pin tier:
    expect(PINNED_CLASS_REQUIREMENTS.REGULATED_REMITTANCE_P2P.licenceEvidenceRequired).toBe(true);
    expect(
      PINNED_CLASS_REQUIREMENTS.REGULATED_REMITTANCE_P2P.providerProductApprovalRequired,
    ).toBe(true);
    expect(PINNED_CLASS_REQUIREMENTS.REGULATED_REMITTANCE_P2P.custodyProgrammeEvidenceRequired).toBe(true);
  });

  it("the node-role vocabulary is byte-identical (the D5 explicit roles)", () => {
    expect([...PINNED_NODE_ROLES]).toEqual([...NODE_ROLES]);
    expect(Object.isFrozen(PINNED_NODE_ROLES)).toBe(true);
  });
});

describe("offer-chain pins (authority: @payswap/capability src/node-offer.ts)", () => {
  it("the admission-refusal vocabulary is byte-identical", () => {
    expect([...PINNED_NODE_OFFER_REFUSAL_CODES]).toEqual([...NODE_OFFER_REFUSAL_CODES]);
    expect(Object.isFrozen(PINNED_NODE_OFFER_REFUSAL_CODES)).toBe(true);
  });

  it("a REAL verified offer wire remains structurally assignable to the pin", () => {
    const wire: VerifiedNodeOfferWire = {
      offerId: "offer:fidelity-1",
      nodeId: "node:fidelity-1",
      boundInstanceIds: ["inst:fidelity-1"],
      custodyRole: "CUSTODIAN",
      custodyProgrammeRefs: ["licence:fidelity"],
      constraints: {
        sourceCountries: ["GH"],
        destinationCountries: ["KE"],
        currencies: ["GHS", "KES"],
        purposes: ["GENUINE_COMMERCE"],
      },
      verification: {
        verdict: "VERIFIED",
        verifiedAt: "2026-11-03T12:00:00Z",
        nodeEnrollmentMode: "OPERATOR_ENROLLED",
      },
    };
    const pinned: PinnedVerifiedNodeOfferWire = wire;
    expect(pinned.offerId).toBe("offer:fidelity-1");
    expect(pinned.custodyProgrammeRefs).toEqual(["licence:fidelity"]);
  });

  it("a REAL refused admission remains structurally assignable to the pin (every reason retained)", () => {
    const refused: NodeOfferAdmission = {
      admitted: false,
      offerId: "offer:fidelity-2",
      refusals: [
        { code: "OFFER_NOT_VERIFIED", message: "unsigned" },
        { code: "OFFER_FIXTURE_NODE", message: "fixture" },
      ],
    };
    const pinned: PinnedNodeOfferAdmission = refused;
    if (!pinned.admitted) {
      expect(pinned.refusals.map((refusal) => refusal.code)).toContain("OFFER_NOT_VERIFIED");
    }
  });

  it("the pinned candidate fact keeps the INV-13 literals (a discovery input, never an entitlement)", () => {
    const fact: PinnedNodeOfferCapabilityFact = {
      factVersion: "1.0.0",
      discoveryTier: "CANDIDATE_FACT",
      offerId: "offer:fidelity-3",
      nodeId: "node:fidelity-3",
      instanceId: "inst:fidelity-3",
      capabilityId: "cap:1",
      implementationId: "impl:1",
      providerName: "psp-fidelity",
      constraints: {
        sourceCountries: ["GH"],
        destinationCountries: ["KE"],
        currencies: ["GHS"],
        purposes: ["GENUINE_COMMERCE"],
      },
      custodyRole: "TECHNICAL_ROUTER",
      custodyProgrammeRefs: [],
      lineage: {
        instanceId: "inst:fidelity-3",
        implementationId: "impl:1",
        capabilityId: "cap:1",
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
    };
    expect(fact.isEntitlement).toBe(false);
    expect(fact.admitsExecution).toBe(false);
  });
});
