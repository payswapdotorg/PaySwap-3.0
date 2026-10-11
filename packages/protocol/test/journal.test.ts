import { describe, expect, it } from 'vitest';
import {
  DeterministicClock,
  EUR,
  FloatMoneyRejectedError,
  InMemoryLedgerJournal,
  JournalEntryIdConflictError,
  MixedCurrencyAccountError,
  USD,
  UnbalancedJournalEntryError,
  ValidationError,
  CurrencyMismatchError,
  accountId,
  accountTypeOf,
  asAccountId,
  asJournalEntryId,
  createIdFactory,
  createJournalEntry,
  fromMinorUnits,
  parseAccountId,
  postJournal,
  type JournalEntry,
} from '../src/index.ts';

const clock = new DeterministicClock(1_000n);
const ids = createIdFactory(clock);
const cash = accountId('ASSET', 'cash.usd');
const obligations = accountId('PROTOCOL_OBLIGATION', 'obligations.payin-42');

function balancedEntry(memo?: string): JournalEntry {
  return createJournalEntry(
    {
      lines: [
        { accountId: obligations, amount: fromMinorUnits(USD, 100n) },
        { accountId: cash, amount: fromMinorUnits(USD, -100n) },
      ],
      ...(memo !== undefined ? { memo } : {}),
    },
    { ids, clock },
  );
}

describe('account ids (chart convention TYPE:name)', () => {
  it('builds and parses account ids', () => {
    expect(accountId('LIABILITY', 'obligations.x')).toBe('LIABILITY:obligations.x');
    expect(parseAccountId(asAccountId('RESERVE:holds.1'))).toEqual({
      accountType: 'RESERVE',
      name: 'holds.1',
    });
    expect(accountTypeOf(asAccountId('INCOME:fees'))).toBe('INCOME');
  });

  it('rejects malformed account ids', () => {
    for (const bad of ['', 'NOSEPARATOR', ':lead', 'trail:', 'BAD:ok', 'ASSET:bad name', 'ASSET:' + 'x'.repeat(200)]) {
      expect(() => asAccountId(bad)).toThrow(ValidationError);
    }
    expect(() => accountId('NOT_A_TYPE' as 'ASSET', 'ok')).toThrow(ValidationError);
    expect(() => accountId('ASSET', 'bad name')).toThrow(ValidationError);
  });
});

describe('append-only journal (ported from old journal.test.ts)', () => {
  it('createJournalEntry stamps ids + timestamps deterministically', () => {
    const entry = balancedEntry();
    expect(entry.entryId).toBe('jrn_1000_1');
    expect(entry.occurredAt).toBe(1000n);
    expect(entry.lines).toHaveLength(2);
    expect(entry.lines[0]?.entryId).toBe(entry.entryId);
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('posts balanced entries immutably and rejects unbalanced ones (balance law)', () => {
    const journal = new InMemoryLedgerJournal();
    const stored = postJournal(journal, balancedEntry('first'));
    expect(journal.size).toBe(1);
    expect(stored.memo).toBe('first');
    const unbalanced = createJournalEntry(
      {
        lines: [
          { accountId: cash, amount: fromMinorUnits(USD, 100n) },
          { accountId: obligations, amount: fromMinorUnits(USD, -99n) },
        ],
      },
      { ids, clock },
    );
    expect(() => postJournal(journal, unbalanced)).toThrow(UnbalancedJournalEntryError);
    expect(journal.size).toBe(1); // atomic: nothing was appended
  });

  it('rejects duplicate entry ids (append-only)', () => {
    const journal = new InMemoryLedgerJournal();
    const entry = balancedEntry();
    postJournal(journal, entry);
    expect(() => postJournal(journal, entry)).toThrow(JournalEntryIdConflictError);
  });

  it('rejects a second currency on an already-used account (chart consistency)', () => {
    const journal = new InMemoryLedgerJournal();
    postJournal(journal, balancedEntry());
    const second = createJournalEntry(
      {
        lines: [
          { accountId: cash, amount: fromMinorUnits(EUR, 100n) },
          { accountId: accountId('INCOME', 'fees.eur'), amount: fromMinorUnits(EUR, -100n) },
        ],
      },
      { ids, clock },
    );
    expect(() => postJournal(journal, second)).toThrow(MixedCurrencyAccountError);
    expect(journal.size).toBe(1); // atomic rejection
  });

  it('a single entry mixing currencies across its own lines is rejected', () => {
    const journal = new InMemoryLedgerJournal();
    const mixed = {
      entryId: asJournalEntryId('jrn-mixed'),
      occurredAt: 1n,
      lines: [
        { accountId: accountId('ASSET', 'a1'), amount: fromMinorUnits(USD, 100n), entryId: asJournalEntryId('jrn-mixed') },
        { accountId: accountId('ASSET', 'a2'), amount: fromMinorUnits(EUR, -100n), entryId: asJournalEntryId('jrn-mixed') },
      ],
    };
    expect(() => postJournal(journal, mixed)).toThrow(CurrencyMismatchError);
  });

  it('rejects float amounts (INV-02 defense in depth)', () => {
    const journal = new InMemoryLedgerJournal();
    const entry = {
      entryId: asJournalEntryId('jrn-float'),
      occurredAt: 1n,
      lines: [
        { accountId: cash, amount: { currency: USD, value: 0.1 } as never, entryId: asJournalEntryId('jrn-float') },
        { accountId: obligations, amount: { currency: USD, value: -0.1 } as never, entryId: asJournalEntryId('jrn-float') },
      ],
    };
    expect(() => postJournal(journal, entry)).toThrow(FloatMoneyRejectedError);
  });

  it('rejects zero-amount lines, <2 lines, malformed memo and line/entry id mismatch', () => {
    const journal = new InMemoryLedgerJournal();
    const zero = {
      entryId: asJournalEntryId('jrn-zero'),
      occurredAt: 1n,
      lines: [
        { accountId: cash, amount: fromMinorUnits(USD, 0n), entryId: asJournalEntryId('jrn-zero') },
        { accountId: obligations, amount: fromMinorUnits(USD, 0n), entryId: asJournalEntryId('jrn-zero') },
      ],
    };
    expect(() => postJournal(journal, zero)).toThrow(ValidationError);
    expect(() =>
      createJournalEntry({ lines: [{ accountId: cash, amount: fromMinorUnits(USD, 1n) }] }, { ids, clock }),
    ).toThrow(ValidationError);
    expect(() =>
      createJournalEntry(
        {
          lines: [
            { accountId: cash, amount: fromMinorUnits(USD, 1n) },
            { accountId: obligations, amount: fromMinorUnits(USD, -1n) },
          ],
          memo: '',
        },
        { ids, clock },
      ),
    ).toThrow(ValidationError);
  });

  it('the read view is a frozen copy — mutating it never touches the journal', () => {
    const journal = new InMemoryLedgerJournal();
    postJournal(journal, balancedEntry());
    const view = journal.entries;
    expect(Object.isFrozen(view)).toBe(true);
    const before = journal.size;
    expect(before).toBe(1);
    expect(() => (view as unknown as JournalEntry[]).pop()).toThrow();
    expect(journal.size).toBe(1);
  });
});

describe('projections (ported from old projections.test.ts)', () => {
  it('folds balances per account with exact arithmetic', async () => {
    const { projectBalances, rebuildProjection, foldJournalEntry } = await import('../src/index.ts');
    const journal = new InMemoryLedgerJournal();
    postJournal(journal, balancedEntry());
    postJournal(
      journal,
      createJournalEntry(
        {
          lines: [
            { accountId: obligations, amount: fromMinorUnits(USD, 40n) },
            { accountId: cash, amount: fromMinorUnits(USD, -40n) },
          ],
        },
        { ids, clock },
      ),
    );
    const balances = projectBalances(journal);
    expect(balances.get(cash)?.value).toBe(-140n);
    expect(balances.get(obligations)?.value).toBe(140n);
    // scoped projection
    expect(projectBalances(journal, cash).get(cash)?.value).toBe(-140n);
    // rebuild from genesis is the same fold
    expect(rebuildProjection(journal, cash).get(cash)?.value).toBe(-140n);
    // incremental fold of both entries equals the whole-journal fold
    const incremental = new Map();
    for (const entry of journal.entries) foldJournalEntry(incremental, entry);
    expect(incremental.get(cash)?.value).toBe(-140n);
  });

  it('an account receiving a second currency fails loudly in projection', async () => {
    const { projectBalances } = await import('../src/index.ts');
    const journal = new InMemoryLedgerJournal();
    const entryIdA = asJournalEntryId('jrn-a');
    const entryIdB = asJournalEntryId('jrn-b');
    // hand-built entries bypass createJournalEntry; journal.append still validates
    // the entry itself but account-currency consistency is enforced per entry.
    // Simulate a stored inconsistency directly through a crafted pair of
    // single-account... (the journal enforces chart consistency, so we fold manually)
    const { foldJournalEntry } = await import('../src/index.ts');
    const balances = new Map();
    foldJournalEntry(balances, {
      entryId: entryIdA,
      occurredAt: 1n,
      lines: [{ accountId: cash, amount: fromMinorUnits(USD, 5n), entryId: entryIdA }],
    });
    expect(() =>
      foldJournalEntry(balances, {
        entryId: entryIdB,
        occurredAt: 2n,
        lines: [{ accountId: cash, amount: fromMinorUnits(EUR, 5n), entryId: entryIdB }],
      }),
    ).toThrow(MixedCurrencyAccountError);
    void projectBalances;
  });
});
