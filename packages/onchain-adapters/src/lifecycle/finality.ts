/**
 * @payswap/onchain-adapters — the finality stage machinery (Work Order
 * P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/lifecycle.ts finality half).
 *
 * Finality evaluation is a CANDIDATE plus declared family guidance:
 * finality itself stays protocol-owned (candidates only — the observation
 * carries candidateOnly/requiresProtocolFinality literals, validated by the
 * pinned domain validator). The evaluation requires a CONFIRMED observation
 * carrying a finality candidate, scoped to the adapter's chain.
 */

import { ValidationError } from '../errors.ts';
import type { FinalityEvaluation } from '../contract/stage-io.ts';
import type { ChainHeadObservation } from '../contract/observations.ts';
import type { FamilySemanticsProfile } from '../semantics.ts';
import {
  validateOnchainExecutionObservation,
} from '../pins/onchain-domain/observation.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';

/** Family-declared confirmation target from the semantics profile. */
export function declaredConfirmationTarget(
  semantics: FamilySemanticsProfile,
): number {
  const finality = semantics.finality;
  switch (finality.family) {
    case 'EVM':
    case 'UTXO':
      return finality.confirmationDepthTarget;
    case 'SOLANA':
      return finality.slotConfirmationTarget;
    case 'STELLAR':
      return finality.ledgerConfirmationTarget;
  }
}

/**
 * The shared finality evaluation: validates the observation (CONFIRMED +
 * finality candidate required — finality is never approximated), checks
 * chain scoping, computes the family-observed depth and compares it to the
 * DECLARED guidance (never finality).
 */
export function evaluateFinalityStage(input: {
  readonly adapterId: string;
  readonly chainKey: string;
  readonly semantics: FamilySemanticsProfile;
  readonly observation: OnchainExecutionObservation;
  readonly head: ChainHeadObservation;
  readonly confirmationDepth: (observation: OnchainExecutionObservation, head: ChainHeadObservation) => number;
}): FinalityEvaluation {
  const observation = validateOnchainExecutionObservation(input.observation);
  if (observation.outcome !== 'CONFIRMED' || observation.finalityCandidate === undefined) {
    throw new ValidationError(
      `finality evaluation requires a CONFIRMED observation carrying a finality candidate — outcome '${observation.outcome}' fails closed (finality is never approximated)`,
    );
  }
  if (observation.chainKey !== input.chainKey || input.head.chainKey !== input.chainKey) {
    throw new ValidationError(
      "finality evaluation requires the observation and head to be scoped to the adapter's chain — chain confusion fails closed",
    );
  }
  const declaredTarget = declaredConfirmationTarget(input.semantics);
  const observedDepth = input.confirmationDepth(observation, input.head);
  const reorgDetected = observation.finalityCandidate.reorgDetected === true;
  return Object.freeze({
    operationKind: 'FinalityEvaluation',
    candidate: Object.freeze({ ...observation.finalityCandidate }),
    declaredTarget,
    observedDepth,
    depthSufficient: observedDepth >= declaredTarget,
    reorgDetected,
    semanticsRef: `${input.adapterId}:semantics@${input.semantics.family}`,
  });
}
