/**
 * @payswap/client-certification — the escalate-only gate wall (P8-W2,
 * hard law 10) + the composed certification run.
 *
 * REAUTHORED from the old-repo security-gates halt law
 * (payswap.org@8a735bf packages/certification src/security-gates.ts —
 * a failed security review is TERMINAL for the promotion attempt; only
 * a NEW order carrying remediation evidence can promote the subject
 * again) onto the canonical architecture as the CLIENT gate wall:
 *
 * - a failed client gate HALTS the release;
 * - the halt CANNOT be downgraded, waived or overridden (no API exists
 *   that flips a HALT to PASS — requestGateWaiver/requestGateDowngrade
 *   always refuse and ESCALATE);
 * - the only path back is a NEW certification run whose subject carries
 *   verified remediation evidence for the failing laws.
 *
 * The composed run executes all nine content gates and folds them plus
 * the wall law into one verdict with a deterministic digest.
 */

import { CLIENT_CERTIFICATION_LAWS } from "./verdict.ts";
import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type {
  ClientCertificationLaw,
  ClientCertificationVerdict,
  ClientGateResult,
  CertificationViolation,
} from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";
import type { ConsequentialStateDeclaration } from "./state-honesty.ts";
import { runStateHonestyGate } from "./state-honesty.ts";
import type { SecretBoundaryProbes, SecretBoundaryScrubber } from "./secret-boundary.ts";
import { runSecretBoundaryGate } from "./secret-boundary.ts";
import type {
  ContractDeclaration,
  CustomerVisibleAction,
  EffectDeclaration,
} from "./dead-action.ts";
import { runDeadActionAudit } from "./dead-action.ts";
import type {
  AuthorizationSnapshot,
  PostChangeDisplay,
  RecipientChangeObservation,
} from "./recipient-authorization.ts";
import { runFreshConditionsGate, runRecipientAuthorizationGate } from "./recipient-authorization.ts";
import type { SandboxLiveSeparationInput } from "./sandbox-live.ts";
import { runSandboxLiveSeparationGate } from "./sandbox-live.ts";
import type { AccessibleElementContract } from "./accessibility.ts";
import { runAccessibilityGate } from "./accessibility.ts";
import type { ResponsiveElementContract } from "./responsive-device.ts";
import { runResponsiveGate } from "./responsive-device.ts";
import type { BrowserRunObservation } from "./browser-verification.ts";
import { recordBrowserVerificationRun } from "./browser-verification.ts";

/** The law this module enforces (hard law 10). */
const LAW = "gate-wall" as const;

/** The certified surface kinds. */
export const CERTIFIED_SURFACE_KINDS = Object.freeze([
  "web",
  "desktop",
  "extension",
  "command",
] as const);

export type CertifiedSurfaceKind = (typeof CERTIFIED_SURFACE_KINDS)[number];

/** The subject of a client certification run. */
export interface ClientCertificationSubject {
  readonly surfaceId: string;
  readonly surfaceKind: CertifiedSurfaceKind;
  readonly consequentialStates: readonly ConsequentialStateDeclaration[];
  readonly secretBoundary: {
    readonly probes: SecretBoundaryProbes;
    readonly scrubber: SecretBoundaryScrubber;
    readonly scrubberProbes: readonly unknown[];
  };
  readonly deadAction: {
    readonly actions: readonly CustomerVisibleAction[];
    readonly contracts: readonly ContractDeclaration[];
    readonly effects: readonly EffectDeclaration[];
  };
  readonly recipientAuthorization: {
    readonly authorization: AuthorizationSnapshot;
    readonly change: RecipientChangeObservation;
    readonly display: PostChangeDisplay;
  };
  readonly sandboxLive: SandboxLiveSeparationInput;
  readonly accessibility: readonly AccessibleElementContract[];
  readonly responsive: readonly ResponsiveElementContract[];
  readonly browserVerification: BrowserRunObservation;
}

/** The composed verdict (owned by the verdict vocabulary module). */

/** The composed certification report. */
export interface ClientCertificationReport {
  readonly surfaceId: string;
  readonly surfaceKind: CertifiedSurfaceKind;
  readonly verdict: ClientCertificationVerdict;
  /** The nine content-gate results, in hard-law order. */
  readonly gates: readonly ClientGateResult[];
  readonly violationCount: number;
  readonly digest: string;
}

/**
 * The composed client certification run: nine content gates + the wall.
 * A single violation on any gate HALTs the release.
 */
export function runClientCertification(
  subject: ClientCertificationSubject,
): ClientCertificationReport {
  const gates: ClientGateResult[] = [
    runSecretBoundaryGate(subject.secretBoundary),
    runDeadActionAudit(subject.deadAction),
    runStateHonestyGate(subject.consequentialStates),
    runRecipientAuthorizationGate(subject.recipientAuthorization),
    runFreshConditionsGate(subject.recipientAuthorization),
    runSandboxLiveSeparationGate(subject.sandboxLive),
    runAccessibilityGate(subject.accessibility),
    runResponsiveGate(subject.responsive),
    recordBrowserVerificationRun(subject.browserVerification),
  ];
  const violationCount = gates.reduce(
    (total, gate) => total + gate.violations.length,
    0,
  );
  return Object.freeze({
    surfaceId: subject.surfaceId,
    surfaceKind: subject.surfaceKind,
    verdict: violationCount === 0 ? "PASS" : "HALT",
    gates: Object.freeze(gates),
    violationCount,
    digest: contentDigest({
      surfaceId: subject.surfaceId,
      surfaceKind: subject.surfaceKind,
      verdict: violationCount === 0 ? "PASS" : "HALT",
      gateDigests: gates.map((gate) => gate.digest),
    }),
  });
}

// ---------------------------------------------------------------------------
// The wall: no waiver, no downgrade, only remediation + a NEW run
// ---------------------------------------------------------------------------

/** A request to waive or downgrade a failed gate (ALWAYS refused). */
export interface WaiverRequest {
  readonly requestedBy: string;
  readonly justification: string;
  readonly targetLaw: ClientCertificationLaw;
}

/** The decision on a waiver/downgrade request: refused and escalated. */
export interface WaiverDecision {
  readonly accepted: false;
  readonly escalated: true;
  readonly note: string;
}

const WALL_NOTE =
  `client-certification gates are escalate-only (${CLIENT_GATE_SEVERITY}, halt action ${CLIENT_GATE_HALT_ACTION}): a failed gate halts the release and cannot be waived or downgraded; only a NEW certification run carrying verified remediation evidence can clear it`;

/**
 * Request a waiver of a failed gate. ALWAYS refused — the request
 * itself is recorded as an escalation (the wall is the law).
 */
export function requestGateWaiver(
  report: ClientCertificationReport,
  request: WaiverRequest,
): WaiverDecision {
  void report;
  void request;
  return Object.freeze({
    accepted: false,
    escalated: true,
    note: `WAIVER REFUSED: ${WALL_NOTE}`,
  });
}

/**
 * Request a downgrade of a failed gate's severity. ALWAYS refused.
 */
export function requestGateDowngrade(
  report: ClientCertificationReport,
  request: WaiverRequest,
): WaiverDecision {
  void report;
  void request;
  return Object.freeze({
    accepted: false,
    escalated: true,
    note: `DOWNGRADE REFUSED: ${WALL_NOTE}`,
  });
}

/** True when the report's verdict is a terminal HALT. */
export function haltedGateIsTerminal(
  report: ClientCertificationReport,
): boolean {
  return report.verdict === "HALT";
}

/** Verified remediation evidence for a halted law. */
export interface RemediationEvidence {
  readonly evidenceId: string;
  readonly artifactRef: string;
  readonly contentDigest: string;
  /** The failing law the evidence remediates. */
  readonly addressesLaw: ClientCertificationLaw;
}

/** The decision on a remediation package against a halt. */
export interface RemediationDecision {
  readonly accepted: boolean;
  readonly requiresNewRun: true;
  readonly violations: readonly string[];
}

/**
 * Verify a remediation package against a halted report (the ONLY path
 * back): the evidence must be non-empty and complete, every piece must
 * address a law that ACTUALLY failed, and clearing the halt still
 * requires a NEW certification run — remediation never mutates the
 * halted report.
 */
export function remediateHalt(
  report: ClientCertificationReport,
  evidence: readonly RemediationEvidence[],
): RemediationDecision {
  const violations: string[] = [];
  if (report.verdict !== "HALT") {
    violations.push("remediation applies to a HALT; this report already passed");
  }
  if (evidence.length === 0) {
    violations.push(
      "remediation evidence is MANDATORY: an empty remediation can never release a client-certification halt",
    );
  }
  const failedLaws = new Set(
    report.gates
      .filter((gate) => !gate.passed)
      .map((gate) => gate.law as ClientCertificationLaw),
  );
  for (const piece of evidence) {
    if (
      piece.evidenceId.length === 0 ||
      piece.artifactRef.length === 0 ||
      piece.contentDigest.length === 0
    ) {
      violations.push(`remediation evidence '${piece.evidenceId}' is incomplete`);
    }
    if (!failedLaws.has(piece.addressesLaw)) {
      violations.push(
        `remediation evidence '${piece.evidenceId}' addresses law '${piece.addressesLaw}' which did not fail (fail closed)`,
      );
    }
  }
  return Object.freeze({
    accepted: violations.length === 0,
    requiresNewRun: true,
    violations: Object.freeze(violations),
  });
}

/**
 * The wall's own gate result (composed from a report — the tenth law's
 * receipt): the wall holds iff no passed gate was downgraded and every
 * failing gate is terminal. Exposed for the evidence record.
 */
export function gateWallReceipt(
  report: ClientCertificationReport,
): ClientGateResult {
  const violations: CertificationViolation[] = [];
  for (const gate of report.gates) {
    if (gate.severity !== CLIENT_GATE_SEVERITY) {
      violations.push(
        violationOf(
          LAW,
          "gate_severity_tampered",
          `gate '${gate.law}' carries severity '${gate.severity}' — every client gate is ${CLIENT_GATE_SEVERITY}`,
        ),
      );
    }
    if (!gate.passed && gate.violations.length === 0) {
      violations.push(
        violationOf(
          LAW,
          "failed_gate_without_violations",
          `gate '${gate.law}' failed without recorded violations — a halt must be evidenced`,
        ),
      );
    }
  }
  if (report.gates.length !== CLIENT_CERTIFICATION_LAWS.length - 1) {
    violations.push(
      violationOf(
        LAW,
        "gate_count_drift",
        `the composed run executed ${report.gates.length} content gates — the registry declares ${CLIENT_CERTIFICATION_LAWS.length - 1} (plus this wall)`,
      ),
    );
  }
  return Object.freeze({
    law: LAW,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: report.gates.length,
    digest: contentDigest({ law: LAW, reportDigest: report.digest, violations }),
  });
}
