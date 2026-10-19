/**
 * @payswap/merchant — the PINNED WIRE SHAPES of the payment acceptance
 * plane (P5-W3, lane R3-W3; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports (the v1 leaf-in-flight law). Every
 * mirror below names its AUTHORITY — the payswap.org payment-plane
 * contracts consumed by the old merchant packages (old
 * packages/payment/src/acceptance.ts, method.ts, translation.ts @
 * 8a735bf), themselves the P1-era payment contracts on the 3.0 side.
 * The mirrors are SUBSET-typed where the merchant flow needs less than
 * the authority.
 *
 * Pins in this module (authority: the payment acceptance plane):
 * - PINNED_PAYMENT_METHOD_KINDS + PinnedPaymentMethodKind (the FROZEN
 *   §6A method vocabulary, byte-identical — STABLECOIN_CRYPTO is the
 *   only kind the crypto acceptance policy may narrow)
 * - PinnedPaymentMethod / PinnedPaymentAcceptancePolicy (SUBSET: the
 *   method catalog + currencies + geography the checkout fallback
 *   options need)
 * - PinnedAcceptanceRequest / PinnedAcceptanceDecision + the pinned
 *   base-plane rejection vocabulary
 * - PinnedMerchantSettlementDestination (EXTERNAL only — INV-8:
 *   structurally incapable of representing PaySwap custody)
 * - PINNED_RECOURSE_POLICY_KINDS + PinnedRecoursePolicyKind
 * - PinnedMaterialTerms / PinnedPaymentMethodTranslation (SUBSET)
 */

// ---------------------------------------------------------------------------
// The method vocabulary (FROZEN §6A — byte-identical)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: the payment plane `PaymentMethodKind` union
 * (byte-identical members, byte-identical order). `CHECK_CASH_EXTERNAL`
 * records movements PaySwap did NOT orchestrate; `STABLECOIN_CRYPTO` is
 * the only kind the merchant crypto acceptance policy may narrow — the
 * base policy must already declare it (the narrowing law).
 */
export const PINNED_PAYMENT_METHOD_KINDS = Object.freeze([
  "CARD",
  "BANK_TRANSFER",
  "ACH_EFT",
  "INSTANT_PAYMENT",
  "MOBILE_MONEY",
  "WALLET",
  "STABLECOIN_CRYPTO",
  "VIRTUAL_CARD",
  "BNPL_CREDIT",
  "CHECK_CASH_EXTERNAL",
] as const);

/** STRUCTURAL PIN — authority: the payment plane `PaymentMethodKind`. */
export type PinnedPaymentMethodKind = (typeof PINNED_PAYMENT_METHOD_KINDS)[number];

/** STRUCTURAL PIN — authority: the payment plane `PaymentMethod` (SUBSET). */
export interface PinnedPaymentMethod {
  readonly id: string;
  readonly kind: PinnedPaymentMethodKind;
  /** Checkout-facing display name, e.g. `Mobile Money`. */
  readonly displayName: string;
  readonly currencies: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: the payment plane
 * `PaymentAcceptancePolicy` (SUBSET: the id/merchantRef/methods/
 * methodCatalog/currencies/geography surface the checkout layer needs;
 * recurring, partial-payment, refund, recourse, eligibility,
 * settlement-destination, timing and remittance members are owned by
 * the payment plane and consumed through their own pins where needed).
 */
export interface PinnedPaymentAcceptancePolicy {
  readonly id: string;
  readonly merchantRef: string;
  readonly methods: readonly PinnedPaymentMethodKind[];
  readonly methodCatalog: readonly PinnedPaymentMethod[];
  readonly currencies: readonly string[];
  /** ISO-3166-style geography where the acceptance applies. */
  readonly geography: readonly string[];
}

// ---------------------------------------------------------------------------
// Base-plane acceptance evaluation (byte-pinned vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: the payment plane `AcceptanceRejectionReason`
 * union (byte-identical). The merchant crypto matcher unions these
 * under `BASE_POLICY_REJECTED` semantics.
 */
export const PINNED_ACCEPTANCE_REJECTION_REASONS = Object.freeze([
  "METHOD_KIND_NOT_ACCEPTED",
  "METHOD_NOT_IN_CATALOG",
  "CURRENCY_NOT_ACCEPTED",
  "RECURRING_NOT_SUPPORTED",
  "PARTIAL_PAYMENTS_NOT_SUPPORTED",
  "PARTIAL_BELOW_MINIMUM",
  "ELIGIBILITY_CRITERION_UNMET",
  "GEOGRAPHY_NOT_SERVED",
  "COUNTRY_NOT_LISTED",
] as const);

/** STRUCTURAL PIN — authority: the payment plane `AcceptanceRejectionReason`. */
export type PinnedAcceptanceRejectionReason = (typeof PINNED_ACCEPTANCE_REJECTION_REASONS)[number];

/** STRUCTURAL PIN — authority: the payment plane `AcceptanceRequest` (SUBSET). */
export interface PinnedAcceptanceRequest {
  readonly methodId: string;
  readonly currency: string;
  readonly country?: string;
  readonly recurring?: boolean;
  readonly partial?: boolean;
  readonly partialBasisPoints?: bigint;
  readonly payerAttributes?: Readonly<Record<string, string>>;
}

/**
 * STRUCTURAL PIN — authority: the payment plane `AcceptanceDecision`
 * (the explicit decision — never silently inferred).
 */
export interface PinnedAcceptanceDecision {
  readonly accepted: boolean;
  readonly reasons: readonly PinnedAcceptanceRejectionReason[];
  readonly method: PinnedPaymentMethod | undefined;
}

// ---------------------------------------------------------------------------
// Settlement destinations (EXTERNAL only — the non-custody law)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: the payment plane
 * `MerchantSettlementDestination`. EXTERNAL destination/capability
 * where the merchant receives value — INV-8-adjacent: this can never
 * represent a PaySwap custodial balance (there is no field that could
 * hold one) and it carries provenance of where the external details
 * were recorded.
 */
export interface PinnedMerchantSettlementDestination {
  readonly id: string;
  readonly kind: string;
  readonly currency: string;
  /** Opaque external reference (account id, wallet address…). */
  readonly externalRef: string;
  readonly provenance: {
    readonly source: string;
    readonly reference: string;
    readonly recordedAt: bigint;
  };
}

// ---------------------------------------------------------------------------
// Recourse vocabulary (byte-identical)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: the payment plane `RecoursePolicyKind` union
 * (byte-identical). The recourse/protection the merchant extends to
 * payers; frozen at refund initiation.
 */
export const PINNED_RECOURSE_POLICY_KINDS = Object.freeze([
  "NONE",
  "CHARGEBACK_ONLY",
  "MERCHANT_DISPUTE_WINDOW",
  "ESCROW_PROTECTED",
] as const);

/** STRUCTURAL PIN — authority: the payment plane `RecoursePolicyKind`. */
export type PinnedRecoursePolicyKind = (typeof PINNED_RECOURSE_POLICY_KINDS)[number];

// ---------------------------------------------------------------------------
// Material terms + method translation (SUBSET)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: the payment plane `MaterialTerms`. The
 * material terms of a payment — a translation that changes ANY of these
 * relative to the authorized terms requires fresh reauthorization.
 */
export interface PinnedMaterialTerms {
  readonly amount: { readonly value: bigint; readonly currency: string };
  readonly currency: string;
  /** Total fees presented to the payer, exact. */
  readonly fees: { readonly value: bigint; readonly currency: string };
  /** Completion deadline, in ms from initiation. */
  readonly completionMs: bigint;
  readonly recourse: string;
  readonly settlementDestinationId: string;
}

/**
 * STRUCTURAL PIN — authority: the payment plane
 * `PaymentMethodTranslation` (SUBSET: id + the material terms this
 * translation actually realizes; the capability-chain and rail-effect
 * records are owned by the payment/execution planes and stay opaque
 * here). Requested STABLECOIN_CRYPTO method → selected capability
 * chain → actual rail effects → merchant settlement result.
 */
export interface PinnedPaymentMethodTranslation {
  readonly id: string;
  readonly requestedMethod: string;
  /** The terms this translation actually realizes. */
  readonly materialTerms: PinnedMaterialTerms;
}
