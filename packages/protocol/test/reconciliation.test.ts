import { describe, expect, it } from 'vitest';
import {
  ProviderRevisionConflictError,
  ProviderRevisionLedger,
  ReconciliationCaseError,
  SettlementAttemptLedger,
  SettlementReconciliationAuthority,
  ValidationError,
  asReconciliationCaseId,
  asSettlementAttemptId,
  type SettlementAttemptId,
} from '../src/index.ts';

const INSTRUCTION_ID = 'SI:ns-1:alice>bob:USD';
const principal = { principalType: 'svc', principalId: 'settlement-runner' };
const reconciler = { principalType: 'svc', principalId: 'reconciler' };

function setup(): { ledger: SettlementAttemptLedger; reconciliation: SettlementReconciliationAuthority } {
  const ledger = new SettlementAttemptLedger();
  const reconciliation = new SettlementReconciliationAuthority(ledger);
  return { ledger, reconciliation };
}

function beginUnknownAttempt(ledger: SettlementAttemptLedger, attemptId = 'att-1'): SettlementAttemptId {
  const branded = asSettlementAttemptId(attemptId);
  ledger.begin({
    attemptId: branded,
    instructionId: INSTRUCTION_ID,
    rail: 'WISE',
    idempotencyKey: `key-${attemptId}`,
    principal,
    now: 1_000n,
  });
  ledger.start(branded, 1_100n);
  ledger.recordExternalOutcome(branded, 'OUTCOME_UNKNOWN', ['ev-timeout'], 1_200n);
  return branded;
}

describe('SettlementReconciliationAuthority (adapted from old reconciliation.test.ts; INV-04)', () => {
  it('opens a case only for a genuinely ambiguous attempt', () => {
    const { ledger, reconciliation } = setup();
    const attemptId = beginUnknownAttempt(ledger);
    const record = reconciliation.openCase({
      caseId: 'case-1',
      subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId: asSettlementAttemptId(attemptId) },
      reason: 'EXTERNAL_AMBIGUITY',
      now: 1_300n,
    });
    expect(record.status).toBe('OPEN');
    expect(record.instructionRef).toBe(INSTRUCTION_ID); // inherited from the attempt
  });

  it('refuses a case for a non-ambiguous attempt', () => {
    const { ledger, reconciliation } = setup();
    ledger.begin({
      attemptId: asSettlementAttemptId('att-ok'),
      instructionId: INSTRUCTION_ID,
      rail: 'WISE',
      idempotencyKey: 'key-ok',
      principal,
      now: 1_000n,
    });
    expect(() =>
      reconciliation.openCase({
        caseId: 'case-x',
        subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId: asSettlementAttemptId('att-ok') },
        reason: 'EXTERNAL_AMBIGUITY',
        now: 1_300n,
      }),
    ).toThrow(ReconciliationCaseError);
  });

  it('refuses a case for an unknown attempt; ids are unique; one OPEN case per attempt', () => {
    const { ledger, reconciliation } = setup();
    expect(() =>
      reconciliation.openCase({
        caseId: 'case-x',
        subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId: asSettlementAttemptId('att-none') },
        reason: 'EXTERNAL_AMBIGUITY',
        now: 1_300n,
      }),
    ).toThrow(ReconciliationCaseError);

    const attemptId = beginUnknownAttempt(ledger);
    reconciliation.openCase({
      caseId: 'case-1',
      subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId },
      reason: 'EXTERNAL_AMBIGUITY',
      now: 1_300n,
    });
    expect(() =>
      reconciliation.openCase({
        caseId: 'case-1',
        subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId },
        reason: 'EXTERNAL_AMBIGUITY',
        now: 1_400n,
      }),
    ).toThrow(ReconciliationCaseError);
    expect(() =>
      reconciliation.openCase({
        caseId: 'case-2',
        subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId },
        reason: 'PROVIDER_OUTAGE_UNKNOWN_EFFECT',
        now: 1_400n,
      }),
    ).toThrow(ReconciliationCaseError);
  });

  it('resolution REQUIRES evidence (INV-05) and moves the attempt out of ambiguity', () => {
    const { ledger, reconciliation } = setup();
    const attemptId = beginUnknownAttempt(ledger);
    reconciliation.openCase({
      caseId: 'case-1',
      subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId },
      reason: 'EXTERNAL_AMBIGUITY',
      now: 1_300n,
    });

    expect(() =>
      reconciliation.resolveCase({
        caseId: 'case-1',
        outcome: 'CONFIRMED_SUCCEEDED',
        resolvedBy: reconciler,
        evidenceIds: [],
        now: 1_500n,
      }),
    ).toThrow(ValidationError);

    const resolution = reconciliation.resolveCase({
      caseId: 'case-1',
      outcome: 'CONFIRMED_SUCCEEDED',
      resolvedBy: reconciler,
      evidenceIds: ['ev-provider-retrieval'],
      now: 1_500n,
    });
    expect(resolution.outcome).toBe('CONFIRMED_SUCCEEDED');
    expect(resolution.evidenceIds).toEqual(['ev-provider-retrieval']);
    expect(ledger.attempt(attemptId)?.state).toBe('SUCCEEDED');
  });

  it('resolved cases are immutable — never re-opened, never re-resolved (INV-03)', () => {
    const { ledger, reconciliation } = setup();
    const attemptId = beginUnknownAttempt(ledger);
    reconciliation.openCase({
      caseId: 'case-1',
      subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId },
      reason: 'EXTERNAL_AMBIGUITY',
      now: 1_300n,
    });
    reconciliation.resolveCase({
      caseId: 'case-1',
      outcome: 'CONFIRMED_FAILED',
      resolvedBy: reconciler,
      evidenceIds: ['ev-reversal-proof'],
      now: 1_500n,
    });
    expect(() =>
      reconciliation.resolveCase({
        caseId: 'case-1',
        outcome: 'CONFIRMED_SUCCEEDED',
        resolvedBy: reconciler,
        evidenceIds: ['ev-other'],
        now: 1_600n,
      }),
    ).toThrow(ReconciliationCaseError);
    expect(reconciliation.case('case-1')?.status).toBe('RESOLVED');
  });

  it('an ambiguous attempt resolves to CONFIRMED_SUCCEEDED/CONFIRMED_FAILED only', () => {
    const { ledger, reconciliation } = setup();
    const attemptId = beginUnknownAttempt(ledger);
    reconciliation.openCase({
      caseId: 'case-1',
      subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId },
      reason: 'EXTERNAL_AMBIGUITY',
      now: 1_300n,
    });
    expect(() =>
      reconciliation.resolveCase({
        caseId: 'case-1',
        outcome: 'MATCHED',
        resolvedBy: reconciler,
        evidenceIds: ['ev'],
        now: 1_500n,
      }),
    ).toThrow(ReconciliationCaseError);
  });

  it('open cases per instruction block finality queries; case lookups work', () => {
    const { ledger, reconciliation } = setup();
    const attemptId = beginUnknownAttempt(ledger);
    const opened = reconciliation.openCase({
      caseId: 'case-1',
      subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId },
      reason: 'EXTERNAL_AMBIGUITY',
      now: 1_300n,
    });
    expect(reconciliation.openCaseForAttempt(attemptId)?.caseId).toBe('case-1');
    expect(reconciliation.casesForInstruction(INSTRUCTION_ID)).toHaveLength(1);
    expect(reconciliation.openCasesForInstruction(INSTRUCTION_ID)).toHaveLength(1);
    expect(reconciliation.allCases()).toHaveLength(1);
    reconciliation.resolveCase({
      caseId: 'case-1',
      outcome: 'CONFIRMED_SUCCEEDED',
      resolvedBy: reconciler,
      evidenceIds: ['ev'],
      now: 1_500n,
    });
    expect(opened.status).toBe('OPEN'); // returned records are snapshots (immutability)
    expect(reconciliation.openCasesForInstruction(INSTRUCTION_ID)).toHaveLength(0);
    expect(reconciliation.openCaseForAttempt(attemptId)).toBeUndefined();
  });

  it('asReconciliationCaseId validates the id shape', () => {
    expect(asReconciliationCaseId('case-1')).toBe('case-1');
    expect(() => asReconciliationCaseId('')).toThrow(ValidationError);
    expect(() => asReconciliationCaseId('x'.repeat(257))).toThrow(ValidationError);
  });
});

describe('ProviderRevisionLedger (append-only provider-state history; INV-14)', () => {
  const envelope = (revision: string, extra?: Record<string, unknown>) => ({
    provider: { name: 'wise' },
    object: { objectType: 'transfer', externalId: 'tr-1' },
    revision,
    ...(extra ?? {}),
  });

  it('appends observations in arrival order and replays identical revisions idempotently', () => {
    const revisions = new ProviderRevisionLedger();
    const first = revisions.append(envelope('r1'), 1_000n);
    revisions.append(envelope('r2'), 1_100n);
    const replay = revisions.append(envelope('r1'), 1_200n);
    expect(replay).toBe(first); // idempotent re-observation
    expect(revisions.history('wise', 'transfer', 'tr-1')).toHaveLength(2);
    expect(revisions.latest('wise', 'transfer', 'tr-1')?.revision).toBe('r2');
    expect(revisions.allEntries()).toHaveLength(2);
  });

  it('a divergent re-record of the same revision is REJECTED (canonical history is never overwritten)', () => {
    const revisions = new ProviderRevisionLedger();
    revisions.append(envelope('r1', { state: 'processing' }), 1_000n);
    expect(() => revisions.append(envelope('r1', { state: 'SOMETHING_ELSE' }), 1_100n)).toThrow(
      ProviderRevisionConflictError,
    );
  });

  it('validates the structural envelope identity', () => {
    const revisions = new ProviderRevisionLedger();
    expect(() => revisions.append({ provider: { name: '' }, object: { objectType: 't', externalId: 'e' }, revision: 'r' }, 1n)).toThrow(
      ValidationError,
    );
    expect(() =>
      revisions.append({ provider: { name: 'p' }, object: { objectType: 't', externalId: 'e' }, revision: '' }, 1n),
    ).toThrow(ValidationError);
    expect(() => revisions.append(envelope('r'), 1 as unknown as bigint)).toThrow(ValidationError);
  });
});
