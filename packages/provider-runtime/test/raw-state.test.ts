import { describe, expect, it } from 'vitest';
import {
  RawProviderStateStore,
  identityNormalizer,
  orderingKey,
} from '../src/raw-state.ts';
import { RawStateConflictError, ValidationError } from '../src/errors.ts';

const SECRET = 'whsec_FAKE_secretDoNotUse';
const baseInput = {
  providerName: 'test-psp',
  objectType: 'transfer',
  externalId: 'trf_1',
  receivedAt: 1_000n,
  source: 'PROVIDER_RESPONSE' as const,
};

describe('raw provider-state retention (lossless, versioned, immutable)', () => {
  it('retains provider state verbatim when nothing is secret-shaped', () => {
    const store = new RawProviderStateStore();
    const record = store.append({
      ...baseInput,
      revision: '1',
      rawState: { status: 'processing', amount: '1200', currency: 'USD' },
    });
    expect(record.rawState).toEqual({ status: 'processing', amount: '1200', currency: 'USD' });
    expect(record.revision).toBe('1');
    expect(record.source).toBe('PROVIDER_RESPONSE');
    expect(record.redactionNotices).toHaveLength(0);
    expect(record.recordId.startsWith('raw:')).toBe(true);
  });

  it('redacts secret-shaped material AT THE BOUNDARY with auditable notices (INV-19)', () => {
    const store = new RawProviderStateStore();
    const record = store.append({
      ...baseInput,
      revision: '1',
      rawState: {
        status: 'processing',
        apiKey: SECRET,
        auth: `Bearer ${SECRET}`,
        metadata: { note: 'keep', signing_secret: SECRET },
      },
    });
    const state = record.rawState as Record<string, unknown>;
    // Provider semantics survive untouched...
    expect(state.status).toBe('processing');
    expect((state.metadata as Record<string, unknown>).note).toBe('keep');
    // ...secret material never does.
    expect(JSON.stringify(record.rawState)).not.toContain(SECRET);
    expect(record.redactionNotices.length).toBeGreaterThanOrEqual(3);
    expect(record.redactionNotices.every((n) => n.fingerprint.length === 16)).toBe(true);
  });

  it('identical re-record of the same revision is an idempotent replay', () => {
    const store = new RawProviderStateStore();
    const first = store.append({
      ...baseInput,
      revision: '7',
      rawState: { status: 'processing' },
    });
    const second = store.append({
      ...baseInput,
      revision: '7',
      rawState: { status: 'processing' },
    });
    expect(second.recordId).toBe(first.recordId);
    expect(store.recordCount).toBe(1);
  });

  it('a divergent re-record of the same revision is REFUSED (history never rewritten)', () => {
    const store = new RawProviderStateStore();
    store.append({ ...baseInput, revision: '7', rawState: { status: 'processing' } });
    expect(() =>
      store.append({ ...baseInput, revision: '7', rawState: { status: 'succeeded' } }),
    ).toThrow(RawStateConflictError);
  });

  it('non-monotonic provider transitions APPEND new revisions, never rewrite (INV-03)', () => {
    const store = new RawProviderStateStore();
    store.append({ ...baseInput, revision: '1', rawState: { status: 'processing' } });
    store.append({ ...baseInput, revision: '2', rawState: { status: 'succeeded' } });
    // The provider reports a non-monotonic transition (refund flows can do
    // this): a NEW revision is appended; the earlier facts are untouched.
    store.append({ ...baseInput, revision: '3', rawState: { status: 'refunded' } });
    const history = store.historyOf('test-psp', 'transfer', 'trf_1');
    expect(history.map((r) => r.revision)).toEqual(['1', '2', '3']);
    expect(history[0]?.rawState).toEqual({ status: 'processing' });
    expect(history[1]?.rawState).toEqual({ status: 'succeeded' });
    expect(history[2]?.rawState).toEqual({ status: 'refunded' });
    // Lineage fields persist on every record.
    const withLineage = store.append({
      ...baseInput,
      externalId: 'trf_2',
      revision: '1',
      correlationId: 'corr-9',
      commandId: 'cmd-9',
      rawState: { status: 'processing' },
    });
    expect(withLineage.correlationId).toBe('corr-9');
    expect(withLineage.commandId).toBe('cmd-9');
  });

  it('malformed appends fail closed', () => {
    const store = new RawProviderStateStore();
    expect(() => store.append({ ...baseInput, revision: '', rawState: {} })).toThrow(
      ValidationError,
    );
    expect(() =>
      store.append({ ...baseInput, revision: '1', rawState: {}, source: 'NOWHERE' as never }),
    ).toThrow(ValidationError);
    expect(() =>
      store.append({ ...baseInput, revision: '1', rawState: {}, receivedAt: 1 as never }),
    ).toThrow(ValidationError);
    expect(() => store.append({ ...baseInput, revision: '1', rawState: {}, providerName: '' })).toThrow(
      ValidationError,
    );
  });
});

describe('the stable PaySwap projection (ordering law + no regression)', () => {
  it('the projection tracks the newest observation by (time, arrival sequence)', () => {
    const store = new RawProviderStateStore();
    store.append({
      ...baseInput,
      revision: '1',
      occurredAt: 100n,
      rawState: { status: 'processing' },
    });
    store.append({
      ...baseInput,
      revision: '2',
      occurredAt: 200n,
      rawState: { status: 'succeeded' },
    });
    const projection = store.projectionOf('test-psp', 'transfer', 'trf_1');
    expect(projection?.latest.revision).toBe('2');
    expect(projection?.normalizedSummary).toEqual({ providerStatus: 'succeeded' });
    expect(projection?.history).toHaveLength(2);
  });

  it('an OUT-OF-ORDER (older) event is retained but NEVER regresses the projection', () => {
    const store = new RawProviderStateStore();
    store.append({
      ...baseInput,
      revision: '2',
      occurredAt: 200n,
      rawState: { status: 'succeeded' },
    });
    // A late-arriving older event (occurredAt 100) arrives AFTER the newer.
    store.append({
      ...baseInput,
      revision: '1',
      occurredAt: 100n,
      rawState: { status: 'processing' },
      source: 'PROVIDER_EVENT',
    });
    const projection = store.projectionOf('test-psp', 'transfer', 'trf_1');
    expect(projection?.latest.revision).toBe('2'); // canonical stays newest
    expect(projection?.history.map((r) => r.revision)).toEqual(['2', '1']); // history keeps arrival order
    expect(projection?.latest.rawState).toEqual({ status: 'succeeded' });
  });

  it('arrival-order sequence resolves exact-time ties toward the later arrival', () => {
    const store = new RawProviderStateStore();
    store.append({ ...baseInput, revision: 'a', occurredAt: 500n, rawState: { status: 'one' } });
    store.append({ ...baseInput, revision: 'b', occurredAt: 500n, rawState: { status: 'two' } });
    const projection = store.projectionOf('test-psp', 'transfer', 'trf_1');
    expect(projection?.latest.revision).toBe('b');
  });

  it('receivedAt substitutes when the provider supplies no occurrence time', () => {
    const store = new RawProviderStateStore();
    const first = store.append({ ...baseInput, revision: '1', rawState: { status: 'a' } });
    store.append({
      ...baseInput,
      revision: '2',
      receivedAt: first.receivedAt + 10n,
      rawState: { status: 'b' },
    });
    expect(store.projectionOf('test-psp', 'transfer', 'trf_1')?.latest.revision).toBe('2');
  });

  it('the ordering key is time-dominant with the sequence as tiebreak', () => {
    const a = {
      recordId: 'raw:1' as never,
      providerName: 'p',
      objectType: 't',
      externalId: 'e',
      revision: '1',
      receivedAt: 100n,
      source: 'PROVIDER_RESPONSE' as const,
      rawState: {},
      redactionNotices: [],
      contentHash: 'x',
      arrivalSequence: 1n,
    };
    const olderTimeLaterArrival = { ...a, occurredAt: 50n, arrivalSequence: 50n };
    const newerTimeEarlierArrival = { ...a, occurredAt: 60n, arrivalSequence: 1n };
    expect(orderingKey(olderTimeLaterArrival) < orderingKey(newerTimeEarlierArrival)).toBe(true);
  });

  it('unknown objects have no projection; history lookups are empty-safe', () => {
    const store = new RawProviderStateStore();
    expect(store.projectionOf('p', 't', 'missing')).toBeUndefined();
    expect(store.historyOf('p', 't', 'missing')).toEqual([]);
    expect(store.byRevision('p', 't', 'trf_1', '1')).toBeUndefined();
  });
});

describe('the additive normalizer (never erases provider semantics)', () => {
  it('the identity normalizer preserves the provider status vocabulary verbatim', () => {
    expect(identityNormalizer.normalize({ status: 'requires_action' })).toEqual({
      providerStatus: 'requires_action',
    });
    expect(identityNormalizer.normalize({ other: 1 })).toEqual({ preserved: true });
    expect(identityNormalizer.normalize(null)).toEqual({ preserved: true });
  });

  it('a custom normalizer derives the summary WITHOUT touching the retained raw state', () => {
    const store = new RawProviderStateStore({
      normalize: (rawState) => {
        const status = (rawState as { status?: string }).status;
        return Object.freeze({ phase: status === 'succeeded' ? 'DONE' : 'OPEN', raw: status });
      },
    });
    const record = store.append({
      ...baseInput,
      revision: '1',
      rawState: { status: 'succeeded', providerSemantics: { nested: { deep: 'verbatim' } } },
    });
    const projection = store.projectionOf('test-psp', 'transfer', 'trf_1');
    expect(projection?.normalizedSummary).toEqual({ phase: 'DONE', raw: 'succeeded' });
    // The raw state itself is untouched by normalization (lossless law).
    expect(record.rawState).toEqual({
      status: 'succeeded',
      providerSemantics: { nested: { deep: 'verbatim' } },
    });
  });
});
