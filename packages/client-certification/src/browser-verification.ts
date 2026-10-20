/**
 * @payswap/client-certification — the browser/device verification
 * contract (P8-W2, hard law 9).
 *
 * REAUTHORED from the old-repo browser-verification contracts
 * (payswap.org@8a735bf packages/operations/src/browser-verification.ts,
 * W3-007 — assigned to this slice) onto the canonical architecture as
 * the REPEATABLE DETERMINISTIC FORM of the live 2026-10-19 Gate D
 * record (docs/web-evidence/E2E-BROWSER-VERIFICATION-RECORD.md — the
 * prior art): the six required checks, the area-map completeness law,
 * the console-error law, the viewport matrix law, the screenshot
 * evidence-strength ceiling and the protocol-correlation law. The LIVE
 * browser run itself remains an operational step; this contract makes
 * its checks repeatable — a recorded run folds deterministically into
 * PASS/FAIL.
 *
 * Deterministic only: pure folds over the recorded observation.
 */

import { PINNED_UNIVERSAL_AREA_IDS } from "./pins/surface.ts";
import { PINNED_PROTOCOL_CORRELATION_IDS } from "./pins/command.ts";
import { deviceClassForViewport } from "./responsive-device.ts";
import type { DeviceClass } from "./responsive-device.ts";
import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type { ClientGateResult, CertificationViolation } from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";

/** The law this gate enforces (hard law 9). */
const LAW = "browser-verification-contract" as const;

/**
 * VALUE PIN — the six required checks per the FRONTEND-UX-DEPLOYMENT
 * "Browser verification" law (old-repo operations W3-007 vocabulary).
 */
export const BROWSER_VERIFICATION_CHECKS = Object.freeze([
  "desktop-verification",
  "responsive-mobile-verification",
  "console-error-check",
  "key-interaction-verification",
  "screenshot-artifact",
  "real-api-wiring-evidence",
] as const);

export type BrowserVerificationCheck =
  (typeof BROWSER_VERIFICATION_CHECKS)[number];

/**
 * VALUE PIN — INV-E04: a screenshot is browser-generated evidence with
 * UNAUTHENTICATED provenance — never stronger than authenticated
 * protocol evidence.
 */
export const SCREENSHOT_EVIDENCE_STRENGTH =
  "BROWSER_UNAUTHENTICATED_PROVENANCE" as const;

/**
 * The prior art this contract makes repeatable (the provenance law).
 */
export const BROWSER_VERIFICATION_PRIOR_ART =
  "docs/web-evidence/E2E-BROWSER-VERIFICATION-RECORD.md (Gate D live browser verification, 2026-10-19)" as const;

/** One key interaction a browser run must drive and observe. */
export interface KeyInteractionContract {
  readonly interactionId: string;
  readonly description: string;
  /** The surface area the interaction lives in (pinned vocabulary). */
  readonly expectedArea: string;
  /**
   * The protocol identifier the emitted event correlates to — browser
   * wiring evidence binds to a PROTOCOL id, never to a DOM artifact
   * (pinned vocabulary).
   */
  readonly correlatedProtocolId: string;
}

/** One console error observed during the run. */
export interface ConsoleErrorObservation {
  readonly message: string;
  readonly classification: "environmental" | "defect";
  /** Present (and true) when an environmental error is a documented limitation. */
  readonly documentedLimitation?: boolean;
}

/** One verified viewport. */
export interface ViewportObservation {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** A recorded browser/device verification run over one surface. */
export interface BrowserRunObservation {
  readonly surfaceId: string;
  /** The code identity the run verified (commit SHA or equivalent). */
  readonly codeIdentity: string;
  /** Which of the six required checks the run performed. */
  readonly performedChecks: readonly BrowserVerificationCheck[];
  /** The areas the run observed (must cover the pinned eleven). */
  readonly areasObserved: readonly string[];
  /** The viewports the run verified (must cover all three device classes). */
  readonly viewportsVerified: readonly ViewportObservation[];
  /** The full, unfiltered console-error inventory. */
  readonly consoleErrors: readonly ConsoleErrorObservation[];
  /** The key interactions the run drove. */
  readonly keyInteractions: readonly KeyInteractionContract[];
  /** The screenshot artifacts captured. */
  readonly screenshots: readonly {
    readonly evidenceId: string;
    readonly strength: string;
  }[];
  /** References proving real API/protocol wiring (non-empty). */
  readonly realWiringEvidenceRefs: readonly string[];
}

/**
 * The browser/device verification gate (hard law 9): folds a recorded
 * run. Any violation is a HALT for the release.
 */
export function recordBrowserVerificationRun(
  observation: BrowserRunObservation,
): ClientGateResult {
  const violations: CertificationViolation[] = [];

  for (const check of BROWSER_VERIFICATION_CHECKS) {
    if (!observation.performedChecks.includes(check)) {
      violations.push(
        violationOf(
          LAW,
          "required_check_missing",
          `browser run for '${observation.surfaceId}' did not perform required check '${check}'`,
        ),
      );
    }
  }

  for (const area of PINNED_UNIVERSAL_AREA_IDS) {
    if (!observation.areasObserved.includes(area)) {
      violations.push(
        violationOf(
          LAW,
          "area_map_incomplete",
          `browser run for '${observation.surfaceId}' never observed area '${area}' — the eleven-area map must be verified complete`,
        ),
      );
    }
  }

  const verifiedClasses = new Set<DeviceClass>();
  for (const viewport of observation.viewportsVerified) {
    verifiedClasses.add(deviceClassForViewport(viewport.widthPx));
  }
  for (const deviceClass of ["mobile", "tablet", "desktop"] as const) {
    if (!verifiedClasses.has(deviceClass)) {
      violations.push(
        violationOf(
          LAW,
          "viewport_matrix_incomplete",
          `browser run for '${observation.surfaceId}' verified no viewport of device class '${deviceClass}' — the viewport matrix law`,
        ),
      );
    }
  }

  for (const error of observation.consoleErrors) {
    if (error.classification === "defect") {
      violations.push(
        violationOf(
          LAW,
          "console_defect_error",
          `console defect error: ${error.message}`,
        ),
      );
    } else if (error.documentedLimitation !== true) {
      violations.push(
        violationOf(
          LAW,
          "environmental_error_undocumented",
          `environmental console error without a documented limitation: ${error.message}`,
        ),
      );
    }
  }

  for (const interaction of observation.keyInteractions) {
    if (
      !(PINNED_PROTOCOL_CORRELATION_IDS as readonly string[]).includes(
        interaction.correlatedProtocolId,
      )
    ) {
      violations.push(
        violationOf(
          LAW,
          "key_interaction_not_protocol_correlated",
          `key interaction '${interaction.interactionId}' correlates to '${interaction.correlatedProtocolId}' — wiring evidence binds to a pinned protocol identifier, never to a DOM artifact`,
        ),
      );
    }
    if (
      !(PINNED_UNIVERSAL_AREA_IDS as readonly string[]).includes(
        interaction.expectedArea,
      )
    ) {
      violations.push(
        violationOf(
          LAW,
          "key_interaction_outside_surface_vocabulary",
          `key interaction '${interaction.interactionId}' expects area '${interaction.expectedArea}' — outside the pinned eleven-area vocabulary`,
        ),
      );
    }
  }

  for (const screenshot of observation.screenshots) {
    if (screenshot.strength !== SCREENSHOT_EVIDENCE_STRENGTH) {
      violations.push(
        violationOf(
          LAW,
          "screenshot_strength_unbounded",
          `screenshot '${screenshot.evidenceId}' declares strength '${screenshot.strength}' — browser artifacts are bounded at ${SCREENSHOT_EVIDENCE_STRENGTH} (INV-E04)`,
        ),
      );
    }
  }

  if (observation.realWiringEvidenceRefs.length === 0) {
    violations.push(
      violationOf(
        LAW,
        "real_wiring_evidence_missing",
        `browser run for '${observation.surfaceId}' carries no real API/protocol wiring evidence — a surface run must prove real wiring (never a simulated substitute)`,
      ),
    );
  }

  return Object.freeze({
    law: LAW,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: observation.performedChecks.length,
    digest: contentDigest({
      law: LAW,
      haltAction: CLIENT_GATE_HALT_ACTION,
      surfaceId: observation.surfaceId,
      codeIdentity: observation.codeIdentity,
      violations,
    }),
  });
}
