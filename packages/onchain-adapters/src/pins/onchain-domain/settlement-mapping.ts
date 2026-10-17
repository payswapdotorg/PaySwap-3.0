/**
 * STRUCTURAL PIN — the onchain-domain canonical settlement mapping (Work
 * Order P4-W3, lane R2-W3; local structural mirror of payswap.org@8a735bf
 * packages/onchain-domain/src/settlement-mapping.ts, RECONCILED with the
 * ACCEPTED @payswap/protocol settlement vocabulary: the event-candidate
 * literals below — CONFIRM_SUCCEEDED / CONFIRM_FAILED / OUTCOME_UNKNOWN —
 * are by-name members of the accepted protocol settlement-attempt event
 * vocabulary (packages/protocol/src/settlement/attempts.ts), where
 * OUTCOME_UNKNOWN is non-terminal and can only be exited via
 * reconciliation resolution events; the adapter only ever SUGGESTS
 * candidates, the canonical machine owns the transition).
 *
 * HARD BOUNDARY: onchain state enters PaySwap ONLY as observations mapped
 * into the canonical settlement machinery (SettlementInstruction /
 * SettlementAttempt / RailOperation / FinalityRecord). This package owns
 * NO ledger, NO balance, NO financial truth — it owns the MAPPING
 * VOCABULARY a connector uses to hand onchain observations to the
 * settlement plane:
 *
 * - `onchainRailId(chainKey)` — the deterministic rail identifier
 *   (`onchain.${chainKey}`) an onchain settlement attempt carries;
 * - `mapObservationToRailOutcome` — the deterministic observation →
 *   rail-operation outcome mapping (BROADCAST → RAIL_EFFECT_PENDING;
 *   CONFIRMED → RAIL_EFFECT_OBSERVED, candidate only; FAILED →
 *   RAIL_EFFECT_FAILED; OUTCOME_UNKNOWN → RAIL_EFFECT_UNKNOWN with
 *   requiresReconciliation: true — UNKNOWN is never collapsed into FAILED);
 * - `settlementAttemptEventCandidate` — the deterministic settlement
 *   attempt event an observation suggests (the canonical machine owns the
 *   actual transition);
 * - `OnchainRailOperationMapping` — the observation→RailOperation linkage
 *   record referencing canonical instruction/attempt ids;
 * - `OnchainSettlementLinkage` — the canonical linkage a connector
 *   carries; a finality reference may appear ONLY as an id minted by the
 *   settlement plane's FinalityAuthority (finality is protocol-owned; this
 *   mapping never constructs, declares or implies one).
 */

import { ValidationError } from '../../errors.ts';
import { isValidChainKey } from './family.ts';
import {
  validateOnchainExecutionObservation,
} from './observation.ts';
import type {
  OnchainExecutionObservation,
  OnchainFailureDescriptor,
} from './observation.ts';

// ---------------------------------------------------------------------------
// Deterministic rail identity
// ---------------------------------------------------------------------------

/**
 * The deterministic rail id for an onchain settlement attempt:
 * `onchain.${chainKey}` (e.g. `onchain.ethereum:mainnet`). The settlement
 * attempt record carries this in its `rail` field — onchain rails are rail
 * family members, not a separate settlement world.
 */
export function onchainRailId(chainKey: string): string {
  if (!isValidChainKey(chainKey)) {
    throw new ValidationError('chainKey must be canonical to derive the onchain rail id');
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
 * reconciliation resolves it. `RAIL_EFFECT_OBSERVED` carries
 * `finalityCandidateOnly: true` as a LITERAL type: an observation is never
 * financial finality.
 */
export type OnchainRailOutcome =
  | {
      readonly kind: 'RAIL_EFFECT_PENDING';
      readonly submittedNotFinal: true;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly kind: 'RAIL_EFFECT_OBSERVED';
      readonly finalityCandidateOnly: true;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly kind: 'RAIL_EFFECT_FAILED';
      readonly failure: OnchainFailureDescriptor;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly kind: 'RAIL_EFFECT_UNKNOWN';
      readonly requiresReconciliation: true;
      readonly reason: string;
      readonly evidenceRefs: readonly string[];
    };

/**
 * The deterministic mapping from an onchain execution observation to a
 * rail-operation outcome. Total and deterministic: every declared
 * observation outcome has exactly one mapped rail outcome; the mapping
 * NEVER converts UNKNOWN into FAILED or success and NEVER produces
 * finality.
 */
export function mapObservationToRailOutcome(
  observation: OnchainExecutionObservation,
): OnchainRailOutcome {
  const validated = validateOnchainExecutionObservation(observation);
  const evidenceRefs = Object.freeze([...validated.evidenceRefs]);
  switch (validated.outcome) {
    case 'BROADCAST':
      return Object.freeze({
        kind: 'RAIL_EFFECT_PENDING',
        submittedNotFinal: true,
        evidenceRefs,
      });
    case 'CONFIRMED':
      return Object.freeze({
        kind: 'RAIL_EFFECT_OBSERVED',
        finalityCandidateOnly: true,
        evidenceRefs,
      });
    case 'FAILED':
      return Object.freeze({
        kind: 'RAIL_EFFECT_FAILED',
        failure: validated.failure as OnchainFailureDescriptor,
        evidenceRefs,
      });
    case 'OUTCOME_UNKNOWN':
      return Object.freeze({
        kind: 'RAIL_EFFECT_UNKNOWN',
        requiresReconciliation: true,
        reason: validated.unknownReason as string,
        evidenceRefs,
      });
  }
}

// ---------------------------------------------------------------------------
// Settlement attempt event candidates (the canonical machine owns transitions)
// ---------------------------------------------------------------------------

/**
 * The canonical settlement attempt event an onchain observation suggests
 * (a MEMBER of the accepted protocol settlement-attempt event vocabulary).
 * This is a CANDIDATE only: the canonical settlement attempt state machine
 * owns the actual transition, and the settlement plane records it with
 * evidence. A BROADCAST observation suggests NO event — the attempt stays
 * in flight (submitted is not finality).
 */
export type SettlementAttemptEventCandidate =
  | {
      readonly kind: 'EVENT_CANDIDATE';
      readonly event: 'CONFIRM_SUCCEEDED' | 'CONFIRM_FAILED' | 'OUTCOME_UNKNOWN';
    }
  | {
      readonly kind: 'NO_EVENT';
      readonly reason: 'SUBMITTED_NOT_FINAL';
    };

/** Deterministic observation → settlement attempt event candidate mapping. */
export function settlementAttemptEventCandidate(
  observation: OnchainExecutionObservation,
): SettlementAttemptEventCandidate {
  const validated = validateOnchainExecutionObservation(observation);
  switch (validated.outcome) {
    case 'BROADCAST':
      return Object.freeze({
        kind: 'NO_EVENT',
        reason: 'SUBMITTED_NOT_FINAL',
      });
    case 'CONFIRMED':
      return Object.freeze({
        kind: 'EVENT_CANDIDATE',
        event: 'CONFIRM_SUCCEEDED',
      });
    case 'FAILED':
      return Object.freeze({
        kind: 'EVENT_CANDIDATE',
        event: 'CONFIRM_FAILED',
      });
    case 'OUTCOME_UNKNOWN':
      return Object.freeze({
        kind: 'EVENT_CANDIDATE',
        event: 'OUTCOME_UNKNOWN',
      });
  }
}

// ---------------------------------------------------------------------------
// The observation → RailOperation mapping record
// ---------------------------------------------------------------------------

/**
 * The linkage record mapping one onchain execution observation to the
 * canonical RailOperation of a settlement attempt. It REFERENCEs canonical
 * settlement ids — it never constructs settlement state. The mapping kind
 * is a literal: the only declared mapping is OBSERVATION_TO_RAIL_OPERATION
 * (onchain state enters PaySwap ONLY as observations).
 */
export interface OnchainRailOperationMapping {
  readonly mappingKind: 'OBSERVATION_TO_RAIL_OPERATION';
  readonly observationId: string;
  readonly executionRef: string;
  readonly chainKey: string;
  /** The deterministic rail id (SettlementAttempt.rail). */
  readonly railId: string;
  /** The canonical settlement instruction this attempt executes. */
  readonly settlementInstructionId: string;
  /** The canonical settlement attempt record. */
  readonly settlementAttemptId: string;
  readonly outcome: OnchainRailOutcome;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Constructs the observation→RailOperation mapping record. Validation:
 * - the observation is a valid execution observation;
 * - the canonical instruction/attempt references are present;
 * - the rail id is the deterministic `onchain.${chainKey}`.
 */
export function mapToRailOperation(input: {
  readonly observation: OnchainExecutionObservation;
  readonly settlementInstructionId: string;
  readonly settlementAttemptId: string;
}): OnchainRailOperationMapping {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('mapToRailOperation input must be an object');
  }
  const observation = validateOnchainExecutionObservation(input.observation);
  if (!isNonEmptyString(input.settlementInstructionId)) {
    throw new ValidationError(
      'settlementInstructionId is required: a rail operation maps into a canonical settlement instruction',
    );
  }
  if (!isNonEmptyString(input.settlementAttemptId)) {
    throw new ValidationError(
      'settlementAttemptId is required: a rail operation maps into a canonical settlement attempt',
    );
  }
  const railId = onchainRailId(observation.chainKey);
  return Object.freeze({
    mappingKind: 'OBSERVATION_TO_RAIL_OPERATION',
    observationId: observation.observationId,
    executionRef: observation.executionRef,
    chainKey: observation.chainKey,
    railId,
    settlementInstructionId: input.settlementInstructionId,
    settlementAttemptId: input.settlementAttemptId,
    outcome: mapObservationToRailOutcome(observation),
  });
}

// ---------------------------------------------------------------------------
// Canonical settlement linkage (finality is referenced, never declared)
// ---------------------------------------------------------------------------

/**
 * The canonical linkage an onchain execution carries into the settlement
 * plane. `finalityRecordId` may ONLY reference a FinalityRecord minted by
 * the settlement plane's FinalityAuthority (finality is protocol-owned) —
 * this mapping constructs no finality and this linkage type carries no
 * finality state, only the optional reference.
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

/**
 * Validates a settlement linkage. Deterministic rules: canonical ids are
 * present; the rail id is a deterministic onchain rail id when a chainKey
 * is known; a finality record reference is shape-checked only — this
 * validator never grants finality.
 */
export function validateOnchainSettlementLinkage(
  candidate: unknown,
  chainKey?: string,
): OnchainSettlementLinkage {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('settlement linkage must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  if (!isNonEmptyString(record.settlementInstructionId)) {
    errors.push('settlementInstructionId must be a non-empty canonical id');
  }
  if (!isNonEmptyString(record.settlementAttemptId)) {
    errors.push('settlementAttemptId must be a non-empty canonical id');
  }
  if (!isNonEmptyString(record.railId)) {
    errors.push('railId must be a non-empty rail id');
  } else if (chainKey !== undefined) {
    if (!isValidChainKey(chainKey)) {
      errors.push('chainKey, when provided for validation, must be canonical');
    } else if (record.railId !== onchainRailId(chainKey)) {
      errors.push(
        `railId must be the deterministic '${onchainRailId(chainKey)}' for chainKey '${chainKey}'`,
      );
    }
  }
  if (record.finalityRecordId !== undefined && !isNonEmptyString(record.finalityRecordId)) {
    errors.push(
      'finalityRecordId, when present, must be a non-empty id minted by the settlement FinalityAuthority',
    );
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid settlement linkage: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return candidate as OnchainSettlementLinkage;
}

/**
 * Deterministic probe used by connectors: does this observation-derived
 * outcome permit finality? Answer: NEVER on its own — a confirmed
 * observation is only a candidate; finality is declared by the protocol
 * authority after reconciliation and proof.
 */
export function observationPermitsFinalityDeclaration(
  observation: OnchainExecutionObservation,
): false {
  validateOnchainExecutionObservation(observation);
  return false;
}
