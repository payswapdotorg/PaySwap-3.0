import { describe, expect, it } from 'vitest';
import {
  CHAIN_ENVIRONMENT_REGISTRY,
  assertEnvironmentClass,
  classifyChainEnvironment,
  isRailEnvironmentClass,
  productionEnvironment,
  railEnvironment,
} from '../src/environment.ts';
import { TestnetNeverProductionError, ValidationError } from '../src/errors.ts';
import { adapterSettlementEnvelope } from '../src/settlement-gate.ts';
import { assertEndpointProviderDiversity } from '../src/transport.ts';
import { fakeEndpoint } from './fixtures/scripted-transport.ts';
import { BITCOIN_CHAIN, CHAIN, SOLANA_CHAIN, NOW_ISO, SOLANA_ASSET_ID } from './fixtures/world.ts';
import { ETHEREUM_MAINNET_PUBLIC_ENDPOINTS } from '../src/evm/identities.ts';
import { SOLANA_MAINNET_PUBLIC_ENDPOINTS } from '../src/solana/identities.ts';
import { BITCOIN_MAINNET_PUBLIC_ENDPOINTS } from '../src/utxo/identities.ts';
import { evmAdapter, solanaAdapter, utxoAdapter } from './fixtures/adapters.ts';

/**
 * The STRUCTURAL environment/rail discriminator (ported from
 * payswap.org@8a735bf test/environment.test.ts — chain identity IS the
 * environment; testnet/simulation can never be production financial
 * execution).
 */
describe('the structural environment/rail discriminator', () => {
  it('chain identity classifies the environment (frozen registry)', () => {
    expect(classifyChainEnvironment('ethereum:mainnet')).toBe('PRODUCTION');
    expect(classifyChainEnvironment('ethereum:sepolia')).toBe('TESTNET');
    expect(classifyChainEnvironment('solana:mainnet-beta')).toBe('PRODUCTION');
    expect(classifyChainEnvironment('solana:devnet')).toBe('TESTNET');
    expect(classifyChainEnvironment('bitcoin:mainnet')).toBe('PRODUCTION');
    expect(classifyChainEnvironment('bitcoin:regtest')).toBe('REGTEST');
    expect(isRailEnvironmentClass('PRODUCTION')).toBe(true);
    expect(isRailEnvironmentClass('STAGING')).toBe(false);
  });

  it('an unknown chainKey classifies FAIL CLOSED (never guessed)', () => {
    expect(() => classifyChainEnvironment('ethereum:fakenet')).toThrow(ValidationError);
    expect(() => classifyChainEnvironment('not-a-chain')).toThrow(ValidationError);
  });

  it('the environment token DERIVES from the chain identity', () => {
    const environment = railEnvironment('ethereum:mainnet');
    expect(environment.chainKey).toBe('ethereum:mainnet');
    expect(environment.environmentClass).toBe('PRODUCTION');
    expect(environment.declaredBy).toContain('CHAIN_ENVIRONMENT_REGISTRY');
  });

  it('runtime re-derivation rejects forged environment classes (defense in depth)', () => {
    expect(() => assertEnvironmentClass('ethereum:sepolia', 'PRODUCTION')).toThrow(ValidationError);
    expect(() => assertEnvironmentClass('ethereum:mainnet', 'TESTNET')).toThrow(ValidationError);
    expect(() => assertEnvironmentClass('bitcoin:mainnet', 'PRODUCTION')).not.toThrow();
  });

  it('a testnet adapter CANNOT produce a production settlement envelope', () => {
    expect(() =>
      adapterSettlementEnvelope({
        adapterId: 'adapter:evm:testnet',
        chainKey: 'ethereum:sepolia',
        environmentClass: 'TESTNET',
      }),
    ).toThrow(TestnetNeverProductionError);
    expect(() =>
      adapterSettlementEnvelope({
        adapterId: 'adapter:evm:mainnet',
        chainKey: 'ethereum:mainnet',
        environmentClass: 'PRODUCTION',
      }),
    ).not.toThrow();
    // A FORGED class string cannot pass: the class re-derives from identity.
    expect(() =>
      adapterSettlementEnvelope({
        adapterId: 'adapter:evm:forged',
        chainKey: 'ethereum:sepolia',
        environmentClass: 'PRODUCTION',
      }),
    ).toThrow(TestnetNeverProductionError);
  });

  it('testnet observations never reach production settlement machinery (type + runtime)', () => {
    // The production-branded token is unconstructible for a testnet chain.
    expect(() => productionEnvironment('solana:devnet')).toThrow(TestnetNeverProductionError);
    expect(productionEnvironment('solana:mainnet-beta').environmentClass).toBe('PRODUCTION');
  });

  it('the registry is frozen and covers every chain the adapters serve', () => {
    expect(Object.isFrozen(CHAIN_ENVIRONMENT_REGISTRY)).toBe(true);
    for (const chainKey of [CHAIN, SOLANA_CHAIN, BITCOIN_CHAIN]) {
      expect(CHAIN_ENVIRONMENT_REGISTRY[chainKey]).toBeDefined();
    }
  });

  it('public endpoint profiles carry chain-scoped environment declarations', () => {
    for (const profile of [
      ...ETHEREUM_MAINNET_PUBLIC_ENDPOINTS,
      ...SOLANA_MAINNET_PUBLIC_ENDPOINTS,
      ...BITCOIN_MAINNET_PUBLIC_ENDPOINTS,
    ]) {
      expect(classifyChainEnvironment(profile.chainKey)).toBe('PRODUCTION');
    }
  });

  it('a PRODUCTION transport requires endpoints from >= 2 DISTINCT providers', () => {
    const single = [fakeEndpoint({ endpointId: 'a', providerName: 'OnlyProvider', chainKey: CHAIN })];
    expect(() => assertEndpointProviderDiversity(single, 'PRODUCTION')).toThrow(ValidationError);
    const diverse = [
      fakeEndpoint({ endpointId: 'a', providerName: 'ProviderOne', chainKey: CHAIN }),
      fakeEndpoint({ endpointId: 'b', providerName: 'ProviderTwo', chainKey: CHAIN }),
    ];
    expect(() => assertEndpointProviderDiversity(diverse, 'PRODUCTION')).not.toThrow();
    // Non-production transports are exempt (single testnet faucets exist).
    const testnetSingle = [
      fakeEndpoint({ endpointId: 't', providerName: 'OnlyTestnet', chainKey: 'ethereum:sepolia' }),
    ];
    expect(() =>
      assertEndpointProviderDiversity(testnetSingle, 'TESTNET'),
    ).not.toThrow();
  });

  it('the PUBLIC production profiles of every family satisfy provider diversity', () => {
    expect(() =>
      assertEndpointProviderDiversity(ETHEREUM_MAINNET_PUBLIC_ENDPOINTS, 'PRODUCTION'),
    ).not.toThrow();
    expect(() =>
      assertEndpointProviderDiversity(SOLANA_MAINNET_PUBLIC_ENDPOINTS, 'PRODUCTION'),
    ).not.toThrow();
    expect(() =>
      assertEndpointProviderDiversity(BITCOIN_MAINNET_PUBLIC_ENDPOINTS, 'PRODUCTION'),
    ).not.toThrow();
  });

  it('every adapter-produced record carries its environment class', async () => {
    const adapter = evmAdapter();
    const probe = await adapter.observeChainHead({ at: NOW_ISO });
    expect(probe.kind).toBe('HEAD_OBSERVED');
    if (probe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    expect(probe.head.environmentClass).toBe('PRODUCTION');
    expect(probe.head.provenance.environmentClass).toBe('PRODUCTION');
    expect(adapter.environment.environmentClass).toBe('PRODUCTION');

    const solana = solanaAdapter();
    const solanaHead = await solana.observeChainHead({ at: NOW_ISO });
    expect(solanaHead.kind).toBe('HEAD_OBSERVED');
    if (solanaHead.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    expect(solanaHead.head.chainKey).toBe(SOLANA_CHAIN);

    const utxo = utxoAdapter();
    const utxoHead = await utxo.observeChainHead({ at: NOW_ISO });
    expect(utxoHead.kind).toBe('HEAD_OBSERVED');
    if (utxoHead.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    expect(utxoHead.head.environmentClass).toBe('PRODUCTION');

    // Every evidence entry carries the environment class too.
    for (const entry of adapter.evidence()) {
      expect(entry.environmentClass).toBe('PRODUCTION');
    }
    void SOLANA_ASSET_ID;
  });
});
