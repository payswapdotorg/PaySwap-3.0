/**
 * @payswap/onchain-adapters — well-known Stellar network identities (P22-A,
 * lane 3-a; ADR-0016 D2).
 *
 * PUBLIC constants — never secrets. The network passphrase is the PUBLIC
 * chain-identity string Stellar itself defines (the prepare-stage
 * cross-check — the numeric-chain-id / genesis-hash precedent of the other
 * families). `stellar:pubnet` is deliberately NOT declared here: the
 * environment registry (../environment.ts) registers `stellar:testnet`
 * ONLY, and the identities table follows the registry exactly.
 */

import type { EndpointProfile } from '../transport.ts';

/**
 * Well-known Stellar network passphrases per chainKey (the PUBLIC
 * chain-identity cross-check at prepare). Membership follows the frozen
 * chain-environment registry exactly — the pubnet passphrase is NOT
 * declared (an unregistered chain cannot construct an adapter).
 */
export const STELLAR_NETWORK_PASSPHRASES: Readonly<Record<string, string>> =
  Object.freeze({
    // PUBLIC: the Stellar testnet network passphrase (SDF-defined constant).
    'stellar:testnet': 'Test SDF Network ; September 2015',
  });

/**
 * PUBLIC endpoint profiles for the Stellar TESTNET Horizon REST API
 * (testnet-class; the endpoint-diversity law exempts testnets — the SDF
 * Horizon testnet is the canonical public instance).
 */
export const STELLAR_TESTNET_PUBLIC_ENDPOINTS: readonly EndpointProfile[] =
  Object.freeze([
    {
      endpointId: 'stellar-testnet-horizon-sdf',
      providerName: 'Stellar Development Foundation',
      url: 'https://horizon-testnet.stellar.org',
      protocol: 'REST',
      chainKey: 'stellar:testnet',
    },
  ]);
