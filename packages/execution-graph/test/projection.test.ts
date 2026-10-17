import { describe, expect, it } from 'vitest';
import {
  AuthorizationProjectionIndex,
  ProjectionNotCurrentError,
  ProjectionRejectedError,
  validateAdapterExecutionAuthority,
  materialTermsDigest,
  diffMaterialTerms,
  changeAffectsTerms,
} from '../src/index.ts';
import type {
  AdapterExecutionAuthority,
  AuthorizationProjection,
  AuthorizationProjectionVerification,
  FinancialProtocolWriteAuthority,
} from '../src/index.ts';
import type { Equal, Expect } from './type-utils.js';
import { AGENT, AUTHORIZATION_REF, makeMaterialTerms, NOW, PIN_V1, PRINCIPAL } from './fixtures.ts';

/**
 * Authorization PROJECTION (P3-W2, ENCODED LAW 2; ADAPT of
 * payswap.org@8a735bf packages/execution/test/authorization.test.ts,
 * W3-003 — 4 tests ported/adapted + 4 net-new LAW 2 tests). The 3.0
 * re-authorization: the index PROJECTS protocol-owned authorization, never
 * issues it (canAuthorizeFinancialEffects is the structural false).
 */
function index(): AuthorizationProjectionIndex {
  return new AuthorizationProjectionIndex();
}

function project(ix: AuthorizationProjectionIndex, id = 'proj_1'): AuthorizationProjection {
  return ix.projectAuthorization({
    projectionId: id,
    authorization: AUTHORIZATION_REF,
    materialTerms: makeMaterialTerms(),
    requestHash: 'req_hash_1',
    validUntil: NOW + 60_000n,
    projectedAt: NOW,
    principalForApproval: PRINCIPAL,
  });
}

describe('Authorization projection (P3-W2, LAW 2)', () => {
  it('records a projection of a protocol authorization with lineage (INV-05) — and grants NOTHING', () => {
    const ix = index();
    const projection = project(ix);
    expect(projection.principal.principalId).toBe('user_1');
    expect(projection.termsDigest).toBe(materialTermsDigest(makeMaterialTerms()));
    // THE IDENTITY LAW: a projection is structurally NOT an authority.
    expect(projection.canAuthorizeFinancialEffects).toBe(false);
    type NotAuthority = Expect<
      Equal<AuthorizationProjection['canAuthorizeFinancialEffects'], false>
    >;
    void ({} as NotAuthority | void);

    const verification = ix.verify('proj_1', { now: NOW + 1n, requestHash: 'req_hash_1' });
    expect(verification.ok).toBe(true);
  });

  it('fails closed: unknown, expired, unbound and out-of-scope projections never vouch', () => {
    const ix = index();
    project(ix);

    const reasonOf = (verification: AuthorizationProjectionVerification): string =>
      verification.ok ? 'OK' : (verification.reason ?? verification.status);

    expect(reasonOf(ix.verify('missing', { now: NOW }))).toBe('UNKNOWN_PROJECTION');
    expect(reasonOf(ix.verify('proj_1', { now: NOW + 61_000n }))).toBe('EXPIRED');
    expect(reasonOf(ix.verify('proj_1', { now: NOW + 1n, requestHash: 'other' }))).toBe(
      'REQUEST_HASH_MISMATCH',
    );
    expect(
      reasonOf(ix.verify('proj_1', { now: NOW + 1n, capabilityInstanceId: 'inst-other' })),
    ).toBe('INSTANCE_NOT_IN_SCOPE');
    expect(
      reasonOf(
        ix.verify('proj_1', {
          now: NOW + 1n,
          executionMode: 'PASS_THROUGH_NATIVE',
        }),
      ),
    ).toBe('MODE_NOT_IN_SCOPE');
  });

  it('approval lineage: the projection cannot outlive or diverge from the approval it cites', () => {
    const ix = index();
    const artifact = {
      artifactId: 'approval_1',
      principal: PRINCIPAL,
      agent: AGENT,
      expiresAt: NOW + 120_000n,
      requestHash: 'req_hash_1',
      signatureRef: 'signature:1',
    };
    const projection = ix.projectAuthorization({
      projectionId: 'proj_2',
      authorization: AUTHORIZATION_REF,
      materialTerms: makeMaterialTerms(),
      requestHash: 'req_hash_1',
      validUntil: NOW + 60_000n,
      projectedAt: NOW,
      principalForApproval: AGENT,
      approvalArtifact: artifact,
    });
    expect(projection.approvalArtifact?.agent.principalId).toBe('agent_1');
    expect(projection.approvalArtifact?.requestHash).toBe('req_hash_1');

    // A projection that outlives its approval is rejected.
    expect(() =>
      ix.projectAuthorization({
        projectionId: 'proj_3',
        authorization: AUTHORIZATION_REF,
        materialTerms: makeMaterialTerms(),
        requestHash: 'req_hash_1',
        validUntil: NOW + 300_000n,
        projectedAt: NOW,
        principalForApproval: PRINCIPAL,
        approvalArtifact: artifact,
      }),
    ).toThrow(ProjectionRejectedError);

    // A request-hash mismatch between artifact and projection is rejected.
    expect(() =>
      ix.projectAuthorization({
        projectionId: 'proj_4',
        authorization: AUTHORIZATION_REF,
        materialTerms: makeMaterialTerms(),
        requestHash: 'req_hash_DIFFERENT',
        validUntil: NOW + 60_000n,
        projectedAt: NOW,
        principalForApproval: PRINCIPAL,
        approvalArtifact: artifact,
      }),
    ).toThrow(/not bound to what was approved/);

    // A principal who is not a party to the approval is rejected.
    expect(() =>
      ix.projectAuthorization({
        projectionId: 'proj_5',
        authorization: AUTHORIZATION_REF,
        materialTerms: makeMaterialTerms(),
        requestHash: 'req_hash_1',
        validUntil: NOW + 60_000n,
        projectedAt: NOW,
        principalForApproval: { principalType: 'user', principalId: 'stranger' },
        approvalArtifact: artifact,
      }),
    ).toThrow(/party to the approval/);
  });

  it('adapters NEVER receive financial write authority (runtime + type level)', () => {
    const ix = index();
    project(ix, 'proj_adapter');
    const adapterAuthority = ix.attenuateForAdapter('proj_adapter', NOW + 1n);
    expect(adapterAuthority.authorityKind).toBe('ADAPTER_EXECUTION_ONLY');
    expect(adapterAuthority.canWriteFinancialState).toBe(false);

    // TYPE-LEVEL: the adapter authority is not assignable to the financial
    // write authority marker — `canWriteFinancialState: false` blocks it.
    type NotFinancial = Expect<
      Equal<AdapterExecutionAuthority['canWriteFinancialState'], false>
    >;
    type AssertNotAssignable = Expect<
      Equal<AdapterExecutionAuthority extends FinancialProtocolWriteAuthority ? true : false, false>
    >;
    void ({} as NotFinancial | AssertNotAssignable | void);

    // RUNTIME: an adapter authority claiming financial write is rejected.
    expect(() =>
      validateAdapterExecutionAuthority({
        authorityKind: 'ADAPTER_EXECUTION_ONLY',
        canWriteFinancialState: true,
        projection: adapterAuthority.projection,
      }),
    ).toThrow(ProjectionRejectedError);
    expect(() => ix.attenuateForAdapter('missing', NOW)).toThrow(ProjectionNotCurrentError);
  });

  it('LAW 2: a material change on a covered axis is detected deterministically', () => {
    const before = makeMaterialTerms();
    const after = makeMaterialTerms({ amountMinor: 20_000n });
    const change = diffMaterialTerms(before, after, NOW + 1n);
    expect([...change.changedAxes]).toEqual(['AMOUNT']);
    expect(changeAffectsTerms(change, before)).toBe(true);

    // An unrelated new coverage is NOT a change of the old terms.
    const extended = makeMaterialTerms({ quoteRefs: ['QUOTE@9:other'] });
    const change2 = diffMaterialTerms(before, extended, NOW + 1n);
    expect([...change2.changedAxes]).toEqual(['QUOTE']);
    expect(change2.after['QUOTE']).not.toBe(change2.before['QUOTE']);

    // A change on an axis the projection does NOT cover does not affect it.
    const uncovered = makeMaterialTerms({
      route: undefined,
      destinationId: undefined,
      asset: undefined,
      amountMinor: undefined,
      riskEpochRef: undefined,
      observationPins: undefined,
      quoteRefs: ['QUOTE@3:quote:provider-1:rate-card'],
    });
    const change3 = diffMaterialTerms(uncovered, makeMaterialTerms({ amountMinor: 5n }), NOW);
    expect(changeAffectsTerms(change3, uncovered)).toBe(false);
  });

  it('LAW 2: material term changes INVALIDATE affected projections — terminal, never CURRENT again', () => {
    const ix = index();
    project(ix, 'proj_amount');
    // A projection covering ONLY the quote axis: an amount change must not
    // affect it, because it covers no amount.
    const quoteOnly = makeMaterialTerms({
      route: undefined,
      destinationId: undefined,
      asset: undefined,
      amountMinor: undefined,
      riskEpochRef: undefined,
      observationPins: undefined,
      quoteRefs: ['QUOTE@3:quote:provider-1:rate-card'],
    });
    ix.projectAuthorization({
      projectionId: 'proj_quote_only',
      authorization: AUTHORIZATION_REF,
      materialTerms: quoteOnly,
      requestHash: 'req_hash_1',
      validUntil: NOW + 60_000n,
      projectedAt: NOW,
    });

    // Invalidate on an AMOUNT change: proj_amount dies, proj_quote_only survives.
    const invalidations = ix.invalidateAffectedProjections({
      changedAxes: ['AMOUNT'],
      currentTerms: makeMaterialTerms({ amountMinor: 999n }),
      now: NOW + 2n,
    });
    expect(invalidations.map((entry) => entry.projectionId)).toEqual(['proj_amount']);
    expect([...(invalidations[0]?.reasonAxes ?? [])]).toEqual(['AMOUNT']);

    // The invalidated projection is TERMINAL: it can never verify CURRENT again.
    const invalidated = ix.verify('proj_amount', { now: NOW + 3n, requestHash: 'req_hash_1' });
    expect(invalidated.ok).toBe(false);
    if (!invalidated.ok) {
      expect(invalidated.status).toBe('INVALIDATED');
      expect(invalidated.message).toContain('LAW 2');
    }
    // The untouched projection still verifies.
    expect(ix.verify('proj_quote_only', { now: NOW + 3n }).ok).toBe(true);

    // Re-invalidating the dead projection is a no-op (terminal history).
    const again = ix.invalidateAffectedProjections({
      changedAxes: ['AMOUNT'],
      currentTerms: makeMaterialTerms({ amountMinor: 1n }),
      now: NOW + 4n,
    });
    expect(again).toEqual([]);
  });

  it('LAW 2 seam: a NEWER observation version makes the projection stale (LAW 1 linkage)', () => {
    const ix = index();
    project(ix, 'proj_obs');
    const fresh = ix.verify('proj_obs', {
      now: NOW + 1n,
      latestObservationVersions: [{ instanceId: PIN_V1.instanceId, observationVersion: 1 }],
    });
    expect(fresh.ok).toBe(true); // same version: not stale
    const stale = ix.verify('proj_obs', {
      now: NOW + 1n,
      latestObservationVersions: [{ instanceId: PIN_V1.instanceId, observationVersion: 2 }],
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.reason).toBe('OBSERVATION_PIN_MISMATCH');
      expect(stale.message).toContain('CAPABILITY_OBSERVATIONS');
    }
  });

  it('LAW 2: diff-driven invalidation and re-projection discipline', () => {
    const ix = index();
    project(ix, 'proj_route');
    const change = diffMaterialTerms(
      makeMaterialTerms(),
      makeMaterialTerms({ route: ['cap.other.collect'] }),
      NOW + 5n,
    );
    const invalidations = ix.invalidateByChange(change, makeMaterialTerms({ route: ['cap.other.collect'] }));
    expect(invalidations).toHaveLength(1);
    expect([...(invalidations[0]?.reasonAxes ?? [])]).toEqual(['ROUTE']);

    // A refreshed authorization is a NEW projection with a NEW id; the old
    // id remains invalid forever.
    const refreshed = ix.projectAuthorization({
      projectionId: 'proj_route_v2',
      authorization: AUTHORIZATION_REF,
      materialTerms: makeMaterialTerms({ route: ['cap.other.collect'] }),
      requestHash: 'req_hash_1',
      validUntil: NOW + 60_000n,
      projectedAt: NOW + 6n,
    });
    expect(refreshed.projectionId).toBe('proj_route_v2');
    expect(ix.verify('proj_route_v2', { now: NOW + 7n }).ok).toBe(true);
    expect(ix.verify('proj_route', { now: NOW + 7n }).ok).toBe(false);
  });
});
