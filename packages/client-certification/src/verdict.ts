/**
 * @payswap/client-certification — the shared verdict vocabulary (P8-W2).
 *
 * NET-NEW: the escalate-only law every client gate shares. A client
 * gate failure is terminal for the release attempt (the gate wall —
 * hard law 10); there is no waiver, no downgrade, no override. Only a
 * NEW certification attempt carrying verified remediation evidence can
 * ever clear a halt (the INV-21 discipline, pinned from the adversarial
 * plane).
 */

/** The ten hard laws of the client-surface honesty certification. */
export const CLIENT_CERTIFICATION_LAWS = Object.freeze([
  "secret-boundary",
  "dead-action-audit",
  "truthful-states",
  "recipient-authorization",
  "fresh-conditions",
  "sandbox-live-separation",
  "accessibility-contract",
  "responsive-device-contract",
  "browser-verification-contract",
  "gate-wall",
] as const);

export type ClientCertificationLaw = (typeof CLIENT_CERTIFICATION_LAWS)[number];

/** The severity of a client gate: security-layer, hard policy — BLOCK. */
export const CLIENT_GATE_SEVERITY = "cannot_downgrade_block" as const;

/**
 * The structural force of a failed client gate (pinned from the
 * adversarial `quarantine` action): HALT the release.
 */
export const CLIENT_GATE_HALT_ACTION = "quarantine" as const;

/** One certification violation found by a gate. */
export interface CertificationViolation {
  /** The hard law the violation belongs to. */
  readonly law: ClientCertificationLaw;
  /** Machine-checkable violation code (stable, documented). */
  readonly code: string;
  /** Human-readable detail (deterministic — no ambient data). */
  readonly detail: string;
}

/** One gate's result. A failed gate is a HALT for the release. */
export interface ClientGateResult {
  readonly law: ClientCertificationLaw;
  readonly severity: typeof CLIENT_GATE_SEVERITY;
  readonly passed: boolean;
  readonly violations: readonly CertificationViolation[];
  /** The number of items the gate checked (receipt). */
  readonly checked: number;
  /** Deterministic digest of the result (evidence chain anchor). */
  readonly digest: string;
}

/** The composed certification verdict. */
export type ClientCertificationVerdict = "PASS" | "HALT";

/**
 * A violation builder scoped to one law (every gate uses this so the
 * law tagging is uniform and machine-checkable).
 */
export function violationOf(
  law: ClientCertificationLaw,
  code: string,
  detail: string,
): CertificationViolation {
  return Object.freeze({ law, code, detail });
}

/** True when every violation in the list belongs to the given law. */
export function violationsTagged(
  law: ClientCertificationLaw,
  violations: readonly CertificationViolation[],
): boolean {
  return violations.every((violation) => violation.law === law);
}
