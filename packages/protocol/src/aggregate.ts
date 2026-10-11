/**
 * @payswap/protocol — authoritative aggregate boundaries (P1-W2).
 *
 * Adapted from payswap.org@8a735bf packages/protocol/src/aggregate.ts
 * (old Work Order W1-001; old FROZEN-ARCHITECTURE §22 terminal states map to
 * the canonical PaySwap 3.0 state vocabulary, canonical INV-04 for UNKNOWN).
 *
 * An aggregate is an event-sourced fold: `rehydrate(events)` deterministically
 * rebuilds state from history, `apply(event)` admits the next event under an
 * optimistic-concurrency version check, `pendingEvents` exposes uncommitted
 * events and `markCommitted()` acknowledges their durable write.
 *
 * `UNKNOWN` carries the type-level marker
 * `TerminalStateRequiringReconciliation`: an aggregate resting in UNKNOWN
 * MUST be reconciled (INV-04) before its outcome is treated as known.
 */

import { PaySwapError, ValidationError, type PaySwapErrorDetails } from './errors.ts';
import type { ProtocolClock } from './clock.ts';
import type { IdFactory } from './identifiers.ts';
import { asAggregateId, type AggregateId } from './identifiers.ts';
import {
  createEventEnvelope,
  PROTOCOL_SCHEMA_VERSION,
  type DomainEventEnvelope,
  type EventLineage,
} from './envelope.ts';

/**
 * The terminal state set (adapted from old FROZEN-ARCHITECTURE §22).
 * Frozen const object + union type (runtime-enum-free so plain Node
 * type-stripping can import the package).
 */
export const TerminalState = Object.freeze({
  FULFILLED: 'FULFILLED',
  WAITING: 'WAITING',
  USER_ACTION_REQUIRED: 'USER_ACTION_REQUIRED',
  NO_VIABLE_ROUTE: 'NO_VIABLE_ROUTE',
  COMPLIANCE_BLOCKED: 'COMPLIANCE_BLOCKED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
} as const);
export type TerminalState = (typeof TerminalState)[keyof typeof TerminalState];

/**
 * Type-level marker: the only terminal state that carries a mandatory
 * reconciliation obligation (INV-04 — UNKNOWN always requires reconciliation).
 */
export type TerminalStateRequiringReconciliation = (typeof TerminalState)['UNKNOWN'];

/** Evidence-bearing obligation that an ambiguous outcome be reconciled. */
export interface ReconciliationObligation {
  readonly terminalState: TerminalStateRequiringReconciliation;
  readonly requiresReconciliation: true;
}

/** Runtime narrowing: is this terminal state the reconciliation-required one? */
export function requiresReconciliation(state: TerminalState): state is TerminalStateRequiringReconciliation {
  return state === TerminalState.UNKNOWN;
}

/** Optimistic-concurrency violation: event version ≠ expected next version. */
export class EventVersionConflictError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'EVENT_VERSION_CONFLICT', category: 'CONFLICT', message, details });
  }
}

/** Event envelope targets a different aggregate stream. */
export class AggregateMismatchError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'AGGREGATE_MISMATCH', category: 'VALIDATION', message, details });
  }
}

export interface AggregateInit {
  readonly aggregateType: string;
  readonly id: AggregateId;
  readonly ids: IdFactory;
  readonly clock: ProtocolClock;
}

const AGGREGATE_TYPE_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/;

/**
 * Base class for event-sourced protocol aggregates.
 *
 * Contract:
 * - `rehydrate(events)` — deterministic fold; the same history always
 *   produces the same state and version. Rehydrating requires strictly
 *   consecutive 1-based versions continuing from the current version.
 * - `apply(event)` — admits one event at `version + 1n` or throws
 *   `EventVersionConflictError`; the event becomes pending.
 * - `raise(...)` — protected helper for subclasses: builds a properly
 *   enveloped event at the next version (injected ids/clock, optional
 *   lineage) and applies it.
 * - `pendingEvents` — uncommitted events, frozen copies.
 * - `markCommitted()` — clears pending events after their journal+outbox
 *   write is durably committed (the same-transaction rule applies at the
 *   persistence layer — DEFERRED, see the deferral register).
 *
 * Subclasses implement `evolve(event)` — it must be a pure state fold of the
 * event payload (no I/O, no ambient time/entropy).
 */
export abstract class EventSourcedAggregate {
  private readonly _aggregateType: string;
  private readonly _id: AggregateId;
  private readonly _ids: IdFactory;
  private readonly _clock: ProtocolClock;
  private _version: bigint;
  private _pending: readonly DomainEventEnvelope<unknown>[];

  protected constructor(init: AggregateInit) {
    if (typeof init.aggregateType !== 'string' || !AGGREGATE_TYPE_PATTERN.test(init.aggregateType)) {
      throw new ValidationError(
        'aggregateType must match [a-z][a-z0-9.-]{0,63}',
        { aggregateType: init.aggregateType },
      );
    }
    this._aggregateType = init.aggregateType;
    this._id = asAggregateId(init.id);
    this._ids = init.ids;
    this._clock = init.clock;
    this._version = 0n;
    this._pending = [];
  }

  get aggregateType(): string {
    return this._aggregateType;
  }

  get id(): AggregateId {
    return this._id;
  }

  /** Version of the last applied event (0 for an empty history). */
  get version(): bigint {
    return this._version;
  }

  get pendingEvents(): readonly DomainEventEnvelope<unknown>[] {
    return Object.freeze([...this._pending]);
  }

  /** Pure state fold implemented by the concrete aggregate. */
  protected abstract evolve(event: DomainEventEnvelope<unknown>): void;

  /** Build + apply a new event at the next stream version. */
  protected raise(
    eventType: string,
    payload: unknown,
    lineage?: EventLineage,
  ): DomainEventEnvelope<unknown> {
    const event = createEventEnvelope(
      {
        eventType,
        payload,
        aggregate: { id: this._id, version: this._version + 1n },
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        ...(lineage ?? {}),
      },
      { ids: this._ids, clock: this._clock },
    );
    this.apply(event);
    return event;
  }

  /** Admit one externally-built event with an OCC version check. */
  apply(event: DomainEventEnvelope<unknown>): void {
    this.assertEventTargetsThis(event);
    const expected = this._version + 1n;
    if (event.aggregate.version !== expected) {
      throw new EventVersionConflictError(
        'event version does not match the expected next version',
        {
          aggregateType: this._aggregateType,
          aggregateId: this._id,
          expected: expected.toString(),
          actual: event.aggregate.version.toString(),
        },
      );
    }
    this.evolve(event);
    this._pending = [...this._pending, event];
    this._version = event.aggregate.version;
  }

  /**
   * Deterministically fold committed history into this instance.
   * Versions must be consecutive and continue from the current version;
   * rehydrated events never become pending.
   *
   * The ENTIRE history is validated before any event is folded, so an
   * invalid history (gap, repeat, foreign stream) never leaves this
   * aggregate half-rehydrated — state reconstruction is all-or-nothing.
   */
  rehydrate(events: readonly DomainEventEnvelope<unknown>[]): void {
    if (this._pending.length !== 0) {
      throw new ValidationError(
        'cannot rehydrate an aggregate that still has uncommitted pending events',
        { aggregateType: this._aggregateType, aggregateId: this._id },
      );
    }
    let cursor = this._version;
    for (const event of events) {
      this.assertEventTargetsThis(event);
      const expected = cursor + 1n;
      if (event.aggregate.version !== expected) {
        throw new EventVersionConflictError(
          'history is not strictly consecutive from the current version',
          {
            aggregateType: this._aggregateType,
            aggregateId: this._id,
            expected: expected.toString(),
            actual: event.aggregate.version.toString(),
          },
        );
      }
      cursor = event.aggregate.version;
    }
    for (const event of events) {
      this.evolve(event);
      this._version = event.aggregate.version;
    }
  }

  /** Acknowledge that pending events are durably committed. */
  markCommitted(): void {
    this._pending = [];
  }

  private assertEventTargetsThis(event: DomainEventEnvelope<unknown>): void {
    if (event === null || typeof event !== 'object' || typeof event.aggregate?.id !== 'string') {
      throw new AggregateMismatchError('event envelope is malformed', {
        aggregateType: this._aggregateType,
      });
    }
    if (event.aggregate.id !== this._id) {
      throw new AggregateMismatchError('event belongs to a different aggregate stream', {
        aggregateId: this._id,
        eventAggregateId: event.aggregate.id,
      });
    }
  }
}
