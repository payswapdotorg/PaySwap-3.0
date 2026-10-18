/**
 * @payswap/route-compiler — the route-leg kind vocabulary (P5-W1).
 *
 * PORT of the old compiler's leg families, re-homed provider-NEUTRALLY:
 * the old STRIPE_CRYPTO_SETTLEMENT kind is the merchant-settlement family
 * (the provider-verified merchant balance settlement — the honest
 * awaiting-authority marker names the merchant lane, never the provider).
 * The vocabulary is CLOSED and frozen: a leg kind outside this list is
 * structurally unrepresentable (hidden custody, hidden rails and unknown
 * leg classes are rejected by the validators).
 */

export const FIAT_LEG_KINDS = Object.freeze([
  "FIAT_PSP_COLLECT",
  "PSP_STABLECOIN_ISSUANCE",
  "OFF_RAMP_PAYOUT",
  "BANK_SETTLEMENT",
] as const);

export const ONCHAIN_LEG_KINDS = Object.freeze([
  "ONCHAIN_DEX_SWAP",
  "ONCHAIN_TRANSFER",
  "ONCHAIN_BRIDGE",
] as const);

export const MERCHANT_LEG_KINDS = Object.freeze([
  "MERCHANT_BALANCE_SETTLEMENT",
] as const);

/** The closed route-leg kind vocabulary (8 kinds, frozen). */
export const ROUTE_LEG_KINDS = Object.freeze([
  ...FIAT_LEG_KINDS,
  ...ONCHAIN_LEG_KINDS,
  ...MERCHANT_LEG_KINDS,
] as const);

export type FiatLegKind = (typeof FIAT_LEG_KINDS)[number];
export type OnchainLegKind = (typeof ONCHAIN_LEG_KINDS)[number];
export type MerchantLegKind = (typeof MERCHANT_LEG_KINDS)[number];
export type RouteLegKind = (typeof ROUTE_LEG_KINDS)[number];

/** True iff the value is a member of the closed vocabulary. */
export function isRouteLegKind(value: unknown): value is RouteLegKind {
  return typeof value === "string" && (ROUTE_LEG_KINDS as readonly unknown[]).includes(value);
}

/** The rail family each leg kind operates on (advisory projection). */
export function legKindRailFamily(legKind: RouteLegKind): "FIAT" | "ONCHAIN" | "MERCHANT" {
  if ((FIAT_LEG_KINDS as readonly unknown[]).includes(legKind)) {
    return "FIAT";
  }
  if ((ONCHAIN_LEG_KINDS as readonly unknown[]).includes(legKind)) {
    return "ONCHAIN";
  }
  return "MERCHANT";
}
