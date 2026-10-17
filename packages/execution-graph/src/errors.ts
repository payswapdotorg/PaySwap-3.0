/**
 * @payswap/execution-graph — local error taxonomy (P3-W2).
 *
 * The financial protocol lane (@payswap/protocol) owns the canonical
 * PaySwapError base; this package may reference that lane TYPE-ONLY (the
 * accepted sibling pattern), so the error hierarchy here is a LOCAL
 * taxonomy carrying the same (code, category, details) discipline. Category
 * names follow the protocol kernel's vocabulary so the categories a caller
 * switches on stay consistent across lanes at integration time.
 *
 * Law mapping (canonical invariants, spec/architecture/invariants.json):
 * - INV-04 UNKNOWN-is-distinct -> category EXTERNAL_AMBIGUITY;
 * - INV-03 terminality -> category TERMINAL_STATE;
 * - INV-06 idempotency conflicts -> category CONFLICT;
 * - the NEVER-AUTHORIZES identity law -> category AUTHORIZATION_REQUIRED is
 *   only ever RAISED (an unresolvable projection is refused), never granted.
 */

/** Error categories, mirroring the protocol kernel's vocabulary. */
export type ExecutionGraphErrorCategory =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'TERMINAL_STATE'
  | 'EXTERNAL_AMBIGUITY'
  | 'AUTHORIZATION_REQUIRED'
  | 'POLICY_BLOCKED'
  | 'NOT_FOUND'
  | 'ADVISORY_DISCIPLINE';

/** Opaque, JSON-shaped error details (never secrets — INV-19 discipline). */
export interface ExecutionGraphErrorDetails {
  readonly [key: string]: unknown;
}

/** Base error of the economic execution graph. */
export class ExecutionGraphError extends Error {
  readonly code: string;
  readonly category: ExecutionGraphErrorCategory;
  readonly details: ExecutionGraphErrorDetails;

  constructor(
    code: string,
    category: ExecutionGraphErrorCategory,
    message: string,
    details?: ExecutionGraphErrorDetails,
  ) {
    super(message);
    this.name = 'ExecutionGraphError';
    this.code = code;
    this.category = category;
    this.details = details === undefined ? {} : Object.freeze({ ...details });
  }
}

/** Malformed input to any constructor or validator (fail-closed everywhere). */
export class ValidationError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('EXECUTION_GRAPH_VALIDATION', 'VALIDATION', message, details);
    this.name = 'ValidationError';
  }
}

/** A state machine event the machine never declared. */
export class UndeclaredEventError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('UNDECLARED_EVENT', 'VALIDATION', message, details);
    this.name = 'UndeclaredEventError';
  }
}

/** (from, on) with no declared rule. */
export class IllegalTransitionError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('ILLEGAL_TRANSITION', 'CONFLICT', message, details);
    this.name = 'IllegalTransitionError';
  }
}

/** INV-03 terminality: leaving a terminal state without declared recovery. */
export class TerminalStateViolationError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('TERMINAL_STATE_MONOTONIC_VIOLATION', 'TERMINAL_STATE', message, details);
    this.name = 'TerminalStateViolationError';
  }
}

/** INV-06: same idempotency scope, different command. */
export class AttemptIdempotencyConflictError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('ATTEMPT_IDEMPOTENCY_CONFLICT', 'CONFLICT', message, details);
    this.name = 'AttemptIdempotencyConflictError';
  }
}

/** INV-04: an UNKNOWN external write is never blindly retried. */
export class AttemptRetryForbiddenError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('ATTEMPT_RETRY_FORBIDDEN', 'EXTERNAL_AMBIGUITY', message, details);
    this.name = 'AttemptRetryForbiddenError';
  }
}

/** INV-03 discipline: recorded evidence is immutable (append-only). */
export class EvidenceImmutabilityError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('EVIDENCE_IMMUTABILITY_VIOLATION', 'CONFLICT', message, details);
    this.name = 'EvidenceImmutabilityError';
  }
}

/** Observation-version law: a versioned observation record is immutable. */
export class ObservationVersionError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('OBSERVATION_VERSION_VIOLATION', 'CONFLICT', message, details);
    this.name = 'ObservationVersionError';
  }
}

/**
 * The NEVER-AUTHORIZES identity law: a projection request that would have to
 * GRANT, WIDEN or FABRICATE authority is refused. This package projects and
 * reconciles protocol-owned authorization; it never issues any.
 */
export class ProjectionRejectedError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('AUTHORIZATION_PROJECTION_REJECTED', 'AUTHORIZATION_REQUIRED', message, details);
    this.name = 'ProjectionRejectedError';
  }
}

/** Attempted use of an INVALIDATED/EXPIRED authorization projection. */
export class ProjectionNotCurrentError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('AUTHORIZATION_PROJECTION_NOT_CURRENT', 'AUTHORIZATION_REQUIRED', message, details);
    this.name = 'ProjectionNotCurrentError';
  }
}

/** A strategy/Director artifact attempted to act as an authority (INV-09). */
export class AdvisoryDisciplineError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('ADVISORY_DISCIPLINE_VIOLATION', 'ADVISORY_DISCIPLINE', message, details);
    this.name = 'AdvisoryDisciplineError';
  }
}

/** Simulation namespace discipline (INV-11: simulation is never production). */
export class SimulationDisciplineError extends ExecutionGraphError {
  constructor(message: string, details?: ExecutionGraphErrorDetails) {
    super('SIMULATION_DISCIPLINE_VIOLATION', 'ADVISORY_DISCIPLINE', message, details);
    this.name = 'SimulationDisciplineError';
  }
}
