/**
 * @payswap/node-network — SIGNED EXPIRING REVOCABLE capability offers
 * (P27-D, ADR-0020 D5).
 *
 * A node publishes capability offers that are: bound to ACTIVE provider
 * connected instances (probe-verified, INV-13 — revalidated by the
 * ACCEPTING authority against its OWN provider evidence); constrained by
 * current countries/currencies/methods/amount limits/purposes/KYC
 * requirements/availability windows; freshness-stamped, SIGNED, EXPIRING
 * and REVOCABLE; and explicit about custody.
 *
 * A peer's signature proves the offer's INTEGRITY and FRESHENESS — never
 * the underlying account's entitlement (§6: "signed and fresh is
 * necessary, provider-evidenced is decisive"). This module's verification
 * is the necessary part; the decisive part is the capability-plane
 * admission chain (capability/src/node-offer.ts) and the route-planning
 * eligibility gates.
 *
 * Machinery: node:crypto Ed25519 (sign/verify); caller-supplied `now`
 * (ISO-8601 UTC, parsed deterministically — never an ambient clock); the
 * registry revocation fact arrives as DATA from the caller.
 */

import { createPrivateKey, sign as edSign } from "node:crypto";
import { NodeOfferError } from "./errors.ts";
import {
  LIMITS,
  canonicalJsonStringify,
  deepFreeze,
  isNonEmptyString,
  isRecord,
  parseStrictIsoUtcToEpochMs,
  requireBoundedString,
  requireCurrencyCode,
  requireIsoUtcTimestamp,
  requirePositiveIntegerString,
} from "./canonical.ts";
import { isTransactionClass } from "./classification.ts";
import type { TransactionClass } from "./classification.ts";
import type { NodeRole } from "./enrollment.ts";

/** The offer vocabulary version. */
export const NODE_OFFER_VERSION = "1.0.0" as const;

/** The offer's constraints (D5: countries/currencies/methods/limits/purposes/KYC/window). */
export interface NodeOfferConstraints {
  readonly sourceCountries: readonly string[];
  readonly destinationCountries: readonly string[];
  readonly currencies: readonly string[];
  readonly fundingMethods: readonly string[];
  readonly payoutMethods: readonly string[];
  readonly amountLimits: {
    readonly min?: { readonly currency: string; readonly minorUnits: string };
    readonly max?: { readonly currency: string; readonly minorUnits: string };
  };
  /** The transaction classes the node will carry (the §5 vocabulary). */
  readonly purposes: readonly TransactionClass[];
  readonly kycRequired: boolean;
  readonly availabilityWindow: { readonly opensAt: string; readonly closesAt: string };
}

/** The unsigned offer draft (everything the signature covers). */
export interface NodeCapabilityOfferDraft {
  readonly offerVersion: string;
  readonly offerId: string;
  readonly nodeId: string;
  /** The REAL connected instances this offer is bound to (D5/INV-13). */
  readonly boundInstanceIds: readonly string[];
  readonly constraints: NodeOfferConstraints;
  /** The custody role the node takes on this offer's legs (explicit, D8). */
  readonly custodyRole: NodeRole;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** The signed offer (the draft + the Ed25519 signature over the canonical payload). */
export interface NodeCapabilityOffer extends NodeCapabilityOfferDraft {
  readonly signature: string;
}

/** The canonical signed payload (everything but the signature). */
export function canonicalOfferPayload(draft: NodeCapabilityOfferDraft): string {
  return canonicalJsonStringify(draft);
}

function validateCountries(candidate: unknown, subject: string): readonly string[] {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    throw new NodeOfferError(`${subject} must be a non-empty array of country codes`);
  }
  return Object.freeze(
    candidate.map((code) => {
      if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code)) {
        throw new NodeOfferError(`${subject} entries must be two-letter country codes`);
      }
      return code;
    }),
  );
}

function validateMethods(candidate: unknown, subject: string): readonly string[] {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    throw new NodeOfferError(`${subject} must be a non-empty array of method literals`);
  }
  return Object.freeze(
    candidate.map((method) => requireBoundedString(method, `${subject} entry`, LIMITS.refMaxLength)),
  );
}

/** Fail-closed validation of the offer's constraint set. */
export function validateNodeOfferConstraints(candidate: unknown): NodeOfferConstraints {
  const record = isRecord(candidate) ? candidate : null;
  if (record === null) {
    throw new NodeOfferError("offer.constraints must be an object");
  }
  const amountLimits = record["amountLimits"];
  if (!isRecord(amountLimits)) {
    throw new NodeOfferError("offer.constraints.amountLimits must be an object");
  }
  const min = amountLimits["min"];
  const max = amountLimits["max"];
  if (min === undefined && max === undefined) {
    throw new NodeOfferError(
      "offer.constraints.amountLimits must carry at least one bound (a limit-less offer is unconstructible)",
    );
  }
  for (const bound of [min, max]) {
    if (bound !== undefined) {
      if (!isRecord(bound)) {
        throw new NodeOfferError("offer.constraints.amountLimits bounds must be objects");
      }
      requireCurrencyCode(bound["currency"], "amountLimits bound currency");
      requirePositiveIntegerString(bound["minorUnits"], "amountLimits bound minorUnits");
    }
  }
  if (
    isRecord(min) &&
    isRecord(max) &&
    BigInt(String(max["minorUnits"])) < BigInt(String(min["minorUnits"]))
  ) {
    throw new NodeOfferError("amountLimits.max must not be below amountLimits.min");
  }
  const purposes = record["purposes"];
  if (!Array.isArray(purposes) || purposes.length === 0) {
    throw new NodeOfferError(
      "offer.constraints.purposes must be a non-empty array of the classes the node will carry",
    );
  }
  if (purposes.length > LIMITS.maxOfferPurposeEntries) {
    throw new NodeOfferError(
      `offer.constraints.purposes must carry at most ${LIMITS.maxOfferPurposeEntries} entries`,
    );
  }
  for (const purpose of purposes) {
    if (!isTransactionClass(purpose)) {
      throw new NodeOfferError(
        "offer.constraints.purposes entries must be members of the closed transaction-class vocabulary (the §5 table)",
      );
    }
  }
  const window = record["availabilityWindow"];
  if (
    !isRecord(window) ||
    typeof window["opensAt"] !== "string" ||
    typeof window["closesAt"] !== "string"
  ) {
    throw new NodeOfferError(
      "offer.constraints.availabilityWindow must carry opensAt and closesAt (ISO-8601 UTC)",
    );
  }
  const opensAt = requireIsoUtcTimestamp(window["opensAt"], "availabilityWindow.opensAt");
  const closesAt = requireIsoUtcTimestamp(window["closesAt"], "availabilityWindow.closesAt");
  const opensEpoch = parseStrictIsoUtcToEpochMs(opensAt);
  const closesEpoch = parseStrictIsoUtcToEpochMs(closesAt);
  if (opensEpoch === null || closesEpoch === null || closesEpoch <= opensEpoch) {
    throw new NodeOfferError(
      "availabilityWindow.closesAt must be a valid instant strictly after opensAt",
    );
  }
  return deepFreeze({
    sourceCountries: validateCountries(record["sourceCountries"], "constraints.sourceCountries"),
    destinationCountries: validateCountries(
      record["destinationCountries"],
      "constraints.destinationCountries",
    ),
    currencies: Object.freeze(
      (Array.isArray(record["currencies"]) ? record["currencies"] : []).map((code) =>
        requireCurrencyCode(code, "constraints.currencies entry"),
      ),
    ),
    fundingMethods: validateMethods(record["fundingMethods"], "constraints.fundingMethods"),
    payoutMethods: validateMethods(record["payoutMethods"], "constraints.payoutMethods"),
    amountLimits: deepFreeze({
      ...(isRecord(min)
        ? {
            min: deepFreeze({
              currency: min["currency"] as string,
              minorUnits: min["minorUnits"] as string,
            }),
          }
        : {}),
      ...(isRecord(max)
        ? {
            max: deepFreeze({
              currency: max["currency"] as string,
              minorUnits: max["minorUnits"] as string,
            }),
          }
        : {}),
    }),
    purposes: Object.freeze([...(purposes as readonly TransactionClass[])]),
    kycRequired: record["kycRequired"] === true,
    availabilityWindow: deepFreeze({ opensAt, closesAt }),
  });
}

/**
 * Sign an offer draft with the node's Ed25519 private key. The signature
 * covers the ENTIRE canonical draft (version, id, node, instances,
 * constraints, custody role, issuedAt, expiresAt) — tampering with any
 * field invalidates it.
 */
export function signNodeCapabilityOffer(input: {
  readonly draft: NodeCapabilityOfferDraft;
  readonly privateKeyPem: string;
}): NodeCapabilityOffer {
  const draft = validateOfferDraft(input.draft);
  const privateKey = createPrivateKey(input.privateKeyPem);
  const signature = edSign(
    null,
    Buffer.from(canonicalOfferPayload(draft), "utf8"),
    privateKey,
  );
  return deepFreeze({ ...draft, signature: signature.toString("base64") });
}

/** Fail-closed validation of an offer draft (the unsigned shape). */
export function validateOfferDraft(candidate: unknown): NodeCapabilityOfferDraft {
  const record = isRecord(candidate) ? candidate : null;
  if (record === null) {
    throw new NodeOfferError("a node capability offer draft must be an object");
  }
  if (record["offerVersion"] !== NODE_OFFER_VERSION) {
    throw new NodeOfferError(
      `offer.offerVersion must be '${NODE_OFFER_VERSION}' (stale or foreign input is refused)`,
    );
  }
  const offerId = requireBoundedString(record["offerId"], "offer.offerId", LIMITS.refMaxLength);
  const nodeId = requireBoundedString(record["nodeId"], "offer.nodeId", LIMITS.refMaxLength);
  const boundInstanceIds = record["boundInstanceIds"];
  if (
    !Array.isArray(boundInstanceIds) ||
    boundInstanceIds.length === 0 ||
    boundInstanceIds.some((id) => !isNonEmptyString(id))
  ) {
    throw new NodeOfferError(
      "offer.boundInstanceIds must be a non-empty array — an offer is bound to REAL connected instances (D5)",
    );
  }
  if (boundInstanceIds.length > LIMITS.maxInstanceBindings) {
    throw new NodeOfferError(
      `offer.boundInstanceIds must carry at most ${LIMITS.maxInstanceBindings} instances`,
    );
  }
  const custodyRole = record["custodyRole"];
  if (
    typeof custodyRole !== "string" ||
    ![
      "TECHNICAL_ROUTER",
      "PAYMENT_FACILITATOR",
      "MERCHANT_OF_RECORD",
      "CUSTODIAN",
      "AGENT",
      "PAYOUT_ORIGINATOR",
      "REGULATED_PAYMENT_INSTITUTION",
    ].includes(custodyRole)
  ) {
    throw new NodeOfferError(
      "offer.custodyRole must be a member of the explicit role vocabulary (custody is explicit, D8)",
    );
  }
  const issuedAt = requireIsoUtcTimestamp(record["issuedAt"], "offer.issuedAt");
  const expiresAt = requireIsoUtcTimestamp(record["expiresAt"], "offer.expiresAt");
  const issuedEpoch = parseStrictIsoUtcToEpochMs(issuedAt);
  const expiresEpoch = parseStrictIsoUtcToEpochMs(expiresAt);
  if (issuedEpoch === null || expiresEpoch === null || expiresEpoch <= issuedEpoch) {
    throw new NodeOfferError(
      "offer.expiresAt must be a valid instant strictly after issuedAt (an offer must expire)",
    );
  }
  return deepFreeze({
    offerVersion: NODE_OFFER_VERSION,
    offerId,
    nodeId,
    boundInstanceIds: Object.freeze([...(boundInstanceIds as readonly string[])]),
    constraints: validateNodeOfferConstraints(record["constraints"]),
    custodyRole: custodyRole as NodeRole,
    issuedAt,
    expiresAt,
  });
}

/** Fail-closed validation of a SIGNED offer (a missing signature is refused). */
export function validateNodeCapabilityOffer(candidate: unknown): NodeCapabilityOffer {
  const record = isRecord(candidate) ? candidate : null;
  if (record === null) {
    throw new NodeOfferError("a node capability offer must be an object");
  }
  if (!isNonEmptyString(record["signature"])) {
    throw new NodeOfferError(
      "offer.signature must be present — an UNSIGNED offer contributes nothing (D5: signed is necessary)",
    );
  }
  return deepFreeze({
    ...validateOfferDraft(record),
    signature: record["signature"] as string,
  });
}

