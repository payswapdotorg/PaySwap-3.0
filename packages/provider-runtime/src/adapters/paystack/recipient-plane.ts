/**
 * @payswap/provider-runtime — the Paystack RECIPIENT PLANE execution
 * paths (P27-C, ADR-0020 D4/D10): the seal-consumer create + list
 * drivers over the real transfer-recipient API surface, and the
 * transfer-lane wiring (`recipientRefOf`). The FACTS (the candidate
 * vocabulary, the dated-evidence registry, the K3/K4 station record)
 * live in recipient-facts.ts; the REQUEST BUILDER gate (nothing
 * unverified ever dispatches) lives in recipient-request.ts — split
 * per the <=400-line file law (facts vs request vs execution).
 *
 * THE GRANT LAW (D4): creating a transfer recipient is a consequential
 * provider write. The read-only connection scope NEVER grows it
 * (`refuseConsequentialPaystackGrant` stays binding); the recipient
 * grant derives ONLY through `derivePaystackSandboxRecipientGrant` —
 * re-derived at dispatch inside the seal on EVERY path, SANDBOX-only,
 * never cached, `sk_live_` refused (INV-25). The typed request builder
 * runs against the injected evidence registry at dispatch time (the
 * D10 freshness seam).
 *
 * SECRETS: the Authorization header exists only inside the call frame;
 * every result is escape-scanned (assertNoSecretMaterial).
 */

import { ValidationError } from '../../errors.ts';
import type { RuntimeClock, TimestampMs } from '../../clock.ts';
import { assertNoSecretMaterial, secretStringsOf } from '../../redaction.ts';
import type { ExecutionMode } from '../../execution-mode.ts';
import type { ProviderTransport } from '../../transport.ts';
import { classifyTransportOutcome } from '../../result-envelope.ts';
import type { AmbiguityReason } from '../../result-envelope.ts';
import {
  derivePaystackSandboxRecipientGrant,
  validatePaystackSecretKeyMaterial,
} from './capabilities.ts';
import { buildPaystackTransferRecipientRequest } from './recipient-request.ts';
import type { PaystackTransferRecipientRequestInput } from './recipient-request.ts';
import { PAYSTACK_RECIPIENT_TYPE_EVIDENCE } from './recipient-facts.ts';
import type { PaystackRecipientTypeEvidence } from './recipient-facts.ts';


/** The envelope-shaped outcome of one recipient-plane path. */
export type PaystackRecipientOutcomeKind = 'CONFIRMED' | 'UNKNOWN' | 'FAILED';

/** The typed, secret-free result of one recipient-plane path. */
export interface PaystackRecipientExecutionResult {
  readonly outcome: PaystackRecipientOutcomeKind;
  /** The created recipient code (`RCP_…`) when the provider answered one. */
  readonly recipientCode: string | null;
  /** The provider-reported recipient type when the provider echoed one. */
  readonly recipientType: string | null;
  /** For list: how many recipients the read-back observed. */
  readonly observedCount: number | null;
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

/** Deps (all injected; the evidence registry is the D10 freshness seam). */
export interface PaystackRecipientExecutionDeps {
  readonly transport: ProviderTransport;
  readonly clock: RuntimeClock;
  readonly executionMode: ExecutionMode;
  /** Defaults to the shipped (empty) registry; the composition may inject fresher. */
  readonly evidenceRegistry?: readonly PaystackRecipientTypeEvidence[];
}

/**
 * Classify a non-CONFIRMED transport answer into the result shape (the
 * transfer-execution.ts unconfirmed law, applied to the recipient plane).
 * Fail-closed: a CONFIRMED classification can never reach here.
 */
function unconfirmedRecipient(
  classification: ReturnType<typeof classifyTransportOutcome>,
  dispatchedAt: TimestampMs,
  completedAt: TimestampMs,
): PaystackRecipientExecutionResult {
  if (classification.outcome === 'CONFIRMED') {
    throw new ValidationError('a CONFIRMED transport answer must be handled by the recipient path');
  }
  if (classification.outcome === 'UNKNOWN') {
    if (classification.ambiguityReason === undefined) {
      throw new ValidationError('an UNKNOWN recipient execution requires a canonical ambiguity reason');
    }
    return {
      outcome: 'UNKNOWN',
      recipientCode: null,
      recipientType: null,
      observedCount: null,
      providerReferences: Object.freeze([]),
      ambiguityReason: classification.ambiguityReason,
      dispatchedAt,
      completedAt,
    };
  }
  const failure = classification.failure;
  return {
    outcome: 'FAILED',
    recipientCode: null,
    recipientType: null,
    observedCount: null,
    providerReferences: Object.freeze([]),
    failure: {
      code: failure?.providerErrorCode ?? 'RECIPIENT_EXECUTION_FAILED',
      message: failure?.providerErrorMessage ?? 'paystack answered with an error status',
      retryable: failure?.retryable ?? false,
    },
    dispatchedAt,
    completedAt,
  };
}

/** Read the recipient fields off a provider answer (never guesses). */
function recipientFieldsOf(body: unknown): { recipientCode: string | null; recipientType: string | null } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { recipientCode: null, recipientType: null };
  }
  const data = (body as { data?: unknown }).data;
  const record =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : (body as Record<string, unknown>);
  const code = record['recipient_code'];
  const type = record['type'];
  return {
    recipientCode: typeof code === 'string' && code.length > 0 ? code : null,
    recipientType: typeof type === 'string' && type.length > 0 ? type : null,
  };
}

/**
 * Create the recipient-plane execution driver. Every returned function is
 * a seal consumer: `(material, …) => Promise<PaystackRecipientExecutionResult>`.
 * The recipient grant is re-derived on EVERY path (never cached; a live
 * key refuses at the derivation — INV-25), and the typed request builder
 * runs against the injected evidence registry at dispatch time (D10).
 */
export function createPaystackRecipientExecution(
  deps: PaystackRecipientExecutionDeps,
): {
  readonly create: (
    material: unknown,
    input: PaystackTransferRecipientRequestInput,
  ) => Promise<PaystackRecipientExecutionResult>;
  readonly list: (
    material: unknown,
  ) => Promise<PaystackRecipientExecutionResult>;
} {
  const registry = deps.evidenceRegistry ?? PAYSTACK_RECIPIENT_TYPE_EVIDENCE;
  const admit = (material: unknown): { readonly apiKey: string } => {
    const validated = validatePaystackSecretKeyMaterial(material);
    derivePaystackSandboxRecipientGrant(validated.apiKey, deps.executionMode);
    return { apiKey: validated.apiKey };
  };
  const headersOf = (apiKey: string): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
  });
  const seal = (
    result: PaystackRecipientExecutionResult,
    secrets: readonly string[],
  ): PaystackRecipientExecutionResult => {
    assertNoSecretMaterial(result, secrets, 'paystack recipient execution result');
    return Object.freeze(result);
  };

  return {
    /** CREATE one typed transfer recipient (the evidence-gated write path). */
    async create(material, input): Promise<PaystackRecipientExecutionResult> {
      // The grant + the evidence gate run BEFORE any dispatch (fail-closed;
      // an unverified triple never reaches the wire).
      const request = buildPaystackTransferRecipientRequest(input, registry);
      const { apiKey } = admit(material);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      const response = await deps.transport.send({
        operationId: 'paystack.transfer_recipient.create',
        idempotencyKey: `paystack-recipient-create:${input.name}:${String(dispatchedAt)}`,
        params: { ...request.params },
        headers: headersOf(apiKey),
        correlationId: `paystack-recipient-create:${String(dispatchedAt)}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmedRecipient(classification, dispatchedAt, deps.clock.now()), secrets);
      }
      const fields = recipientFieldsOf(response.body);
      if (fields.recipientCode === null) {
        // A 2xx without the recipient shape is uninterpretable evidence:
        // UNKNOWN (INV-04) — never a guessed success.
        return seal(
          {
            outcome: 'UNKNOWN',
            recipientCode: null,
            recipientType: null,
            observedCount: null,
            providerReferences: Object.freeze([]),
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
          recipientCode: fields.recipientCode,
          recipientType: fields.recipientType,
          observedCount: null,
          providerReferences: Object.freeze([
            fields.recipientCode,
            ...(fields.recipientType !== null ? [fields.recipientType] : []),
          ]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },

    /** The read-back / reconciliation read (GET the transfer-recipient list). */
    async list(material): Promise<PaystackRecipientExecutionResult> {
      const { apiKey } = admit(material);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      const response = await deps.transport.send({
        operationId: 'paystack.transfer_recipient.list',
        idempotencyKey: `paystack-recipient-list:${String(dispatchedAt)}`,
        params: {},
        headers: headersOf(apiKey),
        correlationId: `paystack-recipient-list:${String(dispatchedAt)}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmedRecipient(classification, dispatchedAt, deps.clock.now()), secrets);
      }
      const body = (response.body ?? {}) as { status?: unknown; data?: unknown };
      if (body.status !== true || !Array.isArray(body.data)) {
        return seal(
          {
            outcome: 'UNKNOWN',
            recipientCode: null,
            recipientType: null,
            observedCount: null,
            providerReferences: Object.freeze([]),
            ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH',
            dispatchedAt,
            completedAt: deps.clock.now(),
          },
          secrets,
        );
      }
      const codes: string[] = [];
      for (const entry of body.data) {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
          continue;
        }
        const code = (entry as { recipient_code?: unknown }).recipient_code;
        if (typeof code === 'string' && code.length > 0 && codes.length < 10) {
          codes.push(code);
        }
      }
      return seal(
        {
          outcome: 'CONFIRMED',
          recipientCode: codes[0] ?? null,
          recipientType: null,
          observedCount: body.data.length,
          providerReferences: Object.freeze(codes),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },
  };
}

/**
 * THE TRANSFER-LANE WIRING: the recipient code a created recipient
 * answered — the string the existing transfer initiate's `recipient`
 * field takes. The recipient STOPS being an opaque external `RCP_…`:
 * it is the typed, evidence-admitted product of this plane.
 */
export function recipientRefOf(result: PaystackRecipientExecutionResult): string {
  if (result.outcome !== 'CONFIRMED' || result.recipientCode === null) {
    throw new ValidationError(
      'a transfer recipient reference exists only for a CONFIRMED creation that answered a recipient code',
      { outcome: result.outcome },
    );
  }
  return result.recipientCode;
}
