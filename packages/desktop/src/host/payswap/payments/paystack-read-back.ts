/**
 * PaySwap Desktop (P22-H, ADR-0016 D8) — the Paystack TRANSFER-VERIFY
 * READ-BACK port (the stripe-read-back precedent applied to the payout
 * lane): the AUTHORITATIVE provider read that verifies a CONFIRMED
 * transfer attempt — `GET /transfer/{reference}` through the REAL
 * transport inside the credential seal, under the SAME payout grant law
 * as the kernel (never a duplicated derivation).
 *
 * HONEST FINALITY: CONFIRMED requires a well-formed transfer status on
 * a delivered 2xx — a malformed body is UNKNOWN (never a guessed
 * status); a delivered error is FAILED; the read-back has NO refusal
 * channel (the stripe-read-back law): the typed refusals throw
 * PaymentMissionError("VERIFICATION_REFUSED").
 */

import { PaymentMissionError } from "./contracts.js";
import type { KernelConnectionAuthoritySeam, KernelTransportSeam } from "./execution-kernel.js";
import { classify } from "./execution-kernel.js";
import {
  admitPaystackPayoutGrant,
  isPaystackKernelRefusal,
  KERNEL_PAYSTACK_OPERATION_IDS,
  paystackApiKeyOf,
  transferFieldsOf,
} from "./paystack-execution-kernel.js";

/** The typed read-back result (the three-valued outcome + the provider status). */
export interface PaystackTransferReadBackResult {
  readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
  readonly transferReference: string;
  /** The provider-reported transfer status (success / pending / failed / …). */
  readonly transferStatus: string | null;
}

/** The read-back port (the verify channel member composes the lane-aware form). */
export interface PaystackTransferReadBackPort {
  readBack(input: {
    readonly connectionRef: string;
    /** The transfer reference (or code) the attempt's envelope recorded. */
    readonly transferReference: string;
    readonly executionMode: string;
  }): Promise<PaystackTransferReadBackResult>;
}

/** Options (all seams injected — the stripe-read-back precedent). */
export interface PaystackReadBackOptions {
  readonly connectionAuthority: KernelConnectionAuthoritySeam;
  readonly transport: KernelTransportSeam;
  readonly nowMs?: () => number;
}

/** Compose the REAL Paystack transfer-verify read-back. */
export function createPaystackTransferReadBack(options: PaystackReadBackOptions): PaystackTransferReadBackPort {
  const nowMs = options.nowMs ?? Date.now;
  return {
    async readBack(input) {
      // Admission mirrors the kernel (outside the seal).
      const statuses = await options.connectionAuthority.connectionStatuses();
      const connection = statuses.find((s) => s.connectionId === input.connectionRef);
      if (connection === undefined || connection.state !== "ACTIVE") {
        throw new PaymentMissionError(
          "VERIFICATION_REFUSED",
          `the read-back connection '${input.connectionRef}' is not ACTIVE — an authoritative read-back is never fabricated`,
        );
      }
      if (typeof input.transferReference !== "string" || input.transferReference.length === 0) {
        throw new PaymentMissionError(
          "VERIFICATION_REFUSED",
          "the read-back requires the transfer reference the attempt's envelope recorded",
        );
      }
      try {
        // The read runs inside the seal under the SAME grant law.
        return await options.connectionAuthority.withSealedCredential(
          input.connectionRef,
          async (material) => {
            const apiKey = paystackApiKeyOf(material);
            admitPaystackPayoutGrant(apiKey, input.executionMode);
            const response = await options.transport.send({
              operationId: KERNEL_PAYSTACK_OPERATION_IDS.verify,
              idempotencyKey: `paystack-readback:${input.transferReference}`,
              params: { id: input.transferReference },
              headers: { Authorization: `Bearer ${apiKey}` },
              correlationId: `paystack-kernel:${KERNEL_PAYSTACK_OPERATION_IDS.verify}:${String(nowMs())}`,
            });
            const classification = classify(response);
            if (classification.outcome !== "CONFIRMED") {
              if (classification.outcome === "UNKNOWN") {
                return { outcome: "UNKNOWN" as const, transferReference: input.transferReference, transferStatus: null };
              }
              return { outcome: "FAILED" as const, transferReference: input.transferReference, transferStatus: null };
            }
            const verified = transferFieldsOf(response.body);
            if (verified.status === null) {
              // A 2xx without the transfer shape: UNKNOWN (never a guess).
              return { outcome: "UNKNOWN" as const, transferReference: input.transferReference, transferStatus: null };
            }
            return {
              outcome: "CONFIRMED" as const,
              transferReference: verified.reference ?? input.transferReference,
              transferStatus: verified.status,
            };
          },
          `paystack-transfer-readback:${input.transferReference}`,
        );
      } catch (error) {
        if (isPaystackKernelRefusal(error)) {
          throw new PaymentMissionError("VERIFICATION_REFUSED", error.refusal.reason);
        }
        if (error instanceof PaymentMissionError) {
          throw new PaymentMissionError("VERIFICATION_REFUSED", error.message);
        }
        throw error;
      }
    },
  };
}
