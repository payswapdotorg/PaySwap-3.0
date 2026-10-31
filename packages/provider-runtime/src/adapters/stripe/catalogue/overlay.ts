/**
 * @payswap/provider-runtime — the Stripe operation SAFETY OVERLAY (P24-0).
 *
 * ADR-0017 D7 (BINDING): the OpenAPI catalogue describes the HTTP contract;
 * it never decides permission. Every operation must resolve, through THIS
 * reviewed overlay, to an effect class + support state before it can be
 * exposed to a model or dispatched. UNKNOWN OVERLAY = DENY (handoff §4.3).
 *
 * Composition: overlay(op) = reviewed overrides[opId] ?? ruleEngine(op).
 * The RULE ENGINE derives a provisional class from method + family + path
 * shape (reviewed tables below); the OVERRIDES are the explicitly reviewed
 * entries (the P24 initial-release surface). Both are PaySwap-authored —
 * generated spec data never contributes.
 */

import type { StripeCatalogueOperation } from './generator.ts';
import { stripeResourceFamilyOf, stripeResourcePackOf } from './resource-packs.ts';

/** Effect classes (handoff §7.1 — the exact vocabulary). */
export const STRIPE_EFFECT_CLASSES = [
  'READ_ONLY',
  'STRIPE_CONFIGURATION_WRITE',
  'CUSTOMER_COMMUNICATION',
  'FINANCIAL_CREATE',
  'FINANCIAL_IRREVERSIBLE_OR_REVERSAL',
  'PERMISSION_OR_CREDENTIAL_ADMIN',
] as const;
export type StripeEffectClass = (typeof STRIPE_EFFECT_CLASSES)[number];

/** Approval tiers derived from the effect class (ADR-0017 D7). */
export const STRIPE_APPROVAL_TIERS = ['NONE', 'CONFIRM', 'STRONG_CONFIRM', 'REAUTH'] as const;
export type StripeApprovalTier = (typeof STRIPE_APPROVAL_TIERS)[number];

/** Support states (handoff §4.2.6 vocabulary + the P24 plan states). */
export const STRIPE_SUPPORT_STATES = [
  'IMPLEMENTED',
  'IMPLEMENTED_WITH_LIMITS',
  'PLANNED_P24_INITIAL_RELEASE',
  'ACCOUNT_GATED',
  'OPERATOR_CONFIG_REQUIRED',
  'SANDBOX_TEST_HELPER_ONLY',
  'MANUAL_PROVIDER_UI_ONLY',
  'NOT_SUPPORTED_WITH_REASON',
  'DEPRECATED_OR_REMOVED',
] as const;
export type StripeSupportState = (typeof STRIPE_SUPPORT_STATES)[number];

/** The joined overlay record for one operation. */
export interface StripeOperationOverlay {
  readonly operationId: string;
  readonly effectClass: StripeEffectClass;
  readonly approvalTier: StripeApprovalTier;
  readonly supportState: StripeSupportState;
  /** The RAK permission rule (Stripe permission string(s) required; read ops use the read twin). */
  readonly requiredPermissionRule: string;
  readonly packId: string;
  readonly resourceFamily: string;
  readonly reviewedOverride: boolean;
}

/* ---------------- the reviewed rule tables ---------------- */

/** Families whose non-read operations CREATE financial obligations. */
const FINANCIAL_CREATE_FAMILIES = new Set([
  'payment_intents', 'transfers', 'topups', 'payouts', 'subscriptions',
  'invoices', 'credit_notes', 'checkout', 'checkout/sessions', 'payment_records',
  'treasury/inbound_transfers', 'treasury/outbound_payments',
  'treasury/outbound_transfers', 'climate/orders', 'invoice_payments',
]);

/** Families whose operations REVERSE/irreversibly affect existing money
 *  (checked BEFORE the create table: a refund CREATE is itself the
 *  irreversible action — handoff §7.1 puts refund under
 *  FINANCIAL_IRREVERSIBLE_OR_REVERSAL, not FINANCIAL_CREATE). */
const FINANCIAL_IRREVERSIBLE_FAMILIES = new Set([
  'application_fees', 'disputes', 'issuing/authorizations', 'refunds',
]);

/** Families that manage credentials, access or account authority. */
const CREDENTIAL_ADMIN_FAMILIES = new Set([
  'account_links', 'account_sessions', 'webhook_endpoints', 'apps/secrets',
]);

/** Families that send/finalize communications to customers. */
const COMMUNICATION_PATH_TOKENS = ['/send', '/send_invoice', '/send_quote'];

/** Path tokens that make a POST a SEARCH (read-like) — handoff §7.1. */
const SEARCH_PATH_TOKENS = ['/search', '/list'];

/** Families gated behind account enrolment for ANY operation (support state). */
const ACCOUNT_GATED_FAMILIES = new Set([
  'treasury', 'treasury/financial_accounts', 'treasury/credit_reversals',
  'treasury/debit_reversals', 'treasury/inbound_transfers',
  'treasury/outbound_payments', 'treasury/outbound_transfers',
  'treasury/received_credits', 'treasury/received_debs',
  'treasury/received_debits', 'treasury/transaction_entries',
  'treasury/transactions', 'issuing', 'issuing/authorizations',
  'issuing/cardholders', 'issuing/cards', 'issuing/disputes',
  'issuing/personalization_designs', 'issuing/physical_bundles',
  'issuing/settlements', 'issuing/tokens', 'issuing/transactions',
  'climate', 'climate/orders', 'climate/products', 'climate/suppliers',
  'identity', 'identity/verification_reports', 'identity/verification_sessions',
  'financial_connections', 'financial_connections/accounts',
  'financial_connections/sessions', 'financial_connections/transactions',
  'terminal', 'terminal/readers', 'terminal/configurations',
  'terminal/locations', 'sigma', 'sigma/saved_queries',
  'sigma/scheduled_query_runs',
]);

/** Approval tier per effect class (ADR-0017 D7). */
const TIER_BY_EFFECT: Readonly<Record<StripeEffectClass, StripeApprovalTier>> = {
  READ_ONLY: 'NONE',
  STRIPE_CONFIGURATION_WRITE: 'CONFIRM',
  CUSTOMER_COMMUNICATION: 'CONFIRM',
  FINANCIAL_CREATE: 'STRONG_CONFIRM',
  FINANCIAL_IRREVERSIBLE_OR_REVERSAL: 'STRONG_CONFIRM',
  PERMISSION_OR_CREDENTIAL_ADMIN: 'REAUTH',
};

/** Rule-engine effect class (reviewed derivation — method alone never decides). */
function ruleEffectClass(operation: StripeCatalogueOperation): StripeEffectClass {
  const family = stripeResourceFamilyOf(operation.path);
  const lowerPath = operation.path.toLowerCase();
  // READ checks first: GET and search are read-only everywhere; credential
  // admin is a WRITE semantic (listing webhook endpoints does not expose
  // the secret and grants nothing).
  if (operation.method === 'GET') return 'READ_ONLY';
  if (SEARCH_PATH_TOKENS.some((token) => lowerPath.includes(token))) return 'READ_ONLY';
  if (CREDENTIAL_ADMIN_FAMILIES.has(family)) return 'PERMISSION_OR_CREDENTIAL_ADMIN';
  if (COMMUNICATION_PATH_TOKENS.some((token) => lowerPath.endsWith(token))) {
    return 'CUSTOMER_COMMUNICATION';
  }
  // Capture/reverse/refund/close/void/finalize tokens are irreversible money effects.
  if (
    operation.method === 'DELETE' ||
    /\/(capture|refund|reverse|close|void|finalize|pay|confirm|cancel)$/.test(lowerPath)
  ) {
    return 'FINANCIAL_IRREVERSIBLE_OR_REVERSAL';
  }
  if (FINANCIAL_IRREVERSIBLE_FAMILIES.has(family)) return 'FINANCIAL_IRREVERSIBLE_OR_REVERSAL';
  if (FINANCIAL_CREATE_FAMILIES.has(family) && operation.method === 'POST') {
    return 'FINANCIAL_CREATE';
  }
  return 'STRIPE_CONFIGURATION_WRITE';
}

/** Rule-engine support state (the honest default before implementation). */
function ruleSupportState(operation: StripeCatalogueOperation): StripeSupportState {
  const family = stripeResourceFamilyOf(operation.path);
  if (family.startsWith('test_helpers/')) return 'SANDBOX_TEST_HELPER_ONLY';
  if (ACCOUNT_GATED_FAMILIES.has(family)) return 'ACCOUNT_GATED';
  return 'NOT_SUPPORTED_WITH_REASON';
}

/** The RAK permission rule string for an operation (Stripe permission naming). */
function permissionRuleOf(
  operation: StripeCatalogueOperation,
  effect: StripeEffectClass,
): string {
  const family = stripeResourceFamilyOf(operation.path);
  const resource = family.split('/')[0] as string;
  const write = effect !== 'READ_ONLY';
  if (resource === 'account' || resource === 'accounts') {
    return write ? 'Account: Write' : 'Account: Read';
  }
  const camel = resource
    .split('_')
    .map((part, index) =>
      index === 0 ? part : (part.charAt(0).toUpperCase() + part.slice(1)),
    )
    .join('');
  return write ? `${camel}: Write` : `${camel}: Read`;
}

/* ------------- the reviewed overrides (P24-0 frozen surface) ------------- */

/**
 * The P24 INITIAL-RELEASE SURFACE (handoff §14): the operations Workers 1–3
 * implement and Sandbox-test first. Each entry was individually reviewed in
 * P24-0; everything outside this table resolves through the rule engine to
 * an honest not-yet/account-gated state and is DENIED for dispatch.
 */
export const STRIPE_P24_INITIAL_RELEASE_OPERATIONS: ReadonlySet<string> = new Set([
  // Pack A — account, capability and configuration (reads + event listing)
  'GetBalance', 'GetBalanceTransactions', 'GetAccount', 'GetEvents', 'GetEventsId',
  // Pack B — customers (the spec's convention: PostCustomers = create,
  // PostCustomersCustomer = update, GetCustomersCustomer = retrieve)
  'GetCustomers', 'PostCustomers', 'GetCustomersCustomer', 'PostCustomersCustomer',
  'DeleteCustomersCustomer', 'GetCustomersSearch',
  'GetPaymentMethods', 'PostPaymentMethods', 'GetPaymentMethodsPaymentMethod',
  // Pack C — payments and checkout
  'PostPaymentIntents', 'GetPaymentIntentsIntent', 'PostPaymentIntentsIntent',
  'PostPaymentIntentsIntentConfirm', 'PostPaymentIntentsIntentCancel',
  'GetPaymentIntents',
  'PostCheckoutSessions', 'GetCheckoutSessions', 'GetCheckoutSessionsSession',
  'PostPaymentLinks', 'GetPaymentLinksPaymentLink', 'GetPaymentLinks',
  'PostPaymentLinksPaymentLink',
  'PostSetupIntents', 'GetSetupIntentsIntent', 'PostSetupIntentsIntent',
  'GetSetupIntents', 'PostSetupIntentsIntentConfirm', 'PostSetupIntentsIntentCancel',
  'GetCharges', 'GetChargesCharge', 'PostChargesChargeCapture', 'GetChargesSearch',
  'PostRefunds', 'GetRefundsRefund', 'GetRefunds', 'PostRefundsRefundCancel',
  // Pack D — products, pricing
  'PostProducts', 'GetProductsId', 'PostProductsId', 'GetProducts',
  'GetProductsSearch', 'PostPrices', 'GetPricesPrice', 'GetPrices',
  'GetPricesSearch',
  // Pack E — billing, invoicing, subscriptions (the invoice lifecycle is
  // NEVER collapsed: create → finalize → send/void/pay are distinct ops)
  'PostInvoices', 'GetInvoicesInvoice', 'GetInvoices', 'PostInvoicesInvoice',
  'PostInvoicesInvoiceFinalize', 'PostInvoicesInvoiceSend', 'PostInvoicesInvoiceVoid',
  'PostInvoicesInvoicePay', 'PostInvoicesCreatePreview',
  'PostInvoiceitems', 'GetInvoiceitemsInvoiceitem', 'GetInvoiceitems',
  'PostSubscriptions', 'GetSubscriptionsSubscriptionExposedId', 'GetSubscriptions',
  'PostSubscriptionsSubscriptionExposedId', 'DeleteSubscriptionsSubscriptionExposedId',
  'GetSubscriptionsSearch',
  'PostBillingPortalSessions',
  'GetDisputes', 'GetDisputesDispute',
  // Sandbox test helpers (clearly labeled test-mode only)
  'PostTestHelpersTestClocks', 'GetTestHelpersTestClocks',
]);

/** Compute the overlay record for one catalogue operation. */
export function stripeOverlayFor(operation: StripeCatalogueOperation): StripeOperationOverlay {
  const planned = STRIPE_P24_INITIAL_RELEASE_OPERATIONS.has(operation.operationId);
  const family = stripeResourceFamilyOf(operation.path);
  const ruleEffect = ruleEffectClass(operation);
  // The reviewed overrides confirm the rule engine's class for every entry
  // (P24-0 review: no divergence found — the overrides pin the SUPPORT STATE,
  // the effect class still flows through the reviewed rule tables).
  const effectClass = ruleEffect;
  const supportState: StripeSupportState = planned
    ? 'PLANNED_P24_INITIAL_RELEASE'
    : ruleSupportState(operation);
  return {
    operationId: operation.operationId,
    effectClass,
    approvalTier: TIER_BY_EFFECT[effectClass],
    supportState,
    requiredPermissionRule: permissionRuleOf(operation, effectClass),
    packId: stripeResourcePackOf(operation.path) ?? 'UNMAPPED',
    resourceFamily: family,
    reviewedOverride: planned,
  };
}

/** Is the operation dispatchable under the overlay today? (The DENY law.) */
export function stripeOverlayDispatchAllowed(overlay: StripeOperationOverlay): boolean {
  // Only reviewed-and-implemented states may ever dispatch; PLANNED is not
  // IMPLEMENTED — the workers flip these states as they land + test them.
  return (
    overlay.supportState === 'IMPLEMENTED' || overlay.supportState === 'IMPLEMENTED_WITH_LIMITS'
  );
}
