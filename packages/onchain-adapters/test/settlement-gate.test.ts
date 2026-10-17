import { describe, expect, it } from 'vitest';
import { TestnetNeverProductionError } from '../src/errors.ts';
import {
  adapterObservationPermitsFinalityDeclaration,
  adapterSettlementEnvelope,
  envelopeRailId,
  mapAdapterObservationToRailOperation,
} from '../src/settlement-gate.ts';
import {
  mapObservationToRailOutcome,
  settlementAttemptEventCandidate,
} from '../src/pins/onchain-domain/settlement-mapping.ts';
import { validateOnchainExecutionObservation } from '../src/pins/onchain-domain/observation.ts';
import type { OnchainExecutionObservation } from '../src/pins/onchain-domain/observation.ts';
import {
  evmAdapter,
  evmAdapterWithTransport,
  routeHashOf,
  scriptedEvmTransport,
} from './fixtures/adapters.ts';
import {
  AGENT_PRINCIPAL,
  CHAIN,
  ETHEREUM_ASSET_ID,
  MERCHANT,
  NOW,
  NOW_ISO,
  PAYER,
  baseSecurityState,
  connectedChainInstance,
  evmHead,
  evmPolicy,
  evmTransferDirective,
  testSurface,
} from './fixtures/world.ts';

/**
 * The production settlement gate (ported from the old environment +
 * lifecycle-evm settlement tests, consolidated): the STRUCTURAL environment
 * gate, the canonical mapping vocabulary (no parallel ledger), and the
 * protocol-owned-finality law.
 */
describe('the production settlement gate', () => {
  function compatObservation(
    outcome: 'BROADCAST' | 'CONFIRMED' | 'FAILED' | 'OUTCOME_UNKNOWN',
  ): OnchainExecutionObservation {
    return validateOnchainExecutionObservation({
      observationId: `exec-obs:compat:${outcome}`,
      executionRef: 'exec-compat',
      observedAt: NOW_ISO,
      chainKey: CHAIN,
      outcome,
      ...(outcome === 'CONFIRMED'
        ? {
            finalityCandidate: {
              candidateOnly: true as const,
              requiresProtocolFinality: true as const,
              confirmationDepth: 12,
              finalityModel: 'PROBABILISTIC' as const,
              reorgDetected: false,
            },
          }
        : {}),
      ...(outcome === 'FAILED'
        ? {
            failure: {
              failureClass: 'REVERTED' as const,
              description: 'reverted',
              retryGuidance: 'NOT_RETRYABLE' as const,
            },
          }
        : {}),
      ...(outcome === 'OUTCOME_UNKNOWN' ? { unknownReason: 'ambiguous' } : {}),
      evidenceRefs: ['evidence:compat'],
      provenance: {
        providerName: 'compat',
        source: 'PROVIDER_API' as const,
        capturedAt: NOW_ISO,
      },
    });
  }

  it('the observation → attempt-event candidates are events of the CANONICAL settlement vocabulary', () => {
    // The ACCEPTED @payswap/protocol settlement-attempt event vocabulary
    // (packages/protocol/src/settlement/attempts.ts) — the pin's candidates
    // must be members by name (the TL wiring asserts structural identity).
    const protocolVocabulary = [
      'START',
      'CONFIRM_SUCCEEDED',
      'CONFIRM_FAILED',
      'OUTCOME_UNKNOWN',
      'RECONCILE_RESOLVED_SUCCEEDED',
      'RECONCILE_RESOLVED_FAILED',
    ] as const;
    for (const outcome of ['BROADCAST', 'CONFIRMED', 'FAILED', 'OUTCOME_UNKNOWN'] as const) {
      const candidate = settlementAttemptEventCandidate(compatObservation(outcome));
      if (candidate.kind === 'EVENT_CANDIDATE') {
        expect(
          (protocolVocabulary as readonly string[]).includes(candidate.event),
          `${candidate.event} must be a canonical settlement attempt event`,
        ).toBe(true);
      } else {
        expect(candidate.reason).toBe('SUBMITTED_NOT_FINAL');
      }
    }
  });

  it('the rail-outcome mapping never converts UNKNOWN and never produces finality', () => {
    expect(mapObservationToRailOutcome(compatObservation('BROADCAST')).kind).toBe(
      'RAIL_EFFECT_PENDING',
    );
    expect(mapObservationToRailOutcome(compatObservation('CONFIRMED')).kind).toBe(
      'RAIL_EFFECT_OBSERVED',
    );
    expect(mapObservationToRailOutcome(compatObservation('FAILED')).kind).toBe('RAIL_EFFECT_FAILED');
    expect(mapObservationToRailOutcome(compatObservation('OUTCOME_UNKNOWN')).kind).toBe(
      'RAIL_EFFECT_UNKNOWN',
    );
  });

  it('an adapter observation NEVER permits a finality declaration (protocol-owned)', () => {
    expect(adapterObservationPermitsFinalityDeclaration()).toBe(false);
  });

  it('a testnet envelope is structurally refused (testnet never production)', () => {
    expect(() =>
      adapterSettlementEnvelope({
        adapterId: 'adapter:evm:testnet',
        chainKey: 'ethereum:sepolia',
        environmentClass: 'TESTNET',
      }),
    ).toThrow(TestnetNeverProductionError);
    // REGTEST and SIMULATION are equally barred.
    expect(() =>
      adapterSettlementEnvelope({
        adapterId: 'adapter:btc:regtest',
        chainKey: 'bitcoin:regtest',
        environmentClass: 'REGTEST',
      }),
    ).toThrow(TestnetNeverProductionError);
    expect(() =>
      adapterSettlementEnvelope({
        adapterId: 'adapter:evm:sim',
        chainKey: 'ethereum:mainnet',
        environmentClass: 'SIMULATION',
      }),
    ).toThrow(TestnetNeverProductionError);
  });

  it('an observation from ANOTHER chain fails the envelope (chain confusion)', async () => {
    const adapter = evmAdapter();
    const observation = await adapter.observeOperation({
      executionRef: 'exec-cross-chain',
      externalOperationRef: '0xdeadbeef0000000000000000000000000000000000000000000000000000c0de',
      at: NOW,
    });
    const envelope = adapterSettlementEnvelope({
      adapterId: 'adapter:solana:test',
      chainKey: 'solana:mainnet-beta',
      environmentClass: 'PRODUCTION',
    });
    expect(() =>
      mapAdapterObservationToRailOperation({
        envelope,
        observation,
        settlementInstructionId: 'si-x',
        settlementAttemptId: 'sa-x',
      }),
    ).toThrow(/chain-confusion attack/);
  });

  it('the full production mapping (BROADCAST → RAIL_EFFECT_PENDING, deterministic rail id)', async () => {
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
      requestId: 'req-gate',
      signingRequestId: 'sign-gate',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    const observation = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: '0xSIGNED',
      at: NOW + 10,
      executionRef: 'exec-gate',
    });
    const envelope = adapterSettlementEnvelope({
      adapterId: adapter.adapterId,
      chainKey: adapter.chainKey,
      environmentClass: adapter.environment.environmentClass,
    });
    const mapping = mapAdapterObservationToRailOperation({
      envelope,
      observation,
      settlementInstructionId: 'si-gate',
      settlementAttemptId: 'sa-gate',
    });
    expect(mapping.settlementInstructionId).toBe('si-gate');
    expect(mapping.settlementAttemptId).toBe('sa-gate');
    expect(mapping.observationId).toBe(observation.observationId);
    expect(mapping.executionRef).toBe('exec-gate');
    expect(mapping.railId).toBe(envelopeRailId(envelope));
    expect(mapping.outcome.kind).toBe('RAIL_EFFECT_PENDING');
    if (mapping.outcome.kind === 'RAIL_EFFECT_PENDING') {
      expect(mapping.outcome.submittedNotFinal).toBe(true);
    }
  });
});
