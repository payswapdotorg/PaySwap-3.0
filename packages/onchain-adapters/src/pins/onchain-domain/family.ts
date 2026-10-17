/**
 * STRUCTURAL PIN — the onchain-domain chain-family vocabulary (Work Order
 * P4-W3, lane R2-W3).
 *
 * LAYER LAW: this package is layer `rails` and — for THIS wave — is kept
 * deliberately dependency-free (the accepted leaf-in-flight pattern of
 * @payswap/provider-runtime): the canonical @payswap/onchain-domain package
 * (Work Order P4-W1, in flight under the pairwise-disjoint law) owns these
 * contracts; the shapes below are LOCAL STRUCTURAL MIRRORS of the old-repo
 * reference (payswap.org@8a735bf packages/onchain-domain/src/family.ts),
 * pinned so this package's hermetic battery can construct and validate
 * them offline. The TL wires the type at integration (structural
 * compatibility by construction — same field names, same literals).
 */

export const CHAIN_FAMILIES = [
  'EVM',
  'SOLANA',
  'UTXO',
  'MOVE',
  'COSMOS',
  'SUBSTRATE',
  'OTHER',
] as const;

export type ChainFamily = (typeof CHAIN_FAMILIES)[number];

export function isChainFamily(value: unknown): value is ChainFamily {
  return (
    typeof value === 'string' && (CHAIN_FAMILIES as readonly unknown[]).includes(value)
  );
}

/** Neutral finality model of a chain family (guidance default only). */
export type ChainFinalityModel =
  | 'PROBABILISTIC'
  | 'DETERMINISTIC'
  | 'INSTANT'
  | 'HYBRID';

/**
 * Canonical chain key format: `${namespace}:${network}` (both lowercase
 * alphanumeric-with-hyphens), e.g. `ethereum:mainnet`, `solana:mainnet-beta`,
 * `bitcoin:mainnet`. The chain key is the NEUTRAL chain identity used by
 * every pinned onchain-domain contract.
 */
export const CHAIN_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

export function isValidChainKey(value: unknown): value is string {
  return typeof value === 'string' && CHAIN_KEY_PATTERN.test(value);
}
