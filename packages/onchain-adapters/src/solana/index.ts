/**
 * @payswap/onchain-adapters — the Solana family adapter (Work Order P4-W3,
 * lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/solana/index.ts adapter class, decomposed
 * into per-stage modules to honor the <=400-line file law:
 * stages-observe.ts, stages-submit.ts).
 *
 * The class wires the injected JSON-RPC transport contract and the injected
 * onchain-security kernel port to the frozen nine-stage lifecycle. The
 * signing envelope (plan.ts) carries the authorization binding; the real
 * transaction is composed and signed at the trusted surface — this package
 * never signs.
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
import type { SolanaFinalitySemantics } from '../semantics.ts';
import type { RpcTransport } from '../transport.ts';
import { SolanaSigningEnvelopeAdapter } from './plan.ts';
import type { SolanaAdapterDeclaration, SolanaExecutionPlan } from './plan.ts';
import {
  solanaObserveAssetPosition,
  solanaObserveChainHead,
  solanaPrepare,
  solanaSimulate,
} from './stages-observe.ts';
import { solanaBroadcast, solanaObserveOperation } from './stages-submit.ts';

export type { SolanaAdapterDeclaration, SolanaExecutionPlan };
export { SolanaSigningEnvelopeAdapter };
export {
  SOLANA_GENESIS_HASHES,
  SOLANA_MAINNET_PUBLIC_ENDPOINTS,
  SOLANA_DEVNET_PUBLIC_ENDPOINTS,
} from './identities.ts';
export { base58Decode, base58Encode, base64Encode } from './base58.ts';

/**
 * The Solana family adapter: native SOL transfers (exact integer lamports).
 * Token (SPL) position observation and token transfers are NOT declared in
 * this wave — an undeclared semantic fails closed rather than approximating
 * token accounts.
 */
export class SolanaChainAdapter extends BaseChainFamilyAdapter<
  'PRODUCTION' | 'TESTNET',
  SolanaExecutionPlan
> {
  readonly #transport: RpcTransport;
  readonly #symbol: string;
  readonly #assetId: string;
  readonly #maxHeadAgeSeconds: number;
  readonly #commitment: 'confirmed' | 'finalized';
  readonly #finalitySemantics: SolanaFinalitySemantics;
  #signerEnvelope: SolanaSigningEnvelopeAdapter;

  constructor(declaration: SolanaAdapterDeclaration) {
    super({
      adapterId: declaration.adapterId,
      chainKey: declaration.chainKey,
      family: 'SOLANA',
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
        family: 'SOLANA',
        fee: {
          expressible: false,
          reason:
            'fee parameters not yet observed — derived at prepare via getFeeForMessage on a minimal 1-signature message',
        },
        finality: {
          family: 'SOLANA',
          finalityModel: 'PROBABILISTIC',
          slotConfirmationTarget: declaration.slotConfirmationTarget,
          finalizedCommitment: declaration.finalizedCommitment ?? 'finalized',
          forkDetection: 'SIGNATURE_STATUS_OBSERVATION',
        },
      },
      kernel: declaration.kernel,
    });
    this.#transport = declaration.transport;
    this.#symbol = declaration.nativeAssetSymbol ?? 'SOL';
    this.#assetId = `${this.chainKey}/asset:${this.#symbol}`;
    this.#maxHeadAgeSeconds = declaration.maxHeadAgeSeconds ?? 30;
    this.#commitment = declaration.finalizedCommitment ?? 'finalized';
    this.#finalitySemantics = {
      family: 'SOLANA',
      finalityModel: 'PROBABILISTIC',
      slotConfirmationTarget: declaration.slotConfirmationTarget,
      finalizedCommitment: declaration.finalizedCommitment ?? 'finalized',
      forkDetection: 'SIGNATURE_STATUS_OBSERVATION',
    };
    this.#signerEnvelope = new SolanaSigningEnvelopeAdapter({
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
        `assetId '${assetId}' is not the declared native SOL binding '${this.#assetId}' on '${this.chainKey}' — SPL token semantics are not declared in this wave and fail closed (never approximated)`,
      );
    }
    return { symbol: this.#symbol, nativeAssetRef: 'native:lamports' };
  }

  protected assertOperationSupported(operation: OnchainExecutionDirective['operation']): void {
    if (operation === 'onchain.transfer') {
      return;
    }
    throw new ValidationError(
      `the Solana family does not declare support for operation '${operation}' in this wave — unsupported operations fail closed, never approximated`,
    );
  }

  protected transportProviderNames(): readonly string[] {
    return [...new Set(this.#transport.endpoints().map((endpoint) => endpoint.providerName))];
  }

  protected confirmationDepth(
    observation: OnchainExecutionObservation,
    _head: ChainHeadObservation,
  ): number {
    return observation.finalityCandidate?.confirmationDepth ?? 0;
  }

  // ------------------------------------------------------------------
  // the nine lifecycle stages (family modules through the stage context)
  // ------------------------------------------------------------------

  async observeChainHead(input: {
    readonly at: string;
    readonly maxAgeSeconds?: number;
  }): Promise<ChainHeadProbe> {
    return solanaObserveChainHead(
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
    return solanaObserveAssetPosition(this.familyContext(), this.#transport, this.#assetId, input);
  }

  async prepare(input: PrepareStageInput): Promise<PreparedAdapterOperation<SolanaExecutionPlan>> {
    const prologue = this.preparePrologue(input);
    const prepared = await solanaPrepare(
      this.familyContext(),
      this.#transport,
      this.#commitment,
      prologue,
      input,
    );
    this.refreshSemantics({
      family: 'SOLANA',
      fee: prepared.familyPlan.fee,
      finality: this.#finalitySemantics,
    });
    return this.freezePrepared({
      ...prepared,
      familyPlan: {
        ...prepared.familyPlan,
        fee: this.semantics.fee as SolanaExecutionPlan['fee'],
      },
    });
  }

  async simulate(input: {
    readonly prepared: PreparedAdapterOperation<SolanaExecutionPlan>;
    readonly at: number;
  }): Promise<SimulationObservation> {
    return solanaSimulate(this.familyContext(), this.#transport, input);
  }

  protected signerAdapter(): SolanaSigningEnvelopeAdapter {
    return this.#signerEnvelope;
  }

  async broadcast(input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  }): Promise<BroadcastStageOutcome> {
    this.assertBroadcastable(input);
    return solanaBroadcast(this.familyContext(), this.#transport, input);
  }

  async observeOperation(input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  }): Promise<BroadcastStageOutcome> {
    return solanaObserveOperation(this.familyContext(), this.#transport, input);
  }
}
