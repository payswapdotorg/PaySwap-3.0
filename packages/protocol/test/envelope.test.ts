import { describe, expect, it } from 'vitest';
import {
  DeterministicClock,
  InvalidIdentifierError,
  PROTOCOL_SCHEMA_VERSION,
  ValidationError,
  asAggregateId,
  asCommandId,
  asEventId,
  asIdempotencyScopeId,
  asIntentId,
  canonicalScopeKey,
  createCommandEnvelope,
  createEventEnvelope,
  createIdFactory,
  idempotencyScopeId,
} from '../src/index.ts';

describe('identifiers (ported from old identifiers/envelope tests)', () => {
  it('brands validate shape: non-empty, <= 256 chars, no surrounding whitespace', () => {
    expect(asCommandId('cmd-1')).toBe('cmd-1');
    expect(asEventId('evt-1')).toBe('evt-1');
    expect(asAggregateId('agg-1')).toBe('agg-1');
    expect(asIntentId('int-1')).toBe('int-1');
    expect(asIdempotencyScopeId('scope-1')).toBe('scope-1');
    for (const bad of ['', '  ', ' x', 'x ', 'x'.repeat(257)]) {
      expect(() => asCommandId(bad)).toThrow(InvalidIdentifierError);
      expect(() => asEventId(bad)).toThrow(InvalidIdentifierError);
    }
  });

  it('the id factory mints deterministic prefix_now_monotonic ids', () => {
    const clock = new DeterministicClock(1_000n);
    const ids = createIdFactory(clock);
    expect(ids.mintId('cmd')).toBe(`cmd_1000_1`);
    expect(ids.mintId('cmd')).toBe(`cmd_1000_2`);
    clock.advanceMs(5n);
    expect(ids.mintId('evt')).toBe(`evt_1005_3`);
  });

  it('two factories on one clock still mint distinct ids (shared monotonic)', () => {
    const clock = new DeterministicClock(0n);
    const a = createIdFactory(clock);
    const b = createIdFactory(clock);
    expect(a.mintId('cmd')).not.toBe(b.mintId('cmd'));
  });

  it('rejects invalid prefixes and separators', () => {
    const clock = new DeterministicClock(0n);
    const ids = createIdFactory(clock);
    for (const bad of ['', 'bad prefix', 'x'.repeat(33), '-lead']) {
      expect(() => ids.mintId(bad)).toThrow(InvalidIdentifierError);
    }
    expect(() => createIdFactory(clock, { separator: '' })).toThrow(ValidationError);
    expect(() => createIdFactory(clock, { separator: 'waytoolongseparator' })).toThrow(ValidationError);
    expect(() => createIdFactory(clock, { separator: '::' })).not.toThrow();
  });
});

describe('envelopes: deterministic command/event with full lineage', () => {
  const clock = new DeterministicClock(2_000n);
  const ids = createIdFactory(clock);
  const deps = { ids, clock };
  const principal = { principalType: 'user', principalId: 'u-1' };

  it('creates a frozen command envelope with deterministic id + injected clock', () => {
    const command = createCommandEnvelope(
      {
        commandType: 'money.reserve',
        payload: { amount: 10n },
        principalRef: principal,
        idempotencyKey: 'key-1',
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
      },
      deps,
    );
    expect(command.id).toBe('cmd_2000_1');
    expect(command.commandType).toBe('money.reserve');
    expect(command.issuedAt).toBe(2000n);
    expect(command.idempotencyKey).toBe('key-1');
    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.principalRef)).toBe(true);
  });

  it('causationId and correlationId survive end-to-end when provided', () => {
    const cause = asEventId('evt-origin');
    const command = createCommandEnvelope(
      {
        commandType: 'money.reserve',
        payload: {},
        principalRef: principal,
        idempotencyKey: 'key-2',
        causationId: cause,
        correlationId: 'conv-42',
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
      },
      deps,
    );
    expect(command.causationId).toBe(cause);
    expect(command.correlationId).toBe('conv-42');
  });

  it('creates a frozen event envelope bound to a versioned aggregate', () => {
    const event = createEventEnvelope(
      {
        eventType: 'money.reserved',
        payload: { amount: 10n },
        aggregate: { id: asAggregateId('agg-1'), version: 1n },
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
      },
      deps,
    );
    expect(event.id).toBe('evt_2000_3');
    expect(event.aggregate.id).toBe('agg-1');
    expect(event.aggregate.version).toBe(1n);
    expect(event.occurredAt).toBe(2000n);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('validates envelope inputs (types, keys, versions, principals)', () => {
    expect(() =>
      createCommandEnvelope(
        {
          commandType: '  bad  ',
          payload: {},
          principalRef: principal,
          idempotencyKey: 'k',
          schemaVersion: 1,
        },
        deps,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      createCommandEnvelope(
        {
          commandType: 'ok',
          payload: {},
          principalRef: { principalType: '', principalId: '' },
          idempotencyKey: 'k',
          schemaVersion: 1,
        },
        deps,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      createCommandEnvelope(
        {
          commandType: 'ok',
          payload: {},
          principalRef: principal,
          idempotencyKey: '',
          schemaVersion: 1,
        },
        deps,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      createEventEnvelope(
        {
          eventType: 'ok',
          payload: {},
          aggregate: { id: asAggregateId('agg'), version: 0n },
          schemaVersion: 1,
        },
        deps,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      createEventEnvelope(
        {
          eventType: 'ok',
          payload: {},
          aggregate: { id: asAggregateId('agg'), version: 1n },
          schemaVersion: 0,
        },
        deps,
      ),
    ).toThrow(ValidationError);
  });

  it('same inputs + same clock state produce byte-identical envelopes (determinism)', () => {
    const clockA = new DeterministicClock(5_000n);
    const clockB = new DeterministicClock(5_000n);
    const options = {
      commandType: 'money.reserve',
      payload: { n: 1n },
      principalRef: principal,
      idempotencyKey: 'same',
      schemaVersion: 1,
    } as const;
    const a = createCommandEnvelope(options, { ids: createIdFactory(clockA), clock: clockA });
    const b = createCommandEnvelope(options, { ids: createIdFactory(clockB), clock: clockB });
    expect(a).toEqual(b);
  });
});

describe('idempotency scope keys', () => {
  it('canonicalScopeKey is the unambiguous JSON array form', () => {
    const scope = { commandType: 'settlement.attempt', principal: { principalType: 'svc', principalId: 'x' }, key: 'k1' };
    expect(canonicalScopeKey(scope)).toBe('["settlement.attempt","svc","x","k1"]');
    expect(idempotencyScopeId(scope)).toBe('["settlement.attempt","svc","x","k1"]');
  });
});
