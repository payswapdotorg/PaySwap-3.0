/**
 * @payswap/provider-runtime — the REAL Stripe HTTPS transport (P13-B).
 *
 * ADR-0007 D1/D5 + the transport.ts law: NO Stripe SDK, no ambient fetch
 * in unit-testable paths — the fetch binding is INJECTED at the
 * composition edge (the real edge binds globalThis.fetch; tests inject
 * deterministic fakes that touch no network). transportClass is
 * 'PRODUCTION_HTTP': a production transport pointed at Stripe test mode
 * is still SANDBOX execution (execution-mode.ts law); a LIVE runtime can
 * never bind a FAKE_DETERMINISTIC transport.
 *
 * Endpoint mapping (Stripe public REST surface, api.stripe.com):
 * - 'stripe.balance.read'  → GET /v1/balance
 * - 'stripe.account.read'  → GET /v1/account
 * Unknown operation ids are REFUSED BEFORE DISPATCH (fail-closed: the
 * command never left the local process).
 *
 * SECRETS: the Authorization header (the sealed key) exists only inside
 * this call. The transport NEVER logs (no logger exists here at all) and
 * never returns headers upward — only status/body/failure come back.
 */

import { ValidationError } from '../../errors.ts';
import type { ProviderTransport, ProviderTransportCall, ProviderTransportResponse } from '../../transport.ts';
import { undeliveredResponse } from '../../transport.ts';
import type { TransportClass } from '../../execution-mode.ts';
import { STRIPE_API_BASE_URL, STRIPE_API_VERSION } from './declaration.ts';

/** The minimal fetch-response shape the transport needs (fake-friendly). */
export interface StripeFetchResponse {
  readonly status: number;
  text(): Promise<string>;
}

/** The injected fetch binding (the REAL edge binds globalThis.fetch). */
export type StripeFetch = (
  url: string,
  init: {
    readonly method: 'GET' | 'POST';
    readonly headers: Readonly<Record<string, string>>;
    /** Present iff POST (form-encoded body — the Stripe REST convention). */
    readonly body?: string;
    readonly signal?: AbortSignal;
  },
) => Promise<StripeFetchResponse>;

/** Options for constructing the real transport. */
export interface StripeHttpsTransportOptions {
  readonly fetchImpl: StripeFetch;
  /** Defaults to the public Stripe API host. */
  readonly baseUrl?: string;
  /** Defaults to the pinned Stripe API version. */
  readonly apiVersion?: string;
  /** Request timeout in milliseconds (default 15s). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** One endpoint mapping: method + path with optional {param} placeholders. */
interface EndpointSpec {
  readonly method: 'GET' | 'POST';
  /** Path may contain {name} placeholders filled from the call params. */
  readonly path: string;
}

/** The operation → endpoint mapping (frozen evidence surface). */
const OPERATION_ENDPOINTS: ReadonlyMap<string, EndpointSpec> = new Map([
  ['stripe.balance.read', { method: 'GET', path: '/v1/balance' }],
  ['stripe.account.read', { method: 'GET', path: '/v1/account' }],
  // The P14-A write surface (ADR-0008 D3) — additive; the read endpoints
  // above are untouched.
  ['stripe.payment_intent.create', { method: 'POST', path: '/v1/payment_intents' }],
  ['stripe.payment_intent.confirm', { method: 'POST', path: '/v1/payment_intents/{id}/confirm' }],
  ['stripe.payment_intent.retrieve', { method: 'GET', path: '/v1/payment_intents/{id}' }],
  ['stripe.payment_intent.cancel', { method: 'POST', path: '/v1/payment_intents/{id}/cancel' }],
]);

/** Split params into path-fillers and the rest (fail-closed on bad fills). */
function fillPathParams(
  path: string,
  params: Record<string, unknown>,
): { path: string; rest: Record<string, unknown> } {
  const rest: Record<string, unknown> = { ...params };
  const filled = path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = rest[name];
    if (typeof value !== 'string' || value.length === 0) {
      throw new ValidationError(`the path parameter '${name}' is required and must be a non-empty string`);
    }
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      // Fail-closed: a path parameter may never carry separators or
      // traversal shapes onto the wire.
      throw new ValidationError(`the path parameter '${name}' carries characters outside the safe set`);
    }
    delete rest[name];
    return value;
  });
  return { path: filled, rest };
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    ((error as { name?: unknown }).name === 'AbortError' ||
      (error as { code?: unknown }).code === 'ABORT_ERR')
  );
}

/** Build the query string for GET params ({} for empty params). */
function queryStringOf(params: unknown): string {
  if (params === undefined || params === null) {
    return '';
  }
  if (typeof params !== 'object' || Array.isArray(params)) {
    throw new ValidationError('GET params must be a plain record of query fields', { params });
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.set(key, typeof value === 'string' ? value : String(value));
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
}

/**
 * The real Stripe HTTPS transport. Construct it ONCE per runtime at the
 * composition edge with the real fetch binding; unit tests construct it
 * with deterministic fakes (the battery never touches the network).
 */
export class StripeHttpsTransport implements ProviderTransport {
  readonly transportClass: TransportClass = 'PRODUCTION_HTTP';
  readonly transportId = 'stripe-https';

  readonly #fetchImpl: StripeFetch;
  readonly #baseUrl: string;
  readonly #apiVersion: string;
  readonly #timeoutMs: number;

  constructor(options: StripeHttpsTransportOptions) {
    if (typeof options?.fetchImpl !== 'function') {
      throw new ValidationError('StripeHttpsTransport requires an injected fetch binding');
    }
    this.#fetchImpl = options.fetchImpl;
    this.#baseUrl = (options.baseUrl ?? STRIPE_API_BASE_URL).replace(/\/+$/, '');
    this.#apiVersion = options.apiVersion ?? STRIPE_API_VERSION;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new ValidationError('timeoutMs must be a positive integer', { timeoutMs });
    }
    this.#timeoutMs = timeoutMs;
  }

  async send(call: ProviderTransportCall): Promise<ProviderTransportResponse> {
    if (call === null || typeof call !== 'object') {
      throw new ValidationError('a ProviderTransportCall object is required');
    }
    const endpoint = OPERATION_ENDPOINTS.get(call.operationId);
    if (endpoint === undefined) {
      // Fail-closed: unknown operations NEVER reach the wire.
      return undeliveredResponse(
        'REFUSED_BEFORE_DISPATCH',
        `unknown Stripe operation '${call.operationId}'`,
      );
    }
    if (typeof call.params !== 'object' || call.params === null || Array.isArray(call.params)) {
      throw new ValidationError('transport call params must be a plain record');
    }
    const { path: filledPath, rest } = fillPathParams(endpoint.path, { ...call.params });
    const url = `${this.#baseUrl}${filledPath}${endpoint.method === 'GET' ? queryStringOf(rest) : ''}`;
    // The secret-bearing Authorization header exists only inside this
    // call frame; nothing here logs, and the response never carries it.
    // The caller's headers spread verbatim; POST calls additionally bind
    // the registrar's idempotency key (ADR-0008 D3 — Stripe replays the
    // ORIGINAL result for a repeated key; the mission registrar owns the
    // law, the header is the wire mechanism).
    const headers: Record<string, string> = {
      ...call.headers,
      'Stripe-Version': this.#apiVersion,
    };
    let requestBody: string | undefined;
    if (endpoint.method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      if (typeof call.idempotencyKey === 'string' && call.idempotencyKey.length > 0) {
        headers['Idempotency-Key'] = call.idempotencyKey;
      }
      requestBody = queryStringOf(rest).replace(/^\?/, '');
    }
    let response: StripeFetchResponse;
    try {
      response = await this.#fetchImpl(url, {
        method: endpoint.method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      if (isAbortLikeError(error)) {
        // The request may have landed — the outcome is UNKNOWN (INV-04).
        return undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'stripe request timed out');
      }
      return undeliveredResponse(
        'CONNECTION_LOST_AFTER_DISPATCH',
        'the stripe connection failed before a response could be read (the request may have landed)',
      );
    }
    if (typeof response?.status !== 'number' || !Number.isInteger(response.status)) {
      return undeliveredResponse('MALFORMED_RESPONSE', 'transport returned no integer status');
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch {
      return undeliveredResponse('MALFORMED_RESPONSE', 'response body could not be read');
    }
    let body: unknown;
    try {
      body = raw === '' ? {} : (JSON.parse(raw) as unknown);
    } catch {
      // Bytes came back but cannot be interpreted: UNKNOWN, never FAILED.
      return undeliveredResponse('MALFORMED_RESPONSE', 'response body was not valid JSON');
    }
    if (response.status >= 200 && response.status < 300) {
      return Object.freeze({ delivered: true, status: response.status, body });
    }
    const providerError = readStripeError(body);
    return Object.freeze({
      delivered: true,
      status: response.status,
      body,
      providerErrorCode: providerError?.code ?? `HTTP_${String(response.status)}`,
      ...(providerError?.message !== undefined ? { providerErrorMessage: providerError.message } : {}),
    });
  }
}

/** Read Stripe's canonical error envelope ({error:{type,code,message}}). */
function readStripeError(body: unknown): { code: string; message: string } | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (error === null || typeof error !== 'object' || Array.isArray(error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  const type = (error as { type?: unknown }).type;
  const message = (error as { message?: unknown }).message;
  const codeText =
    typeof code === 'string' && code.length > 0
      ? code
      : typeof type === 'string' && type.length > 0
        ? type
        : null;
  if (codeText === null) {
    return null;
  }
  return {
    code: codeText,
    message: typeof message === 'string' ? message : 'stripe answered with an error status',
  };
}
