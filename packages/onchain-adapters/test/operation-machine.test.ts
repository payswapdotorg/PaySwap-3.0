import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.ts';
import {
  ADAPTER_OPERATION_TERMINAL_STATES,
  ADAPTER_OPERATION_TRANSITIONS,
  AdapterOperationTracker,
  isLawfulTransition,
  targetState,
} from '../src/lifecycle/operation-machine.ts';
import {
  AGENT_PRINCIPAL,
  CHAIN,
  ETHEREUM_ASSET_ID,
  MERCHANT,
  NOW,
  baseSecurityState,
  connectedChainInstance,
  evmHead,
  evmPolicy,
  evmTransferDirective,
  testSurface,
} from './fixtures/world.ts';
import {
  evmAdapter,
  evmAdapterWithTransport,
  evmKernel,
  routeHashOf,
  scriptedEvmTransport,
} from './fixtures/adapters.ts';

/**
 * NET-NEW for the 3.0 determinism law: the pure per-operation lifecycle
 * STATE MACHINE. The spine laws are mechanical transition-table facts:
 * authorize-before-broadcast, one-write-per-execution, reorg ambiguity
 * (CONFIRMED → UNKNOWN, never FAILED), finality only from CONFIRMED,
 * reconciliation as the ONLY exit from UNKNOWN, terminal monotonicity.
 */
describe('the operation lifecycle state machine (pure, deterministic)', () => {
  it('the frozen transition table encodes the spine laws', () => {
    // Authorize before broadcast: the BROADCAST event exists ONLY from AUTHORIZED.
    const broadcastSources = ADAPTER_OPERATION_TRANSITIONS.filter((t) => t.on === 'BROADCAST');
    expect(broadcastSources.map((t) => t.from)).toEqual(['AUTHORIZED']);
    // Finality only from CONFIRMED.
    const finalitySources = ADAPTER_OPERATION_TRANSITIONS.filter((t) => t.on === 'EVALUATE_FINALITY');
    expect(finalitySources.map((t) => t.from)).toEqual(['CONFIRMED']);
    // Reconciliation is the ONLY exit from OUTCOME_UNKNOWN.
    const unknownExits = ADAPTER_OPERATION_TRANSITIONS.filter((t) => t.from === 'OUTCOME_UNKNOWN');
    expect(unknownExits.map((t) => t.on)).toEqual(['PLAN_RECONCILIATION']);
    // A reorg turns CONFIRMED into UNKNOWN — never FAILED.
    expect(targetState('CONFIRMED', 'OBSERVE_UNKNOWN')).toBe('OUTCOME_UNKNOWN');
    expect(isLawfulTransition('CONFIRMED', 'OBSERVE_FAILED')).toBe(false);
    // Terminal states have NO outgoing transitions.
    for (const terminal of ADAPTER_OPERATION_TERMINAL_STATES) {
      expect(
        ADAPTER_OPERATION_TRANSITIONS.some((t) => t.from === terminal),
        `${terminal} must be terminal`,
      ).toBe(false);
    }
  });

  it('unlawful progression fails closed (blind retry is structurally unrepresentable)', () => {
    const tracker = new AdapterOperationTracker();
    expect(() => tracker.recordBroadcast('exec-1', 'digest-a')).toThrow(ValidationError);
    tracker.recordAuthorize('digest-a');
    expect(() => tracker.recordBroadcast('exec-1', 'digest-b')).toThrow(ValidationError);
    expect(tracker.recordBroadcast('exec-1', 'digest-a')).toBe('BROADCAST');
    // UNKNOWN can ONLY exit via reconciliation: BROADCAST again is refused.
    tracker.recordObserved('exec-1', 'OUTCOME_UNKNOWN');
    expect(() => tracker.recordBroadcast('exec-1', 'digest-a')).toThrow(ValidationError);
    expect(tracker.recordReconcile('exec-1')).toBe('RECONCILIATION_PLANNED');
    // Terminal monotonicity: nothing leaves RECONCILIATION_PLANNED.
    expect(() => tracker.recordObserved('exec-1', 'CONFIRMED')).toThrow(ValidationError);
  });

  it('one execution binds one write (re-binding fails closed)', () => {
    const tracker = new AdapterOperationTracker();
    tracker.recordAuthorize('digest-a');
    tracker.recordAuthorize('digest-b');
    tracker.recordBroadcast('exec-1', 'digest-a');
    expect(() => tracker.recordBroadcast('exec-1', 'digest-b')).toThrow(
      /one execution, one authorized write/,
    );
  });

  it('external observations may enter from IDLE (reconciliation-style re-observation)', () => {
    const tracker = new AdapterOperationTracker();
    expect(tracker.recordObserved('ext-1', 'CONFIRMED')).toBe('CONFIRMED');
    // Reorg: the confirmed external observation turned ambiguous.
    expect(tracker.recordObserved('ext-1', 'OUTCOME_UNKNOWN')).toBe('OUTCOME_UNKNOWN');
    expect(tracker.stateOf('ext-1')).toBe('OUTCOME_UNKNOWN');
  });
});

describe('the adapter enforces the machine (authorize before broadcast)', () => {
  it('a broadcast without a prior authorize through THIS adapter fails closed', async () => {
    const adapter = evmAdapter();
    const directive = evmTransferDirective();
    const prepared = await adapter.prepare({
      directive,
      instance: connectedChainInstance(CHAIN, 'EVM'),
      signerAccountRef: '0x1111111111111111111111111111111111111111',
      head: evmHead(),
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    // A hand-minted signing request (not authorized through this adapter).
    await expect(
      adapter.broadcast({
        handoff: {
          requestId: 'sign-forged',
          chain: CHAIN,
          signerAddress: '0x1111111111111111111111111111111111111111',
          payload: 'payload',
          authorizationRef: 'authz-forged',
          recheckRef: 'recheck-forged',
          deadline: NOW + 60_000,
          writeDigest: 'forged-digest',
        },
        signedPayload: '0xSIGNED',
        at: NOW + 10,
        executionRef: 'exec-forged',
      }),
    ).rejects.toThrow(/never authorized through this adapter/);
    void prepared;
  });

  it('the golden spine records every state transition (observable lifecycle)', async () => {
    const kernel = evmKernel();
    const adapter = evmAdapterWithTransport(scriptedEvmTransport(), kernel);
    const directive = evmTransferDirective();
    const policy = evmPolicy({
      allowedChains: [CHAIN],
      allowedAssets: [{ chain: CHAIN, assetId: ETHEREUM_ASSET_ID, symbol: 'ETH' }],
      allowedDestinations: [MERCHANT],
      knownRoutes: [routeHashOf(directive)],
    });
    const prepared = await adapter.prepare({
      directive,
      instance: connectedChainInstance(CHAIN, 'EVM'),
      signerAccountRef: '0x1111111111111111111111111111111111111111',
      head: evmHead(),
      at: NOW,
      requestedBy: 'agent:agent-key-1',
    });
    expect(adapter.operationLifecycle('exec-spine')).toBe('IDLE');
    const feed = adapter.authorize({
      prepared,
      policy,
      securityState: baseSecurityState(),
      surface: testSurface(),
      principal: AGENT_PRINCIPAL,
      approverRef: 'user:alice',
      requestId: 'req-spine',
      signingRequestId: 'sign-spine',
      at: NOW,
      expiresAt: NOW + 30_000,
    });
    const observed = await adapter.broadcast({
      handoff: feed.signingRequest,
      signedPayload: '0xSIGNEDRAWTX',
      at: NOW + 10,
      executionRef: 'exec-spine',
    });
    expect(observed.outcome).toBe('BROADCAST');
    expect(adapter.operationLifecycle('exec-spine')).toBe('BROADCAST');
    const confirmed = await adapter.observeOperation({
      executionRef: 'exec-spine',
      externalOperationRef: observed.externalOperationRef ?? '0x0',
      at: NOW + 30,
    });
    expect(confirmed.outcome).toBe('CONFIRMED');
    expect(adapter.operationLifecycle('exec-spine')).toBe('CONFIRMED');
    adapter.evaluateFinality({
      observation: confirmed,
      head: evmHead({ height: 18_000_005 }),
    });
    expect(adapter.operationLifecycle('exec-spine')).toBe('FINALITY_EVALUATED');
    // Terminal: a reconciliation plan for the SAME execution now fails —
    // terminal monotonicity (a retry mints a NEW execution).
    const { finalityCandidate: _fc, ...rest } = confirmed;
    const turnedUnknown = {
      ...rest,
      outcome: 'OUTCOME_UNKNOWN' as const,
      unknownReason: 'broadcast-then-reorg: the receipt vanished',
    };
    expect(() => adapter.reconciliationPlan({ observation: turnedUnknown })).toThrow(
      ValidationError,
    );
  });
});
