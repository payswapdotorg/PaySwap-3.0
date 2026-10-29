/**
 * @payswap/onchain-adapters — the Stellar family plan + signing envelope
 * (P22-A, lane 3-a; ADR-0016 D2/D3/D4).
 *
 * The family execution plan is ADAPTER-OWNED and opaque to the core: a
 * transfer plan (exact stroops, destination `G…`, issuer-scoped asset) or
 * a contract-DEPLOY plan (the wasm artifact hash + the source hash — the
 * deployment evidence record's source/bytecode halves). The signing
 * envelope carries the authorization binding; the real Soroban transaction
 * is composed and signed at the trusted surface — this package never signs
 * and never sees key material.
 */

import type { InexpressibleFeeSemantics, StellarFeeSemantics } from '../semantics.ts';
import type { SignerAdapter } from '../pins/onchain-security/signing.ts';
import type {
  OnchainAuthorizationArtifact,
  OnchainAuthorizationRequest,
} from '../pins/onchain-security/signing.ts';
import type { RestTransport } from '../transport.ts';
import type { OnchainSecurityKernelPort } from '../pins/onchain-security/kernel-port.ts';

/** The shared fee view a Stellar plan carries (observed at prepare). */
export type StellarPlanFee = StellarFeeSemantics | InexpressibleFeeSemantics;

/** A Stellar native-asset or issuer-scoped transfer plan. */
export interface StellarTransferPlan {
  readonly family: 'STELLAR';
  readonly kind: 'transfer';
  /** The observed network passphrase (the chain-identity cross-check). */
  readonly observedNetworkPassphrase: string;
  /** Destination account (`G…` StrKey — validated at prepare). */
  readonly destination: string;
  /** The canonical (possibly issuer-scoped) assetId being moved. */
  readonly assetId: string;
  /** Exact integer amount in stroops (7-decimal minor units — INV-2). */
  readonly amountStroops: string;
  readonly fee: StellarPlanFee;
  /** The ledger head the plan was prepared against. */
  readonly ledgerAtPrepare: { readonly height: number; readonly headHash: string };
}

/** A Soroban contract-deployment plan (ADR-0016 D4). */
export interface StellarDeployPlan {
  readonly family: 'STELLAR';
  readonly kind: 'contract_deploy';
  /** The observed network passphrase (the chain-identity cross-check). */
  readonly observedNetworkPassphrase: string;
  /** The wasm artifact's content hash (the digest-bound artifact identity). */
  readonly wasmHash: string;
  /** The verified source artifact's hash (the deployment record's source half). */
  readonly sourceHash: string;
  readonly fee: StellarPlanFee;
  /** The ledger head the plan was prepared against. */
  readonly ledgerAtPrepare: { readonly height: number; readonly headHash: string };
}

/** The Stellar family execution plan (adapter-owned, opaque to the core). */
export type StellarExecutionPlan = StellarTransferPlan | StellarDeployPlan;

/** An issuer-scoped asset binding the adapter resolves (ADR-0016 D3). */
export interface StellarAssetBinding {
  /** The canonical issuer-scoped assetId: `${chainKey}/asset:${code}:${issuer}`. */
  readonly assetId: string;
  /** The classic asset code (e.g. USDC). */
  readonly code: string;
  /** The issuing account (`G…` StrKey). */
  readonly issuerAccount: string;
}

/** Stellar adapter construction declaration. */
export interface StellarAdapterDeclaration {
  readonly adapterId: string;
  /** E.g. `stellar:testnet` — environment is DERIVED (structural). */
  readonly chainKey: string;
  /** The injected Horizon REST transport contract (zero I/O in this package). */
  readonly transport: RestTransport;
  /** The injected onchain-security kernel port. */
  readonly kernel: OnchainSecurityKernelPort;
  /** Declared native XLM asset symbol (default XLM). */
  readonly nativeAssetSymbol?: string;
  /** Declared issuer-scoped asset bindings (e.g. the corridor's USDC). */
  readonly issuerScopedAssets?: readonly StellarAssetBinding[];
  /** Declared closed-ledger confirmation guidance (default 1 ledger). */
  readonly ledgerConfirmationTarget?: number;
  /** Head freshness window (seconds; default 35 — ~10 ledger closes). */
  readonly maxHeadAgeSeconds?: number;
}

/**
 * The Stellar SignerAdapter port implementation: builds the AUTHORIZATION
 * signing envelope (a deterministic JSON binding of the kernel artifact).
 * The actual Soroban transaction is composed and signed at the trusted
 * surface (which owns the signer) — this package never signs and never
 * sees key material.
 */
export class StellarSigningEnvelopeAdapter implements SignerAdapter {
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
      kind: 'payswap.stellar.signing-envelope',
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
      ...(write.deployment !== undefined
        ? {
            deployer: write.deployment.deployer,
            artifactHash: write.deployment.artifactHash,
            artifactKind: write.deployment.artifactKind,
          }
        : {}),
    };
    return JSON.stringify(envelope);
  }
}
