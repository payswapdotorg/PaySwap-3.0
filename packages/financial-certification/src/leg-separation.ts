/**
 * @payswap/financial-certification — LAW 3: funding/payout separation
 * (P8-W1).
 *
 * The two legs of a certified corridor are SEPARATELY authorized,
 * SEPARATELY observed and SEPARATELY reconciled:
 *
 * - NO FUSED LEG: the funding leg and the payout leg are distinct
 *   artifacts with distinct ids — one fused "transfer" covering both
 *   directions is unrepresentable;
 * - NO FUSED AUTHORIZATION: each leg carries its OWN authorization
 *   lineage (the pinned trust shape — mandate + grant + epoch stamp);
 *   the same grant authorizing both legs is a fusion violation (one
 *   mandate may scope both, but the issued grants must differ);
 * - SEPARATELY OBSERVED: each leg carries its own non-empty observation
 *   evidence;
 * - SEPARATELY RECONCILED: each leg references its own reconciliation
 *   record;
 * - NO CROSS-LEG SHORTCUT: the payout leg may not be "observed" only
 *   through the funding leg's evidence;
 * - NO HIDDEN CUSTODY: the payout destination is EXTERNAL (a provider
 *   bank instrument — the pinned route-compiler payout-gate law); a
 *   PaySwap-internal payout destination is hidden custody and a
 *   violation.
 */

import { ConformanceError } from "./errors.ts";
import { conformanceVerdict, type ConformanceVerdict } from "./laws.ts";
import type { PinnedAuthorizationLineage } from "./pins/trust.ts";

/** The two legs (exactly these; there is no fused kind). */
export const CERTIFIED_LEG_KINDS = ["FUNDING", "PAYOUT"] as const;

export type CertifiedLegKind = (typeof CERTIFIED_LEG_KINDS)[number];

/** One certified leg observation (the subject's artifact). */
export interface CertifiedLegObservation {
  readonly legKind: CertifiedLegKind;
  readonly legId: string;
  /** The leg's OWN authorization lineage (the pinned trust shape). */
  readonly authorizationLineage: PinnedAuthorizationLineage;
  /** The leg's OWN observation evidence (non-empty). */
  readonly observationEvidenceRefs: readonly string[];
  /** The leg's OWN reconciliation record reference. */
  readonly reconciliationRef: string;
  /** Custody during the leg + whether the destination is external. */
  readonly custody: {
    readonly party: "PAYER" | "PROVIDER" | "BENEFICIARY";
    readonly externalDestination: boolean;
  };
}

function validateLeg(leg: CertifiedLegObservation, subjectRef: string): void {
  if (leg === null || typeof leg !== "object") {
    throw new ConformanceError(`${subjectRef}: a leg observation is required`);
  }
  if (leg.legKind !== "FUNDING" && leg.legKind !== "PAYOUT") {
    throw new ConformanceError(
      `${subjectRef}: unknown leg kind '${String(leg.legKind)}' (FUNDING/PAYOUT only — no fused kind)`,
    );
  }
  if (leg.legId.length === 0) {
    throw new ConformanceError(`${subjectRef}: a leg requires a legId`);
  }
  const lineage = leg.authorizationLineage;
  if (
    lineage === null ||
    typeof lineage !== "object" ||
    lineage.mandateRef.length === 0 ||
    lineage.grantRef.length === 0 ||
    typeof lineage.issuedAtEpoch !== "bigint" ||
    lineage.issuedAtEpoch < 0n
  ) {
    throw new ConformanceError(
      `${subjectRef}: leg '${leg.legId}' requires complete authorization lineage (mandate + grant + non-negative epoch stamp)`,
    );
  }
  if (
    leg.custody === null ||
    typeof leg.custody !== "object" ||
    (leg.custody.party !== "PAYER" &&
      leg.custody.party !== "PROVIDER" &&
      leg.custody.party !== "BENEFICIARY")
  ) {
    throw new ConformanceError(
      `${subjectRef}: leg '${leg.legId}' requires a custody party`,
    );
  }
}

/**
 * CERTIFIES the funding/payout separation law over one corridor leg
 * pair (FIN-LAW-03).
 */
export function certifyLegSeparation(input: {
  readonly subjectRef: string;
  readonly funding: CertifiedLegObservation;
  readonly payout: CertifiedLegObservation;
  readonly evidenceRefs: readonly string[];
}): ConformanceVerdict {
  validateLeg(input.funding, input.subjectRef);
  validateLeg(input.payout, input.subjectRef);
  const violations: string[] = [];
  const funding = input.funding;
  const payout = input.payout;

  if (funding.legKind !== "FUNDING") {
    violations.push(
      `FIN-LAW-03 (pairing): the funding slot carries a '${funding.legKind}' leg`,
    );
  }
  if (payout.legKind !== "PAYOUT") {
    violations.push(
      `FIN-LAW-03 (pairing): the payout slot carries a '${payout.legKind}' leg`,
    );
  }
  if (funding.legId === payout.legId) {
    violations.push(
      `FIN-LAW-03 (fused leg): funding and payout share the leg id '${funding.legId}' — the two legs are separate artifacts; a fused leg is unrepresentable`,
    );
  }
  if (funding.authorizationLineage.grantRef === payout.authorizationLineage.grantRef) {
    violations.push(
      `FIN-LAW-03 (fused authorization): both legs are authorized by the SAME grant '${funding.authorizationLineage.grantRef}' — each leg is separately authorized (one mandate may scope both; the issued grants must differ)`,
    );
  }
  if (funding.observationEvidenceRefs.length === 0) {
    violations.push(
      "FIN-LAW-03 (unobserved leg): the funding leg carries NO observation evidence — each leg is separately observed",
    );
  }
  if (payout.observationEvidenceRefs.length === 0) {
    violations.push(
      "FIN-LAW-03 (unobserved leg): the payout leg carries NO observation evidence — each leg is separately observed",
    );
  }
  if (
    payout.observationEvidenceRefs.length > 0 &&
    payout.observationEvidenceRefs.every((ref) =>
      funding.observationEvidenceRefs.includes(ref),
    )
  ) {
    violations.push(
      `FIN-LAW-03 (cross-leg shortcut): the payout leg is observed ONLY through the funding leg's evidence [${payout.observationEvidenceRefs.join(", ")}] — no cross-leg shortcut`,
    );
  }
  if (funding.reconciliationRef.length === 0) {
    violations.push(
      "FIN-LAW-03 (unreconciled leg): the funding leg references NO reconciliation record",
    );
  }
  if (payout.reconciliationRef.length === 0) {
    violations.push(
      "FIN-LAW-03 (unreconciled leg): the payout leg references NO reconciliation record",
    );
  }
  if (
    funding.reconciliationRef.length > 0 &&
    funding.reconciliationRef === payout.reconciliationRef
  ) {
    violations.push(
      `FIN-LAW-03 (shared reconciliation): both legs reference the SAME reconciliation record '${funding.reconciliationRef}' — each leg is separately reconciled`,
    );
  }
  if (payout.custody.externalDestination !== true) {
    violations.push(
      "FIN-LAW-03 (hidden custody): the payout destination is not EXTERNAL — a payout destination is always an explicit external provider bank instrument (PaySwap-internal custody in a payout is unrepresentable)",
    );
  }

  return conformanceVerdict({
    lawId: "FIN-LAW-03",
    scenarioId: "FUNDING_PAYOUT_SEPARATION",
    subjectRef: input.subjectRef,
    violations,
    evidenceRefs: input.evidenceRefs,
  });
}
