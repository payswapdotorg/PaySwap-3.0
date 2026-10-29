/**
 * STRUCTURAL PIN — the onchain-security kernel write request (Work Order
 * P4-W3, lane R2-W3; local structural mirror of payswap.org@8a735bf
 * packages/onchain-security/src/write-intent.ts, reduced to the members the
 * adapter contract constructs and the kernel port consumes).
 *
 * The canonical @payswap/onchain-security package (P4-W2, in flight) owns
 * the real contract; this pin is structurally identical (same field names,
 * same literals) so the TL wiring is a type-level assertion, not a port.
 * This is an AGENT-FACING contract: it must never carry secret-shaped
 * material (asserted at prepare time — rule 25).
 */

import { ValidationError } from '../../errors.ts';

/** A chain reference (the chain key string; opaque at this layer). */
export type ChainRef = string;

/** Exact money: a 3+-letter currency and an exact integer minor-units string. */
export interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

/** The asset identity a write moves or approves. */
export interface AssetIdentity {
  readonly chain: ChainRef;
  readonly assetId: string;
  readonly symbol: string;
}

/** A transfer leg: exact asset, exact amount, from and to accounts. */
export interface OnchainTransferLeg {
  readonly asset: AssetIdentity;
  readonly amount: AmountSpec;
  readonly from: string;
  readonly to: string;
}

/** An approval change: owner grants spender an allowance over an asset. */
export interface ApprovalChangeRequest {
  readonly asset: AssetIdentity;
  readonly owner: string;
  readonly spender: string;
  readonly amount: AmountSpec;
  readonly unlimited: boolean;
}

/** A controlled contract-call leg (target + calldata, digest-bound). */
export interface ContractCallRequest {
  readonly target: string;
  readonly calldata: string;
  readonly calldataDigest: string;
  readonly value?: AmountSpec;
}

/** The declared deployable-artifact kinds (neutral vocabulary — never guessed). */
export type DeploymentArtifactKind = 'WASM' | 'BYTECODE' | 'PROVIDER_DEFINED';

/**
 * A controlled contract-DEPLOYMENT leg (P22-A, ADR-0016 D4): the deploying
 * account + the digest-bound artifact identity. A deployment is a
 * consequential write; what it produced is declared by the REAL deployment
 * record ({ txHash, contractId, sourceHash, bytecodeHash } — see
 * ../onchain-domain/deployment.ts), never fabricated.
 */
export interface ContractDeploymentRequest {
  /** The account that signs and submits the deployment (the signer). */
  readonly deployer: string;
  /** Content hash of the deployable artifact (the wasm/bytecode hash). */
  readonly artifactHash: string;
  /** The declared artifact kind (explicit — WASM, BYTECODE or PROVIDER_DEFINED). */
  readonly artifactKind: DeploymentArtifactKind;
}

/** The route a prepared write executes (hash-bound). */
export interface RouteRef {
  readonly routeId: string;
  readonly routeHash: string;
}

/** The settlement instruction this write executes (evidence lineage). */
export interface SettlementInstructionBinding {
  readonly instructionId: string;
  readonly instructionDigest: string;
}

/**
 * The request to prepare one consequential onchain write. AGENT-FACING: it
 * must never carry secret-shaped material (asserted at prepare time).
 */
export interface OnchainWriteRequest {
  readonly writeId: string;
  /** Trust action vocabulary, e.g. `onchain.transfer`. No wildcards. */
  readonly action: string;
  readonly chain: ChainRef;
  readonly transfer?: OnchainTransferLeg;
  readonly approvals: readonly ApprovalChangeRequest[];
  readonly contractCall?: ContractCallRequest;
  /** Contract-deployment leg (P22-A, ADR-0016 D4 — the deploy path). */
  readonly deployment?: ContractDeploymentRequest;
  readonly route: RouteRef;
  /** Absolute expiry (ms). An expired write is BLOCKED at the gates. */
  readonly expiry: number;
  /** Sequence/nonce marker for chains that use one, when known. */
  readonly nonce?: string;
  /** The settlement instruction this write executes (evidence lineage). */
  readonly settlementInstruction?: SettlementInstructionBinding;
  /** Principal ref of the requesting agent (not authority). */
  readonly requestedBy: string;
}

const EXACT_DECIMAL = /^(0|[1-9][0-9]*)$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateAmountSpec(amount: unknown, label: string): void {
  const record = amount as Readonly<Record<string, unknown>> | null;
  if (
    record === null ||
    typeof record !== 'object' ||
    !isNonEmptyString(record.currency) ||
    typeof record.minorUnits !== 'string' ||
    !EXACT_DECIMAL.test(record.minorUnits)
  ) {
    throw new ValidationError(
      `${label} must carry a non-empty currency and an exact integer minorUnits string (no floating-point money)`,
    );
  }
}

function validateAssetIdentity(asset: unknown, label: string): void {
  const record = asset as Readonly<Record<string, unknown>> | null;
  if (
    record === null ||
    typeof record !== 'object' ||
    !isNonEmptyString(record.chain) ||
    !isNonEmptyString(record.assetId) ||
    !isNonEmptyString(record.symbol)
  ) {
    throw new ValidationError(
      `${label} must carry a chain, an assetId and a symbol (the asset identity is explicit, never guessed)`,
    );
  }
}

/**
 * Structural validation of a write request (fail closed): identities,
 * exact amounts, one-chain consistency and the mandatory route/expiry.
 */
export function validateOnchainWriteRequest(request: OnchainWriteRequest): void {
  if (request === null || typeof request !== 'object') {
    throw new ValidationError('write request must be an object');
  }
  if (!isNonEmptyString(request.writeId)) {
    throw new ValidationError('writeId must be a non-empty string');
  }
  if (!isNonEmptyString(request.action)) {
    throw new ValidationError('action must be a non-empty trust action (no wildcards)');
  }
  if (!isNonEmptyString(request.chain)) {
    throw new ValidationError('chain must be a non-empty chain reference');
  }
  if (!isNonEmptyString(request.requestedBy)) {
    throw new ValidationError('requestedBy must be a non-empty principal ref');
  }
  if (
    request.transfer === undefined &&
    request.approvals.length === 0 &&
    request.contractCall === undefined &&
    request.deployment === undefined
  ) {
    throw new ValidationError(
      'a write request must carry at least one effect leg (transfer, approval, contract call or contract deployment) — an empty write never validates',
    );
  }
  if (request.transfer !== undefined) {
    validateAssetIdentity(request.transfer.asset, 'transfer.asset');
    if (request.transfer.asset.chain !== request.chain) {
      throw new ValidationError(
        `transfer asset chain '${request.transfer.asset.chain}' differs from write chain '${request.chain}': one write targets exactly one chain`,
      );
    }
    if (typeof request.transfer.from !== 'string' || request.transfer.from.length === 0) {
      throw new ValidationError('transfer.from must be a non-empty account reference');
    }
    if (typeof request.transfer.to !== 'string' || request.transfer.to.length === 0) {
      throw new ValidationError('transfer.to must be a non-empty account reference');
    }
    validateAmountSpec(request.transfer.amount, 'transfer.amount');
    if (request.transfer.amount.currency !== request.transfer.asset.symbol) {
      throw new ValidationError(
        `transfer amount currency '${request.transfer.amount.currency}' does not match asset symbol '${request.transfer.asset.symbol}'`,
      );
    }
  }
  for (const approval of request.approvals) {
    validateAssetIdentity(approval.asset, 'approval.asset');
    if (approval.asset.chain !== request.chain) {
      throw new ValidationError(
        `approval asset chain '${approval.asset.chain}' differs from write chain '${request.chain}': one write targets exactly one chain`,
      );
    }
    if (typeof approval.owner !== 'string' || approval.owner.length === 0) {
      throw new ValidationError('approval.owner must be a non-empty account reference');
    }
    if (typeof approval.spender !== 'string' || approval.spender.length === 0) {
      throw new ValidationError('approval.spender must be a non-empty account reference');
    }
    validateAmountSpec(approval.amount, 'approval.amount');
    if (approval.amount.currency !== approval.asset.symbol) {
      throw new ValidationError(
        `approval amount currency '${approval.amount.currency}' does not match asset symbol '${approval.asset.symbol}'`,
      );
    }
    if (approval.unlimited && approval.amount.minorUnits !== '0') {
      throw new ValidationError(
        'an unlimited approval must carry amount 0 (the explicit allowance is unbounded)',
      );
    }
  }
  if (request.contractCall !== undefined) {
    const call = request.contractCall;
    if (
      !isNonEmptyString(call.target) ||
      !isNonEmptyString(call.calldata) ||
      !isNonEmptyString(call.calldataDigest)
    ) {
      throw new ValidationError(
        'a contract call requires target + calldata + calldataDigest — unknown contract writes never execute silently',
      );
    }
    if (call.value !== undefined) {
      validateAmountSpec(call.value, 'contractCall.value');
    }
  }
  if (request.deployment !== undefined) {
    const deployment = request.deployment;
    if (
      !isNonEmptyString(deployment.deployer) ||
      /\s/.test(deployment.deployer)
    ) {
      throw new ValidationError(
        'deployment.deployer must be a non-empty whitespace-free account reference',
      );
    }
    if (!isNonEmptyString(deployment.artifactHash)) {
      throw new ValidationError(
        'deployment.artifactHash must be a non-empty digest string (the deployable artifact is digest-bound — ADR-0016 D4)',
      );
    }
    if (
      deployment.artifactKind !== 'WASM' &&
      deployment.artifactKind !== 'BYTECODE' &&
      deployment.artifactKind !== 'PROVIDER_DEFINED'
    ) {
      throw new ValidationError(
        "deployment.artifactKind must be 'WASM', 'BYTECODE' or 'PROVIDER_DEFINED' (never guessed)",
      );
    }
  }
  if (
    request.route === null ||
    typeof request.route !== 'object' ||
    !isNonEmptyString(request.route.routeId) ||
    !isNonEmptyString(request.route.routeHash)
  ) {
    throw new ValidationError('route must carry a routeId and a routeHash');
  }
  if (typeof request.expiry !== 'number' || !Number.isInteger(request.expiry)) {
    throw new ValidationError('expiry must be an integer absolute instant (ms)');
  }
  if (request.nonce !== undefined && !isNonEmptyString(request.nonce)) {
    throw new ValidationError('nonce, when present, must be a non-empty string');
  }
  if (request.settlementInstruction !== undefined) {
    const binding = request.settlementInstruction;
    if (!isNonEmptyString(binding.instructionId) || !isNonEmptyString(binding.instructionDigest)) {
      throw new ValidationError(
        'settlementInstruction, when present, must carry an instructionId and an instructionDigest',
      );
    }
  }
}
