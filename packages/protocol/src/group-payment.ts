/**
 * The group payment plan — consent-gated, gross-immutable (P16-B,
 * gap-matrix row B10; ADR-0009 D5). A GroupPaymentPlan enrolls
 * participants over EXACT obligation memberships: every referenced
 * obligation must exist, be PENDING and belong to the enrolled participant
 * (its debtor or creditor), and no obligation may be enrolled twice
 * (within one participant or across participants) — typed
 * GroupMembershipError otherwise.
 *
 * Charging is consent-gated: DRAFT enrollment without consent is legal,
 * but `planIsChargeable` requires EVERY participant's EXPLICIT, unrevoked,
 * party-matching consent, and `assertConsented` fails closed naming the
 * missing parties. Consent is per-party records only — a public capability
 * or an agent-generated proposal is never participant consent.
 *
 * `deriveGroupSettlement` is PURE: per-participant settlement stubs, one
 * per (participant, currency) — currencies are never mixed inside a stub —
 * with exact money.ts arithmetic, a due window spanning the member
 * obligations (earliest open, latest close) and the sum preserved per
 * currency. The GROSS obligations are NEVER mutated: the stubs are a
 * derived view; the obligations remain the authority.
 */

import { add, fromMinorUnits, getCurrencyInfo } from './money.ts';
import type { CurrencyCode, Money } from './money.ts';
import { PaySwapError, ValidationError } from './errors.ts';
import type { PaySwapErrorDetails } from './errors.ts';
import type { TimestampMs } from './clock.ts';
import { asObligationId, asPartyId } from './obligation.ts';
import type { Obligation, ObligationDueWindow, ObligationId, PartyId } from './obligation.ts';

/** How partial settlement of the group's obligations is handled. */
export const PARTIAL_SETTLEMENT_POLICIES = Object.freeze(['PROPORTIONAL_PARTIAL', 'HOLD_FOR_FULL_SETTLEMENT'] as const);
/** How refunds are handled when the plan cannot complete. */
export const REFUND_POLICIES = Object.freeze(['REFUND_ON_CANCEL', 'REFUND_LESS_FEES', 'NO_REFUND'] as const);
/** Who may observe the plan's settlement details. */
export const PRIVACY_SCOPES = Object.freeze(['PARTICIPANTS_ONLY', 'PARTIES_AND_REGULATOR', 'PUBLIC_SUMMARY'] as const);

/** One partial-settlement policy from the frozen vocabulary. */
export type PartialSettlementPolicy = (typeof PARTIAL_SETTLEMENT_POLICIES)[number];
/** One refund policy from the frozen vocabulary. */
export type RefundPolicy = (typeof REFUND_POLICIES)[number];
/** One privacy scope from the frozen vocabulary. */
export type PrivacyScope = (typeof PRIVACY_SCOPES)[number];

/** One party's explicit consent record (per-party records only). */
export interface PartyConsent {
  readonly consentId: string;
  readonly partyRef: PartyId;
  readonly grantedAt: TimestampMs;
  /** Present when the consent has been revoked (a revoked consent never charges). */
  readonly revokedAt?: TimestampMs;
}

/** One enrolled participant: a party, its obligations and (optionally, while DRAFT) its consent. */
export interface GroupParticipant {
  readonly partyRef: PartyId;
  readonly obligationIds: readonly ObligationId[];
  readonly consent?: PartyConsent;
}

/** The settlement-rule vocabularies of the plan. */
export interface GroupSettlementRules {
  readonly partialPolicy: PartialSettlementPolicy;
  readonly refundPolicy: RefundPolicy;
  readonly privacyScope: PrivacyScope;
}

/** A group payment plan over exact obligation memberships. */
export interface GroupPaymentPlan {
  readonly planId: string;
  /** Non-empty; partyRefs unique (duplicate enrollment is rejected). */
  readonly participants: readonly GroupParticipant[];
  readonly settlementRules: GroupSettlementRules;
  readonly window: ObligationDueWindow;
}

/** The membership law was violated (unknown/non-PENDING/foreign/duplicate enrollment). */
export class GroupMembershipError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'GROUP_MEMBERSHIP_MISMATCH', category: 'VALIDATION', message, details });
  }
}

/** The consent gate refused the plan (missing, mismatched or revoked consents). */
export class GroupConsentError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({ code: 'GROUP_CONSENT_MISSING', category: 'AUTHORIZATION_REQUIRED', message, details });
  }
}

/** One derived per-participant settlement stub (a view — never a mutation of the gross). */
export interface GroupSettlementStub {
  readonly participant: GroupParticipant;
  /** The participant's enrolled gross exposure in exactly ONE currency. */
  readonly amount: Money;
  /** Spans the member obligations: earliest opensAt, latest closesAt. */
  readonly dueWindow: ObligationDueWindow;
}

// ---------------------------------------------------------------------------
// Validation (the EXACT membership law)
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

function expectOneOf<T extends string>(value: unknown, field: string, vocabulary: readonly T[]): T {
  if (typeof value !== 'string' || !(vocabulary as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} must be one of: ${vocabulary.join(', ')}`, { field, value: String(value) });
  }
  return value as T;
}

function expectConsent(value: unknown, field: string): PartyConsent {
  if (!isObject(value)) {
    throw new ValidationError(`${field} must be a PartyConsent object`, { field });
  }
  const out: { -readonly [K in keyof PartyConsent]: PartyConsent[K] } = {
    consentId: expectString(value.consentId, `${field}.consentId`),
    partyRef: asPartyId(expectString(value.partyRef, `${field}.partyRef`)),
    grantedAt: expectTimestamp(value.grantedAt, `${field}.grantedAt`),
  };
  if (value.revokedAt !== undefined) {
    out.revokedAt = expectTimestamp(value.revokedAt, `${field}.revokedAt`);
  }
  return out;
}

function expectParticipant(value: unknown, field: string): GroupParticipant {
  if (!isObject(value)) {
    throw new ValidationError(`${field} must be a GroupParticipant object`, { field });
  }
  const obligationIds = value.obligationIds;
  if (!Array.isArray(obligationIds) || obligationIds.length === 0) {
    throw new GroupMembershipError(`${field}.obligationIds must be a non-empty array — a participant enrolls at least one obligation`, { field });
  }
  const out: { -readonly [K in keyof GroupParticipant]: GroupParticipant[K] } = {
    partyRef: asPartyId(expectString(value.partyRef, `${field}.partyRef`)),
    obligationIds: obligationIds.map((entry, index) => asObligationId(expectString(entry, `${field}.obligationIds[${index}]`))),
  };
  if (value.consent !== undefined) {
    out.consent = expectConsent(value.consent, `${field}.consent`);
  }
  return out;
}

function expectWindow(value: unknown): ObligationDueWindow {
  if (!isObject(value)) {
    throw new ValidationError('window must be an ObligationDueWindow object');
  }
  const opensAt = expectTimestamp(value.opensAt, 'window.opensAt');
  const closesAt = expectTimestamp(value.closesAt, 'window.closesAt');
  if (closesAt < opensAt) {
    throw new ValidationError('window closes before it opens', { opensAt: opensAt.toString(), closesAt: closesAt.toString() });
  }
  return { opensAt, closesAt };
}

/**
 * Fail-closed plan validation with the EXACT membership law: every
 * referenced obligation exists in `obligations`, is PENDING, and belongs to
 * the enrolled participant (its debtor or creditor); no obligation is
 * enrolled twice within or across participants; participant partyRefs are
 * unique. Consent is NOT required here — DRAFT enrollment without consent
 * is legal; the charge gate is `planIsChargeable`/`assertConsented`.
 */
export function validateGroupPaymentPlan(plan: unknown, obligations: readonly Obligation[]): GroupPaymentPlan {
  if (!isObject(plan)) {
    throw new ValidationError('plan must be a GroupPaymentPlan object');
  }
  if (!Array.isArray(obligations)) {
    throw new ValidationError('obligations must be an array of Obligation');
  }
  const rawParticipants = plan.participants;
  if (!Array.isArray(rawParticipants) || rawParticipants.length === 0) {
    throw new GroupMembershipError('participants must be a non-empty array');
  }
  const participants = rawParticipants.map((entry, index) => expectParticipant(entry, `participants[${index}]`));
  const byParty = new Map<string, GroupParticipant>();
  for (const participant of participants) {
    const existing = byParty.get(participant.partyRef);
    if (existing !== undefined) {
      throw new GroupMembershipError('duplicate enrollment: a party cannot enroll twice', { partyRef: participant.partyRef });
    }
    byParty.set(participant.partyRef, participant);
  }
  const byId = new Map<string, Obligation>();
  for (const obligation of obligations) {
    if (byId.has(obligation.id)) {
      throw new ValidationError('obligations supplied to the plan must be unique', { obligationId: obligation.id });
    }
    byId.set(obligation.id, obligation);
  }
  const enrolled = new Map<string, GroupParticipant>();
  for (const participant of participants) {
    const seen = new Set<string>();
    for (const obligationId of participant.obligationIds) {
      const obligation = byId.get(obligationId);
      if (obligation === undefined) {
        throw new GroupMembershipError('referenced obligation was not supplied to the plan', { obligationId, partyRef: participant.partyRef });
      }
      if (obligation.state !== 'PENDING') {
        throw new GroupMembershipError('only PENDING obligations may be enrolled in a group payment plan', { obligationId, state: obligation.state });
      }
      if (obligation.debtor !== participant.partyRef && obligation.creditor !== participant.partyRef) {
        throw new GroupMembershipError('obligation does not belong to the enrolled participant (neither debtor nor creditor)', {
          obligationId, partyRef: participant.partyRef, debtor: obligation.debtor, creditor: obligation.creditor,
        });
      }
      if (seen.has(obligationId)) {
        throw new GroupMembershipError('duplicate enrollment within one participant', { obligationId, partyRef: participant.partyRef });
      }
      seen.add(obligationId);
      const other = enrolled.get(obligationId);
      if (other !== undefined) {
        throw new GroupMembershipError('duplicate enrollment across participants', {
          obligationId, first: other.partyRef, second: participant.partyRef,
        });
      }
      enrolled.set(obligationId, participant);
    }
  }
  return Object.freeze({
    planId: expectString(plan.planId, 'planId'),
    participants: Object.freeze(participants),
    settlementRules: expectRules(plan.settlementRules),
    window: expectWindow(plan.window),
  });
}

function expectRules(value: unknown): GroupSettlementRules {
  if (!isObject(value)) {
    throw new ValidationError('settlementRules must be a GroupSettlementRules object');
  }
  return Object.freeze({
    partialPolicy: expectOneOf(value.partialPolicy, 'settlementRules.partialPolicy', PARTIAL_SETTLEMENT_POLICIES),
    refundPolicy: expectOneOf(value.refundPolicy, 'settlementRules.refundPolicy', REFUND_POLICIES),
    privacyScope: expectOneOf(value.privacyScope, 'settlementRules.privacyScope', PRIVACY_SCOPES),
  });
}

// ---------------------------------------------------------------------------
// The consent gate (charging requires explicit unrevoked per-party consent)
// ---------------------------------------------------------------------------

/** Is this consent present, party-matching and unrevoked? */
function consentIsValid(participant: GroupParticipant): boolean {
  const consent = participant.consent;
  return consent !== undefined && consent.partyRef === participant.partyRef && consent.revokedAt === undefined;
}

/** Chargeable ONLY when EVERY participant's explicit unrevoked party-matching consent is present. */
export function planIsChargeable(plan: GroupPaymentPlan): boolean {
  return plan.participants.every((participant) => consentIsValid(participant));
}

/** Fails closed with GroupConsentError naming every party whose consent is missing, mismatched or revoked. */
export function assertConsented(plan: GroupPaymentPlan): void {
  const missingParties = plan.participants
    .filter((participant) => !consentIsValid(participant))
    .map((participant) => participant.partyRef);
  if (missingParties.length > 0) {
    throw new GroupConsentError(
      'group payment plan is not chargeable: explicit unrevoked per-party consent is required from every participant',
      { missingParties: [...missingParties] },
    );
  }
}

// ---------------------------------------------------------------------------
// deriveGroupSettlement (PURE; the gross obligations are NEVER mutated)
// ---------------------------------------------------------------------------

/**
 * Derives per-participant settlement stubs. One stub per (participant,
 * currency) — currencies are never mixed inside a stub — with the exact
 * sum of that participant's enrolled obligations in that currency
 * (money.ts `add`, exact bigint), and a due window spanning the member
 * obligations (earliest opensAt, latest closesAt). Output is sorted by
 * (partyRef, currency); the per-currency sum is preserved; the caller's
 * obligations are never mutated.
 */
export function deriveGroupSettlement(
  plan: GroupPaymentPlan,
  obligations: readonly Obligation[],
): readonly GroupSettlementStub[] {
  const validated = validateGroupPaymentPlan(plan, obligations);
  const byId = new Map<string, Obligation>(obligations.map((obligation) => [obligation.id, obligation]));
  const stubs: GroupSettlementStub[] = [];
  for (const participant of validated.participants) {
    const perCurrency = new Map<CurrencyCode, Money>();
    const dueWindows: ObligationDueWindow[] = [];
    for (const obligationId of participant.obligationIds) {
      const obligation = byId.get(obligationId);
      if (obligation === undefined) continue; // unreachable: membership was validated
      const current = perCurrency.get(obligation.amount.currency) ?? fromMinorUnits(obligation.amount.currency, 0n);
      perCurrency.set(obligation.amount.currency, add(current, obligation.amount));
      dueWindows.push(obligation.dueWindow);
    }
    for (const [, amount] of [...perCurrency.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      stubs.push(Object.freeze({
        participant,
        amount,
        dueWindow: Object.freeze({
          opensAt: dueWindows.reduce((min, window) => (window.opensAt < min ? window.opensAt : min), dueWindows[0]!.opensAt),
          closesAt: dueWindows.reduce((max, window) => (window.closesAt > max ? window.closesAt : max), dueWindows[0]!.closesAt),
        }),
      }));
    }
  }
  return Object.freeze(
    stubs.sort((a, b) =>
      a.participant.partyRef < b.participant.partyRef ? -1 : a.participant.partyRef > b.participant.partyRef ? 1 : 0,
    ),
  );
}
