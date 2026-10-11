import { describe, expect, it } from 'vitest';
import { ProviderRetrievalService } from '../src/retrieval.ts';
import { RawProviderStateStore } from '../src/raw-state.ts';
import { DeterministicClock } from '../src/clock.ts';
import { ValidationError } from '../src/errors.ts';
import { ScriptedFakeTransport } from './fake-transport.ts';
import {
  TEST_PROVIDER,
  TEST_READ_OPERATION,
  TEST_SECRET_API_KEY,
  buildTestWorld,
  retrievalCredential,
} from './world.ts';

const credentialFor = retrievalCredential;

describe('controlled retrieval with provenance', () => {
  it('retrieves provider state, retains it losslessly and records provenance', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_77', revision: '4', status: 'processing' },
    });
    const result = await world.retrieval.retrieve({
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_77',
      reason: 'RECONCILIATION_AFTER_AMBIGUITY',
      correlationId: world.correlationId,
      credential: credentialFor(world),
    });
    expect(result.record.revision).toBe('4');
    expect(result.record.source).toBe('PROVIDER_RETRIEVAL');
    expect(result.record.rawState).toEqual({ id: 'trf_77', revision: '4', status: 'processing' });
    expect(result.transportStatus).toBe(200);
    // Provenance: fetchId + retrievedAt + reason + connection + correlation.
    expect(result.provenance.providerName).toBe(TEST_PROVIDER);
    expect(result.provenance.objectType).toBe('transfer');
    expect(result.provenance.externalId).toBe('trf_77');
    expect(result.provenance.reason).toBe('RECONCILIATION_AFTER_AMBIGUITY');
    expect(result.provenance.connectionId).toBe(world.connectionId);
    expect(result.provenance.correlationId).toBe(world.correlationId);
    expect(result.provenance.fetchId.startsWith('fetch:')).toBe(true);
    expect(result.provenance.retrievedAt).toBe(world.clock.now());
    // The retained record links the correlation lineage.
    expect(result.record.correlationId).toBe(world.correlationId);
  });

  it('the read dispatch went out with the operation contract and clean params', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_1', revision: '1', status: 'processing' },
    });
    await world.retrieval.retrieve({
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_1',
      reason: 'SCHEDULED_POLL',
      credential: credentialFor(world),
    });
    const call = world.transport.recordedCalls()[0];
    expect(call?.operationId).toBe(TEST_READ_OPERATION);
    expect(call?.params).toEqual({ transferId: 'trf_1' });
    expect(call?.authorizationHeaderPresent).toBe(true);
    expect(JSON.stringify(world.transport.recordedCalls())).not.toContain(TEST_SECRET_API_KEY);
  });

  it('fetch ids are deterministic and strictly increasing per service', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps(
      { kind: 'DELIVERED', status: 200, body: { id: 'trf_1', revision: '1' } },
      { kind: 'DELIVERED', status: 200, body: { id: 'trf_2', revision: '1' } },
    );
    const first = await world.retrieval.retrieve({
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_1',
      reason: 'SCHEDULED_POLL',
      credential: credentialFor(world),
    });
    const second = await world.retrieval.retrieve({
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_2',
      reason: 'SCHEDULED_POLL',
      credential: credentialFor(world),
    });
    expect(first.provenance.fetchId).toBe('fetch:1');
    expect(second.provenance.fetchId).toBe('fetch:2');
  });

  it('undelivered retrievals throw (the caller retries the retrieval, no fabrication)', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({ kind: 'TIMEOUT' });
    await expect(
      world.retrieval.retrieve({
        transport: world.transport,
        connectionId: world.connectionId,
        providerName: TEST_PROVIDER,
        objectType: 'transfer',
        externalId: 'trf_1',
        reason: 'SCHEDULED_POLL',
        credential: credentialFor(world),
      }),
    ).rejects.toThrow(ValidationError);
    expect(world.store.recordCount).toBe(0);
  });

  it('an unparseable provider answer is refused — never a fabricated state (INV-24)', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({ kind: 'DELIVERED', status: 200, body: { nope: true } });
    await expect(
      world.retrieval.retrieve({
        transport: world.transport,
        connectionId: world.connectionId,
        providerName: TEST_PROVIDER,
        objectType: 'transfer',
        externalId: 'trf_1',
        reason: 'OPERATOR_INITIATED',
        credential: credentialFor(world),
      }),
    ).rejects.toThrow(/did not parse/);
    expect(world.store.recordCount).toBe(0);
  });

  it('retrieval without a registered contract fails closed', async () => {
    const world = buildTestWorld();
    await expect(
      world.retrieval.retrieve({
        transport: world.transport,
        connectionId: world.connectionId,
        providerName: TEST_PROVIDER,
        objectType: 'unknown-object-type',
        externalId: 'x',
        reason: 'OPERATOR_INITIATED',
        credential: credentialFor(world),
      }),
    ).rejects.toThrow(/no retrieval contract/);
  });

  it('malformed contract registrations and non-canonical reasons fail closed', () => {
    const service = new ProviderRetrievalService({
      store: new RawProviderStateStore(),
      clock: new DeterministicClock(0n),
    });
    expect(() =>
      service.registerContract({
        providerName: '',
        objectType: 'transfer',
        operationId: 'op' as never,
        supportsRevisionFetch: false,
        buildFetchParams: () => ({}),
        parseFetchResponse: () => undefined,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      service.registerContract({
        providerName: 'p',
        objectType: '',
        operationId: 'op' as never,
        supportsVersionFetch: false as never,
        supportsRevisionFetch: false,
        buildFetchParams: () => ({}),
        parseFetchResponse: () => undefined,
      } as never),
    ).toThrow(ValidationError);
  });
});

describe('the reconcile-before-retry evidence surface', () => {
  it('postAmbiguityRetrievalFor answers only for retrievals AFTER the ambiguity instant', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_5', revision: '2', status: 'succeeded' },
    });
    const ambiguousAt = world.clock.now();
    // Nothing yet at the ambiguity instant.
    expect(
      world.retrieval.postAmbiguityRetrievalFor(TEST_PROVIDER, 'transfer', 'trf_5', ambiguousAt),
    ).toBeUndefined();
    world.clock.advance(100);
    await world.retrieval.retrieve({
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_5',
      reason: 'RECONCILIATION_AFTER_AMBIGUITY',
      credential: credentialFor(world),
    });
    const entry = world.retrieval.postAmbiguityRetrievalFor(
      TEST_PROVIDER,
      'transfer',
      'trf_5',
      ambiguousAt,
    );
    expect(entry).toBeDefined();
    expect(entry?.provenance.reason).toBe('RECONCILIATION_AFTER_AMBIGUITY');
    // A retrieval from BEFORE the ambiguity does not satisfy the gate.
    expect(
      world.retrieval.postAmbiguityRetrievalFor(TEST_PROVIDER, 'transfer', 'trf_5', entry!.provenance.retrievedAt),
    ).toBeUndefined();
  });

  it('the ledger is append-only and carries full provenance per entry', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps({
      kind: 'DELIVERED',
      status: 200,
      body: { id: 'trf_1', revision: '1' },
    });
    await world.retrieval.retrieve({
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_1',
      reason: 'EVENT_LOSS_RECOVERY',
      credential: credentialFor(world),
    });
    const entries = world.retrieval.ledgerEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.provenance.reason).toBe('EVENT_LOSS_RECOVERY');
    expect(entries[0]?.rawStateRecordId.startsWith('raw:')).toBe(true);
    expect(JSON.stringify(entries, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(TEST_SECRET_API_KEY);
  });

  it('retrieval of the SAME provider revision replays idempotently in the store', async () => {
    const world = buildTestWorld();
    world.transport.scriptSteps(
      { kind: 'DELIVERED', status: 200, body: { id: 'trf_1', revision: '1', status: 'processing' } },
      { kind: 'DELIVERED', status: 200, body: { id: 'trf_1', revision: '1', status: 'processing' } },
    );
    const credential = credentialFor(world);
    const input = {
      transport: world.transport,
      connectionId: world.connectionId,
      providerName: TEST_PROVIDER,
      objectType: 'transfer',
      externalId: 'trf_1',
      reason: 'SCHEDULED_POLL' as const,
      credential,
    };
    await world.retrieval.retrieve(input);
    await world.retrieval.retrieve(input);
    // One retained revision (identical replay), two ledger entries (two fetches).
    expect(world.store.recordCount).toBe(1);
    expect(world.retrieval.ledgerEntries()).toHaveLength(2);
  });

  it('a deterministic fake transport cannot serve a live retrieval binding', () => {
    const transport = new ScriptedFakeTransport();
    expect(transport.transportClass).toBe('FAKE_DETERMINISTIC');
  });
});
