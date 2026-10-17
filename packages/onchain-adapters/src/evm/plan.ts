/**
 * @payswap/onchain-adapters — the EVM family plan, asset bindings and the
 * EIP-712 signing adapter (Work Order P4-W3, lane R2-W3; PORT of
 * payswap.org@8a735bf packages/onchain-adapters/src/evm/index.ts plan +
 * the old onchain-security/adapters/eip712.ts typed-data builder —
 * EIP-712 semantics live with the EVM family, never in core contracts).
 *
 * The EIP-712 payload builder is PURE and deterministic: a typed-data JSON
 * binding of the kernel artifact. The TRUSTED SURFACE signs (it owns the
 * signer); this package never signs and never sees key material.
 */

import { assertNoSecretMaterial } from '../secrets.ts';
import type { EvmFeeSemantics, EvmSemanticsProfile } from '../semantics.ts';
import type {
  OnchainAuthorizationArtifact,
  OnchainAuthorizationRequest,
  SignerAdapter,
} from '../pins/onchain-security/signing.ts';
import type { RpcTransport } from '../transport.ts';

// ---------------------------------------------------------------------------
// Asset bindings (declared catalogue → family-native identity)
// ---------------------------------------------------------------------------

/** An EVM asset binding: neutral assetId → native identity + symbol. */
export interface EvmAssetBinding {
  /** Canonical neutral asset identity, e.g. `ethereum:mainnet/asset:ETH`. */
  readonly assetId: string;
  /** Protocol currency symbol (the money-law currency of the write). */
  readonly symbol: string;
  readonly kind: 'NATIVE' | 'ERC20';
  /** ERC20 token contract address (lowercase hex; required for ERC20). */
  readonly contractAddress?: string;
}

/** Canonical Ether binding for any EVM chainKey. */
export function nativeEtherBinding(chainKey: string): EvmAssetBinding {
  return { assetId: `${chainKey}/asset:ETH`, symbol: 'ETH', kind: 'NATIVE' };
}

// ---------------------------------------------------------------------------
// The EVM family execution plan (prepare output)
// ---------------------------------------------------------------------------

/** The EVM family execution plan (adapter-owned, opaque to the core). */
export interface EvmExecutionPlan {
  readonly family: 'EVM';
  /** Chain id OBSERVED via eth_chainId at prepare time (cross-checked). */
  readonly observedChainId: string;
  /** Nonce observed via eth_getTransactionCount ('pending'). */
  readonly nonce: string;
  /** Recipient (account or contract). */
  readonly to: string;
  /** Exact value in wei, 0x-prefixed hex. */
  readonly value: string;
  /** Calldata (0x for plain native transfers). */
  readonly data: string;
  readonly fee: EvmFeeSemantics | { readonly expressible: false; readonly reason: string };
  /** The chain head the plan was prepared against. */
  readonly headAtPrepare: { readonly height: number; readonly headHash: string };
}

/** EVM adapter construction declaration. */
export interface EvmAdapterDeclaration {
  readonly adapterId: string;
  /** E.g. `ethereum:mainnet` — environment is DERIVED from it (structural). */
  readonly chainKey: string;
  /** Declared EVM chain id (decimal string) — cross-checked at every prepare. */
  readonly evmChainId: string;
  /** The injected JSON-RPC transport contract (zero I/O in this package). */
  readonly transport: RpcTransport;
  /** The injected onchain-security kernel port. */
  readonly kernel: import('../pins/onchain-security/kernel-port.ts').OnchainSecurityKernelPort;
  /** Declared asset bindings (the family-native identity resolution). */
  readonly assetBindings: readonly EvmAssetBinding[];
  /** Declared confirmation-depth guidance (e.g. 12 for mainnet). */
  readonly confirmationDepthTarget: number;
  /** Head freshness window (seconds; default 90 = ~7 mainnet blocks). */
  readonly maxHeadAgeSeconds?: number;
}

// ---------------------------------------------------------------------------
// EIP-712 typed-data signing (family-owned; the trusted surface signs)
// ---------------------------------------------------------------------------

/** Chain-ref → EVM chain-id resolver port (fails closed on unknown chains). */
export interface EvmChainIdResolver {
  resolve(chain: string): bigint | undefined;
}

/**
 * The canonical PaySwap onchain-authorization typed-data primary type.
 * Field names are the stable EIP-712 surface a wallet verifies and a user
 * sees: every pre-authorization dimension is a signed field.
 */
export const ONCHAIN_AUTHORIZATION_PRIMARY_TYPE = 'PaySwapOnchainAuthorization' as const;

export const ONCHAIN_AUTHORIZATION_TYPES: Record<
  string,
  readonly { readonly name: string; readonly type: string }[]
> = {
  [ONCHAIN_AUTHORIZATION_PRIMARY_TYPE]: [
    { name: 'writeDigest', type: 'string' },
    { name: 'requestHash', type: 'string' },
    { name: 'chain', type: 'string' },
    { name: 'asset', type: 'string' },
    { name: 'amountCurrency', type: 'string' },
    { name: 'amountMinorUnits', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'approvalsDigest', type: 'string' },
    { name: 'routeHash', type: 'string' },
    { name: 'protocolId', type: 'string' },
    { name: 'contractAddress', type: 'string' },
    { name: 'expectedStateDiffDigest', type: 'string' },
    { name: 'settlementInstructionId', type: 'string' },
    { name: 'expiry', type: 'string' },
    { name: 'networkEpochAtIssuance', type: 'string' },
    { name: 'delegationId', type: 'string' },
  ],
};

const DOMAIN_TYPES: readonly { name: string; type: string }[] = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

/**
 * The EVM family SignerAdapter: builds the EIP-712 typed-data payload from
 * the kernel artifact (pure; the injected chain-id resolver maps the chain
 * ref to its EVM chain id — the registry is the domain kernel's).
 */
export class EvmEip712SigningAdapter implements SignerAdapter {
  readonly adapterId: string;
  readonly supportedChains: readonly string[];
  readonly #chainIdResolver: EvmChainIdResolver;

  constructor(input?: {
    readonly adapterId?: string;
    readonly chainIdResolver?: EvmChainIdResolver;
    readonly supportedChains?: readonly string[];
  }) {
    this.adapterId = input?.adapterId ?? 'signer-adapter:eip712';
    this.supportedChains = input?.supportedChains ?? ['ethereum:*'];
    this.#chainIdResolver = input?.chainIdResolver ?? { resolve: () => undefined };
  }

  buildSigningPayload(input: {
    readonly artifact: OnchainAuthorizationArtifact;
    readonly request: OnchainAuthorizationRequest;
  }): string {
    const write = input.request.write;
    const verifyingContract =
      write.approvals[0]?.spender ??
      write.contractCall?.target ??
      write.transfer?.asset.assetId ??
      write.chain;
    const chainId = this.#chainIdResolver.resolve(write.chain);
    if (chainId === undefined) {
      throw new Error(
        `no EVM chain id is registered for chain '${write.chain}' (fail closed: the canonical chain registry owns the mapping)`,
      );
    }
    const approvalsDigest = input.artifact.scope.approvals
      .map(
        (approval) =>
          `${approval.asset.assetId}:${approval.owner}:${approval.spender}:${approval.amount.currency}:${approval.amount.minorUnits}:${approval.unlimited ? 'U' : 'F'}`,
      )
      .join(',');
    const typedData = {
      types: { EIP712Domain: DOMAIN_TYPES, ...ONCHAIN_AUTHORIZATION_TYPES },
      primaryType: ONCHAIN_AUTHORIZATION_PRIMARY_TYPE,
      domain: {
        name: 'PaySwap Onchain Authorization',
        version: '1',
        chainId: chainId.toString(),
        verifyingContract,
      },
      message: {
        writeDigest: input.artifact.scope.writeDigest,
        requestHash: input.artifact.requestHash,
        chain: input.artifact.scope.chain,
        asset: `${input.artifact.scope.asset.assetId}/${input.artifact.scope.asset.symbol}`,
        amountCurrency: input.artifact.scope.amount.currency,
        amountMinorUnits: input.artifact.scope.amount.minorUnits,
        destination: input.artifact.scope.destination ?? '-',
        approvalsDigest,
        routeHash: input.artifact.scope.routeHash,
        protocolId: input.artifact.scope.protocolId ?? '-',
        contractAddress: input.artifact.scope.contractAddress ?? verifyingContract,
        expectedStateDiffDigest: input.artifact.scope.expectedStateDiffDigest,
        settlementInstructionId:
          input.artifact.scope.settlementInstruction?.instructionId ?? '-',
        expiry: input.artifact.scope.expiry.toString(),
        networkEpochAtIssuance: input.artifact.networkEpochAtIssuance.toString(),
        delegationId: input.artifact.delegationId ?? '-',
      },
    };
    assertNoSecretMaterial(typedData, 'eip-712 typed data');
    return JSON.stringify(typedData);
  }
}

/** Convenience: the finality semantics view of an EVM profile. */
export type EvmFinalitySemanticsView = EvmSemanticsProfile['finality'];
