import { describe, expect, it } from 'vitest';
import { DeterministicClock } from '../src/clock.ts';
import { ProviderEventIngestor, canonicalWebhookBody } from '../src/events.ts';
import { RawProviderStateStore } from '../src/raw-state.ts';
import { FakeSignatureVerifier } from './fake-transport.ts';

const SECRET = 'whsec_FAKE_secretDoNotUse';
const nowSeconds = 10_000;
const nowMs = BigInt(nowSeconds * 1000);

function delivery(overrides?: Partial<Parameters<ProviderEventIngestor['ingest']>[0]>) {
  return {
    providerName: 'test-psp',
    eventId: 'evt_1',
    signatureTimestamp: String(nowSeconds),
    eventCreatedAt: String(nowSeconds),
    payload: {
      objectType: 'transfer',
      externalId: 'trf_1',
      revision: '1',
      state: { status: 'processing', apiKey: SECRET },
    },
    signature: 'sig-opaque-FAKE',
    ...overrides,
  };
}

function buildIngestor(options?: {
  readonly verifier?: FakeSignatureVerifier;
  readonly unauthenticated?: readonly string[];
  readonly start?: bigint;
}) {
  const clock = new DeterministicClock(options?.start ?? nowMs);
  const store = new RawProviderStateStore();
  const deps: {
    clock: typeof clock;
    store: typeof store;
    verifier?: FakeSignatureVerifier;
    unauthenticatedProviders?: readonly string[];
  } = { clock, store };
  if (options?.verifier !== undefined) {
    deps.verifier = options.verifier;
  }
  if (options?.unauthenticated !== undefined) {
    deps.unauthenticatedProviders = options.unauthenticated;
  }
  const ingestor = new ProviderEventIngestor(deps);
  return { clock, store, ingestor, verifier: options?.verifier };
}

describe('authenticated ingestion (pluggable, opaque signatures)', () => {
  it('a validly signed delivery is INGESTED with retained raw payload reference', () => {
    const { ingestor, store } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    const outcome = ingestor.ingest(delivery());
    expect(outcome.kind).toBe('INGESTED');
    if (outcome.kind === 'INGESTED') {
      expect(outcome.record.eventId).toBe('evt_1');
      expect(outcome.record.processingOutcome).toBe('CANONICAL_ADVANCED');
      expect(outcome.record.rawPayloadRecordId).toBeDefined();
      // Creation + receipt times are BOTH persisted (Wise §4.4).
      expect(outcome.record.eventCreatedAt).toBe(nowMs);
      expect(outcome.record.receivedAt).toBe(nowMs);
      // The retained payload is redacted at the boundary (INV-19).
      const record = store.byRevision('test-psp', 'transfer', 'trf_1', '1');
      expect(JSON.stringify(record?.rawState)).not.toContain(SECRET);
      expect(record?.redactionNotices.length).toBeGreaterThan(0);
    }
  });

  it('an INVALID signature is REJECTED before any retention (verifier plugging)', () => {
    const verifier = new FakeSignatureVerifier().rejectEventId('evt_1');
    const { ingestor, store } = buildIngestor({ verifier });
    const outcome = ingestor.ingest(delivery());
    expect(outcome.kind).toBe('REJECTED');
    if (outcome.kind === 'REJECTED') expect(outcome.reason).toBe('SIGNATURE_INVALID');
    expect(store.recordCount).toBe(0);
    expect(ingestor.recordFor('test-psp', 'evt_1')).toBeUndefined();
  });

  it('a forged signature VALUE is rejected (the fake verifier refuses the value)', () => {
    const verifier = new FakeSignatureVerifier().rejectSignature('sig-forged');
    const { ingestor } = buildIngestor({ verifier });
    const outcome = ingestor.ingest(delivery({ signature: 'sig-forged' }));
    expect(outcome.kind).toBe('REJECTED');
    if (outcome.kind === 'REJECTED') expect(outcome.reason).toBe('SIGNATURE_INVALID');
  });

  it('without a verifier, ingestion is refused unless the provider is declared unauthenticated', () => {
    const closed = buildIngestor();
    const refused = closed.ingestor.ingest(delivery());
    expect(refused.kind).toBe('REJECTED');
    if (refused.kind === 'REJECTED') expect(refused.reason).toBe('UNAUTHENTICATED_PROVIDER_REFUSED');

    const open = buildIngestor({ unauthenticated: ['test-psp'] });
    const accepted = open.ingestor.ingest(delivery());
    expect(accepted.kind).toBe('INGESTED');
  });

  it('stale signature timestamps (outside the replay window) are rejected', () => {
    const { ingestor } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    const stale = ingestor.ingest(
      delivery({ signatureTimestamp: String(nowSeconds - 301) }),
    );
    expect(stale.kind).toBe('REJECTED');
    if (stale.kind === 'REJECTED') expect(stale.reason).toBe('TIMESTAMP_OUTSIDE_WINDOW');
  });

  it('unreasonably FUTURE signature timestamps are rejected (skew bound)', () => {
    const { ingestor } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    const future = ingestor.ingest(
      delivery({ signatureTimestamp: String(nowSeconds + 60) }),
    );
    expect(future.kind).toBe('REJECTED');
    if (future.kind === 'REJECTED') expect(future.reason).toBe('FUTURE_TIMESTAMP');
  });

  it('malformed deliveries are rejected without crashing the ingestor', () => {
    const { ingestor } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    const cases = [
      delivery({ eventId: '' }),
      delivery({ providerName: '' }),
      delivery({ signatureTimestamp: 'not-a-number' }),
      delivery({ eventCreatedAt: 'nope' }),
      delivery({ signature: '' }),
      null as never,
    ];
    for (const candidate of cases) {
      const outcome = ingestor.ingest(candidate);
      expect(outcome.kind).toBe('REJECTED');
      if (outcome.kind === 'REJECTED') expect(outcome.reason).toBe('MALFORMED_DELIVERY');
    }
  });

  it('the canonical body is deterministic BYTE-LEVEL JSON (providers sign bytes)', () => {
    // Same value in the same key order → identical canonical bytes.
    expect(canonicalWebhookBody({ b: 1, a: 2 })).toBe(canonicalWebhookBody({ b: 1, a: 2 }));
    // Key order is PART of the signed bytes (byte-level signing semantics —
    // the ingestor canonicalizes the payload exactly as received).
    expect(canonicalWebhookBody({ b: 1, a: 2 })).not.toBe(canonicalWebhookBody({ a: 2, b: 1 }));
    expect(canonicalWebhookBody(null)).toBe('null');
    expect(canonicalWebhookBody(undefined)).toBe('null');
  });
});

describe('duplicate delivery is harmless', () => {
  it('the same (provider, eventId) is ingested exactly once; duplicates replay the original', () => {
    const { ingestor, store } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    const first = ingestor.ingest(delivery());
    expect(first.kind).toBe('INGESTED');
    const second = ingestor.ingest(delivery());
    expect(second.kind).toBe('DUPLICATE');
    if (second.kind === 'DUPLICATE') {
      expect(second.originalRecord.eventId).toBe('evt_1');
      expect(second.originalRecord.processingOutcome).toBe('CANONICAL_ADVANCED');
    }
    // No second retention, no second raw-state record.
    expect(store.recordCount).toBe(1);
    const log = ingestor.ingestionLog();
    expect(log).toHaveLength(2);
    expect(log.filter((entry) => entry.kind === 'INGESTED')).toHaveLength(1);
  });

  it('the same eventId for a DIFFERENT provider is a distinct event', () => {
    const { ingestor } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    expect(ingestor.ingest(delivery()).kind).toBe('INGESTED');
    const other = ingestor.ingest(delivery({ providerName: 'other-psp' }));
    expect(other.kind).toBe('INGESTED');
  });
});

describe('out-of-order events cannot regress canonical state', () => {
  it('a late OLDER event is retained but flagged SUPERSEDED; canonical stays newest', () => {
    const { ingestor, store } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    // Newer event first (occurred at t+10).
    ingestor.ingest(
      delivery({
        eventId: 'evt_new',
        eventCreatedAt: String(nowSeconds + 10),
        payload: {
          objectType: 'transfer',
          externalId: 'trf_1',
          revision: '2',
          state: { status: 'succeeded' },
        },
      }),
    );
    // Late older event arrives after (occurred at t).
    const late = ingestor.ingest(delivery({ eventId: 'evt_old' }));
    expect(late.kind).toBe('INGESTED');
    if (late.kind === 'INGESTED') {
      expect(late.record.processingOutcome).toBe('SUPERSEDED_BY_NEWER_OBSERVATION');
    }
    const projection = store.projectionOf('test-psp', 'transfer', 'trf_1');
    expect(projection?.latest.revision).toBe('2');
    expect(projection?.latest.rawState).toEqual({ status: 'succeeded' });
    expect(projection?.history).toHaveLength(2);
  });

  it('a genuinely newer event ADVANCES the canonical projection', () => {
    const { ingestor, store } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    ingestor.ingest(delivery({ eventId: 'evt_1' }));
    const next = ingestor.ingest(
      delivery({
        eventId: 'evt_2',
        eventCreatedAt: String(nowSeconds + 5),
        payload: {
          objectType: 'transfer',
          externalId: 'trf_1',
          revision: '2',
          state: { status: 'succeeded' },
        },
      }),
    );
    expect(next.kind).toBe('INGESTED');
    if (next.kind === 'INGESTED') expect(next.record.processingOutcome).toBe('CANONICAL_ADVANCED');
    expect(store.projectionOf('test-psp', 'transfer', 'trf_1')?.latest.revision).toBe('2');
  });

  it('events without extractable object state are retained with NO_OBJECT_STATE outcome', () => {
    const { ingestor } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    const outcome = ingestor.ingest(
      delivery({ eventId: 'evt_flat', payload: { hello: 'world' } }),
    );
    expect(outcome.kind).toBe('INGESTED');
    if (outcome.kind === 'INGESTED') {
      expect(outcome.record.processingOutcome).toBe('RETAINED_WITHOUT_OBJECT_STATE');
      expect(outcome.record.rawPayloadRecordId).toBeUndefined();
    }
  });

  it('the naive extractor handles root and nested `object` payload shapes', () => {
    const { ingestor, store } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    ingestor.ingest(
      delivery({
        eventId: 'evt_nested',
        payload: {
          object: { objectType: 'transfer', externalId: 'trf_9', revision: '5', state: { status: 'x' } },
        },
      }),
    );
    expect(store.byRevision('test-psp', 'transfer', 'trf_9', '5')).toBeDefined();
  });
});

describe('event record shape (identifiers + times + outcome only)', () => {
  it('records carry correlation lineage and never secret material', () => {
    const { ingestor } = buildIngestor({ verifier: new FakeSignatureVerifier() });
    const outcome = ingestor.ingest(delivery(), {
      correlationId: 'corr-42' as never,
    });
    expect(outcome.kind).toBe('INGESTED');
    if (outcome.kind === 'INGESTED') {
      expect(outcome.record.correlationId).toBe('corr-42');
      expect(JSON.stringify(outcome.record, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(SECRET);
      expect(JSON.stringify(outcome.record, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain('sig-opaque-FAKE');
    }
  });

  it('the ingestion log is append-only and covers every outcome kind', () => {
    const verifier = new FakeSignatureVerifier().rejectEventId('evt_bad');
    const { ingestor } = buildIngestor({ verifier });
    ingestor.ingest(delivery());
    ingestor.ingest(delivery());
    ingestor.ingest(delivery({ eventId: 'evt_bad' }));
    const log = ingestor.ingestionLog();
    expect(log.map((entry) => entry.kind)).toEqual(['INGESTED', 'DUPLICATE', 'REJECTED']);
  });
});
