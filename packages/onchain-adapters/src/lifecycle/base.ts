/**
 * @payswap/onchain-adapters — the base family adapter (Work Order P4-W3,
 * lane R2-W3; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-adapters/src/lifecycle.ts BaseChainFamilyAdapter).
 *
 * Implements every FAMILY-NEUTRAL part of the frozen adapter lifecycle
 * once: structural construction law (environment from chain identity,
 * semantics + lifecycle-declaration validation, the injected kernel port);
 * the append-only evidence log + confirmation anchors (evidence-log.ts);
 * the pure operation tracker (authorize-before-broadcast,
 * one-write-per-execution, reorg ambiguity, reconciliation as the only
 * exit from UNKNOWN — mechanically enforced, operation-machine.ts); the
 * observation factories (outcome couplings structural, secret-scanned);
 * the directive→kernel write translation; the GENERIC authorize stage
 * (drives the injected kernel port — the ADAPTER never authorizes, the
 * kernel owns authority); the GENERIC reconcile stage (OUTCOME_UNKNOWN
 * only); staleness + broadcast guards; and the family stage context (the
 * seam the per-stage family modules collaborate through — stage-context.ts).
 */

import { ValidationError } from '../errors.ts';
import { railEnvironment } from '../environment.ts';
import type { RailEnvironment, RailEnvironmentClass } from '../environment.ts';
import { validateFamilySemanticsProfile } from '../semantics-validation.ts';
import type { FamilySemanticsProfile } from '../semantics.ts';
import { validateLifecycleDeclaration } from './declaration.ts';
import type { BaseAdapterDeclaration, ResolvedAssetIdentity } from './declaration.ts';
import { buildAdapterProvenance, buildExecutionObservation } from './observation-factory.ts';
import { buildWriteRequest } from './write-translation.ts';
import { runAuthorizeStage } from './authorize.ts';
import { evaluateFinalityStage } from './finality.ts';
import { buildReconciliationPlan } from './reconcile.ts';
import { AdapterOperationTracker } from './operation-machine.ts';
import { AdapterEvidenceLog } from './evidence-log.ts';
import type { ConfirmationAnchor } from './evidence-log.ts';
import type { FamilyStageContext } from './stage-context.ts';
import type { AdapterEvidenceEntry } from '../contract/stage-io.ts';
import { runPreparePrologue } from './prepare-prologue.ts';
import type { PreparePrologueResult } from './prepare-prologue.ts';
import type {
  AuthorizeStageInput,
  AuthorizedExecutionFeed,
  BroadcastStageOutcome,
  FinalityEvaluation,
  PrepareStageInput,
  PreparedAdapterOperation,
  ReconciliationPlan,
} from '../contract/stage-io.ts';
import type {
  AssetPositionProbe,
  ChainHeadObservation,
  ChainHeadProbe,
} from '../contract/observations.ts';
import type { AdapterStageSupport } from '../contract/stages.ts';
import type { ChainFamilyAdapter } from '../contract/adapter.ts';
import type { AssetObservation } from '../pins/onchain-domain/asset-observation.ts';
import { validateAssetObservation } from '../pins/onchain-domain/asset-observation.ts';
import type { OnchainExecutionDirective } from '../pins/onchain-domain/directive.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type { OnchainSecurityKernelPort } from '../pins/onchain-security/kernel-port.ts';
import type { SignerAdapter, SigningRequest, SimulationObservation } from '../pins/onchain-security/signing.ts';
import type { SettlementInstructionBinding } from '../pins/onchain-security/write-request.ts';

/**
 * The family-neutral lifecycle machinery. Every concrete family adapter
 * extends this class; the family implements the abstract ports and the
 * stage methods (delegating to its per-stage modules through
 * `familyContext()`).
 */
export abstract class BaseChainFamilyAdapter<
  Env extends RailEnvironmentClass = RailEnvironmentClass,
  FamilyPlan = unknown,
> implements ChainFamilyAdapter<Env, FamilyPlan>
{
  readonly adapterId: string;
  readonly family: 'EVM' | 'SOLANA' | 'UTXO';
  readonly chainKey: string;
  readonly environment: RailEnvironment<Env>;
  readonly lifecycle: AdapterStageSupport;

  #semantics: FamilySemanticsProfile;
  readonly #kernel: OnchainSecurityKernelPort;
  readonly #evidenceLog = new AdapterEvidenceLog();
  readonly #operations = new AdapterOperationTracker();

  /** The CURRENT semantics profile (fee parameters refresh with observations). */
  get semantics(): FamilySemanticsProfile {
    return this.#semantics;
  }

  protected constructor(
    declaration: BaseAdapterDeclaration & {
      readonly kernel: OnchainSecurityKernelPort;
    },
  ) {
    this.adapterId = declaration.adapterId;
    this.chainKey = declaration.chainKey;
    this.family = declaration.family;
    this.lifecycle = validateLifecycleDeclaration(declaration.lifecycle);
    this.#semantics = validateFamilySemanticsProfile(declaration.semantics);
    if (this.#semantics.family !== declaration.family) {
      throw new ValidationError(
        `adapter '${declaration.adapterId}' declares family '${declaration.family}' but its semantics profile carries family '${this.#semantics.family}' — family/semantics mismatch fails closed`,
      );
    }
    // STRUCTURAL environment: derived from chain identity, never declared.
    this.environment = railEnvironment<Env>(declaration.chainKey);
    this.#kernel = declaration.kernel;
  }

  /** The injected kernel port (families never authorize on their own). */
  protected kernel(): OnchainSecurityKernelPort {
    return this.#kernel;
  }

  /**
   * Refreshes the CURRENT semantics profile (validated, frozen). Fee
   * parameters are OBSERVED state; the declared MODELS and finality
   * semantics stay fixed at construction.
   */
  protected refreshSemantics(profile: FamilySemanticsProfile): void {
    this.#semantics = validateFamilySemanticsProfile(profile);
  }

  // -- evidence stage + operation lifecycle (shared) ----------------------

  evidence(executionRef?: string): readonly AdapterEvidenceEntry[] {
    return this.#evidenceLog.entries(executionRef);
  }

  /** The recorded operation-lifecycle state of an execution reference. */
  operationLifecycle(executionRef: string): string {
    return this.#operations.stateOf(executionRef);
  }

  // -- the family stage context (the per-stage module seam) ---------------

  /** The collaboration surface for the family's per-stage modules. */
  protected familyContext(): FamilyStageContext {
    return {
      adapterId: this.adapterId,
      chainKey: this.chainKey,
      environmentClass: this.environment.environmentClass,
      logEvidence: (executionRef, stage, at, refs) =>
        this.#evidenceLog.log(
          this.adapterId,
          this.environment.environmentClass,
          executionRef,
          stage,
          at,
          refs,
        ),
      buildProvenance: (servedBy, atMs) =>
        buildAdapterProvenance({
          servedBy,
          atMs,
          adapterId: this.adapterId,
          environmentClass: this.environment.environmentClass,
        }),
      buildExecutionObservation: (input) =>
        buildExecutionObservation({
          adapterId: this.adapterId,
          chainKey: this.chainKey,
          evidenceSeq: this.#evidenceLog.sequence,
          ...input,
        }),
      validatedAssetObservation: (observation) => validateAssetObservation(observation),
      confirmationAnchor: (executionRef) => this.#evidenceLog.anchor(executionRef),
      rememberConfirmationAnchor: (executionRef, anchor) =>
        this.#evidenceLog.rememberAnchor(executionRef, anchor),
      recordObservedOutcome: (observation) => this.#recordObserved(observation),
    };
  }

  #recordObserved(observation: OnchainExecutionObservation): void {
    if (observation.outcome === 'BROADCAST') {
      return; // still in flight — no transition
    }
    this.#operations.recordObserved(observation.executionRef, observation.outcome);
  }

  // -- neutral directive → kernel write request (shared) -------------------

  /** Resolves the neutral asset identity for a directive assetId (family-owned). */
  protected abstract resolveAssetIdentity(assetId: string): ResolvedAssetIdentity;

  /** The family's SignerAdapter for the kernel handoff (family-owned). */
  protected abstract signerAdapter(): SignerAdapter;

  /** Family-declared operation support (explicit; unsupported fails closed). */
  protected abstract assertOperationSupported(
    operation: OnchainExecutionDirective['operation'],
  ): void;

  /** Builds the kernel-ready OnchainWriteRequest from the neutral directive. */
  protected buildWriteRequest(input: {
    readonly directive: OnchainExecutionDirective;
    readonly signerAccountRef: string;
    readonly at: number;
    readonly requestedBy: string;
    readonly settlementInstruction?: SettlementInstructionBinding;
    readonly familyNonce?: string;
  }) {
    return buildWriteRequest(
      {
        adapterId: this.adapterId,
        chainKey: this.chainKey,
        family: this.family,
        assertOperationSupported: (operation) => this.assertOperationSupported(operation),
        resolveAssetIdentity: (assetId) => this.resolveAssetIdentity(assetId),
      },
      input,
    );
  }

  // -- prepare-stage shared entry (families compose it with their plan) ----

  /** The shared prepare prologue (see lifecycle/prepare-prologue.ts). */
  protected preparePrologue(input: PrepareStageInput): PreparePrologueResult {
    return runPreparePrologue(
      {
        adapterId: this.adapterId,
        chainKey: this.chainKey,
        family: this.family,
        environmentClass: this.environment.environmentClass,
        kernel: this.#kernel,
        evidenceLog: this.#evidenceLog,
        buildWriteRequest: (buildInput) => this.buildWriteRequest(buildInput),
      },
      input,
    );
  }

  /** Freezes a prepared adapter operation. */
  protected freezePrepared(
    operation: PreparedAdapterOperation<FamilyPlan>,
  ): PreparedAdapterOperation<FamilyPlan> {
    return Object.freeze(operation);
  }

  // -- authorize stage (shared — drives the injected security kernel) ------

  authorize(input: AuthorizeStageInput): AuthorizedExecutionFeed {
    const feed = runAuthorizeStage(this.#kernel, this.signerAdapter(), input);
    this.#operations.recordAuthorize(feed.signingRequest.writeDigest);
    this.#evidenceLog.log(
      this.adapterId,
      this.environment.environmentClass,
      feed.signingRequest.writeDigest,
      'authorize',
      input.at,
      [feed.authorizationRef, feed.recheckRef, feed.signingRequest.requestId],
    );
    return feed;
  }

  // -- finality stage (shared computation, family depth) -------------------

  /** Family-specific observed confirmation depth for a CONFIRMED observation. */
  protected abstract confirmationDepth(
    observation: OnchainExecutionObservation,
    head: ChainHeadObservation,
  ): number;

  evaluateFinality(input: {
    readonly observation: BroadcastStageOutcome;
    readonly head: ChainHeadObservation;
  }): FinalityEvaluation {
    const evaluation = evaluateFinalityStage({
      adapterId: this.adapterId,
      chainKey: this.chainKey,
      semantics: this.semantics,
      observation: input.observation,
      head: input.head,
      confirmationDepth: (observation, head) => this.confirmationDepth(observation, head),
    });
    this.#operations.recordFinality(input.observation.executionRef);
    this.#evidenceLog.log(
      this.adapterId,
      this.environment.environmentClass,
      input.observation.executionRef,
      'finality',
      Date.parse(input.observation.observedAt),
      [`depth:${evaluation.observedDepth}`, `target:${evaluation.declaredTarget}`],
    );
    return evaluation;
  }

  // -- reconcile stage (shared — deterministic, never resolution) ---------

  reconciliationPlan(input: {
    readonly observation: BroadcastStageOutcome;
  }): ReconciliationPlan {
    const plan = buildReconciliationPlan({
      adapterId: this.adapterId,
      chainKey: this.chainKey,
      observation: input.observation,
      transportProviderNames: this.transportProviderNames(),
    });
    this.#operations.recordReconcile(input.observation.executionRef);
    this.#evidenceLog.log(
      this.adapterId,
      this.environment.environmentClass,
      input.observation.executionRef,
      'reconcile',
      Date.parse(input.observation.observedAt),
      [input.observation.observationId],
    );
    return plan;
  }

  /** The distinct provider names this adapter can cross-check against. */
  protected abstract transportProviderNames(): readonly string[];

  // -- family-implemented lifecycle stages (the contract requires every
  // family to implement them explicitly) -----------------------------------

  abstract observeChainHead(input: {
    readonly at: string;
    readonly maxAgeSeconds?: number;
  }): Promise<ChainHeadProbe>;

  abstract observeAssetPosition(input: {
    readonly accountRef: string;
    readonly assetId: string;
    readonly at: string;
    readonly maxAgeSeconds?: number;
  }): Promise<AssetPositionProbe>;

  abstract prepare(input: PrepareStageInput): Promise<PreparedAdapterOperation<FamilyPlan>>;

  abstract simulate(input: {
    readonly prepared: PreparedAdapterOperation<FamilyPlan>;
    readonly at: number;
  }): Promise<SimulationObservation>;

  abstract broadcast(input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  }): Promise<BroadcastStageOutcome>;

  abstract observeOperation(input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  }): Promise<BroadcastStageOutcome>;

  // -- shared broadcast-stage guards + the confirmation-anchor view --------

  /**
   * Broadcast-stage shared guards: the handoff must be a kernel-minted
   * signing request for THIS chain, the deadline must not have passed, and
   * the payload must be non-empty. The operation tracker additionally
   * enforces authorize-before-broadcast and one-write-per-execution.
   */
  protected assertBroadcastable(input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  }): void {
    if (input.handoff.chain !== this.chainKey) {
      throw new ValidationError(
        `signing request is for chain '${input.handoff.chain}' — the adapter broadcasts on '${this.chainKey}' — chain confusion fails closed`,
      );
    }
    if (input.handoff.deadline <= input.at) {
      throw new ValidationError(
        `signing request deadline ${input.handoff.deadline} has passed at ${input.at} — an expired authorization can never broadcast`,
      );
    }
    if (typeof input.signedPayload !== 'string' || input.signedPayload.length === 0) {
      throw new ValidationError(
        'broadcast requires the trusted-surface-SIGNED payload — an empty payload is never submitted',
      );
    }
    // The mechanical spine law: no unauthorized submission, ever.
    this.#operations.recordBroadcast(input.executionRef, input.handoff.writeDigest);
  }

  /** The remembered confirmation anchor (family reorg-detection view). */
  protected confirmationAnchor(executionRef: string): ConfirmationAnchor | undefined {
    return this.#evidenceLog.anchor(executionRef);
  }

  /** Records the confirmation anchor (family reorg-detection view). */
  protected rememberConfirmationAnchor(
    executionRef: string,
    anchor: ConfirmationAnchor,
  ): void {
    this.#evidenceLog.rememberAnchor(executionRef, anchor);
  }
}
