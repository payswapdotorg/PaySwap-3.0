/**
 * @payswap/onchain-extensions — error taxonomy (Work Order P5-W2, lane
 * R3-W2; ADAPT of the accepted onchain-adapters/errors.ts pattern).
 *
 * Zero-runtime-dependency package (layer `rails`, leaf-in-flight law): the
 * error surface is self-contained and deliberately mirrors the accepted
 * PaySwapError shape (code + category + message + details) WITHOUT importing
 * @payswap/protocol — the TL wires the type at integration (structural
 * compatibility by construction, the provider-runtime pattern).
 *
 * Every error is a fail-closed signal: pack validation never approximates a
 * missing declaration and never converts ambiguity into acceptance.
 */

export type ErrorCategory =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'AUTHORIZATION_REQUIRED'
  | 'TERMINAL_STATE'
  | 'INTERNAL';

/** Readonly bag of structured error context. Values stay JSON-ish. */
export interface OnchainExtensionErrorDetails {
  readonly [key: string]: unknown;
}

export interface OnchainExtensionErrorInit {
  /** Stable machine-readable error code, e.g. `PACK_VALIDATION_FAILED`. */
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly details?: OnchainExtensionErrorDetails;
}

/** Base class of every onchain-extensions error (PaySwapError-shaped). */
export class OnchainExtensionError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  /**
   * Absent entirely when no details were supplied (never a defined
   * `undefined`) — `declare` keeps this a type-only declaration so class
   * field semantics cannot pre-define the property.
   */
  declare readonly details?: OnchainExtensionErrorDetails;

  constructor(init: OnchainExtensionErrorInit) {
    super(init.message);
    this.name = new.target.name;
    this.code = init.code;
    this.category = init.category;
    if (init.details !== undefined) {
      this.details = init.details;
    }
  }
}

/** The structured validation-failure bag (the accepted accumulate law). */
export interface ValidationErrorDetails extends OnchainExtensionErrorDetails {
  /** Every accumulated failure, in discovery order (deterministic). */
  readonly errors: readonly string[];
}

/**
 * Malformed input to a pack contract (fail-closed validation). Carries the
 * full accumulated error list so a rejected pack reports EVERY defect, not
 * just the first.
 */
export class ValidationError extends OnchainExtensionError {
  readonly validationErrors: readonly string[];

  constructor(message: string, details?: ValidationErrorDetails) {
    super({
      code: 'ONCHAIN_EXTENSION_VALIDATION',
      category: 'VALIDATION',
      message,
      ...(details !== undefined ? { details } : {}),
    });
    this.validationErrors = details?.errors ?? [];
  }
}

/**
 * A registry conflict: a pack id already registered, a duplicate sub-pack in
 * a composition tree, or a composition that violates the family-compatibility
 * law. The registry state is NEVER mutated by a rejected registration
 * (checks run before insertion).
 */
export class PackConflictError extends OnchainExtensionError {
  constructor(message: string, details?: OnchainExtensionErrorDetails) {
    super({
      code: 'PACK_CONFLICT',
      category: 'CONFLICT',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

/**
 * A fail-closed lookup: an unknown pack id was required. The registry never
 * fabricates a pack and never falls back to a "closest" match.
 */
export class PackNotFoundError extends OnchainExtensionError {
  constructor(message: string, details?: OnchainExtensionErrorDetails) {
    super({
      code: 'PACK_NOT_FOUND',
      category: 'NOT_FOUND',
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}
