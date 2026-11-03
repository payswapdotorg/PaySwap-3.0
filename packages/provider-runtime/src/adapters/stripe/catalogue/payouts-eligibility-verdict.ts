/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS typed eligibility
 * vocabulary (P27-B): the purpose classes, operator gates, refusal reasons,
 * journey-facts input and the frozen ELIGIBLE / OPERATOR_GATED / REFUSED
 * verdict the gates produce (payouts-eligibility.ts evaluates them).
 *
 * THE LAWS ON THE TYPES:
 * - D3 (ADR-0020): the purpose classification is an INPUT derived from the
 *   journey's real facts — never something this module or a route chooses.
 * - INV-30 (D2): decomposition/relabeling/hop-chaining never changes the
 *   classification; remittance indicators attached to a non-P2P class are a
 *   typed refusal, and P2P needs the actual operator's licences AND Stripe's
 *   explicit written product approval (V5 — a licensed-fintech product
 *   context, never a blanket approval).
 * - D10: every verdict carries the evidence stamp (retrieved 2026-11-03).
 */

import type { STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP } from './payouts-evidence.ts';

/** The typed purpose classes (the P27-0 capability matrix §5 rows). */
export const STRIPE_GLOBAL_PAYOUTS_PURPOSE_CLASSES = [
  'GenuineCommerce',
  'MarketplaceSellerSettlement',
  'ContractorSupplierPayment',
  'ReimbursementRefund',
  'RegulatedRemittanceP2P',
  'Unclear',
] as const;
export type StripeGlobalPayoutsPurposeClass =
  (typeof STRIPE_GLOBAL_PAYOUTS_PURPOSE_CLASSES)[number];

/** The operator gates a verdict can surface (every one is an honest CONDITIONAL, never a route). */
export const STRIPE_GLOBAL_PAYOUTS_OPERATOR_GATES = [
  'PRIVATE_PREVIEW_ORIGIN_REQUEST',
  'TREASURY_ENTITLEMENT',
  'FUNDING_PROOF',
  'P2P_LICENCE_AND_PROVIDER_APPROVAL',
  'PRIVATE_PREVIEW_RECIPIENT_CURRENCY',
  'PREVIEW_PAYOUT_METHOD',
  'CROSS_CURRENCY_QUOTE_REQUIRED',
] as const;
export type StripeGlobalPayoutsOperatorGate =
  (typeof STRIPE_GLOBAL_PAYOUTS_OPERATOR_GATES)[number];

/** The typed refusal reasons (machine-citable exclusions). */
export const STRIPE_GLOBAL_PAYOUTS_REFUSAL_REASONS = [
  'PURPOSE_CLASSIFICATION_REQUIRED',
  'PURPOSE_CLASSIFICATION_INCOHERENT',
  'ORIGIN_COUNTRY_NOT_LISTED',
  'RECIPIENT_MARKET_NOT_AVAILABLE',
  'RECIPIENT_CURRENCY_NOT_AVAILABLE',
  'PAYOUT_METHOD_NOT_AVAILABLE_FOR_SENDER',
  'AMOUNT_BELOW_MINIMUM',
  'AMOUNT_ABOVE_MAXIMUM',
  'ALIAS_OPERATION_FORBIDDEN',
  'UNPINNED_API_SURFACE',
] as const;
export type StripeGlobalPayoutsRefusalReason =
  (typeof STRIPE_GLOBAL_PAYOUTS_REFUSAL_REASONS)[number];

/** One gate's outcome on the trail every verdict carries. */
export interface StripeGlobalPayoutsGateRecord {
  readonly gate: string;
  readonly outcome: 'PASSED' | 'OPERATOR_GATED' | 'REFUSED';
  readonly detail: string;
}

/** The typed, frozen eligibility verdict (the only admission result). */
export type StripeGlobalPayoutsEligibilityVerdict = Readonly<
  | {
      readonly kind: 'ELIGIBLE';
      readonly gates: readonly StripeGlobalPayoutsGateRecord[];
      /** The cross-currency note when the FX-bound check waits for the provider quote. */
      readonly crossCurrencyNote?: string;
    }
  | {
      readonly kind: 'OPERATOR_GATED';
      readonly gate: StripeGlobalPayoutsOperatorGate;
      readonly detail: string;
      readonly gates: readonly StripeGlobalPayoutsGateRecord[];
    }
  | {
      readonly kind: 'REFUSED';
      readonly reason: StripeGlobalPayoutsRefusalReason;
      readonly detail: string;
      readonly gates: readonly StripeGlobalPayoutsGateRecord[];
      /** The honest conditional-opportunity context (e.g. the Ghana H2 27 roadmap note). */
      readonly conditionalOpportunityNote?: string;
    }
> & {
  /** The D10 evidence stamp: the retrieval date every fact above carries. */
  readonly evidence: typeof STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP;
};

/** The ELIGIBLE verdict shape (plan-buildable; used by the journey contracts). */
export type ExtractStripeGlobalPayoutsEligibleVerdict =
  Extract<StripeGlobalPayoutsEligibilityVerdict, { readonly kind: 'ELIGIBLE' }>;

/** The non-ELIGIBLE verdict shapes (typed NOT_PLANNED inputs; used by the journey contracts). */
export type ExcludeStripeGlobalPayoutsEligibleVerdict =
  Exclude<StripeGlobalPayoutsEligibilityVerdict, { readonly kind: 'ELIGIBLE' }>;

/** The typed purpose/eligibility law proofs a journey may present (all optional — fail-closed). */
export interface StripeGlobalPayoutsJourneyProofs {
  /** V2: Global Payouts requires Treasury — the funded financial account is the prerequisite. */
  readonly treasuryEntitlement?: {
    readonly financialAccountId: string;
    /** The observed entitlement (an ACTIVE/entitled financial account read back on the account). */
    readonly entitlementObserved: boolean;
  };
  /** The funding proof: the dated docs' "fund your financial account". */
  readonly funding?: {
    readonly fundedMinorUnits: number;
    readonly currency: string;
  };
  /**
   * The INV-30 P2P proofs (capability matrix §5, V5): the actual operator's
   * licences AND Stripe's explicit WRITTEN product approval for the disclosed
   * model. Absent either, a P2P journey is a typed OPERATOR_GATED conditional.
   */
  readonly p2pLicenceAndProviderApproval?: {
    readonly licenceEvidenceRef: string;
    readonly providerWrittenApprovalRef: string;
  };
}

/** The typed journey facts the gates evaluate (D3: the classification is input, never chosen). */
export interface StripeGlobalPayoutsJourneyInput {
  /** ISO 3166-1 alpha-2 origin (sender business) country. */
  readonly originCountry: string;
  /** The typed classification derived from the journey's real facts (D3 — reviewable, never model-chosen). */
  readonly purposeClass: StripeGlobalPayoutsPurposeClass;
  /** Honest indicator list when the journey's facts look like personal remittance (INV-30's laundering gate). */
  readonly remittanceIndicators?: readonly string[];
  readonly recipientCountryCode: string;
  /** The payout (receiving) currency, ISO 4217 uppercase. */
  readonly recipientCurrency: string;
  /** The dated method token (bank_accounts.ach | … | cards | crypto_wallets). */
  readonly payoutMethodId?: string;
  /** The send amount in MINOR units of the sending currency (the API's integer law). */
  readonly amountMinorUnits: number;
  readonly sendingCurrency: string;
  /** The docs' payout-method row the sending limits are keyed by ('Wire' | 'Standard' | 'Instant (cards)'). */
  readonly sendingLimitPayoutMethod?: string;
  readonly proofs: StripeGlobalPayoutsJourneyProofs;
}

/**
 * The conditional-opportunity notes for absent recipient markets (D10 — the
 * dated roadmap labels, surfaced honestly on the refusal, never as routes).
 * GH is the K1 law: no Ghana row on the 2026-11-03 recipient-countries table;
 * the money-management availability page labels Ghana GHS/SWIFT/Wire/6 days
 * "H2 27" (re-verified verbatim at this station). The stablecoins page (same
 * date) lists Ghana for CRYPTO-WALLET payouts only — US-origin businesses
 * (New York excluded), public preview.
 */
export const STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_CONDITIONAL_NOTES: Readonly<Record<string, string>> =
  Object.freeze({
    GH:
      'Ghana carries no row on the 2026-11-03 Global-Payouts recipient-countries table. ' +
      'stripe.com/money-management/availability (retrieved 2026-11-03) labels Ghana GHS/SWIFT/Wire/6 days "H2 27" ' +
      '(K1: a roadmap conditional opportunity at best, never an available route). The same-date stablecoins page ' +
      'lists Ghana for crypto-wallet payouts only — public preview, US-origin businesses only (New York excluded) ' +
      '(K2 extension: a dated preview observation, never a bank rail and never a UK-origin route).',
  });
