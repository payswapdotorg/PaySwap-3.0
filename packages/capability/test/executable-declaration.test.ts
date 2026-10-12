import { describe, expect, it } from 'vitest';
import {
  validateExecutableCapabilityDeclaration,
  EXECUTABLE_DECLARATION_CONTRACT_VERSION,
  EXECUTION_MODE_VOCABULARY_VERSION,
  ValidationError,
} from '../src/index.ts';
import { fullExecutionDeclaration } from './fixtures.ts';

/**
 * The fourteen-part executable capability declaration law (NET-NEW — the
 * CAPABILITY-MODEL text). Every part is mandatory: removing any single one
 * must be a fail-closed validation error naming the part.
 */

const PART_KEYS = [
  'semantics',
  'stateMachine',
  'preconditions',
  'authorizationRequirements',
  'financialEffectClass',
  'idempotency',
  'compensation',
  'partialExecution',
  'userActions',
  'providerStateMapping',
  'externalReferences',
  'evidenceRequirements',
  'economicTerms',
  'jurisdictionEligibility',
] as const;

describe('the fourteen parts are all mandatory (CAPABILITY-MODEL law)', () => {
  for (const part of PART_KEYS) {
    it(`rejects a declaration missing part '${part}'`, () => {
      const declaration: Record<string, unknown> = {
        ...fullExecutionDeclaration(),
      };
      delete declaration[part];
      expect(() => validateExecutableCapabilityDeclaration(declaration)).toThrow(ValidationError);
      try {
        validateExecutableCapabilityDeclaration(declaration);
      } catch (error) {
        expect(error instanceof ValidationError).toBe(true);
        expect((error as ValidationError).message).toContain(part);
      }
    });
  }

  it('rejects a wrong contractVersion (versioned declaration contract)', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration({
        ...fullExecutionDeclaration(),
        contractVersion: '0.9.0',
      }),
    ).toThrow(/contractVersion/);
  });

  it('accepts the full fixture and reports the pinned contract version', () => {
    const validated = validateExecutableCapabilityDeclaration(fullExecutionDeclaration());
    expect(validated.contractVersion).toBe(EXECUTABLE_DECLARATION_CONTRACT_VERSION);
  });
});

describe('part 2 — declared state machine laws', () => {
  it('rejects transitions referencing undeclared states', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          stateMachine: {
            initial: 'CREATED',
            states: [{ name: 'CREATED', isTerminal: false }],
            transitions: [
              { from: 'CREATED', to: 'GHOST', trigger: 'submit' },
            ],
          },
        }),
      ),
    ).toThrow(/undeclared state/);
  });

  it('rejects transitions leaving a terminal state (terminality law)', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          stateMachine: {
            initial: 'CREATED',
            states: [
              { name: 'CREATED', isTerminal: false },
              { name: 'DONE', isTerminal: true },
            ],
            transitions: [
              { from: 'CREATED', to: 'DONE', trigger: 'submit' },
              { from: 'DONE', to: 'CREATED', trigger: 'reopen' },
            ],
          },
        }),
      ),
    ).toThrow(/terminality/);
  });

  it('rejects an initial state outside the declared states and duplicate states', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          stateMachine: {
            initial: 'NOWHERE',
            states: [{ name: 'CREATED', isTerminal: false }],
            transitions: [],
          },
        }),
      ),
    ).toThrow(/initial/);
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          stateMachine: {
            initial: 'CREATED',
            states: [
              { name: 'CREATED', isTerminal: false },
              { name: 'CREATED', isTerminal: true },
            ],
            transitions: [],
          },
        }),
      ),
    ).toThrow(/duplicate state/);
  });
});

describe('part 4 — authorization requirements are declarations, never verification', () => {
  it('requires requiredScopes + requiresHumanApproval shape', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({ authorizationRequirements: { requiredScopes: [] } as never }),
      ),
    ).toThrow(/authorizationRequirements/);
  });
});

describe('part 6 — idempotency/retry discipline', () => {
  it('accepts the endpoint-specific key scope with never-retry-after-ambiguity', () => {
    const validated = validateExecutableCapabilityDeclaration(fullExecutionDeclaration());
    expect(validated.idempotency.keyScope).toBe('ENDPOINT_SPECIFIC');
    expect(validated.idempotency.retryPolicy).toBe('NEVER_RETRY_AFTER_AMBIGUITY');
  });

  it('rejects an unknown key scope', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          idempotency: {
            ...fullExecutionDeclaration().idempotency,
            keyScope: 'UNIVERSAL' as never,
          },
        }),
      ),
    ).toThrow(/idempotency/);
  });
});

describe('part 10 — provider-state mapping must preserve envelopes (INV-14)', () => {
  it('requires preservedInEnvelope true and known families', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          providerStateMapping: {
            preservedInEnvelope: false,
            consequentialFamilies: ['payout'],
          } as never,
        }),
      ),
    ).toThrow(/providerStateMapping|INV-14/);
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          providerStateMapping: {
            preservedInEnvelope: true,
            consequentialFamilies: ['ledger_magic' as never],
          },
        }),
      ),
    ).toThrow(/providerStateMapping/);
  });
});

describe('part 14 — jurisdiction/eligibility constraints', () => {
  it('accepts an embedded restriction set', () => {
    const validated = validateExecutableCapabilityDeclaration(fullExecutionDeclaration());
    expect(validated.jurisdictionEligibility.declaredVia).toBe('RESTRICTION_SET');
  });

  it('accepts an explicit NONE with justification', () => {
    const validated = validateExecutableCapabilityDeclaration(
      fullExecutionDeclaration({
        jurisdictionEligibility: {
          declaredVia: 'NONE',
          justification: 'rail-neutral informational capability; restrictions attach at the implementation layer',
        },
      }),
    );
    expect(validated.jurisdictionEligibility.declaredVia).toBe('NONE');
  });

  it('rejects NONE without justification and an embedded invalid restriction set', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          jurisdictionEligibility: { declaredVia: 'NONE', justification: '' },
        }),
      ),
    ).toThrow(/justification/);
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          jurisdictionEligibility: {
            declaredVia: 'RESTRICTION_SET',
            restrictionSet: { restrictionSetId: 'x' } as never,
          },
        }),
      ),
    ).toThrow(/restrictionSet/);
  });
});

describe('execution modes on the declaration (declared, never inferred)', () => {
  it('requires a non-empty mode list — an empty list is rejected', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({ executionModes: [] }),
      ),
    ).toThrow(/executionModes|execution mode/i);
  });

  it('PASS_THROUGH_NATIVE ALONE is fully legal (INV-15: native is never structurally disadvantaged)', () => {
    const validated = validateExecutableCapabilityDeclaration(
      fullExecutionDeclaration({ executionModes: ['PASS_THROUGH_NATIVE'] }),
    );
    expect(validated.executionModes).toEqual(['PASS_THROUGH_NATIVE']);
  });

  it('rejects unknown or duplicate modes', () => {
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({ executionModes: ['AUTOMATIC' as never] }),
      ),
    ).toThrow(/unknown execution mode/);
    expect(() =>
      validateExecutableCapabilityDeclaration(
        fullExecutionDeclaration({
          executionModes: ['PASS_THROUGH_NATIVE', 'PASS_THROUGH_NATIVE'],
        }),
      ),
    ).toThrow(/duplicate execution mode/);
  });

  it('the mode vocabulary version is pinned on the contract', () => {
    expect(EXECUTION_MODE_VOCABULARY_VERSION).toBe('1.0.0');
  });
});
