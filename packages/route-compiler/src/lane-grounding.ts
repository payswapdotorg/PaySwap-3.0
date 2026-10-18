/**
 * @payswap/route-compiler — lane grounding: the input-asset observation
 * law (P5-W1).
 *
 * PORT of the old mixed-rail onchain-lane grounding block (MMI-19): a
 * lane is proved ONLY when its INPUT asset position is grounded by a
 * CANONICAL, FRESH asset observation for the exact (chain, canonical
 * asset ref, owner account). A catalogue claim, a quote or a liquidity
 * estimate NEVER grounds a lane (INV-C05 — and the liquidity advisory
 * law: liquidity is never funding).
 *
 * The honest three-way verdict (never a fabricated lane):
 * - GROUNDED: the exact observation exists AND is fresh at `at`;
 * - MISSING: no observation for the exact triple (detail names the
 *   INV-C05 law);
 * - STALE: the observation exists but aged out (the inclusive bound
 *   law; re-observe, never execute on stale state).
 */

import { ValidationError } from "./errors.ts";
import { canonicalAssetRef } from "./identifiers.ts";
import { isLocationObservationFresh } from "./grounding.ts";
import type { FundsLocationObservation } from "./grounding.ts";
import type { PinnedAssetIdentity } from "./pins/onchain.ts";

/** The closed grounding verdict vocabulary (frozen). */
export const LANE_GROUNDING_VERDICTS = Object.freeze([
  "GROUNDED",
  "INPUT_ASSET_OBSERVATION_MISSING",
  "INPUT_ASSET_OBSERVATION_STALE",
] as const);

export type LaneGroundingVerdict = (typeof LANE_GROUNDING_VERDICTS)[number];

/** The grounding outcome (verdict + detail + the grounded observation when proved). */
export interface LaneGroundingOutcome {
  readonly verdict: LaneGroundingVerdict;
  readonly detail: string;
  readonly observation?: FundsLocationObservation;
}

/**
 * Ground a lane's input asset: find the canonical ONCHAIN_POSITION
 * observation for (chain, canonicalAssetRef(chain, symbol), owner) and
 * judge its freshness at the caller-supplied instant.
 */
export function groundLaneInputAsset(
  observations: readonly FundsLocationObservation[],
  asset: PinnedAssetIdentity,
  owner: string,
  at: number,
): LaneGroundingOutcome {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new ValidationError("the evaluation instant must be a non-negative integer (no ambient clock)");
  }
  const expectedAssetRef = canonicalAssetRef(asset.chain, asset.symbol);
  const candidates = observations.filter(
    (observation) =>
      observation.observationKind === "ONCHAIN_POSITION" &&
      observation.chainKey === asset.chain &&
      observation.assetId === expectedAssetRef &&
      observation.accountRef === owner,
  );
  const grounded = candidates[0];
  if (grounded === undefined) {
    return Object.freeze({
      verdict: "INPUT_ASSET_OBSERVATION_MISSING",
      detail: `no input-asset observation grounds the lane for owner '${owner}' on asset '${expectedAssetRef}' — a catalogue or quote alone never grounds execution (INV-C05)`,
    });
  }
  if (!isLocationObservationFresh(grounded, at)) {
    return Object.freeze({
      verdict: "INPUT_ASSET_OBSERVATION_STALE",
      detail: `the input-asset observation '${grounded.observationRef}' aged out at the evaluation instant — the lane is re-observed, never executed on stale state (the freshness law)`,
    });
  }
  return Object.freeze({
    verdict: "GROUNDED",
    detail: `the input-asset observation '${grounded.observationRef}' grounds the lane for owner '${owner}' on asset '${expectedAssetRef}'`,
    observation: grounded,
  });
}

/** True iff the grounding outcome proves the lane (the only provable verdict). */
export function laneGroundingProved(outcome: LaneGroundingOutcome): boolean {
  return outcome.verdict === "GROUNDED";
}
