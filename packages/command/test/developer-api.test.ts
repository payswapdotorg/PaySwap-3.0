import { describe, expect, it } from 'vitest';

import {
  validateDeveloperApi,
  describeDeveloperApi,
  projectExternalAgentApi,
} from '../src/developer-api.ts';
import { ValidationError } from '../src/errors.ts';
import { UnsupportedVersionError } from '../src/errors.ts';
import { sampleDeveloperApi, sampleMethodSet, omitField } from './fixtures.ts';
import { COMMAND_SURFACE_API_VERSION } from '../src/version.ts';
import type { MethodDescriptor } from '../src/method-registry.ts';

/** Loose override bag (capability-lane pattern). */
type MethodOverrides = { readonly [K in keyof MethodDescriptor]?: MethodDescriptor[K] };

function sampleMethodDescriptor(overrides?: MethodOverrides): MethodDescriptor {
  return {
    methodName: 'payments.intent.propose',
    description: 'Submit a payment intent proposal (a proposal, never authority).',
    inputSchema: Object.freeze({ type: 'object' }),
    outputSchema: Object.freeze({ type: 'object' }),
    effectClass: 'PROPOSAL',
    idempotencyRelevant: true,
    requiredPermission: 'COMMAND_PROPOSE',
    authSchemes: ['SESSION'],
    agentCallable: true,
    requiredAuthority: { domain: 'payments', actions: ['payments.intent.propose'] },
    ...overrides,
  };
}

function extrasMethod(): MethodDescriptor {
  return {
    ...omitField(omitField(sampleMethodDescriptor(), 'requiredPermission'), 'requiredAuthority'),
    methodName: 'zeta.surface.ping',
    description: 'A late-added read-only method.',
    effectClass: 'NO_EFFECT',
    idempotencyRelevant: false,
    agentCallable: false,
  };
}

describe('developer API validation (versioned, total-error, fail closed)', () => {
  it('accepts the fixture API (explicit version pin, unique methods, disclosure fields)', () => {
    expect(() => validateDeveloperApi(sampleDeveloperApi())).not.toThrow();
  });

  it('requires a title and an explicit supported apiVersion (no implicit default)', () => {
    expect(() => validateDeveloperApi({ ...sampleDeveloperApi(), title: '' })).toThrow(ValidationError);
    expect(() => validateDeveloperApi({ ...sampleDeveloperApi(), apiVersion: '9.9.9' })).toThrow(
      UnsupportedVersionError,
    );
    expect(() => validateDeveloperApi({ ...sampleDeveloperApi(), apiVersion: '' })).toThrow(
      UnsupportedVersionError,
    );
  });

  it('rejects duplicate method names (registry uniqueness is the API surface law)', () => {
    const api = {
      ...sampleDeveloperApi(),
      methods: [sampleMethodDescriptor(), sampleMethodDescriptor()],
    };
    expect(() => validateDeveloperApi(api)).toThrow(ValidationError);
  });
});

describe('explicit capability disclosure (deterministic)', () => {
  it('describes one capability block per domain, methods in sorted order', () => {
    const disclosure = describeDeveloperApi(sampleDeveloperApi());
    expect(disclosure.map((capability) => capability.capability)).toEqual([
      'observations.surface',
      'payments.surface',
      'quotes.surface',
    ]);
    const payments = disclosure.find((capability) => capability.capability === 'payments.surface');
    expect(payments?.methods).toEqual(['payments.intent.propose']);
    expect(disclosure.find((capability) => capability.capability === 'observations.surface')?.methods).toEqual([
      'observations.read',
    ]);
  });

  it('is pure: the same descriptor yields deep-equal disclosure, repeatedly', () => {
    const first = describeDeveloperApi(sampleDeveloperApi());
    const second = describeDeveloperApi(sampleDeveloperApi());
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('a changed descriptor changes the disclosure (no caching, no fabrication)', () => {
    const withExtra = {
      ...sampleDeveloperApi(),
      methods: [...sampleMethodSet(), extrasMethod()],
    };
    const disclosure = describeDeveloperApi(withExtra);
    expect(disclosure.map((capability) => capability.capability)).toContain('zeta.surface');
    expect(describeDeveloperApi(sampleDeveloperApi()).map((c) => c.capability)).not.toContain('zeta.surface');
  });
});

describe('the external-agent projection (never an unrestricted surface)', () => {
  it('projects ONLY agentCallable methods, each carrying its required authority declaration', () => {
    const view = projectExternalAgentApi(sampleDeveloperApi());
    expect(view.apiVersion).toBe(COMMAND_SURFACE_API_VERSION);
    expect(view.agentCallableMethods.map((method) => method.methodName)).toEqual([
      'observations.read',
      'payments.intent.propose',
    ]);
    expect(view.requiredAuthorityByMethod['payments.intent.propose']).toEqual({
      domain: 'payments',
      actions: ['payments.intent.propose'],
    });
    expect(view.requiredAuthorityByMethod['observations.read']).toEqual({
      domain: 'observations',
      actions: ['observations.read'],
    });
    // The read-only method is absent.
    expect(view.agentCallableMethods.map((m) => m.methodName)).not.toContain('quotes.read');
  });

  it('an agentCallable method without requiredAuthority fails the projection closed (INTERNAL, never silent)', () => {
    const api = {
      ...sampleDeveloperApi(),
      methods: [
        sampleMethodDescriptor({
          agentCallable: true,
          requiredAuthority: undefined as unknown as { domain: string; actions: string[] },
        }),
      ],
    };
    // validateDeveloperApi rejects it first (the registry law); constructing
    // the malformed descriptor around validation would require forging types —
    // so the projection-level guard is exercised via the cast here.
    expect(() => projectExternalAgentApi(api)).toThrow();
  });

  it('is deterministic: the same descriptor yields the deep-equal view', () => {
    expect(projectExternalAgentApi(sampleDeveloperApi())).toEqual(projectExternalAgentApi(sampleDeveloperApi()));
  });
});
