import { describe, expect, it } from "vitest";
import {
  NODE_OFFER_VERSION,
  signNodeCapabilityOffer,
  validateNodeCapabilityOffer,
  validateNodeOfferConstraints,
  verifyNodeCapabilityOffer,
  type NodeCapabilityOfferDraft,
} from "../src/index.ts";
import { NodeOfferError } from "../src/index.ts";
import { generateFixtureKeyPair } from "./fixtures.ts";

/** A well-formed offer draft fixture (hermetic; the D11 fixture law applies). */
function offerDraft(overrides: Record<string, unknown> = {}): NodeCapabilityOfferDraft {
  return {
    offerVersion: NODE_OFFER_VERSION,
    offerId: "offer:fixture-gh-kes-1",
    nodeId: "node:fixture-gh-1",
    boundInstanceIds: ["inst:paystack-gh-1"],
    constraints: {
      sourceCountries: ["GH"],
      destinationCountries: ["KE"],
      currencies: ["GHS", "KES"],
      fundingMethods: ["mobile_money_ghs"],
      payoutMethods: ["paystack_kes_bank_transfer"],
      amountLimits: {
        min: { currency: "GHS", minorUnits: "100" },
        max: { currency: "GHS", minorUnits: "1000000" },
      },
      purposes: ["GENUINE_COMMERCE"],
      kycRequired: true,
      availabilityWindow: { opensAt: "2026-11-03T00:00:00Z", closesAt: "2026-11-04T00:00:00Z" },
    },
    custodyRole: "TECHNICAL_ROUTER",
    issuedAt: "2026-11-03T00:00:00Z",
    expiresAt: "2026-11-04T00:00:00Z",
    ...overrides,
  } as NodeCapabilityOfferDraft;
}

function signedOffer(keys: ReturnType<typeof generateFixtureKeyPair>) {
  return signNodeCapabilityOffer({ draft: offerDraft(), privateKeyPem: keys.privatePem });
}

describe("the signed expiring offer (ADR-0020 D5)", () => {
  it("signs a draft and the signature verifies end-to-end", () => {
    const keys = generateFixtureKeyPair();
    const offer = signedOffer(keys);
    const verdict = verifyNodeCapabilityOffer({
      offer,
      now: "2026-11-03T12:00:00Z",
      nodePublicKeyPem: keys.publicPem,
      nodeRevoked: false,
      nodeEnrollmentMode: "OPERATOR_ENROLLED",
      expectOperatorEnrolled: false,
      instanceAuthorizationStatuses: { "inst:paystack-gh-1": "ACTIVE" },
    });
    expect(verdict.verdict).toBe("VERIFIED");
    expect(verdict.reasons).toEqual([]);
    expect(verdict.verifiedOfferAdmitsExecution).toBe(false);
  });

  it("an UNSIGNED offer fails structural validation (contributes nothing)", () => {
    const draft = offerDraft() as unknown as Record<string, unknown>;
    expect(() => validateNodeCapabilityOffer(draft)).toThrow(/unsigned offer contributes nothing/i);
    expect(() => validateNodeCapabilityOffer({ ...draft, signature: "" })).toThrow(
      NodeOfferError,
    );
  });

  it("a TAMPERED offer (constraint changed after signing) does not verify", () => {
    const keys = generateFixtureKeyPair();
    const offer = signedOffer(keys);
    const tampered = {
      ...offer,
      constraints: {
        ...offer.constraints,
        destinationCountries: ["IR"],
      },
    };
    const verdict = verifyNodeCapabilityOffer({
      offer: tampered,
      now: "2026-11-03T12:00:00Z",
      nodePublicKeyPem: keys.publicPem,
      nodeRevoked: false,
      nodeEnrollmentMode: "OPERATOR_ENROLLED",
      expectOperatorEnrolled: false,
      instanceAuthorizationStatuses: { "inst:paystack-gh-1": "ACTIVE" },
    });
    expect(verdict.verdict).toBe("SIGNATURE_INVALID");
  });

  it("an EXPIRED offer is refused even with a valid signature", () => {
    const keys = generateFixtureKeyPair();
    const offer = signedOffer(keys);
    const verdict = verifyNodeCapabilityOffer({
      offer,
      now: "2026-11-05T00:00:00Z",
      nodePublicKeyPem: keys.publicPem,
      nodeRevoked: false,
      nodeEnrollmentMode: "OPERATOR_ENROLLED",
      expectOperatorEnrolled: false,
      instanceAuthorizationStatuses: { "inst:paystack-gh-1": "ACTIVE" },
    });
    expect(verdict.verdict).toBe("OFFER_EXPIRED");
    expect(verdict.reasons.map((reason) => reason.code)).toContain("OFFER_EXPIRED");
  });

  it("a future-dated freshness stamp is refused (NOT_YET_OPEN)", () => {
    const keys = generateFixtureKeyPair();
    const offer = signNodeCapabilityOffer({
      draft: offerDraft({
        issuedAt: "2026-11-03T12:00:00Z",
        constraints: {
          ...offerDraft().constraints,
          availabilityWindow: { opensAt: "2026-11-03T18:00:00Z", closesAt: "2026-11-04T00:00:00Z" },
        },
      }),
      privateKeyPem: keys.privatePem,
    });
    const verdict = verifyNodeCapabilityOffer({
      offer,
      now: "2026-11-03T12:00:00Z",
      nodePublicKeyPem: keys.publicPem,
      nodeRevoked: false,
      nodeEnrollmentMode: "OPERATOR_ENROLLED",
      expectOperatorEnrolled: false,
      instanceAuthorizationStatuses: { "inst:paystack-gh-1": "ACTIVE" },
    });
    expect(verdict.verdict).toBe("OFFER_NOT_YET_OPEN");
  });

  it("a REVOKED node's offer is refused even with a valid signature", () => {
    const keys = generateFixtureKeyPair();
    const offer = signedOffer(keys);
    const verdict = verifyNodeCapabilityOffer({
      offer,
      now: "2026-11-03T12:00:00Z",
      nodePublicKeyPem: keys.publicPem,
      nodeRevoked: true,
      nodeEnrollmentMode: "OPERATOR_ENROLLED",
      expectOperatorEnrolled: false,
      instanceAuthorizationStatuses: { "inst:paystack-gh-1": "ACTIVE" },
    });
    expect(verdict.verdict).toBe("NODE_REVOKED");
  });

  it("a FIXTURE node's offer is refused when the caller expects operator enrollment (the D11 gate)", () => {
    const keys = generateFixtureKeyPair();
    const offer = signedOffer(keys);
    const verdict = verifyNodeCapabilityOffer({
      offer,
      now: "2026-11-03T12:00:00Z",
      nodePublicKeyPem: keys.publicPem,
      nodeRevoked: false,
      nodeEnrollmentMode: "FIXTURE",
      expectOperatorEnrolled: true,
      instanceAuthorizationStatuses: { "inst:paystack-gh-1": "ACTIVE" },
    });
    expect(verdict.verdict).toBe("FIXTURE_NODE");
  });

  it("a bound instance that is not ACTIVE in the ACCEPTING authority's evidence is refused (D5/INV-13)", () => {
    const keys = generateFixtureKeyPair();
    const offer = signedOffer(keys);
    for (const status of ["PENDING", "REVOKED", "EXPIRED", "UNKNOWN", undefined]) {
      const verdict = verifyNodeCapabilityOffer({
        offer,
        now: "2026-11-03T12:00:00Z",
        nodePublicKeyPem: keys.publicPem,
        nodeRevoked: false,
        nodeEnrollmentMode: "OPERATOR_ENROLLED",
        expectOperatorEnrolled: false,
        instanceAuthorizationStatuses:
          status === undefined ? {} : { "inst:paystack-gh-1": status },
      });
      expect(verdict.verdict).toBe("INSTANCE_NOT_ACTIVE");
      expect(verdict.reasons.length).toBeGreaterThan(0);
    }
  });

  it("EVERY failure is retained (never just the first)", () => {
    const keys = generateFixtureKeyPair();
    const offer = signedOffer(keys);
    const verdict = verifyNodeCapabilityOffer({
      offer,
      now: "2026-11-05T00:00:00Z",
      nodePublicKeyPem: keys.publicPem,
      nodeRevoked: true,
      nodeEnrollmentMode: "FIXTURE",
      expectOperatorEnrolled: true,
      instanceAuthorizationStatuses: {},
    });
    // the signature is valid here (matching key) — the most fundamental
    // present failure is the revocation
    expect(verdict.verdict).toBe("NODE_REVOKED");
    expect(verdict.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["NODE_REVOKED", "FIXTURE_NODE", "OFFER_EXPIRED", "INSTANCE_NOT_ACTIVE"]),
    );
  });

  it("a malformed offer is a typed verdict at the seam (never a throw)", () => {
    const keys = generateFixtureKeyPair();
    const verdict = verifyNodeCapabilityOffer({
      offer: { garbage: true },
      now: "2026-11-03T12:00:00Z",
      nodePublicKeyPem: keys.publicPem,
      nodeRevoked: false,
      nodeEnrollmentMode: "OPERATOR_ENROLLED",
      expectOperatorEnrolled: false,
      instanceAuthorizationStatuses: {},
    });
    expect(verdict.verdict).toBe("MALFORMED_OFFER");
  });

  it("an ambient verification instant is refused (caller-supplied time only)", () => {
    const keys = generateFixtureKeyPair();
    expect(() =>
      verifyNodeCapabilityOffer({
        offer: signedOffer(keys),
        now: "not-a-timestamp",
        nodePublicKeyPem: keys.publicPem,
        nodeRevoked: false,
        nodeEnrollmentMode: "OPERATOR_ENROLLED",
        expectOperatorEnrolled: false,
        instanceAuthorizationStatuses: {},
      }),
    ).toThrow(NodeOfferError);
  });
});

describe("offer constraint validation (fail closed)", () => {
  it("rejects a limit-less offer (at least one bound required)", () => {
    expect(() =>
      validateNodeOfferConstraints({ ...offerDraft().constraints, amountLimits: {} }),
    ).toThrow(/at least one bound/);
  });

  it("rejects an inverted amount range", () => {
    expect(() =>
      validateNodeOfferConstraints({
        ...offerDraft().constraints,
        amountLimits: {
          min: { currency: "GHS", minorUnits: "500" },
          max: { currency: "GHS", minorUnits: "100" },
        },
      }),
    ).toThrow(/not be below/);
  });

  it("rejects a purpose outside the closed §5 vocabulary", () => {
    expect(() =>
      validateNodeOfferConstraints({
        ...offerDraft().constraints,
        purposes: ["MISC_VALUE_TRANSFER"],
      }),
    ).toThrow(/closed transaction-class vocabulary/);
  });

  it("rejects an inverted availability window and a non-expiring offer", () => {
    expect(() =>
      validateNodeOfferConstraints({
        ...offerDraft().constraints,
        availabilityWindow: { opensAt: "2026-11-04T00:00:00Z", closesAt: "2026-11-03T00:00:00Z" },
      }),
    ).toThrow(/strictly after/);
    expect(() =>
      validateNodeOfferConstraints({
        ...offerDraft().constraints,
        availabilityWindow: { opensAt: "2026-11-03T00:00:00Z", closesAt: "2026-11-03T00:00:00Z" },
      }),
    ).toThrow(/strictly after/);
  });

  it("rejects an offer bound to no instance (offers bind to REAL instances — D5)", () => {
    expect(() => signNodeCapabilityOffer({
      draft: offerDraft({ boundInstanceIds: [] }),
      privateKeyPem: generateFixtureKeyPair().privatePem,
    })).toThrow(/bound to REAL connected instances/);
  });
});
