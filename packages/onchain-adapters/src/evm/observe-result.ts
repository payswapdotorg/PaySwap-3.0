/**
 * @payswap/onchain-adapters — EVM observe-result stage (Work Order P4-W3,
 * lane R2-W3; extracted from the ported EvmChainAdapter to honor the
 * <=400-line file law).
 *
 * eth_getTransactionReceipt + reorg detection via the remembered
 * containing-block hash (a changed/vanished receipt after confirmation →
 * OUTCOME_UNKNOWN).
 */

import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { BroadcastStageOutcome } from '../contract/stage-io.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type { RpcTransport } from '../transport.ts';
import { hexQuantityToDecimal } from '../transport.ts';
import { EVM_HEX_QUANTITY } from './encoding.ts';

/** The EVM observe-result stage (receipt + reorg detection). */
export async function evmObserveOperation(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  },
): Promise<BroadcastStageOutcome> {
  const observation = await evmObserveOperationInner(ctx, transport, input);
  ctx.recordObservedOutcome(observation);
  return observation;
}

async function evmObserveOperationInner(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  },
): Promise<BroadcastStageOutcome> {
  const receiptCall = await transport.call('eth_getTransactionReceipt', [
    input.externalOperationRef,
  ]);
  if (receiptCall.kind !== 'RPC_OK') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        receiptCall.kind === 'TRANSPORT_UNREACHABLE'
          ? 'the receipt is unobservable (rail unreachable) — the outcome is UNKNOWN, not failed'
          : `unclassified provider error observing the receipt ('${receiptCall.message}') — the outcome is UNKNOWN`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['receipt:unobservable']),
      ],
      servedBy:
        receiptCall.kind === 'TRANSPORT_UNREACHABLE'
          ? { transportId: transport.transportId, endpointId: 'none', providerName: 'unreachable' }
          : receiptCall.servedBy,
    });
  }
  const receipt = receiptCall.result as
    | { status?: unknown; blockNumber?: unknown; blockHash?: unknown }
    | null;
  if (receipt === null) {
    // No receipt: in flight, OR reorged away after a prior confirmation.
    if (input.prior?.outcome === 'CONFIRMED') {
      return ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        externalOperationRef: input.externalOperationRef,
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason:
          'broadcast-then-reorg: the transaction receipt VANISHED after a prior CONFIRMED observation (the containing block was reorganized away) — the outcome is ambiguous and requires reconciliation (finality stays protocol-owned)',
        evidenceRefs: [
          ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
            'reorg:receipt-vanished',
          ]),
        ],
        servedBy: receiptCall.servedBy,
      });
    }
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'BROADCAST',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
          'receipt:null-in-flight',
        ]),
      ],
      servedBy: receiptCall.servedBy,
    });
  }
  const blockNumber =
    typeof receipt.blockNumber === 'string' && EVM_HEX_QUANTITY.test(receipt.blockNumber)
      ? Number(hexQuantityToDecimal(receipt.blockNumber, 'receipt.blockNumber'))
      : undefined;
  const blockHash = typeof receipt.blockHash === 'string' ? receipt.blockHash : undefined;
  if (blockNumber === undefined || blockHash === undefined) {
    // Finalize-ambiguous: a receipt without a locatable block is ambiguous.
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        "the receipt carries no locatable block (missing/invalid blockNumber or blockHash) — an unlocatable confirmation is UNKNOWN, never finalized",
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['receipt:unlocatable']),
      ],
      servedBy: receiptCall.servedBy,
    });
  }

  // Reorg detection: the remembered (or prior) containing block must still
  // be the chain's block at that height.
  const anchor =
    ctx.confirmationAnchor(input.executionRef) ??
    (input.prior?.outcome === 'CONFIRMED'
      ? { height: blockNumber, headHash: blockHash }
      : undefined);
  if (anchor !== undefined && (anchor.height !== blockNumber || anchor.headHash !== blockHash)) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: `broadcast-then-reorg: the transaction's containing block changed (was height ${anchor.height}/${anchor.headHash}, now ${blockNumber}/${blockHash}) — the outcome is ambiguous and requires reconciliation`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
          'reorg:containing-block-changed',
        ]),
      ],
      servedBy: receiptCall.servedBy,
    });
  }
  const blockAtHeight = await transport.call('eth_getBlockByNumber', [
    '0x' + blockNumber.toString(16),
    false,
  ]);
  if (
    blockAtHeight.kind === 'RPC_OK' &&
    blockAtHeight.result !== null &&
    typeof blockAtHeight.result === 'object'
  ) {
    const chainHash = (blockAtHeight.result as { hash?: unknown }).hash;
    if (typeof chainHash !== 'string' || chainHash !== blockHash) {
      return ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        externalOperationRef: input.externalOperationRef,
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason:
          "reorg detected: the chain's block at the receipt's height no longer matches the receipt's containing block hash — the outcome is ambiguous and requires reconciliation",
        evidenceRefs: [
          ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
            'reorg:block-hash-mismatch',
          ]),
        ],
        servedBy: receiptCall.servedBy,
      });
    }
  }

  const head = await transport.call('eth_blockNumber', []);
  if (head.kind !== 'RPC_OK') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'the chain head is unobservable while locating the receipt — depth cannot be computed, so the outcome is UNKNOWN',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['head:unobservable']),
      ],
      servedBy: receiptCall.servedBy,
    });
  }
  const headHeight = Number(hexQuantityToDecimal(head.result, 'head'));
  if (blockNumber > headHeight) {
    // Inconsistent provider data (receipt above the head): ambiguous.
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: `the receipt claims block ${blockNumber} above the observed head ${headHeight} — inconsistent provider data is UNKNOWN, never finalized`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['receipt:above-head']),
      ],
      servedBy: receiptCall.servedBy,
    });
  }

  const status = receipt.status;
  if (status === '0x1') {
    const depth = headHeight - blockNumber + 1;
    ctx.rememberConfirmationAnchor(input.executionRef, {
      height: blockNumber,
      headHash: blockHash,
    });
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'CONFIRMED',
      finalityCandidate: {
        candidateOnly: true,
        requiresProtocolFinality: true,
        confirmationDepth: depth,
        finalityModel: 'PROBABILISTIC',
        reorgDetected: false,
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
          `receipt:confirmed:depth-${depth}`,
        ]),
      ],
      servedBy: receiptCall.servedBy,
    });
  }
  if (status === '0x0') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'FAILED',
      failure: {
        failureClass: 'REVERTED',
        description:
          'the transaction was included and reverted on-chain (definitive execution failure)',
        retryGuidance: 'NOT_RETRYABLE',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['receipt:reverted']),
      ],
      servedBy: receiptCall.servedBy,
    });
  }
  // Malformed status (neither 0x1 nor 0x0): finalize-ambiguous → UNKNOWN.
  return ctx.buildExecutionObservation({
    executionRef: input.executionRef,
    observedAt: input.at,
    externalOperationRef: input.externalOperationRef,
    outcome: 'OUTCOME_UNKNOWN',
    unknownReason: `the receipt status '${String(status)}' is neither success nor revert — an ambiguous status is UNKNOWN, never converted`,
    evidenceRefs: [
      ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
        'receipt:ambiguous-status',
      ]),
    ],
    servedBy: receiptCall.servedBy,
  });
}
