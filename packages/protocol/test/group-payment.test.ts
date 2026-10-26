import { describe, expect, it } from 'vitest';
import {
  GroupConsentError,
  GroupMembershipError,
  PARTIAL_SETTLEMENT_POLICIES,
  PRIVACY_SCOPES,
  REFUND_POLICIES,
  deriveGroupSettlement,
  planIsChargeable,
  assertConsented,
  validateGroupPaymentPlan,
} from '../src/group-payment.ts';
import type { GroupPaymentPlan } from '../src/group-payment.ts';
import {
  DeterministicClock,
  GHS,
  InMemoryObligationBook,
  USD,
  ValidationError,
  asClearingRecordId,
  asFulfillmentActivityId,
  asPartyId,
  deriveObligations,
  fromMinorUnits,
  settleObligation,
} from '../src/index.ts';
import type { Obligation, ObligationDueWindow } from '../src/index.ts';

/**
 * The group payment plan — consent-gated, gross-immutable (P16-B, gap-matrix
 * row B10; ADR-0009 D5). Site classification (this file): 11 NET-NEW sites
 * covering the EXACT membership law over a real InMemoryObligationBook
 * (unknown / non-PENDING / foreign / duplicate enrollment), the consent gate
 * (DRAFT legal, chargeable only with every party's explicit unrevoked
 * party-matching consent) and deriveGroupSettlement purity (one stub per
 * participant+currency, spanning due windows, sum preserved, gross NEVER
 * mutated).
 */

const O1 = 'OBL:clr-1:alice>bob:USD';
const O2 = 'OBL:clr-2:bob>carol:USD';
const O3 = 'OBL:clr-3:alice>carol:USD';
const O4 = 'OBL:clr-4:alice>dave:GHS';
const PLAN_WINDOW = { opensAt: 1_000n, closesAt: 10_000n } as const;

function deriveOne(
  recordId: string,
  debtor: string,
  creditor: string,
  currency: typeof USD | typeof GHS,
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
            amount: fromMinorUnits(currency, minorUnits),
            occurredAt: 1_000n,
          },
        ],
      },
    ],
    { dueWindow },
  );
  return derived[0] as Obligation;
}

/** A real in-memory book carrying the four gross obligations (o4 stays unenrolled by dave). */
function freshBook(): { book: InMemoryObligationBook; obligations: readonly Obligation[] } {
  const book = new InMemoryObligationBook();
  const obligations = [
    deriveOne('clr-1', 'alice', 'bob', USD, 100n, { opensAt: 1_500n, closesAt: 5_000n }),
    deriveOne('clr-2', 'bob', 'carol', USD, 60n, { opensAt: 2_000n, closesAt: 7_000n }),
    deriveOne('clr-3', 'carol', 'alice', USD, 30n, { opensAt: 2_500n, closesAt: 6_000n }),
    deriveOne('clr-4', 'alice', 'dave', GHS, 55_000n, { opensAt: 1_200n, closesAt: 6_000n }),
  ];
  for (const obligation of obligations) {
    book.add(obligation);
  }
  return { book, obligations };
}

function draftPlanInput(): Record<string, unknown> {
  return {
    planId: 'gp-1',
    participants: [
      { partyRef: 'alice', obligationIds: [O1, O4] },
      { partyRef: 'bob', obligationIds: [O2] },
      { partyRef: 'carol', obligationIds: [O3] },
    ],
    settlementRules: {
      partialPolicy: 'HOLD_FOR_FULL_SETTLEMENT',
      refundPolicy: 'REFUND_ON_CANCEL',
      privacyScope: 'PARTICIPANTS_ONLY',
    },
    window: { ...PLAN_WINDOW },
  };
}

function withConsent(
  plan: Record<string, unknown>,
  partyRef: string,
  consent: Record<string, unknown>,
): Record<string, unknown> {
  const participants = plan.participants as Record<string, unknown>[];
  const index = participants.findIndex((participant) => participant.partyRef === partyRef);
  participants[index] = { ...participants[index]!, consent };
  return plan;
}

function fullyConsentedPlan(): Record<string, unknown> {
  const plan = draftPlanInput();
  withConsent(plan, 'alice', { consentId: 'consent-alice', partyRef: 'alice', grantedAt: 2_000n });
  withConsent(plan, 'bob', { consentId: 'consent-bob', partyRef: 'bob', grantedAt: 2_100n });
  withConsent(plan, 'carol', { consentId: 'consent-carol', partyRef: 'carol', grantedAt: 2_200n });
  return plan;
}

const bigintSafe = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === 'bigint' ? `bigint:${entry.toString()}` : entry,
  );

describe('validateGroupPaymentPlan (the EXACT membership law)', () => {
  it('validates and freezes a DRAFT plan over real book obligations (vocabularies + window laws enforced)', () => {
    const { book } = freshBook();
    const plan = validateGroupPaymentPlan(draftPlanInput(), book.all);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.participants)).toBe(true);
    expect(plan.planId).toBe('gp-1');
    expect(plan.participants.map((participant) => participant.partyRef)).toEqual([
      asPartyId('alice'),
      asPartyId('bob'),
      asPartyId('carol'),
    ]);
    expect(plan.settlementRules).toEqual({
      partialPolicy: 'HOLD_FOR_FULL_SETTLEMENT',
      refundPolicy: 'REFUND_ON_CANCEL',
      privacyScope: 'PARTICIPANTS_ONLY',
    });
    expect(plan.window).toEqual(PLAN_WINDOW);
    // the three vocabularies are frozen and reject unknown values
    expect(Object.isFrozen(PARTIAL_SETTLEMENT_POLICIES)).toBe(true);
    expect(Object.isFrozen(REFUND_POLICIES)).toBe(true);
    expect(Object.isFrozen(PRIVACY_SCOPES)).toBe(true);
    expect(() =>
      validateGroupPaymentPlan(
        { ...draftPlanInput(), settlementRules: { partialPolicy: 'WHENEVER', refundPolicy: 'REFUND_ON_CANCEL', privacyScope: 'PARTICIPANTS_ONLY' } },
        book.all,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateGroupPaymentPlan(
        { ...draftPlanInput(), settlementRules: { partialPolicy: 'PROPORTIONAL_PARTIAL', refundPolicy: 'MAYBE', privacyScope: 'PARTICIPANTS_ONLY' } },
        book.all,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateGroupPaymentPlan(
        { ...draftPlanInput(), settlementRules: { partialPolicy: 'PROPORTIONAL_PARTIAL', refundPolicy: 'REFUND_ON_CANCEL', privacyScope: 'EVERYONE' } },
        book.all,
      ),
    ).toThrow(ValidationError);
    // window + shape laws
    expect(() =>
      validateGroupPaymentPlan({ ...draftPlanInput(), window: { opensAt: 5_000n, closesAt: 4_999n } }, book.all),
    ).toThrow(ValidationError);
    expect(() => validateGroupPaymentPlan({ ...draftPlanInput(), participants: [] }, book.all)).toThrow(
      GroupMembershipError,
    );
    expect(() =>
      validateGroupPaymentPlan(
        { ...draftPlanInput(), participants: [{ partyRef: 'alice', obligationIds: [] }] },
        book.all,
      ),
    ).toThrow(GroupMembershipError);
    expect(() => validateGroupPaymentPlan('plan', book.all)).toThrow(ValidationError);
  });

  it('rejects enrollment of an obligation that was not supplied to the plan', () => {
    const { book } = freshBook();
    const plan = draftPlanInput();
    (plan.participants as Record<string, unknown>[])[1] = { partyRef: 'bob', obligationIds: [O2, 'OBL:clr-9:x>y:USD'] };
    expect(() => validateGroupPaymentPlan(plan, book.all)).toThrow(GroupMembershipError);
  });

  it('rejects non-PENDING obligations (settled through the real machine)', () => {
    const { book, obligations } = freshBook();
    settleObligation(book, obligations[1]!.id, new DeterministicClock(3_000n)); // o2 inside its window
    expect(book.get(obligations[1]!.id)?.state).toBe('SETTLED');
    expect(() => validateGroupPaymentPlan(draftPlanInput(), book.all)).toThrow(GroupMembershipError);
  });

  it('rejects an obligation that belongs to neither debtor nor creditor of the enrolled participant', () => {
    const { book } = freshBook();
    const plan = draftPlanInput();
    // o2 is bob -> carol; alice is neither party
    (plan.participants as Record<string, unknown>[])[0] = { partyRef: 'alice', obligationIds: [O1, O2, O4] };
    try {
      validateGroupPaymentPlan(plan, book.all);
      throw new Error('must throw');
    } catch (error) {
      const typed = error as GroupMembershipError;
      expect(typed).toBeInstanceOf(GroupMembershipError);
      expect(typed.code).toBe('GROUP_MEMBERSHIP_MISMATCH');
      expect(typed.category).toBe('VALIDATION');
      const details = typed.details as Record<string, unknown>;
      expect(details['obligationId']).toBe(O2);
      expect(details['partyRef']).toBe(asPartyId('alice'));
    }
  });

  it('rejects duplicate enrollment (within one participant, across participants, duplicate partyRef)', () => {
    const { book } = freshBook();
    const within = draftPlanInput();
    (within.participants as Record<string, unknown>[])[1] = { partyRef: 'bob', obligationIds: [O2, O2] };
    expect(() => validateGroupPaymentPlan(within, book.all)).toThrow(GroupMembershipError);
    const across = draftPlanInput();
    (across.participants as Record<string, unknown>[])[2] = { partyRef: 'carol', obligationIds: [O2, O3] };
    expect(() => validateGroupPaymentPlan(across, book.all)).toThrow(GroupMembershipError);
    const sameParty = draftPlanInput();
    (sameParty.participants as Record<string, unknown>[])[2] = { partyRef: 'alice', obligationIds: [O3] };
    expect(() => validateGroupPaymentPlan(sameParty, book.all)).toThrow(GroupMembershipError);
  });
});

describe('the consent gate (explicit, unrevoked, party-matching)', () => {
  it('DRAFT enrollment without consent is legal; chargeable only when EVERY party consents', () => {
    const { book } = freshBook();
    const draft = validateGroupPaymentPlan(draftPlanInput(), book.all);
    expect(draft.participants.every((participant) => participant.consent === undefined)).toBe(true);
    expect(planIsChargeable(draft)).toBe(false);
    const partial = validateGroupPaymentPlan(
      (() => {
        const plan = draftPlanInput();
        withConsent(plan, 'alice', { consentId: 'consent-alice', partyRef: 'alice', grantedAt: 2_000n });
        withConsent(plan, 'bob', { consentId: 'consent-bob', partyRef: 'bob', grantedAt: 2_100n });
        return plan;
      })(),
      book.all,
    );
    expect(planIsChargeable(partial)).toBe(false); // carol still missing
    const full = validateGroupPaymentPlan(fullyConsentedPlan(), book.all);
    expect(planIsChargeable(full)).toBe(true);
    expect(() => assertConsented(full)).not.toThrow();
  });

  it('party-matching is enforced, revocation flips chargeable, assertConsented names the missing parties', () => {
    const { book } = freshBook();
    const mismatched = validateGroupPaymentPlan(
      (() => {
        const plan = fullyConsentedPlan();
        withConsent(plan, 'carol', { consentId: 'consent-carol', partyRef: 'mallory', grantedAt: 2_200n });
        return plan;
      })(),
      book.all,
    );
    expect(planIsChargeable(mismatched)).toBe(false);
    try {
      assertConsented(mismatched);
      throw new Error('must throw');
    } catch (error) {
      const typed = error as GroupConsentError;
      expect(typed).toBeInstanceOf(GroupConsentError);
      expect(typed.code).toBe('GROUP_CONSENT_MISSING');
      expect(typed.category).toBe('AUTHORIZATION_REQUIRED');
      expect((typed.details as Record<string, unknown>)['missingParties']).toEqual([asPartyId('carol')]);
    }
    const revoked = validateGroupPaymentPlan(
      (() => {
        const plan = fullyConsentedPlan();
        withConsent(plan, 'bob', {
          consentId: 'consent-bob',
          partyRef: 'bob',
          grantedAt: 2_100n,
          revokedAt: 3_000n,
        });
        return plan;
      })(),
      book.all,
    );
    expect(planIsChargeable(revoked)).toBe(false);
    expect((revoked.participants[1]!.consent?.revokedAt)).toBe(3_000n);
    expect(() => assertConsented(revoked)).toThrow(GroupConsentError);
    // malformed consent records are refused at validation time
    const badConsent = draftPlanInput();
    withConsent(badConsent, 'alice', { consentId: '', partyRef: 'alice', grantedAt: 2_000n });
    expect(() => validateGroupPaymentPlan(badConsent, book.all)).toThrow(ValidationError);
    const badRevocation = draftPlanInput();
    withConsent(badRevocation, 'alice', { consentId: 'c', partyRef: 'alice', grantedAt: 2_000n, revokedAt: 2_500 });
    expect(() => validateGroupPaymentPlan(badRevocation, book.all)).toThrow(ValidationError);
  });
});

describe('deriveGroupSettlement (PURE; the gross obligations are NEVER mutated)', () => {
  it('derives exactly one stub per (participant, currency) — currencies never mixed, output sorted', () => {
    const { book } = freshBook();
    const plan = validateGroupPaymentPlan(draftPlanInput(), book.all);
    const stubs = deriveGroupSettlement(plan, book.all);
    expect(stubs).toHaveLength(4);
    expect(stubs.map((stub) => `${stub.participant.partyRef}:${stub.amount.currency}`)).toEqual([
      'alice:GHS',
      'alice:USD',
      'bob:USD',
      'carol:USD',
    ]);
    expect(stubs.map((stub) => stub.amount.value)).toEqual([55_000n, 100n, 60n, 30n]);
    expect(Object.isFrozen(stubs)).toBe(true);
    for (const stub of stubs) {
      expect(typeof stub.amount.currency).toBe('string');
      expect(typeof stub.amount.value).toBe('bigint');
      expect(stub.participant.obligationIds.length).toBeGreaterThan(0);
    }
  });

  it('the stub due window spans the member obligations (earliest open, latest close)', () => {
    const { book } = freshBook();
    const plan = validateGroupPaymentPlan(draftPlanInput(), book.all);
    const stubs = deriveGroupSettlement(plan, book.all);
    // alice spans o1 [1500,5000] + o4 [1200,6000]; bob spans o2 [2000,7000]; carol spans o3 [2500,6000]
    expect(stubs[0]?.dueWindow).toEqual({ opensAt: 1_200n, closesAt: 6_000n });
    expect(stubs[1]?.dueWindow).toEqual({ opensAt: 1_200n, closesAt: 6_000n });
    expect(stubs[2]?.dueWindow).toEqual({ opensAt: 2_000n, closesAt: 7_000n });
    expect(stubs[3]?.dueWindow).toEqual({ opensAt: 2_500n, closesAt: 6_000n });
  });

  it('SUM is preserved per currency and the gross obligations are NEVER mutated', () => {
    const { book } = freshBook();
    const plan = validateGroupPaymentPlan(draftPlanInput(), book.all);
    const before = bigintSafe(book.all);
    const stubs = deriveGroupSettlement(plan, book.all);
    const usdTotal = stubs
      .filter((stub) => stub.amount.currency === USD)
      .reduce((sum, stub) => sum + stub.amount.value, 0n);
    const ghsTotal = stubs
      .filter((stub) => stub.amount.currency === GHS)
      .reduce((sum, stub) => sum + stub.amount.value, 0n);
    expect(usdTotal).toBe(190n); // 100 + 60 + 30 — every enrolled USD obligation counted once
    expect(ghsTotal).toBe(55_000n);
    // the book itself is untouched: same length, same amounts, same parties, same states
    expect(bigintSafe(book.all)).toBe(before);
    expect(book.all).toHaveLength(4);
    expect(book.all.every((obligation) => obligation.state === 'PENDING')).toBe(true);
    // deriving again from the same inputs is identical (fresh objects, not cached identities)
    const again = deriveGroupSettlement(validateGroupPaymentPlan(draftPlanInput(), book.all), book.all);
    expect(again).toEqual(stubs);
    expect(again).not.toBe(stubs);
  });

  it('is fail-closed (invalid membership refuses derivation) and byte-identical on independent replays', () => {
    const { book } = freshBook();
    const invalid = draftPlanInput();
    (invalid.participants as Record<string, unknown>[])[1] = { partyRef: 'bob', obligationIds: [O2, O2] };
    expect(() =>
      deriveGroupSettlement(invalid as unknown as GroupPaymentPlan, book.all),
    ).toThrow(GroupMembershipError);
    const first = deriveGroupSettlement(validateGroupPaymentPlan(fullyConsentedPlan(), book.all), book.all);
    const second = deriveGroupSettlement(validateGroupPaymentPlan(fullyConsentedPlan(), book.all), book.all);
    expect(bigintSafe(first)).toBe(bigintSafe(second)); // byte-identical rendering
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});
