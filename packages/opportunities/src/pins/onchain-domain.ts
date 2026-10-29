/**
 * @payswap/opportunities — the pinned wire shapes of the onchain domain
 * (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/onchain-domain (P4-W1 — the chain/asset/protocol
 * vocabulary authority). This package GENERALIZES the chain law to rails
 * (ON A RAIL: an onchain chain, a fiat payment scheme, an FX corridor)
 * ON TOP of the authority's canonical identity law, never beside it: a
 * rail key is the authority's `${namespace}:${network}` shape
 * (ethereum:mainnet, fiat:sepa, fx:eur-usd — same pattern, different
 * namespaces); an ONCHAIN-kind rail key is a canonical chain key (INV-17);
 * a capital asset ref is the authority's `${railKey}/asset:${SYMBOL}`
 * identity; the symbol pattern is byte-identical. VALUE pins asserted by
 * test/pins.test.ts.
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
 * VALUE PIN — authority: ADR-0016 D3 + the frozen appendix (P22-C): the
 * Stellar account StrKey shape (the issuer scope of an issuer-scoped
 * asset — `G…`, 56 base32 characters). The A-lane pins the same literal
 * independently (the ADR-0015 appendix discipline — never imported).
 */
export const PINNED_STELLAR_ISSUER_STRKEY_PATTERN = /^G[A-Z2-7]{55}$/;

/**
 * VALUE PIN — authority: ADR-0016 D3 + the frozen appendix (P22-C): the
 * ISSUER-SCOPED capital asset ref on a rail —
 * `${railKey}/asset:<CODE>:<ISSUER_G>` (e.g.
 * `stellar:testnet/asset:USDC:GBBD…`): the asset code is the authority's
 * symbol pattern and the issuer scope is the Stellar account StrKey shape
 * (two issuers of the same code are two assets — the collision law). The
 * two-segment `${railKey}/asset:${SYMBOL}` form stays byte-identical (the
 * authority's canonical identity); this admits the corridor's
 * issuer-scoped USDC as a capital asset honestly, never a new namespace.
 */
export function pinnedIsValidCapitalAssetRef(
  railKey: string,
  assetRef: unknown,
): assetRef is string {
  if (typeof assetRef !== "string") return false;
  const prefix = `${railKey}/asset:`;
  if (!assetRef.startsWith(prefix)) return false;
  const remainder = assetRef.substring(prefix.length);
  if (PINNED_ASSET_SYMBOL_PATTERN.test(remainder)) return true;
  const colonAt = remainder.indexOf(":");
  if (colonAt === -1) return false;
  const code = remainder.substring(0, colonAt);
  const issuer = remainder.substring(colonAt + 1);
  return (
    PINNED_ASSET_SYMBOL_PATTERN.test(code) &&
    PINNED_STELLAR_ISSUER_STRKEY_PATTERN.test(issuer)
  );
}

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
