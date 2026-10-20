/**
 * @payswap/financial-certification — the financial certification law
 * registry + the conformance-verdict model (P8-W1).
 *
 * THE NINE HARD LAWS (work order P8-W1; every law is covered by a
 * dedicated verifier module and a dedicated test class):
 *
 * 1. QUOTE HONESTY (FIN-LAW-01): expired quotes are inert (never
 *    executable); a material change (beneficiary, price, amount, rail)
 *    invalidates a quote AND any command built on it; quote freshness is
 *    carried, never assumed.
 * 2. ENDPOINT IDEMPOTENCY (FIN-LAW-02): replaying a command at the same
 *    endpoint with the same idempotency key yields the recorded outcome,
 *    never a second external effect; distinct keys are distinct intents.
 * 3. FUNDING/PAYOUT SEPARATION (FIN-LAW-03): the two legs are separately
 *    authorized, separately observed, separately reconciled — no fused
 *    leg, no cross-leg shortcut, no hidden custody.
 * 4. EVENT ORDERING ROBUSTNESS (FIN-LAW-04): duplicate commands/events,
 *    out-of-order provider events and delayed returns resolve
 *    deterministically to the SAME reconciled state (order-independence
 *    with a total-order proof).
 * 5. AMBIGUOUS TIMEOUT -> UNKNOWN -> RECONCILIATION (FIN-LAW-05): a
 *    timeout NEVER resolves to failure or success directly; it enters
 *    UNKNOWN with a mandatory reconciliation path that only external
 *    evidence can close.
 * 6. LATE RETURNS/REFUNDS/CHARGEBACKS (FIN-LAW-06): first-class late
 *    events that re-open reconciled state honestly (no silent
 *    absorption).
 * 7. GATE WALL (FIN-LAW-07): certification suites are uniform across
 *    component kinds (corridor/provider/route); a FAILED gate halts
 *    promotion and CANNOT be downgraded or waived (escalate-only; the
 *    security-layer law).
 * 8. EVIDENCE LINEAGE (FIN-LAW-08): every certification record carries
 *    versioned, digest-chained evidence; records are byte-deterministic
 *    functions of their inputs.
 * 9. NO LIVE-CORRIDOR CLAIM (FIN-LAW-09): the suite is
 *    deterministic/hermetic by law; live-corridor certification is
 *    credential-gated (GAP-02 class) and recorded as an EXPLICIT
 *    LIMITATION, never simulated — no fake success, no mock-as-live, no
 *    synthetic provider balance.
 *
 * Deterministic only: every verdict is a pure function of the submitted
 * artifacts; timestamps are caller-declared.
 */

import { contentDigest } from "./digest.ts";
import { ConformanceError } from "./errors.ts";

// ---------------------------------------------------------------------------
// The law vocabulary
// ---------------------------------------------------------------------------

export const FINANCIAL_LAW_IDS = [
  "FIN-LAW-01",
  "FIN-LAW-02",
  "FIN-LAW-03",
  "FIN-LAW-04",
  "FIN-LAW-05",
  "FIN-LAW-06",
  "FIN-LAW-07",
  "FIN-LAW-08",
  "FIN-LAW-09",
] as const;

export type FinancialLawId = (typeof FINANCIAL_LAW_IDS)[number];

export function isFinancialLawId(value: unknown): value is FinancialLawId {
  return (
    typeof value === "string" &&
    (FINANCIAL_LAW_IDS as readonly unknown[]).includes(value)
  );
}

/** The load-bearing statement of one hard law. */
export interface FinancialLaw {
  readonly lawId: FinancialLawId;
  readonly title: string;
  readonly statement: string;
  /** The conformance scenario families that exercise the law. */
  readonly scenarios: readonly ConformanceScenarioId[];
}

/** The canonical registry (order = the work order's order). */
export const FINANCIAL_CERTIFICATION_LAWS: readonly FinancialLaw[] = Object.freeze([
  {
    lawId: "FIN-LAW-01",
    title: "Quote honesty",
    statement:
      "expired quotes are inert (never executable); a material change (beneficiary, price, amount, rail) invalidates a quote and any command built on it; quote freshness is carried, not assumed",
    scenarios: ["QUOTE_EXPIRY", "QUOTE_MATERIAL_CHANGE"],
  },
  {
    lawId: "FIN-LAW-02",
    title: "Endpoint idempotency",
    statement:
      "replaying a command at the same endpoint with the same idempotency key yields the recorded outcome, never a second external effect; distinct keys are distinct intents",
    scenarios: ["ENDPOINT_IDEMPOTENCY"],
  },
  {
    lawId: "FIN-LAW-03",
    title: "Funding/payout separation",
    statement:
      "the two legs are separately authorized, separately observed, separately reconciled — no fused leg, no cross-leg shortcut, no hidden custody",
    scenarios: ["FUNDING_PAYOUT_SEPARATION"],
  },
  {
    lawId: "FIN-LAW-04",
    title: "Event ordering robustness",
    statement:
      "duplicate commands/events, out-of-order provider events and delayed returns resolve deterministically to the same reconciled state (order-independence with a total-order proof)",
    scenarios: ["DUPLICATE_PROVIDER_EVENTS", "OUT_OF_ORDER_PROVIDER_EVENTS"],
  },
  {
    lawId: "FIN-LAW-05",
    title: "Ambiguous timeout -> UNKNOWN -> reconciliation",
    statement:
      "a timeout never resolves to failure or success directly; it enters UNKNOWN with a mandatory reconciliation path that only external evidence can close",
    scenarios: ["AMBIGUOUS_TIMEOUT_RECONCILIATION"],
  },
  {
    lawId: "FIN-LAW-06",
    title: "Late returns/refunds/chargebacks",
    statement:
      "late returns, refunds and chargebacks are first-class late events that re-open reconciled state honestly (no silent absorption)",
    scenarios: ["LATE_RETURNS_REFUNDS_CHARGEBACKS"],
  },
  {
    lawId: "FIN-LAW-07",
    title: "Gate wall",
    statement:
      "certification suites are uniform across component kinds (corridor/provider/route); a failed gate halts promotion and cannot be downgraded or waived (escalate-only; the security-layer law)",
    scenarios: [],
  },
  {
    lawId: "FIN-LAW-08",
    title: "Evidence lineage",
    statement:
      "every certification record carries versioned, digest-chained evidence; records are byte-deterministic functions of their inputs",
    scenarios: [],
  },
  {
    lawId: "FIN-LAW-09",
    title: "No live-corridor claim",
    statement:
      "the suite is deterministic/hermetic by law; live-corridor certification is credential-gated (the GAP-02 class) and recorded as an explicit limitation, never simulated — no fake success, no mock-as-live, no synthetic provider balance",
    scenarios: [],
  },
]);

export function lawById(lawId: FinancialLawId): FinancialLaw {
  const law = FINANCIAL_CERTIFICATION_LAWS.find((entry) => entry.lawId === lawId);
  if (law === undefined) {
    throw new ConformanceError(`unknown financial law '${lawId}'`);
  }
  return law;
}

// ---------------------------------------------------------------------------
// The conformance scenario vocabulary (the WO's required test families)
// ---------------------------------------------------------------------------

export const CONFORMANCE_SCENARIO_IDS = [
  "QUOTE_EXPIRY",
  "QUOTE_MATERIAL_CHANGE",
  "ENDPOINT_IDEMPOTENCY",
  "FUNDING_PAYOUT_SEPARATION",
  "DUPLICATE_PROVIDER_EVENTS",
  "OUT_OF_ORDER_PROVIDER_EVENTS",
  "AMBIGUOUS_TIMEOUT_RECONCILIATION",
  "LATE_RETURNS_REFUNDS_CHARGEBACKS",
] as const;

export type ConformanceScenarioId = (typeof CONFORMANCE_SCENARIO_IDS)[number];

export function isConformanceScenarioId(
  value: unknown,
): value is ConformanceScenarioId {
  return (
    typeof value === "string" &&
    (CONFORMANCE_SCENARIO_IDS as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The conformance verdict (the unit every law verifier produces)
// ---------------------------------------------------------------------------

/**
 * The verdict of one conformance probe. `passed` is DERIVED from the
 * violations list (a pass is never asserted without its evidence — a
 * certifier never fabricates a pass).
 */
export interface ConformanceVerdict {
  readonly lawId: FinancialLawId;
  /** The scenario family the probe belongs to (structural laws carry NONE). */
  readonly scenarioId: ConformanceScenarioId | "NONE";
  /** Reference to the subject the probe observed. */
  readonly subjectRef: string;
  readonly passed: boolean;
  readonly violations: readonly string[];
  /** Evidence references backing every definitive claim in the verdict. */
  readonly evidenceRefs: readonly string[];
  readonly verdictDigest: string;
}

/**
 * Construct a conformance verdict. Deterministic: the digest is a pure
 * function of the fields; `passed` is computed (violations empty), never
 * caller-declared.
 */
export function conformanceVerdict(input: {
  readonly lawId: FinancialLawId;
  readonly scenarioId: ConformanceScenarioId | "NONE";
  readonly subjectRef: string;
  readonly violations: readonly string[];
  readonly evidenceRefs: readonly string[];
}): ConformanceVerdict {
  if (!isFinancialLawId(input.lawId)) {
    throw new ConformanceError(
      `unknown financial law '${String(input.lawId)}'`,
    );
  }
  if (
    input.scenarioId !== "NONE" &&
    !isConformanceScenarioId(input.scenarioId)
  ) {
    throw new ConformanceError(
      `unknown conformance scenario '${String(input.scenarioId)}'`,
    );
  }
  if (input.subjectRef.length === 0) {
    throw new ConformanceError("a conformance verdict requires a subjectRef");
  }
  for (const violation of input.violations) {
    if (violation.length === 0) {
      throw new ConformanceError("violations must be non-empty strings");
    }
  }
  for (const ref of input.evidenceRefs) {
    if (ref.length === 0) {
      throw new ConformanceError("evidence refs must be non-empty strings");
    }
  }
  const passed = input.violations.length === 0;
  return Object.freeze({
    lawId: input.lawId,
    scenarioId: input.scenarioId,
    subjectRef: input.subjectRef,
    passed,
    violations: Object.freeze([...input.violations]),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    verdictDigest: contentDigest({
      lawId: input.lawId,
      scenarioId: input.scenarioId,
      subjectRef: input.subjectRef,
      passed,
      violations: input.violations,
      evidenceRefs: input.evidenceRefs,
    }),
  });
}
