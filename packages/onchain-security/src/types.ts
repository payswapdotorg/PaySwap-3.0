/**
 * @payswap/onchain-security — provider-neutral identity contracts (R2-W2;
 * PORT+ADAPT of payswap.org@8a735bf packages/onchain-security/src/types.ts).
 *
 * Core contracts must not assume EVM, one wallet, one RPC, one indexer,
 * one DEX or one stablecoin (INV-17: blockchain is ONE settlement rail
 * family, provider-neutral). Every identity below is a structural type:
 *
 * - `ChainRef` / `AssetIdentity` / `ProtocolIdentity` are the STRUCTURAL
 *   alignment surface for the onchain domain kernel (Work Order P4-W1):
 *   intentionally minimal, structurally assignable from the richer domain
 *   contracts; the Tech Lead resolves the package-level integration at
 *   merge. This package defines NO chain adapters (P4-W3) and NO parallel
 *   capability vocabulary (P2-W1).
 *
 * - Money is exact integer minor units via the pinned AmountSpec wire
 *   (INV-2; no floating point ever crosses this boundary).
 *
 * Canonical citations (old → PaySwap 3.0): old INV-SC01 full declaration
 * → INV-20 (sufficient identity/semantics/security/authority); old
 * fake-token exact-match defense → INV-20; INV-E01 lineage → INV-5.
 */

import type { AmountSpec } from "./pins/index.ts";
import type { SmartContractExtension } from "./pins/index.ts";

/**
 * Canonical chain reference, e.g. `ethereum:mainnet`, `solana:mainnet`.
 * Structurally compatible with the onchain domain kernel's
 * ChainDefinition.id.
 */
export type ChainRef = string;

/** Chain reference shape: `network:segment` with non-empty parts. */
export const CHAIN_REF_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*$/;

/** Raised on malformed identity input (fail closed, never guessed). */
export class IdentityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityValidationError";
  }
}

/** Validate a chain reference (deterministic, provider-neutral shape). */
export function validateChainRef(chain: ChainRef): void {
  if (!CHAIN_REF_PATTERN.test(chain)) {
    throw new IdentityValidationError(
      `chain reference '${chain}' must match '<network>:<segment>' (lowercase, hyphenated)`,
    );
  }
}

/**
 * Onchain asset identity: chain-scoped. Two assets with the same symbol
 * on different chains — and two tokens with the same symbol on one chain —
 * are DIFFERENT assets (fake-token defense is exact-match on
 * chain + assetId + symbol; never symbol alone — INV-20).
 *
 * `symbol` follows the AmountSpec currency law (exactly three uppercase
 * A-Z letters). The PRECISE token identity is (chain, assetId); richer
 * onchain symbol metadata belongs to the P4-W1 domain kernel.
 */
export interface AssetIdentity {
  readonly chain: ChainRef;
  /** Canonical on-chain asset id: native instrument ref or token contract address. */
  readonly assetId: string;
  /** 3-letter symbol; the AmountSpec currency for this asset. */
  readonly symbol: string;
}

export function validateAssetIdentity(asset: AssetIdentity): void {
  validateChainRef(asset.chain);
  if (asset.assetId.trim().length === 0 || asset.assetId.length > 128) {
    throw new IdentityValidationError(
      `assetId must be a non-empty canonical id of at most 128 characters, got '${asset.assetId}'`,
    );
  }
  if (!/^[A-Z]{3}$/.test(asset.symbol)) {
    throw new IdentityValidationError(
      `asset symbol '${asset.symbol}' must be exactly three uppercase A-Z letters (the AmountSpec currency law)`,
    );
  }
}

/** Exact asset identity equality (no cross-chain, no symbol-only equality). */
export function sameAsset(a: AssetIdentity, b: AssetIdentity): boolean {
  return a.chain === b.chain && a.assetId === b.assetId && a.symbol === b.symbol;
}

/**
 * Declared protocol / contract identity for a consequential write
 * (INV-20 via the capability lane's full smart-contract declaration —
 * never a parallel vocabulary).
 */
export interface ProtocolIdentity {
  /** Protocol id as certified in the capability graph (e.g. `uniswap:v3`). */
  readonly protocolId: string;
  /** Protocol version (numeric dotted, e.g. `1.2.0`). */
  readonly version: string;
  /** The concrete contract this write targets (the full declaration). */
  readonly contract: SmartContractExtension;
}

export function validateProtocolIdentity(protocol: ProtocolIdentity): void {
  if (protocol.protocolId.trim().length === 0) {
    throw new IdentityValidationError("protocolId must be a non-empty canonical id");
  }
  if (!/^\d+(\.\d+)*$/.test(protocol.version)) {
    throw new IdentityValidationError(
      `protocol version '${protocol.version}' must be numeric dotted (e.g. 1.2.0)`,
    );
  }
  if (protocol.contract.chainRef.trim().length === 0) {
    throw new IdentityValidationError("protocol contract chainRef must be non-empty");
  }
  if (protocol.contract.contractAddress.trim().length === 0) {
    throw new IdentityValidationError("protocol contract address must be non-empty");
  }
}

/**
 * Deterministic protocol identity equality: protocol id, version and the
 * FULL contract declaration (chain + address + source/bytecode hashes +
 * authorities + custody) must ALL match. Any drift is a different
 * protocol surface (address-poisoning / proxy-swap defense; fail closed).
 */
export function sameProtocol(a: ProtocolIdentity, b: ProtocolIdentity): boolean {
  if (a.protocolId !== b.protocolId || a.version !== b.version) {
    return false;
  }
  const left = a.contract;
  const right = b.contract;
  return (
    left.chainRef === right.chainRef &&
    left.contractAddress === right.contractAddress &&
    left.sourceHash === right.sourceHash &&
    left.bytecodeHash === right.bytecodeHash &&
    left.upgradeAuthority.kind === right.upgradeAuthority.kind &&
    left.adminAuthority.kind === right.adminAuthority.kind &&
    left.custody.custodial === right.custody.custodial
  );
}

/**
 * Address canonicalizer port. Core contracts must not assume an address
 * encoding, so identity comparison defaults to EXACT string equality
 * (fail closed) and chain families inject their canonicalizer (e.g. the
 * EVM adapter lowercases hex addresses) at the wiring layer (P4-W3).
 */
export interface AddressCanonicalizer {
  readonly chain: ChainRef;
  canonical(address: string): string;
}

/** Default: exact string equality (provider-neutral, fail closed). */
export const EXACT_ADDRESS: AddressCanonicalizer = {
  chain: "*",
  canonical: (address: string) => address,
};

/** Structural address validity: non-empty, no whitespace, bounded length. */
export function validateAddress(address: string, label: string): void {
  if (address.length === 0 || address.trim() !== address || /\s/.test(address)) {
    throw new IdentityValidationError(
      `${label} '${address}' must be a non-empty canonical address without whitespace`,
    );
  }
  if (address.length > 256) {
    throw new IdentityValidationError(`${label} exceeds 256 characters`);
  }
}

/**
 * Approval (allowance) change requested as part of a consequential write.
 * A zero amount means "revoke the allowance"; `unlimited` marks a
 * max-integer allowance, which policy can forbid outright (INV-20).
 */
export interface ApprovalChangeRequest {
  readonly asset: AssetIdentity;
  /** The account whose allowance changes (the signing account). */
  readonly owner: string;
  /** The contract permitted to spend (e.g. a router). Exact identity. */
  readonly spender: string;
  /** New allowance. Exact integer minor units (INV-2). */
  readonly amount: AmountSpec;
  readonly unlimited: boolean;
}

/**
 * Generic contract interaction (the controlled escape hatch, INV-20):
 * unknown / uncertified targets never execute silently — the deterministic
 * gate blocks or escalates per policy.
 */
export interface ContractCallRequest {
  readonly target: string;
  /** Opaque encoded call data (adapter-owned encoding). */
  readonly calldata: string;
  /** Digest of the calldata, binding recheck to the exact payload. */
  readonly calldataDigest: string;
  /** Native value attached to the call, when any. */
  readonly value?: AmountSpec;
}

/** The declared deployable-artifact kinds (neutral vocabulary — never guessed). */
export type DeploymentArtifactKind = "WASM" | "BYTECODE" | "PROVIDER_DEFINED";

/**
 * Contract deployment leg (P22-A, ADR-0016 D4): deploying a smart-contract
 * artifact is a CONSEQUENTIAL write — the leg carries the deploying account
 * and the digest-bound artifact identity (the wasm/bytecode hash + the
 * declared artifact kind). Like the contract-call escape hatch, a deployment
 * never executes silently: the effect of what the deployment produced is
 * declared by the REAL deployment record (tx hash, contract id, source
 * hash, bytecode hash), never defaulted (INV-20's discipline extended).
 */
export interface ContractDeploymentRequest {
  /** The account that signs and submits the deployment (the signer). */
  readonly deployer: string;
  /** Content hash of the deployable artifact (the wasm/bytecode hash). */
  readonly artifactHash: string;
  /** The declared artifact kind (explicit — WASM, BYTECODE or PROVIDER_DEFINED). */
  readonly artifactKind: DeploymentArtifactKind;
}

/**
 * Validates a deployment leg (fail closed): the deployer is an
 * address-shaped reference, the artifact hash is a non-empty digest string
 * and the artifact kind is one of the declared kinds — an unknown
 * deployment never prepares.
 */
export function validateDeploymentRequest(deployment: ContractDeploymentRequest): void {
  if (typeof deployment.deployer !== "string" || deployment.deployer.length === 0) {
    throw new IdentityValidationError(
      "deployment.deployer must be a non-empty account reference (the deploying signer)",
    );
  }
  validateAddress(deployment.deployer, "deployment.deployer");
  if (typeof deployment.artifactHash !== "string" || deployment.artifactHash.length === 0) {
    throw new IdentityValidationError(
      "deployment.artifactHash must be a non-empty digest string (the deployable artifact is digest-bound — ADR-0016 D4)",
    );
  }
  if (
    deployment.artifactKind !== "WASM" &&
    deployment.artifactKind !== "BYTECODE" &&
    deployment.artifactKind !== "PROVIDER_DEFINED"
  ) {
    throw new IdentityValidationError(
      `deployment.artifactKind '${String(deployment.artifactKind)}' must be WASM, BYTECODE or PROVIDER_DEFINED (never guessed)`,
    );
  }
}

/** Binding of a write to the settlement instruction it executes (INV-5). */
export interface SettlementInstructionBinding {
  readonly instructionId: string;
  /** Deterministic digest of the full instruction content (see digest.ts). */
  readonly instructionDigest: string;
}
