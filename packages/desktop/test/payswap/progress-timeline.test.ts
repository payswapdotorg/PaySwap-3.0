/**
 * Progress-timeline composition laws (P7-W2): the fold composes the pinned
 * progress-states contract (canonical order, honest UNKNOWN, evidence law,
 * submission-not-finality / payout-sent-not-beneficiary-credit facts).
 */

import { describe, expect, it } from "vitest";

import { foldDesktopProgressTimeline } from "../../src/host/payswap/index.js";
import type { PinnedStageObservation } from "../../src/host/payswap/index.js";

const NOW = "2026-10-17T12:00:00.000Z";

function stage(
  stageId: PinnedStageObservation["stage"],
  status: PinnedStageObservation["status"],
  evidenceRefs: string[] = ["evidence://1"],
): PinnedStageObservation {
  return {
    stage: stageId,
    status,
    authorityRecordRef: "record://protocol/journey-1",
    evidenceRefs,
    observedAt: NOW,
  };
}

describe("progress timeline composition laws (P7-W2)", () => {
  it("stages render in canonical lifecycle order regardless of input order", () => {
    const view = foldDesktopProgressTimeline({
      now: NOW,
      observations: [
        stage("PAYOUT_SENT", "ACHIEVED"),
        stage("INTENT_RECORDED", "ACHIEVED"),
        stage("QUOTE_ACCEPTED", "ACHIEVED"),
      ],
    });
    expect(view.stages.map((s) => s.stage)).toEqual([
      "INTENT_RECORDED",
      "QUOTE_ACCEPTED",
      "PAYOUT_SENT",
    ]);
  });

  it("duplicate stages are refused (one observation per stage)", () => {
    expect(() =>
      foldDesktopProgressTimeline({
        now: NOW,
        observations: [stage("INTENT_RECORDED", "ACHIEVED"), stage("INTENT_RECORDED", "PENDING")],
      }),
    ).toThrow(/duplicate stage INTENT_RECORDED/);
  });

  it("UNKNOWN renders as UNKNOWN — neither failure nor success — with the reconciliation-first wording (INV-04)", () => {
    const view = foldDesktopProgressTimeline({ now: NOW, observations: [stage("PAYOUT_SENT", "UNKNOWN")] });
    const unknownStage = view.stages[0];
    expect(unknownStage?.status).toBe("UNKNOWN");
    expect(unknownStage?.tone).toBe("warning");
    expect(unknownStage?.headline).toBe("This stage is not yet decided");
    expect(unknownStage?.explanation).toContain("neither failure nor success");
    expect(unknownStage?.explanation).toContain("no blind retry");
  });

  it("submission is not finality: PAYOUT_SUBMITTED renders an acknowledgement, never finality", () => {
    const view = foldDesktopProgressTimeline({
      now: NOW,
      observations: [stage("PAYOUT_SUBMITTED", "ACHIEVED")],
    });
    expect(view.stages[0]?.explanation).toContain("acknowledgement is not finality");
    expect(view.facts.submissionIsNotFinality).toBe(true);
  });

  it("a payout sent is not beneficiary credit: PAYOUT_SENT carries the honest statement and the open return path", () => {
    const view = foldDesktopProgressTimeline({
      now: NOW,
      observations: [stage("PAYOUT_SENT", "ACHIEVED")],
    });
    expect(view.stages[0]?.explanation).toContain("not beneficiary credit");
    expect(view.facts.returnPathOpen).toBe(true);
    expect(view.facts.payoutSentWithoutBeneficiaryCredit).toBe(true);
    expect(view.outcomeLine).toContain("Returns can arrive days or weeks");
  });

  it("BENEFICIARY_CREDITED claimed ACHIEVED without evidence REFUSES the fold (no fabricated provider effects, INV-24)", () => {
    expect(() =>
      foldDesktopProgressTimeline({ now: NOW, observations: [stage("BENEFICIARY_CREDITED", "ACHIEVED", [])] }),
    ).toThrow(/cannot be claimed ACHIEVED without evidence/);
    const honest = foldDesktopProgressTimeline({
      now: NOW,
      observations: [
        stage("PAYOUT_SENT", "ACHIEVED"),
        stage("BENEFICIARY_CREDITED", "ACHIEVED", ["evidence://observation/credit-1"]),
      ],
    });
    expect(honest.facts.payoutSentWithoutBeneficiaryCredit).toBe(false);
  });

  it("every stage view carries the authoritative record reference + evidence (INV-23: never the record itself)", () => {
    const view = foldDesktopProgressTimeline({
      now: NOW,
      observations: [stage("FUNDING_RECEIVED", "ACHIEVED", ["evidence://funding/1"])],
    });
    expect(view.stages[0]?.authorityRecordRef).toBe("record://protocol/journey-1");
    expect(view.stages[0]?.evidenceRefs).toEqual(["evidence://funding/1"]);
  });

  it("the provider-visible status label renders verbatim (normalization must not erase provider semantics)", () => {
    const view = foldDesktopProgressTimeline({
      now: NOW,
      observations: [
        { ...stage("PAYOUT_SENT", "ACHIEVED"), providerStatus: "outgoing_payment_sent" },
      ],
    });
    expect(view.stages[0]?.providerStatus).toBe("outgoing_payment_sent");
  });

  it("no observations renders the honest empty timeline line, never an exception", () => {
    const view = foldDesktopProgressTimeline({ now: NOW, observations: [] });
    expect(view.outcomeLine).toContain("No stage observations yet");
    expect(view.stages).toEqual([]);
    expect(view.facts.submissionIsNotFinality).toBe(false);
  });

  it("fail-closed on unknown stages/statuses and malformed observations", () => {
    expect(() =>
      foldDesktopProgressTimeline({
        now: NOW,
        observations: [{ ...stage("INTENT_RECORDED", "ACHIEVED"), stage: "MADE_UP" as never }],
      }),
    ).toThrow(/stage vocabulary is closed/);
    expect(() =>
      foldDesktopProgressTimeline({
        now: NOW,
        observations: [{ ...stage("INTENT_RECORDED", "ACHIEVED"), status: "MAYBE" as never }],
      }),
    ).toThrow(/status vocabulary is closed/);
    expect(() =>
      foldDesktopProgressTimeline({
        now: NOW,
        observations: [{ ...stage("INTENT_RECORDED", "ACHIEVED"), authorityRecordRef: "" }],
      }),
    ).toThrow(/non-empty reference/);
  });
});
