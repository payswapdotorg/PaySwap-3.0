/**
 * @payswap/onchain-adapters — well-known Bitcoin chain identities + the
 * declared mempool policy (Work Order P4-W3, lane R2-W3; PORT of
 * payswap.org@8a735bf packages/onchain-adapters/src/utxo/index.ts identity
 * constants).
 *
 * PUBLIC constants — never secrets. Genesis-hash provenance: observed from
 * the public explorer APIs during the old P4-W2-001 development
 * (2026-10-03); the mainnet genesis hash is the historically famous
 * constant.
 */

import type { EndpointProfile } from '../transport.ts';

/**
 * Well-known Bitcoin genesis block hashes per chainKey (structural chain
 * identity for the prepare-stage cross-check).
 */
export const BITCOIN_GENESIS_HASHES: Readonly<Record<string, string>> = Object.freeze({
  'bitcoin:mainnet': '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
  'bitcoin:testnet': '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
});

/**
 * PUBLIC production endpoint profiles for Bitcoin mainnet (Esplora-style
 * REST; provider diversity: Blockstream + mempool.emzy.de — no single
 * vendor). Read-only observation; broadcast POST is composition-root work.
 */
export const BITCOIN_MAINNET_PUBLIC_ENDPOINTS: readonly EndpointProfile[] = Object.freeze([
  {
    endpointId: 'bitcoin-mainnet-blockstream',
    providerName: 'Blockstream',
    url: 'https://blockstream.info/api',
    protocol: 'REST',
    chainKey: 'bitcoin:mainnet',
  },
  {
    endpointId: 'bitcoin-mainnet-emzy',
    providerName: 'mempool.emzy.de',
    url: 'https://mempool.emzy.de/api',
    protocol: 'REST',
    chainKey: 'bitcoin:mainnet',
  },
]);

/** PUBLIC testnet endpoint profiles (Blockstream testnet esplora). */
export const BITCOIN_TESTNET_PUBLIC_ENDPOINTS: readonly EndpointProfile[] = Object.freeze([
  {
    endpointId: 'bitcoin-testnet-blockstream',
    providerName: 'Blockstream',
    url: 'https://blockstream.info/testnet/api',
    protocol: 'REST',
    chainKey: 'bitcoin:testnet',
  },
]);

/**
 * The declared Bitcoin mempool policy (explicit, provenanced — never
 * observed, never assumed): BIP-125 opt-in RBF and CPFP are documented
 * Bitcoin Core relay/mempool policies.
 */
export const BITCOIN_MEMPOOL_POLICY: Readonly<{
  replacement: 'BIP125_OPT_IN';
  cpfp: 'SUPPORTED';
  declaredBy: string;
}> = Object.freeze({
  replacement: 'BIP125_OPT_IN',
  cpfp: 'SUPPORTED',
  declaredBy:
    'BIP-125 (Opt-in Full Replace-by-Fee Signaling) + Bitcoin Core mempool policy documentation',
});
