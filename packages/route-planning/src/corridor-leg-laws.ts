/**
 * @payswap/route-planning — the CROSS-PROVIDER CORRIDOR plan-level laws,
 * part 2: the CUSTODY-CONTINUITY law + the HOP-BOUND law (P22-C,
 * ADR-0016 D6/D11) — the typed laws the H lane's composite dispatch
 * runtime implements against (split from ./corridor-plan.ts under the
 * 400-line file law).
 *
 * THE CUSTODY-CONTINUITY LAW (D6, the partial-failure law): a later leg
 * NEVER dispatches after an earlier leg's non-CONFIRMED outcome — the
 * chain stops honestly. A leg UNKNOWN -> the mission goes OUTCOME_UNKNOWN
 * with the per-leg attempt pending reconciliation; a leg FAILED -> the
 * mission stays open with the legs before it as recorded facts. LEGS
 * NEVER SILENTLY SKIP: an unrecorded (undefined) prior outcome is NOT a
 * passed leg — dispatching past it is a typed violation, and an outcome
 * vector that records anything after a non-CONFIRMED leg is invalid.
 *
 * THE HOP-BOUND LAW (D11): the corridor demand rides the MOVE/CONVERT
 * direction classes; the corridor's hop count (the skeleton's four legs)
 * must satisfy the intent's maxRouteHops constraint (the canonical
 * 1..PINNED_MAX_ROUTE_HOPS surface). PAY keeps
 * PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1 byte-identically — a
 * direct-payment-classed demand never silently widens onto the corridor.
 *
 * ADVISORY-PLAN LAW: nothing in this module dispatches, authorizes or
 * executes — these are the plan-level LAWS (pure, deterministic,
 * fail-closed); the dispatch runtime itself is the H lane's (D6).
 */

import { CorridorPlanLawError } from "./errors.ts";
import { PINNED_MAX_ROUTE_HOPS } from "./pins/economic.ts";
import {
  PINNED_CORRIDOR_LEG_OUTCOMES,
  PINNED_CORRIDOR_LEG_SKELETON,
  PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS,
  PINNED_MISSION_DIRECTION_CLASSES,
} from "./pins/corridor.ts";
import type { PinnedCorridorLegOutcome, PinnedMissionDirectionClass } from "./pins/corridor.ts";

// ---------------------------------------------------------------------------
// The shared vocabulary predicates + the hop count
// ---------------------------------------------------------------------------

/** True iff the value is one of the pinned corridor leg outcomes. */
export function isPinnedCorridorLegOutcome(value: unknown): value is PinnedCorridorLegOutcome {
  return typeof value === "string" && (PINNED_CORRIDOR_LEG_OUTCOMES as readonly string[]).includes(value);
}

/** True iff the value is one of the pinned mission direction classes. */
export function isPinnedMissionDirectionClass(value: unknown): value is PinnedMissionDirectionClass {
  return typeof value === "string" && (PINNED_MISSION_DIRECTION_CLASSES as readonly string[]).includes(value);
}

/** The corridor's hop count (the pinned skeleton's leg count — 4). */
export function corridorHopCount(): number {
  return PINNED_CORRIDOR_LEG_SKELETON.length;
}

// ---------------------------------------------------------------------------
// The custody-continuity law (D6: the chain stops honestly)
// ---------------------------------------------------------------------------

/** Why a corridor leg's dispatch is refused (the honest blocking fact). */
export type CorridorDispatchBlock =
  | { readonly blockingLegIndex: number; readonly blockingOutcome: "UNKNOWN" }
  | { readonly blockingLegIndex: number; readonly blockingOutcome: "FAILED" }
  | { readonly blockingLegIndex: number; readonly blockingOutcome: "UNRECORDED" };

/** The custody-continuity verdict for one leg's dispatch (pure data). */
export type CorridorDispatchVerdict =
  | { readonly permitted: true; readonly legIndex: number }
  | { readonly permitted: false; readonly legIndex: number; readonly block: CorridorDispatchBlock; readonly reason: string };

/**
 * THE CUSTODY-CONTINUITY DISPATCH VERDICT (D6, pure + total): may leg
 * `legIndex` dispatch given the index-aligned recorded outcomes of every
 * EARLIER leg? A later leg dispatches ONLY when every earlier leg's
 * outcome is exactly CONFIRMED —
 * - an earlier UNKNOWN blocks (the mission goes OUTCOME_UNKNOWN, the
 *   per-leg attempt pending reconciliation);
 * - an earlier FAILED blocks (the mission stays open, the legs before it
 *   recorded facts; the chain stops honestly);
 * - an earlier UNRECORDED (undefined) outcome blocks (legs never
 *   silently skip — an unrecorded leg is not a passed leg).
 * The FIRST blocking leg (lowest index) is named — never a vague refusal.
 */
export function corridorLegDispatchVerdict(
  legIndex: number,
  priorOutcomes: readonly (PinnedCorridorLegOutcome | undefined)[],
): CorridorDispatchVerdict {
  if (typeof legIndex !== "number" || !Number.isSafeInteger(legIndex) || legIndex < 1 || legIndex >= PINNED_CORRIDOR_LEG_SKELETON.length) {
    throw new CorridorPlanLawError(
      `the dispatch verdict is asked for a corridor leg index in [1, ${String(PINNED_CORRIDOR_LEG_SKELETON.length - 1)}] (got '${String(legIndex)}') — leg 0 has no prior leg; the last leg is index ${String(PINNED_CORRIDOR_LEG_SKELETON.length - 1)}`,
      { legIndex },
    );
  }
  if (!Array.isArray(priorOutcomes) || priorOutcomes.length !== legIndex) {
    throw new CorridorPlanLawError(
      `leg ${String(legIndex)}'s dispatch verdict requires exactly ${String(legIndex)} prior leg outcomes (got '${String(Array.isArray(priorOutcomes) ? priorOutcomes.length : "non-array")}') — the outcome vector is index-aligned with the skeleton`,
      { legIndex, provided: Array.isArray(priorOutcomes) ? priorOutcomes.length : -1 },
    );
  }
  for (let index = 0; index < priorOutcomes.length; index += 1) {
    const outcome = priorOutcomes[index];
    if (outcome === undefined) {
      return {
        permitted: false,
        legIndex,
        block: { blockingLegIndex: index, blockingOutcome: "UNRECORDED" },
        reason: `leg ${String(index)}'s outcome is UNRECORDED — legs never silently skip; an unrecorded leg is not a passed leg (the chain waits for its outcome, honestly)`,
      };
    }
    if (!isPinnedCorridorLegOutcome(outcome)) {
      throw new CorridorPlanLawError(
        `leg ${String(index)}'s recorded outcome '${String(outcome)}' is not one of the pinned corridor leg outcomes — the outcome vocabulary is closed`,
        { legIndex: index, outcome },
      );
    }
    if (outcome === "UNKNOWN") {
      return {
        permitted: false,
        legIndex,
        block: { blockingLegIndex: index, blockingOutcome: "UNKNOWN" },
        reason: `leg ${String(index)}'s outcome is UNKNOWN — the mission goes OUTCOME_UNKNOWN with the per-leg attempt pending reconciliation; a later leg NEVER dispatches after an earlier leg's non-CONFIRMED outcome`,
      };
    }
    if (outcome === "FAILED") {
      return {
        permitted: false,
        legIndex,
        block: { blockingLegIndex: index, blockingOutcome: "FAILED" },
        reason: `leg ${String(index)}'s outcome is FAILED — the mission stays open with the legs before it as recorded facts; the chain stops honestly (custody continuity)`,
      };
    }
  }
  return { permitted: true, legIndex };
}

/**
 * The THROWING form of the custody-continuity verdict (the H lane's
 * dispatch runtime calls this at the per-leg gate): a refused dispatch
 * is the typed CorridorPlanLawError, never a silent skip.
 */
export function assertCorridorLegDispatchPermitted(
  legIndex: number,
  priorOutcomes: readonly (PinnedCorridorLegOutcome | undefined)[],
): void {
  const verdict = corridorLegDispatchVerdict(legIndex, priorOutcomes);
  if (!verdict.permitted) {
    throw new CorridorPlanLawError(
      `corridor leg ${String(legIndex)} dispatch refused: ${verdict.reason}`,
      { legIndex, block: verdict.block },
    );
  }
}

/** The honest state of a whole corridor outcome vector (pure, total). */
export type CorridorChainState =
  | { readonly state: "ALL_LEGS_CONFIRMED" }
  | { readonly state: "STOPPED_AFTER_LEG"; readonly legIndex: number; readonly outcome: "UNKNOWN" | "FAILED" }
  | { readonly state: "PENDING"; readonly nextLegIndex: number };

/**
 * THE WHOLE-CHAIN LAW (pure, fail-closed): project a full corridor
 * outcome vector (index-aligned with the skeleton, one entry per leg)
 * onto the honest chain state. Legs never silently skip: a vector that
 * records ANYTHING after a non-CONFIRMED leg is a typed violation (a
 * later leg dispatched past a stopped chain); an unrecorded trailing
 * tail is the honest PENDING state at the next leg.
 */
export function corridorChainState(
  outcomes: readonly (PinnedCorridorLegOutcome | undefined)[],
): CorridorChainState {
  if (!Array.isArray(outcomes) || outcomes.length !== PINNED_CORRIDOR_LEG_SKELETON.length) {
    throw new CorridorPlanLawError(
      `the corridor outcome vector carries exactly ${String(PINNED_CORRIDOR_LEG_SKELETON.length)} entries (got '${String(Array.isArray(outcomes) ? outcomes.length : "non-array")}') — index-aligned with the pinned skeleton`,
    );
  }
  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];
    if (outcome === undefined) {
      return { state: "PENDING", nextLegIndex: index };
    }
    if (!isPinnedCorridorLegOutcome(outcome)) {
      throw new CorridorPlanLawError(
        `leg ${String(index)}'s recorded outcome '${String(outcome)}' is not one of the pinned corridor leg outcomes — the outcome vocabulary is closed`,
        { legIndex: index, outcome },
      );
    }
    if (outcome !== "CONFIRMED") {
      const tail = outcomes.slice(index + 1);
      if (tail.some((entry) => entry !== undefined)) {
        throw new CorridorPlanLawError(
          `legs never silently skip: the outcome vector records entries after leg ${String(index)}'s non-CONFIRMED outcome '${String(outcome)}' — a later leg NEVER dispatches after an earlier leg's non-CONFIRMED outcome`,
          { legIndex: index, outcome },
        );
      }
      return { state: "STOPPED_AFTER_LEG", legIndex: index, outcome };
    }
  }
  return { state: "ALL_LEGS_CONFIRMED" };
}

// ---------------------------------------------------------------------------
// The hop-bound law (D11: MOVE/CONVERT ride; PAY stays max-hops-1)
// ---------------------------------------------------------------------------

/** The hop-bound verdict for a corridor-classed demand (pure data). */
export type CorridorHopBoundVerdict =
  | { readonly permitted: true; readonly direction: "MOVE" | "CONVERT"; readonly hopCount: number }
  | { readonly permitted: false; readonly reason: string };

/**
 * THE HOP-BOUND LAW (D11, pure + total): may a demand of direction class
 * `direction` with intent constraint `maxRouteHops` ride the corridor?
 * - the corridor rides the MOVE/CONVERT direction classes ONLY;
 * - PAY keeps PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1 byte-identically
 *   (a direct payment demand never silently widens onto the corridor);
 * - the corridor's hop count (the skeleton's four legs) must satisfy the
 *   intent's maxRouteHops, itself within the canonical 1..PINNED_MAX_ROUTE_HOPS
 *   surface.
 */
export function corridorDemandHopBound(
  direction: unknown,
  maxRouteHops: unknown,
): CorridorHopBoundVerdict {
  if (!isPinnedMissionDirectionClass(direction)) {
    return {
      permitted: false,
      reason: `the direction class '${String(direction)}' is not one of the pinned mission direction classes [${PINNED_MISSION_DIRECTION_CLASSES.join(", ")}] — the vocabulary is closed`,
    };
  }
  if (direction === "PAY") {
    return {
      permitted: false,
      reason: `a PAY-classed demand is a direct payment: DIRECT_PAYMENT_MAX_ROUTE_HOPS = ${String(PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS)} byte-identically — a direct payment demand never silently widens onto the corridor (the honest surface is the exclusion + the repair cards + the hypothesis)`,
    };
  }
  if (direction === "RECEIVE") {
    return {
      permitted: false,
      reason: "a RECEIVE-classed demand is the counterparty's view, never the corridor ask — the corridor demand rides the MOVE/CONVERT direction classes only",
    };
  }
  if (typeof maxRouteHops !== "number" || !Number.isSafeInteger(maxRouteHops) || maxRouteHops < 1 || maxRouteHops > PINNED_MAX_ROUTE_HOPS) {
    return {
      permitted: false,
      reason: `the intent's maxRouteHops must be an integer in [1, ${String(PINNED_MAX_ROUTE_HOPS)}] (got '${String(maxRouteHops)}') — the canonical hop-constraint surface`,
    };
  }
  const hopCount = corridorHopCount();
  if (maxRouteHops < hopCount) {
    return {
      permitted: false,
      reason: `the corridor's hop count (${String(hopCount)} legs) exceeds the intent's maxRouteHops constraint (${String(maxRouteHops)}) — the plan never silently widens past the demand's bound`,
    };
  }
  return { permitted: true, direction, hopCount };
}
