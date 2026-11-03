/**
 * @payswap/node-network — the typed error taxonomy (P27-D).
 *
 * Every failure in this package is a typed, named error carrying a stable
 * machine code (the route-planning errors.ts discipline): validation
 * failures never repair, never guess, never default — they throw with the
 * reason and a frozen details payload. The package is INTELLIGENCE: no
 * error here represents (or ever mints) an authorization decision — the
 * typed refusals of the eligibility/baseline surfaces are DATA (typed
 * exclusion records), not thrown errors, because a refusal to admit a
 * candidate is an honest discovery OUTPUT (ADR-0014 D7), while a
 * malformed structure is an input defect.
 */

/** Base class of every error this package throws (machine code + frozen details). */
export class NodeNetworkError extends Error {
  readonly code: string;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "NodeNetworkError";
    this.code = code;
    if (details !== undefined) {
      (this as { details?: unknown }).details = details;
    }
  }
}

/** Fail-closed structural validation failure (never a repair). */
export class NodeNetworkValidationError extends NodeNetworkError {
  constructor(message: string, details?: unknown) {
    super(message, "NODE_NETWORK_VALIDATION_FAILED", details);
    this.name = "NodeNetworkValidationError";
  }
}

/** A node enrollment record violated the accountability laws (D5/D11). */
export class NodeEnrollmentError extends NodeNetworkError {
  constructor(message: string, details?: unknown) {
    super(message, "NODE_ENROLLMENT_FAILED", details);
    this.name = "NodeEnrollmentError";
  }
}

/** An attestation failed signing/verification (D5). */
export class NodeAttestationError extends NodeNetworkError {
  constructor(message: string, details?: unknown) {
    super(message, "NODE_ATTESTATION_FAILED", details);
    this.name = "NodeAttestationError";
  }
}

/** A capability offer failed its signature/expiry/binding laws (D5). */
export class NodeOfferError extends NodeNetworkError {
  constructor(message: string, details?: unknown) {
    super(message, "NODE_OFFER_FAILED", details);
    this.name = "NodeOfferError";
  }
}

/** The node registry violated its append-only/revocation laws. */
export class NodeRegistryError extends NodeNetworkError {
  constructor(message: string, details?: unknown) {
    super(message, "NODE_REGISTRY_FAILED", details);
    this.name = "NodeRegistryError";
  }
}

/** A classification input violated the three-plane laws (D1/D2/INV-30). */
export class ClassificationError extends NodeNetworkError {
  constructor(message: string, details?: unknown) {
    super(message, "CLASSIFICATION_FAILED", details);
    this.name = "ClassificationError";
  }
}

/** A per-leg disclosure envelope violated the least-disclosure laws (D9). */
export class DisclosureError extends NodeNetworkError {
  constructor(message: string, details?: unknown) {
    super(message, "DISCLOSURE_ENVELOPE_FAILED", details);
    this.name = "DisclosureError";
  }
}

/** A saga plan/run violated the per-leg saga laws (D7, ADR-0016 D13). */
export class SagaError extends NodeNetworkError {
  constructor(message: string, details?: unknown) {
    super(message, "SAGA_PLAN_FAILED", details);
    this.name = "SagaError";
  }
}
