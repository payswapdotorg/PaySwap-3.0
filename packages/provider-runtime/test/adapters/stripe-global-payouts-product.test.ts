/**
 * @payswap/provider-runtime — the P27-B Global-Payouts CENSUS-AUDIT and
 * NEVER-ALIAS battery (ADR-0020 D4/D10/D12, hermetic — no network).
 *
 * WHAT THIS BATTERY ENFORCES:
 * - every operation the product slice touches resolves EXACTLY ONE pinned,
 *   dispatchable census record (the census law — the slice never expands the
 *   pin silently);
 * - the census-derived tier/state/idempotency facts the slice's approval law
 *   is built on (pin drift is a test failure);
 * - THE NEVER-ALIAS LAW (ADR-0020 D4): ordinary payouts, Connect transfers and
 *   PaymentIntents are typed-refused for Global-Payouts journeys — a merchant
 *   payout offered as a Global-Payouts journey is refused by construction;
 * - THE CENSUS GAP (the honest disclosure): the v2 money_management surface
 *   the live docs name for the product (retrieved 2026-11-03) is NOT in the
 *   pinned census, and the transport refuses it fail-closed
 *   (UNKNOWN_OPERATION — never a silent pin expansion);
 * - the D10 evidence stamp: every verdict/observation carries the
 *   2026-11-03 retrieval date.
 */

import { describe, expect, it } from 'vitest';
import {
  STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS,
  STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP,
  STRIPE_GLOBAL_PAYOUTS_FORBIDDEN_ALIAS_OPERATION_IDS,
  STRIPE_GLOBAL_PAYOUTS_PRODUCT,
  STRIPE_GLOBAL_PAYOUTS_UNPINNED_SURFACE_REFUSAL,
  StripeGlobalPayoutsAliasRefusal,
  globalPayoutsCensusRecordOf,
  isForbiddenGlobalPayoutsAliasOperation,
} from '../../src/adapters/stripe/catalogue/payouts-product.ts';
import { STRIPE_OPERATION_CENSUS, stripeCensusDispatchAllowed, stripeCensusRecord } from '../../src/adapters/stripe/catalogue/census.ts';
import { STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP } from '../../src/adapters/stripe/catalogue/payouts-evidence.ts';
import { ValidationError } from '../../src/errors.ts';

describe('the Global-Payouts product census audit (the pinned-surface law)', () => {
  it('every product operation resolves exactly one dispatchable census record', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS.length).toBeGreaterThan(20);
    for (const entry of STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS) {
      const record = stripeCensusRecord(entry.operationId);
      expect(record, `no census record for ${entry.operationId}`).toBeDefined();
      expect(
        stripeCensusDispatchAllowed(entry.operationId),
        `${entry.operationId} must be dispatchable under the overlay (the DENY law)`,
      ).toBe(true);
      // Exactly one record per operationId (the census uniqueness law).
      expect(
        STRIPE_OPERATION_CENSUS.filter((r) => r.operationId === entry.operationId),
      ).toHaveLength(1);
    }
  });

  it('the product inventory covers every product role at least once', () => {
    const roles = new Set(STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS.map((entry) => entry.role));
    for (const role of [
      'RECIPIENT_CREATION',
      'RECIPIENT_HOSTED_INFORMATION_FORM',
      'RECIPIENT_READ_BACK',
      'TREASURY_FUNDING_PREREQUISITE',
      'PAYOUT_EXECUTION',
      'PAYOUT_STATUS_READ_BACK',
      'PAYOUT_CANCELLATION',
      'RECONCILIATION',
      'RETURN_AND_EXCEPTION_HANDLING',
      'SANDBOX_RETURN_SIMULATION',
      'EVENTS',
    ] as const) {
      expect(roles.has(role), `role ${role} missing from the product inventory`).toBe(true);
    }
  });

  it('the census-derived tiers the approval law is built on (the anti-drift pin)', () => {
    // The recipient plane: v2 core accounts — CONFIRM, IMPLEMENTED, v2 identifier class.
    expect(globalPayoutsCensusRecordOf('PostV2CoreAccounts').approvalTier).toBe('CONFIRM');
    expect(globalPayoutsCensusRecordOf('PostV2CoreAccounts').supportState).toBe('IMPLEMENTED');
    // The hosted recipient form: the REAUTH tier (ADR-0018/P26-A).
    expect(globalPayoutsCensusRecordOf('PostV2CoreAccountLinks').approvalTier).toBe('REAUTH');
    expect(globalPayoutsCensusRecordOf('PostV2CoreAccountLinks').effectClass).toBe('PERMISSION_OR_CREDENTIAL_ADMIN');
    // The payout execution: the pinned v1 Treasury family, account-entitlement state.
    expect(globalPayoutsCensusRecordOf('PostTreasuryOutboundPayments').supportState).toBe('IMPLEMENTED_WITH_LIMITS');
    expect(globalPayoutsCensusRecordOf('PostTreasuryOutboundPayments').resourceFamily).toBe('treasury');
    // The cancellation: STRONG_CONFIRM (the /cancel token law).
    expect(globalPayoutsCensusRecordOf('PostTreasuryOutboundPaymentsIdCancel').approvalTier).toBe('STRONG_CONFIRM');
    // The sandbox return simulations: test_helpers family, test-mode-only state.
    for (const id of [
      'PostTestHelpersTreasuryOutboundPaymentsIdPost',
      'PostTestHelpersTreasuryOutboundPaymentsIdFail',
      'PostTestHelpersTreasuryOutboundPaymentsIdReturn',
    ]) {
      expect(globalPayoutsCensusRecordOf(id).supportState).toBe('IMPLEMENTED_WITH_LIMITS');
    }
  });

  it('the derived read-back routes exist and are dispatchable (the verification law)', () => {
    expect(globalPayoutsCensusRecordOf('PostTreasuryOutboundPayments').operationId).toBe('PostTreasuryOutboundPayments');
    const readBack = stripeCensusRecord('GetTreasuryOutboundPaymentsId');
    expect(readBack?.method).toBe('GET');
    expect(stripeCensusDispatchAllowed('GetTreasuryOutboundPaymentsId')).toBe(true);
  });

  it('the product declaration carries the dated evidence stamp (D10)', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_PRODUCT.productId).toBe('stripe.global-payouts');
    expect(STRIPE_GLOBAL_PAYOUTS_PRODUCT.requiresTreasury).toBe(true);
    expect(STRIPE_GLOBAL_PAYOUTS_PRODUCT.evidenceStamp.retrievedAt).toBe('2026-11-03');
    expect(STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP.retrievedAt).toBe('2026-11-03');
  });
});

describe('the never-alias law (ADR-0020 D4 — typed refusal, machine-citable)', () => {
  it('the ordinary merchant payout family is a forbidden alias surface', () => {
    for (const id of ['PostPayouts', 'PostPayoutsPayout', 'PostPayoutsPayoutCancel', 'PostPayoutsPayoutReverse']) {
      expect(isForbiddenGlobalPayoutsAliasOperation(id)).toBe(true);
    }
    // every forbidden alias is itself a REAL, dispatchable census operation —
    // the refusal is the PRODUCT law, never a claim the operations do not exist.
    for (const id of STRIPE_GLOBAL_PAYOUTS_FORBIDDEN_ALIAS_OPERATION_IDS) {
      expect(stripeCensusRecord(id), `${id} should be a real pinned operation`).toBeDefined();
    }
  });

  it('Connect transfers and PaymentIntents/Links are forbidden alias surfaces', () => {
    for (const id of ['PostTransfers', 'PostPaymentIntents', 'PostCheckoutSessions', 'PostPaymentLinks']) {
      expect(isForbiddenGlobalPayoutsAliasOperation(id)).toBe(true);
    }
  });

  it('globalPayoutsCensusRecordOf throws the TYPED alias refusal for a merchant payout', () => {
    expect(() => globalPayoutsCensusRecordOf('PostPayouts')).toThrow(StripeGlobalPayoutsAliasRefusal);
    expect(() => globalPayoutsCensusRecordOf('PostPayouts')).toThrow(/ADR-0020 D4/);
  });

  it('no product-slice operation is itself a forbidden alias (the inventory coherence law)', () => {
    for (const entry of STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS) {
      expect(isForbiddenGlobalPayoutsAliasOperation(entry.operationId), `${entry.operationId}`).toBe(false);
    }
  });

  it('unknown operations fail-closed (never invented)', () => {
    expect(() => globalPayoutsCensusRecordOf('DefinitelyNotARealOperation')).toThrow(ValidationError);
  });
});

describe('the census gap (the live-docs v2 money_management surface is NOT pinned)', () => {
  it('the pinned census contains NO /v2/money_management path (the honest disclosure)', () => {
    const moneyManagement = STRIPE_OPERATION_CENSUS.filter((r) => r.path.startsWith('/v2/money_management'));
    expect(moneyManagement).toEqual([]);
    // while the v2 namespaces the census DOES pin are billing/commerce/core only.
    const v2Families = new Set(
      STRIPE_OPERATION_CENSUS.filter((r) => r.apiNamespace === 'v2').map((r) => r.path.split('/')[2]),
    );
    expect([...v2Families].sort()).toEqual(['billing', 'commerce', 'core']);
  });

  it('the gap record lists the doc-named API operations the pin cannot dispatch', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.status).toBe('NOT_PINNED');
    expect(STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.unpinnedDocApiOperations).toContain('money_management.payout_intents.create');
    expect(STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.unpinnedDocApiOperations).toContain('money_management.outbound_payments.create');
    expect(STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.unpinnedDocApiOperations.length).toBe(16);
    expect(STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.documentedAt).toBe('2026-11-03');
  });

  it('the unpinned-surface refusal reason is the typed integration instruction', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_UNPINNED_SURFACE_REFUSAL.reason).toBe('UNPINNED_API_SURFACE');
    expect(STRIPE_GLOBAL_PAYOUTS_UNPINNED_SURFACE_REFUSAL.detail).toContain('pinned census');
  });
});
