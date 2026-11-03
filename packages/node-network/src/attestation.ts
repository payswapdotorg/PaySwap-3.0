/**
 * @payswap/node-network — signed node attestation (P27-D, ADR-0020 D5/D8).
 *
 * The enrollment ATTESTATION: the node's Ed25519 key signs the canonical
 * enrollment facts (principal, jurisdiction, roles, custody licence
 * evidence, instance bindings). A peer's attestation proves the INTEGRITY
 * of the enrollment facts it presents — it NEVER proves the underlying
 * account's entitlement (the accepting authority revalidates everything
 * against its own provider evidence — D5; capability/src/node-offer.ts).
 *
 * Signature machinery: node:crypto Ed25519 (sign/verify) with a
 * CONSTANT-TIME digest comparison for the enrollment-digest binding.
 * Caller-supplied time everywhere (no ambient clock).
 */

import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, timingSafeEqual } from "node:crypto";
import { NodeAttestationError } from "./errors.ts";
import {
  LIMITS,
  canonicalJsonStringify,
  contentDigest,
  deepFreeze,
  isNonEmptyString,
  isRecord,
  requireBoundedString,
  requireIsoUtcTimestamp,
} from "./canonical.ts";
import type { NodeEnrollmentRecord, NodeRole } from "./enrollment.ts";

/** The attestation vocabulary version. */
export const NODE_ATTESTATION_VERSION = "1.0.0" as const;

/** The attested-facts subset the node key signs (the accountability core). */
export interface AttestedNodeFacts {
  readonly legalName: string;
  readonly jurisdiction: string;
  readonly roles: readonly NodeRole[];
  readonly takesCustody: boolean;
  readonly custodyLicenceRefs: readonly string[];
  readonly boundInstanceIds: readonly string[];
}

/** The signed node attestation over an enrollment's accountability core. */
export interface NodeAttestation {
  readonly attestationVersion: string;
  readonly nodeId: string;
  /** contentDigest of the FULL validated enrollment record (the binding). */
  readonly enrollmentDigest: string;
  readonly attestedFacts: AttestedNodeFacts;
  readonly signedAt: string;
  /** base64 Ed25519 signature over the canonical attestation payload. */
  readonly signature: string;
}

/** The canonical signed payload (everything but the signature itself). */
function attestationPayload(input: {
  attestationVersion: string;
  nodeId: string;
  enrollmentDigest: string;
  attestedFacts: AttestedNodeFacts;
  signedAt: string;
}): string {
  return canonicalJsonStringify(input);
}

/** The attested-facts projection of a validated enrollment record. */
export function attestedFactsOf(record: NodeEnrollmentRecord): AttestedNodeFacts {
  return deepFreeze({
    legalName: record.principal.legalName,
    jurisdiction: record.jurisdiction,
    roles: record.roles,
    takesCustody: record.custody.takesCustody,
    custodyLicenceRefs: record.custody.licenceProgrammeRefs,
    boundInstanceIds: record.instanceBindings.map((binding) => binding.instanceId),
  });
}

/**
 * Sign an enrollment's accountability core with the node's Ed25519
 * PRIVATE key (a KeyObject or PEM string — the key never leaves the
 * caller; only the signature is recorded).
 */
export function signNodeAttestation(input: {
  readonly enrollment: NodeEnrollmentRecord;
  readonly privateKeyPem: string;
  readonly signedAt: string;
}): NodeAttestation {
  const enrollment = input.enrollment;
  const signedAt = requireIsoUtcTimestamp(input.signedAt, "attestation.signedAt");
  const privateKey = createPrivateKey(input.privateKeyPem);
  const unsigned = {
    attestationVersion: NODE_ATTESTATION_VERSION,
    nodeId: enrollment.nodeId,
    enrollmentDigest: contentDigest(enrollment),
    attestedFacts: attestedFactsOf(enrollment),
    signedAt,
  };
  const signature = edSign(null, Buffer.from(attestationPayload(unsigned), "utf8"), privateKey);
  return deepFreeze({
    ...unsigned,
    signature: signature.toString("base64"),
  });
}

/**
 * CONSTANT-TIME equality over two digest strings (the enrollment-digest
 * binding check; equal-length assumption guarded — length itself is not
 * secret here, both sides being canonical hex digests).
 */
export function constantTimeDigestEquals(left: string, right: string): boolean {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/** The attestation verification verdict vocabulary (fail-closed). */
export const ATTESTATION_VERDICTS = Object.freeze([
  "VERIFIED",
  "SIGNATURE_INVALID",
  "ENROLLMENT_DIGEST_MISMATCH",
  "NODE_ID_MISMATCH",
  "MALFORMED_ATTESTATION",
] as const);

export type AttestationVerdict = (typeof ATTESTATION_VERDICTS)[number];

export interface AttestationVerification {
  readonly verdict: AttestationVerdict;
  readonly nodeId: string;
  readonly message: string;
}

/** Structural validation of an attestation (fail closed, never a repair). */
export function validateNodeAttestation(candidate: unknown): NodeAttestation {
  const record = isRecord(candidate) ? candidate : null;
  if (record === null) {
    throw new NodeAttestationError("a node attestation must be an object");
  }
  if (record["attestationVersion"] !== NODE_ATTESTATION_VERSION) {
    throw new NodeAttestationError(
      `attestation.attestationVersion must be '${NODE_ATTESTATION_VERSION}'`,
    );
  }
  const nodeId = requireBoundedString(record["nodeId"], "attestation.nodeId", LIMITS.refMaxLength);
  const enrollmentDigest = requireBoundedString(
    record["enrollmentDigest"],
    "attestation.enrollmentDigest",
    LIMITS.refMaxLength,
  );
  const facts = record["attestedFacts"];
  if (
    !isRecord(facts) ||
    !isNonEmptyString(facts["legalName"]) ||
    !isNonEmptyString(facts["jurisdiction"]) ||
    !Array.isArray(facts["roles"]) ||
    typeof facts["takesCustody"] !== "boolean" ||
    !Array.isArray(facts["custodyLicenceRefs"]) ||
    !Array.isArray(facts["boundInstanceIds"])
  ) {
    throw new NodeAttestationError(
      "attestation.attestedFacts must carry the accountability core (name, jurisdiction, roles, custody, licences, instances)",
    );
  }
  const signedAt = requireIsoUtcTimestamp(record["signedAt"], "attestation.signedAt");
  const signature = record["signature"];
  if (!isNonEmptyString(signature)) {
    throw new NodeAttestationError(
      "attestation.signature must be present — an unsigned attestation contributes nothing",
    );
  }
  return deepFreeze({
    attestationVersion: NODE_ATTESTATION_VERSION,
    nodeId,
    enrollmentDigest,
    attestedFacts: deepFreeze({
      legalName: facts["legalName"] as string,
      jurisdiction: facts["jurisdiction"] as string,
      roles: Object.freeze([...(facts["roles"] as readonly NodeRole[])]),
      takesCustody: facts["takesCustody"] as boolean,
      custodyLicenceRefs: Object.freeze([...(facts["custodyLicenceRefs"] as readonly string[])]),
      boundInstanceIds: Object.freeze([...(facts["boundInstanceIds"] as readonly string[])]),
    }),
    signedAt,
    signature,
  });
}

/**
 * Verify an attestation against the presented enrollment and the node's
 * public key: Ed25519 signature over the canonical payload, the
 * enrollment digest binding (CONSTANT-TIME comparison), and the node id
 * binding. A failed check is a typed verdict — never an exception, never
 * a partial pass (an attestation that fails contributes nothing).
 */
export function verifyNodeAttestation(input: {
  readonly attestation: unknown;
  readonly enrollment: NodeEnrollmentRecord;
  readonly nodePublicKeyPem: string;
}): AttestationVerification {
  let attestation: NodeAttestation;
  try {
    attestation = validateNodeAttestation(input.attestation);
  } catch (error) {
    return deepFreeze({
      verdict: "MALFORMED_ATTESTATION",
      nodeId: "unknown",
      message: `the attestation failed structural validation: ${(error as Error).message}`,
    });
  }
  if (attestation.nodeId !== input.enrollment.nodeId) {
    return deepFreeze({
      verdict: "NODE_ID_MISMATCH",
      nodeId: attestation.nodeId,
      message: `the attestation names node '${attestation.nodeId}' but the enrollment presents '${input.enrollment.nodeId}'`,
    });
  }
  const expectedDigest = contentDigest(input.enrollment);
  if (!constantTimeDigestEquals(attestation.enrollmentDigest, expectedDigest)) {
    return deepFreeze({
      verdict: "ENROLLMENT_DIGEST_MISMATCH",
      nodeId: attestation.nodeId,
      message: "the attestation's enrollment digest does not bind the presented enrollment record",
    });
  }
  const publicKey = createPublicKey(input.nodePublicKeyPem);
  const payload = attestationPayload({
    attestationVersion: attestation.attestationVersion,
    nodeId: attestation.nodeId,
    enrollmentDigest: attestation.enrollmentDigest,
    attestedFacts: attestation.attestedFacts,
    signedAt: attestation.signedAt,
  });
  const signatureOk = edVerify(
    null,
    Buffer.from(payload, "utf8"),
    publicKey,
    Buffer.from(attestation.signature, "base64"),
  );
  if (!signatureOk) {
    return deepFreeze({
      verdict: "SIGNATURE_INVALID",
      nodeId: attestation.nodeId,
      message: "the Ed25519 signature over the canonical attestation payload did not verify",
    });
  }
  return deepFreeze({
    verdict: "VERIFIED",
    nodeId: attestation.nodeId,
    message: "the attestation signature, enrollment digest binding and node identity all verified",
  });
}
