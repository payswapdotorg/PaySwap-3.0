import { describe, expect, it } from 'vitest';
import {
  CONNECTION_FORMS,
  CONNECTION_FORM_PROFILES,
  CREDENTIAL_KINDS,
  connectionFormProfile,
  isConnectionForm,
  isCredentialKind,
  validateFormCredentialConsistency,
} from '../src/connection-forms.ts';
import {
  CONNECTION_LIFECYCLE_STATES,
  InMemoryConnectionRegistry,
  TERMINAL_CONNECTION_STATES,
  isLawfulTransition,
  isTerminalConnectionState,
  lifecycleAdmitsOperation,
} from '../src/connection-lifecycle.ts';
import {
  EFFECT_CLASSES,
  OPERATION_CLASSES,
  isAdmitted,
  scopeAdmits,
  freezeConnectionScope,
} from '../src/connection-scope.ts';
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

describe('connection forms (CAPABILITY-MODEL vocabulary)', () => {
  it('exposes exactly the five canonical forms', () => {
    expect([...CONNECTION_FORMS]).toEqual([
      'DELEGATED_OAUTH',
      'CONNECTED_ACCOUNT',
      'SCOPED_API_CREDENTIAL',
      'ISOLATED_INTERACTIVE_BROWSER_SESSION',
      'PROVIDERLESS_RAIL',
    ]);
  });

  it('profiles are frozen data with consistent shape', () => {
    for (const form of CONNECTION_FORMS) {
      const profile = CONNECTION_FORM_PROFILES[form];
      expect(profile.form).toBe(form);
      expect(Object.isFrozen(profile)).toBe(true);
      expect(profile.credentialKinds.length).toBeGreaterThan(0);
    }
  });

  it('browser isolation is required ONLY for the isolated interactive browser form', () => {
    expect(
      CONNECTION_FORM_PROFILES.ISOLATED_INTERACTIVE_BROWSER_SESSION.requiresBrowserIsolation,
    ).toBe(true);
    for (const form of CONNECTION_FORMS) {
      if (form !== 'ISOLATED_INTERACTIVE_BROWSER_SESSION') {
        expect(CONNECTION_FORM_PROFILES[form].requiresBrowserIsolation).toBe(false);
      }
    }
  });

  it('the interactive browser form is interactive-only; providerless rails have no counterparty', () => {
    expect(CONNECTION_FORM_PROFILES.ISOLATED_INTERACTIVE_BROWSER_SESSION.interactiveOnly).toBe(true);
    expect(CONNECTION_FORM_PROFILES.PROVIDERLESS_RAIL.providerless).toBe(true);
    for (const form of CONNECTION_FORMS) {
      if (form !== 'PROVIDERLESS_RAIL') {
        expect(CONNECTION_FORM_PROFILES[form].providerless).toBe(false);
      }
    }
  });

  it('fail-closed form/credential consistency (mode/scope law)', () => {
    expect(() =>
      validateFormCredentialConsistency('ISOLATED_INTERACTIVE_BROWSER_SESSION', 'API_KEY'),
    ).toThrow(ValidationError);
    expect(() => validateFormCredentialConsistency('SCOPED_API_CREDENTIAL', 'SESSION')).toThrow(
      ValidationError,
    );
    expect(() => validateFormCredentialConsistency('DELEGATED_OAUTH', 'API_KEY')).toThrow(
      ValidationError,
    );
    expect(validateFormCredentialConsistency('SCOPED_API_CREDENTIAL', 'API_KEY').form).toBe(
      'SCOPED_API_CREDENTIAL',
    );
    expect(validateFormCredentialConsistency('DELEGATED_OAUTH', 'OAUTH').form).toBe(
      'DELEGATED_OAUTH',
    );
  });

  it('unknown forms and credential kinds are rejected', () => {
    expect(isConnectionForm('api_key')).toBe(false);
    expect(isCredentialKind('PASSWORD')).toBe(false);
    expect(() => connectionFormProfile('oauth' as never)).toThrow(ValidationError);
    expect(() => validateFormCredentialConsistency('oauth' as never, 'API_KEY')).toThrow(
      ValidationError,
    );
    expect(() => validateFormCredentialConsistency('SCOPED_API_CREDENTIAL', 'NOPE' as never)).toThrow(
      ValidationError,
    );
  });

  it('all five credential kinds are activatable on providerless rails', () => {
    for (const kind of CREDENTIAL_KINDS) {
      expect(() => validateFormCredentialConsistency('PROVIDERLESS_RAIL', kind)).not.toThrow();
    }
  });
});

describe('connection scope admission (what a connection is allowed to do)', () => {
  it('admits an explicitly granted operation with matching effect class and capability', () => {
    expect(
      scopeAdmits(baseScope, { operationClass: 'CREATE_EXTERNAL_EFFECT', effectClass: 'STATE_CHANGING', capability: cap }, now),
    ).toEqual({ kind: 'ADMITTED' });
    expect(
      isAdmitted(baseScope, { operationClass: 'READ_PROVIDER_STATE', effectClass: 'NONE' }, now),
    ).toBe(true);
  });

  it('refuses operation classes that were never granted', () => {
    const decision = scopeAdmits(
      baseScope,
      { operationClass: 'CANCEL_OR_REVERSE_EFFECT', effectClass: 'STATE_CHANGING' },
      now,
    );
    expect(decision.kind).toBe('REFUSED');
    if (decision.kind === 'REFUSED') expect(decision.reason).toBe('OPERATION_CLASS_NOT_GRANTED');
  });

  it('refuses effect classes that were not granted', () => {
    const readOnly = freezeConnectionScope({
      allowedOperations: ['READ_PROVIDER_STATE', 'CREATE_EXTERNAL_EFFECT'],
      allowedEffectClasses: ['NONE', 'OBSERVATION_ONLY'],
      scopedCapabilities: [cap],
    });
    const decision = scopeAdmits(
      readOnly,
      { operationClass: 'CREATE_EXTERNAL_EFFECT', effectClass: 'STATE_CHANGING' },
      now,
    );
    expect(decision.kind).toBe('REFUSED');
    if (decision.kind === 'REFUSED') expect(decision.reason).toBe('EFFECT_CLASS_NOT_GRANTED');
  });

  it('refuses capability references not in scope (INV-13: catalogue ≠ connected)', () => {
    const decision = scopeAdmits(
      baseScope,
      {
        operationClass: 'CREATE_EXTERNAL_EFFECT',
        effectClass: 'STATE_CHANGING',
        capability: { definitionId: 'cap.other', implementationId: 'impl.other', version: '1.0.0' },
      },
      now,
    );
    expect(decision.kind).toBe('REFUSED');
    if (decision.kind === 'REFUSED') expect(decision.reason).toBe('CAPABILITY_NOT_IN_SCOPE');
  });

  it('refuses capability VERSION DRIFT as a distinct reason (exact-match admission)', () => {
    const decision = scopeAdmits(
      baseScope,
      {
        operationClass: 'CREATE_EXTERNAL_EFFECT',
        effectClass: 'STATE_CHANGING',
        capability: { ...cap, version: '2.0.0' },
      },
      now,
    );
    expect(decision.kind).toBe('REFUSED');
    if (decision.kind === 'REFUSED') expect(decision.reason).toBe('CAPABILITY_VERSION_DRIFT');
  });

  it('an expired scope admits NOTHING (fail-closed)', () => {
    const scope = freezeConnectionScope({
      allowedOperations: ['READ_PROVIDER_STATE'],
      allowedEffectClasses: ['NONE'],
      scopedCapabilities: [],
      effectiveUntil: 4_999_999n,
    });
    const decision = scopeAdmits(scope, { operationClass: 'READ_PROVIDER_STATE', effectClass: 'NONE' }, now);
    expect(decision.kind).toBe('REFUSED');
    if (decision.kind === 'REFUSED') expect(decision.reason).toBe('SCOPE_EXPIRED');
  });

  it('an empty scope admits nothing (explicit grant only)', () => {
    const scope = freezeConnectionScope({
      allowedOperations: [],
      allowedEffectClasses: ['NONE'],
      scopedCapabilities: [],
    });
    const decision = scopeAdmits(scope, { operationClass: 'READ_PROVIDER_STATE', effectClass: 'NONE' }, now);
    expect(decision.kind).toBe('REFUSED');
    if (decision.kind === 'REFUSED') expect(decision.reason).toBe('EMPTY_SCOPE');
  });

  it('malformed scopes and requests throw (validation is fail-closed)', () => {
    expect(() => scopeAdmits(null as never, { operationClass: 'READ_PROVIDER_STATE', effectClass: 'NONE' }, now)).toThrow(
      ValidationError,
    );
    expect(() =>
      scopeAdmits(baseScope, { operationClass: 'NOT_A_CLASS' as never, effectClass: 'NONE' }, now),
    ).toThrow(ValidationError);
    expect(() =>
      scopeAdmits(
        { allowedOperations: ['NOPE'], allowedEffectClasses: [], scopedCapabilities: [] } as never,
        { operationClass: 'READ_PROVIDER_STATE', effectClass: 'NONE' },
        now,
      ),
    ).toThrow(ValidationError);
  });

  it('freezing a scope deep-freezes capability references', () => {
    const scope = freezeConnectionScope({
      allowedOperations: ['READ_PROVIDER_STATE'],
      allowedEffectClasses: ['NONE'],
      scopedCapabilities: [cap],
    });
    expect(Object.isFrozen(scope)).toBe(true);
    expect(Object.isFrozen(scope.scopedCapabilities[0])).toBe(true);
    expect(() => scopeAdmits(scope, { operationClass: 'READ_PROVIDER_STATE', effectClass: 'NONE' }, now)).not.toThrow();
  });
});
