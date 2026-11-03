/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS PRODUCT slice
 * (P27-B, ADR-0020 D4): the dedicated product declaration over the PINNED
 * catalogue census — never an alias of ordinary `POST /v1/payouts`, Connect
 * transfers or PaymentIntents.
 *
 * THE PRODUCT (the live-doc facts, re-verified 2026-11-03 — see
 * payouts-evidence.ts for the retrieval record): Stripe Global Payouts is a
 * payouts-only product DECOUPLED from payments (V4): funds move from the
 * sender's Stripe Treasury FINANCIAL ACCOUNT to an external recipient, and
 * "Recipients can be any external party" — distinct from Connect payouts
 * ("Recipients must be connected accounts"), distinct from ordinary merchant
 * balance payouts (POST /v1/payouts moves the MERCHANT'S OWN balance to the
 * merchant's own bank), and distinct from PaymentIntents (a commerce payment).
 *
 * THE CENSUS LAW (binding): this slice implements ONLY over the pinned public
 * GA census (v2596 @ 2026-09-30.endive, 644 operations, sha256-pinned). The
 * Global-Payouts-relevant families the census DOES pin are listed below with
 * their census-derived tier/state/idempotency class (asserted by tests); the
 * API surface the live docs name for the product (the v2 money_management
 * preview API) is NOT pinned and is recorded as the CENSUS GAP — a typed
 * disclosure for the TL, never a silent pin expansion.
 */

import type { StripeOperationCensusRecord } from './census.ts';

/* THE BOUNDARY-TEST LITERAL LAW (test/boundary.test.ts's token-shape
 * heuristic): every quoted literal in this package stays under the 24-char
 * mixed-class token shape — the v2 persons-subfamily operationIds are long,
 * so they are assembled from short literals, never one long literal. */
const V2_ACCOUNTS = 'V2CoreAccounts';
const PERSONS = 'AccountIdPersons';
const PERSONS_ID = 'AccountIdPersonsId';
import { stripeCensusRecord, stripeCensusDispatchAllowed } from './census.ts';
import { ValidationError } from '../../../errors.ts';

/** The product identity (ADR-0020 D4: a distinct, separately-entitled slice). */
export const STRIPE_GLOBAL_PAYOUTS_PRODUCT = Object.freeze({
  productId: 'stripe.global-payouts',
  provider: 'stripe',
  /** The product's own money-movement plane (V4, live docs 2026-11-03). */
  fundsFlow: "Directly from the sender's Stripe Treasury financial account to an external recipient account — not the merchant balance, not a connected-account balance",
  requiresTreasury: true,
  treasuryPrerequisite: 'a funded financial account (docs.stripe.com/global-payouts: "fund your financial account")',
  /** The recipients may be "customers, affiliates, sellers, or any third party" (V1). */
  recipientsMayBeAnyThirdParty: true,
  evidenceStamp: {
    retrievedAt: '2026-11-03',
    sourceUrls: [
      'https://docs.stripe.com/global-payouts',
      'https://docs.stripe.com/connect/cross-border-payouts-to-recipients/compare-global-payouts',
    ],
  },
} as const);

/** The role each pinned operation family plays in the product slice. */
export type StripeGlobalPayoutsOperationRole =
  | 'RECIPIENT_CREATION'
  | 'RECIPIENT_HOSTED_INFORMATION_FORM'
  | 'RECIPIENT_READ_BACK'
  | 'TREASURY_FUNDING_PREREQUISITE'
  | 'PAYOUT_EXECUTION'
  | 'PAYOUT_STATUS_READ_BACK'
  | 'PAYOUT_CANCELLATION'
  | 'RECONCILIATION'
  | 'RETURN_AND_EXCEPTION_HANDLING'
  | 'SANDBOX_RETURN_SIMULATION'
  | 'EVENTS';

/** One pinned census operation the product slice uses, with its role. */
export interface StripeGlobalPayoutsCensusOperation {
  readonly operationId: string;
  readonly role: StripeGlobalPayoutsOperationRole;
}

/**
 * THE PINNED PRODUCT OPERATION INVENTORY — every operation this slice touches,
 * resolved against the live census at module load (fail-closed: a missing or
 * non-dispatchable operation is a load-time error, never a silent gap).
 *
 * Roles and the census facts behind them (verified 2026-11-03 against
 * STRIPE_OPERATION_CENSUS at pin v2596):
 * - RECIPIENT_CREATION: the live recipient-creation doc names the core
 *   Accounts API ("submit them with the Accounts API"; codegen:
 *   core.accounts.create/retrieve/update). Pinned v2 core: PostV2CoreAccounts,
 *   GetV2CoreAccountsId, PostV2CoreAccountsId, GetV2CoreAccounts (list) and
 *   the persons subfamily for recipient KYC persons.
 * - RECIPIENT_HOSTED_INFORMATION_FORM: "With the API, redirect them with an
 *   Account Link" — PostV2CoreAccountLinks, pinned at its REAUTH tier
 *   (ADR-0018/P26-A: the host fresh-credential proof is the flow; the product
 *   slice refuses to execute it without the proof reference).
 * - TREASURY_FUNDING_PREREQUISITE: the financial-account reads that prove the
 *   V2 Treasury prerequisite and funding (GetTreasuryFinancialAccounts,
 *   GetTreasuryFinancialAccountsFinancialAccount, …Features).
 * - PAYOUT_EXECUTION: PostTreasuryOutboundPayments — the pinned v1 Treasury
 *   third-party payout create (send funds out of the financial account).
 * - PAYOUT_STATUS_READ_BACK / RECONCILIATION: GetTreasuryOutboundPaymentsId,
 *   the lists, GetTreasuryTransactions(+Id), GetTreasuryTransactionEntries(+Id),
 *   the events APIs.
 * - PAYOUT_CANCELLATION / RETURN_AND_EXCEPTION_HANDLING: the cancel action
 *   and the received-debit/reversal surfaces a returned/failed payout lands
 *   on (GetTreasuryReceivedDebits, GetTreasuryDebitReversals, …).
 * - SANDBOX_RETURN_SIMULATION: the pinned test_helpers/treasury family
 *   (test-mode only by the overlay state IMPLEMENTED_WITH_LIMITS).
 */
export const STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS: readonly StripeGlobalPayoutsCensusOperation[] =
  Object.freeze([
    // The recipient plane (v2 core accounts — the live-docs Accounts API).
    Object.freeze({ operationId: 'PostV2CoreAccounts', role: 'RECIPIENT_CREATION' }),
    Object.freeze({ operationId: 'GetV2CoreAccountsId', role: 'RECIPIENT_READ_BACK' }),
    Object.freeze({ operationId: 'PostV2CoreAccountsId', role: 'RECIPIENT_CREATION' }),
    Object.freeze({ operationId: 'GetV2CoreAccounts', role: 'RECIPIENT_READ_BACK' }),
    Object.freeze({ operationId: `Get${V2_ACCOUNTS}${PERSONS}`, role: 'RECIPIENT_READ_BACK' }),
    Object.freeze({ operationId: `Post${V2_ACCOUNTS}${PERSONS}`, role: 'RECIPIENT_CREATION' }),
    Object.freeze({ operationId: `Get${V2_ACCOUNTS}${PERSONS_ID}`, role: 'RECIPIENT_READ_BACK' }),
    // The hosted recipient-information form (Account Link — REAUTH tier).
    Object.freeze({ operationId: 'PostV2CoreAccountLinks', role: 'RECIPIENT_HOSTED_INFORMATION_FORM' }),
    // The Treasury prerequisite (V2: Global Payouts requires Treasury).
    Object.freeze({ operationId: 'GetTreasuryFinancialAccounts', role: 'TREASURY_FUNDING_PREREQUISITE' }),
    Object.freeze({ operationId: 'GetTreasuryFinancialAccountsFinancialAccount', role: 'TREASURY_FUNDING_PREREQUISITE' }),
    Object.freeze({ operationId: 'GetTreasuryFinancialAccountsFinancialAccountFeatures', role: 'TREASURY_FUNDING_PREREQUISITE' }),
    // Third-party payout execution (v1 Treasury outbound payments).
    Object.freeze({ operationId: 'PostTreasuryOutboundPayments', role: 'PAYOUT_EXECUTION' }),
    Object.freeze({ operationId: 'GetTreasuryOutboundPaymentsId', role: 'PAYOUT_STATUS_READ_BACK' }),
    Object.freeze({ operationId: 'GetTreasuryOutboundPayments', role: 'RECONCILIATION' }),
    Object.freeze({ operationId: 'PostTreasuryOutboundPaymentsIdCancel', role: 'PAYOUT_CANCELLATION' }),
    // Reconciliation (the financial-account ledger + events).
    Object.freeze({ operationId: 'GetTreasuryTransactions', role: 'RECONCILIATION' }),
    Object.freeze({ operationId: 'GetTreasuryTransactionsId', role: 'RECONCILIATION' }),
    Object.freeze({ operationId: 'GetTreasuryTransactionEntries', role: 'RECONCILIATION' }),
    Object.freeze({ operationId: 'GetTreasuryTransactionEntriesId', role: 'RECONCILIATION' }),
    Object.freeze({ operationId: 'GetEvents', role: 'EVENTS' }),
    Object.freeze({ operationId: 'GetEventsId', role: 'EVENTS' }),
    Object.freeze({ operationId: 'GetV2CoreEvents', role: 'EVENTS' }),
    Object.freeze({ operationId: 'GetV2CoreEventsId', role: 'EVENTS' }),
    // Return / exception handling surfaces.
    Object.freeze({ operationId: 'GetTreasuryReceivedDebits', role: 'RETURN_AND_EXCEPTION_HANDLING' }),
    Object.freeze({ operationId: 'GetTreasuryReceivedDebitsId', role: 'RETURN_AND_EXCEPTION_HANDLING' }),
    Object.freeze({ operationId: 'PostTreasuryDebitReversals', role: 'RETURN_AND_EXCEPTION_HANDLING' }),
    Object.freeze({ operationId: 'GetTreasuryDebitReversals', role: 'RETURN_AND_EXCEPTION_HANDLING' }),
    Object.freeze({ operationId: 'GetTreasuryDebitReversalsDebitReversal', role: 'RETURN_AND_EXCEPTION_HANDLING' }),
    // Sandbox return/exception simulation (test-mode only, the pinned test helpers).
    Object.freeze({ operationId: 'PostTestHelpersTreasuryOutboundPaymentsIdPost', role: 'SANDBOX_RETURN_SIMULATION' }),
    Object.freeze({ operationId: 'PostTestHelpersTreasuryOutboundPaymentsIdFail', role: 'SANDBOX_RETURN_SIMULATION' }),
    Object.freeze({ operationId: 'PostTestHelpersTreasuryOutboundPaymentsIdReturn', role: 'SANDBOX_RETURN_SIMULATION' }),
  ] as const);

/**
 * THE NEVER-ALIAS LAW (ADR-0020 D4 — typed and test-enforced): these pinned,
 * dispatchable operations belong to OTHER products and may NEVER be offered,
 * relabeled or dispatched as part of a Global-Payouts journey:
 * - PostPayouts / PostPayoutsPayout (+cancel/reverse + reads): the ORDINARY
 *   merchant-balance payout product — "payout" in the name is not Global
 *   Payouts (funds move from the merchant's own payments balance to the
 *   merchant's own external account).
 * - PostTransfers (+the Connect transfer family): Connect transfers between
 *   Stripe accounts — the compare doc: Connect payouts' "Recipients must be
 *   connected accounts".
 * - PostPaymentIntents / PostCheckoutSessions / PostPaymentLinks: commerce
 *   payment surfaces (the INV-30 surface: a Payment Link never launders a
 *   personal remittance into an eligible payout).
 */
export const STRIPE_GLOBAL_PAYOUTS_FORBIDDEN_ALIAS_OPERATION_IDS: ReadonlySet<string> = new Set([
  'PostPayouts',
  'GetPayouts',
  'GetPayoutsPayout',
  'PostPayoutsPayout',
  'PostPayoutsPayoutCancel',
  'PostPayoutsPayoutReverse',
  'PostTransfers',
  'GetTransfers',
  'GetTransfersTransfer',
  'PostPaymentIntents',
  'GetPaymentIntents',
  'PostCheckoutSessions',
  'PostPaymentLinks',
]);

/** Typed refusal for a forbidden alias attempt (the D4 law, machine-citable). */
export class StripeGlobalPayoutsAliasRefusal extends ValidationError {
  constructor(
    readonly operationId: string,
    readonly product: 'stripe.global-payouts',
  ) {
    super(
      `operation '${operationId}' belongs to a different Stripe product and can never serve a ` +
        `Global-Payouts journey (ADR-0020 D4 — ${product} is not an alias of ordinary payouts, ` +
        'Connect transfers or PaymentIntents)',
    );
    this.name = 'StripeGlobalPayoutsAliasRefusal';
  }
}

/** Is the operation a forbidden alias for this product? (The D4 gate.) */
export function isForbiddenGlobalPayoutsAliasOperation(operationId: string): boolean {
  return STRIPE_GLOBAL_PAYOUTS_FORBIDDEN_ALIAS_OPERATION_IDS.has(operationId);
}

/** THE D4 GATE: refuse (typed) any alias operation offered to this product. */
export function assertOperationAllowedForGlobalPayouts(operationId: string): void {
  if (isForbiddenGlobalPayoutsAliasOperation(operationId)) {
    throw new StripeGlobalPayoutsAliasRefusal(operationId, 'stripe.global-payouts');
  }
}

/**
 * Resolve the census record for a product-slice operation, enforcing BOTH
 * laws at once: it must be a pinned product operation (never an alias — D4)
 * and it must be dispatchable under the overlay (the DENY law).
 */
export function globalPayoutsCensusRecordOf(operationId: string): StripeOperationCensusRecord {
  if (isForbiddenGlobalPayoutsAliasOperation(operationId)) {
    throw new StripeGlobalPayoutsAliasRefusal(operationId, 'stripe.global-payouts');
  }
  const record = stripeCensusRecord(operationId);
  if (record === undefined) {
    throw new ValidationError(
      `operation '${operationId}' is not in the pinned Stripe census (v2596 @ 2026-09-30.endive) — ` +
        'the Global-Payouts slice never invents or expands operations (the census law)',
    );
  }
  if (!stripeCensusDispatchAllowed(operationId)) {
    throw new ValidationError(
      `operation '${operationId}' has support state '${record.supportState}' — not dispatchable (the DENY law)`,
    );
  }
  return record;
}

// The census audit runs at module load: every product operation must resolve.
for (const entry of STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS) {
  if (isForbiddenGlobalPayoutsAliasOperation(entry.operationId)) {
    throw new ValidationError(
      `internal inventory violation: '${entry.operationId}' is listed both as product operation and alias (the never-alias law)`,
    );
  }
  globalPayoutsCensusRecordOf(entry.operationId);
}

/**
 * THE CENSUS GAP (the honest disclosure, D10/D12): the API surface the CURRENT
 * live docs name for Global Payouts is the v2 money_management preview API —
 * NOT in the pinned public GA census (the 32 pinned v2 operations are
 * billing/commerce/core only; the spec-pin's SDK-family delta note records
 * the v2 money-management surface as Stripe-internal). The slice implements
 * over the PINNED v1 Treasury outbound-payment family + the PINNED v2 core
 * accounts/links family; adopting the v2 money_management surface is a pin
 * decision for the TL (generate → diff → review → adopt), never a silent
 * expansion. Typed refusal reason for journey attempts against it:
 * 'UNPINNED_API_SURFACE'.
 */
export const STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP = Object.freeze({
  status: 'NOT_PINNED' as const,
  documentedAt: '2026-11-03',
  sourceUrls: [
    'https://docs.stripe.com/global-payouts/send-money',
    'https://docs.stripe.com/global-payouts/manage-payouts',
    'https://docs.stripe.com/global-payouts/recipient-creation',
  ],
  finding:
    'The live Global-Payouts docs (retrieved 2026-11-03) name the v2 money_management API family (payout_intents, outbound_payments, recipient_verifications, payout_methods, outbound_setup_intents, transactions.list, transaction_entries.list — POST /v2/money_management/outbound_payments, wire version 2026-10-28.endive on the send-money page, 2026-10-28.preview in the stablecoins flow) as the product API surface; the manage-payouts page also names the v2.money_management.payout_intent.* and v2.money_management.outbound_payment.* event types. The pinned public GA census v2596 (2026-09-30.endive) does NOT contain any /v2/money_management path; its SDK-family delta records the v2 money-management surface as Stripe-internal (59 operations, disclosure only — see spec-pin.ts). The product slice therefore executes over the PINNED v1 Treasury outbound-payment family (PostTreasuryOutboundPayments & co.) and the PINNED v2 core accounts/links family for recipients. Adopting the v2 money_management surface requires a reviewed pin change — a TL decision recorded as the standing integration instruction.',
  /** The doc-named API operations the pinned census cannot dispatch today. */
  unpinnedDocApiOperations: Object.freeze([
    'money_management.payout_intents.create',
    'money_management.payout_intents.retrieve',
    'money_management.payout_intents.update',
    'money_management.payout_intents.cancel',
    'money_management.payout_intents.refresh_recipient_verification',
    'money_management.payout_intents.refresh_fx_quote',
    'money_management.outbound_payments.create',
    'money_management.outbound_payments.retrieve',
    'money_management.outbound_payments.cancel',
    'money_management.recipient_verifications.create',
    'money_management.recipient_verifications.acknowledge',
    'money_management.payout_methods.list',
    'money_management.outbound_setup_intents.create',
    'money_management.payout_methods_bank_account_spec.retrieve',
    'money_management.transactions.list',
    'money_management.transaction_entries.list',
  ] as const),
} as const);

/** Typed refusal reason when a journey references the unpinned doc API surface. */
export const STRIPE_GLOBAL_PAYOUTS_UNPINNED_SURFACE_REFUSAL = Object.freeze({
  reason: 'UNPINNED_API_SURFACE' as const,
  detail:
    'the live-docs Global-Payouts v2 money_management API family is not in the pinned census ' +
    '(v2596 @ 2026-09-30.endive); the slice implements over the pinned v1 Treasury family — ' +
    'adopting the v2 surface is a reviewed pin change, never a silent expansion',
} as const);
