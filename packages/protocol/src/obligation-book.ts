/**
 * @payswap/protocol — obligation book and lifecycle application (P1-W2).
 *
 * Adapted from payswap.org@8a735bf packages/protocol/src/obligation.ts
 * (the book + event-application half, split out of the 549-line original to
 * respect the 400-line file law).
 *
 * The book is a storage-agnostic store contract plus a deterministic
 * in-memory reference implementation. Lifecycle application runs every
 * event through the deterministic obligation state machine with guard
 * context drawn from the injected clock and the obligation's own due
 * window — illegal transitions throw typed errors, never silently no-op.
 */

import { PaySwapError, ValidationError, type PaySwapErrorDetails } from './errors.ts';
import type { ProtocolClock } from './clock.ts';
import { freezeObligation, obligationStateMachine } from './obligation.ts';
import type {
  Obligation,
  ObligationEvent,
  ObligationId,
  ObligationMachineContext,
} from './obligation.ts';

/** Storage-agnostic obligation store contract. */
export interface ObligationBook {
  /** All obligations in insertion order. */
  readonly all: readonly Obligation[];
  get(id: ObligationId): Obligation | undefined;
  add(obligation: Obligation): void;
  replace(obligation: Obligation): void;
}

/** No obligation exists under the given id. */
export class UnknownObligationError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'UNKNOWN_OBLIGATION', category: 'NOT_FOUND', message, details });
  }
}

/** An obligation id already exists (ids are never reused). */
export class ObligationIdConflictError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'OBLIGATION_ID_CONFLICT', category: 'CONFLICT', message, details });
  }
}

/**
 * Apply one declared obligation event under the deterministic machine, with
 * guard context drawn from the injected clock and the obligation's due
 * window. Returns the updated (frozen) obligation.
 */
export function applyObligationEvent(
  book: ObligationBook,
  id: ObligationId,
  event: ObligationEvent,
  clock: ProtocolClock,
): Obligation {
  const existing = book.get(id);
  if (existing === undefined) {
    throw new UnknownObligationError('no obligation exists under the given id', { id });
  }
  const context: ObligationMachineContext = { now: clock.now(), dueWindow: existing.dueWindow };
  const record = obligationStateMachine.transition(existing.state, event, context);
  const updated = freezeObligation({ ...existing, state: record.to });
  book.replace(updated);
  return updated;
}

/** PENDING → SETTLED, only declarable inside the due window. */
export function settleObligation(
  book: ObligationBook,
  id: ObligationId,
  clock: ProtocolClock,
): Obligation {
  return applyObligationEvent(book, id, 'SETTLE', clock);
}

/** PENDING → CANCELLED, available at any time while pending. */
export function cancelObligation(
  book: ObligationBook,
  id: ObligationId,
  clock: ProtocolClock,
): Obligation {
  return applyObligationEvent(book, id, 'CANCEL', clock);
}

/** PENDING → DEFAULTED, only declarable strictly after the window closed. */
export function defaultObligation(
  book: ObligationBook,
  id: ObligationId,
  clock: ProtocolClock,
): Obligation {
  return applyObligationEvent(book, id, 'DEFAULT', clock);
}

/**
 * Deterministic in-memory reference obligation book. Stores frozen copies;
 * returns frozen copies; ids are never reused. Durable persistence is
 * DEFERRED (deferral register — infrastructure decision pending).
 */
export class InMemoryObligationBook implements ObligationBook {
  private readonly _byId = new Map<ObligationId, Obligation>();
  private readonly _order: Obligation[] = [];

  get all(): readonly Obligation[] {
    return Object.freeze([...this._order]);
  }

  get(id: ObligationId): Obligation | undefined {
    const stored = this._byId.get(id);
    return stored === undefined ? undefined : stored;
  }

  add(obligation: Obligation): void {
    if (obligation === null || typeof obligation !== 'object') {
      throw new ValidationError('obligation must be an Obligation object');
    }
    if (this._byId.has(obligation.id)) {
      throw new ObligationIdConflictError('obligation id already exists', { id: obligation.id });
    }
    const stored = freezeObligation(obligation);
    this._byId.set(stored.id, stored);
    this._order.push(stored);
  }

  replace(obligation: Obligation): void {
    const existing = this._byId.get(obligation.id);
    if (existing === undefined) {
      throw new UnknownObligationError('cannot replace an unknown obligation', {
        id: obligation.id,
      });
    }
    const stored = freezeObligation(obligation);
    this._byId.set(stored.id, stored);
    const index = this._order.findIndex((candidate) => candidate.id === stored.id);
    if (index >= 0) {
      this._order[index] = stored;
    }
  }
}
