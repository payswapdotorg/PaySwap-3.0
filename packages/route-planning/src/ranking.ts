/**
 * @payswap/route-planning — the transparent deterministic ranking
 * projection (P16-A; ROUTINE-CONTRACT stage 5).
 *
 * Wraps the existing exact-money scoring (the NetOutcomeEvaluation the
 * compiler computed, carried through the port on every scored plan) and
 * produces ranked candidates with EVERY metric dimension visible (cost
 * components via the carried score, settlement timing, risk class, hops,
 * rail crossings, custody kinds, comparability). Where trade-offs
 * conflict, the Pareto/non-dominated front is identified and disclosed.
 * The ordering is deterministic: net outcome DESCENDING (exact BigInt),
 * then the policy's declared tie-breakers IN ORDER (an UNKNOWN dimension
 * contributes no ordering signal — never guessed, never coerced),
 * terminating in the PLAN_ID total order. UNKNOWN and INCOMPARABLE
 * fields are RETAINED and disclosed: unscored-but-hard-eligible
 * candidates are kept in a disclosed tier ordered by planId, never
 * ranked by a guessed number.
 */

import { RouteRankingError } from "./errors.ts";
import { contentDigest, deepFreeze } from "./canonical.ts";
import type { PinnedBestExecutionPolicy } from "./pins/route-compiler.ts";
import type {
  HardGateEvaluation,
  HardGateSurvivor,
  RouteCandidateMetrics,
  RouteMetricDimension,
} from "./hard-gates.ts";

/** The tie-breaker kinds the plan-level ranking consults (frozen). */
export const PLAN_LEVEL_TIE_BREAKERS = Object.freeze([
  "LOWER_RISK_CLASS",
  "FASTER_SETTLEMENT",
  "FEWER_HOPS",
  "FEWER_RAIL_CROSSINGS",
  "PLAN_ID",
] as const);

export type PlanLevelTieBreaker = (typeof PLAN_LEVEL_TIE_BREAKERS)[number];

/** The risk-class rank (LOWER is better; UNKNOWN contributes no signal). */
const RISK_CLASS_RANKS: Readonly<Record<string, number>> = Object.freeze({
  LOW: 0,
  MODERATE: 1,
  ELEVATED: 2,
  HIGH: 3,
});

/** One ranked candidate: the metrics + rank + trade-off disclosure. */
export interface RankedRouteCandidate {
  readonly metrics: RouteCandidateMetrics;
  /** 1-based position within the ranked tier (the deterministic total order). */
  readonly rank: number;
  /** True iff this candidate is on the Pareto/non-dominated front. */
  readonly paretoNonDominated: boolean;
  /** The planIds that dominate this candidate (empty on the front). */
  readonly dominatedBy: readonly string[];
}

/** An unscored-but-hard-eligible candidate: RETAINED and disclosed. */
export interface NotScoredRouteCandidate {
  readonly planId: string;
  readonly shapeId: string;
  readonly reason: string;
  readonly unknownDimensions: readonly RouteMetricDimension[];
}

/** The ranking projection (the stage-5 output contract). */
export interface RouteRankingProjection {
  readonly intentRef: string;
  readonly evaluationInstant: number;
  readonly numeraire: string;
  /** The policy's declared tie-breaker order (visible, never hidden). */
  readonly tieBreakers: readonly string[];
  readonly ranked: readonly RankedRouteCandidate[];
  /** The Pareto/non-dominated front (planIds, planId order). */
  readonly tradeOffFront: readonly string[];
  readonly notScored: readonly NotScoredRouteCandidate[];
  readonly rankingDigest: string;
  /** LITERAL: ranking never permits execution. */
  readonly rankingPermitsExecution: false;
}

/** The ranking request: the gate evaluation (gates BEFORE ranking — structural) + the policy. */
export interface RouteRankingRequest {
  readonly evaluation: HardGateEvaluation;
  readonly policy: PinnedBestExecutionPolicy;
}

function netOf(metrics: RouteCandidateMetrics): bigint {
  if (metrics.score === undefined) {
    throw new RouteRankingError(
      `candidate '${metrics.planId}' carries no score — unscored candidates never enter the ranked tier`,
    );
  }
  return BigInt(metrics.score.netNumeraireMinorUnits);
}

/**
 * The deterministic plan-level comparison: net DESCENDING, then the
 * declared tie-breakers in order (a dimension is consulted ONLY when both
 * sides know it — an UNKNOWN contributes no ordering signal), then the
 * PLAN_ID total order. VENUE_ID is not a plan-level tie-breaker (skipped,
 * exactly like the compiler's own scoring order).
 */
export function compareForRanking(
  left: RouteCandidateMetrics,
  right: RouteCandidateMetrics,
  tieBreakers: readonly string[],
): number {
  const leftNet = netOf(left);
  const rightNet = netOf(right);
  if (leftNet > rightNet) {
    return -1;
  }
  if (leftNet < rightNet) {
    return 1;
  }
  for (const tieBreaker of tieBreakers) {
    switch (tieBreaker) {
      case "LOWER_RISK_CLASS": {
        const leftRank = left.riskClass !== undefined ? RISK_CLASS_RANKS[left.riskClass] : undefined;
        const rightRank = right.riskClass !== undefined ? RISK_CLASS_RANKS[right.riskClass] : undefined;
        if (leftRank !== undefined && rightRank !== undefined && leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        break;
      }
      case "FASTER_SETTLEMENT": {
        if (
          left.estimatedSettlementMs !== undefined &&
          right.estimatedSettlementMs !== undefined &&
          left.estimatedSettlementMs !== right.estimatedSettlementMs
        ) {
          return left.estimatedSettlementMs - right.estimatedSettlementMs;
        }
        break;
      }
      case "FEWER_HOPS": {
        if (left.hopCount !== right.hopCount) {
          return left.hopCount - right.hopCount;
        }
        break;
      }
      case "FEWER_RAIL_CROSSINGS": {
        if (left.railCrossings !== right.railCrossings) {
          return left.railCrossings - right.railCrossings;
        }
        break;
      }
      case "PLAN_ID":
      case "VENUE_ID":
        break;
      default:
        throw new RouteRankingError(`unknown tie-breaker kind '${tieBreaker}'`);
    }
  }
  return left.planId < right.planId ? -1 : left.planId > right.planId ? 1 : 0;
}

/**
 * Pareto domination over the visible dimensions (net higher is better;
 * settlement, risk rank, hops, crossings lower are better). Domination is
 * established ONLY over dimensions BOTH sides know — an UNKNOWN on either
 * side blocks the proof, so an UNKNOWN-dimension candidate is
 * non-dominated by honest default (never coerced).
 */
function dominates(left: RouteCandidateMetrics, right: RouteCandidateMetrics): boolean {
  const leftNet = netOf(left);
  const rightNet = netOf(right);
  let atLeastAsGood = leftNet >= rightNet;
  let strictlyBetter = leftNet > rightNet;
  if (
    left.estimatedSettlementMs !== undefined &&
    right.estimatedSettlementMs !== undefined
  ) {
    atLeastAsGood = atLeastAsGood && left.estimatedSettlementMs <= right.estimatedSettlementMs;
    strictlyBetter = strictlyBetter || left.estimatedSettlementMs < right.estimatedSettlementMs;
  }
  if (left.riskClass !== undefined && right.riskClass !== undefined) {
    const leftRank = RISK_CLASS_RANKS[left.riskClass];
    const rightRank = RISK_CLASS_RANKS[right.riskClass];
    if (leftRank !== undefined && rightRank !== undefined) {
      atLeastAsGood = atLeastAsGood && leftRank <= rightRank;
      strictlyBetter = strictlyBetter || leftRank < rightRank;
    }
  }
  atLeastAsGood = atLeastAsGood && left.hopCount <= right.hopCount;
  strictlyBetter = strictlyBetter || left.hopCount < right.hopCount;
  atLeastAsGood = atLeastAsGood && left.railCrossings <= right.railCrossings;
  strictlyBetter = strictlyBetter || left.railCrossings < right.railCrossings;
  return atLeastAsGood && strictlyBetter;
}

function requirePolicy(policy: PinnedBestExecutionPolicy): PinnedBestExecutionPolicy {
  if (policy === null || typeof policy !== "object") {
    throw new RouteRankingError("a BestExecutionPolicy must be supplied (the declared tie-breaker order is never hidden)");
  }
  if (!Array.isArray(policy.tieBreakers) || policy.tieBreakers.length === 0) {
    throw new RouteRankingError("policy.tieBreakers must be a non-empty array (the declared order is total)");
  }
  if (typeof policy.numeraire !== "string" || policy.numeraire.length === 0) {
    throw new RouteRankingError("policy.numeraire must be a non-empty string");
  }
  return policy;
}

/**
 * Rank the hard-gate survivors: the scored candidates form the ranked
 * tier in the deterministic total order; the Pareto/non-dominated front
 * is disclosed (where trade-offs conflict, no single candidate dominates
 * — the front IS the honest disclosure); unscored-but-hard-eligible
 * candidates are retained in a disclosed tier (never ranked by a guess).
 */
export function rankRoutes(request: RouteRankingRequest): RouteRankingProjection {
  const policy = requirePolicy(request.policy);
  const evaluation = request.evaluation;
  if (evaluation === null || typeof evaluation !== "object" || !Array.isArray(evaluation.rankEligible)) {
    throw new RouteRankingError(
      "a HardGateEvaluation must be supplied — ranking is structurally unreachable without the gates (gates BEFORE ranking)",
    );
  }
  const scored: HardGateSurvivor[] = [];
  const notScored: NotScoredRouteCandidate[] = [];
  for (const survivor of evaluation.rankEligible) {
    if (survivor.metrics.score === undefined) {
      notScored.push({
        planId: survivor.metrics.planId,
        shapeId: survivor.metrics.shapeId,
        reason:
          "the plan carries no exact-money score (the compiler scores comparable plans and baselines on real quote evidence) — retained and disclosed, never ranked by a guessed number",
        unknownDimensions: survivor.metrics.unknownDimensions,
      });
    } else {
      scored.push(survivor);
    }
  }
  const ordered = [...scored].sort((left, right) =>
    compareForRanking(left.metrics, right.metrics, policy.tieBreakers),
  );
  const dominators = new Map<string, string[]>();
  for (const candidate of ordered) {
    dominators.set(
      candidate.metrics.planId,
      ordered
        .filter(
          (other) =>
            other.metrics.planId !== candidate.metrics.planId &&
            dominates(other.metrics, candidate.metrics),
        )
        .map((other) => other.metrics.planId),
    );
  }
  const ranked: RankedRouteCandidate[] = ordered.map((survivor, index) =>
    deepFreeze({
      metrics: survivor.metrics,
      rank: index + 1,
      paretoNonDominated: (dominators.get(survivor.metrics.planId) ?? []).length === 0,
      dominatedBy: Object.freeze(dominators.get(survivor.metrics.planId) ?? []),
    }),
  );
  const tradeOffFront = ranked
    .filter((candidate) => candidate.paretoNonDominated)
    .map((candidate) => candidate.metrics.planId);
  notScored.sort((left, right) => (left.planId < right.planId ? -1 : left.planId > right.planId ? 1 : 0));
  const rankingDigest = contentDigest({
    intentRef: evaluation.intentRef,
    evaluationInstant: evaluation.evaluationInstant,
    hardGateDigest: evaluation.hardGateDigest,
    numeraire: policy.numeraire,
    tieBreakers: policy.tieBreakers,
    ranked: ranked.map((candidate) => ({
      planId: candidate.metrics.planId,
      rank: candidate.rank,
      net: netOf(candidate.metrics),
      paretoNonDominated: candidate.paretoNonDominated,
      dominatedBy: candidate.dominatedBy,
      unknownDimensions: candidate.metrics.unknownDimensions,
    })),
    tradeOffFront,
    notScored,
  });
  return deepFreeze({
    intentRef: evaluation.intentRef,
    evaluationInstant: evaluation.evaluationInstant,
    numeraire: policy.numeraire,
    tieBreakers: Object.freeze([...policy.tieBreakers]),
    ranked: Object.freeze(ranked),
    tradeOffFront: Object.freeze(tradeOffFront),
    notScored: Object.freeze(notScored),
    rankingDigest,
    rankingPermitsExecution: false,
  });
}
