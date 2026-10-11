import { describe, expect, it } from 'vitest';
import {
  SettlementAttemptConflictError,
  SettlementAttemptLedger,
  SettlementEvidenceRequiredError,
  SettlementRetryForbiddenError,
  TerminalStateViolationError,
  ValidationError,
  asSettlementAttemptId,
  isFailureOutcome,
  ExternalAmbiguityError,
} from '../src/index.ts';

const principal = { principalType: 'svc', principalId: 'settlement-runner' };

function ledger(): SettlementAttemptLedger {
  return new SettlementAttemptLedger();
}

function beginAttempt(l: SettlementAttemptLedger, attemptId = 'att-1', key = 'idem-1') {
  return l.begin({
    attemptId,
    instructionId: 'SI:ns-1:alice>bob:USD',
    rail: 'WISE',
    idempotencyKey: key,
    principal,
    now: 1_000n,
  });
}

describe('settlement attempt ledger: INV-06 idempotent begin', () => {
  it('begins a fresh attempt in PENDING', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    expect(outcome.kind).toBe('BEGIN');
    if (outcome.kind === 'BEGIN') {
      expect(outcome.attempt.state).toBe('PENDING');
      expect(outcome.attempt.rail).toBe('WISE');
      expect(outcome.attempt.history).toEqual([]);
    }
  });

  it('REPLAYs an in-flight duplicate under the same key (never a second execution)', () => {
    const l = ledger();
    beginAttempt(l);
    const outcome = beginAttempt(l, 'att-1-dup');
    expect(outcome.kind).toBe('REPLAY');
    if (outcome.kind === 'REPLAY') {
      expect(outcome.attempt.attemptId).toBe('att-1');
    }
  });

  it('CONFLICTs (throws) on the same key bound to a different command', () => {
    const l = ledger();
    beginAttempt(l, 'att-1', 'idem-1');
    expect(() =>
      l.begin({
        attemptId: 'att-2',
        instructionId: 'SI:ns-1:alice>bob:USD',
        rail: 'STRIPE', // different rail -> different command hash
        idempotencyKey: 'idem-1',
        principal,
        now: 1_000n,
      }),
    ).toThrow(SettlementAttemptConflictError);
  });

  it('attempt ids are never reused', () => {
    const l = ledger();
    beginAttempt(l, 'att-1');
    expect(() =>
      l.begin({
        attemptId: 'att-1',
        instructionId: 'SI:ns-1:alice>bob:USD',
        rail: 'WISE',
        idempotencyKey: 'idem-2',
        principal,
        now: 1_000n,
      }),
    ).toThrow(ValidationError);
  });
});

describe('settlement attempt lifecycle: external outcomes require evidence (INV-05)', () => {
  it('START is the only pure local transition (no evidence required)', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    const started = l.start(outcome.attempt.attemptId, 1_100n);
    expect(started.state).toBe('IN_FLIGHT');
  });

  it('recording an external outcome without evidence throws', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    expect(() => l.recordExternalOutcome(outcome.attempt.attemptId, 'SUCCEEDED', [], 1_200n)).toThrow(
      SettlementEvidenceRequiredError,
    );
  });

  it('CONFIRM_SUCCEEDED / CONFIRM_FAILED terminalize with evidence; history is append-only', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    const done = l.recordExternalOutcome(outcome.attempt.attemptId, 'SUCCEEDED', ['ev-1'], 1_200n);
    expect(done.state).toBe('SUCCEEDED');
    expect(done.evidenceIds).toEqual(['ev-1']);
    expect(done.history).toHaveLength(2); // START + CONFIRM_SUCCEEDED
    // terminal: no further transition
    expect(() => l.recordExternalOutcome(done.attemptId, 'FAILED', ['ev-2'], 1_300n)).toThrow(
      TerminalStateViolationError,
    );
  });
});

describe('UNKNOWN is not FAILED (INV-04): the ambiguity discipline', () => {
  it('OUTCOME_UNKNOWN is a first-class non-terminal state', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    const unknown = l.recordExternalOutcome(outcome.attempt.attemptId, 'OUTCOME_UNKNOWN', ['ev-timeout'], 1_200n);
    expect(unknown.state).toBe('OUTCOME_UNKNOWN');
    expect(l.hasOpenAmbiguity('SI:ns-1:alice>bob:USD')).toBe(true);
  });

  it('a direct definitive outcome write from OUTCOME_UNKNOWN is structurally refused', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    const unknown = l.recordExternalOutcome(outcome.attempt.attemptId, 'OUTCOME_UNKNOWN', ['ev-timeout'], 1_200n);
    expect(() => l.recordExternalOutcome(unknown.attemptId, 'SUCCEEDED', ['ev-late'], 1_300n)).toThrow(
      ValidationError,
    );
    expect(() => l.recordExternalOutcome(unknown.attemptId, 'FAILED', ['ev-late'], 1_300n)).toThrow(
      ValidationError,
    );
  });

  it('requestRetry FAILS CLOSED on OUTCOME_UNKNOWN (no blind retry after ambiguity)', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    const unknown = l.recordExternalOutcome(outcome.attempt.attemptId, 'OUTCOME_UNKNOWN', ['ev-timeout'], 1_200n);
    expect(() => l.requestRetry(unknown.attemptId, 'att-retry', 1_300n)).toThrow(SettlementRetryForbiddenError);
  });

  it('resolveUnknown is the ONLY exit from ambiguity, and it requires evidence', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    const unknown = l.recordExternalOutcome(outcome.attempt.attemptId, 'OUTCOME_UNKNOWN', ['ev-timeout'], 1_200n);
    expect(() =>
      l.resolveUnknown(
        unknown.attemptId,
        { resolvedOutcome: 'CONFIRMED_SUCCEEDED', resolvedBy: principal, caseId: 'case-1', evidenceIds: [] },
        1_400n,
      ),
    ).toThrow(SettlementEvidenceRequiredError);
    const resolved = l.resolveUnknown(
      unknown.attemptId,
      {
        resolvedOutcome: 'CONFIRMED_SUCCEEDED',
        resolvedBy: principal,
        caseId: 'case-1',
        evidenceIds: ['ev-provider-retrieval'],
      },
      1_400n,
    );
    expect(resolved.state).toBe('SUCCEEDED');
    expect(resolved.resolution?.caseId).toBe('case-1');
    expect(resolved.history.at(-1)?.resolutionCaseId).toBe('case-1');
    expect(l.hasOpenAmbiguity('SI:ns-1:alice>bob:USD')).toBe(false);
  });

  it('resolveUnknown refuses non-ambiguous attempts', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    expect(() =>
      l.resolveUnknown(
        outcome.attempt.attemptId,
        { resolvedOutcome: 'CONFIRMED_FAILED', resolvedBy: principal, caseId: 'case-x', evidenceIds: ['ev'] },
        1_400n,
      ),
    ).toThrow(ValidationError);
  });

  it('retry is admissible ONLY for definitively FAILED attempts (new record, old stays FAILED)', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    const failed = l.recordExternalOutcome(outcome.attempt.attemptId, 'FAILED', ['ev-fail'], 1_200n);
    // retry of FAILED re-arms the scope and mints a NEW record
    const retry = l.requestRetry(failed.attemptId, 'att-retry-1', 1_300n);
    expect(retry.attemptId).toBe('att-retry-1');
    expect(retry.state).toBe('PENDING');
    // a further begin under the same key REPLAYs the retry attempt (one authoritative attempt per scope)
    const again = l.begin({
      attemptId: 'att-retry-2',
      instructionId: 'SI:ns-1:alice>bob:USD',
      rail: 'WISE',
      idempotencyKey: failed.idempotencyKey,
      principal,
      now: 1_500n,
    });
    expect(again.kind).toBe('REPLAY');
    if (again.kind === 'REPLAY') {
      expect(again.attempt.attemptId).toBe('att-retry-1');
    }
    expect(l.attempt('att-1')?.state).toBe('FAILED'); // history preserved, never rewritten
    expect(l.attemptsForInstruction('SI:ns-1:alice>bob:USD')).toHaveLength(2);
  });

  it('attachEvidence is append-only and idempotent', () => {
    const l = ledger();
    const outcome = beginAttempt(l);
    if (outcome.kind !== 'BEGIN') throw new Error('unreachable');
    l.start(outcome.attempt.attemptId, 1_100n);
    const done = l.recordExternalOutcome(outcome.attempt.attemptId, 'OUTCOME_UNKNOWN', ['ev-1'], 1_200n);
    const withMore = l.attachEvidence(done.attemptId, ['ev-2', 'ev-1'], 1_300n);
    expect(withMore.evidenceIds).toEqual(['ev-1', 'ev-2']); // no duplicate
    const again = l.attachEvidence(done.attemptId, ['ev-1'], 1_400n);
    expect(again.evidenceIds).toEqual(['ev-1', 'ev-2']);
    expect(again.updatedAt).toBe(1_300n); // no-op attach returns the current record
  });

  it('the classifier keeps ExternalAmbiguityError non-failing; refusals are failures (INV-04)', () => {
    // Only an explicit ExternalAmbiguityError is "outcome not yet determined".
    expect(isFailureOutcome(new ExternalAmbiguityError('x'))).toBe(false);
    // A retry REFUSAL is a definitive command failure (the command did not run).
    expect(isFailureOutcome(new SettlementRetryForbiddenError('x'))).toBe(true);
    expect(isFailureOutcome(new ValidationError('x'))).toBe(true);
  });

  it('asSettlementAttemptId validates the id shape', () => {
    expect(asSettlementAttemptId('att-1')).toBe('att-1');
    expect(() => asSettlementAttemptId('')).toThrow(ValidationError);
    expect(() => asSettlementAttemptId(' att')).toThrow(ValidationError);
    expect(() => asSettlementAttemptId('x'.repeat(257))).toThrow(ValidationError);
  });
});
