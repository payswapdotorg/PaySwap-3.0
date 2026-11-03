import { describe, expect, it } from 'vitest';
import {
  NODE_OFFER_ADMISSION_VERSION,
  NODE_OFFER_REFUSAL_CODES,
  admitNodeOffer,
} from '../src/index.ts';
import { ValidationError } from '../src/index.ts';
import type { VerifiedNodeOfferWire } from '../src/index.ts';
import { connectedInstance, healthyObservation } from './fixtures.ts';

/** A VERIFIED offer wire fixture (the structural mirror of node-network's output). */
function verifiedWire(overrides: Record<string, unknown> = {}): VerifiedNodeOfferWire {
  return {
    offerId: 'offer:test-gh-kes-1',
    nodeId: 'node:gh-router-1',
    boundInstanceIds: ['inst:acct-1-payments'],
    custodyRole: 'TECHNICAL_ROUTER',
    constraints: {
      sourceCountries: ['GH'],
      destinationCountries: ['KE'],
      currencies: ['GHS', 'KES'],
      purposes: ['GENUINE_COMMERCE'],
    },
    verification: {
      verdict: 'VERIFIED',
      verifiedAt: '2026-11-03T12:00:00Z',
      nodeEnrollmentMode: 'OPERATOR_ENROLLED',
    },
    ...overrides,
  } as VerifiedNodeOfferWire;
}

describe('the node-offer chain (ADR-0020 D5 — the INV-13 seam; §6: provider-evidenced is decisive)', () => {
  it('admits a verified offer over a fully ACTIVE local chain as a CANDIDATE FACT — never an entitlement', () => {
    const admission = admitNodeOffer({
      offer: verifiedWire(),
      instance: connectedInstance(),
      observation: healthyObservation(),
    });
    expect(admission.admitted).toBe(true);
    if (admission.admitted) {
      expect(admission.fact.discoveryTier).toBe('CANDIDATE_FACT');
      expect(admission.fact.isEntitlement).toBe(false);
      expect(admission.fact.admitsExecution).toBe(false);
      expect(admission.fact.factVersion).toBe(NODE_OFFER_ADMISSION_VERSION);
      expect(admission.fact.revalidationEvidence.instanceAuthorization).toBe('ACTIVE');
      expect(admission.fact.revalidationEvidence.effectiveAvailability).toBe('AVAILABLE');
      expect(admission.fact.lineage.observationVersion).toBe(1);
      expect(admission.fact.instanceId).toBe('inst:acct-1-payments');
      expect(admission.fact.constraints.purposes).toEqual(['GENUINE_COMMERCE']);
      expect(Object.isFrozen(admission.fact)).toBe(true);
    }
  });

  it('a non-VERIFIED offer admits NOTHING (signed and fresh is necessary — D5)', () => {
    const admission = admitNodeOffer({
      offer: verifiedWire({
        verification: {
          verdict: 'SIGNATURE_INVALID' as unknown as 'VERIFIED',
          verifiedAt: '2026-11-03T12:00:00Z',
          nodeEnrollmentMode: 'OPERATOR_ENROLLED',
        },
      }),
      instance: connectedInstance(),
      observation: healthyObservation(),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toContain('OFFER_NOT_VERIFIED');
    }
  });

  it('a FIXTURE node offer admits NOTHING (the D11 gate at the chain)', () => {
    const admission = admitNodeOffer({
      offer: verifiedWire({
        verification: {
          verdict: 'VERIFIED',
          verifiedAt: '2026-11-03T12:00:00Z',
          nodeEnrollmentMode: 'FIXTURE',
        },
      }),
      instance: connectedInstance(),
      observation: healthyObservation(),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toContain('OFFER_FIXTURE_NODE');
    }
  });

  it('an offer bound to a DIFFERENT instance does not complete the chain', () => {
    const admission = admitNodeOffer({
      offer: verifiedWire({ boundInstanceIds: ['inst:somebody-else'] }),
      instance: connectedInstance(),
      observation: healthyObservation(),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toContain('OFFER_INSTANCE_NOT_BOUND');
    }
  });

  it('provider evidence is DECISIVE: a non-ACTIVE local authorization refuses admission (INV-13)', () => {
    for (const status of ['PENDING', 'REVOKED', 'EXPIRED', 'UNKNOWN'] as const) {
      const admission = admitNodeOffer({
        offer: verifiedWire(),
        instance: connectedInstance({
          authorization: { status, grantedAt: '2026-09-01T00:00:00Z' },
        }),
        observation: healthyObservation(),
      });
      expect(admission.admitted).toBe(false);
      if (!admission.admitted) {
        expect(admission.refusals.map((refusal) => refusal.code)).toContain('INSTANCE_NOT_ACTIVE');
      }
    }
  });

  it('provider evidence is DECISIVE: a not-eligible local instance refuses admission', () => {
    const admission = admitNodeOffer({
      offer: verifiedWire(),
      instance: connectedInstance({
        eligibility: { eligible: false, reasons: ['account restricted for payouts'] },
      }),
      observation: healthyObservation(),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toContain('INSTANCE_NOT_ELIGIBLE');
      expect(admission.refusals[0]!.message).toContain('account restricted for payouts');
    }
  });

  it('a non-AVAILABLE observation refuses admission (UNKNOWN is never success)', () => {
    for (const availability of ['DEGRADED', 'UNAVAILABLE', 'UNKNOWN'] as const) {
      const admission = admitNodeOffer({
        offer: verifiedWire(),
        instance: connectedInstance(),
        observation: healthyObservation({ availability }),
      });
      expect(admission.admitted).toBe(false);
      if (!admission.admitted) {
        expect(admission.refusals.map((refusal) => refusal.code)).toContain(
          'OBSERVATION_NOT_AVAILABLE',
        );
      }
    }
  });

  it('a NOT_ELIGIBLE/UNKNOWN observation eligibility refuses admission', () => {
    for (const eligibility of ['NOT_ELIGIBLE', 'UNKNOWN'] as const) {
      const admission = admitNodeOffer({
        offer: verifiedWire(),
        instance: connectedInstance(),
        observation: healthyObservation({ eligibility }),
      });
      expect(admission.admitted).toBe(false);
      if (!admission.admitted) {
        expect(admission.refusals.map((refusal) => refusal.code)).toContain(
          'OBSERVATION_ELIGIBILITY_UNKNOWN',
        );
      }
    }
  });

  it('an observation from ANOTHER instance refuses admission (chain completeness)', () => {
    const admission = admitNodeOffer({
      offer: verifiedWire(),
      instance: connectedInstance(),
      observation: healthyObservation({ instanceId: 'inst:acct-2-payments' }),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toContain(
        'OBSERVATION_INSTANCE_MISMATCH',
      );
    }
  });

  it('EVERY failed gate is retained (never just the first)', () => {
    const admission = admitNodeOffer({
      offer: verifiedWire({
        verification: {
          verdict: 'VERIFIED',
          verifiedAt: '2026-11-03T12:00:00Z',
          nodeEnrollmentMode: 'FIXTURE',
        },
        boundInstanceIds: ['inst:elsewhere'],
      }),
      instance: connectedInstance({
        authorization: { status: 'REVOKED', grantedAt: '2026-09-01T00:00:00Z' },
      }),
      observation: healthyObservation({ availability: 'UNAVAILABLE' }),
    });
    expect(admission.admitted).toBe(false);
    if (!admission.admitted) {
      expect(admission.refusals.map((refusal) => refusal.code)).toEqual([
        'OFFER_FIXTURE_NODE',
        'OFFER_INSTANCE_NOT_BOUND',
        'INSTANCE_NOT_ACTIVE',
        'OBSERVATION_NOT_AVAILABLE',
      ]);
    }
  });

  it('a malformed wire is a typed ValidationError (never a silent admission)', () => {
    expect(() =>
      admitNodeOffer({ offer: { nonsense: true }, instance: connectedInstance(), observation: healthyObservation() }),
    ).toThrow(ValidationError);
    expect(() =>
      admitNodeOffer({ offer: null, instance: connectedInstance(), observation: healthyObservation() }),
    ).toThrow(ValidationError);
    expect([...NODE_OFFER_REFUSAL_CODES]).toHaveLength(8);
  });
});
