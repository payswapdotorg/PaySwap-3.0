/**
 * @payswap/opportunities — the observation law applied to opportunities
 * (P6-W2, lane r4-w2; ADAPTED from payswap.org@8a735bf
 * packages/onchain-opportunities/src/observation.ts — staleness re-derived
 * over the FULL versioned lineage, not just the primary window).
 *
 * `resolveOpportunity` is the deterministic read-time projection at one
 * caller-supplied instant: CURRENT (fresh — the policy is RE-DERIVED,
 * never trusted); STALE (the primary, ANY supporting observation or ANY
 * leg past its bound: eligibility forced false with STALE_OBSERVATION,
 * the full evidence chain preserved verbatim — never attractive, never
 * repaired, never silently dropped).
 */

import type { FinancialOpportunity } from "./model.ts";
import {
  evaluateDiscoveryPolicy,
  isOpportunityStale,
} from "./eligibility.ts";
import type { DiscoveryPolicyEvaluation } from "./eligibility.ts";

/** Why a resolved opportunity is not current. */
export type OpportunityInvalidationReason = "STALE_OBSERVATION";

/** The deterministic read-time projection of an opportunity. */
export type ResolvedOpportunity =
  | {
      readonly status: "CURRENT";
      readonly opportunity: FinancialOpportunity;
      readonly policy: DiscoveryPolicyEvaluation;
    }
  | {
      readonly status: "STALE";
      readonly opportunity: FinancialOpportunity;
      /** The re-derived evaluation — always ineligible once stale. */
      readonly policy: DiscoveryPolicyEvaluation;
      readonly reason: OpportunityInvalidationReason;
      /** The caller-supplied invalidation instant (no ambient clock). */
      readonly invalidatedAt: number;
    };

/**
 * Resolves one opportunity at instant `at`. Deterministic and pure: the
 * same opportunity and instant always yield the same resolution. A stale
 * observation surfaces as STALE with eligibility forced false — the
 * deterministic invalidation the observation law demands — while the
 * evidence chain (venue, protocol, adapter, observer, evidence refs,
 * versions, freshness) is carried through verbatim.
 */
export function resolveOpportunity(
  opportunity: FinancialOpportunity,
  at: number,
): ResolvedOpportunity {
  if (!Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(
      "the resolution instant `at` must be a non-negative integer (ms; no ambient clock)",
    );
  }
  const stale = isOpportunityStale(opportunity, at);
  const policy = evaluateDiscoveryPolicy(opportunity, at);
  if (!stale) {
    return Object.freeze({
      status: "CURRENT",
      opportunity,
      policy,
    });
  }
  // Deterministic invalidation: a stale observation is never eligible.
  const invalidated: DiscoveryPolicyEvaluation = Object.freeze({
    eligible: false,
    reasons: Object.freeze([
      ...new Set([...policy.reasons, "STALE_OBSERVATION" as const]),
    ]),
    flags: policy.flags,
    evaluatedAt: at,
  });
  return Object.freeze({
    status: "STALE",
    opportunity,
    policy: invalidated,
    reason: "STALE_OBSERVATION",
    invalidatedAt: at,
  });
}

/**
 * Resolves a batch deterministically: same instants, same order in, same
 * order out. Stale entries are invalidated (never dropped, never
 * repaired).
 */
export function resolveOpportunities(
  opportunities: readonly FinancialOpportunity[],
  at: number,
): readonly ResolvedOpportunity[] {
  return Object.freeze(
    opportunities.map((opportunity) => resolveOpportunity(opportunity, at)),
  );
}
