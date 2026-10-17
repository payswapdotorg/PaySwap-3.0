import { describe, expect, it } from 'vitest';
import { StaleObservationError } from '../src/errors.ts';
import { assertHeadFresh, isObservationFresh } from '../src/lifecycle/staleness.ts';
import { settlementAttemptEventCandidate } from '../src/pins/onchain-domain/settlement-mapping.ts';
import type { OnchainExecutionObservation } from '../src/pins/onchain-domain/observation.ts';
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
 * Work-order-mandated failure/reconciliation paths (ported from
 * payswap.org@8a735bf test/unknown-paths.test.ts, deterministic):
 * - broadcast-then-reorg → UNKNOWN;
 * - observe-stale → invalidation;
 * - finalize-ambiguous → UNKNOWN;
 * - unreachable rails → availability UNKNOWN, never failure;
 * - transport ambiguity after submission → OUTCOME_UNKNOWN.
 */
describe('broadcast-then-reorg → UNKNOWN', () => {
  it('EVM: a receipt that vanishes after a prior CONFIRMED observation is UNKNOWN', async () => {
    const transport = scriptedEvmTransport();
    const adapter = evmAdapterWithTransport(transport);
    const confirmed = await adapter.observeOperation({
      executionRef: 'evm-reorg-1',
      externalOperationRef: EVM_TX_HASH,
      at: NOW,
    });
    expect(confirmed.outcome).toBe('CONFIRMED');

    // Re-script: the receipt vanishes (the containing block was reorganized away).
    transport.script('eth_getTransactionReceipt', () => null);
    const unknown = await adapter.observeOperation({
      executionRef: 'evm-reorg-1',
      externalOperationRef: EVM_TX_HASH,
      at: NOW + 120_000,
      prior: confirmed,
    });
    expect(unknown.outcome).toBe('OUTCOME_UNKNOWN');
    expect(unknown.unknownReason).toMatch(/broadcast-then-reorg/);
    expect(unknown.failure).toBeUndefined();
    // The observation-level finality candidate is GONE (the domain validator
    // forbids finality candidates on UNKNOWN outcomes — structural).
    expect(unknown.finalityCandidate).toBeUndefined();
  });

  it('EVM: the chain’s block at the receipt height no longer matches (reorg detected)', async () => {
    const transport = scriptedEvmTransport();
    const adapter = evmAdapterWithTransport(transport);
    const confirmed = await adapter.observeOperation({
      executionRef: 'evm-reorg-2',
      externalOperationRef: EVM_TX_HASH,
      at: NOW,
    });
    expect(confirmed.outcome).toBe('CONFIRMED');

    // Re-script: the chain's block at the receipt's height is a DIFFERENT block.
    transport.script('eth_getBlockByNumber', (params) => {
      const block = params[0] as string;
      if (block === 'latest') {
        return {
          hash: '0xabc0000000000000000000000000000000000000000000000000000000000f01',
          baseFeePerGas: '0x5f5e100',
        };
      }
      return { hash: '0xreorg0000000000000000000000000000000000000000000000000000000000001' };
    });
    const unknown = await adapter.observeOperation({
      executionRef: 'evm-reorg-2',
      externalOperationRef: EVM_TX_HASH,
      at: NOW + 120_000,
      prior: confirmed,
    });
    expect(unknown.outcome).toBe('OUTCOME_UNKNOWN');
    expect(unknown.unknownReason).toMatch(/reorg detected/);
  });

  it('the UNKNOWN observation feeds the canonical UNKNOWN settlement path', () => {
    // A representative reorg-unknown observation (domain-validated shape).
    const unknown: OnchainExecutionObservation = {
      observationId: 'exec-obs:reorg:1',
      executionRef: 'evm-reorg-1',
      observedAt: NOW_ISO,
      chainKey: CHAIN,
      outcome: 'OUTCOME_UNKNOWN',
      externalOperationRef: EVM_TX_HASH,
      unknownReason:
        'broadcast-then-reorg: the transaction receipt VANISHED after a prior CONFIRMED observation',
      evidenceRefs: ['evidence:reorg:1'],
      provenance: { providerName: 'ScriptedProvider', source: 'PROVIDER_API', capturedAt: NOW_ISO },
    };
    expect(settlementAttemptEventCandidate(unknown)).toEqual({
      kind: 'EVENT_CANDIDATE',
      event: 'OUTCOME_UNKNOWN',
    });
  });
});

describe('observe-stale → invalidation', () => {
  it('a stale chain head invalidates preparation (fail closed)', () => {
    const staleHead = evmHead({ observedAt: new Date(NOW - 10 * 60_000).toISOString() });
    expect(() => assertHeadFresh(staleHead, NOW)).toThrow(StaleObservationError);
    expect(() => assertHeadFresh(staleHead, NOW)).toThrow(
      /re-observe, never execute on stale state/,
    );
  });

  it('a head dated in the future is treated as stale (fail closed)', () => {
    const futureHead = evmHead({ observedAt: new Date(NOW + 10 * 60_000).toISOString() });
    expect(() => assertHeadFresh(futureHead, NOW)).toThrow(StaleObservationError);
  });

  it('prepare refuses a stale head (the golden guard runs inside the prologue)', async () => {
    const adapter = evmAdapterWithTransport(scriptedEvmTransport());
    await expect(
      adapter.prepare({
        directive: evmTransferDirective(),
        instance: connectedChainInstance(CHAIN, 'EVM'),
        signerAccountRef: PAYER,
        head: evmHead({ observedAt: new Date(NOW - 10 * 60_000).toISOString() }),
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(StaleObservationError);
  });

  it('an expired directive is never prepared (expiry is mandatory)', async () => {
    const adapter = evmAdapterWithTransport(scriptedEvmTransport());
    await expect(
      adapter.prepare({
        directive: evmTransferDirective({ expiresAt: new Date(NOW - 1_000).toISOString() }),
        instance: connectedChainInstance(CHAIN, 'EVM'),
        signerAccountRef: PAYER,
        head: evmHead(),
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/must be a future instant at prepare time/);
  });

  it('broadcast refuses an expired kernel handoff (deadline enforced)', async () => {
    const adapter = evmAdapterWithTransport(scriptedEvmTransport());
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
      requestId: 'req-stale',
      signingRequestId: 'sign-stale',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    // After the directive expiry the handoff is expired: broadcast fails closed.
    await expect(
      adapter.broadcast({
        handoff: feed.signingRequest,
        signedPayload: '0xSIGNED',
        at: NOW + 120_000,
        executionRef: 'exec-stale',
      }),
    ).rejects.toThrow(/expired authorization can never broadcast/);
  });

  it('a drifted recheck VOIDS authorization (kernel stale-state invalidation, re-requested)', async () => {
    const adapter = evmAdapterWithTransport(scriptedEvmTransport());
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
    // A NEWER security epoch between authorization and recheck VOIDS the
    // authorization (stale-state invalidation; re-request, never repair).
    expect(() =>
      adapter.authorize({
        prepared,
        policy,
        securityState: baseSecurityState(),
        surface: testSurface(),
        principal: AGENT_PRINCIPAL,
        approverRef: 'user:alice',
        requestId: 'req-void',
        signingRequestId: 'sign-void',
        at: NOW,
        expiresAt: NOW + 30_000,
        recheckSecurityState: baseSecurityState({
          networkEpoch: 1n,
          observedAt: NOW + 1,
        }),
      }),
    ).toThrow(StaleObservationError);
  });

  it('an asset observation past its freshness window is not fresh for acting', () => {
    const asOf = new Date(NOW - 120_000).toISOString();
    expect(isObservationFresh({ asOf, maxAgeSeconds: 30 }, NOW)).toBe(false);
    expect(isObservationFresh({ asOf: NOW_ISO, maxAgeSeconds: 30 }, NOW)).toBe(true);
  });
});
