/**
 * @payswap/onchain-adapters — the Solana family plan + signing envelope
 * (Work Order P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/solana/index.ts plan + envelope half).
 */

import type { SolanaFeeSemantics, SolanaSemanticsProfile } from '../semantics.ts';
import type { SignerAdapter } from '../pins/onchain-security/signing.ts';
import type {
  OnchainAuthorizationArtifact,
  OnchainAuthorizationRequest,
} from '../pins/onchain-security/signing.ts';
import type { RpcTransport } from '../transport.ts';
import type { OnchainSecurityKernelPort } from '../pins/onchain-security/kernel-port.ts';

/** The Solana family execution plan (adapter-owned, opaque to the core). */
export interface SolanaExecutionPlan {
  readonly family: 'SOLANA';
  /** Genesis hash observed at prepare (cross-checked against the registry). */
  readonly observedGenesisHash: string;
  /** Recent blockhash for transaction composition (from getLatestBlockhash). */
  readonly recentBlockhash: string;
  /** The height after which a transaction using the blockhash expires. */
  readonly lastValidBlockHeight: number;
  readonly fee: SolanaFeeSemantics | { readonly expressible: false; readonly reason: string };
  /** The commitment level observations target. */
  readonly commitment: 'confirmed' | 'finalized';
}

/** Solana adapter construction declaration. */
export interface SolanaAdapterDeclaration {
  readonly adapterId: string;
  /** E.g. `solana:mainnet-beta` — environment is DERIVED (structural). */
  readonly chainKey: string;
  /** The injected JSON-RPC transport contract (zero I/O in this package). */
  readonly transport: RpcTransport;
  /** The injected onchain-security kernel port. */
  readonly kernel: OnchainSecurityKernelPort;
  /** Declared SOL asset binding symbol (default SOL). */
  readonly nativeAssetSymbol?: string;
  /** Declared slot-confirmation guidance (e.g. 32). */
  readonly slotConfirmationTarget: number;
  /** Declared finality-candidate commitment gate. */
  readonly finalizedCommitment?: 'finalized' | 'confirmed';
  /** Head freshness window (seconds; default 30). */
  readonly maxHeadAgeSeconds?: number;
}

/**
 * The Solana SignerAdapter port implementation: builds the AUTHORIZATION
 * signing envelope (a deterministic JSON binding of the kernel artifact).
 * The actual Solana transaction is composed and signed at the trusted
 * surface (which owns the signer) — this package never signs and never
 * sees key material.
 */
export class SolanaSigningEnvelopeAdapter implements SignerAdapter {
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
      kind: 'payswap.solana.signing-envelope',
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

/** Convenience: the finality semantics view of a Solana profile. */
export type SolanaFinalitySemanticsView = SolanaSemanticsProfile['finality'];
