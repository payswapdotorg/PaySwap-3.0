import { generateKeyPairSync } from "node:crypto";
import { NODE_ENROLLMENT_VERSION, type NodeEnrollmentRecord } from "../src/index.ts";

/**
 * Hermetic test fixtures for the node-network battery. EVERYTHING here is
 * a FIXTURE by construction (the D11 law): enrollments are marked
 * enrollmentMode "FIXTURE", keys are generated in-test (never shipped),
 * and nothing in this file is promotable to an operator enrollment.
 */

export interface FixtureKeyPair {
  readonly publicPem: string;
  readonly privatePem: string;
}

export function generateFixtureKeyPair(): FixtureKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** A clearly-marked FIXTURE enrollment bound to a real-shaped instance binding. */
export function fixtureEnrollment(overrides: Record<string, unknown> = {}): NodeEnrollmentRecord {
  return {
    enrollmentVersion: NODE_ENROLLMENT_VERSION,
    nodeId: "node:fixture-gh-1",
    enrollmentMode: "FIXTURE",
    principal: {
      legalName: "Fixture Ghana Router Ltd",
      registrationRefs: ["reg:GH-000000"],
      jurisdiction: "GH",
    },
    jurisdiction: "GH",
    roles: ["TECHNICAL_ROUTER"],
    instanceBindings: [
      { instanceId: "inst:paystack-gh-1", providerName: "paystack", authorizationStatus: "ACTIVE" },
    ],
    custody: { takesCustody: false, licenceProgrammeRefs: [] },
    enrolledAt: "2026-11-03T00:00:00Z",
    nodePublicKeyPem: "-----BEGIN PUBLIC KEY-----FIXTURE-----END PUBLIC KEY-----",
    enrollmentEvidenceRefs: ["evidence:fixture-1"],
    ...overrides,
  } as NodeEnrollmentRecord;
}

/** A fixture enrollment that is OPERATOR_ENROLLED (for the honest-path tests). */
export function fixtureOperatorEnrollment(
  overrides: Record<string, unknown> = {},
): NodeEnrollmentRecord {
  return fixtureEnrollment({
    enrollmentMode: "OPERATOR_ENROLLED",
    ...overrides,
  });
}
