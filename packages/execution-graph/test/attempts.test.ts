import { describe, expect, it } from 'vitest';
import {
  ExecutionAttemptLedger,
  asExecutionAttemptId,
  attemptResultHash,
  attemptStateMachine,
  cancellationAllowed,
  eventRequiresProviderEvidence,
  TerminalStateViolationError,
  AttemptIdempotencyConflictError,
  AttemptRetryForbiddenError,
  EvidenceImmutabilityError,
  pinObservation,
} from '../src/index.ts';
import type { ProviderExecutionEvidenceDraft } from '../src/index.ts';
import type { ExecutionEvidenceId } from '../src/index.ts';
import { makeCompensationPolicy, makeEnvelope, makeObservation, NOW, PIN_V1, PRINCIPAL } from './fixtures.ts';

/**
 * ExecutionAttempt (P3-W2; ADAPT of payswap.org@8a735bf
 * packages/execution/test/attempts.test.ts, W3-003 — 9 tests ported).
 * 3.0 adaptations: evidence kinds follow the protocol taxonomy (EXECUTION
 * -> PAYOUT, WEBHOOK_EVENT/STATE_OBSERVATION -> OBSERVATION); every attempt
 * pins its observation version (LAW 1); the kernel is the local mirror.
 */
function evidence(
  id: string,
  overrides?: Partial<ProviderExecutionEvidenceDraft>,
): ProviderExecutionEvidenceDraft {
  return {
    evidenceId: id as ExecutionEvidenceId,
    kind: 'PAYOUT',
    evidenceRef: `provider-op:${id}`,
    providerState: makeEnvelope(),
    recordedAt: NOW,
    ...overrides,
  };
}

function begin(ledger: ExecutionAttemptLedger, key = 'idem-1', attemptId = 'att_1') {
  return ledger.begin({
    attemptId,
    planId: 'plan_1',
    stepId: 'step_1',
    executionMode: 'COMPOSED_PAYSWAP',
    capabilityInstanceId: 'inst-mm-1',
    capabilityId: 'cap.mobile_money.collect',
    retryPolicy: 'SAFE_TO_RETRY',
    cancellation: 'UNTIL_SETTLEMENT',
    compensation: makeCompensationPolicy(),
    idempotencyKey: key,
    principal: PRINCIPAL,
    pinnedObservation: PIN_V1,
    now: NOW,
  }).attempt;
}

describe('ExecutionAttempt (P3-W2)', () => {
  it('INV-06: one idempotency key maps to one authoritative attempt', () => {
    const ledger = new ExecutionAttemptLedger();
    const first = begin(ledger);
    const replay = ledger.begin({
      attemptId: 'att_duplicate',
      planId: 'plan_1',
      stepId: 'step_1',
      executionMode: 'COMPOSED_PAYSWAP',
      capabilityInstanceId: 'inst-mm-1',
      capabilityId: 'cap.mobile_money.collect',
      retryPolicy: 'SAFE_TO_RETRY',
      cancellation: 'UNTIL_SETTLEMENT',
      compensation: makeCompensationPolicy(),
      idempotencyKey: 'idem-1',
      principal: PRINCIPAL,
      pinnedObservation: PIN_V1,
      now: NOW + 1n,
    });
    expect(replay.kind).toBe('REPLAY');
    if (replay.kind === 'REPLAY') {
      expect(replay.attempt.attemptId).toBe(first.attemptId);
    }

    // Same key, DIFFERENT command (different step) -> conflict, never re-execution.
    expect(() =>
      ledger.begin({
        attemptId: 'att_conflict',
        planId: 'plan_1',
        stepId: 'step_OTHER',
        executionMode: 'COMPOSED_PAYSWAP',
        capabilityInstanceId: 'inst-mm-1',
        capabilityId: 'cap.mobile_money.collect',
        retryPolicy: 'SAFE_TO_RETRY',
        cancellation: 'UNTIL_SETTLEMENT',
        compensation: makeCompensationPolicy(),
        idempotencyKey: 'idem-1',
        principal: PRINCIPAL,
        pinnedObservation: PIN_V1,
        now: NOW + 2n,
      }),
    ).toThrow(AttemptIdempotencyConflictError);
  });

  it('INV-05: every external effect carries execution evidence linked to the attempt', () => {
    const ledger = new ExecutionAttemptLedger();
    const attempt = begin(ledger);
    ledger.advance(attempt.attemptId, 'START', { now: NOW + 1n });

    // CONFIRM_SUCCEEDED is an external effect: without evidence it is rejected.
    expect(() =>
      ledger.advance(attempt.attemptId, 'CONFIRM_SUCCEEDED', { now: NOW + 2n }),
    ).toThrow(/INV-05/);

    const done = ledger.advance(attempt.attemptId, 'CONFIRM_SUCCEEDED', {
      now: NOW + 2n,
      evidence: [evidence('ev_1')],
    });
    expect(done.state).toBe('SUCCEEDED');
    const recorded = ledger.evidenceFor(attempt.attemptId);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.attemptId).toBe(asExecutionAttemptId(attempt.attemptId));
    expect(recorded[0]!.providerState).toBeDefined();
    // START is not an external effect: no evidence required.
    expect(eventRequiresProviderEvidence('PENDING', 'START')).toBe(false);
    expect(eventRequiresProviderEvidence('IN_FLIGHT', 'CONFIRM_SUCCEEDED')).toBe(true);
  });

  it('INV-03: recorded evidence is immutable', () => {
    const ledger = new ExecutionAttemptLedger();
    const attempt = begin(ledger);
    ledger.advance(attempt.attemptId, 'START', { now: NOW + 1n });
    ledger.attachEvidence(attempt.attemptId, [evidence('ev_1')]);
    // Re-recording the identical evidence is an idempotent no-op.
    const unchanged = ledger.attachEvidence(attempt.attemptId, [evidence('ev_1')]);
    expect(unchanged.evidence).toHaveLength(1);
    // A DIFFERENT content under the same evidence id is a violation.
    expect(() =>
      ledger.attachEvidence(attempt.attemptId, [
        evidence('ev_1', { evidenceRef: 'provider-op:FORGED' }),
      ]),
    ).toThrow(EvidenceImmutabilityError);
  });

  it('INV-03: terminal transitions are monotonic except the explicit RECOVER recovery', () => {
    const ledger = new ExecutionAttemptLedger();
    const attempt = begin(ledger);
    ledger.advance(attempt.attemptId, 'START', { now: NOW + 1n });
    const done = ledger.advance(attempt.attemptId, 'CONFIRM_SUCCEEDED', {
      now: NOW + 2n,
      evidence: [evidence('ev_ok')],
    });
    expect(done.state).toBe('SUCCEEDED');
    // Any further event on a terminal state is rejected by the kernel machine.
    expect(() => ledger.advance(attempt.attemptId, 'START', { now: NOW + 3n })).toThrow(
      TerminalStateViolationError,
    );

    // FAILED --RECOVER--> RECOVERED is the ONLY explicit recovery path.
    const failing = begin(ledger, 'idem-recover', 'att_recover');
    ledger.advance(failing.attemptId, 'START', { now: NOW + 1n });
    const failed = ledger.advance(failing.attemptId, 'CONFIRM_FAILED', {
      now: NOW + 2n,
      evidence: [evidence('ev_fail')],
    });
    expect(failed.state).toBe('FAILED');
    const recovered = ledger.advance(failing.attemptId, 'RECOVER', {
      now: NOW + 3n,
      evidence: [evidence('ev_recover')],
    });
    expect(recovered.state).toBe('RECOVERED');
    expect(recovered.history[recovered.history.length - 1]!.viaRecovery).toBe(true);
    // SUCCEEDED has no recovery rule at all.
    expect(() => attemptStateMachine.transition('SUCCEEDED', 'RECOVER')).toThrow();
  });

  it('INV-06: retry-safe attempts — a definitive FAILED + SAFE_TO_RETRY re-arms under the same key', () => {
    const ledger = new ExecutionAttemptLedger();
    const attempt = begin(ledger, 'idem-retry', 'att_retry');
    ledger.advance(attempt.attemptId, 'START', { now: NOW + 1n });
    const failed = ledger.advance(attempt.attemptId, 'CONFIRM_FAILED', {
      now: NOW + 2n,
      evidence: [evidence('ev_f')],
    });
    expect(failed.state).toBe('FAILED');
    const retried = ledger.requestRetry(attempt.attemptId, 'att_retry_2', NOW + 3n);
    expect(retried.state).toBe('PENDING');
    expect(retried.idempotencyKey).toBe('idem-retry');
    expect(retried.attemptId).toBe('att_retry_2');
    // Result hashes are deterministic for replay equality.
    expect(attemptResultHash(failed)).toBe(attemptResultHash(ledger.attempt('att_retry')!));
  });

  it('INV-04: UNKNOWN external writes are never blindly retried', () => {
    const ledger = new ExecutionAttemptLedger();
    const attempt = begin(ledger, 'idem-unknown', 'att_unknown');
    ledger.advance(attempt.attemptId, 'START', { now: NOW + 1n });
    const unknown = ledger.advance(attempt.attemptId, 'EXTERNAL_OUTCOME_UNKNOWN', {
      now: NOW + 2n,
      evidence: [
        evidence('ev_amb', {
          kind: 'OBSERVATION',
          providerState: makeEnvelope({
            failure: { retryable: false, ambiguity: 'OUTCOME_UNKNOWN', providerErrorCode: 'timeout' },
          }),
        }),
      ],
    });
    expect(unknown.state).toBe('OUTCOME_UNKNOWN');
    expect(() => ledger.requestRetry(attempt.attemptId, 'att_retry_blind', NOW + 3n)).toThrow(
      AttemptRetryForbiddenError,
    );
    // And the ordinary events cannot leave OUTCOME_UNKNOWN either.
    expect(() =>
      ledger.advance(attempt.attemptId, 'CONFIRM_FAILED', {
        now: NOW + 3n,
        evidence: [evidence('ev_x')],
      }),
    ).toThrow(/INV-04/);
  });

  it('cancellation policy is honored deterministically', () => {
    expect(cancellationAllowed('NOT_SUPPORTED', 'PENDING')).toBe(false);
    expect(cancellationAllowed('BEFORE_EXECUTION', 'PENDING')).toBe(true);
    expect(cancellationAllowed('BEFORE_EXECUTION', 'IN_FLIGHT')).toBe(false);
    expect(cancellationAllowed('UNTIL_SETTLEMENT', 'IN_FLIGHT')).toBe(true);
    expect(cancellationAllowed('UNTIL_SETTLEMENT', 'SUCCEEDED')).toBe(false);
    expect(cancellationAllowed('UNTIL_SETTLEMENT', 'OUTCOME_UNKNOWN')).toBe(false);
  });

  it('preserves customer-action-required states as actionable, with lossless provider state', () => {
    const ledger = new ExecutionAttemptLedger();
    const attempt = begin(ledger, 'idem-action', 'att_action');
    ledger.advance(attempt.attemptId, 'START', { now: NOW + 1n });
    const envelope = makeEnvelope({
      family: 'customer_action_required',
      lifecycleStep: '3ds_challenge',
      requiresCustomerAction: true,
      actionRequired: {
        kind: 'three_d_secure',
        message: 'complete the challenge',
        deepLink: 'psp://3ds',
      },
    });
    const waiting = ledger.advance(attempt.attemptId, 'PROVIDER_ACTION_REQUIRED', {
      now: NOW + 2n,
      evidence: [evidence('ev_action', { kind: 'OBSERVATION', providerState: envelope })],
    });
    expect(waiting.state).toBe('AWAITING_CUSTOMER_ACTION');
    expect(waiting.providerState).toBe(envelope);
    // The customer action completes and execution continues.
    const resumed = ledger.advance(waiting.attemptId, 'CUSTOMER_ACTION_COMPLETED', {
      now: NOW + 3n,
      evidence: [evidence('ev_completed', { kind: 'OBSERVATION' })],
    });
    expect(resumed.state).toBe('IN_FLIGHT');
  });

  it('models partial execution and compensation semantics, with the observation pin frozen (LAW 1)', () => {
    const ledger = new ExecutionAttemptLedger();
    const attempt = begin(ledger, 'idem-partial', 'att_partial');
    ledger.advance(attempt.attemptId, 'START', { now: NOW + 1n });
    const partial = ledger.advance(attempt.attemptId, 'PARTIAL_EFFECT', {
      now: NOW + 2n,
      evidence: [evidence('ev_partial')],
    });
    expect(partial.state).toBe('PARTIALLY_EXECUTED');
    const compensated = ledger.advance(attempt.attemptId, 'COMPENSATE', {
      now: NOW + 3n,
      evidence: [evidence('ev_compensate')],
    });
    expect(compensated.state).toBe('COMPENSATED');
    expect(compensated.semantics.cancellation).toBe('UNTIL_SETTLEMENT');

    // LAW 1: the pinned observation version never moves, even as newer
    // observations arrive at the ledger's edges (the pin is decided at BEGIN).
    const newer = pinObservation(makeObservation({ observationVersion: 7 }));
    expect(partial.pinnedObservation.observationVersion).toBe(1);
    expect(partial.pinnedObservation.observationDigest).toBe(PIN_V1.observationDigest);
    expect(newer.observationVersion).toBe(7); // newer exists — the pin still says 1
  });
});
