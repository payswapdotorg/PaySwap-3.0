import { describe, expect, it } from 'vitest';
import {
  DeterministicClock,
  GHS,
  IllegalTransitionError,
  InMemoryObligationBook,
  TerminalStateViolationError,
  TransitionGuardError,
  USD,
  asClearingRecordId,
  asFulfillmentActivityId,
  asObligationId,
  asPartyId,
  cancelObligation,
  defaultObligation,
  deriveObligations,
  fromMinorUnits,
  obligationStateMachine,
  settleObligation,
  type ClearingRecord,
  type FulfillmentActivity,
  type Obligation,
} from '../src/index.ts';

const DUE_WINDOW = { opensAt: 1_500n, closesAt: 9_000n } as const;

function activity(
  id: string,
  debtor: string,
  creditor: string,
  minorUnits: bigint,
  occurredAt = 1_000n,
): FulfillmentActivity {
  return {
    id: asFulfillmentActivityId(id),
    activityType: 'PAYMENT_FULFILLED',
    debtor: asPartyId(debtor),
    creditor: asPartyId(creditor),
    amount: fromMinorUnits(USD, minorUnits),
    occurredAt,
  };
}

function record(id: string, activities: FulfillmentActivity[], netted = false): ClearingRecord {
  return { id: asClearingRecordId(id), activities, netted };
}

describe('deriveObligations (ported from old obligation.test.ts)', () => {
  it('derives one obligation per (pair, currency) with exact netting', () => {
    const derived = deriveObligations(
      [record('clr-1', [activity('a1', 'alice', 'bob', 100n), activity('a2', 'bob', 'alice', 25n)])],
      { dueWindow: DUE_WINDOW },
    );
    expect(derived).toHaveLength(1);
    const obligation = derived[0] as Obligation;
    expect(obligation.debtor).toBe(asPartyId('alice'));
    expect(obligation.creditor).toBe(asPartyId('bob'));
    expect(obligation.amount.value).toBe(75n);
    expect(obligation.state).toBe('PENDING');
    expect(obligation.derivedFrom).toBe(asClearingRecordId('clr-1'));
    expect(obligation.dueWindow).toEqual(DUE_WINDOW);
  });

  it('keeps currencies separate within one record (per-currency netting)', () => {
    const derived = deriveObligations(
      [
        record('clr-m', [
          activity('a1', 'alice', 'bob', 100n),
          {
            ...activity('a2', 'alice', 'bob', 55_000n),
            amount: fromMinorUnits(GHS, 55_000n),
          },
        ]),
      ],
      { dueWindow: DUE_WINDOW },
    );
    expect(derived).toHaveLength(2);
    expect(derived.map((o) => o.amount.currency).sort()).toEqual(['GHS', 'USD']);
  });

  it('fully offsetting activities produce no obligation', () => {
    const derived = deriveObligations(
      [record('clr-o', [activity('a1', 'alice', 'bob', 100n), activity('a2', 'bob', 'alice', 100n)])],
      { dueWindow: DUE_WINDOW },
    );
    expect(derived).toHaveLength(0);
  });

  it('is deterministic and pure: identical inputs produce identical outputs; inputs never mutate', () => {
    const records = [record('clr-1', [activity('a1', 'alice', 'bob', 300n), activity('a2', 'bob', 'alice', 100n)])];
    const first = deriveObligations(records, { dueWindow: DUE_WINDOW });
    const second = deriveObligations(records, { dueWindow: DUE_WINDOW });
    expect(first).toEqual(second);
    expect(records[0]?.activities).toHaveLength(2);
  });

  it('derives content-based ids (replay without a factory is identical)', () => {
    const derived = deriveObligations([record('clr-1', [activity('a1', 'alice', 'bob', 10n)])], {
      dueWindow: DUE_WINDOW,
    });
    expect(derived[0]?.id).toBe(asObligationId('OBL:clr-1:alice>bob:USD'));
  });

  it('validates the whole input before deriving (all-or-nothing)', () => {
    expect(() => deriveObligations([record('clr-1', [])], { dueWindow: DUE_WINDOW })).toThrow();
    expect(() =>
      deriveObligations(
        [record('clr-1', [activity('a1', 'alice', 'alice', 10n)])],
        { dueWindow: DUE_WINDOW },
      ),
    ).toThrow();
    expect(() =>
      deriveObligations([record('clr-1', [activity('a1', 'alice', 'bob', 0n)])], { dueWindow: DUE_WINDOW }),
    ).toThrow();
    expect(() =>
      deriveObligations([record('clr-1', [activity('a1', 'alice', 'bob', 10n)])], {
        dueWindow: { opensAt: 500n, closesAt: 9_000n },
      }),
    ).toThrow(); // window opens before the latest activity
    expect(() =>
      deriveObligations([record('clr-1', [activity('a1', 'alice', 'bob', 10n)])], {
        dueWindow: { opensAt: 1_000n, closesAt: 500n },
      }),
    ).toThrow(); // closes before it opens
    expect(() =>
      deriveObligations(
        [record('clr-1', [activity('a1', 'alice', 'bob', 10n)]), record('clr-1', [activity('a2', 'a', 'b', 1n)])],
        { dueWindow: DUE_WINDOW },
      ),
    ).toThrow(); // duplicate record id
    expect(() =>
      deriveObligations([record('clr-1', [activity('a1', 'alice', 'bob', 10n), activity('a1', 'x', 'y', 1n)])], {
        dueWindow: DUE_WINDOW,
      }),
    ).toThrow(); // duplicate activity id
  });
});

describe('obligation lifecycle (deterministic machine)', () => {
  function bookWithPendingObligation(): { book: InMemoryObligationBook; id: ReturnType<typeof asObligationId> } {
    const book = new InMemoryObligationBook();
    const derived = deriveObligations([record('clr-1', [activity('a1', 'alice', 'bob', 100n)])], {
      dueWindow: DUE_WINDOW,
    });
    const obligation = derived[0] as Obligation;
    book.add(obligation);
    return { book, id: obligation.id };
  }

  it('SETTLE is only declarable inside the due window (guard)', () => {
    const { book, id } = bookWithPendingObligation();
    const tooEarly = new DeterministicClock(1_000n);
    expect(() => settleObligation(book, id, tooEarly)).toThrow(TransitionGuardError);
    const inWindow = new DeterministicClock(2_000n);
    const settled = settleObligation(book, id, inWindow);
    expect(settled.state).toBe('SETTLED');
  });

  it('CANCEL is available while pending', () => {
    const { book, id } = bookWithPendingObligation();
    const cancelled = cancelObligation(book, id, new DeterministicClock(1_000n));
    expect(cancelled.state).toBe('CANCELLED');
  });

  it('DEFAULT is only declarable strictly after the window closed', () => {
    const { book, id } = bookWithPendingObligation();
    expect(() => defaultObligation(book, id, new DeterministicClock(9_000n))).toThrow(TransitionGuardError);
    const defaulted = defaultObligation(book, id, new DeterministicClock(9_001n));
    expect(defaulted.state).toBe('DEFAULTED');
  });

  it('terminal states are monotonic (no transitions out, typed errors)', () => {
    const { book, id } = bookWithPendingObligation();
    settleObligation(book, id, new DeterministicClock(2_000n));
    expect(() => settleObligation(book, id, new DeterministicClock(3_000n))).toThrow(TerminalStateViolationError);
    expect(() => cancelObligation(book, id, new DeterministicClock(3_000n))).toThrow(TerminalStateViolationError);
    expect(() => defaultObligation(book, id, new DeterministicClock(99_000n))).toThrow(TerminalStateViolationError);
  });

  it('unknown obligations and illegal events are typed errors', () => {
    const { book } = bookWithPendingObligation();
    expect(() => settleObligation(book, asObligationId('nope'), new DeterministicClock(2_000n))).toThrow();
    expect(() => obligationStateMachine.transition('SETTLED', 'SETTLE')).toThrow(TerminalStateViolationError);
    expect(() => obligationStateMachine.transition('PENDING', 'NOPE' as 'SETTLE')).toThrow(); // undeclared event
    expect(() => obligationStateMachine.transition('WEIRD' as 'PENDING', 'SETTLE')).toThrow(IllegalTransitionError);
  });

  it('the book never reuses ids and stores frozen copies', () => {
    const book = new InMemoryObligationBook();
    const { book: source } = bookWithPendingObligation();
    const obligation = (source.all[0] as Obligation);
    book.add(obligation);
    expect(() => book.add(obligation)).toThrow();
    const fetched = book.get(obligation.id);
    expect(Object.isFrozen(fetched)).toBe(true);
  });
});
