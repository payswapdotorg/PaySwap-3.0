/**
 * @payswap/onchain-adapters — UTXO observe + prepare stages (Work Order
 * P4-W3, lane R2-W3; extracted from the ported UtxoChainAdapter to honor
 * the <=400-line file law).
 *
 * observe: /blocks/tip/height + /blocks/tip/hash → chain-head observation;
 * /address/:addr → UTXO set sums as asset position OBSERVATIONS (never
 * custody).
 *
 * prepare: genesis-block verification (/block-height/0 against the
 * well-known genesis hash — structural chain identity) + fee-rate
 * derivation (/fee-estimates, exact decimal text, no float arithmetic) +
 * declared MempoolPolicy (BIP-125 opt-in RBF / CPFP, provenanced).
 */

import { ValidationError } from '../errors.ts';
import { ChainIdentityMismatchError } from '../errors.ts';
import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { PreparePrologueResult } from '../lifecycle/prepare-prologue.ts';
import type {
  AssetPositionProbe,
  ChainHeadObservation,
  ChainHeadProbe,
} from '../contract/observations.ts';
import type {
  PreparedAdapterOperation,
  PrepareStageInput,
} from '../contract/stage-io.ts';
import type { RestTransport } from '../transport.ts';
import { BITCOIN_GENESIS_HASHES, BITCOIN_MEMPOOL_POLICY } from './identities.ts';
import type { UtxoExecutionPlan } from './plan.ts';

const EXACT_SATOSHI = /^(0|[1-9][0-9]*)$/;

/** Observes the UTXO chain head: tip height + tip hash. */
export async function utxoObserveChainHead(
  ctx: FamilyStageContext,
  transport: RestTransport,
  defaultMaxAgeSeconds: number,
  input: {
    readonly at: string;
    readonly maxAgeSeconds?: number;
  },
): Promise<ChainHeadProbe> {
  const height = await transport.get('/blocks/tip/height');
  if (height.kind !== 'REST_OK') {
    return utxoUnreachableHead(transport, ctx.chainKey, height.message);
  }
  const parsedHeight = Number(height.body);
  if (!Number.isSafeInteger(parsedHeight) || parsedHeight < 0) {
    return utxoUnreachableHead(transport, ctx.chainKey, 'the tip height is not a safe integer');
  }
  const hash = await transport.get('/blocks/tip/hash');
  if (hash.kind !== 'REST_OK' || typeof hash.body !== 'string' || hash.body.length === 0) {
    return utxoUnreachableHead(
      transport,
      ctx.chainKey,
      hash.kind === 'REST_OK' ? 'the tip hash is not a string' : hash.message,
    );
  }
  const atMs = Date.parse(input.at);
  const head: ChainHeadObservation = Object.freeze({
    observationKind: 'ChainHeadObservation',
    chainKey: ctx.chainKey,
    environmentClass: ctx.environmentClass,
    height: parsedHeight,
    headHash: hash.body,
    observedAt: input.at,
    provenance: ctx.buildProvenance(hash.servedBy, atMs),
    maxAgeSeconds: input.maxAgeSeconds ?? defaultMaxAgeSeconds,
  });
  ctx.logEvidence('chain-head', 'observe', atMs, [head.headHash, String(head.height)]);
  return { kind: 'HEAD_OBSERVED', head };
}

/** The unreachable-head probe (availability UNKNOWN — never failure). */
export function utxoUnreachableHead(
  transport: RestTransport,
  chainKey: string,
  message: string,
): ChainHeadProbe {
  return {
    kind: 'RAIL_UNREACHABLE',
    availability: 'UNKNOWN',
    chainKey,
    transportId: transport.transportId,
    attemptedEndpointIds: transport.endpoints().map((endpoint) => endpoint.endpointId),
    message: `UTXO tip unobservable: ${message} — reachability UNKNOWN, never success/failure`,
    at: new Date(0).toISOString(),
  };
}

/** Observes the native BTC position: UTXO-set sums as an OBSERVATION. */
export async function utxoObserveAssetPosition(
  ctx: FamilyStageContext,
  transport: RestTransport,
  assetId: string,
  input: {
    readonly accountRef: string;
    readonly assetId: string;
    readonly at: string;
    readonly maxAgeSeconds?: number;
  },
): Promise<AssetPositionProbe> {
  if (input.assetId !== assetId) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'ASSET_BINDING_UNKNOWN',
      message: `assetId '${input.assetId}' is not the declared native BTC binding '${assetId}' — colored-coin/asset semantics are not declared in this wave (fail closed)`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const address = await transport.get(`/address/${input.accountRef}`);
  if (address.kind === 'TRANSPORT_UNREACHABLE') {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'RAIL_UNREACHABLE',
      message: `address observation failed for '${input.accountRef}': ${address.message}`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  if (address.kind === 'REST_ERROR') {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason:
        address.status === 400 || address.status === 404
          ? 'PROVIDER_REJECTED_ACCOUNT'
          : 'RAIL_UNREACHABLE',
      message: `address observation failed for '${input.accountRef}': ${address.message}`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const stats = (
    address.body as { chain_stats?: { funded_txo_sum?: unknown; spent_txo_sum?: unknown } }
  )?.chain_stats;
  const funded = stats?.funded_txo_sum;
  const spent = stats?.spent_txo_sum;
  if (
    typeof funded !== 'number' ||
    typeof spent !== 'number' ||
    !Number.isSafeInteger(funded) ||
    !Number.isSafeInteger(spent)
  ) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'PROVIDER_REJECTED_ACCOUNT',
      message: `the explorer returned non-exact UTXO-set sums for '${input.accountRef}' — a lossy observation is never fabricated (the exactness law)`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  // Total bitcoin supply (2.1e15 sat) is within safe-integer range, so the
  // funded−spent difference is exact for any real address.
  const minorUnits = String(funded - spent);
  if (!EXACT_SATOSHI.test(minorUnits)) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'PROVIDER_REJECTED_ACCOUNT',
      message: `the observed UTXO-set sums are inconsistent (spent exceeds funded) for '${input.accountRef}' — never observed as a negative balance`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const observation = ctx.validatedAssetObservation({
    observationKind: 'AssetObservation',
    observationId: `asset-obs:${ctx.adapterId}:${assetId}:${minorUnits}`,
    observedAt: input.at,
    assetId,
    chainKey: ctx.chainKey,
    location: { chainKey: ctx.chainKey, accountRef: input.accountRef },
    observedAmount: { currency: assetId, minorUnits },
    freshness: { asOf: input.at, maxAgeSeconds: input.maxAgeSeconds ?? 120 },
    provenance: {
      providerName: address.servedBy.providerName,
      source: 'PROVIDER_API',
      capturedAt: input.at,
    },
    observer: { observerId: ctx.adapterId, observerKind: 'INDEXER' },
  });
  ctx.logEvidence(`position:${assetId}:${input.accountRef}`, 'observe', Date.parse(input.at), [
    observation.observationId,
  ]);
  return { kind: 'POSITION_OBSERVED', observation };
}

/**
 * Derives the fee rate from the explorer's /fee-estimates feed: the EXACT
 * DECIMAL TEXT of the declared confirmation-target bucket is extracted
 * from the raw response (no float arithmetic, verbatim provider text with
 * provenance). A missing bucket is an explicit inexpressible semantic.
 */
export async function utxoDeriveFeeRate(
  transport: RestTransport,
  feeEstimateTargetBlocks: number,
): Promise<UtxoExecutionPlan['fee']> {
  const estimates = await transport.get('/fee-estimates');
  if (estimates.kind !== 'REST_OK') {
    return {
      expressible: false,
      reason: `the fee-estimates feed is unreachable ('${estimates.message}') — SATOSHI_PER_VBYTE semantics are not expressible and fail closed (never approximated)`,
    };
  }
  const raw = estimates.raw;
  const bucket = String(feeEstimateTargetBlocks);
  // Extract the bucket's numeric text verbatim (no JSON float round-trip).
  const pattern = new RegExp(`"${bucket}"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`);
  const match = pattern.exec(raw);
  if (match === null) {
    return {
      expressible: false,
      reason: `the fee-estimates feed has no '${bucket}'-block bucket — the declared fee-estimate target is not expressible and fails closed (never substituted with another bucket)`,
    };
  }
  return {
    family: 'UTXO',
    expressible: true,
    feeModel: 'SATOSHI_PER_VBYTE',
    feeRateSatPerVByte: match[1] as string,
    estimateTargetBlocks: feeEstimateTargetBlocks,
    mempoolPolicy: { ...BITCOIN_MEMPOOL_POLICY },
  };
}

/** The UTXO prepare stage (genesis verification, fee rate, exact satoshi). */
export async function utxoPrepare(
  ctx: FamilyStageContext,
  transport: RestTransport,
  feeEstimateTargetBlocks: number,
  prologue: PreparePrologueResult,
  input: PrepareStageInput,
): Promise<PreparedAdapterOperation<UtxoExecutionPlan>> {
  // Structural chain identity: the explorer's genesis block must match the
  // well-known genesis hash for this chainKey.
  const genesis = await transport.get('/block-height/0');
  if (genesis.kind !== 'REST_OK' || typeof genesis.body !== 'string') {
    throw new ChainIdentityMismatchError(
      `the genesis block is unobservable on '${ctx.chainKey}' — prepare fails closed when chain identity cannot be verified`,
    );
  }
  const observedGenesisHash = genesis.body;
  const declared = BITCOIN_GENESIS_HASHES[ctx.chainKey];
  if (declared !== undefined && declared !== observedGenesisHash) {
    throw new ChainIdentityMismatchError(
      `the explorer serving '${ctx.chainKey}' reports genesis hash '${observedGenesisHash}', but the well-known genesis is '${declared}' — chain confusion fails closed`,
    );
  }

  // Fee derivation: the exact decimal text of the declared estimate bucket.
  const fee = await utxoDeriveFeeRate(transport, feeEstimateTargetBlocks);

  const amountSat = prologue.directive.amount?.minorUnits as string;
  if (typeof amountSat !== 'string' || !EXACT_SATOSHI.test(amountSat)) {
    throw new ValidationError(
      'a UTXO transfer requires an exact integer satoshi amount (the money-exactness law)',
    );
  }

  const plan: UtxoExecutionPlan = {
    family: 'UTXO',
    observedGenesisHash,
    destination: prologue.directive.destination as string,
    amountSat,
    fee,
    tipAtPrepare: { height: input.head.height, headHash: input.head.headHash },
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
