/**
 * @payswap/execution-graph — branded identifiers (P3-W2).
 *
 * Identifiers are branded strings: structurally strings at runtime, distinct
 * at the type level so an ExecutionAttemptId can never be passed where a
 * ReconciliationCaseId is expected (the protocol kernel's identifier
 * discipline, re-declared locally because sibling imports here are
 * TYPE-ONLY).
 *
 * `PrincipalRef` and `TimestampMs` are PINNED type-only from
 * @payswap/protocol (the wire authority): the shapes must stay structurally
 * identical, and the re-export makes the pin explicit at the boundary.
 */

import { ValidationError } from './errors.ts';
import type { PrincipalRef, TimestampMs } from '@payswap/protocol';

/** Re-exported wire pins (type-only — the protocol lane owns the semantics). */
export type { PrincipalRef, TimestampMs };

/** Structural validation of a PrincipalRef (never invents principals). */
export function requirePrincipalRef(value: PrincipalRef, field: string): PrincipalRef {
  if (value === null || typeof value !== 'object') {
    throw new ValidationError(`${field} must be a PrincipalRef object`);
  }
  if (
    typeof value.principalType !== 'string' ||
    value.principalType.length === 0 ||
    typeof value.principalId !== 'string' ||
    value.principalId.length === 0
  ) {
    throw new ValidationError(
      `${field} must carry a non-empty principalType and principalId`,
    );
  }
  return Object.freeze({ principalType: value.principalType, principalId: value.principalId });
}

/** Structural equality of two principal refs (deterministic, exact). */
export function samePrincipal(left: PrincipalRef, right: PrincipalRef): boolean {
  return left.principalType === right.principalType && left.principalId === right.principalId;
}

const ID_MAX_LENGTH = 256;

declare const ExecutionAttemptIdBrand: unique symbol;
declare const ExecutionPlanIdBrand: unique symbol;
declare const ExecutionOfferIdBrand: unique symbol;
declare const AuthorizationProjectionIdBrand: unique symbol;
declare const ReconciliationCaseIdBrand: unique symbol;
declare const ExecutionEvidenceIdBrand: unique symbol;

/** Branded id of one execution attempt. */
export type ExecutionAttemptId = string & {
  readonly [ExecutionAttemptIdBrand]: 'ExecutionAttemptId';
};
/** Branded id of one execution plan. */
export type ExecutionPlanId = string & {
  readonly [ExecutionPlanIdBrand]: 'ExecutionPlanId';
};
/** Branded id of one execution offer. */
export type ExecutionOfferId = string & {
  readonly [ExecutionOfferIdBrand]: 'ExecutionOfferId';
};
/** Branded id of one authorization PROJECTION record. */
export type AuthorizationProjectionId = string & {
  readonly [AuthorizationProjectionIdBrand]: 'AuthorizationProjectionId';
};
/** Branded id of one reconciliation case. */
export type ReconciliationCaseId = string & {
  readonly [ReconciliationCaseIdBrand]: 'ReconciliationCaseId';
};
/** Branded id of one recorded execution-evidence node. */
export type ExecutionEvidenceId = string & {
  readonly [ExecutionEvidenceIdBrand]: 'ExecutionEvidenceId';
};

function brand<TBranded extends string>(value: string, kind: string): TBranded {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${kind} must be a non-empty string`);
  }
  if (value.length > ID_MAX_LENGTH) {
    throw new ValidationError(`${kind} exceeds ${ID_MAX_LENGTH} characters`);
  }
  if (value.trim() !== value) {
    throw new ValidationError(`${kind} must not carry surrounding whitespace`);
  }
  return value as TBranded;
}

/** Brand a validated string as an ExecutionAttemptId. */
export function asExecutionAttemptId(value: string): ExecutionAttemptId {
  return brand<ExecutionAttemptId>(value, 'ExecutionAttemptId');
}

/** Brand a validated string as an ExecutionPlanId. */
export function asExecutionPlanId(value: string): ExecutionPlanId {
  return brand<ExecutionPlanId>(value, 'ExecutionPlanId');
}

/** Brand a validated string as an ExecutionOfferId. */
export function asExecutionOfferId(value: string): ExecutionOfferId {
  return brand<ExecutionOfferId>(value, 'ExecutionOfferId');
}

/** Brand a validated string as an AuthorizationProjectionId. */
export function asAuthorizationProjectionId(value: string): AuthorizationProjectionId {
  return brand<AuthorizationProjectionId>(value, 'AuthorizationProjectionId');
}

/** Brand a validated string as a ReconciliationCaseId. */
export function asReconciliationCaseId(value: string): ReconciliationCaseId {
  return brand<ReconciliationCaseId>(value, 'ReconciliationCaseId');
}

/** Brand a validated string as an ExecutionEvidenceId. */
export function asExecutionEvidenceId(value: string): ExecutionEvidenceId {
  return brand<ExecutionEvidenceId>(value, 'ExecutionEvidenceId');
}

/** Generic non-empty bounded reference check (opaque lineage refs). */
export function requireRef(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty reference string`);
  }
  if (value.length > ID_MAX_LENGTH) {
    throw new ValidationError(`${field} exceeds ${ID_MAX_LENGTH} characters`);
  }
  return value;
}

/** Generic non-empty bounded string check (prose/description fields). */
export function requireBoundedString(value: string, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(`${field} exceeds ${maxLength} characters`);
  }
  return value;
}
