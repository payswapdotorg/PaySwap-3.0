/**
 * @payswap/onchain-adapters — Solana observe + prepare + simulate stages
 * (Work Order P4-W3, lane R2-W3; extracted from the ported
 * SolanaChainAdapter to honor the <=400-line file law).
 *
 * observe: getSlot + getLatestBlockhash → chain-head observation (height =
 * slot, headHash = latest blockhash); getBalance → SOL positions AS
 * OBSERVATIONS with the EXACTNESS LAW (lamports extracted from the RAW
 * response text — a JSON number above Number.MAX_SAFE_INTEGER would be
 * lossy and is never fabricated).
 *
 * prepare: getGenesisHash cross-check (cluster-identity defense) +
 * getLatestBlockhash validity window + fee derivation via getFeeForMessage
 * on a minimal 1-signature message built from the DECODED blockhash (exact
 * integer lamports).
 *
 * simulate: simulateTransaction over the trusted-surface-composed
 * serialized transaction (familyPayload carries it); absent input FAILS
 * CLOSED — a simulation is never fabricated.
 */

import { ValidationError } from '../errors.ts';
import { ChainIdentityMismatchError, SemanticNotExpressibleError } from '../errors.ts';
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
import { recordSimulation } from '../pins/onchain-security/signing.ts';
import type { SimulationObservation } from '../pins/onchain-security/signing.ts';
import type { SolanaFeeSemantics } from '../semantics.ts';
import type { RpcTransport } from '../transport.ts';
import { SOLANA_GENESIS_HASHES } from './identities.ts';
import { base58Decode, base64Encode } from './base58.ts';
import type { SolanaExecutionPlan } from './plan.ts';

/** Observes the Solana chain head: slot + latest blockhash. */
export async function solanaObserveChainHead(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  defaultMaxAgeSeconds: number,
  input: {
    readonly at: string;
    readonly maxAgeSeconds?: number;
  },
): Promise<ChainHeadProbe> {
  const slot = await transport.call('getSlot', [{ commitment: 'confirmed' }]);
  if (
    slot.kind !== 'RPC_OK' ||
    typeof slot.result !== 'number' ||
    !Number.isSafeInteger(slot.result)
  ) {
    return solanaUnreachableHead(
      transport,
      ctx.chainKey,
      slot.kind === 'RPC_OK' ? 'getSlot returned a non-integer slot' : slot.message,
    );
  }
  const blockhash = await transport.call('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  if (
    blockhash.kind !== 'RPC_OK' ||
    blockhash.result === null ||
    typeof blockhash.result !== 'object'
  ) {
    return solanaUnreachableHead(
      transport,
      ctx.chainKey,
      blockhash.kind === 'RPC_OK' ? 'getLatestBlockhash returned no value' : blockhash.message,
    );
  }
  const value = (blockhash.result as { value?: { blockhash?: unknown } }).value;
  const hash = value?.blockhash;
  if (typeof hash !== 'string' || hash.length === 0) {
    return solanaUnreachableHead(transport, ctx.chainKey, 'getLatestBlockhash carries no blockhash');
  }
  const atMs = Date.parse(input.at);
  const head: ChainHeadObservation = Object.freeze({
    observationKind: 'ChainHeadObservation',
    chainKey: ctx.chainKey,
    environmentClass: ctx.environmentClass,
    height: slot.result,
    headHash: hash,
    observedAt: input.at,
    provenance: ctx.buildProvenance(slot.servedBy, atMs),
    maxAgeSeconds: input.maxAgeSeconds ?? defaultMaxAgeSeconds,
  });
  ctx.logEvidence('chain-head', 'observe', atMs, [head.headHash, String(head.height)]);
  return { kind: 'HEAD_OBSERVED', head };
}

/** The unreachable-head probe (availability UNKNOWN — never failure). */
export function solanaUnreachableHead(
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
    message: `Solana head unobservable: ${message} — reachability UNKNOWN, never success/failure`,
    at: new Date(0).toISOString(),
  };
}

/** Observes the native SOL position with the EXACTNESS LAW (raw-text lamports). */
export async function solanaObserveAssetPosition(
  ctx: FamilyStageContext,
  transport: RpcTransport,
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
      message: `assetId '${input.assetId}' is not the declared native SOL binding '${assetId}' — SPL token positions are not declared in this wave (fail closed)`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const balance = await transport.call('getBalance', [
    input.accountRef,
    { commitment: 'confirmed' },
  ]);
  if (balance.kind !== 'RPC_OK') {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason:
        balance.kind === 'TRANSPORT_UNREACHABLE' ? 'RAIL_UNREACHABLE' : 'PROVIDER_REJECTED_ACCOUNT',
      message: `balance observation failed for '${input.accountRef}': ${balance.message}`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  // EXACTNESS LAW: getBalance returns a JSON NUMBER; balances above
  // Number.MAX_SAFE_INTEGER lose exactness through a JSON double
  // round-trip. The lamports are therefore extracted from the RAW response
  // text (exact integer decimal string); when the raw value is not an
  // exact integer the observation fails closed — a lossy balance is never
  // fabricated.
  const rawLamports = /"value"\s*:\s*(\d+)/.exec(balance.raw)?.[1];
  if (rawLamports === undefined) {
    return {
      kind: 'POSITION_UNOBSERVABLE',
      reason: 'PROVIDER_REJECTED_ACCOUNT',
      message: `the provider returned no exact integer lamport amount for '${input.accountRef}' — a lossy observation is never fabricated (the exactness law)`,
      chainKey: ctx.chainKey,
      at: input.at,
    };
  }
  const observation = ctx.validatedAssetObservation({
    observationKind: 'AssetObservation',
    observationId: `asset-obs:${ctx.adapterId}:${assetId}:${rawLamports}`,
    observedAt: input.at,
    assetId,
    chainKey: ctx.chainKey,
    location: { chainKey: ctx.chainKey, accountRef: input.accountRef },
    observedAmount: { currency: assetId, minorUnits: rawLamports },
    freshness: { asOf: input.at, maxAgeSeconds: input.maxAgeSeconds ?? 30 },
    provenance: {
      providerName: balance.servedBy.providerName,
      source: 'PROVIDER_API',
      capturedAt: input.at,
    },
    observer: { observerId: ctx.adapterId, observerKind: 'RPC_PROVIDER' },
  });
  ctx.logEvidence(`position:${assetId}:${input.accountRef}`, 'observe', Date.parse(input.at), [
    observation.observationId,
  ]);
  return { kind: 'POSITION_OBSERVED', observation };
}

/**
 * Derives the exact SIGNATURE_FEE parameters from getFeeForMessage over a
 * minimal legacy message (1 required signature, 0 instructions) built from
 * the DECODED recent blockhash. The fee is per-signature and independent of
 * the account key.
 */
export async function solanaDeriveFee(
  transport: RpcTransport,
  recentBlockhash: string,
): Promise<SolanaFeeSemantics | { readonly expressible: false; readonly reason: string }> {
  const decoded = base58Decode(recentBlockhash);
  if (decoded.length !== 32) {
    return {
      expressible: false,
      reason: `the recent blockhash does not decode to 32 bytes (${decoded.length}) — SIGNATURE_FEE semantics are not expressible and fail closed`,
    };
  }
  // Minimal legacy message: header(1,0,0) + 1 zero key + blockhash + 0
  // instructions = 3 + 1 + 32 + 32 + 1 = 69 bytes.
  const message = new Uint8Array(3 + 1 + 32 + 32 + 1);
  message.set([1, 0, 0], 0);
  // account key count (compact-u16) = 1; the key bytes (indices 4..35)
  // stay all zero — the fee is signature-count based.
  message[3] = 1;
  message.set(decoded, 36);
  // instruction count = 0 (the last byte stays 0).
  const encoded = base64Encode(message);
  const fee = await transport.call('getFeeForMessage', [encoded, { commitment: 'confirmed' }]);
  // getFeeForMessage returns { context, value } — value is the exact
  // lamports fee (or null when the message cannot be priced).
  const feeValue =
    fee.kind === 'RPC_OK' && fee.result !== null && typeof fee.result === 'object'
      ? (fee.result as { value?: unknown }).value
      : undefined;
  if (fee.kind !== 'RPC_OK' || typeof feeValue !== 'number' || !Number.isSafeInteger(feeValue)) {
    return {
      expressible: false,
      reason: `getFeeForMessage is not observable ('${fee.kind === 'RPC_OK' ? 'no exact integer fee value' : fee.message}') — SIGNATURE_FEE semantics are not expressible and fail closed (never approximated)`,
    };
  }
  return {
    family: 'SOLANA',
    expressible: true,
    feeModel: 'SIGNATURE_FEE',
    lamportsPerSignature: String(feeValue),
  };
}

/** The Solana prepare stage (genesis-hash cross-check, blockhash window, fee). */
export async function solanaPrepare(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  commitment: 'confirmed' | 'finalized',
  prologue: PreparePrologueResult,
  input: PrepareStageInput,
): Promise<PreparedAdapterOperation<SolanaExecutionPlan>> {
  // Cluster-identity cross-check: the endpoint's genesis hash must match
  // the well-known registry entry for this chainKey.
  const genesis = await transport.call('getGenesisHash', []);
  if (genesis.kind !== 'RPC_OK') {
    throw new ChainIdentityMismatchError(
      `getGenesisHash unobservable on '${ctx.chainKey}' — prepare fails closed when cluster identity cannot be verified`,
    );
  }
  const observedGenesisHash = String(genesis.result);
  const declared = SOLANA_GENESIS_HASHES[ctx.chainKey];
  if (declared !== undefined && declared !== observedGenesisHash) {
    throw new ChainIdentityMismatchError(
      `the endpoint serving '${ctx.chainKey}' reports genesis hash '${observedGenesisHash}', but the well-known cluster genesis is '${declared}' — cluster confusion fails closed`,
    );
  }

  // Recent blockhash + validity window (the Solana nonce analogue).
  const blockhash = await transport.call('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  if (
    blockhash.kind !== 'RPC_OK' ||
    blockhash.result === null ||
    typeof blockhash.result !== 'object'
  ) {
    throw new SemanticNotExpressibleError(
      'getLatestBlockhash is unobservable — the blockhash validity window (Solana sequence semantics) cannot be expressed and prepare fails closed',
    );
  }
  const value = (
    blockhash.result as { value?: { blockhash?: unknown; lastValidBlockHeight?: unknown } }
  ).value;
  if (typeof value?.blockhash !== 'string' || typeof value?.lastValidBlockHeight !== 'number') {
    throw new SemanticNotExpressibleError(
      'getLatestBlockhash carries no valid blockhash/lastValidBlockHeight — prepare fails closed',
    );
  }
  const fee = await solanaDeriveFee(transport, value.blockhash);
  const plan: SolanaExecutionPlan = {
    family: 'SOLANA',
    observedGenesisHash,
    recentBlockhash: value.blockhash,
    lastValidBlockHeight: value.lastValidBlockHeight,
    fee,
    commitment,
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

/** The Solana simulate stage (surface-composed transaction required). */
export async function solanaSimulate(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  input: {
    readonly prepared: PreparedAdapterOperation<SolanaExecutionPlan>;
    readonly at: number;
  },
): Promise<SimulationObservation> {
  const write = input.prepared.writeRequest;
  const payload = input.prepared.directive.familyPayload as
    | { readonly serializedTransaction?: unknown }
    | undefined;
  if (
    typeof payload?.serializedTransaction !== 'string' ||
    payload.serializedTransaction.length === 0
  ) {
    // Fail closed: no fabricated simulation without surface-composed input.
    throw new ValidationError(
      'Solana simulation requires familyPayload.serializedTransaction (trusted-surface-composed, base64) — a simulation is never fabricated from nothing (fail closed)',
    );
  }
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
    approvals: [],
    simulator: ctx.adapterId,
    blockRef: input.prepared.familyPlan.recentBlockhash,
  };
  const result = await transport.call('simulateTransaction', [
    payload.serializedTransaction,
    { sigVerify: false, commitment: 'confirmed' },
  ]);
  if (result.kind === 'RPC_OK') {
    if (result.result !== null && typeof result.result === 'object') {
      const record = result.result as { err?: unknown };
      if (record.err === null || record.err === undefined) {
        ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'status:succeeded']);
        return recordSimulation({ ...base, status: 'SUCCEEDED' });
      }
      ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'status:reverted']);
      return recordSimulation({ ...base, status: 'REVERTED' });
    }
    // RPC_OK with a null result: the simulator returned nothing usable.
    ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'outcome:unknown']);
    return recordSimulation({ ...base, status: 'OUTCOME_UNKNOWN' });
  }
  if (result.kind === 'TRANSPORT_UNREACHABLE') {
    ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'outcome:unknown']);
    return recordSimulation({ ...base, status: 'OUTCOME_UNKNOWN' });
  }
  const message = result.message.toLowerCase();
  if (message.includes('insufficient') || message.includes('lamports')) {
    ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'status:failed']);
    return recordSimulation({ ...base, status: 'FAILED' });
  }
  // Unclassified: UNKNOWN.
  ctx.logEvidence(write.writeId, 'simulate', input.at, [simulationId, 'outcome:unknown']);
  return recordSimulation({ ...base, status: 'OUTCOME_UNKNOWN' });
}
