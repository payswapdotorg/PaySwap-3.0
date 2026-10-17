/**
 * @payswap/onchain-adapters — the UTXO family adapter (Work Order P4-W3,
 * lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/utxo/index.ts adapter class, decomposed
 * into per-stage modules to honor the <=400-line file law:
 * stages-observe.ts, stages-submit.ts).
 *
 * The class wires the injected REST/explorer transport contract and the
 * injected onchain-security kernel port to the frozen nine-stage lifecycle.
 * The one stage the family CANNOT express — SIMULATION — is declared
 * unsupported and FAILS CLOSED (UnsupportedLifecycleStageError): UTXO rails
 * expose no state-transition simulation without wallet-side transaction
 * construction; approximating it is forbidden.
 */

import { ValidationError } from '../errors.ts';
import { UnsupportedLifecycleStageError } from '../errors.ts';
import { BaseChainFamilyAdapter } from '../lifecycle/base.ts';
import type { ResolvedAssetIdentity } from '../lifecycle/declaration.ts';
import type {
  AssetPositionProbe,
  ChainHeadObservation,
  ChainHeadProbe,
} from '../contract/observations.ts';
import type {
  BroadcastStageOutcome,
  PrepareStageInput,
  PreparedAdapterOperation,
} from '../contract/stage-io.ts';
import type { OnchainExecutionDirective } from '../pins/onchain-domain/directive.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type {
  SimulationObservation,
  SigningRequest,
} from '../pins/onchain-security/signing.ts';
import type { UtxoFinalitySemantics } from '../semantics.ts';
import type { RestTransport } from '../transport.ts';
import { UtxoSigningEnvelopeAdapter } from './plan.ts';
import type { UtxoAdapterDeclaration, UtxoExecutionPlan } from './plan.ts';
import {
  utxoObserveAssetPosition,
  utxoObserveChainHead,
  utxoPrepare,
} from './stages-observe.ts';
import { utxoBroadcast, utxoObserveOperation } from './stages-submit.ts';

export type { UtxoAdapterDeclaration, UtxoExecutionPlan };
export { UtxoSigningEnvelopeAdapter };
export {
  BITCOIN_GENESIS_HASHES,
  BITCOIN_MAINNET_PUBLIC_ENDPOINTS,
  BITCOIN_TESTNET_PUBLIC_ENDPOINTS,
} from './identities.ts';
export { BITCOIN_MEMPOOL_POLICY } from './identities.ts';

/**
 * The UTXO family adapter: native BTC transfers (exact integer satoshi).
 * UTXO consolidation/coin-selection and token protocols are NOT declared in
 * this wave — undeclared semantics fail closed rather than approximating.
 * SIMULATION is structurally unsupported and fails closed.
 */
export class UtxoChainAdapter extends BaseChainFamilyAdapter<
  'PRODUCTION' | 'TESTNET' | 'REGTEST',
  UtxoExecutionPlan
> {
  readonly #transport: RestTransport;
  readonly #symbol: string;
  readonly #assetId: string;
  readonly #maxHeadAgeSeconds: number;
  readonly #feeEstimateTargetBlocks: number;
  readonly #finalitySemantics: UtxoFinalitySemantics;
  #signerEnvelope: UtxoSigningEnvelopeAdapter;

  constructor(declaration: UtxoAdapterDeclaration) {
    super({
      adapterId: declaration.adapterId,
      chainKey: declaration.chainKey,
      family: 'UTXO',
      lifecycle: {
        observe: true,
        prepare: true,
        // EXPLICIT unsupported stage: UTXO rails expose no simulation —
        // this fails closed (UnsupportedLifecycleStageError) instead of
        // approximating. The kernel supports gate-only preparation.
        simulate: false,
        authorize: true,
        broadcast: true,
        observeResult: true,
        finality: true,
        reconcile: true,
        evidence: true,
      },
      semantics: {
        family: 'UTXO',
        fee: {
          expressible: false,
          reason:
            "fee parameters not yet observed — derived at prepare from the explorer's fee-estimates feed (exact decimal text)",
        },
        finality: {
          family: 'UTXO',
          finalityModel: 'PROBABILISTIC',
          confirmationDepthTarget: declaration.confirmationDepthTarget,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      },
      kernel: declaration.kernel,
    });
    this.#transport = declaration.transport;
    this.#symbol = declaration.nativeAssetSymbol ?? 'BTC';
    this.#assetId = `${this.chainKey}/asset:${this.#symbol}`;
    this.#maxHeadAgeSeconds = declaration.maxHeadAgeSeconds ?? 600;
    this.#feeEstimateTargetBlocks = declaration.feeEstimateTargetBlocks ?? 6;
    this.#finalitySemantics = {
      family: 'UTXO',
      finalityModel: 'PROBABILISTIC',
      confirmationDepthTarget: declaration.confirmationDepthTarget,
      reorgDetection: 'BLOCK_HASH_OBSERVATION',
    };
    this.#signerEnvelope = new UtxoSigningEnvelopeAdapter({
      adapterId: declaration.adapterId,
      chainKey: this.chainKey,
    });
  }

  // ------------------------------------------------------------------
  // identity resolution (family-owned)
  // ------------------------------------------------------------------

  protected resolveAssetIdentity(assetId: string): ResolvedAssetIdentity {
    if (assetId !== this.#assetId) {
      throw new ValidationError(
        `assetId '${assetId}' is not the declared native BTC binding '${this.#assetId}' on '${this.chainKey}' — token/colored-coin semantics are not declared in this wave and fail closed (never approximated)`,
      );
    }
    return { symbol: this.#symbol, nativeAssetRef: 'native:satoshi' };
  }

  protected assertOperationSupported(operation: OnchainExecutionDirective['operation']): void {
    if (operation === 'onchain.transfer') {
      return;
    }
    throw new ValidationError(
      `the UTXO family does not declare support for operation '${operation}' (no allowance model on UTXO rails) — unsupported operations fail closed, never approximated`,
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
    return utxoObserveChainHead(
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
    return utxoObserveAssetPosition(this.familyContext(), this.#transport, this.#assetId, input);
  }

  async prepare(input: PrepareStageInput): Promise<PreparedAdapterOperation<UtxoExecutionPlan>> {
    const prepared = await utxoPrepare(
      this.familyContext(),
      this.#transport,
      this.#feeEstimateTargetBlocks,
      this.preparePrologue(input),
      input,
    );
    this.refreshSemantics({
      family: 'UTXO',
      fee: prepared.familyPlan.fee,
      finality: this.#finalitySemantics,
    });
    return this.freezePrepared({
      ...prepared,
      familyPlan: {
        ...prepared.familyPlan,
        fee: this.semantics.fee as UtxoExecutionPlan['fee'],
      },
    });
  }

  // ------------------------------------------------------------------
  // simulate stage — STRUCTURALLY UNSUPPORTED (fail closed)
  // ------------------------------------------------------------------

  simulate(): never {
    throw new UnsupportedLifecycleStageError(
      this.adapterId,
      'simulate',
      'UTXO rails expose no state-transition simulation without wallet-side transaction construction — simulation is structurally unsupported for this family and fails closed (never approximated); the security kernel supports gate-only preparation',
    );
  }

  protected signerAdapter(): UtxoSigningEnvelopeAdapter {
    return this.#signerEnvelope;
  }

  async broadcast(input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  }): Promise<BroadcastStageOutcome> {
    this.assertBroadcastable(input);
    return utxoBroadcast(this.familyContext(), this.#transport, input);
  }

  async observeOperation(input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  }): Promise<BroadcastStageOutcome> {
    return utxoObserveOperation(this.familyContext(), this.#transport, input);
  }
}
