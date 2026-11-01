/**
 * @payswap/provider-runtime — the Stripe v2 JSON SERIALIZER (P24-1).
 *
 * ADR-0017 D6 (BINDING): v2 requests carry JSON bodies
 * (application/json) — a separate serializer from the v1 form encoder,
 * with its own contract:
 * - values pass through as JSON types (no stringification — the wire is
 *   typed);
 * - `undefined`/`null` properties are OMITTED (the v2 contract has no
 *   empty-string clear convention; a null never fabricates a clearing);
 * - property order is canonical (sorted) for byte-deterministic wire
 *   forms — v2 servers are order-insensitive, determinism is for evidence;
 * - the eventual-consistency caveat is recorded with the v2 PAGINATOR (a
 *   v2 list is a page snapshot, not a stable complete listing).
 *
 * The serializer accepts ONLY values that already passed the strict schema
 * validator; it performs no coercion.
 */

import { ValidationError } from '../../../errors.ts';

/** Deep-clone a validated value into JSON-safe, key-sorted form. */
function canonicalize(
  value: unknown,
  at: string,
  depth: number,
): string | number | boolean | object | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError(`non-finite number at '${at}' cannot be JSON-encoded`);
    }
    return value;
  }
  if (depth > 32) {
    throw new ValidationError(`JSON value nesting exceeds 32 levels at '${at}'`);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalize(item, `${at}[${String(index)}]`, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const inner = (value as Record<string, unknown>)[key];
      if (inner === undefined || inner === null) continue; // omitted, never null-on-wire
      out[key] = canonicalize(inner, `${at}.${key}`, depth + 1);
    }
    return out;
  }
  throw new ValidationError(`a value of type ${typeof value} at '${at}' cannot be JSON-encoded`);
}

/** The JSON body string for a validated v2 parameter record. */
export function stripeV2JsonBody(params: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(canonicalize(params, 'body', 0));
}

/**
 * The v2 query string (leading '?' when non-empty). v2 query params use the
 * same deepObject/form styles the spec records per parameter; values are
 * stringified for the query (a query string is never JSON).
 */
export function stripeV2QueryString(
  query: Readonly<Record<string, unknown>>,
  styles: Readonly<Record<string, 'form' | 'deepObject' | undefined>>,
): string {
  const parts: string[] = [];
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value === undefined || value === null) continue;
    const style = styles[key];
    if (style === 'form' && Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        parts.push(`${encodeQueryComponent(key)}=${encodeQueryComponent(queryText(item))}`);
      }
      continue;
    }
    for (const entry of deepEntries(key, value)) {
      parts.push(`${encodeQueryComponent(entry.key)}=${encodeQueryComponent(entry.value)}`);
    }
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

interface FlatEntry {
  readonly key: string;
  readonly value: string;
}

function deepEntries(key: string, value: unknown): FlatEntry[] {
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return [{ key, value: queryText(value) }];
  }
  const out: FlatEntry[] = [];
  const walk = (k: string, v: unknown, depth: number): void => {
    if (v === undefined || v === null) return;
    if (depth > 32) throw new ValidationError(`query nesting exceeds 32 levels at '${k}'`);
    if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
      out.push({ key: k, value: queryText(v) });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, index) => walk(`${k}[${String(index)}]`, item, depth + 1));
      return;
    }
    for (const sub of Object.keys(v as Record<string, unknown>).sort()) {
      walk(`${k}[${sub}]`, (v as Record<string, unknown>)[sub], depth + 1);
    }
  };
  walk(key, value, 0);
  return out;
}

function queryText(value: string | boolean | number): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError('a non-finite number cannot be query-encoded');
    }
    return value.toString();
  }
  return value;
}

function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}
