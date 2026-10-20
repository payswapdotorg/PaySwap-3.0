/**
 * @payswap/opportunities — the typed error taxonomy (P6-W2, lane r4-w2).
 *
 * The old package extended @payswap/protocol's ValidationError; under the
 * zero-sibling law the base is re-declared LOCALLY with the same
 * discipline. Every constructor path fails closed with one of these
 * types — there is no silent-repair path anywhere.
 */

/** The base fail-closed error; `errors`, when present, lists EVERY failed field. */
export class ValidationError extends Error {
  readonly errors?: readonly string[];

  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message);
    this.name = "ValidationError";
    if (options !== undefined) {
      this.errors = Object.freeze([...options.errors]);
    }
  }
}

/** Raised when a surface carries guarantee vocabulary. */
export class GuaranteeLanguageError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "GuaranteeLanguageError";
  }
}

/** Raised when a tiered artifact is fed to an execution gate (ALWAYS throws). */
export class DiscoveryExecutionRejectedError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryExecutionRejectedError";
  }
}

/** Raised when discovery input is malformed. */
export class OpportunityDiscoveryError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "OpportunityDiscoveryError";
  }
}

/** Raised when an opportunity record fails model validation. */
export class InvalidOpportunityError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "InvalidOpportunityError";
  }
}

/** Raised when the proposal seam is misused (command shape or execution input). */
export class ProposalSeamError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "ProposalSeamError";
  }
}

/** Raised when a value carries credential-shaped material. */
export class SecretMaterialError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "SecretMaterialError";
  }
}

/** Raised when a Knowable value is malformed. */
export class InvalidKnowableError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKnowableError";
  }
}

/** Raised when rational/freshness evidence is malformed. */
export class InvalidEvidenceError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEvidenceError";
  }
}
