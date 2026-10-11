/**
 * @payswap/protocol — temporal netting (P1-W2, MMI-12 PORT).
 *
 * Adapted from payswap.org@8a735bf packages/protocol/src/netting.ts
 * (old Work Order W1-003; old INV-F07 → canonical INV-03).
 *
 * Lifecycle: obligation → netting set → net position → settlement
 * instruction. Netting is a STRATEGY available before final route
 * selection; it never mutates the gross obligations it consumes.
 *
 * - `netPositions` is a PURE function over `(NettingSet, Obligation[])`;
 * - every `NetPosition` carries a `derivation` listing the exact obligation
 *   ids + amounts it was computed from (gross derivation preserved);
 * - `canonicalNetPosition` renders a deterministic byte-identical
 *   serialization, so rebuilding from the same inputs always yields the
 *   same bytes;
 * - the caller's obligation objects are never mutated (frozen outputs,
 *   copy-in copy-out).
 *
 * KNOWN LIMITATION (v1, deliberate): SAME-CURRENCY netting only. A netting
 * set whose member obligations span more than one currency is REJECTED with
 * `MixedCurrencyNettingSetError`. The old repository (netting.ts, "cross-
 * currency netting positions" — one set could contain GHS and USD
 * obligations and produce one net position per currency) supported
 * multi-currency sets; PaySwap 3.0 v1 defers that behavior because
 * cross-currency netting silently embeds an FX conversion, and the FX kernel
 * is deferred to P5-W1 (deferral register). Cross-currency positions must
 * be netted per-currency in SEPARATE netting sets at v1.
 *
 * Delay is explicit and never silent: `canDelay` returns a decision object
 * with typed rejection reasons; an obligation may be delayed only while it
 * remains PENDING, the intent deadline remains satisfiable, and the policy
 * allows the delay.
 */

import { fromMinorUnits, type CurrencyCode, type Money } from './money.ts';
import { PaySwapError, ValidationError, type PaySwapErrorDetails } from './errors.ts';
import { InvalidIdentifierError } from './identifiers.ts';
import type { IdFactory } from './identifiers.ts';
import type { TimestampMs } from './clock.ts';
import type { Obligation, ObligationId, ObligationState, PartyId } from './obligation.ts';

// Re-exported for the settlement plane's convenience (single vocabulary).
export type { Obligation, ObligationId, ObligationState, PartyId };

declare const NettingSetIdBrand: unique symbol;
/** Branded id of one netting set. */
export type NettingSetId = string & { readonly [NettingSetIdBrand]: 'NettingSetId' };
declare const SettlementInstructionIdBrand: unique symbol;
/** Branded id of one settlement instruction. */
export type SettlementInstructionId = string & {
  readonly [SettlementInstructionIdBrand]: 'SettlementInstructionId';
};
/** Temporal netting window `[opensAt, closesAt]` (bigint ms). */
export interface NettingWindow {
  readonly opensAt: TimestampMs;
  readonly closesAt: TimestampMs;
}
/** A netting set: the declared grouping of obligations whose gross positions may be netted together within `window` (exact membership; v1 law: a SINGLE currency across all members). */
export interface NettingSet {
  readonly id: NettingSetId;
  readonly obligations: readonly ObligationId[];
  readonly window: NettingWindow;
  readonly createdAt: TimestampMs;
}

/** The gross obligation snapshot a net position was computed from (derivation preserved). */
export interface GrossObligationSnapshot {
  readonly id: ObligationId;
  readonly debtor: PartyId;
  readonly creditor: PartyId;
  readonly amount: Money;
  readonly state: ObligationState;
}

/** The derivation: netting set identity + window + ordered gross snapshots (rebuild reproduces it exactly). */
export interface NettingDerivation {
  readonly setId: NettingSetId;
  readonly window: NettingWindow;
  readonly gross: readonly GrossObligationSnapshot[];
}

/** One net payable position between a counterparty pair, in one currency. */
export interface NetPosition {
  readonly setId: NettingSetId;
  readonly debtor: PartyId;
  readonly creditor: PartyId;
  readonly netAmount: Money;
  readonly derivation: NettingDerivation;
}
/** Protocol-level settlement instruction: the single executable movement replacing its net position's netted gross obligations (content-derived id unless a factory is injected). The payment-plane-enriched `SettlementInstruction` lives in settlement/instructions.ts. */
export interface ProtocolSettlementInstruction {
  readonly id: SettlementInstructionId;
  readonly setId: NettingSetId;
  readonly debtor: PartyId;
  readonly creditor: PartyId;
  readonly amount: Money;
  /** The net position (with full gross derivation) this settles. */
  readonly fromNetPosition: NetPosition;
}

export class NettingMembershipError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'NETTING_MEMBERSHIP_MISMATCH', category: 'VALIDATION', message, details });
  }
}

/** A netting set window or member obligation failed netting preconditions. */
export class NettingWindowError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'NETTING_WINDOW_INVALID', category: 'VALIDATION', message, details });
  }
}

/**
 * v1 SAME-CURRENCY law: the netting set spans more than one currency.
 * Cross-currency netting is DEFERRED (deferral register) — net each
 * currency in its own set until the FX kernel lands (P5-W1 dependency).
 */
export class MixedCurrencyNettingSetError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'MIXED_CURRENCY_NETTING_SET', category: 'VALIDATION', message, details });
  }
}

const MAX_ID_LENGTH = 256;
const PAIR_SEPARATOR = '>';

/** Brand a validated string as a `NettingSetId`. */
export function asNettingSetId(value: string): NettingSetId {
  return brandSimpleId(value, 'NettingSetId');
}

/** Brand a validated string as a `SettlementInstructionId`. */
export function asSettlementInstructionId(value: string): SettlementInstructionId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidIdentifierError('SettlementInstructionId must be a non-empty string', { value });
  }
  if (value.length > MAX_ID_LENGTH) {
    throw new InvalidIdentifierError(`SettlementInstructionId exceeds ${MAX_ID_LENGTH} characters`, { value });
  }
  if (value.trim() !== value) {
    throw new InvalidIdentifierError('SettlementInstructionId must not carry surrounding whitespace', { value });
  }
  return value as SettlementInstructionId;
}

function brandSimpleId<TBranded extends string>(value: string, kind: string): TBranded {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidIdentifierError(`${kind} must be a non-empty string`, { kind, value });
  }
  if (value.length > MAX_ID_LENGTH) {
    throw new InvalidIdentifierError(`${kind} exceeds ${MAX_ID_LENGTH} characters`, { kind, value });
  }
  if (value.includes(PAIR_SEPARATOR)) {
    throw new InvalidIdentifierError(`${kind} must not contain '${PAIR_SEPARATOR}'`, { kind, value });
  }
  if (value.trim() !== value) {
    throw new InvalidIdentifierError(`${kind} must not carry surrounding whitespace`, { kind, value });
  }
  return value as TBranded;
}

function validateNettingSet(set: NettingSet): void {
  if (set === null || typeof set !== 'object') {
    throw new ValidationError('set must be a NettingSet object');
  }
  asNettingSetId(set.id);
  if (!Array.isArray(set.obligations) || set.obligations.length === 0) {
    throw new NettingMembershipError('a netting set requires at least one obligation id', { setId: set.id });
  }
  const seen = new Set<string>();
  for (const id of set.obligations) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new ValidationError('netting set obligation ids must be non-empty strings', {
        setId: set.id, obligationId: id,
      });
    }
    if (seen.has(id)) {
      throw new NettingMembershipError('duplicate obligation id in netting set', {
        setId: set.id, obligationId: id,
      });
    }
    seen.add(id);
  }
  const window = set.window;
  if (window === null || typeof window !== 'object') {
    throw new ValidationError('set.window must be a NettingWindow');
  }
  if (typeof window.opensAt !== 'bigint' || typeof window.closesAt !== 'bigint') {
    throw new ValidationError('set.window bounds must be bigint TimestampMs');
  }
  if (window.closesAt < window.opensAt) {
    throw new NettingWindowError('netting window closes before it opens', { setId: set.id });
  }
  if (typeof set.createdAt !== 'bigint') {
    throw new ValidationError('set.createdAt must be a bigint TimestampMs');
  }
}

/**
 * Deterministically net the obligations of one set. Grouping: unordered
 * (debtor, creditor) pair × single currency: for pair (low, high), a gross
 * obligation whose debtor is `low` adds to the net; whose debtor is `high`
 * subtracts; positive net → `low` owes `high`; negative → `high` owes `low`;
 * zero → the pair fully offsets (no position). Ordering is fully
 * deterministic (pair keys lexicographically); `derivation.gross` carries
 * the members in declared order with exact amounts; the input obligations
 * are never mutated. Preconditions (all-or-nothing): exact membership,
 * every obligation PENDING, every due window closes within the netting
 * window close — and (v1 law) a SINGLE currency across members, else
 * `MixedCurrencyNettingSetError`.
 */
export function netPositions(
  set: NettingSet,
  obligations: readonly Obligation[],
): readonly NetPosition[] {
  validateNettingSet(set);
  if (!Array.isArray(obligations)) {
    throw new ValidationError('obligations must be an array of Obligation');
  }

  const byId = new Map<string, Obligation>();
  for (const [index, obligation] of obligations.entries()) {
    if (obligation === null || typeof obligation !== 'object') {
      throw new ValidationError(`obligations[${index}] must be an Obligation`);
    }
    const existing = byId.get(obligation.id);
    if (existing !== undefined) {
      throw new NettingMembershipError('duplicate obligation supplied to netting', { obligationId: obligation.id });
    }
    byId.set(obligation.id, obligation);
  }

  const members: Obligation[] = [];
  for (const memberId of set.obligations) {
    const obligation = byId.get(memberId);
    if (obligation === undefined) {
      throw new NettingMembershipError('netting set member obligation was not supplied', {
        setId: set.id,
        obligationId: memberId,
      });
    }
    members.push(obligation);
  }
  if (byId.size !== members.length) {
    throw new NettingMembershipError('obligations supplied to netting must match the netting set membership exactly',
      { setId: set.id, supplied: byId.size, members: members.length });
  }

  // v1 SAME-CURRENCY law: one netting set nets exactly one currency.
  const setCurrency: CurrencyCode | undefined = members[0]?.amount.currency;
  if (setCurrency === undefined) {
    throw new ValidationError('netting set resolved to no members');
  }
  for (const obligation of members) {
    if (obligation.amount.currency !== setCurrency) {
      throw new MixedCurrencyNettingSetError(
        'v1 netting is SAME-CURRENCY only: this netting set spans multiple currencies — net each currency in its own set (cross-currency netting is deferred until the FX kernel lands; old-repo multi-currency netting is cited in the deferral register)',
        { setId: set.id, setCurrency, offendingObligationId: obligation.id, offendingCurrency: obligation.amount.currency },
      );
    }
  }

  for (const obligation of members) {
    if (obligation.state !== 'PENDING') {
      throw new NettingWindowError('only PENDING obligations may enter a netting set', {
        setId: set.id,
        obligationId: obligation.id,
        state: obligation.state,
      });
    }
    if (obligation.dueWindow.closesAt > set.window.closesAt) {
      throw new NettingWindowError('obligation due window outlives the netting window', {
        setId: set.id,
        obligationId: obligation.id,
        obligationClosesAt: obligation.dueWindow.closesAt.toString(),
        nettingClosesAt: set.window.closesAt.toString(),
      });
    }
    if (typeof obligation.amount.value !== 'bigint') {
      throw new ValidationError('obligation.amount.value must be a bigint (INV-02)', {
        obligationId: obligation.id,
      });
    }
  }

  // The gross snapshot in the declared member order (derivation preserved).
  const gross: readonly GrossObligationSnapshot[] = Object.freeze(
    members.map((obligation) =>
      Object.freeze({
        id: obligation.id,
        debtor: obligation.debtor,
        creditor: obligation.creditor,
        amount: obligation.amount,
        state: obligation.state,
      }),
    ),
  );
  const derivation: NettingDerivation = Object.freeze({
    setId: set.id,
    window: Object.freeze({ opensAt: set.window.opensAt, closesAt: set.window.closesAt }),
    gross,
  });

  interface PairGroup {
    readonly low: PartyId;
    readonly high: PartyId;
    readonly net: bigint;
  }
  const groups = new Map<string, PairGroup>();
  for (const obligation of members) {
    const low = obligation.debtor < obligation.creditor ? obligation.debtor : obligation.creditor;
    const high = obligation.debtor < obligation.creditor ? obligation.creditor : obligation.debtor;
    const key = `${low}${PAIR_SEPARATOR}${high}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = { low, high, net: 0n };
      groups.set(key, group);
    }
    const sign = obligation.debtor === low ? 1n : -1n;
    group = { low, high, net: group.net + sign * obligation.amount.value };
    groups.set(key, group);
  }

  const positions: NetPosition[] = [];
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key);
    if (group === undefined) continue;
    if (group.net === 0n) continue;
    positions.push(
      Object.freeze({
        setId: set.id,
        debtor: group.net > 0n ? group.low : group.high,
        creditor: group.net > 0n ? group.high : group.low,
        netAmount: fromMinorUnits(setCurrency, group.net > 0n ? group.net : -group.net),
        derivation,
      }),
    );
  }
  return Object.freeze(positions);
}

/** Deterministic canonical serialization (field-by-field, never key-order JSON; gross rendered in declared member order). */
export function canonicalNetPosition(position: NetPosition): string {
  const gross = position.derivation.gross
    .map(
      (entry) =>
        `{id:${entry.id}|debtor:${entry.debtor}|creditor:${entry.creditor}|amount:${entry.amount.currency}:${entry.amount.value}|state:${entry.state}}`,
    )
    .join(',');
  return (
    `netPosition|setId:${position.setId}` +
    `|window:[${position.derivation.window.opensAt},${position.derivation.window.closesAt}]` +
    `|gross:[${gross}]` +
    `|debtor:${position.debtor}` +
    `|creditor:${position.creditor}` +
    `|net:${position.netAmount.currency}:${position.netAmount.value}`
  );
}

/** Reduce net positions to settlement instructions: exactly one per net position, sum preserved; content-derived ids (`SI:<setId>:<pair>:<currency>`) unless a factory overrides. */
export function settlementInstructions(
  netPositionsInput: readonly NetPosition[],
  options?: { readonly ids?: IdFactory },
): readonly ProtocolSettlementInstruction[] {
  if (!Array.isArray(netPositionsInput)) {
    throw new ValidationError('netPositions must be an array of NetPosition');
  }
  const instructions: ProtocolSettlementInstruction[] = [];
  const minted = new Set<string>();
  for (const position of netPositionsInput) {
    if (position === null || typeof position !== 'object') {
      throw new ValidationError('each net position must be a NetPosition object');
    }
    const low = position.debtor < position.creditor ? position.debtor : position.creditor;
    const high = position.debtor < position.creditor ? position.creditor : position.debtor;
    const id =
      options?.ids !== undefined
        ? asSettlementInstructionId(options.ids.mintId('si'))
        : asSettlementInstructionId(`SI:${position.setId}:${low}${PAIR_SEPARATOR}${high}:${position.netAmount.currency}`);
    if (minted.has(id)) {
      throw new ValidationError('settlement instruction id collision during derivation', { id });
    }
    minted.add(id);
    instructions.push(
      Object.freeze({
        id,
        setId: position.setId,
        debtor: position.debtor,
        creditor: position.creditor,
        amount: position.netAmount,
        fromNetPosition: position,
      }),
    );
  }
  return Object.freeze(instructions);
}
