/**
 * @payswap/onchain-security — EIP-712 typed-data signer adapter (EVM):
 * the wire shapes (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-security/src/adapters/eip712.ts).
 *
 * EIP-712 typed-data semantics live HERE and ONLY here (the EVM signing
 * family is isolated behind the "./adapters/*" subpaths — never in core
 * contracts, INV-17 provider-neutrality). This adapter implements the
 * provider-neutral `SignerAdapter` port for the EVM chain family.
 *
 * Deterministic: the typed-data payload is a pure function of the
 * authorized artifact + request. The chain-ref → EVM chain-id mapping is
 * an injected resolver port (the onchain domain kernel / adapter SDK owns
 * the canonical chain registry, P4-W1/P4-W3); the default resolver fails
 * closed on unknown chains.
 */

import type { ChainRef } from "../types.ts";
import { assertNoSecretMaterial } from "../secrets.ts";
import type { OnchainAuthorizationArtifact } from "../authorization.ts";
import type { OnchainAuthorizationRequest } from "../authorization.ts";
import type { SignerAdapter } from "../signers.ts";

/** EIP-712 domain (per the EIP-712 specification). */
export interface Eip712Domain {
  readonly name: string;
  readonly version: string;
  readonly chainId: bigint;
  readonly verifyingContract: string;
}

/** EIP-712 typed-data envelope. */
export interface Eip712TypedData {
  readonly domain: Eip712Domain;
  readonly primaryType: string;
  readonly types: Record<string, readonly { readonly name: string; readonly type: string }[]>;
  readonly message: Record<string, string | number | bigint | boolean>;
}

/**
 * Chain-ref → EVM chain-id resolver port. The canonical registry belongs
 * to the onchain domain kernel (P4-W1) / the multi-chain adapter SDK
 * (P4-W3); the adapter fails closed when no resolver resolves.
 */
export interface EvmChainIdResolver {
  resolve(chain: ChainRef): bigint | undefined;
}

/**
 * The canonical PaySwap onchain-authorization typed-data message. Field
 * names are the stable EIP-712 surface a wallet verifies and a user sees:
 * every pre-authorization dimension is a signed field (INV-5 lineage at
 * the signing surface).
 */
export const ONCHAIN_AUTHORIZATION_PRIMARY_TYPE = "PaySwapOnchainAuthorization" as const;

export const ONCHAIN_AUTHORIZATION_TYPES: Record<
  string,
  readonly { name: string; type: string }[]
> = {
  [ONCHAIN_AUTHORIZATION_PRIMARY_TYPE]: [
    { name: "writeDigest", type: "string" },
    { name: "requestHash", type: "string" },
    { name: "chain", type: "string" },
    { name: "asset", type: "string" },
    { name: "amountCurrency", type: "string" },
    { name: "amountMinorUnits", type: "string" },
    { name: "destination", type: "string" },
    { name: "approvalsDigest", type: "string" },
    { name: "routeHash", type: "string" },
    { name: "protocolId", type: "string" },
    { name: "contractAddress", type: "string" },
    { name: "expectedStateDiffDigest", type: "string" },
    { name: "settlementInstructionId", type: "string" },
    { name: "expiry", type: "string" },
    { name: "networkEpochAtIssuance", type: "string" },
    { name: "delegationId", type: "string" },
  ],
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Raised on malformed EIP-712 adapter input (fail closed). */
export class Eip712AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Eip712AdapterError";
  }
}

/** Default resolver: fails closed for every chain (fail-safe default). */
export const FAIL_CLOSED_CHAIN_ID_RESOLVER: EvmChainIdResolver = {
  resolve: () => undefined,
};

/** Build the EIP-712 domain for one authorization on one chain. */
export function buildEip712Domain(
  chain: ChainRef,
  chainIdResolver: EvmChainIdResolver,
  verifyingContract: string,
): Eip712Domain {
  const chainId = chainIdResolver.resolve(chain);
  if (chainId === undefined) {
    throw new Eip712AdapterError(
      `no EVM chain id is registered for chain '${chain}' (fail closed: the canonical chain registry owns the mapping)`,
    );
  }
  return {
    name: "PaySwap Onchain Authorization",
    version: "1",
    chainId,
    verifyingContract,
  };
}

function approvalsDigestField(artifact: OnchainAuthorizationArtifact): string {
  return artifact.scope.approvals
    .map(
      (approval) =>
        `${approval.asset.assetId}:${approval.owner}:${approval.spender}:${approval.amount.currency}:${approval.amount.minorUnits}:${approval.unlimited ? "U" : "F"}`,
    )
    .join(",");
}

const domainTypes: readonly { name: string; type: string }[] = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

/**
 * The EIP-712 adapter: builds typed data for an authorized onchain write.
 * `verifyingContract` binds the domain to the spending contract when the
 * write targets one (approval spender / protocol contract), else to the
 * asset contract.
 */
export class Eip712SignerAdapter implements SignerAdapter {
  readonly adapterId: string;
  readonly supportedChains: readonly ChainRef[];
  readonly #chainIdResolver: EvmChainIdResolver;

  constructor(input?: {
    readonly adapterId?: string;
    readonly chainIdResolver?: EvmChainIdResolver;
    readonly supportedChains?: readonly ChainRef[];
  }) {
    this.adapterId = input?.adapterId ?? "signer-adapter:eip712";
    this.supportedChains = input?.supportedChains ?? ["ethereum:*"];
    this.#chainIdResolver = input?.chainIdResolver ?? FAIL_CLOSED_CHAIN_ID_RESOLVER;
  }

  buildSigningPayload(input: {
    readonly artifact: OnchainAuthorizationArtifact;
    readonly request: OnchainAuthorizationRequest;
  }): string {
    const write = input.request.write;
    const verifyingContract =
      write.approvals[0]?.spender ??
      write.protocol?.contract.contractAddress ??
      write.contractCall?.target ??
      write.transfer?.asset.assetId ??
      write.chain;
    const domain = buildEip712Domain(write.chain, this.#chainIdResolver, verifyingContract);
    const typedData: Eip712TypedData = {
      domain,
      primaryType: ONCHAIN_AUTHORIZATION_PRIMARY_TYPE,
      types: ONCHAIN_AUTHORIZATION_TYPES,
      message: {
        writeDigest: input.artifact.scope.writeDigest,
        requestHash: input.artifact.requestHash,
        chain: input.artifact.scope.chain,
        asset: `${input.artifact.scope.asset.assetId}/${input.artifact.scope.asset.symbol}`,
        amountCurrency: input.artifact.scope.amount.currency,
        amountMinorUnits: input.artifact.scope.amount.minorUnits,
        destination: input.artifact.scope.destination ?? "-",
        approvalsDigest: approvalsDigestField(input.artifact),
        routeHash: input.artifact.scope.routeHash,
        protocolId: input.artifact.scope.protocol?.protocolId ?? "-",
        contractAddress: input.artifact.scope.protocol?.contract.contractAddress ?? verifyingContract,
        expectedStateDiffDigest: input.artifact.scope.expectedStateDiffDigest,
        settlementInstructionId: input.artifact.scope.settlementInstruction?.instructionId ?? "-",
        expiry: input.artifact.scope.expiry.toString(),
        networkEpochAtIssuance: input.artifact.networkEpochAtIssuance.toString(),
        delegationId: input.artifact.delegationId ?? "-",
      },
    };
    assertNoSecretMaterial(typedData, "eip-712 typed data");
    return JSON.stringify(
      {
        types: { EIP712Domain: domainTypes, ...typedData.types },
        primaryType: typedData.primaryType,
        domain: {
          name: typedData.domain.name,
          version: typedData.domain.version,
          chainId: typedData.domain.chainId.toString(),
          verifyingContract: typedData.domain.verifyingContract,
        },
        message: typedData.message,
      },
      null,
      0,
    );
  }
}
