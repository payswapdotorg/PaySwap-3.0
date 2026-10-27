/**
 * PaySwap Desktop (P21-A, ADR-0014 D5/D8) — the REAL host-side HTTPS
 * transports for the provider-evidence plane.
 *
 * LAYER LAW (the execution-kernel precedent): this package NEVER imports
 * @payswap/* — the canonical provider-runtime transports cannot be
 * consumed by the emitting host tsconfig. These transports are
 * STRUCTURAL MIRRORS of the canonical ones (StripeHttpsTransport,
 * FlutterwaveHttpsTransport, PaystackHttpsTransport): the same public
 * REST endpoints, the same operation-id mapping, the same response
 * classification (delivered / undelivered + INV-04 ambiguity kinds),
 * field-for-field. The battery MIRROR-ASSERTS the fidelity against the
 * REAL contracts (test/payswap/p21-transport-probe-mirrors.test.ts —
 * the payments-contract-mirrors precedent).
 *
 * REAL NETWORK, NO AMBIENT FETCH: the fetch binding is INJECTED — the
 * composition edge binds globalThis.fetch; tests inject deterministic
 * fakes that touch no network. NO provider SDK, no logging (the
 * secret-bearing Authorization header exists only inside the call
 * frame), and the response never carries headers upward.
 *
 * INV-04 at the transport tier: a timeout / lost connection / malformed
 * body is UNDELIVERED with the canonical ambiguity kind — the request
 * may have landed, so the outcome is UNKNOWN upstream, never FAILED.
 */

/** The minimal fetch-response shape the transports need (fake-friendly). */
export interface HostFetchResponse {
  readonly status: number;
  text(): Promise<string>;
}

/** The injected fetch binding (the REAL edge binds globalThis.fetch). */
export type HostFetch = (
  url: string,
  init: {
    readonly method: "GET" | "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly signal?: AbortSignal;
  },
) => Promise<HostFetchResponse>;

/** The transport-call seam (mirrors the canonical ProviderTransportCall + the kernel's seam). */
export interface HostTransportCall {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly params: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly correlationId: string;
}

/** The transport-response seam (mirrors the canonical ProviderTransportResponse). */
export interface HostTransportResponse {
  readonly delivered: boolean;
  readonly status?: number;
  readonly body?: unknown;
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly failure?: {
    readonly kind: string;
    readonly detail?: string;
  };
}

/** The transport seam (structurally assignable to the kernel's KernelTransportSeam). */
export interface HostTransport {
  readonly transportId: string;
  readonly transportClass: "PRODUCTION_HTTP";
  send(call: HostTransportCall): Promise<HostTransportResponse>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** One endpoint mapping: method + path with optional {param} placeholders. */
interface EndpointSpec {
  readonly method: "GET" | "POST";
  readonly path: string;
}

function undelivered(kind: string, detail: string): HostTransportResponse {
  return Object.freeze({
    delivered: false,
    failure: Object.freeze({ kind, detail }),
  });
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    ((error as { name?: unknown }).name === "AbortError" ||
      (error as { code?: unknown }).code === "ABORT_ERR")
  );
}

/** Build the query string for GET params ({} for empty params). */
function queryStringOf(params: unknown): string {
  if (params === undefined || params === null) {
    return "";
  }
  if (typeof params !== "object" || Array.isArray(params)) {
    throw new Error("transport call params must be a plain record");
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.set(key, typeof value === "string" ? value : String(value));
  }
  const encoded = search.toString();
  return encoded === "" ? "" : `?${encoded}`;
}

/** Split params into path-fillers and the rest (fail-closed on bad fills). */
function fillPathParams(
  path: string,
  params: Record<string, unknown>,
): { path: string; rest: Record<string, unknown> } {
  const rest: Record<string, unknown> = { ...params };
  const filled = path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = rest[name];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`the path parameter '${name}' is required and must be a non-empty string`);
    }
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error(`the path parameter '${name}' carries characters outside the safe set`);
    }
    delete rest[name];
    return value;
  });
  return { path: filled, rest };
}

/** Read the response: JSON-parse + classify (the canonical response law). */
async function readResponse(response: HostFetchResponse): Promise<HostTransportResponse> {
  if (typeof response?.status !== "number" || !Number.isInteger(response.status)) {
    return undelivered("MALFORMED_RESPONSE", "transport returned no integer status");
  }
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return undelivered("MALFORMED_RESPONSE", "response body could not be read");
  }
  let body: unknown;
  try {
    body = raw === "" ? {} : (JSON.parse(raw) as unknown);
  } catch {
    // Bytes came back but cannot be interpreted: UNKNOWN, never FAILED.
    return undelivered("MALFORMED_RESPONSE", "response body was not valid JSON");
  }
  if (response.status >= 200 && response.status < 300) {
    return Object.freeze({ delivered: true, status: response.status, body });
  }
  // Delivered with an error status: the provider ANSWERED — the
  // per-provider error reader (below) decorates the code/message.
  return Object.freeze({ delivered: true, status: response.status, body });
}

/** Read {error:{code|type,message}} — the Stripe canonical error envelope. */
function readStripeError(body: unknown): { code: string; message: string } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (error === null || typeof error !== "object" || Array.isArray(error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  const type = (error as { type?: unknown }).type;
  const message = (error as { message?: unknown }).message;
  const codeText =
    typeof code === "string" && code.length > 0
      ? code
      : typeof type === "string" && type.length > 0
        ? type
        : null;
  if (codeText === null) {
    return null;
  }
  return {
    code: codeText,
    message: typeof message === "string" ? message : "stripe answered with an error status",
  };
}

/** Read {status:'error'|false, message} — the FLW/Paystack error envelopes. */
function readWordedError(body: unknown, fallbackCode: string): { code: string; message: string } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as { message?: unknown; status?: unknown };
  const message = typeof record.message === "string" ? record.message : null;
  const statusWord =
    (typeof record.status === "string" && record.status !== "success") || record.status === false
      ? "error"
      : null;
  if (message === null && statusWord === null) {
    return null;
  }
  return {
    code: statusWord ?? fallbackCode,
    message: message ?? "the provider answered with an error status",
  };
}

/** The shared transport core over an endpoint map + a provider error reader. */
function createHostTransport(options: {
  readonly transportId: string;
  readonly fetchImpl: HostFetch;
  readonly baseUrl: string;
  readonly endpoints: ReadonlyMap<string, EndpointSpec>;
  readonly timeoutMs: number;
  readonly extraHeaders?: Readonly<Record<string, string>>;
  readonly errorReader: (body: unknown) => { code: string; message: string } | null;
  readonly bindIdempotencyHeader: boolean;
}): HostTransport {
  return {
    transportId: options.transportId,
    transportClass: "PRODUCTION_HTTP" as const,
    async send(call: HostTransportCall): Promise<HostTransportResponse> {
      if (call === null || typeof call !== "object") {
        throw new Error("a transport call object is required");
      }
      const endpoint = options.endpoints.get(call.operationId);
      if (endpoint === undefined) {
        // Fail-closed: unknown operations NEVER reach the wire.
        return undelivered(
          "REFUSED_BEFORE_DISPATCH",
          `unknown operation '${call.operationId}'`,
        );
      }
      if (
        typeof call.params !== "object" ||
        call.params === null ||
        Array.isArray(call.params)
      ) {
        throw new Error("transport call params must be a plain record");
      }
      const { path: filledPath, rest } = fillPathParams(endpoint.path, {
        ...(call.params as Record<string, unknown>),
      });
      const url = `${options.baseUrl}${filledPath}${endpoint.method === "GET" ? queryStringOf(rest) : ""}`;
      // The secret-bearing Authorization header exists only inside this
      // call frame; nothing here logs, and the response never carries it.
      const headers: Record<string, string> = {
        ...call.headers,
        ...(options.extraHeaders ?? {}),
      };
      let requestBody: string | undefined;
      if (endpoint.method === "POST") {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        if (options.bindIdempotencyHeader && typeof call.idempotencyKey === "string" && call.idempotencyKey.length > 0) {
          headers["Idempotency-Key"] = call.idempotencyKey;
        }
        requestBody = queryStringOf(rest).replace(/^\?/, "");
      }
      let response: HostFetchResponse;
      try {
        response = await options.fetchImpl(url, {
          method: endpoint.method,
          headers,
          ...(requestBody !== undefined ? { body: requestBody } : {}),
          signal: AbortSignal.timeout(options.timeoutMs),
        });
      } catch (error) {
        if (isAbortLikeError(error)) {
          // The request may have landed — the outcome is UNKNOWN (INV-04).
          return undelivered("TIMEOUT_AFTER_DISPATCH", "the request timed out");
        }
        return undelivered(
          "CONNECTION_LOST_AFTER_DISPATCH",
          "the connection failed before a response could be read (the request may have landed)",
        );
      }
      const classified = await readResponse(response);
      if (classified.delivered && (classified.status ?? 0) >= 300) {
        const providerError = options.errorReader(classified.body);
        return Object.freeze({
          delivered: true,
          status: classified.status,
          body: classified.body,
          providerErrorCode: providerError?.code ?? `HTTP_${String(classified.status ?? 0)}`,
          ...(providerError?.message !== undefined
            ? { providerErrorMessage: providerError.message }
            : {}),
        });
      }
      return classified;
    },
  };
}

// ---------------------------------------------------------------------------
// The provider transports (endpoint maps mirror the canonical declarations)
// ---------------------------------------------------------------------------

const STRIPE_API_BASE_URL = "https://api.stripe.com";
const STRIPE_API_VERSION = "2025-08-27.basil";

/** The Stripe endpoint map (mirrors STRIPE_OPERATION_IDS + the canonical transport). */
const STRIPE_ENDPOINTS: ReadonlyMap<string, EndpointSpec> = new Map([
  ["stripe.balance.read", { method: "GET", path: "/v1/balance" }],
  ["stripe.account.read", { method: "GET", path: "/v1/account" }],
  ["stripe.payment_intent.create", { method: "POST", path: "/v1/payment_intents" }],
  ["stripe.payment_intent.confirm", { method: "POST", path: "/v1/payment_intents/{id}/confirm" }],
  ["stripe.payment_intent.retrieve", { method: "GET", path: "/v1/payment_intents/{id}" }],
  ["stripe.payment_intent.cancel", { method: "POST", path: "/v1/payment_intents/{id}/cancel" }],
]);

/** The REAL Stripe transport (mirror of StripeHttpsTransport). */
export function createStripeHostTransport(fetchImpl: HostFetch): HostTransport {
  return createHostTransport({
    transportId: "stripe-https",
    fetchImpl,
    baseUrl: STRIPE_API_BASE_URL,
    endpoints: STRIPE_ENDPOINTS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    extraHeaders: { "Stripe-Version": STRIPE_API_VERSION },
    errorReader: readStripeError,
    bindIdempotencyHeader: true,
  });
}

const FLUTTERWAVE_API_BASE_URL = "https://api.flutterwave.com";

/** The Flutterwave endpoint map (mirrors FLUTTERWAVE_OPERATION_IDS). */
const FLUTTERWAVE_ENDPOINTS: ReadonlyMap<string, EndpointSpec> = new Map([
  ["flutterwave.balances.read", { method: "GET", path: "/v3/balances" }],
]);

/** The REAL Flutterwave transport (mirror of FlutterwaveHttpsTransport). */
export function createFlutterwaveHostTransport(fetchImpl: HostFetch): HostTransport {
  return createHostTransport({
    transportId: "flutterwave-https",
    fetchImpl,
    baseUrl: FLUTTERWAVE_API_BASE_URL,
    endpoints: FLUTTERWAVE_ENDPOINTS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    errorReader: (body) => readWordedError(body, "FLW_ERROR"),
    bindIdempotencyHeader: false,
  });
}

const PAYSTACK_API_BASE_URL = "https://api.paystack.co";

/** The Paystack endpoint map (mirrors PAYSTACK_OPERATION_IDS). */
const PAYSTACK_ENDPOINTS: ReadonlyMap<string, EndpointSpec> = new Map([
  ["paystack.transactions.read", { method: "GET", path: "/transaction" }],
]);

/** The REAL Paystack transport (mirror of PaystackHttpsTransport). */
export function createPaystackHostTransport(fetchImpl: HostFetch): HostTransport {
  return createHostTransport({
    transportId: "paystack-https",
    fetchImpl,
    baseUrl: PAYSTACK_API_BASE_URL,
    endpoints: PAYSTACK_ENDPOINTS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    errorReader: (body) => readWordedError(body, "PAYSTACK_ERROR"),
    bindIdempotencyHeader: false,
  });
}
