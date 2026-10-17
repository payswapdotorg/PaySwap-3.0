import { describe, expect, it } from 'vitest';

import {
  CommandError,
  ValidationError,
  UnsupportedVersionError,
  FinancialAuthorityError,
  ExtensionBoundaryError,
  PermissionDeniedError,
  MethodNotFoundError,
  ExternalAmbiguityError,
  isFailureOutcome,
} from '../src/errors.ts';

describe('the command-surface error taxonomy (total-error, fail closed)', () => {
  it('every error carries a stable machine code, a category and a message', () => {
    const error = new CommandError({
      code: 'TEST_ERROR',
      category: 'VALIDATION',
      message: 'a test error',
    });
    expect(error.code).toBe('TEST_ERROR');
    expect(error.category).toBe('VALIDATION');
    expect(error.message).toBe('a test error');
    expect(error.name).toBe('CommandError');
    expect(error).toBeInstanceOf(CommandError);
    expect(error).toBeInstanceOf(Error);
  });

  it('details are absent entirely when not supplied (never a defined undefined)', () => {
    const withoutDetails = new ValidationError('no details');
    expect('details' in withoutDetails).toBe(false);
    const withDetails = new ValidationError('with details', { field: 'x' });
    expect(withDetails.details).toEqual({ field: 'x' });
  });

  it('subclasses carry their pinned codes and categories', () => {
    expect(new ValidationError('x').code).toBe('VALIDATION_FAILED');
    expect(new UnsupportedVersionError('x').category).toBe('UNSUPPORTED_VERSION');
    expect(new FinancialAuthorityError('x').code).toBe('FINANCIAL_AUTHORITY_ON_COMMAND_SURFACE');
    expect(new FinancialAuthorityError('x').category).toBe('POLICY_BLOCKED');
    expect(new ExtensionBoundaryError('x').category).toBe('AUTHORIZATION_REQUIRED');
    expect(new PermissionDeniedError('x').code).toBe('PERMISSION_NOT_GRANTED');
    expect(new MethodNotFoundError('x').category).toBe('NOT_FOUND');
  });

  it('INV-4 discipline: EXTERNAL_AMBIGUITY is an ambiguity, NOT a failure outcome', () => {
    const ambiguity = new ExternalAmbiguityError('the external outcome is unknown');
    expect(ambiguity.category).toBe('EXTERNAL_AMBIGUITY');
    expect(ambiguity.requiresReconciliation).toBe(true);
    expect(isFailureOutcome(ambiguity)).toBe(false);
    expect(isFailureOutcome(new ValidationError('x'))).toBe(true);
    expect(isFailureOutcome(new MethodNotFoundError('x'))).toBe(true);
  });

  it('subclass names survive instanceof through prototype chains', () => {
    class NestedCommandError extends CommandError {
      constructor(message: string) {
        super({ code: 'NESTED', category: 'INTERNAL', message });
      }
    }
    const nested = new NestedCommandError('nested');
    expect(nested instanceof CommandError).toBe(true);
    expect(nested instanceof NestedCommandError).toBe(true);
    expect(nested.name).toBe('NestedCommandError');
  });
});
