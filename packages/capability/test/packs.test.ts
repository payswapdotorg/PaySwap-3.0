import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/index.ts';
import {
  CONNECTOR_PACK_FAMILIES,
  SOURCE_OF_TRUTH_POLICIES,
  findSubPack,
  flattenPackCapabilityRefs,
  validateConnectorCapabilityPack,
} from '../src/index.ts';
import type { ConnectorCapabilityPack } from '../src/index.ts';

/**
 * Hierarchical Connector Capability Packs (PORTED from old connectors
 * packs.test.ts): provider packs are TREES of independently
 * versioned/certified sub-packs. Each node declares auth, schemas, object
 * mappings, source-of-truth policy, rate limits, provenance and evidence.
 */

function leafPack(
  packId: string,
  version: string,
  capabilityId: string,
): ConnectorCapabilityPack {
  return {
    packId,
    family: 'payments',
    version,
    subPacks: [],
    capabilityRefs: [{ capabilityId, capabilityVersion: '1.0.0' }],
    auth: { authKind: 'OAUTH', scopes: ['payments:read'] },
    schemas: [{ schemaId: 'schemas/payments/intent', version: '1.1.0' }],
    objectMappings: [
      {
        externalObjectType: 'PAYMENT_INTENT',
        canonicalObjectRef: 'work-graph/payment-intent',
        sourceOfTruth: 'EXTERNAL_AUTHORITATIVE',
      },
    ],
    sourceOfTruth: 'EXTERNAL_AUTHORITATIVE',
    rateLimits: [{ limit: 100, windowSeconds: 1, scope: 'per-connected-instance' }],
    provenance: {
      publisher: 'payswap-connector-publishers/psp-a',
      publishedAt: '2026-09-30T00:00:00Z',
      contentHash: 'sha256:pack',
    },
    evidence: [{ evidenceId: 'ev-pack-1', artifactRef: 'artifacts/psp-a-payments.tgz' }],
  };
}

const paymentsPack: ConnectorCapabilityPack = {
  packId: 'pack:psp-a-payments',
  family: 'payments',
  version: '4.1.0',
  subPacks: [
    { ...leafPack('pack:psp-a-payments-methods', '1.3.0', 'conn:payments.list-methods') },
    {
      ...leafPack('pack:psp-a-payments-authorization', '2.0.1', 'conn:payments.create-authorization'),
    },
    { ...leafPack('pack:psp-a-payments-capture', '1.9.4', 'conn:payments.capture') },
    { ...leafPack('pack:psp-a-payments-refund', '3.2.0', 'conn:payments.refund') },
  ],
  capabilityRefs: [],
  auth: { authKind: 'OAUTH', scopes: ['payments:read', 'payments:write'] },
  schemas: [{ schemaId: 'schemas/payments/root', version: '4.0.0' }],
  objectMappings: [],
  sourceOfTruth: 'PAYSWAP_AUTHORITATIVE',
  rateLimits: [{ limit: 1000, windowSeconds: 60, scope: 'pack' }],
  provenance: {
    publisher: 'payswap-connector-publishers/psp-a',
    publishedAt: '2026-09-30T00:00:00Z',
    contentHash: 'sha256:pack-root',
  },
  evidence: [{ evidenceId: 'ev-pack-root', artifactRef: 'artifacts/psp-a-root.tgz' }],
};

describe('pack family vocabulary (carried from the frozen model)', () => {
  it('includes the PSP sub-pack families named by the frozen architecture', () => {
    expect([...CONNECTOR_PACK_FAMILIES]).toEqual([
      'payments',
      'billing',
      'risk',
      'connect_marketplace',
      'payouts',
      'tax',
      'issuing',
      'financial_accounts',
      'crypto',
      'native_optimization',
    ]);
  });

  it('declares the four source-of-truth policies', () => {
    expect([...SOURCE_OF_TRUTH_POLICIES]).toEqual([
      'EXTERNAL_AUTHORITATIVE',
      'PAYSWAP_AUTHORITATIVE',
      'SHARED_WITH_VERSIONED_CONFLICT_RULE',
      'DERIVED_PROJECTION',
    ]);
  });
});

describe('hierarchical pack validation', () => {
  it('validates a multi-level pack tree', () => {
    const parsed = validateConnectorCapabilityPack(paymentsPack);
    expect(parsed.packId).toBe('pack:psp-a-payments');
    expect(parsed.subPacks).toHaveLength(4);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('rejects duplicate packIds anywhere in the tree', () => {
    expect(() =>
      validateConnectorCapabilityPack({
        ...paymentsPack,
        subPacks: [
          ...paymentsPack.subPacks,
          { ...leafPack('pack:psp-a-payments-capture', '9.9.9', 'conn:payments.capture') },
        ],
      }),
    ).toThrow(/duplicate packId 'pack:psp-a-payments-capture'/);
  });

  it('rejects an empty leaf (a node that exposes nothing)', () => {
    expect(() =>
      validateConnectorCapabilityPack({
        ...leafPack('pack:empty-leaf', '1.0.0', 'conn:payments.capture'),
        capabilityRefs: [],
      }),
    ).toThrow(/an empty leaf exposes nothing/);
  });

  it('rejects malformed object mappings and shared mappings without a conflict rule', () => {
    expect(() =>
      validateConnectorCapabilityPack({
        ...leafPack('pack:bad-mapping', '1.0.0', 'conn:payments.capture'),
        objectMappings: [
          {
            externalObjectType: 'PAYMENT_INTENT',
            canonicalObjectRef: 'work-graph/payment-intent',
          } as never,
        ],
      }),
    ).toThrow(/objectMappings\[0\]/);
    expect(() =>
      validateConnectorCapabilityPack({
        ...leafPack('pack:shared-mapping', '1.0.0', 'conn:payments.capture'),
        objectMappings: [
          {
            externalObjectType: 'PAYMENT_INTENT',
            canonicalObjectRef: 'work-graph/payment-intent',
            sourceOfTruth: 'SHARED_WITH_VERSIONED_CONFLICT_RULE',
          },
        ],
      }),
    ).toThrow(/conflictRuleRef is required/);
  });

  it('rejects malformed rate limits and provenance', () => {
    expect(() =>
      validateConnectorCapabilityPack({
        ...leafPack('pack:bad-limits', '1.0.0', 'conn:payments.capture'),
        rateLimits: [{ limit: 0, windowSeconds: 1, scope: 'x' }],
      }),
    ).toThrow(/rateLimits\[0\]/);
    expect(() =>
      validateConnectorCapabilityPack({
        ...leafPack('pack:bad-provenance', '1.0.0', 'conn:payments.capture'),
        provenance: { publisher: 'x' } as never,
      }),
    ).toThrow(/provenance/);
  });

  it('rejects an unknown family and a non-string version', () => {
    expect(() =>
      validateConnectorCapabilityPack({
        ...leafPack('pack:bad-family', '1.0.0', 'conn:payments.capture'),
        family: 'loyalty' as never,
      }),
    ).toThrow(/family must be one of/);
    expect(() =>
      validateConnectorCapabilityPack({
        ...leafPack('pack:bad-version', '1.0.0', 'conn:payments.capture'),
        version: '',
      }),
    ).toThrow(/version must be a non-empty string/);
  });

  it('rejects malformed auth declarations', () => {
    expect(() =>
      validateConnectorCapabilityPack({
        ...leafPack('pack:bad-auth', '1.0.0', 'conn:payments.capture'),
        auth: { authKind: 'PASSWORD', scopes: [] } as never,
      }),
    ).toThrow(/auth must be/);
  });
});

describe('pack tree helpers', () => {
  it('flattens capability refs in tree order (parent first)', () => {
    const refs = flattenPackCapabilityRefs(paymentsPack);
    expect(refs.map((ref) => ref.capabilityId)).toEqual([
      'conn:payments.list-methods',
      'conn:payments.create-authorization',
      'conn:payments.capture',
      'conn:payments.refund',
    ]);
  });

  it('finds sub-packs by id, depth-first', () => {
    const found = findSubPack(paymentsPack, 'pack:psp-a-payments-refund');
    expect(found?.version).toBe('3.2.0');
    expect(findSubPack(paymentsPack, 'pack:missing')).toBeUndefined();
  });

  it('leaf validation errors mention ValidationError', () => {
    try {
      validateConnectorCapabilityPack({ bogus: true } as never);
      expect.unreachable('must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
    }
  });
});
