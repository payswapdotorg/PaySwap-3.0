/**
 * @payswap/onchain-adapters — well-known EVM chain identities (Work Order
 * P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/evm/index.ts identity constants).
 *
 * PUBLIC constants — never secrets. The production endpoint profiles
 * express the provider-diversity law (no single vendor); they are
 * DESCRIPTIVE wiring inputs for composition roots, never auto-connected
 * (transports are contracts — zero I/O in this package).
 */

import type { EndpointProfile } from '../transport.ts';

/** Well-known EVM chain ids (canonical decimal strings). */
export const EVM_CHAIN_IDS: Readonly<Record<string, string>> = Object.freeze({
  'ethereum:mainnet': '1',
  'ethereum:sepolia': '11155111',
  'ethereum:holesky': '17000',
});

/**
 * PUBLIC production endpoint profiles for the Ethereum mainnet JSON-RPC
 * (provider diversity: PublicNode + Cloudflare — no single vendor).
 * Read-only observation; no credentials.
 */
export const ETHEREUM_MAINNET_PUBLIC_ENDPOINTS: readonly EndpointProfile[] = Object.freeze([
  {
    endpointId: 'ethereum-mainnet-publicnode',
    providerName: 'PublicNode',
    url: 'https://ethereum-rpc.publicnode.com',
    protocol: 'JSON_RPC',
    chainKey: 'ethereum:mainnet',
  },
  {
    endpointId: 'ethereum-mainnet-cloudflare',
    providerName: 'Cloudflare',
    url: 'https://cloudflare-eth.com',
    protocol: 'JSON_RPC',
    chainKey: 'ethereum:mainnet',
  },
]);

/** PUBLIC testnet (Sepolia) endpoint profiles (diversity-exempt class). */
export const ETHEREUM_SEPOLIA_PUBLIC_ENDPOINTS: readonly EndpointProfile[] = Object.freeze([
  {
    endpointId: 'ethereum-sepolia-publicnode',
    providerName: 'PublicNode',
    url: 'https://ethereum-sepolia-rpc.publicnode.com',
    protocol: 'JSON_RPC',
    chainKey: 'ethereum:sepolia',
  },
]);
