import { describe, expect, it } from "vitest";
import {
  UNIFORM_FINANCIAL_GATE_IDS,
  UNIFORM_FINANCIAL_GATE_REQUIREMENTS,
  evaluateFinancialGateWall,
  requestGateWaiver,
  runFinancialGateWall,
  type FinancialCertificationCandidate,
  type FinancialGateRequirements,
} from "../src/index.ts";
import { WaiverImpossibleError } from "../src/index.ts";
import { conformingEvidence, conformingVerdicts } from "./fixtures.ts";

/**
 * FIN-LAW-07 — the uniform gate wall (hard law 7): certification suites
 * are uniform across component kinds; a FAILED gate halts promotion and
 * CANNOT be downgraded or waived (escalate-only).
 */
describe("FIN-LAW-07: the uniform certification gate wall", () => {
  function candidate(
    overrides: Partial<FinancialCertificationCandidate> = {},
  ): FinancialCertificationCandidate {
    return {
      candidateId: "corridor:candidate-1",
      componentKind: "corridor",
      isIncumbentBaseline: false,
      conformanceVerdicts: conformingVerdicts(),
      evidence: conformingEvidence(),
      ...overrides,
    };
  }

  it("the conforming candidate passes ALL SEVEN uniform gates", () => {
    const result = runFinancialGateWall(candidate());
    expect(result.passed).toBe(true);
    expect(result.failedGates).toEqual([]);
    expect(result.gateChecks.map((check) => check.gateId)).toEqual([
      ...UNIFORM_FINANCIAL_GATE_IDS,
    ]);
    expect(result.requirements).toBe(UNIFORM_FINANCIAL_GATE_REQUIREMENTS);
  });

  it("THE UNIFORMITY LAW: identical submissions pass identically for EVERY component kind", () => {
    const base = candidate();
    const results = (["corridor", "provider", "route"] as const).map((kind) =>
      runFinancialGateWall({ ...base, componentKind: kind }),
    );
    for (const result of results) {
      expect(result.passed).toBe(true);
      expect(result.gateChecks).toEqual(results[0]?.gateChecks);
    }
    // The wall digest does not depend on the kind either (attribution rides
    // on the result, never the decision).
    expect(new Set(results.map((r) => r.wallDigest)).size).toBe(1);
  });

  it("an INCUMBENT BASELINE is gated IDENTICALLY (no incumbent bypass)", () => {
    const incumbent = candidate({ isIncumbentBaseline: true });
    const result = runFinancialGateWall(incumbent);
    expect(result.passed).toBe(true);
    expect(result.isIncumbentBaseline).toBe(true);
    // A failing incumbent is rejected exactly like every other candidate.
    const failingIncumbent = candidate({
      isIncumbentBaseline: true,
      conformanceVerdicts: conformingVerdicts().map((verdict) =>
        verdict.lawId === "FIN-LAW-02"
          ? { ...verdict, passed: false }
          : verdict,
      ),
    });
    const failed = runFinancialGateWall(failingIncumbent);
    expect(failed.passed).toBe(false);
    expect(failed.failedGates).toEqual(["IDEMPOTENCY"]);
  });

  it("a failed law verdict fails ITS gate (and only its gate)", () => {
    const failing = candidate({
      conformanceVerdicts: conformingVerdicts().map((verdict) =>
        verdict.lawId === "FIN-LAW-03"
          ? { ...verdict, passed: false, violations: ["legs fused"] }
          : verdict,
      ),
    });
    const result = runFinancialGateWall(failing);
    expect(result.passed).toBe(false);
    expect(result.failedGates).toEqual(["LEG_SEPARATION"]);
    const check = result.gateChecks.find((c) => c.gateId === "LEG_SEPARATION");
    expect(check?.violations.join(" ")).toContain("legs fused");
  });

  it("an UNEXERCISED law fails its gate (no verdict presented)", () => {
    const missing = candidate({
      conformanceVerdicts: conformingVerdicts().filter(
        (verdict) => verdict.lawId !== "FIN-LAW-05",
      ),
    });
    const result = runFinancialGateWall(missing);
    expect(result.failedGates).toEqual(["AMBIGUITY_DISCIPLINE"]);
    expect(
      result.gateChecks
        .find((c) => c.gateId === "AMBIGUITY_DISCIPLINE")
        ?.violations.join(" "),
    ).toContain("never exercised");
  });

  it("a PASSING verdict with NO evidence references is rejected (a pass is never fabricated)", () => {
    const unevidenced = candidate({
      conformanceVerdicts: conformingVerdicts().map((verdict) =>
        verdict.lawId === "FIN-LAW-01" && verdict.scenarioId === "QUOTE_EXPIRY"
          ? { ...verdict, evidenceRefs: [] }
          : verdict,
      ),
    });
    const result = runFinancialGateWall(unevidenced);
    expect(result.failedGates).toContain("QUOTE_HONESTY");
    expect(
      result.gateChecks
        .find((c) => c.gateId === "QUOTE_HONESTY")
        ?.violations.join(" "),
    ).toContain("a pass is never fabricated");
  });

  it("EVIDENCE_LINEAGE fails on missing evidence, malformed digests and live claims", () => {
    const noEvidence = runFinancialGateWall(
      candidate({ evidence: [] }),
    );
    expect(noEvidence.failedGates).toContain("EVIDENCE_LINEAGE");
    const malformed = runFinancialGateWall(
      candidate({
        evidence: [
          {
            evidenceId: "ev:1",
            kind: "SYNTHETIC_CONTRACT_LEVEL",
            artifactRef: "artifact:1",
            contentDigest: "not-a-digest",
          },
        ],
      }),
    );
    expect(malformed.failedGates).toContain("EVIDENCE_LINEAGE");
    expect(
      malformed.gateChecks
        .find((c) => c.gateId === "EVIDENCE_LINEAGE")
        ?.violations.join(" "),
    ).toContain("malformed content digest");
    const liveClaim = runFinancialGateWall(
      candidate({
        evidence: [
          {
            evidenceId: "ev:2",
            kind: "LIVE_PROVIDER_EXECUTION",
            artifactRef: "artifact:2",
            contentDigest: "fnv1a64:1234567890abcdef",
          },
        ],
      }),
    );
    expect(liveClaim.failedGates).toContain("EVIDENCE_LINEAGE");
    expect(liveClaim.passed).toBe(false);
  });

  it("THE REQUIREMENTS are literal true — a downgraded requirements object fails closed", () => {
    const downgraded = {
      ...UNIFORM_FINANCIAL_GATE_REQUIREMENTS,
      requireIdempotency: false,
    } as unknown as FinancialGateRequirements;
    const checks = evaluateFinancialGateWall(
      {
        candidateId: "corridor:candidate-1",
        conformanceVerdicts: conformingVerdicts(),
        evidence: conformingEvidence(),
      },
      downgraded,
    );
    const idempotency = checks.find((c) => c.gateId === "IDEMPOTENCY");
    expect(idempotency?.passed).toBe(false);
    expect(idempotency?.violations.join(" ")).toContain(
      "requirements must require idempotency",
    );
  });

  it("THE WAIVER LAW: requesting a waiver ALWAYS throws (there is no downgrade path)", () => {
    expect(() =>
      requestGateWaiver({
        subjectId: "corridor:candidate-1",
        gateId: "IDEMPOTENCY",
        justification: "business pressure",
      }),
    ).toThrow(WaiverImpossibleError);
    expect(() =>
      requestGateWaiver({
        subjectId: "corridor:candidate-1",
        gateId: "QUOTE_HONESTY",
        justification: "the corridor is almost conformant",
      }),
    ).toThrow(/cannot be downgraded or waived/);
  });

  it("empty candidate ids fail closed", () => {
    expect(() =>
      runFinancialGateWall({ ...candidate(), candidateId: "" }),
    ).toThrow(/candidateId/);
  });

  it("the requirements constant is frozen and total (all seven requirements present)", () => {
    expect(Object.isFrozen(UNIFORM_FINANCIAL_GATE_REQUIREMENTS)).toBe(true);
    expect(Object.keys(UNIFORM_FINANCIAL_GATE_REQUIREMENTS).sort()).toEqual([
      "requireAmbiguityDiscipline",
      "requireEventOrdering",
      "requireEvidenceLineage",
      "requireIdempotency",
      "requireLateEventHonesty",
      "requireLegSeparation",
      "requireQuoteHonesty",
    ]);
  });
});
