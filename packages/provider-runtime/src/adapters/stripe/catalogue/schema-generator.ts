/**
 * @payswap/provider-runtime — the Stripe request-schema GENERATOR (P24-1).
 *
 * ADR-0017 D4: a PURE, deterministic function turns the pinned spec's
 * REQUEST SURFACE (parameters + requestBody — the response surface belongs
 * to response parsing, not request validation) into the committed artifact
 * catalogue/operation-schemas.json. Properties (same laws as the P24-0
 * inventory generator):
 * - Same spec bytes + same digest seam in → same artifact out. No
 *   timestamps, no map-order leakage: operations in the spec's own
 *   path/method order, the interned `defs` table sorted by digest key,
 *   JSON written with sorted keys.
 * - CRYPTO SEAM (the F-2 precedent): SHA-256 is INJECTED; this package owns
 *   no cryptography. Def-table keys are content digests, so the table is
 *   order-independent BY CONSTRUCTION.
 * - $refs in request schemas are resolved INLINE against
 *   #/components/schemas/* (cycle-safe); a resolvable ref contributes its
 *   resolved semantics; an unresolvable one is RECORDED and the affected
 *   operation FAILS CLOSED at validation time (never silently dropped).
 * - Faithfulness: anyOf/oneOf → `union` (value must match ≥1 variant);
 *   allOf → `all` (every branch); `not`/patternProperties/if-then-else/
 *   unknown `type` → `unrepresentable` → fail closed. Vendor `x-*` keys
 *   carry no JSON-Schema validation semantics and are not extracted.
 *
 * Dev-time entry: scripts/generate-stripe-catalogue.ts (node:fs is banned
 * in src/ — the boundary battery enforces it).
 */

import { STRIPE_OPENAPI_PIN } from './spec-pin.ts';
import { stripeSchemaNodeFailsClosed } from './schema-nodes.ts';
import type {
  StripeSchemaNode,
  StripeOperationParameterSchema,
  StripeOperationBodySchema,
  StripeOperationSchemaRecord,
  StripeOperationSchemasFile,
} from './schema-nodes.ts';

/** The injected digest seam (SHA-256 hex of a UTF-8 string). */
export type StripeSchemaDigestFn = (input: string) => string;

/** Descriptions are capped (display-only, untrusted data — the inventory precedent caps at 400). */
const DESCRIPTION_CAP = 200;

const METHOD_PRECEDENCE = ['get', 'post', 'delete', 'put', 'patch'] as const;
type SpecMethod = (typeof METHOD_PRECEDENCE)[number];

/** The minimal spec surface this generator consumes (structurally typed, no fabrication). */
export interface StripeSchemaSpecLike {
  info?: { version?: string };
  paths?: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
}

/** Stable JSON: recursively key-sorted, no whitespace (same law as the P24-0 generator). */
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

/** The generator's pure interning state (defs table + fail-closed ledger). */
class Interner {
  readonly #defs = new Map<string, StripeSchemaNode>();
  readonly #unresolvableRefs = new Set<string>();
  readonly #digest: StripeSchemaDigestFn;

  constructor(digest: StripeSchemaDigestFn) {
    this.#digest = digest;
  }

  intern(node: StripeSchemaNode): StripeSchemaNode {
    const digest = this.#digest(canonicalJson(node)).slice(0, 12);
    if (!this.#defs.has(digest)) {
      this.#defs.set(digest, node);
    }
    return { kind: 'ref', def: digest };
  }

  noteUnresolvable(ref: string): void {
    this.#unresolvableRefs.add(ref);
  }

  emit(): { defs: Readonly<Record<string, StripeSchemaNode>>; unresolvableRefs: string[] } {
    const defs: Record<string, StripeSchemaNode> = {};
    for (const key of [...this.#defs.keys()].sort()) {
      defs[key] = this.#defs.get(key)!;
    }
    return { defs, unresolvableRefs: [...this.#unresolvableRefs].sort() };
  }
}

interface ExtractionDeps {
  readonly interner: Interner;
  readonly spec: StripeSchemaSpecLike;
}

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function capDescription(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, DESCRIPTION_CAP) : undefined;
}

function readScalarBounds(
  schema: Record<string, unknown>,
): { maxLength?: number; minimum?: number; maximum?: number } {
  const out: { maxLength?: number; minimum?: number; maximum?: number } = {};
  const maxLength = schema['maxLength'];
  if (typeof maxLength === 'number' && Number.isFinite(maxLength)) out.maxLength = maxLength;
  const minimum = schema['minimum'];
  if (typeof minimum === 'number' && Number.isFinite(minimum)) out.minimum = minimum;
  const maximum = schema['maximum'];
  if (typeof maximum === 'number' && Number.isFinite(maximum)) out.maximum = maximum;
  return out;
}

/** THE node extractor: one JSON-Schema node → the normalized vocabulary. */
function extractNode(
  schema: unknown,
  deps: ExtractionDeps,
  seen: ReadonlySet<unknown>,
): StripeSchemaNode {
  if (schema === true || schema === undefined || schema === null) {
    return { kind: 'any' };
  }
  if (!isSchemaObject(schema)) {
    return { kind: 'unrepresentable', reason: 'schema is not an object or boolean' };
  }
  if (seen.has(schema)) {
    // A cycle cannot be unfolded into a finite tree — fail closed.
    return { kind: 'unrepresentable', reason: 'cyclic schema reference' };
  }
  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    if (!ref.startsWith('#/components/schemas/')) {
      deps.interner.noteUnresolvable(ref);
      return { kind: 'unresolvable', ref };
    }
    const name = ref.slice('#/components/schemas/'.length);
    const target = deps.spec.components?.schemas?.[name];
    if (target === undefined) {
      deps.interner.noteUnresolvable(ref);
      return { kind: 'unresolvable', ref };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(schema);
    // Resolve INLINE (preserve semantics; the ref name is recorded via the
    // resolved node's own content — refs in request schemas resolve to
    // plain object schemas in the pinned spec).
    const resolved = extractNode(target, deps, nextSeen);
    return resolved.kind === 'unresolvable' || resolved.kind === 'unrepresentable'
      ? resolved
      : deps.interner.intern(resolved);
  }
  const nextSeen = new Set(seen);
  nextSeen.add(schema);
  const anyOf = schema['anyOf'];
  if (Array.isArray(anyOf)) {
    return deps.interner.intern({
      kind: 'union',
      variants: anyOf.map((v) => extractNode(v, deps, nextSeen)),
    });
  }
  const oneOf = schema['oneOf'];
  if (Array.isArray(oneOf)) {
    return deps.interner.intern({
      kind: 'union',
      variants: oneOf.map((v) => extractNode(v, deps, nextSeen)),
    });
  }
  const allOf = schema['allOf'];
  if (Array.isArray(allOf)) {
    return deps.interner.intern({
      kind: 'all',
      branches: allOf.map((v) => extractNode(v, deps, nextSeen)),
    });
  }
  if ('not' in schema || 'if' in schema || 'patternProperties' in schema) {
    return {
      kind: 'unrepresentable',
      reason: 'not/if-then-else/patternProperties cannot be represented faithfully',
    };
  }
  const type = schema['type'];
  const description = capDescription(schema['description']);
  switch (type) {
    case 'object': {
      const node: {
        kind: 'object';
        description?: string;
        properties?: Record<string, StripeSchemaNode>;
        required?: string[];
        additionalProperties?: false | StripeSchemaNode;
      } = { kind: 'object' };
      if (description !== undefined) node.description = description;
      const properties = schema['properties'];
      if (isSchemaObject(properties)) {
        const props: Record<string, StripeSchemaNode> = {};
        for (const key of Object.keys(properties)) {
          props[key] = extractNode(properties[key], deps, nextSeen);
        }
        node.properties = props;
      }
      const required = schema['required'];
      if (Array.isArray(required)) {
        node.required = required.filter((r): r is string => typeof r === 'string');
      }
      if ('additionalProperties' in schema) {
        const ap = schema['additionalProperties'];
        node.additionalProperties =
          ap === false ? false : extractNode(ap, deps, nextSeen);
      }
      return deps.interner.intern(node);
    }
    case 'array': {
      const items = extractNode(schema['items'], deps, nextSeen);
      const maxItems = schema['maxItems'];
      const node: {
        kind: 'array';
        description?: string;
        items: StripeSchemaNode;
        maxItems?: number;
      } = { kind: 'array', items };
      if (description !== undefined) node.description = description;
      if (typeof maxItems === 'number' && Number.isFinite(maxItems)) node.maxItems = maxItems;
      return deps.interner.intern(node);
    }
    case 'string': {
      const node: {
        kind: 'string';
        description?: string;
        enum?: string[];
        maxLength?: number;
      } = { kind: 'string' };
      if (description !== undefined) node.description = description;
      const bounds = readScalarBounds(schema);
      if (bounds.maxLength !== undefined) node.maxLength = bounds.maxLength;
      const en = schema['enum'];
      if (Array.isArray(en)) {
        const values = en.filter((v): v is string => typeof v === 'string');
        if (values.length !== en.length) {
          return { kind: 'unrepresentable', reason: 'non-string enum values' };
        }
        node.enum = values;
      }
      return deps.interner.intern(node);
    }
    case 'integer':
    case 'number':
    case 'boolean': {
      const bounds = readScalarBounds(schema);
      const node: {
        kind: 'integer' | 'number' | 'boolean';
        description?: string;
        minimum?: number;
        maximum?: number;
      } = { kind: type };
      if (description !== undefined) node.description = description;
      if (bounds.minimum !== undefined) node.minimum = bounds.minimum;
      if (bounds.maximum !== undefined) node.maximum = bounds.maximum;
      return type === 'boolean' && description === undefined
        ? { kind: 'boolean' }
        : deps.interner.intern(node);
    }
    default:
      return {
        kind: 'unrepresentable',
        reason: `unsupported schema type ${JSON.stringify(type)}`,
      };
  }
}

/** Extract one operation's parameters (path + query). */
function extractParameters(
  operation: Record<string, unknown>,
  deps: ExtractionDeps,
): Record<string, StripeOperationParameterSchema> {
  const out: Record<string, StripeOperationParameterSchema> = {};
  const parameters = operation['parameters'];
  if (!Array.isArray(parameters)) return out;
  for (const raw of parameters) {
    if (!isSchemaObject(raw)) continue;
    const name = raw['name'];
    const location = raw['in'];
    if (typeof name !== 'string' || name.length === 0) continue;
    if (location !== 'path' && location !== 'query') continue;
    const style = raw['style'];
    const record: {
      name: string;
      location: 'path' | 'query';
      required: boolean;
      style?: 'form' | 'deepObject';
      schema: StripeSchemaNode;
    } = {
      name,
      location,
      required: raw['required'] === true,
      schema: extractNode(raw['schema'], deps, new Set()),
    };
    if (location === 'query' && (style === 'form' || style === 'deepObject')) {
      record.style = style;
    }
    out[name] = record;
  }
  return out;
}

const CONTENT_TYPES = [
  'application/x-www-form-urlencoded',
  'application/json',
  'multipart/form-data',
] as const;

/** Extract one operation's request body (non-GET only; GET bodies in the spec are empty). */
function extractBody(
  operation: Record<string, unknown>,
  method: SpecMethod,
  deps: ExtractionDeps,
): StripeOperationBodySchema | null {
  if (method === 'get') return null;
  const requestBody = operation['requestBody'];
  if (!isSchemaObject(requestBody)) return null;
  const content = requestBody['content'];
  if (!isSchemaObject(content)) return null;
  for (const contentType of CONTENT_TYPES) {
    const media = content[contentType];
    if (!isSchemaObject(media)) continue;
    return {
      contentType,
      required: requestBody['required'] === true,
      schema: extractNode(media['schema'], deps, new Set()),
    };
  }
  return null;
}

/** THE PURE GENERATOR: pinned spec JSON → the operation-schemas artifact content. */
export function generateStripeOperationSchemas(
  spec: StripeSchemaSpecLike,
  deps: { readonly sha256Hex: StripeSchemaDigestFn },
): StripeOperationSchemasFile {
  const interner = new Interner(deps.sha256Hex);
  const extractionDeps: ExtractionDeps = { interner, spec };
  const operations: Record<string, StripeOperationSchemaRecord> = {};
  const paths = spec.paths ?? {};
  for (const path of Object.keys(paths)) {
    const methods = paths[path] as Record<string, unknown>;
    for (const method of METHOD_PRECEDENCE) {
      const operation = methods[method];
      if (!isSchemaObject(operation)) continue;
      const operationId = operation['operationId'];
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error(`operation without operationId at ${method.toUpperCase()} ${path}`);
      }
      operations[operationId] = {
        operationId,
        method: method.toUpperCase() as StripeOperationSchemaRecord['method'],
        path,
        parameters: extractParameters(operation, extractionDeps),
        body: extractBody(operation, method, extractionDeps),
      };
    }
  }
  const { defs, unresolvableRefs } = interner.emit();
  // The deep fail-closed ledger: a marker may be nested inside an interned
  // parent (the marker itself is never interned, but parents wrap it), so
  // every operation's full node tree is walked through the defs table.
  const failsClosed = (record: StripeOperationSchemaRecord): boolean =>
    Object.values(record.parameters).some((p) => stripeSchemaNodeFailsClosed(p.schema, defs)) ||
    (record.body !== null && stripeSchemaNodeFailsClosed(record.body.schema, defs));
  const unrepresentableOperations = Object.values(operations)
    .filter(failsClosed)
    .map((record) => record.operationId)
    .sort();
  return {
    specInfoVersion: spec.info?.version ?? '',
    generatorId: STRIPE_OPENAPI_PIN.schemaGeneratorId,
    operationCount: Object.keys(operations).length,
    unresolvableRefs,
    unrepresentableOperations,
    defs,
    operations,
  };
}
