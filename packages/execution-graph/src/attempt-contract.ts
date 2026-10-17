/**
 * @payswap/execution-graph — ExecutionAttempt contracts (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/execution/src/attempts.ts, W3-003).
 *
 * An ExecutionAttempt is the immutable record of one step of an ExecutionPlan
 * being executed against a ConnectedCapabilityInstance. It carries strategy,
 * capability, provider, idempotency, state, external references and
 * proof/evidence — plus (3.0 LAW 1) the PINNED OBSERVATION VERSION the
 * attempt was decided on, preserved losslessly.
 *
 * Law mapping (old -> canonical): INV-F05 -> INV-06 (idempotent,
 * replay-safe); INV-O01 -> INV-06 (retry re-arms definitive failures);
 * INV-X01/X02 -> INV-04 (UNKNOWN distinct from FAILED, reconciled rather
 * than blindly retried); INV-X03 -> INV-04 (reconciliation is the only exit
 * from UNKNOWN); INV-X04 -> INV-03 (terminality + explicit recovery);
 * INV-E02/E05 -> INV-05/INV-03 (evidence lineage, immutable);
 * INV-C06 -> INV-14 (lossless provider state).
 *
 * Evidence kinds follow the 3.0 protocol taxonomy (DISTINCT kinds; the old
 * EXECUTION kind maps to the FUNDING/CONVERSION/PAYOUT legs, OUTCOME maps
 * to OBSERVATION — see @payswap/protocol settlement/evidence.ts): pinned
 * type-only from the protocol lane.
 */

import type { ProviderStateEnvelope, ExecutionMode, CompensationPolicy } from '@payswap/capability';
import type { EvidenceNodeKind, PrincipalRef, TimestampMs } from '@payswap/protocol';
import type { ObservationVersionPin } from './observation-version-contract.ts';
import type { ExecutionAttemptId, ExecutionEvidenceId } from './identifiers.ts';

/** The distinct evidence kinds an attempt may record (protocol taxonomy pin). */
export type ExecutionEvidenceKind = EvidenceNodeKind;

/**
 * The local pinned vocabulary of protocol evidence kinds — identical to the
 * protocol lane's taxonomy; the const pins the runtime list without a
 * runtime import (type-only sibling law).
 */
export const EXECUTION_EVIDENCE_KINDS: readonly ExecutionEvidenceKind[] = [
  'AUTHORIZATION',
  'FUNDING',
  'CONVERSION',
  'PAYOUT',
  'OBSERVATION',
  'FINALITY',
  'RECONCILIATION',
];

/** The attempt lifecycle states. */
export type ExecutionAttemptState =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'AWAITING_CUSTOMER_ACTION'
  | 'PARTIALLY_EXECUTED'
  | 'OUTCOME_UNKNOWN'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'COMPENSATED'
  | 'RECOVERED';

/** The events the attempt lifecycle declares. */
export type ExecutionAttemptEvent =
  | 'START'
  | 'PROVIDER_ACTION_REQUIRED'
  | 'CUSTOMER_ACTION_COMPLETED'
  | 'PARTIAL_EFFECT'
  | 'COMPLETE'
  | 'CONFIRM_SUCCEEDED'
  | 'CONFIRM_FAILED'
  | 'EXTERNAL_OUTCOME_UNKNOWN'
  | 'CANCEL'
  | 'COMPENSATE'
  | 'RECONCILE_RESOLVED_SUCCEEDED'
  | 'RECONCILE_RESOLVED_FAILED'
  | 'RECOVER';

/** Terminal states: monotonic; the ONLY exit is the explicit RECOVER rule. */
export const ATTEMPT_TERMINAL_STATES: readonly ExecutionAttemptState[] = [
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'COMPENSATED',
  'RECOVERED',
];

/** The pinned lifecycle transition table (the attempt state wire shape). */
export const ATTEMPT_TRANSITIONS: readonly {
  readonly from: ExecutionAttemptState;
  readonly on: ExecutionAttemptEvent;
  readonly to: ExecutionAttemptState;
}[] = [
  { from: 'PENDING', on: 'START', to: 'IN_FLIGHT' },
  { from: 'PENDING', on: 'CANCEL', to: 'CANCELLED' },
  { from: 'IN_FLIGHT', on: 'CONFIRM_SUCCEEDED', to: 'SUCCEEDED' },
  { from: 'IN_FLIGHT', on: 'CONFIRM_FAILED', to: 'FAILED' },
  { from: 'IN_FLIGHT', on: 'EXTERNAL_OUTCOME_UNKNOWN', to: 'OUTCOME_UNKNOWN' },
  { from: 'IN_FLIGHT', on: 'PROVIDER_ACTION_REQUIRED', to: 'AWAITING_CUSTOMER_ACTION' },
  { from: 'IN_FLIGHT', on: 'PARTIAL_EFFECT', to: 'PARTIALLY_EXECUTED' },
  { from: 'IN_FLIGHT', on: 'CANCEL', to: 'CANCELLED' },
  { from: 'AWAITING_CUSTOMER_ACTION', on: 'CUSTOMER_ACTION_COMPLETED', to: 'IN_FLIGHT' },
  { from: 'AWAITING_CUSTOMER_ACTION', on: 'CONFIRM_SUCCEEDED', to: 'SUCCEEDED' },
  { from: 'AWAITING_CUSTOMER_ACTION', on: 'CONFIRM_FAILED', to: 'FAILED' },
  { from: 'AWAITING_CUSTOMER_ACTION', on: 'EXTERNAL_OUTCOME_UNKNOWN', to: 'OUTCOME_UNKNOWN' },
  { from: 'AWAITING_CUSTOMER_ACTION', on: 'CANCEL', to: 'CANCELLED' },
  { from: 'PARTIALLY_EXECUTED', on: 'COMPLETE', to: 'SUCCEEDED' },
  { from: 'PARTIALLY_EXECUTED', on: 'CONFIRM_FAILED', to: 'FAILED' },
  { from: 'PARTIALLY_EXECUTED', on: 'COMPENSATE', to: 'COMPENSATED' },
  { from: 'PARTIALLY_EXECUTED', on: 'EXTERNAL_OUTCOME_UNKNOWN', to: 'OUTCOME_UNKNOWN' },
  { from: 'OUTCOME_UNKNOWN', on: 'RECONCILE_RESOLVED_SUCCEEDED', to: 'SUCCEEDED' },
  { from: 'OUTCOME_UNKNOWN', on: 'RECONCILE_RESOLVED_FAILED', to: 'FAILED' },
];

/** The explicit recovery rule: FAILED --RECOVER--> RECOVERED (INV-03). */
export const ATTEMPT_RECOVERY: readonly {
  readonly from: ExecutionAttemptState;
  readonly on: ExecutionAttemptEvent;
  readonly to: ExecutionAttemptState;
}[] = [{ from: 'FAILED', on: 'RECOVER', to: 'RECOVERED' }];

/** One recorded state transition on an attempt (history is append-only). */
export interface AttemptTransitionRecord {
  readonly from: ExecutionAttemptState;
  readonly on: ExecutionAttemptEvent;
  readonly to: ExecutionAttemptState;
  /** True when the move was an explicit recovery out of a terminal state. */
  readonly viaRecovery: boolean;
  readonly recordedAt: TimestampMs;
  readonly evidenceIds: readonly string[];
}

/** The cancellation admissibility vocabulary (pinned, consumed). */
export type CancellationPolicy =
  | 'NOT_SUPPORTED'
  | 'BEFORE_EXECUTION'
  | 'UNTIL_SETTLEMENT'
  | 'PROVIDER_DEFINED';

/** The retry discipline an attempt executes under. */
export type AttemptRetryPolicy = 'SAFE_TO_RETRY' | 'REQUIRES_RECONCILIATION';

/** The execution semantics mirrored from the capability's declarations. */
export interface AttemptSemantics {
  readonly cancellation: CancellationPolicy;
  /** Pinned type-only from @payswap/capability (CompensationPolicy). */
  readonly compensation: CompensationPolicy;
}

/**
 * Evidence draft supplied by callers; the LEDGER stamps the attempt link, so
 * evidence can never be forged onto an attempt it does not belong to
 * (INV-05).
 */
export interface ProviderExecutionEvidenceDraft {
  readonly evidenceId: ExecutionEvidenceId;
  readonly kind: ExecutionEvidenceKind;
  /** Reference to the external artifact (provider operation id, webhook id...). */
  readonly evidenceRef: string;
  /** The lossless provider state observed with this evidence (INV-14). */
  readonly providerState?: ProviderStateEnvelope;
  readonly recordedAt: TimestampMs;
}

/** Provider execution evidence linked to one attempt (INV-05). */
export interface ProviderExecutionEvidence extends ProviderExecutionEvidenceDraft {
  readonly attemptId: ExecutionAttemptId;
}

/** The resolution authority required to leave OUTCOME_UNKNOWN (INV-04). */
export interface UnknownOutcomeResolution {
  readonly resolvedOutcome: 'CONFIRMED_SUCCEEDED' | 'CONFIRMED_FAILED';
  readonly resolvedBy: PrincipalRef;
  readonly evidence: readonly ProviderExecutionEvidenceDraft[];
  readonly caseId: string;
}

/** The immutable execution attempt record. */
export interface ExecutionAttempt {
  readonly attemptId: ExecutionAttemptId;
  readonly planId: string;
  readonly stepId: string;
  /** EXPLICIT on every attempt (execution-mode vocabulary, INV-15 family). */
  readonly executionMode: ExecutionMode;
  readonly capabilityInstanceId: string;
  readonly capabilityId: string;
  readonly retryPolicy: AttemptRetryPolicy;
  readonly semantics: AttemptSemantics;
  readonly state: ExecutionAttemptState;
  readonly idempotencyKey: string;
  readonly principal: PrincipalRef;
  readonly commandHash: string;
  /**
   * LAW 1: the EXACT observation version this attempt was decided on, pinned
   * losslessly. Newer observations NEVER rewrite this pin.
   */
  readonly pinnedObservation: ObservationVersionPin;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
  readonly history: readonly AttemptTransitionRecord[];
  readonly evidence: readonly ProviderExecutionEvidence[];
  /** Latest lossless provider state (INV-14), if observed. */
  readonly providerState?: ProviderStateEnvelope;
}

/** Input accepted by the attempt ledger's `begin`. */
export interface BeginExecutionAttemptInput {
  readonly attemptId: string;
  readonly planId: string;
  readonly stepId: string;
  readonly executionMode: ExecutionMode;
  readonly capabilityInstanceId: string;
  readonly capabilityId: string;
  readonly retryPolicy: AttemptRetryPolicy;
  readonly cancellation: CancellationPolicy;
  readonly compensation: CompensationPolicy;
  readonly idempotencyKey: string;
  readonly principal: PrincipalRef;
  /** LAW 1: the observation version pin the attempt is decided on. */
  readonly pinnedObservation: ObservationVersionPin;
  readonly now: TimestampMs;
}

/** INV-06: one idempotency scope maps to one authoritative attempt. */
export type BeginAttemptOutcome =
  | { readonly kind: 'BEGIN'; readonly attempt: ExecutionAttempt }
  | { readonly kind: 'REPLAY'; readonly attempt: ExecutionAttempt; readonly commandHash: string };

/** Input accepted by the attempt ledger's `advance`. */
export interface AdvanceAttemptInput {
  /** Provider evidence for this transition — REQUIRED for external effects. */
  readonly evidence?: readonly ProviderExecutionEvidenceDraft[];
  /** REQUIRED for RECONCILE_RESOLVED_* events (reconciliation is the authority). */
  readonly resolution?: UnknownOutcomeResolution;
  /** Latest lossless provider state (INV-14). */
  readonly providerState?: ProviderStateEnvelope;
  readonly now: TimestampMs;
}
