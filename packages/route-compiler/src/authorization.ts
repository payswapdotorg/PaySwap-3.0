/**
 * @payswap/route-compiler — the authorization-lineage contracts (P5-W1).
 *
 * PORT+ADAPT of the old compiler's LegAuthorizationEvidence block
 * (MMI-19): every leg carries an explicit authorization LINEAGE — the
 * intent's opaque authorization reference (the lineage ROOT, carried
 * never interpreted) plus ONE leg-level authorization evidence variant
 * naming WHO/WHAT authorizes the hop's effect:
 *
 * - ONCHAIN_GATE_DECISION: the security gate ALLOWed the prepared write
 *   (the write digest binds the exact write);
 * - PAYOUT_TRANSFER_OUT_GRANT: the payout gate's transfer-out grant
 *   report (connection scope alone NEVER passes — the report is the
 *   authorization verdict);
 * - CORRIDOR_ELIGIBILITY_LINEAGE: the corridor route evaluation's
 *   instance + observation VERSION (the provider-native family: the
 *   incumbent executes under its own connected, eligible, observed
 *   authorization — lineage preserved, never re-declared);
 * - PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY: the merchant-balance
 *   family's provider-verified eligibility evidence (rule 30);
 * - INTENT_AUTHORIZATION_ONLY: the honest marker for hops that execute
 *   as the evidenced consequence of an already-authorized leg (the bank
 *   arrival after an authorized payout).
 *
 * The vocabulary is CLOSED; an authorization evidence outside it is
 * structurally unrepresentable.
 */

import { InvalidRouteLegContractError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireObject, requireStringArray, LIMITS, type Fail } from "./canonical.ts";
import type { PinnedGateDecision } from "./pins/onchain.ts";

const fail: Fail = (message: string) => new InvalidRouteLegContractError(message);

/** The closed authorization-evidence kind vocabulary (frozen). */
export const AUTHORIZATION_EVIDENCE_KINDS = Object.freeze([
  "ONCHAIN_GATE_DECISION",
  "PAYOUT_TRANSFER_OUT_GRANT",
  "CORRIDOR_ELIGIBILITY_LINEAGE",
  "PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY",
  "INTENT_AUTHORIZATION_ONLY",
] as const);

export type AuthorizationEvidenceKind = (typeof AUTHORIZATION_EVIDENCE_KINDS)[number];

/**
 * The payout gate report wire type (authority: the old connectors lane's
 * PayoutGateReport shape, carried as the REAL wire type — F-1: fixtures
 * and scores carry this verbatim, never a simplified stand-in). The
 * report is the payout leg's authorization VERDICT: `allowed` false or a
 * failed check means the hop is not authorized, honestly.
 */
export interface PayoutGateReport {
  readonly allowed: boolean;
  readonly checks: readonly {
    readonly gate: string;
    readonly pass: boolean;
    readonly reason: string;
  }[];
  readonly evidenceRefs: readonly string[];
}

/** The onchain gate-decision evidence (write-digest-bound). */
export interface OnchainGateDecisionEvidence {
  readonly kind: "ONCHAIN_GATE_DECISION";
  readonly gateDecision: PinnedGateDecision;
  /** The content digest of the kernel-prepared write the gate evaluated. */
  readonly writeDigest: string;
  readonly routeRef: string;
  readonly routeHash: string;
}

/** The payout transfer-out grant evidence (the real gate report). */
export interface PayoutTransferOutGrantEvidence {
  readonly kind: "PAYOUT_TRANSFER_OUT_GRANT";
  /** The REAL payout gate report (connection scope alone never passes). */
  readonly gate: PayoutGateReport;
  readonly transferOutAuthorizationId: string;
}

/**
 * The corridor eligibility lineage evidence (the provider-native
 * family): the exact instance + observation VERSION the compiler decided
 * on (observation-VERSION preservation law) plus the terms version.
 */
export interface CorridorEligibilityLineageEvidence {
  readonly kind: "CORRIDOR_ELIGIBILITY_LINEAGE";
  readonly routeId: string;
  readonly instanceId: string;
  readonly observationVersion: number;
  readonly capabilityDefinitionVersion: string;
  readonly implementationVersion: string;
  readonly termsVersion: string;
  readonly providerName: string;
}

/**
 * The provider-verified settlement eligibility evidence (merchant family,
 * rule 30: provider-verified effects only — the evidenceId references
 * the provider-side verification artifact).
 */
export interface ProviderVerifiedSettlementEligibilityEvidence {
  readonly kind: "PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY";
  readonly evidenceId: string;
  readonly providerName: string;
  readonly merchantAccountRef: string;
  readonly currency: string;
  /** Honest marker: the merchant lane's integration authority. */
  readonly awaitingAuthority: string;
}

/** The intent-authorization-only marker (evidenced consequence hops). */
export interface IntentAuthorizationOnlyEvidence {
  readonly kind: "INTENT_AUTHORIZATION_ONLY";
  readonly reason: string;
}

/** The closed leg-authorization evidence union. */
export type LegAuthorizationEvidence =
  | OnchainGateDecisionEvidence
  | PayoutTransferOutGrantEvidence
  | CorridorEligibilityLineageEvidence
  | ProviderVerifiedSettlementEligibilityEvidence
  | IntentAuthorizationOnlyEvidence;

/**
 * The full authorization lineage of one leg: the intent reference (the
 * lineage root) + the leg's authorization evidence. The intent's
 * authorization is an OPAQUE reference — this package never interprets
 * it, never verifies it, never re-declares what it authorizes.
 */
export interface AuthorizationLineage {
  readonly intentRef: string;
  readonly intentAuthorizationRef: string;
  readonly legAuthorization: LegAuthorizationEvidence;
}

/** Fail-closed validation of a payout gate report (the real wire type). */
export function validatePayoutGateReport(candidate: unknown): PayoutGateReport {
  const record = requireObject(candidate, "a PayoutGateReport", fail);
  const allowed = record["allowed"];
  if (typeof allowed !== "boolean") {
    throw fail("PayoutGateReport.allowed must be a boolean");
  }
  const checks = record["checks"];
  if (!Array.isArray(checks) || checks.length === 0) {
    throw fail("PayoutGateReport.checks must be a non-empty array (an unevaluated gate never passes)");
  }
  const validatedChecks: PayoutGateReport["checks"][number][] = [];
  for (const check of checks) {
    const checkRecord = requireObject(check, "a PayoutGateReport check", fail);
    const gate = requireBoundedString(checkRecord["gate"], "PayoutGateReport.check.gate", LIMITS.refMaxLength, fail);
    const pass = checkRecord["pass"];
    if (typeof pass !== "boolean") {
      throw fail("PayoutGateReport.check.pass must be a boolean");
    }
    const reason = requireBoundedString(checkRecord["reason"], "PayoutGateReport.check.reason", LIMITS.descriptionMaxLength, fail);
    validatedChecks.push(Object.freeze({ gate, pass, reason }));
  }
  const evidenceRefs = requireStringArray(record["evidenceRefs"], "PayoutGateReport.evidenceRefs", fail);
  return deepFreeze({ allowed, checks: Object.freeze(validatedChecks), evidenceRefs });
}

/** True iff every gate check passed and the report allows the transfer-out. */
export function payoutGateAllows(report: PayoutGateReport): boolean {
  return report.allowed && report.checks.every((check) => check.pass);
}

/** Fail-closed validation of a leg-authorization evidence variant. */
export function validateLegAuthorizationEvidence(
  candidate: unknown,
): LegAuthorizationEvidence {
  const record = requireObject(candidate, "a LegAuthorizationEvidence", fail);
  const kind = record["kind"];
  switch (kind) {
    case "ONCHAIN_GATE_DECISION": {
      const gateDecision = record["gateDecision"];
      if (typeof gateDecision !== "object" || gateDecision === null) {
        throw fail("ONCHAIN_GATE_DECISION requires the gate decision");
      }
      const decision = (gateDecision as { decision?: unknown }).decision;
      if (decision !== "ALLOW" && decision !== "BLOCK" && decision !== "UNKNOWN") {
        throw fail("the gate decision vocabulary is ALLOW | BLOCK | UNKNOWN");
      }
      const writeDigest = requireBoundedString(record["writeDigest"], "evidence.writeDigest", LIMITS.refMaxLength, fail);
      const routeRef = requireBoundedString(record["routeRef"], "evidence.routeRef", LIMITS.refMaxLength, fail);
      const routeHash = requireBoundedString(record["routeHash"], "evidence.routeHash", LIMITS.refMaxLength, fail);
      return deepFreeze({ kind, gateDecision: gateDecision as PinnedGateDecision, writeDigest, routeRef, routeHash });
    }
    case "PAYOUT_TRANSFER_OUT_GRANT": {
      const gate = validatePayoutGateReport(record["gate"]);
      const transferOutAuthorizationId = requireBoundedString(
        record["transferOutAuthorizationId"],
        "evidence.transferOutAuthorizationId",
        LIMITS.refMaxLength,
        fail,
      );
      return deepFreeze({ kind, gate, transferOutAuthorizationId });
    }
    case "CORRIDOR_ELIGIBILITY_LINEAGE": {
      const routeId = requireBoundedString(record["routeId"], "evidence.routeId", LIMITS.refMaxLength, fail);
      const instanceId = requireBoundedString(record["instanceId"], "evidence.instanceId", LIMITS.refMaxLength, fail);
      const observationVersion = record["observationVersion"];
      if (typeof observationVersion !== "number" || !Number.isSafeInteger(observationVersion) || observationVersion < 1) {
        throw fail("evidence.observationVersion must be a positive integer (the exact version decided on)");
      }
      const capabilityDefinitionVersion = requireBoundedString(record["capabilityDefinitionVersion"], "evidence.capabilityDefinitionVersion", LIMITS.refMaxLength, fail);
      const implementationVersion = requireBoundedString(record["implementationVersion"], "evidence.implementationVersion", LIMITS.refMaxLength, fail);
      const termsVersion = requireBoundedString(record["termsVersion"], "evidence.termsVersion", LIMITS.refMaxLength, fail);
      const providerName = requireBoundedString(record["providerName"], "evidence.providerName", LIMITS.refMaxLength, fail);
      return deepFreeze({
        kind,
        routeId,
        instanceId,
        observationVersion,
        capabilityDefinitionVersion,
        implementationVersion,
        termsVersion,
        providerName,
      });
    }
    case "PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY": {
      const evidenceId = requireBoundedString(record["evidenceId"], "evidence.evidenceId", LIMITS.refMaxLength, fail);
      const providerName = requireBoundedString(record["providerName"], "evidence.providerName", LIMITS.refMaxLength, fail);
      const merchantAccountRef = requireBoundedString(record["merchantAccountRef"], "evidence.merchantAccountRef", LIMITS.refMaxLength, fail);
      const currency = requireBoundedString(record["currency"], "evidence.currency", 3, fail);
      const awaitingAuthority = requireBoundedString(record["awaitingAuthority"], "evidence.awaitingAuthority", LIMITS.refMaxLength, fail);
      return deepFreeze({
        kind,
        evidenceId,
        providerName,
        merchantAccountRef,
        currency,
        awaitingAuthority,
      });
    }
    case "INTENT_AUTHORIZATION_ONLY": {
      const reason = requireBoundedString(record["reason"], "evidence.reason", LIMITS.descriptionMaxLength, fail);
      return deepFreeze({ kind, reason });
    }
    default:
      throw fail(
        `LegAuthorizationEvidence.kind must be one of the closed vocabulary [${AUTHORIZATION_EVIDENCE_KINDS.join(", ")}]`,
      );
  }
}

/** Fail-closed validation of a full authorization lineage. */
export function validateAuthorizationLineage(candidate: unknown): AuthorizationLineage {
  const record = requireObject(candidate, "an AuthorizationLineage", fail);
  const intentRef = requireBoundedString(record["intentRef"], "AuthorizationLineage.intentRef", LIMITS.refMaxLength, fail);
  const intentAuthorizationRef = requireBoundedString(
    record["intentAuthorizationRef"],
    "AuthorizationLineage.intentAuthorizationRef",
    LIMITS.refMaxLength,
    fail,
  );
  const legAuthorization = validateLegAuthorizationEvidence(record["legAuthorization"]);
  return deepFreeze({ intentRef, intentAuthorizationRef, legAuthorization });
}
