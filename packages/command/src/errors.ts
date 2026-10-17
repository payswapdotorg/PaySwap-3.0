/**
 * @payswap/command — the command-surface error taxonomy (P7-W3).
 *
 * Every error raised by this package is a `CommandError` carrying a stable
 * machine `code`, a semantic `category` and free-form `details`. The
 * taxonomy adapts the old repository's two error vocabularies (the
 * @payswap/protocol domain categories and the @payswap/interfaces REST
 * categories) into ONE command-surface vocabulary with net-new
 * `UNSUPPORTED_VERSION` for the explicit-versioning law.
 *
 * TOTAL-ERROR LAW (developer/external-agent APIs are contracts: versioned,
 * deterministic, total-error — fail-closed): every failure surfaces as a
 * typed error with a category; nothing fails silently and nothing succeeds
 * speculatively.
 *
 * INV-4 discipline is enforced here: `EXTERNAL_AMBIGUITY` is an ambiguity,
 * NOT a failure outcome — `isFailureOutcome` returns `false` for it. Every
 * `ExternalAmbiguityError` carries `requiresReconciliation: true`; callers
 * must reconcile, never blindly retry and never coerce UNKNOWN into FAILED
 * or success.
 *
 * Canonical invariant citations: INV-4 (UNKNOWN is not FAILED), INV-9
 * (agents/LLMs cannot declare financial truth), INV-23 (UI never owns
 * financial truth), INV-6 (idempotent state-changing commands), INV-19
 * (secrets never enter artifacts).
 */

export type CommandErrorCategory =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'AUTHORIZATION_REQUIRED'
  | 'POLICY_BLOCKED'
  | 'EXTERNAL_AMBIGUITY'
  | 'TERMINAL_STATE'
  | 'UNSUPPORTED_VERSION'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** Readonly bag of structured error context. Values must stay JSON-ish. */
export interface CommandErrorDetails {
  readonly [key: string]: unknown;
}

/**
 * Initialization bag for `CommandError`. `details` accepts `undefined`
 * explicitly so subclass constructors may forward optional details without
 * violating `exactOptionalPropertyTypes`; the constructed error omits the
 * property entirely when no details were supplied.
 */
export interface CommandErrorInit {
  /** Stable machine-readable error code, e.g. `FINANCIAL_AUTHORITY_ON_COMMAND_SURFACE`. */
  readonly code: string;
  readonly category: CommandErrorCategory;
  readonly message: string;
  readonly details?: CommandErrorDetails | undefined;
}

/** Base class of every command-surface error. */
export class CommandError extends Error {
  readonly code: string;
  readonly category: CommandErrorCategory;
  /**
   * Absent entirely when no details were supplied (never a defined
   * `undefined`) — `declare` keeps this a type-only declaration so class
   * field semantics cannot pre-define the property.
   */
  declare readonly details?: CommandErrorDetails;

  constructor(init: CommandErrorInit) {
    super(init.message);
    this.name = new.target.name;
    this.code = init.code;
    this.category = init.category;
    if (init.details !== undefined) {
      this.details = init.details;
    }
    // Keeps `instanceof` correct when downleveled; a no-op on native classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * INV-4 discipline: EXTERNAL_AMBIGUITY is an ambiguity, not a failure
 * outcome. Everything else that surfaces as an error is a failure outcome
 * for the caller's current attempt.
 */
export function isFailureOutcome(error: CommandError): boolean {
  return error.category !== 'EXTERNAL_AMBIGUITY';
}

/** Generic input/argument validation failure (bad shape, bad range, bad format). */
export class ValidationError extends CommandError {
  constructor(message: string, details?: CommandErrorDetails) {
    super({ code: 'VALIDATION_FAILED', category: 'VALIDATION', message, details });
  }
}

/**
 * The explicit-versioning law (no implicit/unversioned default): a request
 * pinned to an API version the surface does not accept fails closed.
 */
export class UnsupportedVersionError extends CommandError {
  constructor(message: string, details?: CommandErrorDetails) {
    super({
      code: 'UNSUPPORTED_API_VERSION',
      category: 'UNSUPPORTED_VERSION',
      message,
      details,
    });
  }
}

/**
 * THE AUTHORITY-FIREWALL LAW (the headline law of this package): the
 * command surface NEVER carries financial authorization. Commands are
 * proposals/inputs — proposal inputs + observations, never financial
 * authority. Raised structurally whenever authority-bearing material
 * (secrets, signatures, mandates, authorization artifacts) attempts to ride
 * a proposal payload, an extension message, an agent message or any other
 * command-surface shape.
 */
export class FinancialAuthorityError extends CommandError {
  constructor(message: string, details?: CommandErrorDetails) {
    super({
      code: 'FINANCIAL_AUTHORITY_ON_COMMAND_SURFACE',
      category: 'POLICY_BLOCKED',
      message,
      details,
    });
  }
}

/**
 * The Extension boundary law: the extension API surface is typed, versioned
 * and permission-scoped with NO ambient authority. Raised when an extension
 * request crosses the boundary without a declared permission, without a
 * pinned version, or against an unbound host origin.
 */
export class ExtensionBoundaryError extends CommandError {
  constructor(message: string, details?: CommandErrorDetails) {
    super({
      code: 'EXTENSION_BOUNDARY_VIOLATION',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      details,
    });
  }
}

/**
 * A permission-scoped method was requested without the required permission
 * (fail closed — the extension/agent/developer surfaces never fall back to
 * ambient authority).
 */
export class PermissionDeniedError extends CommandError {
  constructor(message: string, details?: CommandErrorDetails) {
    super({
      code: 'PERMISSION_NOT_GRANTED',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      details,
    });
  }
}

/** A method name absent from the (deterministic) method registry. */
export class MethodNotFoundError extends CommandError {
  constructor(message: string, details?: CommandErrorDetails) {
    super({ code: 'METHOD_NOT_FOUND', category: 'NOT_FOUND', message, details });
  }
}

/**
 * External ambiguity — the authoritative outcome of an external effect
 * could not be determined (INV-4). NOT a failure outcome: reconciliation
 * owns the resolution; blind retries are forbidden.
 */
export class ExternalAmbiguityError extends CommandError {
  /** INV-4: ambiguity is resolved by reconciliation, never by coercion. */
  readonly requiresReconciliation: true = true;

  constructor(message: string, details?: CommandErrorDetails) {
    super({
      code: 'EXTERNAL_AMBIGUITY',
      category: 'EXTERNAL_AMBIGUITY',
      message,
      details,
    });
  }
}
