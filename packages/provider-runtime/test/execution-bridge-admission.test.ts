import { describe, expect, it } from 'vitest';
import { ProviderExecutionBridge } from '../src/execution-bridge.ts';
import { InMemoryEffectAttemptLedger } from '../src/attempts.ts';
import { ConnectionScopeViolationError, ValidationError } from '../src/errors.ts';
import { liveBehaviorProof } from '../src/execution-mode.ts';
import {
  TEST_SECRET_API_KEY,
  TEST_TRANSFER_OPERATION,
  TEST_AUTH,
  buildTestWorld,
  bridgeDeps,
  testBridge,
  testCommand,
} from './world.ts';

const auth = TEST_AUTH;
const command = testCommand;
const bridge = testBridge;

describe('the execution bridge: admission + validation (fail-closed)', () => {
  it('secret-shaped command params are refused BEFORE any dispatch (INV-19)', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    await expect(
      b.execute(
        command(world, { params: { amount: '1', apiKey: TEST_SECRET_API_KEY } }),
        { connectionId: world.connectionId },
      ),
    ).rejects.toThrow(ValidationError);
    expect(world.transport.callCount).toBe(0);
  });

  it('malformed commands (authorization lineage, ids) are refused', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    const cases = [
      command(world, { commandId: '' }),
      { ...command(world), correlationId: '' },
      { ...command(world), authorization: { ...auth, epoch: -1n } },
      { ...command(world), authorization: { ...auth, artifactId: '' } },
      { ...command(world), params: null as never },
    ];
    for (const candidate of cases) {
      await expect(b.execute(candidate, { connectionId: world.connectionId })).rejects.toThrow(
        ValidationError,
      );
    }
    expect(world.transport.callCount).toBe(0);
  });

  it('unknown operations are refused; an out-of-scope capability is refused', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    await expect(
      b.execute(command(world, { operationId: 'nope' }), { connectionId: world.connectionId }),
    ).rejects.toThrow(ValidationError);
    // An operation whose capability is not in the connection scope.
    world.bindings.register({
      declaration: {
        operationId: 'test-psp.cancel_transfer',
        operationClass: 'CANCEL_OR_REVERSE_EFFECT',
        effectClass: 'STATE_CHANGING',
        capability: { definitionId: 'cap.test-psp.refund', implementationId: 'impl.test-psp.1', version: '1.0.0' },
        providerEndpoint: '/v1/transfers:cancel',
      },
      idempotencyContract: {
        operationId: 'test-psp.cancel_transfer',
        keyScope: { connection: true, operation: true },
        keyDerivation: 'NAMESPACED_COMMAND_ID',
        replayBehavior: 'REPLAYS_ORIGINAL_RESULT',
        conflictReporting: 'PROVIDER_CONFLICT_SIGNAL',
      },
      parseResponse: () => ({ providerReferences: [] }),
      bindHeaders: () => ({}),
    });
    await expect(
      b.execute(command(world, { operationId: 'test-psp.cancel_transfer' }), {
        connectionId: world.connectionId,
      }),
    ).rejects.toThrow(ConnectionScopeViolationError);
    expect(world.transport.callCount).toBe(0);
  });

  it('a SUSPENDED connection refuses execution (lifecycle admission)', async () => {
    const world = buildTestWorld();
    world.connections.transition(world.connectionId, 'SUSPENDED', {
      at: world.clock.now() + 1n,
      cause: 'POLICY_DECISION',
      actorRef: 'operator:1',
    });
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_1', revision: '1' },
    });
    await expect(
      bridge(world).execute(command(world), { connectionId: world.connectionId }),
    ).rejects.toThrow(ConnectionScopeViolationError);
    expect(world.transport.callCount).toBe(0);
  });

  it('an unknown connection id is refused', async () => {
    const world = buildTestWorld();
    await expect(
      bridge(world).execute(command(world), { connectionId: 'conn:nope' }),
    ).rejects.toThrow(ValidationError);
  });

  it('the bridge refuses to bind a FAKE transport under LIVE mode (INV-25)', () => {
    const world = buildTestWorld();
    expect(
      () => new ProviderExecutionBridge({ ...bridgeDeps(world), mode: 'LIVE' }),
    ).toThrow(/FAKE_DETERMINISTIC/);
  });
});

describe('the execution bridge: sandbox branding + ledger surfaces', () => {
  it('every attempt is branded with the execution mode; sandbox can never prove live', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '1', status: 'processing' },
    });
    const b = bridge(world);
    await b.execute(command(world), { connectionId: world.connectionId });
    const attempt = b.attempts().log()[0];
    expect(attempt?.executionMode).toBe('SANDBOX');
    let sandboxProofCode = '';
    try {
      liveBehaviorProof({ executionMode: 'SANDBOX', evidenceRef: attempt?.attemptId ?? '' });
    } catch (error) {
      sandboxProofCode = (error as { details?: { code?: string } }).details?.code ?? '';
    }
    expect(sandboxProofCode).toBe('SANDBOX_NOT_LIVE_PROOF');
  });

  it('the injectable attempt ledger keeps an append-only per-command trail', async () => {
    const world = buildTestWorld();
    const ledger = new InMemoryEffectAttemptLedger();
    const b = new ProviderExecutionBridge({ ...bridgeDeps(world), attempts: ledger });
    world.transport.scriptSteps(
      { kind: 'TIMEOUT' },
      { kind: 'DELIVERED', status: 200, body: { id: 'trf_1', revision: '1', status: 'processing' } },
    );
    await b.execute(command(world), { connectionId: world.connectionId });
    // A second, DIFFERENT command under the same correlation flow.
    await b.execute(command(world, { commandId: 'cmd-2' }), { connectionId: world.connectionId });
    expect(ledger.size).toBe(2);
    expect(ledger.forCommand('cmd-1')).toHaveLength(1);
    expect(ledger.forCommand('cmd-2')).toHaveLength(1);
    expect(ledger.latestFor('cmd-1')?.outcome).toBe('UNKNOWN');
    expect(ledger.latestFor('cmd-2')?.outcome).toBe('CONFIRMED');
    // The ambiguity carries its reason on the ledger record.
    expect(ledger.latestFor('cmd-1')?.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
  });
});
