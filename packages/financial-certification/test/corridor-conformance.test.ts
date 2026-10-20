import { describe, expect, it } from "vitest";
import {
  CertificationHaltError,
  CertificationRecordLedger,
  FinancialPromotionLedger,
  applyLateEvent,
  certifyAmbiguityDiscipline,
  certifyEndpointIdempotency,
  certifyLateEventHonesty,
  certifyLegSeparation,
  certifyOrderIndependence,
  certifyQuoteGrounding,
  defaultFinancialSuiteFor,
  evaluateFinancialSuite,
  runFinancialGateWall,
} from "../src/index.ts";
import type { ConformanceVerdict } from "../src/index.ts";
import {
  T0,
  T0_NUM,
  conformingAmbiguityDossier,
  conformingCommandFor,
  conformingDispatchLog,
  conformingEvidence,
  conformingEventSet,
  conformingLateEventProbe,
  conformingLegs,
  conformingQuote,
} from "./fixtures.ts";

/**
 * THE END-TO-END certification matrix: a synthetic conforming corridor
 * drives every per-law verifier, crosses the uniform gate wall, passes
 * the suite evaluation, is recorded in the digest chain and promotes —
 * then a NON-CONFORMING corridor is proven to halt at promotion (the
 * gate wall law, exercised through the whole stack).
 */
describe("the end-to-end corridor certification matrix", () => {
  const SUBJECT = {
    componentKind: "corridor" as const,
    subjectId: "corridor:psp-alpha-sepa",
    version: "1.0.0",
  };

  function conformingDossierVerdicts(): ConformanceVerdict[] {
    const quote = conformingQuote();
    return [
      certifyQuoteGrounding({
        subjectRef: SUBJECT.subjectId,
        quote,
        at: { windowAt: T0, freshnessAt: T0_NUM },
        command: conformingCommandFor(quote),
        scenarioId: "QUOTE_EXPIRY",
      }),
      certifyQuoteGrounding({
        subjectRef: SUBJECT.subjectId,
        quote,
        at: { windowAt: T0, freshnessAt: T0_NUM },
        command: conformingCommandFor(quote),
        scenarioId: "QUOTE_MATERIAL_CHANGE",
      }),
      certifyEndpointIdempotency({
        subjectRef: SUBJECT.subjectId,
        dispatches: conformingDispatchLog(),
        evidenceRefs: ["ev:hermetic-1"],
      }),
      certifyLegSeparation({
        subjectRef: SUBJECT.subjectId,
        ...conformingLegs(),
        evidenceRefs: ["ev:hermetic-1"],
      }),
      certifyOrderIndependence({
        subjectRef: SUBJECT.subjectId,
        // The payout object's events WITHOUT duplicates (pure out-of-order).
        events: conformingEventSet()
          .filter((event) => event.externalId === "obj:payout-1")
          .filter(
            (event, index, all) =>
              all.findIndex((x) => x.eventId === event.eventId) === index,
          ),
        evidenceRefs: ["ev:hermetic-1"],
      }),
      certifyOrderIndependence({
        subjectRef: SUBJECT.subjectId,
        events: conformingEventSet(),
        evidenceRefs: ["ev:hermetic-1"],
      }),
      certifyAmbiguityDiscipline({
        subjectRef: SUBJECT.subjectId,
        ...conformingAmbiguityDossier(),
        evidenceRefs: ["ev:hermetic-1"],
      }).verdict,
      certifyLateEventHonesty({
        subjectRef: SUBJECT.subjectId,
        ...pickLateProbe(),
        evidenceRefs: ["ev:hermetic-1"],
      }),
    ];
  }

  function pickLateProbe() {
    const probe = conformingLateEventProbe();
    return { prior: probe.prior, late: probe.late, after: probe.after };
  }

  function scenarioResultsFor(verdicts: readonly ConformanceVerdict[]) {
    const byScenario = new Map<string, ConformanceVerdict[]>();
    for (const verdict of verdicts) {
      if (verdict.scenarioId === "NONE") {
        continue;
      }
      const bucket = byScenario.get(verdict.scenarioId) ?? [];
      bucket.push(verdict);
      byScenario.set(verdict.scenarioId, bucket);
    }
    return [...byScenario.entries()].map(([scenarioId, bucket]) => ({
      scenarioId: scenarioId as never,
      verdict: (bucket.every((v) => v.passed) ? "PASS" : "FAIL") as "PASS" | "FAIL",
      basis: `${String(bucket.length)} conformance verdict(s)`,
      lawIds: bucket.map((v) => v.lawId),
      evidenceRefs: ["ev:hermetic-1"],
    }));
  }

  it("the conforming corridor certifies end-to-end (verifiers -> wall -> suite -> record -> promotion)", () => {
    const verdicts = conformingDossierVerdicts();
    // Every law exercised, every scenario family covered.
    expect(verdicts).toHaveLength(8);
    expect(verdicts.every((verdict) => verdict.passed)).toBe(true);
    expect(new Set(verdicts.map((v) => v.scenarioId)).size).toBe(8);

    // The uniform gate wall.
    const wall = runFinancialGateWall({
      candidateId: SUBJECT.subjectId,
      componentKind: SUBJECT.componentKind,
      isIncumbentBaseline: false,
      conformanceVerdicts: verdicts,
      evidence: conformingEvidence(),
    });
    expect(wall.passed).toBe(true);

    // The suite evaluation (all eight scenarios accounted).
    const suite = defaultFinancialSuiteFor(SUBJECT.componentKind);
    const evaluation = evaluateFinancialSuite({
      suite,
      subject: SUBJECT,
      scenarioResults: scenarioResultsFor(verdicts),
      gateChecks: wall.gateChecks,
    });
    expect(evaluation.passed).toBe(true);
    expect(evaluation.notApplicable).toEqual([]);

    // The digest-chained record.
    const ledger = new CertificationRecordLedger();
    const record = ledger.append({
      recordId: "rec:psp-alpha-1",
      subject: SUBJECT,
      suiteId: suite.suiteId,
      suiteVersion: suite.suiteVersion,
      evaluation,
      wall: {
        passed: wall.passed,
        wallDigest: wall.wallDigest,
        failedGates: wall.failedGates,
      },
      evidence: conformingEvidence(),
      recordedAt: "2026-10-20T12:00:00Z",
    });
    expect(ledger.verifyChain()).toEqual({ ok: true, records: 1 });

    // The promotion artifact (a contract, not a deployment).
    const promotions = new FinancialPromotionLedger();
    const promotion = promotions.orderPromotion({
      promotionId: "promo:psp-alpha-1",
      subject: SUBJECT,
      certificationRecord: record,
      promotedAt: "2026-10-20T12:01:00Z",
    });
    expect(promotion.certificationRecordDigest).toBe(record.recordDigest);
    expect(promotions.allPromotions()).toHaveLength(1);
  });

  it("the NON-CONFORMING corridor (an expired-quote execution) fails the wall and HALTS at promotion", () => {
    const quote = conformingQuote();
    const violating = certifyQuoteGrounding({
      subjectRef: SUBJECT.subjectId,
      quote,
      at: { windowAt: quote.validUntil + 1n, freshnessAt: T0_NUM },
      command: conformingCommandFor(quote),
      scenarioId: "QUOTE_EXPIRY",
    });
    expect(violating.passed).toBe(false);

    const verdicts = conformingDossierVerdicts().map((verdict) =>
      verdict.lawId === "FIN-LAW-01" && verdict.scenarioId === "QUOTE_EXPIRY"
        ? violating
        : verdict,
    );
    const wall = runFinancialGateWall({
      candidateId: SUBJECT.subjectId,
      componentKind: SUBJECT.componentKind,
      isIncumbentBaseline: false,
      conformanceVerdicts: verdicts,
      evidence: conformingEvidence(),
    });
    expect(wall.passed).toBe(false);
    expect(wall.failedGates).toEqual(["QUOTE_HONESTY"]);

    const suite = defaultFinancialSuiteFor(SUBJECT.componentKind);
    const evaluation = evaluateFinancialSuite({
      suite,
      subject: SUBJECT,
      scenarioResults: scenarioResultsFor(verdicts),
      gateChecks: wall.gateChecks,
    });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failedGates).toEqual(["QUOTE_HONESTY"]);
    expect(evaluation.failedScenarios).toEqual(["QUOTE_EXPIRY"]);

    const ledger = new CertificationRecordLedger();
    const record = ledger.append({
      recordId: "rec:psp-alpha-bad",
      subject: SUBJECT,
      suiteId: suite.suiteId,
      suiteVersion: suite.suiteVersion,
      evaluation,
      wall: {
        passed: wall.passed,
        wallDigest: wall.wallDigest,
        failedGates: wall.failedGates,
      },
      evidence: conformingEvidence(),
      recordedAt: "2026-10-20T12:00:00Z",
    });
    const promotions = new FinancialPromotionLedger();
    expect(() =>
      promotions.orderPromotion({
        promotionId: "promo:psp-alpha-bad",
        subject: SUBJECT,
        certificationRecord: record,
        promotedAt: "2026-10-20T12:01:00Z",
      }),
    ).toThrow(CertificationHaltError);
    expect(promotions.haltedOrders()[0]?.failedGates).toEqual(["QUOTE_HONESTY"]);
  });

  it("the same matrix runs UNCHANGED for provider and route kinds (the uniformity law, end to end)", () => {
    const verdicts = conformingDossierVerdicts();
    for (const componentKind of ["provider", "route"] as const) {
      const subject = { ...SUBJECT, componentKind };
      const wall = runFinancialGateWall({
        candidateId: subject.subjectId,
        componentKind,
        isIncumbentBaseline: false,
        conformanceVerdicts: verdicts,
        evidence: conformingEvidence(),
      });
      const evaluation = evaluateFinancialSuite({
        suite: defaultFinancialSuiteFor(componentKind),
        subject,
        scenarioResults: scenarioResultsFor(verdicts),
        gateChecks: wall.gateChecks,
      });
      expect(wall.passed, componentKind).toBe(true);
      expect(evaluation.passed, componentKind).toBe(true);
    }
  });

  it("late events re-open through the REAL applyLateEvent path (lineage verifiable)", () => {
    const probe = conformingLateEventProbe();
    const reopened = applyLateEvent(probe.prior, probe.late);
    expect(reopened.priorRecordDigest).toBe(probe.prior.recordDigest);
    expect(reopened.status).toBe("REOPENED");
  });
});
