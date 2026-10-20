import { describe, expect, it } from "vitest";
import {
  CONFORMANCE_SCENARIO_IDS,
  FINANCIAL_CERTIFICATION_LAWS,
  FINANCIAL_LAW_IDS,
  canonicalString,
  conformanceVerdict,
  contentDigest,
  isConformanceScenarioId,
  isFinancialLawId,
  lawById,
} from "../src/index.ts";

/**
 * Smoke: the core conformance model (commit 1/4 — the law registry, the
 * verdict model and the digest substrate). Deep behavioral batteries
 * land with commit 3/4.
 */
describe("the financial certification core model", () => {
  it("registers exactly the nine hard laws in work order order", () => {
    expect(FINANCIAL_LAW_IDS).toHaveLength(9);
    expect(FINANCIAL_CERTIFICATION_LAWS.map((law) => law.lawId)).toEqual([
      "FIN-LAW-01",
      "FIN-LAW-02",
      "FIN-LAW-03",
      "FIN-LAW-04",
      "FIN-LAW-05",
      "FIN-LAW-06",
      "FIN-LAW-07",
      "FIN-LAW-08",
      "FIN-LAW-09",
    ]);
    for (const law of FINANCIAL_CERTIFICATION_LAWS) {
      expect(law.title.length).toBeGreaterThan(0);
      expect(law.statement.length).toBeGreaterThan(0);
    }
  });

  it("lawById resolves every id and rejects nothing silently", () => {
    for (const lawId of FINANCIAL_LAW_IDS) {
      expect(lawById(lawId).lawId).toBe(lawId);
    }
    expect(isFinancialLawId("FIN-LAW-10")).toBe(false);
    expect(() => lawById("FIN-LAW-10" as "FIN-LAW-01")).toThrow();
  });

  it("declares the eight conformance scenario families", () => {
    expect(CONFORMANCE_SCENARIO_IDS).toHaveLength(8);
    expect(isConformanceScenarioId("QUOTE_EXPIRY")).toBe(true);
    expect(isConformanceScenarioId("NOT_A_SCENARIO")).toBe(false);
  });

  it("derives passed from violations (a pass is never asserted)", () => {
    const failing = conformanceVerdict({
      lawId: "FIN-LAW-01",
      scenarioId: "QUOTE_EXPIRY",
      subjectRef: "corridor:test",
      violations: ["the quote was executed after expiry"],
      evidenceRefs: ["ev:1"],
    });
    expect(failing.passed).toBe(false);
    const passing = conformanceVerdict({
      lawId: "FIN-LAW-01",
      scenarioId: "QUOTE_EXPIRY",
      subjectRef: "corridor:test",
      violations: [],
      evidenceRefs: ["ev:1"],
    });
    expect(passing.passed).toBe(true);
  });

  it("digests deterministically (byte-identical for identical inputs)", () => {
    const value = { b: 2n, a: "x", c: [1, true, null] };
    expect(canonicalString(value)).toBe(canonicalString({ a: "x", b: 2n, c: [1, true, null] }));
    expect(contentDigest(value)).toBe(contentDigest({ c: [1, true, null], a: "x", b: 2n }));
    expect(contentDigest(value)).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(contentDigest({ a: 1 })).not.toBe(contentDigest({ a: 2 }));
  });
});
