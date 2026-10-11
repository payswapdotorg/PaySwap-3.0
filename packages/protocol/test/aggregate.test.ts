import { describe, expect, it } from 'vitest';
import {
  AggregateMismatchError,
  DeterministicClock,
  type DomainEventEnvelope,
  EventSourcedAggregate,
  EventVersionConflictError,
  TerminalState,
  ValidationError,
  asAggregateId,
  asEventId,
  createEventEnvelope,
  createIdFactory,
  requiresReconciliation,
} from '../src/index.ts';

interface CounterState {
  count: bigint;
}

class CounterAggregate extends EventSourcedAggregate {
  private readonly _state: { count: bigint } = { count: 0n };

  constructor(id: string, ids = createIdFactory(new DeterministicClock(0n)), clock = new DeterministicClock(0n)) {
    super({ aggregateType: 'counter', id: asAggregateId(id), ids, clock });
  }

  get count(): bigint {
    return this._state.count;
  }

  protected evolve(event: DomainEventEnvelope<unknown>): void {
    const payload = event.payload as { delta?: bigint };
    if (typeof payload?.delta === 'bigint') {
      this._state.count += payload.delta;
    }
  }

  increment(delta: bigint): DomainEventEnvelope<unknown> {
    return this.raise('counter.incremented', { delta });
  }
}

describe('event-sourced aggregates (ported from old aggregate.test.ts)', () => {
  it('constructs with a validated aggregate type and id', () => {
    const agg = new CounterAggregate('agg-1');
    expect(agg.aggregateType).toBe('counter');
    expect(agg.id).toBe('agg-1');
    expect(agg.version).toBe(0n);
    expect(agg.pendingEvents).toEqual([]);
  });

  it('rejects invalid aggregateType via the base constructor', () => {
    const make = (aggregateType: string) =>
      new (class extends EventSourcedAggregate {
        protected evolve(): void {}
        constructor() {
          super({
            aggregateType,
            id: asAggregateId('a'),
            ids: createIdFactory(new DeterministicClock(0n)),
            clock: new DeterministicClock(0n),
          });
        }
      })();
    expect(() => make('Counter')).toThrow(ValidationError); // must start lowercase
    expect(() => make('bad type')).toThrow(ValidationError);
    expect(() => make('ok.type-x')).not.toThrow();
  });

  it('raise() builds enveloped events at consecutive versions and applies them', () => {
    const agg = new CounterAggregate('agg-1');
    const e1 = agg.increment(1n);
    const e2 = agg.increment(2n);
    expect(e1.aggregate.version).toBe(1n);
    expect(e2.aggregate.version).toBe(2n);
    expect(agg.version).toBe(2n);
    expect(agg.count).toBe(3n);
    expect(agg.pendingEvents).toHaveLength(2);
  });

  it('apply() rejects events at the wrong version (optimistic concurrency)', () => {
    const agg = new CounterAggregate('agg-1');
    const clock = new DeterministicClock(0n);
    const ids = createIdFactory(clock);
    const foreign = createEventEnvelope(
      {
        eventType: 'counter.incremented',
        payload: { delta: 1n },
        aggregate: { id: asAggregateId('agg-1'), version: 5n },
        schemaVersion: 1,
      },
      { ids, clock },
    );
    expect(() => agg.apply(foreign)).toThrow(EventVersionConflictError);
  });

  it('apply() rejects events belonging to a different stream', () => {
    const agg = new CounterAggregate('agg-1');
    const clock = new DeterministicClock(0n);
    const foreign = createEventEnvelope(
      {
        eventType: 'counter.incremented',
        payload: { delta: 1n },
        aggregate: { id: asAggregateId('agg-OTHER'), version: 1n },
        schemaVersion: 1,
      },
      { ids: createIdFactory(clock), clock },
    );
    expect(() => agg.apply(foreign)).toThrow(AggregateMismatchError);
  });

  it('pendingEvents are frozen copies; markCommitted clears them', () => {
    const agg = new CounterAggregate('agg-1');
    agg.increment(1n);
    const pending = agg.pendingEvents;
    expect(Object.isFrozen(pending)).toBe(true);
    agg.markCommitted();
    expect(agg.pendingEvents).toEqual([]);
    expect(agg.version).toBe(1n); // version survives commit
  });

  it('rehydrate() deterministically rebuilds state from history', () => {
    const source = new CounterAggregate('agg-1');
    source.increment(1n);
    source.increment(2n);
    source.increment(3n);
    const history = source.pendingEvents;
    source.markCommitted();

    const replica = new CounterAggregate('agg-1');
    replica.rehydrate(history);
    expect(replica.count).toBe(6n);
    expect(replica.version).toBe(3n);
    expect(replica.pendingEvents).toEqual([]); // rehydrated events never become pending
  });

  it('rehydrate() requires strictly consecutive versions continuing from current', () => {
    const agg = new CounterAggregate('agg-1');
    agg.increment(1n);
    const history = agg.pendingEvents;
    agg.markCommitted();
    // replaying the same history again from version 1 conflicts (already at 1)
    expect(() => agg.rehydrate(history)).toThrow(EventVersionConflictError);

    const clock = new DeterministicClock(0n);
    const gap = createEventEnvelope(
      {
        eventType: 'counter.incremented',
        payload: {},
        aggregate: { id: asAggregateId('agg-1'), version: 9n },
        schemaVersion: 1,
      },
      { ids: createIdFactory(clock), clock },
    );
    expect(() => agg.rehydrate([gap])).toThrow(EventVersionConflictError);
  });

  it('rehydrate() validates the ENTIRE history before folding (all-or-nothing)', () => {
    const agg = new CounterAggregate('agg-1');
    const clock = new DeterministicClock(0n);
    const ids = createIdFactory(clock);
    const events = [1n, 3n].map((version) =>
      createEventEnvelope(
        {
          eventType: 'counter.incremented',
          payload: { delta: 1n },
          aggregate: { id: asAggregateId('agg-1'), version },
          schemaVersion: 1,
        },
        { ids, clock },
      ),
    );
    expect(() => agg.rehydrate(events)).toThrow(EventVersionConflictError);
    expect(agg.version).toBe(0n); // not half-rehydrated
  });

  it('rehydrate() refuses an aggregate with uncommitted pending events', () => {
    const agg = new CounterAggregate('agg-1');
    agg.increment(1n);
    expect(() => agg.rehydrate([])).toThrow(ValidationError);
  });

  it('same history always produces the same state (deterministic fold)', () => {
    const source = new CounterAggregate('agg-1');
    source.increment(7n);
    source.increment(-3n);
    const history = source.pendingEvents;
    const a = new CounterAggregate('agg-1');
    const b = new CounterAggregate('agg-1');
    a.rehydrate(history);
    b.rehydrate(history);
    expect(a.count).toBe(b.count);
    expect(a.version).toBe(b.version);
  });
});

describe('TerminalState vocabulary (INV-04 marker)', () => {
  it('UNKNOWN is the reconciliation-required terminal state', () => {
    expect(TerminalState.UNKNOWN).toBe('UNKNOWN');
    expect(requiresReconciliation(TerminalState.UNKNOWN)).toBe(true);
    expect(requiresReconciliation(TerminalState.FAILED)).toBe(false);
    expect(requiresReconciliation(TerminalState.FULFILLED)).toBe(false);
    expect(requiresReconciliation(TerminalState.CANCELLED)).toBe(false);
    expect(requiresReconciliation(TerminalState.EXPIRED)).toBe(false);
  });

  it('the frozen vocabulary is exactly the nine canonical states', () => {
    expect(Object.keys(TerminalState).sort()).toEqual(
      [
        'CANCELLED',
        'COMPLIANCE_BLOCKED',
        'EXPIRED',
        'FAILED',
        'FULFILLED',
        'NO_VIABLE_ROUTE',
        'UNKNOWN',
        'USER_ACTION_REQUIRED',
        'WAITING',
      ].sort(),
    );
    expect(Object.isFrozen(TerminalState)).toBe(true);
  });
});

describe('event id branding sanity', () => {
  it('envelope ids are branded strings', () => {
    const clock = new DeterministicClock(0n);
    const env = createEventEnvelope(
      {
        eventType: 'x',
        payload: {},
        aggregate: { id: asAggregateId('a'), version: 1n },
        schemaVersion: 1,
      },
      { ids: createIdFactory(clock), clock },
    );
    expect(asEventId(env.id)).toBe(env.id);
  });
});
