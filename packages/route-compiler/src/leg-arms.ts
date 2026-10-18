/**
 * @payswap/route-compiler — the leg-kind arms and custody parties (P5-W1).
 *
 * PORT+ADAPT of the old compiler's per-family leg arms (MMI-19): the
 * corridor-grounded fiat arms, the venue-lane-grounded onchain arms and
 * the deterministic custody-party builders every family compiler uses.
 * The MERCHANT arm lives in merchant-legs.ts (its own evidence laws).
 */
import type { RouteLegBase } from "./leg-contracts.ts";
import type { PinnedCorridorRouteEvaluation } from "./pins/capability.ts";
import type { OnchainLaneProof } from "./onchain-lane.ts";
import type { CustodyParty } from "./custody.ts";

/** A corridor-grounded fiat leg: the evaluation it was compiled from. */
export interface CorridorGroundedLeg extends RouteLegBase {
  /** The corridor route evaluation this leg was grounded on (verbatim). */
  readonly corridorRoute: PinnedCorridorRouteEvaluation;
}

/** A lane-grounded DEX swap leg (the proof carried verbatim). */
export interface OnchainDexSwapLeg extends RouteLegBase {
  readonly legKind: "ONCHAIN_DEX_SWAP";
  /** The REAL lane proof (engine-selected, gate-ALLOWed, observation-grounded). */
  readonly lane: OnchainLaneProof;
}

/** A write-grounded transfer or bridge leg. */
export interface OnchainWriteLeg extends RouteLegBase {
  readonly legKind: "ONCHAIN_TRANSFER" | "ONCHAIN_BRIDGE";
  /** The prepared write this leg executes (writeDigest-bound). */
  readonly write: OnchainLaneProof["write"];
  /** The gate decision over that exact write. */
  readonly gateDecision: OnchainLaneProof["gateDecision"];
  /** The bridge's arrival chain (bridge legs only — transfer legs omit). */
  readonly arrivalChainKey?: string;
}

/** The onchain-wallet custody party. */
export function onchainWalletParty(accountRef: string, chainKey?: string): CustodyParty {
  return Object.freeze({
    kind: "ONCHAIN_WALLET",
    accountRef,
    ...(chainKey !== undefined ? { chainKey } : {}),
  });
}

/** The venue/bridge protocol custody party (the `via` of onchain hops). */
export function onchainProtocolParty(protocolKey: string, chainKey: string): CustodyParty {
  return Object.freeze({ kind: "ONCHAIN_PROTOCOL", protocolKey, chainKey });
}

/** True iff a leg is one of the onchain family kinds. */
export function isOnchainLeg(leg: RouteLegBase): boolean {
  return (
    leg.legKind === "ONCHAIN_DEX_SWAP" ||
    leg.legKind === "ONCHAIN_TRANSFER" ||
    leg.legKind === "ONCHAIN_BRIDGE"
  );
}

/** True iff a leg is a write-grounded leg (transfer or bridge). */
export function isOnchainWriteLeg(leg: RouteLegBase): leg is OnchainWriteLeg {
  return leg.legKind === "ONCHAIN_TRANSFER" || leg.legKind === "ONCHAIN_BRIDGE";
}

/** The provider-pool custody party (the collect hop's pool). */
export function providerPoolParty(providerName: string): CustodyParty {
  return Object.freeze({ kind: "EXTERNAL_PROVIDER", providerName });
}

/** The stablecoin-issuer protocol custody party. */
export function stablecoinIssuerParty(symbol: string, chainKey: string): CustodyParty {
  return Object.freeze({
    kind: "ONCHAIN_PROTOCOL",
    protocolKey: `stablecoin-issuer:${symbol.toLowerCase()}`,
    chainKey,
  });
}

/** The external bank instrument custody party (the payout arrival). */
export function bankInstrumentParty(externalRef: string): CustodyParty {
  return Object.freeze({ kind: "EXTERNAL_BANK_INSTRUMENT", externalRef });
}

/** True iff a leg is one of the fiat family kinds. */
export function isFiatLeg(leg: RouteLegBase): boolean {
  return (
    leg.legKind === "FIAT_PSP_COLLECT" ||
    leg.legKind === "PSP_STABLECOIN_ISSUANCE" ||
    leg.legKind === "OFF_RAMP_PAYOUT" ||
    leg.legKind === "BANK_SETTLEMENT"
  );
}

/** True iff a leg's corridor grounding is current (fresh, eligible, observed). */
export function corridorGroundingIsCurrent(leg: CorridorGroundedLeg): boolean {
  return leg.corridorRoute.eligible && leg.corridorRoute.effectiveAvailability !== "UNAVAILABLE";
}
