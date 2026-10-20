/**
 * @payswap/financial-certification — the error vocabulary.
 *
 * Every failure mode of the certification machinery is a TYPED error: a
 * caller never receives a silent downgrade, and a certification gate can
 * never be waived (the escalate-only law renders the waiver request itself
 * as an exception type).
 */

/** Raised for malformed certification-suite operations. */
export class CertificationSuiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificationSuiteError";
  }
}

/** Raised for malformed conformance artifacts submitted to a law verifier. */
export class ConformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConformanceError";
  }
}

/** Raised for malformed gate-wall inputs (the uniform wall). */
export class FinancialGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialGateError";
  }
}

/**
 * Raised when a promotion attempt is halted by a FAILED certification
 * gate. The attempted promotion is dead for that subject version: only a
 * NEW certification evaluation carrying remediation evidence can ever
 * promote the subject again (the cannot-downgrade law).
 */
export class CertificationHaltError extends Error {
  readonly subjectId: string;
  readonly failedGates: readonly string[];

  constructor(subjectId: string, failedGates: readonly string[]) {
    super(
      `CERTIFICATION HALT: promotion for '${subjectId}' is blocked by failed certification gates (${failedGates.join(", ")}). The halt is escalate-only: a failed gate cannot be downgraded or waived — only a NEW evaluation carrying remediation evidence can clear it`,
    );
    this.name = "CertificationHaltError";
    this.subjectId = subjectId;
    this.failedGates = failedGates;
  }
}

/** Raised for any attempted waiver/downgrade of a certification gate. */
export class WaiverImpossibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaiverImpossibleError";
  }
}

/**
 * Raised when any artifact claims LIVE-corridor evidence. The suite is
 * hermetic by law (LAW-9): live-corridor certification is credential-gated
 * (the GAP-02 class) and must be recorded as an explicit limitation —
 * never simulated, never claimed.
 */
export class LiveCorridorClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveCorridorClaimError";
  }
}

/** Raised for malformed certification-record / ledger operations. */
export class CertificationRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificationRecordError";
  }
}
