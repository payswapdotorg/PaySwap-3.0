/**
 * @payswap/onchain-adapters — EVM observe stage (Work Order P4-W3, lane
 * R2-W3; extracted from the ported EvmChainAdapter to honor the
 * <=400-line file law).
 *
 * eth_blockNumber + eth_getBlockByNumber → chain-head observation (with
 * explicit EIP-1559 fee refresh); eth_getBalance / eth_call balanceOf →
 * asset positions AS OBSERVATIONS (never custody). Unreachable rails
 * surface availability UNKNOWN — never success or failure.
 */

import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type {
  AssetPositionProbe,
  ChainHeadObservation,
  ChainHeadProbe,
} from '../contract/observations.ts';
import type { EvmFeeSemantics } from '../semantics.ts';
import type { RpcTransport } from '../transport.ts';
import { hexQuantityToDecimal } from '../transport.ts';
import { BALANCE_OF_SELECTOR, EVM_HEX_QUANTITY, padAddress } from './encoding.ts';
import type { EvmAssetBinding } from './plan.ts';

/** EVM fee-refresh view for the adapter's semantics profile. */
export type EvmFeeRefresh = (
  fee: EvmFeeSemantics | { readonly expressible: false; readonly reason: string },
) => void;

/**
 * Observes the EVM chain head: block number + latest block hash; refreshes
 * the observable 1559 fee semantics from the block.
 */
export async function evmObserveChainHead(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  refreshFee: EvmFeeRefresh,
  defaultMaxAgeSeconds: number,
  input: {
    readonly at: string;
    readonly maxAgeSeconds?: number;
  },
): Promise<ChainHeadProbe> {
  const blockNumber = await transport.call('eth_blockNumber', []);
  if (blockNumber.kind !== 'RPC_OK') {
    return evmUnreachableHead(transport, ctx.chainKey, blockNumber.message);
  }
  const height = Number(hexQuantityToDecimal(blockNumber.result, 'eth_blockNumber result'));
  const block = await transport.call('eth_getBlockByNumber', ['latest', false]);
  if (block.kind !== 'RPC_OK' || block.result === null || typeof block.result !== 'object') {
    return evmUnreachableHead(
      transport,
      ctx.chainKey,
      block.kind === 'RPC_OK' ? 'eth_getBlockByNumber returned no block' : block.message,
    );
  }
  const blockRecord = block.result as { hash?: unknown; baseFeePerGas?: unknown };
  if (typeof blockRecord.hash !== 'string' || !EVM_HEX_QUANTITY.test(blockRecord.hash)) {
    return evmUnreachableHead(transport, ctx.chainKey, 'the latest block carries no valid hash');
  }
  // Refresh observable fee semantics from the latest block (explicit 1559).
  refreshFee(evmFeeFromBlock(blockRecord));
  const atMs = Date.parse(input.at);
  const head: ChainHeadObservation = Object.freeze({
    observationKind: 'ChainHeadObservation',
    chainKey: ctx.chainKey,
    environmentClass: ctx.environmentClass,
    height,
    headHash: blockRecord.hash,
    observedAt: input.at,
    provenance: ctx.buildProvenance(block.servedBy, atMs),
    maxAgeSeconds: input.maxAgeSeconds ?? defaultMaxAgeSeconds,
  });
  ctx.logEvidence('chain-head', 'observe', atMs, [head.headHash, String(height)]);
  return { kind: 'HEAD_OBSERVED', head };
}

/** Derives the 1559 fee semantics from a block (or the explicit inexpressible shape). */
export function evmFeeFromBlock(
  block: { baseFeePerGas?: unknown },
): EvmFeeSemantics | { readonly expressible: false; readonly reason: string } {
  if (
    block.baseFeePerGas === undefined ||
    typeof block.baseFeePerGas !== 'string' ||
    !EVM_HEX_QUANTITY.test(block.baseFeePerGas)
  ) {
    return {
      expressible: false,
      reason:
        'the observed block carries no EIP-1559 baseFeePerGas — GAS_AUCTION 1559 fee semantics are not expressible and are never approximated with a legacy gas price (fail closed)',
    };
  }
  return {
    family: 'EVM',
    expressible: true,
    feeModel: 'GAS_AUCTION',
    baseFeePerGasMinorUnits: hexQuantityToDecimal(block.baseFeePerGas, 'baseFeePerGas'),
    gasLimit: '21000',
    eip1559: true,
  };
}

/** The unreachable-head probe (availability UNKNOWN — never failure). */
export function evmUnreachableHead(
  transport: RpcTransport,
  chainKey: string,
  message: string,
): ChainHeadProbe {
  return {
    kind: 'RAIL_UNREACHABLE',
    availability: 'UNKNOWN',
    chainKey,
    transportId: transport.transportId,
    attemptedEndpointIds: transport.endpoints().map((endpoint) => endpoint.endpointId),
    message: `EVM head unobservable: ${message} — reachability UNKNOWN, never success/failure`,
    at: new Date(0).toISOString(),
  };
}

/** Observes an EVM asset position: native balance or ERC20 balanceOf. */
export async function evmObserveAssetPosition(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  assetBindings: ReadonlyMap<string, EvmAssetBinding>,
  input: {
    readonly accountRef: string;
    readonly assetId: string;
    readonly at: string;
    readonly maxAgeSeconds?: number;
  },
): Promise<AssetPositionProbe> {
  const binding = assetBindings.get(input.assetId);
  if (binding === undefined) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'ASSET_BINDING_UNKNOWN',
      message: `assetId '${input.assetId}' has no declared EVM binding on '${ctx.chainKey}' — an unbound asset is never observed (fail closed)`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const call =
    binding.kind === 'NATIVE'
      ? await transport.call('eth_getBalance', [input.accountRef, 'latest'])
      : await transport.call('eth_call', [
          {
            to: binding.contractAddress,
            data: BALANCE_OF_SELECTOR + padAddress(input.accountRef).slice(2),
          },
          'latest',
        ]);
  if (call.kind !== 'RPC_OK') {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: call.kind === 'TRANSPORT_UNREACHABLE' ? 'RAIL_UNREACHABLE' : 'PROVIDER_REJECTED_ACCOUNT',
      message: `balance observation failed for '${input.accountRef}': ${call.message}`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  if (typeof call.result !== 'string' || !EVM_HEX_QUANTITY.test(call.result)) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'PROVIDER_REJECTED_ACCOUNT',
      message: `the provider returned a non-quantity balance for '${input.accountRef}' — an observation is never fabricated`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const minorUnits = hexQuantityToDecimal(call.result, 'observed balance');
  const observation = ctx.validatedAssetObservation({
    observationKind: 'AssetObservation',
    observationId: `asset-obs:${ctx.adapterId}:${binding.assetId}:${minorUnits}`,
    observedAt: input.at,
    assetId: binding.assetId,
    chainKey: ctx.chainKey,
    location: { chainKey: ctx.chainKey, accountRef: input.accountRef },
    observedAmount: { currency: binding.assetId, minorUnits },
    freshness: { asOf: input.at, maxAgeSeconds: input.maxAgeSeconds ?? 30 },
    provenance: {
      providerName: call.servedBy.providerName,
      source: 'PROVIDER_API',
      capturedAt: input.at,
    },
    observer: { observerId: ctx.adapterId, observerKind: 'RPC_PROVIDER' },
  });
  ctx.logEvidence(`position:${binding.assetId}:${input.accountRef}`, 'observe', Date.parse(input.at), [
    observation.observationId,
  ]);
  return { kind: 'POSITION_OBSERVED', observation };
}
