/**
 * @payswap/capability — the Stripe GLOBAL PAYOUTS dated payout corridors
 * (P27-B): the definition-level corridor restriction set plus the per-method
 * implementation sets, every bound a dated observation verbatim from
 * docs.stripe.com/global-payouts/payout-methods (retrieved 2026-11-03 — see
 * payouts-capability.ts's live-doc record and the P27-B lane report).
 *
 * THE NARROWING LAW: every implementation set NARROWS the definition-level
 * set (the restriction-narrowing law; the test battery asserts zero widening
 * violations). The dated recipient markets (107, Ghana absent — the K1 law)
 * ride the definition-level set's destinationCountries.
 */

import type { CorridorRestrictionSet, RequiredFieldDeclaration } from './restrictions.ts';
import { validateCorridorRestrictionSet } from './restrictions.ts';

/** The dated recipient markets (107 ISO codes, docs.stripe.com/global-payouts/recipient-countries, 2026-11-03). */
export const STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS: readonly string[] = Object.freeze([
  'AL','DZ','AG','AR','AM','AU','AT','BS','BH','BD','BE','BJ','BT','BA','BW','BR','BN','BG','KH','CA',
  'CN','CO','CR','HR','CY','CZ','CI','DK','DO','EC','EG','SV','EE','ET','FI','FR','GM','DE','GR','GT',
  'GY','HK','HU','IS','IN','ID','IE','IL','IT','JM','JP','JO','KE','KW','LV','LI','LT','LU','MG','MY',
  'MT','MU','MX','MD','MC','MN','MA','MZ','NA','NL','NZ','MK','NO','OM','PK','PA','PE','PH','PL','PT',
  'QA','RO','RW','LC','SM','SN','RS','SG','SK','SI','ZA','KR','ES','LK','SE','CH','TW','TZ','TH','TT',
  'TN','TR','AE','GB','US','UZ','VN',
] as const);

const PAYOUT_CORRIDOR_REQUIRED_FIELDS: readonly RequiredFieldDeclaration[] = Object.freeze([
  Object.freeze({
    fieldId: 'journey.purpose-classification',
    description: 'the typed purpose classification derived from the journey\'s real facts (ADR-0020 D3; INV-30)',
    appliesTo: 'SENDER',
  }),
  Object.freeze({
    fieldId: 'treasury.financial-account',
    description: 'the entitled, funded Stripe Treasury financial account id (V2: Global Payouts requires Treasury)',
    appliesTo: 'FUNDING',
  }),
  Object.freeze({
    fieldId: 'recipient.account',
    description: 'the recipient account (created with the Accounts API or through the hosted information-collection form)',
    appliesTo: 'RECIPIENT',
  }),
  Object.freeze({
    fieldId: 'recipient.payout-details',
    description: 'the recipient payout destination (bank account details / payout method per the dated method matrix)',
    appliesTo: 'PAYOUT',
  }),
] as const);

function payoutCorridorRestrictionSet(input: {
  readonly restrictionSetId: string;
  readonly sourceCountries: readonly string[];
  readonly currencies: readonly string[];
  readonly payoutMethods: readonly string[];
  readonly amountLimits?: { readonly min: string; readonly max: string };
}): CorridorRestrictionSet {
  const candidate = {
    restrictionSetId: input.restrictionSetId,
    version: '2026-11-03',
    sourceCountries: input.sourceCountries,
    destinationCountries: STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS,
    currencies: input.currencies,
    customerTypes: ['BUSINESS'] as const,
    payoutMethods: input.payoutMethods,
    requiredFields: PAYOUT_CORRIDOR_REQUIRED_FIELDS,
    cutoffs: [] as const,
    terms: {
      termsRef: 'https://docs.stripe.com/global-payouts/supplemental-pricing-information',
      termsVersion: '2026-11-03',
      deliveryEstimateLabel: 'INDICATIVE',
    },
    declaredBy: 'P27-B (Stripe Global Payouts slice; dated evidence 2026-11-03, live docs.stripe.com)',
    ...(input.amountLimits !== undefined
      ? {
          amountLimits: {
            min: { currency: input.currencies[0], minorUnits: input.amountLimits.min },
            max: { currency: input.currencies[0], minorUnits: input.amountLimits.max },
          },
        }
      : {}),
  };
  return validateCorridorRestrictionSet(candidate);
}

/**
 * THE DATED PAYOUT CORRIDORS — the definition-level set plus the per-method
 * implementation sets (all minor-unit bounds verbatim from the 2026-11-03
 * payout-methods page — the US USD Wire maximum is 10,000,000 USD =
 * 1,000,000,000 minor units, the live table's own parenthetical; every set
 * narrows the definition-level set under the restriction-narrowing law).
 */
export const STRIPE_GLOBAL_PAYOUTS_CORRIDOR_DEFINITION_LEVEL: CorridorRestrictionSet =
  payoutCorridorRestrictionSet({
    restrictionSetId: 'stripe.global-payouts.corridor.definition',
    sourceCountries: ['GB', 'US'],
    currencies: ['USD', 'GBP', 'EUR'],
    payoutMethods: [
      'bank_accounts.ach',
      'bank_accounts.fedwire',
      'bank_accounts.fps',
      'bank_accounts.sepa',
      'bank_accounts.local',
      'bank_accounts.swift',
      'cards',
      'crypto_wallets',
    ],
  });

export const STRIPE_GLOBAL_PAYOUTS_CORRIDOR_IMPLEMENTATION_SETS: readonly CorridorRestrictionSet[] =
  Object.freeze([
    payoutCorridorRestrictionSet({
      restrictionSetId: 'stripe.global-payouts.corridor.us.usd.wire',
      sourceCountries: ['US'],
      currencies: ['USD'],
      payoutMethods: ['bank_accounts.swift'],
      amountLimits: { min: '1', max: '1000000000' },
    }),
    payoutCorridorRestrictionSet({
      restrictionSetId: 'stripe.global-payouts.corridor.us.usd.standard',
      sourceCountries: ['US'],
      currencies: ['USD'],
      payoutMethods: ['bank_accounts.ach', 'bank_accounts.fedwire', 'bank_accounts.fps', 'bank_accounts.sepa', 'bank_accounts.local'],
      amountLimits: { min: '1', max: '100000000' },
    }),
    payoutCorridorRestrictionSet({
      restrictionSetId: 'stripe.global-payouts.corridor.us.usd.instant-cards',
      sourceCountries: ['US'],
      currencies: ['USD'],
      payoutMethods: ['cards'],
      amountLimits: { min: '1', max: '999900' },
    }),
    payoutCorridorRestrictionSet({
      restrictionSetId: 'stripe.global-payouts.corridor.uk.gbp.standard',
      sourceCountries: ['GB'],
      currencies: ['GBP'],
      payoutMethods: ['bank_accounts.fps', 'bank_accounts.local', 'bank_accounts.swift'],
      amountLimits: { min: '1', max: '100000000' },
    }),
    payoutCorridorRestrictionSet({
      restrictionSetId: 'stripe.global-payouts.corridor.uk.gbp.instant-cards',
      sourceCountries: ['GB'],
      currencies: ['GBP'],
      payoutMethods: ['cards'],
      amountLimits: { min: '1', max: '999900' },
    }),
    payoutCorridorRestrictionSet({
      restrictionSetId: 'stripe.global-payouts.corridor.uk.eur.standard',
      sourceCountries: ['GB'],
      currencies: ['EUR'],
      payoutMethods: ['bank_accounts.sepa', 'bank_accounts.local', 'bank_accounts.swift'],
      amountLimits: { min: '1', max: '100000000' },
    }),
    payoutCorridorRestrictionSet({
      restrictionSetId: 'stripe.global-payouts.corridor.uk.usd.standard',
      sourceCountries: ['GB'],
      currencies: ['USD'],
      payoutMethods: ['bank_accounts.local', 'bank_accounts.swift'],
      amountLimits: { min: '1', max: '100000000' },
    }),
  ]);
