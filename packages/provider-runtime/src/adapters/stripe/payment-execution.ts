/**
 * @payswap/provider-runtime — the Stripe payment execution path (P14-A,
 * ADR-0008 D1/D2/D3). The consumer that runs INSIDE the credential seal:
 * it receives the sealed material, derives the execution grant (the key
 * class law — fail-closed), and drives the payment-intent surface
 * (create → confirm; retrieve — the INV-04 reconcile read; cancel — the
 * reversal path) through the REAL transport, returning ONLY the clean
 * envelope-shaped evidence (escape-scanned; a leak THROWS).
 *
 * LAWS:
 * - THE GRANT (D2): deriveStripeSandboxExecutionGrant runs on EVERY
 *   path — a restricted key never derives execution; a live key never
 *   binds SANDBOX (INV-25); the grant is never cached across dispatches.
 * - INV-04: any timeout / connection loss / uninterpretable answer after
 *   a potentially-effective dispatch is UNKNOWN. An UNKNOWN after the
 *   CREATE succeeded carries the created intent id in providerReferences
 *   (the retrieval can resolve it — no duplicate write, no guessed
 *   finality).
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
  deriveStripeSandboxExecutionGrant,
  validateStripeRestrictedKeyMaterial,
} from './capabilities.ts';

/** The envelope-shaped outcome of one execution path (mirror of the desktop PaymentResultEnvelope semantics). */
export type StripePaymentOutcomeKind = 'CONFIRMED' | 'UNKNOWN' | 'FAILED';

export interface StripePaymentExecutionResult {
  readonly outcome: StripePaymentOutcomeKind;
  /** The payment intent id (pi_…) when one is known (created / read / targeted). */
  readonly paymentIntentId: string | null;
  /** The provider-reported intent status (succeeded / requires_confirmation / canceled / …). */
  readonly paymentIntentStatus: string | null;
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
export interface StripePaymentExecutionDeps {
  readonly transport: ProviderTransport;
  readonly clock: RuntimeClock;
  readonly executionMode: ExecutionMode;
}

/** The create+confirm input (the CREATE_EXTERNAL_EFFECT path, ADR D3). */
export interface StripeCreateAndConfirmInput {
  /** Minor units as a decimal string (e.g. "1500" = $15.00). */
  readonly amountMinorUnits: string;
  readonly currency: string;
  /** The registrar-scoped idempotency key (bound as the Idempotency-Key header). */
  readonly idempotencyKey: string;
  /** The published Stripe TEST payment-method token (public test vocabulary, never a secret). */
  readonly paymentMethod: string;
  /** Mission/correlation refs bound as intent metadata (strings only). */
  readonly metadata?: Readonly<Record<string, string>>;
}

/** The grant + material validation every path runs first (fail-closed). */
function admitExecution(material: unknown, executionMode: ExecutionMode): { readonly apiKey: string } {
  const validated = validateStripeRestrictedKeyMaterial(material);
  deriveStripeSandboxExecutionGrant(validated.apiKey, executionMode);
  return { apiKey: validated.apiKey };
}

/**
 * Create the execution driver. Every returned function is a seal
 * consumer: `(material) => Promise<StripePaymentExecutionResult>`.
 */
export function createStripePaymentExecution(deps: StripePaymentExecutionDeps): {
  readonly createAndConfirm: (
    material: unknown,
    input: StripeCreateAndConfirmInput,
  ) => Promise<StripePaymentExecutionResult>;
  readonly retrieve: (
    material: unknown,
    paymentIntentId: string,
  ) => Promise<StripePaymentExecutionResult>;
  readonly cancel: (
    material: unknown,
    paymentIntentId: string,
    idempotencyKey: string,
  ) => Promise<StripePaymentExecutionResult>;
} {
  const headersOf = (apiKey: string): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
  });

  /** Read {id, status} off a confirmed transport body (never guesses). */
  const intentFieldsOf = (body: unknown): { id: string | null; status: string | null } => {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return { id: null, status: null };
    }
    const record = body as { id?: unknown; status?: unknown };
    return {
      id: typeof record.id === 'string' && record.id.length > 0 ? record.id : null,
      status: typeof record.status === 'string' && record.status.length > 0 ? record.status : null,
    };
  };

  /** Classify a non-CONFIRMED transport answer into the result shape. */
  const unconfirmed = (
    response: Parameters<typeof classifyTransportOutcome>[0],
    classification: ReturnType<typeof classifyTransportOutcome>,
    dispatchedAt: TimestampMs,
    knownIntentId: string | null,
  ): StripePaymentExecutionResult => {
    if (classification.outcome === 'CONFIRMED') {
      throw new ValidationError('a CONFIRMED transport answer must be handled by the execution path');
    }
    const references = knownIntentId === null ? [] : [knownIntentId];
    if (classification.outcome === 'UNKNOWN') {
      if (classification.ambiguityReason === undefined) {
        throw new ValidationError('an UNKNOWN execution requires a canonical ambiguity reason');
      }
      return {
        outcome: 'UNKNOWN',
        paymentIntentId: knownIntentId,
        paymentIntentStatus: null,
        providerReferences: Object.freeze(references),
        ambiguityReason: classification.ambiguityReason,
        dispatchedAt,
        completedAt: deps.clock.now(),
      };
    }
    const failure = classification.failure;
    return {
      outcome: 'FAILED',
      paymentIntentId: knownIntentId,
      paymentIntentStatus: null,
      providerReferences: Object.freeze(references),
      failure: {
        code: failure?.providerErrorCode ?? 'PAYMENT_EXECUTION_FAILED',
        message: failure?.providerErrorMessage ?? 'stripe answered with an error status',
        retryable: failure?.retryable ?? false,
      },
      dispatchedAt,
      completedAt: deps.clock.now(),
    };
  };

  const seal = (
    result: StripePaymentExecutionResult,
    secrets: readonly string[],
  ): StripePaymentExecutionResult => {
    assertNoSecretMaterial(result, secrets, 'stripe payment execution result');
    return Object.freeze(result);
  };

  return {
    /** CREATE then CONFIRM (the full consequential path to a terminal-ish state). */
    async createAndConfirm(material, input): Promise<StripePaymentExecutionResult> {
      const { apiKey } = admitExecution(material, deps.executionMode);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      if (!/^\d+$/.test(input.amountMinorUnits)) {
        throw new ValidationError('amountMinorUnits must be a non-negative decimal string of minor units');
      }
      if (!/^[a-z]{3}$/.test(input.currency)) {
        throw new ValidationError('currency must be a lowercase 3-letter ISO code');
      }
      if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length === 0) {
        throw new ValidationError('the registrar-scoped idempotency key is required on the create path');
      }
      const createParams: Record<string, string> = {
        amount: input.amountMinorUnits,
        currency: input.currency,
        // The server-side deterministic confirm path (ADR-0008 D3):
        // redirect-based payment methods are excluded — no return_url
        // exists in this flow, so confirm never needs a redirect.
        'automatic_payment_methods[enabled]': 'true',
        'automatic_payment_methods[allow_redirects]': 'never',
        'metadata[command]': input.idempotencyKey,
      };
      for (const [key, value] of Object.entries(input.metadata ?? {})) {
        if (typeof value !== 'string' || value.length === 0) {
          throw new ValidationError(`metadata['${key}'] must be a non-empty string`);
        }
        createParams[`metadata[${key}]`] = value.slice(0, 480);
      }
      const create = await deps.transport.send({
        operationId: 'stripe.payment_intent.create',
        idempotencyKey: input.idempotencyKey,
        params: createParams,
        headers: headersOf(apiKey),
        correlationId: `stripe-exec-create:${String(dispatchedAt)}`,
      });
      const createClass = classifyTransportOutcome(create);
      if (createClass.outcome !== 'CONFIRMED') {
        return seal(unconfirmed(create, createClass, dispatchedAt, null), secrets);
      }
      const created = intentFieldsOf(create.body);
      if (created.id === null) {
        // 2xx without an intent id: uninterpretable evidence is UNKNOWN.
        return seal(
          {
            outcome: 'UNKNOWN',
            paymentIntentId: null,
            paymentIntentStatus: null,
            providerReferences: [],
            ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH',
            dispatchedAt,
            completedAt: deps.clock.now(),
          },
          secrets,
        );
      }
      // The intent EXISTS from here on — every later answer keeps its id
      // in the references (the reconcile read can always find it).
      const confirmDispatchedAt = deps.clock.now();
      const confirm = await deps.transport.send({
        operationId: 'stripe.payment_intent.confirm',
        idempotencyKey: `${input.idempotencyKey}:confirm`,
        params: { id: created.id, payment_method: input.paymentMethod },
        headers: headersOf(apiKey),
        correlationId: `stripe-exec-confirm:${String(confirmDispatchedAt)}`,
      });
      const confirmClass = classifyTransportOutcome(confirm);
      if (confirmClass.outcome !== 'CONFIRMED') {
        return seal(unconfirmed(confirm, confirmClass, confirmDispatchedAt, created.id), secrets);
      }
      const confirmed = intentFieldsOf(confirm.body);
      if (confirmed.id === null || confirmed.status === null) {
        return seal(
          {
            outcome: 'UNKNOWN',
            paymentIntentId: created.id,
            paymentIntentStatus: null,
            providerReferences: Object.freeze([created.id]),
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
          paymentIntentId: confirmed.id,
          paymentIntentStatus: confirmed.status,
          providerReferences: Object.freeze([confirmed.id, confirmed.status]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },

    /** The INV-04 reconcile read: retrieve one intent by id (never guesses finality). */
    async retrieve(material, paymentIntentId): Promise<StripePaymentExecutionResult> {
      const { apiKey } = admitExecution(material, deps.executionMode);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      if (typeof paymentIntentId !== 'string' || paymentIntentId.length === 0) {
        throw new ValidationError('retrieve requires a non-empty paymentIntentId');
      }
      const response = await deps.transport.send({
        operationId: 'stripe.payment_intent.retrieve',
        idempotencyKey: `exec:retrieve:${paymentIntentId}:${String(dispatchedAt)}`,
        params: { id: paymentIntentId },
        headers: headersOf(apiKey),
        correlationId: `stripe-exec-retrieve:${String(dispatchedAt)}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmed(response, classification, dispatchedAt, paymentIntentId), secrets);
      }
      const intent = intentFieldsOf(response.body);
      if (intent.id === null || intent.status === null) {
        return seal(
          {
            outcome: 'UNKNOWN',
            paymentIntentId,
            paymentIntentStatus: null,
            providerReferences: Object.freeze([paymentIntentId]),
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
          paymentIntentId: intent.id,
          paymentIntentStatus: intent.status,
          providerReferences: Object.freeze([intent.id, intent.status]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },

    /** The reversal path: cancel one intent by id (ADR D3). */
    async cancel(material, paymentIntentId, idempotencyKey): Promise<StripePaymentExecutionResult> {
      const { apiKey } = admitExecution(material, deps.executionMode);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      if (typeof paymentIntentId !== 'string' || paymentIntentId.length === 0) {
        throw new ValidationError('cancel requires a non-empty paymentIntentId');
      }
      if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
        throw new ValidationError('cancel requires the registrar-scoped idempotency key');
      }
      const response = await deps.transport.send({
        operationId: 'stripe.payment_intent.cancel',
        idempotencyKey,
        params: { id: paymentIntentId },
        headers: headersOf(apiKey),
        correlationId: `stripe-exec-cancel:${String(dispatchedAt)}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmed(response, classification, dispatchedAt, paymentIntentId), secrets);
      }
      const intent = intentFieldsOf(response.body);
      if (intent.id === null || intent.status === null) {
        return seal(
          {
            outcome: 'UNKNOWN',
            paymentIntentId,
            paymentIntentStatus: null,
            providerReferences: Object.freeze([paymentIntentId]),
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
          paymentIntentId: intent.id,
          paymentIntentStatus: intent.status,
          providerReferences: Object.freeze([intent.id, intent.status]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },
  };
}
