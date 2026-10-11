import { describe, expect, it } from 'vitest';
import {
  CONNECTION_LIFECYCLE_STATES,
  InMemoryConnectionRegistry,
  TERMINAL_CONNECTION_STATES,
  isLawfulTransition,
  isTerminalConnectionState,
  lifecycleAdmitsOperation,
} from '../src/connection-lifecycle.ts';
import { freezeConnectionScope, EFFECT_CLASSES, OPERATION_CLASSES } from '../src/connection-scope.ts';
import { ValidationError } from '../src/errors.ts';

const now = 5_000_000n;
const cap = {
  definitionId: 'cap.test.transfer',
  implementationId: 'impl.test.1',
  version: '1.0.0',
};
const baseScope = freezeConnectionScope({
  allowedOperations: ['READ_PROVIDER_STATE', 'CREATE_EXTERNAL_EFFECT'],
  allowedEffectClasses: ['NONE', 'STATE_CHANGING'],
  scopedCapabilities: [cap],
});

describe('connection lifecycle', () => {
  it('the canonical state list and terminal set are frozen data', () => {
    expect(CONNECTION_LIFECYCLE_STATES).toHaveLength(8);
    expect([...TERMINAL_CONNECTION_STATES]).toEqual(['EXPIRED', 'REVOKED', 'DISCONNECTED']);
    expect(isTerminalConnectionState('DISCONNECTED')).toBe(true);
    expect(isTerminalConnectionState('ACTIVE')).toBe(false);
  });

  it('the lawful transition table admits the happy path and refuses invented edges', () => {
    expect(isLawfulTransition('PROPOSED', 'PENDING_VERIFICATION')).toBe(true);
    expect(isLawfulTransition('PENDING_VERIFICATION', 'ACTIVE')).toBe(true);
    expect(isLawfulTransition('ACTIVE', 'DEGRADED')).toBe(true);
    expect(isLawfulTransition('DEGRADED', 'ACTIVE')).toBe(true);
    expect(isLawfulTransition('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(isLawfulTransition('ACTIVE', 'REVOKED')).toBe(true);
    expect(isLawfulTransition('PROPOSED', 'ACTIVE')).toBe(false);
    expect(isLawfulTransition('DISCONNECTED', 'ACTIVE')).toBe(false);
    expect(isLawfulTransition('REVOKED', 'ACTIVE')).toBe(false);
    expect(isLawfulTransition('EXPIRED', 'ACTIVE')).toBe(false);
  });

  it('lifecycle admission: only ACTIVE (all) and DEGRADED (read/management only)', () => {
    expect(lifecycleAdmitsOperation('ACTIVE', 'CREATE_EXTERNAL_EFFECT')).toBe(true);
    expect(lifecycleAdmitsOperation('DEGRADED', 'READ_PROVIDER_STATE')).toBe(true);
    expect(lifecycleAdmitsOperation('DEGRADED', 'CREATE_EXTERNAL_EFFECT')).toBe(false);
    expect(lifecycleAdmitsOperation('SUSPENDED', 'READ_PROVIDER_STATE')).toBe(false);
    expect(lifecycleAdmitsOperation('DISCONNECTED', 'READ_PROVIDER_STATE')).toBe(false);
    expect(lifecycleAdmitsOperation('PROPOSED', 'READ_PROVIDER_STATE')).toBe(false);
  });

  it('the registry records an append-only transition history with actors', () => {
    const registry = new InMemoryConnectionRegistry();
    registry.register({
      connectionId: 'c1',
      providerName: 'p1',
      form: 'SCOPED_API_CREDENTIAL',
      credentialKind: 'API_KEY',
      credentialHandleRef: 'cred:1',
      scope: baseScope,
      createdAt: now,
    });
    registry.transition('c1', 'PENDING_VERIFICATION', {
      at: now + 1n,
      cause: 'PRINCIPAL_REQUEST',
      actorRef: 'principal:owner',
    });
    registry.transition('c1', 'ACTIVE', {
      at: now + 2n,
      cause: 'VERIFICATION_SUCCEEDED',
      actorRef: 'principal:owner',
    });
    const record = registry.get('c1');
    expect(record.state).toBe('ACTIVE');
    expect(record.transitionHistory.map((t) => `${t.from}->${t.to}`)).toEqual([
      'PROPOSED->PENDING_VERIFICATION',
      'PENDING_VERIFICATION->ACTIVE',
    ]);
    expect(record.transitionHistory.every((t) => t.actorRef === 'principal:owner')).toBe(true);
  });

  it('terminal transitions are monotonic: no exit from DISCONNECTED', () => {
    const registry = new InMemoryConnectionRegistry();
    registry.register({
      connectionId: 'c2',
      providerName: 'p1',
      form: 'SCOPED_API_CREDENTIAL',
      credentialKind: 'API_KEY',
      credentialHandleRef: 'cred:2',
      scope: baseScope,
      createdAt: now,
    });
    registry.transition('c2', 'PENDING_VERIFICATION', {
      at: now + 1n,
      cause: 'PRINCIPAL_REQUEST',
      actorRef: 'principal:owner',
    });
    registry.transition('c2', 'ACTIVE', {
      at: now + 2n,
      cause: 'VERIFICATION_SUCCEEDED',
      actorRef: 'principal:owner',
    });
    registry.transition('c2', 'DISCONNECTED', {
      at: now + 3n,
      cause: 'OPERATOR_ACTION',
      actorRef: 'operator:1',
    });
    expect(() =>
      registry.transition('c2', 'ACTIVE', {
        at: now + 4n,
        cause: 'OPERATOR_ACTION',
        actorRef: 'operator:1',
      }),
    ).toThrow(/terminal/);
  });

  it('transition timestamps never regress and duplicates are refused', () => {
    const registry = new InMemoryConnectionRegistry();
    registry.register({
      connectionId: 'c3',
      providerName: 'p1',
      form: 'SCOPED_API_CREDENTIAL',
      credentialKind: 'API_KEY',
      credentialHandleRef: 'cred:3',
      scope: baseScope,
      createdAt: now,
    });
    registry.transition('c3', 'PENDING_VERIFICATION', {
      at: now + 5n,
      cause: 'PRINCIPAL_REQUEST',
      actorRef: 'principal:owner',
    });
    expect(() =>
      registry.transition('c3', 'ACTIVE', { at: now + 1n, cause: 'POLICY_DECISION', actorRef: 'a' }),
    ).toThrow(ValidationError);
    expect(() =>
      registry.transition('c3', 'ACTIVE', { at: now + 6n, cause: 'POLICY_DECISION', actorRef: 'a' }),
    ).not.toThrow();
    expect(() =>
      registry.transition('c3', 'ACTIVE', { at: now + 7n, cause: 'POLICY_DECISION', actorRef: 'a' }),
    ).toThrow(/already/);
  });

  it('registration enforces form/credential consistency and unique ids', () => {
    const registry = new InMemoryConnectionRegistry();
    const input = {
      connectionId: 'c4',
      providerName: 'p1',
      form: 'ISOLATED_INTERACTIVE_BROWSER_SESSION' as const,
      credentialKind: 'API_KEY' as const,
      credentialHandleRef: 'cred:4',
      scope: baseScope,
      createdAt: now,
    };
    expect(() => registry.register(input)).toThrow(ValidationError);
    expect(() =>
      registry.register({ ...input, credentialKind: 'SESSION' as const }),
    ).not.toThrow();
    expect(() =>
      registry.register({ ...input, credentialKind: 'SESSION' as const, connectionId: 'c5' }),
    ).not.toThrow();
    expect(() => registry.get('nope')).toThrow(ValidationError);
    expect(() =>
      registry.register({ ...input, credentialKind: 'SESSION' as const, connectionId: '' }),
    ).toThrow(ValidationError);
  });

  it('combined admission: lifecycle AND scope must both admit', () => {
    const registry = new InMemoryConnectionRegistry();
    registry.register({
      connectionId: 'c6',
      providerName: 'p1',
      form: 'SCOPED_API_CREDENTIAL',
      credentialKind: 'API_KEY',
      credentialHandleRef: 'cred:6',
      scope: baseScope,
      createdAt: now,
    });
    // PROPOSED: lifecycle refuses even though scope admits.
    expect(
      registry.admitsOperation(
        'c6',
        { operationClass: 'CREATE_EXTERNAL_EFFECT', effectClass: 'STATE_CHANGING', capability: cap },
        now,
      ),
    ).toBe(false);
    registry.transition('c6', 'PENDING_VERIFICATION', {
      at: now + 1n,
      cause: 'PRINCIPAL_REQUEST',
      actorRef: 'principal:owner',
    });
    registry.transition('c6', 'ACTIVE', {
      at: now + 2n,
      cause: 'VERIFICATION_SUCCEEDED',
      actorRef: 'principal:owner',
    });
    expect(
      registry.admitsOperation(
        'c6',
        { operationClass: 'CREATE_EXTERNAL_EFFECT', effectClass: 'STATE_CHANGING', capability: cap },
        now,
      ),
    ).toBe(true);
    expect(
      registry.admitsOperation(
        'c6',
        {
          operationClass: 'CREATE_EXTERNAL_EFFECT',
          effectClass: 'STATE_CHANGING',
          capability: { ...cap, version: '9.9.9' },
        },
        now,
      ),
    ).toBe(false);
  });

  it('operation and effect class vocabularies are the canonical unions', () => {
    expect(OPERATION_CLASSES).toHaveLength(5);
    expect(EFFECT_CLASSES).toHaveLength(3);
  });
});
