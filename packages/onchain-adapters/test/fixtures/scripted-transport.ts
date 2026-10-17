/**
 * Deterministic SCRIPTED transports for the onchain-adapters battery (the
 * R2-W3 port of payswap.org@8a735bf test/helpers.ts transport doubles).
 *
 * NO network, NO mocks of adapter logic — the FULL adapter code path runs
 * against injected responses. An UNSCRIPTED call is a provider ERROR (an
 * invented provider answer would be fake success — INV-24 discipline);
 * `goUnreachable()` scripts transport-level unreachability.
 */

import type {
  EndpointProfile,
  RestCallResult,
  RestTransport,
  RpcCallResult,
  RpcTransport,
  ServedBy,
  TransportProtocol,
} from '../../src/transport.ts';

/** A deterministic RPC transport double: answers from a scripted map. */
export class ScriptedRpcTransport implements RpcTransport {
  readonly transportId: string;
  readonly #endpoints: readonly EndpointProfile[];
  readonly #responses: Map<string, (params: readonly unknown[]) => unknown>;
  #unreachable = false;

  constructor(input: {
    readonly transportId: string;
    readonly endpoints: readonly EndpointProfile[];
    readonly responses?: Record<string, (params: readonly unknown[]) => unknown>;
  }) {
    this.transportId = input.transportId;
    this.#endpoints = Object.freeze([...input.endpoints]);
    this.#responses = new Map(Object.entries(input.responses ?? {}));
  }

  endpoints(): readonly EndpointProfile[] {
    return this.#endpoints;
  }

  script(method: string, responder: (params: readonly unknown[]) => unknown): void {
    this.#responses.set(method, responder);
  }

  /** Makes every endpoint unreachable (transport ambiguity fixtures). */
  goUnreachable(): void {
    this.#unreachable = true;
  }

  async call(method: string, params: readonly unknown[]): Promise<RpcCallResult> {
    if (this.#unreachable) {
      return {
        kind: 'TRANSPORT_UNREACHABLE',
        message: 'scripted unreachability',
        attempted: this.#endpoints,
      };
    }
    const servedBy: ServedBy = Object.freeze({
      transportId: this.transportId,
      endpointId: this.#endpoints[0]?.endpointId ?? 'scripted',
      providerName: this.#endpoints[0]?.providerName ?? 'scripted',
    });
    const responder = this.#responses.get(method);
    if (responder === undefined) {
      return {
        kind: 'RPC_ERROR',
        message: `no scripted response for '${method}'`,
        servedBy,
      };
    }
    const result = responder(params);
    if (
      result !== null &&
      typeof result === 'object' &&
      'scriptedError' in result &&
      (result as { scriptedError: string }).scriptedError !== undefined
    ) {
      return {
        kind: 'RPC_ERROR',
        message: (result as { scriptedError: string }).scriptedError,
        servedBy,
      };
    }
    return {
      kind: 'RPC_OK',
      result,
      raw: JSON.stringify({ jsonrpc: '2.0', id: 1, result }),
      servedBy,
    };
  }
}

/** A deterministic REST transport double (UTXO explorer fixtures). */
export class ScriptedRestTransport implements RestTransport {
  readonly transportId: string;
  readonly #endpoints: readonly EndpointProfile[];
  readonly #responses: Map<string, () => { status: number; body: unknown; raw?: string }>;
  #unreachable = false;

  constructor(input: {
    readonly transportId: string;
    readonly endpoints: readonly EndpointProfile[];
    readonly responses?: Record<string, () => { status: number; body: unknown; raw?: string }>;
  }) {
    this.transportId = input.transportId;
    this.#endpoints = Object.freeze([...input.endpoints]);
    this.#responses = new Map(Object.entries(input.responses ?? {}));
  }

  endpoints(): readonly EndpointProfile[] {
    return this.#endpoints;
  }

  script(path: string, response: () => { status: number; body: unknown; raw?: string }): void {
    this.#responses.set(path, response);
  }

  goUnreachable(): void {
    this.#unreachable = true;
  }

  async #request(path: string): Promise<RestCallResult> {
    if (this.#unreachable) {
      return {
        kind: 'TRANSPORT_UNREACHABLE',
        message: 'scripted unreachability',
        attempted: this.#endpoints,
      };
    }
    const servedBy: ServedBy = Object.freeze({
      transportId: this.transportId,
      endpointId: this.#endpoints[0]?.endpointId ?? 'scripted',
      providerName: this.#endpoints[0]?.providerName ?? 'scripted',
    });
    const responder = this.#responses.get(path);
    if (responder === undefined) {
      return {
        kind: 'REST_ERROR',
        status: 404,
        message: `no scripted response for '${path}'`,
        servedBy,
      };
    }
    const response = responder();
    if (response.status >= 400) {
      return {
        kind: 'REST_ERROR',
        status: response.status,
        ...(response.body !== undefined ? { body: response.body } : {}),
        message: `scripted HTTP ${response.status}`,
        servedBy,
      };
    }
    const raw =
      response.raw ??
      (typeof response.body === 'string' ? response.body : JSON.stringify(response.body));
    return { kind: 'REST_OK', status: response.status, body: response.body, raw, servedBy };
  }

  async get(path: string): Promise<RestCallResult> {
    return this.#request(path);
  }

  async post(path: string, _body: string, _contentType: string): Promise<RestCallResult> {
    return this.#request(path);
  }
}

/** A fake endpoint profile (scripted; environment class must be declared). */
export function fakeEndpoint(input: {
  readonly endpointId: string;
  readonly providerName: string;
  readonly chainKey: string;
  readonly protocol?: TransportProtocol;
}): EndpointProfile {
  return {
    endpointId: input.endpointId,
    providerName: input.providerName,
    url: `https://scripted.test/${input.endpointId}`,
    protocol: input.protocol ?? 'JSON_RPC',
    chainKey: input.chainKey,
  };
}
