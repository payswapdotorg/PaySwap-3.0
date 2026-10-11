/**
 * Security-vocabulary fold tests (P2-W3): PORTED from
 * payswap.org@8a735bf packages/surface/test/vocabulary-folds.test.ts
 * (gate fold §3.4: 4 tests; mode indicator §3.5: 2 tests). The old
 * `GateDecision` fixtures (typed against @payswap/onchain-security, a
 * package that does not exist in PaySwap 3.0) become structural
 * SecurityGateDecisionSource fixtures — the fold is tested against the
 * pinned envelope shape the security lanes satisfy by construction.
 *
 * The old convert-disclosure-fold block (7 tests) is adapted into
 * quote-terms.test.ts (route compilation is P5-W1 territory; the
 * disclosure-fold law ports to the quote/terms projection).
 */

import { describe, expect, it } from "vitest";

import { type SecurityGateDecisionSource, foldSecurityDecision, modeIndicator } from "../src/index.ts";

const allowDecision: SecurityGateDecisionSource = {
  decision: "ALLOW",
  checks: [
    { dimension: "spender_approval", outcome: "pass", code: "spender_exact", detail: "allowance is exactly the swap amount" },
    { dimension: "simulation_consistency", outcome: "pass", code: "diff_clean", detail: "state diff matches the quote" },
  ],
  evidenceRefs: ["evidence:sim:1"],
};

const blockDecision: SecurityGateDecisionSource = {
  decision: "BLOCK",
  reasons: [
    {
      dimension: "spender_approval",
      code: "unlimited_allowance",
      message: "The contract would grant unlimited USDC spending authority to an untrusted spender.",
      invariantRefs: ["INV-SC02", "rule-28"],
    },
  ],
  checks: [
    { dimension: "spender_approval", outcome: "block", code: "unlimited_allowance", detail: "approval is unbounded" },
  ],
  evidenceRefs: ["evidence:sim:2"],
};

const unknownDecision: SecurityGateDecisionSource = {
  decision: "UNKNOWN",
  dimensions: [
    {
      dimension: "simulation_consistency",
      code: "simulation_unavailable",
      message: "No simulation observation is available for this write.",
    },
  ],
  checks: [
    { dimension: "spender_approval", outcome: "pass", code: "spender_exact", detail: "allowance is exactly the swap amount" },
  ],
  evidenceRefs: [],
};

describe("gate vocabulary fold", () => {
  it("preserves the verdict verbatim — the fold never invents a fourth verdict", () => {
    expect(foldSecurityDecision(allowDecision).verdict).toBe("ALLOW");
    expect(foldSecurityDecision(blockDecision).verdict).toBe("BLOCK");
    expect(foldSecurityDecision(unknownDecision).verdict).toBe("UNKNOWN");
  });

  it("BLOCK carries the human reason, the invariant refs and a no-override statement", () => {
    const view = foldSecurityDecision(blockDecision);
    expect(view.tone).toBe("danger");
    expect(view.headline).toContain("blocked");
    expect(view.explanation).toContain("no setting");
    expect(view.drilldown.join(" ")).toContain("unlimited USDC spending authority");
    expect(view.drilldown.join(" ")).toContain("INV-SC02");
    expect(view.evidenceRefs).toEqual(["evidence:sim:2"]);
  });

  it("UNKNOWN renders as neither failure nor success (INV-04 at the UX boundary)", () => {
    const view = foldSecurityDecision(unknownDecision);
    expect(view.tone).toBe("warning");
    expect(view.headline).toContain("not yet decided");
    expect(view.explanation).toContain("neither failure nor success");
    expect(view.drilldown.join(" ")).toContain("simulation_unavailable");
  });

  it("ALLOW lists what passed without claiming blanket trust", () => {
    const view = foldSecurityDecision(allowDecision);
    expect(view.tone).toBe("success");
    expect(view.explanation).toContain("authorizes this action only");
    expect(view.drilldown.join(" ")).toContain("spender_exact");
  });
});

describe("mode indicator contract (INV-25 visible at the surface)", () => {
  it("test + testnet is visibly distinct from live + mainnet", () => {
    const test = modeIndicator({ testOrLive: "TEST", onchain: true, testnet: true });
    const live = modeIndicator({ testOrLive: "LIVE", onchain: true, testnet: false });
    expect(test.testOrLive).toBe("TEST");
    expect(test.testnetOrMainnet).toBe("TESTNET");
    expect(test.note).toContain("no real money");
    expect(live.testOrLive).toBe("LIVE");
    expect(live.testnetOrMainnet).toBe("MAINNET");
    expect(live.note).toContain("real money");
  });

  it("fiat-only surfaces honestly mark the network dimension not applicable", () => {
    const fiat = modeIndicator({ testOrLive: "TEST", onchain: false, testnet: false });
    expect(fiat.testnetOrMainnet).toBe("NOT-APPLICABLE");
  });
});
