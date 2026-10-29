/**
 * PaySwap Desktop (P22-H, ADR-0016 D2/D9) — the ONCHAIN RAIL pins: the
 * Stellar testnet plane's host-side value vocabulary.
 *
 * LAYER LAW (the provider-pins precedent): the host never imports
 * @payswap/* — every literal here is a VALUE PIN of an authority that
 * lives in a sibling package, mirrored byte-identically and verified by
 * the mirror battery (test/payswap/corridor-pin-mirrors.test.ts):
 * - the chain key + the StrKey patterns mirror
 *   @payswap/onchain-domain src/family-extensions-stellar.ts;
 * - the corridor literals (the relay rail, the funding/payout methods,
 *   the leg skeleton, the shape id, the direction classes, the hop
 *   bound) mirror @payswap/route-planning src/pins/corridor.ts —
 *   ADR-0016's frozen appendix (the cross-lane pin contract).
 *
 * THE PSP SEPARATION (ADR-0008 D5, preserved): the Stellar rail is NOT
 * a payment provider — it never joins PAYSWAP_PROBE_PROVIDER_IDS, never
 * joins PINNED_PAYMENT_PROVIDER_REGISTRY, never gains a PSP bridge
 * entry. Its connection rides the PROVIDERLESS_RAIL form; its chain
 * derives from the onchain plane's own four-layer hierarchy.
 */

// ---------------------------------------------------------------------------
// The chain-key + address-shape pins (mirror onchain-domain)
// ---------------------------------------------------------------------------

/** VALUE PIN — authority: onchain-domain family-extensions-stellar + the ADR-0016 appendix. */
export const PINNED_STELLAR_CHAIN_KEY = "stellar:testnet" as const;

/** VALUE PIN — the StrKey account shape (G… public keys; base32, 56 chars). */
export const PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;

/** VALUE PIN — the StrKey secret shape (S… signing keys; base32, 56 chars). */
export const PINNED_STELLAR_STRKEY_SECRET_PATTERN = /^S[A-Z2-7]{55}$/;

/** VALUE PIN — the StrKey contract shape (C… contract ids; base32, 56 chars). */
export const PINNED_STELLAR_STRKEY_CONTRACT_PATTERN = /^C[A-Z2-7]{55}$/;

// ---------------------------------------------------------------------------
// The corridor pins (mirror route-planning pins/corridor.ts — the frozen
// ADR-0016 appendix; the composite dispatch + the chain derivation code
// against these literals, never the corridor packages themselves)
// ---------------------------------------------------------------------------

/** VALUE PIN — authority: route-planning pins/corridor.ts PINNED_STELLAR_CHAIN_KEY. */
export const PINNED_CORRIDOR_STELLAR_CHAIN_KEY = "stellar:testnet" as const;

/** VALUE PIN — authority: route-planning pins/corridor.ts PINNED_CORRIDOR_RELAY_RAIL. */
export const PINNED_CORRIDOR_RELAY_RAIL = Object.freeze({
  railKind: "ONCHAIN",
  railKey: "stellar:testnet",
} as const);

/** VALUE PIN — authority: route-planning pins/corridor.ts (the GHS on-ramp method). */
export const PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD = "flutterwave_ghs_mobile_money" as const;

/** VALUE PIN — authority: route-planning pins/corridor.ts (the KES off-ramp method). */
export const PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD = "paystack_kes_bank_transfer" as const;

/** VALUE PIN — authority: route-planning pins/corridor.ts (the four-leg skeleton). */
export const PINNED_CORRIDOR_LEG_SKELETON = Object.freeze([
  "FIAT_PSP_COLLECT",
  "PSP_STABLECOIN_ISSUANCE",
  "ONCHAIN_TRANSFER",
  "OFF_RAMP_PAYOUT",
] as const);
export type PinnedCorridorLegKind = (typeof PINNED_CORRIDOR_LEG_SKELETON)[number];

/** VALUE PIN — authority: route-planning pins/corridor.ts (the corridor shape id). */
export const PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID = "cross-provider-corridor" as const;

/** VALUE PIN — authority: route-planning pins/corridor.ts (the corridor direction classes). */
export const PINNED_CORRIDOR_DIRECTION_CLASSES = Object.freeze(["MOVE", "CONVERT"] as const);

/** VALUE PIN — authority: route-planning pins/corridor.ts (PAY stays max-hops-1). */
export const PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1 as const;

/** VALUE PIN — the corridor's leg outcomes (the custody-continuity law's terms). */
export const PINNED_CORRIDOR_LEG_OUTCOMES = Object.freeze(["CONFIRMED", "UNKNOWN", "FAILED"] as const);
export type PinnedCorridorLegOutcome = (typeof PINNED_CORRIDOR_LEG_OUTCOMES)[number];

/** VALUE PIN — the deployment evidence record's field names (onchain-domain pins-deployment). */
export const PINNED_CONTRACT_DEPLOYMENT_EVIDENCE_FIELDS = Object.freeze([
  "txHash",
  "contractId",
  "sourceHash",
  "bytecodeHash",
] as const);

/** VALUE PIN — the onchain operation kinds the host may dispatch (onchain-domain operations). */
export const PINNED_ONCHAIN_OPERATION_KINDS = Object.freeze([
  "onchain.transfer",
  "onchain.contract_deploy",
] as const);

// ---------------------------------------------------------------------------
// The rail connection form (the PROVIDERLESS_RAIL growth)
// ---------------------------------------------------------------------------

/** The onchain-rail connection form declaration (the seed gate's second catalogue). */
export interface PinnedOnchainRailConnectionForm {
  readonly providerId: typeof PINNED_STELLAR_CHAIN_KEY;
  readonly useCaseRef: string;
  readonly form: "PROVIDERLESS_RAIL";
  readonly status: "CONFIGURED";
  readonly missingOperatorConfiguration: readonly string[];
  readonly authMechanism: string;
  readonly credentialKind: "PROVIDER_DEFINED";
  readonly executionModes: readonly ["SANDBOX"];
  readonly summary: string;
}

/**
 * The declared onchain-rail connection forms (fail-closed catalogue —
 * an unknown (providerId, useCaseRef) pair derives NO form, exactly the
 * PSP registry law). P22-H registers exactly ONE: the Stellar testnet
 * keypair wallet.
 */
export const PINNED_ONCHAIN_RAIL_CONNECTION_FORMS: readonly PinnedOnchainRailConnectionForm[] =
  Object.freeze([
    Object.freeze({
      providerId: PINNED_STELLAR_CHAIN_KEY,
      useCaseRef: "testnet-keypair-wallet",
      form: "PROVIDERLESS_RAIL" as const,
      status: "CONFIGURED" as const,
      missingOperatorConfiguration: Object.freeze([]),
      authMechanism: "keypair-host-broker",
      credentialKind: "PROVIDER_DEFINED" as const,
      executionModes: Object.freeze(["SANDBOX"] as const),
      summary:
        "Connect your own Stellar testnet wallet with a keypair (a G… public key + an S… secret key). Both halves are entered in a host-side secret field once, sealed immediately as ONE material, and verified by a read-only Horizon account read. The connection declares the network (stellar:testnet); a pubnet-shaped target is never offered (INV-25).",
    }),
  ]);

// ---------------------------------------------------------------------------
// The Horizon testnet surface (the transport pins)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — the Horizon TESTNET base URL. The pubnet URL NEVER appears
 * in this deployment (ADR-0016 D2: `stellar:pubnet` is deliberately not
 * registered; a pubnet wave is a future operator order, INV-25).
 */
export const STELLAR_HORIZON_TESTNET_BASE_URL = "https://horizon-testnet.stellar.org" as const;

/** The Stellar host-transport operation ids (the evidence surface). */
export const STELLAR_HOST_OPERATION_IDS = [
  "stellar.account.read",
  "stellar.transaction.read",
  "stellar.operations.read",
  "stellar.transaction.submit",
] as const;
export type StellarHostOperationId = (typeof STELLAR_HOST_OPERATION_IDS)[number];

/** The issuer-scoped asset-ref builder (mirror of the canonical assetId format). */
export function pinnedStellarAssetRef(code: string, issuerG: string): string {
  return `${PINNED_STELLAR_CHAIN_KEY}/asset:${code}:${issuerG}`;
}
