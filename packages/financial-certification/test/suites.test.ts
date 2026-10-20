import { describe, expect, it } from "vitest";
import {
  CertificationSuiteError,
  FinancialSuiteRegistry,
  defaultFinancialSuiteFor,
  evaluateFinancialSuite,
  runFinancialGateWall,
} from "../src/index.ts";
import type {
  ScenarioConformanceResult,
} from "../src/index.ts";
import {
  conformingEvidence,
  conformingVerdicts,
} from "./fixtures.ts";

/**
 * The versioned certification suites: uniform default requirements per
 * kind, the append-only registry, and the honest NOT_APPLICABLE
 * declaration path.
 */
describe("the financial certification suites", () => {
  it("the DEFAULT suite is IDENTICAL for every component kind (the uniformity law)", () => {
    const suites = (["corridor", "provider", "route"] as const).map(
      defaultFinancialSuiteFor,
    );
    for (const suite of suites) {
      expect(suite.requiredScenarios).toEqual(suites[0]?.requiredScenarios);
      expect(suite.requiredGates).toEqual(suites[0]?.requiredGates);
      expect(suite.requiredScenarios).toHaveLength(8);
      expect(suite.requiredGates).toHaveLength(7);
    }
    expect(defaultFinancialSuiteFor("corridor").suiteId).toBe(
      "financial-suite:corridor",
    );
  });

  it("an unknown component kind fails closed", () => {
    expect(() => defaultFinancialSuiteFor("wallet" as "corridor")).toThrow(
      CertificationSuiteError,
    );
  });

  it("the registry is append-only versioned history (no rewrites, no repeats)", () => {
    const registry = new FinancialSuiteRegistry();
    const v1 = defaultFinancialSuiteFor("corridor");
    registry.register(v1);
    expect(() => registry.register(v1)).toThrow(/versioned history/);
    const v2 = registry.register({ ...v1, suiteVersion: 2, description: "v2" });
    expect(registry.historyFor(v1.suiteId)).toHaveLength(2);
    expect(registry.latest(v1.suiteId)).toBe(v2);
    expect(registry.forComponentKind("corridor")).toBe(v2);
    // The provider kind falls back to its default (nothing registered).
    expect(registry.forComponentKind("provider").suiteVersion).toBe(1);
    expect(registry.list()).toHaveLength(2);
  });

  it("the registry rejects malformed suite definitions", () => {
    const registry = new FinancialSuiteRegistry();
    const v1 = defaultFinancialSuiteFor("route");
    expect(() =>
      registry.register({ ...v1, requiredScenarios: [] }),
    ).not.toThrow();
    expect(() =>
      registry.register({ ...v1, suiteVersion: 2, requiredGates: [] }),
    ).toThrow(/at least one gate/);
    expect(() =>
      registry.register({ ...v1, suiteVersion: 2, description: "" }),
    ).toThrow(/description/);
  });

  function scenarioResults(
    overrides: Partial<Record<string, Partial<ScenarioConformanceResult>>> = {},
  ): ScenarioConformanceResult[] {
    return [
      "QUOTE_EXPIRY",
      "QUOTE_MATERIAL_CHANGE",
      "ENDPOINT_IDEMPOTENCY",
      "FUNDING_PAYOUT_SEPARATION",
      "DUPLICATE_PROVIDER_EVENTS",
      "OUT_OF_ORDER_PROVIDER_EVENTS",
      "AMBIGUOUS_TIMEOUT_RECONCILIATION",
      "LATE_RETURNS_REFUNDS_CHARGEBACKS",
    ].map((scenarioId) => ({
      scenarioId: scenarioId as ScenarioConformanceResult["scenarioId"],
      verdict: "PASS" as const,
      basis: "conformance verdicts all passed",
      lawIds: [],
      evidenceRefs: ["ev:hermetic-1"],
      ...overrides[scenarioId],
    }));
  }

  it("a full conforming submission passes the suite evaluation", () => {
    const suite = defaultFinancialSuiteFor("corridor");
    const wall = runFinancialGateWall({
      candidateId: "corridor:candidate-1",
      componentKind: "corridor",
      isIncumbentBaseline: false,
      conformanceVerdicts: conformingVerdicts(),
      evidence: conformingEvidence(),
    });
    const evaluation = evaluateFinancialSuite({
      suite,
      subject: { componentKind: "corridor", subjectId: "corridor:candidate-1", version: "1.0.0" },
      scenarioResults: scenarioResults(),
      gateChecks: wall.gateChecks,
    });
    expect(evaluation.passed).toBe(true);
    expect(evaluation.failedScenarios).toEqual([]);
    expect(evaluation.missingScenarios).toEqual([]);
    expect(evaluation.evaluationDigest).toMatch(/^fnv1a64:/);
  });

  it("a missing scenario fails the evaluation (never silently skipped)", () => {
    const suite = defaultFinancialSuiteFor("corridor");
    const evaluation = evaluateFinancialSuite({
      suite,
      subject: { componentKind: "corridor", subjectId: "corridor:candidate-1", version: "1.0.0" },
      scenarioResults: scenarioResults({
        ENDPOINT_IDEMPOTENCY: undefined as never,
      }).filter((result) => result.scenarioId !== "ENDPOINT_IDEMPOTENCY"),
      gateChecks: [],
    });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.missingScenarios).toEqual(["ENDPOINT_IDEMPOTENCY"]);
  });

  it("a FAILING scenario fails the evaluation", () => {
    const suite = defaultFinancialSuiteFor("corridor");
    const evaluation = evaluateFinancialSuite({
      suite,
      subject: { componentKind: "corridor", subjectId: "corridor:candidate-1", version: "1.0.0" },
      scenarioResults: scenarioResults({
        QUOTE_EXPIRY: { verdict: "FAIL", basis: "expired quote was executed" },
      }),
      gateChecks: [],
    });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failedScenarios).toEqual(["QUOTE_EXPIRY"]);
  });

  it("an HONEST NOT_APPLICABLE (declared basis) is accounted, not failed", () => {
    const suite = defaultFinancialSuiteFor("provider");
    const evaluation = evaluateFinancialSuite({
      suite,
      subject: { componentKind: "provider", subjectId: "provider:psp-beta", version: "2.0.0" },
      scenarioResults: scenarioResults({
        LATE_RETURNS_REFUNDS_CHARGEBACKS: {
          verdict: "NOT_APPLICABLE",
          basis: "NOT_SUPPORTED_BY_PROVIDER — the provider exposes no refund capability (declared from its own capability ids)",
        },
      }),
      gateChecks: [],
    });
    expect(evaluation.passed).toBe(false); // gates were not submitted
    expect(evaluation.failedScenarios).toEqual([]);
    expect(evaluation.missingScenarios).toEqual([]);
    expect(evaluation.notApplicable).toEqual([
      {
        scenarioId: "LATE_RETURNS_REFUNDS_CHARGEBACKS",
        basis: expect.stringContaining("NOT_SUPPORTED_BY_PROVIDER") as unknown as string,
      },
    ]);
  });

  it("a NOT_APPLICABLE without a declared basis fails closed (honesty is not optional)", () => {
    const suite = defaultFinancialSuiteFor("route");
    expect(() =>
      evaluateFinancialSuite({
        suite,
        subject: { componentKind: "route", subjectId: "route:r-1", version: "1.0.0" },
        scenarioResults: scenarioResults({
          QUOTE_EXPIRY: { verdict: "NOT_APPLICABLE", basis: "" },
        }),
        gateChecks: [],
      }),
    ).toThrow(/declared basis/);
  });

  it("a kind mismatch between suite and subject fails closed", () => {
    const suite = defaultFinancialSuiteFor("corridor");
    expect(() =>
      evaluateFinancialSuite({
        suite,
        subject: { componentKind: "provider", subjectId: "provider:x", version: "1.0.0" },
        scenarioResults: scenarioResults(),
        gateChecks: [],
      }),
    ).toThrow(/certifies corridor components/);
  });

  it("a failed gate check fails the evaluation", () => {
    const suite = defaultFinancialSuiteFor("corridor");
    const evaluation = evaluateFinancialSuite({
      suite,
      subject: { componentKind: "corridor", subjectId: "corridor:candidate-1", version: "1.0.0" },
      scenarioResults: scenarioResults(),
      gateChecks: [
        ...suite.requiredGates.map((gateId) => ({ gateId, passed: true })),
      ].map((check, index) =>
        index === 3 ? { ...check, passed: false } : check,
      ),
    });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failedGates).toEqual([suite.requiredGates[3] ?? ""]);
  });

  it("the evaluation digest is byte-deterministic", () => {
    const suite = defaultFinancialSuiteFor("corridor");
    const subject = { componentKind: "corridor" as const, subjectId: "corridor:candidate-1", version: "1.0.0" };
    const first = evaluateFinancialSuite({
      suite,
      subject,
      scenarioResults: scenarioResults(),
      gateChecks: [],
    });
    const second = evaluateFinancialSuite({
      suite,
      subject,
      scenarioResults: scenarioResults(),
      gateChecks: [],
    });
    expect(first.evaluationDigest).toBe(second.evaluationDigest);
  });
});
