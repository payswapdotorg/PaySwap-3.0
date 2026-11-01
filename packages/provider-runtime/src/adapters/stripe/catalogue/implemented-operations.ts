/**
 * @payswap/provider-runtime — the P24-1 IMPLEMENTED operation surface (the
 * state-flip registry, ADR-0017 D3/D7).
 *
 * THE FLIP LAW: an operation's support state flips
 * PLANNED_P24_INITIAL_RELEASE → IMPLEMENTED only when the operation is
 * implemented AND covered by a deterministic fake-transport test in this
 * package (the family battery asserts the exact set — a flip without its
 * test is a governance violation, mechanically caught).
 *
 * This table is the §14 first-release surface (the handoff's priority
 * list): account/balance/balance-transactions/customer reads; customer
 * create/update; product/price/payment-link create-retrieve-update-list
 * (+ product archive via DELETE); PaymentIntent/Checkout/SetupIntent
 * create-retrieve-list (+confirm/capture); refunds/disputes/invoices/
 * payments lists + retrieves; invoice/subscription/portal-session creates;
 * refund create; and the v1 events read-back pair.
 *
 * One reviewed addition to the P24-0 initial-release set: DeleteProductsId
 * (product archive) — named by the P24-1 work order's §14 reading
 * ("+ product archive"); its effect class flows through the reviewed rule
 * engine (DELETE → FINANCIAL_IRREVERSIBLE_OR_REVERSAL → STRONG_CONFIRM —
 * conservative, fail-closed). HONEST COUNT NOTE: the committed P24-0 set
 * carried 73 entries; with this addition it is 74.
 *
 * The honest remainder of the initial-release set stays
 * PLANNED_P24_INITIAL_RELEASE (see STRIPE_P24_INITIAL_RELEASE_OPERATIONS
 * minus this table): payment-method ops, searches, the invoice
 * finalize/send/void/pay lifecycle, invoice items, subscription
 * update/cancel, intent cancels, refund cancel, test clocks — each lands
 * only with its own implementation + tests.
 */

/**
 * The implemented operations, grouped by resource pack. Every entry:
 * 1. is in the P24 initial-release set (DeleteProductsId excepted, above);
 * 2. dispatches through the catalogue transport's full law chain;
 * 3. is exercised (happy + error path) by the family battery.
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
 * The reviewed read-back routes for the implemented surface: every
 * state-changing implemented operation pairs with the catalogue operation
 * that verifies its effect (handoff §4.3's required read-back route; the
 * frozen StripePreparedAction carries this as readBackOperationId).
 * Reads and one-shot surfaces carry null (honest, never invented).
 */
export const STRIPE_P24_READ_BACK_ROUTES: Readonly<Record<string, string | null>> = Object.freeze({
  PostCustomers: 'GetCustomersCustomer',
  PostCustomersCustomer: 'GetCustomersCustomer',
  PostPaymentIntents: 'GetPaymentIntentsIntent',
  PostPaymentIntentsIntentConfirm: 'GetPaymentIntentsIntent',
  PostSetupIntents: 'GetSetupIntentsIntent',
  PostSetupIntentsIntentConfirm: 'GetSetupIntentsIntent',
  PostCheckoutSessions: 'GetCheckoutSessionsSession',
  PostPaymentLinks: 'GetPaymentLinksPaymentLink',
  PostPaymentLinksPaymentLink: 'GetPaymentLinksPaymentLink',
  PostProducts: 'GetProductsId',
  PostProductsId: 'GetProductsId',
  DeleteProductsId: 'GetProductsId',
  PostPrices: 'GetPricesPrice',
  PostInvoices: 'GetInvoicesInvoice',
  PostSubscriptions: 'GetSubscriptionsSubscriptionExposedId',
  PostRefunds: 'GetRefundsRefund',
  PostChargesChargeCapture: 'GetChargesCharge',
  // A billing-portal session is a one-shot hosted URL: there is no
  // retrieve route — the honest null (never an invented verification).
  PostBillingPortalSessions: null,
});

/** Resolve the read-back operation for an implemented operation (null = none). */
export function stripeReadBackOperationOf(operationId: string): string | null {
  return STRIPE_P24_READ_BACK_ROUTES[operationId] ?? null;
}
