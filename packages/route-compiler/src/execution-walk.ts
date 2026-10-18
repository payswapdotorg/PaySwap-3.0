/**
 * @payswap/route-compiler — the lane execution walk (P5-W1).
 *
 * PORT of the old mixed-rail execution-walk.ts (MMI-19): the
 * deterministic, fault-injectable walk of ONE proved onchain lane. The
 * walk is a LAB SIMULATION (the never-production tier — see
 * simulation-tier.ts): it constructs kernel-law-shaped execution
 * observations deterministically from the lane proof plus an OPTIONAL
 * fault, maps them to the canonical rail outcomes and event candidates,
 * and NEVER records an authorize/broadcast lifecycle stage (propose and
 * observe, never execute).
 *
 * Fault taxonomy (closed; UNKNOWN is an honest terminal state):
 * - PROTOCOL_FAILURE -> FAILED observation with the verbatim failure
 *   descriptor (class + description + retry guidance);
 * - UNFINALIZED_BROADCAST -> BROADCAST observation (NO finality
 *   candidate, NO failure, NO unknown reason — rule 29);
 * - OUTCOME_UNKNOWN -> OUTCOME_UNKNOWN observation with the reason
 *   (never a failure — INV-X01);
 * - no fault -> CONFIRMED observation with a finality CANDIDATE
 *   (candidate-only, requires-protocol-finality, depth 1, the lane's
 *   own finality model, no reorg).
 *
 * The staleness law runs FIRST: a lane whose input-asset observation
 * aged out at the execution instant is GROUNDING_STALE (not executed,
 * not failed — re-observe).
 */

import { ValidationError } from "./errors.ts";
import { deepFreeze, isNonEmptyString } from "./canonical.ts";
import { LAB_EXECUTION_TIER } from "./simulation-tier.ts";
import { isLocationObservationFresh } from "./grounding.ts";
import type { OnchainLaneProof } from "./onchain-lane.ts";
import type { PinnedOnchainFailureClass } from "./pins/onchain.ts";

/** The simulator identity recorded as every observation's provenance provider. */
export const LANE_WALK_SIMULATOR_ID = "payswap-route-compiler-lane-walk" as const;

/** The closed onchain-lane fault vocabulary (frozen). */
export const ONCHAIN_LANE_FAULT_KINDS = Object.freeze([
  "PROTOCOL_FAILURE",
  "UNFINALIZED_BROADCAST",
  "OUTCOME_UNKNOWN",
] as const);

export type OnchainLaneFaultKind = (typeof ONCHAIN_LANE_FAULT_KINDS)[number];

/** One injectable lane fault (typed per rail family — see route-walk.ts). */
export type OnchainLaneFault =
  | {
      readonly kind: "PROTOCOL_FAILURE";
      readonly failureClass: PinnedOnchainFailureClass;
      readonly description: string;
      readonly retryGuidance: "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE";
    }
  | { readonly kind: "UNFINALIZED_BROADCAST" }
  | { readonly kind: "OUTCOME_UNKNOWN"; readonly reason: string };

/** The walk input (lane + deterministic instants + optional fault + ids). */
export interface ExecuteOnchainLaneInput {
  readonly lane: OnchainLaneProof;
  readonly at: number;
  readonly observedAtIso: string;
  readonly fault?: OnchainLaneFault;
  readonly executionRef?: string;
  readonly observationId?: string;
  readonly externalOperationRef?: string;
  readonly settlementInstructionId?: string;
  readonly settlementAttemptId?: string;
}

/** The walk's event-candidate vocabulary (the settlement mapping projection). */
export type SettlementAttemptEventCandidate =
  | { readonly kind: "EVENT_CANDIDATE"; readonly event: "CONFIRM_SUCCEEDED" | "CONFIRM_FAILED" | "OUTCOME_UNKNOWN" }
  | { readonly kind: "NO_EVENT"; readonly reason: "SUBMITTED_NOT_FINAL" };

/** The canonical rail outcome (the observation-to-rail mapping). */
export type OnchainRailOutcome =
  | { readonly kind: "RAIL_EFFECT_OBSERVED"; readonly finalityCandidateOnly: true; readonly evidenceRefs: readonly string[] }
  | { readonly kind: "RAIL_EFFECT_PENDING"; readonly submittedNotFinal: true; readonly evidenceRefs: readonly string[] }
  | { readonly kind: "RAIL_EFFECT_FAILED"; readonly failure: unknown; readonly evidenceRefs: readonly string[] }
  | { readonly kind: "RAIL_EFFECT_UNKNOWN"; readonly requiresReconciliation: true; readonly reason: string; readonly evidenceRefs: readonly string[] };

/** The execution observation the walk constructs (kernel-law shaped). */
export interface WalkExecutionObservation {
  readonly observationId: string;
  readonly executionRef: string;
  readonly observedAt: string;
  readonly chainKey: string;
  readonly outcome: "BROADCAST" | "CONFIRMED" | "FAILED" | "OUTCOME_UNKNOWN";
  readonly externalOperationRef?: string;
  readonly finalityCandidate?: {
    readonly candidateOnly: true;
    readonly requiresProtocolFinality: true;
    readonly confirmationDepth: number;
    readonly finalityModel: string;
    readonly reorgDetected: boolean;
  };
  readonly failure?: {
    readonly failureClass: string;
    readonly description: string;
    readonly retryGuidance: string;
  };
  readonly unknownReason?: string;
  readonly evidenceRefs: readonly string[];
  readonly provenance: {
    readonly providerName: string;
    readonly source: "INTERNAL";
    readonly capturedAt: string;
  };
}

/** The honest two-status lane execution (EXECUTED or GROUNDING_STALE). */
export type OnchainLaneExecution =
  | {
      readonly status: "EXECUTED";
      readonly executionTier: typeof LAB_EXECUTION_TIER;
      readonly laneId: string;
      readonly venueId: string;
      readonly chainKey: string;
      readonly railId: string;
      readonly outcome: "BROADCAST" | "CONFIRMED" | "FAILED" | "OUTCOME_UNKNOWN";
      readonly observation: WalkExecutionObservation;
      readonly railOutcome: OnchainRailOutcome;
      readonly eventCandidate: SettlementAttemptEventCandidate;
      readonly lifecycleStages: readonly string[];
      readonly fault?: OnchainLaneFault;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly status: "GROUNDING_STALE";
      readonly executionTier: typeof LAB_EXECUTION_TIER;
      readonly laneId: string;
      readonly venueId: string;
      readonly chainKey: string;
      readonly railId: string;
      readonly reason: string;
      readonly lifecycleStages: readonly ["observe"];
      readonly evidenceRefs: readonly string[];
    };

/** Walk one proved lane deterministically (fault-injectable, never production). */
export function executeOnchainLane(input: ExecuteOnchainLaneInput): OnchainLaneExecution {
  const { lane } = input;
  if (typeof input.at !== "number" || !Number.isSafeInteger(input.at) || input.at < 0) {
    throw new ValidationError("the execution instant must be a non-negative integer (no ambient clock)");
  }
  if (!isNonEmptyString(input.observedAtIso)) {
    throw new ValidationError("observedAtIso must be a non-empty string (the observation stamp is data, never a clock read)");
  }

  // The staleness law first: re-observe, never execute on stale state.
  if (!isLocationObservationFresh(lane.inputAssetObservation, input.at)) {
    return deepFreeze({
      status: "GROUNDING_STALE",
      executionTier: LAB_EXECUTION_TIER,
      laneId: lane.laneId,
      venueId: lane.venueId,
      chainKey: lane.quote.chain,
      railId: lane.railId,
      reason: `input-asset observation '${lane.inputAssetObservation.observationRef}' aged out at the execution instant — the lane is re-observed, never executed on stale state (the staleness law)`,
      lifecycleStages: Object.freeze(["observe"] as const),
      evidenceRefs: Object.freeze([`asset-observation:${lane.inputAssetObservation.observationRef}`]),
    });
  }

  const executionRef = input.executionRef ?? `lane-walk-exec:${lane.laneId}`;
  const observationId = input.observationId ?? `lane-walk-obs:${lane.laneId}:1`;
  const externalOperationRef = input.externalOperationRef ?? `lane-walk-tx:${lane.laneId}`;
  const evidenceRefs = Object.freeze([...lane.evidenceRefs, `lane-execution:${executionRef}`]);

  const observation = buildObservation(input, lane, {
    executionRef,
    observationId,
    externalOperationRef,
    evidenceRefs,
  });

  const railOutcome = mapObservationToRailOutcome(observation);
  const eventCandidate = settlementAttemptEventCandidate(observation);
  const lifecycleStages: string[] = [...lane.lifecycleStages, "observeResult"];
  if (observation.outcome === "CONFIRMED") {
    lifecycleStages.push("finality");
  }
  if (observation.outcome === "OUTCOME_UNKNOWN") {
    lifecycleStages.push("reconcile");
  }

  return deepFreeze({
    status: "EXECUTED",
    executionTier: LAB_EXECUTION_TIER,
    laneId: lane.laneId,
    venueId: lane.venueId,
    chainKey: observation.chainKey,
    railId: lane.railId,
    outcome: observation.outcome,
    observation,
    railOutcome,
    eventCandidate,
    lifecycleStages: Object.freeze(lifecycleStages),
    ...(input.fault !== undefined ? { fault: input.fault } : {}),
    evidenceRefs,
  });
}

function buildObservation(
  input: ExecuteOnchainLaneInput,
  lane: OnchainLaneProof,
  ids: {
    executionRef: string;
    observationId: string;
    externalOperationRef: string;
    evidenceRefs: readonly string[];
  },
): WalkExecutionObservation {
  const common = {
    observationId: ids.observationId,
    executionRef: ids.executionRef,
    observedAt: input.observedAtIso,
    chainKey: lane.quote.chain,
    externalOperationRef: ids.externalOperationRef,
    evidenceRefs: ids.evidenceRefs,
    provenance: {
      providerName: LANE_WALK_SIMULATOR_ID,
      source: "INTERNAL" as const,
      capturedAt: input.observedAtIso,
    },
  };
  const fault = input.fault;
  if (fault === undefined) {
    return deepFreeze({
      ...common,
      outcome: "CONFIRMED" as const,
      finalityCandidate: deepFreeze({
        candidateOnly: true as const,
        requiresProtocolFinality: true as const,
        confirmationDepth: 1,
        finalityModel: lane.quote.timeToSettlement.finalityModel,
        reorgDetected: false,
      }),
    });
  }
  switch (fault.kind) {
    case "PROTOCOL_FAILURE":
      return deepFreeze({
        ...common,
        outcome: "FAILED" as const,
        failure: deepFreeze({
          failureClass: fault.failureClass,
          description: fault.description,
          retryGuidance: fault.retryGuidance,
        }),
      });
    case "UNFINALIZED_BROADCAST":
      return deepFreeze({ ...common, outcome: "BROADCAST" as const });
    case "OUTCOME_UNKNOWN":
      return deepFreeze({
        ...common,
        outcome: "OUTCOME_UNKNOWN" as const,
        unknownReason: fault.reason,
      });
  }
}

/** The canonical observation-to-rail mapping (verbatim outcome law). */
export function mapObservationToRailOutcome(
  observation: WalkExecutionObservation,
): OnchainRailOutcome {
  switch (observation.outcome) {
    case "BROADCAST":
      return deepFreeze({
        kind: "RAIL_EFFECT_PENDING",
        submittedNotFinal: true,
        evidenceRefs: observation.evidenceRefs,
      });
    case "CONFIRMED":
      return deepFreeze({
        kind: "RAIL_EFFECT_OBSERVED",
        finalityCandidateOnly: true,
        evidenceRefs: observation.evidenceRefs,
      });
    case "FAILED":
      return deepFreeze({
        kind: "RAIL_EFFECT_FAILED",
        failure: observation.failure,
        evidenceRefs: observation.evidenceRefs,
      });
    case "OUTCOME_UNKNOWN":
      return deepFreeze({
        kind: "RAIL_EFFECT_UNKNOWN",
        requiresReconciliation: true,
        reason: observation.unknownReason ?? "",
        evidenceRefs: observation.evidenceRefs,
      });
  }
}

/** The canonical settlement event candidate (verbatim outcome law). */
export function settlementAttemptEventCandidate(
  observation: WalkExecutionObservation,
): SettlementAttemptEventCandidate {
  switch (observation.outcome) {
    case "BROADCAST":
      return Object.freeze({ kind: "NO_EVENT", reason: "SUBMITTED_NOT_FINAL" });
    case "CONFIRMED":
      return Object.freeze({ kind: "EVENT_CANDIDATE", event: "CONFIRM_SUCCEEDED" });
    case "FAILED":
      return Object.freeze({ kind: "EVENT_CANDIDATE", event: "CONFIRM_FAILED" });
    case "OUTCOME_UNKNOWN":
      return Object.freeze({ kind: "EVENT_CANDIDATE", event: "OUTCOME_UNKNOWN" });
  }
}
