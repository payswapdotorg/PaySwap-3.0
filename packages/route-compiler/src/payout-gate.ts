/**
 * @payswap/route-compiler — payout constraints + bank settlement (P5-W1).
 *
 * PORT+ADAPT of the old compiler's payout/settlement tail (MMI-19): the
 * FUNDING/PAYOUT requirement of the comparability gate. The old family
 * evaluated the connectors lane's six-gate payout report inline; the
 * rebuild treats the report as an INPUT wire type (the REAL wire type —
 * F-1: fixtures and scores carry it verbatim) and owns only the
 * compiler-side laws:
 *
 * - the payout DESTINATION is always EXPLICIT and EXTERNAL (a bank
 *   instrument reference — never a PaySwap-internal destination; there
 *   is no PaySwap custody anywhere in a payout);
 * - the destination evidence carries the bank arrival's provenance;
 * - the settlement RESULT is derived deterministically from the
 *   destination (destinationId + destinationKind + externalRef — the
 *   single-source-of-truth law, never re-declared per leg);
 * - a payout gate report that is not allowed, or with any failed
 *   check, is an honest ineligibility (the leg is compiled but marked
 *   ineligible — never silently dropped).
 */

import { ValidationError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireObject, LIMITS, type Fail } from "./canonical.ts";
import { payoutGateAllows, validatePayoutGateReport } from "./authorization.ts";
import type { PayoutGateReport } from "./authorization.ts";
import type { CustodyParty } from "./custody.ts";

const fail: Fail = (message: string) => new ValidationError(message);

/** The payout destination wire type (explicit and EXTERNAL by construction). */
export interface PayoutDestination {
  readonly kind: "PROVIDER_BANK_INSTRUMENT";
  readonly providerDestinationRef: string;
}

/** Fail-closed validation of a payout destination (external-only law). */
export function validatePayoutDestination(candidate: unknown): PayoutDestination {
  const record = requireObject(candidate, "a PayoutDestination", fail);
  const kind = record["kind"];
  if (kind !== "PROVIDER_BANK_INSTRUMENT") {
    throw fail("a payout destination must be an explicit EXTERNAL provider bank instrument (a PaySwap-internal destination is unrepresentable)");
  }
  const providerDestinationRef = requireBoundedString(
    record["providerDestinationRef"],
    "destination.providerDestinationRef",
    LIMITS.refMaxLength,
    fail,
  );
  return Object.freeze({ kind, providerDestinationRef });
}

/** The external settlement destination (the bank arrival). */
export interface SettlementDestination {
  readonly destinationId: string;
  readonly kind: "BANK_ACCOUNT";
  readonly currency: string;
  readonly externalRef: string;
  readonly provenance: {
    readonly source: string;
    readonly reference: string;
    readonly recordedAt: bigint;
  };
}

/** Fail-closed validation of a settlement destination. */
export function validateSettlementDestination(candidate: unknown): SettlementDestination {
  const record = requireObject(candidate, "a SettlementDestination", fail);
  const destinationId = requireBoundedString(record["destinationId"], "destination.destinationId", LIMITS.refMaxLength, fail);
  const kind = record["kind"];
  if (kind !== "BANK_ACCOUNT") {
    throw fail("a settlement destination must be a BANK_ACCOUNT (the bank arrival is external)");
  }
  const currency = requireBoundedString(record["currency"], "destination.currency", 3, fail);
  const externalRef = requireBoundedString(record["externalRef"], "destination.externalRef", LIMITS.refMaxLength, fail);
  const provenanceRecord = requireObject(record["provenance"], "destination.provenance", fail);
  const source = requireBoundedString(provenanceRecord["source"], "provenance.source", LIMITS.refMaxLength, fail);
  const reference = requireBoundedString(provenanceRecord["reference"], "provenance.reference", LIMITS.refMaxLength, fail);
  const recordedAtRaw = provenanceRecord["recordedAt"];
  if (typeof recordedAtRaw !== "bigint") {
    throw fail("provenance.recordedAt must be a bigint (the exact recording instant)");
  }
  return deepFreeze({
    destinationId,
    kind,
    currency,
    externalRef,
    provenance: Object.freeze({ source, reference, recordedAt: recordedAtRaw }),
  });
}

/** Define a settlement destination (deterministic, provenance-carrying). */
export function defineSettlementDestination(input: {
  readonly destinationId: string;
  readonly currency: string;
  readonly externalRef: string;
  readonly provenance: { readonly source: string; readonly reference: string; readonly recordedAt: bigint };
}): SettlementDestination {
  return validateSettlementDestination({
    destinationId: input.destinationId,
    kind: "BANK_ACCOUNT",
    currency: input.currency,
    externalRef: input.externalRef,
    provenance: input.provenance,
  });
}

/** The settlement result derived from the destination (never re-declared). */
export interface SettlementResult {
  readonly destinationId: string;
  readonly destinationKind: "BANK_ACCOUNT";
  readonly externalRef: string;
}

/** Derive the settlement result from the destination (single source of truth). */
export function settlementResultFrom(destination: SettlementDestination): SettlementResult {
  return Object.freeze({
    destinationId: destination.destinationId,
    destinationKind: destination.kind,
    externalRef: destination.externalRef,
  });
}

/** The payout leg's destination custody party. */
export function payoutDestinationParty(destination: PayoutDestination): CustodyParty {
  return Object.freeze({
    kind: "EXTERNAL_BANK_INSTRUMENT",
    externalRef: destination.providerDestinationRef,
  });
}

/**
 * The payout constraint evaluation (the funding/payout requirement):
 * the REAL gate report verdict + the explicit external destination.
 * Returns the honest constraint verdict — never a fabricated pass.
 */
export interface PayoutConstraintVerdict {
  readonly payoutSatisfied: boolean;
  readonly destination: PayoutDestination | undefined;
  readonly gateReport: PayoutGateReport | undefined;
  readonly reasons: readonly string[];
}

/** Evaluate the payout constraint from its inputs (fail-closed, honest). */
export function evaluatePayoutConstraint(input: {
  readonly destination: unknown;
  readonly gateReport: unknown;
}): PayoutConstraintVerdict {
  const reasons: string[] = [];
  let destination: PayoutDestination | undefined;
  let gateReport: PayoutGateReport | undefined;
  try {
    destination = validatePayoutDestination(input.destination);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "the payout destination is malformed");
  }
  try {
    gateReport = validatePayoutGateReport(input.gateReport);
    if (!payoutGateAllows(gateReport)) {
      reasons.push("the payout gate report does not allow the transfer-out (connection scope alone never passes)");
    }
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "the payout gate report is malformed");
  }
  const payoutSatisfied = reasons.length === 0 && destination !== undefined && gateReport !== undefined;
  return deepFreeze({
    payoutSatisfied,
    destination,
    gateReport,
    reasons: Object.freeze(reasons),
  });
}
