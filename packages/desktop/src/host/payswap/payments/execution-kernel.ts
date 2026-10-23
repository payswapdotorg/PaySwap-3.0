/**
 * PaySwap Desktop (P14-A) — the REAL execution kernel behind the
 * ExecutionAuthorityPort (ADR-0008 D1).
 *
 * LAYER LAW: this package NEVER imports @payswap/* — the kernel is a
 * STRUCTURAL adapter over injected seams (the established two-step
 * composition discipline). The transport seam mirrors the canonical
 * @payswap/provider-runtime call/response shapes field-for-field, and
 * the battery MIRROR-ASSERTS the fidelity against the real contracts
 * (the payments-contract-mirrors precedent).
 *
 * LAWS (ADR-0008):
 * - D1: the port is the only consequential door; this kernel is composed
 *   BEHIND it. The mission runtime's registrar discipline stays
 *   authoritative (idempotent under the supplied key; a post-dispatch
 *   crash is UNKNOWN upstream — the runtime owns that law).
 * - D2: the execution grant derives from the KEY CLASS, checked INSIDE
 *   the seal on EVERY dispatch (never cached): a FULL test secret key
 *   (sk_test_…) bound to SANDBOX derives the execution grant; a
 *   RESTRICTED key (rk_…) NEVER derives one from the key alone; a LIVE
 *   key is refused (INV-25 — unchanged).
 * - D3: CREATE = create + confirm (the published test payment-method
 *   token — public test vocabulary); UNKNOWN after a landed create
 *   carries the intent id in providerReferences (the reconcile read can
 *   resolve it — no duplicate write, no guessed finality).
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
import type { CompiledPaymentIntent } from "./contracts.js";
// P14-C gate fix: the envelope type lives in contracts.js (the port file
// imports it, it does not re-export it) — a latent P14-A defect the full
// host-tsc gate caught; the batteries passed because vitest does not
// typecheck. Importing from the owning module is the canonical shape.
import type { PaymentResultEnvelope } from "./contracts.js";

/** The structural transport-call seam (mirrors the canonical call). */
export interface KernelTransportCall {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly params: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly correlationId: string;
}

/** The structural transport-response seam (mirrors the canonical response). */
export interface KernelTransportResponse {
  readonly delivered: boolean;
  readonly status?: number;
  readonly body?: unknown;
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly failure?: {
    readonly kind: string;
    readonly detail?: string;
  };
}

/** The transport seam (the real adapter is structurally assignable). */
export interface KernelTransportSeam {
  readonly transportId: string;
  send(call: KernelTransportCall): Promise<KernelTransportResponse>;
}

/** The connection-authority seam the kernel admits through. */
export interface KernelConnectionAuthoritySeam {
  connectionStatuses(): Promise<
    ReadonlyArray<{ readonly connectionId: string; readonly state: string; readonly executionMode: string }>
  >;
  withSealedCredential<T>(
    connectionId: string,
    consumer: (material: unknown) => T,
    context: string,
  ): Promise<Awaited<T>>;
}

/** Options (all seams injected; no ambient fetch, no ambient clock). */
export interface StripeExecutionKernelOptions {
  readonly connectionAuthority: KernelConnectionAuthoritySeam;
  readonly transport: KernelTransportSeam;
  readonly nowMs?: () => number;
  /** The published Stripe TEST payment-method token (public vocabulary; default pm_card_visa). */
  readonly testPaymentMethod?: string;
}

/** The mirrored key-class law (ADR-0008 D2) — mirror-asserted by the battery. */
export const KERNEL_STRIPE_FULL_TEST_PREFIX = "sk_test_";
export const KERNEL_STRIPE_RESTRICTED_TEST_PREFIX = "rk_test_";
export const KERNEL_STRIPE_LIVE_PREFIXES = ["sk_live_", "rk_live_"] as const;
export const KERNEL_STRIPE_OPERATION_IDS = {
  create: "stripe.payment_intent.create",
  confirm: "stripe.payment_intent.confirm",
  retrieve: "stripe.payment_intent.retrieve",
  cancel: "stripe.payment_intent.cancel",
} as const;

/** A typed refusal raised inside the seal (mapped to the port answer). */
class KernelRefusal extends Error {
  constructor(readonly refusal: ExecutionAuthorityRefusal) {
    super(refusal.reason);
  }
}

/** Read {id, status} off a confirmed body (never guesses). */
function intentFieldsOf(body: unknown): { id: string | null; status: string | null } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { id: null, status: null };
  }
  const record = body as { id?: unknown; status?: unknown };
  return {
    id: typeof record.id === "string" && record.id.length > 0 ? record.id : null,
    status: typeof record.status === "string" && record.status.length > 0 ? record.status : null,
  };
}

/** The mirrored classification (CONFIRMED / UNKNOWN / FAILED — INV-04). */
interface KernelClassification {
  readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
  readonly ambiguityReason?: "TRANSPORT_TIMEOUT_AFTER_DISPATCH" | "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH" | "MALFORMED_RESPONSE_AFTER_DISPATCH";
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly retryable?: boolean;
}

function classify(response: KernelTransportResponse): KernelClassification {
  if (response.delivered) {
    const status = response.status ?? 0;
    if (status >= 200 && status < 300) {
      return { outcome: "CONFIRMED" };
    }
    return {
      outcome: "FAILED",
      providerErrorCode: response.providerErrorCode ?? `HTTP_${String(status)}`,
      providerErrorMessage: response.providerErrorMessage ?? "stripe answered with an error status",
      retryable: status === 429 || status >= 500,
    };
  }
  const kind = response.failure?.kind ?? "CONNECTION_LOST_AFTER_DISPATCH";
  if (kind === "REFUSED_BEFORE_DISPATCH") {
    return { outcome: "FAILED", providerErrorCode: kind, providerErrorMessage: "the command was refused before dispatch", retryable: false };
  }
  if (kind === "TIMEOUT_AFTER_DISPATCH") {
    return { outcome: "UNKNOWN", ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH" };
  }
  if (kind === "MALFORMED_RESPONSE") {
    return { outcome: "UNKNOWN", ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" };
  }
  return { outcome: "UNKNOWN", ambiguityReason: "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH" };
}

/** The internal execution result (envelope-shaped, secret-free). */
interface ExecutionOutcome {
  readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
  readonly paymentIntentId: string | null;
  readonly paymentIntentStatus: string | null;
  readonly providerReferences: readonly string[];
  readonly classification: KernelClassification;
  readonly dispatchedAt: number;
  readonly completedAt: number;
}

/** The material shape the seal consumer validates (never echoes it). */
function apiKeyOf(material: unknown): string {
  if (material === null || typeof material !== "object" || Array.isArray(material)) {
    throw new PaymentMissionError("INVALID_TRANSITION", "the sealed credential material is malformed");
  }
  const apiKey = (material as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new PaymentMissionError("INVALID_TRANSITION", "the sealed credential material carries no apiKey");
  }
  return apiKey;
}

/** Compose the real kernel. The answer is the pinned envelope or a typed refusal. */
export function createStripeExecutionKernel(
  options: StripeExecutionKernelOptions,
): ExecutionAuthorityPort {
  const nowMs = options.nowMs ?? Date.now;
  const testPaymentMethod = options.testPaymentMethod ?? "pm_card_visa";
  const transport = options.transport;
  const connectionAuthority = options.connectionAuthority;

  const headersOf = (apiKey: string): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
  });

  /** The grant law (D2) — runs on every path, inside the seal. */
  function admitGrant(apiKey: string, executionMode: string): void {
    if (executionMode !== "SANDBOX") {
      throw new KernelRefusal({
        kind: "MODE_NOT_OFFERED",
        reason: `INV-25: the execution kernel is SANDBOX-only in this deployment (got ${executionMode}); a live corridor is never derived here`,
      });
    }
    if (KERNEL_STRIPE_LIVE_PREFIXES.some((prefix) => apiKey.startsWith(prefix))) {
      throw new KernelRefusal({
        kind: "MODE_NOT_OFFERED",
        reason: "INV-25: a LIVE Stripe key cannot serve the SANDBOX execution kernel (test keys serve SANDBOX; live keys serve LIVE)",
      });
    }
    if (apiKey.startsWith(KERNEL_STRIPE_RESTRICTED_TEST_PREFIX)) {
      throw new KernelRefusal({
        kind: "COMMAND_REJECTED",
        reason:
          "a RESTRICTED Stripe key never derives an execution grant from the key alone — restricted-key grants derive only from their DECLARED scopes (the P13-B read-only default remains the enforcement point)",
      });
    }
    if (!apiKey.startsWith(KERNEL_STRIPE_FULL_TEST_PREFIX)) {
      throw new KernelRefusal({
        kind: "COMMAND_REJECTED",
        reason: "the sealed Stripe key does not carry a canonical test-mode key prefix (sk_test_ for the full-key execution grant)",
      });
    }
  }

  async function sendExecution(
    apiKey: string,
    executionMode: string,
    operationId: string,
    params: Record<string, string>,
    idempotencyKey: string,
    knownIntentId: string | null,
    dispatchedAt: number,
  ): Promise<ExecutionOutcome> {
    admitGrant(apiKey, executionMode);
    const response = await transport.send({
      operationId,
      idempotencyKey,
      params,
      headers: headersOf(apiKey),
      correlationId: `kernel:${operationId}:${String(dispatchedAt)}`,
    });
    const classification = classify(response);
    const references = knownIntentId === null ? [] : [knownIntentId];
    if (classification.outcome === "CONFIRMED") {
      const intent = intentFieldsOf(response.body);
      if (intent.id === null || intent.status === null) {
        return {
          outcome: "UNKNOWN",
          paymentIntentId: knownIntentId,
          paymentIntentStatus: null,
          providerReferences: Object.freeze(references),
          classification: { outcome: "UNKNOWN", ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" },
          dispatchedAt,
          completedAt: nowMs(),
        };
      }
      return {
        outcome: "CONFIRMED",
        paymentIntentId: intent.id,
        paymentIntentStatus: intent.status,
        providerReferences: Object.freeze([intent.id, intent.status]),
        classification,
        dispatchedAt,
        completedAt: nowMs(),
      };
    }
    return {
      outcome: classification.outcome,
      paymentIntentId: knownIntentId,
      paymentIntentStatus: null,
      providerReferences: Object.freeze(references),
      classification,
      dispatchedAt,
      completedAt: nowMs(),
    };
  }

  function toEnvelope(execution: ExecutionOutcome): PaymentResultEnvelope {
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

  const CREATE_PARAMS_MAX = 480;

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

      const intent: CompiledPaymentIntent = command.intent;
      const dispatchedAt = nowMs();
      try {
        // ---- the seal: everything below runs on the sealed material ----
        const execution = await connectionAuthority.withSealedCredential(
          command.connectionRef,
          async (material) => {
            const apiKey = apiKeyOf(material);
            if (command.operation === "CREATE_EXTERNAL_EFFECT") {
              const amount = intent.originAmount.minorUnits;
              const currency = intent.originAmount.currency;
              if (!/^\d+$/.test(amount) || !/^[A-Za-z]{3}$/.test(currency)) {
                throw new KernelRefusal({
                  kind: "COMMAND_REJECTED",
                  reason: "the compiled intent's amount/currency is not dispatchable (minor units + a 3-letter ISO currency required)",
                });
              }
              const metadata: Record<string, string> = {
                command: command.commandId,
                correlation: command.correlationId,
              };
              // The canonical intent carries UPPERCASE ISO currencies; the
              // Stripe REST surface takes lowercase (normalized here, at
              // the wire edge only — records keep the canonical form).
              // automatic_payment_methods[allow_redirects]=never: the
              // server-side deterministic confirm path (redirect-based
              // methods are excluded — no return_url exists in this flow).
              const createParams: Record<string, string> = {
                amount,
                currency: currency.toLowerCase(),
                "automatic_payment_methods[enabled]": "true",
                "automatic_payment_methods[allow_redirects]": "never",
              };
              for (const [key, value] of Object.entries(metadata)) {
                createParams[`metadata[${key}]`] = value.slice(0, CREATE_PARAMS_MAX);
              }
              const created = await sendExecution(
                apiKey,
                command.executionMode,
                KERNEL_STRIPE_OPERATION_IDS.create,
                createParams,
                command.idempotencyKey,
                null,
                dispatchedAt,
              );
              if (created.outcome !== "CONFIRMED" || created.paymentIntentId === null) {
                return created;
              }
              // The intent EXISTS — every later answer keeps its id in the
              // references (the reconcile read can always find it).
              const confirmed = await sendExecution(
                apiKey,
                command.executionMode,
                KERNEL_STRIPE_OPERATION_IDS.confirm,
                { id: created.paymentIntentId, payment_method: testPaymentMethod },
                `${command.idempotencyKey}:confirm`,
                created.paymentIntentId,
                nowMs(),
              );
              return confirmed;
            }
            // ---- CANCEL_OR_REVERSE_EFFECT: cancel the confirmed intent ----
            const targetId = command.reversalOf?.providerReferences[0];
            if (typeof targetId !== "string" || targetId.length === 0) {
              throw new KernelRefusal({
                kind: "COMMAND_REJECTED",
                reason: "a reversal requires reversalOf.providerReferences[0] (the confirmed intent id)",
              });
            }
            return sendExecution(
              apiKey,
              command.executionMode,
              KERNEL_STRIPE_OPERATION_IDS.cancel,
              { id: targetId },
              command.idempotencyKey,
              targetId,
              dispatchedAt,
            );
          },
          `payment-execution-dispatch:${command.attemptId}`,
        );
        return { kind: "ENVELOPE", envelope: toEnvelope(execution) };
      } catch (error) {
        if (error instanceof KernelRefusal) {
          return { kind: "REFUSED", refusal: error.refusal };
        }
        // A typed error from inside the seal (material shape, grant law)
        // maps to the honest refusal; anything else propagates (the
        // runtime's crash law treats it as UNKNOWN upstream).
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
