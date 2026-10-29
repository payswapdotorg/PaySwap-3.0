import { describe, expect, it } from 'vitest';
import { StellarChainAdapter } from '../src/stellar/index.ts';
import { FakeSecurityKernel } from './fixtures/fake-kernel.ts';
import { NOW, NOW_ISO, baseSecurityState, testSurface, AGENT_PRINCIPAL } from './fixtures/world.ts';
import {
  STELLAR_CHAIN,
  STELLAR_USDC_ASSET_ID,
  STELLAR_PAYER_ACCOUNT,
  STELLAR_DESTINATION_ACCOUNT,
  STELLAR_TX_HASH,
  STELLAR_LEDGER_SEQ,
  STELLAR_TESTNET_USDC_ISSUER,
  STELLAR_INSTANCE,
  scriptedStellarHorizon,
  stellarTestAdapter,
  stellarUsdcTransferDirective,
  stellarPolicy,
} from './fixtures/stellar-world.ts';

/**
 * P22-A (ADR-0016 D2): the Stellar BROADCAST/OBSERVE TYPING — definitive vs
 * ambiguous outcomes, never a failure conversion (INV-4: UNKNOWN is not
 * FAILED). The classified pre-chain rejections are DEFINITIVE FAILED with
 * their retry guidance; the unclassified and transport-unreachable cases
 * after the submission attempt are OUTCOME_UNKNOWN, never guessed. Part 3
 * of the former lifecycle-stellar battery (the file law split).
 */

describe('the Stellar broadcast/observe typing (definitive vs ambiguous — never a failure conversion)', () => {
  async function preparedDigest(adapter: StellarChainAdapter) {
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    const directive = stellarUsdcTransferDirective();
    const prepared = await adapter.prepare({
      directive,
      instance: STELLAR_INSTANCE,
      signerAccountRef: STELLAR_PAYER_ACCOUNT,
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    const feed = adapter.authorize({
      prepared,
      policy: stellarPolicy(directive),
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'stellar-req-x',
      signingRequestId: 'stellar-sign-x',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    return feed;
  }

  it('tx_insufficient_balance is a DEFINITIVE pre-chain FAILED (INSUFFICIENT_FUNDS, safe to retry)', async () => {
    const adapter = stellarTestAdapter({
      '/transactions': () => ({
        status: 400,
        body: { extras: { result_codes: { transaction: 'tx_insufficient_balance' } } },
      }),
    });
    const feed = await preparedDigest(adapter);
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDSTELLARTX',
      at: NOW + 10,
      executionRef: 'stellar-exec-insufficient',
    });
    expect(observation.outcome).toBe('FAILED');
    expect(observation.failure?.failureClass).toBe('INSUFFICIENT_FUNDS');
    expect(observation.failure?.retryGuidance).toBe('SAFE_TO_RETRY');
  });

  it('tx_malformed is a DEFINITIVE FAILED (REJECTED, NOT_RETRYABLE)', async () => {
    const adapter = stellarTestAdapter({
      '/transactions': () => ({
        status: 400,
        body: { extras: { result_codes: { transaction: 'tx_malformed' } } },
      }),
    });
    const feed = await preparedDigest(adapter);
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDSTELLARTX',
      at: NOW + 10,
      executionRef: 'stellar-exec-malformed',
    });
    expect(observation.outcome).toBe('FAILED');
    expect(observation.failure?.failureClass).toBe('REJECTED');
    expect(observation.failure?.retryGuidance).toBe('NOT_RETRYABLE');
  });

  it('tx_bad_seq is a DEFINITIVE FAILED (re-prepare mints a NEW operation)', async () => {
    const adapter = stellarTestAdapter({
      '/transactions': () => ({
        status: 400,
        body: { extras: { result_codes: { transaction: 'tx_bad_seq' } } },
      }),
    });
    const feed = await preparedDigest(adapter);
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDSTELLARTX',
      at: NOW + 10,
      executionRef: 'stellar-exec-badseq',
    });
    expect(observation.outcome).toBe('FAILED');
    expect(observation.failure?.failureClass).toBe('PROVIDER_DEFINED');
    expect(observation.failure?.retryGuidance).toBe('SAFE_TO_RETRY');
  });

  it('an unclassified 400 after the submission attempt is OUTCOME_UNKNOWN (never guessed)', async () => {
    const adapter = stellarTestAdapter({
      '/transactions': () => ({ status: 400, body: {} }),
    });
    const feed = await preparedDigest(adapter);
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDSTELLARTX',
      at: NOW + 10,
      executionRef: 'stellar-exec-unclassified',
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toContain('unknown whether the operation reached the chain');
  });

  it('transport unreachability after the submission attempt is OUTCOME_UNKNOWN (never a failure class)', async () => {
    const transport = scriptedStellarHorizon();
    const adapter = new StellarChainAdapter({
      adapterId: 'adapter:stellar:test',
      chainKey: STELLAR_CHAIN,
      transport,
      kernel: new FakeSecurityKernel(),
      issuerScopedAssets: [
        { assetId: STELLAR_USDC_ASSET_ID, code: 'USDC', issuerAccount: STELLAR_TESTNET_USDC_ISSUER },
      ],
    });
    const feed = await preparedDigest(adapter);
    transport.goUnreachable();
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDSTELLARTX',
      at: NOW + 10,
      executionRef: 'stellar-exec-unreachable',
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toContain('unknown whether the operation reached the chain');
  });

  it('observeResult: 404 is still in flight (BROADCAST); successful:false is a definitive on-chain FAILED (REVERTED)', async () => {
    const adapter = stellarTestAdapter();
    const feed = await preparedDigest(adapter);
    const broadcast = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDSTELLARTX',
      at: NOW + 10,
      executionRef: 'stellar-exec-observe',
    });
    expect(broadcast.outcome).toBe('BROADCAST');

    const notSeen = await adapter.observeOperation({
      executionRef: 'stellar-exec-observe',
      externalOperationRef: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      at: NOW + 20,
    });
    expect(notSeen.outcome).toBe('BROADCAST');

    const failedAdapter = stellarTestAdapter({
      [`/transactions/${STELLAR_TX_HASH}`]: () => ({
        status: 200,
        body: { successful: false, ledger: STELLAR_LEDGER_SEQ },
      }),
    });
    const failedFeed = await preparedDigest(failedAdapter);
    await failedAdapter.broadcast({
      handoff: failedFeed.signingRequest,
      signedPayload: 'BASE64SIGNEDSTELLARTX',
      at: NOW + 10,
      executionRef: 'stellar-exec-reverted',
    });
    const reverted = await failedAdapter.observeOperation({
      executionRef: 'stellar-exec-reverted',
      externalOperationRef: STELLAR_TX_HASH,
      at: NOW + 30,
    });
    expect(reverted.outcome).toBe('FAILED');
    expect(reverted.failure?.failureClass).toBe('REVERTED');
    expect(reverted.failure?.retryGuidance).toBe('NOT_RETRYABLE');
  });

  it('observeResult: an unparseable transaction resource is OUTCOME_UNKNOWN (never guessed)', async () => {
    const adapter = stellarTestAdapter({
      [`/transactions/${STELLAR_TX_HASH}`]: () => ({ status: 200, body: {} }),
    });
    const observation = await adapter.observeOperation({
      executionRef: 'stellar-exec-unparseable',
      externalOperationRef: STELLAR_TX_HASH,
      at: NOW + 30,
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toContain('successful');
  });
});
