/**
 * @payswap/onchain-domain — canonical settlement mapping (P4-W1, lane
 * R2-W1; PORT/ADAPT of payswap.org@8a735bf
 * packages/onchain-domain/src/settlement-mapping.ts).
 *
 * HARD BOUNDARY: onchain state enters PaySwap ONLY as observations mapped
 * into the canonical settlement machinery owned by the Financial Protocol
 * Authority (INV-1). This package owns NO ledger, NO balance, NO financial
 * truth — it owns the MAPPING VOCABULARY that a connector uses to hand
 * onchain observations to the settlement plane (the machinery's states,
 * events and transition laws are STRUCTURALLY PINNED in
 * src/pins-settlement.ts — authority: @payswap/protocol):
 *
 * - `onchainRailId(chainKey)` — the deterministic rail identifier an
 *   onchain settlement attempt carries (the pinned SettlementAttempt.rail
 *   field; INV-17: onchain rails are rail-family members, not a separate
 *   settlement world);
 * - `mapObservationToRailOutcome` — the deterministic mapping from an
 *   OnchainExecutionObservation to a rail-operation outcome:
 *     BROADCAST  → RAIL_EFFECT_PENDING (submitted is not finality)
 *     CONFIRMED  → RAIL_EFFECT_OBSERVED (finality candidate ONLY — INV-1)
 *     FAILED     → RAIL_EFFECT_FAILED (definitive, carries the failure)
 *     OUTCOME_UNKNOWN → RAIL_EFFECT_UNKNOWN (requiresReconciliation: true —
 *       INV-4: UNKNOWN is not FAILED; never blindly retried; reconciliation
 *       is the only resolver);
 * - `settlementAttemptEventCandidate` — the deterministic settlement
 *   attempt event an observation suggests (the canonical settlement
 *   attempt state machine owns the actual transition; the pinned
 *   IN_FLIGHT transition table and the OUTCOME_UNKNOWN exit law live in
 *   pins-settlement.ts);
 * - `OnchainRailOperationMapping` — the observation→rail-operation linkage
 *   record referencing the canonical instruction/attempt ids;
 * - `OnchainSettlementLinkage` — the canonical linkage a connector
 *   carries; a finality reference may appear ONLY as an id minted by the
 *   settlement plane's FinalityAuthority (INV-1) — this package never
 *   constructs, declares or implies one.
 */

import { ValidationError } from "./errors.ts";
import { isNonEmptyString, isRecord } from "./shared.ts";
import { isValidChainKey } from "./family.ts";
import { validateOnchainExecutionObservation } from "./execution-observation.ts";
import type {
  OnchainExecutionObservation,
  OnchainFailureDescriptor,
} from "./execution-observation.ts";
import {
  PINNED_SETTLEMENT_ATTEMPT_EVENTS,
  PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS,
  PINNED_SETTLEMENT_OUTCOME_UNKNOWN_EXITS,
} from "./pins-settlement.ts";

// ---------------------------------------------------------------------------
// Deterministic rail identity
// ---------------------------------------------------------------------------

/**
 * The deterministic rail id for an onchain settlement attempt:
 * `onchain.${chainKey}` (e.g. `onchain.ethereum:mainnet`). The settlement
 * attempt record carries this in its `rail` field — onchain rails are rail
 * family members, not a separate settlement world (INV-17). Rejects a
 * non-canonical chainKey: the rail id is canonical, never free-form.
 */
export function onchainRailId(chainKey: string): string {
  if (!isValidChainKey(chainKey)) {
    throw new ValidationError(
      "chainKey must be canonical to derive the onchain rail id",
    );
  }
  return `onchain.${chainKey}`;
}

// ---------------------------------------------------------------------------
// Rail-operation outcomes (the deterministic observation mapping)
// ---------------------------------------------------------------------------

/**
 * The outcome of a rail operation derived from an onchain observation.
 * `RAIL_EFFECT_UNKNOWN` carries `requiresReconciliation: true` as a LITERAL
 * type: an unknown external write can never be blindly retried and only
 * reconciliation resolves it (INV-4). `RAIL_EFFECT_OBSERVED` carries
 * `finalityCandidateOnly: true` as a LITERAL type: an observation is never
 * financial finality (INV-1).
 */
export type OnchainRailOutcome =
  | {
      readonly kind: "RAIL_EFFECT_PENDING";
      readonly submittedNotFinal: true;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly kind: "RAIL_EFFECT_OBSERVED";
      readonly finalityCandidateOnly: true;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly kind: "RAIL_EFFECT_FAILED";
      readonly failure: OnchainFailureDescriptor;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly kind: "RAIL_EFFECT_UNKNOWN";
      readonly requiresReconciliation: true;
      readonly reason: string;
      readonly evidenceRefs: readonly string[];
    };

// ---------------------------------------------------------------------------
// Settlement attempt event candidates (the canonical machine owns transitions)
// ---------------------------------------------------------------------------

/**
 * The canonical settlement attempt event an onchain observation suggests
 * (the event vocabulary is structurally PINNED from the protocol lane —
 * src/pins-settlement.ts). This is a CANDIDATE only: the canonical
 * settlement attempt state machine owns the actual transition, and the
 * settlement plane records it with evidence. A BROADCAST observation
 * suggests NO event — the attempt stays in flight (submitted is not
 * finality).
 */
export type SettlementAttemptEventCandidate =
  | {
      readonly kind: "EVENT_CANDIDATE";
      readonly event:
        | "CONFIRM_SUCCEEDED"
        | "CONFIRM_FAILED"
        | "OUTCOME_UNKNOWN";
    }
  | {
      readonly kind: "NO_EVENT";
      readonly reason: "SUBMITTED_NOT_FINAL";
    };

// ---------------------------------------------------------------------------
// The observation → RailOperation mapping record
// ---------------------------------------------------------------------------

/**
 * The linkage record mapping one onchain execution observation to the
 * canonical rail operation of a settlement attempt. It REFERENCEs canonical
 * settlement ids (structurally pinned — src/pins-settlement.ts) — it never
 * constructs settlement state. The mapping kind is a literal: the only
 * declared mapping is OBSERVATION_TO_RAIL_OPERATION (onchain state enters
 * PaySwap ONLY as observations).
 */
export interface OnchainRailOperationMapping {
  readonly mappingKind: "OBSERVATION_TO_RAIL_OPERATION";
  readonly observationId: string;
  readonly executionRef: string;
  readonly chainKey: string;
  /** The deterministic rail id (the pinned SettlementAttempt.rail value). */
  readonly railId: string;
  /** The canonical settlement instruction this attempt executes. */
  readonly settlementInstructionId: string;
  /** The canonical settlement attempt record. */
  readonly settlementAttemptId: string;
  readonly outcome: OnchainRailOutcome;
}

// ---------------------------------------------------------------------------
// Canonical settlement linkage (finality is referenced, never declared)
// ---------------------------------------------------------------------------

/**
 * The canonical linkage an onchain execution carries into the settlement
 * plane. `finalityRecordId` may ONLY reference a finality record minted by
 * the settlement plane's FinalityAuthority (INV-1: finality is
 * protocol-owned) — this package constructs no finality and this linkage
 * type carries no finality state, only the optional reference.
 */
export interface OnchainSettlementLinkage {
  readonly settlementInstructionId: string;
  readonly settlementAttemptId: string;
  readonly railId: string;
  /**
   * Present only after the settlement plane's protocol authority declared
   * finality. An id reference, never a finality claim.
   */
  readonly finalityRecordId?: string;
}

// ---------------------------------------------------------------------------
// The deterministic mappings (implementation)
// ---------------------------------------------------------------------------

/**
 * The deterministic mapping from an onchain execution observation to a
 * rail-operation outcome. Total and deterministic: every declared
 * observation outcome has exactly one mapped rail outcome; the mapping
 * NEVER converts UNKNOWN into FAILED or success (INV-4) and NEVER
 * produces finality (INV-1).
 */
export function mapObservationToRailOutcome(
  observation: OnchainExecutionObservation,
): OnchainRailOutcome {
  const validated = validateOnchainExecutionObservation(observation);
  const evidenceRefs = Object.freeze([...validated.evidenceRefs]);
  switch (validated.outcome) {
    case "BROADCAST":
      return Object.freeze({
        kind: "RAIL_EFFECT_PENDING",
        submittedNotFinal: true,
        evidenceRefs,
      });
    case "CONFIRMED":
      return Object.freeze({
        kind: "RAIL_EFFECT_OBSERVED",
        finalityCandidateOnly: true,
        evidenceRefs,
      });
    case "FAILED":
      return Object.freeze({
        kind: "RAIL_EFFECT_FAILED",
        failure: validated.failure as OnchainFailureDescriptor,
        evidenceRefs,
      });
    case "OUTCOME_UNKNOWN":
      return Object.freeze({
        kind: "RAIL_EFFECT_UNKNOWN",
        requiresReconciliation: true,
        reason: validated.unknownReason as string,
        evidenceRefs,
      });
  }
}

/**
 * Deterministic observation → settlement attempt event candidate mapping
 * (the event vocabulary is structurally pinned from the protocol lane —
 * every suggested event is a declared event of the canonical settlement
 * attempt machine, and every observation-derived event transitions IN_FLIGHT
 * per the pinned transition table).
 */
export function settlementAttemptEventCandidate(
  observation: OnchainExecutionObservation,
): SettlementAttemptEventCandidate {
  const validated = validateOnchainExecutionObservation(observation);
  switch (validated.outcome) {
    case "BROADCAST":
      return Object.freeze({
        kind: "NO_EVENT",
        reason: "SUBMITTED_NOT_FINAL",
      });
    case "CONFIRMED":
      return Object.freeze({
        kind: "EVENT_CANDIDATE",
        event: "CONFIRM_SUCCEEDED",
      });
    case "FAILED":
      return Object.freeze({
        kind: "EVENT_CANDIDATE",
        event: "CONFIRM_FAILED",
      });
    case "OUTCOME_UNKNOWN":
      return Object.freeze({
        kind: "EVENT_CANDIDATE",
        event: "OUTCOME_UNKNOWN",
      });
  }
}

/**
 * Constructs the observation→rail-operation mapping record. Validation:
 * - the observation is a valid OnchainExecutionObservation;
 * - the canonical instruction/attempt references are present;
 * - the rail id is the deterministic `onchain.${chainKey}`.
 */
export function mapToRailOperation(input: {
  readonly observation: OnchainExecutionObservation;
  readonly settlementInstructionId: string;
  readonly settlementAttemptId: string;
}): OnchainRailOperationMapping {
  if (!isRecord(input)) {
    throw new ValidationError("mapToRailOperation input must be an object");
  }
  const observation = validateOnchainExecutionObservation(input.observation);
  if (!isNonEmptyString(input.settlementInstructionId)) {
    throw new ValidationError(
      "settlementInstructionId is required: a rail operation maps into a canonical settlement instruction",
    );
  }
  if (!isNonEmptyString(input.settlementAttemptId)) {
    throw new ValidationError(
      "settlementAttemptId is required: a rail operation maps into a canonical settlement attempt",
    );
  }
  const railId = onchainRailId(observation.chainKey);
  return Object.freeze({
    mappingKind: "OBSERVATION_TO_RAIL_OPERATION",
    observationId: observation.observationId,
    executionRef: observation.executionRef,
    chainKey: observation.chainKey,
    railId,
    settlementInstructionId: input.settlementInstructionId,
    settlementAttemptId: input.settlementAttemptId,
    outcome: mapObservationToRailOutcome(observation),
  });
}

/**
 * Validates a settlement linkage. Deterministic rules:
 * - canonical ids are present;
 * - the rail id is a deterministic onchain rail id (`onchain.${chainKey}`)
 *   when a chainKey is known;
 * - a finality record reference may only accompany a linkage whose
 *   observation-derived outcome is CONFIRMED — but the reference itself is
 *   minted by the settlement authority; this validator only checks shape,
 *   never grants finality.
 */
export function validateOnchainSettlementLinkage(
  candidate: unknown,
  chainKey?: string,
): OnchainSettlementLinkage {
  if (!isRecord(candidate)) {
    throw new ValidationError("settlement linkage must be an object");
  }
  const record = candidate;
  const errors: string[] = [];
  if (!isNonEmptyString(record.settlementInstructionId)) {
    errors.push("settlementInstructionId must be a non-empty canonical id");
  }
  if (!isNonEmptyString(record.settlementAttemptId)) {
    errors.push("settlementAttemptId must be a non-empty canonical id");
  }
  if (!isNonEmptyString(record.railId)) {
    errors.push("railId must be a non-empty rail id");
  } else if (chainKey !== undefined) {
    if (!isValidChainKey(chainKey)) {
      errors.push("chainKey, when provided for validation, must be canonical");
    } else if (record.railId !== onchainRailId(chainKey)) {
      errors.push(
        `railId must be the deterministic '${onchainRailId(chainKey)}' for chainKey '${chainKey}'`,
      );
    }
  }
  if (record.finalityRecordId !== undefined && !isNonEmptyString(record.finalityRecordId)) {
    errors.push(
      "finalityRecordId, when present, must be a non-empty id minted by the settlement FinalityAuthority",
    );
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid settlement linkage: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  return candidate as unknown as OnchainSettlementLinkage;
}

/**
 * Deterministic probe used by connectors: does this observation-derived
 * outcome permit finality? Answer: NEVER on its own — a confirmed
 * observation is only a candidate; finality is declared by the protocol
 * authority after reconciliation and proof (INV-1).
 */
export function observationPermitsFinalityDeclaration(
  observation: OnchainExecutionObservation,
): false {
  validateOnchainExecutionObservation(observation);
  return false;
}

/**
 * Deterministic probe: the settlement events an observation can suggest are
 * declared events of the pinned canonical settlement attempt vocabulary
 * (cross-lane consistency evidence for the structural pin).
 */
export function isPinnedSettlementAttemptEvent(
  value: unknown,
): value is (typeof PINNED_SETTLEMENT_ATTEMPT_EVENTS)[number] {
  return (
    typeof value === "string" &&
    (PINNED_SETTLEMENT_ATTEMPT_EVENTS as readonly unknown[]).includes(value)
  );
}

/**
 * The pinned IN_FLIGHT transition table (authority: @payswap/protocol
 * settlementAttemptStateMachine) — the deterministic target state of a
 * suggested event from IN_FLIGHT, or undefined when the event is not an
 * observation-derived IN_FLIGHT transition.
 */
export function pinnedInFlightTransition(
  event: "CONFIRM_SUCCEEDED" | "CONFIRM_FAILED" | "OUTCOME_UNKNOWN",
): (typeof PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS)[typeof event] {
  return PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS[event];
}

/**
 * The pinned OUTCOME_UNKNOWN exit law (INV-4): the ONLY events that may
 * leave OUTCOME_UNKNOWN are the reconciliation resolution events.
 */
export function pinnedOutcomeUnknownExits(): readonly [
  "RECONCILE_RESOLVED_SUCCEEDED",
  "RECONCILE_RESOLVED_FAILED",
] {
  return PINNED_SETTLEMENT_OUTCOME_UNKNOWN_EXITS;
}
