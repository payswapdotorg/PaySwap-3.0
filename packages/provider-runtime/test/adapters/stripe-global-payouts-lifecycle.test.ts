/**
 * @payswap/provider-runtime — the P27-B Global-Payouts LIFECYCLE battery
 * (CONTRACT tier over the deterministic FakeStripeFetch — no network).
 *
 * THIS FILE covers the journey's read-back/exception planes: the status
 * read-back and the dated cancellable law, the reconciliation reads, the
 * Treasury funding prerequisite, the INV-04 UNKNOWN discipline, the
 * never-alias law at execution, the census-gap law (the live-docs v2 surface
 * is fail-closed in the transport) and the v1 idempotency replay law. The
 * recipient/hosted-form/outbound-payment write planes live in
 * stripe-global-payouts-journey.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { StripeCatalogueTransport } from '../../src/adapters/stripe/transport/catalogue-transport.ts';
import { createStripeGlobalPayoutsJourney } from '../../src/adapters/stripe/catalogue/payouts-journey.ts';
import type { StripeGlobalPayoutsDispatchPlan } from '../../src/adapters/stripe/catalogue/payouts-journey.ts';
import {
  classifyStripeGlobalPayoutsOutboundPayment,
  globalPayoutsOutboundPaymentCancellable,
} from '../../src/adapters/stripe/catalogue/payouts-status.ts';
import { FakeStripeFetch, fakeCallContext } from './stripe-fake-transport.test.ts';

function journeyWith(script: FakeStripeFetch) {
  const transport = new StripeCatalogueTransport({ fetchImpl: script.fetch });
  const journey = createStripeGlobalPayoutsJourney({ transport });
  return { script, journey };
}

describe('the status read-back, cancellation and return/exception laws', () => {
  it('reads the payout status back on the derived route', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'outbound_payment', id: 'obp_test_1', status: 'processing', cancelable: true }, requestId: 'req_5' }),
    );
    const plan = journey.buildOutboundPaymentStatusPlan({ outboundPaymentId: 'obp_test_1' });
    expect(plan.operationId).toBe('GetTreasuryOutboundPaymentsId');
    expect(plan.approvalRequirement).toBe('NONE');
    const executed = await journey.executePlan(plan, fakeCallContext());
    expect(executed.kind).toBe('EXECUTED');
    expect(script.calls()[0]!.url).toBe('https://api.stripe.com/v1/treasury/outbound_payments/obp_test_1');
  });

  it('cancel is planned only while processing AND provider-cancelable (the dated law)', () => {
    const { journey } = journeyWith(new FakeStripeFetch());
    const cancellable = classifyStripeGlobalPayoutsOutboundPayment({ status: 'processing', cancelable: true, id: 'obp_1' });
    const posted = classifyStripeGlobalPayoutsOutboundPayment({ status: 'posted', id: 'obp_1' });
    const notCancelable = classifyStripeGlobalPayoutsOutboundPayment({ status: 'processing', cancelable: false, id: 'obp_1' });
    const planned = journey.buildOutboundPaymentCancellationPlan({ outboundPaymentId: 'obp_1', classification: cancellable, idempotencyKey: 'idem-cancel' });
    const refusedPosted = journey.buildOutboundPaymentCancellationPlan({ outboundPaymentId: 'obp_1', classification: posted, idempotencyKey: 'idem-cancel' });
    const refusedFlag = journey.buildOutboundPaymentCancellationPlan({ outboundPaymentId: 'obp_1', classification: notCancelable, idempotencyKey: 'idem-cancel' });
    expect(planned.kind).toBe('PLAN');
    expect(refusedPosted.kind).toBe('NOT_PLANNED');
    expect(refusedFlag.kind).toBe('NOT_PLANNED');
    if (refusedPosted.kind === 'NOT_PLANNED') {
      expect(refusedPosted.reason).toBe('PAYOUT_NOT_CANCELLABLE');
    }
  });

  it('the cancel plan dispatches STRONG_CONFIRM-gated with its own idempotency key', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'outbound_payment', id: 'obp_1', status: 'canceled' }, requestId: 'req_6' }),
    );
    const classification = classifyStripeGlobalPayoutsOutboundPayment({ status: 'processing', cancelable: true, id: 'obp_1' });
    const planned = journey.buildOutboundPaymentCancellationPlan({ outboundPaymentId: 'obp_1', classification, idempotencyKey: 'idem-cancel-1' });
    expect(planned.kind).toBe('PLAN');
    if (planned.kind !== 'PLAN') return;
    expect(planned.plan.approvalRequirement).toBe('STRONG_CONFIRM');
    const executed = await journey.executePlan(planned.plan, fakeCallContext(), { strongConfirmationApproved: true });
    expect(executed.kind).toBe('EXECUTED');
    const call = script.calls()[0]!;
    expect(call.url).toBe('https://api.stripe.com/v1/treasury/outbound_payments/obp_1/cancel');
    expect(call.idempotencyKey).toBe('idem-cancel-1');
  });

  it('the status classifier is fail-closed on unrecognized bodies (INV-24)', () => {
    expect(classifyStripeGlobalPayoutsOutboundPayment({ id: 'obp_1' }).kind).toBe('UNRECOGNIZED');
    expect(classifyStripeGlobalPayoutsOutboundPayment({ status: 'teleported', id: 'obp_1' }).kind).toBe('UNRECOGNIZED');
    expect(classifyStripeGlobalPayoutsOutboundPayment(null).kind).toBe('UNRECOGNIZED');
    expect(classifyStripeGlobalPayoutsOutboundPayment('a string').kind).toBe('UNRECOGNIZED');
  });

  it('the dated status vocabulary maps the provider reasons (returned/under_review/review_rejected)', () => {
    const returned = classifyStripeGlobalPayoutsOutboundPayment({
      status: 'returned',
      id: 'obp_1',
      status_details: { returned: { reason: 'account_closed' } },
    });
    expect(returned.kind).toBe('RECOGNIZED');
    expect(returned.status).toBe('returned');
    expect(returned.statusDetailReason).toBe('account_closed');
    const held = classifyStripeGlobalPayoutsOutboundPayment({
      status: 'processing',
      id: 'obp_2',
      cancelable: true,
      status_details: { processing: { reason: 'under_review' } },
    });
    expect(held.statusDetailReason).toBe('under_review');
    expect(globalPayoutsOutboundPaymentCancellable(held)).toBe(true);
    const rejected = classifyStripeGlobalPayoutsOutboundPayment({
      status: 'failed',
      id: 'obp_3',
      status_details: { failed: { reason: 'review_rejected' } },
    });
    expect(rejected.statusDetailReason).toBe('review_rejected');
  });

  it('the sandbox return simulation rides the pinned test_helpers family (test-mode only)', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'outbound_payment', id: 'obp_1', status: 'returned' }, requestId: 'req_7' }),
    );
    const plan = journey.buildSandboxReturnSimulationPlan({ outboundPaymentId: 'obp_1', outcome: 'return', idempotencyKey: 'idem-sim-1' });
    expect(plan.operationId).toBe('PostTestHelpersTreasuryOutboundPaymentsIdReturn');
    expect(plan.sandboxOnly).toBe(true);
    expect(plan.approvalRequirement).toBe('CONFIRM');
    const executed = await journey.executePlan(plan, fakeCallContext());
    expect(executed.kind).toBe('EXECUTED');
    expect(script.calls()[0]!.url).toBe('https://api.stripe.com/v1/test_helpers/treasury/outbound_payments/obp_1/return');
    expect(script.calls()[0]!.idempotencyKey).toBe('idem-sim-1');
  });
});

describe('the reconciliation planes (all reads, the ledger + the payout list)', () => {
  it('builds the three reconciliation plans over the pinned ledger reads', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch()
        .script({ kind: 'OK', status: 200, body: { object: 'list', data: [] }, requestId: 'r1' })
        .script({ kind: 'OK', status: 200, body: { object: 'list', data: [] }, requestId: 'r2' })
        .script({ kind: 'OK', status: 200, body: { object: 'list', data: [] }, requestId: 'r3' }),
    );
    const plans = journey.buildReconciliationPlans({ financialAccountId: 'fa_test_entitled' });
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.operationId)).toEqual([
      'GetTreasuryOutboundPayments',
      'GetTreasuryTransactions',
      'GetTreasuryTransactionEntries',
    ]);
    for (const plan of plans) {
      expect(plan.approvalRequirement).toBe('NONE');
      const executed = await journey.executePlan(plan, fakeCallContext());
      expect(executed.kind).toBe('EXECUTED');
    }
    const urls = script.calls().map((c) => c.url);
    expect(urls[0]).toContain('/v1/treasury/outbound_payments?financial_account=fa_test_entitled');
    expect(urls[1]).toContain('/v1/treasury/transactions?financial_account=fa_test_entitled');
    expect(urls[2]).toContain('/v1/treasury/transaction_entries?financial_account=fa_test_entitled');
  });
});

describe('the funding prerequisite read (V2: Global Payouts requires Treasury)', () => {
  it('reads the financial account back on the pinned route', async () => {
    const { script, journey } = journeyWith(
      new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'financial_account', id: 'fa_test_entitled' }, requestId: 'req_8' }),
    );
    const plan = journey.buildFundingReadbackPlan({ financialAccountId: 'fa_test_entitled' });
    expect(plan.operationId).toBe('GetTreasuryFinancialAccountsFinancialAccount');
    const executed = await journey.executePlan(plan, fakeCallContext());
    expect(executed.kind).toBe('EXECUTED');
    expect(script.calls()[0]!.url).toBe('https://api.stripe.com/v1/treasury/financial_accounts/fa_test_entitled');
  });
});

describe('INV-04: the UNKNOWN discipline (never a blind retry)', () => {
  it('a TIMEOUT after dispatch is UNKNOWN_AFTER_DISPATCH with the reconcile read-back named', async () => {
    const { script, journey } = journeyWith(new FakeStripeFetch().script({ kind: 'TIMEOUT' }));
    const built = journey.buildOutboundPaymentPlan({
      journey: {
        originCountry: 'US',
        purposeClass: 'ContractorSupplierPayment',
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
      },
      financialAccountId: 'fa_test_entitled',
      destination: {
        type: 'us_bank_account',
        usBankAccount: { accountNumber: '000123456789', routingNumber: '110000000' },
      },
      idempotencyKey: 'idem-unknown-1',
    });
    expect(built.kind).toBe('PLAN');
    if (built.kind !== 'PLAN') return;
    const executed = await journey.executePlan(built.plan, fakeCallContext(), { strongConfirmationApproved: true });
    expect(executed.kind).toBe('UNKNOWN_AFTER_DISPATCH');
    if (executed.kind === 'UNKNOWN_AFTER_DISPATCH') {
      expect(executed.ambiguity).toBe('TIMEOUT_AFTER_DISPATCH');
      expect(executed.reconcileOperationId).toBe('GetTreasuryOutboundPaymentsId');
      expect(executed.note).toContain('reconcile by read-back');
    }
    expect(script.callCount).toBe(1);
  });

  it('a malformed answer after dispatch is UNKNOWN (never FAILED)', async () => {
    const { journey } = journeyWith(new FakeStripeFetch().script({ kind: 'MALFORMED', status: 200, text: 'not-json' }));
    const plan = journey.buildFundingReadbackPlan({ financialAccountId: 'fa_test' });
    const executed = await journey.executePlan(plan, fakeCallContext());
    expect(executed.kind).toBe('UNKNOWN_AFTER_DISPATCH');
  });

  it('a provider error status is PROVIDER_ERROR with the classified error (typed)', async () => {
    const { journey } = journeyWith(
      new FakeStripeFetch().script({
        kind: 'HTTP_ERROR',
        status: 403,
        body: { error: { type: 'StripeInvalidRequestError', code: 'request_not_authorized', message: 'not authorized' } },
      }),
    );
    const plan = journey.buildFundingReadbackPlan({ financialAccountId: 'fa_test' });
    const executed = await journey.executePlan(plan, fakeCallContext());
    expect(executed.kind).toBe('PROVIDER_ERROR');
  });
});

describe('the never-alias law at execution (ADR-0020 D4)', () => {
  it('a doctored plan over the ordinary merchant payout is refused pre-dispatch', async () => {
    const { script, journey } = journeyWith(new FakeStripeFetch());
    const doctored: StripeGlobalPayoutsDispatchPlan = Object.freeze({
      planId: 'doctored',
      operationId: 'PostPayouts',
      role: 'PAYOUT_EXECUTION',
      params: { amount: 1000, currency: 'usd' },
      approvalRequirement: 'STRONG_CONFIRM',
      censusApprovalTier: 'STRONG_CONFIRM',
      idempotencyKeyRequired: true,
      idempotencyKey: 'idem-doctored',
      readBackOperationId: 'GetPayoutsPayout',
      sandboxOnly: false,
    });
    const executed = await journey.executePlan(doctored, fakeCallContext(), { strongConfirmationApproved: true });
    expect(executed.kind).toBe('REFUSED_PRE_DISPATCH');
    if (executed.kind === 'REFUSED_PRE_DISPATCH') {
      expect(executed.reason).toBe('ALIAS_OPERATION_FORBIDDEN');
    }
    expect(script.callCount).toBe(0);
  });
});

describe('the census-gap law (the live-docs v2 surface is fail-closed in the transport)', () => {
  it('a v2 money_management operation is refused UNKNOWN_OPERATION — never a silent pin expansion', async () => {
    const { script } = journeyWith(new FakeStripeFetch());
    const transport = new StripeCatalogueTransport({ fetchImpl: script.fetch });
    // Assembled from short literals (the boundary-test token-shape law).
    const unpinnedDocOperation = 'PostV2' + 'MoneyManagement' + 'OutboundPayments';
    const result = await transport.dispatch({
      operationId: unpinnedDocOperation,
      params: {},
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.reason).toBe('UNKNOWN_OPERATION');
      expect(result.detail).toContain('unknown Stripe operation');
    }
    expect(script.callCount).toBe(0);
  });
});

describe('the idempotency replay law (v1 semantics)', () => {
  it('a repeated v1 idempotency key replays the stored answer (the registrar mechanism)', async () => {
    const fake = new FakeStripeFetch().withIdempotentReplay();
    const { journey } = journeyWith(fake);
    const classification = classifyStripeGlobalPayoutsOutboundPayment({ status: 'processing', cancelable: true, id: 'obp_1' });
    const planned = journey.buildOutboundPaymentCancellationPlan({ outboundPaymentId: 'obp_1', classification, idempotencyKey: 'idem-replay' });
    expect(planned.kind).toBe('PLAN');
    if (planned.kind !== 'PLAN') return;
    fake.script({ kind: 'OK', status: 200, body: { object: 'outbound_payment', id: 'obp_1', status: 'canceled' }, requestId: 'req_a' });
    fake.script({ kind: 'OK', status: 200, body: { object: 'outbound_payment', id: 'obp_1', status: 'canceled' }, requestId: 'req_b' });
    const first = await journey.executePlan(planned.plan, fakeCallContext(), { strongConfirmationApproved: true });
    const second = await journey.executePlan(planned.plan, fakeCallContext(), { strongConfirmationApproved: true });
    expect(first.kind).toBe('EXECUTED');
    expect(second.kind).toBe('EXECUTED');
    // both dispatches carried the SAME key — Stripe replays the stored response
    const keys = fake.calls().map((c) => c.idempotencyKey);
    expect(keys).toEqual(['idem-replay', 'idem-replay']);
  });
});
