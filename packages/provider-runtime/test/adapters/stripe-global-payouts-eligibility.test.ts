/**
 * @payswap/provider-runtime — the P27-B Global-Payouts ELIGIBILITY GATE
 * battery (ADR-0020 D2/D3/D10 + the P27-0 capability matrix §4/§5; hermetic —
 * every fact asserted here is a dated observation re-verified on live
 * docs.stripe.com / stripe.com at the P27-B station on 2026-11-03).
 *
 * THE GATE ORDER (capability matrix §5): purpose class → INV-30 relabeling →
 * P2P licensing → origin (GA/preview) → Treasury entitlement → funding →
 * recipient market → recipient currency → payout method → amounts.
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateGlobalPayoutsJourneyEligibility,
} from '../../src/adapters/stripe/catalogue/payouts-eligibility.ts';
import type { StripeGlobalPayoutsJourneyInput } from '../../src/adapters/stripe/catalogue/payouts-eligibility.ts';
import {
  STRIPE_GLOBAL_PAYOUTS_GA_ORIGIN_COUNTRIES,
  STRIPE_GLOBAL_PAYOUTS_PRIVATE_PREVIEW_ORIGIN_COUNTRIES,
  STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_ROWS,
} from '../../src/adapters/stripe/catalogue/payouts-evidence.ts';

/** A maximally-proven US→KE contractor journey (the ELIGIBLE baseline). */
function eligibleBaseline(overrides: Partial<StripeGlobalPayoutsJourneyInput> = {}): StripeGlobalPayoutsJourneyInput {
  return {
    originCountry: 'US',
    purposeClass: 'ContractorSupplierPayment',
    recipientCountryCode: 'KE',
    recipientCurrency: 'KES',
    payoutMethodId: 'bank_accounts.local',
    amountMinorUnits: 500_000,
    sendingCurrency: 'USD',
    sendingLimitPayoutMethod: 'Standard',
    proofs: {
      treasuryEntitlement: { financialAccountId: 'fa_test_entitled', entitlementObserved: true },
      funding: { fundedMinorUnits: 10_000_000, currency: 'USD' },
    },
    ...overrides,
  };
}

describe('the origin gates (V3 re-verified 2026-11-03: GA GB/US; the full 22-country preview list)', () => {
  it('GA origins are the United Kingdom and the United States only', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_GA_ORIGIN_COUNTRIES).toEqual(['GB', 'US']);
  });

  it('the private-preview origin list is the FULL 22-country list (completing the P27-0 partial extraction)', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_PRIVATE_PREVIEW_ORIGIN_COUNTRIES).toEqual([
      'AU', 'AT', 'BE', 'BG', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT',
      'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
    ]);
    // the completions the P27-0 matrix could not extract (its list ended at Luxembourg with "…")
    for (const completion of ['MT', 'NL', 'PT', 'SK', 'SI', 'ES']) {
      expect(STRIPE_GLOBAL_PAYOUTS_PRIVATE_PREVIEW_ORIGIN_COUNTRIES).toContain(completion);
    }
  });

  it('a GA-origin journey with all proofs is ELIGIBLE with a full gate trail', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline());
    expect(verdict.kind).toBe('ELIGIBLE');
    if (verdict.kind === 'ELIGIBLE') {
      expect(verdict.gates.map((g) => g.gate)).toEqual(
        expect.arrayContaining(['PURPOSE_CLASS', 'INV_30_RELABELING', 'ORIGIN_COUNTRY', 'TREASURY_ENTITLEMENT', 'RECIPIENT_MARKET', 'RECIPIENT_CURRENCY', 'PAYOUT_METHOD', 'SENDING_AMOUNT', 'RECEIVING_AMOUNT']),
      );
      expect(verdict.evidence.retrievedAt).toBe('2026-11-03');
    }
  });

  it('a UK-origin journey is eligible under the same proofs', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({
        originCountry: 'GB',
        sendingCurrency: 'GBP',
        sendingLimitPayoutMethod: 'Standard',
        recipientCountryCode: 'GB',
        recipientCurrency: 'GBP',
        payoutMethodId: 'bank_accounts.fps',
        proofs: {
          treasuryEntitlement: { financialAccountId: 'fa_test', entitlementObserved: true },
          funding: { fundedMinorUnits: 1_000_000, currency: 'GBP' },
        },
      }),
    );
    expect(verdict.kind).toBe('ELIGIBLE');
  });

  it('a private-preview origin produces the typed OPERATOR_GATED conditional — never a route', () => {
    for (const origin of ['DE', 'MT', 'ES']) {
      const verdict = evaluateGlobalPayoutsJourneyEligibility(
        eligibleBaseline({ originCountry: origin, recipientCountryCode: 'DE', recipientCurrency: 'EUR' }),
      );
      expect(verdict.kind).toBe('OPERATOR_GATED');
      if (verdict.kind === 'OPERATOR_GATED') {
        expect(verdict.gate).toBe('PRIVATE_PREVIEW_ORIGIN_REQUEST');
        expect(verdict.detail).toContain('private-preview');
      }
    }
  });

  it('an unlisted origin is refused typed', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline({ originCountry: 'NG' }));
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('ORIGIN_COUNTRY_NOT_LISTED');
    }
  });
});

describe('the purpose/INV-30 gates (D2/D3: classification before everything)', () => {
  it('an Unclear classification is refused — the model asks for facts, never chooses a class', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline({ purposeClass: 'Unclear' }));
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('PURPOSE_CLASSIFICATION_REQUIRED');
    }
  });

  it('a relabeled P2P journey is refused (INV-30: relabeling never changes eligibility)', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({
        purposeClass: 'GenuineCommerce',
        remittanceIndicators: ['the sender pays the recipient\u2019s personal rent', 'no goods or services exist'],
      }),
    );
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('PURPOSE_CLASSIFICATION_INCOHERENT');
      expect(verdict.detail).toContain('INV-30');
    }
  });

  it('an honest P2P classification without licences + written approval is OPERATOR_GATED (capability matrix §5)', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ purposeClass: 'RegulatedRemittanceP2P' }),
    );
    expect(verdict.kind).toBe('OPERATOR_GATED');
    if (verdict.kind === 'OPERATOR_GATED') {
      expect(verdict.gate).toBe('P2P_LICENCE_AND_PROVIDER_APPROVAL');
    }
  });

  it('a P2P journey WITH the licence + written-approval proofs proceeds past the licensing gate', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({
        purposeClass: 'RegulatedRemittanceP2P',
        proofs: {
          treasuryEntitlement: { financialAccountId: 'fa_test', entitlementObserved: true },
          funding: { fundedMinorUnits: 1_000_000, currency: 'USD' },
          p2pLicenceAndProviderApproval: {
            licenceEvidenceRef: 'licence:operator-money-transmitter',
            providerWrittenApprovalRef: 'stripe:written-approval-ref',
          },
        },
      }),
    );
    expect(verdict.kind).toBe('ELIGIBLE');
  });
});

describe('the Treasury/funding gates (V2: Global Payouts requires Treasury)', () => {
  it('a missing Treasury entitlement proof is OPERATOR_GATED (the run card §C action)', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ proofs: { funding: { fundedMinorUnits: 1_000, currency: 'USD' } } }),
    );
    expect(verdict.kind).toBe('OPERATOR_GATED');
    if (verdict.kind === 'OPERATOR_GATED') {
      expect(verdict.gate).toBe('TREASURY_ENTITLEMENT');
    }
  });

  it('an observed-but-not-entitled financial account is still OPERATOR_GATED', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({
        proofs: {
          treasuryEntitlement: { financialAccountId: 'fa_test', entitlementObserved: false },
          funding: { fundedMinorUnits: 1_000, currency: 'USD' },
        },
      }),
    );
    expect(verdict.kind).toBe('OPERATOR_GATED');
  });

  it('a missing funding proof is OPERATOR_GATED ("fund your financial account")', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({
        proofs: { treasuryEntitlement: { financialAccountId: 'fa_test', entitlementObserved: true } },
      }),
    );
    expect(verdict.kind).toBe('OPERATOR_GATED');
    if (verdict.kind === 'OPERATOR_GATED') {
      expect(verdict.gate).toBe('FUNDING_PROOF');
    }
  });
});

describe('the recipient-market and currency gates (the dated 107-row table)', () => {
  it('the dated matrix carries 107 recipient markets and Ghana is absent (the K1 law)', () => {
    expect(STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_ROWS).toHaveLength(107);
    expect(STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_ROWS.find((r) => r.countryCode === 'GH')).toBeUndefined();
    for (const present of ['KE', 'ZA', 'GB', 'US', 'CI']) {
      expect(STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_ROWS.find((r) => r.countryCode === present)).toBeDefined();
    }
    // Honest exclusions on the dated table (never silently filled): Ghana
    // (the K1 roadmap law) AND Nigeria — the Africa Extended Network goes
    // through Paystack onboarding, never through this product (V6).
    expect(STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_ROWS.find((r) => r.countryCode === 'NG')).toBeUndefined();
  });

  it('a Ghana-recipient journey is REFUSED with the honest K1 conditional-opportunity note (H2 27)', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ recipientCountryCode: 'GH', recipientCurrency: 'GHS' }),
    );
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('RECIPIENT_MARKET_NOT_AVAILABLE');
      expect(verdict.conditionalOpportunityNote).toContain('H2 27');
      expect(verdict.conditionalOpportunityNote).toContain('Ghana');
    }
  });

  it('a GA recipient currency passes (Kenya KES)', () => {
    expect(evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline()).kind).toBe('ELIGIBLE');
  });

  it('a private-preview recipient currency is OPERATOR_GATED ("request access")', () => {
    // France: GA EUR, private-preview USD (the dated table).
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ recipientCountryCode: 'FR', recipientCurrency: 'USD' }),
    );
    expect(verdict.kind).toBe('OPERATOR_GATED');
    if (verdict.kind === 'OPERATOR_GATED') {
      expect(verdict.gate).toBe('PRIVATE_PREVIEW_RECIPIENT_CURRENCY');
    }
  });

  it('an unlisted recipient currency is refused typed (Argentina: only preview ARS exists)', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ recipientCountryCode: 'AR', recipientCurrency: 'USD' }),
    );
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('RECIPIENT_CURRENCY_NOT_AVAILABLE');
    }
  });
});

describe('the payout-method gates (the dated sender-country method matrix)', () => {
  it('a GA method for the sender passes (US: bank_accounts.local)', () => {
    expect(evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline()).kind).toBe('ELIGIBLE');
  });

  it('crypto-wallet payouts are US-origin ONLY — a UK sender is refused typed', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({
        originCountry: 'GB',
        recipientCountryCode: 'GB',
        recipientCurrency: 'GBP',
        sendingCurrency: 'GBP',
        payoutMethodId: 'crypto_wallets',
      }),
    );
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('PAYOUT_METHOD_NOT_AVAILABLE_FOR_SENDER');
    }
  });

  it('crypto-wallet payouts are PUBLIC PREVIEW for US senders — OPERATOR_GATED, never a route', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ payoutMethodId: 'crypto_wallets' }),
    );
    expect(verdict.kind).toBe('OPERATOR_GATED');
    if (verdict.kind === 'OPERATOR_GATED') {
      expect(verdict.gate).toBe('PREVIEW_PAYOUT_METHOD');
    }
  });

  it('an unknown method token for the sender is refused typed', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ payoutMethodId: 'bank_accounts.unobtainium' }),
    );
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('PAYOUT_METHOD_NOT_AVAILABLE_FOR_SENDER');
    }
  });
});

describe('the amount gates (the dated minor-unit limit tables)', () => {
  it('below the dated US USD Wire minimum (1 minor unit) is refused', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ amountMinorUnits: 0, sendingLimitPayoutMethod: 'Wire', payoutMethodId: 'bank_accounts.swift' }),
    );
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('AMOUNT_BELOW_MINIMUM');
    }
  });

  it('above the dated US USD Wire maximum (10,000,000 USD = 1,000,000,000 minor) is refused', () => {
    // The live payout-methods table's own minor-unit parenthetical is
    // `1000000000` for the 10,000,000 USD Wire maximum — the 2026-11-03
    // re-verification diff caught an earlier 10x misread of this cell
    // (the dated page wins; see the lane report's re-verification record).
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ amountMinorUnits: 1_000_000_001, sendingLimitPayoutMethod: 'Wire', payoutMethodId: 'bank_accounts.swift' }),
    );
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('AMOUNT_ABOVE_MAXIMUM');
    }
  });

  it('the dated US USD Wire maximum bound passes AT the bound (1,000,000,000 minor = 10,000,000 USD)', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ amountMinorUnits: 1_000_000_000, sendingLimitPayoutMethod: 'Wire', payoutMethodId: 'bank_accounts.swift' }),
    );
    expect(verdict.kind).toBe('ELIGIBLE');
  });

  it('above the dated US USD Instant-cards maximum (9,999 USD) is refused', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ amountMinorUnits: 999_901, sendingLimitPayoutMethod: 'Instant (cards)' }),
    );
    expect(verdict.kind).toBe('REFUSED');
  });

  it('below the dated same-currency receiving minimum is refused (US USD → El Salvador: min 3,000 minor)', () => {
    // The dated receiving minimum for El Salvador (USD) is 30 USD = 3,000 minor
    // units; a $10 payout (1,000 minor) passes the US sending minimum but is
    // refused by the RECEIVING bound on the same-currency journey.
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({
        recipientCountryCode: 'SV',
        recipientCurrency: 'USD',
        amountMinorUnits: 1_000,
      }),
    );
    expect(verdict.kind).toBe('REFUSED');
    if (verdict.kind === 'REFUSED') {
      expect(verdict.reason).toBe('AMOUNT_BELOW_MINIMUM');
      expect(verdict.gates.some((g) => g.gate === 'RECEIVING_AMOUNT' && g.outcome === 'REFUSED')).toBe(true);
    }
  });

  it('the same-currency receiving minimum passes at the dated bound (US USD → El Salvador: 3,000 minor)', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({ recipientCountryCode: 'SV', recipientCurrency: 'USD', amountMinorUnits: 3_000 }),
    );
    expect(verdict.kind).toBe('ELIGIBLE');
  });

  it('cross-currency journeys never guess FX: the receiving bounds wait for the provider quote', () => {
    // USD→KES is cross-currency: the dated KE receiving maximum (1,000,000 KES)
    // applies to the CONVERTED amount at the provider's finalized rate — the
    // verdict carries the quote-time note instead of a local conversion.
    const verdict = evaluateGlobalPayoutsJourneyEligibility(
      eligibleBaseline({
        recipientCountryCode: 'KE',
        recipientCurrency: 'KES',
        amountMinorUnits: 500_000_000,
        sendingLimitPayoutMethod: 'Wire',
        payoutMethodId: 'bank_accounts.swift',
      }),
    );
    expect(verdict.kind).toBe('ELIGIBLE');
    if (verdict.kind === 'ELIGIBLE') {
      expect(verdict.crossCurrencyNote).toContain('cross-currency');
      expect(verdict.crossCurrencyNote).toContain('provider-given');
    }
  });

  it('the cross-currency note states the quote-time FX law (no local FX math)', () => {
    const verdict = evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline());
    expect(verdict.kind).toBe('ELIGIBLE');
    if (verdict.kind === 'ELIGIBLE') {
      expect(verdict.crossCurrencyNote).toBeDefined();
      expect(verdict.crossCurrencyNote).toContain('provider-given');
    }
  });
});

describe('the D10 evidence stamp (every verdict is dated, never a flag)', () => {
  it('every verdict kind carries the 2026-11-03 retrieval stamp', () => {
    for (const verdict of [
      evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline()),
      evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline({ originCountry: 'DE', recipientCountryCode: 'DE', recipientCurrency: 'EUR' })),
      evaluateGlobalPayoutsJourneyEligibility(eligibleBaseline({ recipientCountryCode: 'GH', recipientCurrency: 'GHS' })),
    ]) {
      expect(verdict.evidence.retrievedAt).toBe('2026-11-03');
    }
  });
});
