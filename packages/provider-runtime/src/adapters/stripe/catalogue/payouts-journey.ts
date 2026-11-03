/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS JOURNEY (P27-B):
 * the plan builders and executor that drive the product slice over the
 * PINNED census through the existing catalogue transport (the ADR-0016 D13
 * extend-per-leg discipline: one new product surface, no kernel rewrite).
 * The typed contracts live in payouts-journey-contracts.ts (the file law);
 * this module re-exports them so the journey surface stays one import.
 *
 * THE JOURNEY (the dated live-doc facts, re-verified 2026-11-03):
 * 1. THE TREASURY PREREQUISITE (V2): Global Payouts requires Treasury — the
 *    funding gate reads the financial account back (GetTreasuryFinancial-
 *    AccountsFinancialAccount) before any payout plan is admitted.
 * 2. THE RECIPIENT: "Create recipients with the API" — the pinned v2 core
 *    Accounts API (PostV2CoreAccounts / GetV2CoreAccountsId / persons), the
 *    recipient's identity anchored on the account.
 * 3. THE HOSTED RECIPIENT-INFORMATION FORM: "have recipients enter in their
 *    own information using prebuilt information collection forms" — the
 *    pinned PostV2CoreAccountLinks (an Account Link) at its REAUTH tier:
 *    execution refuses without the host re-authentication proof reference
 *    (ADR-0018; the proof machinery is the desktop host's, P27-A/TL scope).
 * 4. THE PAYOUT: the pinned v1 Treasury third-party payout create
 *    (PostTreasuryOutboundPayments) from the funded financial account, with
 *    the destination bank details riding the pinned
 *    destination_payment_method_data surface and the third-party proof the
 *    API requires (end_user_details.present).
 * 5. STATUS / READ-BACK / RECONCILIATION: GetTreasuryOutboundPaymentsId
 *    (the derived read-back), the outbound-payments list, the Treasury
 *    transactions/transaction-entries ledger and the events APIs.
 * 6. RETURNS / EXCEPTIONS: cancel only while the provider says cancelable
 *    (the dated status law); the received-debits/debit-reversal surfaces for
 *    returned payouts; the pinned sandbox test helpers simulate post/fail/
 *    return (test-mode only).
 *
 * THE APPROVAL LAW (never a parallel kernel): a plan carries its
 * census-derived tier; the product slice requires the STRICTER of the census
 * tier and the product law — the payout create/cancel demand the
 * STRONG_CONFIRM marker (a third-party money movement; the dated docs' own
 * risk posture), the hosted form demands the REAUTH proof reference.
 * executePlan REFUSES (typed, pre-dispatch) when the required approval
 * marker or the v1 idempotency key is absent — it never self-approves.
 *
 * THE ELIGIBILITY LAW: an outbound-payment plan can only be built from an
 * ELIGIBLE verdict (payouts-eligibility.ts); OPERATOR_GATED and REFUSED
 * journeys produce typed NOT_PLANNED records — never a route, never a silent
 * pass. INV-04: every execution maps the transport's UNKNOWN first-class
 * with the reconcile read-back named — never a blind retry.
 */

import { ValidationError } from '../../../errors.ts';
import { stripeReadBackOperationOf } from './read-back-routes.ts';
import { globalPayoutsCensusRecordOf, isForbiddenGlobalPayoutsAliasOperation } from './payouts-product.ts';
import { evaluateGlobalPayoutsJourneyEligibility } from './payouts-eligibility.ts';
import { globalPayoutsOutboundPaymentCancellable } from './payouts-status.ts';
import { executeStripeGlobalPayoutsPlan } from './payouts-journey-executor.ts';
import type {
  StripeGlobalPayoutsJourney,
  StripeGlobalPayoutsJourneyDeps,
  StripeGlobalPayoutsDispatchPlan,
  StripeGlobalPayoutsPlanApproval,
  StripeGlobalPayoutsPlanApprovalRequirement,
  StripeGlobalPayoutsOutboundPaymentInput,
} from './payouts-journey-contracts.ts';

/* The typed contracts live in payouts-journey-contracts.ts; re-exported here
 * so the journey surface stays one import (the tests and the harness consume
 * both names from this module). */
export type {
  StripeGlobalPayoutsPlanApproval,
  StripeGlobalPayoutsPlanApprovalRequirement,
  StripeGlobalPayoutsDispatchPlan,
  StripeGlobalPayoutsJourneyExecutionResult,
  StripeGlobalPayoutsPlanFactoryInput,
  StripeGlobalPayoutsPlanFactory,
  StripeGlobalPayoutsJourneyDeps,
  StripeGlobalPayoutsJourney,
  StripeGlobalPayoutsRecipientCreationInput,
  StripeGlobalPayoutsHostedFormInput,
  StripeGlobalPayoutsPayoutDestination,
  StripeGlobalPayoutsOutboundPaymentInput,
  StripeGlobalPayoutsOutboundPaymentPlanResult,
  StripeGlobalPayoutsCancellationPlanResult,
} from './payouts-journey-contracts.ts';

/** Build the product journey driver. */
export function createStripeGlobalPayoutsJourney(
  deps: StripeGlobalPayoutsJourneyDeps,
): StripeGlobalPayoutsJourney {
  /** The plan factory: census-resolved, never-alias-checked, frozen. */
  function plan(input: {
    readonly planId: string;
    readonly operationId: string;
    readonly role: import('./payouts-product.ts').StripeGlobalPayoutsOperationRole;
    readonly params: Readonly<Record<string, unknown>>;
    readonly approvalRequirement: StripeGlobalPayoutsPlanApprovalRequirement;
    readonly idempotencyKey: string | null;
    readonly sandboxOnly?: boolean;
    readonly pinnedSurfaceNote?: string;
  }): StripeGlobalPayoutsDispatchPlan {
    // THE NEVER-ALIAS GATE (ADR-0020 D4) runs on every plan, machine-enforced.
    if (isForbiddenGlobalPayoutsAliasOperation(input.operationId)) {
      throw new ValidationError(
        `operation '${input.operationId}' is a forbidden alias for the Global-Payouts product (D4) — the plan is refused`,
      );
    }
    const census = globalPayoutsCensusRecordOf(input.operationId);
    const keyRequired = census.approvalTier !== 'NONE' && census.method === 'POST' && census.apiNamespace === 'v1';
    return Object.freeze({
      planId: input.planId,
      operationId: input.operationId,
      role: input.role,
      params: Object.freeze({ ...input.params }),
      approvalRequirement: input.approvalRequirement,
      censusApprovalTier: census.approvalTier,
      idempotencyKeyRequired: keyRequired,
      idempotencyKey: input.idempotencyKey,
      readBackOperationId: stripeReadBackOperationOf(input.operationId),
      sandboxOnly: input.sandboxOnly === true,
      ...(input.pinnedSurfaceNote !== undefined ? { pinnedSurfaceNote: input.pinnedSurfaceNote } : {}),
    });
  }

  return {
    /** The Treasury prerequisite read (V2): prove the funded financial account. */
    buildFundingReadbackPlan({ financialAccountId }) {
      return plan({
        planId: `global-payouts:funding-readback:${financialAccountId}`,
        operationId: 'GetTreasuryFinancialAccountsFinancialAccount',
        role: 'TREASURY_FUNDING_PREREQUISITE',
        params: { financial_account: financialAccountId },
        approvalRequirement: 'NONE',
        idempotencyKey: null,
      });
    },

    /** Create the recipient (the pinned Accounts API; the recipient's identity anchor). */
    buildRecipientCreationPlan(input) {
      const identity: Record<string, unknown> = {
        country: input.country,
        entity_type: input.entityType,
      };
      if (input.individual !== undefined) {
        identity.individual = Object.freeze({ ...input.individual });
      }
      if (input.businessDetails !== undefined) {
        identity.business_details = Object.freeze({ ...input.businessDetails });
      }
      const params: Record<string, unknown> = { identity: Object.freeze(identity) };
      if (input.contactEmail !== undefined) params.contact_email = input.contactEmail;
      if (input.displayName !== undefined) params.display_name = input.displayName;
      if (input.metadata !== undefined) params.metadata = Object.freeze({ ...input.metadata });
      return plan({
        planId: `global-payouts:recipient-create:${input.country}:${input.entityType}`,
        operationId: 'PostV2CoreAccounts',
        role: 'RECIPIENT_CREATION',
        params,
        approvalRequirement: 'CONFIRM',
        idempotencyKey: null,
        pinnedSurfaceNote:
          'the pinned v2 core accounts schema carries the recipient identity surface; the live docs\' Global-Payouts ' +
          'recipient payout-method capability tokens (recipient.capabilities.bank_accounts.*, cards) are NOT in the ' +
          'pinned request schema — over the pinned surface the payout details ride the outbound payment\'s ' +
          'destination_payment_method_data (see the census gap record)',
      });
    },

    /**
     * The hosted recipient-information form: an Account Link the recipient is
     * redirected to ("Let Stripe handle recipient onboarding… In the API,
     * redirect them with an Account Link" — live docs 2026-11-03). REAUTH
     * tier: executePlan refuses without the host proof reference.
     */
    buildHostedRecipientInformationFormPlan(input) {
      if (typeof input.refreshUrl !== 'string' || input.refreshUrl.length === 0) {
        throw new ValidationError('the hosted recipient form requires the refreshUrl (the pinned API marks it required)');
      }
      const useCase: Record<string, unknown> = {
        type: input.useCaseType,
        [input.useCaseType]: Object.freeze({
          refresh_url: input.refreshUrl,
          ...(input.returnUrl !== undefined ? { return_url: input.returnUrl } : {}),
        }),
      };
      return plan({
        planId: `global-payouts:recipient-hosted-form:${input.accountId}:${input.useCaseType}`,
        operationId: 'PostV2CoreAccountLinks',
        role: 'RECIPIENT_HOSTED_INFORMATION_FORM',
        params: {
          account: input.accountId,
          use_case: Object.freeze(useCase),
        },
        approvalRequirement: 'REAUTH',
        idempotencyKey: null,
      });
    },

    /**
     * THE PAYOUT PLAN — eligibility-gated (the fail-closed law): only an
     * ELIGIBLE verdict yields a plan; OPERATOR_GATED/REFUSED journeys yield
     * the typed NOT_PLANNED record with the verdict (never a route).
     */
    buildOutboundPaymentPlan(input: StripeGlobalPayoutsOutboundPaymentInput) {
      const eligibility = evaluateGlobalPayoutsJourneyEligibility(input.journey);
      if (eligibility.kind !== 'ELIGIBLE') {
        return { kind: 'NOT_PLANNED' as const, eligibility };
      }
      const destination: Record<string, unknown> = { type: input.destination.type };
      if (input.destination.type === 'financial_account') {
        if (typeof input.destination.financialAccount !== 'string' || input.destination.financialAccount.length === 0) {
          throw new ValidationError('a financial_account destination requires the financial account id');
        }
        destination.financial_account = input.destination.financialAccount;
      } else if (input.destination.type === 'us_bank_account') {
        const bank = input.destination.usBankAccount;
        if (bank === undefined) {
          throw new ValidationError('a us_bank_account destination requires the us_bank_account details');
        }
        destination.us_bank_account = Object.freeze({
          account_number: bank.accountNumber,
          routing_number: bank.routingNumber,
          ...(bank.accountHolderType !== undefined ? { account_holder_type: bank.accountHolderType } : {}),
          ...(bank.accountType !== undefined ? { account_type: bank.accountType } : {}),
        });
        if (input.destination.billingDetails !== undefined) {
          destination.billing_details = Object.freeze({ ...input.destination.billingDetails });
        }
      } else {
        throw new ValidationError(
          'the pinned destination surface supports financial_account or us_bank_account destinations only (the census law)',
        );
      }
      const params: Record<string, unknown> = {
        financial_account: input.financialAccountId,
        amount: input.journey.amountMinorUnits,
        currency: input.journey.sendingCurrency.toLowerCase(),
        destination_payment_method_data: Object.freeze(destination),
        // THE THIRD-PARTY PROOF (the pinned API's own law): end_user_details.present is required.
        end_user_details: Object.freeze({ present: true }),
      };
      if (input.statementDescriptor !== undefined) params.statement_descriptor = input.statementDescriptor;
      if (input.metadata !== undefined) params.metadata = Object.freeze({ ...input.metadata });
      const idempotencyKey = input.idempotencyKey;
      return {
        kind: 'PLAN' as const,
        eligibility,
        plan: plan({
          planId: `global-payouts:outbound-payment:${input.financialAccountId}:${input.journey.recipientCountryCode}:${String(input.journey.amountMinorUnits)}`,
          operationId: 'PostTreasuryOutboundPayments',
          role: 'PAYOUT_EXECUTION',
          params,
          // THE PRODUCT LAW: a third-party money movement is a STRONG_CONFIRM
          // effect (the census currently derives CONFIRM for the create-at-
          // collection path — the 3-segment family-derivation catch recorded
          // in the lane report; the product tier is the stricter law here).
          approvalRequirement: 'STRONG_CONFIRM',
          idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : null,
          pinnedSurfaceNote:
            'the pinned v1 Treasury outbound payment carries the destination bank details inline ' +
            '(destination_payment_method_data); the live docs\' recipient + payout-method model ' +
            '(POST /v2/money_management/outbound_payments, to.recipient + to.payout_method) is not pinned — see the census gap',
        }),
      };
    },

    /** The status read-back (the derived verification route). */
    buildOutboundPaymentStatusPlan({ outboundPaymentId }) {
      return plan({
        planId: `global-payouts:outbound-payment-status:${outboundPaymentId}`,
        operationId: 'GetTreasuryOutboundPaymentsId',
        role: 'PAYOUT_STATUS_READ_BACK',
        params: { id: outboundPaymentId },
        approvalRequirement: 'NONE',
        idempotencyKey: null,
      });
    },

    /**
     * The cancellation path — the dated status law: "You can cancel the
     * payout while its OutboundPayment's cancelable field is true." A payout
     * outside that law is refused TYPED (never a guessed cancel).
     */
    buildOutboundPaymentCancellationPlan(input) {
      if (!globalPayoutsOutboundPaymentCancellable(input.classification)) {
        return Object.freeze({
          kind: 'NOT_PLANNED' as const,
          reason: 'PAYOUT_NOT_CANCELLABLE' as const,
          detail:
            'the payout is not in a cancellable state (the dated law: cancel only while status is processing AND the provider\'s cancelable field is true)',
        });
      }
      return Object.freeze({
        kind: 'PLAN' as const,
        plan: plan({
          planId: `global-payouts:outbound-payment-cancel:${input.outboundPaymentId}`,
          operationId: 'PostTreasuryOutboundPaymentsIdCancel',
          role: 'PAYOUT_CANCELLATION',
          params: { id: input.outboundPaymentId },
          approvalRequirement: 'STRONG_CONFIRM',
          idempotencyKey: input.idempotencyKey,
        }),
      });
    },

    /** The reconciliation plans (the ledger + the payout list — all reads). */
    buildReconciliationPlans({ financialAccountId }) {
      return [
        plan({
          planId: `global-payouts:reconciliation:outbound-payments:${financialAccountId}`,
          operationId: 'GetTreasuryOutboundPayments',
          role: 'RECONCILIATION',
          params: { financial_account: financialAccountId },
          approvalRequirement: 'NONE',
          idempotencyKey: null,
        }),
        plan({
          planId: `global-payouts:reconciliation:transactions:${financialAccountId}`,
          operationId: 'GetTreasuryTransactions',
          role: 'RECONCILIATION',
          params: { financial_account: financialAccountId },
          approvalRequirement: 'NONE',
          idempotencyKey: null,
        }),
        plan({
          planId: `global-payouts:reconciliation:transaction-entries:${financialAccountId}`,
          operationId: 'GetTreasuryTransactionEntries',
          role: 'RECONCILIATION',
          params: { financial_account: financialAccountId },
          approvalRequirement: 'NONE',
          idempotencyKey: null,
        }),
      ];
    },

    /** The sandbox return/exception simulation (the pinned test helpers — test-mode only). */
    buildSandboxReturnSimulationPlan(input) {
      const operationId =
        input.outcome === 'post'
          ? 'PostTestHelpersTreasuryOutboundPaymentsIdPost'
          : input.outcome === 'fail'
            ? 'PostTestHelpersTreasuryOutboundPaymentsIdFail'
            : 'PostTestHelpersTreasuryOutboundPaymentsIdReturn';
      return plan({
        planId: `global-payouts:sandbox-simulation:${input.outcome}:${input.outboundPaymentId}`,
        operationId,
        role: 'SANDBOX_RETURN_SIMULATION',
        params: { id: input.outboundPaymentId },
        approvalRequirement: 'CONFIRM',
        idempotencyKey: input.idempotencyKey,
        sandboxOnly: true,
      });
    },

    /**
     * THE EXECUTOR — the approval/idempotency/alias gates + the typed result
     * mapping (INV-04) live in payouts-journey-executor.ts; wired here.
     */
    executePlan: (dispatchPlan, context, approval) =>
      executeStripeGlobalPayoutsPlan(deps, dispatchPlan, context, approval),
  };
}
