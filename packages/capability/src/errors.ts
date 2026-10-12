/**
 * @payswap/capability — domain error taxonomy (P2-W1).
 *
 * The capability fabric is the Capability and Network Authority's contract
 * package (spec/architecture/AUTHORITY-MODEL.md): it owns capability
 * definitions/certification and connection state — NOT account-level
 * authorization, NOT financial truth. Every error raised here is a
 * `CapabilityError` carrying a stable machine `code`, a semantic `category`
 * and free-form `details`.
 *
 * Canonical invariant numbering note (honest adaptation): the old
 * repository's INV-C01..INV-C08 / INV-SC* / INV-X01 scheme does NOT transfer
 * (see spec/architecture/invariants.json). This package cites the CANONICAL
 * ids: INV-7 (external balances are observations), INV-13 (catalogue is not
 * executable connected capability), INV-14 (provider state preserved),
 * INV-15 (provider-native baseline), INV-16 (no provider leakage into
 * neutral contracts), INV-4 (UNKNOWN is not FAILED).
 */

export type CapabilityErrorCategory =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'AUTHORIZATION_REQUIRED'
  | 'EXTERNAL_AMBIGUITY'
  | 'TERMINAL_STATE'
  | 'INTERNAL';

/** Readonly bag of structured error context. Values must stay JSON-ish. */
export interface CapabilityErrorDetails {
  readonly [key: string]: unknown;
}

/**
 * Initialization bag for `CapabilityError`. `details` accepts `undefined`
 * explicitly so subclass constructors may forward optional details without
 * violating `exactOptionalPropertyTypes`; the constructed error omits the
 * property entirely when no details were supplied.
 */
export interface CapabilityErrorInit {
  /** Stable machine-readable error code, e.g. `CATALOGUE_NOT_AUTHORITY`. */
  readonly code: string;
  readonly category: CapabilityErrorCategory;
  readonly message: string;
  readonly details?: CapabilityErrorDetails | undefined;
}

/** Base class of every capability-fabric error. */
export class CapabilityError extends Error {
  readonly code: string;
  readonly category: CapabilityErrorCategory;
  /**
   * Absent entirely when no details were supplied (never a defined
   * `undefined`) — `declare` keeps this a type-only declaration so class
   * field semantics cannot pre-define the property.
   */
  declare readonly details?: CapabilityErrorDetails;

  constructor(init: CapabilityErrorInit) {
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

/** Generic input/argument validation failure (bad shape, bad range, bad format). */
export class ValidationError extends CapabilityError {
  constructor(message: string, details?: CapabilityErrorDetails) {
    super({ code: 'VALIDATION_FAILED', category: 'VALIDATION', message, details });
  }
}

/**
 * A provider catalogue entry was presented where a genuinely connected
 * capability instance is required (INV-13): catalogue data NEVER authorizes
 * an effect. Structural separation alone is not enough — the rejection is
 * explicit, typed and carries the offending catalogue entry.
 */
export class CatalogueNotAuthorityError extends CapabilityError {
  constructor(message: string, details?: CapabilityErrorDetails) {
    super({
      code: 'CATALOGUE_NOT_AUTHORITY',
      category: 'AUTHORIZATION_REQUIRED',
      message,
      details,
    });
  }
}

/**
 * An observation was rejected or could not be established (INV-4 family):
 * ambiguity about external state is preserved as ambiguity, never coerced
 * into success or failure. Distinct from a plain validation error so
 * consumers must reconcile rather than blindly retry.
 */
export class ObservationAmbiguityError extends CapabilityError {
  constructor(message: string, details?: CapabilityErrorDetails) {
    super({
      code: 'OBSERVATION_AMBIGUOUS',
      category: 'EXTERNAL_AMBIGUITY',
      message,
      details,
    });
  }
}

/**
 * A certification-history violation (duplicate record id, retiring an
 * unknown subject, certifying without required evidence or risk profile).
 */
export class CertificationError extends CapabilityError {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super({
      code: 'CERTIFICATION_INVALID',
      category: 'CONFLICT',
      message: `Invalid certification: ${errors.join('; ')}`,
      details: { errors: [...errors] },
    });
    this.errors = errors;
  }
}

/**
 * An execution-mode violation: an executable capability or execution
 * request without an explicit declared mode. The mode is never inferred.
 */
export class ImplicitExecutionModeError extends CapabilityError {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super({
      code: 'EXECUTION_MODE_NOT_DECLARED',
      category: 'VALIDATION',
      message: `Execution request is not valid: ${violations.join('; ')}`,
      details: { violations: [...violations] },
    });
    this.violations = violations;
  }
}
