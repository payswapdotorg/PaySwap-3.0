import { describe, expect, it } from 'vitest';
import {
  adapterSettlementEnvelope,
  mapAdapterObservationToRailOperation,
} from '../src/settlement-gate.ts';
import { settlementAttemptEventCandidate } from '../src/pins/onchain-domain/settlement-mapping.ts';
import {
  SOLANA_SIGNATURE,
  SOLANA_TX_SLOT,
  routeHashOf,
  solanaAdapter,
} from './fixtures/adapters.ts';
import {
  AGENT_PRINCIPAL,
  NOW,
  NOW_ISO,
  SOLANA_ASSET_ID,
  SOLANA_CHAIN,
  baseSecurityState,
  connectedChainInstance,
  evmPolicy,
  solanaTransferDirective,
  testSurface,
} from './fixtures/world.ts';

/**
 * The Solana family adapter lifecycle (ported from payswap.org@8a735bf
 * test/lifecycle-solana.test.ts): the golden path (observe → prepare →
 * simulate → authorize → broadcast → observe → finality), fork detection,
 * definitive failures, cluster-identity defense and the fail-closed
 * simulation law.
 */
describe('Solana golden lifecycle', () => {
  const directive = solanaTransferDirective();
  const instance = connectedChainInstance(SOLANA_CHAIN, 'SOLANA');
  const policy = evmPolicy({
    allowedChains: [SOLANA_CHAIN],
    allowedAssets: [{ chain: SOLANA_CHAIN, assetId: SOLANA_ASSET_ID, symbol: 'SOL' }],
    // PUBLIC: the fixture Solana system account.
    allowedDestinations: ['9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'],
    knownRoutes: [routeHashOf(directive)],
  });

  it('observe → prepare → simulate → authorize → broadcast → observe → finality', async () => {
    const adapter = solanaAdapter();

    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    expect(headProbe.kind).toBe('HEAD_OBSERVED');
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    expect(headProbe.head.height).toBe(453_015_774);
    // PUBLIC: the fixture blockhash (a public identifier, not a secret).
    expect(headProbe.head.headHash).toBe('4VbguV3HcbnfMxu1PFjUsNfeeoHLmk6kcAe3hGcMXuHv');

    const prepared = await adapter.prepare({
      directive,
      instance,
      // PUBLIC: the fixture Solana system account.
      signerAccountRef: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    expect(prepared.familyPlan.observedGenesisHash).toBe(
      '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', // PUBLIC
    );
    // PUBLIC: the fixture blockhash.
    expect(prepared.familyPlan.recentBlockhash).toBe(
      '4VbguV3HcbnfMxu1PFjUsNfeeoHLmk6kcAe3hGcMXuHv', // PUBLIC
    );
    if (prepared.familyPlan.fee.expressible) {
      expect(prepared.familyPlan.fee.lamportsPerSignature).toBe('5000');
    } else {
      throw new Error('the scripted cluster answers getFeeForMessage — fee must be expressible');
    }

    const simulation = await adapter.simulate({ prepared, at: NOW });
    expect(simulation.status).toBe('SUCCEEDED');
    expect(simulation.gasEstimate).toBeUndefined();

    const feed = adapter.authorize({
      prepared,
      policy,
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'sol-req-1',
      signingRequestId: 'sol-sign-1',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    expect(feed.pipelineState).toBe('BROADCAST_HANDOFF');
    // The Solana signing envelope binds the authorization (surface signs the real tx).
    expect(feed.signingRequest.payload).toContain('payswap.solana.signing-envelope');
    expect(feed.signingRequest.payload).toContain(feed.authorizationRef);

    const broadcastObservation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: 'BASE64SIGNEDTX',
      at: NOW + 10,
      executionRef: 'sol-exec-1',
    });
    expect(broadcastObservation.outcome).toBe('BROADCAST');
    expect(broadcastObservation.externalOperationRef).toBe(SOLANA_SIGNATURE);

    const observed = await adapter.observeOperation({
      executionRef: 'sol-exec-1',
      externalOperationRef: SOLANA_SIGNATURE,
      at: NOW + 30,
    });
    expect(observed.outcome).toBe('CONFIRMED');
    expect(observed.finalityCandidate?.confirmationDepth).toBe(4); // confirmations 3 + inclusion
    expect(observed.finalityCandidate?.finalityModel).toBe('PROBABILISTIC');

    const evaluation = adapter.evaluateFinality({
      observation: observed,
      head: headProbe.head,
    });
    expect(evaluation.declaredTarget).toBe(32);
    expect(evaluation.observedDepth).toBe(4);
    expect(evaluation.depthSufficient).toBe(false); // guidance not yet met — honest

    // The settlement gate maps into the CANONICAL vocabulary.
    const envelope = adapterSettlementEnvelope({
      adapterId: adapter.adapterId,
      chainKey: adapter.chainKey,
      environmentClass: adapter.environment.environmentClass,
    });
    const mapping = mapAdapterObservationToRailOperation({
      envelope,
      observation: broadcastObservation,
      settlementInstructionId: 'si-002',
      settlementAttemptId: 'sa-002',
    });
    expect(mapping.railId).toBe('onchain.solana:mainnet-beta');
    expect(mapping.outcome.kind).toBe('RAIL_EFFECT_PENDING');
    expect(settlementAttemptEventCandidate(broadcastObservation)).toEqual({
      kind: 'NO_EVENT',
      reason: 'SUBMITTED_NOT_FINAL',
    });
  });

  it('a prior CONFIRMED status that disappears becomes OUTCOME_UNKNOWN (fork)', async () => {
    const adapter = solanaAdapter();
    const confirmed = await adapter.observeOperation({
      executionRef: 'sol-exec-fork',
      externalOperationRef: SOLANA_SIGNATURE,
      at: NOW,
    });
    expect(confirmed.outcome).toBe('CONFIRMED');
    // Re-script the status to null (fork dropped / aged out) on a second
    // adapter instance; the PRIOR observation drives the fork conclusion.
    const secondAdapter = solanaAdapter({
      responses: {
        getSignatureStatuses: () => ({ value: [null] }),
      },
    });
    const unknown = await secondAdapter.observeOperation({
      executionRef: 'sol-exec-fork',
      externalOperationRef: SOLANA_SIGNATURE,
      at: NOW + 60,
      prior: confirmed,
    });
    expect(unknown.outcome).toBe('OUTCOME_UNKNOWN');
    expect(unknown.unknownReason).toMatch(/broadcast-then-fork/);
    expect(unknown.failure).toBeUndefined();
  });

  it('a signature err is a definitive on-chain execution failure', async () => {
    const adapter = solanaAdapter({
      responses: {
        getSignatureStatuses: () => ({
          value: [
            {
              slot: SOLANA_TX_SLOT,
              confirmations: 2,
              confirmationStatus: 'finalized',
              err: { InstructionError: [0, 'Custom', 1] },
            },
          ],
        }),
      },
    });
    const observation = await adapter.observeOperation({
      executionRef: 'sol-exec-err',
      externalOperationRef: SOLANA_SIGNATURE,
      at: NOW,
    });
    expect(observation.outcome).toBe('FAILED');
    expect(observation.failure?.failureClass).toBe('PROVIDER_DEFINED');
    expect(observation.failure?.retryGuidance).toBe('REQUIRES_RECONCILIATION');
  });

  it('a processed-only status stays BROADCAST (not final)', async () => {
    const adapter = solanaAdapter({
      responses: {
        getSignatureStatuses: () => ({
          value: [{ slot: SOLANA_TX_SLOT, confirmations: 0, confirmationStatus: 'processed', err: null }],
        }),
      },
    });
    const observation = await adapter.observeOperation({
      executionRef: 'sol-exec-processed',
      externalOperationRef: SOLANA_SIGNATURE,
      at: NOW,
    });
    expect(observation.outcome).toBe('BROADCAST');
    expect(observation.finalityCandidate).toBeUndefined();
  });

  it('a cluster-identity mismatch fails prepare closed', async () => {
    const adapter = solanaAdapter({
      responses: {
        getGenesisHash: () => 'WrongGenesisHashWrongGenesisHashWrongGenes1', // PUBLIC (fixture)
      },
    });
    await expect(
      adapter.prepare({
        directive,
        instance,
        signerAccountRef: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // PUBLIC
        head: {
          observationKind: 'ChainHeadObservation',
          chainKey: SOLANA_CHAIN,
          environmentClass: 'PRODUCTION',
          height: 453_015_774,
          headHash: '4VbguV3HcbnfMxu1PFjUsNfeeoHLmk6kcAe3hGcMXuHv', // PUBLIC
          observedAt: NOW_ISO,
          provenance: {
            transportId: 'transport:scripted:solana',
            endpointId: 'solana-scripted-1',
            providerName: 'ScriptedProvider',
            capturedAt: NOW_ISO,
            adapterId: 'adapter:solana:test',
            environmentClass: 'PRODUCTION',
          },
          maxAgeSeconds: 30,
        },
        at: NOW,
        requestedBy: 'agent:agent-key-1',
      }),
    ).rejects.toThrow(/cluster confusion fails closed/);
  });

  it('simulation without a surface-composed transaction FAILS CLOSED (never fabricated)', async () => {
    const adapter = solanaAdapter();
    const headProbe = await adapter.observeChainHead({ at: NOW_ISO });
    if (headProbe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    const prepared = await adapter.prepare({
      directive: solanaTransferDirective({ familyPayload: undefined }),
      instance,
      // PUBLIC: the fixture Solana system account.
      signerAccountRef: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      head: headProbe.head,
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    await expect(adapter.simulate({ prepared, at: NOW })).rejects.toThrow(
      /never fabricated from nothing/,
    );
  });
});
