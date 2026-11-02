/**
 * @payswap/provider-runtime — the GENERATED TOTALITY BATTERY (P25, the
 * audit's G7 fill).
 *
 * The P24 family battery proved the initial-release surface with 46
 * hand-written happy/error cases — a shape that cannot scale to the P25
 * full-coverage flip (631 dispatchable operations). This battery is
 * GENERATED: for EVERY dispatchable operation in the census it
 *
 *   1. synthesizes minimal valid parameters from the COMMITTED schema
 *      records (enum → first value, integer → minimum, object → required
 *      properties, union → first viable variant, allOf → merged objects);
 *   2. asserts the strict validator accepts them and the transport reaches
 *      the wire with the catalogue's method + substituted path, the right
 *      body shape (urlencoded / JSON / multipart bytes) and the
 *      Idempotency-Key exactly for v1 state-changing POSTs;
 *   3. asserts the error path: one unknown parameter → INVALID_PARAMETERS,
 *      refused BEFORE the wire (the strict-validation law).
 *
 * Deterministic (no network, no time, no randomness — the synthesized
 * values are pure functions of the committed artifacts). A new pin changes
 * the artifacts, never this file's logic; the counts it asserts are the
 * census's own.
 */

import { describe, expect, it } from 'vitest';
import {
  STRIPE_OPERATION_CENSUS,
  stripeCensusDispatchAllowed,
  stripeCensusRecord,
} from '../../src/adapters/stripe/catalogue/census.ts';
import {
  STRIPE_SCHEMA_DEFS,
  stripeOperationSchema,
} from '../../src/adapters/stripe/catalogue/schema-reader.ts';
import type {
  StripeSchemaNode,
  StripeOperationSchemaRecord,
} from '../../src/adapters/stripe/catalogue/schema-nodes.ts';
import {
  stripeIdempotencyKeyAllowed,
} from '../../src/adapters/stripe/catalogue/idempotency-classification.ts';
import { StripeCatalogueTransport } from '../../src/adapters/stripe/transport/catalogue-transport.ts';
import { FakeStripeFetch, fakeCallContext } from './stripe-fake-transport.test.js';

/* ------------------------- the value synthesizer ------------------------ */

const SYNTH_STRING = 'payswap-synth';
const SYNTH_BASE64 = 'cGF5c3dhcC1zeW50aA=='; // base64("payswap-synth")

class SynthesisError extends Error {}

function synthString(node: Extract<StripeSchemaNode, { kind: 'string' }>): string {
  if (node.enum !== undefined && node.enum.length > 0) return node.enum[0] as string;
  if (node.maxLength !== undefined && node.maxLength < SYNTH_STRING.length) {
    return SYNTH_STRING.slice(0, node.maxLength);
  }
  return SYNTH_STRING;
}

function synthesizeValue(node: StripeSchemaNode, depth: number): unknown {
  if (depth > 16) throw new SynthesisError('synthesis depth exceeded');
  switch (node.kind) {
    case 'ref': {
      const resolved = STRIPE_SCHEMA_DEFS[node.def];
      if (resolved === undefined) throw new SynthesisError(`unresolved def ${node.def}`);
      return synthesizeValue(resolved, depth + 1);
    }
    case 'any':
      return SYNTH_STRING;
    case 'string':
      return synthString(node);
    case 'integer':
    case 'number':
      return node.minimum ?? 1;
    case 'boolean':
      return true;
    case 'array':
      return [synthesizeValue(node.items, depth + 1)];
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const name of node.required ?? []) {
        const property = node.properties?.[name];
        if (property === undefined) {
          throw new SynthesisError(`required property '${name}' has no schema`);
        }
        out[name] = synthesizeValue(property, depth + 1);
      }
      return out;
    }
    case 'union': {
      let lastError: unknown = new SynthesisError('empty union');
      for (const variant of node.variants) {
        try {
          return synthesizeValue(variant, depth + 1);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    }
    case 'all': {
      // allOf: merge every object branch's required properties.
      const merged: Record<string, unknown> = {};
      for (const branch of node.branches) {
        const value = synthesizeValue(branch, depth + 1);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          Object.assign(merged, value as Record<string, unknown>);
        }
      }
      if (Object.keys(merged).length === 0) {
        throw new SynthesisError('allOf branches produced no mergeable object');
      }
      return merged;
    }
    case 'unresolvable':
      throw new SynthesisError(`unresolvable ref ${node.ref}`);
    case 'unrepresentable':
      throw new SynthesisError(`unrepresentable: ${node.reason}`);
  }
}

/** The synthesized parameter record for one operation (required-only). */
function synthesizedParamsFor(record: StripeOperationSchemaRecord): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [name, parameter] of Object.entries(record.parameters)) {
    if (!parameter.required) continue;
    // Path/query params keep plain synth values (the path charset law);
    // ONLY the multipart body's `file` rides base64.
    params[name] = synthesizeValue(parameter.schema, 0);
  }
  if (record.body !== null) {
    const bodyValue = synthesizeValue(record.body.schema, 0);
    if (typeof bodyValue === 'object' && bodyValue !== null && !Array.isArray(bodyValue)) {
      for (const [name, value] of Object.entries(bodyValue as Record<string, unknown>)) {
        params[name] = name === 'file' && value === SYNTH_STRING ? SYNTH_BASE64 : value;
      }
    } else {
      // A non-object body root (never observed in the pin; handled honestly).
      throw new SynthesisError(`non-object body root for ${record.operationId}`);
    }
  }
  return params;
}

/* ------------------------------- the battery ---------------------------- */

const DISPATCHABLE = STRIPE_OPERATION_CENSUS.filter((record) =>
  stripeCensusDispatchAllowed(record.operationId),
);

describe('stripe catalogue — the P25 generated totality battery (every dispatchable operation)', () => {
  it('the dispatchable census is the expected 631 (the flip ledger)', () => {
    expect(DISPATCHABLE).toHaveLength(631);
  });

  it('EVERY dispatchable operation synthesizes, validates and reaches the wire (happy path)', async () => {
    const failures: string[] = [];
    for (const record of DISPATCHABLE) {
      const label = record.operationId;
      const schema = stripeOperationSchema(record.operationId);
      if (schema === undefined) {
        failures.push(`${label}: no schema record`);
        continue;
      }
      let params: Record<string, unknown>;
      try {
        params = synthesizedParamsFor(schema);
      } catch (error) {
        failures.push(`${label}: synthesis — ${(error as Error).message}`);
        continue;
      }
      const needsKey = stripeIdempotencyKeyAllowed(record);
      const fake = new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'synth' } });
      const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
      const result = await transport.dispatch({
        operationId: record.operationId,
        params,
        context: fakeCallContext(),
        ...(needsKey ? { idempotencyKey: 'idem-totality' } : {}),
      });
      if (result.kind !== 'OK') {
        failures.push(`${label}: dispatch ${result.kind}${result.kind === 'REFUSED' ? ` (${result.reason}: ${result.detail})` : ''}`);
        continue;
      }
      const call = fake.calls()[0];
      if (call === undefined) {
        failures.push(`${label}: no wire call`);
        continue;
      }
      if (call.method !== record.method) {
        failures.push(`${label}: method ${call.method} !== ${record.method}`);
      }
      let expectedPath = schema.path;
      for (const [name, value] of Object.entries(params)) {
        if (schema.parameters[name]?.location === 'path') {
          expectedPath = expectedPath.replace(`{${name}}`, encodeURIComponent(String(value)));
        }
      }
      if (!call.url.includes(expectedPath)) {
        failures.push(`${label}: url ${call.url} does not carry ${expectedPath}`);
      }
      if (needsKey && call.idempotencyKey === null) {
        failures.push(`${label}: missing Idempotency-Key on a v1 state-changing POST`);
      }
      if (!needsKey && call.idempotencyKey !== null) {
        failures.push(`${label}: unexpected Idempotency-Key`);
      }
      const isMultipart = schema.body?.contentType === 'multipart/form-data';
      if (isMultipart && !(call.body instanceof Uint8Array)) {
        failures.push(`${label}: multipart body is not bytes`);
      }
      if (!isMultipart && record.method !== 'GET' && typeof call.body !== 'string' && call.body !== undefined) {
        failures.push(`${label}: non-multipart body is neither string nor absent`);
      }
    }
    expect(failures, `happy-path failures:\n${failures.join('\n')}`).toEqual([]);
  });

  it('EVERY dispatchable operation refuses an unknown parameter before the wire (strict error path)', async () => {
    const failures: string[] = [];
    for (const record of DISPATCHABLE) {
      const schema = stripeOperationSchema(record.operationId);
      if (schema === undefined) {
        failures.push(`${record.operationId}: no schema record`);
        continue;
      }
      let params: Record<string, unknown>;
      try {
        params = synthesizedParamsFor(schema);
      } catch {
        // The happy-path case already reports synthesis failures; here the
        // error path is provable with the empty set + one unknown field.
        params = {};
      }
      const fake = new FakeStripeFetch();
      const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
      const result = await transport.dispatch({
        operationId: record.operationId,
        params: { ...params, __totality_unknown__: 'x' },
        context: fakeCallContext(),
        ...(stripeIdempotencyKeyAllowed(record) ? { idempotencyKey: 'idem-totality-err' } : {}),
      });
      if (result.kind !== 'REFUSED' || result.reason !== 'INVALID_PARAMETERS') {
        failures.push(
          `${record.operationId}: expected INVALID_PARAMETERS, got ${result.kind}` +
            (result.kind === 'REFUSED' ? ` (${result.reason})` : ''),
        );
      }
      if (fake.callCount !== 0) {
        failures.push(`${record.operationId}: the wire was touched on a refused dispatch`);
      }
    }
    expect(failures, `error-path failures:\n${failures.join('\n')}`).toEqual([]);
  });

  it('the multipart file upload carries the decoded binary (the G5 wire proof)', async () => {
    const record = stripeCensusRecord('PostFiles');
    expect(record?.supportState).toBe('IMPLEMENTED_WITH_LIMITS');
    const schema = stripeOperationSchema('PostFiles');
    expect(schema?.body?.contentType).toBe('multipart/form-data');
    const fake = new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'file' } });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'PostFiles',
      params: { file: SYNTH_BASE64, purpose: 'business_logo' },
      context: fakeCallContext(),
      idempotencyKey: 'idem-totality-files',
    });
    expect(result.kind).toBe('OK');
    const call = fake.calls()[0];
    expect(call).toBeDefined();
    if (call === undefined) return;
    expect(call.body).toBeInstanceOf(Uint8Array);
    expect(call.headerNames).toContain('Content-Type');
    const text = new TextDecoder().decode(call.body as Uint8Array);
    expect(text).toContain('--payswap-stripe-multipart-v1');
    expect(text).toContain('name="file"; filename="upload"');
    expect(text).toContain('name="purpose"');
    expect(text).toContain('business_logo');
    expect(text).toContain('payswap-synth'); // the decoded binary, in-body
  });
});
