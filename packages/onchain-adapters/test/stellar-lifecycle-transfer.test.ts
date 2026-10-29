import { describe, expect, it } from 'vitest';
import { ChainIdentityMismatchError, UnsupportedLifecycleStageError } from '../src/errors.ts';
import type { StellarChainAdapter } from '../src/stellar/index.ts';
import { NOW, NOW_ISO, baseSecurityState, testSurface, AGENT_PRINCIPAL } from './fixtures/world.ts';
import {
  STELLAR_CHAIN,
  STELLAR_PASSPHRASE,
  STELLAR_USDC_ASSET_ID,
  STELLAR_PAYER_ACCOUNT,
  STELLAR_DESTINATION_ACCOUNT,
  STELLAR_LEDGER_SEQ,
  STELLAR_LEDGER_HASH,
  STELLAR_TX_HASH,
  STELLAR_INSTANCE,
  stellarTestAdapter,
  stellarUsdcTransferDirective,
  stellarPolicy,
} from './fixtures/stellar-world.ts';

/**
 * P22-A (ADR-0016 D2): the Stellar GOLDEN TRANSFER LIFECYCLE
 * `prepare → authorize → broadcast → observe → finality` over the scripted
 * Horizon — the full write path broadcasts through the seam and confirms
 * with DETERMINISTIC-class finality; prepare fails closed on chain-identity
 * mismatch, malformed shapes and inexpressible fees. Part 2 of the former
 * lifecycle-stellar battery (the file law split).
 */

describe('the Stellar golden transfer lifecycle (prepare → authorize → broadcast → observe → finality)', () => {
  it('the full write path broadcasts through the seam and confirms with DETERMINISTIC-class finality', async () => {
    const adapter = stellarTestAdapter();
    const directive = stellarUsdcTransferDirective();

    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');

    const prepared = await adapter.prepare({
      directive,
      instance: STELLAR_INSTANCE,
      signerAccountRef: STELLAR_PAYER_ACCOUNT,
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    expect(prepared.familyPlan.kind).toBe('transfer');
    if (prepared.familyPlan.kind !== 'transfer') throw new Error('unreachable');
    expect(prepared.familyPlan.observedNetworkPassphrase).toBe(STELLAR_PASSPHRASE);
    expect(prepared.familyPlan.destination).toBe(STELLAR_DESTINATION_ACCOUNT);
    expect(prepared.familyPlan.assetId).toBe(STELLAR_USDC_ASSET_ID);
    expect(prepared.familyPlan.amountStroops).toBe('255000000');
    if (prepared.familyPlan.fee.expressible) {
      expect(prepared.familyPlan.fee.stroopsPerOperation).toBe('100');
    } else {
      throw new Error('the scripted Horizon answers fee_stats — fee must be expressible');
    }
    expect(prepared.familyPlan.ledgerAtPrepare).toEqual({
      height: STELLAR_LEDGER_SEQ,
      headHash: STELLAR_LEDGER_HASH,
    });
    expect(prepared.writeRequest.transfer?.asset.assetId).toBe(STELLAR_USDC_ASSET_ID);
    expect(prepared.writeRequest.transfer?.asset.symbol).toBe('USDC');

    const feed = adapter.authorize({
      prepared,
      policy: stellarPolicy(directive),
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'stellar-req-1',
      signingRequestId: 'stellar-sign-1',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    expect(feed.pipelineState).toBe('BROADCAST_HANDOFF');
    expect(feed.signingRequest.payload).toContain('payswap.stellar.signing-envelope');
    expect(feed.signingRequest.chain).toBe(STELLAR_CHAIN);

    const broadcast = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDSTELLARTX',
      at: NOW + 10,
      executionRef: 'stellar-exec-1',
    });
    expect(broadcast.outcome).toBe('BROADCAST');
    expect(broadcast.externalOperationRef).toBe(STELLAR_TX_HASH);

    const observed = await adapter.observeOperation({
      executionRef: 'stellar-exec-1',
      externalOperationRef: STELLAR_TX_HASH,
      at: NOW + 30,
    });
    expect(observed.outcome).toBe('CONFIRMED');
    expect(observed.finalityCandidate?.finalityModel).toBe('DETERMINISTIC');
    expect(observed.finalityCandidate?.reorgDetected).toBe(false);
    expect(observed.finalityCandidate?.candidateOnly).toBe(true);

    const evaluation = adapter.evaluateFinality({
      observation: observed,
      head: headProbe.head,
    });
    expect(evaluation.declaredTarget).toBe(1);
    expect(evaluation.observedDepth).toBe(1);
    expect(evaluation.depthSufficient).toBe(true);
    expect(evaluation.reorgDetected).toBe(false);
  });

  it('prepare fails closed on a network-passphrase mismatch (chain confusion)', async () => {
    const adapter = stellarTestAdapter({
      '/': () => ({
        status: 200,
        body: { network_passphrase: 'Public Global Stellar Network ; September 2015' },
      }),
    });
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    await expect(
      adapter.prepare({
        directive: stellarUsdcTransferDirective(),
        instance: STELLAR_INSTANCE,
        signerAccountRef: STELLAR_PAYER_ACCOUNT,
        head: headProbe.head,
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toBeInstanceOf(ChainIdentityMismatchError);
  });

  it('prepare fails closed on a non-G… destination and a non-integer stroop amount', async () => {
    const adapter = stellarTestAdapter();
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    await expect(
      adapter.prepare({
        directive: stellarUsdcTransferDirective({ destination: 'not-a-strkey' }),
        instance: STELLAR_INSTANCE,
        signerAccountRef: STELLAR_PAYER_ACCOUNT,
        head: headProbe.head,
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/destination account matching/);
    // The neutral directive law fires FIRST (exact integer minorUnits at
    // validation); the family's exact-stroop law is the second gate.
    await expect(
      adapter.prepare({
        directive: stellarUsdcTransferDirective({
          amount: { assetId: STELLAR_USDC_ASSET_ID, minorUnits: '25.5' },
        }),
        instance: STELLAR_INSTANCE,
        signerAccountRef: STELLAR_PAYER_ACCOUNT,
        head: headProbe.head,
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/exact integer decimal string/);
  });

  it('an unreachable fee-stats feed carries an INEXPRESSIBLE fee honestly (prepare still lands)', async () => {
    const adapter = stellarTestAdapter({ '/fee_stats': () => ({ status: 503, body: {} }) });
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    const prepared = await adapter.prepare({
      directive: stellarUsdcTransferDirective(),
      instance: STELLAR_INSTANCE,
      signerAccountRef: STELLAR_PAYER_ACCOUNT,
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    expect(prepared.familyPlan.fee.expressible).toBe(false);
  });

  it('simulation is structurally unsupported over Horizon REST and FAILS CLOSED (never approximated)', () => {
    const adapter: StellarChainAdapter = stellarTestAdapter();
    expect(() => adapter.simulate()).toThrow(UnsupportedLifecycleStageError);
  });
});
