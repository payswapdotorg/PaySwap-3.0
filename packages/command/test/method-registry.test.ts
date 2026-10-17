import { describe, expect, it } from 'vitest';

import {
  METHOD_EFFECT_CLASSES,
  validateMethodDescriptor,
  buildMethodRegistry,
  requireMethod,
  describeRegistryMethods,
} from '../src/method-registry.ts';
import { ValidationError, UnsupportedVersionError } from '../src/errors.ts';
import { COMMAND_SURFACE_API_VERSION } from '../src/version.ts';
import { sampleMethodDescriptor, sampleMethodSet, omitField } from './fixtures.ts';
import type { MethodDescriptor } from '../src/method-registry.ts';

describe('THE effect-class vocabulary (the no-financial-authority law)', () => {
  it('is exactly NO_EFFECT | OBSERVATION | PROPOSAL — there is NO financial-execute member', () => {
    expect([...METHOD_EFFECT_CLASSES]).toEqual(['NO_EFFECT', 'OBSERVATION', 'PROPOSAL']);
    for (const member of METHOD_EFFECT_CLASSES) {
      expect(member).not.toMatch(/EXECUTE|SIGN|SETTLE|WITHDRAW|CAPTURE|TRANSFER|REFUND/i);
    }
  });

  it('a foreign effectClass string is rejected fail closed (a method cannot express money execution)', () => {
    expect(() =>
      validateMethodDescriptor(
        sampleMethodDescriptor({
          effectClass: 'FINANCIAL_EXECUTE' as unknown as 'PROPOSAL',
        }),
      ),
    ).toThrow(ValidationError);
  });
});

describe('method descriptor validation laws (fail closed)', () => {
  it('rejects malformed method names (dotted lowercase paths only)', () => {
    expect(() => validateMethodDescriptor(sampleMethodDescriptor({ methodName: 'Payments' }))).toThrow(
      ValidationError,
    );
    expect(() => validateMethodDescriptor(sampleMethodDescriptor({ methodName: 'bare' }))).toThrow(
      ValidationError,
    );
  });

  it('requires a description and non-empty schemas (capability disclosure)', () => {
    expect(() => validateMethodDescriptor(sampleMethodDescriptor({ description: '' }))).toThrow(ValidationError);
    expect(() =>
      validateMethodDescriptor(sampleMethodDescriptor({ inputSchema: {} as never })),
    ).toThrow(ValidationError);
  });

  it('INV-6 discipline: effect-bearing methods MUST declare idempotencyRelevant', () => {
    expect(() =>
      validateMethodDescriptor(sampleMethodDescriptor({ idempotencyRelevant: false })),
    ).toThrow(ValidationError);
    expect(() =>
      validateMethodDescriptor(
        sampleMethodDescriptor({
          effectClass: 'OBSERVATION',
          requiredPermission: 'OBSERVATION_READ',
          idempotencyRelevant: false,
        }),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateMethodDescriptor(sampleMethodDescriptor({ effectClass: 'NO_EFFECT', idempotencyRelevant: false })),
    ).not.toThrow();
  });

  it('effect-bearing methods MUST declare a required permission from the vocabulary (no ambient authority)', () => {
    const noPermission = omitField(sampleMethodDescriptor(), 'requiredPermission');
    expect(() => validateMethodDescriptor(noPermission as MethodDescriptor)).toThrow(ValidationError);
    expect(() =>
      validateMethodDescriptor(
        sampleMethodDescriptor({ requiredPermission: 'MONEY_EXECUTE' as unknown as 'COMMAND_PROPOSE' }),
      ),
    ).toThrow(ValidationError);
  });

  it('agentCallable methods MUST declare requiredAuthority (never an unrestricted agent tool)', () => {
    const noAuthority = omitField(sampleMethodDescriptor(), 'requiredAuthority');
    expect(() => validateMethodDescriptor(noAuthority as MethodDescriptor)).toThrow(ValidationError);
    const notAgentCallable = omitField(
      sampleMethodDescriptor({ agentCallable: false }),
      'requiredAuthority',
    );
    expect(() => validateMethodDescriptor(notAgentCallable as MethodDescriptor)).not.toThrow();
  });

  it('auth schemes are required (at least one)', () => {
    expect(() => validateMethodDescriptor(sampleMethodDescriptor({ authSchemes: [] }))).toThrow(ValidationError);
  });
});

describe('the deterministic command method registry', () => {
  it('builds a frozen registry with sorted method names and pinned api version', () => {
    const registry = buildMethodRegistry(sampleMethodSet(), { apiVersion: COMMAND_SURFACE_API_VERSION });
    expect(registry.methodNames).toEqual(['observations.read', 'payments.intent.propose', 'quotes.read']);
    expect(registry.apiVersion).toBe(COMMAND_SURFACE_API_VERSION);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(registry.lookup('payments.intent.propose')?.effectClass).toBe('PROPOSAL');
    expect(registry.lookup('nope')).toBeUndefined();
  });

  it('rejects duplicate method names and unsupported api versions (fail closed)', () => {
    expect(() =>
      buildMethodRegistry([sampleMethodDescriptor(), sampleMethodDescriptor()], {
        apiVersion: COMMAND_SURFACE_API_VERSION,
      }),
    ).toThrow(ValidationError);
    expect(() => buildMethodRegistry(sampleMethodSet(), { apiVersion: '0.9.0' })).toThrow(
      UnsupportedVersionError,
    );
  });

  it('requireMethod fails closed with MethodNotFoundError (never a silent null dispatch)', () => {
    const registry = buildMethodRegistry(sampleMethodSet(), { apiVersion: COMMAND_SURFACE_API_VERSION });
    expect(requireMethod(registry, 'payments.intent.propose').methodName).toBe('payments.intent.propose');
    try {
      requireMethod(registry, 'settlements.execute');
      throw new Error('expected MethodNotFoundError');
    } catch (error) {
      const commandError = error as { code?: string; category?: string };
      expect(commandError.code).toBe('METHOD_NOT_FOUND');
      expect(commandError.category).toBe('NOT_FOUND');
    }
  });

  it('describeRegistryMethods is the deterministic disclosure (sorted, deep-equal on repeat)', () => {
    const registry = buildMethodRegistry(sampleMethodSet(), { apiVersion: COMMAND_SURFACE_API_VERSION });
    const disclosure = describeRegistryMethods(registry);
    expect(disclosure.map((entry) => entry.methodName)).toEqual([
      'observations.read',
      'payments.intent.propose',
      'quotes.read',
    ]);
    expect(disclosure.map((entry) => entry.effectClass)).toEqual(['OBSERVATION', 'PROPOSAL', 'NO_EFFECT']);
    expect(describeRegistryMethods(registry)).toEqual(disclosure);
  });
});
