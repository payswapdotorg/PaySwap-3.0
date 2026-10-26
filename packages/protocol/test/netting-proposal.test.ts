import { describe, expect, it } from 'vitest';
import {
  NettingProposalConflictError,
  NettingProposalLedger,
  NettingProposalStateError,
  NettingSettlementRefusedError,
  UnknownNettingProposalError,
  linkInstructionToMembers,
  nettingProposalStateMachine,
  settleMembersOnConfirmation,
  validateNettingProposal,
} from '../src/netting-proposal.ts';
import type { NettingExecutionLink, NettingProposal } from '../src/netting-proposal.ts';
import {
  DeterministicClock,
  InMemoryObligationBook,
  TerminalStateViolationError,
  TransitionGuardError,
  USD,
  UnknownObligationError,
  ValidationError,
  asClearingRecordId,
  asFulfillmentActivityId,
  asNettingSetId,
  asObligationId,
  asPartyId,
  asSettlementInstructionId,
  deriveObligations,
  fromMinorUnits,
  settleObligation,
} from '../src/index.ts';
import type { Obligation, ObligationDueWindow } from '../src/index.ts';

/**
 * The netting proposal lifecycle + the settlement bridge (P16-B, gap-matrix
 * row B7; ADR-0009 D5). Site classification (this file): 14 NET-NEW sites
 * covering the declared PROPOSED -> ACCEPTED|WITHDRAWN|EXPIRED machine with
 * the strictly-after EXPIRE guard, the append-only ledger (idempotent
 * identical re-record, INV-14 divergent re-record, never-rewritten history),
 * the ACCEPTED-only execution link, and settleMembersOnConfirmation — THE
 * ONLY BRIDGE: every member pre-guarded through the existing
 * obligationStateMachine (all-or-nothing), then the existing settleObligation
 * per member, gross history preserved.
 */

const O1 = 'OBL:clr-1:alice>bob:USD';
const O2 = 'OBL:clr-2:bob>carol:USD';
const O3 = 'OBL:clr-3:alice>carol:USD';

function deriveOne(
  recordId: string,
  debtor: string,
  creditor: string,
  minorUnits: bigint,
  dueWindow: ObligationDueWindow,
): Obligation {
  const derived = deriveObligations(
    [
      {
        id: asClearingRecordId(recordId),
        netted: false,
        activities: [
          {
            id: asFulfillmentActivityId(`${recordId}-act`),
            activityType: 'PAYMENT_FULFILLED',
            debtor: asPartyId(debtor),
            creditor: asPartyId(creditor),
            amount: fromMinorUnits(USD, minorUnits),
            occurredAt: 1_000n,
          },
        ],
      },
    ],
    { dueWindow },
  );
  return derived[0] as Obligation;
}

/** A real in-memory book: o1/o2 due until 9_000n, o3 due only until 3_000n. */
function freshBook(): { book: InMemoryObligationBook; o1: Obligation; o2: Obligation; o3: Obligation } {
  const book = new InMemoryObligationBook();
  const o1 = deriveOne('clr-1', 'alice', 'bob', 100n, { opensAt: 1_500n, closesAt: 9_000n });
  const o2 = deriveOne('clr-2', 'bob', 'carol', 60n, { opensAt: 1_500n, closesAt: 9_000n });
  const o3 = deriveOne('clr-3', 'alice', 'carol', 30n, { opensAt: 1_500n, closesAt: 3_000n });
  for (const obligation of [o1, o2, o3]) {
    book.add(obligation);
  }
  return { book, o1, o2, o3 };
}

function proposalInput(): Record<string, unknown> {
  return {
    proposalId: 'np-1',
    setId: 'ns-1',
    proposedBy: 'alice',
    membership: [O1, O2],
    window: { opensAt: 1_000n, closesAt: 9_000n },
    createdAt: 1_200n,
    state: 'PROPOSED',
  };
}

const bigintSafe = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === 'bigint' ? `bigint:${entry.toString()}` : entry,
  );

describe('validateNettingProposal (fail-closed structural validation)', () => {
  it('constructs a fresh frozen PROPOSED record and rejects every malformed shape', () => {
    const proposal = validateNettingProposal(proposalInput());
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(proposal.proposalId).toBe('np-1');
    expect(proposal.setId).toBe(asNettingSetId('ns-1'));
    expect(proposal.proposedBy).toBe(asPartyId('alice'));
    expect(proposal.membership).toEqual([asObligationId(O1), asObligationId(O2)]);
    expect(proposal.window).toEqual({ opensAt: 1_000n, closesAt: 9_000n });
    expect(proposal.createdAt).toBe(1_200n);
    expect(proposal.state).toBe('PROPOSED');
    expect(() => validateNettingProposal('proposal')).toThrow(ValidationError);
    expect(() => validateNettingProposal({ ...proposalInput(), membership: [] })).toThrow(ValidationError);
    expect(() => validateNettingProposal({ ...proposalInput(), membership: [O1, O1] })).toThrow(ValidationError);
    expect(() => validateNettingProposal({ ...proposalInput(), membership: [O1, ''] })).toThrow(ValidationError);
    expect(() => validateNettingProposal({ ...proposalInput(), state: 'MAYBE' })).toThrow(ValidationError);
    expect(() => validateNettingProposal({ ...proposalInput(), setId: '' })).toThrow(ValidationError);
    expect(() => validateNettingProposal({ ...proposalInput(), proposedBy: '' })).toThrow(ValidationError);
    expect(() => validateNettingProposal({ ...proposalInput(), createdAt: 1_200 })).toThrow(ValidationError);
    expect(() =>
      validateNettingProposal({ ...proposalInput(), window: { opensAt: 9_000n, closesAt: 8_999n } }),
    ).toThrow(ValidationError);
  });
});

describe('the declared proposal machine (EXPIRE strictly after the window close)', () => {
  it('declares PROPOSED -> ACCEPTED | WITHDRAWN | EXPIRED with caller-supplied, strictly-after expiry', () => {
    expect(nettingProposalStateMachine.states).toEqual(['PROPOSED', 'ACCEPTED', 'WITHDRAWN', 'EXPIRED']);
    expect(nettingProposalStateMachine.initial).toBe('PROPOSED');
    expect(nettingProposalStateMachine.terminalStates).toEqual(['ACCEPTED', 'WITHDRAWN', 'EXPIRED']);
    const window = { opensAt: 1_000n, closesAt: 9_000n };
    expect(nettingProposalStateMachine.transition('PROPOSED', 'ACCEPT', { now: 5_000n, window }).to).toBe('ACCEPTED');
    expect(nettingProposalStateMachine.transition('PROPOSED', 'WITHDRAW', { now: 5_000n, window }).to).toBe('WITHDRAWN');
    // the obligation-machine boundary convention: expiry strictly after close
    expect(() => nettingProposalStateMachine.transition('PROPOSED', 'EXPIRE', { now: 9_000n, window })).toThrow(
      TransitionGuardError,
    );
    expect(nettingProposalStateMachine.transition('PROPOSED', 'EXPIRE', { now: 9_001n, window }).to).toBe('EXPIRED');
    expect(nettingProposalStateMachine.isTerminal('PROPOSED')).toBe(false);
  });

  it('terminals are monotonic — nothing leaves ACCEPTED/WITHDRAWN/EXPIRED (typed errors)', () => {
    for (const terminal of ['ACCEPTED', 'WITHDRAWN', 'EXPIRED'] as const) {
      expect(nettingProposalStateMachine.isTerminal(terminal)).toBe(true);
      for (const event of ['ACCEPT', 'WITHDRAW', 'EXPIRE'] as const) {
        expect(() => nettingProposalStateMachine.transition(terminal, event, { now: 99_000n, window: { opensAt: 0n, closesAt: 9_000n } })).toThrow(
          TerminalStateViolationError,
        );
      }
    }
  });
});

describe('the append-only NettingProposalLedger (INV-14 discipline)', () => {
  it('records fresh PROPOSED proposals in order; all()/get() audit views; non-PROPOSED records refused', () => {
    const ledger = new NettingProposalLedger();
    const first = ledger.record(proposalInput());
    expect(first.state).toBe('PROPOSED');
    const second = ledger.record({ ...proposalInput(), proposalId: 'np-2' });
    expect(ledger.all()).toHaveLength(2);
    expect(ledger.all().map((proposal) => proposal.proposalId)).toEqual(['np-1', 'np-2']);
    expect(ledger.get('np-1')?.state).toBe('PROPOSED');
    expect(ledger.get('np-2')?.setId).toBe(asNettingSetId('ns-1'));
    expect(ledger.get('nope')).toBeUndefined();
    expect(() => ledger.record({ ...proposalInput(), proposalId: 'np-3', state: 'ACCEPTED' })).toThrow(
      NettingProposalStateError,
    );
    expect(ledger.all()).toHaveLength(2); // the refused record appended nothing
    expect(second).not.toBe(first);
  });

  it('replays an identical re-record idempotently; a divergent re-record is a typed conflict (INV-14)', () => {
    const ledger = new NettingProposalLedger();
    const original = ledger.record(proposalInput());
    const replay = ledger.record(proposalInput());
    expect(replay).toBe(original); // the identical proposal replays to the SAME record
    expect(ledger.all()).toHaveLength(1);
    expect(ledger.historyFor('np-1')).toHaveLength(1);
    try {
      ledger.record({ ...proposalInput(), membership: [O1, O3] });
      throw new Error('must throw');
    } catch (error) {
      const typed = error as NettingProposalConflictError;
      expect(typed).toBeInstanceOf(NettingProposalConflictError);
      expect(typed.code).toBe('NETTING_PROPOSAL_CONFLICT');
      expect(typed.category).toBe('CONFLICT');
      expect((typed.details as Record<string, unknown>)['proposalId']).toBe('np-1');
    }
    expect(ledger.all()).toHaveLength(1); // history is never rewritten
    expect(ledger.get('np-1')?.membership).toEqual([asObligationId(O1), asObligationId(O2)]);
  });

  it('historyFor is an append-only trail: the initial record plus one snapshot per transition', () => {
    const ledger = new NettingProposalLedger();
    ledger.record(proposalInput());
    ledger.accept('np-1');
    const trail = ledger.historyFor('np-1');
    expect(trail.map((entry) => entry.state)).toEqual(['PROPOSED', 'ACCEPTED']);
    expect(() => ledger.accept('np-1')).toThrow(TerminalStateViolationError); // machine-typed
    expect(ledger.historyFor('np-1')).toHaveLength(2); // the refused transition appended nothing
    expect(ledger.historyFor('np-1')).toEqual(trail); // and never rewrote the trail
    expect(() => ledger.historyFor('nope')).toThrow(UnknownNettingProposalError);
    expect(() => ledger.historyFor('')).toThrow(ValidationError);
  });

  it('accept/withdraw/expire run the declared machine; expiry boundary + unknown ids are typed', () => {
    const ledger = new NettingProposalLedger();
    ledger.record({ ...proposalInput(), proposalId: 'np-a' });
    ledger.record({ ...proposalInput(), proposalId: 'np-w' });
    ledger.record({ ...proposalInput(), proposalId: 'np-e' });
    expect(ledger.accept('np-a').state).toBe('ACCEPTED');
    expect(ledger.withdraw('np-w').state).toBe('WITHDRAWN');
    expect(() => ledger.expire('np-e', 9_000n)).toThrow(TransitionGuardError); // exactly at close
    expect(ledger.expire('np-e', 9_001n).state).toBe('EXPIRED'); // strictly after
    expect(() => ledger.expire('np-e', 12_000n)).toThrow(TerminalStateViolationError);
    expect(() => ledger.accept('nope')).toThrow(UnknownNettingProposalError);
    expect(() => ledger.expire('nope', 12_000n)).toThrow(UnknownNettingProposalError);
    expect(() => ledger.expire('np-a', 12_000 as unknown as bigint)).toThrow(ValidationError); // non-bigint instant
  });
});

describe('the execution link (ACCEPTED proposals only)', () => {
  it('refuses PROPOSED/WITHDRAWN/EXPIRED proposals with a typed NettingProposalStateError', () => {
    const fresh = validateNettingProposal(proposalInput());
    for (const state of ['PROPOSED', 'WITHDRAWN', 'EXPIRED'] as const) {
      try {
        linkInstructionToMembers({ ...fresh, state }, 'si-1');
        throw new Error('must throw');
      } catch (error) {
        const typed = error as NettingProposalStateError;
        expect(typed).toBeInstanceOf(NettingProposalStateError);
        expect(typed.code).toBe('NETTING_PROPOSAL_STATE');
        expect((typed.details as Record<string, unknown>)['state']).toBe(state);
      }
    }
  });

  it('carries the membership verbatim and an asSettlementInstructionId-branded instruction (frozen)', () => {
    const ledger = new NettingProposalLedger();
    ledger.record(proposalInput());
    const accepted = ledger.accept('np-1');
    const link = linkInstructionToMembers(accepted, 'si-77');
    expect(Object.isFrozen(link)).toBe(true);
    expect(link.proposalId).toBe(accepted.proposalId);
    expect(link.setId).toBe(asNettingSetId('ns-1'));
    expect(link.membership).toEqual(accepted.membership); // verbatim
    expect(link.membership).toEqual([asObligationId(O1), asObligationId(O2)]);
    expect(link.instructionId).toBe(asSettlementInstructionId('si-77')); // branded through the validator
    expect(() => linkInstructionToMembers(accepted, '')).toThrow(ValidationError);
  });
});

describe('settleMembersOnConfirmation (THE ONLY BRIDGE to the gross book)', () => {
  it('settles every member through the EXISTING machine — gross history preserved, only states changed', () => {
    const { book, o1, o2, o3 } = freshBook();
    const ledger = new NettingProposalLedger();
    ledger.record(proposalInput());
    const link = linkInstructionToMembers(ledger.accept('np-1'), 'si-1');
    const before = book.all.map((entry) => [entry.id, entry.debtor, entry.creditor, entry.amount.value]);
    const clock = new DeterministicClock(2_000n); // inside both member due windows
    const settled = settleMembersOnConfirmation(book, link, clock);
    expect(settled.map((entry) => entry.state)).toEqual(['SETTLED', 'SETTLED']);
    expect(settled.map((entry) => entry.id)).toEqual([O1, O2]); // membership order
    expect(book.all).toHaveLength(3); // no member added, none removed
    for (const [index, entry] of book.all.entries()) {
      expect(entry.id).toBe(before[index]![0]);
      expect(entry.debtor).toBe(before[index]![1]);
      expect(entry.creditor).toBe(before[index]![2]);
      expect(entry.amount.value).toBe(before[index]![3]);
    }
    expect(book.get(o1.id)?.state).toBe('SETTLED');
    expect(book.get(o2.id)?.state).toBe('SETTLED');
    expect(book.get(o3.id)?.state).toBe('PENDING'); // not a member — untouched
  });

  it('a non-PENDING member refuses the WHOLE settlement (all-or-nothing)', () => {
    const { book, o1, o2 } = freshBook();
    settleObligation(book, o2.id, new DeterministicClock(2_000n)); // one member already settled
    const ledger = new NettingProposalLedger();
    ledger.record(proposalInput());
    const link = linkInstructionToMembers(ledger.accept('np-1'), 'si-1');
    try {
      settleMembersOnConfirmation(book, link, new DeterministicClock(3_000n));
      throw new Error('must throw');
    } catch (error) {
      const typed = error as NettingSettlementRefusedError;
      expect(typed).toBeInstanceOf(NettingSettlementRefusedError);
      expect(typed.code).toBe('NETTING_SETTLEMENT_REFUSED');
      expect(typed.category).toBe('POLICY_BLOCKED');
      expect((typed.details as Record<string, unknown>)['obligationId']).toBe(o2.id);
    }
    expect(book.get(o1.id)?.state).toBe('PENDING'); // NOTHING settled — not even the eligible member
    expect(book.get(o2.id)?.state).toBe('SETTLED');
  });

  it('a member whose due window closed at clock.now refuses the WHOLE settlement', () => {
    const { book, o1, o3 } = freshBook();
    const ledger = new NettingProposalLedger();
    ledger.record({ ...proposalInput(), membership: [O1, O3] });
    const link = linkInstructionToMembers(ledger.accept('np-1'), 'si-1');
    expect(() => settleMembersOnConfirmation(book, link, new DeterministicClock(4_000n))).toThrow(
      NettingSettlementRefusedError,
    );
    expect(book.get(o1.id)?.state).toBe('PENDING');
    expect(book.get(o3.id)?.state).toBe('PENDING'); // window [1500, 3000] closed at 4_000
  });

  it('unknown members and malformed links fail typed; nothing settles', () => {
    const { book, o1 } = freshBook();
    const ledger = new NettingProposalLedger();
    ledger.record({ ...proposalInput(), membership: [O1, 'OBL:clr-9:x>y:USD'] });
    const link = linkInstructionToMembers(ledger.accept('np-1'), 'si-1');
    const clock = new DeterministicClock(2_000n);
    expect(() => settleMembersOnConfirmation(book, link, clock)).toThrow(UnknownObligationError);
    const malformed = { ...link, membership: [] } as unknown as NettingExecutionLink;
    expect(() => settleMembersOnConfirmation(book, malformed, clock)).toThrow(ValidationError);
    expect(book.all.every((entry) => entry.state === 'PENDING')).toBe(true);
  });
});

describe('byte-identical determinism of ledger sequences', () => {
  it('independent ledgers fed the identical sequence produce identical proposals and trails', () => {
    const runSequence = (): NettingProposalLedger => {
      const ledger = new NettingProposalLedger();
      ledger.record(proposalInput());
      ledger.record({ ...proposalInput(), proposalId: 'np-2', membership: [O1, O3] });
      ledger.accept('np-1');
      ledger.expire('np-2', 9_500n);
      return ledger;
    };
    const first = runSequence();
    const second = runSequence();
    expect(bigintSafe(first.all())).toBe(bigintSafe(second.all()));
    expect(bigintSafe(first.historyFor('np-1'))).toBe(bigintSafe(second.historyFor('np-1')));
    expect(bigintSafe(first.historyFor('np-2'))).toBe(bigintSafe(second.historyFor('np-2')));
    expect(first.get('np-1')?.state).toBe('ACCEPTED');
    expect(first.get('np-2')?.state).toBe('EXPIRED');
    expect(first.all()).toEqual(second.all());
  });
});
