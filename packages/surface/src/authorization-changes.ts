/**
 * @payswap/surface — authorization-change surfaces (P2-W3).
 *
 * NET-NEW module implementing the work order's authorization-change
 * surfaces. Law (Wise §4.2 mapped to the frozen architecture, acceptance
 * checklist §6: "Every material quote/route/recipient/provider change
 * triggers the required revalidation and renewed approval when terms
 * changed"):
 *
 * - a material change ALWAYS requires revalidation of the affected terms;
 * - renewed customer authorization is required when the APPROVED TERMS
 *   changed (quote expiry/terms change, recipient/amount/funding change,
 *   material provider observation change);
 * - authority-side changes (mandate revoked, security epoch advanced) void
 *   the authorization itself — revalidation alone cannot restore it; a new
 *   mandate/epoch-valid authorization is required.
 *
 * PROJECTION LAW (INV-23): the fold references the records (previous/current
 * terms refs, authority record ref, approver ref); it never carries them.
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** Raised when an authorization-change record is invalid (fail-closed). */
export class InvalidAuthorizationChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthorizationChangeError";
  }
}

/** The closed vocabulary of material changes that affect an authorization. */
export const AUTHORIZATION_CHANGE_KINDS = [
  "QUOTE_EXPIRED",
  "QUOTE_TERMS_CHANGED",
  "RECIPIENT_CHANGED",
  "AMOUNT_CHANGED",
  "FUNDING_METHOD_CHANGED",
  "PROVIDER_OBSERVATION_CHANGED",
  "SECURITY_EPOCH_ADVANCED",
  "MANDATE_REVOKED",
] as const;

export type AuthorizationChangeKind = (typeof AUTHORIZATION_CHANGE_KINDS)[number];

/** Whether the approved terms changed (renewed authorization required) or the authority itself changed. */
export type AuthorizationChangeClass = "TERMS_MATERIAL" | "AUTHORITY_SIDE";

/** One authorization-change record — a PROJECTION input (references, never records). */
export interface AuthorizationChangeRecord {
  readonly changeId: string;
  readonly kind: AuthorizationChangeKind;
  /** When the change was detected (explicit input; ISO-8601 string). */
  readonly detectedAt: string;
  /** Reference to the previously approved terms (never the terms themselves). */
  readonly previousTermsRef: string;
  /** Reference to the current terms (never the terms themselves). */
  readonly currentTermsRef: string;
  /** Reference to the authoritative record that owns this change. */
  readonly authorityRecordRef: string;
  /** Reference to who approved the original authorization. */
  readonly approvedByRef: string;
  readonly evidenceRefs: readonly string[];
}

/** The people-language view of one authorization change. */
export interface AuthorizationChangeView {
  readonly changeId: string;
  readonly kind: AuthorizationChangeKind;
  readonly changeClass: AuthorizationChangeClass;
  /** Always true — revalidation is the law for every material change. */
  readonly requiresRevalidation: true;
  /** True when the APPROVED TERMS changed — renewed customer authorization is then required. */
  readonly renewedAuthorizationRequired: boolean;
  readonly headline: string;
  readonly explanation: string;
  /** The person-actionable next step. */
  readonly actionRequired: string;
  readonly previousTermsRef: string;
  readonly currentTermsRef: string;
  readonly authorityRecordRef: string;
  readonly approvedByRef: string;
  readonly evidenceRefs: readonly string[];
  readonly provenance: SurfaceContractProvenance;
}

const TERMS_MATERIAL_KINDS: ReadonlySet<AuthorizationChangeKind> = new Set([
  "QUOTE_EXPIRED",
  "QUOTE_TERMS_CHANGED",
  "RECIPIENT_CHANGED",
  "AMOUNT_CHANGED",
  "FUNDING_METHOD_CHANGED",
  "PROVIDER_OBSERVATION_CHANGED",
] as const satisfies readonly AuthorizationChangeKind[]);

const KIND_HEADLINES: Readonly<Record<AuthorizationChangeKind, string>> = {
  QUOTE_EXPIRED: "The approved quote has expired",
  QUOTE_TERMS_CHANGED: "The quoted terms changed",
  RECIPIENT_CHANGED: "The recipient changed",
  AMOUNT_CHANGED: "The amount changed",
  FUNDING_METHOD_CHANGED: "The funding method changed",
  PROVIDER_OBSERVATION_CHANGED: "A material provider observation changed",
  SECURITY_EPOCH_ADVANCED: "The security epoch advanced",
  MANDATE_REVOKED: "The authorizing mandate was revoked",
};

function explanationFor(kind: AuthorizationChangeKind): string {
  switch (kind) {
    case "QUOTE_EXPIRED":
      return "The quoted terms are no longer offered. The previously approved terms cannot be honored as approved.";
    case "QUOTE_TERMS_CHANGED":
      return "The terms now on record differ from the terms the customer approved.";
    case "RECIPIENT_CHANGED":
      return "The approved authorization was bound to a specific recipient; a different recipient is now in scope.";
    case "AMOUNT_CHANGED":
      return "The approved authorization was bound to a specific amount; a different amount is now in scope.";
    case "FUNDING_METHOD_CHANGED":
      return "The funding route is part of the quoted terms; changing it changes the terms that were approved.";
    case "PROVIDER_OBSERVATION_CHANGED":
      return "A material provider observation (eligibility, terms or state) changed after the approval.";
    case "SECURITY_EPOCH_ADVANCED":
      return "The security epoch moved forward; stale authorizations from the earlier epoch are invalid by design.";
    case "MANDATE_REVOKED":
      return "The mandate that carried the delegated power no longer exists; nothing can proceed under it.";
  }
}

function actionFor(kind: AuthorizationChangeKind): string {
  if (kind === "MANDATE_REVOKED") {
    return "A new mandate must be issued and approved before anything can proceed. Revalidation alone cannot restore a revoked mandate.";
  }
  if (kind === "SECURITY_EPOCH_ADVANCED") {
    return "The authorization must be re-issued under the current epoch. Revalidation alone cannot restore an epoch-stale authorization.";
  }
  return "Revalidate the affected terms and obtain renewed customer authorization for the changed terms before anything moves.";
}

function validateRecord(record: AuthorizationChangeRecord): void {
  if (typeof record.changeId !== "string" || record.changeId.length === 0) {
    throw new InvalidAuthorizationChangeError("changeId must be a non-empty string");
  }
  if (!AUTHORIZATION_CHANGE_KINDS.includes(record.kind)) {
    throw new InvalidAuthorizationChangeError(
      `unknown change kind ${JSON.stringify(record.kind)} — the vocabulary is closed`,
    );
  }
  for (const [field, value] of [
    ["previousTermsRef", record.previousTermsRef],
    ["currentTermsRef", record.currentTermsRef],
    ["authorityRecordRef", record.authorityRecordRef],
    ["approvedByRef", record.approvedByRef],
  ] as const) {
    if (typeof value !== "string" || value.length === 0) {
      throw new InvalidAuthorizationChangeError(
        `${field} must be a non-empty reference (the surface never owns the record)`,
      );
    }
  }
  if (typeof record.detectedAt !== "string" || record.detectedAt.length === 0) {
    throw new InvalidAuthorizationChangeError("detectedAt must be a non-empty ISO-8601 string");
  }
}

/**
 * Fold one authorization-change record into the people-language view. Pure
 * and fail-closed. TERMS_MATERIAL changes always require renewed customer
 * authorization; AUTHORITY_SIDE changes void the authorization itself.
 */
export function foldAuthorizationChange(record: AuthorizationChangeRecord): AuthorizationChangeView {
  validateRecord(record);
  const changeClass: AuthorizationChangeClass = TERMS_MATERIAL_KINDS.has(record.kind)
    ? "TERMS_MATERIAL"
    : "AUTHORITY_SIDE";
  const renewedAuthorizationRequired = changeClass === "TERMS_MATERIAL";
  return {
    changeId: record.changeId,
    kind: record.kind,
    changeClass,
    requiresRevalidation: true,
    renewedAuthorizationRequired,
    headline: KIND_HEADLINES[record.kind],
    explanation: explanationFor(record.kind),
    actionRequired: actionFor(record.kind),
    previousTermsRef: record.previousTermsRef,
    currentTermsRef: record.currentTermsRef,
    authorityRecordRef: record.authorityRecordRef,
    approvedByRef: record.approvedByRef,
    evidenceRefs: record.evidenceRefs,
    provenance: surfaceProvenance("P2-W3"),
  };
}
