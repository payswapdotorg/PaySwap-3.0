/**
 * @payswap/onchain-adapters — EVM prepare + simulate stages (Work Order
 * P4-W3, lane R2-W3; extracted from the ported EvmChainAdapter to honor
 * the <=400-line file law).
 *
 * prepare: eth_chainId cross-check (chain-confusion defense) +
 * eth_getTransactionCount (nonce) + EIP-1559 fee derivation from the latest
 * block — a block without baseFee CANNOT express 1559 fee semantics and
 * fails closed (never approximated with a legacy gas price). The family
 * plan encodes the exact transfer/approval/call.
 *
 * simulate: eth_estimateGas → simulation OBSERVATION; transport ambiguity →
 * OUTCOME_UNKNOWN (never FAILED).
 */

import { ValidationError } from '../errors.ts';
import { ChainIdentityMismatchError, SemanticNotExpressibleError } from '../errors.ts';
import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { PreparePrologueResult } from '../lifecycle/prepare-prologue.ts';
import type {
  PreparedAdapterOperation,
  PrepareStageInput,
} from '../contract/stage-io.ts';
import { recordSimulation } from '../pins/onchain-security/signing.ts';
import type { SimulationObservation } from '../pins/onchain-security/signing.ts';
import type { RpcTransport } from '../transport.ts';
import { hexQuantityToDecimal, parseExactDecimal } from '../transport.ts';
import { APPROVE_SELECTOR, EVM_HEX_QUANTITY, TRANSFER_SELECTOR, amountToUint256Hex, padAddress } from './encoding.ts';
import { evmFeeFromBlock } from './observe.ts';
import type { EvmAssetBinding, EvmExecutionPlan } from './plan.ts';

/** The EVM prepare stage (chain-id cross-check, nonce, 1559 fee, plan). */
export async function evmPrepare(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  assetBindings: ReadonlyMap<string, EvmAssetBinding>,
  evmChainId: string,
  prologue: PreparePrologueResult,
  input: PrepareStageInput,
): Promise<PreparedAdapterOperation<EvmExecutionPlan>> {
  // Chain-identity cross-check: the endpoint must serve the declared chain.
  const chainId = await transport.call('eth_chainId', []);
  if (chainId.kind !== 'RPC_OK') {
    throw new ChainIdentityMismatchError(
      `eth_chainId unobservable on '${ctx.chainKey}' — prepare fails closed when chain identity cannot be verified`,
    );
  }
  const observedChainId = hexQuantityToDecimal(chainId.result, 'eth_chainId result');
  if (observedChainId !== evmChainId) {
    throw new ChainIdentityMismatchError(
      `the endpoint serving '${ctx.chainKey}' reports chain id ${observedChainId}, but the adapter is declared for chain id ${evmChainId} — chain confusion fails closed`,
    );
  }
  const instanceExtension = input.instance.familyExtension as
    | { family?: string; evmChainId?: string }
    | undefined;
  if (instanceExtension?.family === 'EVM' && instanceExtension.evmChainId !== observedChainId) {
    throw new ChainIdentityMismatchError(
      `the connected instance observes EVM chain id ${instanceExtension.evmChainId}, but the endpoint reports ${observedChainId} — instance/endpoint chain identity mismatch fails closed`,
    );
  }

  // Nonce observation (drift-checked at the kernel recheck).
  const nonceCall = await transport.call('eth_getTransactionCount', [
    input.signerAccountRef,
    'pending',
  ]);
  if (nonceCall.kind !== 'RPC_OK') {
    throw new ValidationError(
      `eth_getTransactionCount unobservable for '${input.signerAccountRef}' — prepare fails closed (nonce semantics are explicit, never guessed)`,
    );
  }
  const nonce = hexQuantityToDecimal(nonceCall.result, 'transaction count');

  // Fee derivation: the latest block's baseFeePerGas (EIP-1559) or the
  // explicit inexpressible shape (fail closed — no legacy approximation).
  const block = await transport.call('eth_getBlockByNumber', ['latest', false]);
  if (block.kind !== 'RPC_OK' || block.result === null || typeof block.result !== 'object') {
    throw new SemanticNotExpressibleError(
      'the latest EVM block is unobservable — GAS_AUCTION fee semantics cannot be expressed and prepare fails closed (never approximated)',
    );
  }
  const blockRecord = block.result as { hash?: unknown; baseFeePerGas?: unknown };
  if (typeof blockRecord.hash !== 'string') {
    throw new SemanticNotExpressibleError(
      'the latest EVM block carries no hash — prepare fails closed',
    );
  }
  const fee = evmFeeFromBlock(blockRecord);

  // Family plan: encode the exact transfer/approval/call.
  const directive = prologue.directive;
  const binding =
    directive.assetId !== undefined ? assetBindings.get(directive.assetId) : undefined;
  let to: string;
  let value: string;
  let data: string;
  if (directive.operation === 'onchain.transfer') {
    if (binding?.kind === 'ERC20') {
      to = binding.contractAddress as string;
      value = '0x0';
      data =
        TRANSFER_SELECTOR +
        padAddress(directive.destination as string).slice(2) +
        amountToUint256Hex(directive.amount?.minorUnits as string).slice(2);
    } else if (binding?.kind === 'NATIVE') {
      to = directive.destination as string;
      value =
        '0x' +
        BigInt(parseExactDecimal(directive.amount?.minorUnits as string, 'amount')).toString(16);
      data = '0x';
    } else {
      throw new ValidationError(
        `transfer directive assetId '${directive.assetId}' has no EVM binding — the family plan is never guessed`,
      );
    }
  } else if (directive.operation === 'onchain.approval') {
    if (binding?.kind !== 'ERC20') {
      throw new ValidationError(
        'EVM approval directives require an ERC20 asset binding — native-asset approvals are not expressible (fail closed)',
      );
    }
    to = binding.contractAddress as string;
    value = '0x0';
    data =
      APPROVE_SELECTOR +
      padAddress(directive.spenderRef as string).slice(2) +
      amountToUint256Hex(directive.amount?.minorUnits as string).slice(2);
  } else {
    // contract_call: the family payload carries target+calldata (validated
    // in the shared builder — unknown contract writes never execute silently).
    const payload = directive.familyPayload as { target?: string; calldata?: string } | undefined;
    to = payload?.target as string;
    value = '0x0';
    data = payload?.calldata as string;
  }

  const plan: EvmExecutionPlan = {
    family: 'EVM',
    observedChainId,
    nonce,
    to,
    value,
    data,
    fee,
    headAtPrepare: { height: input.head.height, headHash: input.head.headHash },
  };
  return Object.freeze({
    operationKind: 'PreparedAdapterOperation' as const,
    directive: prologue.directive,
    writeRequest: prologue.writeRequest,
    writeDigest: prologue.writeDigest,
    familyPlan: plan,
    preparedAt: input.at,
    evidenceRefs: prologue.evidenceRefs,
  });
}

/** The EVM simulate stage: eth_estimateGas as an OBSERVATION. */
export async function evmSimulate(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  input: {
    readonly prepared: PreparedAdapterOperation<EvmExecutionPlan>;
    readonly at: number;
  },
): Promise<SimulationObservation> {
  const plan = input.prepared.familyPlan;
  const write = input.prepared.writeRequest;
  const from =
    write.transfer?.from ??
    write.approvals[0]?.owner ??
    '0x0000000000000000000000000000000000000000';
  const estimate = await transport.call('eth_estimateGas', [
    { from, to: plan.to, value: plan.value, data: plan.data },
  ]);
  const simulationId = `sim:${ctx.adapterId}:${write.writeId}`;
  const base = {
    simulationId,
    writeId: write.writeId,
    observedAt: input.at,
    balanceDeltas: write.transfer
      ? [
          {
            holder: write.transfer.from,
            asset: write.transfer.asset,
            amount: write.transfer.amount,
            direction: 'debit' as const,
          },
          {
            holder: write.transfer.to,
            asset: write.transfer.asset,
            amount: write.transfer.amount,
            direction: 'credit' as const,
          },
        ]
      : [],
    approvals: write.approvals.map((approval) => ({
      owner: approval.owner,
      spender: approval.spender,
      asset: approval.asset,
      allowance: approval.amount,
      unlimited: approval.unlimited,
    })),
    simulator: ctx.adapterId,
    blockRef: plan.headAtPrepare.headHash,
  };
  if (estimate.kind === 'RPC_OK') {
    const gasEstimate = hexQuantityToDecimal(estimate.result, 'gas estimate');
    ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, `gas:${gasEstimate}`]);
    return recordSimulation({ ...base, status: 'SUCCEEDED', gasEstimate });
  }
  if (estimate.kind === 'TRANSPORT_UNREACHABLE') {
    // Simulation ambiguity is UNKNOWN, never FAILED.
    ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'outcome:unknown']);
    return recordSimulation({ ...base, status: 'OUTCOME_UNKNOWN' });
  }
  const message = estimate.message.toLowerCase();
  if (message.includes('revert')) {
    ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'status:reverted']);
    return recordSimulation({ ...base, status: 'REVERTED' });
  }
  if (message.includes('insufficient funds')) {
    ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'status:failed']);
    return recordSimulation({ ...base, status: 'FAILED' });
  }
  // Unclassified node error: UNKNOWN (never failure).
  ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'outcome:unknown']);
  return recordSimulation({ ...base, status: 'OUTCOME_UNKNOWN' });
}
