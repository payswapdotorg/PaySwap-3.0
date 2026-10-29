/**
 * @payswap/onchain-adapters — the Stellar family broadcast + observe-result
 * stages over the Horizon REST surface (P22-A, lane 3-a; ADR-0016 D2/D4).
 *
 * broadcast: POST /transactions with the trusted-surface-signed envelope —
 * the deterministic Horizon rejection classification table (definitive
 * pre-chain rejections are FAILED with their class; transport failure and
 * ambiguous statuses after the submission attempt are OUTCOME_UNKNOWN,
 * never failure).
 *
 * observe (result): GET /transactions/{hash} — 404 is still in flight
 * (BROADCAST); successful: true is CONFIRMED with a finality CANDIDATE
 * (closed-ledger depth, DETERMINISTIC-class, no reorg surface);
 * successful: false is a definitive on-chain FAILED. Stellar closed ledgers
 * do not reorganize — the prior-CONFIRMED ambiguity path is structurally
 * absent (reorg detection is NOT_APPLICABLE by consensus).
 */

import type { FamilyStageContext } from '../lifecycle/stage-context.ts';
import type { BroadcastStageOutcome } from '../contract/stage-io.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';
import type { SigningRequest } from '../pins/onchain-security/signing.ts';
import type { RestTransport } from '../transport.ts';

const STRKEY_CONTRACT = /^C[A-Z2-7]{55}$/;

/** The typed view of a Horizon transaction-submission rejection. */
interface HorizonRejectionCodes {
  readonly transaction?: unknown;
  readonly operations?: unknown;
}

/**
 * The Stellar broadcast stage. The signed payload is the trusted surface's
 * base64 transaction envelope; the adapter POSTs it opaquely (it never
 * signs and never interprets signing material).
 */
export async function stellarBroadcast(
  ctx: FamilyStageContext,
  transport: RestTransport,
  input: {
    readonly handoff: SigningRequest;
    readonly signedPayload: string;
    readonly at: number;
    readonly executionRef: string;
  },
): Promise<BroadcastStageOutcome> {
  const submission = await transport.post(
    '/transactions',
    `tx=${encodeURIComponent(input.signedPayload)}`,
    'application/x-www-form-urlencoded',
  );
  if (submission.kind === 'REST_OK') {
    const hash = (submission.body as { hash?: unknown } | null)?.hash;
    if (typeof hash !== 'string' || hash.length === 0) {
      const observation = ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason:
          'Horizon accepted the submission but returned no transaction hash — it is unknown whether the operation reached the chain',
        evidenceRefs: [
          ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['submission:malformed-result']),
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
      externalOperationRef: hash,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, [`tx:${hash}`]),
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
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['submission:transport-unreachable']),
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
  // A 400-class response carries Horizon's result codes: DEFINITIVE
  // pre-chain rejections classify; anything else (rate limits, gateway
  // errors after the attempt) is OUTCOME_UNKNOWN — the submission's fate
  // is unknown, never guessed.
  if (submission.status === 400) {
    const codes = (submission.body as { extras?: { result_codes?: HorizonRejectionCodes } } | null)
      ?.extras?.result_codes;
    const transactionCode = codes?.transaction;
    if (typeof transactionCode !== 'string') {
      return stellarUnknownSubmission(ctx, transport, input, submission.message);
    }
    const outcome = stellarClassifyRejection(
      ctx,
      input,
      transactionCode,
      submission.servedBy,
    );
    ctx.recordObservedOutcome(outcome);
    return outcome;
  }
  return stellarUnknownSubmission(ctx, transport, input, submission.message);
}

function stellarUnknownSubmission(
  ctx: FamilyStageContext,
  transport: RestTransport,
  input: {
    readonly at: number;
    readonly executionRef: string;
  },
  message: string,
): BroadcastStageOutcome {
  const observation = ctx.buildExecutionObservation({
    executionRef: input.executionRef,
    observedAt: input.at,
    outcome: 'OUTCOME_UNKNOWN',
    unknownReason: `unclassified Horizon status after the submission attempt ('${message}'): it is unknown whether the operation reached the chain`,
    evidenceRefs: [
      ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['submission:unclassified']),
    ],
    servedBy: { transportId: transport.transportId, endpointId: 'none', providerName: 'unreachable' },
  });
  ctx.recordObservedOutcome(observation);
  return observation;
}

/** The deterministic Horizon transaction-result classification table. */
function stellarClassifyRejection(
  ctx: FamilyStageContext,
  input: {
    readonly at: number;
    readonly executionRef: string;
  },
  transactionCode: string,
  servedBy: { readonly transportId: string; readonly endpointId: string; readonly providerName: string },
): BroadcastStageOutcome {
  if (transactionCode === 'tx_insufficient_balance') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'INSUFFICIENT_FUNDS',
        description: `Horizon definitively rejected the submission (tx_insufficient_balance): the account cannot cover amount + fees`,
        retryGuidance: 'SAFE_TO_RETRY',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['rejection:insufficient-balance']),
      ],
      servedBy,
    });
  }
  if (transactionCode === 'tx_too_late' || transactionCode === 'tx_too_early') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'EXPIRED',
        description: `Horizon definitively rejected the submission (${transactionCode}): the transaction's time bounds exclude the current ledger`,
        retryGuidance: 'SAFE_TO_RETRY',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['rejection:time-bounds']),
      ],
      servedBy,
    });
  }
  if (transactionCode === 'tx_bad_seq') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'PROVIDER_DEFINED',
        description:
          'Horizon definitively rejected the submission (tx_bad_seq): the account sequence moved since preparation — re-prepare mints a NEW operation',
        retryGuidance: 'SAFE_TO_RETRY',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['rejection:bad-sequence']),
      ],
      servedBy,
    });
  }
  if (transactionCode === 'tx_malformed') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      outcome: 'FAILED',
      failure: {
        failureClass: 'REJECTED',
        description:
          'Horizon definitively rejected the submission (tx_malformed): the transaction envelope itself is malformed — fix the envelope before any retry',
        retryGuidance: 'NOT_RETRYABLE',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'broadcast', input.at, ['rejection:malformed']),
      ],
      servedBy,
    });
  }
  // Known-but-unclassified definitive rejections (tx_failed and siblings):
  // definitive, but the class is provider-defined; conservative guidance.
  return ctx.buildExecutionObservation({
    executionRef: input.executionRef,
    observedAt: input.at,
    outcome: 'FAILED',
    failure: {
      failureClass: 'PROVIDER_DEFINED',
      description: `Horizon definitively rejected the submission (${transactionCode}) — a definitive pre-chain rejection`,
      retryGuidance: 'REQUIRES_RECONCILIATION',
    },
    evidenceRefs: [
      ctx.logEvidence(input.executionRef, 'broadcast', input.at, [`rejection:${transactionCode}`]),
    ],
    servedBy,
  });
}

/** The Stellar observe-result stage (the transaction resource + closed-ledger depth). */
export async function stellarObserveOperation(
  ctx: FamilyStageContext,
  transport: RestTransport,
  input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  },
): Promise<BroadcastStageOutcome> {
  const observation = await stellarObserveOperationInner(ctx, transport, input);
  ctx.recordObservedOutcome(observation);
  return observation;
}

async function stellarObserveOperationInner(
  ctx: FamilyStageContext,
  transport: RestTransport,
  input: {
    readonly executionRef: string;
    readonly externalOperationRef: string;
    readonly at: number;
    readonly prior?: OnchainExecutionObservation;
  },
): Promise<BroadcastStageOutcome> {
  const tx = await transport.get(`/transactions/${input.externalOperationRef}`);
  if (tx.kind === 'TRANSPORT_UNREACHABLE' || tx.kind === 'REST_ERROR') {
    if (tx.kind === 'REST_ERROR' && tx.status === 404) {
      // Not yet seen on the rail: still in flight (submitted ≠ finality).
      return ctx.buildExecutionObservation({
        executionRef: input.executionRef,
        observedAt: input.at,
        externalOperationRef: input.externalOperationRef,
        outcome: 'BROADCAST',
        evidenceRefs: [
          ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['tx:not-seen']),
        ],
        servedBy: tx.servedBy,
      });
    }
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        tx.kind === 'TRANSPORT_UNREACHABLE'
          ? 'the transaction resource is unobservable (rail unreachable) — the outcome is UNKNOWN, not failed'
          : `unclassified Horizon error observing the transaction ('${tx.message}') — the outcome is UNKNOWN`,
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['tx:unobservable']),
      ],
      servedBy:
        tx.kind === 'TRANSPORT_UNREACHABLE'
          ? { transportId: transport.transportId, endpointId: 'none', providerName: 'unreachable' }
          : tx.servedBy,
    });
  }
  const body = tx.body as { successful?: unknown; ledger?: unknown } | null;
  const successful = body?.successful;
  const ledger = body?.ledger;
  if (typeof successful !== 'boolean') {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'the Horizon transaction resource carries no `successful` flag — an unparseable result is UNKNOWN, never guessed',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['tx:unparseable']),
      ],
      servedBy: tx.servedBy,
    });
  }
  if (!successful) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'FAILED',
      failure: {
        failureClass: 'REVERTED',
        description:
          'the transaction executed and FAILED on-chain (successful: false) — definitive execution failure; a retry mints a NEW operation',
        retryGuidance: 'NOT_RETRYABLE',
      },
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['tx:failed']),
      ],
      servedBy: tx.servedBy,
    });
  }
  if (typeof ledger !== 'number' || !Number.isSafeInteger(ledger) || ledger < 1) {
    return ctx.buildExecutionObservation({
      executionRef: input.executionRef,
      observedAt: input.at,
      externalOperationRef: input.externalOperationRef,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason:
        'the confirmed transaction carries no parseable containing ledger — the closed-ledger depth is unobservable and the outcome is UNKNOWN',
      evidenceRefs: [
        ctx.logEvidence(input.executionRef, 'observeResult', input.at, ['tx:ledger-unparseable']),
      ],
      servedBy: tx.servedBy,
    });
  }
  // CONFIRMED: a finality CANDIDATE only (finality is protocol-owned). The
  // closed-ledger depth counts ledgers from the containing ledger onward.
  ctx.rememberConfirmationAnchor(input.executionRef, {
    height: ledger,
    headHash: input.externalOperationRef,
  });
  const depth = 1;
  return ctx.buildExecutionObservation({
    executionRef: input.executionRef,
    observedAt: input.at,
    externalOperationRef: input.externalOperationRef,
    outcome: 'CONFIRMED',
    finalityCandidate: {
      candidateOnly: true,
      requiresProtocolFinality: true,
      confirmationDepth: depth,
      finalityModel: 'DETERMINISTIC',
      reorgDetected: false,
    },
    evidenceRefs: [
      ctx.logEvidence(input.executionRef, 'observeResult', input.at, [
        `tx:confirmed:ledger-${ledger}`,
      ]),
    ],
    servedBy: tx.servedBy,
  });
}

/** Structural guard for a deployed contract id (the `C…` StrKey shape). */
export function isStellarContractId(value: unknown): value is string {
  return typeof value === 'string' && STRKEY_CONTRACT.test(value);
}
