import { describe, expect, it } from "vitest";
import {
  CertificationHaltError,
  CertificationRecordError,
  CertificationRecordLedger,
  FinancialPromotionLedger,
  defaultFinancialSuiteFor,
  evaluateFinancialSuite,
  runFinancialGateWall,
} from "../src/index.ts";
import type { ChainedCertificationRecord } from "../src/index.ts";
import {
  conformingEvidence,
  conformingVerdicts,
} from "./fixtures.ts";

/**
 * The escalate-only promotion ledger: certification first, irreversible
 * halts, remediation-only clearing, no double promotion — and the
 * waiver request is structurally impossible.
 */
describe("the escalate-only promotion ledger", () => {
  function appendRecord(
    ledger: CertificationRecordLedger,
    recordId: string,
    options: { readonly fail: boolean; readonly version?: string },
  ): ChainedCertificationRecord {
    const wall = runFinancialGateWall({
      candidateId: "corridor:candidate-1",
      componentKind: "corridor",
      isIncumbentBaseline: false,
      conformanceVerdicts: options.fail
        ? conformingVerdicts().map((verdict) =>
            verdict.lawId === "FIN-LAW-02"
              ? { ...verdict, passed: false, violations: ["second external effect"] }
              : verdict,
          )
        : conformingVerdicts(),
      evidence: conformingEvidence(),
    });
    const evaluation = evaluateFinancialSuite({
      suite: defaultFinancialSuiteFor("corridor"),
      subject: {
        componentKind: "corridor",
        subjectId: "corridor:candidate-1",
        version: options.version ?? "1.0.0",
      },
      scenarioResults: [
        "QUOTE_EXPIRY",
        "QUOTE_MATERIAL_CHANGE",
        "ENDPOINT_IDEMPOTENCY",
        "FUNDING_PAYOUT_SEPARATION",
        "DUPLICATE_PROVIDER_EVENTS",
        "OUT_OF_ORDER_PROVIDER_EVENTS",
        "AMBIGUOUS_TIMEOUT_RECONCILIATION",
        "LATE_RETURNS_REFUNDS_CHARGEBACKS",
      ].map((scenarioId) => ({
        scenarioId: scenarioId as never,
        verdict: "PASS" as const,
        basis: "conformance verdicts all passed",
        lawIds: [],
        evidenceRefs: ["ev:hermetic-1"],
      })),
      gateChecks: wall.gateChecks,
    });
    return ledger.append({
      recordId,
      subject: {
        componentKind: "corridor",
        subjectId: "corridor:candidate-1",
        version: options.version ?? "1.0.0",
      },
      suiteId: "financial-suite:corridor",
      suiteVersion: 1,
      evaluation,
      wall: {
        passed: wall.passed,
        wallDigest: wall.wallDigest,
        failedGates: wall.failedGates,
      },
      evidence: conformingEvidence(),
      recordedAt: "2026-10-20T12:00:00Z",
    });
  }

  it("a PASSED certification promotes (a versioned, digested artifact)", () => {
    const records = new CertificationRecordLedger();
    const promotions = new FinancialPromotionLedger();
    const record = appendRecord(records, "rec:1", { fail: false });
    const promotion = promotions.orderPromotion({
      promotionId: "promo:1",
      subject: record.subject,
      certificationRecord: record,
      promotedAt: "2026-10-20T12:01:00Z",
    });
    expect(promotion.certificationRecordDigest).toBe(record.recordDigest);
    expect(promotion.promotionDigest).toMatch(/^fnv1a64:/);
    expect(promotions.allPromotions()).toHaveLength(1);
  });

  it("a FAILED wall HALTS the promotion IRREVERSIBLY (certification first)", () => {
    const records = new CertificationRecordLedger();
    const promotions = new FinancialPromotionLedger();
    const failedRecord = appendRecord(records, "rec:bad-1", { fail: true });
    expect(() =>
      promotions.orderPromotion({
        promotionId: "promo:bad-1",
        subject: failedRecord.subject,
        certificationRecord: failedRecord,
        promotedAt: "2026-10-20T12:01:00Z",
      }),
    ).toThrow(CertificationHaltError);
    expect(promotions.haltedOrders()).toHaveLength(1);
    expect(promotions.haltedOrders()[0]?.failedGates).toEqual(["IDEMPOTENCY"]);
    expect(promotions.allPromotions()).toHaveLength(0);
    // The halted subject cannot be promoted by re-trying the same version.
    const retryRecord = appendRecord(records, "rec:bad-2", {
      fail: false,
      version: failedRecord.subject.version,
    });
    expect(() =>
      promotions.orderPromotion({
        promotionId: "promo:bad-2",
        subject: retryRecord.subject,
        certificationRecord: retryRecord,
        promotedAt: "2026-10-20T12:02:00Z",
      }),
    ).toThrow(CertificationHaltError);
    expect(promotions.unremediatedHaltsFor("corridor:candidate-1")).toHaveLength(1);
  });

  it("a halt is cleared ONLY by a NEW promotion carrying remediation evidence", () => {
    const records = new CertificationRecordLedger();
    const promotions = new FinancialPromotionLedger();
    const failedRecord = appendRecord(records, "rec:f1", { fail: true });
    expect(() =>
      promotions.orderPromotion({
        promotionId: "promo:f1",
        subject: failedRecord.subject,
        certificationRecord: failedRecord,
        promotedAt: "2026-10-20T12:01:00Z",
      }),
    ).toThrow(CertificationHaltError);
    const cleared = appendRecord(records, "rec:f2", { fail: false });
    // No remediation -> still halted.
    expect(() =>
      promotions.orderPromotion({
        promotionId: "promo:f2",
        subject: cleared.subject,
        certificationRecord: cleared,
        promotedAt: "2026-10-20T12:02:00Z",
      }),
    ).toThrow(CertificationHaltError);
    // Remediation with NO evidence refs is rejected (evidence, never assertion).
    expect(() =>
      promotions.orderPromotion({
        promotionId: "promo:f2b",
        subject: cleared.subject,
        certificationRecord: cleared,
        promotedAt: "2026-10-20T12:02:30Z",
        remediation: { clearingRecordId: cleared.recordId, evidenceRefs: [] },
      }),
    ).toThrow(/non-empty/);
    // With remediation citing the clearing record -> promoted.
    const promotion = promotions.orderPromotion({
      promotionId: "promo:f3",
      subject: cleared.subject,
      certificationRecord: cleared,
      promotedAt: "2026-10-20T12:03:00Z",
      remediation: {
        clearingRecordId: cleared.recordId,
        evidenceRefs: ["ev:remediation-1"],
      },
    });
    expect(promotion.promotionId).toBe("promo:f3");
    expect(promotions.unremediatedHaltsFor("corridor:candidate-1")).toHaveLength(0);
  });

  it("a subject version cannot be promoted twice (certification is per version)", () => {
    const records = new CertificationRecordLedger();
    const promotions = new FinancialPromotionLedger();
    const record = appendRecord(records, "rec:1", { fail: false });
    promotions.orderPromotion({
      promotionId: "promo:1",
      subject: record.subject,
      certificationRecord: record,
      promotedAt: "2026-10-20T12:01:00Z",
    });
    expect(() =>
      promotions.orderPromotion({
        promotionId: "promo:2",
        subject: record.subject,
        certificationRecord: record,
        promotedAt: "2026-10-20T12:02:00Z",
      }),
    ).toThrow(/already promoted/);
  });

  it("a MUTATED certification record cannot promote (only verifiable records)", () => {
    const records = new CertificationRecordLedger();
    const promotions = new FinancialPromotionLedger();
    const record = appendRecord(records, "rec:1", { fail: false });
    const mutated = {
      ...record,
      recordedAt: "2030-01-01T00:00:00Z",
    } as ChainedCertificationRecord;
    expect(() =>
      promotions.orderPromotion({
        promotionId: "promo:mut",
        subject: record.subject,
        certificationRecord: mutated,
        promotedAt: "2026-10-20T12:01:00Z",
      }),
    ).toThrow(CertificationRecordError);
    expect(
      (() => {
        try {
          promotions.orderPromotion({
            promotionId: "promo:mut2",
            subject: record.subject,
            certificationRecord: mutated,
            promotedAt: "2026-10-20T12:02:00Z",
          });
          return "";
        } catch (error) {
          return error instanceof Error ? error.message : "";
        }
      })(),
    ).toContain("digest does not recompute");
  });

  it("the promotion ledger's waiver request is structurally impossible", () => {
    const promotions = new FinancialPromotionLedger();
    expect(() =>
      promotions.requestGateWaiver({
        subjectId: "corridor:candidate-1",
        gateId: "LEG_SEPARATION",
        justification: "please",
      }),
    ).toThrow(/cannot be waived or downgraded/);
  });

  it("promotion history is append-only and per-subject", () => {
    const records = new CertificationRecordLedger();
    const promotions = new FinancialPromotionLedger();
    const v1 = appendRecord(records, "rec:v1", { fail: false, version: "1.0.0" });
    const v2 = appendRecord(records, "rec:v2", { fail: false, version: "2.0.0" });
    promotions.orderPromotion({
      promotionId: "promo:v1",
      subject: v1.subject,
      certificationRecord: v1,
      promotedAt: "2026-10-20T12:01:00Z",
    });
    promotions.orderPromotion({
      promotionId: "promo:v2",
      subject: v2.subject,
      certificationRecord: v2,
      promotedAt: "2026-10-20T12:02:00Z",
    });
    expect(promotions.historyFor("corridor:candidate-1")).toHaveLength(2);
    expect(promotions.historyFor("corridor:nobody")).toEqual([]);
  });
});
