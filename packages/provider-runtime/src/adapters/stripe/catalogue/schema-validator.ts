/**
 * @payswap/provider-runtime — the STRICT Stripe request validator (P24-1).
 *
 * ADR-0017 D4 (BINDING): model/host-proposed parameters are validated
 * against the generated request schemas BEFORE any dispatch.
 * - UNKNOWN FIELDS ARE REJECTED (strict — stricter than Stripe's own wire
 *   acceptance, never looser).
 * - MISSING REQUIRED FIELDS ARE REJECTED (path params, body `required`).
 * - TYPE MISMATCHES ARE REJECTED (JSON-typed values: integer fields want
 *   numbers, never numeric strings; the v1 serializer stringifies later).
 * - Union (anyOf/oneOf) semantics: a value must match ≥1 variant — Stripe's
 *   `anyOf [string, enum [""]]` clear convention validates naturally.
 * - allOf: every branch must match. $ref: resolved through the artifact's
 *   interned defs (a DAG by construction; a seen-set guards anyway).
 * - FAIL CLOSED: an operation whose schema carries an unresolvable or
 *   unrepresentable construct NEVER validates (never silently coerced).
 *
 * PaySwap-side safety bounds (fail-closed policy bounds, NOT provider
 * behavior claims; handoff §9.6 bounded strings/arrays/metadata):
 * - strings ≤ 100_000 chars when the spec sets no maxLength (the spec's own
 *   convention caps at 5_000);
 * - arrays ≤ 250 items when the spec sets no maxItems;
 * - maps ≤ 100 entries, keys ≤ 256 chars;
 * - nesting depth ≤ 32.
 */

import { stripeSchemaNodeFailsClosed } from './schema-nodes.ts';
import type { StripeOperationSchemaRecord, StripeSchemaNode } from './schema-nodes.ts';

/** PaySwap-side request bounds (the §9.6 safety law). */
export const STRIPE_REQUEST_BOUNDS = Object.freeze({
  maxStringLengthWithoutSpecBound: 100_000,
  maxArrayItemsWithoutSpecBound: 250,
  maxMapEntries: 100,
  maxMapKeyLength: 256,
  maxDepth: 32,
});

/** The canonical issue kinds (each is testable; none is silent). */
export const STRIPE_VALIDATION_ISSUE_KINDS = [
  'NOT_AN_OBJECT',
  'UNKNOWN_FIELD',
  'MISSING_REQUIRED',
  'TYPE_MISMATCH',
  'ENUM_MISMATCH',
  'BOUND_VIOLATION',
  'FAIL_CLOSED',
] as const;
export type StripeValidationIssueKind = (typeof STRIPE_VALIDATION_ISSUE_KINDS)[number];

export interface StripeValidationIssue {
  readonly kind: StripeValidationIssueKind;
  /** The dotted path of the offending value (e.g. "metadata.order"). */
  readonly at: string;
  readonly message: string;
}

/** The location-split validated parameters (the transport's dispatch input). */
export interface StripeValidatedParameters {
  readonly path: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly body: Readonly<Record<string, unknown>>;
}

export type StripeParameterValidation =
  | { readonly ok: true; readonly value: StripeValidatedParameters }
  | { readonly ok: false; readonly issues: readonly StripeValidationIssue[] };

const PATH_PARAM_SAFE_CHARSET = /^[A-Za-z0-9_-]+$/;

/** Validate one node against a value (accumulating issues; never throws on data). */
function checkNode(
  node: StripeSchemaNode,
  defs: Readonly<Record<string, StripeSchemaNode>>,
  value: unknown,
  at: string,
  depth: number,
  issues: StripeValidationIssue[],
  seen: Set<string>,
): void {
  if (depth > STRIPE_REQUEST_BOUNDS.maxDepth) {
    issues.push({ kind: 'BOUND_VIOLATION', at, message: `nesting exceeds ${STRIPE_REQUEST_BOUNDS.maxDepth}` });
    return;
  }
  switch (node.kind) {
    case 'any':
      return;
    case 'unresolvable':
      issues.push({ kind: 'FAIL_CLOSED', at, message: `unresolvable schema ref ${node.ref}` });
      return;
    case 'unrepresentable':
      issues.push({ kind: 'FAIL_CLOSED', at, message: node.reason });
      return;
    case 'ref': {
      const target = defs[node.def];
      if (target === undefined) {
        issues.push({ kind: 'FAIL_CLOSED', at, message: `unknown interned def ${node.def}` });
        return;
      }
      if (seen.has(node.def)) {
        issues.push({ kind: 'FAIL_CLOSED', at, message: `cyclic def ${node.def}` });
        return;
      }
      seen.add(node.def);
      checkNode(target, defs, value, at, depth, issues, seen);
      seen.delete(node.def);
      return;
    }
    case 'union': {
      // ≥1 variant must accept the value with ZERO new issues.
      for (const variant of node.variants) {
        const trial: StripeValidationIssue[] = [];
        checkNode(variant, defs, value, at, depth, trial, new Set(seen));
        if (trial.length === 0) return;
      }
      issues.push({
        kind: 'TYPE_MISMATCH',
        at,
        message: 'the value matches none of the schema variants (anyOf/oneOf)',
      });
      return;
    }
    case 'all': {
      for (const branch of node.branches) {
        checkNode(branch, defs, value, at, depth, issues, seen);
      }
      return;
    }
    case 'string': {
      if (typeof value !== 'string') {
        issues.push({ kind: 'TYPE_MISMATCH', at, message: 'expected a string' });
        return;
      }
      const max = node.maxLength ?? STRIPE_REQUEST_BOUNDS.maxStringLengthWithoutSpecBound;
      if (value.length > max) {
        issues.push({ kind: 'BOUND_VIOLATION', at, message: `string longer than ${max} characters` });
      }
      if (node.enum !== undefined && !node.enum.includes(value)) {
        issues.push({
          kind: 'ENUM_MISMATCH',
          at,
          message: `value is not one of [${node.enum.join(', ')}]`,
        });
      }
      return;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        issues.push({ kind: 'TYPE_MISMATCH', at, message: 'expected an integer' });
        return;
      }
      checkBounds(node.minimum, node.maximum, value, at, issues);
      return;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ kind: 'TYPE_MISMATCH', at, message: 'expected a finite number' });
        return;
      }
      checkBounds(node.minimum, node.maximum, value, at, issues);
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        issues.push({ kind: 'TYPE_MISMATCH', at, message: 'expected a boolean' });
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        issues.push({ kind: 'TYPE_MISMATCH', at, message: 'expected an array' });
        return;
      }
      const max = node.maxItems ?? STRIPE_REQUEST_BOUNDS.maxArrayItemsWithoutSpecBound;
      if (value.length > max) {
        issues.push({ kind: 'BOUND_VIOLATION', at, message: `array longer than ${max} items` });
      }
      value.forEach((item, index) => {
        checkNode(node.items, defs, item, `${at}[${String(index)}]`, depth + 1, issues, seen);
      });
      return;
    }
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        issues.push({ kind: 'TYPE_MISMATCH', at, message: 'expected an object' });
        return;
      }
      const record = value as Record<string, unknown>;
      const properties = node.properties ?? {};
      for (const key of Object.keys(record)) {
        if (key.length > STRIPE_REQUEST_BOUNDS.maxMapKeyLength) {
          issues.push({ kind: 'BOUND_VIOLATION', at: `${at}.${key}`, message: 'key too long' });
        }
        if (!(key in properties)) {
          const extra = node.additionalProperties;
          if (extra === undefined || extra === false) {
            // THE STRICT LAW: unknown fields are rejected, not coerced. (The
            // spec's explicit `additionalProperties: false` agrees; where the
            // spec is silent PaySwap stays strict — D4's law.)
            issues.push({
              kind: 'UNKNOWN_FIELD',
              at: `${at}.${key}`,
              message: 'unknown field (strict validation rejects it)',
            });
          } else {
            checkNode(extra, defs, record[key], `${at}.${key}`, depth + 1, issues, seen);
          }
        }
      }
      for (const name of node.required ?? []) {
        const provided = record[name];
        if (provided === undefined || provided === null) {
          issues.push({
            kind: 'MISSING_REQUIRED',
            at: `${at}.${name}`,
            message: 'required field is absent or null',
          });
        }
      }
      const keys = Object.keys(properties);
      keys.sort();
      for (const name of keys) {
        const provided = record[name];
        // null on a nested optional property means "omit from the wire" (the
        // empty-vs-null law: '' clears, null/undefined leaves untouched).
        if (provided === undefined || provided === null) continue;
        checkNode(properties[name]!, defs, provided, `${at}.${name}`, depth + 1, issues, seen);
      }
      if (node.additionalProperties !== undefined && node.additionalProperties !== false) {
        const entryCount = Object.keys(record).filter((k) => !(k in properties)).length;
        if (entryCount > STRIPE_REQUEST_BOUNDS.maxMapEntries) {
          issues.push({
            kind: 'BOUND_VIOLATION',
            at,
            message: `map carries more than ${STRIPE_REQUEST_BOUNDS.maxMapEntries} entries`,
          });
        }
      }
      return;
    }
  }
}

function checkBounds(
  minimum: number | undefined,
  maximum: number | undefined,
  value: number,
  at: string,
  issues: StripeValidationIssue[],
): void {
  if (minimum !== undefined && value < minimum) {
    issues.push({ kind: 'BOUND_VIOLATION', at, message: `value below minimum ${String(minimum)}` });
  }
  if (maximum !== undefined && value > maximum) {
    issues.push({ kind: 'BOUND_VIOLATION', at, message: `value above maximum ${String(maximum)}` });
  }
}

/** Does a plain record (not array/null) sit at the top? */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * THE STRICT VALIDATOR: a flat parameter record against one operation's
 * generated schema. Path params must be present, non-empty, charset-safe
 * strings (the URL law); query params validate per their schemas; the rest
 * must be body properties validated against the body schema. Null-valued
 * top-level entries mean "omit from the wire" (a null REQUIRED field is
 * missing, not empty).
 */
export function validateStripeOperationParameters(
  record: StripeOperationSchemaRecord,
  defs: Readonly<Record<string, StripeSchemaNode>>,
  params: unknown,
): StripeParameterValidation {
  const issues: StripeValidationIssue[] = [];
  if (!isPlainRecord(params)) {
    return {
      ok: false,
      issues: [
        { kind: 'NOT_AN_OBJECT', at: '', message: 'parameters must be a plain record of named values' },
      ],
    };
  }
  // FAIL CLOSED first: an operation whose schema cannot be represented
  // faithfully never validates (D4's never-coerce law).
  const bodyFailsClosed =
    record.body !== null && stripeSchemaNodeFailsClosed(record.body.schema, defs);
  const paramsFailClosed = Object.values(record.parameters).some((p) =>
    stripeSchemaNodeFailsClosed(p.schema, defs),
  );
  if (bodyFailsClosed || paramsFailClosed) {
    return {
      ok: false,
      issues: [
        {
          kind: 'FAIL_CLOSED',
          at: record.operationId,
          message:
            'the operation carries a schema construct that cannot be represented faithfully; validation refuses rather than coerce',
        },
      ],
    };
  }
  const path: Record<string, string> = {};
  const query: Record<string, unknown> = {};
  const body: Record<string, unknown> = {};
  const known = new Set<string>(Object.keys(record.parameters));
  const bodyProperties =
    record.body?.schema.kind === 'object' || record.body?.schema.kind === 'ref'
      ? topLevelBodyProperties(record, defs)
      : undefined;
  if (bodyProperties !== undefined) {
    for (const name of Object.keys(bodyProperties)) known.add(name);
  }
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    const value = params[key]!;
    if (!known.has(key)) {
      issues.push({
        kind: 'UNKNOWN_FIELD',
        at: key,
        message: 'unknown parameter for this operation (strict validation rejects it)',
      });
      continue;
    }
    const parameter = record.parameters[key];
    if (parameter !== undefined) {
      if (parameter.location === 'path') {
        if (typeof value !== 'string' || value.length === 0) {
          issues.push({
            kind: 'TYPE_MISMATCH',
            at: key,
            message: 'a path parameter must be a non-empty string',
          });
        } else if (!PATH_PARAM_SAFE_CHARSET.test(value)) {
          issues.push({
            kind: 'TYPE_MISMATCH',
            at: key,
            message: 'a path parameter carries characters outside the safe set [A-Za-z0-9_-]',
          });
        } else {
          path[key] = value;
        }
      } else if (value !== null && value !== undefined) {
        checkNode(parameter.schema, defs, value, key, 0, issues, new Set());
        query[key] = value;
      }
      continue;
    }
    if (value !== null && value !== undefined) {
      body[key] = value;
    }
  }
  for (const name of Object.keys(record.parameters)) {
    const parameter = record.parameters[name]!;
    if (parameter.location !== 'path') continue;
    const provided = params[name];
    if (provided === undefined || provided === null) {
      issues.push({
        kind: 'MISSING_REQUIRED',
        at: name,
        message: 'the path parameter is required (the URL cannot be built without it)',
      });
    }
  }
  if (record.body !== null && bodyProperties !== undefined) {
    // Assemble the body object and validate it as a whole (required law).
    const bodyObject: Record<string, unknown> = { ...body };
    checkNode(record.body.schema, defs, bodyObject, 'body', 0, issues, new Set());
    if (record.body.required && Object.keys(bodyObject).length === 0) {
      issues.push({
        kind: 'MISSING_REQUIRED',
        at: 'body',
        message: 'the request body is required for this operation',
      });
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: { path, query, body } };
}

/** The top-level body property names when the body schema resolves to an object node. */
function topLevelBodyProperties(
  record: StripeOperationSchemaRecord,
  defs: Readonly<Record<string, StripeSchemaNode>>,
): Record<string, StripeSchemaNode> | undefined {
  let node: StripeSchemaNode | undefined = record.body?.schema;
  let guard = 0;
  while (node !== undefined && node.kind === 'ref' && guard < 64) {
    node = defs[node.def];
    guard += 1;
  }
  if (node === undefined || node.kind !== 'object') return undefined;
  return { ...(node.properties ?? {}) };
}
