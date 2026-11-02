/**
 * @payswap/provider-runtime — the catalogue-driven Stripe transport (P24-1).
 *
 * ADR-0017 D6: ONE dispatch path per catalogue operation, protocol-aware
 * per namespace (v1 form / v2 JSON), built ONLY from the catalogue's
 * method + path + STRICTLY VALIDATED parameters:
 * - the operationId must resolve to a census record whose support state is
 *   an IMPLEMENTED state (unknown id or PLANNED/other state → REFUSED
 *   before dispatch — the DENY law; D7);
 * - parameters must pass the strict schema validator (D4) — unknown
 *   fields, missing required fields and type mismatches never reach the
 *   wire;
 * - the URL is assembled from the pinned path template + charset-safe
 *   path params + encoded query — NEVER from caller text; no arbitrary
 *   host/URL/header can be injected (handoff §13.1);
 * - the API version comes from the explicit per-call context (D2's
 *   migration law: never hardcoded, never silently changed);
 * - per-operation idempotency classification is honored: a v1
 *   state-changing POST REQUIRES the registrar's Idempotency-Key header
 *   (Stripe replays the stored response for a repeated key); a key on any
 *   other class is REFUSED;
 * - a timeout/connection-loss/malformed answer after possible dispatch is
 *   UNKNOWN, never FAILED (INV-04);
 * - errors are classified (401/403/404/409/429/5xx — typed, testable).
 *
 * SECRETS: the Authorization header exists only inside the fetch call
 * frame. The transport never logs (no logger exists here) and never
 * returns headers upward — status/body/classification/request-id only.
 */

import { ValidationError } from '../../../errors.ts';
import { STRIPE_API_BASE_URL } from '../declaration.ts';
import {
  stripeCensusDispatchAllowed,
  stripeCensusRecord,
} from '../catalogue/census.ts';
import { stripeOperationSchema } from '../catalogue/schema-reader.ts';
import { STRIPE_SCHEMA_DEFS } from '../catalogue/schema-reader.ts';
import {
  validateStripeOperationParameters,
  type StripeValidationIssue,
} from '../catalogue/schema-validator.ts';
import {
  stripeIdempotencyKeyAllowed,
} from '../catalogue/idempotency-classification.ts';
import {
  validateStripeCallContext,
  stripeCallHeaders,
  stripeCallTimeoutMs,
  type StripeCallContext,
} from './call-context.ts';
import { stripeV1FormBody, stripeV1QueryString } from './v1-form.ts';
import { stripeV2JsonBody, stripeV2QueryString } from './v2-json.ts';
import { stripeMultipartBody } from './multipart.ts';
import { classifyStripeHttpError, type StripeClassifiedError } from './errors.ts';
import {
  stripePaginateV1List,
  stripePaginateV2List,
  type StripePaginationBudget,
  type StripeV1PageWalk,
  type StripeV2PageWalk,
} from './pagination.ts';

/** The minimal fetch-response shape the transport needs (fake-friendly). */
export interface StripeCatalogueFetchResponse {
  readonly status: number;
  /** Optional response headers (request-id extraction only — never returned wholesale). */
  readonly headers?: Readonly<Record<string, string>>;
  text(): Promise<string>;
}

/** The injected fetch binding (the REAL edge binds globalThis.fetch). */
export type StripeCatalogueFetch = (
  url: string,
  init: {
    readonly method: 'GET' | 'POST' | 'DELETE';
    readonly headers: Readonly<Record<string, string>>;
    /** String bodies (form/JSON) or the multipart binary body (P25 file upload). */
    readonly body?: string | Uint8Array<ArrayBuffer>;
    readonly signal?: AbortSignal;
  },
) => Promise<StripeCatalogueFetchResponse>;

export interface StripeCatalogueTransportOptions {
  readonly fetchImpl: StripeCatalogueFetch;
  /** Defaults to the public Stripe API host. */
  readonly baseUrl?: string;
}

/** One dispatch request (the host's two-phase execute step). */
export interface StripeOperationDispatchInput {
  readonly operationId: string;
  /** JSON-typed parameter record (path/query/body fields, flat by name). */
  readonly params: Readonly<Record<string, unknown>>;
  readonly context: StripeCallContext;
  /** The registrar-scoped idempotency key (required for v1 state-changing POSTs). */
  readonly idempotencyKey?: string;
}

/** The typed dispatch result (UNKNOWN is first-class — INV-04). */
export type StripeOperationDispatchResult =
  | {
      readonly kind: 'OK';
      readonly status: number;
      readonly body: unknown;
      readonly requestId: string | null;
      readonly idempotencyKeyBound: boolean;
    }
  | {
      readonly kind: 'ERROR_STATUS';
      readonly error: StripeClassifiedError;
      readonly body: unknown;
      readonly requestId: string | null;
    }
  | {
      readonly kind: 'UNKNOWN';
      readonly ambiguity: 'TIMEOUT_AFTER_DISPATCH' | 'CONNECTION_LOST_AFTER_DISPATCH' | 'MALFORMED_RESPONSE';
      readonly note: string;
      readonly requestId: string | null;
    }
  | {
      readonly kind: 'REFUSED';
      readonly reason:
        | 'UNKNOWN_OPERATION'
        | 'NOT_DISPATCHABLE'
        | 'NO_SCHEMA_RECORD'
        | 'INVALID_CONTEXT'
        | 'INVALID_PARAMETERS'
        | 'IDEMPOTENCY_KEY_REQUIRED'
        | 'IDEMPOTENCY_KEY_NOT_ALLOWED'
        | 'UNSUPPORTED_CONTENT_TYPE';
      readonly detail: string;
      readonly issues?: readonly StripeValidationIssue[];
    };

function isAbortLikeError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    ((error as { name?: unknown }).name === 'AbortError' ||
      (error as { code?: unknown }).code === 'ABORT_ERR')
  );
}

function readRequestId(headers: Readonly<Record<string, string>> | undefined): string | null {
  if (headers === undefined) return null;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'request-id') {
      const value = headers[key];
      return typeof value === 'string' && value.length > 0 ? value : null;
    }
  }
  return null;
}

/** The styles of an operation's query parameters (serializer input). */
function queryStylesOf(
  parameters: Readonly<Record<string, { readonly location: string; readonly style?: string }>>,
): Record<string, 'form' | 'deepObject' | undefined> {
  const styles: Record<string, 'form' | 'deepObject' | undefined> = {};
  for (const [name, parameter] of Object.entries(parameters)) {
    if (parameter.location !== 'query') continue;
    styles[name] = parameter.style === 'form' || parameter.style === 'deepObject' ? parameter.style : undefined;
  }
  return styles;
}

/** THE TRANSPORT. Construct once per runtime at the composition edge. */
export class StripeCatalogueTransport {
  readonly transportClass = 'PRODUCTION_HTTP' as const;
  readonly transportId = 'stripe-catalogue';

  readonly #fetchImpl: StripeCatalogueFetch;
  readonly #baseUrl: string;

  constructor(options: StripeCatalogueTransportOptions) {
    if (typeof options?.fetchImpl !== 'function') {
      throw new ValidationError('StripeCatalogueTransport requires an injected fetch binding');
    }
    this.#fetchImpl = options.fetchImpl;
    this.#baseUrl = (options.baseUrl ?? STRIPE_API_BASE_URL).replace(/\/+$/, '');
  }

  /** Dispatch one catalogue operation through the full law chain. */
  async dispatch(input: StripeOperationDispatchInput): Promise<StripeOperationDispatchResult> {
    const census = stripeCensusRecord(input.operationId);
    if (census === undefined) {
      return refused('UNKNOWN_OPERATION', `unknown Stripe operation '${input.operationId}'`);
    }
    if (!stripeCensusDispatchAllowed(input.operationId)) {
      return refused(
        'NOT_DISPATCHABLE',
        `operation '${input.operationId}' support state '${census.supportState}' is not dispatchable (the DENY law — only IMPLEMENTED states dispatch)`,
      );
    }
    const schema = stripeOperationSchema(input.operationId);
    if (schema === undefined) {
      return refused('NO_SCHEMA_RECORD', `no request schema record for '${input.operationId}'`);
    }
    try {
      validateStripeCallContext(input.context);
    } catch (error) {
      return refused('INVALID_CONTEXT', error instanceof Error ? error.message : 'invalid call context');
    }
    const validated = validateStripeOperationParameters(schema, STRIPE_SCHEMA_DEFS, input.params);
    if (!validated.ok) {
      return {
        kind: 'REFUSED',
        reason: 'INVALID_PARAMETERS',
        detail: `parameters for '${input.operationId}' failed strict validation`,
        issues: validated.issues,
      };
    }
    // Idempotency classification (the overlay law).
    const keyAllowed = stripeIdempotencyKeyAllowed(census);
    const hasKey = typeof input.idempotencyKey === 'string' && input.idempotencyKey.length > 0;
    if (keyAllowed && !hasKey) {
      return refused(
        'IDEMPOTENCY_KEY_REQUIRED',
        `operation '${input.operationId}' is a v1 state-changing POST: the registrar-scoped Idempotency-Key is required (Stripe replays the stored response for a repeated key)`,
      );
    }
    if (!keyAllowed && hasKey) {
      return refused(
        'IDEMPOTENCY_KEY_NOT_ALLOWED',
        `operation '${input.operationId}' does not take an Idempotency-Key under its idempotency class`,
      );
    }
    // URL assembly — ONLY the catalogue path + validated params.
    let path = schema.path;
    for (const [name, value] of Object.entries(validated.value.path)) {
      path = path.replace(`{${name}}`, encodeURIComponent(value));
    }
    if (/\{[^}]+\}/.test(path)) {
      return refused('INVALID_PARAMETERS', `unfilled path placeholders remain in '${path}'`);
    }
    const styles = queryStylesOf(schema.parameters);
    const query =
      census.apiNamespace === 'v2'
        ? stripeV2QueryString(validated.value.query, styles)
        : stripeV1QueryString(validated.value.query, styles);
    const url = `${this.#baseUrl}${path}${query}`;
    // Body assembly — ONLY validated body params.
    let body: string | Uint8Array<ArrayBuffer> | undefined;
    let contentType: string | undefined;
    const bodyKeys = Object.keys(validated.value.body);
    if (schema.method !== 'GET' && bodyKeys.length > 0) {
      if (schema.body === null) {
        return refused('INVALID_PARAMETERS', 'body parameters supplied for a bodyless operation');
      }
      if (schema.body.contentType === 'multipart/form-data') {
        // THE P25 FILE UPLOAD (the audit's G5 fill): parameters stay
        // JSON/base64 through validation and the digest; only the wire edge
        // goes binary.
        try {
          const multipart = stripeMultipartBody(validated.value.body);
          body = multipart.body;
          contentType = multipart.contentType;
        } catch (error) {
          return refused(
            'INVALID_PARAMETERS',
            error instanceof Error ? error.message : 'multipart serialization failed',
          );
        }
      } else if (census.apiNamespace === 'v2' || schema.body.contentType === 'application/json') {
        contentType = 'application/json';
        body = stripeV2JsonBody(validated.value.body);
      } else {
        contentType = 'application/x-www-form-urlencoded';
        body = stripeV1FormBody(validated.value.body);
      }
    }
    const headers = stripeCallHeaders(input.context, {
      ...(contentType !== undefined ? { contentType } : {}),
      ...(hasKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });
    let response: StripeCatalogueFetchResponse;
    try {
      response = await this.#fetchImpl(url, {
        method: schema.method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: AbortSignal.timeout(stripeCallTimeoutMs(input.context)),
      });
    } catch (error) {
      return isAbortLikeError(error)
        ? {
            kind: 'UNKNOWN',
            ambiguity: 'TIMEOUT_AFTER_DISPATCH',
            note: 'the stripe request timed out (it may have landed — reconcile by read-back, never re-dispatch blindly)',
            requestId: null,
          }
        : {
            kind: 'UNKNOWN',
            ambiguity: 'CONNECTION_LOST_AFTER_DISPATCH',
            note: 'the stripe connection failed before a response could be read (the request may have landed)',
            requestId: null,
          };
    }
    const requestId = readRequestId(response.headers);
    if (typeof response?.status !== 'number' || !Number.isInteger(response.status)) {
      return {
        kind: 'UNKNOWN',
        ambiguity: 'MALFORMED_RESPONSE',
        note: 'transport returned no integer status',
        requestId,
      };
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch {
      return {
        kind: 'UNKNOWN',
        ambiguity: 'MALFORMED_RESPONSE',
        note: 'the response body could not be read',
        requestId,
      };
    }
    let parsed: unknown;
    try {
      parsed = raw === '' ? {} : (JSON.parse(raw) as unknown);
    } catch {
      return {
        kind: 'UNKNOWN',
        ambiguity: 'MALFORMED_RESPONSE',
        note: 'the response body was not valid JSON (the request may have landed)',
        requestId,
      };
    }
    if (response.status >= 200 && response.status < 300) {
      return { kind: 'OK', status: response.status, body: parsed, requestId, idempotencyKeyBound: hasKey };
    }
    const retryAfter = response.headers?.['retry-after'] ?? response.headers?.['Retry-After'];
    return {
      kind: 'ERROR_STATUS',
      error: classifyStripeHttpError(response.status, parsed, retryAfter),
      body: parsed,
      requestId,
    };
  }

  /**
   * Walk a list operation's pages under a bounded budget (v1 cursor
   * contract vs v2 page-token contract — chosen by the operation's
   * namespace). Returns UNKNOWN-shaped propagation for ambiguous pages.
   */
  async paginateList(
    input: Omit<StripeOperationDispatchInput, 'idempotencyKey'>,
    budget?: Partial<StripePaginationBudget>,
  ): Promise<
    | { readonly ok: true; readonly walk: StripeV1PageWalk | StripeV2PageWalk; readonly requestIds: readonly string[] }
    | { readonly ok: false; readonly result: StripeOperationDispatchResult }
  > {
    const census = stripeCensusRecord(input.operationId);
    if (census === undefined || !stripeCensusDispatchAllowed(input.operationId)) {
      return { ok: false, result: await this.dispatch({ ...input }) };
    }
    const requestIds: string[] = [];
    const fetchPage = async (overrides: Readonly<Record<string, unknown>>): Promise<unknown> => {
      const merged = { ...input.params, ...overrides };
      const result = await this.dispatch({ ...input, params: merged });
      if (result.kind === 'OK') {
        if (result.requestId !== null) requestIds.push(result.requestId);
        return result.body;
      }
      throw new PaginatePageError(result);
    };
    try {
      const walk =
        census.apiNamespace === 'v2'
          ? await stripePaginateV2List(fetchPage, budget)
          : await stripePaginateV1List(fetchPage, budget);
      return { ok: true, walk, requestIds: [...requestIds] };
    } catch (error) {
      if (error instanceof PaginatePageError) {
        return { ok: false, result: error.result };
      }
      throw error;
    }
  }
}

/** Internal: carries a failed page dispatch out of the paginator. */
class PaginatePageError extends Error {
  constructor(readonly result: StripeOperationDispatchResult) {
    super('a paginated page dispatch did not return OK');
  }
}

function refused(
  reason: NonNullable<Extract<StripeOperationDispatchResult, { kind: 'REFUSED' }>['reason']>,
  detail: string,
): StripeOperationDispatchResult {
  return { kind: 'REFUSED', reason, detail };
}
