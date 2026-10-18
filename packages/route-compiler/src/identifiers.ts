/**
 * @payswap/route-compiler — deterministic identity schemes (P5-W1).
 *
 * PORT+ADAPT of the old compiler's id disciplines: every identity in the
 * compiled surface is a PURE FUNCTION of the canonical projection it
 * names — planId, legId, laneId, observation references, settlement
 * instruction bindings, journey ids. No counter state, no randomness, no
 * clock: the same inputs always produce the same ids (byte-identical
 * replays), and two different projections never collide on an id (the
 * digest segments see to that).
 *
 * The onchain identity forms (chain/asset/rail/protocol-capability ids)
 * are pinned mirrors of @payswap/onchain-domain's deterministic forms
 * (see src/pins/onchain.ts) — re-declared locally under the zero-sibling
 * law, byte-identical in output.
 */

import { ValidationError } from "./errors.ts";
import { contentDigest } from "./canonical.ts";
import { isPinnedChainKey, isPinnedVenueKey } from "./pins/onchain.ts";

/** `route-plan:${intentRef}:${shapeId}` — the canonical plan id. */
export function routePlanId(intentRef: string, shapeId: string): string {
  return `route-plan:${intentRef}:${shapeId}`;
}

/** `${planId}:leg:${hopIndex}:${legKind}` — the canonical leg id. */
export function routeLegId(planId: string, hopIndex: number, legKind: string): string {
  if (!Number.isSafeInteger(hopIndex) || hopIndex < 0) {
    throw new ValidationError("hopIndex must be a non-negative integer");
  }
  return `${planId}:leg:${hopIndex}:${legKind}`;
}

/** The route hash binding one hop: digest over (planId, hopIndex, legKind). */
export function routeHashFor(planId: string, hopIndex: number, legKind: string): string {
  return contentDigest({ planId, hopIndex, legKind });
}

/** `transfer-out:${intentRef}` — the off-ramp payout grant lineage root. */
export function transferOutAuthorizationId(intentRef: string): string {
  return `transfer-out:${intentRef}`;
}

/** The settlement-instruction binding of one (intent, shape) pair. */
export function settlementInstructionBinding(
  intentRef: string,
  shapeId: string,
): { instructionId: string; instructionDigest: string } {
  const instructionId = `settlement-instruction:${intentRef}:${shapeId}`;
  return Object.freeze({
    instructionId,
    instructionDigest: contentDigest({ instructionId }),
  });
}

/** `capability-observation:${instanceId}@${version}` — the observation projection id. */
export function capabilityObservationId(instanceId: string, observationVersion: number): string {
  if (!Number.isSafeInteger(observationVersion) || observationVersion < 1) {
    throw new ValidationError("observationVersion must be a positive integer");
  }
  return `capability-observation:${instanceId}@${observationVersion}`;
}

/** `onchain-lane:${executionId}:${venueId}:${quoteId}` — the lane proof id. */
export function onchainLaneId(executionId: string, venueId: string, quoteId: string): string {
  return `onchain-lane:${executionId}:${venueId}:${quoteId}`;
}

/** `${chainKey}/asset:${symbol}` — the canonical onchain asset reference. */
export function canonicalAssetRef(chainKey: string, symbol: string): string {
  if (!isPinnedChainKey(chainKey)) {
    throw new ValidationError(
      `chain key '${chainKey}' is not canonical (<network>:<segment>, lowercase)`,
    );
  }
  return `${chainKey}/asset:${symbol}`;
}

/** `onchain.${chainKey}` — the canonical onchain rail id. */
export function onchainRailId(chainKey: string): string {
  if (!isPinnedChainKey(chainKey)) {
    throw new ValidationError(
      `chain key '${chainKey}' is not canonical (<network>:<segment>, lowercase)`,
    );
  }
  return `onchain.${chainKey}`;
}

/** `protocol.${chainKey}:${protocolKey}` — the protocol capability id form. */
export function protocolCapabilityId(protocolKey: string, chainKey: string): string {
  if (!isPinnedChainKey(chainKey)) {
    throw new ValidationError(
      `chain key '${chainKey}' is not canonical (<network>:<segment>, lowercase)`,
    );
  }
  return `protocol.${chainKey}:${protocolKey}`;
}

/** `venue-lane:${venueKey}` — the venue registration evidence prefix. */
export function venueLaneEvidenceId(venueKey: string): string {
  if (!isPinnedVenueKey(venueKey)) {
    throw new ValidationError("venueKey must match the pinned venue key pattern");
  }
  return `venue-lane:${venueKey}`;
}

/** The walk's deterministic observation/execution id prefixes (per leg). */
export function walkExecutionRefs(legId: string): {
  executionRef: string;
  observationId: string;
  externalOperationRef: string;
} {
  return Object.freeze({
    executionRef: `route-walk-exec:${legId}`,
    observationId: `route-walk-obs:${legId}:1`,
    externalOperationRef: `route-walk-tx:${legId}`,
  });
}

/** The walk's canonical payout observation identity (per leg). */
export function walkPayoutRefs(legId: string): {
  observationId: string;
  providerPayoutRef: string;
} {
  return Object.freeze({
    observationId: `route-walk-payout-obs:${legId}`,
    providerPayoutRef: `route-walk-payout:${legId}`,
  });
}

/** The walk's canonical provider settlement observation identity (per leg). */
export function walkProviderSettlementRefs(legId: string): {
  observationId: string;
  verificationRef: string;
} {
  return Object.freeze({
    observationId: `route-walk-provider-obs:${legId}`,
    verificationRef: `route-walk-verification:${legId}`,
  });
}

/** `journey:${intentRef}:${shapeId}` — the journey evidence id. */
export function routeJourneyId(intentRef: string, shapeId: string): string {
  return `journey:${intentRef}:${shapeId}`;
}

/** `settlement-attempt:${intentRef}:${legId}` — the attempt identity. */
export function settlementAttemptId(intentRef: string, legId: string): string {
  return `settlement-attempt:${intentRef}:${legId}`;
}
