/**
 * @payswap/provider-runtime — the provider transport contract (P2-W2).
 *
 * The transport is the ONE edge where a provider is actually contacted.
 * Discipline adapted from the old repo's Stripe production connector
 * (payswap.org@8a735bf packages/rails/src/stripe.ts + support.ts):
 *
 * - NO provider SDKs, NO ambient fetch in unit-testable paths: every call
 *   goes through this injected `ProviderTransport` interface. Tests use
 *   deterministic in-memory fakes that CANNOT execute production effects
 *   (transportClass 'FAKE_DETERMINISTIC').
 * - The transport DECLares its class; the sandbox/live law validates the
 *   binding (a LIVE runtime never binds a fake).
 * - The outbound call carries the per-operation idempotency key and field
 *   (endpoint-specific contract), redacted-checkable params and
 *   provider-specific headers constructed inside the credential seal.
 * - The response is classified by the caller (result-envelope.ts):
 *   DELIVERED + definitive provider answer vs NOT_DELIVERED with the
 *   failure position (BEFORE_DISPATCH vs AFTER_DISPATCH) — the position
 *   decides FAILED vs UNKNOWN (INV-04).
 *
 * Secrets: the headers map may carry credential material (that is its
 * job). It exists ONLY inside the transport call; every recorded artifact
 * passes through redaction. Transports must never log headers.
 */

import { ValidationError } from './errors.ts';
import type { TransportClass } from './execution-mode.ts';

/** The failure positions a transport can report. */
export const TRANSPORT_FAILURE_KINDS = [
  'REFUSED_BEFORE_DISPATCH',
  'TIMEOUT_AFTER_DISPATCH',
  'CONNECTION_LOST_AFTER_DISPATCH',
  'MALFORMED_RESPONSE',
] as const;

export type TransportFailureKind = (typeof TRANSPORT_FAILURE_KINDS)[number];

export function isTransportFailureKind(value: unknown): value is TransportFailureKind {
  return (
    typeof value === 'string' && (TRANSPORT_FAILURE_KINDS as readonly unknown[]).includes(value)
  );
}

/** One outbound provider call. */
export interface ProviderTransportCall {
  readonly operationId: string;
  /** The idempotency key (outbound header/field value, per the operation contract). */
  readonly idempotencyKey: string;
  /** Which provider field carries the key when it is a body field, not a header. */
  readonly idempotencyField?: string;
  /** Operation params (must already pass the redaction gate — no secrets). */
  readonly params: unknown;
  /** Provider-specific headers (secret material MAY live here — transport-edge only). */
  readonly headers: Readonly<Record<string, string>>;
  /** Correlation id for transport-level tracing (never a secret). */
  readonly correlationId: string;
}

/**
 * The transport response. `delivered` is the provider-answered bit; when
 * false, `failure.kind` states WHERE the attempt died — which decides
 * FAILED (never left) vs UNKNOWN (may have landed; INV-04).
 */
export interface ProviderTransportResponse {
  /** Did the provider answer? */
  readonly delivered: boolean;
  /** HTTP-like status code when delivered. */
  readonly status?: number;
  /** Raw provider response body when delivered (retained losslessly upstream). */
  readonly body?: unknown;
  /** Parsed provider error code when delivered with an error status. */
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  /** Failure detail when not delivered. */
  readonly failure?: {
    readonly kind: TransportFailureKind;
    readonly detail?: string;
  };
}

/** The provider transport contract (injected; never constructed ambiently). */
export interface ProviderTransport {
  /** Declared class — validated against the runtime's execution mode. */
  readonly transportClass: TransportClass;
  /** Human-readable transport identity (provenance surface; never a secret). */
  readonly transportId: string;
  send(call: ProviderTransportCall): Promise<ProviderTransportResponse>;
}

/** Structural validation of a transport response (untyped sources). */
export function validateTransportResponse(response: ProviderTransportResponse): void {
  if (response === null || typeof response !== 'object') {
    throw new ValidationError('transport response must be an object');
  }
  if (typeof response.delivered !== 'boolean') {
    throw new ValidationError('transport response.delivered must be a boolean');
  }
  if (response.delivered) {
    if (typeof response.status !== 'number' || !Number.isInteger(response.status)) {
      throw new ValidationError('a delivered response requires an integer status');
    }
    return;
  }
  if (response.failure === undefined || !isTransportFailureKind(response.failure.kind)) {
    throw new ValidationError('an undelivered response requires a canonical failure kind');
  }
}

/** Helper for building delivered responses. */
export function deliveredResponse(status: number, body: unknown): ProviderTransportResponse {
  if (!Number.isInteger(status)) {
    throw new ValidationError('status must be an integer');
  }
  return Object.freeze({ delivered: true, status, body });
}

/** Helper for building provider-error responses (delivered, error status). */
export function providerErrorResponse(
  status: number,
  providerErrorCode: string,
  providerErrorMessage: string,
): ProviderTransportResponse {
  if (typeof providerErrorCode !== 'string' || providerErrorCode.length === 0) {
    throw new ValidationError('providerErrorCode must be a non-empty string');
  }
  return Object.freeze({
    delivered: true,
    status,
    providerErrorCode,
    providerErrorMessage,
  });
}

/** Helper for building undelivered failures. */
export function undeliveredResponse(kind: TransportFailureKind, detail?: string): ProviderTransportResponse {
  if (!isTransportFailureKind(kind)) {
    throw new ValidationError('failure kind must be canonical', { kind });
  }
  return detail === undefined
    ? Object.freeze({ delivered: false, failure: Object.freeze({ kind }) })
    : Object.freeze({ delivered: false, failure: Object.freeze({ kind, detail }) });
}
