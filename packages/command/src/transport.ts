/**
 * @payswap/command — transport wire shapes (P7-W3).
 *
 * TRANSPORTS-AS-CONTRACTS LAW (the P4-W3 doctrine): transports are TYPED
 * SHAPES, never I/O. This module pins the request/response envelope wire
 * contracts every transport (REST, RPC, Extension bridge) carries:
 *
 * - every request is AUTHENTICATED (`RequestAuth` — principal + scheme)
 *   and pins an EXPLICIT API version (no implicit/unversioned default);
 * - every MUTATING request carries an idempotency key (INV-6);
 * - successful responses use the `{ data, meta }` envelope where meta
 *   carries schemaVersion, requestId and (on replay) idempotentReplay;
 * - errors use the `ApiError` wire model with the command-surface category
 *   vocabulary and a deterministic category -> HTTP status mapping.
 *   EXTERNAL_AMBIGUITY maps to 409 plus the response marker header
 *   `X-PaySwap-Outcome: unknown` — NEVER a generic 500 — because an
 *   unknown external outcome must be surfaced for reconciliation (INV-4).
 *
 * Wire shapes PORTED from the old repository's REST boundary contract
 * (@payswap/interfaces http.ts), adapted onto this package's error taxonomy
 * (UNSUPPORTED_VERSION added; RATE_LIMITED retained) and version pins.
 */

import type { CommandErrorCategory } from './errors.ts';
import { CommandError, ExternalAmbiguityError } from './errors.ts';
import type { PrincipalRef } from './identifiers.ts';
import { principalRefKey } from './identifiers.ts';
import type { SessionLookup } from './session-contract.ts';
import {
  API_VERSION_HEADER,
  assertSupportedApiVersion,
  isSupportedApiVersion,
} from './version.ts';

/** Transport header carrying the pinned external API version (from version.ts). */
export const API_VERSION_HEADER_NAME = API_VERSION_HEADER;

/** Response marker header for externally ambiguous outcomes. */
export const OUTCOME_HEADER = 'X-PaySwap-Outcome';

/** Standard idempotency key header (required on mutations). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Documented status for externally ambiguous outcomes (never a generic 500). */
export const EXTERNAL_AMBIGUITY_HTTP_STATUS = 409;

/** Marker value for the X-PaySwap-Outcome header on EXTERNAL_AMBIGUITY. */
export const EXTERNAL_AMBIGUITY_OUTCOME_MARKER = 'unknown';

/** How a request was authenticated and on behalf of which principal. */
export interface RequestAuth {
  readonly principal: string;
  readonly scheme: 'SESSION' | 'API_KEY' | 'SERVICE_TOKEN';
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const MUTATING_HTTP_METHODS: readonly HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Narrow a string to a mutating HTTP method (GET is not mutating). */
export function isMutatingHttpMethod(method: string): boolean {
  return (MUTATING_HTTP_METHODS as readonly string[]).includes(method);
}

/**
 * Transport-neutral request envelope (the authenticated call shape):
 * - auth and apiVersion are required on every request;
 * - idempotencyKey is REQUIRED on mutations (INV-6);
 * - body is optional (GET) or payload-bearing (mutations).
 */
export interface RequestEnvelope<TBody = unknown> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly auth: RequestAuth;
  /** The API version pinned via X-PaySwap-API-Version. Explicit; no default. */
  readonly apiVersion: string;
  /** REQUIRED on mutating requests: one key maps to one authoritative result. */
  readonly idempotencyKey?: string;
  readonly body?: TBody;
}

/** Response metadata shared by success and error envelopes. */
export interface ResponseMeta {
  /** Version of the payload schema for the returned object. */
  readonly schemaVersion: string;
  /** Server-assigned unique request identifier (echoed for support). */
  readonly requestId: string;
  /** True when this response replays the authoritative result of a prior, identical idempotent mutation (INV-6). */
  readonly idempotentReplay?: boolean;
  /** Authorization-lineage reference; present on every mutation response (evidence-lineage law, INV-5). */
  readonly evidenceRef?: string;
}

/** Success response envelope. */
export interface ResponseEnvelope<TData = unknown> {
  readonly data: TData;
  readonly meta: ResponseMeta;
}

/**
 * REST/RPC wire error model. `code` is stable/machine-readable, `category`
 * is one of the command-surface categories, `message` is human.
 * `reconciliationRef` is expected on EXTERNAL_AMBIGUITY errors (INV-4:
 * reconciliation owns the resolution).
 */
export interface ApiError {
  readonly code: string;
  readonly category: CommandErrorCategory;
  readonly message: string;
  /** Structured, category-specific supplementary details. */
  readonly details?: Readonly<Record<string, unknown>>;
  /**
   * Reference to the reconciliation case tracking an externally ambiguous
   * outcome. Expected for EXTERNAL_AMBIGUITY errors.
   */
  readonly reconciliationRef?: string;
}

/** Error response envelope. */
export interface ErrorResponse {
  readonly error: ApiError;
  readonly meta: {
    readonly schemaVersion: string;
    readonly requestId: string;
  };
}

/**
 * The transport result union: either a success envelope with a status and
 * optional headers, or an error body with a status and optional headers.
 * A TYPED SHAPE — the physical delivery is an injected port, never this
 * package's concern.
 */
export type HttpTransportResult =
  | {
      readonly kind: 'success';
      readonly status: number;
      readonly envelope: ResponseEnvelope<unknown>;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'error';
      readonly status: number;
      readonly body: ErrorResponse;
      readonly headers?: Readonly<Record<string, string>>;
    };

export type RequestValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly string[] };

/** The validation outcome of a request envelope against the transport contract. */
export interface RequestValidationOptions {
  /** API versions the receiver currently accepts (explicit; no default). */
  readonly supportedApiVersions?: readonly string[];
}

// ---------------------------------------------------------------------------
// Deterministic category -> HTTP status mapping (the REST error contract)
// ---------------------------------------------------------------------------

/**
 * Deterministic, exhaustive category -> HTTP status mapping:
 *   VALIDATION -> 400          CONFLICT -> 409
 *   NOT_FOUND -> 404           EXTERNAL_AMBIGUITY -> 409 (+ X-PaySwap-Outcome: unknown)
 *   AUTHORIZATION_REQUIRED -> 403   RATE_LIMITED -> 429
 *   POLICY_BLOCKED -> 422      UNSUPPORTED_VERSION -> 400
 *   TERMINAL_STATE -> 409      INTERNAL -> 500
 * EXTERNAL_AMBIGUITY -> 409 with the outcome marker, never a generic 500
 * (INV-4: an unknown external outcome is surfaced for reconciliation).
 */
const CATEGORY_HTTP_STATUS: Readonly<Record<CommandErrorCategory, number>> = {
  VALIDATION: 400,
  CONFLICT: 409,
  NOT_FOUND: 404,
  AUTHORIZATION_REQUIRED: 403,
  POLICY_BLOCKED: 422,
  EXTERNAL_AMBIGUITY: EXTERNAL_AMBIGUITY_HTTP_STATUS,
  TERMINAL_STATE: 409,
  UNSUPPORTED_VERSION: 400,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Map an error category to its documented HTTP status (deterministic, exhaustive). */
export function mapErrorCategoryToHttpStatus(category: CommandErrorCategory): number {
  return CATEGORY_HTTP_STATUS[category];
}

/**
 * The X-PaySwap-Outcome marker for an error category, or undefined when no
 * marker applies. Only EXTERNAL_AMBIGUITY carries a marker ("unknown").
 */
export function outcomeMarkerForErrorCategory(category: CommandErrorCategory): string | undefined {
  return category === 'EXTERNAL_AMBIGUITY' ? EXTERNAL_AMBIGUITY_OUTCOME_MARKER : undefined;
}

// ---------------------------------------------------------------------------
// Request envelope validation (the transport contract, fail closed)
// ---------------------------------------------------------------------------

/**
 * Validate a request envelope against the transport contract. Contract
 * violations detected (each surfaces as a violation string — total-error):
 * - missing/empty auth principal;
 * - missing, malformed or unsupported API version (explicit external
 *   versioning — no implicit default);
 * - mutating request without a non-empty idempotency key (INV-6).
 */
export function validateRequestEnvelope(
  request: RequestEnvelope<unknown>,
  options?: RequestValidationOptions,
): RequestValidation {
  const violations: string[] = [];
  const auth = request?.auth;
  if (auth === undefined || auth === null || typeof auth.principal !== 'string' || auth.principal === '') {
    violations.push('auth.principal is required on every request');
  }
  const supported = options?.supportedApiVersions ?? undefined;
  if (typeof request.apiVersion !== 'string' || request.apiVersion === '') {
    violations.push(`apiVersion is required (${API_VERSION_HEADER_NAME}); external versioning is explicit`);
  } else if (supported !== undefined && !isSupportedApiVersion(request.apiVersion, supported)) {
    violations.push(
      `api.version_unsupported: ${request.apiVersion} (supported: ${supported.join(', ')})`,
    );
  }
  if (
    isMutatingHttpMethod(request.method) &&
    (typeof request.idempotencyKey !== 'string' || request.idempotencyKey === '')
  ) {
    violations.push(
      `idempotencyKey is REQUIRED on mutating requests (${IDEMPOTENCY_KEY_HEADER}); one idempotency key maps to one authoritative command result (INV-6)`,
    );
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations: [...violations] };
}

/**
 * Assert the transport contract on a request envelope (fail closed): the
 * API version must be EXPLICIT and supported (UnsupportedVersionError, the
 * explicit-versioning law) and mutations must carry an idempotency key
 * (ValidationError, INV-6). Used by dispatch pipelines that prefer
 * exceptions over violation lists.
 */
export function assertRequestEnvelopeContract(
  request: RequestEnvelope<unknown>,
  options?: RequestValidationOptions,
): void {
  const supported = options?.supportedApiVersions;
  if (supported !== undefined) {
    assertSupportedApiVersion(request.apiVersion, 'request.apiVersion', supported);
  }
  const validation = validateRequestEnvelope(request, options);
  if (!validation.ok) {
    throw new CommandError({
      code: 'REQUEST_CONTRACT_VIOLATION',
      category: 'VALIDATION',
      message: validation.violations.join('; '),
      details: { violations: [...validation.violations] },
    });
  }
}

// ---------------------------------------------------------------------------
// CommandError -> ApiError wire mapping (total-error; INV-4 discipline)
// ---------------------------------------------------------------------------

/**
 * Map a `CommandError` onto the wire `ApiError` model. Deterministic,
 * total: every category maps. EXTERNAL_AMBIGUITY errors MUST carry a
 * reconciliationRef (INV-4: reconciliation owns the resolution) — the
 * caller injects `mintReconciliationRef`; a missing injector on an
 * ambiguity fails closed rather than emitting an ambiguity without a
 * reconciliation path.
 */
export function toWireError(
  error: CommandError,
  deps?: { readonly mintReconciliationRef?: () => string },
): ApiError {
  if (error.category === 'EXTERNAL_AMBIGUITY') {
    const existing = error.details?.['reconciliationRef'];
    const reconciliationRef =
      typeof existing === 'string' && existing !== ''
        ? existing
        : deps?.mintReconciliationRef?.();
    if (reconciliationRef === undefined) {
      throw new ExternalAmbiguityError(
        'an EXTERNAL_AMBIGUITY wire error requires a reconciliationRef — inject mintReconciliationRef (INV-4: reconciliation owns the resolution)',
        { code: error.code },
      );
    }
    return {
      code: error.code,
      category: error.category,
      message: error.message,
      ...(error.details === undefined ? {} : { details: { ...error.details, reconciliationRef } }),
      reconciliationRef,
    };
  }
  return {
    code: error.code,
    category: error.category,
    message: error.message,
    ...(error.details === undefined ? {} : { details: { ...error.details } }),
  };
}

// ---------------------------------------------------------------------------
// The request authentication decision (pure, fail closed)
// ---------------------------------------------------------------------------

/** The authenticated request context a dispatch pipeline proceeds with. */
export interface AuthenticatedRequest {
  readonly principal: PrincipalRef;
  readonly tenantId: string;
}

/**
 * THE REQUEST AUTHENTICATION DECISION (pure, fail closed — adapted from
 * the old repository's session authentication pipeline): given the
 * request's declared auth and the session lookup outcome, either the
 * authenticated request context or a typed CommandError. The laws:
 * - only the SESSION scheme authenticates here (other schemes fail closed
 *   with AUTHORIZATION_REQUIRED — API-key/service-token authentication is
 *   a different composition);
 * - an invalid session (unknown/revoked/expired/epoch-stale) NEVER
 *   authenticates;
 * - the claimed principal must match the session's principal exactly
 *   (principalRefKey comparison — the claimed principal is just a claim).
 */
export function authenticateRequest(auth: RequestAuth, lookup: SessionLookup): AuthenticatedRequest {
  if (auth.scheme !== 'SESSION') {
    throw new CommandError({
      code: 'AUTH_SCHEME_UNSUPPORTED',
      category: 'AUTHORIZATION_REQUIRED',
      message: `this surface authenticates via session tokens; scheme ${auth.scheme} is not supported here`,
      details: { scheme: auth.scheme },
    });
  }
  if (typeof auth.principal !== 'string' || auth.principal === '') {
    throw new CommandError({
      code: 'AUTH_PRINCIPAL_REQUIRED',
      category: 'AUTHORIZATION_REQUIRED',
      message: 'SESSION authentication requires a claimed principal',
    });
  }
  if (!lookup.valid) {
    throw new CommandError({
      code: 'AUTH_SESSION_INVALID',
      category: 'AUTHORIZATION_REQUIRED',
      message: `session rejected: ${lookup.reason}`,
      details: { reason: lookup.reason },
    });
  }
  const session = lookup.session;
  if (auth.principal !== principalRefKey(session.principal)) {
    throw new CommandError({
      code: 'AUTH_PRINCIPAL_MISMATCH',
      category: 'AUTHORIZATION_REQUIRED',
      message: 'the claimed principal does not match the authenticated session principal',
      details: { claimed: auth.principal },
    });
  }
  return { principal: session.principal, tenantId: session.tenantId };
}
