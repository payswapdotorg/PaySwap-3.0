/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS JOURNEY contracts
 * (P27-B): the typed plan, approval, execution-result and builder-input
 * surfaces of the product journey (payouts-journey.ts implements them).
 *
 * THE CONTRACT LAWS (the companion header in payouts-journey.ts carries the
 * dated journey facts, re-verified 2026-11-03):
 * - a plan is a FROZEN record resolved from the pinned census (never a raw
 *   operationId string floating free);
 * - the approval marker seam is the EXISTING two-phase contract's (the
 *   STRONG_CONFIRM marker and the host REAUTH proof reference, ADR-0018) —
 *   the slice demands them, it never mints them (never a parallel kernel);
 * - execution results are typed and total: EXECUTED / UNKNOWN_AFTER_DISPATCH
 *   (with the reconcile read-back named — INV-04) / PROVIDER_ERROR /
 *   REFUSED_PRE_DISPATCH;
 * - the outbound-payment plan result is discriminated: a plan exists ONLY
 *   for an ELIGIBLE verdict (payouts-eligibility.ts) — every other verdict
 *   yields the typed NOT_PLANNED record, never a route.
 */

import type { StripeCallContext } from '../transport/call-context.ts';
import type { StripeCatalogueTransport } from '../transport/catalogue-transport.ts';
import type { StripeGlobalPayoutsOperationRole } from './payouts-product.ts';
import type {
  StripeGlobalPayoutsJourneyInput,
  ExtractStripeGlobalPayoutsEligibleVerdict,
  ExcludeStripeGlobalPayoutsEligibleVerdict,
} from './payouts-eligibility.ts';
import type { StripeGlobalPayoutsOutboundPaymentClassification } from './payouts-status.ts';

/** The approval marker an execution must present (the existing two-phase contract's seam). */
export interface StripeGlobalPayoutsPlanApproval {
  /** The STRONG_CONFIRM marker (the product law for money-movement plans). */
  readonly strongConfirmationApproved?: boolean;
  /** The opaque host re-authentication proof reference (ADR-0018 — minted by the desktop host). */
  readonly reauthenticationProofRef?: string;
  /** The registrar-scoped idempotency key (required for v1 state-changing plans). */
  readonly idempotencyKey?: string;
}

/** The product approval requirement of a plan (the stricter of census tier and product law). */
export type StripeGlobalPayoutsPlanApprovalRequirement = 'NONE' | 'CONFIRM' | 'STRONG_CONFIRM' | 'REAUTH';

/** One frozen dispatch plan over the pinned census. */
export interface StripeGlobalPayoutsDispatchPlan {
  readonly planId: string;
  readonly operationId: string;
  readonly role: StripeGlobalPayoutsOperationRole;
  readonly params: Readonly<Record<string, unknown>>;
  readonly approvalRequirement: StripeGlobalPayoutsPlanApprovalRequirement;
  readonly censusApprovalTier: string;
  readonly idempotencyKeyRequired: boolean;
  readonly idempotencyKey: string | null;
  readonly readBackOperationId: string | null;
  /** Test-mode-only plan (the pinned test_helpers family). */
  readonly sandboxOnly: boolean;
  /** The honest pinned-surface limit note the plan carries (the census-gap disclosure). */
  readonly pinnedSurfaceNote?: string;
}

/** The typed, frozen execution outcome. */
export type StripeGlobalPayoutsJourneyExecutionResult = Readonly<
  | {
      readonly kind: 'EXECUTED';
      readonly plan: StripeGlobalPayoutsDispatchPlan;
      readonly status: number;
      readonly body: unknown;
      readonly requestId: string | null;
      readonly idempotencyKeyBound: boolean;
    }
  | {
      readonly kind: 'UNKNOWN_AFTER_DISPATCH';
      readonly plan: StripeGlobalPayoutsDispatchPlan;
      readonly ambiguity: string;
      readonly note: string;
      /** The INV-04 reconcile path: the read-back operation to consult, never a blind retry. */
      readonly reconcileOperationId: string | null;
      readonly requestId: string | null;
    }
  | {
      readonly kind: 'PROVIDER_ERROR';
      readonly plan: StripeGlobalPayoutsDispatchPlan;
      readonly error: unknown;
      readonly body: unknown;
      readonly requestId: string | null;
    }
  | {
      readonly kind: 'REFUSED_PRE_DISPATCH';
      readonly plan: StripeGlobalPayoutsDispatchPlan;
      readonly reason:
        | 'ALIAS_OPERATION_FORBIDDEN'
        | 'APPROVAL_STRONG_CONFIRM_REQUIRED'
        | 'REAUTH_PROOF_REQUIRED'
        | 'IDEMPOTENCY_KEY_REQUIRED'
        | 'PAYOUT_NOT_CANCELLABLE'
        | 'TRANSPORT_REFUSED';
      readonly detail: string;
    }
>;

/** The input of the plan factory (census-resolved by the factory, never here). */
export interface StripeGlobalPayoutsPlanFactoryInput {
  readonly planId: string;
  readonly operationId: string;
  readonly role: StripeGlobalPayoutsOperationRole;
  readonly params: Readonly<Record<string, unknown>>;
  readonly approvalRequirement: StripeGlobalPayoutsPlanApprovalRequirement;
  readonly idempotencyKey: string | null;
  readonly sandboxOnly?: boolean;
  readonly pinnedSurfaceNote?: string;
}

/** The plan factory (the never-alias + census-resolution law runs inside it). */
export type StripeGlobalPayoutsPlanFactory = (
  input: StripeGlobalPayoutsPlanFactoryInput,
) => StripeGlobalPayoutsDispatchPlan;

/** The dependencies (injected; the transport binding law is the caller's). */
export interface StripeGlobalPayoutsJourneyDeps {
  readonly transport: StripeCatalogueTransport;
}

/** The recipient-creation input (the pinned v2 core accounts identity surface). */
export interface StripeGlobalPayoutsRecipientCreationInput {
  /** ISO 3166-1 alpha-2 recipient country. */
  readonly country: string;
  readonly entityType: 'company' | 'government_entity' | 'individual' | 'non_profit';
  readonly contactEmail?: string;
  readonly displayName?: string;
  /** Individual recipient identity fields (the pinned schema's individual surface). */
  readonly individual?: Readonly<Record<string, unknown>>;
  /** Business recipient identity fields (the pinned schema's business_details surface). */
  readonly businessDetails?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** The hosted recipient-information-form input (an Account Link for the recipient). */
export interface StripeGlobalPayoutsHostedFormInput {
  /** The recipient account id (acct_…). */
  readonly accountId: string;
  /** 'account_onboarding' collects the recipient's information the first time. */
  readonly useCaseType: 'account_onboarding' | 'account_update';
  /** Required by the pinned API (the link refresh URL). */
  readonly refreshUrl: string;
  readonly returnUrl?: string;
}

/** The third-party destination over the PINNED surface. */
export type StripeGlobalPayoutsPayoutDestination =
  | {
      readonly type: 'financial_account';
      readonly financialAccount: string;
    }
  | {
      readonly type: 'us_bank_account';
      readonly usBankAccount: {
        readonly accountNumber: string;
        readonly routingNumber: string;
        readonly accountHolderType?: 'individual' | 'company';
        readonly accountType?: 'checking' | 'savings';
      };
      readonly billingDetails?: Readonly<Record<string, unknown>>;
    };

/** The outbound-payment plan input: the typed journey facts + the pinned destination. */
export interface StripeGlobalPayoutsOutboundPaymentInput {
  /** The eligibility input (the gates run INSIDE the builder — fail-closed). */
  readonly journey: StripeGlobalPayoutsJourneyInput;
  /** The funded financial account the payout moves funds from. */
  readonly financialAccountId: string;
  readonly destination: StripeGlobalPayoutsPayoutDestination;
  /** The registrar-scoped idempotency key (v1 write law). */
  readonly idempotencyKey: string;
  readonly statementDescriptor?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** The outbound-payment plan result: a plan ONLY when eligible. */
export type StripeGlobalPayoutsOutboundPaymentPlanResult = Readonly<
  | {
      readonly kind: 'PLAN';
      readonly plan: StripeGlobalPayoutsDispatchPlan;
      readonly eligibility: ExtractStripeGlobalPayoutsEligibleVerdict;
    }
  | {
      readonly kind: 'NOT_PLANNED';
      readonly eligibility: ExcludeStripeGlobalPayoutsEligibleVerdict;
    }
>;

/** The cancellation plan result: a plan ONLY under the dated cancellable law. */
export type StripeGlobalPayoutsCancellationPlanResult = Readonly<
  | {
      readonly kind: 'PLAN';
      readonly plan: StripeGlobalPayoutsDispatchPlan;
    }
  | {
      readonly kind: 'NOT_PLANNED';
      readonly reason: 'PAYOUT_NOT_CANCELLABLE';
      readonly detail: string;
    }
>;

/** The product journey driver surface (createStripeGlobalPayoutsJourney's return). */
export interface StripeGlobalPayoutsJourney {
  readonly buildFundingReadbackPlan: (input: { readonly financialAccountId: string }) => StripeGlobalPayoutsDispatchPlan;
  readonly buildRecipientCreationPlan: (input: StripeGlobalPayoutsRecipientCreationInput) => StripeGlobalPayoutsDispatchPlan;
  readonly buildHostedRecipientInformationFormPlan: (input: StripeGlobalPayoutsHostedFormInput) => StripeGlobalPayoutsDispatchPlan;
  readonly buildOutboundPaymentPlan: (
    input: StripeGlobalPayoutsOutboundPaymentInput,
  ) => StripeGlobalPayoutsOutboundPaymentPlanResult;
  readonly buildOutboundPaymentStatusPlan: (input: { readonly outboundPaymentId: string }) => StripeGlobalPayoutsDispatchPlan;
  readonly buildOutboundPaymentCancellationPlan: (input: {
    readonly outboundPaymentId: string;
    readonly classification: StripeGlobalPayoutsOutboundPaymentClassification;
    readonly idempotencyKey: string;
  }) => StripeGlobalPayoutsCancellationPlanResult;
  readonly buildReconciliationPlans: (input: {
    readonly financialAccountId: string;
  }) => readonly StripeGlobalPayoutsDispatchPlan[];
  readonly buildSandboxReturnSimulationPlan: (input: {
    readonly outboundPaymentId: string;
    readonly outcome: 'post' | 'fail' | 'return';
    readonly idempotencyKey: string;
  }) => StripeGlobalPayoutsDispatchPlan;
  readonly executePlan: (
    plan: StripeGlobalPayoutsDispatchPlan,
    context: StripeCallContext,
    approval?: StripeGlobalPayoutsPlanApproval,
  ) => Promise<StripeGlobalPayoutsJourneyExecutionResult>;
}
