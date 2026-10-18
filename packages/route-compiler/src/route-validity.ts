/**
 * @payswap/route-compiler — stale-route invalidation (P5-W1).
 *
 * PORT of the old best-execution stale-routes law (MMI-19): a selected
 * route carries its quote and health observations; both are
 * freshness-BOUNDED. `checkSelectedRouteValidity` re-derives validity
 * at a later instant with the INCLUSIVE bound law — invalid iff the
 * quote OR the health observation aged out (valid at exactly maxAge,
 * invalid one ms later). `assertSelectedRouteValid` throws
 * RouteInvalidatedError — the discipline is RE-RUN, NEVER REPAIR: a
 * stale route is never patched, never re-ranked; the caller re-executes
 * best execution on fresh evidence (the original decision remains
 * immutable history).
 */

import { RouteInvalidatedError } from "./errors.ts";
import { isQuoteStale } from "./quote.ts";
import { isHealthObservationStale } from "./quote-fees.ts";
import type { BestExecutionDecision } from "./best-execution.ts";

/** One stale-route reason (code + venue + quote + detail). */
export interface StaleRouteReason {
  readonly code: "QUOTE_STALE" | "HEALTH_OBSERVATION_STALE";
  readonly venueId: string;
  readonly quoteId?: string;
  readonly detail: string;
}

/** The validity verdict at a later instant (checkedAt recorded). */
export type RouteValidity =
  | { readonly valid: true; readonly checkedAt: number }
  | { readonly valid: false; readonly checkedAt: number; readonly reasons: readonly StaleRouteReason[] };

/** Re-derive the validity of a decision's selected route at `at`. */
export function checkSelectedRouteValidity(
  decision: BestExecutionDecision,
  at: number,
): RouteValidity {
  if (decision.decision !== "ROUTE_SELECTED") {
    throw new RouteInvalidatedError(
      "only a ROUTE_SELECTED decision carries a route whose validity can be re-derived (an empty decision has nothing to invalidate)",
    );
  }
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RouteInvalidatedError("the re-check instant must be a non-negative integer (no ambient clock)");
  }
  const selected = decision.selected;
  const reasons: StaleRouteReason[] = [];
  if (isQuoteStale(selected.quote.freshness, at)) {
    reasons.push({
      code: "QUOTE_STALE",
      venueId: selected.venueId,
      quoteId: selected.quoteId,
      detail: `the selected quote aged out at the re-check instant (asOfMs ${selected.quote.freshness.asOfMs}, maxAgeMs ${selected.quote.freshness.maxAgeMs}, at ${at})`,
    });
  }
  if (isHealthObservationStale(selected.health, at)) {
    reasons.push({
      code: "HEALTH_OBSERVATION_STALE",
      venueId: selected.venueId,
      quoteId: selected.quoteId,
      detail: `the selected route's health observation aged out (observedAtMs ${selected.health.observedAtMs}, maxAgeMs ${selected.health.maxAgeMs}, at ${at})`,
    });
  }
  if (reasons.length > 0) {
    return Object.freeze({ valid: false, checkedAt: at, reasons: Object.freeze(reasons) });
  }
  return Object.freeze({ valid: true, checkedAt: at });
}

/** Fail-closed assert: throws RouteInvalidatedError when stale (re-run, never repair). */
export function assertSelectedRouteValid(decision: BestExecutionDecision, at: number): void {
  const validity = checkSelectedRouteValidity(decision, at);
  if (!validity.valid) {
    const codes = validity.reasons.map((reason) => reason.code).join(", ");
    throw new RouteInvalidatedError(
      `the selected route is stale at ${at} (${codes}) — re-run best execution on fresh evidence; a stale route is never repaired, and the invalidated decision remains immutable history`,
    );
  }
}
