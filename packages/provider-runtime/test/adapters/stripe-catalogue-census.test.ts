/**
 * @payswap/provider-runtime — the Stripe catalogue CENSUS TESTS (P24-0).
 *
 * Handoff §13.1 gates made mechanical:
 * - the spec pin is verified (SHA-256 of the committed spec bytes);
 * - every GA operation in the pinned spec has EXACTLY ONE census record
 *   (duplicate/missing operationIds fail);
 * - the inventory is regenerated from the committed spec and matches the
 *   committed artifact byte-for-byte (deterministic generation);
 * - every operation resolves a pack (no invisible dropped endpoint);
 * - every operation resolves an effect class + approval tier + support
 *   state (unknown overlay = DENY is enforced structurally);
 * - the P24 initial-release surface references only real operationIds and
 *   is denied dispatch until states flip to IMPLEMENTED;
 * - the v1/v2 namespace split matches the pin counts.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  STRIPE_OPERATION_CENSUS,
  STRIPE_CENSUS_PIN,
  stripeCensusDispatchAllowed,
  stripeCensusRecord,
  stripeCensusPackCounts,
  stripeCensusSupportStateCounts,
} from '../../src/adapters/stripe/catalogue/census.ts';
import { generateStripeOperationInventory } from '../../src/adapters/stripe/catalogue/generator.ts';
import { STRIPE_OPENAPI_PIN, STRIPE_OPENAPI_PIN_COUNTS } from '../../src/adapters/stripe/catalogue/spec-pin.ts';
import {
  STRIPE_P24_INITIAL_RELEASE_OPERATIONS,
  STRIPE_EFFECT_CLASSES,
} from '../../src/adapters/stripe/catalogue/overlay.ts';
import { STRIPE_RESOURCE_PACK_IDS } from '../../src/adapters/stripe/catalogue/resource-packs.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOGUE_DIR = join(HERE, '../../src/adapters/stripe/catalogue');

describe('stripe catalogue — the spec pin (handoff §13.1)', () => {
  it('the committed spec bytes match the pinned SHA-256', () => {
    const bytes = readFileSync(join(CATALOGUE_DIR, 'spec', 'openapi.spec3.json'));
    const sha = createHash('sha256').update(bytes).digest('hex');
    expect(sha).toBe(STRIPE_OPENAPI_PIN.specSha256);
  });

  it('the census pin metadata is coherent with the release', () => {
    expect(STRIPE_CENSUS_PIN.releaseTag).toBe('v2596');
    expect(STRIPE_CENSUS_PIN.releaseCommitSha).toBe(
      'aab1dee849cf4105b221c90132797891312b7ab2',
    );
    expect(STRIPE_CENSUS_PIN.specInfoVersion).toBe('2026-09-30.endive');
    expect(STRIPE_CENSUS_PIN.operationCount).toBe(STRIPE_OPENAPI_PIN_COUNTS.operations);
  });
});

describe('stripe catalogue — the census law (every operation, exactly once)', () => {
  it('has exactly one census record per spec operation (644 total)', () => {
    expect(STRIPE_OPERATION_CENSUS).toHaveLength(STRIPE_OPENAPI_PIN_COUNTS.operations);
    const ids = STRIPE_OPERATION_CENSUS.map((record) => record.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('regenerates the committed inventory deterministically from the spec', () => {
    const spec = JSON.parse(
      readFileSync(join(CATALOGUE_DIR, 'spec', 'openapi.spec3.json'), 'utf8'),
    ) as unknown;
    const regenerated = generateStripeOperationInventory(spec as never, {
      sha256Hex: (input) => createHash('sha256').update(input, 'utf8').digest('hex'),
    });
    const committed = JSON.parse(
      readFileSync(join(CATALOGUE_DIR, 'operations.json'), 'utf8'),
    ) as { operations: unknown[] };
    expect(regenerated.operations).toEqual(committed.operations);
  });

  it('splits v1/v2 exactly as pinned (612 + 32)', () => {
    const v1 = STRIPE_OPERATION_CENSUS.filter((r) => r.apiNamespace === 'v1').length;
    const v2 = STRIPE_OPERATION_CENSUS.filter((r) => r.apiNamespace === 'v2').length;
    expect(v1).toBe(STRIPE_OPENAPI_PIN_COUNTS.v1Operations);
    expect(v2).toBe(STRIPE_OPENAPI_PIN_COUNTS.v2Operations);
  });

  it('resolves a reviewed pack for EVERY operation (no invisible dropped endpoint)', () => {
    for (const record of STRIPE_OPERATION_CENSUS) {
      expect(STRIPE_RESOURCE_PACK_IDS).toContain(record.packId);
    }
    const packCounts = stripeCensusPackCounts();
    const total = Object.values(packCounts).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(STRIPE_OPENAPI_PIN_COUNTS.operations);
  });

  it('resolves an effect class, approval tier and support state for EVERY operation', () => {
    for (const record of STRIPE_OPERATION_CENSUS) {
      expect(STRIPE_EFFECT_CLASSES).toContain(record.effectClass);
      expect(['NONE', 'CONFIRM', 'STRONG_CONFIRM', 'REAUTH']).toContain(record.approvalTier);
      expect(record.supportState.length).toBeGreaterThan(0);
      expect(record.requiredPermissionRule.length).toBeGreaterThan(0);
    }
  });
});

describe('stripe catalogue — the DENY law (handoff §4.3)', () => {
  it('PLANNED_P24_INITIAL_RELEASE operations are NOT dispatchable yet', () => {
    const planned = STRIPE_OPERATION_CENSUS.filter(
      (record) => record.supportState === 'PLANNED_P24_INITIAL_RELEASE',
    );
    expect(planned.length).toBe(STRIPE_P24_INITIAL_RELEASE_OPERATIONS.size);
    for (const record of planned) {
      expect(stripeCensusDispatchAllowed(record.operationId)).toBe(false);
    }
  });

  it('unknown operationIds are refused (fail-closed)', () => {
    expect(stripeCensusDispatchAllowed('DefinitelyNotARealOperation')).toBe(false);
    expect(stripeCensusRecord('DefinitelyNotARealOperation')).toBeUndefined();
    expect(stripeCensusDispatchAllowed('')).toBe(false);
  });

  it('every P24 initial-release operationId exists in the pinned spec', () => {
    const censusIds = new Set(STRIPE_OPERATION_CENSUS.map((record) => record.operationId));
    for (const operationId of STRIPE_P24_INITIAL_RELEASE_OPERATIONS) {
      expect(censusIds.has(operationId), `unknown P24 op ${operationId}`).toBe(true);
    }
  });

  it('GET operations are READ_ONLY; searches are READ_ONLY even as POST-like paths', () => {
    for (const record of STRIPE_OPERATION_CENSUS) {
      if (record.method === 'GET') expect(record.effectClass).toBe('READ_ONLY');
      if (record.path.includes('/search')) expect(record.effectClass).toBe('READ_ONLY');
    }
  });

  it('money-moving families get financial effect classes on writes', () => {
    const createPi = stripeCensusRecord('PostPaymentIntents');
    expect(createPi?.effectClass).toBe('FINANCIAL_CREATE');
    expect(createPi?.approvalTier).toBe('STRONG_CONFIRM');
    const refund = stripeCensusRecord('PostRefunds');
    expect(refund?.effectClass).toBe('FINANCIAL_IRREVERSIBLE_OR_REVERSAL');
    const transfer = stripeCensusRecord('PostTransfers');
    expect(transfer?.effectClass).toBe('FINANCIAL_CREATE');
    const sendInvoice = stripeCensusRecord('PostInvoicesInvoiceSend');
    expect(sendInvoice?.effectClass).toBe('CUSTOMER_COMMUNICATION');
  });

  it('test helpers are clearly SANDBOX_TEST_HELPER_ONLY', () => {
    const clock = stripeCensusRecord('PostTestHelpersTestClocks');
    expect(clock?.supportState).toBe('PLANNED_P24_INITIAL_RELEASE'); // reviewed in the initial surface
    const helper = STRIPE_OPERATION_CENSUS.find(
      (record) => record.resourceFamily.startsWith('test_helpers/') &&
        !STRIPE_P24_INITIAL_RELEASE_OPERATIONS.has(record.operationId),
    );
    expect(helper?.supportState).toBe('SANDBOX_TEST_HELPER_ONLY');
  });

  it('the support-state census is complete and non-empty in every bucket it claims', () => {
    const counts = stripeCensusSupportStateCounts();
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(STRIPE_OPENAPI_PIN_COUNTS.operations);
    expect(counts['PLANNED_P24_INITIAL_RELEASE']).toBe(
      STRIPE_P24_INITIAL_RELEASE_OPERATIONS.size,
    );
    expect(counts['NOT_SUPPORTED_WITH_REASON']).toBeGreaterThan(0);
    expect(counts['ACCOUNT_GATED']).toBeGreaterThan(0);
  });
});
