/**
 * @payswap/provider-runtime — the Stripe operation SAFETY OVERLAY (P24-0, P25, P26-A).
 *
 * ADR-0017 D7 (BINDING): the OpenAPI catalogue describes the HTTP contract;
 * it never decides permission. Every operation must resolve, through THIS
 * reviewed overlay, to an effect class + support state before it can be
 * exposed to a model or dispatched. UNKNOWN OVERLAY = DENY (handoff §4.3).
 *
 * Composition: overlay(op) = reviewed state overrides[opId] ?? p25 rule(op).
 * The RULE ENGINE derives the effect class from method + family + path shape
 * (reviewed tables below); the P25 SURFACE LAW derives the support state
 * (the full-coverage flip — see spec/productization/P25-0-COVERAGE-AUDIT-
 * 2026-11-02.md). Both halves are PaySwap-authored — generated spec data
 * never contributes.
 *
 * THE P25 LAW: the connector's plumbing (strict validator, sealed transport,
 * two-phase action contract, RAK eligibility, idempotency classification) is
 * operationId-parametric, so the dispatchable surface is a RULE, not a
 * hand-list: every operation dispatches EXCEPT the credential-admin writes
 * (the secrets-law holds) and the account-link/session operations held for
 * the missing re-authentication flow.
 *
 * THE P26-A LAW (ADR-0018): the re-authentication flow EXISTS — the three
 * account-link/session operations (PostAccountLinks, PostAccountSessions,
 * PostV2CoreAccountLinks) dispatch at their REAUTH tier behind the host-side
 * fresh-credential proof (host-minted, digest-scoped, single-use, 10-minute;
 * the model can never mint one). The held set shrinks thirteen → ten; the
 * ten remaining are the secrets law (apps/secrets, webhook_endpoints,
 * ephemeral keys, customer-session secrets, terminal connection tokens, the
 * secret-reveal GET) — permanent holds, not missing flows.
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

/** THE P26-A REAUTH-FLOW SET (ADR-0018 D4 — the un-hold). The three
 *  account-link/session operations whose responses carry onboarding URLs
 *  and Dashboard session objects (NOT credentials): they dispatch at their
 *  existing effect class (PERMISSION_OR_CREDENTIAL_ADMIN → REAUTH tier)
 *  behind the host re-authentication proof — a fresh credential proof for
 *  the SAME account, live-probe-verified, host-minted, digest-scoped,
 *  single-use, 10 minutes. The proof machinery lives in the desktop plane
 *  (packages/desktop/src/host/payswap/stripe/reauthentication.ts); this
 *  overlay only records that the flow exists and the operations are no
 *  longer held for its absence. */
export const STRIPE_REAUTH_FLOW_OPERATIONS: ReadonlySet<string> = new Set([
  'PostAccountLinks',
  'PostAccountSessions',
  'PostV2CoreAccountLinks',
]);

/** Families that send/finalize communications to customers. */
const COMMUNICATION_PATH_TOKENS = ['/send', '/send_invoice', '/send_quote'];

/** Path tokens that make a POST a SEARCH (read-like) — handoff §7.1. */
const SEARCH_PATH_TOKENS = ['/search', '/list'];

/** THE P25 AUDIT'S CATCH: the secrets-law path prefix. The family derivation
 *  yields 'apps' for the 3-segment path `/v1/apps/secrets` (the
 *  'apps/secrets' family table entry only matches 4-segment paths like
 *  `/v1/apps/secrets/delete`), so the CREATE-secret operation silently
 *  escaped the credential-admin family rule — its response carries the
 *  secret payload. Path-prefix check, before the family table. (The GETs on
 *  the family stay READ_ONLY by the structural invariant; the reveal GET is
 *  held by the reviewed state override below.) */
const SECRETS_LAW_PATH_PREFIXES = ['/v1/apps/secrets'];

/** THE P26-A CATCH (measured before pinning — the totality discipline): the
 *  v2 account-links twin (POST /v2/core/account_links) derives family 'core'
 *  and so escaped the CREDENTIAL_ADMIN family table, which masked at P25
 *  because the operation was held by reviewed override. Un-holding it
 *  exposed the misclassification: the twin would have dispatched at mere
 *  CONFIRM tier while carrying the audit's own recorded REAUTH semantics
 *  (the P25 deep-dive: "identical REAUTH-tier semantics"). Path-prefix law,
 *  checked before the family table — the same pattern as the secrets-law
 *  prefix above. */
const REAUTH_LAW_PATH_PREFIXES = ['/v2/core/account_links'];

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
  if (SECRETS_LAW_PATH_PREFIXES.some((prefix) => lowerPath.startsWith(prefix))) {
    return 'PERMISSION_OR_CREDENTIAL_ADMIN';
  }
  if (REAUTH_LAW_PATH_PREFIXES.some((prefix) => lowerPath.startsWith(prefix))) {
    return 'PERMISSION_OR_CREDENTIAL_ADMIN';
  }
  if (CREDENTIAL_ADMIN_FAMILIES.has(family)) return 'PERMISSION_OR_CREDENTIAL_ADMIN';
  if (COMMUNICATION_PATH_TOKENS.some((token) => lowerPath.endsWith(token))) {
    return 'CUSTOMER_COMMUNICATION';
  }
  // Capture/reverse/refund/close/void/finalize tokens are irreversible money
  // effects. P25: `refunds` (plural) added — POST /v1/terminal/refunds creates
  // a REAL refund but escaped both the family table (family 'terminal') and
  // the singular token; the audit reclassified it STRONG_CONFIRM.
  if (
    operation.method === 'DELETE' ||
    /\/(capture|refund|refunds|reverse|close|void|finalize|pay|confirm|cancel)$/.test(lowerPath)
  ) {
    return 'FINANCIAL_IRREVERSIBLE_OR_REVERSAL';
  }
  if (FINANCIAL_IRREVERSIBLE_FAMILIES.has(family)) return 'FINANCIAL_IRREVERSIBLE_OR_REVERSAL';
  if (FINANCIAL_CREATE_FAMILIES.has(family) && operation.method === 'POST') {
    return 'FINANCIAL_CREATE';
  }
  return 'STRIPE_CONFIGURATION_WRITE';
}

/** Rule-engine support state was replaced by the P25 surface law below; the
 *  P24 states (PLANNED_P24_INITIAL_RELEASE, ACCOUNT_GATED,
 *  SANDBOX_TEST_HELPER_ONLY) remain in the vocabulary as the historical and
 *  reserved-for-live-tier states — no producer assigns them today. */

/** The reviewed per-operation SUPPORT-STATE overrides (the P25 exceptions).
 *
 * THE SECRETS-IN-RESPONSE HOLDS (the audit's deep-dive — fail-closed when a
 * response carries credential-class material, even read-shaped):
 * - PostEphemeralKeys / DeleteEphemeralKeysKey: the ephemeral-key object
 *   carries the `ek_` secret in create AND delete responses.
 * - PostCustomerSessions: the response carries a single-use client secret.
 * - PostTerminalConnectionTokens: the response carries a short-lived SDK
 *   connection token.
 * - GetAppsSecretsFind: a GET that REVEALS the stored secret payload — held
 *   by override so the structural GET→READ_ONLY invariant stays intact.
 *
 * (P26-A removed PostV2CoreAccountLinks from this table — it now dispatches
 * at REAUTH tier behind the re-authentication flow, STRIPE_REAUTH_FLOW_
 * OPERATIONS above; the v2 twin needed the override ONLY because the family
 * table misses its v2 path geometry, and a hold is no longer the reason.)
 *
 * PostFiles: the catalogue's only multipart operation dispatches, but its
 * parameters ride the same JSON plane as every other operation — the base64
 * `file` string is subject to the validator's parameter-size bound
 * (≤100k chars ≈ 75 KB binary). Larger artifacts belong to a future
 * attachment plane, never to chat parameters. The honest state says so. */
const REVIEWED_STATE_OVERRIDES: Readonly<Record<string, StripeSupportState>> = Object.freeze({
  PostEphemeralKeys: 'NOT_SUPPORTED_WITH_REASON',
  DeleteEphemeralKeysKey: 'NOT_SUPPORTED_WITH_REASON',
  PostCustomerSessions: 'NOT_SUPPORTED_WITH_REASON',
  PostTerminalConnectionTokens: 'NOT_SUPPORTED_WITH_REASON',
  GetAppsSecretsFind: 'NOT_SUPPORTED_WITH_REASON',
  PostFiles: 'IMPLEMENTED_WITH_LIMITS',
});

/** THE P25 SURFACE LAW + THE P26-A AMENDMENT (the flip, then the un-hold).
 *
 * Returns the support state for every catalogue operation:
 * 1. THE REAUTH-FLOW OPERATIONS dispatch (P26-A, ADR-0018): account links
 *    and account sessions at their REAUTH tier behind the host proof.
 * 2. the remaining credential-admin operations (the family table + the
 *    secrets-law path prefix + the reviewed holds below) stay
 *    NOT_SUPPORTED_WITH_REASON — `apps/secrets` and `webhook_endpoints`
 *    responses carry secret material (the secrets-never-enter-chat law;
 *    webhook destinations are managed by the D12 host plane with sealed
 *    storage).
 * 3. test_helpers/* dispatch IMPLEMENTED_WITH_LIMITS (test-mode only — the
 *    credential gate already refuses live keys globally, INV-25/D14).
 * 4. account-entitlement families dispatch IMPLEMENTED_WITH_LIMITS (Stripe
 *    rejects the call if the product is not enabled on the account).
 * 5. everything else dispatches IMPLEMENTED.
 */
function p25SupportState(
  operation: StripeCatalogueOperation,
  effectClass: StripeEffectClass,
): StripeSupportState {
  if (STRIPE_REAUTH_FLOW_OPERATIONS.has(operation.operationId)) return 'IMPLEMENTED';
  const reviewed = REVIEWED_STATE_OVERRIDES[operation.operationId];
  if (reviewed !== undefined) return reviewed;
  if (effectClass === 'PERMISSION_OR_CREDENTIAL_ADMIN') return 'NOT_SUPPORTED_WITH_REASON';
  const family = stripeResourceFamilyOf(operation.path);
  if (family.startsWith('test_helpers/')) return 'IMPLEMENTED_WITH_LIMITS';
  if (ACCOUNT_GATED_FAMILIES.has(family)) return 'IMPLEMENTED_WITH_LIMITS';
  return 'IMPLEMENTED';
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
 * The P24 INITIAL-RELEASE SURFACE (handoff §14) — THE HISTORICAL RECORD.
 * Each entry was individually reviewed in P24-0; Workers 1–3 implemented 46
 * of them before the P25 full-coverage flip replaced the hand-list with the
 * rule-derived surface above. The set stays exported as the reviewed lineage
 * (the census battery asserts the 46 implemented operations all dispatch
 * under the P25 law — the flip-law coherence).
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
  // P24-1 addition (the work order's §14 reading names product archive):
  // DELETE /v1/products/{id} archives the product; its effect class flows
  // through the reviewed rule engine (DELETE → irreversible tier).
  'DeleteProductsId',
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
  // THE P25 SURFACE LAW: the support state is rule-derived (the audit's
  // full-coverage flip) — the P24 hand-lists remain as the historical record
  // and the flip-law coherence is test-enforced (the census battery asserts
  // the 46 reviewed implementations are all dispatchable under P25).
  const supportState: StripeSupportState = p25SupportState(operation, effectClass);
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
  // Only IMPLEMENTED states may ever dispatch; every other state — the held
  // credential-admin writes, and any future reserved state — is DENIED.
  return (
    overlay.supportState === 'IMPLEMENTED' || overlay.supportState === 'IMPLEMENTED_WITH_LIMITS'
  );
}
