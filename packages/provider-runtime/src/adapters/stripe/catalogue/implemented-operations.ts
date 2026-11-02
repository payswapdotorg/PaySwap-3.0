/**
 * @payswap/provider-runtime — the P24-1 IMPLEMENTED operation surface (the
 * historical state-flip registry, ADR-0017 D3/D7).
 *
 * THE FLIP LAW (P24): an operation's support state flipped
 * PLANNED_P24_INITIAL_RELEASE → IMPLEMENTED only when the operation was
 * implemented AND covered by a deterministic fake-transport test in this
 * package (the family battery asserted the exact set — a flip without its
 * test was a governance violation, mechanically caught).
 *
 * THE P25 LAW superseded the hand-list: the dispatchable surface is now
 * rule-derived (see overlay.ts's p25SupportState — the P25-0 coverage
 * audit's full-coverage flip). This module keeps the two P24 tables as the
 * reviewed lineage: the implemented set (the census battery asserts every
 * entry still dispatches under P25) and the reviewed read-back routes (the
 * override table the P25 derivation in read-back-routes.ts honors first).
 */

/**
 * The implemented operations, grouped by resource pack (the P24 reviewed
 * lineage — 46 entries; the P24-1 addition beyond the P24-0 set was
 * DeleteProductsId, product archive). Under P25 every entry dispatches by
 * rule; this table remains the tested historical registry the census
 * battery's flip-law coherence asserts against.
 */
export const STRIPE_P24_IMPLEMENTED_OPERATIONS: ReadonlySet<string> = new Set([
  // Pack A — account, balance, balance transactions, events (read-back pair)
  'GetAccount',
  'GetBalance',
  'GetBalanceTransactions',
  'GetEvents',
  'GetEventsId',
  // Pack B — customers: list/get/create/update
  'GetCustomers',
  'GetCustomersCustomer',
  'PostCustomers',
  'PostCustomersCustomer',
  // Pack C — payments and checkout
  'PostPaymentIntents',
  'GetPaymentIntentsIntent',
  'GetPaymentIntents',
  'PostPaymentIntentsIntentConfirm',
  'PostCheckoutSessions',
  'GetCheckoutSessionsSession',
  'GetCheckoutSessions',
  'PostSetupIntents',
  'GetSetupIntentsIntent',
  'GetSetupIntents',
  'PostSetupIntentsIntentConfirm',
  'GetCharges',
  'GetChargesCharge',
  'PostChargesChargeCapture',
  'PostRefunds',
  'GetRefundsRefund',
  'GetRefunds',
  'PostPaymentLinks',
  'GetPaymentLinksPaymentLink',
  'GetPaymentLinks',
  'PostPaymentLinksPaymentLink',
  // Pack D — products, prices (create/retrieve/update/list + archive)
  'PostProducts',
  'GetProductsId',
  'PostProductsId',
  'GetProducts',
  'DeleteProductsId',
  'PostPrices',
  'GetPricesPrice',
  'GetPrices',
  // Pack E — billing, invoicing, subscriptions, portal
  'PostInvoices',
  'GetInvoicesInvoice',
  'GetInvoices',
  'PostSubscriptions',
  'GetSubscriptionsSubscriptionExposedId',
  'PostBillingPortalSessions',
  'GetDisputes',
  'GetDisputesDispute',
]);

/**
 * The reviewed P24 read-back routes now live in read-back-routes.ts (the P25
 * rule-derived verification surface; this table moved there verbatim and the
 * derivation honors it first). Re-exported here so the historical import
 * paths keep resolving.
 */
export { STRIPE_P24_READ_BACK_ROUTES, stripeReadBackOperationOf } from './read-back-routes.ts';
