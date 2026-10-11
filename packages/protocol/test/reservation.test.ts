import { describe, expect, it } from 'vitest';
import {
  DeterministicClock,
  InMemoryLedgerJournal,
  InMemoryReservationBook,
  InsufficientAvailableFundsError,
  TerminalStateViolationError,
  TransitionGuardError,
  USD,
  UnknownAccountError,
  availableFunds,
  createIdFactory,
  createJournalEntry,
  expireDueReservations,
  fromMinorUnits,
  accountId,
  reserve,
  reservationStateMachine,
  type ReservationLedgerState,
} from '../src/index.ts';

function ledgerState(seed = 0n): ReservationLedgerState {
  return {
    journal: new InMemoryLedgerJournal(),
    reservations: new InMemoryReservationBook(),
    ids: createIdFactory(new DeterministicClock(seed)),
    clock: new DeterministicClock(seed),
  };
}

function fund(state: ReservationLedgerState, minorUnits: bigint): void {
  const entry = createJournalEntry(
    {
      lines: [
        { accountId: accountId('ASSET', 'cash.usd'), amount: fromMinorUnits(USD, minorUnits) },
        { accountId: accountId('INCOME', 'genesis'), amount: fromMinorUnits(USD, -minorUnits) },
      ],
    },
    { ids: state.ids, clock: state.clock },
  );
  state.journal.append(entry);
}

const CASH = accountId('ASSET', 'cash.usd');

describe('reserve (atomic holds; ported from old reservation.test.ts)', () => {
  it('reserves against the projected balance and computes availability', () => {
    const state = ledgerState();
    fund(state, 1_000n);
    const reservation = reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 400n) });
    expect(reservation.state).toBe('PENDING');
    expect(reservation.amount.value).toBe(400n);
    const availability = availableFunds(state, CASH);
    expect(availability.balance.value).toBe(1_000n);
    expect(availability.held.value).toBe(400n);
    expect(availability.available.value).toBe(600n);
  });

  it('rejects a hold exceeding available (balance − held) — never half-applied', () => {
    const state = ledgerState();
    fund(state, 100n);
    reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 80n) });
    expect(() => reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 30n) })).toThrow(
      InsufficientAvailableFundsError,
    );
    expect(state.reservations.all).toHaveLength(1);
  });

  it('an unknown account has zero available capacity', () => {
    const state = ledgerState();
    expect(() => reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 1n) })).toThrow(
      InsufficientAvailableFundsError,
    );
  });

  it('released/terminal reservations stop holding capacity', () => {
    const state = ledgerState();
    fund(state, 100n);
    const reservation = reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 80n) });
    // PENDING -> ACTIVE -> RELEASED
    const clock = state.clock as DeterministicClock;
    state.reservations.replace({ ...reservation, state: 'ACTIVE' });
    expect(availableFunds(state, CASH).held.value).toBe(80n);
    state.reservations.replace({ ...reservation, state: 'RELEASED' });
    expect(availableFunds(state, CASH).held.value).toBe(0n);
    expect(availableFunds(state, CASH).available.value).toBe(100n);
    void clock;
  });

  it('expiry must be strictly after the injected clock reading; positive amounts only', () => {
    const state = ledgerState(1_000n);
    fund(state, 100n);
    expect(() =>
      reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 1n), expiresAt: 1_000n }),
    ).toThrow();
    expect(() =>
      reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 0n), expiresAt: 2_000n }),
    ).toThrow();
    expect(() => reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 1n), expiresAt: 2_000n })).not.toThrow();
  });
});

describe('reservation lifecycle (deterministic machine)', () => {
  function stateWithHold(expiresAt?: bigint) {
    const state = ledgerState(1_000n);
    fund(state, 100n);
    const reservation = reserve(state, {
      accountId: CASH,
      amount: fromMinorUnits(USD, 10n),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    });
    return { state, reservation };
  }

  it('PENDING -> ACTIVATE -> CAPTURE (terminal)', () => {
    const { state, reservation } = stateWithHold();
    (state.clock as DeterministicClock).advanceMs(1n);
    state.reservations.replace({ ...reservation, state: 'ACTIVE' });
    const captured = {
      ...reservation,
      state: 'CAPTURED' as const,
    };
    state.reservations.replace(captured);
    expect(state.reservations.get(reservation.id)?.state).toBe('CAPTURED');
    expect(reservationStateMachine.isTerminal('CAPTURED')).toBe(true);
  });

  it('ACTIVATE/CAPTURE are refused after expiry; EXPIRE is refused before', () => {
    const { state, reservation } = stateWithHold(2_000n);
    // before expiry: EXPIRE refused
    expect(() =>
      reservationStateMachine.transition('PENDING', 'EXPIRE', { now: 1_500n, expiresAt: 2_000n }),
    ).toThrow(TransitionGuardError);
    // after expiry: ACTIVATE refused
    expect(() =>
      reservationStateMachine.transition('PENDING', 'ACTIVATE', { now: 2_500n, expiresAt: 2_000n }),
    ).toThrow(TransitionGuardError);
    // after expiry: EXPIRE allowed
    const record = reservationStateMachine.transition('PENDING', 'EXPIRE', { now: 2_500n, expiresAt: 2_000n });
    expect(record.to).toBe('EXPIRED');
  });

  it('terminal states never regress (typed error)', () => {
    expect(() =>
      reservationStateMachine.transition('RELEASED', 'ACTIVATE', { now: 0n, expiresAt: undefined }),
    ).toThrow(TerminalStateViolationError);
    expect(() =>
      reservationStateMachine.transition('EXPIRED', 'RELEASE', { now: 0n, expiresAt: undefined }),
    ).toThrow(TerminalStateViolationError);
  });

  it('expireDueReservations sweeps due holds deterministically', () => {
    const state = ledgerState(1_000n);
    fund(state, 100n);
    const first = reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 10n), expiresAt: 1_500n });
    const second = reserve(state, { accountId: CASH, amount: fromMinorUnits(USD, 20n), expiresAt: 3_000n });
    (state.clock as DeterministicClock).advanceMs(600n); // now = 1600
    const expired = expireDueReservations(state);
    expect(expired).toEqual([first.id]);
    expect(state.reservations.get(first.id)?.state).toBe('EXPIRED');
    expect(state.reservations.get(second.id)?.state).toBe('PENDING');
    // availability recovers the expired hold only
    expect(availableFunds(state, CASH).held.value).toBe(20n);
  });
});

describe('availableFunds unknown account', () => {
  it('throws UnknownAccountError when the account has no projected balance', () => {
    const state = ledgerState();
    expect(() => availableFunds(state, CASH)).toThrow(UnknownAccountError);
  });
});
