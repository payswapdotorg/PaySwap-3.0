/**
 * STRUCTURAL PIN — the onchain-domain execution observation (Work Order
 * P4-W3, lane R2-W3; local structural mirror of payswap.org@8a735bf
 * packages/onchain-domain/src/execution.ts observation contracts).
 *
 * An OnchainExecutionObservation is an OBSERVATION of an external onchain
 * execution attempt — never financial truth and never finality. The outcome
 * coupling laws are validated deterministically, fail-closed:
 * - FAILED ⇒ a failure descriptor is REQUIRED (definitive failures explain
 *   themselves) and may not coexist with an unknownReason;
 * - OUTCOME_UNKNOWN ⇒ an explicit reason is REQUIRED and a failure
 *   descriptor is FORBIDDEN (ambiguity is not failure — the UNKNOWN law);
 * - BROADCAST ⇒ a finality candidate is FORBIDDEN (submitted is not
 *   finality — rule 29);
 * - evidence references are MANDATORY on every observation;
 * - a finality candidate, when present, is a CANDIDATE (never finality —
 *   finality is protocol-owned).
 */

import { ValidationError } from '../../errors.ts';
import { isValidChainKey } from './family.ts';

export const ONCHAIN_EXECUTION_OUTCOMES = [
  'BROADCAST',
  'CONFIRMED',
  'FAILED',
  'OUTCOME_UNKNOWN',
] as const;

export type OnchainExecutionOutcome = (typeof ONCHAIN_EXECUTION_OUTCOMES)[number];

export function isOnchainExecutionOutcome(value: unknown): value is OnchainExecutionOutcome {
  return (
    typeof value === 'string' &&
    (ONCHAIN_EXECUTION_OUTCOMES as readonly unknown[]).includes(value)
  );
}

export const ONCHAIN_FAILURE_CLASSES = [
  'REJECTED',
  'REVERTED',
  'INSUFFICIENT_FUNDS',
  'EXPIRED',
  'POLICY_BLOCKED',
  'SECURITY_BLOCKED',
  'PROVIDER_DEFINED',
] as const;

export type OnchainFailureClass = (typeof ONCHAIN_FAILURE_CLASSES)[number];

/**
 * A definitive failure of an onchain execution. Transport-level ambiguity
 * is NOT a failure: when it is unknown whether an operation reached the
 * chain, the outcome is OUTCOME_UNKNOWN — there is deliberately no
 * transport member here.
 */
export interface OnchainFailureDescriptor {
  readonly failureClass: OnchainFailureClass;
  readonly description: string;
  /** Deterministic retry guidance (the UNKNOWN law governs unknowns). */
  readonly retryGuidance: 'SAFE_TO_RETRY' | 'REQUIRES_RECONCILIATION' | 'NOT_RETRYABLE';
}

/**
 * A finality CANDIDATE — all an external observer can ever produce.
 * `candidateOnly: true` and `requiresProtocolFinality: true` are LITERAL
 * types: declaring financial finality from an observation is structurally
 * impossible; finality is protocol-owned.
 */
export interface OnchainFinalityCandidate {
  readonly candidateOnly: true;
  readonly requiresProtocolFinality: true;
  /** Neutral confirmation depth (blocks/slots/attestations observed). */
  readonly confirmationDepth?: number;
  readonly finalityModel: 'PROBABILISTIC' | 'DETERMINISTIC' | 'INSTANT' | 'HYBRID';
  /** Whether a reorg/reorganization was observed for this operation. */
  readonly reorgDetected: boolean;
}

/** Observation provenance (who served the observation, when). */
export interface ObservationProvenance {
  readonly providerName: string;
  readonly source: 'PROVIDER_API' | 'PROVIDER_WEBHOOK' | 'OPERATOR';
  readonly capturedAt: string;
}

/** An observation of an external onchain execution attempt. */
export interface OnchainExecutionObservation {
  readonly observationId: string;
  /** The execution attempt reference (the request idempotency key scope). */
  readonly executionRef: string;
  readonly observedAt: string;
  readonly chainKey: string;
  readonly outcome: OnchainExecutionOutcome;
  /** Opaque external transaction/operation reference. */
  readonly externalOperationRef?: string;
  /** Present when outcome CONFIRMED: a finality CANDIDATE, never finality. */
  readonly finalityCandidate?: OnchainFinalityCandidate;
  /** REQUIRED when outcome FAILED. */
  readonly failure?: OnchainFailureDescriptor;
  /** REQUIRED when outcome OUTCOME_UNKNOWN; forbidden otherwise. */
  readonly unknownReason?: string;
  /** Evidence node references (mandatory, never empty). */
  readonly evidenceRefs: readonly string[];
  readonly provenance: ObservationProvenance;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Runtime validation for an onchain execution observation. Enforces the
 * outcome couplings above, fail-closed.
 */
export function validateOnchainExecutionObservation(
  candidate: unknown,
): OnchainExecutionObservation {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('onchain execution observation must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  for (const field of ['observationId', 'executionRef', 'observedAt'] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isValidChainKey(record.chainKey)) {
    errors.push('chainKey must be a canonical chain key');
  }
  if (!isOnchainExecutionOutcome(record.outcome)) {
    errors.push(
      `outcome must be one of [${ONCHAIN_EXECUTION_OUTCOMES.join(', ')}] (UNKNOWN is a first-class outcome — it is never collapsed into failure)`,
    );
  }
  if (record.externalOperationRef !== undefined && !isNonEmptyString(record.externalOperationRef)) {
    errors.push('externalOperationRef, when present, must be a non-empty string');
  }
  const evidence = record.evidenceRefs;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    errors.push(
      'evidenceRefs is MANDATORY and non-empty: recording an external outcome requires linked evidence',
    );
  } else {
    for (const ref of evidence) {
      if (!isNonEmptyString(ref)) {
        errors.push('evidenceRefs entries must be non-empty strings');
      }
    }
  }
  const provenance = record.provenance;
  if (
    provenance === null ||
    typeof provenance !== 'object' ||
    !isNonEmptyString((provenance as Readonly<Record<string, unknown>>).providerName) ||
    !isNonEmptyString((provenance as Readonly<Record<string, unknown>>).capturedAt)
  ) {
    errors.push('provenance is MANDATORY on every execution observation');
  }

  if (isOnchainExecutionOutcome(record.outcome)) {
    switch (record.outcome) {
      case 'BROADCAST': {
        if (record.finalityCandidate !== undefined) {
          errors.push(
            'a BROADCAST outcome may not carry a finality candidate: submitted transactions are not financial finality (rule 29)',
          );
        }
        if (record.failure !== undefined) {
          errors.push('a BROADCAST outcome may not carry a failure descriptor');
        }
        if (record.unknownReason !== undefined) {
          errors.push('a BROADCAST outcome may not carry an unknownReason');
        }
        break;
      }
      case 'CONFIRMED': {
        if (record.failure !== undefined) {
          errors.push('a CONFIRMED outcome may not carry a failure descriptor');
        }
        if (record.unknownReason !== undefined) {
          errors.push('a CONFIRMED outcome may not carry an unknownReason');
        }
        const candidateFinality = record.finalityCandidate;
        if (candidateFinality !== undefined) {
          const finalityRecord = candidateFinality as Readonly<Record<string, unknown>>;
          if (finalityRecord.candidateOnly !== true) {
            errors.push(
              'finalityCandidate.candidateOnly must be true: an observer can only ever produce a candidate — finality is protocol-owned',
            );
          }
          if (finalityRecord.requiresProtocolFinality !== true) {
            errors.push('finalityCandidate.requiresProtocolFinality must be true');
          }
          if (
            finalityRecord.confirmationDepth !== undefined &&
            (typeof finalityRecord.confirmationDepth !== 'number' ||
              !Number.isInteger(finalityRecord.confirmationDepth) ||
              finalityRecord.confirmationDepth < 1)
          ) {
            errors.push(
              'finalityCandidate.confirmationDepth, when present, must be a positive integer',
            );
          }
          if (
            finalityRecord.finalityModel !== 'PROBABILISTIC' &&
            finalityRecord.finalityModel !== 'DETERMINISTIC' &&
            finalityRecord.finalityModel !== 'INSTANT' &&
            finalityRecord.finalityModel !== 'HYBRID'
          ) {
            errors.push('finalityCandidate.finalityModel must be a declared finality model');
          }
          if (typeof finalityRecord.reorgDetected !== 'boolean') {
            errors.push('finalityCandidate.reorgDetected must be a boolean');
          }
        }
        break;
      }
      case 'FAILED': {
        const failure = record.failure;
        if (failure === null || typeof failure !== 'object') {
          errors.push(
            'a FAILED outcome REQUIRES a failure descriptor (definitive failures are explained)',
          );
        } else {
          const failureRecord = failure as Readonly<Record<string, unknown>>;
          if (
            !(ONCHAIN_FAILURE_CLASSES as readonly unknown[]).includes(failureRecord.failureClass)
          ) {
            errors.push(
              `failure.failureClass must be one of [${ONCHAIN_FAILURE_CLASSES.join(', ')}] (transport ambiguity is OUTCOME_UNKNOWN, never a failure)`,
            );
          }
          if (!isNonEmptyString(failureRecord.description)) {
            errors.push('failure.description must be a non-empty string');
          }
          if (
            failureRecord.retryGuidance !== 'SAFE_TO_RETRY' &&
            failureRecord.retryGuidance !== 'REQUIRES_RECONCILIATION' &&
            failureRecord.retryGuidance !== 'NOT_RETRYABLE'
          ) {
            errors.push(
              'failure.retryGuidance must be SAFE_TO_RETRY, REQUIRES_RECONCILIATION or NOT_RETRYABLE',
            );
          }
        }
        if (record.unknownReason !== undefined) {
          errors.push('a FAILED outcome may not carry an unknownReason (it is not unknown)');
        }
        break;
      }
      case 'OUTCOME_UNKNOWN': {
        if (!isNonEmptyString(record.unknownReason)) {
          errors.push(
            'an OUTCOME_UNKNOWN observation REQUIRES an explicit unknownReason: external ambiguity is explicit, never silently defaulted',
          );
        }
        if (record.failure !== undefined) {
          errors.push(
            'an OUTCOME_UNKNOWN observation must NOT carry a failure descriptor: UNKNOWN is not FAILED',
          );
        }
        break;
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid onchain execution observation: ${errors.join('; ')}`,
      { errors: [...errors] },
    );
  }
  return candidate as OnchainExecutionObservation;
}
