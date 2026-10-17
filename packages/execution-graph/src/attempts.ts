/**
 * @payswap/execution-graph — ExecutionAttempt construction and deterministic
 * helpers (P3-W2; ADAPT of payswap.org@8a735bf packages/execution/src/
 * attempts.ts, first half — the ledger itself is in attempt-ledger.ts).
 *
 * The attempt lifecycle is the pinned ATTEMPT_TRANSITIONS table driven
 * through the local deterministic kernel (terminality: INV-03; UNKNOWN is
 * first-class and only reconciliation exits it: INV-04).
 */

import { EvidenceImmutabilityError, ValidationError } from './errors.ts';
import { canonicalDigest } from './canonical.ts';
import { defineStateMachine } from './kernel.ts';
import type { StateMachine } from './kernel.ts';
import { isExecutionMode } from './execution-modes.ts';
import { validateObservationPin } from './observation-versions.ts';
import { requirePrincipalRef } from './identifiers.ts';
import type { ExecutionEvidenceId, PrincipalRef } from './identifiers.ts';
import type {
  AttemptTransitionRecord,
  AttemptSemantics,
  CancellationPolicy,
  ExecutionAttempt,
  ExecutionAttemptEvent,
  ExecutionAttemptState,
  ExecutionEvidenceKind,
  ProviderExecutionEvidence,
  ProviderExecutionEvidenceDraft,
} from './attempt-contract.ts';
import { ATTEMPT_RECOVERY, ATTEMPT_TERMINAL_STATES, ATTEMPT_TRANSITIONS, EXECUTION_EVIDENCE_KINDS } from './attempt-contract.ts';
import type { ProviderStateEnvelope } from '@payswap/capability';
import type { TimestampMs } from '@payswap/protocol';

/**
 * The canonical attempt lifecycle (INV-03/INV-04): terminal states are
 * monotonic with the explicit RECOVER recovery as the ONLY exit;
 * OUTCOME_UNKNOWN is deliberately NON-terminal and reachable ONLY through
 * reconciliation resolutions.
 */
export const attemptStateMachine: StateMachine<ExecutionAttemptState, ExecutionAttemptEvent> =
  defineStateMachine<ExecutionAttemptState, ExecutionAttemptEvent>({
    name: 'execution-attempt',
    initial: 'PENDING',
    states: [
      'PENDING',
      'IN_FLIGHT',
      'AWAITING_CUSTOMER_ACTION',
      'PARTIALLY_EXECUTED',
      'OUTCOME_UNKNOWN',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'COMPENSATED',
      'RECOVERED',
    ],
    events: [
      'START',
      'PROVIDER_ACTION_REQUIRED',
      'CUSTOMER_ACTION_COMPLETED',
      'PARTIAL_EFFECT',
      'COMPLETE',
      'CONFIRM_SUCCEEDED',
      'CONFIRM_FAILED',
      'EXTERNAL_OUTCOME_UNKNOWN',
      'CANCEL',
      'COMPENSATE',
      'RECONCILE_RESOLVED_SUCCEEDED',
      'RECONCILE_RESOLVED_FAILED',
      'RECOVER',
    ],
    transitions: [...ATTEMPT_TRANSITIONS],
    terminalStates: [...ATTEMPT_TERMINAL_STATES],
    recovery: [...ATTEMPT_RECOVERY],
  });

/** Total predicate over the cancellation vocabulary. */
export function isCancellationPolicy(value: unknown): value is CancellationPolicy {
  return (
    value === 'NOT_SUPPORTED' ||
    value === 'BEFORE_EXECUTION' ||
    value === 'UNTIL_SETTLEMENT' ||
    value === 'PROVIDER_DEFINED'
  );
}

/** Total predicate over the evidence-kind taxonomy (protocol pin). */
export function isExecutionEvidenceKind(value: unknown): value is ExecutionEvidenceKind {
  return (
    typeof value === 'string' &&
    (EXECUTION_EVIDENCE_KINDS as readonly unknown[]).includes(value)
  );
}

/** Deterministic cancellation admissibility from the declared policy + state. */
export function cancellationAllowed(
  policy: CancellationPolicy,
  state: ExecutionAttemptState,
): boolean {
  switch (policy) {
    case 'NOT_SUPPORTED':
      return false;
    case 'BEFORE_EXECUTION':
      return state === 'PENDING';
    case 'UNTIL_SETTLEMENT':
      return !attemptStateMachine.isTerminal(state) && state !== 'OUTCOME_UNKNOWN';
    case 'PROVIDER_DEFINED':
      return !attemptStateMachine.isTerminal(state) && state !== 'OUTCOME_UNKNOWN';
  }
}

/**
 * Deterministic evidence gating (INV-05): an event represents an external
 * effect — and therefore REQUIRES linked provider evidence — unless it is a
 * pure local transition (START, or a cancellation before anything was sent).
 */
export function eventRequiresProviderEvidence(
  from: ExecutionAttemptState,
  event: ExecutionAttemptEvent,
): boolean {
  if (event === 'START') {
    return false;
  }
  if (event === 'CANCEL' && from === 'PENDING') {
    return false;
  }
  return true;
}

/** Structural check that a value is envelope-shaped (INV-14 lossless carrier). */
function isProviderStateEnvelopeShaped(value: unknown): value is ProviderStateEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<ProviderStateEnvelope>).revision === 'string' &&
    (value as Partial<ProviderStateEnvelope>).classification !== undefined
  );
}

/** Fail-closed validation of an evidence draft (the ledger stamps the link). */
export function validateEvidenceDraft(draft: ProviderExecutionEvidenceDraft): void {
  if (draft === null || typeof draft !== 'object') {
    throw new ValidationError('evidence draft must be an object');
  }
  if (typeof draft.evidenceId !== 'string' || draft.evidenceId.length === 0) {
    throw new ValidationError('evidence draft must carry a non-empty evidenceId');
  }
  if (!isExecutionEvidenceKind(draft.kind)) {
    throw new ValidationError(
      `evidence draft kind '${String(draft.kind)}' is not a canonical evidence kind (protocol taxonomy)`,
    );
  }
  if (typeof draft.evidenceRef !== 'string' || draft.evidenceRef.length === 0) {
    throw new ValidationError('evidence draft must carry a non-empty evidenceRef');
  }
  if (typeof draft.recordedAt !== 'bigint') {
    throw new ValidationError('evidence draft recordedAt must be a bigint TimestampMs');
  }
  if (draft.providerState !== undefined && !isProviderStateEnvelopeShaped(draft.providerState)) {
    throw new ValidationError(
      'evidence draft providerState, when present, must be a ProviderStateEnvelope (INV-14)',
    );
  }
}

/** Validate the attempt semantics mirrored from the capability declarations. */
export function validateAttemptSemantics(semantics: AttemptSemantics): AttemptSemantics {
  if (semantics === null || typeof semantics !== 'object') {
    throw new ValidationError('attempt semantics must be an AttemptSemantics object');
  }
  if (!isCancellationPolicy(semantics.cancellation)) {
    throw new ValidationError('attempt semantics must declare a cancellation policy');
  }
  if (semantics.compensation === null || typeof semantics.compensation !== 'object') {
    throw new ValidationError(
      'attempt semantics must mirror the capability compensation policy',
    );
  }
  return Object.freeze({
    cancellation: semantics.cancellation,
    compensation: Object.freeze({ ...semantics.compensation }),
  });
}

/**
 * Deterministic command hash binding an attempt to its execution identity
 * (binding, not security). Includes the LAW 1 observation pin: two attempts
 * decided on different observation versions are DIFFERENT commands.
 */
export function attemptCommandHash(input: {
  readonly planId: string;
  readonly stepId: string;
  readonly capabilityInstanceId: string;
  readonly executionMode: string;
  readonly principal: PrincipalRef;
  readonly pinnedObservation: { readonly instanceId: string; readonly observationVersion: number };
}): string {
  return canonicalDigest({
    binding: 'execution-attempt',
    planId: input.planId,
    stepId: input.stepId,
    capabilityInstanceId: input.capabilityInstanceId,
    executionMode: input.executionMode,
    principal: [input.principal.principalType, input.principal.principalId],
    pinnedObservation: [input.pinnedObservation.instanceId, input.pinnedObservation.observationVersion],
  });
}

/** Deterministic result hash for a completed attempt (replay equality). */
export function attemptResultHash(attempt: ExecutionAttempt): string {
  return canonicalDigest({
    binding: 'execution-attempt-result',
    attemptId: attempt.attemptId,
    state: attempt.state,
    pinnedObservation: [
      attempt.pinnedObservation.instanceId,
      attempt.pinnedObservation.observationVersion,
    ],
  });
}

/** Stamp evidence drafts onto an attempt (the ledger's internal step). */
export function stampEvidence(
  attempt: ExecutionAttempt,
  drafts: readonly ProviderExecutionEvidenceDraft[],
  evidenceById: Map<string, ProviderExecutionEvidence>,
): ProviderExecutionEvidence[] {
  const stamped: ProviderExecutionEvidence[] = [];
  for (const draft of drafts) {
    validateEvidenceDraft(draft);
    const existing = evidenceById.get(draft.evidenceId);
    if (existing !== undefined) {
      if (existing.evidenceRef !== draft.evidenceRef || existing.attemptId !== attempt.attemptId) {
        throw new EvidenceImmutabilityError(
          `evidence '${draft.evidenceId}' is already recorded and immutable`,
          { evidenceId: draft.evidenceId, recordedFor: existing.attemptId },
        );
      }
      continue; // idempotent re-record of identical evidence
    }
    const evidence: ProviderExecutionEvidence = Object.freeze({
      evidenceId: draft.evidenceId as ExecutionEvidenceId,
      kind: draft.kind,
      evidenceRef: draft.evidenceRef,
      ...(draft.providerState !== undefined ? { providerState: draft.providerState } : {}),
      recordedAt: draft.recordedAt,
      attemptId: attempt.attemptId,
    });
    evidenceById.set(evidence.evidenceId, evidence);
    stamped.push(evidence);
  }
  return stamped;
}

/** Validate the begin-input fields the ledger shares with helpers here. */
export function validateBeginFields(input: {
  readonly planId: string;
  readonly stepId: string;
  readonly capabilityInstanceId: string;
  readonly capabilityId: string;
  readonly executionMode: string;
  readonly retryPolicy: string;
  readonly idempotencyKey: string;
  readonly principal: PrincipalRef;
  readonly pinnedObservation: Parameters<typeof validateObservationPin>[0];
  readonly now: TimestampMs;
}): void {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('attempt begin input must be an object');
  }
  if (!isExecutionMode(input.executionMode)) {
    throw new ValidationError(
      'executionMode is REQUIRED and explicit on every attempt (execution-mode vocabulary)',
    );
  }
  for (const field of ['planId', 'stepId', 'capabilityInstanceId', 'capabilityId'] as const) {
    if (typeof input[field] !== 'string' || input[field].length === 0) {
      throw new ValidationError(`${field} must be a non-empty string`);
    }
  }
  if (input.retryPolicy !== 'SAFE_TO_RETRY' && input.retryPolicy !== 'REQUIRES_RECONCILIATION') {
    throw new ValidationError(
      'retryPolicy must mirror the capability idempotency behavior (SAFE_TO_RETRY | REQUIRES_RECONCILIATION)',
    );
  }
  if (
    input.idempotencyKey === null ||
    typeof input.idempotencyKey !== 'string' ||
    input.idempotencyKey.length === 0
  ) {
    throw new ValidationError('idempotencyKey is required (INV-06)');
  }
  if (typeof input.now !== 'bigint') {
    throw new ValidationError('now must be a bigint TimestampMs');
  }
  requirePrincipalRef(input.principal, 'attempt principal');
  // LAW 1: the attempt is decided on an EXACT observation version, pinned.
  validateObservationPin(input.pinnedObservation);
  if (input.pinnedObservation.instanceId !== input.capabilityInstanceId) {
    throw new ValidationError(
      'the pinned observation must belong to the attempt\'s capability instance (LAW 1: the exact version it was decided on)',
    );
  }
}

/** Build a frozen transition record (append-only history entry). */
export function buildTransitionRecord(
  from: ExecutionAttemptState,
  on: ExecutionAttemptEvent,
  to: ExecutionAttemptState,
  viaRecovery: boolean,
  now: TimestampMs,
  evidenceIds: readonly string[],
): AttemptTransitionRecord {
  return Object.freeze({
    from,
    on,
    to,
    viaRecovery,
    recordedAt: now,
    evidenceIds: Object.freeze([...evidenceIds]),
  });
}
