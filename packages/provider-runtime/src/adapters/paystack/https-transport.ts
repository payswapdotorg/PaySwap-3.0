/**
 * @payswap/provider-runtime — the REAL Paystack HTTPS transport (P14-C,
 * ADR-0008 D5; the endpoint map GROWN by P22-H, ADR-0016 D8).
 *
 * The transport.ts law: NO SDK, no ambient fetch in unit-testable paths —
 * the fetch binding is INJECTED at the composition edge. transportClass
 * is 'PRODUCTION_HTTP': a production transport pointed at Paystack test
 * keys is still SANDBOX execution (execution-mode.ts law).
 *
 * Endpoint mapping (Paystack's public REST surface, api.paystack.co):
 * - 'paystack.transactions.read' → GET /transaction
 * - 'paystack.transfer.initiate' → POST /transfer (the D8 payout lane)
 * - 'paystack.transfer.finalize' → POST /transfer/finalize_transfer
 * - 'paystack.transfer.verify' → GET /transfer/{id} (path-parameter)
 * The GET-only law of the P14-C slice is RELAXED by ADR-0016 D8 to the
 * operation-endpoint map: each operation carries its own method; the
 * read surface stays GET, the transfer surface POSTs a JSON body.
 * Unknown operation ids are REFUSED BEFORE DISPATCH (fail-closed).
 *
 * SECRETS: the Authorization header (the sealed key) exists only inside
 * the caller's frame — the transport NEVER logs and never returns
 * headers upward.
 */

import { ValidationError } from '../../errors.ts';
import type {
  ProviderTransport,
  ProviderTransportCall,
  ProviderTransportResponse,
} from '../../transport.ts';
import { undeliveredResponse } from '../../transport.ts';
import type { TransportClass } from '../../execution-mode.ts';
import { PAYSTACK_API_BASE_URL } from './declaration.ts';

/** The minimal fetch-response shape the transport needs (fake-friendly). */
export interface PaystackFetchResponse {
  readonly status: number;
  text(): Promise<string>;
}

/** The injected fetch binding (the REAL edge binds globalThis.fetch). */
export type PaystackFetch = (
  url: string,
  init: {
    readonly method: 'GET' | 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly signal?: AbortSignal;
  },
) => Promise<PaystackFetchResponse>;

/** Options for constructing the real transport. */
export interface PaystackHttpsTransportOptions {
  readonly fetchImpl: PaystackFetch;
  /** Defaults to the public Paystack API host. */
  readonly baseUrl?: string;
  /** Request timeout in milliseconds (default 15s). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** One endpoint of the operation → endpoint mapping. */
export interface PaystackEndpointSpec {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  /** When set, this params key is embedded as a PATH SEGMENT (not a query field). */
  readonly pathParam?: string;
}

/** The operation → endpoint mapping (frozen evidence surface). */
export const PAYSTACK_OPERATION_ENDPOINTS: ReadonlyMap<string, PaystackEndpointSpec> = new Map([
  ['paystack.transactions.read', { method: 'GET', path: '/transaction' }],
  ['paystack.transfer.initiate', { method: 'POST', path: '/transfer' }],
  ['paystack.transfer.finalize', { method: 'POST', path: '/transfer/finalize_transfer' }],
  ['paystack.transfer.verify', { method: 'GET', path: '/transfer', pathParam: 'id' }],
]);

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
 * The real Paystack HTTPS transport. Construct ONCE per runtime at the
 * composition edge with the real fetch binding; unit tests construct it
 * with deterministic fakes (the battery never touches the network).
 */
export class PaystackHttpsTransport implements ProviderTransport {
  readonly transportClass: TransportClass = 'PRODUCTION_HTTP';
  readonly transportId = 'paystack-https';

  readonly #fetchImpl: PaystackFetch;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;

  constructor(options: PaystackHttpsTransportOptions) {
    if (typeof options?.fetchImpl !== 'function') {
      throw new ValidationError('PaystackHttpsTransport requires an injected fetch binding');
    }
    this.#fetchImpl = options.fetchImpl;
    this.#baseUrl = (options.baseUrl ?? PAYSTACK_API_BASE_URL).replace(/\/+$/, '');
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
    const endpoint = PAYSTACK_OPERATION_ENDPOINTS.get(call.operationId);
    if (endpoint === undefined) {
      // Fail-closed: unknown operations NEVER reach the wire.
      return undeliveredResponse(
        'REFUSED_BEFORE_DISPATCH',
        `unknown Paystack operation '${call.operationId}'`,
      );
    }
    if (typeof call.params !== 'object' || call.params === null || Array.isArray(call.params)) {
      throw new ValidationError('transport call params must be a plain record');
    }
    // The path-parameter law (the transfer verify's real endpoint shape):
    // the named params key is embedded as ONE path segment — validated
    // non-empty and slash-free, never string-concatenated unescaped.
    let pathSegment = '';
    const queryParams: Record<string, unknown> = { ...call.params };
    if (endpoint.pathParam !== undefined) {
      const raw = (call.params as Record<string, unknown>)[endpoint.pathParam];
      if (typeof raw !== 'string' || raw.length === 0 || raw.includes('/')) {
        return undeliveredResponse(
          'REFUSED_BEFORE_DISPATCH',
          `the '${call.operationId}' operation requires a non-empty slash-free '${endpoint.pathParam}' path parameter`,
        );
      }
      pathSegment = `/${encodeURIComponent(raw)}`;
      delete queryParams[endpoint.pathParam];
    }
    const url =
      endpoint.method === 'GET'
        ? `${this.#baseUrl}${endpoint.path}${pathSegment}${queryStringOf(queryParams)}`
        : `${this.#baseUrl}${endpoint.path}${pathSegment}`;
    // The caller's headers spread verbatim (the sealed Bearer key exists
    // only inside the caller's frame); nothing here logs. A POST carries
    // the JSON-encoded params as the request body.
    const headers: Record<string, string> = { ...call.headers };
    let requestBody: string | undefined;
    if (endpoint.method === 'POST') {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(queryParams);
    }
    let response: PaystackFetchResponse;
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
        return undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'paystack request timed out');
      }
      return undeliveredResponse(
        'CONNECTION_LOST_AFTER_DISPATCH',
        'the paystack connection failed before a response could be read (the request may have landed)',
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
    const providerError = readPaystackError(body);
    return Object.freeze({
      delivered: true,
      status: response.status,
      body,
      providerErrorCode: providerError?.code ?? `HTTP_${String(response.status)}`,
      ...(providerError?.message !== undefined ? { providerErrorMessage: providerError.message } : {}),
    });
  }
}

/** Read Paystack's canonical error envelope ({status:false,message}). */
function readPaystackError(body: unknown): { code: string; message: string } | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const record = body as { message?: unknown; status?: unknown };
  const message = typeof record.message === 'string' ? record.message : null;
  // Paystack reports auth failures as 401 with { status: false,
  // message: 'Invalid key' } — the false status word maps to the code.
  const statusWord = record.status === false ? 'error' : null;
  if (message === null && statusWord === null) {
    return null;
  }
  return {
    code: statusWord ?? 'PAYSTACK_ERROR',
    message: message ?? 'paystack answered with an error status',
  };
}
