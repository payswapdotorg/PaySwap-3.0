/**
 * @payswap/protocol — netting delay policy + gross-flow audit (P1-W2).
 *
 * Split out of the adapted payswap.org@8a735bf packages/protocol/src/
 * netting.ts (old Work Order W1-003) to respect the 400-line file law.
 *
 * Delay is explicit and never silent: `canDelay` returns a decision object
 * with typed rejection reasons; an obligation may be delayed only while it
 * remains PENDING, the intent deadline remains satisfiable, and the policy
 * allows the delay. When the policy demands explicit backing (credit
 * exposure or reserved liquidity — both kernels DEFERRED to P5-W1), the
 * decision flags it so a caller can never treat a delay as free value.
 *
 * `grossFlowBetween` is the derivation-audit helper proving that netting
 * preserves the exact sum of the gross obligations it replaces.
 */

import { add, fromMinorUnits, type CurrencyCode, type Money } from './money.ts';
import { ValidationError } from './errors.ts';
import type { ProtocolClock, TimestampMs } from './clock.ts';
import type { Obligation, ObligationId, PartyId } from './obligation.ts';

export interface DelayPolicy {
  /** Master switch: is the delay/net-later strategy permitted at all? */
  readonly delayAllowed: boolean;
  /** Maximum delay duration in milliseconds (bigint). */
  readonly maxDelayMs: bigint;
  /**
   * Must the delay be backed by an explicit instrument (credit exposure or
   * reserved liquidity)? When true, `canDelay` reports the required backing
   * kind so the caller can never silently borrow.
   */
  readonly requiresExplicitBacking: boolean;
}

/** Typed reason an obligation may not be delayed. */
export type DelayRejectionReason =
  | 'OBLIGATION_NOT_PENDING'
  | 'POLICY_FORBIDS_DELAY'
  | 'WINDOW_ALREADY_CLOSED'
  | 'INTENT_DEADLINE_WOULD_BE_BREACHED'
  | 'EXCEEDS_MAX_DELAY';

/** The explicit delay decision (never silent). */
export interface DelayDecision {
  readonly obligationId: ObligationId;
  readonly canDelay: boolean;
  /** Empty when allowed; every rejection reason is listed. */
  readonly reasons: readonly DelayRejectionReason[];
  /** Proposed settle time when delay is allowed (the window close). */
  readonly delayedUntil?: TimestampMs;
  /** Delay duration in ms when allowed. */
  readonly delayMs?: bigint;
  /** True when the policy demands explicit credit/liquidity backing. */
  readonly requiresExplicitBacking: boolean;
}

/** An obligation id is not a member of the netting set / unknown input. */
/**
 * Explicit delay decision for one obligation (never silent).
 *
 * Delay target is the obligation's own due-window close. Allowed only when:
 * - the obligation is still PENDING;
 * - `policy.delayAllowed` is true;
 * - the window has not already closed at `now`;
 * - settling at the window close still satisfies the intent deadline
 *   (`delayedUntil <= intentDeadline`);
 * - the delay duration `closesAt − now` is within `policy.maxDelayMs`.
 *
 * When `policy.requiresExplicitBacking` is true the decision flags it, so a
 * caller can never treat a delay as free value — backing must come from an
 * explicit credit exposure or reserved liquidity (both kernels DEFERRED to
 * P5-W1; the flag preserves the handoff contract).
 */
export function canDelay(
  obligation: Obligation,
  intentDeadline: TimestampMs,
  policy: DelayPolicy,
  clock: ProtocolClock,
): DelayDecision {
  if (obligation === null || typeof obligation !== 'object') {
    throw new ValidationError('obligation must be an Obligation object');
  }
  if (typeof intentDeadline !== 'bigint') {
    throw new ValidationError('intentDeadline must be a bigint TimestampMs');
  }
  if (policy === null || typeof policy !== 'object') {
    throw new ValidationError('policy must be a DelayPolicy object');
  }
  if (typeof policy.maxDelayMs !== 'bigint' || policy.maxDelayMs < 0n) {
    throw new ValidationError('policy.maxDelayMs must be a non-negative bigint');
  }
  const now = clock.now();

  const reasons: DelayRejectionReason[] = [];
  if (obligation.state !== 'PENDING') {
    reasons.push('OBLIGATION_NOT_PENDING');
  }
  if (!policy.delayAllowed) {
    reasons.push('POLICY_FORBIDS_DELAY');
  }
  const closesAt = obligation.dueWindow.closesAt;
  if (now >= closesAt) {
    reasons.push('WINDOW_ALREADY_CLOSED');
  }
  const delayMs = closesAt - now;
  if (closesAt > intentDeadline) {
    reasons.push('INTENT_DEADLINE_WOULD_BE_BREACHED');
  }
  if (delayMs > policy.maxDelayMs) {
    reasons.push('EXCEEDS_MAX_DELAY');
  }

  if (reasons.length > 0) {
    return Object.freeze({
      obligationId: obligation.id,
      canDelay: false,
      reasons: Object.freeze(reasons),
      requiresExplicitBacking: policy.requiresExplicitBacking,
    });
  }
  return Object.freeze({
    obligationId: obligation.id,
    canDelay: true,
    reasons: Object.freeze([]),
    delayedUntil: closesAt,
    delayMs,
    requiresExplicitBacking: policy.requiresExplicitBacking,
  });
}


/**
 * Sum of gross obligation amounts between exactly two counterparties in one
 * currency (unsigned gross flow per direction, then netted). Exposed for
 * derivation audits: `grossFlowBetween` proves the instruction preserves
 * the exact sum of the gross obligations it replaces.
 */
export function grossFlowBetween(
  obligations: readonly Obligation[],
  a: PartyId,
  b: PartyId,
  currency: CurrencyCode,
): { readonly owedByA: Money; readonly owedByB: Money; readonly net: Money } {
  if (!Array.isArray(obligations)) {
    throw new ValidationError('obligations must be an array of Obligation');
  }
  let owedByA: Money = fromMinorUnits(currency, 0n);
  let owedByB: Money = fromMinorUnits(currency, 0n);
  for (const obligation of obligations) {
    const pairInvolvesA = obligation.debtor === a || obligation.creditor === a;
    const pairInvolvesB = obligation.debtor === b || obligation.creditor === b;
    if (!pairInvolvesA || !pairInvolvesB) continue;
    if (obligation.amount.currency !== currency) continue;
    if (obligation.debtor === a) {
      owedByA = add(owedByA, obligation.amount);
    } else {
      owedByB = add(owedByB, obligation.amount);
    }
  }
  return Object.freeze({ owedByA, owedByB, net: add(owedByA, owedByB) });
}
