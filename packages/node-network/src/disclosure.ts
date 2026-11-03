/**
 * @payswap/node-network — per-leg least disclosure (P27-D, ADR-0020 D9).
 *
 * Each leg receives ONLY the data it needs for its own execution and
 * legal obligations: typed per-leg disclosure envelopes, never raw
 * passthrough. This is DATA MINIMIZATION, NOT ANONYMITY — obligated
 * providers and operators still see and retain what law, contract and
 * AML controls require, and (the D2 law) CONCEALMENT of originator,
 * beneficiary, beneficial owner, source of funds or purpose FROM AN
 * OBLIGATED PARTICIPANT is a typed refusal — never a silent envelope
 * that quietly drops an obligated field.
 */

import { DisclosureError } from "./errors.ts";
import {
  LIMITS,
  deepFreeze,
  isNonEmptyString,
  isRecord,
  requireBoundedString,
} from "./canonical.ts";

/** The disclosure vocabulary version. */
export const DISCLOSURE_VERSION = "1.0.0" as const;

/**
 * VALUE PIN — the disclosure field vocabulary (closed; every field a leg
 * can receive). Bank/mobile numbers and KYC documents stay within the
 * provider/authorized node that requires them (D9).
 */
export const DISCLOSURE_FIELDS = Object.freeze([
  "SENDER_IDENTITY",
  "BENEFICIARY_IDENTITY",
  "AMOUNT_AND_CURRENCY",
  "PURPOSE_CLASS",
  "PURPOSE_EVIDENCE_REF",
  "SOURCE_OF_FUNDS",
  "KYC_DOCUMENT_REFS",
  "BENEFICIARY_BANK_DETAILS",
  "ROUTE_CONTEXT_REF",
  "LEG_REFERENCE",
] as const);

export type DisclosureField = (typeof DISCLOSURE_FIELDS)[number];

/** Why a field is required by a leg (the obligation's authority). */
export const DISCLOSURE_OBLIGATION_KINDS = Object.freeze([
  "EXECUTION_REQUIRED",
  "AML_LEGAL_OBLIGATION",
  "CONTRACT_OBLIGATION",
] as const);

export type DisclosureObligationKind = (typeof DISCLOSURE_OBLIGATION_KINDS)[number];

/** One field obligation of one leg. */
export interface DisclosureObligation {
  readonly field: DisclosureField;
  readonly obligation: DisclosureObligationKind;
}

/** The typed refusal when an obligated field is withheld (D2/D9). */
export interface DisclosureRefusal {
  readonly refused: true;
  readonly legIndex: number;
  readonly code: "DISCLOSURE_OBLIGATION_UNMET";
  readonly missingObligations: readonly DisclosureObligation[];
  readonly message: string;
}

/** The minimal per-leg disclosure envelope (only obligated fields). */
export interface LegDisclosureEnvelope {
  readonly disclosureVersion: string;
  readonly legIndex: number;
  /** The fields this leg receives (exactly its obligations — nothing more). */
  readonly fields: Readonly<Record<string, string>>;
  readonly obligations: readonly DisclosureObligation[];
  /** Every principal-see-what fact is recorded (D9: every principal-sees-what is recorded). */
  readonly disclosedTo: string;
}

/** The build outcome: the envelope, or the typed refusal. */
export type DisclosureBuildResult = LegDisclosureEnvelope | DisclosureRefusal;

function validateObligations(candidate: unknown, subject: string): readonly DisclosureObligation[] {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    throw new DisclosureError(`${subject} must be a non-empty array of field obligations`);
  }
  if (candidate.length > LIMITS.maxDisclosureFields) {
    throw new DisclosureError(`${subject} must carry at most ${LIMITS.maxDisclosureFields} fields`);
  }
  return Object.freeze(
    candidate.map((entry) => {
      const record = isRecord(entry) ? entry : null;
      if (record === null) {
        throw new DisclosureError(`${subject} entries must be objects`);
      }
      const field = record["field"];
      if (!(DISCLOSURE_FIELDS as readonly unknown[]).includes(field)) {
        throw new DisclosureError(
          `${subject} names field '${String(field)}' outside the closed disclosure vocabulary`,
        );
      }
      const obligation = record["obligation"];
      if (!(DISCLOSURE_OBLIGATION_KINDS as readonly unknown[]).includes(obligation)) {
        throw new DisclosureError(`${subject} carries an unknown obligation kind`);
      }
      return deepFreeze({
        field: field as DisclosureField,
        obligation: obligation as DisclosureObligationKind,
      });
    }),
  );
}

/**
 * Build one leg's disclosure envelope. THE MINIMIZATION LAW: only the
 * leg's OBLIGATED fields are included — available facts beyond the
 * obligations are structurally excluded (never raw passthrough). THE
 * CONCEALMENT LAW: if an obligated field's value is withheld or missing,
 * the result is the TYPED REFUSAL (an obligated participant is never
 * silently short-changed — D2/D9).
 */
export function buildLegDisclosureEnvelope(input: {
  readonly legIndex: number;
  readonly disclosedTo: string;
  readonly obligations: readonly unknown[];
  readonly availableFacts: Readonly<Record<string, string>>;
  readonly withheldFields?: readonly string[];
}): DisclosureBuildResult {
  if (
    typeof input?.legIndex !== "number" ||
    !Number.isSafeInteger(input.legIndex) ||
    input.legIndex < 0
  ) {
    throw new DisclosureError("the disclosure envelope needs its leg index");
  }
  const disclosedTo = requireBoundedString(
    input.disclosedTo,
    "disclosure.disclosedTo",
    LIMITS.refMaxLength,
  );
  if (!isRecord(input.availableFacts)) {
    throw new DisclosureError("disclosure.availableFacts must be a record of field values");
  }
  const obligations = validateObligations(input.obligations, "disclosure.obligations");
  const withheld = new Set(
    Array.isArray(input.withheldFields)
      ? input.withheldFields.filter((field): field is string => isNonEmptyString(field))
      : [],
  );
  const missingObligations: DisclosureObligation[] = [];
  const fields: Record<string, string> = {};
  for (const obligation of obligations) {
    if (withheld.has(obligation.field)) {
      missingObligations.push(obligation);
      continue;
    }
    const value = input.availableFacts[obligation.field];
    if (typeof value !== "string" || value.length === 0) {
      missingObligations.push(obligation);
      continue;
    }
    fields[obligation.field] = value;
  }
  if (missingObligations.length > 0) {
    return deepFreeze({
      refused: true as const,
      legIndex: input.legIndex,
      code: "DISCLOSURE_OBLIGATION_UNMET" as const,
      missingObligations: Object.freeze(missingObligations),
      message:
        "leg requires fields that are withheld or missing — concealing originator, beneficiary, source of funds or purpose from an OBLIGATED participant is a typed refusal (ADR-0020 D2/D9), never a silent envelope",
    });
  }
  return deepFreeze({
    disclosureVersion: DISCLOSURE_VERSION,
    legIndex: input.legIndex,
    fields: deepFreeze(fields),
    obligations,
    disclosedTo,
  });
}

/** True iff a build result is the typed refusal (the seam's honest check). */
export function isDisclosureRefusal(
  result: DisclosureBuildResult,
): result is DisclosureRefusal {
  return (result as DisclosureRefusal).refused === true;
}
