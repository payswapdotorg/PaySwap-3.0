/**
 * @payswap/merchant — the PINNED WIRE SHAPES of the accepted
 * route-compiler's merchant-lane seam (P5-W3, lane R3-W3; commit 1/4 —
 * the type-level pins).
 *
 * LAYER LAW: zero sibling imports (the v1 leaf-in-flight law). Every
 * mirror below names its AUTHORITY — @payswap/route-compiler, the
 * ACCEPTED R3-W1 sibling on 3.0 main (src/merchant-legs.ts). The
 * route-compiler's mixed-rail compilation is the execution-side
 * consumer of the merchant settlement-mode vocabulary; it carries an
 * HONEST AWAITING MARKER for THIS lane (`MERCHANT_SETTLEMENT_AUTHORITY
 * = "P5-W3"`). The mirrors are pinned byte-identical so the two sides
 * of the seam can never drift (cross-lane consistency asserted by
 * test/pins.test.ts).
 *
 * Pins in this module (authority: @payswap/route-compiler):
 * - PINNED_MERCHANT_SETTLEMENT_AUTHORITY ("P5-W3" — this lane)
 * - PINNED_MERCHANT_SETTLEMENT_MODES + PinnedMerchantSettlementMode
 * - PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE (the verbatim
 *   honest-unavailability notice a Mode-B plan MUST carry)
 * - PinnedMerchantSettlementEligibilityEvidence (the rule-30 law:
 *   eligible/providerVerified LITERALS + the awaiting marker)
 */

// ---------------------------------------------------------------------------
// The merchant settlement seam (authority: route-compiler R3-W1)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/route-compiler
 * `MERCHANT_SETTLEMENT_AUTHORITY` ("P5-W3", byte-identical). The
 * merchant lane's integration authority marker: the route-compiler's
 * Mode-A legs carry this marker while the real merchant-lane
 * integration (this package) is the awaiting authority.
 */
export const PINNED_MERCHANT_SETTLEMENT_AUTHORITY = "P5-W3" as const;

/**
 * VALUE PIN — authority: @payswap/route-compiler
 * `MERCHANT_SETTLEMENT_MODES` (byte-identical members and order): the
 * settlement-mode vocabulary at the mixed-rail compilation seam —
 * NATIVE_MERCHANT_SETTLEMENT (the baseline) vs EXTERNAL_PAYSWAP_ROUTE.
 * The merchant-side route families (NATIVE_STRIPE_CRYPTO /
 * EXTERNAL_PAYSWAP_CONVERSION) reconcile onto this vocabulary through
 * the DOCUMENTED typed mapping in src/settlement-config.ts (never a
 * silent renaming).
 */
export const PINNED_MERCHANT_SETTLEMENT_MODES = Object.freeze([
  "NATIVE_MERCHANT_SETTLEMENT",
  "EXTERNAL_PAYSWAP_ROUTE",
] as const);

/** STRUCTURAL PIN — authority: route-compiler `MerchantSettlementMode`. */
export type PinnedMerchantSettlementMode = (typeof PINNED_MERCHANT_SETTLEMENT_MODES)[number];

/**
 * VALUE PIN — authority: @payswap/route-compiler
 * `MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE` (byte-identical).
 * The verbatim honest-unavailability notice: an external-route
 * settlement that would otherwise land in a provider balance carries
 * this notice wherever the native path is not eligible — never silence,
 * never a synthetic balance.
 */
export const PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE =
  "native merchant-balance settlement unavailable for this route" as const;

/**
 * STRUCTURAL PIN — authority: @payswap/route-compiler
 * `MerchantSettlementEligibilityEvidence` (SUBSET: the
 * eligible/providerVerified LITERALS, the provider/account/currency
 * identity, the verification reference, the freshness window and the
 * awaiting marker; the evidence-node linkage is owned by the
 * evidence-graph plane). The rule-30 law: provider-verified effects
 * demand provider verification — ineligibility is surfaced as an
 * honest exclusion, NEVER as evidence.
 */
export interface PinnedMerchantSettlementEligibilityEvidence {
  readonly evidenceId: string;
  readonly providerName: string;
  readonly merchantAccountRef: string;
  readonly currency: string;
  /** LITERAL: ineligibility is an honest exclusion, never evidence. */
  readonly eligible: true;
  /** LITERAL: the provider-verified-effects law. */
  readonly providerVerified: true;
  /** Opaque reference to the provider-side verification artifact. */
  readonly verificationRef: string;
  readonly observedAt: string;
  readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
  /** Honest marker: the real integration awaits the merchant lane. */
  readonly awaitingAuthority: typeof PINNED_MERCHANT_SETTLEMENT_AUTHORITY;
}
