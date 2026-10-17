/**
 * @payswap/execution-graph — Reconciliation contracts (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/execution/src/reconciliation.ts, W3-003).
 *
 * Reconciliation is the authority for AMBIGUOUS EXTERNAL EFFECTS within this
 * package's attempt ledger (INV-04): an OUTCOME_UNKNOWN attempt can ONLY be
 * resolved through a ReconciliationResolution backed by provider evidence
 * linked to the attempt. There is no other exit.
 *
 * IMPORTANT (identity law): this reconciliation authority resolves
 * EXECUTION ambiguity (did the external write happen?); it never touches
 * obligations, clearing or settlement — those are the financial protocol
 * lane's exclusive domain. Provider outages and connector failures never
 * fabricate PaySwap business outcomes: an unresolvable case stays OPEN.
 */

import type { ProviderStateEnvelope } from '@payswap/capability';
import type { PrincipalRef, TimestampMs } from '@payswap/protocol';
import type { ProviderExecutionEvidenceDraft } from './attempt-contract.ts';
import type { ExecutionAttemptId, ReconciliationCaseId } from './identifiers.ts';

/**
 * The canonical outcome classification of a provider state envelope.
 * `OUTCOME_UNKNOWN` is a FIRST-CLASS outcome that requires reconciliation —
 * it is never mapped to FAILED and never treated as success (INV-04).
 */
export type ProviderOutcomeClassification =
  | {
      readonly outcome: 'OUTCOME_UNKNOWN';
      readonly requiresReconciliation: true;
    }
  | {
      readonly outcome: 'FAILED';
      readonly retryable: boolean;
    }
  | { readonly outcome: 'SUCCEEDED' }
  | { readonly outcome: 'AWAITING_CUSTOMER_ACTION' }
  | { readonly outcome: 'ASYNC_PROCESSING' };

/** Why a reconciliation case exists. */
export type ReconciliationReason =
  | 'EXTERNAL_AMBIGUITY'
  | 'PROVIDER_OUTAGE_UNKNOWN_EFFECT'
  | 'PARTIAL_EFFECT_AMBIGUITY';

/** The definitive outcomes a resolution may carry. */
export type ReconciliationResolutionOutcome =
  | 'CONFIRMED_SUCCEEDED'
  | 'CONFIRMED_FAILED';

/** The immutable resolution record (INV-03: resolutions never change). */
export interface ReconciliationResolution {
  readonly caseId: ReconciliationCaseId;
  readonly outcome: ReconciliationResolutionOutcome;
  readonly resolvedBy: PrincipalRef;
  /** Provider evidence backing the resolution — REQUIRED (INV-05). */
  readonly evidence: readonly ProviderExecutionEvidenceDraft[];
  readonly resolvedAt: TimestampMs;
  readonly note?: string;
}

/** One reconciliation case over one ambiguous attempt. */
export interface ReconciliationCase {
  readonly caseId: ReconciliationCaseId;
  readonly attemptId: ExecutionAttemptId;
  readonly reason: ReconciliationReason;
  readonly status: 'OPEN' | 'RESOLVED';
  readonly openedAt: TimestampMs;
  /** Present iff RESOLVED — the immutable resolution record. */
  readonly resolution?: ReconciliationResolution;
}

/** Input accepted by `openCase`. */
export interface OpenReconciliationCaseInput {
  readonly caseId: string;
  readonly attemptId: ExecutionAttemptId;
  readonly reason: ReconciliationReason;
  readonly now: TimestampMs;
}

/** Input accepted by `resolveCase`. */
export interface ResolveReconciliationCaseInput {
  readonly caseId: string;
  readonly outcome: ReconciliationResolutionOutcome;
  readonly resolvedBy: PrincipalRef;
  readonly evidence: readonly ProviderExecutionEvidenceDraft[];
  readonly now: TimestampMs;
  readonly note?: string;
}

/**
 * The minimal attempt-ledger surface the reconciliation authority needs
 * (dependency inversion: the authority never imports the ledger class).
 */
export interface AttemptLedgerPort {
  attempt(attemptId: string): { readonly state: string } | undefined;
  advance(
    attemptId: string,
    event: string,
    input: {
      readonly now: TimestampMs;
      readonly evidence?: readonly ProviderExecutionEvidenceDraft[];
      readonly resolution?: unknown;
    },
  ): unknown;
}

/** Deterministic classification input (an INV-14 envelope, lossless). */
export type ProviderStateEnvelopeRef = ProviderStateEnvelope;
