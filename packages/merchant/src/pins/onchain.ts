/**
 * @payswap/merchant — the PINNED WIRE SHAPES of the onchain identity
 * vocabulary (P5-W3, lane R3-W3; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports (the v1 leaf-in-flight law). Every
 * mirror below names its AUTHORITY — the onchain-security kernel's
 * chain/asset identity validators (old packages/onchain-security @
 * 8a735bf, W1-002; the accepted R2-W2 kernel on 3.0 main). The
 * merchant-crypto CryptoAssetId/ChainId ids are OPAQUE to this package
 * (the onchain domain owns their semantics); the RAIL BINDING carries
 * BOTH vocabularies and each side is validated by ITS OWN owner's law.
 *
 * Pins in this module (authority: the onchain-security kernel):
 * - PinnedChainRef + `pinnedChainRefIsShaped` (`<network>:<segment>`)
 * - PinnedAssetIdentity + `pinnedAssetIdentityIsShaped`
 *   (the 3-letter-symbol law on the bound chain)
 */

// ---------------------------------------------------------------------------
// Chain references (authority: the onchain-security kernel)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: the onchain-security kernel's `ChainRef`
 * — a structural chain reference of the exact shape
 * `<network>:<segment>` (both segments non-empty, no surrounding
 * whitespace, no second colon).
 */
export type PinnedChainRef = string;

/** The pinned separator law of the kernel's ChainRef shape. */
export const PINNED_CHAIN_REF_SEPARATOR = ":" as const;

/**
 * The pinned SHAPE LAW (authority: the kernel's `validateChainRef`):
 * exactly one separator, non-empty network and segment, no surrounding
 * whitespace. Pure predicate — the throwing validator is the kernel's
 * own; src/rail-bindings.ts re-implements the law locally.
 */
export function pinnedChainRefIsShaped(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (value.trim() !== value) {
    return false;
  }
  const first = value.indexOf(PINNED_CHAIN_REF_SEPARATOR);
  if (first <= 0 || first !== value.lastIndexOf(PINNED_CHAIN_REF_SEPARATOR)) {
    return false;
  }
  const network = value.slice(0, first);
  const segment = value.slice(first + 1);
  return network.length > 0 && segment.length > 0;
}

// ---------------------------------------------------------------------------
// Asset identities (the 3-letter-symbol law)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: the onchain-security kernel's
 * `AssetIdentity` — an asset identity ON one chain: a 2..8 uppercase
 * A-Z symbol (the kernel's 3-letter-symbol family) with the kernel-side
 * chain reference and the opaque asset id of that chain.
 */
export interface PinnedAssetIdentity {
  /** 2..8 uppercase A-Z/0-9 symbol on the bound chain. */
  readonly symbol: string;
  /** The kernel-side chain reference this asset lives on. */
  readonly chain: PinnedChainRef;
  /** Opaque per-chain asset id (never interpreted here). */
  readonly assetId: string;
}

/**
 * The pinned SHAPE LAW (authority: the kernel's
 * `validateAssetIdentity`): the symbol matches `^[A-Z0-9]{2,8}$`, the
 * chain passes the chain-ref shape law and the assetId is a non-empty
 * string. Pure predicate.
 */
export function pinnedAssetIdentityIsShaped(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PinnedAssetIdentity>;
  if (typeof record.symbol !== "string" || !/^[A-Z0-9]{2,8}$/.test(record.symbol)) {
    return false;
  }
  if (!pinnedChainRefIsShaped(record.chain)) {
    return false;
  }
  return typeof record.assetId === "string" && record.assetId.length > 0;
}
