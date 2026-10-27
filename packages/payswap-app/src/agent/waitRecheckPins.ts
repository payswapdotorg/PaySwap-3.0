/**
 * @payswap/app — the WAIT RE-CHECK pins (P21-B run 3, ADR-0014 D9/D10 —
 * the D10 "check now" controls, app side).
 *
 * MIRROR DISCIPLINE (the missionIntakePins.ts pattern): the outcome
 * shape mirrors @payswap/opportunities wait-recheck.ts (the P21-C pure
 * "check now" evaluator — WaitRecheckOutcome's match + waitEvaluation +
 * staleness facts) through the app's established structural pins
 * (RoutePlanningOpportunityMatchPin mirrors the evaluator's own
 * five-key WaitEvaluation). The app ships NO default implementation —
 * the platform host's composition root binds the REAL evaluator behind
 * the port; an unbound plane renders the honest not-wired note.
 *
 * LAWS (ADR-0014 D9/D10):
 * - A re-check is USER-TRIGGERED and REPORTS ONLY: the outcome carries
 *   the pinned never-dispatch literals (waitingNeverDispatches: false —
 *   the wait vocabulary authority; neverAutoDispatches: true — the
 *   re-check evaluator's own literal). A match NEVER auto-dispatches:
 *   it records OPPORTUNITY_MATCHED through the session, the task STAYS
 *   WAITING, and the only route onward is FRESH planning + preview + a
 *   NEW explicit authorization on the real authority surface.
 * - The expiry fact comes from the EVALUATOR (evaluateWaitCriteria over
 *   the declared bound) — never a renderer clock.
 * - The port input carries the durable wait criteria (parsed from the
 *   task's WAIT_CRITERIA_RECORDED event by the app's own projection);
 *   the host supplies the re-check instant (DATA — carried in the
 *   outcome's recheckedAt).
 */

import type { RoutePlanningOpportunityMatchPin, RoutePlanningWaitCriteriaPin } from "./routePlanningPins.js";

/** The recomputed match facts (the evaluator's result shape, pinned). */
export interface WaitRecheckOutcomePin {
  /** ISO-8601 UTC instant — when the re-check ran (DATA, host-supplied). */
  readonly recheckedAt: string;
  /** The consent-gated fresh matches (sorted, deterministic). */
  readonly matchedOpportunityIds: readonly string[];
  /** The wait categories each matched opportunity is attributed to. */
  readonly categoryAttribution: Readonly<Record<string, readonly RoutePlanningWaitCriteriaPin["categories"][number][]>>;
  /** The discovered observations that were STALE at the re-check instant. */
  readonly staleOpportunityIds: readonly string[];
  /** The declared-bound expiry fact (at >= declaredAt + maxWaitMs). */
  readonly expired: boolean;
  /** The wait evaluation's own reason vocabulary (e.g. WAIT_EXPIRED). */
  readonly reasons: readonly string[];
  /** The pinned literal (the wait vocabulary authority): a wait match NEVER dispatches. */
  readonly waitingNeverDispatches: false;
  /** The pinned literal (the re-check evaluator): a re-check only reports. */
  readonly neverAutoDispatches: true;
}

/** The re-check plane port (the composition seam the platform host binds). */
export interface WaitRecheckPlanePort {
  /**
   * Recompute the wait's matches over FRESH observations (the REAL
   * evaluator renderer-side). Fail-closed: a typed refusal rethrows and
   * surfaces through the mount's honest error path, never masked.
   */
  recheckWait(input: {
    readonly taskRef: string;
    readonly criteria: RoutePlanningWaitCriteriaPin;
  }): Promise<WaitRecheckOutcomePin>;
}

/** The honest not-wired note (the web tier's truth — rendered VERBATIM). */
export const WAIT_RECHECK_UNBOUND_NOTE =
  "The wait re-check is not wired in this deployment — the check-now control cannot recompute matches honestly here. The platform host binds the re-check evaluator at its composition root; until then this section states the gap instead of a silent no-op button." as const;

/** The matched rendering's standing law (re-plan required, never a dispatch). */
export const WAIT_RECHECK_MATCH_NOTE =
  "Opportunity matched — re-plan required: a match never dispatches. Proceeding requires a fresh route-planning preview and a NEW explicit scoped authorization on the real authority surface; nothing here dispatches, approves or moves money." as const;

/**
 * Project the re-check outcome onto the session's five-key match record
 * (the pure facts — matchedOpportunityIds, categoryAttribution, expired,
 * reasons, waitingNeverDispatches): what recordOpportunityMatch records
 * so the task's timeline carries the match while it STAYS WAITING.
 */
export function opportunityMatchOfRecheck(outcome: WaitRecheckOutcomePin): RoutePlanningOpportunityMatchPin {
  return Object.freeze({
    matchedOpportunityIds: Object.freeze([...outcome.matchedOpportunityIds]),
    categoryAttribution: Object.freeze(
      Object.fromEntries(
        Object.entries(outcome.categoryAttribution).map(([key, categories]) => [key, Object.freeze([...categories])]),
      ),
    ) as RoutePlanningOpportunityMatchPin["categoryAttribution"],
    expired: outcome.expired,
    reasons: Object.freeze([...outcome.reasons]),
    waitingNeverDispatches: false,
  });
}
