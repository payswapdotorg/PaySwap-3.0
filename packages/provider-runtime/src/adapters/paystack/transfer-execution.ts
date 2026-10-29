/**
 * @payswap/provider-runtime — the Paystack transfer execution path
 * (P22-H, ADR-0016 D8 — the KES off-ramp lane). The consumer that runs
 * INSIDE the credential seal: it receives the sealed material, derives
 * the SANDBOX payout grant (fail-closed — `sk_test_` only; `sk_live_`
 * refused here AND at the seal verb, INV-25), and drives the transfer
 * surface (initiate → finalize; verify — the INV-04 reconcile read)
 * through the REAL transport, returning ONLY the clean envelope-shaped
 * evidence (escape-scanned; a leak THROWS).
 *
 * LAWS (the stripe/payment-execution.ts precedent, applied verbatim):
 * - THE GRANT (D8): derivePaystackSandboxPayoutGrant runs on EVERY path
 *   — the grant is never cached across dispatches; a live key never
 *   binds SANDBOX; a non-canonical key never derives anything.
 * - INV-04: any timeout / connection loss / uninterpretable answer after
 *   a potentially-effective dispatch is UNKNOWN. An UNKNOWN after the
 *   INITIATE succeeded carries the transfer reference in
 *   providerReferences (the verify read can resolve it — no duplicate
 *   write, no guessed finality).
 * - HONEST FINALITY: an initiated transfer is CONFIRMED only when the
 *   transfer's own status says so on a well-formed answer; a 2xx without
 *   the transfer shape is UNKNOWN (never a guessed success).
 * - SECRETS: the Authorization header exists only inside this call
 *   frame; the result is escape-scanned against the material's secret
 *   strings (assertNoSecretMaterial).
 */

import { ValidationError } from '../../errors.ts';
import type { RuntimeClock, TimestampMs } from '../../clock.ts';
import { assertNoSecretMaterial, secretStringsOf } from '../../redaction.ts';
import type { ExecutionMode } from '../../execution-mode.ts';
import type { ProviderTransport } from '../../transport.ts';
import { classifyTransportOutcome } from '../../result-envelope.ts';
import type { AmbiguityReason } from '../../result-envelope.ts';
import {
  derivePaystackSandboxPayoutGrant,
  validatePaystackSecretKeyMaterial,
} from './capabilities.ts';

/** The envelope-shaped outcome of one transfer path (mirror of the desktop PaymentResultEnvelope semantics). */
export type PaystackTransferOutcomeKind = 'CONFIRMED' | 'UNKNOWN' | 'FAILED';

export interface PaystackTransferExecutionResult {
  readonly outcome: PaystackTransferOutcomeKind;
  /** The transfer reference (Paystack's `reference`) when one is known. */
  readonly transferReference: string | null;
  /** The transfer code (`TRF_…`) when one is known. */
  readonly transferCode: string | null;
  /** The provider-reported transfer status (success / pending / failed / …). */
  readonly transferStatus: string | null;
  readonly providerReferences: readonly string[];
  readonly failure?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly ambiguityReason?: AmbiguityReason;
  readonly dispatchedAt: TimestampMs;
  readonly completedAt: TimestampMs;
}

/** Deps (all injected; the transport binding law is enforced by the caller). */
export interface PaystackTransferExecutionDeps {
  readonly transport: ProviderTransport;
  readonly clock: RuntimeClock;
  readonly executionMode: ExecutionMode;
}

/** The initiate input (the CREATE_EXTERNAL_EFFECT path, ADR-0016 D8). */
export interface PaystackTransferInitiateInput {
  /** Minor units as a decimal string (e.g. "1612500" = 16,125.00 KES — kobo). */
  readonly amountMinorUnits: string;
  /** The transfer currency (lowercase 3-letter ISO — the corridor's KES). */
  readonly currency: string;
  /** The recipient code (Paystack's `RCP_…` transfer recipient). */
  readonly recipient: string;
  /** The mission-scoped reason (bound as the transfer's reason field). */
  readonly reason?: string;
  /** The caller-scoped reference (bound as the transfer's unique reference). */
  readonly reference?: string;
}

/** The grant + material validation every path runs first (fail-closed). */
function admitPayout(material: unknown, executionMode: ExecutionMode): { readonly apiKey: string } {
  const validated = validatePaystackSecretKeyMaterial(material);
  derivePaystackSandboxPayoutGrant(validated.apiKey, executionMode);
  return { apiKey: validated.apiKey };
}

/** Read the transfer fields off a confirmed transport body (never guesses). */
function transferFieldsOf(body: unknown): {
  reference: string | null;
  transferCode: string | null;
  status: string | null;
} {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { reference: null, transferCode: null, status: null };
  }
  // Paystack wraps the payload: { status: true, message, data: { … } }.
  const data = (body as { data?: unknown }).data;
  const record =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : (body as Record<string, unknown>);
  const reference = record['reference'];
  const transferCode = record['transfer_code'];
  const status = record['status'];
  return {
    reference: typeof reference === 'string' && reference.length > 0 ? reference : null,
    transferCode: typeof transferCode === 'string' && transferCode.length > 0 ? transferCode : null,
    status: typeof status === 'string' && status.length > 0 ? status : null,
  };
}

/**
 * Create the transfer execution driver. Every returned function is a seal
 * consumer: `(material) => Promise<PaystackTransferExecutionResult>`.
 */
export function createPaystackTransferExecution(deps: PaystackTransferExecutionDeps): {
  readonly initiate: (
    material: unknown,
    input: PaystackTransferInitiateInput,
  ) => Promise<PaystackTransferExecutionResult>;
  readonly finalize: (
    material: unknown,
    transferCode: string,
    otp: string,
  ) => Promise<PaystackTransferExecutionResult>;
  readonly verify: (
    material: unknown,
    referenceOrCode: string,
  ) => Promise<PaystackTransferExecutionResult>;
} {
  const headersOf = (apiKey: string): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
  });

  /** Classify a non-CONFIRMED transport answer into the result shape. */
  const unconfirmed = (
    classification: ReturnType<typeof classifyTransportOutcome>,
    dispatchedAt: TimestampMs,
    known: { reference: string | null; transferCode: string | null },
  ): PaystackTransferExecutionResult => {
    if (classification.outcome === 'CONFIRMED') {
      throw new ValidationError('a CONFIRMED transport answer must be handled by the transfer path');
    }
    const references: string[] = [];
    if (known.reference !== null) references.push(known.reference);
    if (known.transferCode !== null) references.push(known.transferCode);
    if (classification.outcome === 'UNKNOWN') {
      if (classification.ambiguityReason === undefined) {
        throw new ValidationError('an UNKNOWN transfer execution requires a canonical ambiguity reason');
      }
      return {
        outcome: 'UNKNOWN',
        transferReference: known.reference,
        transferCode: known.transferCode,
        transferStatus: null,
        providerReferences: Object.freeze(references),
        ambiguityReason: classification.ambiguityReason,
        dispatchedAt,
        completedAt: deps.clock.now(),
      };
    }
    const failure = classification.failure;
    return {
      outcome: 'FAILED',
      transferReference: known.reference,
      transferCode: known.transferCode,
      transferStatus: null,
      providerReferences: Object.freeze(references),
      failure: {
        code: failure?.providerErrorCode ?? 'TRANSFER_EXECUTION_FAILED',
        message: failure?.providerErrorMessage ?? 'paystack answered with an error status',
        retryable: failure?.retryable ?? false,
      },
      dispatchedAt,
      completedAt: deps.clock.now(),
    };
  };

  const seal = (
    result: PaystackTransferExecutionResult,
    secrets: readonly string[],
  ): PaystackTransferExecutionResult => {
    assertNoSecretMaterial(result, secrets, 'paystack transfer execution result');
    return Object.freeze(result);
  };

  return {
    /** INITIATE a transfer (the consequential payout path). */
    async initiate(material, input): Promise<PaystackTransferExecutionResult> {
      const { apiKey } = admitPayout(material, deps.executionMode);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      if (!/^\d+$/.test(input.amountMinorUnits)) {
        throw new ValidationError('amountMinorUnits must be a non-negative decimal string of minor units');
      }
      if (!/^[a-z]{3}$/.test(input.currency)) {
        throw new ValidationError('currency must be a lowercase 3-letter ISO code');
      }
      if (typeof input.recipient !== 'string' || input.recipient.length === 0) {
        throw new ValidationError('the transfer recipient code is required on the initiate path');
      }
      const params: Record<string, string> = {
        source: 'balance',
        amount: input.amountMinorUnits,
        recipient: input.recipient,
        currency: input.currency,
      };
      if (input.reason !== undefined) {
        if (typeof input.reason !== 'string' || input.reason.length === 0) {
          throw new ValidationError('the transfer reason must be a non-empty string when provided');
        }
        params['reason'] = input.reason.slice(0, 480);
      }
      if (input.reference !== undefined) {
        if (typeof input.reference !== 'string' || input.reference.length === 0) {
          throw new ValidationError('the transfer reference must be a non-empty string when provided');
        }
        params['reference'] = input.reference;
      }
      const response = await deps.transport.send({
        operationId: 'paystack.transfer.initiate',
        idempotencyKey: input.reference ?? `paystack-transfer-initiate:${String(dispatchedAt)}`,
        params,
        headers: headersOf(apiKey),
        correlationId: `paystack-transfer-initiate:${String(dispatchedAt)}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmed(classification, dispatchedAt, { reference: null, transferCode: null }), secrets);
      }
      const initiated = transferFieldsOf(response.body);
      if (initiated.transferCode === null || initiated.status === null) {
        // 2xx without the transfer shape: uninterpretable evidence is UNKNOWN.
        return seal(
          {
            outcome: 'UNKNOWN',
            transferReference: initiated.reference,
            transferCode: initiated.transferCode,
            transferStatus: null,
            providerReferences: Object.freeze(
              initiated.reference !== null ? [initiated.reference] : [],
            ),
            ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH',
            dispatchedAt,
            completedAt: deps.clock.now(),
          },
          secrets,
        );
      }
      return seal(
        {
          outcome: 'CONFIRMED',
          transferReference: initiated.reference,
          transferCode: initiated.transferCode,
          transferStatus: initiated.status,
          providerReferences: Object.freeze([
            ...(initiated.reference !== null ? [initiated.reference] : []),
            initiated.transferCode,
            initiated.status,
          ]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },

    /** FINALIZE an OTP-pending transfer (the two-step payout completion). */
    async finalize(material, transferCode, otp): Promise<PaystackTransferExecutionResult> {
      const { apiKey } = admitPayout(material, deps.executionMode);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      if (typeof transferCode !== 'string' || transferCode.length === 0) {
        throw new ValidationError('finalize requires a non-empty transfer code');
      }
      if (typeof otp !== 'string' || otp.length === 0) {
        throw new ValidationError('finalize requires a non-empty OTP');
      }
      const response = await deps.transport.send({
        operationId: 'paystack.transfer.finalize',
        idempotencyKey: `paystack-transfer-finalize:${transferCode}`,
        params: { transfer_code: transferCode, otp },
        headers: headersOf(apiKey),
        correlationId: `paystack-transfer-finalize:${String(dispatchedAt)}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmed(classification, dispatchedAt, { reference: null, transferCode }), secrets);
      }
      const finalized = transferFieldsOf(response.body);
      if (finalized.transferCode === null || finalized.status === null) {
        return seal(
          {
            outcome: 'UNKNOWN',
            transferReference: finalized.reference,
            transferCode,
            transferStatus: null,
            providerReferences: Object.freeze([transferCode]),
            ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH',
            dispatchedAt,
            completedAt: deps.clock.now(),
          },
          secrets,
        );
      }
      return seal(
        {
          outcome: 'CONFIRMED',
          transferReference: finalized.reference,
          transferCode: finalized.transferCode,
          transferStatus: finalized.status,
          providerReferences: Object.freeze([
            ...(finalized.reference !== null ? [finalized.reference] : []),
            finalized.transferCode,
            finalized.status,
          ]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },

    /** The INV-04 reconcile read / the read-back: verify one transfer by reference or code (never guesses finality). */
    async verify(material, referenceOrCode): Promise<PaystackTransferExecutionResult> {
      const { apiKey } = admitPayout(material, deps.executionMode);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      if (typeof referenceOrCode !== 'string' || referenceOrCode.length === 0) {
        throw new ValidationError('verify requires a non-empty transfer reference or code');
      }
      const response = await deps.transport.send({
        operationId: 'paystack.transfer.verify',
        idempotencyKey: `paystack-transfer-verify:${referenceOrCode}`,
        params: { id: referenceOrCode },
        headers: headersOf(apiKey),
        correlationId: `paystack-transfer-verify:${String(dispatchedAt)}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmed(classification, dispatchedAt, { reference: referenceOrCode, transferCode: null }), secrets);
      }
      const verified = transferFieldsOf(response.body);
      if (verified.transferCode === null || verified.status === null) {
        return seal(
          {
            outcome: 'UNKNOWN',
            transferReference: verified.reference ?? referenceOrCode,
            transferCode: verified.transferCode,
            transferStatus: null,
            providerReferences: Object.freeze([referenceOrCode]),
            ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH',
            dispatchedAt,
            completedAt: deps.clock.now(),
          },
          secrets,
        );
      }
      return seal(
        {
          outcome: 'CONFIRMED',
          transferReference: verified.reference ?? referenceOrCode,
          transferCode: verified.transferCode,
          transferStatus: verified.status,
          providerReferences: Object.freeze([
            verified.reference ?? referenceOrCode,
            verified.transferCode,
            verified.status,
          ]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },
  };
}
