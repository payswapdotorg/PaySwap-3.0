/**
 * @payswap/protocol — reconciliation: the ONLY definitive resolver of
 * ambiguous external effects (P1-W2, MMI-10 PORT).
 *
 * Adapted from payswap.org@8a735bf packages/settlement/src/reconciliation.ts
 * (old Work Order W1-004, the case/resolution core; old INV-X01/X03 map to
 * canonical INV-04). Old cross-package imports are NOT ported (this package
 * is dependency-free in flight):
 * - `classifyProviderOutcome` (@payswap/execution) → the provider runtime
 *   lane (P2-W2) owns provider-state classification; the protocol consumes
 *   the resulting outcomes through `recordExternalOutcome`.
 * - `ExternalFundsPositionObservation` validators (@payswap/connectors),
 *   `RecurringMandate` / `OffNetworkPaymentRecord` (@payswap/payment) →
 *   payment-plane reconciliation subjects DEFERRED to their owning lanes
 *   (deferral register): external funds observation reconciliation
 *   (INV-14-adjacent freshness/provenance), recurring mandate renewal
 *   reconciliation, and off-network record reconciliation. The CASE
 *   taxonomy keeps their subject kinds reserved so those lanes resolve
 *   through this same authority without a breaking change.
 *
 * Core law (INV-04):
 * - an UNKNOWN settlement outcome can ONLY resolve through a
 *   `SettlementReconciliationCase` issued by
 *   `SettlementReconciliationAuthority` — never through retry, never through
 *   a direct write. Provider outages and connector failures never fabricate
 *   PaySwap business outcomes: an unresolvable case stays OPEN.
 * - UNKNOWN is never mapped to FAILED.
 * - Resolutions REQUIRE linked evidence (INV-05) and are immutable once
 *   recorded (INV-03): resolved cases are never re-opened.
 */

import { ValidationError } from '../errors.ts';
import type { PaySwapErrorDetails } from '../errors.ts';
import type { TimestampMs } from '../clock.ts';
import type { PrincipalRef } from '../identifiers.ts';
import type { SettlementInstructionId } from '../netting.ts';
import type { SettlementAttemptId } from './attempts.ts';
import { asSettlementAttemptId } from './attempts.ts';
import { SettlementAttemptLedger } from './attempt-ledger.ts';

declare const ReconciliationCaseIdBrand: unique symbol;

/** Branded id of one settlement reconciliation case. */
export type ReconciliationCaseId = string & {
  readonly [ReconciliationCaseIdBrand]: 'ReconciliationCaseId';
};

/** Brand a validated string as a `ReconciliationCaseId`. */
export function asReconciliationCaseId(value: string): ReconciliationCaseId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError('ReconciliationCaseId must be a non-empty string');
  }
  if (value.length > 256) {
    throw new ValidationError('ReconciliationCaseId exceeds 256 characters');
  }
  if (value.trim() !== value) {
    throw new ValidationError('ReconciliationCaseId must not carry surrounding whitespace');
  }
  return value as ReconciliationCaseId;
}

/** Why a settlement reconciliation case exists. */
export type ReconciliationReason =
  | 'EXTERNAL_AMBIGUITY'
  | 'PROVIDER_OUTAGE_UNKNOWN_EFFECT'
  | 'PROVIDER_REVISION_DIVERGENCE'
  | 'MANDATE_RENEWAL_AMBIGUITY'
  | 'OFF_NETWORK_RECORD_AMBIGUITY'
  | 'EXTERNAL_FUNDS_DISCREPANCY'
  | 'REFUND_DISPUTE_AMBIGUITY';

/**
 * What a case reconciles. SETTLEMENT_ATTEMPT is the ambiguous-external-write
 * case (the core INV-04 subject this authority fully implements). The
 * remaining subjects are RESERVED case taxonomy for the lanes that own the
 * underlying artifacts (deferral register): provider revisions
 * (provider-revisions.ts retains the append-only ledger here), external
 * funds observations, recurring mandate renewals, off-network records, and
 * refund/dispute symmetry.
 */
export type ReconciliationSubject =
  | { readonly kind: 'SETTLEMENT_ATTEMPT'; readonly attemptId: SettlementAttemptId }
  | {
      readonly kind: 'PROVIDER_REVISION';
      readonly providerName: string;
      readonly objectType: string;
      readonly externalId: string;
    }
  | { readonly kind: 'EXTERNAL_FUNDS_OBSERVATION'; readonly observationId: string }
  | { readonly kind: 'RECURRING_MANDATE_RENEWAL'; readonly mandateId: string; readonly renewalRef: string }
  | { readonly kind: 'OFF_NETWORK_RECORD'; readonly recordId: string }
  | { readonly kind: 'REFUND_DISPUTE_SYMMETRY'; readonly originalRef: string; readonly adjustmentRef: string };

export type ReconciliationResolutionOutcome =
  | 'CONFIRMED_SUCCEEDED'
  | 'CONFIRMED_FAILED'
  | 'MATCHED'
  | 'DISCREPANCY_RECORDED';

/** The immutable resolution record. */
export interface SettlementReconciliationResolution {
  readonly caseId: ReconciliationCaseId;
  readonly outcome: ReconciliationResolutionOutcome;
  readonly resolvedBy: PrincipalRef;
  /** Evidence node/graph ids backing the resolution — REQUIRED (INV-05). */
  readonly evidenceIds: readonly string[];
  readonly resolvedAt: TimestampMs;
  readonly note?: string;
}

/** One reconciliation case. */
export interface SettlementReconciliationCase {
  readonly caseId: ReconciliationCaseId;
  readonly subject: ReconciliationSubject;
  readonly reason: ReconciliationReason;
  readonly status: 'OPEN' | 'RESOLVED';
  /** Links the case to the settlement instruction it affects (finality gate). */
  readonly instructionRef?: SettlementInstructionId;
  readonly openedAt: TimestampMs;
  /** Present iff RESOLVED — the immutable resolution record. */
  readonly resolution?: SettlementReconciliationResolution;
}

export interface OpenCaseInput {
  readonly caseId: string;
  readonly subject: ReconciliationSubject;
  readonly reason: ReconciliationReason;
  readonly instructionRef?: string;
  readonly now: TimestampMs;
}

export interface ResolveCaseInput {
  readonly caseId: string;
  readonly outcome: ReconciliationResolutionOutcome;
  readonly resolvedBy: PrincipalRef;
  readonly evidenceIds: readonly string[];
  readonly now: TimestampMs;
  readonly note?: string;
}

/** Case lifecycle violation (duplicate/open/resolved conflicts). */
export class ReconciliationCaseError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'ReconciliationCaseError';
  }
}

/**
 * The settlement reconciliation authority (INV-04). The ONLY component that
 * can move an OUTCOME_UNKNOWN settlement attempt to a definitive outcome,
 * always with linked evidence, always as an immutable resolution record.
 */
export class SettlementReconciliationAuthority {
  readonly #ledger: SettlementAttemptLedger;
  readonly #cases = new Map<string, SettlementReconciliationCase>();
  readonly #openByAttempt = new Map<string, string>();

  constructor(ledger: SettlementAttemptLedger) {
    this.#ledger = ledger;
  }

  /**
   * Open a case. For a SETTLEMENT_ATTEMPT subject the attempt MUST currently
   * be OUTCOME_UNKNOWN (an ambiguity is exactly what a case exists for) and
   * the case inherits the attempt's instruction reference. One OPEN case per
   * ambiguous attempt; resolved cases are never re-opened.
   */
  openCase(input: OpenCaseInput): SettlementReconciliationCase {
    if (input === null || typeof input !== 'object') {
      throw new ValidationError('open-case input must be an object');
    }
    const caseId = asReconciliationCaseId(input.caseId);
    if (this.#cases.has(caseId)) {
      throw new ReconciliationCaseError(`reconciliation case '${caseId}' already exists`);
    }
    if (input.subject === null || typeof input.subject !== 'object') {
      throw new ValidationError('subject must be a ReconciliationSubject');
    }
    let instructionRef: SettlementInstructionId | undefined =
      typeof input.instructionRef === 'string' && input.instructionRef.length > 0
        ? (input.instructionRef as SettlementInstructionId)
        : undefined;
    if (input.subject.kind === 'SETTLEMENT_ATTEMPT') {
      const attemptId = asSettlementAttemptId(input.subject.attemptId);
      const attempt = this.#ledger.attempt(attemptId);
      if (attempt === undefined) {
        throw new ReconciliationCaseError(
          `cannot open a reconciliation case for unknown settlement attempt '${input.subject.attemptId}'`,
        );
      }
      if (attempt.state !== 'OUTCOME_UNKNOWN') {
        throw new ReconciliationCaseError(
          `reconciliation cases exist for ambiguous external effects: attempt '${input.subject.attemptId}' is '${attempt.state}', not OUTCOME_UNKNOWN (INV-04)`,
          { attemptId: input.subject.attemptId, state: attempt.state },
        );
      }
      const openCaseId = this.#openByAttempt.get(input.subject.attemptId);
      if (openCaseId !== undefined) {
        throw new ReconciliationCaseError(
          `attempt '${input.subject.attemptId}' already has OPEN case '${openCaseId}'`,
        );
      }
      instructionRef = attempt.instructionId;
    }
    const record: SettlementReconciliationCase = Object.freeze({
      caseId,
      subject: Object.freeze({ ...input.subject }) as ReconciliationSubject,
      reason: input.reason,
      status: 'OPEN',
      ...(instructionRef !== undefined ? { instructionRef } : {}),
      openedAt: input.now,
    });
    this.#cases.set(caseId, record);
    if (input.subject.kind === 'SETTLEMENT_ATTEMPT') {
      this.#openByAttempt.set(input.subject.attemptId, caseId);
    }
    return record;
  }

  /**
   * Resolve an OPEN case — the authoritative transition of an ambiguous
   * external effect into a definitive outcome. Resolution REQUIRES linked
   * evidence (INV-05); the ambiguous attempt then leaves OUTCOME_UNKNOWN
   * through the reconciliation resolution events, which are fireable ONLY
   * with this resolution (enforced by the attempt ledger).
   */
  resolveCase(input: ResolveCaseInput): SettlementReconciliationResolution {
    if (input === null || typeof input !== 'object') {
      throw new ValidationError('resolve-case input must be an object');
    }
    const existing = this.#cases.get(input.caseId);
    if (existing === undefined) {
      throw new ReconciliationCaseError(`unknown reconciliation case: ${input.caseId}`);
    }
    if (existing.status !== 'OPEN') {
      throw new ReconciliationCaseError(
        `reconciliation case '${input.caseId}' is already RESOLVED — resolutions are immutable`,
        { caseId: input.caseId },
      );
    }
    if (input.resolvedBy === null || typeof input.resolvedBy !== 'object') {
      throw new ValidationError('resolve-case input must name the resolving principal');
    }
    if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length === 0) {
      throw new ValidationError(
        'a reconciliation resolution requires evidence linked to the ambiguous effect (INV-05)',
      );
    }
    for (const id of input.evidenceIds) {
      if (typeof id !== 'string' || id.length === 0) {
        throw new ValidationError('evidence ids must be non-empty strings');
      }
    }
    if (
      input.note !== undefined &&
      (typeof input.note !== 'string' || input.note.length === 0)
    ) {
      throw new ValidationError('note must be a non-empty string when present');
    }

    if (existing.subject.kind === 'SETTLEMENT_ATTEMPT') {
      if (input.outcome !== 'CONFIRMED_SUCCEEDED' && input.outcome !== 'CONFIRMED_FAILED') {
        throw new ReconciliationCaseError(
          'an ambiguous settlement attempt resolves to CONFIRMED_SUCCEEDED or CONFIRMED_FAILED only',
          { caseId: input.caseId, outcome: input.outcome },
        );
      }
      this.#ledger.resolveUnknown(existing.subject.attemptId, {
        resolvedOutcome: input.outcome,
        resolvedBy: input.resolvedBy,
        caseId: existing.caseId,
        evidenceIds: Object.freeze([...input.evidenceIds]),
      }, input.now);
    }

    const resolution: SettlementReconciliationResolution = Object.freeze({
      caseId: existing.caseId,
      outcome: input.outcome,
      resolvedBy: Object.freeze({ ...input.resolvedBy }),
      evidenceIds: Object.freeze([...input.evidenceIds]),
      resolvedAt: input.now,
      ...(input.note !== undefined ? { note: input.note } : {}),
    });
    const resolved: SettlementReconciliationCase = Object.freeze({
      ...existing,
      status: 'RESOLVED',
      resolution,
    });
    this.#cases.set(resolved.caseId, resolved);
    if (existing.subject.kind === 'SETTLEMENT_ATTEMPT') {
      this.#openByAttempt.delete(existing.subject.attemptId);
    }
    return resolution;
  }

  /** One case by id. */
  case(caseId: string): SettlementReconciliationCase | undefined {
    return this.#cases.get(caseId);
  }

  /** The OPEN case for an ambiguous attempt, when one exists. */
  openCaseForAttempt(attemptId: SettlementAttemptId): SettlementReconciliationCase | undefined {
    const caseId = this.#openByAttempt.get(attemptId);
    return caseId === undefined ? undefined : this.#cases.get(caseId);
  }

  /** All cases tied to one instruction (finality completeness gate). */
  casesForInstruction(instructionId: string): readonly SettlementReconciliationCase[] {
    return [...this.#cases.values()].filter(
      (record) => record.instructionRef === instructionId,
    );
  }

  /** OPEN cases tied to one instruction — these block finality (INV-04). */
  openCasesForInstruction(instructionId: string): readonly SettlementReconciliationCase[] {
    return this.casesForInstruction(instructionId).filter((record) => record.status === 'OPEN');
  }

  /** All cases, in opening order (audit view). */
  allCases(): readonly SettlementReconciliationCase[] {
    return [...this.#cases.values()];
  }
}
