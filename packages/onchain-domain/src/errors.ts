/**
 * @payswap/onchain-domain — domain error taxonomy (P4-W1, lane R2-W1).
 *
 * The onchain domain is a rails-layer contract package (MODULE-OWNERSHIP:
 * layer rails, owner network). It owns the onchain vocabulary — NOT
 * account-level authorization, NOT financial truth, NOT certification.
 * Every error raised here is an `OnchainDomainError` carrying a stable
 * machine `code`, a semantic `category` and free-form `details` — the same
 * structural discipline as the authority lanes' taxonomies
 * (@payswap/protocol PaySwapError, @payswap/capability CapabilityError),
 * re-declared locally because this package is v1 hermetic (zero sibling
 * imports). Callers may match errors structurally (code/category) without a
 * shared base class.
 *
 * Canonical invariant citations: INV-13 (catalogue is not executable
 * connected capability), INV-4 (UNKNOWN is not FAILED — ambiguity is never
 * coerced), INV-2 (exact money), INV-20 (generic writes never execute
 * silently).
 */

/** Semantic error categories (aligned with the authority-lane taxonomies). */
export type OnchainDomainErrorCategory =
  | "VALIDATION"
  | "CONFLICT"
  | "NOT_FOUND"
  | "AUTHORIZATION_REQUIRED"
  | "EXTERNAL_AMBIGUITY"
  | "TERMINAL_STATE"
  | "INTERNAL";

/** Readonly bag of structured error context. Values must stay JSON-ish. */
export interface OnchainDomainErrorDetails {
  readonly [key: string]: unknown;
}

/**
 * Initialization bag for `OnchainDomainError`. `details` accepts `undefined`
 * explicitly so subclass constructors may forward optional details without
 * violating `exactOptionalPropertyTypes`; the constructed error omits the
 * property entirely when no details were supplied.
 */
export interface OnchainDomainErrorInit {
  /** Stable machine-readable error code, e.g. `CATALOGUE_NOT_AUTHORITY`. */
  readonly code: string;
  readonly category: OnchainDomainErrorCategory;
  readonly message: string;
  readonly details?: OnchainDomainErrorDetails | undefined;
}

/** Base class of every onchain-domain error. */
export class OnchainDomainError extends Error {
  readonly code: string;
  readonly category: OnchainDomainErrorCategory;
  /**
   * Absent entirely when no details were supplied (never a defined
   * `undefined`) — `declare` keeps this a type-only declaration so class
   * field semantics cannot pre-define the property.
   */
  declare readonly details?: OnchainDomainErrorDetails;

  constructor(init: OnchainDomainErrorInit) {
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
 * Generic input/argument validation failure (bad shape, bad range, bad
 * format). The onchain vocabulary is fail-closed: an undeclared family, a
 * floating-point amount, a malformed chain key or an inconsistent finality
 * declaration is always a ValidationError, never a silent default.
 */
export class ValidationError extends OnchainDomainError {
  constructor(message: string, details?: OnchainDomainErrorDetails) {
    super({ code: "VALIDATION_FAILED", category: "VALIDATION", message, details });
  }
}

/**
 * A catalogue shape was presented where a genuinely connected capability
 * instance is required (INV-13): catalogue data NEVER authorizes an effect.
 * Covers both catalogue families this domain rejects at the execution
 * boundary — onchain catalogue entries (chain definitions/descriptors) and
 * provider catalogue advertisements (the capability fabric's
 * ProviderCatalogueEntry shape, structurally pinned in src/pins.ts).
 */
export class CatalogueNotAuthorityError extends OnchainDomainError {
  constructor(message: string, details?: OnchainDomainErrorDetails) {
    super({
      code: "CATALOGUE_NOT_AUTHORITY",
      category: "AUTHORIZATION_REQUIRED",
      message,
      details,
    });
  }
}
