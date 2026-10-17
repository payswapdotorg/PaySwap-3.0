/**
 * PaySwap Desktop (P7-W2) — the security gate fold.
 *
 * Composes the pinned security-vocabulary contract
 * (surface.security-vocabulary) into the desktop people-language view.
 *
 * PORTED LAW (INV-04 + INV-21 at the desktop boundary):
 * - BLOCK stays BLOCK: renders as a block with the violated reasons in
 *   human terms and an explicit do-not-proceed recommendation — never
 *   overridable here (no setting, agent or optimization downgrades it).
 * - UNKNOWN stays UNKNOWN: what is unobserved, what it would take to
 *   resolve, and that no success or failure is implied.
 * - ALLOW renders what passed and the evidence — it never implies more
 *   authority than the checks establish.
 * - The typed drill-down is one explicit step away (progressive
 *   disclosure); the raw dump is never the default view.
 */

import type { DesktopSecurityGateInput, DesktopSecurityGateView } from "./contracts.js";
import { pinnedSurfaceProvenance, isPinnedGateVerdict } from "../pins/index.js";

/**
 * Fold a security gate decision into the desktop people-language view.
 * Fail-closed: an unknown verdict token throws — the fold never invents a
 * fourth verdict.
 */
export function foldDesktopSecurityDecision(
  decision: DesktopSecurityGateInput,
): DesktopSecurityGateView {
  if (decision === null || typeof decision !== "object") {
    throw new Error("foldDesktopSecurityDecision: decision must be an object");
  }
  if (!isPinnedGateVerdict(decision.decision)) {
    throw new Error(
      `foldDesktopSecurityDecision: decision must be BLOCK, ALLOW or UNKNOWN — got ${JSON.stringify(decision.decision)}`,
    );
  }
  switch (decision.decision) {
    case "BLOCK": {
      const reasons = (decision.reasons ?? []).map(
        (reason) =>
          `${reason.dimension} [${reason.code}]: ${reason.message}${
            reason.invariantRefs.length > 0
              ? ` (invariants: ${reason.invariantRefs.join(", ")})`
              : ""
          }`,
      );
      return {
        verdict: "BLOCK",
        tone: "danger",
        headline: "This action is blocked",
        explanation:
          "A deterministic security gate stopped this action before anything moved. Blocked actions are final for this request — no setting, agent or optimization overrides them (INV-21: security cannot downgrade BLOCK).",
        drilldown: Object.freeze(reasons),
        evidenceRefs: Object.freeze([...decision.evidenceRefs]),
        provenance: pinnedSurfaceProvenance("P2-W3"),
      };
    }
    case "UNKNOWN": {
      const dimensions = (decision.dimensions ?? []).map(
        (dimension) => `${dimension.dimension} [${dimension.code}]: ${dimension.message}`,
      );
      return {
        verdict: "UNKNOWN",
        tone: "warning",
        headline: "This action is not yet decided",
        explanation:
          "The security evaluation could not establish a definitive verdict on every dimension. UNKNOWN is neither failure nor success — nothing is retried blindly, and resolution follows the observation/reconciliation path below.",
        drilldown: Object.freeze(dimensions),
        evidenceRefs: Object.freeze([...decision.evidenceRefs]),
        provenance: pinnedSurfaceProvenance("P2-W3"),
      };
    }
    case "ALLOW": {
      const checks = (decision.checks ?? []).map(
        (check) => `${check.dimension}: ${check.outcome} [${check.code}] ${check.detail}`,
      );
      return {
        verdict: "ALLOW",
        tone: "success",
        headline: "This action passed the security gates",
        explanation:
          "Every deterministic gate dimension evaluated to pass for this request. Passing gates authorizes this action only — it is not a blanket trust statement about anything else.",
        drilldown: Object.freeze(checks),
        evidenceRefs: Object.freeze([...decision.evidenceRefs]),
        provenance: pinnedSurfaceProvenance("P2-W3"),
      };
    }
  }
}
