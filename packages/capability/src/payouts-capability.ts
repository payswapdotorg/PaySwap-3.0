/**
 * @payswap/capability — the Stripe GLOBAL PAYOUTS product capability slice
 * (P27-B, ADR-0020 D4/D10 + the P27-0 capability matrix §4/§5).
 *
 * THE PRODUCT SEPARATION LAW (ADR-0020 D4): Stripe Global Payouts is a
 * DISTINCT, separately-entitled capability slice — never an alias of ordinary
 * Stripe payouts (POST /v1/payouts, the merchant's own balance), Connect
 * transfers (recipients must be connected accounts) or PaymentIntents. The
 * definitions below carry that law as data (`STRIPE_GLOBAL_PAYOUTS_NEVER_ALIAS_SURFACES`).
 *
 * THE D10 LAW (dated evidence, never flags): every country/method/currency/
 * limit fact below is an EVIDENCE-STAMPED OBSERVATION with a retrieval date
 * and a source URL, re-verified against live Stripe documentation at the
 * P27-B station on 2026-11-03 (`STRIPE_GLOBAL_PAYOUTS_LIVE_DOC_EVIDENCE`).
 * The freshness law (observation.ts) applies: observations are evidence, and
 * re-verification happens again before encoding and at dispatch.
 *
 * THE INV-13 LAW (fail-closed): catalogue capability is NOT executable
 * connected capability. The rail definition below is deliberately
 * NON-EXECUTABLE with an explicit reason until the operator's real, entitled,
 * probe-verified account exists — an executable definition requires the
 * fourteen-part declaration (executable-declaration.ts) built on real
 * account evidence, never on documentation.
 *
 * THE INV-30 LAW (capability matrix §5 row): regulated remittance/P2P is
 * eligible ONLY if the actual PaySwap operator holds the required licences
 * AND carries Stripe's explicit written product approval for the disclosed
 * model (V5: "Fintech payouts" is a licensed-fintech product context, never
 * a blanket approval for ordinary merchant accounts). The definitions below
 * carry that as a hard compliance condition; absent the proofs the honest
 * outcome is a typed exclusion or conditional opportunity — never a route.
 */

import type { CapabilityDefinition } from './capability-definition.ts';
import type { NonExecutableCapabilityDefinition } from './capability-definition.ts';
import { defineCapability } from './definition-validation.ts';
import { asCapabilityDefinitionId } from './identifiers.ts';
import { ValidationError } from './errors.ts';
import { isRecord } from './shared.ts';

/* ------------------------- the D10 evidence contract ------------------------- */

/** One evidence-stamped observation (the ADR-0020 D10 law, made structural). */
export interface DatedEvidenceObservation {
  /** Strict ISO-8601 calendar date (YYYY-MM-DD) on which the fact was retrieved. */
  readonly retrievedAt: string;
  /** The live source URL the fact was re-verified against. */
  readonly sourceUrl: string;
  /** The re-verified finding (what the source said, dated). */
  readonly finding: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Structural validation of one dated observation (fail-closed). */
export function validateDatedEvidenceObservation(candidate: unknown): DatedEvidenceObservation {
  if (!isRecord(candidate)) {
    throw new ValidationError('a dated evidence observation must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (
    typeof record.retrievedAt !== 'string' ||
    !ISO_DATE_PATTERN.test(record.retrievedAt)
  ) {
    throw new ValidationError(
      'a dated evidence observation requires retrievedAt as a strict ISO-8601 calendar date (YYYY-MM-DD)',
    );
  }
  if (typeof record.sourceUrl !== 'string' || !record.sourceUrl.startsWith('https://')) {
    throw new ValidationError('a dated evidence observation requires an https source URL');
  }
  if (typeof record.finding !== 'string' || record.finding.trim().length === 0) {
    throw new ValidationError('a dated evidence observation requires a non-empty finding');
  }
  return candidate as unknown as DatedEvidenceObservation;
}

/**
 * THE P27-B LIVE-DOC RE-VERIFICATION RECORD (retrieved 2026-11-03 at the
 * P27-B station; every page answered HTTP 200). The lane report
 * (docs/productization-evidence/P27-B-LANE-REPORT-2026-11-03.md) carries the
 * full findings; these entries are the facts the capability slice encodes.
 */
export const STRIPE_GLOBAL_PAYOUTS_LIVE_DOC_EVIDENCE: readonly DatedEvidenceObservation[] =
  Object.freeze(
    [
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://docs.stripe.com/global-payouts',
        finding:
          'GA origin countries: United Kingdom, United States ("Businesses located in the following countries can use ' +
          'Global Payouts to send payouts"); private preview by request: Australia, Austria, Belgium, Bulgaria, Croatia, ' +
          'Cyprus, Estonia, Finland, France, Germany, Greece, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, ' +
          'Netherlands, Portugal, Slovakia, Slovenia, Spain (the FULL 22-country list, completing the P27-0 partial extraction)',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://docs.stripe.com/global-payouts',
        finding:
          '"Use Global Payouts to send payouts to customers, affiliates, sellers, or any third party. Send payouts to bank ' +
          'accounts through local bank networks, Fedwire, or SWIFT"; "Global Payouts requires Treasury… fund your financial ' +
          'account"; "Create recipients with the API or have recipients enter in their own information using prebuilt ' +
          'information collection forms"',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://docs.stripe.com/global-payouts/recipient-countries',
        finding:
          'the recipient country × currency table (107 rows): GA currencies and Private-preview currencies per market; ' +
          'the table "applies to all supported sender countries (US and UK)"; GHANA IS ABSENT (no Ghana row)',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://docs.stripe.com/global-payouts/payout-methods',
        finding:
          'sender-country payout methods with capability tokens (bank_accounts.ach, bank_accounts.fedwire, ' +
          'bank_accounts.fps, bank_accounts.sepa, bank_accounts.local, bank_accounts.swift, cards, crypto_wallets) and ' +
          'the sending-limit rows (US: USD Wire 0.01–10,000,000, USD Standard 0.01–1,000,000, USD Instant-cards ' +
          '0.01–9,999; UK: GBP Standard 0.01–1,000,000, GBP Instant-cards 0.01–9,999, EUR Standard 0.01–1,000,000, ' +
          'USD Standard 0.01–1,000,000) plus per-currency receiving minima/maxima (minor units)',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://docs.stripe.com/global-payouts/send-money',
        finding:
          '"Send payouts to recipients from your financial account in Stripe Treasury"; the live API code path is ' +
          'POST /v2/money_management/outbound_payments (preview 2026-10-28) — NOT in the pinned v2596 census (the census-gap ' +
          'record, provider-runtime payouts-product.ts); Confirmation of Payee applies to UK GBP→UK payouts; payout risk ' +
          'review can reject (outbound_payment_cannot_be_processed) or hold (under_review)',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://docs.stripe.com/global-payouts/send-money/stablecoins',
        finding:
          'stablecoin crypto-wallet payouts: "available only to businesses located in the US" (New York excluded), PUBLIC ' +
          'PREVIEW, USDC/OUSD; the crypto-wallet recipient list DOES include Ghana — a dated extension of the P27-0 K2 ' +
          'record (which found no Ghana stablecoin row on the money-management availability page): a preview observation, ' +
          'never a bank rail, never a UK-origin route',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://stripe.com/money-management/availability',
        finding:
          'Ghana GHS · SWIFT · Wire · 6 days · "H2 27" (K1 re-verified verbatim) — the Ghana corridor is a roadmap ' +
          'conditional opportunity at best, never an available route',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://stripe.com/payouts',
        finding:
          '"Send money directly to recipients from your fintech, insurance business, marketplace or government entity… ' +
          'Fintech payouts — Send funds instantly for loan payouts, cash-outs, investment withdrawals and peer-to-peer ' +
          'transfers" (V5: a licensed-fintech product context)',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl:
          'https://docs.stripe.com/connect/cross-border-payouts-to-recipients/compare-global-payouts',
        finding:
          'Global Payouts: funds flow "Directly from the sender\'s Stripe financial account to an external account… ' +
          'Recipients can be any entity with a valid external account" vs Connect payouts: "Recipients must be ' +
          'connected accounts" (V4: a distinct product, not an alias)',
      },
      {
        retrievedAt: '2026-11-03',
        sourceUrl: 'https://docs.stripe.com/global-payouts/manage-payouts',
        finding:
          'OutboundPayment statuses processing/failed/canceled/posted/returned with status-detail reasons (under_review, ' +
          'review_rejected, fx_rate_drift_exceeded_after_review) and the restricted-key permission names for the product ' +
          '(Recipient Configuration: Write; Money Management Financial Accounts: Read; Money Management Payout Methods: ' +
          'Write; Money Management Outbound Payments: Write; Money Management Payout Intents: Write)',
      },
    ].map((row) => Object.freeze(validateDatedEvidenceObservation(row))),
  );

/* --------------- the product-separation law, carried as data --------------- */

/**
 * THE NEVER-ALIAS SURFACES (ADR-0020 D4): pinned, dispatchable operations
 * that belong to OTHER Stripe products and can never serve a Global-Payouts
 * journey. The provider-runtime slice enforces this at the type level
 * (payouts-product.ts); the capability plane records it so any future
 * corridor projection over these definitions can cite the exclusion.
 */
export const STRIPE_GLOBAL_PAYOUTS_NEVER_ALIAS_SURFACES = Object.freeze({
  ordinaryPayouts: ['PostPayouts', 'PostPayoutsPayout', 'PostPayoutsPayoutCancel', 'PostPayoutsPayoutReverse'],
  connectTransfers: ['PostTransfers'],
  commercePayments: ['PostPaymentIntents', 'PostCheckoutSessions', 'PostPaymentLinks'],
  law: 'ADR-0020 D4 — Stripe Global Payouts is a separate product slice; POST /v1/payouts, Connect transfers and PaymentIntents are never re-labeled as Global Payouts',
} as const);

/* The dated payout corridors live in payouts-capability-corridors.ts (the file
 * law); this module re-exports them so the capability surface stays one import. */
export {
  STRIPE_GLOBAL_PAYOUTS_DATED_RECIPIENT_MARKETS,
  STRIPE_GLOBAL_PAYOUTS_CORRIDOR_DEFINITION_LEVEL,
  STRIPE_GLOBAL_PAYOUTS_CORRIDOR_IMPLEMENTATION_SETS,
} from './payouts-capability-corridors.ts';

/* ------------------------- the capability definitions ------------------------- */

/**
 * The Stripe Global-Payouts third-party payout rail — the layer-1 catalogue
 * definition. NON-EXECUTABLE BY CONSTRUCTION (fail-closed, INV-13): the
 * product requires the operator's entitled, probe-verified Stripe account
 * before any executable declaration can honestly exist; absent that, the
 * definition advertises POTENTIAL behavior with its hard constraints and an
 * explicit nonExecutableReason (silent absence is impossible).
 */
export function defineStripeGlobalPayoutsRailCapability(): CapabilityDefinition {
  // Typed BEFORE defineCapability: the input law (a fully-typed definition
  // record, never an untyped literal) — the fabric's fail-closed validators
  // then check every field.
  const definition: NonExecutableCapabilityDefinition = {
    id: asCapabilityDefinitionId('stripe.global-payouts.third-party-payout-rail'),
    version: '2026-11-03',
    capabilityClass: 'rail_movement',
    executable: false,
    nonExecutableReason:
      'the Global-Payouts rail is catalogue capability only until the operator supplies an entitled, probe-verified ' +
      'Stripe account (Treasury + the Global-Payouts entitlement per the 2026-11-03 run card §C); an executable ' +
      'fourteen-part declaration requires real account evidence — never documentation (INV-13)',
    conditions: [
      {
        kind: 'precondition',
        description:
          'V2: Global Payouts requires Treasury — an entitled, funded Stripe financial account must exist and be probe-verified (docs.stripe.com/global-payouts, retrieved 2026-11-03)',
        hardConstraint: true,
      },
      {
        kind: 'jurisdiction',
        description:
          'the origin business must be in a GA country (United Kingdom or United States, 2026-11-03) or hold a written Stripe private-preview grant (the 22 listed preview countries)',
        hardConstraint: true,
      },
      {
        kind: 'eligibility',
        description:
          'the recipient market and currency must be on the dated 2026-11-03 recipient-countries table (107 markets); Ghana is absent (the K1 roadmap "H2 27" conditional opportunity)',
        hardConstraint: true,
      },
      {
        kind: 'eligibility',
        description:
          'the payout method must be on the dated sender-country method matrix (bank_accounts.ach/.fedwire/.fps/.sepa/.local/.swift, cards; crypto_wallets is US-origin public preview, New York excluded)',
        hardConstraint: true,
      },
      {
        kind: 'compliance',
        description:
          'INV-30 (ADR-0020 D2): the journey\'s typed purpose classification governs; regulated remittance/P2P is eligible ONLY with the operator\'s licences AND Stripe\'s explicit written product approval (capability matrix §5) — absent either, a typed exclusion',
        hardConstraint: true,
      },
      {
        kind: 'compliance',
        description:
          'ADR-0020 D4 (the never-alias law): ordinary Stripe payouts (POST /v1/payouts), Connect transfers and PaymentIntents never serve a Global-Payouts journey',
        hardConstraint: true,
      },
    ],
    cost: [],
    risk: {
      riskClass: 'third-party-payout',
      severity: 'high',
      mitigations: [
        'fail-closed eligibility gates before any plan (origin GA/preview, Treasury entitlement, funding, market, method, amount)',
        'STRONG_CONFIRM approval required for the money-movement plan; REAUTH proof for the hosted recipient form',
        'INV-04: UNKNOWN outcomes reconcile by read-back, never blind retries',
        'returned/failed payouts carry the provider status-details reasons; funds return in a separate transaction (dated docs)',
      ],
    },
    provenance: {
      declaredBy: 'P27-B (worker-2, branch work/p27-b)',
      artifactRef: 'packages/capability/src/payouts-capability.ts',
      contentHash: 'dated-evidence-2026-11-03',
    },
    economicAccountability: {
      accountablePartyRef: 'the PaySwap operator\'s Stripe account (the sender business)',
      ledgerAccountRef: 'the Stripe Treasury financial account of the origin business',
      recoursePolicyRef: 'https://docs.stripe.com/global-payouts/manage-payouts (payout risk review; returned-payout handling)',
    },
    proofRequirements: [
      { proofLevel: 'P3', scope: 'treasury financial-account entitlement and funding' },
      { proofLevel: 'P4', scope: 'recipient creation and payout-method collection' },
      { proofLevel: 'P5', scope: 'third-party outbound payment (the money movement)' },
      { proofLevel: 'P5', scope: 'regulated remittance/P2P purpose class (licences + written provider approval)' },
    ],
  };
  return defineCapability(definition);
}

/** The Ghana-corridor conditional opportunity (K1) as honest, dated data — never an available route. */
export const STRIPE_GLOBAL_PAYOUTS_GHANA_CORRIDOR_CONDITIONAL_OPPORTUNITY: DatedEvidenceObservation =
  Object.freeze(
    validateDatedEvidenceObservation({
      retrievedAt: '2026-11-03',
      sourceUrl: 'https://stripe.com/money-management/availability',
      finding:
        'Ghana carries no row on the 2026-11-03 Global-Payouts recipient-countries table; the availability page labels ' +
        'Ghana GHS/SWIFT/Wire/6 days "H2 27". The stablecoins page (same date) lists Ghana for crypto-wallet payouts only ' +
        '(public preview, US-origin businesses only, New York excluded). The Ghana corridor is therefore a roadmap ' +
        'conditional opportunity at best — never an available route, never a UK-origin route, never a bank rail.',
    }),
  );
