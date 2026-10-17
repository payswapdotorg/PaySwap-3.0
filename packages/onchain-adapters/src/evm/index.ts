/**
 * @payswap/onchain-adapters — the EVM family adapter (Work Order P4-W3,
 * lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/evm/index.ts adapter class, decomposed into
 * per-stage modules to honor the <=400-line file law: observe.ts,
 * prepare.ts (prepare+simulate), stages.ts (broadcast+observe-result)).
 *
 * The class wires the injected JSON-RPC transport contract and the injected
 * onchain-security kernel port to the frozen nine-stage lifecycle. The
 * EIP-712 signing adapter is family-owned (plan.ts) with this adapter's
 * chain-id resolver; the trusted surface signs — this package never signs.
 */

import { ValidationError } from '../errors.ts';
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
import type { EvmFinalitySemantics, EvmFeeSemantics } from '../semantics.ts';
import type { RpcTransport } from '../transport.ts';
import { EVM_CHAIN_IDS } from './identities.ts';
import { EvmEip712SigningAdapter, nativeEtherBinding } from './plan.ts';
import type {
  EvmAdapterDeclaration,
  EvmAssetBinding,
  EvmExecutionPlan,
} from './plan.ts';
import { evmFeeFromBlock, evmObserveAssetPosition, evmObserveChainHead } from './observe.ts';
import { evmPrepare, evmSimulate } from './prepare.ts';
import { evmBroadcast } from './stages.ts';
import { evmObserveOperation } from './observe-result.ts';

export { nativeEtherBinding };
export type { EvmAssetBinding, EvmExecutionPlan, EvmAdapterDeclaration };
export {
  EVM_CHAIN_IDS,
  ETHEREUM_MAINNET_PUBLIC_ENDPOINTS,
  ETHEREUM_SEPOLIA_PUBLIC_ENDPOINTS,
} from './identities.ts';
export {
  EvmEip712SigningAdapter,
  ONCHAIN_AUTHORIZATION_PRIMARY_TYPE,
  ONCHAIN_AUTHORIZATION_TYPES,
} from './plan.ts';
export type { EvmChainIdResolver } from './plan.ts';

/**
 * The EVM family adapter. PRODUCTION wiring must inject a transport with
 * endpoint provider diversity (the diversity law, asserted at the
 * composition root).
 */
export class EvmChainAdapter extends BaseChainFamilyAdapter<
  'PRODUCTION' | 'TESTNET' | 'REGTEST',
  EvmExecutionPlan
> {
  readonly #transport: RpcTransport;
  readonly #evmChainId: string;
  readonly #assetBindings: ReadonlyMap<string, EvmAssetBinding>;
  readonly #maxHeadAgeSeconds: number;
  readonly #finalitySemantics: EvmFinalitySemantics;
  #signerAdapter: EvmEip712SigningAdapter;

  constructor(declaration: EvmAdapterDeclaration) {
    const declaredChainId = EVM_CHAIN_IDS[declaration.chainKey];
    if (declaredChainId !== undefined && declaredChainId !== declaration.evmChainId) {
      throw new ValidationError(
        `declared evmChainId '${declaration.evmChainId}' disagrees with the well-known chain id '${declaredChainId}' for '${declaration.chainKey}' — chain identity fails closed`,
      );
    }
    super({
      adapterId: declaration.adapterId,
      chainKey: declaration.chainKey,
      family: 'EVM',
      lifecycle: {
        observe: true,
        prepare: true,
        simulate: true,
        authorize: true,
        broadcast: true,
        observeResult: true,
        finality: true,
        reconcile: true,
        evidence: true,
      },
      semantics: {
        family: 'EVM',
        // Initial inexpressible fee shape: parameters are derived from the
        // observed latest block at prepare time (or observeChainHead).
        fee: {
          expressible: false,
          reason:
            'fee parameters not yet observed — derived at prepare from the latest block (EIP-1559 baseFeePerGas)',
        },
        finality: {
          family: 'EVM',
          finalityModel: 'PROBABILISTIC',
          confirmationDepthTarget: declaration.confirmationDepthTarget,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      },
      kernel: declaration.kernel,
    });
    this.#transport = declaration.transport;
    this.#evmChainId = declaration.evmChainId;
    this.#assetBindings = new Map(
      declaration.assetBindings.map((binding) => [binding.assetId, binding]),
    );
    this.#maxHeadAgeSeconds = declaration.maxHeadAgeSeconds ?? 90;
    this.#finalitySemantics = {
      family: 'EVM',
      finalityModel: 'PROBABILISTIC',
      confirmationDepthTarget: declaration.confirmationDepthTarget,
      reorgDetection: 'BLOCK_HASH_OBSERVATION',
    };
    this.#signerAdapter = new EvmEip712SigningAdapter({
      chainIdResolver: {
        resolve: (chain) => (chain === this.chainKey ? BigInt(this.#evmChainId) : undefined),
      },
    });
  }

  // ------------------------------------------------------------------
  // identity resolution (family-owned)
  // ------------------------------------------------------------------

  protected resolveAssetIdentity(assetId: string): ResolvedAssetIdentity {
    const binding = this.#assetBindings.get(assetId);
    if (binding === undefined) {
      throw new ValidationError(
        `assetId '${assetId}' has no declared EVM asset binding for chain '${this.chainKey}' — the family-native identity is never guessed (fail closed; register the binding)`,
      );
    }
    return {
      symbol: binding.symbol,
      nativeAssetRef: binding.kind === 'NATIVE' ? 'native' : (binding.contractAddress as string),
    };
  }

  protected assertOperationSupported(operation: OnchainExecutionDirective['operation']): void {
    switch (operation) {
      case 'onchain.transfer':
      case 'onchain.approval':
      case 'onchain.contract_call':
        return;
      default:
        throw new ValidationError(
          `the EVM family does not declare support for operation '${operation}' — unsupported operations fail closed, never approximated`,
        );
    }
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
      // Live re-computation against the CURRENT head: depth advances with
      // the head; a head below the anchor is a regression (reorg territory).
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
    return evmObserveChainHead(
      this.familyContext(),
      this.#transport,
      (fee) => this.#refreshFee(fee),
      this.#maxHeadAgeSeconds,
      input,
    );
  }

  #refreshFee(fee: EvmFeeSemantics | { readonly expressible: false; readonly reason: string }): void {
    this.refreshSemantics({ family: 'EVM', fee, finality: this.#finalitySemantics });
  }

  async observeAssetPosition(input: {
    readonly accountRef: string;
    readonly assetId: string;
    readonly at: string;
    readonly maxAgeSeconds?: number;
  }): Promise<AssetPositionProbe> {
    return evmObserveAssetPosition(this.familyContext(), this.#transport, this.#assetBindings, input);
  }

  async prepare(input: PrepareStageInput): Promise<PreparedAdapterOperation<EvmExecutionPlan>> {
    return evmPrepare(
      this.familyContext(),
      this.#transport,
      this.#assetBindings,
      this.#evmChainId,
      this.preparePrologue(input),
      input,
    );
  }

  async simulate(input: {
    readonly prepared: PreparedAdapterOperation<EvmExecutionPlan>;
    readonly at: number;
  }): Promise<SimulationObservation> {
    return evmSimulate(this.familyContext(), this.#transport, input);
  }

  protected signerAdapter(): EvmEip712SigningAdapter {
    return this.#signerAdapter;
  }

  async broadcast(input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  }): Promise<BroadcastStageOutcome> {
    this.assertBroadcastable(input);
    return evmBroadcast(this.familyContext(), this.#transport, input);
  }

  async observeOperation(input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  }): Promise<BroadcastStageOutcome> {
    return evmObserveOperation(this.familyContext(), this.#transport, input);
  }
}
