/**
 * @payswap/provider-runtime — the execution result envelope (P2-W2).
 *
 * INV-04: UNKNOWN is distinct from FAILED and is reconciled rather than
 * blindly retried. The bridge NEVER collapses an ambiguous outcome into a
 * failure: after a potentially effective external command, an ambiguous
 * result is UNKNOWN and must be reconciled (provider retrieval) before any
 * consequential retry. The definitive resolver is the P1-W2 protocol lane;
 * this runtime classifies and preserves, it never decides financial truth.
 *
 * Classification table (transport response → outcome):
 *
 * | Transport response                                    | Outcome    |
 * |-------------------------------------------------------|------------|
 * | delivered, 2xx, provider object state                 | CONFIRMED  |
 * | delivered, 4xx/5xx with definitive provider error     | FAILED     |
 * | not delivered, REFUSED_BEFORE_DISPATCH                | FAILED     |
 * |   (the command never left — definitively no effect)   | (retryable)|
 * | not delivered, TIMEOUT_AFTER_DISPATCH                 | UNKNOWN    |
 * | not delivered, CONNECTION_LOST_AFTER_DISPATCH         | UNKNOWN    |
 * | delivered, MALFORMED_RESPONSE (unparseable answer)    | UNKNOWN    |
 *
 * The one subtlety: a delivered 5xx is a FAILED provider answer (the
 * provider answered with an error), while a TIMEOUT after dispatch is
 * UNKNOWN (the command may have landed). MALFORMED_RESPONSE means bytes
 * came back but could not be interpreted — the effect may have committed,
 * so UNKNOWN (never a guess).
 */

import { ValidationError } from './errors.ts';
import type { TimestampMs } from './clock.ts';
import type { RawStateRecordId } from './identifiers.ts';
import type { ProviderTransportResponse } from './transport.ts';

/** The three-value external-effect outcome (INV-04). */
export const EXTERNAL_EFFECT_OUTCOMES = ['CONFIRMED', 'UNKNOWN', 'FAILED'] as const;

export type ExternalEffectOutcome = (typeof EXTERNAL_EFFECT_OUTCOMES)[number];

export function isExternalEffectOutcome(value: unknown): value is ExternalEffectOutcome {
  return (
    typeof value === 'string' && (EXTERNAL_EFFECT_OUTCOMES as readonly unknown[]).includes(value)
  );
}

/** Provider failure metadata with the outcome-ambiguity classification. */
export interface ProviderFailureMetadata {
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  /** True when the provider/transport signals the failure is transient. */
  readonly retryable: boolean;
  /** NONE = definitive failure; OUTCOME_UNKNOWN feeds ambiguity handling (INV-04). */
  readonly ambiguity: 'NONE' | 'OUTCOME_UNKNOWN';
}

/** Why an outcome is UNKNOWN (recorded on every ambiguous attempt). */
export const AMBIGUITY_REASONS = [
  'TRANSPORT_TIMEOUT_AFTER_DISPATCH',
  'TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH',
  'MALFORMED_RESPONSE_AFTER_DISPATCH',
] as const;

export type AmbiguityReason = (typeof AMBIGUITY_REASONS)[number];

export function isAmbiguityReason(value: unknown): value is AmbiguityReason {
  return typeof value === 'string' && (AMBIGUITY_REASONS as readonly unknown[]).includes(value);
}

/**
 * The execution result envelope: exactly one of CONFIRMED / UNKNOWN /
 * FAILED, with the provider references, failure metadata, ambiguity
 * reason, retained raw-state pointer and the dispatch/complete times.
 */
export interface ExecutionResultEnvelope {
  readonly outcome: ExternalEffectOutcome;
  /** Provider-side object references the provider acknowledged/answered with. */
  readonly providerReferences: readonly string[];
  /** Present for FAILED (and never for CONFIRMED). */
  readonly providerFailure?: ProviderFailureMetadata;
  /** Present for UNKNOWN — the recorded ambiguity reason. */
  readonly ambiguityReason?: AmbiguityReason;
  /** Retained raw provider-state record (lossless retention upstream). */
  readonly rawStateRecordId?: RawStateRecordId;
  readonly dispatchedAt: TimestampMs;
  readonly completedAt: TimestampMs;
}

/** Classify a delivered 2xx response with the provider's object state. */
export function confirmedEnvelope(input: {
  readonly providerReferences: readonly string[];
  readonly rawStateRecordId?: RawStateRecordId;
  readonly dispatchedAt: TimestampMs;
  readonly completedAt: TimestampMs;
}): ExecutionResultEnvelope {
  if (input.providerReferences.length === 0) {
    throw new ValidationError('a CONFIRMED envelope requires at least one provider reference');
  }
  const envelope: {
    -readonly [K in keyof ExecutionResultEnvelope]: ExecutionResultEnvelope[K];
  } = {
    outcome: 'CONFIRMED',
    providerReferences: Object.freeze([...input.providerReferences]),
    dispatchedAt: input.dispatchedAt,
    completedAt: input.completedAt,
  };
  if (input.rawStateRecordId !== undefined) {
    envelope.rawStateRecordId = input.rawStateRecordId;
  }
  return Object.freeze(envelope);
}

/** Classify an ambiguous outcome (UNKNOWN — INV-04; reconcile before retry). */
export function unknownEnvelope(input: {
  readonly reason: AmbiguityReason;
  readonly providerReferences?: readonly string[];
  readonly rawStateRecordId?: RawStateRecordId;
  readonly dispatchedAt: TimestampMs;
  readonly completedAt: TimestampMs;
}): ExecutionResultEnvelope {
  if (!isAmbiguityReason(input.reason)) {
    throw new ValidationError('an UNKNOWN envelope requires a canonical ambiguity reason');
  }
  const envelope: {
    -readonly [K in keyof ExecutionResultEnvelope]: ExecutionResultEnvelope[K];
  } = {
    outcome: 'UNKNOWN',
    providerReferences: Object.freeze([...(input.providerReferences ?? [])]),
    ambiguityReason: input.reason,
    dispatchedAt: input.dispatchedAt,
    completedAt: input.completedAt,
  };
  if (input.rawStateRecordId !== undefined) {
    envelope.rawStateRecordId = input.rawStateRecordId;
  }
  return Object.freeze(envelope);
}

/** Classify a definitive failure (FAILED — the effect definitively did not happen). */
export function failedEnvelope(input: {
  readonly failure: ProviderFailureMetadata;
  readonly providerReferences?: readonly string[];
  readonly dispatchedAt: TimestampMs;
  readonly completedAt: TimestampMs;
}): ExecutionResultEnvelope {
  if (input.failure === null || typeof input.failure !== 'object') {
    throw new ValidationError('a FAILED envelope requires provider failure metadata');
  }
  if (input.failure.ambiguity === 'OUTCOME_UNKNOWN') {
    throw new ValidationError(
      'INV-04: an OUTCOME_UNKNOWN ambiguity must be an UNKNOWN envelope, never FAILED',
    );
  }
  const envelope: {
    -readonly [K in keyof ExecutionResultEnvelope]: ExecutionResultEnvelope[K];
  } = {
    outcome: 'FAILED',
    providerReferences: Object.freeze([...(input.providerReferences ?? [])]),
    providerFailure: Object.freeze({ ...input.failure }),
    dispatchedAt: input.dispatchedAt,
    completedAt: input.completedAt,
  };
  return Object.freeze(envelope);
}

/** Is this envelope an ambiguity demanding reconciliation? */
export function requiresReconciliationEnvelope(envelope: ExecutionResultEnvelope): boolean {
  return envelope.outcome === 'UNKNOWN';
}

/**
 * Map a transport response to its outcome classification (the table in the
 * module doc). `providerReferences` are supplied by the adapter when the
 * delivered body could be interpreted.
 */
export function classifyTransportOutcome(response: ProviderTransportResponse): {
  readonly outcome: ExternalEffectOutcome;
  readonly ambiguityReason?: AmbiguityReason;
  readonly failure?: ProviderFailureMetadata;
} {
  if (response.delivered) {
    const status = response.status ?? 0;
    if (status >= 200 && status < 300) {
      return { outcome: 'CONFIRMED' };
    }
    // Delivered with an error status: the provider ANSWERED — a definitive
    // provider-side failure (5xx is still an answer; retryability follows
    // the provider's semantics; ambiguity stays NONE because the provider
    // spoke definitively about its own state).
    return {
      outcome: 'FAILED',
      failure: Object.freeze({
        providerErrorCode: response.providerErrorCode ?? `HTTP_${String(status)}`,
        providerErrorMessage: response.providerErrorMessage ?? `provider answered ${String(status)}`,
        retryable: status >= 500,
        ambiguity: 'NONE',
      }),
    };
  }
  const kind = response.failure?.kind;
  switch (kind) {
    case 'REFUSED_BEFORE_DISPATCH':
      // The command never left the local process: definitively no effect.
      return {
        outcome: 'FAILED',
        failure: Object.freeze({
          providerErrorCode: 'NOT_DISPATCHED',
          providerErrorMessage: response.failure?.detail ?? 'transport refused before dispatch',
          retryable: true,
          ambiguity: 'NONE',
        }),
      };
    case 'TIMEOUT_AFTER_DISPATCH':
      return { outcome: 'UNKNOWN', ambiguityReason: 'TRANSPORT_TIMEOUT_AFTER_DISPATCH' };
    case 'CONNECTION_LOST_AFTER_DISPATCH':
      return { outcome: 'UNKNOWN', ambiguityReason: 'TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH' };
    case 'MALFORMED_RESPONSE':
      return { outcome: 'UNKNOWN', ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH' };
    default:
      throw new ValidationError('undelivered response carries no canonical failure kind');
  }
}

/** INV-04 guard: throws if an envelope claims FAILED while carrying ambiguity. */
export function assertInvariantOutcome(envelope: ExecutionResultEnvelope): void {
  if (envelope.outcome === 'FAILED' && envelope.providerFailure?.ambiguity === 'OUTCOME_UNKNOWN') {
    throw new ValidationError('INV-04: FAILED envelopes never carry OUTCOME_UNKNOWN ambiguity');
  }
  if (envelope.outcome === 'UNKNOWN' && envelope.ambiguityReason === undefined) {
    throw new ValidationError('INV-04: UNKNOWN envelopes carry a canonical ambiguity reason');
  }
  if (envelope.outcome === 'CONFIRMED' && envelope.providerFailure !== undefined) {
    throw new ValidationError('CONFIRMED envelopes never carry failure metadata');
  }
}

/**
 * Assemble the envelope from a transport classification plus the adapter's
 * parse products (provider references, retained raw-state pointer, times).
 * The single construction path the execution bridge uses.
 */
export function envelopeFromClassification(
  classification: {
    readonly outcome: ExternalEffectOutcome;
    readonly ambiguityReason?: AmbiguityReason;
    readonly failure?: ProviderFailureMetadata;
  },
  parts: {
    readonly providerReferences: readonly string[];
    readonly rawStateRecordId?: RawStateRecordId;
    readonly dispatchedAt: TimestampMs;
    readonly completedAt: TimestampMs;
  },
): ExecutionResultEnvelope {
  const envelope: {
    -readonly [K in keyof ExecutionResultEnvelope]: ExecutionResultEnvelope[K];
  } = {
    outcome: classification.outcome,
    providerReferences: Object.freeze([...parts.providerReferences]),
    dispatchedAt: parts.dispatchedAt,
    completedAt: parts.completedAt,
  };
  if (parts.rawStateRecordId !== undefined) {
    envelope.rawStateRecordId = parts.rawStateRecordId;
  }
  if (classification.ambiguityReason !== undefined) {
    envelope.ambiguityReason = classification.ambiguityReason;
  }
  if (classification.failure !== undefined) {
    envelope.providerFailure = classification.failure;
  }
  return Object.freeze(envelope);
}
