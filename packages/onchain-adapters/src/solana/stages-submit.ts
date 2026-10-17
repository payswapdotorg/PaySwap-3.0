/**
 * @payswap/onchain-adapters — Solana broadcast + observe-result stages
 * (Work Order P4-W3, lane R2-W3; extracted from the ported
 * SolanaChainAdapter to honor the <=400-line file law).
 *
 * broadcast: sendTransaction with the deterministic Solana node-rejection
 * classification table; unclassified errors and transport failure after
 * submission → OUTCOME_UNKNOWN.
 *
 * observe (result): getSignatureStatuses with fork detection — a prior
 * CONFIRMED status that disappears or moves to a different slot →
 * OUTCOME_UNKNOWN (fork ambiguity).
 */

import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { BroadcastStageOutcome } from '../contract/stage-io.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type { SigningRequest } from '../pins/onchain-security/signing.ts';
import type { RpcTransport } from '../transport.ts';

/** The Solana broadcast stage (assertBroadcastable runs in the adapter). */
export async function solanaBroadcast(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  },
): Promise<BroadcastStageOutcome> {
  const submission = await transport.call('sendTransaction', [
    input.signedPayload,
    { encoding: 'base64', skipPreflight: false },
  ]);
  if (submission.kind === 'RPC_OK') {
    const signature = submission.result;
    if (typeof signature !== 'string' || signature.length === 0) {
      const observation = ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason:
          'the node accepted the submission but returned no signature — it is unknown whether the operation reached the chain',
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
      externalOperationRef: signature,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [`sig:${signature}`]),
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
  let outcome: BroadcastStageOutcome;
  if (message.includes('already processed') || message.includes('already in block')) {
    outcome = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'BROADCAST',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [
          'submission:already-processed',
        ]),
      ],
      servedBy: submission.servedBy,
    });
  } else if (message.includes('blockhash not found') || message.includes('has expired')) {
    outcome = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'EXPIRED',
        description: `the node definitively rejected the submission (blockhash expired): ${submission.message}`,
        retryGuidance: 'SAFE_TO_RETRY',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [
          'rejection:blockhash-expired',
        ]),
      ],
      servedBy: submission.servedBy,
    });
  } else if (
    message.includes('insufficient lamports') ||
    message.includes('insufficient funds')
  ) {
    outcome = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'INSUFFICIENT_FUNDS',
        description: `the node definitively rejected the submission: ${submission.message}`,
        retryGuidance: 'SAFE_TO_RETRY',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [
          'rejection:insufficient-funds',
        ]),
      ],
      servedBy: submission.servedBy,
    });
  } else {
    outcome = ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: `unclassified node response after the submission attempt ('${submission.message}'): it is unknown whether the operation reached the chain`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['submission:unclassified']),
      ],
      servedBy: submission.servedBy,
    });
  }
  ctx.recordObservedOutcome(outcome);
  return outcome;
}

/** The Solana observe-result stage (signature statuses + fork detection). */
export async function solanaObserveOperation(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  },
): Promise<BroadcastStageOutcome> {
  const observation = await solanaObserveOperationInner(ctx, transport, input);
  ctx.recordObservedOutcome(observation);
  return observation;
}

async function solanaObserveOperationInner(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  },
): Promise<BroadcastStageOutcome> {
  const statuses = await transport.call('getSignatureStatuses', [
    [input.externalOperationRef],
    { searchTransactionHistory: false },
  ]);
  if (statuses.kind !== 'RPC_OK') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        statuses.kind === 'TRANSPORT_UNREACHABLE'
          ? 'the signature status is unobservable (rail unreachable) — the outcome is UNKNOWN, not failed'
          : `unclassified provider error observing the signature status ('${statuses.message}') — the outcome is UNKNOWN`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:unobservable']),
      ],
      servedBy:
        statuses.kind === 'TRANSPORT_UNREACHABLE'
          ? { transportId: transport.transportId, endpointId: 'none', providerName: 'unreachable' }
          : statuses.servedBy,
    });
  }
  const value = (statuses.result as { value?: unknown[] } | null)?.value;
  const status = Array.isArray(value) ? (value[0] as Record<string, unknown> | null) : undefined;
  if (status === null || status === undefined) {
    if (input.prior?.outcome === 'CONFIRMED') {
      // Fork/reorg: a previously confirmed signature is no longer visible
      // at the queried commitment — ambiguity.
      return ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        externalOperationRef: input.externalOperationRef,
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason:
          'broadcast-then-fork: the signature status DISAPPEARED after a prior CONFIRMED observation (the containing fork was dropped or the status aged out of the recent-history window) — the outcome is ambiguous and requires reconciliation',
        evidenceRefs: [
          ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
            'fork:status-disappeared',
          ]),
        ],
        servedBy: statuses.servedBy,
      });
    }
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'BROADCAST',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:not-seen']),
      ],
      servedBy: statuses.servedBy,
    });
  }
  const err = status['err'];
  if (err !== null && err !== undefined) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'FAILED',
      failure: {
        failureClass: 'PROVIDER_DEFINED',
        description: `the transaction executed and FAILED on-chain (err: ${JSON.stringify(err)}) — definitive execution failure`,
        retryGuidance: 'REQUIRES_RECONCILIATION',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:err']),
      ],
      servedBy: statuses.servedBy,
    });
  }
  const slot = status['slot'];
  const confirmations = status['confirmations'];
  const confirmationStatus = status['confirmationStatus'];
  // Fork detection: a prior confirmation at a different slot.
  const anchor =
    ctx.confirmationAnchor(input.executionRef) ??
    (input.prior?.outcome === 'CONFIRMED'
      ? { height: Number(slot ?? 0), headHash: input.externalOperationRef }
      : undefined);
  if (anchor !== undefined && typeof slot === 'number' && slot !== anchor.height) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: `broadcast-then-fork: the signature's slot changed (was ${anchor.height}, now ${slot}) — the transaction confirmed on a different fork version; the outcome is ambiguous and requires reconciliation`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['fork:slot-changed']),
      ],
      servedBy: statuses.servedBy,
    });
  }
  const head = await transport.call('getSlot', [{ commitment: 'confirmed' }]);
  if (
    head.kind === 'RPC_OK' &&
    typeof head.result === 'number' &&
    typeof slot === 'number' &&
    slot > head.result
  ) {
    // Inconsistent provider data (status above the head): ambiguous.
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: `the status claims slot ${slot} above the observed head slot ${head.result} — inconsistent provider data is UNKNOWN, never finalized`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:above-head']),
      ],
      servedBy: statuses.servedBy,
    });
  }
  if (confirmationStatus === 'finalized' || confirmationStatus === 'confirmed') {
    const depth = (typeof confirmations === 'number' ? confirmations : 0) + 1;
    if (typeof slot === 'number') {
      ctx.rememberConfirmationAnchor(input.executionRef, {
        height: slot,
        headHash: input.externalOperationRef,
      });
    }
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
      servedBy: statuses.servedBy,
    });
  }
  // Processed-level or missing commitment: still in flight (not final).
  return ctx.buildExecutionObservation({
    executionRef: input.executionRef,
    observedAt: input.at,
    externalOperationRef: input.externalOperationRef,
    outcome: 'BROADCAST',
    evidenceRefs: [
      ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['status:processed-only']),
    ],
    servedBy: statuses.servedBy,
  });
}
