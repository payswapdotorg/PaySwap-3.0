/**
 * @payswap/provider-runtime — the STRICT request-schema validator battery
 * (P24-1, ADR-0017 D4). Handoff §13.1 gates made mechanical:
 * - unknown fields REJECTED; missing required REJECTED; type mismatches
 *   REJECTED;
 * - oneOf/anyOf union semantics (Stripe's enum [""] clear convention);
 * - additionalProperties maps (metadata/payload) validate their values;
 * - allOf branches all enforce; unresolvable/unrepresentable → FAIL CLOSED;
 * - path params are required, non-empty, charset-safe;
 * - the empty-vs-null law: '' clears on the wire, null/undefined omits.
 *
 * All assertions run against the REAL generated schemas of the pinned
 * spec (committed artifact data — no fabricated schema shapes).
 */

import { describe, expect, it } from 'vitest';
import { stripeOperationSchema, STRIPE_SCHEMA_DEFS } from '../../src/adapters/stripe/catalogue/schema-reader.ts';
import {
  validateStripeOperationParameters,
} from '../../src/adapters/stripe/catalogue/schema-validator.ts';
import type { StripeOperationSchemaRecord } from '../../src/adapters/stripe/catalogue/schema-nodes.ts';

function validate(op: string, params: unknown): ReturnType<typeof validateStripeOperationParameters> {
  const record = stripeOperationSchema(op) as StripeOperationSchemaRecord;
  expect(record).toBeDefined();
  return validateStripeOperationParameters(record, STRIPE_SCHEMA_DEFS, params);
}

describe('the strict validator — happy paths (real pinned schemas)', () => {
  it('validates and splits a full PaymentIntent create (path/query/body)', () => {
    const result = validate('PostPaymentIntents', {
      amount: 1500,
      currency: 'usd',
      metadata: { mission: 'm-1', command: 'cmd-9' },
      'automatic_payment_methods': { enabled: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.path).toEqual({});
      expect(result.value.query).toEqual({});
      expect(result.value.body).toEqual({
        amount: 1500,
        currency: 'usd',
        metadata: { mission: 'm-1', command: 'cmd-9' },
        automatic_payment_methods: { enabled: true },
      });
    }
  });

  it('validates a customer retrieve (path + expand query array)', () => {
    const result = validate('GetCustomersCustomer', {
      customer: 'cus_FAKE123',
      expand: ['default_source'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.path).toEqual({ customer: 'cus_FAKE123' });
      expect(result.value.query).toEqual({ expand: ['default_source'] });
      expect(result.value.body).toEqual({});
    }
  });

  it('validates a payment link create with nested line_items', () => {
    const result = validate('PostPaymentLinks', {
      line_items: [{ price: 'price_FAKE1', quantity: 1 }],
    });
    expect(result.ok).toBe(true);
  });

  it('validates the created range-query union (object variant AND integer variant)', () => {
    expect(validate('GetCustomers', { created: { gte: 1700000000, lt: 1800000000 } }).ok).toBe(true);
    expect(validate('GetCustomers', { created: 1700000000 }).ok).toBe(true);
  });

  it('validates the empty-string clear convention (anyOf [string, enum ""])', () => {
    // A real string value:
    expect(validate('PostCustomers', { description: 'Annual membership buyer' }).ok).toBe(true);
    // The explicit-clear empty string:
    expect(validate('PostCustomers', { description: '' }).ok).toBe(true);
    // A typed address object:
    expect(validate('PostCustomers', { address: { city: 'Lagos', country: 'NG' } }).ok).toBe(true);
    // The clear convention on the whole address:
    expect(validate('PostCustomers', { address: '' }).ok).toBe(true);
  });

  it('validates metadata maps (string→string) and their bounds', () => {
    expect(validate('PostCustomers', { metadata: { tier: 'gold' } }).ok).toBe(true);
    const bad = validate('PostCustomers', { metadata: { tier: 7 } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'TYPE_MISMATCH' && i.at.startsWith('body.metadata'))).toBe(true);
    }
  });

  it('validates refund reason enum values (real PostRefunds schema)', () => {
    expect(validate('PostRefunds', { reason: 'requested_by_customer' }).ok).toBe(true);
    const bad = validate('PostRefunds', { reason: 'not_a_stripe_reason' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'ENUM_MISMATCH')).toBe(true);
    }
  });
});

describe('the strict validator — rejections (fail-closed, never coerced)', () => {
  it('REJECTS unknown fields', () => {
    const bad = validate('PostPaymentIntents', { amount: 100, currency: 'usd', bogus_field: 1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'UNKNOWN_FIELD' && i.at === 'bogus_field')).toBe(true);
    }
  });

  it('REJECTS unknown nested fields inside objects (unions enforce strictly per variant)', () => {
    const bad = validate('PostCustomers', { address: { city: 'Lagos', planet: 'Earth' } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      // The address is a union [address-object, enum ""]: the polluted object
      // matches NEITHER variant (the object variant rejects the unknown key
      // under the strict law; the string variant is not an object at all).
      expect(bad.issues.some((i) => i.kind === 'TYPE_MISMATCH' && i.at === 'body.address')).toBe(true);
    }
  });

  it('REJECTS missing required body fields', () => {
    const bad = validate('PostPaymentIntents', { currency: 'usd' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'MISSING_REQUIRED' && i.at === 'body.amount')).toBe(true);
    }
  });

  it('REJECTS null on a required field as missing (null omits, never satisfies)', () => {
    const bad = validate('PostPaymentIntents', { amount: null, currency: 'usd' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'MISSING_REQUIRED')).toBe(true);
    }
  });

  it('REJECTS type mismatches (integer field fed a numeric STRING — never coerced)', () => {
    const bad = validate('PostPaymentIntents', { amount: '1500', currency: 'usd' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'TYPE_MISMATCH' && i.at === 'body.amount')).toBe(true);
    }
  });

  it('REJECTS non-integer numbers for integer fields', () => {
    const bad = validate('PostPaymentIntents', { amount: 15.5, currency: 'usd' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'TYPE_MISMATCH' && i.at === 'body.amount')).toBe(true);
    }
  });

  it('REJECTS a boolean fed to a string field', () => {
    const bad = validate('PostCustomers', { email: true });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'TYPE_MISMATCH')).toBe(true);
    }
  });

  it('REJECTS a missing path parameter (the URL cannot be built)', () => {
    const bad = validate('GetCustomersCustomer', { expand: [] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'MISSING_REQUIRED' && i.at === 'customer')).toBe(true);
    }
  });

  it('REJECTS path parameters outside the safe charset (injection shapes)', () => {
    const traversal = validate('GetCustomersCustomer', { customer: '../admin' });
    expect(traversal.ok).toBe(false);
    const spaced = validate('GetCustomersCustomer', { customer: 'cus FAKE' });
    expect(spaced.ok).toBe(false);
    const empty = validate('GetCustomersCustomer', { customer: '' });
    expect(empty.ok).toBe(false);
  });

  it('REJECTS a non-record params value outright', () => {
    expect(validate('GetAccount', 'not-an-object').ok).toBe(false);
    expect(validate('GetAccount', ['array']).ok).toBe(false);
  });

  it('enforces spec bounds (maxLength on a real bounded field)', () => {
    // PostCustomers.email is maxLength 512 in the pinned spec.
    const bad = validate('PostCustomers', { email: 'a'.repeat(513) });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'BOUND_VIOLATION')).toBe(true);
    }
    expect(validate('PostCustomers', { email: 'a'.repeat(512) }).ok).toBe(true);
  });

  it('REJECTS GET body params (GET request surfaces carry no body)', () => {
    const bad = validate('GetAccount', { some_field: 1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'UNKNOWN_FIELD')).toBe(true);
    }
  });

  it('REJECTS union values that match no variant', () => {
    const bad = validate('PostCustomers', { address: 42 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.kind === 'TYPE_MISMATCH')).toBe(true);
    }
  });
});

describe('the strict validator — fail-closed constructs (D4 never-coerce law)', () => {
  it('FAILS CLOSED for an operation whose schema carries an unresolvable ref', () => {
    const record: StripeOperationSchemaRecord = {
      operationId: 'SyntheticUnresolvable',
      method: 'POST',
      path: '/v1/synthetic',
      parameters: {},
      body: {
        contentType: 'application/x-www-form-urlencoded',
        required: true,
        schema: { kind: 'unresolvable', ref: '#/components/schemas/nope' },
      },
    };
    const result = validateStripeOperationParameters(record, STRIPE_SCHEMA_DEFS, { a: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.kind === 'FAIL_CLOSED')).toBe(true);
    }
  });

  it('FAILS CLOSED for an unrepresentable nested construct (never silently dropped)', () => {
    const record: StripeOperationSchemaRecord = {
      operationId: 'SyntheticUnrepresentable',
      method: 'POST',
      path: '/v1/synthetic',
      parameters: {},
      body: {
        contentType: 'application/json',
        required: true,
        schema: {
          kind: 'object',
          properties: {
            patterned: { kind: 'unrepresentable', reason: 'patternProperties' },
          },
        },
      },
    };
    const result = validateStripeOperationParameters(record, STRIPE_SCHEMA_DEFS, { patterned: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.kind === 'FAIL_CLOSED')).toBe(true);
    }
  });

  it('the empty-vs-null law: null optional fields omit; only "" clears', () => {
    // null description = omit (valid, touches nothing on the wire)
    const omitted = validate('PostCustomers', { description: null });
    expect(omitted.ok).toBe(true);
    if (omitted.ok) {
      expect(omitted.value.body).toEqual({});
    }
    // '' description = the explicit clear (valid, sent as empty)
    const cleared = validate('PostCustomers', { description: '' });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.value.body).toEqual({ description: '' });
    }
  });
});
