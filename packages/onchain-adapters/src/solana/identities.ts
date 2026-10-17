/**
 * @payswap/onchain-adapters — well-known Solana cluster identities (Work
 * Order P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/solana/index.ts identity constants).
 *
 * PUBLIC constants — never secrets. Genesis-hash provenance: observed from
 * the public cluster RPCs during the old P4-W2-001 development
 * (2026-10-03), carried unchanged.
 */

import type { EndpointProfile } from '../transport.ts';

/**
 * Well-known Solana genesis hashes per chainKey (cluster identity — the
 * prepare-stage cross-check).
 */
export const SOLANA_GENESIS_HASHES: Readonly<Record<string, string>> = Object.freeze({
  // PUBLIC: well-known cluster genesis hashes (observed from the public cluster RPCs).
  'solana:mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  'solana:devnet': 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', // PUBLIC
});

/**
 * PUBLIC production endpoint profiles for Solana mainnet-beta (provider
 * diversity: Solana Labs + PublicNode — no single vendor). Read-only.
 */
export const SOLANA_MAINNET_PUBLIC_ENDPOINTS: readonly EndpointProfile[] = Object.freeze([
  {
    endpointId: 'solana-mainnet-labs',
    providerName: 'Solana Labs',
    url: 'https://api.mainnet-beta.solana.com',
    protocol: 'JSON_RPC',
    chainKey: 'solana:mainnet-beta',
  },
  {
    endpointId: 'solana-mainnet-publicnode',
    providerName: 'PublicNode',
    url: 'https://solana-rpc.publicnode.com',
    protocol: 'JSON_RPC',
    chainKey: 'solana:mainnet-beta',
  },
]);

/** PUBLIC devnet endpoint profiles (testnet-class; diversity exempt). */
export const SOLANA_DEVNET_PUBLIC_ENDPOINTS: readonly EndpointProfile[] = Object.freeze([
  {
    endpointId: 'solana-devnet-labs',
    providerName: 'Solana Labs',
    url: 'https://api.devnet.solana.com',
    protocol: 'JSON_RPC',
    chainKey: 'solana:devnet',
  },
]);
