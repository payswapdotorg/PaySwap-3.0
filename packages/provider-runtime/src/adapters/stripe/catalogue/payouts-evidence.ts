/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS dated-evidence layer
 * (P27-B, ADR-0020 D10 — the retrieval-dated facts the product slice gates on).
 *
 * THE LAW (ADR-0020 D10, binding): every provider country/method/currency/
 * limit/entitlement fact below is an EVIDENCE-STAMPED OBSERVATION with a
 * retrieval date and a source URL — never a flag, never permanent truth. Every
 * fact below was re-verified against LIVE Stripe documentation at the P27-B
 * station on 2026-11-03 (machine diffed against the live pages; the full
 * retrieval record is in the P27-B lane report); encoding a NEW fact requires
 * the same live-doc re-verification first. Roadmap labels ("H2 27") are
 * CONDITIONAL OPPORTUNITIES at best — never an available route.
 *
 * THE RETRIEVAL (2026-11-03, P27-B station — HTTP 200 on every page):
 * - docs.stripe.com/global-payouts — "Send payouts to more than 160 markets";
 *   "send payouts to customers, affiliates, sellers, or any third party"; "Send
 *   payouts to bank accounts through local bank networks, Fedwire, or SWIFT";
 *   "Global Payouts requires Treasury … fund your financial account";
 *   "Create recipients with the API or have recipients enter in their own
 *   information using prebuilt information collection forms"; the availability
 *   section's GA origin list (US, GB) and the 22-country private-preview list.
 * - docs.stripe.com/global-payouts/recipient-countries — the 107-row recipient
 *   country × currency matrix ("applies to all supported sender countries (US
 *   and UK)"; "Currencies in the Private preview currencies column are
 *   available through the API. To send payouts in those currencies, request
 *   access."). GHANA IS ABSENT (zero Ghana rows) — the K1 law.
 * - docs.stripe.com/global-payouts/payout-methods — the sender-country payout-
 *   method tables (US + UK views) with the capability tokens
 *   (bank_accounts.ach/.fedwire/.fps/.sepa/.local/.swift, cards,
 *   crypto_wallets — the live US table also names `link`, for the separate
 *   payouts-to-Link-users flow, and an Apple Pay private preview note on the
 *   cards row; neither is encoded in this slice) and the sending/receiving
 *   limit tables (minor units, verbatim).
 * - docs.stripe.com/global-payouts/send-money — "Send payouts to recipients
 *   from your financial account in Stripe Treasury"; the live API code path is
 *   POST /v2/money_management/outbound_payments (Stripe-Version 2026-10-28)
 *   — NOT in the pinned census (the census-gap record, payouts-product.ts);
 *   Confirmation of Payee (UK GBP→UK) with the
 *   outbound_payment_recipient_verification_missing refusal code; payout risk
 *   review.
 * - docs.stripe.com/global-payouts/manage-payouts — the status vocabularies
 *   (see payouts-status.ts), "cancel the payout while its OutboundPayment's
 *   cancelable field is true", the restricted-key law ("full-access secret
 *   keys (sk_live_…) don't work in live mode") and the restricted-key
 *   permission names for the product.
 * - docs.stripe.com/global-payouts/recipient-creation — recipients are v2
 *   Account objects created with the Accounts API; the hosted recipient-
 *   information form is an Account Link (single-use, expires after 5 minutes).
 * - docs.stripe.com/global-payouts/send-money/stablecoins — stablecoin
 *   crypto-wallet payouts are PUBLIC PREVIEW, "available to businesses in the
 *   US, except businesses located in New York"; the crypto-wallet recipient
 *   list DOES include Ghana — a dated extension of the P27-0 K2 record: a
 *   PREVIEW, US-ORIGIN-ONLY conditional opportunity — never a bank rail,
 *   never a UK-origin route.
 * - docs.stripe.com/connect/cross-border-payouts-to-recipients/compare-global-
 *   payouts — Global Payouts: "Funds come from your financial account balance,
 *   and aren't directly associated with payments. Recipients can be any
 *   external party." vs Connect payouts: "Recipients must be connected
 *   accounts." (V4, the never-alias distinctness fact).
 * - stripe.com/payouts — "Send money directly to recipients from your fintech,
 *   insurance business, marketplace or government entity"; "Fintech payouts —
 *   Send funds instantly for loan payouts, cash-outs, investment withdrawals
 *   and peer-to-peer transfers" (V5: a licensed-fintech product context).
 * - stripe.com/money-management/availability — Ghana GHS · SWIFT · Wire ·
 *   6 days · **"H2 27"** (K1 re-verified verbatim on the dated page).
 */

/** The retrieval stamp every dated fact below carries (the D10 law). */
export const STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP = Object.freeze({
  retrievedAt: '2026-11-03',
  retrievedBy: 'P27-B lane station (worker-2, branch work/p27-b)',
  evidenceTier: 'LIVE_PROVIDER_DOCUMENTATION',
} as const);

/**
 * The GA origin countries (live page 2026-11-03): "Businesses located in the
 * following countries can use Global Payouts to send payouts" — the page's own
 * machine country list is ["US","GB"]. An origin outside this set is NEVER
 * eligible through the GA gate.
 */
export const STRIPE_GLOBAL_PAYOUTS_GA_ORIGIN_COUNTRIES: readonly string[] = Object.freeze([
  'GB', // United Kingdom
  'US', // United States
] as const);

/**
 * The PRIVATE-PREVIEW origin countries (live page 2026-11-03): "Businesses
 * located in the following countries can request private preview access to
 * use Global Payouts to send payouts" — the page's own machine country list,
 * the FULL 22 entries (completing the P27-0 capability matrix's partial
 * extraction, which named AU AT BE BG HR CY EE FI FR DE GR IE IT LV LT LU "…").
 * These origins produce typed OPERATOR_GATED conditional outcomes — never a route.
 */
export const STRIPE_GLOBAL_PAYOUTS_PRIVATE_PREVIEW_ORIGIN_COUNTRIES: readonly string[] =
  Object.freeze([
    'AU', // Australia
    'AT', // Austria
    'BE', // Belgium
    'BG', // Bulgaria
    'HR', // Croatia
    'CY', // Cyprus
    'EE', // Estonia
    'FI', // Finland
    'FR', // France
    'DE', // Germany
    'GR', // Greece
    'IE', // Ireland
    'IT', // Italy
    'LV', // Latvia
    'LT', // Lithuania
    'LU', // Luxembourg
    'MT', // Malta
    'NL', // Netherlands
    'PT', // Portugal
    'SK', // Slovakia
    'SI', // Slovenia
    'ES', // Spain
  ] as const);

/**
 * One dated payout-method fact (the sender-country method matrix,
 * docs.stripe.com/global-payouts/payout-methods retrieved 2026-11-03).
 *
 * COUNTRY-CODE LAW: the docs label their sender views "US" and "UK"; this
 * slice keys them by ISO 3166-1 alpha-2 (US and GB — the same law the rest
 * of the matrix uses). One country-code vocabulary, never two.
 */
export interface StripeGlobalPayoutsDatedMethodFact {
  /** The sender (origin) country the row applies to (ISO 3166-1 alpha-2; the docs' "UK" view). */
  readonly senderCountry: 'US' | 'GB';
  /** The recipient-capability/payout-method token the docs name. */
  readonly methodId:
    | 'bank_accounts.ach'
    | 'bank_accounts.fedwire'
    | 'bank_accounts.fps'
    | 'bank_accounts.sepa'
    | 'bank_accounts.local'
    | 'bank_accounts.swift'
    | 'cards'
    | 'crypto_wallets';
  readonly payoutMethod: string;
  readonly bankingRail: string;
  /** The recipient location the row describes (doc wording). */
  readonly recipientLocation: string;
  readonly availability: 'GA' | 'PUBLIC_PREVIEW' | 'PRIVATE_PREVIEW';
  /** The docs' own arrival label — an ESTIMATE, never a guarantee. */
  readonly expectedArrivalLabel: string;
}

/** The dated payout-method matrix (both sender views, exactly as documented). */
export const STRIPE_GLOBAL_PAYOUTS_PAYOUT_METHODS: readonly StripeGlobalPayoutsDatedMethodFact[] =
  Object.freeze([
    // ---- US sender view ----
    Object.freeze({
      senderCountry: 'US', methodId: 'bank_accounts.ach', payoutMethod: 'Bank account',
      bankingRail: 'ACH', recipientLocation: 'United States', availability: 'GA',
      expectedArrivalLabel: 'Typically up to 1 business day',
    }),
    Object.freeze({
      senderCountry: 'US', methodId: 'bank_accounts.fedwire', payoutMethod: 'Bank account',
      bankingRail: 'Fedwire', recipientLocation: 'United States', availability: 'GA',
      expectedArrivalLabel: 'Typically 1 business day',
    }),
    Object.freeze({
      senderCountry: 'US', methodId: 'cards', payoutMethod: 'Debit card',
      bankingRail: 'Debit card', recipientLocation: 'United States', availability: 'GA',
      expectedArrivalLabel: 'Immediate',
    }),
    Object.freeze({
      senderCountry: 'US', methodId: 'bank_accounts.fps', payoutMethod: 'Bank account',
      bankingRail: 'FPS', recipientLocation: 'United Kingdom', availability: 'GA',
      expectedArrivalLabel: 'Real-time (seconds to minutes)',
    }),
    Object.freeze({
      senderCountry: 'US', methodId: 'bank_accounts.sepa', payoutMethod: 'Bank account',
      bankingRail: 'SEPA', recipientLocation: 'Eurozone countries', availability: 'GA',
      expectedArrivalLabel: 'Typically 1 business day',
    }),
    Object.freeze({
      senderCountry: 'US', methodId: 'bank_accounts.local', payoutMethod: 'Bank account',
      bankingRail: 'Local', recipientLocation: 'Outside of the United States (available countries)',
      availability: 'GA',
      expectedArrivalLabel: 'Typically 1-7 days (varies by country)',
    }),
    Object.freeze({
      senderCountry: 'US', methodId: 'bank_accounts.swift', payoutMethod: 'Bank account',
      bankingRail: 'Wire', recipientLocation: 'Outside of the United States (available countries)',
      availability: 'GA',
      expectedArrivalLabel: 'Typically 1-7 days (varies by country)',
    }),
    Object.freeze({
      senderCountry: 'US', methodId: 'crypto_wallets', payoutMethod: 'Crypto wallet',
      bankingRail: 'USDC or OUSD crypto wallet', recipientLocation: 'Available countries',
      availability: 'PUBLIC_PREVIEW',
      expectedArrivalLabel: 'Real-time (minutes)',
    }),
    // ---- UK sender view ----
    Object.freeze({
      senderCountry: 'GB', methodId: 'bank_accounts.fps', payoutMethod: 'Bank account',
      bankingRail: 'FPS', recipientLocation: 'United Kingdom', availability: 'GA',
      expectedArrivalLabel: 'Real-time (seconds to minutes)',
    }),
    Object.freeze({
      senderCountry: 'GB', methodId: 'cards', payoutMethod: 'Debit card',
      bankingRail: 'Debit card', recipientLocation: 'United Kingdom', availability: 'GA',
      expectedArrivalLabel: 'Immediate',
    }),
    Object.freeze({
      senderCountry: 'GB', methodId: 'bank_accounts.local', payoutMethod: 'Bank account',
      bankingRail: 'Local', recipientLocation: 'Outside of the United Kingdom (available countries)',
      availability: 'GA',
      expectedArrivalLabel: 'Typically 1-7 business days (varies by country)',
    }),
    Object.freeze({
      senderCountry: 'GB', methodId: 'bank_accounts.swift', payoutMethod: 'Bank account',
      bankingRail: 'Wire', recipientLocation: 'Outside of the United Kingdom (available countries)',
      availability: 'GA',
      expectedArrivalLabel: 'Typically 1-7 days (varies by country)',
    }),
  ] as const);

/** One dated sending-limit fact (minor units — the docs print the exact minor-unit value per row). */
export interface StripeGlobalPayoutsDatedSendingLimit {
  /** ISO 3166-1 alpha-2 (the docs' "UK" sender view is keyed GB). */
  readonly senderCountry: 'US' | 'GB';
  readonly sendingCurrency: string;
  readonly payoutMethod: string;
  readonly minMinorUnits: number;
  readonly maxMinorUnits: number;
}

/**
 * The dated sending limits (both sender views, the docs' minor-unit values
 * verbatim). NOTE the US USD Wire maximum: the live table's own minor-unit
 * parenthetical is `1000000000` (= 10,000,000 USD — the re-verification diff
 * caught an earlier 10× misread of this cell; the dated page wins).
 */
export const STRIPE_GLOBAL_PAYOUTS_SENDING_LIMITS: readonly StripeGlobalPayoutsDatedSendingLimit[] =
  Object.freeze([
    Object.freeze({ senderCountry: 'US', sendingCurrency: 'USD', payoutMethod: 'Wire', minMinorUnits: 1, maxMinorUnits: 1_000_000_000 }),
    Object.freeze({ senderCountry: 'US', sendingCurrency: 'USD', payoutMethod: 'Standard', minMinorUnits: 1, maxMinorUnits: 100_000_000 }),
    Object.freeze({ senderCountry: 'US', sendingCurrency: 'USD', payoutMethod: 'Instant (cards)', minMinorUnits: 1, maxMinorUnits: 999_900 }),
    Object.freeze({ senderCountry: 'GB', sendingCurrency: 'GBP', payoutMethod: 'Standard', minMinorUnits: 1, maxMinorUnits: 100_000_000 }),
    Object.freeze({ senderCountry: 'GB', sendingCurrency: 'GBP', payoutMethod: 'Instant (cards)', minMinorUnits: 1, maxMinorUnits: 999_900 }),
    Object.freeze({ senderCountry: 'GB', sendingCurrency: 'EUR', payoutMethod: 'Standard', minMinorUnits: 1, maxMinorUnits: 100_000_000 }),
    Object.freeze({ senderCountry: 'GB', sendingCurrency: 'USD', payoutMethod: 'Standard', minMinorUnits: 1, maxMinorUnits: 100_000_000 }),
  ] as const);

/* ---------------- lookup helpers over the dated rows (pure, fail-closed) ---------------- */

/** The dated sending limits for one origin/currency/method row (undefined = no dated row). */
export function globalPayoutsSendingLimitsOf(
  senderCountry: string,
  sendingCurrency: string,
  payoutMethod: string,
): StripeGlobalPayoutsDatedSendingLimit | undefined {
  const country = senderCountry.toUpperCase();
  const currency = sendingCurrency.toUpperCase();
  return STRIPE_GLOBAL_PAYOUTS_SENDING_LIMITS.find(
    (row) => row.senderCountry === country && row.sendingCurrency === currency && row.payoutMethod === payoutMethod,
  );
}

/** The dated payout-method rows for one sender country. */
export function globalPayoutsMethodRowsOf(senderCountry: string): readonly StripeGlobalPayoutsDatedMethodFact[] {
  const country = senderCountry.toUpperCase();
  return STRIPE_GLOBAL_PAYOUTS_PAYOUT_METHODS.filter((row) => row.senderCountry === country);
}

/* The dated recipient-market matrix (107 rows) and the receiving bounds live in
 * payouts-evidence-markets.ts (the file law); this module re-exports them so the
 * evidence surface stays one import for the slice's consumers. */
export {
  STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_ROWS,
  STRIPE_GLOBAL_PAYOUTS_MIN_RECEIVING_ROWS,
  STRIPE_GLOBAL_PAYOUTS_MAX_RECEIVING_ROWS,
  globalPayoutsRecipientMarketOf,
  globalPayoutsMinReceivingMinorUnitsOf,
  globalPayoutsMaxReceivingMinorUnitsOf,
} from './payouts-evidence-markets.ts';
export type { StripeGlobalPayoutsDatedCountryFact } from './payouts-evidence-markets.ts';
