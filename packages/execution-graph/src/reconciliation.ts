/**
 * @payswap/execution-graph — Reconciliation (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/execution/src/reconciliation.ts, W3-003).
 *
 * The authority for AMBIGUOUS EXTERNAL EFFECTS within this package's
 * attempt ledger (INV-04). UNKNOWN is never mapped to FAILED; UNKNOWN
 * external writes are never blindly retried; reconciliation is the ONLY
 * exit from OUTCOME_UNKNOWN, always with linked provider evidence.
 *
 * Identity law: this reconciliation resolves EXECUTION ambiguity only — no
 * obligation, clearing or settlement calls (the financial protocol lane's
 * exclusive domain). Provider outages never fabricate PaySwap business
 * outcomes: an unresolvable case stays OPEN.
 */

import { ValidationError } from './errors.ts';
import { asReconciliationCaseId } from './identifiers.ts';
import type { ReconciliationCaseId } from './identifiers.ts';
import type { ExecutionAttemptLedger } from './attempt-ledger.ts';
import type {
  OpenReconciliationCaseInput,
  ProviderOutcomeClassification,
  ProviderStateEnvelopeRef,
  ReconciliationCase,
  ReconciliationResolution,
  ResolveReconciliationCaseInput,
} from './reconciliation-contract.ts';
import type { ProviderStateEnvelope } from '@payswap/capability';

/**
 * Deterministically classify a provider state envelope (INV-14-preserved
 * state, INV-04 discipline). Decision order (documented, total):
 * 1. failure.ambiguity === OUTCOME_UNKNOWN -> OUTCOME_UNKNOWN (requires
 *    reconciliation — NEVER FAILED, no matter what else the envelope says);
 * 2. failure present (ambiguity NONE) -> FAILED (retryable per provider);
 * 3. classification.requiresCustomerAction / actionRequired present ->
 *    AWAITING_CUSTOMER_ACTION (actionable, never a generic error);
 * 4. classification.isTerminal -> SUCCEEDED;
 * 5. otherwise -> ASYNC_PROCESSING.
 */
export function classifyProviderOutcome(
  envelope: ProviderStateEnvelopeRef,
): ProviderOutcomeClassification {
  if (envelope === null || typeof envelope !== 'object') {
    throw new ValidationError('a ProviderStateEnvelope is required');
  }
  const failure = envelope.failure;
  if (failure !== undefined && failure.ambiguity === 'OUTCOME_UNKNOWN') {
    return { outcome: 'OUTCOME_UNKNOWN', requiresReconciliation: true };
  }
  if (failure !== undefined) {
    return { outcome: 'FAILED', retryable: failure.retryable };
  }
  if (
    envelope.classification.requiresCustomerAction ||
    envelope.actionRequired !== undefined
  ) {
    return { outcome: 'AWAITING_CUSTOMER_ACTION' };
  }
  if (envelope.classification.isTerminal) {
    return { outcome: 'SUCCEEDED' };
  }
  return { outcome: 'ASYNC_PROCESSING' };
}

/**
 * The reconciliation authority (INV-04): the ONLY component that can move
 * an OUTCOME_UNKNOWN attempt to a definitive outcome, always with linked
 * provider evidence, always as an immutable resolution record.
 */
export class ReconciliationAuthority {
  readonly #ledger: ExecutionAttemptLedger;
  readonly #cases = new Map<string, ReconciliationCase>();
  readonly #openByAttempt = new Map<string, string>();

  constructor(ledger: ExecutionAttemptLedger) {
    this.#ledger = ledger;
  }

  /**
   * Open a case for an ambiguous attempt. The attempt MUST currently be in
   * OUTCOME_UNKNOWN — an ambiguity is exactly what a case exists for. One
   * OPEN case per attempt (re-opening a resolved case is forbidden: history
   * is immutable, a new ambiguity is a new attempt's ambiguity).
   */
  openCase(input: OpenReconciliationCaseInput): ReconciliationCase {
    if (input === null || typeof input !== 'object') {
      throw new ValidationError('open-case input must be an object');
    }
    if (typeof input.caseId !== 'string' || input.caseId.length === 0) {
      throw new ValidationError('caseId must be a non-empty string');
    }
    if (typeof input.now !== 'bigint') {
      throw new ValidationError('open-case input must carry now: TimestampMs');
    }
    if (this.#cases.has(input.caseId)) {
      throw new ValidationError(`reconciliation case '${input.caseId}' already exists`);
    }
    const attempt = this.#ledger.attempt(input.attemptId);
    if (attempt === undefined) {
      throw new ValidationError(
        `cannot open a reconciliation case for unknown attempt '${input.attemptId}'`,
      );
    }
    if (attempt.state !== 'OUTCOME_UNKNOWN') {
      throw new ValidationError(
        `reconciliation cases exist for ambiguous external effects: attempt '${input.attemptId}' is '${attempt.state}', not OUTCOME_UNKNOWN (INV-04)`,
      );
    }
    const openCaseId = this.#openByAttempt.get(input.attemptId);
    if (openCaseId !== undefined) {
      throw new ValidationError(
        `attempt '${input.attemptId}' already has OPEN case '${openCaseId}'`,
      );
    }
    const reconciliationCase: ReconciliationCase = Object.freeze({
      caseId: asReconciliationCaseId(input.caseId),
      attemptId: input.attemptId,
      reason: input.reason,
      status: 'OPEN',
      openedAt: input.now,
    });
    this.#cases.set(reconciliationCase.caseId, reconciliationCase);
    this.#openByAttempt.set(input.attemptId, reconciliationCase.caseId);
    return reconciliationCase;
  }

  /**
   * Resolve an OPEN case — the authoritative transition of an ambiguous
   * external effect into a definitive outcome (INV-04). Resolution REQUIRES
   * provider evidence linked to the ambiguous attempt (INV-05); the attempt
   * then leaves OUTCOME_UNKNOWN through the reconciliation events, which
   * are fireable ONLY with this resolution (enforced by the ledger).
   */
  resolveCase(input: ResolveReconciliationCaseInput): ReconciliationResolution {
    if (input === null || typeof input !== 'object') {
      throw new ValidationError('resolve-case input must be an object');
    }
    const existing = this.#cases.get(input.caseId);
    if (existing === undefined) {
      throw new ValidationError(`unknown reconciliation case: ${input.caseId}`);
    }
    if (existing.status !== 'OPEN') {
      throw new ValidationError(
        `reconciliation case '${input.caseId}' is already RESOLVED — resolutions are immutable`,
      );
    }
    if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
      throw new ValidationError(
        'a reconciliation resolution requires provider evidence linked to the ambiguous attempt (INV-04/INV-05)',
      );
    }
    const resolution: ReconciliationResolution = Object.freeze({
      caseId: existing.caseId,
      outcome: input.outcome,
      resolvedBy: Object.freeze({ ...input.resolvedBy }),
      evidence: Object.freeze([...input.evidence]),
      resolvedAt: input.now,
      ...(input.note !== undefined ? { note: input.note } : {}),
    });
    this.#ledger.advance(
      existing.attemptId,
      input.outcome === 'CONFIRMED_SUCCEEDED'
        ? 'RECONCILE_RESOLVED_SUCCEEDED'
        : 'RECONCILE_RESOLVED_FAILED',
      {
        now: input.now,
        evidence: input.evidence,
        resolution: {
          resolvedOutcome: input.outcome,
          resolvedBy: input.resolvedBy,
          evidence: input.evidence,
          caseId: input.caseId,
        },
      },
    );
    const resolved: ReconciliationCase = Object.freeze({
      ...existing,
      status: 'RESOLVED',
      resolution,
    });
    this.#cases.set(resolved.caseId, resolved);
    this.#openByAttempt.delete(resolved.attemptId);
    return resolution;
  }

  /** One case by id. */
  case(caseId: string): ReconciliationCase | undefined {
    return this.#cases.get(caseId);
  }

  /** The OPEN case for an attempt, when one exists. */
  openCaseFor(attemptId: string): ReconciliationCase | undefined {
    const caseId = this.#openByAttempt.get(attemptId);
    return caseId === undefined ? undefined : this.#cases.get(caseId);
  }

  /** All cases, in opening order. */
  allCases(): readonly ReconciliationCase[] {
    return [...this.#cases.values()];
  }
}

/**
 * Retry admissibility for an attempt under the INV-04 discipline:
 * OUTCOME_UNKNOWN requires reconciliation; a definitive FAILED outcome is
 * retryable only when the capability declared SAFE_TO_RETRY.
 */
export function retryRequiresReconciliation(
  attempt: Pick<import('./attempt-contract.ts').ExecutionAttempt, 'state' | 'retryPolicy'>,
): boolean {
  if (attempt.state === 'OUTCOME_UNKNOWN') {
    return true;
  }
  if (attempt.state === 'FAILED') {
    return attempt.retryPolicy !== 'SAFE_TO_RETRY';
  }
  return false;
}

/** Re-export for consumers that hold envelopes directly (type-only convenience). */
export type { ProviderStateEnvelope };
