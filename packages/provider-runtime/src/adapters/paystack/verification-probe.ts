/**
 * @payswap/provider-runtime — the Paystack read-only verification probe
 * (P14-C, ADR-0008 D5).
 *
 * THE NEVER-ACTIVE LAW: this probe is the ONLY evidence path that can
 * carry a Paystack connection to ACTIVE — GET /transaction with the
 * sealed secret key, through the real transport, INSIDE the credential
 * seal. A catalogue entry or a pasted key is NEVER ACTIVE.
 *
 * THE SEAL PATTERN (credential-isolation.ts dispatch law): the probe is
 * the consumer that runs INSIDE broker.withMaterial — it receives the
 * sealed material, binds the Authorization header, dispatches, and
 * returns ONLY the clean provider evidence (the transaction references
 * read). Its own result is escape-scanned (assertNoSecretMaterial).
 *
 * UNKNOWN is not FAILED (INV-04): a timeout/lost-connection/malformed
 * probe is UNKNOWN and reconciles by running the read-only probe again.
 *
 * Paystack's /transaction answer shape: { status: true, message: …,
 * data: [{ id, status, amount, currency, … }, …] } — the transaction ids
 * ARE the provider references this probe reports (evidence the read
 * path works against the account's real transaction history).
 */

import { ValidationError } from '../../errors.ts';
import type { RuntimeClock, TimestampMs } from '../../clock.ts';
import { assertNoSecretMaterial, secretStringsOf } from '../../redaction.ts';
import type { ExecutionMode, TransportClass } from '../../execution-mode.ts';
import { validateTransportBinding } from '../../execution-mode.ts';
import type { ProviderTransport, ProviderTransportResponse } from '../../transport.ts';
import { classifyTransportOutcome } from '../../result-envelope.ts';
import type { AmbiguityReason, ProviderFailureMetadata } from '../../result-envelope.ts';
import {
  validatePaystackKeyModeBinding,
  validatePaystackSecretKeyMaterial,
} from './capabilities.ts';

/** The probe outcome (mirrors the result-envelope vocabulary, reused). */
export type PaystackProbeOutcomeKind = 'CONFIRMED' | 'UNKNOWN' | 'FAILED';

/** Provider rejection signals that mean the key itself is dead. */
const KEY_REJECTION_CODES = ['invalid_secret_key', 'invalid_key', 'key_revoked_by_operator'];

/** The typed, secret-free result of one verification probe run. */
export interface PaystackProbeResult {
  readonly outcome: PaystackProbeOutcomeKind;
  readonly executionMode: ExecutionMode;
  readonly transportClass: TransportClass;
  readonly transportId: string;
  /** The transaction references the probe read (their ids, capped). */
  readonly providerReferences: readonly string[];
  /** Present iff FAILED — provider failure metadata, never key material. */
  readonly failure?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    /** True when the provider rejected the KEY itself (dead credential). */
    readonly keyRejected: boolean;
  };
  /** Present iff UNKNOWN (INV-04 — reconcile before anything else). */
  readonly ambiguityReason?: AmbiguityReason;
  readonly dispatchedAt: TimestampMs;
  readonly completedAt: TimestampMs;
}

/** The deps the probe needs (all injected; no ambient clock or fetch). */
export interface PaystackVerificationProbeDeps {
  readonly transport: ProviderTransport;
  readonly clock: RuntimeClock;
  readonly executionMode: ExecutionMode;
}

/** How many transaction references the probe reports (evidence, capped). */
const MAX_REPORTED_TRANSACTIONS = 6;

/**
 * Create the probe driver. The returned function is the consumer that
 * runs INSIDE the credential seal: `(material) => Promise<PaystackProbeResult>`.
 */
export function createPaystackVerificationProbe(
  deps: PaystackVerificationProbeDeps,
): (material: unknown) => Promise<PaystackProbeResult> {
  validateTransportBinding(deps.executionMode, deps.transport.transportClass);
  return async (material: unknown): Promise<PaystackProbeResult> => {
    const dispatchedAt = deps.clock.now();
    const validated = validatePaystackSecretKeyMaterial(material);
    validatePaystackKeyModeBinding(validated.apiKey, deps.executionMode);
    const secrets = secretStringsOf(material);

    const headers = { Authorization: `Bearer ${validated.apiKey}` };
    const transactions = await deps.transport.send({
      operationId: 'paystack.transactions.read',
      idempotencyKey: `probe:transactions:${String(dispatchedAt)}`,
      params: {},
      headers,
      correlationId: `paystack-probe-transactions:${String(dispatchedAt)}`,
    });
    const classification = classifyTransportOutcome(transactions);
    if (classification.outcome !== 'CONFIRMED') {
      return sealResult(
        finishUnconfirmed(transactions, classification, deps, dispatchedAt),
        secrets,
      );
    }

    const body = (transactions.body ?? {}) as { status?: unknown; data?: unknown };
    const data = body.data;
    if (body.status !== true || !Array.isArray(data)) {
      // The provider answered 2xx without the canonical transactions
      // shape: uninterpretable evidence is UNKNOWN, never a fabricated
      // CONFIRMED. (A brand-new account may answer data: [] — an empty
      // history is still canonical evidence the read path works.)
      return sealResult(
        buildResult(
          { outcome: 'UNKNOWN', ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH' },
          deps,
          dispatchedAt,
        ),
        secrets,
      );
    }
    const references: string[] = [];
    for (const transaction of data) {
      if (transaction === null || typeof transaction !== 'object' || Array.isArray(transaction)) {
        continue;
      }
      const id = (transaction as { id?: unknown }).id;
      if (typeof id === 'number' || typeof id === 'string') {
        const reference = `txn_${String(id)}`;
        if (!references.includes(reference) && references.length < MAX_REPORTED_TRANSACTIONS) {
          references.push(reference);
        }
      }
    }
    if (references.length === 0 && data.length > 0) {
      return sealResult(
        buildResult(
          { outcome: 'UNKNOWN', ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH' },
          deps,
          dispatchedAt,
        ),
        secrets,
      );
    }
    return sealResult(
      buildResult(
        { outcome: 'CONFIRMED', providerReferences: references },
        deps,
        dispatchedAt,
      ),
      secrets,
    );
  };
}

/** Assemble the result record (single construction path). */
function buildResult(
  parts: {
    readonly outcome: PaystackProbeOutcomeKind;
    readonly providerReferences?: readonly string[];
    readonly failure?: PaystackProbeResult['failure'];
    readonly ambiguityReason?: AmbiguityReason;
  },
  deps: PaystackVerificationProbeDeps,
  dispatchedAt: TimestampMs,
): PaystackProbeResult {
  const result: {
    -readonly [K in keyof PaystackProbeResult]: PaystackProbeResult[K];
  } = {
    outcome: parts.outcome,
    executionMode: deps.executionMode,
    transportClass: deps.transport.transportClass,
    transportId: deps.transport.transportId,
    providerReferences: Object.freeze([...(parts.providerReferences ?? [])]),
    dispatchedAt,
    completedAt: deps.clock.now(),
  };
  if (parts.failure !== undefined) {
    result.failure = Object.freeze({ ...parts.failure });
  }
  if (parts.ambiguityReason !== undefined) {
    result.ambiguityReason = parts.ambiguityReason;
  }
  return Object.freeze(result);
}

/**
 * Classify a non-CONFIRMED transport answer into the probe result.
 * Fail-closed: a CONFIRMED classification can never reach here.
 */
function finishUnconfirmed(
  response: ProviderTransportResponse,
  classification: {
    readonly outcome: PaystackProbeOutcomeKind;
    readonly ambiguityReason?: AmbiguityReason;
    readonly failure?: ProviderFailureMetadata;
  },
  deps: PaystackVerificationProbeDeps,
  dispatchedAt: TimestampMs,
): PaystackProbeResult {
  if (classification.outcome === 'CONFIRMED') {
    throw new ValidationError(
      'a CONFIRMED transport answer must be handled by the probe, never by the unconfirmed path',
    );
  }
  if (classification.outcome === 'UNKNOWN') {
    if (classification.ambiguityReason === undefined) {
      throw new ValidationError('an UNKNOWN probe requires a canonical ambiguity reason');
    }
    return buildResult(
      { outcome: 'UNKNOWN', ambiguityReason: classification.ambiguityReason },
      deps,
      dispatchedAt,
    );
  }
  const failure = classification.failure;
  const code = failure?.providerErrorCode ?? 'PROBE_FAILED';
  const status = response.delivered ? (response.status ?? 0) : 0;
  // Key-death detection: 401 (Paystack's invalid-key answer) or a
  // provider code naming the key itself. The MESSAGE is deliberately NOT
  // the provider's verbatim text when the key is rejected.
  const keyRejected = status === 401 || KEY_REJECTION_CODES.includes(code);
  return buildResult(
    {
      outcome: 'FAILED',
      failure: {
        code,
        message: keyRejected
          ? 'the provider rejected the credential as invalid or expired'
          : (failure?.providerErrorMessage ?? 'the provider answered with an error status'),
        retryable: failure?.retryable ?? false,
        keyRejected,
      },
    },
    deps,
    dispatchedAt,
  );
}

/** The escape-scan gate: the probe result may never carry key material. */
function sealResult(result: PaystackProbeResult, secrets: readonly string[]): PaystackProbeResult {
  assertNoSecretMaterial(result, secrets, 'paystack verification probe result');
  return result;
}
