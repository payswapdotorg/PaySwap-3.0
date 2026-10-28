/**
 * PaySwap Desktop — the typed fail-closed errors for UNCONFIGURED
 * planes, split from ./service.ts for the ≤400-line file law (the
 * payment-mission-errors.ts precedent in the payments tree).
 *
 * Both errors mirror the workspace-store posture verbatim: an absent
 * plane at the composition edge is a typed per-call failure — never a
 * silent no-op, never an in-memory-only plane pretending to be durable.
 */

/** The typed fail-closed error for an unconfigured connection plane (the workspace-store precedent). */
export class ConnectionPlaneNotConfiguredError extends Error {
  readonly kind = "CONNECTION_PLANE_NOT_CONFIGURED" as const;
  constructor() {
    super(
      "The provider connection plane is not configured in this host (no connection session authority on the seam) — connection calls fail closed",
    );
    this.name = "ConnectionPlaneNotConfiguredError";
  }
}

/** The typed fail-closed error for an unconfigured payment-mission plane (P17-A — the same posture, mirrored verbatim). */
export class PaymentPlaneNotConfiguredError extends Error {
  readonly kind = "PAYMENT_PLANE_NOT_CONFIGURED" as const;
  constructor() {
    super(
      "The payment-mission plane is not configured in this host (no payment-mission runtime on the seam) — payment-mission calls fail closed",
    );
    this.name = "PaymentPlaneNotConfiguredError";
  }
}

/**
 * The typed fail-closed error for an unconfigured session-model-catalog
 * seam (P21-D Gap C, ADR-0014 D4 — the same posture): the substrate
 * session-settings read was not composed at the host composition edge,
 * so the catalog member fails closed — never a silent empty list
 * pretending the substrate seam exists.
 */
export class SessionModelCatalogNotConfiguredError extends Error {
  readonly kind = "SESSION_MODEL_CATALOG_NOT_CONFIGURED" as const;
  constructor() {
    super(
      "The session-model catalog seam is not configured in this host (no substrate session-settings read on the seam) — session-model-catalog calls fail closed",
    );
    this.name = "SessionModelCatalogNotConfiguredError";
  }
}
