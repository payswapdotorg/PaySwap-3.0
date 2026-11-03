import { describe, expect, it } from "vitest";
import {
  constantTimeDigestEquals,
  signNodeAttestation,
  verifyNodeAttestation,
} from "../src/index.ts";
import { fixtureEnrollment, fixtureOperatorEnrollment, generateFixtureKeyPair } from "./fixtures.ts";

describe("the signed node attestation (ADR-0020 D5 — integrity, never entitlement)", () => {
  it("signs an enrollment's accountability core and verifies it against the node key", () => {
    const keys = generateFixtureKeyPair();
    const enrollment = fixtureOperatorEnrollment({ nodePublicKeyPem: keys.publicPem });
    const attestation = signNodeAttestation({
      enrollment,
      privateKeyPem: keys.privatePem,
      signedAt: "2026-11-03T01:00:00Z",
    });
    const verdict = verifyNodeAttestation({
      attestation,
      enrollment,
      nodePublicKeyPem: keys.publicPem,
    });
    expect(verdict.verdict).toBe("VERIFIED");
  });

  it("a tampered attestation (one attested fact changed) does not verify", () => {
    const keys = generateFixtureKeyPair();
    const enrollment = fixtureOperatorEnrollment({ nodePublicKeyPem: keys.publicPem });
    const attestation = signNodeAttestation({
      enrollment,
      privateKeyPem: keys.privatePem,
      signedAt: "2026-11-03T01:00:00Z",
    });
    const tampered = {
      ...attestation,
      attestedFacts: { ...attestation.attestedFacts, legalName: "Somebody Else Ltd" },
    };
    const verdict = verifyNodeAttestation({
      attestation: tampered,
      enrollment,
      nodePublicKeyPem: keys.publicPem,
    });
    expect(verdict.verdict).toBe("SIGNATURE_INVALID");
  });

  it("an attestation bound to a DIFFERENT enrollment is a digest mismatch (the binding law)", () => {
    const keys = generateFixtureKeyPair();
    const enrollment = fixtureOperatorEnrollment({ nodePublicKeyPem: keys.publicPem });
    const attestation = signNodeAttestation({
      enrollment,
      privateKeyPem: keys.privatePem,
      signedAt: "2026-11-03T01:00:00Z",
    });
    // same node id, DIFFERENT facts — the digest binding must catch it
    // (the node-id check alone would pass)
    const otherEnrollment = fixtureOperatorEnrollment({
      principal: {
        legalName: "A Different Principal Ltd",
        registrationRefs: ["reg:GH-999999"],
        jurisdiction: "GH",
      },
      nodePublicKeyPem: keys.publicPem,
    });
    const verdict = verifyNodeAttestation({
      attestation,
      enrollment: otherEnrollment,
      nodePublicKeyPem: keys.publicPem,
    });
    expect(verdict.verdict).toBe("ENROLLMENT_DIGEST_MISMATCH");
  });

  it("a foreign key does not verify (a peer's signature is not transferable)", () => {
    const nodeKeys = generateFixtureKeyPair();
    const otherKeys = generateFixtureKeyPair();
    const enrollment = fixtureOperatorEnrollment({ nodePublicKeyPem: nodeKeys.publicPem });
    const attestation = signNodeAttestation({
      enrollment,
      privateKeyPem: nodeKeys.privatePem,
      signedAt: "2026-11-03T01:00:00Z",
    });
    const verdict = verifyNodeAttestation({
      attestation,
      enrollment,
      nodePublicKeyPem: otherKeys.publicPem,
    });
    expect(verdict.verdict).toBe("SIGNATURE_INVALID");
  });

  it("a node-id mismatch is its own typed verdict", () => {
    const keys = generateFixtureKeyPair();
    const enrollment = fixtureOperatorEnrollment({ nodePublicKeyPem: keys.publicPem });
    const attestation = {
      ...signNodeAttestation({
        enrollment,
        privateKeyPem: keys.privatePem,
        signedAt: "2026-11-03T01:00:00Z",
      }),
      nodeId: "node:someone-else",
    };
    const verdict = verifyNodeAttestation({
      attestation,
      enrollment,
      nodePublicKeyPem: keys.publicPem,
    });
    expect(verdict.verdict).toBe("NODE_ID_MISMATCH");
  });

  it("a malformed attestation is a typed verdict, never an exception at the seam", () => {
    const keys = generateFixtureKeyPair();
    const enrollment = fixtureOperatorEnrollment({ nodePublicKeyPem: keys.publicPem });
    const verdict = verifyNodeAttestation({
      attestation: { nonsense: true },
      enrollment,
      nodePublicKeyPem: keys.publicPem,
    });
    expect(verdict.verdict).toBe("MALFORMED_ATTESTATION");
  });

  it("constantTimeDigestEquals is exact and length-guarded", () => {
    expect(constantTimeDigestEquals("fnv1a64:abc", "fnv1a64:abc")).toBe(true);
    expect(constantTimeDigestEquals("fnv1a64:abc", "fnv1a64:abd")).toBe(false);
    expect(constantTimeDigestEquals("short", "a-much-longer-digest")).toBe(false);
  });

  it("the attestation covers the D8 custody facts (a custodian attests its licences)", () => {
    const keys = generateFixtureKeyPair();
    const enrollment = fixtureOperatorEnrollment({
      nodePublicKeyPem: keys.publicPem,
      roles: ["CUSTODIAN"],
      custody: { takesCustody: true, licenceProgrammeRefs: ["licence:bof-2026"] },
    });
    const attestation = signNodeAttestation({
      enrollment,
      privateKeyPem: keys.privatePem,
      signedAt: "2026-11-03T01:00:00Z",
    });
    expect(attestation.attestedFacts.takesCustody).toBe(true);
    expect(attestation.attestedFacts.custodyLicenceRefs).toEqual(["licence:bof-2026"]);
    expect(
      verifyNodeAttestation({ attestation, enrollment, nodePublicKeyPem: keys.publicPem })
        .verdict,
    ).toBe("VERIFIED");
  });

  it("a fixture enrollment can still attest in tests (the fixture is clearly a fixture)", () => {
    const keys = generateFixtureKeyPair();
    const enrollment = fixtureEnrollment({ nodePublicKeyPem: keys.publicPem });
    const attestation = signNodeAttestation({
      enrollment,
      privateKeyPem: keys.privatePem,
      signedAt: "2026-11-03T01:00:00Z",
    });
    expect(
      verifyNodeAttestation({ attestation, enrollment, nodePublicKeyPem: keys.publicPem }).verdict,
    ).toBe("VERIFIED");
  });
});
