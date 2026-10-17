/**
 * @payswap/onchain-adapters — the UTXO family plan + signing envelope
 * (Work Order P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/utxo/index.ts plan + envelope half).
 */

import type { UtxoFeeSemantics, UtxoSemanticsProfile } from '../semantics.ts';
import type { SignerAdapter } from '../pins/onchain-security/signing.ts';
import type {
  OnchainAuthorizationArtifact,
  OnchainAuthorizationRequest,
} from '../pins/onchain-security/signing.ts';
import type { RestTransport } from '../transport.ts';
import type { OnchainSecurityKernelPort } from '../pins/onchain-security/kernel-port.ts';

/** The UTXO family execution plan (adapter-owned, opaque to the core). */
export interface UtxoExecutionPlan {
  readonly family: 'UTXO';
  /** Genesis hash observed at prepare (cross-checked against the registry). */
  readonly observedGenesisHash: string;
  /** Destination address (the directive destination). */
  readonly destination: string;
  /** Exact amount in satoshi (integer decimal string). */
  readonly amountSat: string;
  readonly fee: UtxoFeeSemantics | { readonly expressible: false; readonly reason: string };
  /** The tip the plan was prepared against. */
  readonly tipAtPrepare: { readonly height: number; readonly headHash: string };
}

/** UTXO adapter construction declaration. */
export interface UtxoAdapterDeclaration {
  readonly adapterId: string;
  /** E.g. `bitcoin:mainnet` — environment is DERIVED (structural). */
  readonly chainKey: string;
  /** The injected REST/explorer transport contract (zero I/O in this package). */
  readonly transport: RestTransport;
  /** The injected onchain-security kernel port. */
  readonly kernel: OnchainSecurityKernelPort;
  /** Declared BTC asset binding symbol (default BTC). */
  readonly nativeAssetSymbol?: string;
  /** Declared confirmation-depth guidance (e.g. 6). */
  readonly confirmationDepthTarget: number;
  /** Declared fee-estimate confirmation-target bucket (e.g. 6 blocks). */
  readonly feeEstimateTargetBlocks?: number;
  /** Head freshness window (seconds; default 600 = ~100 minutes). */
  readonly maxHeadAgeSeconds?: number;
}

/**
 * The UTXO SignerAdapter port implementation: builds the AUTHORIZATION
 * signing envelope (deterministic JSON binding of the kernel artifact). The
 * PSBT composition, input selection and signing belong to the trusted
 * surface (which owns the signer) — this package never signs.
 */
export class UtxoSigningEnvelopeAdapter implements SignerAdapter {
  readonly adapterId: string;
  readonly supportedChains: readonly string[];

  constructor(input: { readonly adapterId: string; readonly chainKey: string }) {
    this.adapterId = input.adapterId;
    this.supportedChains = Object.freeze([input.chainKey]);
  }

  buildSigningPayload(input: {
    readonly artifact: OnchainAuthorizationArtifact;
    readonly request: OnchainAuthorizationRequest;
  }): string {
    const write = input.request.write;
    const envelope = {
      kind: 'payswap.utxo.signing-envelope',
      version: 1,
      authorizationRef: input.artifact.requestHash,
      writeDigest: input.artifact.scope.writeDigest,
      chain: write.chain,
      action: write.action,
      expiry: write.expiry,
      ...(write.transfer !== undefined
        ? {
            destination: write.transfer.to,
            assetId: write.transfer.asset.assetId,
            amountMinorUnits: write.transfer.amount.minorUnits,
          }
        : {}),
    };
    return JSON.stringify(envelope);
  }
}

/** Convenience: the finality semantics view of a UTXO profile. */
export type UtxoFinalitySemanticsView = UtxoSemanticsProfile['finality'];
