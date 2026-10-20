/**
 * @payswap/financial-certification — the versioned certification suites
 * (P8-W1).
 *
 * A certification SUITE is a versioned, parameterized definition of
 * what a component of a given kind must present to be certified for a
 * fiat corridor: the required CONFORMANCE SCENARIOS (the eight
 * financial families) plus the required GATES (the uniform wall's seven
 * gates). The certifiable kinds are corridor / provider / route.
 *
 * THE UNIFORMITY LAW (FIN-LAW-07): the DEFAULT suite for every kind
 * requires the SAME eight scenarios and the SAME seven gates — there is
 * no kind-specific branch anywhere in the decision path. Per-subject
 * applicability is declared HONESTLY at submission time (a scenario a
 * subject does not support is NOT_APPLICABLE with a declared basis,
 * recorded — never silently skipped and never waved through).
 *
 * Suites are versioned history (append-only registry; re-registering
 * the same version is rejected; a new version APPENDS).
 *
 * Deterministic only: every decision is a pure function of the suite,
 * the submitted scenario results and gate checks.
 */

import { contentDigest } from "./digest.ts";
import { CertificationSuiteError } from "./errors.ts";
import {
  CONFORMANCE_SCENARIO_IDS,
  isConformanceScenarioId,
  isFinancialLawId,
  type ConformanceScenarioId,
  type FinancialLawId,
} from "./laws.ts";

// ---------------------------------------------------------------------------
// Component kinds + subjects
// ---------------------------------------------------------------------------

/** The certifiable component kinds (the WO's corridor/provider/route). */
export const FINANCIAL_COMPONENT_KINDS = ["corridor", "provider", "route"] as const;

export type FinancialComponentKind = (typeof FINANCIAL_COMPONENT_KINDS)[number];

export function isFinancialComponentKind(
  value: unknown,
): value is FinancialComponentKind {
  return (
    typeof value === "string" &&
    (FINANCIAL_COMPONENT_KINDS as readonly unknown[]).includes(value)
  );
}

/** The subject a suite evaluates. */
export interface FinancialCertificationSubjectRef {
  readonly componentKind: FinancialComponentKind;
  readonly subjectId: string;
  readonly version: string;
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

/** One versioned suite definition. */
export interface FinancialCertificationSuite {
  readonly suiteId: string;
  readonly suiteVersion: number;
  readonly componentKind: FinancialComponentKind;
  readonly description: string;
  readonly requiredScenarios: readonly ConformanceScenarioId[];
  readonly requiredGates: readonly string[];
}

function suite(
  componentKind: FinancialComponentKind,
  suiteVersion: number,
): FinancialCertificationSuite {
  return Object.freeze({
    suiteId: `financial-suite:${componentKind}`,
    suiteVersion,
    componentKind,
    description: `Default financial certification suite for ${componentKind} components (P8-W1) — the same eight conformance scenarios and the same seven uniform gates for EVERY kind`,
    requiredScenarios: Object.freeze([...CONFORMANCE_SCENARIO_IDS]),
    requiredGates: Object.freeze([
      "QUOTE_HONESTY",
      "IDEMPOTENCY",
      "LEG_SEPARATION",
      "EVENT_ORDERING",
      "AMBIGUITY_DISCIPLINE",
      "LATE_EVENT_HONESTY",
      "EVIDENCE_LINEAGE",
    ]),
  });
}

/**
 * The default suite for a component kind — IDENTICAL requirements for
 * every kind (the uniformity law; kind-specific gating is
 * unrepresentable here).
 */
export function defaultFinancialSuiteFor(
  componentKind: FinancialComponentKind,
): FinancialCertificationSuite {
  if (!isFinancialComponentKind(componentKind)) {
    throw new CertificationSuiteError(
      `unknown certifiable component kind '${String(componentKind)}'`,
    );
  }
  return suite(componentKind, 1);
}

/**
 * The append-only suite registry: registering a new version of a suite
 * id appends; prior versions stay queryable forever.
 */
export class FinancialSuiteRegistry {
  private readonly byId = new Map<string, FinancialCertificationSuite[]>();

  /** Registers a suite version (the same id+version cannot repeat). */
  register(definition: FinancialCertificationSuite): FinancialCertificationSuite {
    if (definition.suiteId.length === 0) {
      throw new CertificationSuiteError("suiteId must not be empty");
    }
    if (!isFinancialComponentKind(definition.componentKind)) {
      throw new CertificationSuiteError(
        `unknown certifiable component kind '${String(definition.componentKind)}'`,
      );
    }
    if (definition.suiteVersion < 1) {
      throw new CertificationSuiteError("suiteVersion must be >= 1");
    }
    if (definition.description.length === 0) {
      throw new CertificationSuiteError("description must not be empty");
    }
    for (const scenarioId of definition.requiredScenarios) {
      if (!isConformanceScenarioId(scenarioId)) {
        throw new CertificationSuiteError(
          `unknown required scenario '${String(scenarioId)}'`,
        );
      }
    }
    if (definition.requiredGates.length === 0) {
      throw new CertificationSuiteError(
        "a suite requires at least one gate (an ungated certification certifies nothing)",
      );
    }
    const history = this.byId.get(definition.suiteId) ?? [];
    if (history.some((entry) => entry.suiteVersion === definition.suiteVersion)) {
      throw new CertificationSuiteError(
        `suite '${definition.suiteId}' version ${String(definition.suiteVersion)} is already registered (suites are versioned history — publish a new version instead)`,
      );
    }
    const stored: FinancialCertificationSuite = Object.freeze({
      ...definition,
      requiredScenarios: Object.freeze([...definition.requiredScenarios]),
      requiredGates: Object.freeze([...definition.requiredGates]),
    });
    this.byId.set(definition.suiteId, [...history, stored]);
    return stored;
  }

  /** Every registered version of a suite id, oldest first. */
  historyFor(suiteId: string): readonly FinancialCertificationSuite[] {
    return [...(this.byId.get(suiteId) ?? [])];
  }

  /** The latest registered version of a suite id, if any. */
  latest(suiteId: string): FinancialCertificationSuite | undefined {
    const history = this.byId.get(suiteId) ?? [];
    return history[history.length - 1];
  }

  /** Latest suite for a kind, or the default suite. */
  forComponentKind(
    componentKind: FinancialComponentKind,
  ): FinancialCertificationSuite {
    const known = this.historyFor(`financial-suite:${componentKind}`);
    const latest = known[known.length - 1];
    return latest ?? defaultFinancialSuiteFor(componentKind);
  }

  /** All registered suites in registration order. */
  list(): readonly FinancialCertificationSuite[] {
    const out: FinancialCertificationSuite[] = [];
    for (const history of this.byId.values()) {
      out.push(...history);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Suite evaluation
// ---------------------------------------------------------------------------

/** The verdict for one scenario (PASS / FAIL / NOT_APPLICABLE + basis). */
export type ScenarioResultVerdict = "PASS" | "FAIL" | "NOT_APPLICABLE";

/** One submitted scenario result. */
export interface ScenarioConformanceResult {
  readonly scenarioId: ConformanceScenarioId;
  readonly verdict: ScenarioResultVerdict;
  /** The honest basis (mandatory for NOT_APPLICABLE). */
  readonly basis: string;
  /** The laws the scenario exercised. */
  readonly lawIds: readonly FinancialLawId[];
  readonly evidenceRefs: readonly string[];
}

/** A submitted gate check (structural view of the wall's check). */
export interface SubmittedGateCheck {
  readonly gateId: string;
  readonly passed: boolean;
}

/** The outcome of evaluating a subject against a suite. */
export interface SuiteEvaluationResult {
  readonly subject: FinancialCertificationSubjectRef;
  readonly suiteId: string;
  readonly suiteVersion: number;
  readonly passed: boolean;
  readonly failedScenarios: readonly ConformanceScenarioId[];
  readonly missingScenarios: readonly ConformanceScenarioId[];
  readonly notApplicable: readonly {
    readonly scenarioId: ConformanceScenarioId;
    readonly basis: string;
  }[];
  readonly failedGates: readonly string[];
  readonly missingGates: readonly string[];
  readonly evaluationDigest: string;
}

/**
 * Evaluates a subject against a suite: every required scenario must be
 * covered by a PASSING result (or an honestly-declared NOT_APPLICABLE
 * with a basis); every required gate must have a PASSING check. Failed,
 * missing and not-applicable are ALL reported; the evaluation passes
 * only when the failed/missing lists are empty.
 */
export function evaluateFinancialSuite(input: {
  readonly suite: FinancialCertificationSuite;
  readonly subject: FinancialCertificationSubjectRef;
  readonly scenarioResults: readonly ScenarioConformanceResult[];
  readonly gateChecks: readonly SubmittedGateCheck[];
}): SuiteEvaluationResult {
  if (!isFinancialComponentKind(input.subject.componentKind)) {
    throw new CertificationSuiteError(
      `subject has unknown component kind '${String(input.subject.componentKind)}'`,
    );
  }
  if (input.subject.subjectId.length === 0 || input.subject.version.length === 0) {
    throw new CertificationSuiteError("subject references must be complete");
  }
  if (input.suite.componentKind !== input.subject.componentKind) {
    throw new CertificationSuiteError(
      `suite '${input.suite.suiteId}' certifies ${input.suite.componentKind} components; the subject is a ${input.subject.componentKind}`,
    );
  }
  for (const result of input.scenarioResults) {
    if (!isConformanceScenarioId(result.scenarioId)) {
      throw new CertificationSuiteError(
        `unknown scenario '${String(result.scenarioId)}' in the submitted results`,
      );
    }
    if (
      result.verdict !== "PASS" &&
      result.verdict !== "FAIL" &&
      result.verdict !== "NOT_APPLICABLE"
    ) {
      throw new CertificationSuiteError(
        `scenario '${result.scenarioId}' carries a non-canonical verdict`,
      );
    }
    if (result.verdict === "NOT_APPLICABLE" && result.basis.length === 0) {
      throw new CertificationSuiteError(
        `scenario '${result.scenarioId}' is NOT_APPLICABLE without a declared basis — honesty is not optional`,
      );
    }
    for (const lawId of result.lawIds) {
      if (!isFinancialLawId(lawId)) {
        throw new CertificationSuiteError(
          `scenario '${result.scenarioId}' cites unknown law '${String(lawId)}'`,
        );
      }
    }
  }

  const resultsByScenario = new Map(input.scenarioResults.map((r) => [r.scenarioId, r]));
  const failedScenarios: ConformanceScenarioId[] = [];
  const missingScenarios: ConformanceScenarioId[] = [];
  const notApplicable: { scenarioId: ConformanceScenarioId; basis: string }[] = [];
  for (const scenarioId of input.suite.requiredScenarios) {
    const result = resultsByScenario.get(scenarioId);
    if (result === undefined) {
      missingScenarios.push(scenarioId);
    } else if (result.verdict === "FAIL") {
      failedScenarios.push(scenarioId);
    } else if (result.verdict === "NOT_APPLICABLE") {
      notApplicable.push({ scenarioId, basis: result.basis });
    }
  }

  const checksByGate = new Map(input.gateChecks.map((check) => [check.gateId, check]));
  const missingGates = input.suite.requiredGates.filter(
    (gateId) => !checksByGate.has(gateId),
  );
  const failedGates = input.suite.requiredGates.filter((gateId) => {
    const check = checksByGate.get(gateId);
    return check !== undefined && !check.passed;
  });

  const passed =
    failedScenarios.length === 0 &&
    missingScenarios.length === 0 &&
    failedGates.length === 0 &&
    missingGates.length === 0;
  return Object.freeze({
    subject: input.subject,
    suiteId: input.suite.suiteId,
    suiteVersion: input.suite.suiteVersion,
    passed,
    failedScenarios: Object.freeze(failedScenarios),
    missingScenarios: Object.freeze(missingScenarios),
    notApplicable: Object.freeze(notApplicable),
    failedGates: Object.freeze(failedGates),
    missingGates: Object.freeze(missingGates),
    evaluationDigest: contentDigest({
      subject: input.subject,
      suiteId: input.suite.suiteId,
      suiteVersion: input.suite.suiteVersion,
      scenarioResults: input.scenarioResults,
      gateChecks: input.gateChecks,
      passed,
    }),
  });
}
