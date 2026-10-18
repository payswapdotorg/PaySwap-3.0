/**
 * @payswap/route-compiler — the deterministic ranking laws (P5-W1).
 *
 * PORT of the old comparator's rankCandidates (venue level, VENUE_ID
 * final) + NET-NEW the plan-level ranking (scoring-order) over scored
 * ROUTE PLANS with the FEWER_RAIL_CROSSINGS tie-breaker (the F-2
 * within-leg law feeding the order) and PLAN_ID as the total order.
 *
 * THE ORDERING LAW (both levels):
 * 1. net outcome DESCENDING (exact BigInt comparison);
 * 2. then the policy's declared tie-breakers IN ORDER:
 *    LOWER_RISK_CLASS (rank ascending), FASTER_SETTLEMENT (ms
 *    ascending), FEWER_HOPS, FEWER_RAIL_CROSSINGS (within-leg count
 *    ascending), VENUE_ID / PLAN_ID (lexicographic ascending — the
 *    mandatory total order);
 * 3. the comparison NEVER consults optimization origin, execution mode
 *    or baseline status (INV-C08 indifference — provider-native and
 *    composed candidates compete on identical terms; test-enforced with
 *    the discriminating pair whose planId order OPPOSES the crossing
 *    order, proving crossings are consulted BEFORE the total order).
 */

import { ValidationError } from "./errors.ts";
import { type BestExecutionPolicy } from "./policy.ts";
import { compareNetOutcomes, type NetOutcomeEvaluation, type ScoreableCandidate } from "./scoring.ts";
import { candidateHops, candidateRiskRank, candidateSettlementMs } from "./scoring.ts";
import { railCrossingCount } from "./rail-family.ts";
import type { CustodyTransfer } from "./custody.ts";

/** A ranked candidate (venue level): quote + evaluation. */
export interface RankableCandidate {
  readonly candidate: ScoreableCandidate;
  readonly evaluation: NetOutcomeEvaluation;
}

/**
 * Venue-level ranking (PORT of the old law): net descending, then the
 * declared tie-breakers, terminating in VENUE_ID (the total order).
 */
export function rankCandidates(
  candidates: readonly RankableCandidate[],
  policy: BestExecutionPolicy,
): readonly RankableCandidate[] {
  return [...candidates].sort((left, right) =>
    compareRankable(left, right, policy.tieBreakers, (item) => item.candidate.quote.venueId, 0),
  );
}

/** A scored route plan (plan level): planId + evaluation + custody chain. */
export interface ScoredRoutePlan {
  readonly planId: string;
  readonly evaluation: NetOutcomeEvaluation;
  readonly custodies: readonly CustodyTransfer[];
  readonly riskClass: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
  readonly estimatedSettlementMs: number;
  readonly hopCount: number;
}

/**
 * Plan-level ranking (NET-NEW, the scoring-order law): net descending,
 * then the declared tie-breakers with FEWER_RAIL_CROSSINGS in scope,
 * terminating in PLAN_ID (the total order). INV-C08 indifference: the
 * input surface carries no execution mode, no origin, no baseline flag.
 */
export function rankScoredPlans(
  plans: readonly ScoredRoutePlan[],
  policy: BestExecutionPolicy,
): readonly ScoredRoutePlan[] {
  return [...plans].sort((left, right) =>
    compareScoredPlans(left, right, policy.tieBreakers),
  );
}

function compareScoredPlans(
  left: ScoredRoutePlan,
  right: ScoredRoutePlan,
  tieBreakers: readonly string[],
): number {
  const netOrder = compareNetOutcomes(left.evaluation, right.evaluation);
  if (netOrder !== 0) {
    return -netOrder;
  }
  for (const tieBreaker of tieBreakers) {
    switch (tieBreaker) {
      case "LOWER_RISK_CLASS": {
        const order = riskRankOf(left.riskClass) - riskRankOf(right.riskClass);
        if (order !== 0) {
          return order;
        }
        break;
      }
      case "FASTER_SETTLEMENT": {
        const order = left.estimatedSettlementMs - right.estimatedSettlementMs;
        if (order !== 0) {
          return order;
        }
        break;
      }
      case "FEWER_HOPS": {
        const order = left.hopCount - right.hopCount;
        if (order !== 0) {
          return order;
        }
        break;
      }
      case "FEWER_RAIL_CROSSINGS": {
        const order =
          railCrossingCount(left.custodies) - railCrossingCount(right.custodies);
        if (order !== 0) {
          return order;
        }
        break;
      }
      case "PLAN_ID": {
        if (left.planId < right.planId) {
          return -1;
        }
        if (left.planId > right.planId) {
          return 1;
        }
        return 0;
      }
      case "VENUE_ID":
        // Not a plan-level tie-breaker; ignored at plan level (validated
        // policies terminate in one of the two total orders).
        break;
      default:
        throw new ValidationError(`unknown tie-breaker kind '${tieBreaker}'`);
    }
  }
  return left.planId < right.planId ? -1 : left.planId > right.planId ? 1 : 0;
}

function compareRankable(
  left: RankableCandidate,
  right: RankableCandidate,
  tieBreakers: readonly string[],
  venueIdOf: (item: RankableCandidate) => string,
  railCrossings: number,
): number {
  void railCrossings;
  const netOrder = compareNetOutcomes(left.evaluation, right.evaluation);
  if (netOrder !== 0) {
    return -netOrder;
  }
  for (const tieBreaker of tieBreakers) {
    switch (tieBreaker) {
      case "LOWER_RISK_CLASS": {
        const order =
          candidateRiskRank(left.candidate) - candidateRiskRank(right.candidate);
        if (order !== 0) {
          return order;
        }
        break;
      }
      case "FASTER_SETTLEMENT": {
        const order =
          candidateSettlementMs(left.candidate) - candidateSettlementMs(right.candidate);
        if (order !== 0) {
          return order;
        }
        break;
      }
      case "FEWER_HOPS": {
        const order = candidateHops(left.candidate) - candidateHops(right.candidate);
        if (order !== 0) {
          return order;
        }
        break;
      }
      case "FEWER_RAIL_CROSSINGS":
        // Not a venue-level input (venue candidates carry one hop family);
        // a policy declaring it at venue level simply skips it here.
        break;
      case "VENUE_ID": {
        const leftVenue = venueIdOf(left);
        const rightVenue = venueIdOf(right);
        if (leftVenue < rightVenue) {
          return -1;
        }
        if (leftVenue > rightVenue) {
          return 1;
        }
        return 0;
      }
      case "PLAN_ID":
        break;
      default:
        throw new ValidationError(`unknown tie-breaker kind '${tieBreaker}'`);
    }
  }
  const leftVenue = venueIdOf(left);
  const rightVenue = venueIdOf(right);
  return leftVenue < rightVenue ? -1 : leftVenue > rightVenue ? 1 : 0;
}

function riskRankOf(riskClass: "LOW" | "MODERATE" | "ELEVATED" | "HIGH"): number {
  switch (riskClass) {
    case "LOW":
      return 0;
    case "MODERATE":
      return 1;
    case "ELEVATED":
      return 2;
    case "HIGH":
      return 3;
  }
}
