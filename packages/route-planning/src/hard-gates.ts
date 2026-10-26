/**
 * @payswap/route-planning — typed hard gates BEFORE ranking (P16-A;
 * ROUTINE-CONTRACT stage 5, the contract law).
 *
 * Hard constraints gate BEFORE any soft-preference ranking: only
 * hard-eligible candidates participate in ranking. The gates, in the
 * FIXED pinned order: the intent window (an expired authorization window
 * gates everything), the hop budget (maxRouteHops), the settlement
 * deadline (maxSettlementMs — evaluated ONLY on a KNOWN estimate; an
 * UNKNOWN settlement dimension is RETAINED and disclosed, never guessed,
 * never coerced to a failure: UNKNOWN is not FAILED), and the candidate
 * status (EXECUTABLE_CANDIDATE and the PROVIDER_NATIVE_BASELINE proceed
 * — INV-C08: the incumbent baseline is a legitimate hard-eligible
 * candidate emitted on real evidence, never structurally disadvantaged;
 * INELIGIBLE_CANDIDATE and NOT_COMPARABLE are retained with their
 * reasons, never silently dropped). Every exclusion is typed with a
 * stable code; nothing is dropped without a recorded reason.
 */

import { HardGateError, RoutePlanningValidationError } from "./errors.ts";
import { contentDigest, deepFreeze, requireObject } from "./canonical.ts";
import type { MoneyMovementIntentPin } from "./pins/economic.ts";
import { hasPinnedIntentKeySet, PINNED_MAX_ROUTE_HOPS } from "./pins/economic.ts";
import type {
  PinnedComparabilityVerdict,
  PinnedNetOutcomeEvaluation,
  PinnedRoutePlan,
  PinnedRoutePlanCandidateStatus,
} from "./pins/route-compiler.ts";

/** The fixed gate order (frozen; test-pinned). */
export const HARD_GATE_ORDER = Object.freeze([
  "INTENT_WINDOW",
  "HOP_BUDGET",
  "SETTLEMENT_DEADLINE",
  "CANDIDATE_STATUS",
] as const);

export type HardGateKind = (typeof HARD_GATE_ORDER)[number];

/** The closed hard-gate exclusion-code vocabulary (stable identities). */
export const HARD_GATE_EXCLUSION_CODES = Object.freeze([
  "INTENT_WINDOW_EXPIRED",
  "HOP_BUDGET_EXCEEDED",
  "SETTLEMENT_DEADLINE_EXCEEDED",
  "CANDIDATE_INELIGIBLE",
  "CANDIDATE_NOT_COMPARABLE",
] as const);

export type HardGateExclusionCode = (typeof HARD_GATE_EXCLUSION_CODES)[number];

/** The metric dimensions a ranking consults (UNKNOWN-able, disclosed). */
export const ROUTE_METRIC_DIMENSIONS = Object.freeze([
  "SCORE",
  "NET_NUMERAIRE",
  "RISK_CLASS",
  "SETTLEMENT_MS",
  "HOP_COUNT",
  "RAIL_CROSSINGS",
] as const);

export type RouteMetricDimension = (typeof ROUTE_METRIC_DIMENSIONS)[number];

/** The transparent per-candidate metric surface (every dimension visible). */
export interface RouteCandidateMetrics {
  readonly planId: string;
  readonly shapeId: string;
  readonly candidateStatus: PinnedRoutePlanCandidateStatus;
  readonly isProviderNativeBaseline: boolean;
  readonly comparability: PinnedComparabilityVerdict;
  readonly hopCount: number;
  readonly railCrossings: number;
  readonly custodyKinds: readonly string[];
  readonly plannedAmountBases: readonly string[];
  /** The exact-money scored evaluation (absent when the plan was not scored). */
  readonly score?: PinnedNetOutcomeEvaluation;
  /** From the score's RISK_DEDUCTION component (absent = UNKNOWN, disclosed). */
  readonly riskClass?: string;
  /** From the score's TIME_COST component (absent = UNKNOWN, disclosed). */
  readonly estimatedSettlementMs?: number;
  /** Every dimension this candidate does NOT know (retained, never guessed). */
  readonly unknownDimensions: readonly RouteMetricDimension[];
}

/** A gate survivor: the plan + its transparent metric surface. */
export interface HardGateSurvivor {
  readonly plan: PinnedRoutePlan;
  readonly metrics: RouteCandidateMetrics;
}

/** A gated candidate: retained with typed exclusion codes + reasons. */
export interface GatedRouteCandidate {
  readonly planId: string;
  readonly shapeId: string;
  readonly candidateStatus: PinnedRoutePlanCandidateStatus;
  readonly codes: readonly HardGateExclusionCode[];
  /** Every gate's stated reason (never just the first). */
  readonly reasons: readonly { readonly code: HardGateExclusionCode; readonly message: string }[];
  /** The compiler's own ineligibility reasons, carried verbatim. */
  readonly ineligibilityReasons: readonly { readonly legId: string; readonly code: string; readonly detail: string }[];
  /** The comparability gaps, carried verbatim (empty when comparable). */
  readonly comparabilityGaps: readonly {
    readonly legId: string;
    readonly requirement: string;
    readonly code: string;
    readonly detail: string;
  }[];
}

/** The hard-gate evaluation (the gates-before-ranking output contract). */
export interface HardGateEvaluation {
  readonly intentRef: string;
  readonly evaluationInstant: number;
  readonly gateOrder: readonly HardGateKind[];
  /** Only hard-eligible candidates (zero gate exclusions) reach ranking. */
  readonly rankEligible: readonly HardGateSurvivor[];
  /** Every gated candidate, retained with typed reasons (never dropped). */
  readonly gated: readonly GatedRouteCandidate[];
  readonly hardGateDigest: string;
  /** LITERAL: hard gating never permits execution. */
  readonly hardGatesPermitExecution: false;
}

/**
 * The LOCAL fail-closed structural validation of the pinned movement
 * intent (the compiler's own law, re-declared: exact 10-key closed set,
 * currency matches at origin/destination/amount, bounded constraints,
 * expiry strictly after declaration). Prose or a malformed record never
 * reaches gate evaluation.
 */
export function validateRoutePlanningIntent(candidate: unknown): MoneyMovementIntentPin {
  if (!hasPinnedIntentKeySet(candidate)) {
    throw new RoutePlanningValidationError(
      "the intent must carry exactly the pinned 10-key movement shape — unknown or missing fields are rejected (prose never constructs a gate evaluation)",
    );
  }
  const record = requireObject(candidate, "the movement intent") as unknown as MoneyMovementIntentPin;
  if (typeof record.intentId !== "string" || record.intentId.length === 0) {
    throw new RoutePlanningValidationError("intent.intentId must be a non-empty string");
  }
  for (const field of ["origin", "destination"] as const) {
    const location = record[field];
    if (
      typeof location?.locationRef !== "string" ||
      location.locationRef.length === 0 ||
      typeof location?.observationRef !== "string" ||
      location.observationRef.length === 0 ||
      !/^[A-Z]{3}$/.test(location?.currency ?? "")
    ) {
      throw new RoutePlanningValidationError(
        `intent.${field} must be a funds-location reference (locationRef, observationRef, three-letter currency)`,
      );
    }
  }
  if (
    typeof record.originAmount?.minorUnits !== "string" ||
    !/^[1-9][0-9]*$/.test(record.originAmount.minorUnits) ||
    record.originAmount.currency !== record.origin.currency
  ) {
    throw new RoutePlanningValidationError(
      "intent.originAmount must be a positive exact amount in the origin location's currency",
    );
  }
  if (
    !/^[A-Z]{3}$/.test(record.arrivalCurrency ?? "") ||
    record.arrivalCurrency !== record.destination.currency
  ) {
    throw new RoutePlanningValidationError(
      "intent.arrivalCurrency must be a three-letter code matching the destination location's currency",
    );
  }
  const constraints = record.constraints;
  if (
    typeof constraints?.maxSettlementMs !== "number" ||
    !Number.isSafeInteger(constraints.maxSettlementMs) ||
    constraints.maxSettlementMs < 1 ||
    typeof constraints?.maxRouteHops !== "number" ||
    !Number.isSafeInteger(constraints.maxRouteHops) ||
    constraints.maxRouteHops < 1 ||
    constraints.maxRouteHops > PINNED_MAX_ROUTE_HOPS
  ) {
    throw new RoutePlanningValidationError(
      `intent.constraints must carry a positive integer maxSettlementMs and a maxRouteHops integer in [1, ${PINNED_MAX_ROUTE_HOPS}]`,
    );
  }
  if (
    typeof record.declaredAt !== "number" ||
    !Number.isSafeInteger(record.declaredAt) ||
    record.declaredAt < 0 ||
    typeof record.expiresAt !== "number" ||
    !Number.isSafeInteger(record.expiresAt) ||
    record.expiresAt <= record.declaredAt
  ) {
    throw new RoutePlanningValidationError(
      "intent.declaredAt must be a non-negative integer and intent.expiresAt strictly after it (an already-expired window gates everything)",
    );
  }
  return record;
}

/**
 * The transparent metric projection of one compiled plan: every ranking
 * dimension visible, UNKNOWN dimensions RETAINED and disclosed (never
 * guessed, never coerced).
 */
export function routeCandidateMetricsOf(plan: PinnedRoutePlan): RouteCandidateMetrics {
  const unknownDimensions: RouteMetricDimension[] = [];
  const score = plan.score;
  let riskClass: string | undefined;
  let estimatedSettlementMs: number | undefined;
  if (score === undefined) {
    unknownDimensions.push("SCORE", "NET_NUMERAIRE", "RISK_CLASS", "SETTLEMENT_MS");
  } else {
    const risk = score.components.find((component) => component.kind === "RISK_DEDUCTION");
    if (risk?.riskClass === undefined) {
      unknownDimensions.push("RISK_CLASS");
    } else {
      riskClass = risk.riskClass;
    }
    const time = score.components.find((component) => component.kind === "TIME_COST");
    if (time?.milliseconds === undefined) {
      unknownDimensions.push("SETTLEMENT_MS");
    } else {
      estimatedSettlementMs = time.milliseconds;
    }
  }
  return deepFreeze({
    planId: plan.planId,
    shapeId: plan.shapeId,
    candidateStatus: plan.candidateStatus,
    isProviderNativeBaseline: plan.isProviderNativeBaseline,
    comparability: plan.comparability,
    hopCount: plan.legs.length,
    railCrossings: plan.railCrossings.crossings,
    custodyKinds: Object.freeze(
      plan.legs.flatMap((leg) => [leg.custody.from.kind, leg.custody.to.kind]),
    ),
    plannedAmountBases: Object.freeze(plan.legs.map((leg) => leg.plannedAmount.basis)),
    ...(score !== undefined ? { score } : {}),
    ...(riskClass !== undefined ? { riskClass } : {}),
    ...(estimatedSettlementMs !== undefined ? { estimatedSettlementMs } : {}),
    unknownDimensions: Object.freeze(unknownDimensions),
  });
}

/**
 * Evaluate the hard gates over the enumerated candidates (gates BEFORE
 * ranking — the structural law): every violated gate contributes a typed
 * exclusion (the every-reason law); only candidates with ZERO gate
 * exclusions enter rankEligible. A gated candidate NEVER reaches ranking.
 */
export function evaluateHardGates(input: {
  readonly intent: MoneyMovementIntentPin;
  readonly at: number;
  readonly candidates: readonly PinnedRoutePlan[];
}): HardGateEvaluation {
  const intent = validateRoutePlanningIntent(input.intent);
  if (typeof input.at !== "number" || !Number.isSafeInteger(input.at) || input.at < 0) {
    throw new HardGateError(
      "the gate evaluation instant must be a non-negative integer millisecond instant (caller-supplied, no ambient clock)",
    );
  }
  if (!Array.isArray(input.candidates)) {
    throw new HardGateError("candidates must be an array of compiled route plans");
  }
  const intentWindowExpired = input.at >= intent.expiresAt;
  const rankEligible: HardGateSurvivor[] = [];
  const gated: GatedRouteCandidate[] = [];
  for (const plan of input.candidates) {
    if (typeof plan?.planId !== "string" || plan.planId.length === 0) {
      throw new HardGateError("every candidate must carry a non-empty planId");
    }
    const metrics = routeCandidateMetricsOf(plan);
    const reasons: { code: HardGateExclusionCode; message: string }[] = [];
    if (intentWindowExpired) {
      reasons.push({
        code: "INTENT_WINDOW_EXPIRED",
        message: `the evaluation instant ${input.at} is at/after the intent expiry ${intent.expiresAt} — an expired authorization window gates every candidate`,
      });
    }
    if (metrics.hopCount > intent.constraints.maxRouteHops) {
      reasons.push({
        code: "HOP_BUDGET_EXCEEDED",
        message: `the plan carries ${metrics.hopCount} hops over the intent's maxRouteHops ${intent.constraints.maxRouteHops}`,
      });
    }
    if (
      metrics.estimatedSettlementMs !== undefined &&
      metrics.estimatedSettlementMs > intent.constraints.maxSettlementMs
    ) {
      reasons.push({
        code: "SETTLEMENT_DEADLINE_EXCEEDED",
        message: `the plan's known settlement estimate ${metrics.estimatedSettlementMs}ms exceeds the intent's maxSettlementMs ${intent.constraints.maxSettlementMs} (an UNKNOWN estimate is retained and disclosed, never coerced)`,
      });
    }
    if (plan.candidateStatus === "INELIGIBLE_CANDIDATE") {
      reasons.push({
        code: "CANDIDATE_INELIGIBLE",
        message: `the compiler marked the plan INELIGIBLE_CANDIDATE (${plan.ineligibilityReasons.length} ineligibility reasons carried verbatim)`,
      });
    }
    if (plan.candidateStatus === "NOT_COMPARABLE") {
      reasons.push({
        code: "CANDIDATE_NOT_COMPARABLE",
        message: "the comparability gate found gaps (every gap carried verbatim — retained, never silently dropped)",
      });
    }
    if (reasons.length === 0) {
      rankEligible.push({ plan, metrics });
    } else {
      gated.push(
        deepFreeze({
          planId: plan.planId,
          shapeId: plan.shapeId,
          candidateStatus: plan.candidateStatus,
          codes: Object.freeze(reasons.map((reason) => reason.code)),
          reasons: Object.freeze(reasons),
          ineligibilityReasons: plan.ineligibilityReasons,
          comparabilityGaps:
            plan.comparability.comparable === true
              ? Object.freeze([])
              : plan.comparability.gaps,
        }),
      );
    }
  }
  const hardGateDigest = contentDigest({
    intentRef: intent.intentId,
    evaluationInstant: input.at,
    gateOrder: HARD_GATE_ORDER,
    rankEligible: rankEligible.map((survivor) => survivor.plan.planDigest),
    gated: gated.map((candidate) => ({
      planId: candidate.planId,
      codes: candidate.codes,
      reasons: candidate.reasons,
    })),
  });
  return deepFreeze({
    intentRef: intent.intentId,
    evaluationInstant: input.at,
    gateOrder: HARD_GATE_ORDER,
    rankEligible: Object.freeze(rankEligible),
    gated: Object.freeze(gated),
    hardGateDigest,
    hardGatesPermitExecution: false,
  });
}
