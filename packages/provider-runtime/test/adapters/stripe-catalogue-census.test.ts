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
import { generateStripeOperationSchemas } from '../../src/adapters/stripe/catalogue/schema-generator.ts';
import { STRIPE_OPENAPI_PIN, STRIPE_OPENAPI_PIN_COUNTS } from '../../src/adapters/stripe/catalogue/spec-pin.ts';
import {
  STRIPE_P24_INITIAL_RELEASE_OPERATIONS,
  STRIPE_EFFECT_CLASSES,
  STRIPE_REAUTH_FLOW_OPERATIONS,
} from '../../src/adapters/stripe/catalogue/overlay.ts';
import {
  STRIPE_P24_IMPLEMENTED_OPERATIONS,
  STRIPE_P24_READ_BACK_ROUTES,
  stripeReadBackOperationOf,
} from '../../src/adapters/stripe/catalogue/implemented-operations.ts';
import {
  STRIPE_SCHEMA_ARTIFACT_PIN,
  STRIPE_SCHEMA_UNREPRESENTABLE_OPERATIONS,
  stripeOperationSchema,
} from '../../src/adapters/stripe/catalogue/schema-reader.ts';
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

describe('stripe catalogue — the DENY law (handoff §4.3, the P25 surface law + the P26-A amendment)', () => {
  it('THE HELD TEN are the ONLY non-dispatchable operations — each a recorded decision (the secrets law)', () => {
    const held = STRIPE_OPERATION_CENSUS.filter(
      (record) => !stripeCensusDispatchAllowed(record.operationId),
    );
    expect(held.map((record) => record.operationId).sort()).toEqual([
      // (ASCII order; the categories are annotated inline)
      'DeleteEphemeralKeysKey', // reviewed: the ek_ secret rides delete responses
      'DeleteWebhookEndpointsWebhookEndpoint', // family: webhook_endpoints (whsec_ law)
      'GetAppsSecretsFind', // reviewed: a GET that REVEALS the stored payload
      'PostAppsSecrets', // path-prefix law: the audit's live catch (3-segment family escape)
      'PostAppsSecretsDelete', // family: apps/secrets (4-segment paths match the table)
      'PostCustomerSessions', // reviewed: single-use client secret
      'PostEphemeralKeys', // reviewed: the ek_ secret rides create responses
      'PostTerminalConnectionTokens', // reviewed: short-lived SDK connection token
      'PostWebhookEndpoints', // family: webhook_endpoints (whsec_ in create response)
      'PostWebhookEndpointsWebhookEndpoint', // family: webhook_endpoints
    ]);
    for (const record of held) {
      expect(record.supportState).toBe('NOT_SUPPORTED_WITH_REASON');
    }
  });

  it('THE P26-A REAUTH-FLOW UN-HOLD: the three account-link/session operations dispatch at REAUTH tier (ADR-0018)', () => {
    // The responses carry onboarding URLs / Dashboard session objects, never
    // credentials; the REAUTH tier + the host proof machinery (the desktop
    // lane) are the flow. A chat reply still never confirms this tier.
    for (const operationId of STRIPE_REAUTH_FLOW_OPERATIONS) {
      const record = stripeCensusRecord(operationId);
      expect(record, `no census record for ${operationId}`).toBeDefined();
      expect(record?.effectClass).toBe('PERMISSION_OR_CREDENTIAL_ADMIN');
      expect(record?.approvalTier).toBe('REAUTH');
      expect(record?.supportState).toBe('IMPLEMENTED');
      expect(stripeCensusDispatchAllowed(operationId)).toBe(true);
    }
    // THE P26-A CATCH (measured before pinning): the v2 twin derives family
    // 'core' — without the reviewed path-prefix law it would have dispatched
    // at mere CONFIRM tier (masked at P25 by the override hold).
    expect(stripeCensusRecord('PostV2CoreAccountLinks')?.approvalTier).toBe('REAUTH');
  });

  it('the create-secret escape is closed (the audit\u2019s live catch)', () => {
    // /v1/apps/secrets is a 3-segment path whose family derives as 'apps' —
    // the family table alone never matched it. The path-prefix law holds it.
    const create = stripeCensusRecord('PostAppsSecrets');
    expect(create?.effectClass).toBe('PERMISSION_OR_CREDENTIAL_ADMIN');
    expect(create?.approvalTier).toBe('REAUTH');
    expect(stripeCensusDispatchAllowed('PostAppsSecrets')).toBe(false);
    // …while the metadata LIST (names only, no payload) stays a dispatchable read.
    expect(stripeCensusDispatchAllowed('GetAppsSecrets')).toBe(true);
  });

  it('terminal refunds are STRONG_CONFIRM money-movers (the reclassification)', () => {
    const refund = stripeCensusRecord('PostTerminalRefunds');
    expect(refund?.effectClass).toBe('FINANCIAL_IRREVERSIBLE_OR_REVERSAL');
    expect(refund?.approvalTier).toBe('STRONG_CONFIRM');
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

  it('test helpers dispatch IMPLEMENTED_WITH_LIMITS (test-mode only)', () => {
    // The whole plane is Sandbox-only today (live keys refused, INV-25/D14);
    // the honest limit is the state itself.
    for (const record of STRIPE_OPERATION_CENSUS) {
      if (record.resourceFamily.startsWith('test_helpers/')) {
        expect(record.supportState).toBe('IMPLEMENTED_WITH_LIMITS');
        expect(stripeCensusDispatchAllowed(record.operationId)).toBe(true);
      }
    }
  });

  it('the support-state census is the reviewed P26 ledger (exact — the anti-drift law)', () => {
    const counts = stripeCensusSupportStateCounts();
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(STRIPE_OPENAPI_PIN_COUNTS.operations);
    expect(counts['IMPLEMENTED']).toBe(471);
    expect(counts['IMPLEMENTED_WITH_LIMITS']).toBe(163);
    expect(counts['NOT_SUPPORTED_WITH_REASON']).toBe(10);
    // The P24 states have no producer under P25/P26 (historical vocabulary):
    expect(counts['PLANNED_P24_INITIAL_RELEASE']).toBeUndefined();
    expect(counts['ACCOUNT_GATED']).toBeUndefined();
    expect(counts['SANDBOX_TEST_HELPER_ONLY']).toBeUndefined();
    // 634 of 644 dispatchable (98.4%) — the P25 flip + the P26-A un-hold.
    const dispatchable = STRIPE_OPERATION_CENSUS.filter((record) =>
      stripeCensusDispatchAllowed(record.operationId),
    );
    expect(dispatchable).toHaveLength(634);
    expect(dispatchable.filter((record) => record.effectClass === 'READ_ONLY')).toHaveLength(284);
    expect(dispatchable.filter((record) => record.apiNamespace === 'v2')).toHaveLength(32);
    // THE PER-TIER ANTI-DRIFT LAW (P26-A, gap-matrix D-3): the P25 audit's
    // prose ledger drifted from its own artifacts (231/75+40/1 vs the text's
    // 235/76/40/1) with nothing failing. These assertions make every tier
    // ledger drift a test failure from now on.
    const writes = dispatchable.filter((record) => record.effectClass !== 'READ_ONLY');
    expect(writes).toHaveLength(350);
    const byTier: Record<string, number> = {};
    for (const record of writes) byTier[record.approvalTier] = (byTier[record.approvalTier] ?? 0) + 1;
    expect(byTier).toEqual({ CONFIRM: 232, STRONG_CONFIRM: 115, REAUTH: 3 });
    const byClass: Record<string, number> = {};
    for (const record of writes) byClass[record.effectClass] = (byClass[record.effectClass] ?? 0) + 1;
    expect(byClass).toEqual({
      STRIPE_CONFIGURATION_WRITE: 231,
      FINANCIAL_IRREVERSIBLE_OR_REVERSAL: 75,
      FINANCIAL_CREATE: 40,
      CUSTOMER_COMMUNICATION: 1,
      PERMISSION_OR_CREDENTIAL_ADMIN: 3,
    });
  });
});

describe('stripe catalogue — the P24→P25 flip coherence (the lineage still dispatches)', () => {
  it('every IMPLEMENTED operation is inside the reviewed initial-release set', () => {
    for (const operationId of STRIPE_P24_IMPLEMENTED_OPERATIONS) {
      expect(
        STRIPE_P24_INITIAL_RELEASE_OPERATIONS.has(operationId),
        `implemented op ${operationId} is outside the reviewed initial-release set`,
      ).toBe(true);
    }
  });

  it('every reviewed P24 implementation resolves a census record and IS dispatchable under P25', () => {
    for (const operationId of STRIPE_P24_IMPLEMENTED_OPERATIONS) {
      const record = stripeCensusRecord(operationId);
      expect(record, `no census record for implemented op ${operationId}`).toBeDefined();
      expect(record?.supportState).toBe('IMPLEMENTED');
      expect(stripeCensusDispatchAllowed(operationId)).toBe(true);
    }
  });

  it('the historical planned remainder now dispatches (the P25 flip coherence)', () => {
    const planned = [...STRIPE_P24_INITIAL_RELEASE_OPERATIONS].filter(
      (operationId) => !STRIPE_P24_IMPLEMENTED_OPERATIONS.has(operationId),
    );
    expect(planned.length).toBe(28);
    for (const operationId of planned) {
      expect(
        stripeCensusDispatchAllowed(operationId),
        `historical planned op ${operationId} does not dispatch under P25`,
      ).toBe(true);
    }
  });

  it('read-back routes reference only real, dispatchable operations', () => {
    for (const [operationId, readBack] of Object.entries(STRIPE_P24_READ_BACK_ROUTES)) {
      if (readBack !== null) {
        const record = stripeCensusRecord(readBack);
        expect(record, `read-back ${readBack} for ${operationId} does not exist`).toBeDefined();
        expect(stripeCensusDispatchAllowed(readBack), `read-back ${readBack} is not dispatchable`).toBe(true);
      }
    }
  });

  it('EVERY dispatchable write resolves a dispatchable GET read-back or an honest null (the P25 totality)', () => {
    const nulls: string[] = [];
    let verified = 0;
    for (const record of STRIPE_OPERATION_CENSUS) {
      if (!stripeCensusDispatchAllowed(record.operationId)) continue;
      if (record.effectClass === 'READ_ONLY') continue;
      const readBack = stripeReadBackOperationOf(record.operationId);
      if (readBack === null) {
        nulls.push(record.operationId);
        continue;
      }
      const target = stripeCensusRecord(readBack);
      expect(target, `read-back ${readBack} for ${record.operationId} does not exist`).toBeDefined();
      expect(target?.method).toBe('GET');
      expect(
        stripeCensusDispatchAllowed(readBack),
        `read-back ${readBack} for ${record.operationId} is not dispatchable`,
      ).toBe(true);
      verified += 1;
    }
    // One-shot surfaces with no verification route — the honest nulls.
    // 58 reviewed-derivation nulls among 350 dispatchable writes (55 at P25
    // + the three P26-A un-held one-shots: account links and sessions create
    // session/URL artifacts with no GET twin).
    expect(verified).toBe(292);
    expect(nulls).toHaveLength(58);
    expect(nulls).toContain('PostBillingPortalSessions'); // the reviewed one-shot
    expect(nulls).toContain('PostAccountLinks'); // the P26-A one-shot twins
    expect(nulls).toContain('PostAccountSessions');
    expect(nulls).toContain('PostV2CoreAccountLinks');
  });
});

describe('stripe catalogue — the request-schema artifact (P24-1, D4)', () => {
  it('the committed schema artifact regenerates deterministically from the spec', () => {
    const spec = JSON.parse(
      readFileSync(join(CATALOGUE_DIR, 'spec', 'openapi.spec3.json'), 'utf8'),
    ) as unknown;
    const regenerated = generateStripeOperationSchemas(spec as never, {
      sha256Hex: (input) => createHash('sha256').update(input, 'utf8').digest('hex'),
    });
    const committed = JSON.parse(
      readFileSync(join(CATALOGUE_DIR, 'operation-schemas.json'), 'utf8'),
    ) as unknown;
    expect(regenerated).toEqual(committed);
  });

  it('covers every pinned operation with a schema record (no invisible gap)', () => {
    expect(STRIPE_SCHEMA_ARTIFACT_PIN.operationCount).toBe(STRIPE_OPENAPI_PIN_COUNTS.operations);
    for (const record of STRIPE_OPERATION_CENSUS) {
      expect(
        stripeOperationSchema(record.operationId),
        `no schema record for ${record.operationId}`,
      ).toBeDefined();
    }
  });

  it('the pinned spec resolves every request-surface ref (fail-closed ledger empty)', () => {
    expect(STRIPE_SCHEMA_ARTIFACT_PIN.unresolvableRefCount).toBe(0);
    expect(STRIPE_SCHEMA_UNREPRESENTABLE_OPERATIONS).toEqual([]);
  });
});
