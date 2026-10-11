/**
 * @payswap/protocol — persistence CONTRACT TYPES (P1-W2).
 *
 * Ported (types only) from payswap.org@8a735bf packages/protocol/src/
 * persistence.ts and outbox.ts (old Work Order W1-001/W1-002). Per the
 * P1-W2 work order, persistence ADAPTERS are DEFERRED (infrastructure
 * decision pending): no DB drivers, no connection code, and deliberately NO
 * PostgreSQL DDL reference strings (the old repo shipped documented DDL —
 * payswap.org@8a735bf packages/protocol/src/persistence.ts EVENT_JOURNAL_DDL
 * etc. — which prejudges the infrastructure decision; carrying it forward
 * is deferred with it). The old durable outbox implementation
 * (InMemoryOutbox + drain fail-stop semantics) is likewise DEFERRED — only
 * the wire-neutral contract types below are ported so later Work Orders
 * implement against a stable surface.
 *
 * Invariants encoded in the contract shapes:
 * - Historical facts immutable/versioned (INV-03): the event journal is
 *   append-only; `appendEvents` has no update/delete counterpart.
 * - Optimistic concurrency: UNIQUE (stream, version) semantics; violations
 *   surface as `EVENT_VERSION_CONFLICT`.
 * - Atomic commit (contract): journal append + outbox insert happen in ONE
 *   transaction (`commitAtomically`) — a committed financial mutation can
 *   never silently lose its outbox event.
 * - Projections are rebuildable from the journal (replay law).
 * - Schema migrations are expand/contract, additive-first, verified by
 *   ordered `verify()` steps (deployment compatibility).
 */

import type { TimestampMs } from './clock.ts';
import type { AggregateId, EventId } from './identifiers.ts';

/** One journalled event, exactly as persisted. */
export interface JournalEventRecord {
  readonly eventId: EventId;
  readonly aggregateType: string;
  readonly aggregateId: AggregateId;
  readonly version: bigint;
  readonly eventType: string;
  readonly payload: unknown;
  readonly occurredAt: TimestampMs;
}

/** One outbox message tied to a journalled event. */
export interface OutboxMessage {
  readonly eventId: EventId;
  readonly dispatchType: string;
  readonly payload: unknown;
}

/**
 * The atomic commit unit: journal append + outbox insert in one transaction.
 *
 * `expectedVersion` is the aggregate version the caller believes is current
 * (optimistic concurrency); a mismatch or a UNIQUE (aggregate, version)
 * violation surfaces as `EVENT_VERSION_CONFLICT`.
 */
export interface AtomicEventCommit {
  readonly aggregateId: AggregateId;
  readonly expectedVersion: bigint;
  readonly events: readonly JournalEventRecord[];
  readonly outbox: readonly OutboxMessage[];
}

/**
 * Journal read/write contract. `appendEvents` MUST join the caller's
 * transaction; it MUST NOT commit independently. Implementations enforce
 * append-only history (INV-03): there is no update or delete operation.
 */
export interface EventJournalStore {
  appendEvents(commit: AtomicEventCommit): readonly JournalEventRecord[];
  eventsForAggregate(aggregateId: AggregateId): readonly JournalEventRecord[];
}

/**
 * Outbox read/claim contract (dispatch side). `claimPending` MUST be
 * atomic; `markDispatched` MUST be idempotent.
 */
export interface OutboxStore {
  enqueue(messages: readonly OutboxMessage[]): void;
  claimPending(limit: number): readonly OutboxMessage[];
  markDispatched(eventIds: readonly EventId[]): void;
}

/**
 * One ordered migration step. `verify()` runs BEFORE `apply()`; a failed
 * verify aborts the step (expand/contract discipline: additive-first, no
 * destructive change without a declared deprecation window).
 */
export interface MigrationStep {
  readonly id: string;
  readonly description: string;
  verify(): void;
  apply(): void;
}

/** Ordered migration plan (deployment-compatible, expand/contract). */
export interface MigrationPlan {
  readonly steps: readonly MigrationStep[];
}

/** Publication status of one outbox record. */
export type OutboxStatus = 'PENDING' | 'PUBLISHED' | 'FAILED';

/** Deterministic backoff for outbox retry eligibility (pure function). */
export function computeBackoffMs(attempts: number, baseMs: bigint): bigint {
  if (!Number.isInteger(attempts) || attempts < 0) {
    throw new Error('attempts must be a non-negative integer');
  }
  if (baseMs < 0n) {
    throw new Error('baseMs must be non-negative');
  }
  // Exponential backoff, capped at 60s (matches the old-repo constants).
  const MAX_BACKOFF_MS = 60_000n;
  let backoff = baseMs;
  for (let i = 1; i < attempts; i += 1) {
    backoff *= 2n;
    if (backoff >= MAX_BACKOFF_MS) {
      return MAX_BACKOFF_MS;
    }
  }
  return backoff > MAX_BACKOFF_MS ? MAX_BACKOFF_MS : backoff;
}
