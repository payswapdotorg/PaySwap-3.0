/**
 * @payswap/provider-runtime — domain error taxonomy (P2-W2).
 *
 * Zero-runtime-dependency package (leaf in flight): the error surface is
 * self-contained and deliberately mirrors the P1 lanes' PaySwapError shape
 * (code + category + details) WITHOUT importing @payswap/protocol — the TL
 * wires the type at integration (structural compatibility by construction).
 *
 * INV-04 enforcement lives here: `AmbiguousOutcomeError` is an AMBIGUITY,
 * not a failure — `isFailureOutcome` returns false for it and every
 * instance carries `requiresReconciliation: true`. It can never be coerced
 * into FAILED; only reconciliation with fresh provider evidence resolves it
 * (the definitive resolver is the P1-W2 protocol lane; this runtime only
 * SUPPLIES the retrieval).
 */

export type ErrorCategory =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'AUTHORIZATION_REQUIRED'
  | 'POLICY_BLOCKED'
  | 'EXTERNAL_AMBIGUITY'
  | 'TERMINAL_STATE'
  | 'INTERNAL';

/** Readonly bag of structured error context. Values must stay JSON-ish. */
export interface ProviderRuntimeErrorDetails {
  readonly [key: string]: unknown;
}

export interface ProviderRuntimeErrorInit {
  /** Stable machine-readable error code, e.g. `IDEMPOTENCY_KEY_CONFLICT`. */
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly details?: ProviderRuntimeErrorDetails | undefined;
}

/** Base class of every provider-runtime error. */
export class ProviderRuntimeError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  /**
   * Absent entirely when no details were supplied (never a defined
   * `undefined`) — `declare` keeps this a type-only declaration so class
   * field semantics cannot pre-define the property.
   */
  declare readonly details?: ProviderRuntimeErrorDetails;

  constructor(init: ProviderRuntimeErrorInit) {
    super(init.message);
    this.name = new.target.name;
    this.code = init.code;
    this.category = init.category;
    if (init.details !== undefined) {
      this.details = init.details;
    }
  }
}

/** Malformed input to a runtime contract (fail-closed validation). */
export class ValidationError extends ProviderRuntimeError {
  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({ code: 'PROVIDER_RUNTIME_VALIDATION', category: 'VALIDATION', message, details });
  }
}

/**
 * A connection scope / lifecycle refused an operation (INV-19-adjacent:
 * the connection is not allowed to do this; fail-closed BEFORE dispatch).
 */
export class ConnectionScopeViolationError extends ProviderRuntimeError {
  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({
      code: 'CONNECTION_SCOPE_VIOLATION',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      details,
    });
  }
}

/**
 * The credential/browser isolation boundary was violated: secret material
 * attempted to cross into a callback result, artifact, log line or model
 * context (INV-19). This is a hard boundary failure, never silently
 * sanitized away.
 */
export class CredentialIsolationViolationError extends ProviderRuntimeError {
  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({
      code: 'CREDENTIAL_ISOLATION_VIOLATION',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      details,
    });
  }
}

/**
 * Same idempotency key submitted with a different command body (INV-06):
 * an error state, never a silent success and never a re-execution.
 */
export class IdempotencyKeyConflictError extends ProviderRuntimeError {
  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      category: 'CONFLICT',
      message,
      details,
    });
  }
}

/**
 * A consequential command was retried while its prior attempt is an
 * unresolved UNKNOWN, without post-ambiguity provider retrieval evidence
 * (INV-04: reconcile BEFORE any consequential retry). The runtime supplies
 * the retrieval; the definitive resolution belongs to the protocol lane.
 */
export class ReconciliationRequiredBeforeRetryError extends ProviderRuntimeError {
  readonly requiresReconciliation = true;

  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({
      code: 'RECONCILIATION_REQUIRED_BEFORE_RETRY',
      category: 'EXTERNAL_AMBIGUITY',
      message,
      details,
    });
  }
}

/**
 * An ambiguous external-effect outcome (INV-04). NOT a failure outcome:
 * `isFailureOutcome` returns false. The external command may or may not
 * have taken effect; it MUST be reconciled before consequential retry.
 */
export class AmbiguousOutcomeError extends ProviderRuntimeError {
  readonly requiresReconciliation = true;

  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({
      code: 'AMBIGUOUS_EXTERNAL_OUTCOME',
      category: 'EXTERNAL_AMBIGUITY',
      message,
      details,
    });
  }
}

/**
 * A sandbox execution path was used where live behavior is claimed
 * (INV-25: sandbox is mechanically distinct and can never be represented
 * as proof of live behavior; live certification is P8).
 */
export class SandboxLiveBoundaryError extends ProviderRuntimeError {
  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({
      code: 'SANDBOX_LIVE_BOUNDARY_VIOLATION',
      category: 'POLICY_BLOCKED',
      message,
      details,
    });
  }
}

/**
 * Canonical raw-state history would be rewritten: a divergent re-record of
 * the same (provider, object, revision) arrived (INV-03/INV-14: history is
 * append-only; identical replays are idempotent, differences are refused).
 */
export class RawStateConflictError extends ProviderRuntimeError {
  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({
      code: 'RAW_STATE_REVISION_CONFLICT',
      category: 'CONFLICT',
      message,
      details,
    });
  }
}

/** Terminal lifecycle state violated (a disconnected connection cannot act). */
export class TerminalConnectionError extends ProviderRuntimeError {
  constructor(message: string, details?: ProviderRuntimeErrorDetails) {
    super({ code: 'TERMINAL_CONNECTION_STATE', category: 'TERMINAL_STATE', message, details });
  }
}

/** True only for genuine failure outcomes — NEVER for ambiguity (INV-04). */
export function isFailureOutcome(error: unknown): boolean {
  return (
    error instanceof ProviderRuntimeError &&
    error.category !== 'EXTERNAL_AMBIGUITY'
  );
}

/** True only for outcomes/conditions that demand reconciliation (INV-04). */
export function requiresReconciliation(error: unknown): boolean {
  return (
    error instanceof AmbiguousOutcomeError ||
    error instanceof ReconciliationRequiredBeforeRetryError ||
    (error instanceof ProviderRuntimeError && error.category === 'EXTERNAL_AMBIGUITY')
  );
}
