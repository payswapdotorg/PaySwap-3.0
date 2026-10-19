/**
 * @payswap/opportunities — the pinned wire shapes of the onchain domain
 * (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/onchain-domain (P4-W1, lane R2-W1 — the chain/asset/
 * protocol vocabulary authority). This package GENERALIZES the chain law
 * to rails (a FinancialOpportunity is observed ON A RAIL: an onchain
 * chain, a fiat payment scheme or an FX venue corridor), and the
 * generalization is deliberately built ON TOP of the authority's
 * canonical identity law, never beside it:
 * - a rail key is the authority's canonical `${namespace}:${network}`
 *   shape (ethereum:mainnet, fiat:sepa, fx:eur-usd are all valid keys
 *   under the SAME pattern — the namespaces differ, the law does not);
 * - an ONCHAIN-kind rail key must be a canonical chain key in the
 *   authority's vocabulary (a chain is a settlement-rail family member,
 *   INV-17);
 * - a capital asset ref is the authority's canonical
 *   `${railKey}/asset:${SYMBOL}` identity (the asset-ref law, generalized
 *   from `${chainKey}/asset:` verbatim);
 * - the asset symbol pattern is the authority's SYMBOL_PATTERN
 *   byte-identical.
 *
 * VALUE pins here (pattern constants) are pinned byte-identical to the
 * authority; cross-lane consistency is asserted by test/pins.test.ts.
 */

/**
 * VALUE PIN — authority: @payswap/onchain-domain src/family.ts
 * `CHAIN_KEY_PATTERN` = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/.
 * Re-declared here as the RAIL KEY law: every rail (onchain chain, fiat
 * scheme, FX corridor) carries the same canonical
 * `${namespace}:${network}` identity. Byte-identical pattern.
 */
export const PINNED_RAIL_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

/**
 * VALUE PIN — authority: @payswap/onchain-domain src/asset.ts
 * `canonicalAssetRef(chainKey, symbol)` = `${chainKey}/asset:${symbol}`.
 * Deterministic asset identity per rail — generalized from chain keys to
 * rail keys verbatim (the authority's function, re-declared locally as a
 * value law; a value import would be a runtime dependency).
 */
export function pinnedCanonicalAssetRef(railKey: string, symbol: string): string {
  return `${railKey}/asset:${symbol}`;
}

/**
 * VALUE PIN — authority: @payswap/onchain-domain src/asset.ts
 * `SYMBOL_PATTERN` = /^[A-Z0-9][A-Z0-9._-]{0,31}$/. The canonical asset
 * symbol format (uppercase-led, 1..32 chars, digits/dots/hyphens/
 * underscores). Byte-identical.
 */
export const PINNED_ASSET_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

/**
 * VALUE PIN — authority: @payswap/onchain-domain src/family.ts
 * `isValidChainKey` (the pattern predicate). Pinned behaviour-identical;
 * applied to RAIL keys generally and asserted for ONCHAIN-kind rails.
 */
export function pinnedIsValidRailKey(value: unknown): value is string {
  return typeof value === "string" && PINNED_RAIL_KEY_PATTERN.test(value);
}

/**
 * VALUE PIN — authority: @payswap/onchain-domain src/asset.ts
 * `MINOR_UNIT_PATTERN` (the exact non-negative integer minor-unit format,
 * no leading zeros except "0"). Byte-identical; the exact-money law
 * (INV-F01 in the old numbering, exact integer minor units everywhere).
 */
export const PINNED_MINOR_UNIT_PATTERN = /^(0|[1-9][0-9]*)$/;

/**
 * STRUCTURAL PIN — authority: @payswap/onchain-domain src/chain.ts
 * `ChainDefinition` (SUBSET, nominal only): a chain is an OBSERVATION
 * SURFACE — a descriptive catalogue entry that carries NO authorization
 * scope of any kind (the authority's executable:false law). The
 * opportunities package requires only this law, restated structurally:
 * an opportunity observed on an ONCHAIN-kind rail references a chain
 * catalogue identity (railKey) and never an execution scope.
 */
export interface PinnedChainObservationSurface {
  /** Canonical chain key = the rail key of an ONCHAIN-kind rail. */
  readonly chainKey: string;
  /** The authority's non-executable discriminator law, restated. */
  readonly executable: false;
}
