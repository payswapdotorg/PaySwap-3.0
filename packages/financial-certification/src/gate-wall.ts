/**
 * @payswap/financial-certification — LAW 7: THE uniform certification
 * gate wall (P8-W1).
 *
 * Corridor, provider and route candidates share the SAME seven
 * certification gates. There is ONE decision pipeline, ONE requirements
 * object and NO component-kind parameter anywhere in the decision path:
 *
 * 1. TYPE-LEVEL: the decision core `evaluateFinancialGateWall` consumes
 *    `FinancialGateDecisionInput` = the candidate shape with
 *    `componentKind` and `isIncumbentBaseline` OMITTED — the decision
 *    input structurally CANNOT carry the component kind or any
 *    incumbent flag, so no kind-specific branch is even expressible;
 * 2. VALUE-LEVEL: `UNIFORM_FINANCIAL_GATE_REQUIREMENTS` is a single
 *    frozen constant whose seven requirements are LITERAL `true` types
 *    — they cannot be declared false, omitted or disabled by any
 *    caller, for any kind;
 * 3. ESCALATE-ONLY: a FAILED gate halts promotion and CANNOT be
 *    downgraded or waived — `requestGateWaiver` ALWAYS throws (the
 *    cannot-downgrade law made structural), and the promotion ledger
 *    (promotion.ts) turns failed gates into irreversible halts for the
 *    subject version.
 *
 * Gate -> law mapping: QUOTE_HONESTY..LATE_EVENT_HONESTY <- FIN-LAW-01..06
 * verdicts (a gate passes only when its law was EXERCISED — at least
 * one verdict — and every verdict passed); EVIDENCE_LINEAGE <- the
 * evidence list itself + FIN-LAW-08/09 structural checks
 * (digest-chained, well-formed, live-claim-free evidence; every
 * PASSING verdict cites evidence).
 *
 * Deterministic only: a pure function of (candidate, requirements).
 */

import { contentDigest } from "./digest.ts";
import { FinancialGateError, WaiverImpossibleError } from "./errors.ts";
import type { ConformanceVerdict, FinancialLawId } from "./laws.ts";
import { isForbiddenLiveEvidenceKind } from "./live-corridor.ts";
import type { CertificationEvidence } from "./records.ts";
import type { FinancialComponentKind } from "./suites.ts";

/** The seven uniform gates (identical for every component kind). */
export const UNIFORM_FINANCIAL_GATE_IDS = [
  "QUOTE_HONESTY",
  "IDEMPOTENCY",
  "LEG_SEPARATION",
  "EVENT_ORDERING",
  "AMBIGUITY_DISCIPLINE",
  "LATE_EVENT_HONESTY",
  "EVIDENCE_LINEAGE",
] as const;

export type UniformFinancialGateId = (typeof UNIFORM_FINANCIAL_GATE_IDS)[number];

export function isUniformFinancialGateId(
  value: unknown,
): value is UniformFinancialGateId {
  return (
    typeof value === "string" &&
    (UNIFORM_FINANCIAL_GATE_IDS as readonly unknown[]).includes(value)
  );
}

/**
 * THE uniform requirements: every field is a LITERAL true type — a
 * caller cannot declare, construct or smuggle a downgraded requirements
 * object past the type system, and the runtime guard rejects any
 * untyped attempt.
 */
export interface FinancialGateRequirements {
  readonly requireQuoteHonesty: true;
  readonly requireIdempotency: true;
  readonly requireLegSeparation: true;
  readonly requireEventOrdering: true;
  readonly requireAmbiguityDiscipline: true;
  readonly requireLateEventHonesty: true;
  readonly requireEvidenceLineage: true;
}

/** THE single requirements object for ALL component kinds. */
export const UNIFORM_FINANCIAL_GATE_REQUIREMENTS: FinancialGateRequirements =
  Object.freeze({
    requireQuoteHonesty: true,
    requireIdempotency: true,
    requireLegSeparation: true,
    requireEventOrdering: true,
    requireAmbiguityDiscipline: true,
    requireLateEventHonesty: true,
    requireEvidenceLineage: true,
  });

/**
 * A candidate crossing the wall. `componentKind` and
 * `isIncumbentBaseline` are ATTRIBUTION fields: they ride along for
 * reporting and are structurally excluded from the gate decision.
 */
export interface FinancialCertificationCandidate {
  readonly candidateId: string;
  readonly componentKind: FinancialComponentKind;
  /** True for an incumbent/native baseline — gated IDENTICALLY. */
  readonly isIncumbentBaseline: boolean;
  readonly conformanceVerdicts: readonly ConformanceVerdict[];
  readonly evidence: readonly CertificationEvidence[];
}

/**
 * THE decision input: the candidate with `componentKind` and
 * `isIncumbentBaseline` structurally removed. The uniform gate decision
 * is a pure function of this shape — it CANNOT see the component kind.
 */
export type FinancialGateDecisionInput = Omit<
  FinancialCertificationCandidate,
  "componentKind" | "isIncumbentBaseline"
>;

/** One uniform gate check result. */
export interface FinancialGateCheck {
  readonly gateId: UniformFinancialGateId;
  readonly passed: boolean;
  readonly violations: readonly string[];
}

const DIGEST_SHAPE = /^fnv1a64:[0-9a-f]{16}$/;

function lawGate(
  lawId: FinancialLawId,
  gateId: UniformFinancialGateId,
  requirementTrue: boolean,
  requirementName: string,
  decision: FinancialGateDecisionInput,
): FinancialGateCheck {
  const violations: string[] = [];
  if (!requirementTrue) {
    // Unreachable by type; the fail-closed guard for untyped callers.
    violations.push(`requirements must require ${requirementName}`);
  }
  const verdicts = decision.conformanceVerdicts.filter(
    (verdict) => verdict.lawId === lawId,
  );
  if (verdicts.length === 0) {
    violations.push(
      `gate ${gateId} was never exercised: no ${lawId} conformance verdict was presented`,
    );
  }
  for (const verdict of verdicts) {
    if (!verdict.passed) {
      violations.push(
        `${lawId} verdict failed: ${verdict.violations.join("; ")}`,
      );
    }
    if (verdict.passed && verdict.evidenceRefs.length === 0) {
      violations.push(
        `${lawId} verdict passed with NO evidence references — a pass is never fabricated`,
      );
    }
  }
  return Object.freeze({
    gateId,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
  });
}

/**
 * THE decision core — ONE pipeline for ALL component kinds. This
 * function receives no component kind and no incumbent flag (enforced
 * by the FinancialGateDecisionInput type), so its output is identical
 * for identical submissions, whatever the kind of the candidate they
 * came from.
 */
export function evaluateFinancialGateWall(
  decision: FinancialGateDecisionInput,
  requirements: FinancialGateRequirements,
): readonly FinancialGateCheck[] {
  if (decision.candidateId.length === 0) {
    throw new FinancialGateError("candidateId must not be empty");
  }
  for (const verdict of decision.conformanceVerdicts) {
    if (!verdict.passed && verdict.verdictDigest.length === 0) {
      throw new FinancialGateError(
        "every conformance verdict must be digested (verdictDigest is mandatory)",
      );
    }
  }
  const checks: FinancialGateCheck[] = [
    lawGate("FIN-LAW-01", "QUOTE_HONESTY", requirements.requireQuoteHonesty, "quote honesty", decision),
    lawGate("FIN-LAW-02", "IDEMPOTENCY", requirements.requireIdempotency, "idempotency", decision),
    lawGate("FIN-LAW-03", "LEG_SEPARATION", requirements.requireLegSeparation, "leg separation", decision),
    lawGate("FIN-LAW-04", "EVENT_ORDERING", requirements.requireEventOrdering, "event ordering", decision),
    lawGate("FIN-LAW-05", "AMBIGUITY_DISCIPLINE", requirements.requireAmbiguityDiscipline, "ambiguity discipline", decision),
    lawGate("FIN-LAW-06", "LATE_EVENT_HONESTY", requirements.requireLateEventHonesty, "late-event honesty", decision),
  ];

  // -- EVIDENCE_LINEAGE (FIN-LAW-08/09 structural checks) ------------------
  const lineageViolations: string[] = [];
  if (requirements.requireEvidenceLineage !== true) {
    lineageViolations.push("requirements must require evidence lineage");
  }
  if (decision.evidence.length === 0) {
    lineageViolations.push(
      "no evidence artifacts were presented — every certification claim is evidence-backed",
    );
  }
  for (const entry of decision.evidence) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      entry.evidenceId.length === 0 ||
      entry.kind.length === 0 ||
      entry.artifactRef.length === 0
    ) {
      lineageViolations.push(
        `evidence entry '${entry?.evidenceId ?? "(unnamed)"}' is incomplete (id + kind + artifactRef required)`,
      );
      continue;
    }
    if (!DIGEST_SHAPE.test(entry.contentDigest)) {
      lineageViolations.push(
        `evidence '${entry.evidenceId}' carries a malformed content digest (lineage is digest-chained)`,
      );
    }
    if (isForbiddenLiveEvidenceKind(entry.kind)) {
      lineageViolations.push(
        `evidence '${entry.evidenceId}' claims live-corridor authority via kind '${entry.kind}' (LAW 9 / GAP-02: live certification is credential-gated, never claimed)`,
      );
    }
  }
  for (const verdict of decision.conformanceVerdicts) {
    if (!DIGEST_SHAPE.test(verdict.verdictDigest)) {
      lineageViolations.push(
        `${verdict.lawId} verdict carries a malformed digest (verdicts are digest-chained evidence)`,
      );
    }
  }
  checks.push(
    Object.freeze({
      gateId: "EVIDENCE_LINEAGE",
      passed: lineageViolations.length === 0,
      violations: Object.freeze(lineageViolations),
    }),
  );

  return Object.freeze(checks);
}

/** The wall result: attribution (kind, incumbent flag) + the checks. */
export interface FinancialGateWallResult {
  readonly candidateId: string;
  readonly componentKind: FinancialComponentKind;
  readonly isIncumbentBaseline: boolean;
  /** THE requirements object the wall used — the same for every kind. */
  readonly requirements: FinancialGateRequirements;
  readonly gateChecks: readonly FinancialGateCheck[];
  readonly passed: boolean;
  readonly failedGates: readonly UniformFinancialGateId[];
  readonly wallDigest: string;
}

/**
 * THE uniform gate wall: runs the single decision core over the
 * candidate's conformance verdicts and evidence, and attaches the
 * attribution fields (kind, incumbent flag) to the RESULT ONLY.
 * Identical submissions produce identical gate checks for every kind.
 */
export function runFinancialGateWall(
  candidate: FinancialCertificationCandidate,
): FinancialGateWallResult {
  if (
    candidate.componentKind !== "corridor" &&
    candidate.componentKind !== "provider" &&
    candidate.componentKind !== "route"
  ) {
    throw new FinancialGateError(
      `candidate '${candidate.candidateId}' does not carry a certifiable component kind`,
    );
  }
  if (candidate.candidateId.length === 0) {
    throw new FinancialGateError("candidateId must not be empty");
  }
  // THE decision: kind and incumbent flag are structurally absent here.
  const gateChecks = evaluateFinancialGateWall(
    {
      candidateId: candidate.candidateId,
      conformanceVerdicts: candidate.conformanceVerdicts,
      evidence: candidate.evidence,
    },
    UNIFORM_FINANCIAL_GATE_REQUIREMENTS,
  );
  const failedGates = gateChecks
    .filter((check) => !check.passed)
    .map((check) => check.gateId);
  const passed = failedGates.length === 0;
  return Object.freeze({
    candidateId: candidate.candidateId,
    componentKind: candidate.componentKind,
    isIncumbentBaseline: candidate.isIncumbentBaseline,
    requirements: UNIFORM_FINANCIAL_GATE_REQUIREMENTS,
    gateChecks,
    passed,
    failedGates: Object.freeze(failedGates),
    wallDigest: contentDigest({
      candidateId: candidate.candidateId,
      gateChecks,
      passed,
    }),
  });
}

/**
 * THE cannot-downgrade law, made structural: requesting a waiver (or a
 * downgrade) of ANY certification gate ALWAYS throws. There is no
 * waiver path, no override, no severity reclassification — the only way
 * past a failed gate is a NEW certification evaluation that passes it.
 */
export function requestGateWaiver(input: {
  readonly subjectId: string;
  readonly gateId: string;
  readonly justification: string;
}): never {
  throw new WaiverImpossibleError(
    `waiver requested for gate '${input.gateId}' on subject '${input.subjectId}' (${input.justification.length} characters of justification): DENIED — a failed certification gate cannot be downgraded or waived (FIN-LAW-07, the security-layer cannot_downgrade_block law). The only path past a failed gate is a NEW evaluation that passes it`,
  );
}
