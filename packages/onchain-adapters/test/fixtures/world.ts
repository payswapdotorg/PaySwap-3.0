/**
 * The deterministic world for the onchain-adapters battery (the R2-W3 port
 * of payswap.org@8a735bf test/helpers.ts, adapted to the pinned contract
 * shapes and the injected kernel seam).
 */

import type { ChainHeadObservation } from '../../src/contract/observations.ts';
import type { ConnectedChainInstance } from '../../src/pins/onchain-domain/instance.ts';
import { chainCapabilityId } from '../../src/pins/onchain-domain/instance.ts';
import type { OnchainExecutionDirective } from '../../src/pins/onchain-domain/directive.ts';
import type { OnchainSecurityPolicy } from '../../src/pins/onchain-security/kernel-port.ts';
import type { OnchainSecurityState } from '../../src/pins/onchain-security/signing.ts';
import type { TrustedApprovalSurface } from '../../src/pins/onchain-security/kernel-port.ts';
import type { Principal } from '../../src/pins/onchain-security/principal.ts';

export const NOW = 1_776_000_000_000; // deterministic ms epoch
export const NOW_ISO = new Date(NOW).toISOString();
export const CHAIN = 'ethereum:mainnet';
export const SOLANA_CHAIN = 'solana:mainnet-beta';
export const BITCOIN_CHAIN = 'bitcoin:mainnet';
export const ETHEREUM_ASSET_ID = `${CHAIN}/asset:ETH`;
export const SOLANA_ASSET_ID = `${SOLANA_CHAIN}/asset:SOL`;
export const BITCOIN_ASSET_ID = `${BITCOIN_CHAIN}/asset:BTC`;

export const PAYER = '0x1111111111111111111111111111111111111111';
export const MERCHANT = '0x2222222222222222222222222222222222222222';
export const ROUTER = '0x3333333333333333333333333333333333333333';

export const BTC_PAYER = 'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
export const BTC_MERCHANT = 'bc1qyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';

export const AGENT_PRINCIPAL: Principal = {
  kind: 'agent',
  agentKeyFingerprint: 'agent-key-1',
  ownerRef: 'user:alice',
  bodyRef: 'body-1',
  packageVersionRef: 'pkg-1@1.0.0',
  authorityEnvelope: [],
  securityEpoch: 0n,
};

/** A deterministic trusted-surface signer double (opaque, not cryptography). */
export const TEST_SURFACE_SIGNER = {
  surfaceId: 'surface:checkout-1',
  signApprovalPayload(payload: string): string {
    let hash = 0;
    for (let i = 0; i < payload.length; i += 1) {
      hash = (hash * 31 + payload.charCodeAt(i)) | 0;
    }
    return `sig:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  },
};

export function testSurface(): TrustedApprovalSurface {
  return TEST_SURFACE_SIGNER;
}

// ---------------------------------------------------------------------------
// Chain heads + instances + directives
// ---------------------------------------------------------------------------

export function evmHead(overrides?: Partial<ChainHeadObservation>): ChainHeadObservation {
  return {
    observationKind: 'ChainHeadObservation',
    chainKey: CHAIN,
    environmentClass: 'PRODUCTION',
    height: 18_000_000,
    headHash: '0xabc0000000000000000000000000000000000000000000000000000000000f01',
    observedAt: NOW_ISO,
    provenance: {
      transportId: 'transport:scripted:evm',
      endpointId: 'evm-scripted-1',
      providerName: 'ScriptedProvider',
      capturedAt: NOW_ISO,
      adapterId: 'adapter:evm:test',
      environmentClass: 'PRODUCTION',
    },
    maxAgeSeconds: 90,
    ...overrides,
  };
}

export function connectedChainInstance(
  chainKey: string,
  family: 'EVM' | 'SOLANA' | 'UTXO',
): ConnectedChainInstance {
  return {
    instanceId: `instance:${chainKey}:001`,
    capabilityId: chainCapabilityId(chainKey),
    chainKey,
    family,
    ...(family === 'EVM' ? { familyExtension: { family: 'EVM', evmChainId: '1' } } : {}),
  };
}

/** Override entries whose value is undefined DELETE the key (fail-closed fixtures). */
function applyOverrides<T extends object>(base: T, overrides?: Record<string, unknown>): T {
  if (overrides === undefined) {
    return base;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export function evmTransferDirective(
  overrides?: Record<string, unknown>,
): OnchainExecutionDirective {
  return applyOverrides<OnchainExecutionDirective>({
    operation: 'onchain.transfer',
    chainKey: CHAIN,
    family: 'EVM',
    destination: MERCHANT,
    assetId: ETHEREUM_ASSET_ID,
    amount: { assetId: ETHEREUM_ASSET_ID, minorUnits: '1000000' },
    expiresAt: new Date(NOW + 60_000).toISOString(),
    signerHandle: {
      handleId: 'signer.handle.001',
      capabilityInstanceId: 'instance:signer:001',
      custodyModel: 'NON_CUSTODIAL_EXTERNAL',
    },
  }, overrides);
}

export function solanaTransferDirective(
  overrides?: Record<string, unknown>,
): OnchainExecutionDirective {
  return applyOverrides<OnchainExecutionDirective>({
    operation: 'onchain.transfer',
    chainKey: SOLANA_CHAIN,
    family: 'SOLANA',
    // PUBLIC: a well-known Solana mainnet-beta system account (fixture destination).
    destination: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    assetId: SOLANA_ASSET_ID,
    amount: { assetId: SOLANA_ASSET_ID, minorUnits: '5000000' },
    expiresAt: new Date(NOW + 60_000).toISOString(),
    signerHandle: {
      handleId: 'signer.handle.002',
      capabilityInstanceId: 'instance:signer:002',
      custodyModel: 'NON_CUSTODIAL_EXTERNAL',
    },
    familyPayload: { serializedTransaction: 'BASE64SERIALIZEDTX' },
  }, overrides);
}

export function utxoTransferDirective(
  overrides?: Record<string, unknown>,
): OnchainExecutionDirective {
  return applyOverrides<OnchainExecutionDirective>({
    operation: 'onchain.transfer',
    chainKey: BITCOIN_CHAIN,
    family: 'UTXO',
    destination: BTC_MERCHANT,
    assetId: BITCOIN_ASSET_ID,
    amount: { assetId: BITCOIN_ASSET_ID, minorUnits: '100000' },
    expiresAt: new Date(NOW + 60_000).toISOString(),
    signerHandle: {
      handleId: 'signer.handle.003',
      capabilityInstanceId: 'instance:signer:003',
      custodyModel: 'NON_CUSTODIAL_EXTERNAL',
    },
  }, overrides);
}

// ---------------------------------------------------------------------------
// Security-policy fixtures (the adapters feed the INJECTED kernel)
// ---------------------------------------------------------------------------

export function evmPolicy(overrides?: Partial<OnchainSecurityPolicy>): OnchainSecurityPolicy {
  return {
    policyId: 'policy-1',
    version: 1,
    forbidUnlimitedApprovals: true,
    unknownContractPolicy: 'block',
    unknownRoutePolicy: 'block',
    ...overrides,
  };
}

export function baseSecurityState(
  overrides?: Partial<OnchainSecurityState>,
): OnchainSecurityState {
  return {
    observedAt: NOW,
    networkEpoch: 0n,
    quarantinedComponents: [],
    restrictedComponents: [],
    activeAdvisoryRefs: [],
    ...overrides,
  };
}
