/**
 * @payswap/provider-runtime — the PIN-DIFF battery (P24-1).
 *
 * ADR-0017 D2's migration-law tooling made mechanical:
 * - synthetic inventories prove added/removed/changed/unchanged detection
 *   (pure engine, no spec bytes needed);
 * - the REAL pin diffed against itself is an empty diff (self-identity);
 * - the real pin diffed against a surgically modified copy detects the
 *   exact delta (added op, removed op, changed op);
 * - duplicate ids fail loudly (never silently deduped);
 * - the summary line is stable for review logs.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  diffStripeOperationInventories,
  summarizeStripeCatalogueDiff,
  type StripeInventoryLike,
} from '../../src/adapters/stripe/catalogue/pin-diff.ts';
import { generateStripeOperationInventory } from '../../src/adapters/stripe/catalogue/generator.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOGUE_DIR = join(HERE, '../../src/adapters/stripe/catalogue');

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

/** A tiny synthetic inventory (deterministic, hand-authored). */
function synthetic(version: string): StripeInventoryLike {
  return {
    specInfoVersion: version,
    operations: [
      {
        operationId: 'GetWidget', apiNamespace: 'v1', method: 'GET', path: '/v1/widgets',
        pathParams: [], tags: [], listPaginated: false, hasRequestBody: false,
        idempotencyRelated: false, specDigest: 'aaaa0001', summary: 'get a widget',
      },
      {
        operationId: 'PostWidget', apiNamespace: 'v1', method: 'POST', path: '/v1/widgets',
        pathParams: [], tags: [], listPaginated: false, hasRequestBody: true,
        idempotencyRelated: true, specDigest: 'aaaa0002', summary: 'create a widget',
      },
      {
        operationId: 'DeleteWidget', apiNamespace: 'v1', method: 'DELETE', path: '/v1/widgets/{id}',
        pathParams: ['id'], tags: [], listPaginated: false, hasRequestBody: true,
        idempotencyRelated: false, specDigest: 'aaaa0003', summary: 'delete a widget',
      },
    ],
  };
}

describe('the pin-diff engine (synthetic inventories)', () => {
  it('an identical candidate is an empty diff', () => {
    const diff = diffStripeOperationInventories(synthetic('1.0.0'), synthetic('1.0.0'));
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchangedCount).toBe(3);
  });

  it('detects ADDED and REMOVED operations by operationId', () => {
    const pinned = synthetic('1.0.0');
    const candidate: StripeInventoryLike = {
      specInfoVersion: '1.1.0',
      operations: [
        pinned.operations[0]!, // GetWidget stays
        {
          operationId: 'PostGadget', apiNamespace: 'v1', method: 'POST', path: '/v1/gadgets',
          pathParams: [], tags: [], listPaginated: false, hasRequestBody: true,
          idempotencyRelated: false, specDigest: 'bbbb0001', summary: 'new upstream op',
        },
      ],
    };
    const diff = diffStripeOperationInventories(pinned, candidate);
    expect(diff.added.map((a) => a.operationId)).toEqual(['PostGadget']);
    expect(diff.added[0]?.candidate.path).toBe('/v1/gadgets');
    expect(diff.removed.map((r) => r.operationId)).toEqual(['DeleteWidget', 'PostWidget']);
    expect(diff.unchangedCount).toBe(1);
  });

  it('detects CHANGED operations (digest or method/path/namespace drift)', () => {
    const pinned = synthetic('1.0.0');
    const candidate: StripeInventoryLike = {
      specInfoVersion: '1.1.0',
      operations: [
        pinned.operations[0]!,
        { ...pinned.operations[1]!, specDigest: 'aaaa0009' }, // schema drift
        { ...pinned.operations[2]!, path: '/v1/widgets/{widget_id}' }, // path drift
      ],
    };
    const diff = diffStripeOperationInventories(pinned, candidate);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    // Sorted by operationId: DeleteWidget first, PostWidget second.
    expect(diff.changed.map((c) => c.operationId)).toEqual(['DeleteWidget', 'PostWidget']);
    expect(diff.changed[1]?.pinned.specDigest).toBe('aaaa0002');
    expect(diff.changed[1]?.candidate.specDigest).toBe('aaaa0009');
    expect(diff.changed[0]?.candidate.path).toBe('/v1/widgets/{widget_id}');
  });

  it('fails loudly on duplicate ids (never silently deduped)', () => {
    const pinned = synthetic('1.0.0');
    const dupped: StripeInventoryLike = {
      specInfoVersion: '1.1.0',
      operations: [...pinned.operations, pinned.operations[0]!],
    };
    expect(() => diffStripeOperationInventories(pinned, dupped)).toThrow(/duplicate operationId/);
  });

  it('produces a stable summary line', () => {
    const diff = diffStripeOperationInventories(synthetic('1.0.0'), synthetic('2.0.0'));
    expect(summarizeStripeCatalogueDiff(diff)).toBe(
      'pinned 1.0.0 (3 ops) · candidate 2.0.0 (3 ops) · added 0 · removed 0 · changed 0 · unchanged 3',
    );
  });
});

describe('the pin-diff engine (the REAL pinned spec)', () => {
  it('the real pin diffed against itself is an empty diff (self-identity)', () => {
    const spec = JSON.parse(
      readFileSync(join(CATALOGUE_DIR, 'spec', 'openapi.spec3.json'), 'utf8'),
    ) as unknown;
    const inventory = generateStripeOperationInventory(spec as never, { sha256Hex });
    const diff = diffStripeOperationInventories(inventory, inventory);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchangedCount).toBe(644);
  });

  it('detects a surgical modification of the real spec (the review evidence)', () => {
    const spec = JSON.parse(
      readFileSync(join(CATALOGUE_DIR, 'spec', 'openapi.spec3.json'), 'utf8'),
    ) as {
      info: { version: string };
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    const pinned = generateStripeOperationInventory(spec as never, { sha256Hex });
    // Surgically modify: change one summary (digest drift), add one path,
    // remove one operation.
    const modified = JSON.parse(JSON.stringify(spec)) as typeof spec;
    modified.info.version = '2099-01-01.future';
    const customersPath = modified.paths['/v1/customers']!;
    customersPath.get!.summary = 'List customers (future flavor)';
    modified.paths['/v1/payswap_probe'] = {
      post: {
        summary: 'A future upstream operation',
        operationId: 'PostPayswapProbe',
        responses: { '200': { description: 'ok' } },
      },
    };
    delete modified.paths['/v1/balance']!.get;
    const candidate = generateStripeOperationInventory(modified as never, { sha256Hex });
    const diff = diffStripeOperationInventories(pinned, candidate);
    expect(diff.candidateSpecInfoVersion).toBe('2099-01-01.future');
    expect(diff.added.map((a) => a.operationId)).toEqual(['PostPayswapProbe']);
    expect(diff.removed.map((r) => r.operationId)).toEqual(['GetBalance']);
    expect(diff.changed.map((c) => c.operationId)).toEqual(['GetCustomers']);
    // 644 pinned ops; shared ids = 643; one changed → 642 unchanged.
    expect(diff.unchangedCount).toBe(642);
  });
});
