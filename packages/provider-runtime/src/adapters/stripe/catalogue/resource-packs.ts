/**
 * @payswap/provider-runtime — Stripe resource packs (P24-0, ADR-0017 D3).
 *
 * The handoff's product coverage map (§6 Packs A–K) bound to the pinned
 * GA spec's actual resource families (derived from the operation paths:
 * the first path segment after the version, plus the nested sub-resource
 * segment when it is a literal). The mapping is TOTAL: the census test
 * asserts every catalogue operation resolves to exactly one pack.
 *
 * Family derivation law (must match the generator's reader):
 *   /v1/customers/{id}                → customers
 *   /v1/customers/{id}/subscriptions  → customers   ({id} is not a family segment)
 *   /v1/test_helpers/issuing/…        → test_helpers/issuing
 */

/** The pack identifiers (handoff §6). */
export const STRIPE_RESOURCE_PACK_IDS = [
  'A_ACCOUNT_CAPABILITY_CONFIGURATION',
  'B_CUSTOMERS_PAYMENT_INSTRUMENTS',
  'C_PAYMENTS_CHECKOUT',
  'D_PRODUCTS_PRICING_CATALOG',
  'E_BILLING_INVOICING_SUBSCRIPTIONS',
  'F_CONNECT_PLATFORM',
  'G_RISK_FRAUD_IDENTITY_DISPUTES',
  'H_PAYOUTS_TRANSFERS_FINANCIAL_PRODUCTS',
  'I_TERMINAL_IN_PERSON',
  'J_REPORTING_DATA_INSIGHTS',
  'K_SANDBOX_TEST_HELPERS',
] as const;
export type StripeResourcePackId = (typeof STRIPE_RESOURCE_PACK_IDS)[number];

/** Family → pack (the TOTAL table; reviewed in P24-0). */
const PACK_FAMILIES: Readonly<Record<StripeResourcePackId, readonly string[]>> = {
  A_ACCOUNT_CAPABILITY_CONFIGURATION: [
    'account', 'balance', 'balance/history', 'balance_settings', 'balance_transactions',
    'country_specs', 'events', 'core/events', 'core/event_destinations', 'core',
    'forwarding', 'forwarding/requests', 'apps', 'apps/installs', 'apps/secrets',
    'exchange_rates', 'webhook_endpoints',
  ],
  B_CUSTOMERS_PAYMENT_INSTRUMENTS: [
    'customers', 'payment_methods', 'payment_method_configurations', 'payment_method_domains',
    'setup_intents', 'setup_attempts', 'tokens', 'ephemeral_keys', 'customer_sessions',
    'mandates', 'three_d_secure', 'three_d_secure/authentications', 'confirmation_tokens',
    'sources', 'financial_connections', 'financial_connections/accounts',
    'financial_connections/sessions', 'financial_connections/transactions',
    'linked_accounts', 'link_account_sessions', 'apple_pay', 'apple_pay/domains',
    'core/account_tokens',
  ],
  C_PAYMENTS_CHECKOUT: [
    'payment_intents', 'charges', 'checkout', 'checkout/sessions', 'payment_links',
    'refunds', 'payment_records', 'payment_attempt_records', 'invoice_payments',
  ],
  D_PRODUCTS_PRICING_CATALOG: [
    'products', 'prices', 'plans', 'coupons', 'promotion_codes', 'shipping_rates',
    'tax_rates', 'tax_codes', 'tax_ids', 'product_catalog', 'commerce/product_catalog',
    'product_catalog/trial_offers', 'entitlements', 'entitlements/active_entitlements',
    'entitlements/features',
  ],
  E_BILLING_INVOICING_SUBSCRIPTIONS: [
    'subscriptions', 'subscription_items', 'subscription_schedules', 'invoices',
    'invoiceitems', 'invoice_rendering_templates', 'quotes', 'credit_notes',
    'credit_notes/preview', 'billing', 'billing/meters', 'billing/alerts',
    'billing/credit_balance_transactions', 'billing/credit_grants',
    'billing/feedback_options', 'billing_portal', 'billing_portal/configurations',
    'tax', 'tax/associations', 'tax/calculations', 'tax/locations',
    'tax/registrations', 'tax/transactions',
  ],
  F_CONNECT_PLATFORM: [
    'accounts', 'account_links', 'account_sessions', 'external_accounts',
    'application_fees', 'transfers', 'topups', 'core/accounts',
  ],
  G_RISK_FRAUD_IDENTITY_DISPUTES: [
    'radar', 'radar/early_fraud_warnings', 'radar/value_list_items', 'radar/value_lists',
    'reviews', 'identity', 'identity/verification_reports',
    'identity/verification_sessions', 'disputes',
  ],
  H_PAYOUTS_TRANSFERS_FINANCIAL_PRODUCTS: [
    'payouts', 'treasury', 'treasury/financial_accounts', 'treasury/credit_reversals',
    'treasury/debit_reversals',
    'treasury/inbound_transfers', 'treasury/outbound_payments',
    'treasury/outbound_transfers', 'treasury/received_credits',
    'treasury/received_debits', 'treasury/transaction_entries',
    'treasury/transactions', 'issuing', 'issuing/authorizations',
    'issuing/cardholders', 'issuing/cards', 'issuing/disputes',
    'issuing/personalization_designs', 'issuing/physical_bundles',
    'issuing/settlements', 'issuing/tokens', 'issuing/transactions',
    'climate', 'climate/orders', 'climate/products', 'climate/suppliers',
  ],
  I_TERMINAL_IN_PERSON: [
    'terminal', 'terminal/readers', 'terminal/configurations', 'terminal/locations',
  ],
  J_REPORTING_DATA_INSIGHTS: [
    'reporting', 'reporting/report_runs', 'reporting/report_types', 'sigma',
    'sigma/saved_queries', 'sigma/scheduled_query_runs', 'files', 'file_links',
  ],
  K_SANDBOX_TEST_HELPERS: [
    'test_helpers', 'test_helpers/customers', 'test_helpers/refunds',
    'test_helpers/terminal', 'test_helpers/test_clocks',
    'test_helpers/issuing', 'test_helpers/treasury',
  ],
};

/** Precomputed reverse map (family → pack). */
const FAMILY_TO_PACK: ReadonlyMap<string, StripeResourcePackId> = (() => {
  const map = new Map<string, StripeResourcePackId>();
  for (const pack of STRIPE_RESOURCE_PACK_IDS) {
    for (const family of PACK_FAMILIES[pack]) {
      if (map.has(family)) {
        throw new Error(`stripe resource family '${family}' mapped to two packs`);
      }
      map.set(family, pack);
    }
  }
  return map;
})();

/** Derive the resource family from a catalogue path (the generator's law). */
export function stripeResourceFamilyOf(path: string): string {
  const segments = path.replace(/^\//, '').split('/');
  if (segments.length < 2) return '';
  const family = segments[1] as string;
  if (segments.length > 3 && !segments[2]!.startsWith('{')) {
    return `${family}/${segments[2]}`;
  }
  return family;
}

/** Resolve the pack for a catalogue operation path (undefined = unmapped). */
export function stripeResourcePackOf(path: string): StripeResourcePackId | undefined {
  return FAMILY_TO_PACK.get(stripeResourceFamilyOf(path));
}

/** The reviewed pack display names (UI/model-facing labels). */
export const STRIPE_RESOURCE_PACK_LABELS: Readonly<Record<StripeResourcePackId, string>> = {
  A_ACCOUNT_CAPABILITY_CONFIGURATION: 'Account, capability and configuration',
  B_CUSTOMERS_PAYMENT_INSTRUMENTS: 'Customers and payment instruments',
  C_PAYMENTS_CHECKOUT: 'Payments and checkout',
  D_PRODUCTS_PRICING_CATALOG: 'Products, pricing and revenue catalog',
  E_BILLING_INVOICING_SUBSCRIPTIONS: 'Billing, invoicing and subscriptions',
  F_CONNECT_PLATFORM: 'Connect and platform management',
  G_RISK_FRAUD_IDENTITY_DISPUTES: 'Risk, fraud, identity and disputes',
  H_PAYOUTS_TRANSFERS_FINANCIAL_PRODUCTS: 'Payouts, transfers and financial products',
  I_TERMINAL_IN_PERSON: 'Terminal and in-person',
  J_REPORTING_DATA_INSIGHTS: 'Reporting, data and insights',
  K_SANDBOX_TEST_HELPERS: 'Sandbox test helpers (test mode only)',
};
