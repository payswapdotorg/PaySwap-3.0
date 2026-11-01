/**
 * @payswap/provider-runtime — the PACK FAMILY battery (P24-1).
 *
 * THE FLIP LAW made mechanical: every operation in the implemented
 * registry (STRIPE_P24_IMPLEMENTED_OPERATIONS) is exercised here through
 * the FULL dispatch pipeline — strict schema validation → v1/v2
 * serialization → the law chain (DENY gate, idempotency class, credential
 * gate, URL building) → a deterministic fake provider answer — with a
 * HAPPY path and at least one ERROR path per operation. An operation
 * missing from this table is not implemented; an entry missing from the
 * registry fails the exact-set assertion below. NO network, NO secrets:
 * the fake fetch scripts every answer (INV-24 — nothing fabricated).
 */

import { describe, expect, it } from 'vitest';
import { StripeCatalogueTransport } from '../../src/adapters/stripe/transport/catalogue-transport.ts';
import type { StripeErrorClass } from '../../src/adapters/stripe/transport/errors.ts';
import { STRIPE_P24_IMPLEMENTED_OPERATIONS } from '../../src/adapters/stripe/catalogue/implemented-operations.ts';
import { FakeStripeFetch, fakeCallContext } from './stripe-fake-transport.test.ts';

/** One family case: an operation + its valid params + the expected wire shape. */
interface FamilyCase {
  readonly operationId: string;
  readonly pack: 'A' | 'B' | 'C' | 'D' | 'E';
  /** Valid, schema-clean params (validated against the generated schema). */
  readonly params: Readonly<Record<string, unknown>>;
  /** The registrar-scoped idempotency key (v1 state-changing POSTs only). */
  readonly idempotencyKey?: string;
  /** The exact URL the wire must receive (built ONLY from the catalogue). */
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'DELETE';
  /** The exact serialized body (undefined = no body). */
  readonly body?: string;
  /** The error-path script. */
  readonly error: {
    readonly status: number;
    readonly body: unknown;
    readonly errorClass: StripeErrorClass;
  };
}

const BASE = 'https://api.stripe.com';

/** The per-operation happy+error table (the §14 surface). */
const CASES: readonly FamilyCase[] = [
  // ---- Pack A: account, balance, balance transactions, events ----
  {
    operationId: 'GetAccount', pack: 'A', params: {}, method: 'GET', url: `${BASE}/v1/account`,
    error: { status: 401, body: { error: { type: 'invalid_request_error', code: 'invalid_api_key' } }, errorClass: 'AUTHENTICATION_ERROR' },
  },
  {
    operationId: 'GetBalance', pack: 'A', params: {}, method: 'GET', url: `${BASE}/v1/balance`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  {
    operationId: 'GetBalanceTransactions', pack: 'A', params: { limit: 2 }, method: 'GET', url: `${BASE}/v1/balance_transactions?limit=2`,
    error: { status: 403, body: { error: { type: 'invalid_request_error', message: 'key lacks the balance read permission' } }, errorClass: 'PERMISSION_SCOPE_ERROR' },
  },
  {
    operationId: 'GetEvents', pack: 'A', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/events?limit=1`,
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_invalid_integer' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetEventsId', pack: 'A', params: { id: 'evt_FAKE0001' }, method: 'GET', url: `${BASE}/v1/events/evt_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  // ---- Pack B: customers ----
  {
    operationId: 'GetCustomers', pack: 'B', params: { limit: 1, email: 'buyer@example.test' }, method: 'GET',
    url: `${BASE}/v1/customers?email=buyer%40example.test&limit=1`,
    error: { status: 403, body: { error: { type: 'invalid_request_error' } }, errorClass: 'PERMISSION_SCOPE_ERROR' },
  },
  {
    operationId: 'GetCustomersCustomer', pack: 'B', params: { customer: 'cus_FAKE0001' }, method: 'GET',
    url: `${BASE}/v1/customers/cus_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'PostCustomers', pack: 'B', method: 'POST', url: `${BASE}/v1/customers`,
    params: { email: 'buyer@example.test', name: 'Annual Membership Buyer', metadata: { tier: 'gold' } },
    idempotencyKey: 'registrar-customer-create-1', body: 'email=buyer%40example.test&metadata%5Btier%5D=gold&name=Annual+Membership+Buyer',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'email_invalid' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'PostCustomersCustomer', pack: 'B', method: 'POST', url: `${BASE}/v1/customers/cus_FAKE0001`,
    params: { customer: 'cus_FAKE0001', metadata: { tier: 'platinum' }, description: '' },
    idempotencyKey: 'registrar-customer-update-1', body: 'description=&metadata%5Btier%5D=platinum',
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  // ---- Pack C: payments and checkout ----
  {
    operationId: 'PostPaymentIntents', pack: 'C', method: 'POST', url: `${BASE}/v1/payment_intents`,
    params: { amount: 12000, currency: 'usd', metadata: { mission: 'm-1' } },
    idempotencyKey: 'registrar-pi-create-1', body: 'amount=12000&currency=usd&metadata%5Bmission%5D=m-1',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_invalid_integer' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetPaymentIntentsIntent', pack: 'C', params: { intent: 'pi_FAKE0001' }, method: 'GET',
    url: `${BASE}/v1/payment_intents/pi_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'GetPaymentIntents', pack: 'C', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/payment_intents?limit=1`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  {
    operationId: 'PostPaymentIntentsIntentConfirm', pack: 'C', method: 'POST', url: `${BASE}/v1/payment_intents/pi_FAKE0001/confirm`,
    params: { intent: 'pi_FAKE0001', payment_method: 'pm_card_visa' },
    idempotencyKey: 'registrar-pi-confirm-1', body: 'payment_method=pm_card_visa',
    error: { status: 402, body: { error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } }, errorClass: 'PAYMENT_DECLINED' },
  },
  {
    operationId: 'PostCheckoutSessions', pack: 'C', method: 'POST', url: `${BASE}/v1/checkout/sessions`,
    params: {
      mode: 'payment',
      success_url: 'https://shop.example.test/success',
      line_items: [{ price: 'price_FAKE0001', quantity: 1 }],
    },
    idempotencyKey: 'registrar-cs-create-1',
    body: 'line_items%5B0%5D%5Bprice%5D=price_FAKE0001&line_items%5B0%5D%5Bquantity%5D=1&mode=payment&success_url=https%3A%2F%2Fshop.example.test%2Fsuccess',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_invalid_integer' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetCheckoutSessionsSession', pack: 'C', params: { session: 'cs_FAKE0001' }, method: 'GET',
    url: `${BASE}/v1/checkout/sessions/cs_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'GetCheckoutSessions', pack: 'C', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/checkout/sessions?limit=1`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  {
    operationId: 'PostSetupIntents', pack: 'C', method: 'POST', url: `${BASE}/v1/setup_intents`,
    // NOTE: the pinned v2596 spec names it allowed_payment_method_types
    // (the classic payment_method_types surface was renamed upstream).
    params: { allowed_payment_method_types: ['card'], metadata: { purpose: 'off-session' } },
    idempotencyKey: 'registrar-seti-create-1', body: 'allowed_payment_method_types%5B0%5D=card&metadata%5Bpurpose%5D=off-session',
    error: { status: 400, body: { error: { type: 'invalid_request_error' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetSetupIntentsIntent', pack: 'C', params: { intent: 'seti_FAKE0001' }, method: 'GET',
    url: `${BASE}/v1/setup_intents/seti_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'GetSetupIntents', pack: 'C', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/setup_intents?limit=1`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  {
    operationId: 'PostSetupIntentsIntentConfirm', pack: 'C', method: 'POST', url: `${BASE}/v1/setup_intents/seti_FAKE0001/confirm`,
    params: { intent: 'seti_FAKE0001', payment_method: 'pm_card_visa' },
    idempotencyKey: 'registrar-seti-confirm-1', body: 'payment_method=pm_card_visa',
    error: { status: 400, body: { error: { type: 'invalid_request_error' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetCharges', pack: 'C', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/charges?limit=1`,
    error: { status: 403, body: { error: { type: 'invalid_request_error' } }, errorClass: 'PERMISSION_SCOPE_ERROR' },
  },
  {
    operationId: 'GetChargesCharge', pack: 'C', params: { charge: 'ch_FAKE0001' }, method: 'GET', url: `${BASE}/v1/charges/ch_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'PostChargesChargeCapture', pack: 'C', method: 'POST', url: `${BASE}/v1/charges/ch_FAKE0001/capture`,
    params: { charge: 'ch_FAKE0001', amount: 5000 },
    idempotencyKey: 'registrar-capture-1', body: 'amount=5000',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'charge_already_captured' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'PostRefunds', pack: 'C', method: 'POST', url: `${BASE}/v1/refunds`,
    params: { payment_intent: 'pi_FAKE0001', amount: 1000, reason: 'requested_by_customer' },
    idempotencyKey: 'registrar-refund-1', body: 'amount=1000&payment_intent=pi_FAKE0001&reason=requested_by_customer',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'charge_already_refunded' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetRefundsRefund', pack: 'C', params: { refund: 're_FAKE0001' }, method: 'GET', url: `${BASE}/v1/refunds/re_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'GetRefunds', pack: 'C', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/refunds?limit=1`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  {
    operationId: 'PostPaymentLinks', pack: 'C', method: 'POST', url: `${BASE}/v1/payment_links`,
    params: { line_items: [{ price: 'price_FAKE0001', quantity: 1 }] },
    idempotencyKey: 'registrar-plink-create-1', body: 'line_items%5B0%5D%5Bprice%5D=price_FAKE0001&line_items%5B0%5D%5Bquantity%5D=1',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_invalid_integer' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetPaymentLinksPaymentLink', pack: 'C', params: { payment_link: 'plink_FAKE0001' }, method: 'GET',
    url: `${BASE}/v1/payment_links/plink_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'GetPaymentLinks', pack: 'C', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/payment_links?limit=1`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  {
    operationId: 'PostPaymentLinksPaymentLink', pack: 'C', method: 'POST', url: `${BASE}/v1/payment_links/plink_FAKE0001`,
    params: { payment_link: 'plink_FAKE0001', active: false },
    idempotencyKey: 'registrar-plink-update-1', body: 'active=false',
    error: { status: 400, body: { error: { type: 'invalid_request_error' } }, errorClass: 'INVALID_REQUEST' },
  },
  // ---- Pack D: products, prices ----
  {
    operationId: 'PostProducts', pack: 'D', method: 'POST', url: `${BASE}/v1/products`,
    params: { name: 'Annual Membership', description: 'One year of membership' },
    idempotencyKey: 'registrar-product-create-1', body: 'description=One+year+of+membership&name=Annual+Membership',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_missing' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetProductsId', pack: 'D', params: { id: 'prod_FAKE0001' }, method: 'GET', url: `${BASE}/v1/products/prod_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'PostProductsId', pack: 'D', method: 'POST', url: `${BASE}/v1/products/prod_FAKE0001`,
    params: { id: 'prod_FAKE0001', description: 'Updated description' },
    idempotencyKey: 'registrar-product-update-1', body: 'description=Updated+description',
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'GetProducts', pack: 'D', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/products?limit=1`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  {
    operationId: 'DeleteProductsId', pack: 'D', method: 'DELETE', url: `${BASE}/v1/products/prod_FAKE0001`,
    params: { id: 'prod_FAKE0001' },
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'PostPrices', pack: 'D', method: 'POST', url: `${BASE}/v1/prices`,
    params: { currency: 'usd', unit_amount: 12000, product: 'prod_FAKE0001', recurring: { interval: 'year' } },
    idempotencyKey: 'registrar-price-create-1',
    body: 'currency=usd&product=prod_FAKE0001&recurring%5Binterval%5D=year&unit_amount=12000',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_missing' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetPricesPrice', pack: 'D', params: { price: 'price_FAKE0001' }, method: 'GET', url: `${BASE}/v1/prices/price_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'GetPrices', pack: 'D', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/prices?limit=1`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  // ---- Pack E: billing, invoicing, subscriptions, portal ----
  {
    operationId: 'PostInvoices', pack: 'E', method: 'POST', url: `${BASE}/v1/invoices`,
    params: { customer: 'cus_FAKE0001', metadata: { mission: 'm-2' } },
    idempotencyKey: 'registrar-invoice-create-1', body: 'customer=cus_FAKE0001&metadata%5Bmission%5D=m-2',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_missing' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetInvoicesInvoice', pack: 'E', params: { invoice: 'in_FAKE0001' }, method: 'GET', url: `${BASE}/v1/invoices/in_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'GetInvoices', pack: 'E', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/invoices?limit=1`,
    error: { status: 429, body: { error: { type: 'invalid_request_error' } }, errorClass: 'RATE_LIMITED' },
  },
  {
    operationId: 'PostSubscriptions', pack: 'E', method: 'POST', url: `${BASE}/v1/subscriptions`,
    params: { customer: 'cus_FAKE0001', items: [{ price: 'price_FAKE0001' }] },
    idempotencyKey: 'registrar-sub-create-1', body: 'customer=cus_FAKE0001&items%5B0%5D%5Bprice%5D=price_FAKE0001',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_missing' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetSubscriptionsSubscriptionExposedId', pack: 'E', params: { subscription_exposed_id: 'sub_FAKE0001' }, method: 'GET',
    url: `${BASE}/v1/subscriptions/sub_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
  {
    operationId: 'PostBillingPortalSessions', pack: 'E', method: 'POST', url: `${BASE}/v1/billing_portal/sessions`,
    params: { customer: 'cus_FAKE0001' },
    idempotencyKey: 'registrar-portal-1', body: 'customer=cus_FAKE0001',
    error: { status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_missing' } }, errorClass: 'INVALID_REQUEST' },
  },
  {
    operationId: 'GetDisputes', pack: 'E', params: { limit: 1 }, method: 'GET', url: `${BASE}/v1/disputes?limit=1`,
    error: { status: 403, body: { error: { type: 'invalid_request_error' } }, errorClass: 'PERMISSION_SCOPE_ERROR' },
  },
  {
    operationId: 'GetDisputesDispute', pack: 'E', params: { dispute: 'dp_FAKE0001' }, method: 'GET', url: `${BASE}/v1/disputes/dp_FAKE0001`,
    error: { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_missing' } }, errorClass: 'RESOURCE_NOT_FOUND' },
  },
];

describe('the pack family battery — the flip law is exact', () => {
  it('the case table EXACTLY equals the implemented registry (no silent flip, no silent gap)', () => {
    const tableIds = new Set(CASES.map((c) => c.operationId));
    expect([...tableIds].sort()).toEqual([...STRIPE_P24_IMPLEMENTED_OPERATIONS].sort());
  });

  it('every case carries a distinct operation (no double-covering)', () => {
    const ids = CASES.map((c) => c.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the pack family battery — happy + error per operation (deterministic fakes)', () => {
  for (const testCase of CASES) {
    it(`${testCase.pack}/${testCase.operationId}: happy path builds the exact catalogue wire form`, async () => {
      const fake = new FakeStripeFetch().script({
        kind: 'OK',
        status: 200,
        body: { id: 'obj_FAKE', object: 'fake' },
        requestId: `req_${testCase.operationId}`,
      });
      const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
      const result = await transport.dispatch({
        operationId: testCase.operationId,
        params: testCase.params,
        context: fakeCallContext(),
        ...(testCase.idempotencyKey !== undefined ? { idempotencyKey: testCase.idempotencyKey } : {}),
      });
      expect(result.kind, `${testCase.operationId} happy path`).toBe('OK');
      const call = fake.calls()[0]!;
      expect(call.url).toBe(testCase.url);
      expect(call.method).toBe(testCase.method);
      expect(call.body).toBe(testCase.body);
      expect(call.stripeVersion).toBe('2026-09-30.endive');
      if (testCase.idempotencyKey !== undefined) {
        expect(call.idempotencyKey).toBe(testCase.idempotencyKey);
      } else {
        expect(call.idempotencyKey).toBeNull();
      }
      // The Authorization VALUE never appears in any recorded artifact.
      expect(JSON.stringify(fake.calls())).not.toContain('sk_test_');
    });

    it(`${testCase.pack}/${testCase.operationId}: error path classifies the typed provider answer`, async () => {
      const fake = new FakeStripeFetch().script({
        kind: 'HTTP_ERROR',
        status: testCase.error.status,
        body: testCase.error.body,
        requestId: `req_${testCase.operationId}_err`,
      });
      const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
      const result = await transport.dispatch({
        operationId: testCase.operationId,
        params: testCase.params,
        context: fakeCallContext(),
        ...(testCase.idempotencyKey !== undefined ? { idempotencyKey: testCase.idempotencyKey } : {}),
      });
      expect(result.kind, `${testCase.operationId} error path`).toBe('ERROR_STATUS');
      if (result.kind === 'ERROR_STATUS') {
        expect(result.error.errorClass).toBe(testCase.error.errorClass);
        expect(result.error.httpStatus).toBe(testCase.error.status);
        expect(result.requestId).toBe(`req_${testCase.operationId}_err`);
      }
    });
  }
});
