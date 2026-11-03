/**
 * @payswap/provider-runtime — the Paystack HOSTED PAYMENT PAGE product
 * (P27-C, ADR-0020 D4): the provider's reusable commerce page — the
 * second half of the collection surface, split from
 * collection-execution.ts per the <=400-line file law (the Stripe
 * webhook-signature/webhook-verification split precedent). The shared
 * collection laws (the grant derivation, the INV-30 purpose gate, the
 * result shape, the unconfirmed classifier, the escape-scan) live in
 * collection-execution.ts and are consumed here through their ONE seam
 * each — never duplicated law.
 *
 * WHAT A HOSTED PAGE IS: a provider-side, reusable payment page for the
 * business's goods or services — a COMMERCE surface. The INV-30 gate
 * runs before any dispatch (the typed purpose class must be
 * GENUINE_COMMERCE; a remittance-shaped or unclassified intent never
 * reaches the wire, and no label or metadata changes that).
 */

import { ValidationError } from '../../errors.ts';
import type { RuntimeClock, TimestampMs } from '../../clock.ts';
import { assertNoSecretMaterial, secretStringsOf } from '../../redaction.ts';
import type { ExecutionMode } from '../../execution-mode.ts';
import type { ProviderTransport } from '../../transport.ts';
import { classifyTransportOutcome } from '../../result-envelope.ts';
import {
  admitCollection,
  unconfirmedCollectionResult,
} from './collection-execution.ts';
import type { PaystackCollectionExecutionResult } from './collection-execution.ts';
import { refuseIneligiblePaystackPurpose } from './transfer-product-lane.ts';
import type { PaystackTransactionPurposeClass } from './transfer-product-lane.ts';

/** The hosted payment-page creation input. */
export interface PaystackHostedPageInput {
  /** The typed purpose class (a hosted page is a commerce surface — INV-30). */
  readonly purposeClass: PaystackTransactionPurposeClass;
  /** The page's name. */
  readonly name: string;
  readonly description?: string;
  /** Optional fixed amount in minor units. */
  readonly amountMinorUnits?: string;
  /** Optional fixed currency (lowercase 3-letter ISO). */
  readonly currency?: string;
}

/** Deps (same shape as the collection execution deps — one surface). */
export interface PaystackHostedPageDeps {
  readonly transport: ProviderTransport;
  readonly clock: RuntimeClock;
  readonly executionMode: ExecutionMode;
}

/**
 * Create the hosted-payment-page driver: the seal consumer that creates
 * one page (POST /page through the fail-closed endpoint map). HONEST
 * FINALITY: CONFIRMED requires the provider's answer to carry the
 * created page's id; a 2xx without the page shape is UNKNOWN (INV-04) —
 * never a guessed page.
 */
export function createPaystackHostedPaymentPage(
  deps: PaystackHostedPageDeps,
): (material: unknown, input: PaystackHostedPageInput) => Promise<PaystackCollectionExecutionResult> {
  const seal = (
    result: PaystackCollectionExecutionResult,
    secrets: readonly string[],
  ): PaystackCollectionExecutionResult => {
    assertNoSecretMaterial(result, secrets, 'paystack hosted payment page result');
    return Object.freeze(result);
  };
  return async (material, input): Promise<PaystackCollectionExecutionResult> => {
    // INV-30 first: a hosted page is a commerce surface — the typed class
    // gate reads ONLY the class; no label launders a prohibited purpose.
    refuseIneligiblePaystackPurpose('COLLECTION', input.purposeClass);
    const { apiKey } = admitCollection(material, deps.executionMode);
    const secrets = secretStringsOf(material);
    const dispatchedAt: TimestampMs = deps.clock.now();
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new ValidationError('a hosted payment page requires a non-empty name');
    }
    if (input.amountMinorUnits !== undefined && !/^\d+$/.test(input.amountMinorUnits)) {
      throw new ValidationError(
        'the page amount, when provided, must be a decimal string of minor units',
      );
    }
    if (input.currency !== undefined && !/^[a-z]{3}$/.test(input.currency)) {
      throw new ValidationError('the page currency, when provided, must be a lowercase 3-letter ISO code');
    }
    const params: Record<string, string> = { name: input.name.slice(0, 200) };
    if (input.description !== undefined) {
      if (typeof input.description !== 'string' || input.description.length === 0) {
        throw new ValidationError('the page description must be a non-empty string when provided');
      }
      params['description'] = input.description.slice(0, 500);
    }
    if (input.amountMinorUnits !== undefined) {
      params['amount'] = input.amountMinorUnits;
    }
    if (input.currency !== undefined) {
      params['currency'] = input.currency;
    }
    const response = await deps.transport.send({
      operationId: 'paystack.page.create',
      idempotencyKey: `paystack-page-create:${input.name}:${String(dispatchedAt)}`,
      params,
      headers: { Authorization: `Bearer ${apiKey}` },
      correlationId: `paystack-page-create:${String(dispatchedAt)}`,
    });
    const classification = classifyTransportOutcome(response);
    if (classification.outcome !== 'CONFIRMED') {
      return seal(unconfirmedCollectionResult(classification, dispatchedAt, deps.clock.now(), null), secrets);
    }
    const data = (response.body ?? {}) as { data?: unknown };
    const record =
      data.data !== null && typeof data.data === 'object' && !Array.isArray(data.data)
        ? (data.data as Record<string, unknown>)
        : null;
    const pageId = record !== null ? record['id'] : undefined;
    const pageName = record !== null ? record['name'] : undefined;
    if (record === null || (typeof pageId !== 'string' && typeof pageId !== 'number')) {
      return seal(
        {
          outcome: 'UNKNOWN',
          reference: null,
          authorizationUrl: null,
          transactionStatus: null,
          confirmedPaid: false,
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
        reference: typeof pageName === 'string' ? pageName : String(pageId),
        authorizationUrl: null,
        transactionStatus: null,
        confirmedPaid: false,
        providerReferences: Object.freeze([String(pageId), ...(typeof pageName === 'string' ? [pageName] : [])]),
        dispatchedAt,
        completedAt: deps.clock.now(),
      },
      secrets,
    );
  };
}
