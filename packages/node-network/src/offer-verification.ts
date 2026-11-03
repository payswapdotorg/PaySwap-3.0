/**
 * @payswap/node-network — offer VERIFICATION (P27-D, ADR-0020 D5).
 *
 * The verification half of the signed-offer law, split from offer.ts
 * under the 400-line file law: signature (Ed25519 over the canonical
 * payload), expiry and freshness window (caller-supplied `now`, parsed
 * deterministically — never an ambient clock), node revocation (the
 * caller's registry fact as DATA), the D11 operator-enrollment gate, and
 * the bound instances' ACTIVE status against the ACCEPTING authority's
 * OWN provider evidence. A verified offer admits a route CANDIDATE —
 * never an entitlement (INV-13; §6: "signed and fresh is necessary,
 * provider-evidenced is decisive").
 */

import { createPublicKey, verify as edVerify } from "node:crypto";
import { NodeOfferError } from "./errors.ts";
import { deepFreeze, parseStrictIsoUtcToEpochMs } from "./canonical.ts";
import {
  canonicalOfferPayload,
  validateNodeCapabilityOffer,
  type NodeCapabilityOffer,
  type NodeCapabilityOfferDraft,
} from "./offer.ts";

/** The offer verification verdict vocabulary (fail-closed; every reason retained). */
export const OFFER_VERIFICATION_VERDICTS = Object.freeze([
  "VERIFIED",
  "MALFORMED_OFFER",
  "SIGNATURE_INVALID",
  "NODE_REVOKED",
  "FIXTURE_NODE",
  "OFFER_EXPIRED",
  "OFFER_NOT_YET_OPEN",
  "INSTANCE_NOT_ACTIVE",
] as const);

export type OfferVerificationVerdict = (typeof OFFER_VERIFICATION_VERDICTS)[number];

export interface OfferVerification {
  readonly verdict: OfferVerificationVerdict;
  readonly offerId: string;
  readonly nodeId: string;
  /** Every failure found (never just the first — the every-reason law). */
  readonly reasons: readonly { readonly code: OfferVerificationVerdict; readonly message: string }[];
  /** LITERAL: a verified offer admits a CANDIDATE, never an entitlement. */
  readonly verifiedOfferAdmitsExecution: false;
}

/**
 * Verify a signed offer: signature (Ed25519 over the canonical payload),
 * expiry and freshness window (caller-supplied `now`), node revocation
 * (the caller's registry fact), operator enrollment (the D11 gate when
 * `expectOperatorEnrolled` — the production admission path always passes
 * true), and the bound instances' ACTIVE status (the caller's OWN
 * provider evidence — D5: the accepting authority revalidates).
 */
export function verifyNodeCapabilityOffer(input: {
  readonly offer: unknown;
  readonly now: string;
  readonly nodePublicKeyPem: string;
  readonly nodeRevoked: boolean;
  readonly nodeEnrollmentMode: "OPERATOR_ENROLLED" | "FIXTURE";
  readonly expectOperatorEnrolled: boolean;
  readonly instanceAuthorizationStatuses: Readonly<Record<string, string>>;
}): OfferVerification {
  const nowEpoch = parseStrictIsoUtcToEpochMs(input.now);
  if (nowEpoch === null) {
    throw new NodeOfferError(
      "the verification instant must be a strict ISO-8601 UTC string (caller-supplied, never an ambient clock)",
    );
  }
  const reasons: { code: OfferVerificationVerdict; message: string }[] = [];
  let offer: NodeCapabilityOffer;
  try {
    offer = validateNodeCapabilityOffer(input.offer);
  } catch (error) {
    return deepFreeze({
      verdict: "MALFORMED_OFFER",
      offerId: "unknown",
      nodeId: "unknown",
      reasons: Object.freeze([
        { code: "MALFORMED_OFFER" as const, message: (error as Error).message },
      ]),
      verifiedOfferAdmitsExecution: false as const,
    });
  }
  const publicKey = createPublicKey(input.nodePublicKeyPem);
  // The signed payload is the DRAFT projection (every field the signature
  // covers) — the signature itself is obviously excluded.
  const draftProjection: NodeCapabilityOfferDraft = {
    offerVersion: offer.offerVersion,
    offerId: offer.offerId,
    nodeId: offer.nodeId,
    boundInstanceIds: offer.boundInstanceIds,
    constraints: offer.constraints,
    custodyRole: offer.custodyRole,
    issuedAt: offer.issuedAt,
    expiresAt: offer.expiresAt,
  };
  const signatureOk = edVerify(
    null,
    Buffer.from(canonicalOfferPayload(draftProjection), "utf8"),
    publicKey,
    Buffer.from(offer.signature, "base64"),
  );
  if (!signatureOk) {
    reasons.push({
      code: "SIGNATURE_INVALID",
      message: "the Ed25519 signature over the canonical offer payload did not verify (tampered or foreign key)",
    });
  }
  if (input.nodeRevoked) {
    reasons.push({
      code: "NODE_REVOKED",
      message: "the publishing node is revoked — a revoked node's offers contribute nothing",
    });
  }
  if (input.expectOperatorEnrolled && input.nodeEnrollmentMode !== "OPERATOR_ENROLLED") {
    reasons.push({
      code: "FIXTURE_NODE",
      message: "the publishing node is enrolled as a FIXTURE and can never be promoted (ADR-0020 D11)",
    });
  }
  const expiresEpoch = parseStrictIsoUtcToEpochMs(offer.expiresAt);
  const opensEpoch = parseStrictIsoUtcToEpochMs(
    offer.constraints.availabilityWindow.opensAt,
  );
  const issuedEpoch = parseStrictIsoUtcToEpochMs(offer.issuedAt);
  if (expiresEpoch !== null && nowEpoch >= expiresEpoch) {
    reasons.push({
      code: "OFFER_EXPIRED",
      message: `the offer expired at ${offer.expiresAt} (evaluation instant ${input.now}) — an expired offer contributes nothing`,
    });
  }
  if (opensEpoch !== null && nowEpoch < opensEpoch) {
    reasons.push({
      code: "OFFER_NOT_YET_OPEN",
      message: `the offer's availability window opens at ${offer.constraints.availabilityWindow.opensAt} (evaluation instant ${input.now})`,
    });
  }
  if (issuedEpoch !== null && nowEpoch < issuedEpoch) {
    reasons.push({
      code: "OFFER_NOT_YET_OPEN",
      message: `the offer is stamped issued in the future (${offer.issuedAt}) — a future-dated freshness stamp is refused`,
    });
  }
  for (const instanceId of offer.boundInstanceIds) {
    const status = input.instanceAuthorizationStatuses[instanceId];
    if (status !== "ACTIVE") {
      reasons.push({
        code: "INSTANCE_NOT_ACTIVE",
        message: `bound instance '${instanceId}' is '${String(status)}' in the ACCEPTING authority's own provider evidence — an offer without an ACTIVE local instance is a discovery input only, never a rail (D5/INV-13)`,
      });
    }
  }
  const verdictOrder: OfferVerificationVerdict[] = [
    "MALFORMED_OFFER",
    "SIGNATURE_INVALID",
    "NODE_REVOKED",
    "FIXTURE_NODE",
    "OFFER_EXPIRED",
    "OFFER_NOT_YET_OPEN",
    "INSTANCE_NOT_ACTIVE",
  ];
  const verdict =
    reasons.length === 0
      ? ("VERIFIED" as const)
      : (verdictOrder.find((code) => reasons.some((reason) => reason.code === code)) as OfferVerificationVerdict);
  return deepFreeze({
    verdict,
    offerId: offer.offerId,
    nodeId: offer.nodeId,
    reasons: Object.freeze(reasons),
    verifiedOfferAdmitsExecution: false as const,
  });
}
