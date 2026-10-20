import { describe, expect, it } from "vitest";
import {
  LATE_EVENT_KINDS,
  LATE_EVENT_SURFACE_STAGES,
  applyLateEvent,
  certifyLateEventHonesty,
} from "../src/index.ts";
import { conformingLateEventProbe } from "./fixtures.ts";

/**
 * FIN-LAW-06 — late returns/refunds/chargebacks (hard law 6):
 * first-class late events that re-open reconciled state honestly (no
 * silent absorption).
 */
describe("FIN-LAW-06: late returns/refunds/chargebacks", () => {
  it("the conforming late-return probe passes (state REOPENED, lineage carried)", () => {
    const probe = conformingLateEventProbe();
    const verdict = certifyLateEventHonesty({
      subjectRef: "corridor:test",
      prior: probe.prior,
      late: probe.late,
      after: probe.after,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it("every late kind maps onto its pinned surface stage", () => {
    expect(LATE_EVENT_KINDS).toEqual(["RETURN", "REFUND", "CHARGEBACK"]);
    expect(LATE_EVENT_SURFACE_STAGES).toEqual({
      RETURN: "RETURNED",
      REFUND: "REFUNDED",
      CHARGEBACK: "CHARGED_BACK",
    });
  });

  it("applyLateEvent RE-OPENS with full lineage (prior record preserved verbatim)", () => {
    const probe = conformingLateEventProbe();
    const reopened = probe.reopened;
    expect(reopened.status).toBe("REOPENED");
    expect(reopened.reopenedBy).toBe("RETURN");
    expect(reopened.priorRecordRef).toBe(probe.prior.recordRef);
    expect(reopened.priorRecordDigest).toBe(probe.prior.recordDigest);
    expect(reopened.surfaceStage).toBe("RETURNED");
    expect(reopened.lateEvent.providerRef).toBe("ret:provider-77");
  });

  it("SILENT ABSORPTION (state unchanged after the late event) violates the law", () => {
    const probe = conformingLateEventProbe();
    const verdict = certifyLateEventHonesty({
      subjectRef: "corridor:test",
      prior: probe.prior,
      late: probe.late,
      after: { status: "RECONCILED" },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("never silently absorbed");
  });

  it("a HISTORY REWRITE (the reopened record does not carry the prior digest) violates the law", () => {
    const probe = conformingLateEventProbe();
    const verdict = certifyLateEventHonesty({
      subjectRef: "corridor:test",
      prior: probe.prior,
      late: probe.late,
      after: {
        status: "REOPENED",
        priorRecordDigest: "fnv1a64:9999999999999999",
        surfaceStage: "RETURNED",
      },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("history is never rewritten");
  });

  it("a late event with NO surface stage (a hidden edit) violates the law", () => {
    const probe = conformingLateEventProbe();
    const verdict = certifyLateEventHonesty({
      subjectRef: "corridor:test",
      prior: probe.prior,
      late: probe.late,
      after: {
        status: "REOPENED",
        priorRecordDigest: probe.prior.recordDigest,
      },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("customer-visible lifecycle stage");
  });

  it("a WRONG surface stage for the late kind violates the law", () => {
    const probe = conformingLateEventProbe();
    const verdict = certifyLateEventHonesty({
      subjectRef: "corridor:test",
      prior: probe.prior,
      late: probe.late,
      after: {
        status: "REOPENED",
        priorRecordDigest: probe.prior.recordDigest,
        surfaceStage: "REFUNDED",
      },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("pinned late stage 'RETURNED'");
  });

  it("an IMPOSSIBLE ordering (received before occurred) fails closed at construction", () => {
    const probe = conformingLateEventProbe();
    expect(() =>
      applyLateEvent(probe.prior, {
        ...probe.late,
        receivedAt: probe.late.occurredAt - 1n,
      }),
    ).toThrow(/impossible/);
  });

  it("refund and chargeback late events re-open with their own stages", () => {
    const probe = conformingLateEventProbe();
    const refund = applyLateEvent(probe.prior, { ...probe.late, kind: "REFUND" });
    expect(refund.surfaceStage).toBe("REFUNDED");
    const chargeback = applyLateEvent(probe.prior, { ...probe.late, kind: "CHARGEBACK" });
    expect(chargeback.surfaceStage).toBe("CHARGED_BACK");
    expect(chargeback.status).toBe("REOPENED");
  });

  it("malformed late events fail closed (non-positive amount, bad currency)", () => {
    const probe = conformingLateEventProbe();
    expect(() =>
      applyLateEvent(probe.prior, { ...probe.late, amountMinor: 0n }),
    ).toThrow(/positive amount/);
    expect(() =>
      applyLateEvent(probe.prior, { ...probe.late, currency: "EUROS" }),
    ).toThrow(/3-letter currency/);
  });
});
