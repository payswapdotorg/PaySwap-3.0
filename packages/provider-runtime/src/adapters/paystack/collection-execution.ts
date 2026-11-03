/**
 * @payswap/provider-runtime — the Paystack COLLECTION SURFACE (P27-C,
 * ADR-0020 D4): the hosted payment-request surface over the real public
 * REST API — transaction initialization (the provider's hosted payment
 * page / checkout authorization URL), the transaction verify read-back
 * (the reconciliation read), and the hosted payment-page product. The
 * consumer that runs INSIDE the credential seal.
 *
 * WHAT A COLLECTION INITIALIZE IS (the honest semantics, D1): it
 * creates a provider-side PAYMENT REQUEST the customer must still
 * authorize on the provider's hosted page — money moves only when the
 * customer completes that authorization and the provider's own evidence
 * (the verify read-back or a VERIFIED webhook event) says so. A
 * CONFIRMED initialize answer is NEVER money movement.
 *
 * THE GRANT LAW (D4): the read-only connection scope never grows; the
 * collection grant derives ONLY through
 * `derivePaystackSandboxCollectionGrant` — re-derived at dispatch
 * inside the seal on EVERY path, SANDBOX-only, never cached, `sk_live_`
 * refused (INV-25).
 *
 * THE PURPOSE LAW (INV-30, the capability matrix §5): collection is the
 * genuine-commerce product. The typed purpose class is REQUIRED on the
 * initialize path and `REGULATED_REMITTANCE_P2P` and `UNCLASSIFIED`
 * are refused with typed refusals — relabeling (a commerce-shaped
 * reason string on a remittance-shaped transaction) changes NOTHING:
 * the gate reads ONLY the typed class. The verify read-back carries no
 * purpose gate (it is a read).
 *
 * IDEMPOTENCY (the unique-reference law): the caller's unique
 * reference is REQUIRED on initialize (never provider-generated for
 * this surface) and is the idempotency key the mission layer matches
 * webhook events and verify read-backs against.
 *
 * INV-04: any timeout / connection loss / uninterpretable answer after
 * a potentially-effective dispatch is UNKNOWN. SECRETS: the
 * Authorization header exists only inside this call frame; every
 * result is escape-scanned (assertNoSecretMaterial).
 */

import { ValidationError } from '../../errors.ts';
import type { RuntimeClock, TimestampMs } from '../../clock.ts';
import { assertNoSecretMaterial, secretStringsOf } from '../../redaction.ts';
import type { ExecutionMode } from '../../execution-mode.ts';
import type { ProviderTransport } from '../../transport.ts';
import { classifyTransportOutcome } from '../../result-envelope.ts';
import type { AmbiguityReason } from '../../result-envelope.ts';
import {
  derivePaystackSandboxCollectionGrant,
  validatePaystackSecretKeyMaterial,
} from './capabilities.ts';
import { refuseIneligiblePaystackPurpose } from './transfer-product-lane.ts';
import type { PaystackTransactionPurposeClass } from './transfer-product-lane.ts';

/** The envelope-shaped outcome of one collection path. */
export type PaystackCollectionOutcomeKind = 'CONFIRMED' | 'UNKNOWN' | 'FAILED';

/** The typed, secret-free result of one collection-surface path. */
export interface PaystackCollectionExecutionResult {
  readonly outcome: PaystackCollectionOutcomeKind;
  /** The caller's unique transaction reference when one is known. */
  readonly reference: string | null;
  /** The provider's hosted payment page URL (the initialize answer). */
  readonly authorizationUrl: string | null;
  /** The provider-reported transaction status (the verify read-back carries it). */
  readonly transactionStatus: string | null;
  /** True ONLY when the provider's own answer says the transaction succeeded. */
  readonly confirmedPaid: boolean;
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
export interface PaystackCollectionExecutionDeps {
  readonly transport: ProviderTransport;
  readonly clock: RuntimeClock;
  readonly executionMode: ExecutionMode;
}

/** The initialize input (the collection payment-request creation path). */
export interface PaystackCollectionInitializeInput {
  /** The typed transaction class (INV-30 — the gate reads only this). */
  readonly purposeClass: PaystackTransactionPurposeClass;
  /** The customer's email (the provider's hosted page bills it). */
  readonly email: string;
  /** Minor units as a decimal string (e.g. "500000" = 5,000.00 KES — cents). */
  readonly amountMinorUnits: string;
  /** The collection currency (lowercase 3-letter ISO). */
  readonly currency: string;
  /** The caller-scoped UNIQUE reference (required — the idempotency law). */
  readonly reference: string;
  /** Optional return URL the provider redirects the customer to. */
  readonly callbackUrl?: string;
}

/**
 * Classify a non-CONFIRMED transport answer into the collection result
 * shape (module-scope: the hosted-payment-page sibling module shares the
 * SAME law — one classifier, never duplicated). Fail-closed: a CONFIRMED
 * classification can never reach here.
 */
export function unconfirmedCollectionResult(
  classification: ReturnType<typeof classifyTransportOutcome>,
  dispatchedAt: TimestampMs,
  completedAt: TimestampMs,
  knownReference: string | null,
): PaystackCollectionExecutionResult {
  if (classification.outcome === 'CONFIRMED') {
    throw new ValidationError('a CONFIRMED transport answer must be handled by the collection path');
  }
  const references = knownReference !== null ? [knownReference] : [];
  if (classification.outcome === 'UNKNOWN') {
    if (classification.ambiguityReason === undefined) {
      throw new ValidationError('an UNKNOWN collection execution requires a canonical ambiguity reason');
    }
    return {
      outcome: 'UNKNOWN',
      reference: knownReference,
      authorizationUrl: null,
      transactionStatus: null,
      confirmedPaid: false,
      providerReferences: Object.freeze(references),
      ambiguityReason: classification.ambiguityReason,
      dispatchedAt,
      completedAt,
    };
  }
  const failure = classification.failure;
  return {
    outcome: 'FAILED',
    reference: knownReference,
    authorizationUrl: null,
    transactionStatus: null,
    confirmedPaid: false,
    providerReferences: Object.freeze(references),
    failure: {
      code: failure?.providerErrorCode ?? 'COLLECTION_EXECUTION_FAILED',
      message: failure?.providerErrorMessage ?? 'paystack answered with an error status',
      retryable: failure?.retryable ?? false,
    },
    dispatchedAt,
    completedAt,
  };
}

/**
 * The grant + material validation every write path runs first (fail-closed;
 * module-scope and shared with the hosted-payment-page sibling module — the
 * ONE derivation seam from capabilities.ts, never a duplicated law).
 */
export function admitCollection(
  material: unknown,
  executionMode: ExecutionMode,
): { readonly apiKey: string } {
  const validated = validatePaystackSecretKeyMaterial(material);
  derivePaystackSandboxCollectionGrant(validated.apiKey, executionMode);
  return { apiKey: validated.apiKey };
}

/** Read the canonical collection fields off a provider answer (never guesses). */
function collectionFieldsOf(body: unknown): {
  reference: string | null;
  authorizationUrl: string | null;
  status: string | null;
} {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { reference: null, authorizationUrl: null, status: null };
  }
  const data = (body as { data?: unknown }).data;
  const record =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : (body as Record<string, unknown>);
  const reference = record['reference'];
  const authorizationUrl = record['authorization_url'];
  const status = record['status'];
  return {
    reference: typeof reference === 'string' && reference.length > 0 ? reference : null,
    authorizationUrl:
      typeof authorizationUrl === 'string' && authorizationUrl.startsWith('https://')
        ? authorizationUrl
        : null,
    status: typeof status === 'string' && status.length > 0 ? status : null,
  };
}

/**
 * Create the collection execution driver. Every returned function is a
 * seal consumer: `(material) => Promise<PaystackCollectionExecutionResult>`.
 */
export function createPaystackCollectionExecution(
  deps: PaystackCollectionExecutionDeps,
): {
  readonly initializeTransaction: (
    material: unknown,
    input: PaystackCollectionInitializeInput,
  ) => Promise<PaystackCollectionExecutionResult>;
  readonly verifyTransaction: (
    material: unknown,
    reference: string,
  ) => Promise<PaystackCollectionExecutionResult>;
} {
  const headersOf = (apiKey: string): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
  });
  const seal = (
    result: PaystackCollectionExecutionResult,
    secrets: readonly string[],
  ): PaystackCollectionExecutionResult => {
    assertNoSecretMaterial(result, secrets, 'paystack collection execution result');
    return Object.freeze(result);
  };

  return {
    /** INITIALIZE a hosted payment request (the commerce collection path). */
    async initializeTransaction(material, input): Promise<PaystackCollectionExecutionResult> {
      // The INV-30 gate runs BEFORE any dispatch: the typed purpose class
      // is validated against the collection-eligible set and a remittance-
      // shaped or unclassified transaction never reaches the wire. The
      // gate reads ONLY the typed class — no reason string, label or
      // metadata can launder a prohibited class into an eligible one.
      refuseIneligiblePaystackPurpose('COLLECTION', input.purposeClass);
      const { apiKey } = admitCollection(material, deps.executionMode);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      if (typeof input.email !== 'string' || input.email.includes('@') === false) {
        throw new ValidationError('the collection initialize requires the customer email');
      }
      if (!/^\d+$/.test(input.amountMinorUnits)) {
        throw new ValidationError('amountMinorUnits must be a non-negative decimal string of minor units');
      }
      if (!/^[a-z]{3}$/.test(input.currency)) {
        throw new ValidationError('currency must be a lowercase 3-letter ISO code');
      }
      if (typeof input.reference !== 'string' || input.reference.length === 0) {
        throw new ValidationError(
          'the collection initialize requires the caller-scoped UNIQUE reference (the idempotency law)',
        );
      }
      const params: Record<string, string> = {
        email: input.email,
        amount: input.amountMinorUnits,
        currency: input.currency,
        reference: input.reference,
      };
      if (input.callbackUrl !== undefined) {
        if (typeof input.callbackUrl !== 'string' || !/^https?:\/\//.test(input.callbackUrl)) {
          throw new ValidationError('the callbackUrl must be an absolute http(s) URL when provided');
        }
        params['callback_url'] = input.callbackUrl;
      }
      const response = await deps.transport.send({
        operationId: 'paystack.transaction.initialize',
        idempotencyKey: input.reference,
        params,
        headers: headersOf(apiKey),
        correlationId: `paystack-collection-initialize:${input.reference}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmedCollectionResult(classification, dispatchedAt, deps.clock.now(), input.reference), secrets);
      }
      const fields = collectionFieldsOf(response.body);
      if (fields.authorizationUrl === null || fields.reference === null) {
        // A 2xx without the hosted-page shape is uninterpretable evidence:
        // UNKNOWN (INV-04) — never a guessed payment request.
        return seal(
          {
            outcome: 'UNKNOWN',
            reference: input.reference,
            authorizationUrl: null,
            transactionStatus: null,
            confirmedPaid: false,
            providerReferences: Object.freeze([input.reference]),
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
          reference: fields.reference,
          authorizationUrl: fields.authorizationUrl,
          transactionStatus: fields.status,
          // A CONFIRMED initialize is a payment REQUEST, never money movement.
          confirmedPaid: false,
          providerReferences: Object.freeze([
            fields.reference,
            ...(fields.status !== null ? [fields.status] : []),
          ]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },

    /** The read-back / reconcile read: verify one transaction by its unique reference. */
    async verifyTransaction(material, reference): Promise<PaystackCollectionExecutionResult> {
      const { apiKey } = admitCollection(material, deps.executionMode);
      const secrets = secretStringsOf(material);
      const dispatchedAt = deps.clock.now();
      if (typeof reference !== 'string' || reference.length === 0) {
        throw new ValidationError('verify requires a non-empty transaction reference');
      }
      const response = await deps.transport.send({
        operationId: 'paystack.transaction.verify',
        idempotencyKey: `paystack-collection-verify:${reference}`,
        params: { reference },
        headers: headersOf(apiKey),
        correlationId: `paystack-collection-verify:${reference}`,
      });
      const classification = classifyTransportOutcome(response);
      if (classification.outcome !== 'CONFIRMED') {
        return seal(unconfirmedCollectionResult(classification, dispatchedAt, deps.clock.now(), reference), secrets);
      }
      const fields = collectionFieldsOf(response.body);
      if (fields.reference === null || fields.status === null) {
        return seal(
          {
            outcome: 'UNKNOWN',
            reference,
            authorizationUrl: null,
            transactionStatus: null,
            confirmedPaid: false,
            providerReferences: Object.freeze([reference]),
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
          reference: fields.reference,
          authorizationUrl: null,
          transactionStatus: fields.status,
          // HONEST FINALITY: paid only when the provider's own status word
          // says success — never a guessed success on any other status.
          confirmedPaid: fields.status === 'success',
          providerReferences: Object.freeze([fields.reference, fields.status]),
          dispatchedAt,
          completedAt: deps.clock.now(),
        },
        secrets,
      );
    },
  };
}
