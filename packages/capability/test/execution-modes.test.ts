import { describe, expect, it } from 'vitest';
import {
  EXECUTION_MODES,
  EXECUTION_MODE_CONTRACTS,
  EXECUTION_MODE_VOCABULARY_VERSION,
} from '../src/index.ts';
import {
  ImplicitExecutionModeError,
  isExecutionMode,
  validateExecutionRequest,
  validateDeclaredExecutionModes,
} from '../src/index.ts';
import type { ConnectorExecutionRequest, ProtocolAuthorizationRef } from '../src/index.ts';
import type { Equal, Expect } from './type-utils.ts';

/**
 * Execution modes (PORTED from old connectors execution-modes.test.ts +
 * NET-NEW versioned-contract and INV-15 laws). Every execution carries an
 * EXPLICIT mode; none of the modes bypasses protocol authorization,
 * policy, compliance, security, idempotency or evidence.
 */

const authorization: ProtocolAuthorizationRef = {
  commandId: 'cmd-0192-7f3a',
  principal: { principalType: 'user', principalId: 'user:merchant-1' },
  authorizationEvidenceRef: 'evidence:authz-1',
};

function request(
  overrides: Partial<ConnectorExecutionRequest> = {},
): ConnectorExecutionRequest {
  return {
    executionMode: 'PASS_THROUGH_NATIVE',
    modeVocabularyVersion: EXECUTION_MODE_VOCABULARY_VERSION,
    capabilityInstanceId: 'inst:acct-1-payments',
    providerRequest: { amount: { currency: 'EUR', minorUnits: '1000' } },
    idempotencyKey: 'idem-1',
    protocolAuthorization: authorization,
    ...overrides,
  };
}

describe('execution mode vocabulary (explicit, versioned)', () => {
  it('declares exactly the three explicit modes', () => {
    expect([...EXECUTION_MODES]).toEqual([
      'PASS_THROUGH_NATIVE',
      'COMPOSED_PAYSWAP',
      'OPTIMIZED_MULTI_PROVIDER',
    ]);
    type ModeCases = [
      Expect<
        Equal<
          (typeof EXECUTION_MODES)[number],
          'PASS_THROUGH_NATIVE' | 'COMPOSED_PAYSWAP' | 'OPTIMIZED_MULTI_PROVIDER'
        >
      >,
    ];
    const cases: ModeCases = [true];
    expect(cases).toEqual([true]);
  });

  it('guards mode values', () => {
    for (const mode of EXECUTION_MODES) {
      expect(isExecutionMode(mode)).toBe(true);
    }
    expect(isExecutionMode('pass_through_native')).toBe(false);
    expect(isExecutionMode('AUTOMATIC')).toBe(false);
    expect(isExecutionMode(undefined)).toBe(false);
    expect(isExecutionMode(42)).toBe(false);
  });

  it('publishes the versioned mode contracts with the pinned vocabulary version', () => {
    expect(EXECUTION_MODE_VOCABULARY_VERSION).toBe('1.0.0');
    expect(EXECUTION_MODE_CONTRACTS).toHaveLength(3);
    for (const contract of EXECUTION_MODE_CONTRACTS) {
      expect(contract.vocabularyVersion).toBe(EXECUTION_MODE_VOCABULARY_VERSION);
      expect(contract.semantics.length).toBeGreaterThan(0);
    }
    // PASS_THROUGH_NATIVE cites the INV-15 incumbent baseline discipline.
    expect(EXECUTION_MODE_CONTRACTS[0]?.semantics).toMatch(/INV-15/);
  });

  it('assigns NO priority ordering — contracts carry no rank or score (INV-15)', () => {
    for (const contract of EXECUTION_MODE_CONTRACTS) {
      const record = contract as unknown as Record<string, unknown>;
      expect(record['priority']).toBeUndefined();
      expect(record['rank']).toBeUndefined();
      expect(record['score']).toBeUndefined();
      expect(record['weight']).toBeUndefined();
    }
  });
});

describe('declared mode lists (on executable capabilities)', () => {
  it('validates a declared list with all three modes', () => {
    expect(validateDeclaredExecutionModes([...EXECUTION_MODES])).toEqual([...EXECUTION_MODES]);
  });

  it('accepts PASS_THROUGH_NATIVE ALONE (native-only capabilities are first-class)', () => {
    expect(validateDeclaredExecutionModes(['PASS_THROUGH_NATIVE'])).toEqual([
      'PASS_THROUGH_NATIVE',
    ]);
  });

  it('rejects empty, unknown and duplicate declarations', () => {
    expect(() => validateDeclaredExecutionModes([])).toThrow(/at least one explicit mode/);
    expect(() => validateDeclaredExecutionModes(['AUTO' as never])).toThrow(/unknown execution mode/);
    expect(() =>
      validateDeclaredExecutionModes(['COMPOSED_PAYSWAP', 'COMPOSED_PAYSWAP']),
    ).toThrow(/duplicate/);
    expect(() => validateDeclaredExecutionModes('PASS_THROUGH_NATIVE')).toThrow(/array/);
  });
});

describe('every execution requires an explicit mode + authorization link', () => {
  it('accepts each of the three modes when fully specified', () => {
    for (const mode of EXECUTION_MODES) {
      const result = validateExecutionRequest(request({ executionMode: mode }));
      expect(result).toEqual({ ok: true, mode });
    }
  });

  it('rejects a request with no mode at all', () => {
    const result = validateExecutionRequest({
      capabilityInstanceId: 'inst:acct-1-payments',
      modeVocabularyVersion: EXECUTION_MODE_VOCABULARY_VERSION,
      providerRequest: {},
      idempotencyKey: 'idem-1',
      protocolAuthorization: authorization,
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.join(' ')).toMatch(/executionMode is REQUIRED/);
    }
  });

  it('rejects an unknown mode string', () => {
    const result = validateExecutionRequest(request({ executionMode: 'AUTOMATIC' as never }));
    expect(result.ok).toBe(false);
  });

  it('rejects a stale mode vocabulary version (versioned contract law)', () => {
    const result = validateExecutionRequest(
      request({ modeVocabularyVersion: '0.9.0' as never }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.join(' ')).toMatch(/modeVocabularyVersion/);
    }
  });

  it('rejects a missing protocol authorization reference — no mode bypasses protocol authorization', () => {
    const { protocolAuthorization: _omitted, ...withoutAuthorization } = request();
    const result = validateExecutionRequest(withoutAuthorization);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.join(' ')).toMatch(/protocolAuthorization is required/);
    }
  });

  it('rejects a missing idempotency key and a missing instance reference (INV-13)', () => {
    const noKey = validateExecutionRequest({ ...request(), idempotencyKey: '' });
    expect(noKey.ok).toBe(false);
    const noInstance = validateExecutionRequest({ ...request(), capabilityInstanceId: '' });
    expect(noInstance.ok).toBe(false);
    if (!noInstance.ok) {
      expect(noInstance.violations.join(' ')).toMatch(/INV-13/);
    }
  });

  it('exposes an error type for implicit-mode executions', () => {
    const result = validateExecutionRequest({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(() => {
        throw new ImplicitExecutionModeError(result.violations);
      }).toThrow(/execution request is not valid/i);
    }
  });

  it('PASS_THROUGH_NATIVE violations cite that native is not an authority bypass', () => {
    const result = validateExecutionRequest({
      executionMode: 'PASS_THROUGH_NATIVE',
      modeVocabularyVersion: EXECUTION_MODE_VOCABULARY_VERSION,
      capabilityInstanceId: 'inst:acct-1-payments',
      providerRequest: {},
      idempotencyKey: 'idem-1',
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.join(' ')).toMatch(
        /no execution mode \(including PASS_THROUGH_NATIVE\) can bypass protocol authorization/,
      );
    }
  });
});
