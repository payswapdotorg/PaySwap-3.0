/**
 * @payswap/surface — the security gate vocabulary in people language (P2-W3).
 *
 * ADAPT of payswap.org@8a735bf packages/surface/src/security-vocabulary.ts
 * (141L). Old-repo provenance: P4-W4-002 §3.4.
 *
 * ADAPTATION (the old runtime type import is NOT ported): the old module
 * imported `GateDecision` from @payswap/onchain-security (a package that
 * does not exist in PaySwap 3.0, and onchain-security gates land with
 * P4-W2). This module pins the decision shape STRUCTURALLY
 * (SecurityGateDecisionSource — a typed envelope with explicit content);
 * the security-authority lanes (P1-W3 trust, accepted; P4-W2, pending)
 * satisfy it by construction. The TL wires imports at integration.
 *
 * PORTED LAW: BLOCK stays BLOCK (non-overridable — INV-21: security cannot
 * downgrade BLOCK, and neither can a display fold), UNKNOWN stays UNKNOWN
 * (never rendered as failure or success — INV-04 at the UX boundary), and
 * every fold carries the drill-down so the typed detail is one explicit
 * step away (progressive disclosure; the raw dump is never the default
 * view).
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** The people-language tone for each verdict (UI tone, not a new verdict). */
export type GatePresentationTone = "danger" | "success" | "warning";

/** A BLOCK reason from the security authority (structural pin). */
export interface GateBlockReason {
  readonly dimension: string;
  readonly code: string;
  readonly message: string;
  readonly invariantRefs: readonly string[];
}

/** An ALLOW check from the security authority (structural pin). */
export interface GateAllowCheck {
  readonly dimension: string;
  readonly outcome: string;
  readonly code: string;
  readonly detail: string;
}

/** An UNKNOWN dimension from the security authority (structural pin). */
export interface GateUnknownDimension {
  readonly dimension: string;
  readonly code: string;
  readonly message: string;
}

/**
 * What the fold reads from security-gate-shaped data (STRUCTURAL pin — the
 * security lanes own the real decision types; the fold preserves the typed
 * verdict verbatim and never invents a fourth verdict).
 */
export interface SecurityGateDecisionSource {
  readonly decision: "BLOCK" | "ALLOW" | "UNKNOWN";
  /** Present with BLOCK (the violated reasons). */
  readonly reasons?: readonly GateBlockReason[];
  /** Present with ALLOW (what passed). */
  readonly checks?: readonly GateAllowCheck[];
  /** Present with UNKNOWN (the unobserved dimensions). */
  readonly dimensions?: readonly GateUnknownDimension[];
  readonly evidenceRefs: readonly string[];
}

/** The human-readable fold of one gate decision. */
export interface SecurityDecisionView {
  /** The verdict, verbatim from the typed decision. */
  readonly verdict: "BLOCK" | "ALLOW" | "UNKNOWN";
  readonly tone: GatePresentationTone;
  /** The headline a person reads first (why + what it means). */
  readonly headline: string;
  /** The person-actionable explanation (expected action / recommendation). */
  readonly explanation: string;
  /**
   * The typed drill-down items (rendered only on explicit disclosure —
   * progressive disclosure law; the raw dump is never the default view).
   */
  readonly drilldown: readonly string[];
  /** Evidence references — every definitive statement is evidence-backed. */
  readonly evidenceRefs: readonly string[];
  readonly provenance: SurfaceContractProvenance;
}

/**
 * Fold a security gate decision into the people-language view.
 *
 * Laws (INV-04 + INV-21 at the UX boundary):
 * - BLOCK renders as a block with the violated reasons in human terms and
 *   an explicit do-not-proceed recommendation — never overridable here;
 * - UNKNOWN renders as UNKNOWN: what is unobserved, what it would take to
 *   resolve, and that no success or failure is implied;
 * - ALLOW renders what passed and the evidence — it never implies more
 *   authority than the checks establish.
 */
export function foldSecurityDecision(decision: SecurityGateDecisionSource): SecurityDecisionView {
  switch (decision.decision) {
    case "BLOCK": {
      const reasons = (decision.reasons ?? []).map(
        (reason) =>
          `${reason.dimension} [${reason.code}]: ${reason.message}${
            reason.invariantRefs.length > 0 ? ` (invariants: ${reason.invariantRefs.join(", ")})` : ""
          }`,
      );
      return {
        verdict: "BLOCK",
        tone: "danger",
        headline: "This action is blocked",
        explanation:
          "A deterministic security gate stopped this action before anything moved. Blocked actions are final for this request — no setting, agent or optimization overrides them (INV-21: security cannot downgrade BLOCK).",
        drilldown: reasons,
        evidenceRefs: decision.evidenceRefs,
        provenance: surfaceProvenance("P2-W3"),
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
        drilldown: dimensions,
        evidenceRefs: decision.evidenceRefs,
        provenance: surfaceProvenance("P2-W3"),
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
        drilldown: checks,
        evidenceRefs: decision.evidenceRefs,
        provenance: surfaceProvenance("P2-W3"),
      };
    }
  }
}

/**
 * The mode-indicator contract for every money-adjacent surface (INV-25:
 * test/sandbox/live/mainnet distinctions are explicit): test/live AND
 * testnet/mainnet must be VISIBLE and honest. `modeLocked` records the
 * credential-determined mode — the UI can switch only what the authority
 * allows. (Enforcement machinery is provider-runtime territory, P2-W2;
 * this surface makes the distinction visible.)
 */
export interface SurfaceModeIndicator {
  readonly testOrLive: "TEST" | "LIVE";
  readonly testnetOrMainnet: "TESTNET" | "MAINNET" | "NOT-APPLICABLE";
  /** True when the surface refuses mode switching (authority-locked). */
  readonly modeLocked: boolean;
  /** One-line honesty note rendered with the indicator. */
  readonly note: string;
}

export function modeIndicator(input: {
  readonly testOrLive: "TEST" | "LIVE";
  readonly onchain: boolean;
  readonly testnet: boolean;
  readonly modeLocked?: boolean;
}): SurfaceModeIndicator {
  const testnetOrMainnet: SurfaceModeIndicator["testnetOrMainnet"] = input.onchain
    ? input.testnet
      ? "TESTNET"
      : "MAINNET"
    : "NOT-APPLICABLE";
  return {
    testOrLive: input.testOrLive,
    testnetOrMainnet,
    modeLocked: input.modeLocked ?? false,
    note:
      input.testOrLive === "TEST"
        ? "Test mode — no real money moves. Test data is visually distinct and never presented as a live transaction."
        : "Live mode — real money. Every definitive state below is evidence-backed.",
  };
}
