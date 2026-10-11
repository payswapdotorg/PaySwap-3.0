/**
 * @payswap/protocol — settlement attempts: the attempt record contract and
 * lifecycle machine (P1-W2, MMI-12 PORT).
 *
 * Adapted from payswap.org@8a735bf packages/settlement/src/instructions.ts
 * (old Work Order W1-004; the record half — the ledger class lives in
 * attempt-ledger.ts). Old invariants: INV-F05/INV-O01 → canonical INV-06;
 * INV-X01..X04 → canonical INV-03/04; INV-E02 → canonical INV-05.
 *
 * `SettlementAttempt` is the idempotent, retry-safe attempt record for
 * executing one settlement instruction against an external rail:
 *
 * - INV-06: one idempotency key maps to one authoritative attempt result —
 *   enforced through the protocol kernel's `IdempotencyRegistrar`
 *   (BEGIN/REPLAY/CONFLICT discipline; a conflicting key re-use throws).
 * - Retry-safety: a definitively FAILED attempt may be retried under the
 *   SAME idempotency key, which re-arms the scope exactly like the kernel's
 *   retry semantics (a NEW attempt record is created; the failed one stays
 *   FAILED forever — history is append-only, INV-03).
 * - INV-04: UNKNOWN is a first-class state (`OUTCOME_UNKNOWN`), never FAILED.
 * - An UNKNOWN external write is NEVER blindly retried — `requestRetry`
 *   fails closed on OUTCOME_UNKNOWN.
 * - Leaving `OUTCOME_UNKNOWN` is possible ONLY through a reconciliation
 *   resolution (`resolveUnknown` demands one, and it must carry evidence);
 *   there is no other exit from ambiguity.
 * - Terminal states are monotonic (the protocol kernel machine throws
 *   `TerminalStateViolationError` on any non-recovery exit); a retry never
 *   rewrites the failed attempt — it mints a new record.
 * - Recording any external outcome REQUIRES linked evidence ids (the
 *   evidence graph owns the nodes; the attempt carries the linkage — INV-05).
 */

import { ValidationError } from '../errors.ts';
import { PaySwapError } from '../errors.ts';
import type { PaySwapErrorDetails } from '../errors.ts';
import type { TimestampMs } from '../clock.ts';
import type { IdempotencyRecord } from '../idempotency.ts';
import type { PrincipalRef } from '../identifiers.ts';
import { defineStateMachine } from '../state-machine.ts';
import type { StateMachine, TransitionRecord } from '../state-machine.ts';
import type { SettlementInstructionId } from '../netting.ts';
import { asSettlementInstructionId } from '../netting.ts';
import { fnv1a64 } from './evidence.ts';

declare const SettlementAttemptIdBrand: unique symbol;

/** Branded id of one settlement attempt. */
export type SettlementAttemptId = string & {
  readonly [SettlementAttemptIdBrand]: 'SettlementAttemptId';
};

/** Brand a validated string as a `SettlementAttemptId`. */
export function asSettlementAttemptId(value: string): SettlementAttemptId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError('SettlementAttemptId must be a non-empty string');
  }
  if (value.length > 256) {
    throw new ValidationError('SettlementAttemptId exceeds 256 characters');
  }
  if (value.trim() !== value) {
    throw new ValidationError('SettlementAttemptId must not carry surrounding whitespace');
  }
  return value as SettlementAttemptId;
}

export type SettlementAttemptState =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'OUTCOME_UNKNOWN'
  | 'SUCCEEDED'
  | 'FAILED';

export type SettlementAttemptEvent =
  | 'START'
  | 'CONFIRM_SUCCEEDED'
  | 'CONFIRM_FAILED'
  | 'OUTCOME_UNKNOWN'
  | 'RECONCILE_RESOLVED_SUCCEEDED'
  | 'RECONCILE_RESOLVED_FAILED';

/**
 * The canonical settlement attempt lifecycle (protocol kernel machine).
 * SUCCEEDED and FAILED are TERMINAL and monotonic: a retry mints a NEW
 * attempt record — the failed record is never rewritten.
 * `OUTCOME_UNKNOWN` is deliberately non-terminal and can ONLY be exited via
 * the reconciliation resolution events (INV-04) — there is no declared rule
 * from OUTCOME_UNKNOWN to any ordinary event, and no coercion to FAILED
 * exists anywhere.
 */
export const settlementAttemptStateMachine: StateMachine<
  SettlementAttemptState,
  SettlementAttemptEvent,
  unknown
> = defineStateMachine<SettlementAttemptState, SettlementAttemptEvent, unknown>({
  name: 'settlement-attempt',
  initial: 'PENDING',
  states: ['PENDING', 'IN_FLIGHT', 'OUTCOME_UNKNOWN', 'SUCCEEDED', 'FAILED'],
  events: [
    'START',
    'CONFIRM_SUCCEEDED',
    'CONFIRM_FAILED',
    'OUTCOME_UNKNOWN',
    'RECONCILE_RESOLVED_SUCCEEDED',
    'RECONCILE_RESOLVED_FAILED',
  ],
  transitions: [
    { from: 'PENDING', on: 'START', to: 'IN_FLIGHT', description: 'pure local start — no external effect yet' },
    { from: 'IN_FLIGHT', on: 'CONFIRM_SUCCEEDED', to: 'SUCCEEDED' },
    { from: 'IN_FLIGHT', on: 'CONFIRM_FAILED', to: 'FAILED' },
    { from: 'IN_FLIGHT', on: 'OUTCOME_UNKNOWN', to: 'OUTCOME_UNKNOWN' },
    { from: 'OUTCOME_UNKNOWN', on: 'RECONCILE_RESOLVED_SUCCEEDED', to: 'SUCCEEDED' },
    { from: 'OUTCOME_UNKNOWN', on: 'RECONCILE_RESOLVED_FAILED', to: 'FAILED' },
  ],
  terminalStates: ['SUCCEEDED', 'FAILED'],
});

/** One recorded state transition on an attempt (history is append-only). */
export interface SettlementTransitionRecord
  extends TransitionRecord<SettlementAttemptState, SettlementAttemptEvent> {
  readonly recordedAt: TimestampMs;
  readonly evidenceIds: readonly string[];
  /** Present when the transition was a reconciliation resolution (INV-04). */
  readonly resolutionCaseId?: string;
}

/**
 * The reconciliation resolution authority required to leave OUTCOME_UNKNOWN.
 * Only the settlement reconciliation authority produces these — the attempt
 * ledger verifies the resolution matches the event and carries evidence.
 */
export interface UnknownOutcomeResolution {
  readonly resolvedOutcome: 'CONFIRMED_SUCCEEDED' | 'CONFIRMED_FAILED';
  readonly resolvedBy: PrincipalRef;
  readonly caseId: string;
  readonly evidenceIds: readonly string[];
}

/** The definitive or ambiguous outcome of an external settlement write. */
export type ExternalOutcome = 'SUCCEEDED' | 'FAILED' | 'OUTCOME_UNKNOWN';

/** The immutable settlement attempt record. */
export interface SettlementAttempt {
  readonly attemptId: SettlementAttemptId;
  readonly instructionId: SettlementInstructionId;
  /** The rail this attempt executes on (proof-policy risk dimension). */
  readonly rail: string;
  readonly state: SettlementAttemptState;
  readonly idempotencyKey: string;
  readonly principal: PrincipalRef;
  readonly commandHash: string;
  /** Linked evidence node ids (the evidence graph owns the nodes — INV-05). */
  readonly evidenceIds: readonly string[];
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
  readonly history: readonly SettlementTransitionRecord[];
  /** Present iff the ambiguity was resolved through reconciliation (INV-04). */
  readonly resolution?: UnknownOutcomeResolution;
}

export interface BeginSettlementAttemptInput {
  readonly attemptId: string;
  readonly instructionId: string;
  readonly rail: string;
  readonly idempotencyKey: string;
  readonly principal: PrincipalRef;
  readonly now: TimestampMs;
}

export type BeginSettlementAttemptOutcome =
  | { readonly kind: 'BEGIN'; readonly attempt: SettlementAttempt }
  | {
      /** INV-06: one idempotency key maps to one authoritative attempt. */
      readonly kind: 'REPLAY';
      readonly attempt: SettlementAttempt;
      readonly record: IdempotencyRecord;
    };

/** INV-06 violation: same idempotency key, different command. */
export class SettlementAttemptConflictError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({
      code: 'SETTLEMENT_ATTEMPT_CONFLICT',
      category: 'CONFLICT',
      message,
      details,
    });
  }
}

/** INV-04: an UNKNOWN external write cannot be blindly retried. */
export class SettlementRetryForbiddenError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({
      code: 'SETTLEMENT_RETRY_FORBIDDEN',
      category: 'EXTERNAL_AMBIGUITY',
      message,
      details,
    });
  }
}

/** INV-05: an external outcome was recorded without linked evidence. */
export class SettlementEvidenceRequiredError extends PaySwapError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super({
      code: 'SETTLEMENT_EVIDENCE_REQUIRED',
      category: 'VALIDATION',
      message,
      details,
    });
  }
}

/** Deterministic command hash binding an attempt to its execution identity. */
export function settlementCommandHash(input: {
  readonly instructionId: SettlementInstructionId;
  readonly rail: string;
  readonly principal: PrincipalRef;
}): string {
  return fnv1a64(
    `settlement-attempt|${input.instructionId}|${input.rail}|${input.principal.principalType}:${input.principal.principalId}`,
  );
}

/** Deterministic result hash for a terminalized attempt (replay equality). */
export function settlementResultHash(attempt: SettlementAttempt): string {
  return fnv1a64(`settlement-attempt-result|${attempt.attemptId}|${attempt.state}`);
}

