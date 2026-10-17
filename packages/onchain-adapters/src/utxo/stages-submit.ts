/**
 * @payswap/onchain-adapters — UTXO broadcast + observe-result stages (Work
 * Order P4-W3, lane R2-W3; extracted from the ported UtxoChainAdapter to
 * honor the <=400-line file law).
 *
 * broadcast: POST /tx (the surface-signed raw hex) with the deterministic
 * explorer-rejection classification table; unclassified errors and
 * transport failure after submission → OUTCOME_UNKNOWN.
 *
 * observe (result): /tx/:txid/status with depth-based confirmation and
 * reorg detection (the containing block's hash is re-observed; a
 * vanished/changed confirmation → OUTCOME_UNKNOWN).
 */

import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { BroadcastStageOutcome } from '../contract/stage-io.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type { SigningRequest } from '../pins/onchain-security/signing.ts';
import type { RestTransport } from '../transport.ts';

/** The UTXO broadcast stage (assertBroadcastable runs in the adapter). */
export async function utxoBroadcast(
  ctx: FamilyStageContext,
  transport: RestTransport,
  input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  },
): Promise<BroadcastStageOutcome> {
  const submission = await transport.post('/tx', input.signedPayload, 'text/plain');
  if (submission.kind === 'REST_OK') {
    const txid = typeof submission.body === 'string' ? submission.body.trim() : '';
    if (txid.length === 0 || !/^[0-9a-f]{64}$/.test(txid)) {
      const observation = ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason:
          'the explorer accepted the submission but returned a non-txid body — it is unknown whether the operation reached the chain',
        evidenceRefs: [
          ctx.logEvidence(input.executionRef, 'broadcast', input.at, [
            'submission:malformed-result',
          ]),
        ],
        servedBy: submission.servedBy,
      });
      ctx.recordObservedOutcome(observation);
      return observation;
    }
    const observation = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'BROADCAST',
      externalOperationRef: txid,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [`txid:${txid}`]),
      ],
      servedBy: submission.servedBy,
    });
    ctx.recordObservedOutcome(observation);
    return observation;
  }
  if (submission.kind === 'TRANSPORT_UNREACHABLE') {
    const observation = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'transport unreachable after the submission attempt: it is unknown whether the operation reached the chain (never classified as failure)',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [
          'submission:transport-unreachable',
        ]),
      ],
      servedBy: {
        transportId: transport.transportId,
        endpointId: 'none',
        providerName: 'unreachable',
      },
    });
    ctx.recordObservedOutcome(observation);
    return observation;
  }
  const message = submission.message.toLowerCase();
  const bodyText = typeof submission.body === 'string' ? submission.body.toLowerCase() : '';
  let outcome: BroadcastStageOutcome;
  if (
    message.includes('already') ||
    bodyText.includes('txn-already-in-mempool') ||
    bodyText.includes('already in utxo pool') ||
    bodyText.includes('txn-already-known')
  ) {
    outcome = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'BROADCAST',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['submission:already-known']),
      ],
      servedBy: submission.servedBy,
    });
  } else if (
    message.includes('insufficient') ||
    bodyText.includes('insufficient fee') ||
    bodyText.includes('bad-txns-fee') ||
    bodyText.includes('min relay fee')
  ) {
    outcome = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'REJECTED',
        description: `the explorer definitively rejected the submission (mempool fee policy): ${submission.message}`,
        retryGuidance: 'SAFE_TO_RETRY',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['rejection:fee-policy']),
      ],
      servedBy: submission.servedBy,
    });
  } else if (bodyText.includes('dust') || message.includes('dust')) {
    outcome = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'REJECTED',
        description: `the explorer definitively rejected the submission (dust limit): ${submission.message}`,
        retryGuidance: 'NOT_RETRYABLE',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['rejection:dust']),
      ],
      servedBy: submission.servedBy,
    });
  } else {
    outcome = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: `unclassified explorer response after the submission attempt ('${submission.message}'): it is unknown whether the operation reached the chain`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['submission:unclassified']),
      ],
      servedBy: submission.servedBy,
    });
  }
  ctx.recordObservedOutcome(outcome);
  return outcome;
}

/** The UTXO observe-result stage (tx status + reorg detection). */
export async function utxoObserveOperation(
  ctx: FamilyStageContext,
  transport: RestTransport,
  input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  },
): Promise<BroadcastStageOutcome> {
  const observation = await utxoObserveOperationInner(ctx, transport, input);
  ctx.recordObservedOutcome(observation);
  return observation;
}

async function utxoObserveOperationInner(
  ctx: FamilyStageContext,
  transport: RestTransport,
  input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  },
): Promise<BroadcastStageOutcome> {
  const status = await transport.get(`/tx/${input.externalOperationRef}/status`);
  if (status.kind === 'REST_ERROR' && (status.status === 400 || status.status === 404)) {
    // The reference is not visible to this explorer: evicted from mempool,
    // reorged out, or never propagated — ambiguous, never fabricated.
    if (input.prior?.outcome === 'CONFIRMED') {
      return ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        externalOperationRef: input.externalOperationRef,
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason:
          'broadcast-then-reorg: the transaction VANISHED from the explorer after a prior CONFIRMED observation (the containing block was reorganized away) — the outcome is ambiguous and requires reconciliation',
        evidenceRefs: [
          ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['reorg:tx-vanished']),
        ],
        servedBy: status.servedBy,
      });
    }
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'the transaction reference is not visible to the explorer (evicted from mempool, reorged out, or not yet propagated) — an unobserved reference is UNKNOWN, never a fabricated failure or success',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
          'status:reference-unobserved',
        ]),
      ],
      servedBy: status.servedBy,
    });
  }
  if (status.kind === 'TRANSPORT_UNREACHABLE' || status.kind === 'REST_ERROR') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        status.kind === 'TRANSPORT_UNREACHABLE'
          ? 'the transaction status is unobservable (rail unreachable) — the outcome is UNKNOWN, not failed'
          : `unclassified explorer error observing the status ('${status.message}') — the outcome is UNKNOWN`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:unobservable']),
      ],
      servedBy:
        status.kind === 'TRANSPORT_UNREACHABLE'
          ? { transportId: transport.transportId, endpointId: 'none', providerName: 'unreachable' }
          : status.servedBy,
    });
  }
  const record = status.body as
    | { confirmed?: unknown; block_height?: unknown; block_hash?: unknown }
    | null;
  if (record === null || typeof record !== 'object' || typeof record.confirmed !== 'boolean') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'the status body is malformed (no confirmed flag) — a malformed status is UNKNOWN, never converted',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:malformed']),
      ],
      servedBy: status.servedBy,
    });
  }
  if (!record.confirmed) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'BROADCAST',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:in-mempool']),
      ],
      servedBy: status.servedBy,
    });
  }
  const blockHeight = record.block_height;
  const blockHash = record.block_hash;
  if (
    typeof blockHeight !== 'number' ||
    !Number.isSafeInteger(blockHeight) ||
    typeof blockHash !== 'string'
  ) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'the confirmed status carries no locatable block (missing/invalid block_height or block_hash) — an unlocatable confirmation is UNKNOWN, never finalized',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:unlocatable']),
      ],
      servedBy: status.servedBy,
    });
  }

  // Reorg detection: the remembered containing block must still match.
  const anchor =
    ctx.confirmationAnchor(input.executionRef) ??
    (input.prior?.outcome === 'CONFIRMED'
      ? { height: blockHeight, headHash: blockHash }
      : undefined);
  if (anchor !== undefined && (anchor.height !== blockHeight || anchor.headHash !== blockHash)) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: `broadcast-then-reorg: the transaction's containing block changed (was height ${anchor.height}/${anchor.headHash}, now ${blockHeight}/${blockHash}) — the outcome is ambiguous and requires reconciliation`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
          'reorg:containing-block-changed',
        ]),
      ],
      servedBy: status.servedBy,
    });
  }

  const tip = await transport.get('/blocks/tip/height');
  if (tip.kind !== 'REST_OK') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'the tip is unobservable while locating the confirmation — depth cannot be computed, so the outcome is UNKNOWN',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['tip:unobservable']),
      ],
      servedBy: status.servedBy,
    });
  }
  const tipHeight = Number(tip.body);
  if (!Number.isSafeInteger(tipHeight)) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'the observed tip height is not a safe integer — inconsistent provider data is UNKNOWN',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['tip:malformed']),
      ],
      servedBy: status.servedBy,
    });
  }
  if (blockHeight > tipHeight) {
    // Finalize-ambiguous: a confirmation above the tip is inconsistent.
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: `the confirmation claims block ${blockHeight} above the observed tip ${tipHeight} — inconsistent provider data is UNKNOWN, never finalized`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:above-tip']),
      ],
      servedBy: status.servedBy,
    });
  }
  const depth = tipHeight - blockHeight + 1;
  ctx.rememberConfirmationAnchor(input.executionRef, {
    height: blockHeight,
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
        `status:confirmed:depth-${depth}`,
      ]),
    ],
    servedBy: status.servedBy,
  });
}
