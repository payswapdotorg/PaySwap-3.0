/**
 * The netting proposal lifecycle + the settlement bridge (P16-B,
 * gap-matrix row B7; ADR-0009 D5). A NettingProposal proposes netting a
 * declared set of obligations inside a declared window. Its lifecycle is a
 * DECLARED state machine — PROPOSED -> ACCEPTED | WITHDRAWN | EXPIRED —
 * with monotonic terminals and the obligation-machine boundary convention
 * on EXPIRE: expiry is declarable only when the caller-supplied `at` is
 * STRICTLY after the window close.
 *
 * The NettingProposalLedger is append-only in memory: an identical
 * re-record replays (idempotent, replay-safe); a divergent re-record
 * throws NettingProposalConflictError (the INV-14 provider-revision
 * discipline — history is never rewritten). The history trail for a
 * proposal only ever grows.
 *
 * linkInstructionToMembers brands a settlement instruction onto a proposal
 * — ONLY for ACCEPTED proposals (NettingProposalStateError otherwise).
 * settleMembersOnConfirmation is THE ONLY BRIDGE to the gross obligation
 * book: it pre-guards EVERY member through the EXISTING
 * obligationStateMachine.canTransition (PENDING only; the due window must
 * be open at clock.now) so a refused member settles NOTHING, then applies
 * the EXISTING settleObligation machine per member. There is no parallel
 * settle path, and the v1 same-currency netting law is NOT amended.
 */

import { PaySwapError, ValidationError } from './errors.ts';
import type { PaySwapErrorDetails } from './errors.ts';
import type { ProtocolClock, TimestampMs } from './clock.ts';
import { defineStateMachine } from './state-machine.ts';
import type { StateMachine } from './state-machine.ts';
import { asObligationId, asPartyId, obligationStateMachine } from './obligation.ts';
import type { Obligation, ObligationId, ObligationMachineContext, PartyId } from './obligation.ts';
import { settleObligation, UnknownObligationError } from './obligation-book.ts';
import type { ObligationBook } from './obligation-book.ts';
import { asNettingSetId, asSettlementInstructionId } from './netting.ts';
import type { NettingSetId, NettingWindow, SettlementInstructionId } from './netting.ts';

declare const NettingProposalIdBrand: unique symbol;

/** Branded id of one netting proposal. */
export type NettingProposalId = string & { readonly [NettingProposalIdBrand]: 'NettingProposalId' };

/** The proposal lifecycle. ACCEPTED / WITHDRAWN / EXPIRED are terminal and monotonic. */
export type NettingProposalState = 'PROPOSED' | 'ACCEPTED' | 'WITHDRAWN' | 'EXPIRED';

/** The events the proposal machine declares. */
export type NettingProposalEvent = 'ACCEPT' | 'WITHDRAW' | 'EXPIRE';

/** Guard context: the caller-supplied instant plus the proposal window. */
export interface NettingProposalMachineContext {
  readonly now: TimestampMs;
  readonly window: NettingWindow;
}

/** A proposed netting of a declared membership inside a declared window. */
export interface NettingProposal {
  readonly proposalId: NettingProposalId;
  readonly setId: NettingSetId;
  readonly proposedBy: PartyId;
  /** Non-empty, unique obligation ids (verbatim into the execution link). */
  readonly membership: readonly ObligationId[];
  readonly window: NettingWindow;
  readonly createdAt: TimestampMs;
  readonly state: NettingProposalState;
}

/** A divergent re-record of an already-recorded proposal (INV-14 — history is never rewritten). */
export class NettingProposalConflictError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'NETTING_PROPOSAL_CONFLICT', category: 'CONFLICT', message, details });
  }
}

/** The proposal is not in the state the operation requires. */
export class NettingProposalStateError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'NETTING_PROPOSAL_STATE', category: 'CONFLICT', message, details });
  }
}

/** No proposal exists under the given id. */
export class UnknownNettingProposalError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'UNKNOWN_NETTING_PROPOSAL', category: 'NOT_FOUND', message, details });
  }
}

/** A member failed the pre-guard, so NOTHING settles (all-or-nothing). */
export class NettingSettlementRefusedError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'NETTING_SETTLEMENT_REFUSED', category: 'POLICY_BLOCKED', message, details });
  }
}

/**
 * The declared proposal machine. EXPIRE carries the obligation-machine
 * boundary convention: declarable only when `now` is STRICTLY after the
 * window close. ACCEPT and WITHDRAW are available while PROPOSED.
 */
export const nettingProposalStateMachine: StateMachine<
  NettingProposalState,
  NettingProposalEvent,
  NettingProposalMachineContext
> = defineStateMachine<NettingProposalState, NettingProposalEvent, NettingProposalMachineContext>({
  name: 'netting-proposal',
  initial: 'PROPOSED',
  states: ['PROPOSED', 'ACCEPTED', 'WITHDRAWN', 'EXPIRED'],
  events: ['ACCEPT', 'WITHDRAW', 'EXPIRE'],
  transitions: [
    { from: 'PROPOSED', on: 'ACCEPT', to: 'ACCEPTED', description: 'the membership accepted the proposal' },
    { from: 'PROPOSED', on: 'WITHDRAW', to: 'WITHDRAWN', description: 'the proposer withdrew the proposal' },
    {
      from: 'PROPOSED',
      on: 'EXPIRE',
      to: 'EXPIRED',
      guard: (context) => context.now > context.window.closesAt,
      description: 'expiry is declarable only strictly after the window closed (obligation-machine convention)',
    },
  ],
  terminalStates: ['ACCEPTED', 'WITHDRAWN', 'EXPIRED'],
});

// ---------------------------------------------------------------------------
// Validation + canonical rendering
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, { field });
  }
  return value;
}

function expectTimestamp(value: unknown, field: string): TimestampMs {
  if (typeof value !== 'bigint') {
    throw new ValidationError(`${field} must be a bigint TimestampMs`, { field });
  }
  return value;
}

function expectWindow(value: unknown): NettingWindow {
  if (!isObject(value)) {
    throw new ValidationError('window must be a NettingWindow object');
  }
  const opensAt = expectTimestamp(value.opensAt, 'window.opensAt');
  const closesAt = expectTimestamp(value.closesAt, 'window.closesAt');
  if (closesAt < opensAt) {
    throw new ValidationError('window closes before it opens', { opensAt: opensAt.toString(), closesAt: closesAt.toString() });
  }
  return { opensAt, closesAt };
}

/** Fail-closed structural validation; a fresh proposal must be PROPOSED. */
export function validateNettingProposal(proposal: unknown): NettingProposal {
  if (!isObject(proposal)) {
    throw new ValidationError('proposal must be a NettingProposal object');
  }
  const membership = proposal.membership;
  if (!Array.isArray(membership) || membership.length === 0) {
    throw new ValidationError('membership must be a non-empty array of obligation ids');
  }
  const ids = membership.map((entry, index) => asObligationId(expectString(entry, `membership[${index}]`)));
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new ValidationError('duplicate obligation id in proposal membership', { obligationId: id });
    }
    seen.add(id);
  }
  const state = expectOneOfState(proposal.state);
  return Object.freeze({
    proposalId: expectString(proposal.proposalId, 'proposalId') as NettingProposalId,
    setId: asNettingSetId(expectString(proposal.setId, 'setId')),
    proposedBy: asPartyId(expectString(proposal.proposedBy, 'proposedBy')),
    membership: Object.freeze(ids),
    window: expectWindow(proposal.window),
    createdAt: expectTimestamp(proposal.createdAt, 'createdAt'),
    state,
  });
}

function expectOneOfState(value: unknown): NettingProposalState {
  const states: readonly NettingProposalState[] = ['PROPOSED', 'ACCEPTED', 'WITHDRAWN', 'EXPIRED'];
  if (typeof value !== 'string' || !(states as readonly string[]).includes(value)) {
    throw new ValidationError('state must be one of: PROPOSED, ACCEPTED, WITHDRAWN, EXPIRED', { state: String(value) });
  }
  return value as NettingProposalState;
}

/** Deterministic canonical rendering (field-by-field, never JSON key order). */
function canonicalNettingProposal(proposal: NettingProposal): string {
  return (
    `nettingProposal|id:${proposal.proposalId}|setId:${proposal.setId}` +
    `|proposedBy:${proposal.proposedBy}|membership:[${proposal.membership.join(',')}]` +
    `|window:[${proposal.window.opensAt},${proposal.window.closesAt}]` +
    `|createdAt:${proposal.createdAt}|state:${proposal.state}`
  );
}

// ---------------------------------------------------------------------------
// The append-only ledger (in-memory reference implementation)
// ---------------------------------------------------------------------------

/**
 * Append-only in-memory proposal ledger. Record is idempotent for
 * byte-identical content; a divergent re-record is a typed conflict
 * (INV-14). Accept/withdraw/expire run the declared machine and APPEND to
 * the history trail — history is never rewritten.
 */
export class NettingProposalLedger {
  readonly #byId = new Map<NettingProposalId, NettingProposal>();
  readonly #order: NettingProposal[] = [];
  readonly #history = new Map<NettingProposalId, NettingProposal[]>();

  /** Records a FRESH (PROPOSED) proposal. Identical re-record replays; divergent re-record conflicts. */
  record(proposal: unknown): NettingProposal {
    const validated = validateNettingProposal(proposal);
    if (validated.state !== 'PROPOSED') {
      throw new NettingProposalStateError('only a fresh PROPOSED proposal may be recorded', {
        proposalId: validated.proposalId, state: validated.state,
      });
    }
    const existing = this.#byId.get(validated.proposalId);
    if (existing !== undefined) {
      if (canonicalNettingProposal(existing) !== canonicalNettingProposal(validated)) {
        throw new NettingProposalConflictError(
          `netting proposal '${validated.proposalId}' is already recorded and immutable (INV-14)`,
          { proposalId: validated.proposalId, recordedState: existing.state, attemptedState: validated.state },
        );
      }
      return existing; // idempotent replay of the identical proposal
    }
    this.#byId.set(validated.proposalId, validated);
    this.#order.push(validated);
    this.#history.set(validated.proposalId, [validated]);
    return validated;
  }

  /** All proposals in recording order (audit view). */
  all(): readonly NettingProposal[] {
    return Object.freeze([...this.#order]);
  }

  /** The current proposal under an id. */
  get(proposalId: string): NettingProposal | undefined {
    return this.#byId.get(expectString(proposalId, 'proposalId') as NettingProposalId);
  }

  /** The append-only history trail (initial record + one snapshot per transition; never rewritten). */
  historyFor(proposalId: string): readonly NettingProposal[] {
    const id = expectString(proposalId, 'proposalId') as NettingProposalId;
    const trail = this.#history.get(id);
    if (trail === undefined) {
      throw new UnknownNettingProposalError(`no netting proposal exists under '${proposalId}'`, { proposalId });
    }
    return Object.freeze([...trail]);
  }

  #transition(proposalId: string, event: NettingProposalEvent, at?: TimestampMs): NettingProposal {
    const current = this.get(proposalId);
    if (current === undefined) {
      throw new UnknownNettingProposalError(`no netting proposal exists under '${proposalId}'`, { proposalId });
    }
    // Machine-typed transition errors propagate (illegal/terminal/guard).
    const record = nettingProposalStateMachine.transition(current.state, event, {
      now: at ?? current.createdAt,
      window: current.window,
    });
    const next: NettingProposal = Object.freeze({ ...current, state: record.to });
    this.#byId.set(next.proposalId, next);
    const trail = this.#history.get(next.proposalId)!;
    trail.push(next);
    return next;
  }

  /** PROPOSED -> ACCEPTED. */
  accept(proposalId: string): NettingProposal {
    return this.#transition(proposalId, 'ACCEPT');
  }

  /** PROPOSED -> WITHDRAWN. */
  withdraw(proposalId: string): NettingProposal {
    return this.#transition(proposalId, 'WITHDRAW');
  }

  /** PROPOSED -> EXPIRED; the caller-supplied `at` must be STRICTLY after the window close. */
  expire(proposalId: string, at: TimestampMs): NettingProposal {
    if (typeof at !== 'bigint') {
      throw new ValidationError('at must be a bigint TimestampMs', { at: String(at) });
    }
    return this.#transition(proposalId, 'EXPIRE', at);
  }
}

// ---------------------------------------------------------------------------
// The execution link + THE ONLY settlement bridge
// ---------------------------------------------------------------------------

/** An ACCEPTED proposal linked to a branded settlement instruction. */
export interface NettingExecutionLink {
  readonly proposalId: NettingProposalId;
  readonly setId: NettingSetId;
  /** Verbatim from the ACCEPTED proposal. */
  readonly membership: readonly ObligationId[];
  readonly instructionId: SettlementInstructionId;
}

/**
 * Links a settlement instruction to a proposal's members — ONLY for
 * ACCEPTED proposals (NettingProposalStateError otherwise). The membership
 * is carried verbatim; the instruction id is branded through the existing
 * asSettlementInstructionId validator.
 */
export function linkInstructionToMembers(proposal: NettingProposal, instructionId: string): NettingExecutionLink {
  const validated = validateNettingProposal(proposal);
  if (validated.state !== 'ACCEPTED') {
    throw new NettingProposalStateError('an execution link requires an ACCEPTED netting proposal', {
      proposalId: validated.proposalId, state: validated.state,
    });
  }
  return Object.freeze({
    proposalId: validated.proposalId,
    setId: validated.setId,
    membership: Object.freeze([...validated.membership]),
    instructionId: asSettlementInstructionId(expectString(instructionId, 'instructionId')),
  });
}

/**
 * THE ONLY BRIDGE from an accepted netting proposal to the gross
 * obligation book. Every member is pre-guarded through the EXISTING
 * obligationStateMachine.canTransition (PENDING only; the due window open
 * at clock.now) — a refused member settles NOTHING (all-or-nothing) — and
 * then each member is settled through the EXISTING settleObligation
 * machine. There is no parallel settle path; the gross history preserved
 * by the book is the authority.
 */
export function settleMembersOnConfirmation(
  book: ObligationBook,
  link: NettingExecutionLink,
  clock: ProtocolClock,
): readonly Obligation[] {
  if (!isObject(link) || !Array.isArray(link.membership) || link.membership.length === 0) {
    throw new ValidationError('link must be a NettingExecutionLink with a non-empty membership');
  }
  const members: Obligation[] = [];
  for (const obligationId of link.membership) {
    const member = book.get(asObligationId(expectString(obligationId, 'membership entry')));
    if (member === undefined) {
      throw new UnknownObligationError('netting member obligation is not in the book', { id: obligationId });
    }
    members.push(member);
  }
  const now = clock.now();
  const context = (obligation: Obligation): ObligationMachineContext => ({ now, dueWindow: obligation.dueWindow });
  for (const member of members) {
    if (!obligationStateMachine.canTransition(member.state, 'SETTLE', context(member))) {
      throw new NettingSettlementRefusedError(
        'netting member cannot settle (PENDING only, due window open at clock.now) — NOTHING settles (all-or-nothing)',
        { obligationId: member.id, state: member.state },
      );
    }
  }
  return Object.freeze(members.map((member) => settleObligation(book, member.id, clock)));
}
