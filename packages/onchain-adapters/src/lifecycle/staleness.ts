/**
 * @payswap/onchain-adapters — staleness guards (Work Order P4-W3, lane
 * R2-W3; PORT of payswap.org@8a735bf packages/onchain-adapters/src/
 * lifecycle.ts staleness half).
 *
 * Observe-stale → invalidation: a chain head is fresh for acting only when
 * the acting instant is within its declared maximum age. A stale (or
 * future-dated) head invalidates preparation/broadcast — the operation is
 * re-observed, never executed on stale state.
 */

import { StaleObservationError } from '../errors.ts';
import type { ChainHeadObservation } from '../contract/observations.ts';

/**
 * A chain head is fresh for acting when `at` is within its declared maximum
 * age. Fail-closed rules: an unparseable observedAt is stale; a head dated
 * in the future relative to the acting instant is stale (clock skew is
 * never trusted); an over-age head is stale.
 */
export function assertHeadFresh(head: ChainHeadObservation, atMs: number): void {
  const observedAtMs = Date.parse(head.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    throw new StaleObservationError(
      `chain-head observation '${head.headHash}' carries an unparseable observedAt '${head.observedAt}' — treated as stale (fail closed)`,
    );
  }
  const ageSeconds = (atMs - observedAtMs) / 1000;
  if (ageSeconds < -1) {
    throw new StaleObservationError(
      `chain-head observation '${head.headHash}' is dated in the future relative to the acting instant — treated as stale (fail closed)`,
    );
  }
  if (ageSeconds > head.maxAgeSeconds) {
    throw new StaleObservationError(
      `chain-head observation '${head.headHash}' is ${Math.floor(ageSeconds)}s old (max ${head.maxAgeSeconds}s) — stale observations invalidate preparation; re-observe, never execute on stale state`,
    );
  }
}

/** Deterministic freshness probe for any observation with `asOf` + maxAge. */
export function isObservationFresh(
  observation: { readonly asOf: string; readonly maxAgeSeconds: number },
  atMs: number,
): boolean {
  const asOfMs = Date.parse(observation.asOf);
  if (!Number.isFinite(asOfMs)) {
    return false;
  }
  return atMs - asOfMs <= observation.maxAgeSeconds * 1000;
}
