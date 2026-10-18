/**
 * @payswap/route-compiler — the onchain lane proof (P5-W1).
 *
 * PORT of the old mixed-rail onchain-lane discovery (MMI-19), adapted
 * to the zero-sibling law: the lane is proved THROUGH the
 * BestExecutionEngine (this package's own engine — the real selection
 * authority for venue swaps), with the security gate INJECTED (never
 * re-implemented). A lane is provable ONLY when:
 *
 * 1. the engine SELECTED a route (gate ALLOW + ACTIVE eligible instance
 *    + a prepared write — the engine's own laws);
 * 2. the venue's protocol binding resolves deterministically to a
 *    REGISTERED venue (never guessed);
 * 3. the input-asset position is grounded by a CANONICAL, FRESH
 *    observation for the exact (chain, asset, owner) — INV-C05;
 * 4. every kernel input was pre-validated BEFORE the engine ran
 *    (fail-closed inputs, never mid-pipeline surprises).
 *
 * The honest three-status outcome (never a fabricated lane):
 * - LANE_PROVED: the full proof (quote, write, gate decision,
 *   evaluation, grounding, lifecycle stages, evidence);
 * - NO_EXECUTABLE_ROUTE: the engine's honest empty state, its
 *   provenance carried verbatim;
 * - LANE_UNPROVED_GROUNDING: the input-asset grounding failed (missing
 *   or stale — re-observe, never execute).
 */

import { OnchainLaneDiscoveryError } from "./errors.ts";
import { deepFreeze, isNonEmptyString } from "./canonical.ts";
import { BestExecutionEngine } from "./best-execution.ts";
import type { BestExecutionDecision, BestExecutionRequest, SelectedRoute } from "./best-execution.ts";
import { groundLaneInputAsset } from "./lane-grounding.ts";
import type { LaneGroundingOutcome } from "./lane-grounding.ts";
import { canonicalAssetRef, onchainLaneId, onchainRailId, protocolCapabilityId } from "./identifiers.ts";
import type { PinnedAssetIdentity } from "./pins/onchain.ts";
import type { FundsLocationObservation } from "./grounding.ts";
import type { NetOutcomeEvaluation } from "./scoring.ts";

/** The lane discovery input (the engine request + grounding inputs). */
export interface DiscoverOnchainLaneInput {
  readonly executionId: string;
  readonly swap: {
    readonly requestId: string;
    readonly chain: string;
    readonly inputAsset: PinnedAssetIdentity;
    readonly outputAsset: PinnedAssetIdentity;
    readonly swapKind: "EXACT_INPUT" | "EXACT_OUTPUT";
    readonly amount: { readonly currency: string; readonly minorUnits: string };
  };
  readonly policy: BestExecutionRequest["policy"];
  readonly security: BestExecutionRequest["security"];
  readonly instances: BestExecutionRequest["instances"];
  readonly owner: string;
  readonly beneficiary: string;
  readonly requestedBy: string;
  readonly routeExpiryMs: number;
  readonly at: number;
  /** The canonical asset observations searched for the input grounding. */
  readonly assetObservations: readonly FundsLocationObservation[];
}

/** The onchain lane proof (the engine-selected, gate-ALLOWed, grounded lane). */
export interface OnchainLaneProof {
  readonly laneId: string;
  readonly venueId: string;
  readonly protocolBinding: { readonly protocolKey: string; readonly chainKey: string };
  readonly quote: SelectedRoute["quote"];
  readonly instanceId: string;
  readonly routeRef: string;
  readonly routeHash: string;
  readonly write: SelectedRoute["write"];
  readonly gateDecision: SelectedRoute["gateDecision"];
  readonly evaluation: NetOutcomeEvaluation;
  readonly railId: string;
  readonly isVenueNativeBaseline: boolean;
  readonly inputAssetObservation: FundsLocationObservation;
  readonly lifecycleStages: readonly string[];
  readonly evidenceRefs: readonly string[];
}

/** The honest three-status discovery outcome (never a fabricated lane). */
export type OnchainLaneDiscoveryResult =
  | { readonly status: "LANE_PROVED"; readonly lane: OnchainLaneProof; readonly provenance: BestExecutionDecision["provenance"] }
  | {
      readonly status: "NO_EXECUTABLE_ROUTE";
      readonly provenance: BestExecutionDecision["provenance"];
      readonly detail: string;
    }
  | {
      readonly status: "LANE_UNPROVED_GROUNDING";
      readonly provenance: BestExecutionDecision["provenance"];
      readonly reason: "INPUT_ASSET_OBSERVATION_MISSING" | "INPUT_ASSET_OBSERVATION_STALE";
      readonly detail: string;
    };

/**
 * Discover an onchain lane through the REAL engine (fail-closed inputs,
 * honest outcomes; the engine is the sole selection authority).
 */
export function discoverOnchainLane(
  engine: BestExecutionEngine,
  input: DiscoverOnchainLaneInput,
): OnchainLaneDiscoveryResult {
  if (!isNonEmptyString(input.executionId)) {
    throw new OnchainLaneDiscoveryError("executionId must not be empty");
  }
  if (typeof input.at !== "number" || !Number.isSafeInteger(input.at) || input.at < 0) {
    throw new OnchainLaneDiscoveryError(
      "at must be a non-negative integer millisecond instant (no ambient clock)",
    );
  }

  const decision = engine.execute({
    executionId: input.executionId,
    swap: input.swap,
    policy: input.policy,
    security: input.security,
    instances: input.instances,
    owner: input.owner,
    beneficiary: input.beneficiary,
    requestedBy: input.requestedBy,
    routeExpiryMs: input.routeExpiryMs,
    at: input.at,
  });

  if (decision.decision !== "ROUTE_SELECTED") {
    return deepFreeze({
      status: "NO_EXECUTABLE_ROUTE",
      provenance: decision.provenance,
      detail: decision.detail,
    });
  }

  const selected = decision.selected;
  const venue = engine.venues().find((candidate) => candidate.descriptor.venueId === selected.venueId);
  if (venue === undefined) {
    throw new OnchainLaneDiscoveryError(
      "the protocol binding cannot be resolved deterministically (the selected venue is not registered)",
    );
  }

  const grounding: LaneGroundingOutcome = groundLaneInputAsset(
    input.assetObservations,
    input.swap.inputAsset,
    input.owner,
    input.at,
  );
  if (grounding.verdict !== "GROUNDED" || grounding.observation === undefined) {
    return deepFreeze({
      status: "LANE_UNPROVED_GROUNDING",
      provenance: decision.provenance,
      reason: grounding.verdict === "INPUT_ASSET_OBSERVATION_STALE"
        ? "INPUT_ASSET_OBSERVATION_STALE"
        : "INPUT_ASSET_OBSERVATION_MISSING",
      detail: grounding.detail,
    });
  }

  const laneId = onchainLaneId(input.executionId, selected.venueId, selected.quoteId);
  const railId = onchainRailId(selected.quote.chain);
  const evidenceRefs: string[] = [
    ...selected.quote.provenance.evidenceRefs,
    `write:${selected.write.writeDigest}`,
    `asset-observation:${grounding.observation.observationRef}`,
    ...(selected.gateDecision.evidenceRefs ?? []),
  ];
  const lifecycleStages = ["observe", "prepare"];

  const lane: OnchainLaneProof = deepFreeze({
    laneId,
    venueId: selected.venueId,
    protocolBinding: { protocolKey: venue.protocol.protocolKey, chainKey: venue.protocol.chainKey },
    quote: selected.quote,
    instanceId: protocolCapabilityId(venue.protocol.protocolKey, venue.protocol.chainKey),
    routeRef: selected.routeRef,
    routeHash: selected.routeHash,
    write: selected.write,
    gateDecision: selected.gateDecision,
    evaluation: selected.evaluation,
    railId,
    isVenueNativeBaseline: venue.descriptor.nativeOptimization?.benchmarkBaseline === true,
    inputAssetObservation: grounding.observation,
    lifecycleStages: Object.freeze(lifecycleStages),
    evidenceRefs: Object.freeze([...new Set(evidenceRefs)]),
  });
  return deepFreeze({ status: "LANE_PROVED", lane, provenance: decision.provenance });
}

/** The canonical asset reference of a lane's input (identity helper). */
export function laneInputAssetRef(asset: PinnedAssetIdentity): string {
  return canonicalAssetRef(asset.chain, asset.symbol);
}
