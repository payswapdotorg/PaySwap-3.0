/**
 * @payswap/provider-runtime — the P27-B Global-Payouts JOURNEY battery
 * (CONTRACT tier: the real journey code over the deterministic FakeStripeFetch
 * — no network, no credentials; the P24-1 fake-transport law).
 *
 * THIS FILE covers the journey's three write planes: the recipient plane
 * (the pinned v2 core accounts surface), the hosted recipient-information
 * form (the REAUTH tier law) and the third-party outbound payment (the
 * STRONG_CONFIRM + idempotency + eligibility-gated money movement). The
 * status/cancel/return, reconciliation, UNKNOWN and never-alias laws live in
 * stripe-global-payouts-lifecycle.test.ts.
 *
 * WHAT THIS BATTERY ENFORCES:
 * - the recipient plane dispatches on the pinned v2 core accounts surface
 *   (JSON body, no Idempotency-Key — the v2 identifier law);
 * - the hosted recipient-information form is REAUTH-gated: no dispatch
 *   without the host proof reference (ADR-0018's tier, machine-enforced);
 * - the outbound payment is STRONG_CONFIRM-gated, idempotency-key-bound,
 *   form-encoded on the pinned v1 Treasury surface with the third-party proof
 *   (end_user_details) — and only buildable from an ELIGIBLE verdict.
 */

import { describe, expect, it } from 'vitest';
import { StripeCatalogueTransport } from '../../src/adapters/stripe/transport/catalogue-transport.ts';
import { createStripeGlobalPayoutsJourney } from '../../src/adapters/stripe/catalogue/payouts-journey.ts';
import { FakeStripeFetch, fakeCallContext } from './stripe-fake-transport.test.ts';

function journeyWith(script: FakeStripeFetch) {
  const transport = new StripeCatalogueTransport({ fetchImpl: script.fetch });
  const journey = createStripeGlobalPayoutsJourney({ transport });
  return { script, journey };
}

/** A maximally-proven US→US contractor journey input (the ELIGIBLE baseline). */
const eligibleJourney = {
  originCountry: 'US',
  purposeClass: 'ContractorSupplierPayment' as const,
  recipientCountryCode: 'US',
  recipientCurrency: 'USD',
  payoutMethodId: 'bank_accounts.ach',
  amountMinorUnits: 1_000,
  sendingCurrency: 'USD',
  sendingLimitPayoutMethod: 'Standard',
  proofs: {
    treasuryEntitlement: { financialAccountId: 'fa_test_entitled', entitlementObserved: true },
    funding: { fundedMinorUnits: 10_000_000, currency: 'USD' },
  },
};

describe('the recipient plane (the pinned v2 core accounts surface)', () => {
  it('creates a recipient with a JSON body, no Idempotency-Key (the v2 identifier law)', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'account', id: 'acct_recipient_1' }, requestId: 'req_1' }),
    );
    const plan = journey.buildRecipientCreationPlan({
      country: 'US',
      entityType: 'individual',
      contactEmail: 'recipient@example.com',
      displayName: 'P27-B Test Recipient',
    });
    expect(plan.operationId).toBe('PostV2CoreAccounts');
    expect(plan.censusApprovalTier).toBe('CONFIRM');
    expect(plan.approvalRequirement).toBe('CONFIRM');
    expect(plan.idempotencyKeyRequired).toBe(false);
    expect(plan.readBackOperationId).toBe('GetV2CoreAccountsId');
    expect(plan.params).toMatchObject({ contact_email: 'recipient@example.com', identity: { country: 'US', entity_type: 'individual' } });

    const executed = await journey.executePlan(plan, fakeCallContext());
    expect(executed.kind).toBe('EXECUTED');
    expect(script.calls()).toHaveLength(1);
    const call = script.calls()[0]!;
    expect(call.url).toBe('https://api.stripe.com/v2/core/accounts');
    expect(call.method).toBe('POST');
    expect(call.idempotencyKey).toBeNull();
    expect(call.stripeVersion).toBe('2026-09-30.endive');
    const body = JSON.parse(call.body as string) as Record<string, unknown>;
    expect(body['identity']).toEqual({ country: 'US', entity_type: 'individual' });
    expect(body['contact_email']).toBe('recipient@example.com');
  });

  it('carries the pinned-surface limit note (the recipient payout-method tokens are not pinned)', () => {
    const { journey } = journeyWith(new FakeStripeFetch());
    const plan = journey.buildRecipientCreationPlan({ country: 'GB', entityType: 'company' });
    expect(plan.pinnedSurfaceNote).toContain('NOT in the pinned request schema');
  });
});

describe('the hosted recipient-information form (the REAUTH tier law)', () => {
  const hostedFormInput = {
    accountId: 'acct_recipient_1',
    useCaseType: 'account_onboarding' as const,
    refreshUrl: 'https://app.payswap.example/stripe/refresh',
    returnUrl: 'https://app.payswap.example/stripe/return',
  };

  it('refuses pre-dispatch without the host re-authentication proof reference', async () => {
    const { script, journey } = journeyWith(new FakeStripeFetch());
    const plan = journey.buildHostedRecipientInformationFormPlan(hostedFormInput);
    expect(plan.approvalRequirement).toBe('REAUTH');
    expect(plan.censusApprovalTier).toBe('REAUTH');
    const executed = await journey.executePlan(plan, fakeCallContext());
    expect(executed.kind).toBe('REFUSED_PRE_DISPATCH');
    if (executed.kind === 'REFUSED_PRE_DISPATCH') {
      expect(executed.reason).toBe('REAUTH_PROOF_REQUIRED');
      expect(executed.detail).toContain('ADR-0018');
    }
    expect(script.callCount).toBe(0); // never touched the wire
  });

  it('dispatches with the proof reference (the JSON use_case surface)', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'account_link', url: 'https://connect.stripe.com/setup/e/1' }, requestId: 'req_2' }),
    );
    const plan = journey.buildHostedRecipientInformationFormPlan(hostedFormInput);
    const executed = await journey.executePlan(plan, fakeCallContext(), { reauthenticationProofRef: 'reauth-proof:opaque-1' });
    expect(executed.kind).toBe('EXECUTED');
    const call = script.calls()[0]!;
    expect(call.url).toBe('https://api.stripe.com/v2/core/account_links');
    const body = JSON.parse(call.body as string) as Record<string, unknown>;
    expect(body['account']).toBe('acct_recipient_1');
    expect(body['use_case']).toEqual({
      type: 'account_onboarding',
      account_onboarding: { refresh_url: hostedFormInput.refreshUrl, return_url: hostedFormInput.returnUrl },
    });
  });

  it('requires the refreshUrl (the pinned API marks it required)', () => {
    const { journey } = journeyWith(new FakeStripeFetch());
    expect(() =>
      journey.buildHostedRecipientInformationFormPlan({ ...hostedFormInput, refreshUrl: '' }),
    ).toThrow(/refreshUrl/);
  });
});

describe('the third-party payout (the pinned v1 Treasury outbound-payment surface)', () => {
  const payoutInput = {
    journey: eligibleJourney,
    financialAccountId: 'fa_test_entitled',
    destination: {
      type: 'us_bank_account' as const,
      usBankAccount: {
        accountNumber: '000123456789',
        routingNumber: '110000000',
        accountHolderType: 'individual' as const,
      },
      billingDetails: { name: 'Test Recipient' },
    },
    idempotencyKey: 'p27b-test-outbound-1',
  };

  it('is only buildable from an ELIGIBLE verdict (the fail-closed gate)', () => {
    const { journey } = journeyWith(new FakeStripeFetch());
    const refused = journey.buildOutboundPaymentPlan({
      ...payoutInput,
      journey: { ...eligibleJourney, recipientCountryCode: 'GH', recipientCurrency: 'GHS' },
    });
    expect(refused.kind).toBe('NOT_PLANNED');
    if (refused.kind === 'NOT_PLANNED') {
      expect(refused.eligibility.kind).toBe('REFUSED');
    }
    const gated = journey.buildOutboundPaymentPlan({
      ...payoutInput,
      journey: { ...eligibleJourney, originCountry: 'DE', recipientCountryCode: 'DE', recipientCurrency: 'EUR' },
    });
    expect(gated.kind).toBe('NOT_PLANNED');
  });

  it('requires the STRONG_CONFIRM marker — refused pre-dispatch without it (the product law)', async () => {
    const { script, journey } = journeyWith(new FakeStripeFetch());
    const built = journey.buildOutboundPaymentPlan(payoutInput);
    expect(built.kind).toBe('PLAN');
    if (built.kind !== 'PLAN') return;
    expect(built.plan.approvalRequirement).toBe('STRONG_CONFIRM');
    const executed = await journey.executePlan(built.plan, fakeCallContext());
    expect(executed.kind).toBe('REFUSED_PRE_DISPATCH');
    if (executed.kind === 'REFUSED_PRE_DISPATCH') {
      expect(executed.reason).toBe('APPROVAL_STRONG_CONFIRM_REQUIRED');
      expect(executed.detail).toContain('never self-approves');
    }
    expect(script.callCount).toBe(0);
  });

  it('dispatches form-encoded with the Idempotency-Key bound and the third-party proof', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'outbound_payment', id: 'obp_test_1', status: 'processing', cancelable: true }, requestId: 'req_3' }),
    );
    const built = journey.buildOutboundPaymentPlan(payoutInput);
    expect(built.kind).toBe('PLAN');
    if (built.kind !== 'PLAN') return;
    const executed = await journey.executePlan(built.plan, fakeCallContext(), {
      strongConfirmationApproved: true,
    });
    expect(executed.kind).toBe('EXECUTED');
    const call = script.calls()[0]!;
    expect(call.url).toBe('https://api.stripe.com/v1/treasury/outbound_payments');
    expect(call.method).toBe('POST');
    expect(call.idempotencyKey).toBe('p27b-test-outbound-1');
    const body = decodeURIComponent(call.body as string);
    expect(body).toContain('amount=1000');
    expect(body).toContain('currency=usd');
    expect(body).toContain('financial_account=fa_test_entitled');
    expect(body).toContain('destination_payment_method_data[type]=us_bank_account');
    expect(body).toContain('destination_payment_method_data[us_bank_account][account_number]=000123456789');
    expect(body).toContain('destination_payment_method_data[us_bank_account][routing_number]=110000000');
    expect(body).toContain('end_user_details[present]=true');
  });

  it('an ineligible journey NEVER dispatches — the plan is not even built', () => {
    const { script, journey } = journeyWith(new FakeStripeFetch());
    journey.buildOutboundPaymentPlan({
      ...payoutInput,
      journey: { ...eligibleJourney, proofs: {} },
    });
    expect(script.callCount).toBe(0);
  });

  it('a financial-account destination dispatches with the pinned inline surface', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'outbound_payment', id: 'obp_test_2', status: 'processing', cancelable: false }, requestId: 'req_4' }),
    );
    const built = journey.buildOutboundPaymentPlan({
      ...payoutInput,
      destination: { type: 'financial_account', financialAccount: 'fa_other_account' },
    });
    expect(built.kind).toBe('PLAN');
    if (built.kind !== 'PLAN') return;
    const executed = await journey.executePlan(built.plan, fakeCallContext(), { strongConfirmationApproved: true });
    expect(executed.kind).toBe('EXECUTED');
    const body = decodeURIComponent(script.calls()[0]!.body as string);
    expect(body).toContain('destination_payment_method_data[type]=financial_account');
    expect(body).toContain('destination_payment_method_data[financial_account]=fa_other_account');
  });

  it('an unsupported destination type is refused at plan-build time (the census law)', () => {
    const { journey } = journeyWith(new FakeStripeFetch());
    expect(() =>
      journey.buildOutboundPaymentPlan({
        ...payoutInput,
        // @ts-expect-error the typed surface allows only financial_account | us_bank_account
        destination: { type: 'sepa_debit_account' },
      }),
    ).toThrow(/destination surface supports/);
  });
});
