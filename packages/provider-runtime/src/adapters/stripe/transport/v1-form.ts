/**
 * @payswap/provider-runtime — the Stripe v1 FORM SERIALIZER (P24-1).
 *
 * ADR-0017 D6 (BINDING): v1 requests are form-encoded
 * (application/x-www-form-urlencoded) with Stripe's bracketed deep
 * encoding. Separate from the v2 JSON serializer — never one shared blob.
 *
 * ENCODING LAW (Stripe's published form convention):
 * - scalars → `key=value` (booleans as true/false; finite numbers as
 *   decimal strings — never exponent notation);
 * - objects → `key[sub]=value` recursively (deepObject);
 * - arrays → INDEXED form `key[0]=…&key[1]=…` (the documented Stripe
 *   style, e.g. expand[0]=data.customer);
 * - `undefined`/`null` → OMITTED (null means "leave untouched");
 * - `''` (empty string) → SENT as empty (Stripe's explicit-clear
 *   convention — the spec's anyOf [string, enum [""]] records it);
 * - keys are sorted at every level for byte-deterministic wire forms.
 *
 * The serializer accepts ONLY values that already passed the strict schema
 * validator (JSON-typed); it performs no coercion of its own.
 */

import { ValidationError } from '../../../errors.ts';

/** One flattened form entry (key with brackets, string value). */
export interface StripeFormEntry {
  readonly key: string;
  readonly value: string;
}

/** Serialize a JSON-typed value into flattened form entries (sorted keys). */
function flatten(
  key: string,
  value: unknown,
  depth: number,
  out: StripeFormEntry[],
): void {
  if (value === undefined || value === null) {
    return; // omitted — the leave-untouched law
  }
  if (depth > 32) {
    throw new ValidationError(`form value nesting exceeds 32 levels at '${key}'`);
  }
  if (typeof value === 'string') {
    out.push({ key, value });
    return;
  }
  if (typeof value === 'boolean') {
    out.push({ key, value: value ? 'true' : 'false' });
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError(`non-finite number at '${key}' cannot be form-encoded`);
    }
    out.push({ key, value: value.toString() });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      flatten(`${key}[${String(index)}]`, item, depth + 1, out);
    });
    return;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const sub of keys) {
      flatten(`${key}[${sub}]`, (value as Record<string, unknown>)[sub], depth + 1, out);
    }
    return;
  }
  throw new ValidationError(`a value of type ${typeof value} at '${key}' cannot be form-encoded`);
}

/** Flatten a validated parameter record into sorted form entries. */
export function stripeV1FormEntries(params: Readonly<Record<string, unknown>>): StripeFormEntry[] {
  const out: StripeFormEntry[] = [];
  for (const key of Object.keys(params).sort()) {
    flatten(key, params[key], 0, out);
  }
  return out;
}

/** The form-encoded body string (entries joined; never a leading '?'). */
export function stripeV1FormBody(params: Readonly<Record<string, unknown>>): string {
  return stripeV1FormEntries(params)
    .map((entry) => `${encodeFormComponent(entry.key)}=${encodeFormComponent(entry.value)}`)
    .join('&');
}

/**
 * The v1 GET/DELETE query string (leading '?' when non-empty). Query
 * params carry the OpenAPI style the spec records: deepObject params
 * (arrays/objects) flatten to `key[i]=`/`key[sub]=`; form-style scalars
 * stay flat; form-style arrays repeat the key.
 */
export function stripeV1QueryString(
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
        parts.push(`${encodeFormComponent(key)}=${encodeFormComponent(scalarText(key, item))}`);
      }
      continue;
    }
    for (const entry of flattenScalarOrDeep(key, value)) {
      parts.push(`${encodeFormComponent(entry.key)}=${encodeFormComponent(entry.value)}`);
    }
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

function flattenScalarOrDeep(key: string, value: unknown): StripeFormEntry[] {
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return [{ key, value: scalarText(key, value) }];
  }
  const out: StripeFormEntry[] = [];
  flatten(key, value, 0, out);
  return out;
}

function scalarText(key: string, value: string | boolean | number): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError(`non-finite number at '${key}' cannot be query-encoded`);
    }
    return value.toString();
  }
  return value;
}

/** Percent-encoding per application/x-www-form-urlencoded (space → '+'). */
function encodeFormComponent(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}
