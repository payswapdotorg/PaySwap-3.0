/**
 * @payswap/onchain-adapters — vendor-neutral transport CONTRACTS (Work
 * Order P4-W3, lane R2-W3; ADAPT of payswap.org@8a735bf
 * packages/onchain-adapters/src/transport.ts).
 *
 * DETERMINISM LAW (the 3.0 adaptation): transports are CONTRACTS — typed
 * request/response shapes. NO single RPC/indexer/simulation vendor is a
 * core dependency; every provider shape (JSON-RPC endpoint, REST explorer)
 * lives BEHIND these ports. The old repo's concrete fetch-based HTTP
 * transports (HttpJsonRpcTransport / HttpRestTransport, which performed
 * live I/O against globalThis.fetch) are deliberately NOT ported: this
 * package performs ZERO I/O. Concrete transports (production HTTP wiring)
 * are composition-root work, injected against these ports; the
 * deterministic battery scripts them.
 *
 * Endpoint diversity law (unchanged): a PRODUCTION transport must configure
 * endpoints from at least two DISTINCT providers (providerName),
 * structurally expressing that no single vendor can become a core
 * dependency. The first reachable endpoint serves the call; every answer
 * records WHICH endpoint served it (provenance). TRANSPORT_UNREACHABLE
 * (all endpoints down) is a reachability FACT — callers surface it as
 * availability UNKNOWN, never as success or failure.
 */

import { ValidationError } from './errors.ts';
import { classifyChainEnvironment } from './environment.ts';
import type { RailEnvironmentClass } from './environment.ts';

/** Transport protocol an endpoint speaks. */
export type TransportProtocol = 'JSON_RPC' | 'REST';

/**
 * A declared endpoint profile: who runs it, where it is, what it serves.
 * Endpoints for PUBLIC rails carry no credentials — an endpoint profile is
 * public descriptive data, never a secret.
 */
export interface EndpointProfile {
  readonly endpointId: string;
  /** Distinct provider identity (e.g. "PublicNode", "Blockstream"). */
  readonly providerName: string;
  readonly url: string;
  readonly protocol: TransportProtocol;
  /** The chainKey this endpoint is declared to serve. */
  readonly chainKey: string;
}

/** Which endpoint served a call (call-level provenance). */
export interface ServedBy {
  readonly transportId: string;
  readonly endpointId: string;
  readonly providerName: string;
}

/**
 * The result of one JSON-RPC contract call. RPC_ERROR is a provider FACT
 * (the node answered with an error); TRANSPORT_UNREACHABLE is a
 * reachability fact (no endpoint answered) — callers classify, the
 * transport never converts one into the other.
 */
export type RpcCallResult =
  | {
      readonly kind: 'RPC_OK';
      readonly result: unknown;
      /** Raw response text — exact-numeric extraction without JSON double round-trip. */
      readonly raw: string;
      readonly servedBy: ServedBy;
    }
  | {
      readonly kind: 'RPC_ERROR';
      readonly code?: number;
      readonly message: string;
      readonly servedBy: ServedBy;
    }
  | {
      readonly kind: 'TRANSPORT_UNREACHABLE';
      readonly message: string;
      readonly attempted: readonly EndpointProfile[];
    };

/** The JSON-RPC transport port (vendor-neutral contract; injected). */
export interface RpcTransport {
  readonly transportId: string;
  endpoints(): readonly EndpointProfile[];
  call(method: string, params: readonly unknown[]): Promise<RpcCallResult>;
}

/** The result of one REST contract call (explorer APIs, fee feeds). */
export type RestCallResult =
  | {
      readonly kind: 'REST_OK';
      readonly status: number;
      readonly body: unknown;
      /** Raw response text — exact-numeric extraction (fee rates) without float round-trip. */
      readonly raw: string;
      readonly servedBy: ServedBy;
    }
  | {
      readonly kind: 'REST_ERROR';
      readonly status: number;
      readonly body?: unknown;
      readonly message: string;
      readonly servedBy: ServedBy;
    }
  | {
      readonly kind: 'TRANSPORT_UNREACHABLE';
      readonly message: string;
      readonly attempted: readonly EndpointProfile[];
    };

/** The REST/explorer transport port (vendor-neutral contract; injected). */
export interface RestTransport {
  readonly transportId: string;
  endpoints(): readonly EndpointProfile[];
  get(path: string): Promise<RestCallResult>;
  post(path: string, body: string, contentType: string): Promise<RestCallResult>;
}

// ---------------------------------------------------------------------------
// Endpoint validation + the provider-diversity law
// ---------------------------------------------------------------------------

/** Validates a declared endpoint set (fail closed; unclassified chains throw). */
export function validateEndpoints(endpoints: readonly EndpointProfile[]): void {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new ValidationError('a transport requires at least one declared endpoint profile');
  }
  const seen = new Set<string>();
  for (const endpoint of endpoints) {
    for (const field of ['endpointId', 'providerName', 'url'] as const) {
      const value = endpoint[field];
      if (typeof value !== 'string' || value.length === 0) {
        throw new ValidationError(`endpoint profile field '${field}' must be a non-empty string`);
      }
    }
    if (seen.has(endpoint.endpointId)) {
      throw new ValidationError(`duplicate endpointId '${endpoint.endpointId}'`);
    }
    seen.add(endpoint.endpointId);
    // Fail-closed: an endpoint serving an unclassified chainKey is a wiring
    // error (classifyChainEnvironment throws on unknown keys).
    classifyChainEnvironment(endpoint.chainKey);
  }
}

/**
 * Endpoint-provider diversity law for PRODUCTION transports: at least two
 * DISTINCT providerNames must be configured — no single vendor is a core
 * dependency. Non-production (testnet/regtest/simulation) transports are
 * exempt (single testnet faucets exist) but still recorded.
 */
export function assertEndpointProviderDiversity(
  endpoints: readonly EndpointProfile[],
  environmentClass: RailEnvironmentClass,
): void {
  validateEndpoints(endpoints);
  if (environmentClass !== 'PRODUCTION') {
    return;
  }
  const providers = new Set(endpoints.map((endpoint) => endpoint.providerName));
  if (providers.size < 2) {
    throw new ValidationError(
      `a PRODUCTION transport must configure endpoints from at least two DISTINCT providers (found ${providers.size}: [${[...providers].join(', ')}]) — no single RPC/indexer vendor may become a core dependency`,
    );
  }
}

// ---------------------------------------------------------------------------
// Exact-integer helpers for transport payloads (no float parsing on wire money)
// ---------------------------------------------------------------------------

const EXACT_DECIMAL = /^(0|[1-9][0-9]*)$/;

/** Parses a non-negative exact decimal string (the money-exactness shape guard). */
export function parseExactDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !EXACT_DECIMAL.test(value)) {
    throw new ValidationError(
      `${label} must be a non-negative exact decimal string without leading zeros (no floating-point money), got '${String(value)}'`,
    );
  }
  return value;
}

/** Converts a hex quantity (0x…) from an EVM RPC into an exact decimal string. */
export function hexQuantityToDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new ValidationError(
      `${label} must be an EVM hex quantity string (0x-prefixed), got '${String(value)}'`,
    );
  }
  return BigInt(value).toString(10);
}
