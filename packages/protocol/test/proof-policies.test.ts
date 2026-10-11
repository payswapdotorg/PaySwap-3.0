import { describe, expect, it } from 'vitest';
import {
  EUR,
  InsufficientProofError,
  PROOF_LEVELS,
  USD,
  ValidationError,
  defineProofPolicy,
  effectiveEvidenceLevel,
  isProofLevel,
  maxProofLevel,
  minProofLevel,
  proofLevelRank,
  proofSatisfaction,
  provenanceOverclaim,
  refundDisputeSymmetricLevels,
  requiredProofLevel,
  validateProofPolicy,
  type ProofPolicy,
} from '../src/index.ts';

const policy: ProofPolicy = defineProofPolicy({
  policyId: 'test-policy',
  currency: USD,
  baselineLevel: 'P1',
  highRiskThresholdMinorUnits: 1_000n,
  highRiskLevel: 'P3',
  railMinimums: { OFF_NETWORK_CHECK: 'P4' },
  counterpartyRiskMinimums: { UNVERIFIED: 'P3' },
});

describe('proof levels (ported from old proof-policies.test.ts)', () => {
  it('ranks the frozen vocabulary totally and deterministically', () => {
    expect(PROOF_LEVELS).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
    for (const [i, level] of PROOF_LEVELS.entries()) {
      expect(proofLevelRank(level)).toBe(i);
    }
    expect(maxProofLevel('P2', 'P4')).toBe('P4');
    expect(minProofLevel('P2', 'P4')).toBe('P2');
    expect(isProofLevel('P3')).toBe(true);
    expect(isProofLevel('P6')).toBe(false);
    expect(() => proofLevelRank('P9' as 'P0')).toThrow(ValidationError);
  });
});

describe('requiredProofLevel (risk-driven derivation)', () => {
  it('baseline applies below the high-risk threshold', () => {
    const { required, considered } = requiredProofLevel(policy, {
      direction: 'SETTLE',
      amount: { currency: USD, value: 999n } as never,
    });
    expect(required).toBe('P1');
    expect(considered).toEqual(['BASELINE:P1']);
  });

  it('the high-risk tier, rail minimums and counterparty minimums compose to the STRONGEST requirement', () => {
    const highRisk = requiredProofLevel(policy, {
      direction: 'SETTLE',
      amount: { currency: USD, value: 1_000n } as never,
    });
    expect(highRisk.required).toBe('P3');
    expect(highRisk.considered).toContain('HIGH_RISK_AMOUNT:P3');

    const offNetwork = requiredProofLevel(policy, {
      direction: 'SETTLE',
      amount: { currency: USD, value: 5n } as never,
      rail: 'OFF_NETWORK_CHECK',
    });
    expect(offNetwork.required).toBe('P4');

    const unverifiedHighRisk = requiredProofLevel(policy, {
      direction: 'SETTLE',
      amount: { currency: USD, value: 5_000n } as never,
      counterpartyRiskClass: 'UNVERIFIED',
    });
    expect(unverifiedHighRisk.required).toBe('P3');
    expect(unverifiedHighRisk.considered).toContain('COUNTERPARTY:UNVERIFIED:P3');
  });

  it('refuses to price risk in a different currency without an explicit FX policy (no silent FX)', () => {
    expect(() =>
      requiredProofLevel(policy, {
        direction: 'SETTLE',
        amount: { currency: EUR, value: 1n } as never,
      }),
    ).toThrow(ValidationError);
  });
});

describe('provenance capping (UI/browser artifacts never overclaim)', () => {
  it('an unauthenticated UI artifact caps at P0 no matter what it claims', () => {
    expect(
      effectiveEvidenceLevel({
        claimedLevel: 'P5',
        provenance: { source: 'UI_BROWSER_ARTIFACT', authenticated: false },
      }),
    ).toBe('P0');
  });

  it('an authenticated UI artifact caps at P1', () => {
    expect(
      effectiveEvidenceLevel({
        claimedLevel: 'P5',
        provenance: { source: 'UI_BROWSER_ARTIFACT', authenticated: true },
      }),
    ).toBe('P1');
  });

  it('every other provenance is believed at its claimed level; overclaim detection works', () => {
    expect(
      effectiveEvidenceLevel({
        claimedLevel: 'P4',
        provenance: { source: 'AUTHENTICATED_PROVIDER', providerName: 'wise' },
      }),
    ).toBe('P4');
    expect(
      provenanceOverclaim({
        claimedLevel: 'P5',
        provenance: { source: 'UI_BROWSER_ARTIFACT', authenticated: false },
      }),
    ).toBe(true);
    expect(
      provenanceOverclaim({
        claimedLevel: 'P0',
        provenance: { source: 'PROTOCOL_LEDGER' },
      }),
    ).toBe(false);
  });
});

describe('proofSatisfaction (measured, never upgraded by claims)', () => {
  it('the maximum effective level over the chain must meet the requirement', () => {
    const context = { direction: 'SETTLE' as const, amount: { currency: USD, value: 1n } as never };
    const satisfied = proofSatisfaction(policy, context, [
      { claimedLevel: 'P0', provenance: { source: 'PROTOCOL_LEDGER' } },
      { claimedLevel: 'P2', provenance: { source: 'AUTHENTICATED_PROVIDER', providerName: 'wise' } },
    ]);
    expect(satisfied.satisfied).toBe(true);
    expect(satisfied.achieved).toBe('P2');
    expect(satisfied.required).toBe('P1');
    expect(satisfied.gaps).toEqual([]);

    const insufficient = proofSatisfaction(policy, context, [
      { claimedLevel: 'P5', provenance: { source: 'UI_BROWSER_ARTIFACT', authenticated: false } },
    ]);
    expect(insufficient.satisfied).toBe(false);
    expect(insufficient.achieved).toBe('P0');
    expect(insufficient.gaps).toContain('REQUIRED_P1_ACHIEVED_P0');
  });

  it('no evidence presented is a typed gap', () => {
    const result = proofSatisfaction(policy, { direction: 'SETTLE', amount: { currency: USD, value: 1n } as never }, []);
    expect(result.satisfied).toBe(false);
    expect(result.gaps).toContain('NO_EVIDENCE_PRESENTED');
  });
});

describe('refund/dispute symmetry', () => {
  it('SETTLE, REFUND and DISPUTE of the same amount on the same rail require the same level', () => {
    const levels = refundDisputeSymmetricLevels(policy, {
      amount: { currency: USD, value: 5_000n } as never,
      rail: 'OFF_NETWORK_CHECK',
    });
    expect(levels.settle).toBe('P4');
    expect(levels.refund).toBe('P4');
    expect(levels.dispute).toBe('P4');
    expect(levels.symmetric).toBe(true);
  });
});

describe('policy validation', () => {
  it('validateProofPolicy rejects malformed policies', () => {
    expect(() =>
      validateProofPolicy({ ...policy, policyId: '' }),
    ).toThrow(ValidationError);
    expect(() => validateProofPolicy({ ...policy, currency: 'TOOLONG' as never })).toThrow(ValidationError);
    expect(() => validateProofPolicy({ ...policy, baselineLevel: 'P9' as 'P1' })).toThrow(ValidationError);
    expect(() => validateProofPolicy({ ...policy, highRiskThresholdMinorUnits: -1n })).toThrow(ValidationError);
    expect(() => validateProofPolicy({ ...policy, railMinimums: { '': 'P1' } })).toThrow(ValidationError);
  });

  it('InsufficientProofError carries the typed gap report', () => {
    const error = new InsufficientProofError('insufficient', {
      policyId: 'p',
      required: 'P3',
      achieved: 'P1',
      gaps: ['REQUIRED_P3_ACHIEVED_P1'],
    });
    expect(error.name).toBe('InsufficientProofError');
    expect(error.details?.['required']).toBe('P3');
  });
});
