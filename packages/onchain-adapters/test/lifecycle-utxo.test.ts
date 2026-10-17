import { describe, expect, it } from 'vitest';
import { UnsupportedLifecycleStageError } from '../src/errors.ts';
import {
  adapterSettlementEnvelope,
  mapAdapterObservationToRailOperation,
} from '../src/settlement-gate.ts';
import { settlementAttemptEventCandidate } from '../src/pins/onchain-domain/settlement-mapping.ts';
import {
  BTC_GENESIS,
  BTC_TXID,
  BTC_TX_BLOCK_HEIGHT,
  routeHashOf,
  scriptedUtxoTransport,
  utxoAdapter,
  utxoAdapterWithTransport,
} from './fixtures/adapters.ts';
import {
  AGENT_PRINCIPAL,
  BITCOIN_ASSET_ID,
  BITCOIN_CHAIN,
  BTC_MERCHANT,
  NOW,
  NOW_ISO,
  baseSecurityState,
  connectedChainInstance,
  evmPolicy,
  testSurface,
  utxoTransferDirective,
} from './fixtures/world.ts';

/**
 * The UTXO family adapter lifecycle (ported from payswap.org@8a735bf
 * test/lifecycle-utxo.test.ts): simulate is STRUCTURALLY unsupported
 * (declared, fails closed), the golden path runs the kernel gate-only
 * (PREPARED → gates without simulation), and reorg detection turns prior
 * confirmations into OUTCOME_UNKNOWN.
 */
describe('UTXO golden lifecycle (simulation structurally unsupported)', () => {
  const directive = utxoTransferDirective();
  const instance = connectedChainInstance(BITCOIN_CHAIN, 'UTXO');
  const policy = evmPolicy({
    allowedChains: [BITCOIN_CHAIN],
    allowedAssets: [{ chain: BITCOIN_CHAIN, assetId: BITCOIN_ASSET_ID, symbol: 'BTC' }],
    allowedDestinations: [BTC_MERCHANT],
    knownRoutes: [routeHashOf(directive)],
  });

  it('observe → prepare → (no simulate) → authorize → broadcast → observe → finality', async () => {
    const adapter = utxoAdapter();

    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    expect(headProbe.kind).toBe('HEAD_OBSERVED');
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    expect(headProbe.head.height).toBe(969_751);
    expect(headProbe.head.headHash).toBe(
      '00000000000000000001a8861740fb02fd413d4199a3207478785fc8b3487885',
    );

    const prepared = await adapter.prepare({
      directive,
      instance,
      signerAccountRef: 'bc1qwallet000000000000000000000000000000000000',
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    expect(prepared.familyPlan.observedGenesisHash).toBe(BTC_GENESIS);
    expect(prepared.familyPlan.amountSat).toBe('100000');
    if (prepared.familyPlan.fee.expressible) {
      // The exact decimal text of the declared estimate bucket, verbatim.
      expect(prepared.familyPlan.fee.feeRateSatPerVByte).toBe('2.5');
      expect(prepared.familyPlan.fee.mempoolPolicy.replacement).toBe('BIP125_OPT_IN');
      expect(prepared.familyPlan.fee.mempoolPolicy.cpfp).toBe('SUPPORTED');
    } else {
      throw new Error('the scripted explorer answers fee-estimates — fee must be expressible');
    }

    // SIMULATE: declared unsupported → fails closed (never approximated).
    expect(adapter.lifecycle.simulate).toBe(false);
    expect(() => adapter.simulate()).toThrow(UnsupportedLifecycleStageError);

    // Authorize runs the kernel GATE-ONLY (no simulation — supported path).
    const feed = adapter.authorize({
      prepared,
      policy,
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'btc-req-1',
      signingRequestId: 'btc-sign-1',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    expect(feed.pipelineState).toBe('BROADCAST_HANDOFF');
    expect(feed.signingRequest.payload).toContain('payswap.utxo.signing-envelope');

    const broadcastObservation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: '0100000001RAWHEX',
      at: NOW + 10,
      executionRef: 'btc-exec-1',
    });
    expect(broadcastObservation.outcome).toBe('BROADCAST');
    expect(broadcastObservation.externalOperationRef).toBe(BTC_TXID);

    const observed = await adapter.observeOperation({
      executionRef: 'btc-exec-1',
      externalOperationRef: BTC_TXID,
      at: NOW + 30,
    });
    expect(observed.outcome).toBe('CONFIRMED');
    expect(observed.finalityCandidate?.confirmationDepth).toBe(969_751 - BTC_TX_BLOCK_HEIGHT + 1);

    const evaluation = adapter.evaluateFinality({
      observation: observed,
      head: headProbe.head,
    });
    expect(evaluation.declaredTarget).toBe(6);
    expect(evaluation.depthSufficient).toBe(true);

    const envelope = adapterSettlementEnvelope({
      adapterId: adapter.adapterId,
      chainKey: adapter.chainKey,
      environmentClass: adapter.environment.environmentClass,
    });
    const mapping = mapAdapterObservationToRailOperation({
      envelope,
      observation: broadcastObservation,
      settlementInstructionId: 'si-003',
      settlementAttemptId: 'sa-003',
    });
    expect(mapping.railId).toBe('onchain.bitcoin:mainnet');
    expect(mapping.outcome.kind).toBe('RAIL_EFFECT_PENDING');
    expect(settlementAttemptEventCandidate(broadcastObservation)).toEqual({
      kind: 'NO_EVENT',
      reason: 'SUBMITTED_NOT_FINAL',
    });
  });

  it('broadcast-then-reorg (tx vanishes after confirmation) → OUTCOME_UNKNOWN', async () => {
    const adapter = utxoAdapter();
    const confirmed = await adapter.observeOperation({
      executionRef: 'btc-exec-reorg',
      externalOperationRef: BTC_TXID,
      at: NOW,
    });
    expect(confirmed.outcome).toBe('CONFIRMED');

    const reorgedAdapter = utxoAdapter({
      responses: {
        [`/tx/${BTC_TXID}/status`]: () => ({ status: 404, body: 'not found' }),
      },
    });
    const unknown = await reorgedAdapter.observeOperation({
      executionRef: 'btc-exec-reorg',
      externalOperationRef: BTC_TXID,
      at: NOW + 600,
      prior: confirmed,
    });
    expect(unknown.outcome).toBe('OUTCOME_UNKNOWN');
    expect(unknown.unknownReason).toMatch(/broadcast-then-reorg/);
    expect(unknown.failure).toBeUndefined();
  });

  it('reorg (containing block hash changes) → OUTCOME_UNKNOWN', async () => {
    const transport = scriptedUtxoTransport();
    const adapter = utxoAdapterWithTransport(transport);
    const confirmed = await adapter.observeOperation({
      executionRef: 'btc-exec-reorg2',
      externalOperationRef: BTC_TXID,
      at: NOW,
    });
    expect(confirmed.outcome).toBe('CONFIRMED');

    transport.script(`/tx/${BTC_TXID}/status`, () => ({
      status: 200,
      body: { confirmed: true, block_height: BTC_TX_BLOCK_HEIGHT, block_hash: '0' + 'b'.repeat(63) },
    }));
    const unknown = await adapter.observeOperation({
      executionRef: 'btc-exec-reorg2',
      externalOperationRef: BTC_TXID,
      at: NOW + 600,
      prior: confirmed,
    });
    expect(unknown.outcome).toBe('OUTCOME_UNKNOWN');
    expect(unknown.unknownReason).toMatch(/containing block changed/);
  });

  it('an unconfirmed tx stays BROADCAST (in mempool)', async () => {
    const adapter = utxoAdapter({
      responses: {
        [`/tx/${BTC_TXID}/status`]: () => ({
          status: 200,
          body: { confirmed: false },
        }),
      },
    });
    const observation = await adapter.observeOperation({
      executionRef: 'btc-exec-mempool',
      externalOperationRef: BTC_TXID,
      at: NOW,
    });
    expect(observation.outcome).toBe('BROADCAST');
    expect(observation.finalityCandidate).toBeUndefined();
  });

  it('an unobserved reference (404 without prior) → OUTCOME_UNKNOWN, never fabricated', async () => {
    const adapter = utxoAdapter({
      responses: {
        [`/tx/${BTC_TXID}/status`]: () => ({ status: 404, body: 'not found' }),
      },
    });
    const observation = await adapter.observeOperation({
      executionRef: 'btc-exec-unobserved',
      externalOperationRef: BTC_TXID,
      at: NOW,
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toMatch(/never a fabricated failure or success/);
  });

  it('a confirmation above the tip (inconsistent provider data) → OUTCOME_UNKNOWN', async () => {
    const adapter = utxoAdapter({
      responses: {
        '/blocks/tip/height': () => ({ status: 200, body: 969_740 }),
      },
    });
    const observation = await adapter.observeOperation({
      executionRef: 'btc-exec-above-tip',
      externalOperationRef: BTC_TXID,
      at: NOW,
    });
    expect(observation.outcome).toBe('OUTCOME_UNKNOWN');
    expect(observation.unknownReason).toMatch(/above the observed tip/);
  });

  it('the genesis-block identity check fails prepare closed on mismatch', async () => {
    const adapter = utxoAdapter({
      responses: {
        '/block-height/0': () => ({ status: 200, body: '0'.repeat(64) }),
      },
    });
    await expect(
      adapter.prepare({
        directive,
        instance,
        signerAccountRef: 'bc1qwallet000000000000000000000000000000000000',
        head: {
          observationKind: 'ChainHeadObservation',
          chainKey: BITCOIN_CHAIN,
          environmentClass: 'PRODUCTION',
          height: 969_751,
          headHash: '00000000000000000001a8861740fb02fd413d4199a3207478785fc8b3487885',
          observedAt: NOW_ISO,
          provenance: {
            transportId: 'transport:scripted:utxo',
            endpointId: 'utxo-scripted-1',
            providerName: 'ScriptedExplorer',
            capturedAt: NOW_ISO,
            adapterId: 'adapter:utxo:test',
            environmentClass: 'PRODUCTION',
          },
          maxAgeSeconds: 600,
        },
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/chain confusion fails closed/);
  });

  it('UTXO balances are observations with freshness + provenance (never custody)', async () => {
    const adapter = utxoAdapter();
    const probe = await adapter.observeAssetPosition({
      accountRef: BTC_MERCHANT,
      assetId: BITCOIN_ASSET_ID,
      at: NOW_ISO,
    });
    expect(probe.kind).toBe('POSITION_OBSERVED');
    if (probe.kind !== 'POSITION_OBSERVED') throw new Error('unreachable');
    expect(probe.observation.observationKind).toBe('AssetObservation');
    // funded 150000 - spent 50000 = 100000 exact satoshi.
    expect(probe.observation.observedAmount.minorUnits).toBe('100000');
    expect(probe.observation.freshness.maxAgeSeconds).toBeGreaterThan(0);
    expect(probe.observation.provenance.providerName).toBe('ScriptedExplorer');
    expect(probe.observation.observer.observerKind).toBe('INDEXER');
    // An unbound asset is never observed (fail closed).
    const unbound = await adapter.observeAssetPosition({
      accountRef: BTC_MERCHANT,
      assetId: `${BITCOIN_CHAIN}/asset:RUNE`,
      at: NOW_ISO,
    });
    expect(unbound.kind).toBe('POSITION_UNOBSERVABLE');
    if (unbound.kind === 'POSITION_UNOBSERVABLE') {
      expect(unbound.reason).toBe('ASSET_BINDING_UNKNOWN');
    }
  });
});
