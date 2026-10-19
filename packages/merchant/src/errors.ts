/**
 * @payswap/merchant — the local error taxonomy (P5-W3, lane R3-W3).
 *
 * Every failure mode of the merchant surface is a TYPED error carrying
 * a machine `code`, a `category` and structured `details`. The taxonomy
 * is LOCAL (zero sibling imports — the leaf-in-flight law): the
 * protocol lane's error taxonomy is pinned structurally
 * (pins/protocol.ts documents the authority); this package's classes
 * mirror the same shape law (code + category + message + details)
 * without importing it.
 *
 * Categories (pinned vocabulary):
 * - VALIDATION           — malformed/incoherent input (fail-closed);
 * - CONFLICT             — idempotency/state conflicts;
 * - EXTERNAL_AMBIGUITY   — UNKNOWN external effects (INV-4: reconciled,
 *                          never blindly retried);
 * - SECURITY             — secret-boundary and port-guard violations;
 * - STATE                — illegal work-item state transitions.
 */

/** The pinned error-category vocabulary. */
export const ERROR_CATEGORIES = Object.freeze([
  "VALIDATION",
  "CONFLICT",
  "EXTERNAL_AMBIGUITY",
  "SECURITY",
  "STATE",
] as const);

/** One error category. */
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** Structured details attached to a typed error (JSON-safe values only). */
export type ErrorDetails = Readonly<Record<string, unknown>>;

/** The shared shape of every error this package raises. */
export interface MerchantErrorShape {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly details?: ErrorDetails | undefined;
}

/** The base class of every typed error of @payswap/merchant. */
export class MerchantError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly details?: ErrorDetails;

  constructor(shape: MerchantErrorShape) {
    super(shape.message);
    this.name = new.target.name;
    this.code = shape.code;
    this.category = shape.category;
    if (shape.details !== undefined) {
      this.details = shape.details;
    }
  }
}

/** Malformed or incoherent input (fail-closed; never a silent default). */
export class ValidationError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "MERCHANT_VALIDATION", category: "VALIDATION", message, details });
  }
}

/** A branded id failed its pinned shape law. */
export class InvalidIdentifierError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "MERCHANT_INVALID_IDENTIFIER", category: "VALIDATION", message, details });
  }
}

/** Exact crypto amount arithmetic is structurally impossible (INV-2). */
export class InvalidCryptoAmountError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "INVALID_CRYPTO_AMOUNT", category: "VALIDATION", message, details });
  }
}

/** A quote violates the exactness or expiry contract (INV-2). */
export class InvalidCryptoQuoteError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "INVALID_CRYPTO_QUOTE", category: "VALIDATION", message, details });
  }
}

/** A crypto acceptance policy/activation is structurally invalid. */
export class InvalidCryptoAcceptanceError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "INVALID_CRYPTO_ACCEPTANCE", category: "VALIDATION", message, details });
  }
}

/** A value mixes fields of the two settlement route families. */
export class RouteFamilyConflationError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "ROUTE_FAMILY_CONFLATION", category: "VALIDATION", message, details });
  }
}

/** A value mixes fields of the two settlement mode configurations. */
export class SettlementModeConflationError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "SETTLEMENT_MODE_CONFLATION", category: "VALIDATION", message, details });
  }
}

/**
 * A Stripe balance effect would be recorded WITHOUT provider evidence —
 * a synthetic balance effect (the honest-unavailability law: Stripe
 * balance effects are provider-verified or UNKNOWN, never synthesized).
 */
export class SyntheticStripeBalanceError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "SYNTHETIC_STRIPE_BALANCE", category: "VALIDATION", message, details });
  }
}

/**
 * Secret-shaped material crossed the agent-facing boundary (INV-19:
 * raw keys, mnemonics, provider secrets and Stripe key shapes never
 * enter artifacts). The scan makes a secret-bearing artifact
 * UNCONSTRUCTIBLE.
 */
export class SecretShapeError extends MerchantError {
  readonly violations: readonly SecretViolation[];

  constructor(label: string, violations: readonly SecretViolation[]) {
    super({
      code: "SECRET_SHAPE",
      category: "SECURITY",
      message:
        `${label}: secret-shaped material rejected at the agent-facing boundary ` +
        `(${violations.length} violation(s)): ` +
        violations.map((v) => `${v.path} [${v.kind}] ${v.reason}`).join("; "),
      details: { violations: violations.map((v) => ({ path: v.path, kind: v.kind })) },
    });
    this.violations = violations;
  }
}

/** One runtime violation found by the secret-boundary scan. */
export interface SecretViolation {
  /** Dotted path to the offending field inside the scanned value. */
  readonly path: string;
  readonly kind: "forbidden_key" | "secret_shaped_value";
  readonly key?: string;
  readonly reason: string;
}

/** A work-item machine transition is not declared from this state. */
export class MachineTransitionError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "MACHINE_TRANSITION", category: "STATE", message, details });
  }
}

/** A machine guard rejected the transition (deterministic fail-closed). */
export class MachineGuardError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "MACHINE_GUARD", category: "STATE", message, details });
  }
}

/** A definitive (or ambiguity-reporting) outcome lacks linked evidence. */
export class EvidenceRequiredError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "EVIDENCE_REQUIRED", category: "VALIDATION", message, details });
  }
}

/** An onboarding artifact would imply rail connectivity (the §3.1 law). */
export class ConnectivityImpliedError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "ONBOARDING_CONNECTIVITY_IMPLIED", category: "VALIDATION", message, details });
  }
}

/** The injected wallet-payment port violates the handoff-only port law. */
export class PortShapeError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "WALLET_PAYMENT_PORT_SHAPE", category: "SECURITY", message, details });
  }
}

/** A settlement-instruction reference failed the pinned shape law. */
export class SettlementInstructionRefError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "SETTLEMENT_INSTRUCTION_REF", category: "VALIDATION", message, details });
  }
}

/** A webhook event envelope or payload failed its typed shape law. */
export class WebhookShapeError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "WEBHOOK_SHAPE", category: "VALIDATION", message, details });
  }
}

/** A provider-state envelope failed its pinned shape law (INV-14). */
export class EnvelopeShapeError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "ENVELOPE_SHAPE", category: "VALIDATION", message, details });
  }
}

/** A Stripe request descriptor failed the pinned no-network surface law. */
export class StripeSurfaceError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "STRIPE_SURFACE", category: "VALIDATION", message, details });
  }
}

/** Canonical serialization cannot represent a value (the digest law). */
export class CanonicalizationError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "CANONICALIZATION", category: "VALIDATION", message, details });
  }
}

/** An ambiguous external outcome cannot be blindly retried (INV-4). */
export class AmbiguityRetryForbiddenError extends MerchantError {
  constructor(message: string, details?: ErrorDetails) {
    super({ code: "AMBIGUITY_RETRY_FORBIDDEN", category: "EXTERNAL_AMBIGUITY", message, details });
  }
}

/** The typed error classes of this package (the taxonomy census). */
export const ERROR_CLASSES = Object.freeze([
  "MerchantError",
  "ValidationError",
  "InvalidIdentifierError",
  "InvalidCryptoAmountError",
  "InvalidCryptoQuoteError",
  "InvalidCryptoAcceptanceError",
  "RouteFamilyConflationError",
  "SettlementModeConflationError",
  "SyntheticStripeBalanceError",
  "SecretShapeError",
  "MachineTransitionError",
  "MachineGuardError",
  "EvidenceRequiredError",
  "ConnectivityImpliedError",
  "PortShapeError",
  "SettlementInstructionRefError",
  "WebhookShapeError",
  "EnvelopeShapeError",
  "StripeSurfaceError",
  "CanonicalizationError",
  "AmbiguityRetryForbiddenError",
] as const);

/** True iff the value is a typed error of this package. */
export function isMerchantError(value: unknown): value is MerchantError {
  return value instanceof MerchantError;
}
