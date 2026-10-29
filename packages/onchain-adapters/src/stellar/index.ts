/**
 * @payswap/onchain-adapters — the STELLAR family adapter (P22-A, lane 3-a;
 * ADR-0016 D2/D3/D4/D7).
 *
 * The class wires the injected Horizon REST transport contract and the
 * injected onchain-security kernel port to the frozen nine-stage lifecycle,
 * decomposed into per-stage modules to honor the <=400-line file law:
 * stages-observe.ts (head/account/issuer-scoped positions), stages-prepare.ts
 * (chain identity + fee + the transfer/deploy plan), stages-submit.ts
 * (broadcast + observe-result), deployment.ts (the evidence stage of the
 * deploy path — see ../contract/deployment.ts), classic-issuance.ts (the
 * classic-asset issuance alternative, declared plan data), stroops.ts (exact
 * stroop arithmetic), identities.ts (the well-known testnet identities),
 * plan.ts (the family plan + the signing envelope).
 *
 * THE DEPLOY GRANT LAW (ADR-0016 D7): a contract-deployment broadcast checks
 * its grant BEFORE any transport call — a deploy directive whose write was
 * never authorized through this adapter is a TYPED refusal
 * (DeploymentGrantRequiredError) and NEVER reaches a transport. The generic
 * authorize-before-broadcast spine law (operation-machine.ts) still holds
 * underneath for every write.
 *
 * SIMULATION is structurally unsupported over Horizon REST (Soroban
 * simulation rides the Soroban RPC surface) and FAILS CLOSED — the UTXO
 * precedent, never approximated.
 */

import { ValidationError } from '../errors.ts';
import { DeploymentGrantRequiredError } from '../errors.ts';
import { UnsupportedLifecycleStageError } from '../errors.ts';
import { BaseChainFamilyAdapter } from '../lifecycle/base.ts';
import type { ResolvedAssetIdentity } from '../lifecycle/declaration.ts';
import type {
  AssetPositionProbe,
  ChainHeadObservation,
  ChainHeadProbe,
} from '../contract/observations.ts';
import type {
  AuthorizeStageInput,
  AuthorizedExecutionFeed,
  BroadcastStageOutcome,
  PrepareStageInput,
  PreparedAdapterOperation,
} from '../contract/stage-io.ts';
import type { OnchainExecutionDirective } from '../pins/onchain-domain/directive.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type {
  SigningRequest,
} from '../pins/onchain-security/signing.ts';
import type { StellarFinalitySemantics } from '../semantics.ts';
import type { RestTransport } from '../transport.ts';
import type { ContractDeploymentEvidence } from '../pins/onchain-domain/deployment.ts';
import { StellarSigningEnvelopeAdapter } from './plan.ts';
import type {
  StellarAdapterDeclaration,
  StellarAssetBinding,
  StellarExecutionPlan,
} from './plan.ts';
import {
  stellarObserveAssetPosition,
  stellarObserveChainHead,
} from './stages-observe.ts';
import { stellarPrepare } from './stages-prepare.ts';
import { stellarBroadcast, stellarObserveOperation } from './stages-submit.ts';
import { stellarDeploymentRecord } from './deployment.ts';

export type { StellarAdapterDeclaration, StellarExecutionPlan };
export { StellarSigningEnvelopeAdapter };
export {
  STELLAR_NETWORK_PASSPHRASES,
  STELLAR_TESTNET_PUBLIC_ENDPOINTS,
} from './identities.ts';
export { stellarClassicIssuancePlan } from './classic-issuance.ts';
export type { StellarClassicIssuancePlan } from './classic-issuance.ts';
export { stellarDecimalToStroops } from './stroops.ts';

/**
 * The Stellar family adapter over Horizon (REST — the injected-fetch seam,
 * NO SDK): native XLM transfers, issuer-scoped credit-asset transfers (the
 * issuer-collision law — a credit asset resolves ONLY in its issuer-scoped
 * canonical form) and Soroban contract deployments on `stellar:testnet`.
 * The registry admits exactly the testnet; a pubnet adapter is
 * unconstructible (an unregistered chainKey fails closed at construction).
 */
export class StellarChainAdapter extends BaseChainFamilyAdapter<
  'TESTNET',
  StellarExecutionPlan
> {
  readonly #transport: RestTransport;
  readonly #symbol: string;
  readonly #assetId: string;
  readonly #issuerScopedAssets: ReadonlyMap<string, StellarAssetBinding>;
  readonly #maxHeadAgeSeconds: number;
  readonly #finalitySemantics: StellarFinalitySemantics;
  #signerEnvelope: StellarSigningEnvelopeAdapter;
  /** Write digests this adapter PREPARED as contract deployments (the grant law). */
  readonly #deployWrites = new Set<string>();
  /** Write digests authorized through THIS adapter (the kernel grant record). */
  readonly #authorizedWrites = new Set<string>();

  constructor(declaration: StellarAdapterDeclaration) {
    super({
      adapterId: declaration.adapterId,
      chainKey: declaration.chainKey,
      family: 'STELLAR',
      lifecycle: {
        observe: true,
        prepare: true,
        // EXPLICIT unsupported stage: Soroban simulation rides the Soroban
        // RPC surface, not Horizon REST — this fails closed
        // (UnsupportedLifecycleStageError) instead of approximating. The
        // kernel supports gate-only preparation.
        simulate: false,
        authorize: true,
        broadcast: true,
        observeResult: true,
        finality: true,
        reconcile: true,
        evidence: true,
      },
      semantics: {
        family: 'STELLAR',
        fee: {
          expressible: false,
          reason:
            'fee parameters not yet observed — derived at prepare from the Horizon fee-stats feed (exact stroops)',
        },
        finality: {
          family: 'STELLAR',
          finalityModel: 'DETERMINISTIC',
          ledgerConfirmationTarget: declaration.ledgerConfirmationTarget ?? 1,
          reorgDetection: 'NOT_APPLICABLE',
        },
      },
      kernel: declaration.kernel,
    });
    this.#transport = declaration.transport;
    this.#symbol = declaration.nativeAssetSymbol ?? 'XLM';
    this.#assetId = `${this.chainKey}/asset:${this.#symbol}`;
    this.#issuerScopedAssets = new Map(
      (declaration.issuerScopedAssets ?? []).map((binding) => [binding.assetId, binding]),
    );
    this.#maxHeadAgeSeconds = declaration.maxHeadAgeSeconds ?? 35;
    this.#finalitySemantics = {
      family: 'STELLAR',
      finalityModel: 'DETERMINISTIC',
      ledgerConfirmationTarget: declaration.ledgerConfirmationTarget ?? 1,
      reorgDetection: 'NOT_APPLICABLE',
    };
    this.#signerEnvelope = new StellarSigningEnvelopeAdapter({
      adapterId: declaration.adapterId,
      chainKey: this.chainKey,
    });
  }

  // ------------------------------------------------------------------
  // identity resolution (family-owned — the issuer-collision law)
  // ------------------------------------------------------------------

  protected resolveAssetIdentity(assetId: string): ResolvedAssetIdentity {
    if (assetId === this.#assetId) {
      return { symbol: this.#symbol, nativeAssetRef: 'native:stroops' };
    }
    const binding = this.#issuerScopedAssets.get(assetId);
    if (binding !== undefined) {
      return {
        symbol: binding.code,
        nativeAssetRef: `stellar:asset:${binding.code}:${binding.issuerAccount}`,
      };
    }
    throw new ValidationError(
      `assetId '${assetId}' is not a declared binding on '${this.chainKey}' (the native binding is '${this.#assetId}'; credit assets require the ISSUER-SCOPED canonical form '${this.chainKey}/asset:CODE:ISSUER' and a declared issuer binding — two issuers of the same code are two assets, ADR-0016 D3)`,
    );
  }

  protected assertOperationSupported(operation: OnchainExecutionDirective['operation']): void {
    if (operation === 'onchain.transfer' || operation === 'onchain.contract_deploy') {
      return;
    }
    throw new ValidationError(
      `the Stellar family does not declare support for operation '${operation}' in this wave — unsupported operations fail closed, never approximated`,
    );
  }

  protected transportProviderNames(): readonly string[] {
    return [...new Set(this.#transport.endpoints().map((endpoint) => endpoint.providerName))];
  }

  protected confirmationDepth(
    observation: OnchainExecutionObservation,
    head: ChainHeadObservation,
  ): number {
    const anchor = this.confirmationAnchor(observation.executionRef);
    if (anchor !== undefined) {
      return Math.max(0, head.height - anchor.height + 1);
    }
    return observation.finalityCandidate?.confirmationDepth ?? 0;
  }

  // ------------------------------------------------------------------
  // the nine lifecycle stages (family modules through the stage context)
  // ------------------------------------------------------------------

  async observeChainHead(input: {
    readonly at: string;
    readonly maxAgeSeconds?: number;
  }): Promise<ChainHeadProbe> {
    return stellarObserveChainHead(
      this.familyContext(),
      this.#transport,
      this.#maxHeadAgeSeconds,
      input,
    );
  }

  async observeAssetPosition(input: {
    readonly accountRef: string;
    readonly assetId: string;
    readonly at: string;
    readonly maxAgeSeconds?: number;
  }): Promise<AssetPositionProbe> {
    return stellarObserveAssetPosition(this.familyContext(), this.#transport, this.#assetId, input);
  }

  async prepare(input: PrepareStageInput): Promise<PreparedAdapterOperation<StellarExecutionPlan>> {
    const prepared = await stellarPrepare(
      this.familyContext(),
      this.#transport,
      this.preparePrologue(input),
      input,
    );
    // The grant law's bookkeeping: remember WHICH prepared writes are
    // contract deployments (their broadcast demands the typed grant check).
    if (prepared.familyPlan.kind === 'contract_deploy') {
      this.#deployWrites.add(prepared.writeDigest);
    }
    this.refreshSemantics({
      family: 'STELLAR',
      fee: prepared.familyPlan.fee,
      finality: this.#finalitySemantics,
    });
    return this.freezePrepared({
      ...prepared,
      familyPlan: {
        ...prepared.familyPlan,
        fee: this.semantics.fee as StellarExecutionPlan['fee'],
      },
    });
  }

  // ------------------------------------------------------------------
  // simulate stage — STRUCTURALLY UNSUPPORTED over Horizon REST (fail closed)
  // ------------------------------------------------------------------

  simulate(): never {
    throw new UnsupportedLifecycleStageError(
      this.adapterId,
      'simulate',
      'Soroban simulation rides the Soroban RPC surface, not the Horizon REST API this adapter is declared over — simulation is structurally unsupported here and fails closed (never approximated); the security kernel supports gate-only preparation',
    );
  }

  // ------------------------------------------------------------------
  // authorize + the DEPLOY GRANT LAW (ADR-0016 D7 — the no-bypass discipline)
  // ------------------------------------------------------------------

  authorize(input: AuthorizeStageInput): AuthorizedExecutionFeed {
    const feed = super.authorize(input);
    this.#authorizedWrites.add(feed.signingRequest.writeDigest);
    return feed;
  }

  async broadcast(input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  }): Promise<BroadcastStageOutcome> {
    // THE DEPLOY GRANT LAW: a prepared contract-deployment write broadcasting
    // WITHOUT its kernel grant is a TYPED refusal BEFORE any transport call
    // (a smuggled deploy directive never reaches a transport — D7).
    if (
      this.#deployWrites.has(input.handoff.writeDigest) &&
      !this.#authorizedWrites.has(input.handoff.writeDigest)
    ) {
      throw new DeploymentGrantRequiredError(
        `a contract-deployment broadcast requires its deployment grant: write '${input.handoff.writeDigest}' was prepared as a deployment but never authorized through this adapter's kernel — the deploy directive is refused and NEVER reaches a transport (ADR-0016 D7)`,
        { writeDigest: input.handoff.writeDigest, executionRef: input.executionRef },
      );
    }
    this.assertBroadcastable(input);
    return stellarBroadcast(this.familyContext(), this.#transport, input);
  }

  async observeOperation(input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  }): Promise<BroadcastStageOutcome> {
    return stellarObserveOperation(this.familyContext(), this.#transport, input);
  }

  // ------------------------------------------------------------------
  // the deploy path's evidence stage (ADR-0016 D4/D7 — never fabricated)
  // ------------------------------------------------------------------

  /**
   * Derives the deployment evidence record
   * `{ txHash, contractId, sourceHash, bytecodeHash }` from a CONFIRMED
   * deployment observation + the prepared deploy plan. The ONLY source of a
   * SmartContractExtensionPin for what this deployment produced (see
   * ../pins/onchain-domain/deployment.ts) — a non-CONFIRMED observation or an
   * unobservable contract id is a typed rejection, never a fabricated record.
   */
  async deploymentRecord(input: {
    readonly prepared: PreparedAdapterOperation<StellarExecutionPlan>;
    readonly observation: BroadcastStageOutcome;
  }): Promise<ContractDeploymentEvidence> {
    return stellarDeploymentRecord(this.familyContext(), this.#transport, input);
  }

  protected signerAdapter(): StellarSigningEnvelopeAdapter {
    return this.#signerEnvelope;
  }
}
