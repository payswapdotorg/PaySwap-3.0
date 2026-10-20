import { describe, expect, it } from "vitest";
import {
  CertificationRecordLedger,
  certificationRecordBytes,
  defaultFinancialSuiteFor,
  evaluateFinancialSuite,
  runFinancialGateWall,
} from "../src/index.ts";
import type { SuiteEvaluationResult } from "../src/index.ts";
import {
  conformingEvidence,
  conformingVerdicts,
} from "./fixtures.ts";

/**
 * FIN-LAW-08 — versioned, digest-chained certification records: records
 * are byte-deterministic functions of their inputs; the chain breaks on
 * any historical tamper; live-claiming evidence is rejected at the door.
 */
describe("FIN-LAW-08: digest-chained certification records", () => {
  function conformingEvaluation(): SuiteEvaluationResult {
    const suite = defaultFinancialSuiteFor("corridor");
    const wall = runFinancialGateWall({
      candidateId: "corridor:candidate-1",
      componentKind: "corridor",
      isIncumbentBaseline: false,
      conformanceVerdicts: conformingVerdicts(),
      evidence: conformingEvidence(),
    });
    return evaluateFinancialSuite({
      suite,
      subject: {
        componentKind: "corridor",
        subjectId: "corridor:candidate-1",
        version: "1.0.0",
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
  }

  function appendConforming(
    ledger: CertificationRecordLedger,
    recordId: string,
    subjectVersion = "1.0.0",
  ) {
    return ledger.append({
      recordId,
      subject: {
        componentKind: "corridor",
        subjectId: "corridor:candidate-1",
        version: subjectVersion,
      },
      suiteId: "financial-suite:corridor",
      suiteVersion: 1,
      evaluation: conformingEvaluation(),
      wall: {
        passed: true,
        wallDigest: "fnv1a64:abcdefabcdefabcd",
        failedGates: [],
      },
      evidence: conformingEvidence(),
      recordedAt: "2026-10-20T12:00:00Z",
    });
  }

  it("records are BYTE-DETERMINISTIC functions of their inputs (identical inputs, identical bytes)", () => {
    const ledgerA = new CertificationRecordLedger();
    const ledgerB = new CertificationRecordLedger();
    const recordA = appendConforming(ledgerA, "rec:1");
    const recordB = appendConforming(ledgerB, "rec:1");
    expect(certificationRecordBytes(recordA)).toBe(
      certificationRecordBytes(recordB),
    );
    expect(recordA.recordDigest).toBe(recordB.recordDigest);
    expect(recordA.recordVersion).toBe(1);
    expect(recordA.previousRecordDigest).toBeNull();
  });

  it("the CHAIN: each record digests its predecessor (tamper breaks later digests)", () => {
    const ledger = new CertificationRecordLedger();
    const first = appendConforming(ledger, "rec:1", "1.0.0");
    const second = appendConforming(ledger, "rec:2", "1.1.0");
    expect(second.previousRecordDigest).toBe(first.recordDigest);
    expect(ledger.verifyChain()).toEqual({ ok: true, records: 2 });

    // Tamper with the FIRST record's content via the records array.
    const tampered = {
      ...first,
      recordedAt: "2030-01-01T00:00:00Z",
    } as typeof first;
    const internal = ledger as unknown as { records: typeof first[] };
    internal.records[0] = tampered;
    const verification = ledger.verifyChain();
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.breakage).toContain("does not recompute");
    }
  });

  it("splicing the chain (a reordered history) is detected", () => {
    const ledger = new CertificationRecordLedger();
    const first = appendConforming(ledger, "rec:1", "1.0.0");
    appendConforming(ledger, "rec:2", "1.1.0");
    const internal = ledger as unknown as { records: typeof first[] };
    internal.records.reverse();
    const verification = ledger.verifyChain();
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.breakage).toContain("does not chain");
    }
  });

  it("record ids are never reused (append-only)", () => {
    const ledger = new CertificationRecordLedger();
    appendConforming(ledger, "rec:1");
    expect(() => appendConforming(ledger, "rec:1")).toThrow(/never reused/);
  });

  it("a record without evidence is rejected (a pass is never fabricated)", () => {
    const ledger = new CertificationRecordLedger();
    expect(() =>
      ledger.append({
        recordId: "rec:0",
        subject: {
          componentKind: "corridor",
          subjectId: "corridor:candidate-1",
          version: "0.9.0",
        },
        suiteId: "financial-suite:corridor",
        suiteVersion: 1,
        evaluation: conformingEvaluation(),
        wall: { passed: true, wallDigest: "fnv1a64:abcdefabcdefabcd", failedGates: [] },
        evidence: [],
        recordedAt: "2026-10-20T12:00:00Z",
      }),
    ).toThrow(/at least one evidence artifact/);
  });

  it("LIVE-CLAIMING evidence is rejected at the door (LAW 9 at the record boundary)", () => {
    const ledger = new CertificationRecordLedger();
    expect(() =>
      ledger.append({
        recordId: "rec:live",
        subject: {
          componentKind: "corridor",
          subjectId: "corridor:candidate-1",
          version: "0.9.0",
        },
        suiteId: "financial-suite:corridor",
        suiteVersion: 1,
        evaluation: conformingEvaluation(),
        wall: { passed: true, wallDigest: "fnv1a64:abcdefabcdefabcd", failedGates: [] },
        evidence: [
          {
            evidenceId: "ev:live-1",
            kind: "MOCK_AS_LIVE",
            artifactRef: "artifact:live-1",
            contentDigest: "fnv1a64:1234567890abcdef",
          },
        ],
        recordedAt: "2026-10-20T12:00:00Z",
      }),
    ).toThrow(/MOCK_AS_LIVE/);
  });

  it("the evaluation must be for the record's subject", () => {
    const ledger = new CertificationRecordLedger();
    expect(() =>
      ledger.append({
        recordId: "rec:wrong-subject",
        subject: {
          componentKind: "corridor",
          subjectId: "corridor:SOMEONE-ELSE",
          version: "1.0.0",
        },
        suiteId: "financial-suite:corridor",
        suiteVersion: 1,
        evaluation: conformingEvaluation(),
        wall: { passed: true, wallDigest: "fnv1a64:abcdefabcdefabcd", failedGates: [] },
        evidence: conformingEvidence(),
        recordedAt: "2026-10-20T12:00:00Z",
      }),
    ).toThrow(/record's subject/);
  });

  it("historyFor filters by subject; recordById resolves; head tracks the chain tip", () => {
    const ledger = new CertificationRecordLedger();
    const first = appendConforming(ledger, "rec:1", "1.0.0");
    const second = appendConforming(ledger, "rec:2", "1.1.0");
    expect(ledger.head()).toBe(second);
    expect(ledger.historyFor("corridor:candidate-1")).toHaveLength(2);
    expect(ledger.historyFor("corridor:nobody")).toEqual([]);
    expect(ledger.recordById("rec:1")).toBe(first);
    expect(ledger.all()).toHaveLength(2);
  });

  it("a different record chain (different inputs) produces different digests", () => {
    const ledger = new CertificationRecordLedger();
    const first = appendConforming(ledger, "rec:1", "1.0.0");
    const second = appendConforming(ledger, "rec:2", "1.1.0");
    expect(first.recordDigest).not.toBe(second.recordDigest);
    expect(second.previousRecordDigest).toBe(first.recordDigest);
  });
});
