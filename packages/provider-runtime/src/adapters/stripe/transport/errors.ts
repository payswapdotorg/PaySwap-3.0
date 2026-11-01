/**
 * @payswap/provider-runtime — the Stripe transport ERROR CLASSIFICATION (P24-1).
 *
 * Handoff §5.4: provider responses map into a typed, safe classification
 * preserving the provider HTTP status, Stripe's typed error type/code and
 * the retryable-vs-non-retryable basis. Handoff §13.3 names the classes
 * that must be tested: 401/403 scope errors, 404, 409, 429, 5xx.
 *
 * SAFE FIELDS ONLY: the classification carries the status, the Stripe
 * error type/code (machine vocabulary) and the message (already a
 * provider-authored user-facing string — never echoed credentials; the
 * transport never places secrets in messages because it never places
 * secrets anywhere except the Authorization header). Decline codes ride
 * the same code field; full PAN/payment-sensitive fields never appear in
 * request-position classifications.
 */

/** The typed error classes (each is testable; handoff §13.3 vocabulary). */
export const STRIPE_ERROR_CLASSES = [
  'AUTHENTICATION_ERROR',
  'PERMISSION_SCOPE_ERROR',
  'RESOURCE_NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYMENT_DECLINED',
  'INVALID_REQUEST',
  'PROVIDER_INTERNAL_ERROR',
  'UNCLASSIFIED_HTTP_ERROR',
] as const;
export type StripeErrorClass = (typeof STRIPE_ERROR_CLASSES)[number];

/** Stripe's canonical error envelope ({error: {type, code, message, …}}). */
export interface StripeErrorEnvelope {
  readonly type: string | null;
  readonly code: string | null;
  readonly message: string | null;
  /** Stripe's param/param_ fields (safe field names, never values). */
  readonly param: string | null;
}

/** Read Stripe's canonical error envelope off a response body (never guesses). */
export function readStripeErrorEnvelope(body: unknown): StripeErrorEnvelope | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (error === null || typeof error !== 'object' || Array.isArray(error)) {
    return null;
  }
  const record = error as Record<string, unknown>;
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;
  return {
    type: text(record['type']),
    code: text(record['code']),
    message: text(record['message']),
    param: text(record['param']),
  };
}

/** The full classified error surface for one delivered error response. */
export interface StripeClassifiedError {
  readonly errorClass: StripeErrorClass;
  readonly httpStatus: number;
  readonly providerErrorType: string | null;
  readonly providerErrorCode: string | null;
  readonly providerErrorMessage: string | null;
  readonly providerErrorParam: string | null;
  /** Retry basis: true only for rate-limit backoff and 5xx provider failures. */
  readonly retryable: boolean;
  /** The Retry-After header's seconds when Stripe sent one (rate limiting). */
  readonly retryAfterSeconds: number | null;
}

/** THE CLASSIFIER: HTTP status + Stripe envelope → the typed class. */
export function classifyStripeHttpError(
  status: number,
  body: unknown,
  retryAfterHeader?: string,
): StripeClassifiedError {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new Error('classifyStripeHttpError requires an integer 4xx/5xx status');
  }
  const envelope = readStripeErrorEnvelope(body);
  const retryAfterSeconds =
    retryAfterHeader !== undefined && /^\d+$/.test(retryAfterHeader)
      ? Number.parseInt(retryAfterHeader, 10)
      : null;
  const base = {
    httpStatus: status,
    providerErrorType: envelope?.type ?? null,
    providerErrorCode: envelope?.code ?? null,
    providerErrorMessage: envelope?.message ?? null,
    providerErrorParam: envelope?.param ?? null,
    retryAfterSeconds,
  };
  // Stripe scope errors surface as 403 (or 401 with invalid_request_error
  // for a key lacking the permission) — both are non-retryable authz facts.
  if (status === 401) {
    return { ...base, errorClass: 'AUTHENTICATION_ERROR', retryable: false };
  }
  if (status === 403) {
    return { ...base, errorClass: 'PERMISSION_SCOPE_ERROR', retryable: false };
  }
  if (status === 404) {
    return { ...base, errorClass: 'RESOURCE_NOT_FOUND', retryable: false };
  }
  if (status === 409) {
    return { ...base, errorClass: 'CONFLICT', retryable: false };
  }
  if (status === 429) {
    return { ...base, errorClass: 'RATE_LIMITED', retryable: true };
  }
  if (status === 402) {
    // Stripe answers failed payments with 402 + a card_error envelope; the
    // decline code rides providerErrorCode (handoff §5.4 decline-code law).
    return { ...base, errorClass: 'PAYMENT_DECLINED', retryable: false };
  }
  if (status >= 500) {
    return { ...base, errorClass: 'PROVIDER_INTERNAL_ERROR', retryable: true };
  }
  if (status >= 400) {
    return { ...base, errorClass: 'INVALID_REQUEST', retryable: false };
  }
  return { ...base, errorClass: 'UNCLASSIFIED_HTTP_ERROR', retryable: false };
}

/** The safe, secret-free summary of a classified error (evidence surfaces). */
export function stripeClassifiedErrorSummary(error: StripeClassifiedError): string {
  const parts = [
    `stripe ${String(error.httpStatus)} ${error.errorClass}`,
    error.providerErrorType !== null ? `type=${error.providerErrorType}` : null,
    error.providerErrorCode !== null ? `code=${error.providerErrorCode}` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(' ');
}
