/**
 * @payswap/app — STRUCTURAL PINS of the frozen Stripe prepared-action
 * contracts (P24-3, ADR-0017 D10).
 *
 * MIRROR DISCIPLINE (the missionIntakePins.ts pattern): @payswap/app src
 * NEVER imports the desktop host — the frozen two-phase action contract
 * is pinned STRUCTURALLY here, mirroring
 * packages/desktop/src/host/payswap/stripe/prepared-action-contracts.ts
 * (READ-ONLY reference, never imported by src). The pinned vocabularies
 * mirror the provider-runtime overlay's runtime constants
 * (STRIPE_EFFECT_CLASSES / STRIPE_APPROVAL_TIERS / STRIPE_SUPPORT_STATES
 * — the desktop contracts' own declared single source), verified against
 * the REAL source by test/payswap/agent-stripe-prepared-action-pins
 * -mirror.test.ts (test-only relative imports; the src/** boundary stays
 * clean). The TL wires the real imports at P24-D integration.
 *
 * LAWS carried from the frozen source (each is load-bearing):
 * - A prepared action is PaySwap-LOCAL data: no credential, no raw HTTP,
 *   no provider promise. The catalogue operationId is the ONLY
 *   executable handle there is.
 * - The preview digest binds the EXACT normalized parameters; the
 *   authorization artifact binds the digest. Change one byte → the
 *   artifact no longer matches → a NEW preview is required.
 * - The authorization is host-MINTED, single-use, expiring. The MODEL
 *   can reference it; it can never mint, edit, extend or supply a valid
 *   one — the model-side flow carries preparedActionId ONLY.
 * - UNKNOWN is never collapsed into FAILED (INV-04).
 */

/* ------------------------- the pinned vocabularies ------------------ */

/** Mirrors the frozen StripeActionEnvironment union. */
export const STRIPE_ACTION_ENVIRONMENTS_PIN = ["SANDBOX", "LIVE"] as const;
export type StripeActionEnvironmentPin = (typeof STRIPE_ACTION_ENVIRONMENTS_PIN)[number];

/** Mirrors the overlay's STRIPE_EFFECT_CLASSES (the desktop contracts' declared source). */
export const STRIPE_ACTION_EFFECT_CLASSES_PIN = [
  "READ_ONLY",
  "STRIPE_CONFIGURATION_WRITE",
  "CUSTOMER_COMMUNICATION",
  "FINANCIAL_CREATE",
  "FINANCIAL_IRREVERSIBLE_OR_REVERSAL",
  "PERMISSION_OR_CREDENTIAL_ADMIN",
] as const;
export type StripeActionEffectClassPin = (typeof STRIPE_ACTION_EFFECT_CLASSES_PIN)[number];

/** Mirrors the overlay's STRIPE_APPROVAL_TIERS. */
export const STRIPE_ACTION_APPROVAL_TIERS_PIN = [
  "NONE",
  "CONFIRM",
  "STRONG_CONFIRM",
  "REAUTH",
] as const;
export type StripeActionApprovalTierPin = (typeof STRIPE_ACTION_APPROVAL_TIERS_PIN)[number];

/** Mirrors the overlay's STRIPE_SUPPORT_STATES. */
export const STRIPE_SUPPORT_STATES_PIN = [
  "IMPLEMENTED",
  "IMPLEMENTED_WITH_LIMITS",
  "PLANNED_P24_INITIAL_RELEASE",
  "ACCOUNT_GATED",
  "OPERATOR_CONFIG_REQUIRED",
  "SANDBOX_TEST_HELPER_ONLY",
  "MANUAL_PROVIDER_UI_ONLY",
  "NOT_SUPPORTED_WITH_REASON",
  "DEPRECATED_OR_REMOVED",
] as const;
export type StripeSupportStatePin = (typeof STRIPE_SUPPORT_STATES_PIN)[number];

/** Mirrors the frozen StripeActionAccountContext.accountModel union. */
export const STRIPE_ACCOUNT_MODELS_PIN = [
  "OWN_ACCOUNT_RESTRICTED_KEY",
  "DELEGATED_OAUTH",
  "CONNECT_PLATFORM",
  "CONNECT_CONNECTED_ACCOUNT",
  "ORGANIZATION",
] as const;
export type StripeAccountModelPin = (typeof STRIPE_ACCOUNT_MODELS_PIN)[number];

/* --------------------------- the pinned shapes ---------------------- */

/** Mirrors the frozen StripeActionAccountContext (host-resolved, never model-supplied). */
export interface StripeActionAccountContextPin {
  readonly connectionId: string;
  readonly stripeAccountId: string;
  readonly accountModel: StripeAccountModelPin;
  readonly environment: StripeActionEnvironmentPin;
}

/** Mirrors the frozen StripeActionParameter. */
export interface StripeActionParameterPin {
  readonly name: string;
  readonly value: unknown;
  readonly location: "path" | "query" | "body";
}

/** Mirrors the frozen StripePreparedAction (immutable once created). */
export interface StripePreparedActionPin {
  readonly preparedActionId: string;
  readonly operationId: string;
  readonly catalogueRelease: string;
  readonly accountContext: StripeActionAccountContextPin;
  readonly parameters: readonly StripeActionParameterPin[];
  readonly digest: string;
  readonly effectClass: StripeActionEffectClassPin;
  readonly approvalTier: StripeActionApprovalTierPin;
  readonly confirmationInputs: readonly string[];
  readonly idempotencyKeyRef: string;
  readonly readBackOperationId: string | null;
  readonly expiresAt: string;
  readonly createdBy: "model_proposal" | "user_direct";
}

/** Mirrors the frozen StripeActionAuthorization (host-minted, single-use, expiring). */
export interface StripeActionAuthorizationPin {
  readonly authorizationId: string;
  readonly preparedActionId: string;
  readonly approvedDigest: string;
  readonly approvedByPrincipalId: string;
  readonly accountContext: StripeActionAccountContextPin;
  readonly consumedAt: string | null;
  readonly expiresAt: string;
}

/** Mirrors the frozen StripeActionExecutionOutcome (UNKNOWN is first-class — INV-04). */
export type StripeActionExecutionOutcomePin =
  | {
      readonly kind: "CONFIRMED";
      readonly providerRefs: readonly string[];
      readonly readBackDue: boolean;
    }
  | {
      readonly kind: "UNKNOWN";
      readonly reconciliationOperationId: string | null;
      readonly note: string;
    }
  | {
      readonly kind: "FAILED";
      readonly reason:
        | "REFUSED_BEFORE_DISPATCH"
        | "PERMISSION_MISSING"
        | "VALIDATION"
        | "POLICY";
      readonly detail: string;
    }
  | {
      readonly kind: "PROVIDER_REJECTED";
      readonly httpStatus: number;
      readonly providerErrorCode: string | null;
    };

/* ------------------------- the pinned validators -------------------- */

/** Fail-closed structural validation of a prepared action (the app's read side). */
export function requireValidPreparedActionPin(candidate: unknown): StripePreparedActionPin {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("a prepared action must be a record");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  for (const field of [
    "preparedActionId",
    "operationId",
    "catalogueRelease",
    "digest",
    "idempotencyKeyRef",
    "expiresAt",
  ] as const) {
    if (typeof record[field] !== "string" || (record[field] as string).length === 0) {
      throw new Error(`prepared action .${field} must be a non-empty string`);
    }
  }
  if (!(STRIPE_ACTION_EFFECT_CLASSES_PIN as readonly string[]).includes(record.effectClass as string)) {
    throw new Error(`prepared action .effectClass '${String(record.effectClass)}' is not in the pinned vocabulary`);
  }
  if (!(STRIPE_ACTION_APPROVAL_TIERS_PIN as readonly string[]).includes(record.approvalTier as string)) {
    throw new Error(`prepared action .approvalTier '${String(record.approvalTier)}' is not in the pinned vocabulary`);
  }
  if (record.createdBy !== "model_proposal" && record.createdBy !== "user_direct") {
    throw new Error("prepared action .createdBy must be model_proposal or user_direct");
  }
  if (!Array.isArray(record.parameters) || !Array.isArray(record.confirmationInputs)) {
    throw new Error("prepared action .parameters and .confirmationInputs must be arrays");
  }
  if (typeof record.readBackOperationId !== "string" && record.readBackOperationId !== null) {
    throw new Error("prepared action .readBackOperationId must be a string or null");
  }
  const context = record.accountContext as unknown;
  if (context === null || typeof context !== "object") {
    throw new Error("prepared action .accountContext must be a record");
  }
  return Object.freeze({
    ...(candidate as StripePreparedActionPin),
    parameters: Object.freeze([...(candidate as StripePreparedActionPin).parameters]),
    confirmationInputs: Object.freeze([...(candidate as StripePreparedActionPin).confirmationInputs]),
  });
}
