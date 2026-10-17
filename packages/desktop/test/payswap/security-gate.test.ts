/**
 * Security-gate composition laws (P7-W2): the fold composes the pinned
 * security vocabulary — BLOCK stays BLOCK (non-overridable at the display
 * boundary, INV-21), UNKNOWN stays UNKNOWN (never failure, never success).
 */

import { describe, expect, it } from "vitest";

import { foldDesktopSecurityDecision } from "../../src/host/payswap/index.js";
import type { PinnedSecurityGateDecisionSource } from "../../src/host/payswap/index.js";

const BLOCKED: PinnedSecurityGateDecisionSource = {
  decision: "BLOCK",
  reasons: [
    {
      dimension: "recipient",
      code: "RISK_RECIPIENT_SANCTIONED",
      message: "The recipient appears on a sanctions list.",
      invariantRefs: ["INV-21"],
    },
  ],
  evidenceRefs: ["evidence://security/gate-1"],
};

const UNKNOWN_GATE: PinnedSecurityGateDecisionSource = {
  decision: "UNKNOWN",
  dimensions: [
    {
      dimension: "recipient",
      code: "SCREENING_PENDING",
      message: "The screening provider has not answered yet.",
    },
  ],
  evidenceRefs: ["evidence://security/gate-2"],
};

const ALLOWED: PinnedSecurityGateDecisionSource = {
  decision: "ALLOW",
  checks: [
    {
      dimension: "recipient",
      outcome: "pass",
      code: "SCREENING_CLEAR",
      detail: "No adverse finding for the recipient.",
    },
  ],
  evidenceRefs: ["evidence://security/gate-3"],
};

describe("security gate composition laws (P7-W2)", () => {
  it("BLOCK renders as a block with the violated reasons in people language and the do-not-proceed recommendation (never overridable here)", () => {
    const view = foldDesktopSecurityDecision(BLOCKED);
    expect(view.verdict).toBe("BLOCK");
    expect(view.tone).toBe("danger");
    expect(view.headline).toBe("This action is blocked");
    expect(view.explanation).toContain("no setting, agent or optimization overrides them");
    expect(view.drilldown).toEqual([
      "recipient [RISK_RECIPIENT_SANCTIONED]: The recipient appears on a sanctions list. (invariants: INV-21)",
    ]);
  });

  it("the fold exposes NO override/downgrade path for BLOCK (INV-21: the display boundary cannot downgrade)", () => {
    const view = foldDesktopSecurityDecision(BLOCKED);
    // The view type carries the verdict verbatim; there is no parameter,
    // option or method anywhere in the product that can soften it.
    expect(Object.keys(view).sort()).toEqual([
      "drilldown",
      "evidenceRefs",
      "explanation",
      "headline",
      "provenance",
      "tone",
      "verdict",
    ]);
    expect(view.verdict).toBe("BLOCK");
  });

  it("UNKNOWN renders as UNKNOWN: what is unobserved and that no failure or success is implied", () => {
    const view = foldDesktopSecurityDecision(UNKNOWN_GATE);
    expect(view.verdict).toBe("UNKNOWN");
    expect(view.tone).toBe("warning");
    expect(view.headline).toBe("This action is not yet decided");
    expect(view.explanation).toContain("neither failure nor success");
    expect(view.explanation).toContain("nothing is retried blindly");
    expect(view.drilldown).toEqual([
      "recipient [SCREENING_PENDING]: The screening provider has not answered yet.",
    ]);
  });

  it("ALLOW renders what passed and the evidence — never a blanket trust statement", () => {
    const view = foldDesktopSecurityDecision(ALLOWED);
    expect(view.verdict).toBe("ALLOW");
    expect(view.tone).toBe("success");
    expect(view.explanation).toContain("authorizes this action only");
    expect(view.explanation).toContain("not a blanket trust statement");
  });

  it("every verdict carries its evidence references (definitive statements are evidence-backed)", () => {
    for (const decision of [BLOCKED, UNKNOWN_GATE, ALLOWED]) {
      const view = foldDesktopSecurityDecision(decision);
      expect(view.evidenceRefs).toEqual(decision.evidenceRefs);
    }
  });

  it("fail-closed: the fold never invents a fourth verdict", () => {
    expect(() =>
      foldDesktopSecurityDecision({ ...ALLOWED, decision: "MAYBE" as never }),
    ).toThrow(/BLOCK, ALLOW or UNKNOWN/);
    expect(() => foldDesktopSecurityDecision(null as never)).toThrow(/must be an object/);
  });
});
