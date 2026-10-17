import { describe, expect, it } from 'vitest';
import {
  EVM_RECEIPT_BLOCK_HASH,
  EVM_RECEIPT_BLOCK_NUMBER,
  EVM_TX_HASH,
  evmAdapterWithTransport,
  routeHashOf,
  scriptedEvmTransport,
  scriptedSolanaTransport,
  solanaAdapter,
  SOLANA_SIGNATURE,
} from './fixtures/adapters.ts';
import { FakeSecurityKernel } from './fixtures/fake-kernel.ts';
import { SolanaChainAdapter } from '../src/solana/index.ts';
import {
  AGENT_PRINCIPAL,
  CHAIN,
  ETHEREUM_ASSET_ID,
  MERCHANT,
  NOW,
  NOW_ISO,
  PAYER,
  SOLANA_ASSET_ID,
  SOLANA_CHAIN,
  baseSecurityState,
  connectedChainInstance,
  evmHead,
  evmPolicy,
  evmTransferDirective,
  testSurface,
} from './fixtures/world.ts';

/**
 * Work-order-mandated failure/reconciliation paths, part two (ported from
 * payswap.org@8a735bf test/unknown-paths.test.ts; split to honor the
 * <=400-line file law): finalize-ambiguous → UNKNOWN; unreachable rails →
 * availability UNKNOWN (never failure); reconciliation plans (never blind
 * retry).
 */
describe('finalize-ambiguous → UNKNOWN', () => {
  it('EVM: a receipt status that is neither 0x1 nor 0x0 is UNKNOWN', async () => {
    const transport = scriptedEvmTransport({
      responses: {
        eth_getTransactionReceipt: () => ({
          status: '0x2',
          blockNumber: '0x' + EVM_RECEIPT_BLOCK_NUMBER.toString(16),
          blockHash: EVM_RECEIPT_BLOCK_HASH,
        }),
      },
    });
    const adapter = evmAdapterWithTransport(transport);
    const observation = await adapter.observeOperation({
      executionRef: 'evm-ambiguous-status',
      externalOperationRef: EVM_TX_HASH,
      at: NOW,
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toMatch(/neither success nor revert/);
    expect(observation.failure).toBeUndefined();
  });

  it('EVM: a receipt above the observed head is UNKNOWN (inconsistent provider data)', async () => {
    const transport = scriptedEvmTransport({
      responses: {
        eth_getTransactionReceipt: () => ({
          status: '0x1',
          blockNumber: '0x' + (18_000_005).toString(16),
          blockHash: EVM_RECEIPT_BLOCK_HASH,
        }),
      },
    });
    const adapter = evmAdapterWithTransport(transport);
    const observation = await adapter.observeOperation({
      executionRef: 'evm-ambiguous-above-head',
      externalOperationRef: EVM_TX_HASH,
      at: NOW,
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toMatch(/above the observed head/);
  });

  it('Solana: a status slot above the observed head is UNKNOWN', async () => {
    const adapter = solanaAdapter({
      responses: {
        getSignatureStatuses: () => ({
          value: [
            { slot: 453_015_900, confirmations: 1, confirmationStatus: 'finalized', err: null },
          ],
        }),
      },
    });
    const observation = await adapter.observeOperation({
      executionRef: 'sol-ambiguous',
      externalOperationRef: SOLANA_SIGNATURE,
      at: NOW,
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toMatch(/above the observed head/);
  });
});

describe('unreachable rails → availability UNKNOWN (never failure)', () => {
  it('EVM: an unreachable chain head surfaces RAIL_UNREACHABLE with availability UNKNOWN', async () => {
    const transport = scriptedEvmTransport();
    transport.goUnreachable();
    const adapter = evmAdapterWithTransport(transport);
    const probe = await adapter.observeChainHead({ at: NOW_ISO });
    expect(probe.kind).toBe('RAIL_UNREACHABLE');
    if (probe.kind !== 'RAIL_UNREACHABLE') throw new Error('unreachable');
    expect(probe.availability).toBe('UNKNOWN');
    expect(probe.message).toMatch(/never success\/failure/);
    expect(probe.attemptedEndpointIds.length).toBe(2);
  });

  it('EVM: an unreachable broadcast attempt after submission is OUTCOME_UNKNOWN', async () => {
    const transport = scriptedEvmTransport();
    const adapter = evmAdapterWithTransport(transport);
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
      requestId: 'req-unreach',
      signingRequestId: 'sign-unreach',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    transport.goUnreachable();
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: '0xSIGNED',
      at: NOW + 10,
      executionRef: 'exec-unreach',
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toMatch(
      /transport unreachable after the submission attempt/,
    );
    expect(observation.failure).toBeUndefined();
  });

  it('EVM: simulation transport ambiguity is OUTCOME_UNKNOWN, never FAILED', async () => {
    const transport = scriptedEvmTransport({
      responses: {
        eth_estimateGas: () => ({ scriptedError: 'connection reset mid-estimate' }),
      },
    });
    const adapter = evmAdapterWithTransport(transport);
    const prepared = await adapter.prepare({
      directive: evmTransferDirective(),
      instance: connectedChainInstance(CHAIN, 'EVM'),
      signerAccountRef: PAYER,
      head: evmHead(),
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    const simulation = await adapter.simulate({ prepared, at: NOW });
    expect(simulation.status).toBe('OUTCOME_UNKNOWN');
  });

  it('Solana: an unreachable position observation is POSITION_UNOBSERVABLE (never fabricated)', async () => {
    const transport = scriptedSolanaTransport();
    transport.goUnreachable();
    const unreachableAdapter = new SolanaChainAdapter({
      adapterId: 'adapter:solana:unreachable',
      chainKey: SOLANA_CHAIN,
      transport,
      kernel: new FakeSecurityKernel(),
      slotConfirmationTarget: 32,
    });
    const probe = await unreachableAdapter.observeAssetPosition({
      accountRef: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // PUBLIC
      assetId: SOLANA_ASSET_ID,
      at: NOW_ISO,
    });
    expect(probe.kind).toBe('POSITION_UNOBSERVABLE');
    if (probe.kind === 'POSITION_UNOBSERVABLE') {
      expect(probe.reason).toBe('RAIL_UNREACHABLE');
    }
  });
});

describe('reconciliation plans (never blind retry)', () => {
  it('an UNKNOWN broadcast observation produces a deterministic reconciliation plan', async () => {
    const transport = scriptedEvmTransport();
    const adapter = evmAdapterWithTransport(transport);
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
      requestId: 'req-recon',
      signingRequestId: 'sign-recon',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    transport.goUnreachable();
    const unknown = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: '0xSIGNED',
      at: NOW + 10,
      executionRef: 'exec-recon',
    });
    const plan = adapter.reconciliationPlan({ observation: unknown });
    expect(plan.blindRetryForbidden).toBe(true);
    expect(plan.resolver).toBe('SETTLEMENT_RECONCILIATION_AUTHORITY');
    expect(plan.reasons.length).toBeGreaterThan(0);
    expect(plan.externalChecks.length).toBeGreaterThan(0);
    // The cross-check providers are the adapter's independent endpoints.
    const providers = plan.externalChecks[0]?.providerNames ?? [];
    expect(new Set(providers).size).toBe(providers.length);
    // A reconciliation plan for a NON-unknown observation fails closed.
    const confirmed = await evmAdapterWithTransport(scriptedEvmTransport()).observeOperation({
      executionRef: 'exec-recon-confirmed',
      externalOperationRef: EVM_TX_HASH,
      at: NOW,
    });
    expect(() => adapter.reconciliationPlan({ observation: confirmed })).toThrow(
      /only constructed for OUTCOME_UNKNOWN/,
    );
  });
});
