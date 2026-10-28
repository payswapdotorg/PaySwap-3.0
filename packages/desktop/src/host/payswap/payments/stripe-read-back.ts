/**
 * PaySwap Desktop (P21-D reviewer-gate, Gap C) — the STRIPE READ-BACK
 * PORT: the authoritative retrieval of a PaymentIntent's terminal state
 * INSIDE the credential seal, over the SAME seams as the execution kernel
 * (ADR-0008 D1's port discipline, applied to the read side).
 *
 * THE LAW (the reviewer's Gap C contract): a CONFIRMED dispatch — one
 * resolved by the authority's own answer, no ambiguity ever existing —
 * can complete the final stage through a TYPED, PERSISTED verification
 * result derived from this read-back. An ambiguous outcome NEVER reads
 * back into a verification: it stays UNKNOWN and requires the actual
 * reconciliation path (the runtime's verify operation enforces that law
 * over the pure decision in ./attempt-verification.ts).
 *
 * NEVER GUESS A STATUS: the read-back classifies by the kernel's own
 * INV-04 discipline — 2xx + a well-formed {id, status} body → CONFIRMED
 * with the observed status; non-2xx → FAILED; undelivered (timeout /
 * lost connection / malformed body) → UNKNOWN; a malformed body on a
 * 2xx → UNKNOWN (never a guessed terminal state). The grant law and the
 * seal-material shape are the KERNEL'S OWN exports (admitGrant /
 * apiKeyOf / classify / intentFieldsOf) — no duplicated logic.
 *
 * SECRETS: the material exists only inside the seal consumer; nothing
 * here logs, and the result carries the observed status + the intent id
 * only (both already provider-side public references on the envelope).
 */

import { PaymentMissionError } from "./contracts.js";
import {
  KERNEL_STRIPE_OPERATION_IDS,
  admitGrant,
  apiKeyOf,
  classify,
  intentFieldsOf,
  isKernelRefusal,
  type KernelConnectionAuthoritySeam,
  type KernelTransportSeam,
} from "./execution-kernel.js";

/** The typed read-back result (the three-valued INV-04 vocabulary). */
export interface StripeReadBackResult {
  readonly outcome: "CONFIRMED" | "FAILED" | "UNKNOWN";
  readonly paymentIntentId: string;
  readonly paymentIntentStatus: string | null;
}

/** The read-back port (the runtime's verify operation consumes it as a parameter — the channel member supplies it). */
export interface StripeReadBackPort {
  readBack(input: {
    readonly connectionRef: string;
    readonly paymentIntentId: string;
    readonly executionMode: "SANDBOX" | "LIVE";
  }): Promise<StripeReadBackResult>;
}

/** Options (all seams injected; no ambient fetch, no ambient clock). */
export interface StripeReadBackOptions {
  readonly connectionAuthority: KernelConnectionAuthoritySeam;
  readonly transport: KernelTransportSeam;
  readonly nowMs?: () => number;
}

/** Map the kernel's typed seal refusal onto the mission-plane typed error (the read-back has no refusal channel — a condition under which no read could happen is a typed throw, never a fabricated outcome; the mission id is attached by the runtime layer that knows it). */
function refusalOf(thrown: unknown): PaymentMissionError {
  if (isKernelRefusal(thrown)) {
    return new PaymentMissionError(
      "VERIFICATION_REFUSED",
      `the read-back was refused before any retrieval (${thrown.refusal.kind}): ${thrown.refusal.reason}`,
    );
  }
  return thrown instanceof PaymentMissionError
    ? thrown
    : new PaymentMissionError("VERIFICATION_REFUSED", "the read-back could not run");
}

/**
 * Compose the read-back port over the kernel's own seams. The flow
 * mirrors the kernel's dispatch admission exactly (CONNECTION_NOT_ACTIVE /
 * MODE_NOT_OFFERED — outside the seal), then everything inside the seal:
 * the material shape, the grant law, the retrieval call
 * (stripe.payment_intent.retrieve → GET /v1/payment_intents/{id}), and
 * the kernel's own classification.
 */
export function createStripeReadBack(options: StripeReadBackOptions): StripeReadBackPort {
  const nowMs = options.nowMs ?? Date.now;
  const transport = options.transport;
  const connectionAuthority = options.connectionAuthority;
  return {
    async readBack(input) {
      // ---- admission (outside the seal; mirrors the kernel's dispatch admission) ----
      const statuses = await connectionAuthority.connectionStatuses();
      const connection = statuses.find((s) => s.connectionId === input.connectionRef);
      if (connection === undefined || connection.state !== "ACTIVE") {
        throw new PaymentMissionError(
          "VERIFICATION_REFUSED",
          `the read-back connection '${input.connectionRef}' is not ACTIVE (catalogue entries, sealed-but-unverified and revoked connections never read back)`,
        );
      }
      if (connection.executionMode !== input.executionMode) {
        throw new PaymentMissionError(
          "VERIFICATION_REFUSED",
          `the read-back connection's execution mode (${connection.executionMode}) does not match the attempt's (INV-25: ${input.executionMode})`,
        );
      }
      const dispatchedAt = nowMs();
      try {
        // ---- the seal: everything below runs on the sealed material ----
        return await connectionAuthority.withSealedCredential(
          input.connectionRef,
          async (material) => {
            const apiKey = apiKeyOf(material);
            admitGrant(apiKey, input.executionMode);
            const response = await transport.send({
              operationId: KERNEL_STRIPE_OPERATION_IDS.retrieve,
              idempotencyKey: `readback:${input.paymentIntentId}:${String(dispatchedAt)}`,
              params: { id: input.paymentIntentId },
              headers: { Authorization: `Bearer ${apiKey}` },
              correlationId: `kernel:readback:${input.paymentIntentId}:${String(dispatchedAt)}`,
            });
            const classification = classify(response);
            if (classification.outcome === "CONFIRMED") {
              // NEVER guess: a malformed body on a 2xx is UNKNOWN.
              const intent = intentFieldsOf(response.body);
              if (intent.status === null) {
                return {
                  outcome: "UNKNOWN" as const,
                  paymentIntentId: input.paymentIntentId,
                  paymentIntentStatus: null,
                };
              }
              return {
                outcome: "CONFIRMED" as const,
                paymentIntentId: input.paymentIntentId,
                paymentIntentStatus: intent.status,
              };
            }
            if (classification.outcome === "FAILED") {
              return {
                outcome: "FAILED" as const,
                paymentIntentId: input.paymentIntentId,
                paymentIntentStatus: null,
              };
            }
            return {
              outcome: "UNKNOWN" as const,
              paymentIntentId: input.paymentIntentId,
              paymentIntentStatus: null,
            };
          },
          `payment-readback:${input.paymentIntentId}`,
        );
      } catch (error) {
        throw refusalOf(error);
      }
    },
  };
}
