/**
 * P26-0 — the Stripe DASHBOARD PARITY FACTS generator (2026-11-03).
 *
 * The parity matrix's mechanical half: every catalogue-side number in
 * spec/productization/P26-0-DASHBOARD-PARITY-MATRIX-2026-11-03.md is
 * computed HERE from the committed census artifacts (operations.json × the
 * overlay rule engine), never asserted from memory (the P25-0 law).
 *
 * The DASHBOARD_AREA_BY_FAMILY table below is the reviewed human judgment
 * (which Stripe Dashboard area a catalogue resource family serves); every
 * COUNT is mechanical. The totality check refuses to emit if the 149
 * families do not partition exactly into the 644 pinned operations.
 *
 * Run: npx tsx scripts/p26/dashboard-parity-facts.ts
 *      (writes docs/productization-evidence/p26-0-dashboard-parity-FACTS-<date>.json)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  STRIPE_OPERATION_CENSUS,
  STRIPE_CENSUS_PIN,
} from "../../packages/provider-runtime/src/adapters/stripe/catalogue/census.js";
import { STRIPE_OPENAPI_PIN } from "../../packages/provider-runtime/src/adapters/stripe/catalogue/spec-pin.js";

/** The Stripe Dashboard areas (docs.stripe.com/dashboard/basics — the
 * primary-navigation structure, P26-0's web-research inventory). */
export const DASHBOARD_AREAS = [
  "HOME",
  "BALANCES_PAYOUTS",
  "TRANSACTIONS_PAYMENTS",
  "CUSTOMERS",
  "PRODUCT_CATALOG",
  "BILLING_INVOICING",
  "CHECKOUT_PAYMENT_LINKS",
  "DISPUTES",
  "RADAR_RISK",
  "TAX",
  "CONNECT",
  "TERMINAL",
  "ISSUING",
  "TREASURY",
  "FINANCIAL_CONNECTIONS",
  "CLIMATE",
  "IDENTITY",
  "REPORTING_DATA",
  "DEVELOPER_TOOLS",
  "SETTINGS_ACCOUNT",
  "TEST_HELPERS",
] as const;
export type DashboardArea = (typeof DASHBOARD_AREAS)[number];

/** The reviewed family → Dashboard-area table (the partition of the census's
 * 149 families). Families with NO public-API counterpart never appear here —
 * the Dashboard-only surfaces (API keys, team/2FA, Radar rules, …) are
 * documented in the matrix from Stripe's own docs, never invented as
 * catalogue rows. */
const DASHBOARD_AREA_BY_FAMILY: Readonly<Record<string, DashboardArea>> = {
  // Balances & payouts (dashboard.stripe.com/balances, /payouts)
  balance: "BALANCES_PAYOUTS",
  "balance/history": "BALANCES_PAYOUTS",
  balance_settings: "BALANCES_PAYOUTS",
  balance_transactions: "BALANCES_PAYOUTS",
  payouts: "BALANCES_PAYOUTS",
  topups: "BALANCES_PAYOUTS",
  transfers: "BALANCES_PAYOUTS",
  // Transactions / payments (dashboard.stripe.com/payments)
  charges: "TRANSACTIONS_PAYMENTS",
  payment_intents: "TRANSACTIONS_PAYMENTS",
  payment_records: "TRANSACTIONS_PAYMENTS",
  payment_attempt_records: "TRANSACTIONS_PAYMENTS",
  refunds: "TRANSACTIONS_PAYMENTS",
  sources: "TRANSACTIONS_PAYMENTS",
  setup_attempts: "TRANSACTIONS_PAYMENTS",
  setup_intents: "TRANSACTIONS_PAYMENTS",
  confirmation_tokens: "TRANSACTIONS_PAYMENTS",
  // Customers (dashboard.stripe.com/customers)
  customers: "CUSTOMERS",
  customer_sessions: "CUSTOMERS",
  ephemeral_keys: "CUSTOMERS",
  entitlements: "CUSTOMERS",
  "entitlements/active_entitlements": "CUSTOMERS",
  "entitlements/features": "CUSTOMERS",
  "billing_portal": "CUSTOMERS",
  "billing_portal/configurations": "CUSTOMERS",
  // Product catalog (dashboard.stripe.com/products)
  products: "PRODUCT_CATALOG",
  prices: "PRODUCT_CATALOG",
  plans: "PRODUCT_CATALOG",
  product_catalog: "PRODUCT_CATALOG",
  "product_catalog/trial_offers": "PRODUCT_CATALOG",
  "commerce/product_catalog": "PRODUCT_CATALOG",
  shipping_rates: "PRODUCT_CATALOG",
  // Billing / invoicing (dashboard.stripe.com/billing, /invoices, /subscriptions)
  subscriptions: "BILLING_INVOICING",
  subscription_items: "BILLING_INVOICING",
  subscription_schedules: "BILLING_INVOICING",
  invoices: "BILLING_INVOICING",
  invoiceitems: "BILLING_INVOICING",
  invoice_payments: "BILLING_INVOICING",
  "invoice_rendering_templates": "BILLING_INVOICING",
  credit_notes: "BILLING_INVOICING",
  "credit_notes/preview": "BILLING_INVOICING",
  quotes: "BILLING_INVOICING",
  coupons: "BILLING_INVOICING",
  promotion_codes: "BILLING_INVOICING",
  billing: "BILLING_INVOICING",
  "billing/alerts": "BILLING_INVOICING",
  "billing/credit_balance_transactions": "BILLING_INVOICING",
  "billing/credit_grants": "BILLING_INVOICING",
  "billing/feedback_options": "BILLING_INVOICING",
  "billing/meters": "BILLING_INVOICING",
  // Checkout & payment links
  checkout: "CHECKOUT_PAYMENT_LINKS",
  "checkout/sessions": "CHECKOUT_PAYMENT_LINKS",
  payment_links: "CHECKOUT_PAYMENT_LINKS",
  // Disputes (dashboard.stripe.com/disputes)
  disputes: "DISPUTES",
  // Radar / risk (dashboard.stripe.com/radar)
  radar: "RADAR_RISK",
  "radar/early_fraud_warnings": "RADAR_RISK",
  "radar/value_lists": "RADAR_RISK",
  "radar/value_list_items": "RADAR_RISK",
  reviews: "RADAR_RISK",
  // Tax (dashboard.stripe.com/tax)
  tax: "TAX",
  "tax/associations": "TAX",
  "tax/calculations": "TAX",
  "tax/locations": "TAX",
  "tax/registrations": "TAX",
  "tax/transactions": "TAX",
  tax_codes: "TAX",
  tax_ids: "TAX",
  tax_rates: "TAX",
  // Connect (dashboard.stripe.com/connect)
  accounts: "CONNECT",
  account_links: "CONNECT",
  account_sessions: "CONNECT",
  country_specs: "CONNECT",
  core: "CONNECT",
  "core/accounts": "CONNECT",
  "core/account_tokens": "CONNECT",
  application_fees: "CONNECT",
  // Terminal (dashboard.stripe.com/terminal)
  terminal: "TERMINAL",
  "terminal/configurations": "TERMINAL",
  "terminal/locations": "TERMINAL",
  "terminal/readers": "TERMINAL",
  // Issuing (dashboard.stripe.com/issuing)
  issuing: "ISSUING",
  "issuing/authorizations": "ISSUING",
  "issuing/cardholders": "ISSUING",
  "issuing/cards": "ISSUING",
  "issuing/disputes": "ISSUING",
  "issuing/personalization_designs": "ISSUING",
  "issuing/physical_bundles": "ISSUING",
  "issuing/settlements": "ISSUING",
  "issuing/tokens": "ISSUING",
  "issuing/transactions": "ISSUING",
  // Treasury (dashboard.stripe.com/treasury)
  treasury: "TREASURY",
  "treasury/credit_reversals": "TREASURY",
  "treasury/debit_reversals": "TREASURY",
  "treasury/financial_accounts": "TREASURY",
  "treasury/inbound_transfers": "TREASURY",
  "treasury/outbound_payments": "TREASURY",
  "treasury/outbound_transfers": "TREASURY",
  "treasury/received_credits": "TREASURY",
  "treasury/received_debits": "TREASURY",
  "treasury/transaction_entries": "TREASURY",
  "treasury/transactions": "TREASURY",
  // Financial Connections (settings/financial-connections)
  financial_connections: "FINANCIAL_CONNECTIONS",
  "financial_connections/accounts": "FINANCIAL_CONNECTIONS",
  "financial_connections/sessions": "FINANCIAL_CONNECTIONS",
  "financial_connections/transactions": "FINANCIAL_CONNECTIONS",
  link_account_sessions: "FINANCIAL_CONNECTIONS",
  linked_accounts: "FINANCIAL_CONNECTIONS",
  forwarding: "FINANCIAL_CONNECTIONS",
  "forwarding/requests": "FINANCIAL_CONNECTIONS",
  // Climate (dashboard.stripe.com/climate)
  climate: "CLIMATE",
  "climate/orders": "CLIMATE",
  "climate/products": "CLIMATE",
  "climate/suppliers": "CLIMATE",
  // Identity (dashboard.stripe.com/identity)
  identity: "IDENTITY",
  "identity/verification_reports": "IDENTITY",
  "identity/verification_sessions": "IDENTITY",
  // Reporting & data (dashboard.stripe.com/reports, /sigma)
  reporting: "REPORTING_DATA",
  "reporting/report_runs": "REPORTING_DATA",
  "reporting/report_types": "REPORTING_DATA",
  sigma: "REPORTING_DATA",
  "sigma/saved_queries": "REPORTING_DATA",
  "sigma/scheduled_query_runs": "REPORTING_DATA",
  // Developer tools (Workbench: webhooks, events, apps, files)
  events: "DEVELOPER_TOOLS",
  "core/events": "DEVELOPER_TOOLS",
  "core/event_destinations": "DEVELOPER_TOOLS",
  webhook_endpoints: "DEVELOPER_TOOLS",
  apps: "DEVELOPER_TOOLS",
  "apps/installs": "DEVELOPER_TOOLS",
  "apps/secrets": "DEVELOPER_TOOLS",
  files: "DEVELOPER_TOOLS",
  file_links: "DEVELOPER_TOOLS",
  exchange_rates: "DEVELOPER_TOOLS",
  // Settings (account, payment methods, Apple Pay, 3DS)
  account: "SETTINGS_ACCOUNT",
  external_accounts: "SETTINGS_ACCOUNT",
  payment_methods: "SETTINGS_ACCOUNT",
  "payment_method_configurations": "SETTINGS_ACCOUNT",
  "payment_method_domains": "SETTINGS_ACCOUNT",
  apple_pay: "SETTINGS_ACCOUNT",
  "apple_pay/domains": "SETTINGS_ACCOUNT",
  three_d_secure: "SETTINGS_ACCOUNT",
  "three_d_secure/authentications": "SETTINGS_ACCOUNT",
  mandates: "SETTINGS_ACCOUNT",
  tokens: "SETTINGS_ACCOUNT",
  // Test helpers (test-mode only)
  test_helpers: "TEST_HELPERS",
  "test_helpers/customers": "TEST_HELPERS",
  "test_helpers/issuing": "TEST_HELPERS",
  "test_helpers/refunds": "TEST_HELPERS",
  "test_helpers/terminal": "TEST_HELPERS",
  "test_helpers/test_clocks": "TEST_HELPERS",
  "test_helpers/treasury": "TEST_HELPERS",
};

interface AreaFact {
  readonly area: DashboardArea;
  readonly families: readonly string[];
  readonly operations: number;
  readonly dispatchable: number;
  readonly held: number;
  readonly heldOperations: readonly string[];
  readonly implemented: number;
  readonly implementedWithLimits: number;
  readonly reads: number;
  readonly writes: number;
  readonly v2: number;
  readonly accountGated: number;
  readonly testHelpers: number;
  readonly strongConfirm: number;
  readonly confirm: number;
  readonly reauth: number;
}

function main(): void {
  if (STRIPE_OPERATION_CENSUS.length !== 644) {
    throw new Error(`census size ${STRIPE_OPERATION_CENSUS.length} != the pinned 644`);
  }
  const byArea = new Map<DashboardArea, string[]>();
  for (const area of DASHBOARD_AREAS) byArea.set(area, []);
  const unmapped: string[] = [];
  for (const record of STRIPE_OPERATION_CENSUS) {
    const area = DASHBOARD_AREA_BY_FAMILY[record.resourceFamily];
    if (area === undefined) {
      unmapped.push(record.resourceFamily);
      continue;
    }
    byArea.get(area)!.push(record.operationId);
  }
  if (unmapped.length > 0) {
    throw new Error(`unmapped families: ${[...new Set(unmapped)].sort().join(", ")}`);
  }

  const facts: AreaFact[] = DASHBOARD_AREAS.map((area) => {
    const ids = new Set(byArea.get(area)!);
    const records = STRIPE_OPERATION_CENSUS.filter((r) => ids.has(r.operationId));
    const dispatchable = records.filter(
      (r) => r.supportState === "IMPLEMENTED" || r.supportState === "IMPLEMENTED_WITH_LIMITS",
    );
    const held = records.filter((r) => r.supportState === "NOT_SUPPORTED_WITH_REASON");
    return {
      area,
      families: [...new Set(records.map((r) => r.resourceFamily))].sort(),
      operations: records.length,
      dispatchable: dispatchable.length,
      held: held.length,
      heldOperations: held.map((r) => r.operationId),
      implemented: records.filter((r) => r.supportState === "IMPLEMENTED").length,
      implementedWithLimits: records.filter(
        (r) => r.supportState === "IMPLEMENTED_WITH_LIMITS",
      ).length,
      reads: records.filter((r) => r.effectClass === "READ_ONLY").length,
      writes: records.filter((r) => r.effectClass !== "READ_ONLY").length,
      v2: records.filter((r) => r.operationId.startsWith("PostV2") || r.operationId.startsWith("GetV2") || r.operationId.startsWith("DeleteV2")).length,
      accountGated: records.filter(
        (r) =>
          r.supportState === "IMPLEMENTED_WITH_LIMITS" &&
          !r.resourceFamily.startsWith("test_helpers/") &&
          r.operationId !== "PostFiles",
      ).length,
      testHelpers: records.filter((r) => r.resourceFamily.startsWith("test_helpers/")).length,
      strongConfirm: dispatchable.filter((r) => r.approvalTier === "STRONG_CONFIRM").length,
      confirm: dispatchable.filter((r) => r.approvalTier === "CONFIRM").length,
      reauth: dispatchable.filter((r) => r.approvalTier === "REAUTH").length,
    };
  });

  const totalOps = facts.reduce((n, f) => n + f.operations, 0);
  const totalDispatchable = facts.reduce((n, f) => n + f.dispatchable, 0);
  const totalHeld = facts.reduce((n, f) => n + f.held, 0);
  if (totalOps !== 644) throw new Error(`area partition sums to ${totalOps}, not 644`);
  const empty = facts.filter((f) => f.operations === 0).map((f) => f.area);
  if (empty.length > 0 && empty.join(",") !== "HOME") {
    throw new Error(`unexpected empty areas (only HOME may be empty): ${empty.join(",")}`);
  }

  const artifact = {
    generatedAt: "2026-11-03",
    generator: "scripts/p26/dashboard-parity-facts.ts",
    method:
      "STRIPE_OPERATION_CENSUS (operations.json × overlay.ts) partitioned by the reviewed DASHBOARD_AREA_BY_FAMILY table; counts mechanical, mapping reviewed; the generator refuses to emit on any drift",
    pin: {
      release: STRIPE_OPENAPI_PIN.release,
      specInfoVersion: STRIPE_OPENAPI_PIN.specInfoVersion,
      operations: STRIPE_CENSUS_PIN.operationCount,
    },
    totals: {
      operations: totalOps,
      dispatchable: totalDispatchable,
      held: totalHeld,
      areas: DASHBOARD_AREAS.length,
      families: Object.keys(DASHBOARD_AREA_BY_FAMILY).length,
    },
    areas: facts,
    dashboardOnlySurfaces: {
      note:
        "Dashboard capabilities with NO public GA API operation can never appear in the census; the evidence-backed list (API keys, team/2FA/SSO, Radar rules, event resend, self bank-account/payout-schedule, scheduled-report delivery, the subscription CSV toolkit, custom domains, account closure, …) lives in the parity matrix §3 with Stripe doc citations.",
    },
  };

  const out = join(
    import.meta.dirname,
    "../../docs/productization-evidence/p26-0-dashboard-parity-FACTS-2026-11-03.json",
  );
  writeFileSync(out, JSON.stringify(artifact, null, 2) + "\n");
  const compact = facts
    .map(
      (f) =>
        `${f.area.padEnd(22)} ops=${String(f.operations).padStart(3)} dispatchable=${String(f.dispatchable).padStart(3)} held=${f.held} families=${f.families.length}`,
    )
    .join("\n");
  console.log(
    `dashboard-parity facts written: ${totalOps} ops / ${Object.keys(DASHBOARD_AREA_BY_FAMILY).length} families / ${DASHBOARD_AREAS.length} areas; dispatchable ${totalDispatchable}, held ${totalHeld}\n${compact}`,
  );
}

main();
