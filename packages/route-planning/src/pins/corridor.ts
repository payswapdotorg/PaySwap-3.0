/**
 * @payswap/route-planning — the PINNED WIRE SHAPES of the P22
 * cross-provider corridor (P22-C, ADR-0016 D5/D6/D11 + the frozen
 * appendix — the pin contract).
 *
 * LAYER LAW: zero sibling imports. Every value below is pinned
 * byte-identical against the ADR-0016 appendix (the frozen cross-lane
 * vocabulary — the A/H/B lanes pin the same literals independently,
 * never imported; the ADR-0015 appendix discipline). The direction-class
 * and hop-bound vocabularies additionally mirror the host ask-loop
 * vocabulary (@payswap/desktop host payments/contracts.ts
 * `PAYMENT_MISSION_DIRECTIONS` + payments/intent-compiler.ts
 * `DIRECT_PAYMENT_MAX_ROUTE_HOPS`), pinned against the ADR, never
 * imported.
 *
 * Pins in this module:
 * - the corridor's chain key + the ONCHAIN rail scope (the chain key IS
 *   the rail key);
 * - the corridor's funding/payout METHOD pins (the GHS on-ramp + the KES
 *   off-ramp — the FLW/Stripe P21 pin precedent's naming shape, grown
 *   with the corridor currency qualifier);
 * - the corridor direction classes (MOVE/CONVERT) + the direct-payment
 *   hop bound (PAY stays max-hops-1, byte-identical);
 * - the corridor leg-kind skeleton (the exact four-leg law) + the
 *   leg-effect outcome vocabulary (the custody-continuity law's terms).
 */

/**
 * VALUE PIN — authority: ADR-0016 appendix. The corridor's chain key
 * (the Stellar TESTNET plane — the only chain this wave registers).
 */
export const PINNED_STELLAR_CHAIN_KEY = "stellar:testnet" as const;

/**
 * VALUE PIN — authority: ADR-0016 appendix. The corridor's relay rail:
 * an ONCHAIN-kind rail whose key IS the chain key (`stellar:testnet`).
 * The rail-kind/rail-key law: railKind "ONCHAIN" + railKey = the chain
 * key — the corridor chain derives from the onchain plane's own
 * four-layer hierarchy (ADR-0008 D5), never a PSP probe id.
 */
export const PINNED_CORRIDOR_RELAY_RAIL = Object.freeze({
  railKind: "ONCHAIN",
  railKey: PINNED_STELLAR_CHAIN_KEY,
} as const);

/**
 * VALUE PIN — authority: ADR-0016 appendix (the C lane's naming, to be
 * recorded in the appendix acceptance addendum at P22-C merge — never
 * invented twice). The corridor's GHS on-ramp funding method: the
 * Flutterwave Ghana mobile-money collection (the collect leg's lane).
 * Naming shape: the FLW/Stripe P21 pin precedent (`flutterwave_wallet`,
 * `stripe_payment_intent` — provider + instrument), grown with the
 * corridor currency qualifier because the corridor is defined by its
 * currency pair.
 */
export const PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD = "flutterwave_ghs_mobile_money" as const;

/**
 * VALUE PIN — authority: ADR-0016 appendix (the C lane's naming, to be
 * recorded in the appendix acceptance addendum at P22-C merge — never
 * invented twice). The corridor's KES off-ramp payout method: the
 * Paystack Kenya bank-transfer payout (the payout leg's lane — the
 * beneficiary bank instrument arrival).
 */
export const PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD = "paystack_kes_bank_transfer" as const;

/**
 * VALUE PIN — authority: ADR-0016 D11 + the host ask-loop vocabulary
 * (@payswap/desktop host payments/contracts.ts
 * `PAYMENT_MISSION_DIRECTIONS`, pinned byte-identically, never
 * imported). The mission direction classes a corridor demand may ride:
 * MOVE (move/transfer stems) or CONVERT (convert/exchange/swap stems).
 * PAY is NOT a corridor class: a direct payment demand is pinned to
 * DIRECT_PAYMENT_MAX_ROUTE_HOPS (below) and never silently widens.
 */
export const PINNED_MISSION_DIRECTION_CLASSES = Object.freeze(["PAY", "RECEIVE", "MOVE", "CONVERT"] as const);
export type PinnedMissionDirectionClass = (typeof PINNED_MISSION_DIRECTION_CLASSES)[number];

/** The corridor's direction classes (the D11 law: exactly MOVE and CONVERT). */
export const PINNED_CORRIDOR_DIRECTION_CLASSES = Object.freeze(["MOVE", "CONVERT"] as const);
export type PinnedCorridorDirectionClass = (typeof PINNED_CORRIDOR_DIRECTION_CLASSES)[number];

/**
 * VALUE PIN — authority: @payswap/desktop host payments/intent-compiler.ts
 * `DIRECT_PAYMENT_MAX_ROUTE_HOPS` = 1 (re-pinned UNTOUCHED, byte-identical
 * — ADR-0016 D11: "PAY keeps DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1
 * byte-identically; a direct payment demand never silently widens").
 */
export const PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1 as const;

/**
 * VALUE PIN — authority: ADR-0016 D5 (the exact skeleton law). The
 * corridor shape's leg-kind sequence, byte-exact — the four-leg
 * fiat -> chain -> fiat skeleton over the OBSERVED onchain middle.
 */
export const PINNED_CORRIDOR_LEG_SKELETON = Object.freeze([
  "FIAT_PSP_COLLECT",
  "PSP_STABLECOIN_ISSUANCE",
  "ONCHAIN_TRANSFER",
  "OFF_RAMP_PAYOUT",
] as const);
export type PinnedCorridorLegKind = (typeof PINNED_CORRIDOR_LEG_SKELETON)[number];

/**
 * VALUE PIN — authority: ADR-0016 D6 (the partial-failure law's terms) +
 * the host effect-outcome vocabulary (payments/contracts.ts
 * `PAYMENT_EFFECT_OUTCOMES`, pinned byte-identically, never imported).
 * A corridor leg's dispatch outcome: CONFIRMED (the only outcome a
 * later leg may follow), UNKNOWN (the mission goes OUTCOME_UNKNOWN with
 * the per-leg attempt pending reconciliation), FAILED (the mission
 * stays open; the chain stops honestly).
 */
export const PINNED_CORRIDOR_LEG_OUTCOMES = Object.freeze(["CONFIRMED", "UNKNOWN", "FAILED"] as const);
export type PinnedCorridorLegOutcome = (typeof PINNED_CORRIDOR_LEG_OUTCOMES)[number];

/**
 * VALUE PIN — the corridor shape id (authority: @payswap/route-compiler
 * src/shapes.ts `ROUTE_SHAPE_IDS` member, mirrored here so the corridor
 * laws never import the authority — the P21 pin precedent).
 */
export const PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID = "cross-provider-corridor" as const;
