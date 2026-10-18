/**
 * @zcode/web/payswap — honest-state fold oracle (ADAPT of the P7-W1 share
 * of payswap.org@8a735bf packages/ux/test/honest-states.test.ts, MMP-35
 * behavioral oracle).
 *
 * The old suite's INV-X01 law (UNKNOWN is NEVER mapped to FAILED — it
 * renders as reconciling with the reconciliation path surfaced, never the
 * danger tone, never a failure headline) is re-asserted over the CANONICAL
 * vocabulary the new product folds: the provider-runtime envelope
 * (CONFIRMED/UNKNOWN/FAILED + AMBIGUITY_REASONS) and the surface progress
 * StageStatus. The old @payswap/interfaces TERMINAL_STATES/
 * ERROR_CATEGORIES and the old @payswap/execution attempt shapes do not
 * exist in PaySwap 3.0 — their honest-state LAWS port, their type surface
 * does not (receipted in the evidence record).
 */
import { describe, expect, it } from "vitest";
import {
  foldExecutionOutcome,
  foldStageStatus,
  toneForOutcomeWord,
} from "../../src/payswap/lib/honest-states.js";
import {
  EXTERNAL_EFFECT_OUTCOMES_PIN,
  AMBIGUITY_REASONS_PIN,
} from "../../src/payswap/pins/provider-runtime-pins.js";
import { SURFACE_PROGRESS_STAGES_PIN } from "../../src/payswap/pins/surface-pins.js";

describe("foldExecutionOutcome — honest for EVERY envelope outcome (total)", () => {
  it("covers the three-value vocabulary without throwing", () => {
    expect(EXTERNAL_EFFECT_OUTCOMES_PIN).toHaveLength(3);
    for (const outcome of EXTERNAL_EFFECT_OUTCOMES_PIN) {
      expect(() =>
        foldExecutionOutcome({ outcome, authorityRef: "att_1" }),
      ).not.toThrow();
    }
  });

  it("CONFIRMED renders as provider-verified success with evidence actions", () => {
    const view = foldExecutionOutcome({ outcome: "CONFIRMED", authorityRef: "att_1" });
    expect(view.tone).toBe("positive");
    expect(view.headline).toContain("Confirmed");
    expect(view.guidance).toContain("provider-verified");
    expect(view.actions.some((action) => action.actionId === "view-evidence")).toBe(true);
    // Submission was never the proof — the provider's answer is.
    expect(view.guidance).toContain("submission was never the proof");
  });

  it("UNKNOWN renders as reconciling — never a failure tone, never a failure headline", () => {
    const view = foldExecutionOutcome({
      outcome: "UNKNOWN",
      ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      authorityRef: "att_1",
    });
    expect(view.tone).toBe("unknown");
    expect(view.tone).not.toBe("negative");
    expect(view.headline).toContain("Unknown");
    expect(view.headline).not.toContain("Fail");
    expect(view.guidance).toContain("not a failure");
    expect(view.reconciliationNote).toBeDefined();
    expect(view.reconciliationNote).toContain("before any consequential retry");
    expect(view.actions.some((action) => action.actionId === "open-reconciliation")).toBe(true);
  });

  it("every ambiguity reason renders its people language honestly", () => {
    for (const reason of AMBIGUITY_REASONS_PIN) {
      const view = foldExecutionOutcome({
        outcome: "UNKNOWN",
        ambiguityReason: reason,
        authorityRef: "att_1",
      });
      expect(view.guidance).toContain("the effect may have");
      expect(view.tone).toBe("unknown");
    }
  });

  it("UNKNOWN never offers a blind retry action", () => {
    const view = foldExecutionOutcome({
      outcome: "UNKNOWN",
      ambiguityReason: "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH",
      authorityRef: "att_1",
    });
    expect(view.actions.map((action) => action.actionId)).not.toContain("retry-as-new-intent");
  });

  it("FAILED renders honestly as failure with evidence-first guidance", () => {
    const view = foldExecutionOutcome({
      outcome: "FAILED",
      providerFailure: { retryable: false, ambiguity: "NONE" },
      authorityRef: "att_1",
    });
    expect(view.tone).toBe("negative");
    expect(view.headline).toContain("Failed");
    expect(view.guidance).toContain("provider evidence, not inference");
    const retry = view.actions.find((action) => action.actionId === "retry-as-new-intent");
    expect(retry).toBeDefined();
    // Retry ONLY as a NEW intent with a fresh idempotency key (INV-04/INV-05).
    expect(retry?.label).toContain("new intent");
    expect(retry?.label).toContain("fresh key");
  });

  it("a retryable provider failure is labeled retryable — still a NEW intent", () => {
    const view = foldExecutionOutcome({
      outcome: "FAILED",
      providerFailure: { retryable: true, ambiguity: "NONE" },
      authorityRef: "att_1",
    });
    expect(view.headline).toContain("retryable");
    expect(view.guidance).toContain("NEW intent");
  });
});

describe("foldStageStatus — honest for EVERY progress-stage status (total)", () => {
  it("covers the six-value StageStatus vocabulary without throwing", () => {
    for (const status of ["ACHIEVED", "IN_PROGRESS", "PENDING", "UNKNOWN", "FAILED", "NOT_APPLICABLE"] as const) {
      expect(() => foldStageStatus(status)).not.toThrow();
    }
  });

  it("UNKNOWN renders as reconciliation — never as failure", () => {
    const view = foldStageStatus("UNKNOWN");
    expect(view.tone).toBe("unknown");
    expect(view.tone).not.toBe("negative");
    expect(view.headline).toContain("Unknown");
    expect(view.guidance).toContain("not a failure");
    expect(view.guidance).toContain("reconciliation");
  });

  it("FAILED renders honestly as failure", () => {
    const view = foldStageStatus("FAILED");
    expect(view.tone).toBe("negative");
    expect(view.headline).toBe("Failed");
  });

  it("ACHIEVED is positive; IN_PROGRESS/PENDING/NOT_APPLICABLE stay neutral-ish", () => {
    expect(foldStageStatus("ACHIEVED").tone).toBe("positive");
    expect(foldStageStatus("IN_PROGRESS").tone).toBe("attention");
    expect(foldStageStatus("PENDING").tone).toBe("neutral");
    expect(foldStageStatus("NOT_APPLICABLE").tone).toBe("neutral");
  });

  it("the fold is total over the 16-stage lifecycle: every stage folds", () => {
    for (const stage of SURFACE_PROGRESS_STAGES_PIN) {
      const view = foldStageStatus("ACHIEVED");
      expect(view.status).toBe("ACHIEVED");
      expect(stage).toBeDefined();
    }
  });
});

describe("the tone mapping law (toneForOutcomeWord)", () => {
  it("UNKNOWN never maps to a negative tone; FAILED never maps to positive", () => {
    expect(toneForOutcomeWord("UNKNOWN")).toBe("unknown");
    expect(toneForOutcomeWord("UNKNOWN")).not.toBe("negative");
    expect(toneForOutcomeWord("CONFIRMED")).toBe("positive");
    expect(toneForOutcomeWord("FAILED")).toBe("negative");
  });
});
