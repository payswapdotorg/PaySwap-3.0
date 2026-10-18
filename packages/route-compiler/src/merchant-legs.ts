/**
 * @payswap/route-compiler — the merchant-balance leg family (P5-W1).
 *
 * ADAPT of the old compiler's stripe-legs.ts (318 lines, MMI-19) onto
 * the provider-NEUTRAL merchant law: the old Stripe-specific contracts
 * (StripeCryptoSettlementEligibilityEvidence, Mode A/Mode B, the
 * P4-W1-003 awaiting authority) re-home as the provider-neutral
 * merchant-balance settlement family. The provider-verified-effects law
 * (old rule 30) is preserved VERBATIM:
 *
 * - the merchant settlement leg exists ONLY on provider-VERIFIED
 *   eligibility evidence (eligible: true and providerVerified: true are
 *   LITERAL types — ineligibility is surfaced as an honest exclusion,
 *   never as evidence);
 * - the native settlement (the provider executes the movement into the
 *   merchant balance under its own connection) is the BASELINE shape;
 * - the external route (value routed through the off-ramp family to
 *   the merchant's bank destination) carries the honest
 *   native-settlement-unavailable marker naming the awaiting authority
 *   — the merchant lane (P5-W3) owns the real integration;
 * - the settlement OBSERVATION family is three-valued (SUCCESS,
 *   FAILURE, OUTCOME_UNKNOWN with its reason — INV-X01).
 */

import { ValidationError } from "./errors.ts";
import { deepFreeze, isNonEmptyString, requireBoundedString, requireObject, LIMITS, type Fail } from "./canonical.ts";
import { epochMillisFromIso, isIsoUtcTimestamp } from "./canonical-time.ts";
import type { RouteLegBase } from "./leg-contracts.ts";
import type { CustodyParty } from "./custody.ts";

const fail: Fail = (message: string) => new ValidationError(message);

/** The merchant lane's integration authority (the honest awaiting marker). */
export const MERCHANT_SETTLEMENT_AUTHORITY = "P5-W3" as const;

/** The settlement-mode vocabulary (native baseline vs external route). */
export const MERCHANT_SETTLEMENT_MODES = Object.freeze([
  "NATIVE_MERCHANT_SETTLEMENT",
  "EXTERNAL_PAYSWAP_ROUTE",
] as const);

export type MerchantSettlementMode = (typeof MERCHANT_SETTLEMENT_MODES)[number];

/**
 * The verbatim handoff notice (the old mandated notice, neutralized):
 * the marker's `notice` is a LITERAL type so a Mode-B plan without the
 * honest marker is unrepresentable.
 */
export const MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE =
  "native merchant-balance settlement unavailable for this route" as const;

/** The provider-verified settlement eligibility evidence (rule 30 law). */
export interface MerchantSettlementEligibilityEvidence {
  readonly evidenceId: string;
  readonly providerName: string;
  readonly merchantAccountRef: string;
  readonly currency: string;
  /** LITERAL: ineligibility is an honest exclusion, never evidence. */
  readonly eligible: true;
  /** LITERAL: the provider-verified-effects law. */
  readonly providerVerified: true;
  /** Opaque reference to the provider-side verification artifact. */
  readonly verificationRef: string;
  readonly observedAt: string;
  readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
  /** Honest marker: the real integration awaits the merchant lane. */
  readonly awaitingAuthority: typeof MERCHANT_SETTLEMENT_AUTHORITY;
}

/** Fail-closed validation of the eligibility evidence (the rule-30 law). */
export function validateMerchantSettlementEligibility(
  candidate: unknown,
): MerchantSettlementEligibilityEvidence {
  const record = requireObject(candidate, "a MerchantSettlementEligibilityEvidence", fail);
  const evidenceId = requireBoundedString(record["evidenceId"], "evidence.evidenceId", LIMITS.refMaxLength, fail);
  const providerName = requireBoundedString(record["providerName"], "evidence.providerName", LIMITS.refMaxLength, fail);
  const merchantAccountRef = requireBoundedString(
    record["merchantAccountRef"],
    "evidence.merchantAccountRef",
    LIMITS.refMaxLength,
    fail,
  );
  const currency = requireBoundedString(record["currency"], "evidence.currency", 3, fail);
  if (record["eligible"] !== true) {
    throw fail("evidence.eligible must be true — ineligibility is surfaced as an honest exclusion, never as evidence");
  }
  if (record["providerVerified"] !== true) {
    throw fail("evidence.providerVerified must be true — a provider-verified effect demands provider verification (the rule-30 law)");
  }
  const verificationRef = requireBoundedString(
    record["verificationRef"],
    "evidence.verificationRef",
    LIMITS.refMaxLength,
    fail,
  );
  const observedAt = record["observedAt"];
  if (typeof observedAt !== "string" || !isIsoUtcTimestamp(observedAt)) {
    throw fail("evidence.observedAt must be a strict ISO-8601 UTC timestamp");
  }
  const freshnessRecord = requireObject(record["freshness"], "evidence.freshness", fail);
  const asOf = freshnessRecord["asOf"];
  if (typeof asOf !== "string" || !isIsoUtcTimestamp(asOf)) {
    throw fail("evidence.freshness.asOf must be a strict ISO-8601 UTC timestamp");
  }
  const maxAgeSeconds = freshnessRecord["maxAgeSeconds"];
  if (typeof maxAgeSeconds !== "number" || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1) {
    throw fail("evidence.freshness.maxAgeSeconds must be a positive integer");
  }
  if (record["awaitingAuthority"] !== MERCHANT_SETTLEMENT_AUTHORITY) {
    throw fail(`evidence.awaitingAuthority must be '${MERCHANT_SETTLEMENT_AUTHORITY}' (the honest marker)`);
  }
  return deepFreeze({
    evidenceId,
    providerName,
    merchantAccountRef,
    currency,
    eligible: true,
    providerVerified: true,
    verificationRef,
    observedAt,
    freshness: Object.freeze({ asOf, maxAgeSeconds }),
    awaitingAuthority: MERCHANT_SETTLEMENT_AUTHORITY,
  });
}

/** True iff the eligibility evidence is fresh at the instant (inclusive bound). */
export function merchantEligibilityIsFresh(
  evidence: MerchantSettlementEligibilityEvidence,
  atMs: number,
): boolean {
  if (typeof atMs !== "number" || !Number.isSafeInteger(atMs) || atMs < 0) {
    throw fail("the evaluation instant must be a non-negative integer (no ambient clock)");
  }
  return atMs - epochMillisFromIso(evidence.freshness.asOf) <= evidence.freshness.maxAgeSeconds * 1000;
}

/** The merchant-balance custody party. */
export function merchantBalanceParty(
  merchantAccountRef: string,
  providerName: string,
): CustodyParty {
  return Object.freeze({ kind: "MERCHANT_BALANCE", merchantAccountRef, providerName });
}

/** The native merchant settlement leg (Mode A — the baseline). */
export interface MerchantBalanceSettlementLeg extends RouteLegBase {
  readonly legKind: "MERCHANT_BALANCE_SETTLEMENT";
  readonly mode: "NATIVE_MERCHANT_SETTLEMENT";
  readonly awaitingAuthority: typeof MERCHANT_SETTLEMENT_AUTHORITY;
  readonly eligibilityEvidenceId: string;
}

/** The honest native-settlement-unavailable marker (Mode B's mandate). */
export interface MerchantNativeSettlementUnavailableMarker {
  readonly notice: typeof MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE;
  readonly reason: string;
  readonly awaitingAuthority: typeof MERCHANT_SETTLEMENT_AUTHORITY;
}

/** Build the honest Mode-B marker (never fabricated without a reason). */
export function merchantNativeSettlementUnavailable(reason: string): MerchantNativeSettlementUnavailableMarker {
  if (!isNonEmptyString(reason)) {
    throw fail("the native-settlement-unavailable marker requires a reason (never a bare marker)");
  }
  return deepFreeze({
    notice: MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE,
    reason,
    awaitingAuthority: MERCHANT_SETTLEMENT_AUTHORITY,
  });
}

/** The provider settlement observation family (three-valued, INV-X01). */
export type ProviderSettlementObservation =
  | {
      readonly observationId: string;
      readonly merchantAccountRef: string;
      readonly observedAt: string;
      readonly verificationStatus: "SUCCESS";
      readonly verificationRef: string;
    }
  | {
      readonly observationId: string;
      readonly merchantAccountRef: string;
      readonly observedAt: string;
      readonly verificationStatus: "FAILURE";
      readonly verificationRef: string;
    }
  | {
      readonly observationId: string;
      readonly merchantAccountRef: string;
      readonly observedAt: string;
      readonly verificationStatus: "OUTCOME_UNKNOWN";
      readonly unknownReason: string;
    };

/** Fail-closed validation of a provider settlement observation. */
export function validateProviderSettlementObservation(
  candidate: unknown,
): ProviderSettlementObservation {
  const record = requireObject(candidate, "a ProviderSettlementObservation", fail);
  const observationId = requireBoundedString(record["observationId"], "observation.observationId", LIMITS.refMaxLength, fail);
  const merchantAccountRef = requireBoundedString(
    record["merchantAccountRef"],
    "observation.merchantAccountRef",
    LIMITS.refMaxLength,
    fail,
  );
  const observedAt = record["observedAt"];
  if (typeof observedAt !== "string" || !isIsoUtcTimestamp(observedAt)) {
    throw fail("observation.observedAt must be a strict ISO-8601 UTC timestamp");
  }
  const status = record["verificationStatus"];
  if (status === "SUCCESS" || status === "FAILURE") {
    const verificationRef = requireBoundedString(
      record["verificationRef"],
      "observation.verificationRef",
      LIMITS.refMaxLength,
      fail,
    );
    return deepFreeze({ observationId, merchantAccountRef, observedAt, verificationStatus: status, verificationRef });
  }
  if (status === "OUTCOME_UNKNOWN") {
    const unknownReason = requireBoundedString(
      record["unknownReason"],
      "observation.unknownReason",
      LIMITS.descriptionMaxLength,
      fail,
    );
    return deepFreeze({ observationId, merchantAccountRef, observedAt, verificationStatus: status, unknownReason });
  }
  throw fail("observation.verificationStatus must be SUCCESS, FAILURE or OUTCOME_UNKNOWN (INV-X01: UNKNOWN carries its reason)");
}
