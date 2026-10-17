/**
 * @payswap/onchain-adapters — the family stage context (Work Order P4-W3,
 * lane R2-W3; NET-NEW structural seam to honor the <=400-line file law).
 *
 * Family adapters implement their stages as free functions in per-stage
 * modules (observe/prepare/simulate/broadcast/observe-result); this
 * context interface is the collaboration surface those functions receive —
 * the shared lifecycle machinery (evidence log, observation factory,
 * provenance, confirmation anchors, operation tracker) WITHOUT exposing
 * the base class's protected members beyond the family seam. The base
 * adapter (lifecycle/base.ts) constructs the context; it is never part of
 * the public ChainFamilyAdapter contract.
 */

import type { AdapterProvenance } from '../contract/observations.ts';
import type { AdapterLifecycleStage } from '../contract/stages.ts';
import type { RailEnvironmentClass } from '../environment.ts';
import type { AssetObservation } from '../pins/onchain-domain/asset-observation.ts';
import { validateAssetObservation } from '../pins/onchain-domain/asset-observation.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type { OnchainExecutionOutcome } from '../pins/onchain-domain/observation.ts';
import type { ServedBy } from '../transport.ts';
import type { ConfirmationAnchor } from './evidence-log.ts';

/** The family-stage collaboration surface (see module header). */
export interface FamilyStageContext {
  readonly adapterId: string;
  readonly chainKey: string;
  readonly environmentClass: RailEnvironmentClass;

  /** Mints a deterministic evidence reference and appends a log entry. */
  logEvidence(
    executionRef: string,
    stage: AdapterLifecycleStage,
    at: number,
    refs: readonly string[],
  ): string;

  /** Builds adapter provenance from the serving endpoint + acting instant. */
  buildProvenance(servedBy: ServedBy, atMs: number): AdapterProvenance;

  /**
   * Builds and validates an execution observation (outcome couplings are
   * structural; adapter-authored fields are secret-scanned).
   */
  buildExecutionObservation(input: {
    readonly executionRef: string;
    readonly observedAt: number;
    readonly outcome: OnchainExecutionOutcome;
    readonly externalOperationRef?: string;
    readonly finalityCandidate?: OnchainExecutionObservation['finalityCandidate'];
    readonly failure?: OnchainExecutionObservation['failure'];
    readonly unknownReason?: string;
    readonly evidenceRefs: readonly string[];
    readonly servedBy: ServedBy;
  }): OnchainExecutionObservation;

  /** Validates an adapter-built asset observation (never fabricated). */
  validatedAssetObservation(observation: AssetObservation): AssetObservation;

  /** The remembered confirmation anchor, when one exists. */
  confirmationAnchor(executionRef: string): ConfirmationAnchor | undefined;

  /** Records the confirmation anchor for later reorg comparison. */
  rememberConfirmationAnchor(executionRef: string, anchor: ConfirmationAnchor): void;

  /**
   * Records the observed outcome on the operation tracker (BROADCAST stays
   * in flight; CONFIRMED may become UNKNOWN via reorg; never a failure
   * conversion).
   */
  recordObservedOutcome(observation: OnchainExecutionObservation): void;
}

/** Re-exported for family modules (one import site). */
export { validateAssetObservation };
