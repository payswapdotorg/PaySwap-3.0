/**
 * @payswap/onchain-adapters — observation factories (Work Order P4-W3,
 * lane R2-W3; PORT of payswap.org@8a735bf packages/onchain-adapters/src/
 * lifecycle.ts observation-factory half).
 *
 * EVERY adapter-produced execution observation is built here and passes
 * the pinned domain validator, so the outcome couplings are structural:
 * BROADCAST never carries a finality candidate (rule 29), FAILED always
 * explains itself, OUTCOME_UNKNOWN never carries a failure descriptor and
 * always explains itself.
 *
 * Secret boundary (rule 25): every ADAPTER-AUTHORED field is
 * secret-scanned. The rail-sourced `externalOperationRef` is a PUBLIC
 * derived identifier (transaction hash / signature / txid) whose shape is
 * validated separately (a non-empty canonical public identifier — never
 * anything else).
 */

import { ValidationError } from '../errors.ts';
import { contentDigest } from '../digest.ts';
import { assertNoSecretMaterial } from '../secrets.ts';
import type { AdapterProvenance } from '../contract/observations.ts';
import type { ServedBy } from '../transport.ts';
import type { RailEnvironmentClass } from '../environment.ts';
import {
  validateOnchainExecutionObservation,
} from '../pins/onchain-domain/observation.ts';
import type {
  OnchainExecutionObservation,
  OnchainExecutionOutcome,
} from '../pins/onchain-domain/observation.ts';

/** Builds adapter provenance from the serving endpoint + the acting instant. */
export function buildAdapterProvenance(input: {
  readonly servedBy: ServedBy;
  readonly atMs: number;
  readonly adapterId: string;
  readonly environmentClass: RailEnvironmentClass;
}): AdapterProvenance {
  return Object.freeze({
    transportId: input.servedBy.transportId,
    endpointId: input.servedBy.endpointId,
    providerName: input.servedBy.providerName,
    capturedAt: new Date(input.atMs).toISOString(),
    adapterId: input.adapterId,
    environmentClass: input.environmentClass,
  });
}

/**
 * Builds and validates an execution observation. EVERY adapter-produced
 * observation passes the pinned domain validator, so the outcome couplings
 * are structural (see module header). The observation id is a deterministic
 * content digest (no entropy).
 */
export function buildExecutionObservation(input: {
  readonly adapterId: string;
  readonly chainKey: string;
  readonly executionRef: string;
  readonly observedAt: number;
  readonly outcome: OnchainExecutionOutcome;
  readonly externalOperationRef?: string;
  readonly finalityCandidate?: OnchainExecutionObservation['finalityCandidate'];
  readonly failure?: OnchainExecutionObservation['failure'];
  readonly unknownReason?: string;
  readonly evidenceRefs: readonly string[];
  readonly servedBy: ServedBy;
  readonly evidenceSeq: number;
}): OnchainExecutionObservation {
  const observation: OnchainExecutionObservation = {
    observationId: `exec-obs:${input.adapterId}:${input.executionRef}:${contentDigest({
      executionRef: input.executionRef,
      observedAt: input.observedAt,
      outcome: input.outcome,
      ...(input.externalOperationRef !== undefined
        ? { externalOperationRef: input.externalOperationRef }
        : {}),
      seq: input.evidenceSeq,
    })}`,
    executionRef: input.executionRef,
    observedAt: new Date(input.observedAt).toISOString(),
    chainKey: input.chainKey,
    outcome: input.outcome,
    ...(input.externalOperationRef !== undefined
      ? { externalOperationRef: input.externalOperationRef }
      : {}),
    ...(input.finalityCandidate !== undefined
      ? { finalityCandidate: input.finalityCandidate }
      : {}),
    ...(input.failure !== undefined ? { failure: input.failure } : {}),
    ...(input.unknownReason !== undefined ? { unknownReason: input.unknownReason } : {}),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    provenance: {
      providerName: input.servedBy.providerName,
      source: 'PROVIDER_API',
      capturedAt: new Date(input.observedAt).toISOString(),
    },
  };
  // Rule 25: scan every adapter-authored field (observation minus the
  // rail-sourced public operation reference, which is separately validated
  // for shape below).
  const { externalOperationRef: _railRef, ...adapterAuthored } = observation;
  assertNoSecretMaterial(adapterAuthored, 'adapter execution observation');
  if (observation.externalOperationRef !== undefined) {
    const ref = observation.externalOperationRef;
    if (ref.length === 0 || ref.trim() !== ref || /\s/.test(ref)) {
      throw new ValidationError(
        'externalOperationRef must be a non-empty canonical public identifier (no whitespace) — never anything else',
      );
    }
  }
  return validateOnchainExecutionObservation(observation);
}
