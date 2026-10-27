/**
 * @payswap/opportunities — the WAIT RE-CHECK evaluator (P21-C, lane C;
 * ADR-0014 D9/D10): the pure domain service behind the user-triggered
 * "check now". Given the durable wait criteria, a FRESH observation set
 * (the opportunities discovered at re-check time, with their freshness)
 * and the consent snapshot, it computes the re-check outcome by REUSING
 * the existing matchers — `matchOpportunities` (the consent-gated
 * minimum-disclosure fresh match) and `evaluateWaitCriteria` (the pure
 * five-key wait evaluation whose `waitingNeverDispatches` literal stays
 * byte-identical) — never a parallel matcher. STALE observations never
 * match and are reported as the staleness facts; expiry and matches are
 * reported TOGETHER; conditional opportunities re-check as LIVENESS
 * facts (state + expiry + whether the underlying opportunity now
 * matches). The honest `neverAutoDispatches: true` literal: a re-check
 * only reports — fresh planning, preview and NEW explicit authorization
 * decide, never this service.
 *
 * PURE: `at` is a caller-supplied parameter (the existing pattern — no
 * ambient clock, no scheduler claim; a background re-check scheduler is
 * deliberately NOT modeled here).
 */

import { evaluateWaitCriteria } from "./wait-criteria.ts";
import type { WaitEvaluation } from "./wait-criteria.ts";
import { matchOpportunities } from "./matching.ts";
import type { MatchResult, OpportunityMatchCriteria } from "./matching.ts";
import type { ConsentSnapshot } from "./consent.ts";
import { isOpportunityStale } from "./eligibility.ts";
import type { FinancialOpportunity } from "./model.ts";
import type { ConditionalOpportunity, ConditionalState } from "./conditional.ts";

/** Input to `recheckWait` (the consent snapshot is the gate, as ever). */
export interface WaitRecheckInput {
  readonly criteria: OpportunityMatchCriteria;
  /** The opportunities discovered at re-check time (their freshness decides). */
  readonly opportunities: readonly FinancialOpportunity[];
  readonly consent: ConsentSnapshot;
  /** The derived conditional opportunities carried into the re-check (optional). */
  readonly conditionalOpportunities?: readonly ConditionalOpportunity[];
}

/** One conditional-opportunity liveness fact (never a dispatchable match). */
export interface ConditionalRecheckFact {
  readonly conditionalId: string;
  readonly state: ConditionalState;
  /** The conditional's own expiry (at >= expiresAt). */
  readonly expired: boolean;
  readonly underlyingOpportunityId: string;
  /** True iff the underlying opportunity is among the fresh consent-gated matches. */
  readonly underlyingMatched: boolean;
}

/** The pure re-check outcome (advisory facts only — no action keys at any name). */
export interface WaitRecheckOutcome {
  readonly recheckedAt: number;
  /** The consent-gated fresh match (matchOpportunities' result, verbatim). */
  readonly match: MatchResult;
  /** The pure wait evaluation (evaluateWaitCriteria' five keys, verbatim). */
  readonly waitEvaluation: WaitEvaluation;
  /** The staleness facts: which discovered observations were STALE at `at`. */
  readonly staleOpportunityIds: readonly string[];
  /** The conditional liveness facts (sorted by conditionalId). */
  readonly conditionalFacts: readonly ConditionalRecheckFact[];
  /** The pinned literal: a re-check NEVER auto-dispatches (it only reports). */
  readonly neverAutoDispatches: true;
}

/**
 * THE re-check service (pure, deterministic): recomputes the wait's
 * matches over the FRESH observation set through the EXISTING matchers,
 * reports the staleness facts, the expiry state (expired + matched
 * TOGETHER) and the conditional liveness facts. A revoked consent fails
 * closed through the matcher's own typed error; a re-check result NEVER
 * carries an action, command, dispatch or execute key — the only route
 * onward is fresh planning + explicit authorization.
 */
export function recheckWait(input: WaitRecheckInput, at: number): WaitRecheckOutcome {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError("the re-check instant `at` must be a non-negative integer (ms; no ambient clock)");
  }
  if (input === null || typeof input !== "object") {
    throw new RangeError("recheckWait requires an input { criteria, opportunities, consent }");
  }
  // The EXISTING matchers, never a parallel one: the consent-gated fresh
  // match and the pure five-key wait evaluation over the same set.
  const match = matchOpportunities(
    { criteria: input.criteria, opportunities: input.opportunities, consent: input.consent },
    at,
  );
  const waitEvaluation = evaluateWaitCriteria(input.criteria, input.opportunities, at);
  // The staleness facts: the eligibility module's own rule, applied for
  // REPORTING (a stale observation never matched — this says which).
  const staleOpportunityIds = input.opportunities
    .filter((opportunity) => isOpportunityStale(opportunity, at))
    .map((opportunity) => opportunity.opportunityId)
    .sort();
  const matchedIds = new Set(match.matched.map((entry) => entry.opportunityId));
  const conditionalFacts: ConditionalRecheckFact[] = (input.conditionalOpportunities ?? [])
    .map((conditional) => ({
      conditionalId: conditional.conditionalId,
      state: conditional.state,
      expired: at >= conditional.expiresAt,
      underlyingOpportunityId: conditional.opportunityId,
      underlyingMatched: matchedIds.has(conditional.opportunityId),
    }))
    .sort((a, b) => (a.conditionalId < b.conditionalId ? -1 : a.conditionalId > b.conditionalId ? 1 : 0));
  return Object.freeze({
    recheckedAt: at,
    match,
    waitEvaluation,
    staleOpportunityIds: Object.freeze([...staleOpportunityIds]),
    conditionalFacts: Object.freeze(conditionalFacts.map((fact) => Object.freeze({ ...fact }))),
    neverAutoDispatches: true,
  });
}
