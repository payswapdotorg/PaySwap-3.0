/**
 * @payswap/onchain-adapters — EVM broadcast stage (Work Order P4-W3, lane
 * R2-W3; extracted from the ported EvmChainAdapter to honor the
 * <=400-line file law).
 *
 * eth_sendRawTransaction with the deterministic EVM node-rejection
 * classification table; unclassified errors and transport failure after
 * submission → OUTCOME_UNKNOWN (it is unknown whether the operation
 * reached the chain — never a transport failure class).
 */

import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { BroadcastStageOutcome } from '../contract/stage-io.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type { SigningRequest } from '../pins/onchain-security/signing.ts';
import type { RpcTransport, ServedBy } from '../transport.ts';
import { hexQuantityToDecimal } from '../transport.ts';
import { EVM_HEX_QUANTITY } from './encoding.ts';

/** The EVM broadcast stage (assertBroadcastable runs in the adapter). */
export async function evmBroadcast(
  ctx: FamilyStageContext,
  transport: RpcTransport,
  input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  },
): Promise<BroadcastStageOutcome> {
  const submission = await transport.call('eth_sendRawTransaction', [input.signedPayload]);
  if (submission.kind === 'RPC_OK') {
    if (typeof submission.result !== 'string' || !EVM_HEX_QUANTITY.test(submission.result)) {
      const observation = ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason:
          'the node accepted the submission but returned a non-transaction-hash result — it is unknown whether the operation reached the chain',
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
      externalOperationRef: submission.result,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [`tx:${submission.result}`]),
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
  const observation = classifyEvmNodeRejection(ctx, input, submission.message, submission.servedBy);
  ctx.recordObservedOutcome(observation);
  return observation;
}

/** The deterministic EVM node-rejection classification table. */
function classifyEvmNodeRejection(
  ctx: FamilyStageContext,
  input: { readonly executionRef: string; readonly at: number },
  rawMessage: string,
  servedBy: ServedBy,
): BroadcastStageOutcome {
  const message = rawMessage.toLowerCase();
  if (
    message.includes('already known') ||
    message.includes('already imported') ||
    message.includes('known transaction')
  ) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'BROADCAST',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['submission:already-known']),
      ],
      servedBy,
    });
  }
  if (message.includes('insufficient funds')) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'INSUFFICIENT_FUNDS',
        description: `the node definitively rejected the submission before inclusion: ${rawMessage}`,
        retryGuidance: 'SAFE_TO_RETRY',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [
          'rejection:insufficient-funds',
        ]),
      ],
      servedBy,
    });
  }
  if (message.includes('nonce too low') || message.includes('sequence number too low')) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'REJECTED',
        description: `the node definitively rejected the submission (nonce already consumed): ${rawMessage}`,
        retryGuidance: 'REQUIRES_RECONCILIATION',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['rejection:nonce-too-low']),
      ],
      servedBy,
    });
  }
  if (
    message.includes('underpriced') ||
    message.includes('gas price too low') ||
    message.includes('fee too low')
  ) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'REJECTED',
        description: `the node definitively rejected the submission (mempool fee policy): ${rawMessage}`,
        retryGuidance: 'SAFE_TO_RETRY',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['rejection:underpriced']),
      ],
      servedBy,
    });
  }
  // Unclassified node error after a submission attempt: UNKNOWN.
  return ctx.buildExecutionObservation({
    executionRef: input.executionRef,
    observedAt: input.at,
    outcome: 'OUTCOME_UNKNOWN',
    unknownReason: `unclassified node response after the submission attempt ('${rawMessage}'): it is unknown whether the operation reached the chain`,
    evidenceRefs: [
      ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['submission:unclassified']),
    ],
    servedBy,
  });
}
