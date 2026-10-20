import { describe, expect, it } from "vitest";
import {
  certifyAmbiguityDiscipline,
  classifyAmbiguousOutcome,
  resolveUnknownOutcome,
} from "../src/index.ts";
import type { RecordedAmbiguousAttempt } from "../src/index.ts";
import { conformingAmbiguityDossier } from "./fixtures.ts";

/**
 * FIN-LAW-05 — ambiguous timeout -> UNKNOWN -> reconciliation (hard law
 * 5): a timeout NEVER resolves to failure or success directly; it
 * enters UNKNOWN with a mandatory reconciliation path that only
 * external evidence can close.
 */
describe("FIN-LAW-05: ambiguous timeout -> UNKNOWN -> reconciliation", () => {
  it("every ambiguous transport observation classifies to OUTCOME_UNKNOWN with mandatory reconciliation", () => {
    const expectedReasons: Record<string, string> = {
      TIMEOUT_AFTER_DISPATCH: "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      CONNECTION_LOST_AFTER_DISPATCH: "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH",
      MALFORMED_RESPONSE_AFTER_DISPATCH: "MALFORMED_RESPONSE_AFTER_DISPATCH",
    };
    for (const [kind, reason] of Object.entries(expectedReasons)) {
      const record = classifyAmbiguousOutcome({ kind: kind as "TIMEOUT_AFTER_DISPATCH" });
      expect(record.outcome, kind).toBe("OUTCOME_UNKNOWN");
      expect(record.requiresReconciliation, kind).toBe(true);
      expect(record.ambiguityReason, kind).toBe(reason);
    }
  });

  it("the classification is structural: an UNKNOWN record admits no success/failure branch", () => {
    const record = classifyAmbiguousOutcome({ kind: "TIMEOUT_AFTER_DISPATCH" });
    // The record type has exactly the UNKNOWN shape: its outcome literal is
    // OUTCOME_UNKNOWN — a CONFIRMED/FAILED record is not constructible from
    // the classifier (the type admits no other literal).
    const outcome: "OUTCOME_UNKNOWN" = record.outcome;
    expect(outcome).toBe("OUTCOME_UNKNOWN");
    expect(Object.keys(record).sort()).toEqual([
      "ambiguityReason",
      "outcome",
      "requiresReconciliation",
    ]);
  });

  it("the conforming dossier passes (UNKNOWN classified + external closure)", () => {
    const dossier = conformingAmbiguityDossier();
    const { verdict, summary } = certifyAmbiguityDiscipline({
      subjectRef: "corridor:test",
      ...dossier,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(true);
    expect(summary).toEqual({ attempts: 2, resolutions: 2, pendingReconciliation: 0 });
  });

  it("a timeout classified DIRECTLY as FAILED or SUCCEEDED violates the law", () => {
    const attempts: RecordedAmbiguousAttempt[] = [
      {
        commandRef: "cmd:bad-1",
        transport: { kind: "TIMEOUT_AFTER_DISPATCH" },
        classifiedOutcome: "FAILED",
      },
      {
        commandRef: "cmd:bad-2",
        transport: { kind: "TIMEOUT_AFTER_DISPATCH" },
        classifiedOutcome: "SUCCEEDED",
      },
    ];
    const { verdict } = certifyAmbiguityDiscipline({
      subjectRef: "corridor:test",
      attempts,
      resolutions: [],
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.length).toBe(2);
    expect(verdict.violations.join(" ")).toContain("NEVER resolves to failure or success directly");
  });

  it("closing an UNKNOWN with an INTERNAL source violates the law", () => {
    const dossier = conformingAmbiguityDossier();
    const { verdict } = certifyAmbiguityDiscipline({
      subjectRef: "corridor:test",
      attempts: dossier.attempts,
      resolutions: [
        {
          commandRef: "cmd:gamma-1",
          resolvedTo: "FAILED",
          closedBy: {
            source: "LOCAL_HEURISTIC_TIMEOUT_ASSUME_FAILED",
            evidenceRefs: ["ev:internal-guess"],
          },
        },
      ],
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("only EXTERNAL evidence can close an UNKNOWN");
  });

  it("closing an UNKNOWN with NO evidence references violates the law", () => {
    const dossier = conformingAmbiguityDossier();
    const { verdict } = certifyAmbiguityDiscipline({
      subjectRef: "corridor:test",
      attempts: dossier.attempts,
      resolutions: [
        {
          commandRef: "cmd:gamma-1",
          resolvedTo: "CONFIRMED",
          closedBy: { source: "EXTERNAL_PROVIDER_RETRIEVAL", evidenceRefs: [] },
        },
      ],
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("NO external evidence references");
  });

  it("a resolution for a command that never entered UNKNOWN is a phantom resolution", () => {
    const { verdict } = certifyAmbiguityDiscipline({
      subjectRef: "corridor:test",
      attempts: [],
      resolutions: [
        {
          commandRef: "cmd:phantom-1",
          resolvedTo: "CONFIRMED",
          closedBy: {
            source: "EXTERNAL_PROVIDER_RETRIEVAL",
            evidenceRefs: ["ev:retrieval-phantom"],
          },
        },
      ],
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("never entered UNKNOWN");
  });

  it("an honestly-open UNKNOWN is NOT a violation (it is pending reconciliation)", () => {
    const dossier = conformingAmbiguityDossier();
    const { verdict, summary } = certifyAmbiguityDiscipline({
      subjectRef: "corridor:test",
      attempts: dossier.attempts,
      resolutions: [],
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(true);
    expect(summary.pendingReconciliation).toBe(2);
  });

  it("resolveUnknownOutcome ACCEPTS external evidence and REJECTS internal sources", () => {
    expect(
      resolveUnknownOutcome({
        commandRef: "cmd:ok-1",
        resolvedTo: "CONFIRMED",
        evidence: {
          source: "EXTERNAL_PROVIDER_STATEMENT",
          evidenceRefs: ["ev:stmt-1"],
        },
      }),
    ).toMatchObject({ commandRef: "cmd:ok-1", resolvedTo: "CONFIRMED" });
    expect(() =>
      resolveUnknownOutcome({
        commandRef: "cmd:ok-1",
        resolvedTo: "FAILED",
        evidence: { source: "LOCAL_GUESS", evidenceRefs: ["ev:x"] },
      }),
    ).toThrow(/only external evidence/i);
    expect(() =>
      resolveUnknownOutcome({
        commandRef: "cmd:ok-1",
        resolvedTo: "CONFIRMED",
        evidence: { source: "EXTERNAL_PROVIDER_RETRIEVAL", evidenceRefs: [] },
      }),
    ).toThrow(/non-empty external evidence/);
  });
});
