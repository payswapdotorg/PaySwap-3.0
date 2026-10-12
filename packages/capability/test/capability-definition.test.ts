import { describe, expect, it } from 'vitest';
import {
  isFundingSourceClass,
  isCapabilityClass,
  isAcceptanceCapabilityDefinition,
  isExecutableCapabilityDefinition,
  isNonExecutableCapabilityDefinition,
  PROOF_LEVEL_PIN,
  validateCapabilityDefinition,
  defineCapability,
  ValidationError,
} from '../src/index.ts';
import type {
  AcceptanceCapabilityDefinition,
  CapabilityClass,
  CapabilityDefinition,
} from '../src/index.ts';
import type { Equal, Expect } from './type-utils.ts';
import {
  acceptanceDefinition,
  executableDefinition,
  nonExecutableDefinition,
} from './fixtures.ts';

/**
 * Layer-1 CapabilityDefinition (ADAPTED from old capabilities
 * capability.test.ts "FROZEN §11" semantics + NET-NEW discriminated-union
 * law). Acceptance is first-class and distinct from any funding source;
 * definitions are versioned catalogue data that never authorizes effects.
 */

describe('capability metadata (ported §11 semantics)', () => {
  it('carries conditions, cost, risk, provenance, accountability, proof and bond metadata', () => {
    const definition = validateCapabilityDefinition(executableDefinition());
    expect(definition.conditions.some((condition) => condition.hardConstraint)).toBe(true);
    expect(definition.cost[1]?.bps).toBe(8n);
    expect(definition.proofRequirements[0]?.proofLevel).toBe('P2');
    expect(definition.economicAccountability.accountablePartyRef).toBe('provider:bank-a');
    expect(definition.bondCollateralRecourse?.bondAmount.minorUnits).toBe('1000000');
    expect(definition.version).toBe('1.4.0');
  });

  it('validateCapabilityDefinition accepts the executable fixture and deep-freezes via defineCapability', () => {
    const stored = defineCapability(executableDefinition());
    expect(stored.id).toBe('cap:sepa-credit-transfer');
    expect(Object.isFrozen(stored)).toBe(true);
    // deep-frozen: nested metadata is frozen too
    expect(Object.isFrozen(stored.risk)).toBe(true);
  });

  it('rejects an unknown capability class and missing base metadata', () => {
    expect(() => validateCapabilityDefinition(executableDefinition({ capabilityClass: 'magic' }))).toThrow(
      ValidationError,
    );
    expect(() => validateCapabilityDefinition(executableDefinition({ version: '' }))).toThrow(
      /version must be a non-empty string/,
    );
    expect(() =>
      validateCapabilityDefinition({ ...executableDefinition(), provenance: undefined }),
    ).toThrow(/provenance/);
  });

  it('pins the proof-level VALUES byte-identical to the trust lane vocabulary', () => {
    expect([...PROOF_LEVEL_PIN]).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
    expect(() =>
      validateCapabilityDefinition(
        executableDefinition({ proofRequirements: [{ proofLevel: 'P9' } as never] }),
      ),
    ).toThrow(/proofLevel/);
  });
});

describe('executable/non-executable discriminated union law (net-new)', () => {
  it('an executable definition REQUIRES its fourteen-part declaration', () => {
    const noDeclaration = executableDefinition({ execution: undefined } as never);
    expect(() => validateCapabilityDefinition(noDeclaration)).toThrow(
      /fourteen-part execution declaration/,
    );
  });

  it('a non-executable definition REQUIRES an explicit reason (silent absence impossible)', () => {
    expect(() =>
      validateCapabilityDefinition({ ...nonExecutableDefinition(), nonExecutableReason: '' }),
    ).toThrow(/nonExecutableReason/);
    const informational = validateCapabilityDefinition(nonExecutableDefinition());
    expect(isNonExecutableCapabilityDefinition(informational)).toBe(true);
    expect(isExecutableCapabilityDefinition(informational)).toBe(false);
  });

  it('executable must be true or false — any other value is rejected', () => {
    expect(() =>
      validateCapabilityDefinition(executableDefinition({ executable: 'yes' as never })),
    ).toThrow(/executable must be true or false/);
  });

  it('merchant_acceptance definitions are non-executable by construction', () => {
    expect(() =>
      validateCapabilityDefinition({
        ...acceptanceDefinition(),
        executable: true,
        execution: undefined,
      }),
    ).toThrow(/non-executable by construction/);
  });

  it('narrowing guards separate the union members', () => {
    const executable = validateCapabilityDefinition(executableDefinition());
    expect(isExecutableCapabilityDefinition(executable)).toBe(true);
    expect(isNonExecutableCapabilityDefinition(executable)).toBe(false);
  });
});

describe('AcceptanceCapabilityDefinition is first-class and NOT a funding source (ported)', () => {
  const acceptance = validateCapabilityDefinition(
    acceptanceDefinition(),
  ) as AcceptanceCapabilityDefinition;

  it('is a CapabilityDefinition (shared metadata shape) with a fixed merchant_acceptance class', () => {
    const asDefinition: CapabilityDefinition = acceptance;
    expect(asDefinition.capabilityClass).toBe('merchant_acceptance');
    expect(acceptance.acceptedCurrencies).toEqual(['EUR']);
    expect(acceptance.terms.supportsRecurring).toBe(true);
    expect(isAcceptanceCapabilityDefinition(acceptance)).toBe(true);
  });

  it('merchant acceptance is not a funding-source class', () => {
    expect(isFundingSourceClass('merchant_acceptance')).toBe(false);
    expect(isFundingSourceClass('liquidity')).toBe(true);
    expect(isFundingSourceClass('credit')).toBe(true);
    expect(isFundingSourceClass('lending')).toBe(true);
    expect(isFundingSourceClass('rail_movement')).toBe(false);
  });

  it('funding classes and the acceptance class are disjoint sets', () => {
    const funding: readonly CapabilityClass[] = ['liquidity', 'credit', 'lending'];
    expect(funding).not.toContain('merchant_acceptance');
  });

  it('acceptance validation requires the acceptance-specific fields', () => {
    expect(() =>
      validateCapabilityDefinition({ ...acceptanceDefinition(), acceptedCurrencies: [] }),
    ).toThrow(/non-empty acceptedCurrencies/);
    expect(() =>
      validateCapabilityDefinition({ ...acceptanceDefinition(), terms: undefined }),
    ).toThrow(/terms/);
  });

  it('isCapabilityClass guards the class vocabulary', () => {
    expect(isCapabilityClass('fx')).toBe(true);
    expect(isCapabilityClass('FX')).toBe(false);
    expect(isCapabilityClass('ledger_write')).toBe(false);
  });
});

// Type-level guarantees (enforced by `tsc --noEmit`):
type _acceptanceIsDefinition = AcceptanceCapabilityDefinition extends CapabilityDefinition
  ? true
  : false;
type _assert1 = Expect<Equal<_acceptanceIsDefinition, true>>;
type _acceptanceClass = AcceptanceCapabilityDefinition['capabilityClass'];
type _assert2 = Expect<Equal<_acceptanceClass, 'merchant_acceptance'>>;
type _fundingClasses = Extract<CapabilityClass, 'liquidity' | 'credit' | 'lending'>;
type _assert3 = Expect<Equal<_fundingClasses, 'liquidity' | 'credit' | 'lending'>>;
type _acceptanceNotFunding = 'merchant_acceptance' extends _fundingClasses ? true : false;
type _assert4 = Expect<Equal<_acceptanceNotFunding, false>>;
