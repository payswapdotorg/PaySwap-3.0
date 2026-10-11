import { describe, expect, it } from 'vitest';
import { InMemoryEffectAttemptLedger } from '../src/attempts.ts';
import { ProviderExecutionBridge } from '../src/execution-bridge.ts';
import {
  IdempotencyKeyConflictError,
  ReconciliationRequiredBeforeRetryError,
  ValidationError,
  isFailureOutcome,
  requiresReconciliation,
} from '../src/errors.ts';
import { assertInvariantOutcome } from '../src/result-envelope.ts';
import {
  TEST_PROVIDER,
  TEST_SECRET_API_KEY,
  TEST_TRANSFER_OPERATION,
  TEST_AUTH,
  buildTestWorld,
  retrievalCredential,
  testBridge,
  testCommand,
  type TestWorld,
} from './world.ts';

const auth = TEST_AUTH;
const command = testCommand;
const bridge = testBridge;

describe('the execution bridge: CONFIRMED path', () => {
  it('a delivered provider acknowledgement yields CONFIRMED with refs + retained raw state', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '1', status: 'processing' },
    });
    const result = await bridge(world).execute(command(world), { connectionId: world.connectionId });
    expect(result.outcome).toBe('CONFIRMED');
    expect([...result.providerReferences]).toEqual(['trf_123']);
    expect(result.rawStateRecordId).toBeDefined();
    expect(result.ambiguityReason).toBeUndefined();
    expect(result.providerFailure).toBeUndefined();
    assertInvariantOutcome(result);
    // The provider response was retained losslessly (with command lineage).
    const record = world.store.byRevision(TEST_PROVIDER, 'transfer', 'trf_123', '1');
    expect(record?.rawState).toEqual({ id: 'trf_123', revision: '1', status: 'processing' });
    expect(record?.commandId).toBe('cmd-1');
    expect(record?.correlationId).toBe(world.correlationId);
    // The idempotency registrar completed with the provider references.
    const idem = world.registrar.list()[0];
    expect(idem?.status).toBe('COMPLETED');
    expect([...idem?.providerReferences ?? []]).toEqual(['trf_123']);
  });

  it('the attempt record persists the full identifier + lineage set (INV-05 / Wise §4.4)', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '1', status: 'processing' },
    });
    const b = bridge(world);
    await b.execute(command(world), { connectionId: world.connectionId });
    const attempt = b.attempts().log()[0];
    expect(attempt).toBeDefined();
    expect(attempt?.commandId).toBe('cmd-1');
    expect(attempt?.correlationId).toBe(world.correlationId);
    expect(attempt?.authorization).toEqual(auth);
    expect(attempt?.capability.definitionId).toBe('cap.test-psp.transfer');
    expect(attempt?.operationId).toBe(TEST_TRANSFER_OPERATION);
    expect(attempt?.idempotencyKey).toBe('cmd-1'); // CALLER_SUPPLIED_PROVIDER_FIELD derivation
    expect(attempt?.executionMode).toBe('SANDBOX');
    expect(attempt?.connectionId).toBe(world.connectionId);
    expect(attempt?.dispatchedAt).toBeDefined();
    expect(attempt?.completedAt).toBeGreaterThanOrEqual(attempt?.dispatchedAt ?? 0n);
    expect(attempt?.outcome).toBe('CONFIRMED');
    expect(attempt?.rawStateRecordId).toBeDefined();
    expect(attempt?.commandHash).toHaveLength(16);
  });

  it('the outbound call carries the provider evidence field + derived key (endpoint-specific)', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '1', status: 'processing' },
    });
    await bridge(world).execute(command(world), { connectionId: world.connectionId });
    const call = world.transport.recordedCalls()[0];
    expect(call?.idempotencyKey).toBe('cmd-1');
    expect(call?.idempotencyField).toBe('customerTransactionId');
    expect(call?.params).toEqual({ amount: '1200', currency: 'USD', recipient: 'acct_eur_1' });
  });

  it('INV-19 isolation proof: the seal opened at the edge, no artifact carries the secret', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '1', status: 'processing' },
    });
    const b = bridge(world);
    const result = await b.execute(command(world), { connectionId: world.connectionId });
    // The transport SAW an Authorization header (the material reached the edge).
    expect(world.transport.recordedCalls()[0]?.authorizationHeaderPresent).toBe(true);
    // No artifact anywhere carries the secret value (bigint-safe render).
    const stringify = (value: unknown): string =>
      JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : v));
    const artifacts = [
      stringify(result),
      stringify(b.attempts().log()),
      stringify(world.transport.recordedCalls()),
      stringify(world.registrar.list()),
      stringify(world.store.historyOf(TEST_PROVIDER, 'transfer', 'trf_123')),
      stringify(world.broker.listBundleMetadata()),
    ];
    for (const artifact of artifacts) {
      expect(artifact).not.toContain(TEST_SECRET_API_KEY);
    }
    // Header NAMES only were recorded (values never).
    expect(world.transport.recordedCalls()[0]?.headerNames).toEqual(['Authorization']);
  });
});

describe('the execution bridge: FAILED paths (definitive non-effects)', () => {
  it('a delivered provider decline is FAILED with failure metadata', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'PROVIDER_ERROR',
      status: 402,
      code: 'insufficient_funds',
      message: 'declined',
    });
    const result = await bridge(world).execute(command(world), { connectionId: world.connectionId });
    expect(result.outcome).toBe('FAILED');
    expect(result.providerFailure?.providerErrorCode).toBe('insufficient_funds');
    expect(result.providerFailure?.retryable).toBe(false);
    expect(result.ambiguityReason).toBeUndefined();
    assertInvariantOutcome(result);
    expect(world.registrar.list()[0]?.status).toBe('FAILED');
  });

  it('a pre-dispatch refusal is FAILED retryable (the command never left)', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({ kind: 'REFUSED' });
    const result = await bridge(world).execute(command(world), { connectionId: world.connectionId });
    expect(result.outcome).toBe('FAILED');
    expect(result.providerFailure?.providerErrorCode).toBe('NOT_DISPATCHED');
    expect(result.providerFailure?.retryable).toBe(true);
  });

  it('a definitive failure re-arms: the same command may retry (new BEGIN)', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    world.transport.scriptSteps({ kind: 'PROVIDER_ERROR', status: 402, code: 'x', message: 'y' });
    const first = await b.execute(command(world), { connectionId: world.connectionId });
    expect(first.outcome).toBe('FAILED');
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '1', status: 'processing' },
    });
    const second = await b.execute(command(world), { connectionId: world.connectionId });
    expect(second.outcome).toBe('CONFIRMED');
    expect(world.transport.callCount).toBe(2);
  });
});

describe('the execution bridge: UNKNOWN paths (INV-04 — never FAILED)', () => {
  it('a timeout AFTER dispatch is UNKNOWN with the canonical ambiguity reason', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({ kind: 'TIMEOUT' });
    const result = await bridge(world).execute(command(world), { connectionId: world.connectionId });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
    assertInvariantOutcome(result);
    // The idempotency record stays occupied as AMBIGUOUS.
    expect(world.registrar.list()[0]?.status).toBe('AMBIGUOUS');
    // No raw state was retained (nothing was parsed from an unanswer).
    expect(world.store.recordCount).toBe(0);
  });

  it('connection loss after dispatch and malformed responses are UNKNOWN too', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({ kind: 'CONNECTION_LOST' });
    const first = await bridge(world).execute(command(world, { commandId: 'cmd-a' }), { connectionId: world.connectionId });
    expect(first.outcome).toBe('UNKNOWN');
    expect(first.ambiguityReason).toBe('TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH');
    world.transport.scriptSteps({ kind: 'MALFORMED' });
    const second = await bridge(world).execute(command(world, { commandId: 'cmd-b' }), { connectionId: world.connectionId });
    expect(second.outcome).toBe('UNKNOWN');
    expect(second.ambiguityReason).toBe('MALFORMED_RESPONSE_AFTER_DISPATCH');
  });

  it('the ambiguity error taxonomy: UNKNOWN is not a failure outcome', () => {
    const ambiguity = new ReconciliationRequiredBeforeRetryError('x');
    expect(isFailureOutcome(ambiguity)).toBe(false);
    expect(requiresReconciliation(ambiguity)).toBe(true);
    expect(isFailureOutcome(new ValidationError('x'))).toBe(true);
  });

  it('the full discipline: timeout -> UNKNOWN -> blind retry REFUSED -> retrieval -> retry allowed', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    // 1. The ambiguous timeout.
    world.transport.scriptSteps({ kind: 'TIMEOUT' });
    const unknown = await b.execute(command(world), { connectionId: world.connectionId });
    expect(unknown.outcome).toBe('UNKNOWN');

    // 2. A blind consequential retry is refused (INV-04) — no scripted
    //    step needed: the gate throws BEFORE any dispatch.
    await expect(
      b.execute(command(world), { connectionId: world.connectionId }),
    ).rejects.toThrow(ReconciliationRequiredBeforeRetryError);
    expect(world.transport.callCount).toBe(1); // nothing was re-dispatched

    // 3. Reconciliation retrieval (the runtime SUPPLIES the evidence).
    world.clock.advance(50);
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '2', status: 'succeeded' },
    });
    const retrieval = await world.retrieval.retrieve({
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_123',
      reason: 'RECONCILIATION_AFTER_AMBIGUITY',
      correlationId: world.correlationId,
      credential: retrievalCredential(world),
    });
    expect(retrieval.record.revision).toBe('2');

    // 4. The retry may now proceed (post-ambiguity retrieval evidence exists).
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '2', status: 'succeeded' },
    });
    const retried = await b.execute(command(world), { connectionId: world.connectionId });
    expect(retried.outcome).toBe('CONFIRMED');
    // The whole trail remains secret-free.
    expect(JSON.stringify(b.attempts().log(), (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(TEST_SECRET_API_KEY);
  });

  it('a retrieval from BEFORE the ambiguity does NOT satisfy the gate', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    // Pre-ambiguity retrieval.
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_5', revision: '1', status: 'processing' },
    });
    await world.retrieval.retrieve({
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_5',
      reason: 'SCHEDULED_POLL',
      correlationId: world.correlationId,
      credential: retrievalCredential(world),
    });
    // The ambiguous attempt.
    world.transport.scriptSteps({ kind: 'TIMEOUT' });
    await b.execute(command(world), { connectionId: world.connectionId });
    // Retry refused: the retrieval predates the ambiguity.
    await expect(
      b.execute(command(world), { connectionId: world.connectionId }),
    ).rejects.toThrow(ReconciliationRequiredBeforeRetryError);
  });
});

describe('the execution bridge: idempotency discipline (INV-06)', () => {
  it('a duplicate command after CONFIRMED replays the recorded result with NO second dispatch', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '1', status: 'processing' },
    });
    const first = await b.execute(command(world), { connectionId: world.connectionId });
    const second = await b.execute(command(world), { connectionId: world.connectionId });
    expect(second.outcome).toBe('CONFIRMED');
    expect([...second.providerReferences]).toEqual([...first.providerReferences]);
    expect(world.transport.callCount).toBe(1); // exactly ONE provider dispatch
    expect(b.attempts().log()).toHaveLength(2); // both attempts recorded
    const replayAttempt = b.attempts().log()[1];
    expect(replayAttempt?.dispatchedAt).toBe(replayAttempt?.completedAt); // no dispatch
  });

  it('the same key with a DIFFERENT body is a typed conflict (never a silent success)', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_123', revision: '1', status: 'processing' },
    });
    await b.execute(command(world), { connectionId: world.connectionId });
    await expect(
      b.execute(
        command(world, { params: { amount: '9999', currency: 'USD', recipient: 'acct_eur_1' } }),
        { connectionId: world.connectionId },
      ),
    ).rejects.toThrow(IdempotencyKeyConflictError);
  });

  it('a parallel IN_FLIGHT dispatch is refused (the caller waits)', async () => {
    const world = buildTestWorld();
    const b = bridge(world);
    // Pre-seed an IN_FLIGHT record for the same key exactly as a parallel
    // holder would have left it.
    const contract = world.contracts.require(TEST_TRANSFER_OPERATION);
    world.registrar.begin({
      contract,
      connectionId: world.connectionId,
      commandId: 'cmd-1',
      correlationId: world.correlationId,
      idempotencyKey: 'cmd-1',
      command: command(world).params,
      now: world.clock.now(),
    });
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_1', revision: '1', status: 'processing' },
    });
    await expect(
      b.execute(command(world), { connectionId: world.connectionId }),
    ).rejects.toThrow(/IN_FLIGHT/);
    expect(world.transport.callCount).toBe(0);
  });

  it('a different CONNECTION namespace does not collide (per-account keys)', async () => {
    const world = buildTestWorld();
    // Register + activate a second connection on the same credential handle.
    const handle = world.connections.get(world.connectionId).credentialHandleRef;
    world.connections.register({
      connectionId: 'conn:test-2',
      providerName: TEST_PROVIDER,
      form: 'SCOPED_API_CREDENTIAL',
      credentialKind: 'API_KEY',
      credentialHandleRef: handle,
      scope: world.connections.get(world.connectionId).scope,
      createdAt: world.clock.now(),
    });
    world.connections.transition('conn:test-2', 'PENDING_VERIFICATION', {
      at: world.clock.now(),
      cause: 'PRINCIPAL_REQUEST',
      actorRef: 'principal:test-owner',
    });
    world.connections.transition('conn:test-2', 'ACTIVE', {
      at: world.clock.now(),
      cause: 'VERIFICATION_SUCCEEDED',
      actorRef: 'principal:test-owner',
    });
    const b = bridge(world);
    world.transport.scriptSteps(
      { kind: 'DELIVERED', status: 200, body: { id: 'trf_1', revision: '1' } },
      { kind: 'DELIVERED', status: 200, body: { id: 'trf_2', revision: '1' } },
    );
    await b.execute(command(world), { connectionId: world.connectionId });
    await b.execute(command(world), { connectionId: 'conn:test-2' });
    expect(world.transport.callCount).toBe(2); // both dispatched: distinct namespaces
  });
});
