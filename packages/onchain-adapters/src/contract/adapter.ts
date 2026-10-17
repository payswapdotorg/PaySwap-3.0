/**
 * @payswap/onchain-adapters — THE FROZEN FAMILY-ADAPTER CONTRACT (Work
 * Order P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/contract.ts adapter interface).
 *
 * A chain-family adapter. Every family implements this interface
 * explicitly; `lifecycle` declares per-stage support and UNSUPPORTED stages
 * fail closed (UnsupportedLifecycleStageError) — never silently skipped,
 * never approximated.
 */

import type { AdapterStageSupport, AdapterLifecycleStage } from './stages.ts';
import { lifecycleStageDeclared } from './stages.ts';
import type {
  AssetPositionProbe,
  ChainHeadObservation,
  ChainHeadProbe,
} from './observations.ts';
import type {
  AuthorizedExecutionFeed,
  AuthorizeStageInput,
  BroadcastStageInput,
  BroadcastStageOutcome,
  FinalityEvaluation,
  ObserveResultInput,
  PreparedAdapterOperation,
  PrepareStageInput,
  ReconciliationPlan,
  SimulateStageInput,
} from './stage-io.ts';
import type { AdapterEvidenceEntry } from './stage-io.ts';
import type { RailEnvironment, RailEnvironmentClass } from '../environment.ts';
import type { FamilySemanticsProfile } from '../semantics.ts';
import type { ChainFamily } from '../pins/onchain-domain/family.ts';
import type { SimulationObservation } from '../pins/onchain-security/signing.ts';

/**
 * A chain-family adapter: the frozen nine-stage lifecycle behind injected
 * transports (deterministic contract layer — no I/O in this package).
 */
export interface ChainFamilyAdapter<
  Env extends RailEnvironmentClass = RailEnvironmentClass,
  FamilyPlan = unknown,
> {
  readonly adapterId: string;
  readonly family: ChainFamily;
  readonly chainKey: string;
  readonly environment: RailEnvironment<Env>;
  /** Explicit per-stage support — the lifecycle is declared, never assumed. */
  readonly lifecycle: AdapterStageSupport;
  /** Explicit family fee/finality/reorg semantics (guidance only). */
  readonly semantics: FamilySemanticsProfile;

  // -- observe ---------------------------------------------------------------
  observeChainHead(input: {
    readonly at: string;
    readonly maxAgeSeconds?: number;
  }): Promise<ChainHeadProbe>;

  observeAssetPosition(input: {
    readonly accountRef: string;
    readonly assetId: string;
    readonly at: string;
    readonly maxAgeSeconds?: number;
  }): Promise<AssetPositionProbe>;

  // -- prepare ---------------------------------------------------------------
  prepare(input: PrepareStageInput): Promise<PreparedAdapterOperation<FamilyPlan>>;

  // -- simulate --------------------------------------------------------------
  simulate(input: SimulateStageInput): Promise<SimulationObservation>;

  // -- authorize (feeds the onchain-security kernel through the port) --------
  authorize(input: AuthorizeStageInput): AuthorizedExecutionFeed;

  // -- broadcast -------------------------------------------------------------
  broadcast(input: BroadcastStageInput): Promise<BroadcastStageOutcome>;

  // -- observe (result) ------------------------------------------------------
  observeOperation(input: ObserveResultInput): Promise<BroadcastStageOutcome>;

  // -- finality --------------------------------------------------------------
  evaluateFinality(input: {
    readonly observation: BroadcastStageOutcome;
    readonly head: ChainHeadObservation;
  }): FinalityEvaluation;

  // -- reconcile -------------------------------------------------------------
  reconciliationPlan(input: {
    readonly observation: BroadcastStageOutcome;
  }): ReconciliationPlan;

  // -- evidence --------------------------------------------------------------
  evidence(executionRef?: string): readonly AdapterEvidenceEntry[];
}

export { lifecycleStageDeclared };
export type { AdapterLifecycleStage };
