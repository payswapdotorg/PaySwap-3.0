/**
 * @payswap/provider-runtime — the Stripe request-schema NODE VOCABULARY (P24-1).
 *
 * ADR-0017 D4 (BINDING): the pinned OpenAPI spec's request-surface schemas
 * must be preserved faithfully — `oneOf`/`anyOf`/`allOf`/`$ref` semantics
 * included (the handoff §4.2.4 warning about schema-conversion loss is
 * binding: a converter that silently drops constructs FAILS CLOSED, never
 * coerces). This module defines the normalized node vocabulary the
 * schema-generator emits into catalogue/operation-schemas.json and the
 * schema-validator consumes.
 *
 * DESIGN (the two fail-closed markers are load-bearing):
 * - `unresolvable`: a $ref the generator could not resolve against the
 *   spec's components. The validator REFUSES to validate that operation.
 * - `unrepresentable`: an OpenAPI/JSON-Schema construct this vocabulary
 *   cannot represent faithfully (patternProperties, `not`, if/then/else,
 *   unknown `type`, …). The validator REFUSES to validate that operation —
 *   the alternative (silently dropping the constraint) is the exact
 *   failure mode D4 forbids.
 *
 * Vendor extensions (`x-*`, e.g. Stripe's `x-stripeBypassValidation`) carry
 * no validation semantics in JSON Schema and are deliberately not extracted;
 * the strict unknown-field law below is stricter than Stripe's own wire
 * acceptance, never looser.
 */

/** The interned-reference node (content-addressed by the generator's digest seam). */
export interface StripeSchemaRefNode {
  readonly kind: 'ref';
  readonly def: string;
}

/** The node vocabulary (one per representable JSON-Schema shape). */
export type StripeSchemaNode =
  | StripeSchemaRefNode
  | { readonly kind: 'any' }
  | {
      readonly kind: 'string';
      readonly description?: string;
      readonly enum?: readonly string[];
      readonly maxLength?: number;
    }
  | {
      readonly kind: 'integer' | 'number';
      readonly description?: string;
      readonly minimum?: number;
      readonly maximum?: number;
    }
  | { readonly kind: 'boolean'; readonly description?: string }
  | {
      readonly kind: 'array';
      readonly description?: string;
      readonly items: StripeSchemaNode;
      /** Stripe request schemas never carry array bounds today; recorded when present. */
      readonly maxItems?: number;
    }
  | {
      readonly kind: 'object';
      readonly description?: string;
      readonly properties?: Readonly<Record<string, StripeSchemaNode>>;
      readonly required?: readonly string[];
      /**
       * `false` = no extra keys (the strict law rejects unknown keys even
       * when absent — this field only RECORDS the spec's own statement);
       * a node = a value-typed map (Stripe's metadata/payload maps).
       */
      readonly additionalProperties?: false | StripeSchemaNode;
    }
  | { readonly kind: 'union'; readonly variants: readonly StripeSchemaNode[] }
  | { readonly kind: 'all'; readonly branches: readonly StripeSchemaNode[] }
  | { readonly kind: 'unresolvable'; readonly ref: string }
  | { readonly kind: 'unrepresentable'; readonly reason: string };

/** A single extracted operation parameter (path or query location). */
export interface StripeOperationParameterSchema {
  readonly name: string;
  readonly location: 'path' | 'query';
  /** OpenAPI `required` (path params are additionally enforced by URL building). */
  readonly required: boolean;
  /** The OpenAPI serialization style the spec records (query params only). */
  readonly style?: 'form' | 'deepObject';
  readonly schema: StripeSchemaNode;
}

/** The extracted request-body surface of one operation. */
export interface StripeOperationBodySchema {
  readonly contentType: 'application/x-www-form-urlencoded' | 'application/json' | 'multipart/form-data';
  /** OpenAPI requestBody.required (defaults false in the spec). */
  readonly required: boolean;
  readonly schema: StripeSchemaNode;
}

/** The extracted request schema of one operation (the artifact record). */
export interface StripeOperationSchemaRecord {
  readonly operationId: string;
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;
  readonly parameters: Readonly<Record<string, StripeOperationParameterSchema>>;
  readonly body: StripeOperationBodySchema | null;
}

/** The operation-schemas.json artifact's top-level shape. */
export interface StripeOperationSchemasFile {
  readonly specInfoVersion: string;
  readonly generatorId: string;
  readonly operationCount: number;
  /** Every $ref that could not be resolved (must stay empty; non-empty = fail-closed ops). */
  readonly unresolvableRefs: readonly string[];
  /** Operations carrying unrepresentable constructs (their validation fails closed). */
  readonly unrepresentableOperations: readonly string[];
  /** The interned node table (content-addressed by digest). */
  readonly defs: Readonly<Record<string, StripeSchemaNode>>;
  readonly operations: Readonly<Record<string, StripeOperationSchemaRecord>>;
}

/** Does a node (or anything reachable through it) fail closed? */
export function stripeSchemaNodeFailsClosed(
  node: StripeSchemaNode,
  defs: Readonly<Record<string, StripeSchemaNode>>,
): boolean {
  switch (node.kind) {
    case 'unresolvable':
    case 'unrepresentable':
      return true;
    case 'ref':
      return defs[node.def] === undefined || stripeSchemaNodeFailsClosed(defs[node.def]!, defs);
    case 'array':
      return stripeSchemaNodeFailsClosed(node.items, defs);
    case 'object': {
      for (const child of Object.values(node.properties ?? {})) {
        if (stripeSchemaNodeFailsClosed(child, defs)) return true;
      }
      const extra = node.additionalProperties;
      if (extra !== undefined && extra !== false && stripeSchemaNodeFailsClosed(extra, defs)) {
        return true;
      }
      return false;
    }
    case 'union':
      return node.variants.some((v) => stripeSchemaNodeFailsClosed(v, defs));
    case 'all':
      return node.branches.some((b) => stripeSchemaNodeFailsClosed(b, defs));
    default:
      return false;
  }
}
