/**
 * PaySwap Desktop (P22-H, ADR-0016 D8) — the REAL Paystack execution
 * kernel behind the ExecutionAuthorityPort (the KES off-ramp lane).
 *
 * LAYER LAW (the Stripe kernel precedent): this package NEVER imports
 * @payswap/* — the kernel is a STRUCTURAL adapter over injected seams;
 * the transport seam mirrors the canonical provider-runtime call/response
 * shapes field-for-field and the battery MIRROR-ASSERTS the fidelity.
 *
 * LAWS (ADR-0016 D8 — the Stripe kernel's laws, applied to the transfer
 * surface):
 * - THE GRANT: the SANDBOX payout grant derives from the key shape,
 *   checked INSIDE the seal on EVERY dispatch (never cached):
 *   `sk_test_` bound to SANDBOX derives the payout grant;
 *   `sk_live_` is refused (INV-25 — MODE_NOT_OFFERED, the honest mode
 *   gate; the seal verb already refused it, this is the second wall);
 *   any other shape is COMMAND_REJECTED.
 * - CANCEL_OR_REVERSE_EFFECT is NOT OFFERED: a Paystack transfer, once
 *   initiated, is not cancellable through this surface — the honest
 *   path for a landed-but-unclear transfer is the verify read-back +
 *   reconciliation, never a fabricated reversal.
 * - CREATE = transfer initiate (source: balance): the leg payload's
 *   planned amount (the corridor's KES minor units — kobo) and the leg
 *   destination (the recipient code); without a leg payload the
 *   mission intent's own origin amount + destination carry the payout
 *   (the N=1 direct-payout shape). HONEST FINALITY: a 2xx without the
 *   canonical transfer shape is UNKNOWN (never a guessed success).
 * - SECRETS: the material exists only inside the seal consumer; the
 *   envelope answer is escape-scanned by the broker's withMaterial.
 */

import {
  validatePaymentDispatchCommand,
  type ExecutionAuthorityAnswer,
  type ExecutionAuthorityPort,
  type ExecutionAuthorityRefusal,
  type PaymentDispatchCommand,
} from "./execution-authority.js";
import { PaymentMissionError } from "./contracts.js";
import type { PaymentResultEnvelope } from "./contracts.js";
import type { KernelConnectionAuthoritySeam, KernelTransportSeam } from "./execution-kernel.js";
import { classify, intentFieldsOf } from "./execution-kernel.js";

/** Options (all seams injected; no ambient fetch, no ambient clock). */
export interface PaystackExecutionKernelOptions {
  readonly connectionAuthority: KernelConnectionAuthoritySeam;
  readonly transport: KernelTransportSeam;
  readonly nowMs?: () => number;
}

/** The mirrored operation ids (the D8 evidence surface). */
export const KERNEL_PAYSTACK_OPERATION_IDS = {
  initiate: "paystack.transfer.initiate",
  finalize: "paystack.transfer.finalize",
  verify: "paystack.transfer.verify",
} as const;

/** The mirrored key prefixes (the grant law's inputs). */
export const KERNEL_PAYSTACK_TEST_PREFIX = "sk_test_";
export const KERNEL_PAYSTACK_LIVE_PREFIX = "sk_live_";

/** A typed refusal raised inside the seal (mapped to the port answer). */
class PaystackKernelRefusal extends Error {
  constructor(readonly refusal: ExecutionAuthorityRefusal) {
    super(refusal.reason);
  }
}

/**
 * THE PAYOUT GRANT LAW (D8) — runs on every path, inside the seal.
 * Exported for the read-back port so the SAME grant law admits a
 * verification read — never a duplicated derivation.
 */
export function admitPaystackPayoutGrant(apiKey: string, executionMode: string): void {
  if (executionMode !== "SANDBOX") {
    throw new PaystackKernelRefusal({
      kind: "MODE_NOT_OFFERED",
      reason: `INV-25: the Paystack payout kernel is SANDBOX-only in this deployment (got ${executionMode}); a live payout lane is never derived here`,
    });
  }
  if (apiKey.startsWith(KERNEL_PAYSTACK_LIVE_PREFIX)) {
    throw new PaystackKernelRefusal({
      kind: "MODE_NOT_OFFERED",
      reason: "INV-25: a LIVE Paystack key cannot serve the SANDBOX payout kernel (test keys serve SANDBOX; live keys serve LIVE)",
    });
  }
  if (!apiKey.startsWith(KERNEL_PAYSTACK_TEST_PREFIX)) {
    throw new PaystackKernelRefusal({
      kind: "COMMAND_REJECTED",
      reason: "the sealed Paystack key does not carry the canonical test-mode prefix (sk_test_ for the SANDBOX payout grant)",
    });
  }
}

/** True iff the thrown value is the kernel's typed seal refusal (the read-back mapping aid). */
export function isPaystackKernelRefusal(thrown: unknown): thrown is PaystackKernelRefusal {
  return thrown instanceof PaystackKernelRefusal;
}

/** Read the transfer fields off a confirmed body (never guesses). */
export function transferFieldsOf(body: unknown): {
  transferCode: string | null;
  reference: string | null;
  status: string | null;
} {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { transferCode: null, reference: null, status: null };
  }
  const data = (body as { data?: unknown }).data;
  const record =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : (body as Record<string, unknown>);
  const transferCode = record["transfer_code"];
  const reference = record["reference"];
  const status = record["status"];
  return {
    transferCode: typeof transferCode === "string" && transferCode.length > 0 ? transferCode : null,
    reference: typeof reference === "string" && reference.length > 0 ? reference : null,
    status: typeof status === "string" && status.length > 0 ? status : null,
  };
}

/** The material shape the seal consumer validates (never echoes it). */
export function paystackApiKeyOf(material: unknown): string {
  if (material === null || typeof material !== "object" || Array.isArray(material)) {
    throw new PaymentMissionError("INVALID_TRANSITION", "the sealed credential material is malformed");
  }
  const apiKey = (material as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new PaymentMissionError("INVALID_TRANSITION", "the sealed credential material carries no apiKey");
  }
  return apiKey;
}

/** The internal execution result (envelope-shaped, secret-free). */
interface TransferExecutionOutcome {
  readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
  readonly transferReference: string | null;
  readonly transferStatus: string | null;
  readonly providerReferences: readonly string[];
  readonly classification: ReturnType<typeof classify>;
  readonly dispatchedAt: number;
  readonly completedAt: number;
}

/** Compose the REAL Paystack payout kernel (the KES off-ramp lane). */
export function createPaystackExecutionKernel(
  options: PaystackExecutionKernelOptions,
): ExecutionAuthorityPort {
  const nowMs = options.nowMs ?? Date.now;
  const transport = options.transport;
  const connectionAuthority = options.connectionAuthority;

  const headersOf = (apiKey: string): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
  });

  async function sendTransfer(
    apiKey: string,
    executionMode: string,
    params: Record<string, string>,
    idempotencyKey: string,
    dispatchedAt: number,
  ): Promise<TransferExecutionOutcome> {
    admitPaystackPayoutGrant(apiKey, executionMode);
    const response = await transport.send({
      operationId: KERNEL_PAYSTACK_OPERATION_IDS.initiate,
      idempotencyKey,
      params,
      headers: headersOf(apiKey),
      correlationId: `paystack-kernel:${KERNEL_PAYSTACK_OPERATION_IDS.initiate}:${String(dispatchedAt)}`,
    });
    const classification = classify(response);
    if (classification.outcome === "CONFIRMED") {
      const initiated = transferFieldsOf(response.body);
      if (initiated.transferCode === null || initiated.status === null) {
        // HONEST FINALITY: a 2xx without the transfer shape is UNKNOWN.
        return {
          outcome: "UNKNOWN",
          transferReference: initiated.reference,
          transferStatus: null,
          providerReferences: Object.freeze(initiated.reference !== null ? [initiated.reference] : []),
          classification: { outcome: "UNKNOWN", ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" },
          dispatchedAt,
          completedAt: nowMs(),
        };
      }
      return {
        outcome: "CONFIRMED",
        transferReference: initiated.reference,
        transferStatus: initiated.status,
        providerReferences: Object.freeze([
          ...(initiated.reference !== null ? [initiated.reference] : []),
          initiated.transferCode,
          initiated.status,
        ]),
        classification,
        dispatchedAt,
        completedAt: nowMs(),
      };
    }
    return {
      outcome: classification.outcome,
      transferReference: null,
      transferStatus: null,
      providerReferences: Object.freeze([]),
      classification,
      dispatchedAt,
      completedAt: nowMs(),
    };
  }

  function toEnvelope(execution: TransferExecutionOutcome): PaymentResultEnvelope {
    const envelope: {
      -readonly [K in keyof PaymentResultEnvelope]: PaymentResultEnvelope[K];
    } = {
      outcome: execution.outcome,
      providerReferences: [...execution.providerReferences],
      dispatchedAt: execution.dispatchedAt,
      completedAt: execution.completedAt,
    };
    if (execution.outcome === "UNKNOWN") {
      envelope.ambiguityReason = execution.classification.ambiguityReason ?? "MALFORMED_RESPONSE_AFTER_DISPATCH";
      envelope.providerFailure = { retryable: true, ambiguity: "OUTCOME_UNKNOWN" };
    } else if (execution.outcome === "FAILED") {
      envelope.providerFailure = {
        providerErrorCode: execution.classification.providerErrorCode,
        providerErrorMessage: execution.classification.providerErrorMessage,
        retryable: execution.classification.retryable ?? false,
        ambiguity: "NONE",
      };
    }
    return Object.freeze(envelope);
  }

  return {
    async dispatch(command: PaymentDispatchCommand): Promise<ExecutionAuthorityAnswer> {
      validatePaymentDispatchCommand(command);
      // ---- admission (outside the seal; no material involved) ----
      const statuses = await connectionAuthority.connectionStatuses();
      const connection = statuses.find((s) => s.connectionId === command.connectionRef);
      if (connection === undefined || connection.state !== "ACTIVE") {
        return {
          kind: "REFUSED",
          refusal: {
            kind: "CONNECTION_NOT_ACTIVE",
            reason: `the executing connection '${command.connectionRef}' is not ACTIVE (catalogue entries, sealed-but-unverified and revoked connections never dispatch)`,
          },
        };
      }
      if (connection.executionMode !== command.executionMode) {
        return {
          kind: "REFUSED",
          refusal: {
            kind: "MODE_NOT_OFFERED",
            reason: `the connection's execution mode (${connection.executionMode}) does not match the command's (INV-25: ${command.executionMode})`,
          },
        };
      }
      if (command.operation === "CANCEL_OR_REVERSE_EFFECT") {
        return {
          kind: "REFUSED",
          refusal: {
            kind: "COMMAND_REJECTED",
            reason:
              "a Paystack transfer, once initiated, is not cancellable through this surface — the honest path for a landed-but-unclear transfer is the transfer-verify read-back and reconciliation, never a fabricated reversal",
          },
        };
      }

      const dispatchedAt = nowMs();
      try {
        // ---- the seal: everything below runs on the sealed material ----
        const execution = await connectionAuthority.withSealedCredential(
          command.connectionRef,
          async (material) => {
            const apiKey = paystackApiKeyOf(material);
            // The payout facts: the leg payload's planned amount +
            // destination when the corridor dispatched this leg; the
            // mission intent's own origin amount + destination for the
            // N=1 direct-payout shape.
            const amount = command.leg?.plannedAmount.minorUnits ?? command.intent.originAmount.minorUnits;
            const currency = (command.leg?.plannedAmount.currency ?? command.intent.originAmount.currency).toLowerCase();
            const recipient = command.leg?.destinationRef ?? command.intent.destination.locationRef;
            if (!/^\d+$/.test(amount) || !/^[a-z]{3}$/.test(currency)) {
              throw new PaystackKernelRefusal({
                kind: "COMMAND_REJECTED",
                reason: "the payout amount/currency is not dispatchable (exact minor units + a lowercase 3-letter ISO currency required)",
              });
            }
            if (typeof recipient !== "string" || recipient.length === 0) {
              throw new PaystackKernelRefusal({
                kind: "COMMAND_REJECTED",
                reason: "the payout requires a recipient (the leg's destination or the intent's destination location reference)",
              });
            }
            const params: Record<string, string> = {
              source: "balance",
              amount,
              recipient,
              currency,
            };
            if (command.leg !== undefined) {
              params["reason"] = `corridor leg ${String(command.leg.legIndex)} (${command.leg.legKind})`.slice(0, 480);
            }
            return sendTransfer(apiKey, command.executionMode, params, command.idempotencyKey, dispatchedAt);
          },
          `paystack-payout-dispatch:${command.attemptId}`,
        );
        return { kind: "ENVELOPE", envelope: toEnvelope(execution) };
      } catch (error) {
        if (error instanceof PaystackKernelRefusal) {
          return { kind: "REFUSED", refusal: error.refusal };
        }
        if (error instanceof PaymentMissionError) {
          return {
            kind: "REFUSED",
            refusal: { kind: "COMMAND_REJECTED", reason: error.message },
          };
        }
        throw error;
      }
    },
  };
}

// intentFieldsOf re-exported for the read-back's shared use (the mirror
// surface the battery asserts).
export { intentFieldsOf };
