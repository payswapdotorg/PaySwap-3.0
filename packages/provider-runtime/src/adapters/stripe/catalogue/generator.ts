/**
 * @payswap/provider-runtime — the Stripe OpenAPI inventory GENERATOR (P24-0).
 *
 * ADR-0017 D2/D3: a PURE, deterministic function turns the pinned spec into
 * the canonical operation inventory (catalogue/operations.json). Properties:
 * - Same spec bytes + same digest seam in → same inventory out (no
 *   timestamps, no map-order leakage: paths in the spec's own key order,
 *   methods in a fixed precedence, JSON written with sorted keys).
 * - CRYPTO SEAM (the F-2 precedent, same law as webhook-signature.ts): the
 *   SHA-256 digest is INJECTED — this package owns no cryptography and no
 *   node builtins; the dev-time script binds node:crypto, tests bind fakes.
 * - The generator NEVER fetches: the spec is the committed local copy.
 * - The inventory records ONLY catalogue facts (identity, protocol,
 *   pagination, digests). Effect classes and support states live in the
 *   PaySwap overlay — generated data never grants permission (§4.3).
 *
 * Dev-time entry: scripts/generate-stripe-catalogue.ts (outside src — the
 * boundary battery forbids node:fs in src).
 */

import { STRIPE_OPENAPI_PIN } from './spec-pin.ts';

/** The HTTP methods the Stripe GA spec uses, in fixed precedence order. */
const METHOD_PRECEDENCE = ['get', 'post', 'delete', 'put', 'patch'] as const;
type SpecMethod = (typeof METHOD_PRECEDENCE)[number];

/** The injected digest seam (SHA-256 hex of a UTF-8 string). */
export type StripeCatalogueDigestFn = (input: string) => string;

/** One generated operation record (catalogue facts only — no policy). */
export interface StripeCatalogueOperation {
  /** Stripe's own operationId (unique across the spec — the census asserts it). */
  readonly operationId: string;
  /** 'v1' | 'v2' — derived from the path's first segment. */
  readonly apiNamespace: 'v1' | 'v2';
  readonly method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  /** The templated path exactly as the spec writes it (e.g. /v1/customers/{id}). */
  readonly path: string;
  /** Path parameter names in {placeholder} order. */
  readonly pathParams: readonly string[];
  /** The spec's tags (may be empty in this spec flavor). */
  readonly tags: readonly string[];
  /** True iff the response schema is a list envelope (object + data[] + has_more). */
  readonly listPaginated: boolean;
  /** True iff the spec marks a request body present (non-GET). */
  readonly hasRequestBody: boolean;
  /** True iff any parameter or request-property name is idempotency-related. */
  readonly idempotencyRelated: boolean;
  /** SHA-256 (first 16 hex chars) of the canonicalized operation sub-spec — drift detection across pins. */
  readonly specDigest: string;
  /** The spec's description (first 400 chars — untrusted data, display only). */
  readonly summary: string;
}

/** Stable JSON: recursively key-sorted, no whitespace. */
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = sort((v as Record<string, unknown>)[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** Is this response schema a Stripe v1 list envelope? */
function isListEnvelope(operation: Record<string, unknown>): boolean {
  const responses = operation['responses'] as Record<string, unknown> | undefined;
  const ok200 = responses?.['200'] as Record<string, unknown> | undefined;
  const content = ok200?.['content'] as Record<string, unknown> | undefined;
  const json = content?.['application/json'] as Record<string, unknown> | undefined;
  const schema = json?.['schema'] as Record<string, unknown> | undefined;
  if (!schema) return false;
  const props = (schema['properties'] ?? {}) as Record<string, unknown>;
  return 'data' in props && 'has_more' in props && 'object' in props;
}

/** Does the request surface mention idempotency? */
function mentionsIdempotency(operation: Record<string, unknown>): boolean {
  return JSON.stringify(operation).toLowerCase().includes('idempoten');
}

function collectPathParams(path: string): string[] {
  const names: string[] = [];
  const re = /\{(\w+)\}/g;
  let match = re.exec(path);
  while (match !== null) {
    names.push(match[1] as string);
    match = re.exec(path);
  }
  return names;
}

/** The pinned spec's minimal surface the generator consumes. */
export interface StripeOpenApiSpecLike {
  info?: { version?: string };
  paths?: Record<string, Record<string, unknown>>;
}

/** THE PURE GENERATOR: pinned spec JSON → the operation inventory. */
export function generateStripeOperationInventory(
  spec: StripeOpenApiSpecLike,
  deps: { readonly sha256Hex: StripeCatalogueDigestFn },
): {
  specInfoVersion: string;
  generatorId: string;
  operationCount: number;
  namespaceCounts: { v1: number; v2: number };
  operations: StripeCatalogueOperation[];
} {
  const specInfoVersion = spec.info?.version ?? '';
  const paths = spec.paths ?? {};
  const operations: StripeCatalogueOperation[] = [];
  for (const path of Object.keys(paths)) {
    const methods = paths[path] as Record<string, unknown>;
    for (const method of METHOD_PRECEDENCE) {
      const operation = methods[method] as Record<string, unknown> | undefined;
      if (operation === undefined || typeof operation !== 'object') continue;
      const operationId = operation['operationId'];
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error(`operation without operationId at ${method.toUpperCase()} ${path}`);
      }
      const namespace: 'v1' | 'v2' = path.startsWith('/v2/') ? 'v2' : 'v1';
      const tags = Array.isArray(operation['tags'])
        ? (operation['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      const description = operation['description'] ?? operation['summary'] ?? '';
      operations.push({
        operationId,
        apiNamespace: namespace,
        method: method.toUpperCase() as StripeCatalogueOperation['method'],
        path,
        pathParams: collectPathParams(path),
        tags,
        listPaginated: isListEnvelope(operation),
        hasRequestBody: method !== 'get' && 'requestBody' in operation,
        idempotencyRelated: mentionsIdempotency(operation),
        specDigest: deps.sha256Hex(canonicalJson(operation)).slice(0, 16),
        summary: typeof description === 'string' ? description.slice(0, 400) : '',
      });
    }
  }
  const v2 = operations.filter((o) => o.apiNamespace === 'v2').length;
  return {
    specInfoVersion,
    generatorId: STRIPE_OPENAPI_PIN.generatorId,
    operationCount: operations.length,
    namespaceCounts: { v1: operations.length - v2, v2 },
    operations,
  };
}
