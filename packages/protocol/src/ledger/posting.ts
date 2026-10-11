/**
 * @payswap/protocol — journal posting: pure entry factory + in-memory store
 * (P1-W2).
 *
 * Split out of the adapted payswap.org@8a735bf packages/protocol/src/ledger/
 * journal.ts (old Work Order W1-002) to respect the 400-line file law.
 * `createJournalEntry` stamps a fresh id + timestamp from injected
 * dependencies; `InMemoryLedgerJournal` is the deterministic reference
 * store whose append enforces the full journal validation rule set.
 */

import type { ProtocolClock, TimestampMs } from '../clock.ts';
import type { IdFactory } from '../identifiers.ts';
import { ValidationError } from '../errors.ts';
import {
  asAccountId,
  asJournalEntryId,
  assertSourceShape,
  MAX_MEMO_LENGTH,
  validateJournalEntry,
} from './journal.ts';
import type {
  JournalEntry,
  JournalEntryId,
  JournalEntryInput,
  JournalEntrySource,
  LedgerJournal,
} from './journal.ts';

/** Injected dependencies for the pure entry factory. */
export interface CreateJournalEntryDeps {
  readonly ids: IdFactory;
  readonly clock: ProtocolClock;
}

function freezeSource(source: JournalEntrySource): JournalEntrySource {
  const frozen: {
    -readonly [K in keyof JournalEntrySource]: JournalEntrySource[K];
  } = {};
  if (source.causationId !== undefined) frozen.causationId = source.causationId;
  if (source.correlationId !== undefined) frozen.correlationId = source.correlationId;
  if (source.intentId !== undefined) frozen.intentId = source.intentId;
  return Object.freeze(frozen);
}

function freezeEntry(entry: JournalEntry): JournalEntry {
  const frozen: {
    -readonly [K in keyof JournalEntry]: JournalEntry[K];
  } = {
    entryId: entry.entryId,
    occurredAt: entry.occurredAt,
    lines: Object.freeze(
      entry.lines.map((line) =>
        Object.freeze({ accountId: line.accountId, amount: line.amount, entryId: entry.entryId }),
      ),
    ),
  };
  if (entry.memo !== undefined) frozen.memo = entry.memo;
  if (entry.source !== undefined) frozen.source = freezeSource(entry.source);
  return Object.freeze(frozen);
}

/**
 * Post one entry to the journal. REJECTS unbalanced entries, duplicate ids
 * and chart violations BEFORE any mutation, then appends immutably.
 * Returns the frozen stored entry.
 */
export function postJournal(journal: LedgerJournal, entry: JournalEntry): JournalEntry {
  return journal.append(entry);
}

/**
 * Pure factory: stamps a fresh `JournalEntryId` (via the injected id factory)
 * and `occurredAt` (via the injected clock) onto the line spec, producing a
 * draft entry ready for `postJournal`. Deterministic for a given (ids, clock)
 * pair and call order.
 */
export function createJournalEntry(
  input: JournalEntryInput,
  deps: CreateJournalEntryDeps,
): JournalEntry {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('input must be a JournalEntryInput object');
  }
  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    throw new ValidationError('a double-entry journal entry requires at least two lines');
  }
  if (input.memo !== undefined) {
    if (
      typeof input.memo !== 'string' ||
      input.memo.length === 0 ||
      input.memo.length > MAX_MEMO_LENGTH
    ) {
      throw new ValidationError('input.memo must be 1..1024 characters when present');
    }
  }
  if (input.source !== undefined) {
    assertSourceShape(input.source);
  }
  const entryId = asJournalEntryId(deps.ids.mintId('jrn'));
  const draft: {
    -readonly [K in keyof JournalEntry]: JournalEntry[K];
  } = {
    entryId,
    occurredAt: deps.clock.now(),
    lines: Object.freeze(
      input.lines.map((line) =>
        Object.freeze({
          accountId: asAccountId(line.accountId),
          amount: line.amount,
          entryId,
        }),
      ),
    ),
  };
  if (input.memo !== undefined) draft.memo = input.memo;
  if (input.source !== undefined) draft.source = freezeSource(input.source);
  return Object.freeze(draft);
}

/**
 * Deterministic in-memory reference journal. Entries are stored as
 * frozen deep copies; the read view is a fresh frozen array on every access.
 * Append runs the full `validateJournalEntry` rule set, so posting through
 * `postJournal` or `append` is equally safe.
 */
export class InMemoryLedgerJournal implements LedgerJournal {
  private readonly _entries: JournalEntry[] = [];
  private readonly _byId = new Map<JournalEntryId, JournalEntry>();

  get entries(): readonly JournalEntry[] {
    return Object.freeze([...this._entries]);
  }

  get size(): number {
    return this._entries.length;
  }

  get(entryId: JournalEntryId): JournalEntry | undefined {
    const stored = this._byId.get(entryId);
    return stored === undefined ? undefined : stored;
  }

  append(entry: JournalEntry): JournalEntry {
    validateJournalEntry(this, entry);
    const stored = freezeEntry(entry);
    this._entries.push(stored);
    this._byId.set(stored.entryId, stored);
    return stored;
  }
}
