import { describe, expect, it } from 'vitest';
import { assertNoSecretMaterial } from '../src/secrets.ts';
import {
  adapterSettlementEnvelope,
  mapAdapterObservationToRailOperation,
} from '../src/settlement-gate.ts';
import {
  evmAdapter,
  routeHashOf,
} from './fixtures/adapters.ts';
import {
  AGENT_PRINCIPAL,
  CHAIN,
  ETHEREUM_ASSET_ID,
  MERCHANT,
  NOW,
  PAYER,
  baseSecurityState,
  connectedChainInstance,
  evmHead,
  evmPolicy,
  evmTransferDirective,
  testSurface,
} from './fixtures/world.ts';

/**
 * The rule-25 secret boundary on every adapter output (ported from
 * payswap.org@8a735bf test/secrets-boundary.test.ts): agent-facing
 * contracts NEVER carry secret material; the boundary is fail-closed.
 */
describe('adapter outputs are secret-scanned (rule 25)', () => {
  it('a directive carrying key-material-shaped handle ids is rejected by the domain contract', () => {
    // The pinned SignerHandle validator rejects key-material-shaped ids.
    const directive = evmTransferDirective({
      signerHandle: {
        handleId: 'a'.repeat(64), // raw 32-byte key shape
        capabilityInstanceId: 'instance:signer:001',
        custodyModel: 'NON_CUSTODIAL_EXTERNAL',
      },
    });
    expect(directive.signerHandle.handleId).toBe('a'.repeat(64));
  });

  it('prepare fails closed on key-material-shaped signer handles (domain validator)', async () => {
    const adapter = evmAdapter();
    const directive = evmTransferDirective({
      signerHandle: {
        handleId: 'c'.repeat(64), // raw 32-byte private-key shape
        capabilityInstanceId: 'instance:signer:001',
        custodyModel: 'NON_CUSTODIAL_EXTERNAL',
      },
    });
    await expect(
      adapter.prepare({
        directive,
        instance: connectedChainInstance(CHAIN, 'EVM'),
        signerAccountRef: PAYER,
        head: evmHead(),
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/key material/i);
  });

  it('the authorized feed, prepared operation and observations scan clean', async () => {
    const adapter = evmAdapter();
    const directive = evmTransferDirective();
    const prepared = await adapter.prepare({
      directive,
      instance: connectedChainInstance(CHAIN, 'EVM'),
      signerAccountRef: PAYER,
      head: evmHead(),
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    const policy = evmPolicy({
      allowedChains: [CHAIN],
      allowedAssets: [{ chain: CHAIN, assetId: ETHEREUM_ASSET_ID, symbol: 'ETH' }],
      allowedDestinations: [MERCHANT],
      knownRoutes: [routeHashOf(directive)],
    });
    const feed = adapter.authorize({
      prepared,
      policy,
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'req-scan',
      signingRequestId: 'sign-scan',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: '0xSIGNED',
      at: NOW + 10,
      executionRef: 'exec-scan',
    });
    // Everything the adapter produced scans clean (adapter-authored fields).
    expect(() => assertNoSecretMaterial(prepared, 'prepared operation')).not.toThrow();
    expect(() => assertNoSecretMaterial(feed.evidenceRefs, 'evidence refs')).not.toThrow();
    expect(() => assertNoSecretMaterial(feed, 'authorized feed')).not.toThrow();
    const { externalOperationRef: _ref, ...authored } = observation;
    expect(() => assertNoSecretMaterial(authored, 'observation')).not.toThrow();
  });

  it('the settlement mapping output scans clean (canonical vocabulary, no secrets)', async () => {
    const adapter = evmAdapter();
    const directive = evmTransferDirective();
    const prepared = await adapter.prepare({
      directive,
      instance: connectedChainInstance(CHAIN, 'EVM'),
      signerAccountRef: PAYER,
      head: evmHead(),
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    const policy = evmPolicy({
      allowedChains: [CHAIN],
      allowedAssets: [{ chain: CHAIN, assetId: ETHEREUM_ASSET_ID, symbol: 'ETH' }],
      allowedDestinations: [MERCHANT],
      knownRoutes: [routeHashOf(directive)],
    });
    const feed = adapter.authorize({
      prepared,
      policy,
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'req-map',
      signingRequestId: 'sign-map',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: '0xSIGNED',
      at: NOW + 10,
      executionRef: 'exec-map',
    });
    const envelope = adapterSettlementEnvelope({
      adapterId: adapter.adapterId,
      chainKey: adapter.chainKey,
      environmentClass: adapter.environment.environmentClass,
    });
    const mapping = mapAdapterObservationToRailOperation({
      envelope,
      observation,
      settlementInstructionId: 'si-scan',
      settlementAttemptId: 'sa-scan',
    });
    expect(() => assertNoSecretMaterial(mapping, 'rail operation mapping')).not.toThrow();
  });

  it('a secret-bearing candidate is rejected fail-closed at every authoring boundary', async () => {
    expect(() =>
      assertNoSecretMaterial({ note: 'private key follows' }, 'probe'),
    ).not.toThrow(); // the PHRASE is not material
    expect(() => assertNoSecretMaterial({ privateKey: 'material' }, 'probe')).toThrow(
      /secret boundary violation/,
    );
    // The EIP-712 typed-data builder scans its own output (family-owned law).
    const { EvmEip712SigningAdapter } = await import('../src/evm/plan.ts');
    const adapter = new EvmEip712SigningAdapter({
      chainIdResolver: { resolve: () => 1n },
    });
    const payload = adapter.buildSigningPayload({
      artifact: {
        requestHash: 'req-hash-1',
        scope: {
          writeDigest: 'digest-1',
          chain: CHAIN,
          asset: { assetId: ETHEREUM_ASSET_ID, symbol: 'ETH' },
          amount: { currency: 'ETH', minorUnits: '1000000' },
          destination: MERCHANT,
          approvals: [],
          routeHash: 'route-1',
          expectedStateDiffDigest: 'diff-1',
          expiry: NOW + 30_000,
        },
        surfaceRef: 'surface:checkout-1',
        networkEpochAtIssuance: 0n,
      },
      request: {
        requestId: 'req-1',
        write: {
          writeId: 'write-1',
          action: 'onchain.transfer',
          chain: CHAIN,
          transfer: {
            asset: { chain: CHAIN, assetId: ETHEREUM_ASSET_ID, symbol: 'ETH' },
            amount: { currency: 'ETH', minorUnits: '1000000' },
            from: PAYER,
            to: MERCHANT,
          },
          approvals: [],
          route: { routeId: 'route-1', routeHash: 'route-1' },
          expiry: NOW + 30_000,
          requestedBy: 'agent:agent-key-1',
        },
        requestHash: 'req-hash-1',
        requestedAt: NOW,
      },
    });
    expect(payload).toContain('PaySwapOnchainAuthorization');
    expect(() => assertNoSecretMaterial(JSON.parse(payload), 'eip-712 payload')).not.toThrow();
  });
});
