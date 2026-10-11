import { describe, expect, it } from 'vitest';
import {
  DeterministicClock,
  GHS,
  MixedCurrencyNettingSetError,
  NettingMembershipError,
  NettingWindowError,
  USD,
  asClearingRecordId,
  asFulfillmentActivityId,
  asNettingSetId,
  asObligationId,
  asPartyId,
  asSettlementInstructionId,
  canonicalNetPosition,
  canDelay,
  createIdFactory,
  fromMinorUnits,
  grossFlowBetween,
  netPositions,
  settlementInstructions,
  type Money,
  type NettingSet,
  type Obligation,
} from '../src/index.ts';

function usd(minorUnits: bigint): Money {
  return fromMinorUnits(USD, minorUnits);
}

function obligation(
  id: string,
  debtor: string,
  creditor: string,
  amount: Money,
  dueWindow: { opensAt: bigint; closesAt: bigint } = { opensAt: 1_500n, closesAt: 9_000n },
): Obligation {
  return Object.freeze({
    id: asObligationId(id),
    debtor: asPartyId(debtor),
    creditor: asPartyId(creditor),
    amount,
    dueWindow: Object.freeze({ opensAt: dueWindow.opensAt, closesAt: dueWindow.closesAt }),
    state: 'PENDING',
    derivedFrom: asClearingRecordId('clr-test'),
  });
}

const NETTING_WINDOW = { opensAt: 1_000n, closesAt: 9_000n } as const;

function nettingSet(ids: readonly string[], setId = 'ns-1'): NettingSet {
  return {
    id: asNettingSetId(setId),
    obligations: ids.map((id) => asObligationId(id)),
    window: NETTING_WINDOW,
    createdAt: 1_200n,
  };
}

describe('netPositions (ported from old netting.test.ts; v1 same-currency)', () => {
  it('nets N gross obligations between two counterparties into one net position (sum preserved)', () => {
    const obligations = [
      obligation('o-1', 'alice', 'bob', usd(300n)),
      obligation('o-2', 'alice', 'bob', usd(200n)),
      obligation('o-3', 'bob', 'alice', usd(150n)),
      obligation('o-4', 'alice', 'bob', usd(50n)),
    ];
    const positions = netPositions(nettingSet(['o-1', 'o-2', 'o-3', 'o-4']), obligations);
    expect(positions.length).toBe(1);
    const position = positions[0];
    if (position === undefined) throw new Error('unreachable');
    expect(position.debtor).toBe(asPartyId('alice'));
    expect(position.creditor).toBe(asPartyId('bob'));
    // gross owed by alice: 300+200+50 = 550; owed by bob: 150; net = 400.
    expect(position.netAmount.value).toBe(400n);
    expect(position.netAmount.currency).toBe(USD);
  });

  it('fully offsetting pairs produce no net position', () => {
    const obligations = [
      obligation('o-1', 'alice', 'bob', usd(100n)),
      obligation('o-2', 'bob', 'alice', usd(100n)),
    ];
    const positions = netPositions(nettingSet(['o-1', 'o-2']), obligations);
    expect(positions.length).toBe(0);
  });

  it('nets per counterparty pair independently (same currency)', () => {
    const obligations = [
      obligation('o-1', 'alice', 'bob', usd(100n)),
      obligation('o-2', 'bob', 'carol', usd(70n)),
      obligation('o-3', 'bob', 'alice', usd(30n)),
    ];
    const positions = netPositions(nettingSet(['o-1', 'o-2', 'o-3']), obligations);
    expect(positions.length).toBe(2);
    // deterministic ordering: pair alice>bob first, then bob>carol.
    expect(positions[0]?.debtor).toBe(asPartyId('alice'));
    expect(positions[0]?.creditor).toBe(asPartyId('bob'));
    expect(positions[0]?.netAmount.value).toBe(70n);
    expect(positions[1]?.debtor).toBe(asPartyId('bob'));
    expect(positions[1]?.creditor).toBe(asPartyId('carol'));
    expect(positions[1]?.netAmount.value).toBe(70n);
  });

  it('gross obligations are never mutated and the derivation is preserved verbatim', () => {
    const obligations = [
      obligation('o-1', 'alice', 'bob', usd(300n)),
      obligation('o-2', 'bob', 'alice', usd(100n)),
    ];
    const snapshot = JSON.stringify(obligations, (_key, value: unknown) =>
      typeof value === 'bigint' ? `bigint:${value.toString()}` : value,
    );
    const positions = netPositions(nettingSet(['o-1', 'o-2']), obligations);
    expect(JSON.stringify(obligations, (_key, value: unknown) =>
      typeof value === 'bigint' ? `bigint:${value.toString()}` : value,
    )).toBe(snapshot);

    const position = positions[0];
    if (position === undefined) throw new Error('unreachable');
    expect(position.derivation.setId).toBe(asNettingSetId('ns-1'));
    expect(position.derivation.gross.length).toBe(2);
    expect(position.derivation.gross[0]?.id).toBe(asObligationId('o-1'));
    expect(position.derivation.gross[0]?.amount.value).toBe(300n);
    expect(position.derivation.gross[1]?.id).toBe(asObligationId('o-2'));
    expect(position.derivation.gross[1]?.amount.value).toBe(100n);
  });

  it('rebuilding from the same inputs is deterministic and byte-identical', () => {
    const obligations = [
      obligation('o-1', 'alice', 'bob', usd(300n)),
      obligation('o-2', 'alice', 'bob', usd(120n)),
      obligation('o-3', 'bob', 'alice', usd(45n)),
    ];
    const set = nettingSet(['o-1', 'o-2', 'o-3']);
    const firstRun = netPositions(set, obligations);
    const secondRun = netPositions(set, obligations);
    expect(firstRun.map(canonicalNetPosition).join('\n')).toBe(
      secondRun.map(canonicalNetPosition).join('\n'),
    );
  });

  it('rejects membership mismatches (missing member, extra obligation, duplicate)', () => {
    const obligations = [obligation('o-1', 'alice', 'bob', usd(10n))];
    expect(() => netPositions(nettingSet(['o-1', 'o-2']), obligations)).toThrow(NettingMembershipError);
    const both = [obligation('o-1', 'alice', 'bob', usd(10n)), obligation('o-2', 'a', 'b', usd(1n))];
    expect(() => netPositions(nettingSet(['o-1']), both)).toThrow(NettingMembershipError);
    expect(() =>
      netPositions(nettingSet(['o-1', 'o-1']), [obligation('o-1', 'alice', 'bob', usd(10n))]),
    ).toThrow(NettingMembershipError);
  });

  it('rejects non-PENDING obligations and windows that outlive the netting window', () => {
    const settled = { ...obligation('o-1', 'alice', 'bob', usd(10n)), state: 'SETTLED' as const };
    expect(() => netPositions(nettingSet(['o-1']), [settled])).toThrow(NettingWindowError);
    const late = obligation('o-late', 'alice', 'bob', usd(10n), {
      opensAt: 1_500n,
      closesAt: 20_000n,
    });
    expect(() => netPositions(nettingSet(['o-late']), [late])).toThrow(NettingWindowError);
  });

  it('derives from the real deriveObligations output without friction', async () => {
    const { deriveObligations } = await import('../src/index.ts');
    const record = {
      id: asClearingRecordId('clr-1'),
      activities: [
        {
          id: asFulfillmentActivityId('act-1'),
          activityType: 'PAYMENT_FULFILLED',
          debtor: asPartyId('alice'),
          creditor: asPartyId('bob'),
          amount: usd(100n),
          occurredAt: 1_000n,
        },
        {
          id: asFulfillmentActivityId('act-2'),
          activityType: 'PAYMENT_FULFILLED',
          debtor: asPartyId('bob'),
          creditor: asPartyId('alice'),
          amount: usd(25n),
          occurredAt: 1_000n,
        },
      ],
      netted: false,
    };
    const derived = deriveObligations([record], { dueWindow: { opensAt: 1_500n, closesAt: 9_000n } });
    expect(derived.length).toBe(1);
    const positions = netPositions(
      { id: asNettingSetId('ns-derive'), obligations: [derived[0]!.id], window: NETTING_WINDOW, createdAt: 1_200n },
      derived,
    );
    expect(positions[0]?.netAmount.value).toBe(75n);
  });
});

describe('v1 SAME-CURRENCY netting law (known limitation, deliberate)', () => {
  it('REJECTS a netting set spanning multiple currencies with a typed error', () => {
    const obligations = [
      obligation('o-usd', 'alice', 'bob', usd(100n)),
      obligation('o-ghs', 'alice', 'bob', fromMinorUnits(GHS, 55_000n)),
    ];
    expect(() => netPositions(nettingSet(['o-usd', 'o-ghs']), obligations)).toThrow(
      MixedCurrencyNettingSetError,
    );
  });

  it('cites the offending currency and obligation in the error details', () => {
    const obligations = [
      obligation('o-usd', 'alice', 'bob', usd(100n)),
      obligation('o-ghs', 'alice', 'bob', fromMinorUnits(GHS, 55_000n)),
    ];
    try {
      netPositions(nettingSet(['o-usd', 'o-ghs']), obligations);
      throw new Error('must throw');
    } catch (error) {
      const details = (error as MixedCurrencyNettingSetError).details as Record<string, unknown>;
      expect(details['offendingCurrency']).toBe(GHS);
      expect(details['offendingObligationId']).toBe(asObligationId('o-ghs'));
      expect(details['setCurrency']).toBe(USD);
      expect(String(details['setId'])).toBe('ns-1');
    }
  });

  it('per-currency netting in SEPARATE sets is the v1 workaround (cited deferral)', () => {
    const usdObligations = [obligation('o-usd', 'alice', 'bob', usd(100n))];
    const ghsObligations = [obligation('o-ghs', 'alice', 'bob', fromMinorUnits(GHS, 55_000n))];
    const usdPositions = netPositions(nettingSet(['o-usd'], 'ns-usd'), usdObligations);
    const ghsPositions = netPositions(nettingSet(['o-ghs'], 'ns-ghs'), ghsObligations);
    expect(usdPositions[0]?.netAmount.currency).toBe(USD);
    expect(ghsPositions[0]?.netAmount.currency).toBe(GHS);
  });
});

describe('settlementInstructions (protocol derivation)', () => {
  it('produces exactly one instruction per net position — sum preserved, derivation retained', () => {
    const obligations = [
      obligation('o-1', 'alice', 'bob', usd(300n)),
      obligation('o-2', 'alice', 'bob', usd(200n)),
      obligation('o-3', 'bob', 'alice', usd(150n)),
    ];
    const positions = netPositions(nettingSet(['o-1', 'o-2', 'o-3']), obligations);
    const instructions = settlementInstructions(positions);
    expect(instructions.length).toBe(1);
    const instruction = instructions[0];
    if (instruction === undefined) throw new Error('unreachable');
    expect(instruction.amount.value).toBe(350n);
    expect(instruction.debtor).toBe(asPartyId('alice'));
    expect(instruction.creditor).toBe(asPartyId('bob'));
    expect(instruction.setId).toBe(asNettingSetId('ns-1'));
    // sum preservation: the instruction amount equals the exact net of gross flows
    const gross = obligations
      .filter((entry) => entry.debtor === asPartyId('alice'))
      .reduce((sum, entry) => sum + entry.amount.value, 0n);
    const reverse = obligations
      .filter((entry) => entry.debtor === asPartyId('bob'))
      .reduce((sum, entry) => sum + entry.amount.value, 0n);
    expect(instruction.amount.value).toBe(gross - reverse);
    // the instruction retains the full derivation
    expect(instruction.fromNetPosition.derivation.gross.length).toBe(3);
  });

  it('derives deterministic content-based ids (no factory) and honors an injected factory', () => {
    const obligations = [obligation('o-1', 'alice', 'bob', usd(10n))];
    const positions = netPositions(nettingSet(['o-1']), obligations);
    const first = settlementInstructions(positions);
    expect(first[0]?.id).toBe(asSettlementInstructionId('SI:ns-1:alice>bob:USD'));
    const again = settlementInstructions(netPositions(nettingSet(['o-1']), obligations));
    expect(again[0]?.id).toBe(first[0]?.id);
    const clock = new DeterministicClock(0n);
    const withFactory = settlementInstructions(positions, {
      ids: createIdFactory(clock),
    });
    expect(withFactory[0]?.id).not.toBe(first[0]?.id);
  });

  it('grossFlowBetween proves sum preservation for the audit', () => {
    const obligations = [
      obligation('o-1', 'alice', 'bob', usd(300n)),
      obligation('o-2', 'bob', 'alice', usd(150n)),
    ];
    const flow = grossFlowBetween(obligations, asPartyId('alice'), asPartyId('bob'), USD);
    expect(flow.owedByA.value).toBe(300n);
    expect(flow.owedByB.value).toBe(150n);
    expect(flow.net.value).toBe(450n);
  });
});

describe('canDelay (explicit, never silent; ported from old netting.test.ts)', () => {
  const policy = { delayAllowed: true, maxDelayMs: 10_000n, requiresExplicitBacking: true };

  it('allows delay while PENDING, inside maxDelay, with the intent deadline satisfiable', () => {
    const clock = new DeterministicClock(2_000n);
    const decision = canDelay(obligation('o-1', 'alice', 'bob', usd(10n)), 20_000n, policy, clock);
    expect(decision.canDelay).toBe(true);
    expect(decision.reasons).toEqual([]);
    expect(decision.delayedUntil).toBe(9_000n);
    expect(decision.delayMs).toBe(7_000n);
    expect(decision.requiresExplicitBacking).toBe(true);
  });

  it('rejects delay that would breach the intent deadline', () => {
    const clock = new DeterministicClock(2_000n);
    const decision = canDelay(obligation('o-1', 'alice', 'bob', usd(10n)), 8_999n, policy, clock);
    expect(decision.canDelay).toBe(false);
    expect(decision.reasons).toContain('INTENT_DEADLINE_WOULD_BE_BREACHED');
  });

  it('rejects delay beyond the policy maximum and when policy forbids delay', () => {
    const clock = new DeterministicClock(2_000n);
    const tight = { ...policy, maxDelayMs: 1_000n };
    const tooFar = canDelay(obligation('o-1', 'alice', 'bob', usd(10n)), 20_000n, tight, clock);
    expect(tooFar.canDelay).toBe(false);
    expect(tooFar.reasons).toContain('EXCEEDS_MAX_DELAY');
    const forbidden = { ...policy, delayAllowed: false };
    const blocked = canDelay(obligation('o-1', 'alice', 'bob', usd(10n)), 20_000n, forbidden, clock);
    expect(blocked.canDelay).toBe(false);
    expect(blocked.reasons).toContain('POLICY_FORBIDS_DELAY');
  });

  it('rejects delay after the window closed and for non-PENDING obligations', () => {
    const late = new DeterministicClock(9_500n);
    const closed = canDelay(obligation('o-1', 'alice', 'bob', usd(10n)), 20_000n, policy, late);
    expect(closed.canDelay).toBe(false);
    expect(closed.reasons).toContain('WINDOW_ALREADY_CLOSED');
    const settled = { ...obligation('o-1', 'alice', 'bob', usd(10n)), state: 'SETTLED' as const };
    const decision = canDelay(settled, 20_000n, policy, new DeterministicClock(2_000n));
    expect(decision.canDelay).toBe(false);
    expect(decision.reasons).toContain('OBLIGATION_NOT_PENDING');
  });

  it('flags that a delay needing third-party value requires explicit backing', () => {
    const clock = new DeterministicClock(2_000n);
    const decision = canDelay(obligation('o-1', 'alice', 'bob', usd(10n)), 20_000n, policy, clock);
    expect(decision.requiresExplicitBacking).toBe(true);
    expect(decision.canDelay).toBe(true);
  });
});
