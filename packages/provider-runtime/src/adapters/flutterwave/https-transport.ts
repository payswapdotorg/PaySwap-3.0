/**
 * @payswap/provider-runtime — the REAL Flutterwave HTTPS transport (P14-C,
 * ADR-0008 D5).
 *
 * The transport.ts law: NO SDK, no ambient fetch in unit-testable paths —
 * the fetch binding is INJECTED at the composition edge (the real edge
 * binds globalThis.fetch; tests inject deterministic fakes that touch no
 * network). transportClass is 'PRODUCTION_HTTP': a production transport
 * pointed at Flutterwave test keys is still SANDBOX execution
 * (execution-mode.ts law).
 *
 * Endpoint mapping (Flutterwave's public REST surface, api.flutterwave.com):
 * - 'flutterwave.balances.read' → GET /v3/balances
 * Unknown operation ids are REFUSED BEFORE DISPATCH (fail-closed).
 *
 * SECRETS: the Authorization header (the sealed key) exists only inside
 * the caller's frame — the transport NEVER logs (no logger exists here
 * at all) and never returns headers upward.
 */

import { ValidationError } from '../../errors.ts';
import type {
  ProviderTransport,
  ProviderTransportCall,
  ProviderTransportResponse,
} from '../../transport.ts';
import { undeliveredResponse } from '../../transport.ts';
import type { TransportClass } from '../../execution-mode.ts';
import { FLUTTERWAVE_API_BASE_URL } from './declaration.ts';

/** The minimal fetch-response shape the transport needs (fake-friendly). */
export interface FlutterwaveFetchResponse {
  readonly status: number;
  text(): Promise<string>;
}

/** The injected fetch binding (the REAL edge binds globalThis.fetch). */
export type FlutterwaveFetch = (
  url: string,
  init: {
    readonly method: 'GET';
    readonly headers: Readonly<Record<string, string>>;
    readonly signal?: AbortSignal;
  },
) => Promise<FlutterwaveFetchResponse>;

/** Options for constructing the real transport. */
export interface FlutterwaveHttpsTransportOptions {
  readonly fetchImpl: FlutterwaveFetch;
  /** Defaults to the public Flutterwave API host. */
  readonly baseUrl?: string;
  /** Request timeout in milliseconds (default 15s). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** The operation → endpoint mapping (frozen evidence surface). */
const OPERATION_ENDPOINTS: ReadonlyMap<string, { method: 'GET'; path: string }> = new Map([
  ['flutterwave.balances.read', { method: 'GET', path: '/v3/balances' }],
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
 * The real Flutterwave HTTPS transport. Construct ONCE per runtime at the
 * composition edge with the real fetch binding; unit tests construct it
 * with deterministic fakes (the battery never touches the network).
 */
export class FlutterwaveHttpsTransport implements ProviderTransport {
  readonly transportClass: TransportClass = 'PRODUCTION_HTTP';
  readonly transportId = 'flutterwave-https';

  readonly #fetchImpl: FlutterwaveFetch;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;

  constructor(options: FlutterwaveHttpsTransportOptions) {
    if (typeof options?.fetchImpl !== 'function') {
      throw new ValidationError('FlutterwaveHttpsTransport requires an injected fetch binding');
    }
    this.#fetchImpl = options.fetchImpl;
    this.#baseUrl = (options.baseUrl ?? FLUTTERWAVE_API_BASE_URL).replace(/\/+$/, '');
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
        `unknown Flutterwave operation '${call.operationId}'`,
      );
    }
    if (typeof call.params !== 'object' || call.params === null || Array.isArray(call.params)) {
      throw new ValidationError('transport call params must be a plain record');
    }
    const url = `${this.#baseUrl}${endpoint.path}${queryStringOf(call.params)}`;
    // The caller's headers spread verbatim (the sealed Bearer key exists
    // only inside the caller's frame); nothing here logs.
    const headers: Record<string, string> = { ...call.headers };
    let response: FlutterwaveFetchResponse;
    try {
      response = await this.#fetchImpl(url, {
        method: endpoint.method,
        headers,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      if (isAbortLikeError(error)) {
        // The request may have landed — the outcome is UNKNOWN (INV-04).
        return undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'flutterwave request timed out');
      }
      return undeliveredResponse(
        'CONNECTION_LOST_AFTER_DISPATCH',
        'the flutterwave connection failed before a response could be read (the request may have landed)',
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
    const providerError = readFlutterwaveError(body);
    return Object.freeze({
      delivered: true,
      status: response.status,
      body,
      providerErrorCode: providerError?.code ?? `HTTP_${String(response.status)}`,
      ...(providerError?.message !== undefined ? { providerErrorMessage: providerError.message } : {}),
    });
  }
}

/** Read Flutterwave's canonical error envelope ({status,message} or {message}). */
function readFlutterwaveError(body: unknown): { code: string; message: string } | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const record = body as { message?: unknown; status?: unknown; errors?: unknown };
  const message = typeof record.message === 'string' ? record.message : null;
  // Flutterwave reports auth failures as 401 with { status: 'error',
  // message: 'Invalid secret key…' } — the status word maps to the code.
  const statusWord = typeof record.status === 'string' && record.status !== 'success' ? record.status : null;
  const codeText = statusWord ?? 'FLW_ERROR';
  if (message === null && statusWord === null) {
    return null;
  }
  return {
    code: codeText,
    message: message ?? 'flutterwave answered with an error status',
  };
}
