/**
 * Progress-state tests (P2-W3, net-new): the surface can SAY —
 * - submission is not finality (PAYOUT_SUBMITTED renders an acknowledgement);
 * - a payout sent is not beneficiary credit (PAYOUT_SENT carries the honest
 *   statement; BENEFICIARY_CREDITED exists only as its own evidence-backed
 *   observation — claimed without evidence, the fold refuses);
 * - UNKNOWN is not FAILED (INV-04 at the UX boundary: neither failure nor
 *   success, reconciliation first, no blind retry);
 * - return/refund paths stay open after a payout was sent (late returns);
 * - observations carry REFERENCES to authoritative records, never the
 *   records (INV-23 projection law).
 */

import { describe, expect, it } from "vitest";

import {
  type StageObservation,
  foldProgressTimeline,
} from "../src/index.ts";

const NOW = "2026-10-11T12:10:00Z";

function observation(
  stage: StageObservation["stage"],
  status: StageObservation["status"],
  overrides: Partial<StageObservation> = {},
): StageObservation {
  return {
    stage,
    status,
    authorityRecordRef: `record:${stage}`,
    evidenceRefs: [],
    observedAt: "2026-10-11T12:00:00Z",
    ...overrides,
  };
}

describe("submission is not finality (the surface can say it)", () => {
  const view = foldProgressTimeline(
    [
      observation("INTENT_RECORDED", "ACHIEVED"),
      observation("QUOTE_ACCEPTED", "ACHIEVED"),
      observation("FUNDING_RECEIVED", "ACHIEVED"),
      observation("PAYOUT_SUBMITTED", "ACHIEVED"),
    ],
    { now: NOW },
  );

  it("the submitted stage renders an acknowledgement, never finality", () => {
    const submitted = view.stages.find((s) => s.stage === "PAYOUT_SUBMITTED");
    expect(submitted?.explanation).toContain("not finality");
    expect(view.facts.submissionIsNotFinality).toBe(true);
  });

  it("a submitted payout WITHOUT a sent observation never claims sent", () => {
    expect(view.facts.payoutSentWithoutBeneficiaryCredit).toBe(false);
    expect(view.stages.some((s) => s.stage === "PAYOUT_SENT")).toBe(false);
  });
});

describe("a payout sent is not beneficiary credit (the surface can say it)", () => {
  const view = foldProgressTimeline(
    [
      observation("INTENT_RECORDED", "ACHIEVED"),
      observation("QUOTE_ACCEPTED", "ACHIEVED"),
      observation("FUNDING_RECEIVED", "ACHIEVED"),
      observation("PAYOUT_SUBMITTED", "ACHIEVED", { providerStatus: "outgoing_payment_sent" }),
      observation("PAYOUT_SENT", "ACHIEVED", { providerStatus: "outgoing_payment_sent" }),
    ],
    { now: NOW },
  );

  it("the sent stage carries the honest not-beneficiary-credit statement", () => {
    const sent = view.stages.find((s) => s.stage === "PAYOUT_SENT");
    expect(sent?.explanation).toContain("not beneficiary credit");
    expect(sent?.providerStatus).toBe("outgoing_payment_sent");
  });

  it("the fact flag is true until a separate BENEFICIARY_CREDITED observation exists", () => {
    expect(view.facts.payoutSentWithoutBeneficiaryCredit).toBe(true);
  });

  it("the late-return path is stated whenever a payout was sent", () => {
    expect(view.facts.returnPathOpen).toBe(true);
    expect(view.outcomeLine).toContain("days or weeks");
    expect(view.outcomeLine).toContain("nothing is rewritten");
  });

  it("BENEFICIARY_CREDITED closes the fact only with its own evidence-backed observation", () => {
    const credited = foldProgressTimeline(
      [
        observation("PAYOUT_SENT", "ACHIEVED"),
        observation("BENEFICIARY_CREDITED", "ACHIEVED", {
          authorityRecordRef: "record:rail-observation",
          evidenceRefs: ["evidence:rail:credit"],
        }),
      ],
      { now: NOW },
    );
    expect(credited.facts.payoutSentWithoutBeneficiaryCredit).toBe(false);
    const stage = credited.stages.find((s) => s.stage === "BENEFICIARY_CREDITED");
    expect(stage?.evidenceRefs).toEqual(["evidence:rail:credit"]);
  });

  it("BENEFICIARY_CREDITED claimed ACHIEVED without evidence is refused (no fabricated provider effects)", () => {
    expect(() =>
      foldProgressTimeline([observation("BENEFICIARY_CREDITED", "ACHIEVED")], { now: NOW }),
    ).toThrow(/BENEFICIARY_CREDITED cannot be claimed ACHIEVED without evidence/);
  });
});

describe("UNKNOWN is not FAILED (INV-04 at the UX boundary)", () => {
  const view = foldProgressTimeline(
    [
      observation("INTENT_RECORDED", "ACHIEVED"),
      observation("PAYOUT_SUBMITTED", "UNKNOWN", {
        authorityRecordRef: "record:ambiguous-timeout",
        evidenceRefs: ["evidence:timeout"],
      }),
    ],
    { now: NOW },
  );

  it("UNKNOWN renders as neither failure nor success with the reconciliation-first wording", () => {
    const unknown = view.stages.find((s) => s.stage === "PAYOUT_SUBMITTED");
    expect(unknown?.status).toBe("UNKNOWN");
    expect(unknown?.tone).toBe("warning");
    expect(unknown?.headline).toBe("This stage is not yet decided");
    expect(unknown?.explanation).toContain("neither failure nor success");
    expect(unknown?.explanation).toContain("no blind retry");
  });

  it("a FAILED stage renders honestly as failure (distinct from UNKNOWN)", () => {
    const failed = foldProgressTimeline(
      [observation("FUNDING_RECEIVED", "FAILED", { evidenceRefs: ["evidence:fail"] })],
      { now: NOW },
    );
    const stage = failed.stages.find((s) => s.stage === "FUNDING_RECEIVED");
    expect(stage?.status).toBe("FAILED");
    expect(stage?.tone).toBe("danger");
  });

  it("return/refund stage views state new-history, never a rewrite", () => {
    const returned = foldProgressTimeline(
      [
        observation("PAYOUT_SENT", "ACHIEVED"),
        observation("RETURNED", "ACHIEVED", { evidenceRefs: ["evidence:return"] }),
        observation("REFUNDED", "ACHIEVED", { evidenceRefs: ["evidence:refund"] }),
      ],
      { now: NOW },
    );
    const returnedStage = returned.stages.find((s) => s.stage === "RETURNED");
    expect(returnedStage?.explanation).toContain("never as a rewrite");
    const refundedStage = returned.stages.find((s) => s.stage === "REFUNDED");
    expect(refundedStage?.explanation).toContain("not a mutation of history");
  });
});

describe("projection law + fail-closed guards (INV-23)", () => {
  it("every stage view carries a reference to the authoritative record, never the record", () => {
    const view = foldProgressTimeline([observation("INTENT_RECORDED", "ACHIEVED")], { now: NOW });
    for (const stage of view.stages) {
      expect(stage.authorityRecordRef).toMatch(/^record:/);
      expect(typeof stage.observedAt).toBe("string");
    }
  });

  it("stages render in canonical lifecycle order regardless of input order", () => {
    const view = foldProgressTimeline(
      [
        observation("PAYOUT_SENT", "ACHIEVED"),
        observation("INTENT_RECORDED", "ACHIEVED"),
        observation("QUOTE_ACCEPTED", "ACHIEVED"),
      ],
      { now: NOW },
    );
    expect(view.stages.map((s) => s.stage)).toEqual([
      "INTENT_RECORDED",
      "QUOTE_ACCEPTED",
      "PAYOUT_SENT",
    ]);
  });

  it("duplicate stages are refused", () => {
    expect(() =>
      foldProgressTimeline(
        [observation("INTENT_RECORDED", "ACHIEVED"), observation("INTENT_RECORDED", "PENDING")],
        { now: NOW },
      ),
    ).toThrow(/duplicate stage/);
  });

  it("empty observations render the honest empty timeline (never a fabricated one)", () => {
    const empty = foldProgressTimeline([], { now: NOW });
    expect(empty.stages).toHaveLength(0);
    expect(empty.outcomeLine).toContain("only what the authoritative planes record");
    expect(empty.facts.submissionIsNotFinality).toBe(false);
  });

  it("unknown stages and empty record refs are refused", () => {
    expect(() =>
      foldProgressTimeline(
        [{ ...observation("INTENT_RECORDED", "ACHIEVED"), stage: "MAGIC" as never }],
        { now: NOW },
      ),
    ).toThrow(/closed/);
    expect(() =>
      foldProgressTimeline(
        [{ ...observation("INTENT_RECORDED", "ACHIEVED"), authorityRecordRef: "" }],
        { now: NOW },
      ),
    ).toThrow(/authorityRecordRef/);
  });
});
