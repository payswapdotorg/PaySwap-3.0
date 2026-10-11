import { describe, expect, it } from 'vitest';
import {
  DeterministicClock,
  EpochCounter,
  EpochRegressionError,
  ExternalAmbiguityError,
  PaySwapError,
  ValidationError,
  isFailureOutcome,
} from '../src/index.ts';

describe('errors: taxonomy (ported from old errors.test.ts)', () => {
  it('every protocol error is a PaySwapError with stable code + category + details', () => {
    const error = new ValidationError('bad input', { field: 'x' });
    expect(error).toBeInstanceOf(PaySwapError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.category).toBe('VALIDATION');
    expect(error.details).toEqual({ field: 'x' });
    expect(error.message).toBe('bad input');
  });

  it('details are absent entirely when not supplied (never a defined undefined)', () => {
    const error = new ValidationError('no details');
    expect('details' in error).toBe(false);
  });

  it('name is the concrete subclass name', () => {
    expect(new ValidationError('x').name).toBe('ValidationError');
    expect(new ExternalAmbiguityError('x').name).toBe('ExternalAmbiguityError');
  });
});

describe('errors: UNKNOWN is not FAILED (INV-04 classifier)', () => {
  it('ExternalAmbiguityError is NOT a failure outcome', () => {
    const ambiguity = new ExternalAmbiguityError('rail timeout, effect unknown');
    expect(isFailureOutcome(ambiguity)).toBe(false);
    expect(ambiguity.requiresReconciliation).toBe(true);
    expect(ambiguity.code).toBe('EXTERNAL_AMBIGUITY');
    expect(ambiguity.category).toBe('EXTERNAL_AMBIGUITY');
  });

  it('every other PaySwapError IS a failure outcome', () => {
    expect(isFailureOutcome(new ValidationError('x'))).toBe(true);
    expect(isFailureOutcome(new EpochRegressionError('x'))).toBe(true);
  });

  it('foreign errors and non-errors default to failure (conservative)', () => {
    expect(isFailureOutcome(new Error('plain'))).toBe(true);
    expect(isFailureOutcome('string')).toBe(true);
    expect(isFailureOutcome(null)).toBe(true);
    expect(isFailureOutcome(undefined)).toBe(true);
  });

  it('subclasses of ExternalAmbiguityError remain non-failure outcomes', () => {
    class RailTimeoutError extends ExternalAmbiguityError {}
    expect(isFailureOutcome(new RailTimeoutError('timeout'))).toBe(false);
  });
});

describe('clock + epoch (ported from old clock.test.ts)', () => {
  it('DeterministicClock now() is frozen until advanced', () => {
    const clock = new DeterministicClock(1_000n);
    expect(clock.now()).toBe(1000n);
    expect(clock.now()).toBe(1000n);
  });

  it('advanceMs moves the simulated wall time (negatives simulate skew)', () => {
    const clock = new DeterministicClock(0n);
    clock.advanceMs(500n);
    expect(clock.now()).toBe(500n);
    clock.advanceMs(-200n);
    expect(clock.now()).toBe(300n);
    clock.advanceMs(1);
    expect(clock.now()).toBe(301n);
  });

  it('monotonic() strictly increases on every call, independent of the wall time', () => {
    const clock = new DeterministicClock(0n);
    const first = clock.monotonic();
    const second = clock.monotonic();
    expect(second).toBe(first + 1n);
    clock.advanceMs(10_000n);
    const third = clock.monotonic();
    expect(third).toBe(second + 1n);
  });

  it('rejects non-bigint seeds and non-integer ms deltas', () => {
    expect(() => new DeterministicClock(1 as unknown as bigint)).toThrow(ValidationError);
    const clock = new DeterministicClock(0n);
    expect(() => clock.advanceMs(0.5)).toThrow(ValidationError);
    expect(() => clock.advanceMs(10 as unknown as bigint)).not.toThrow();
  });

  it('EpochCounter next() is strictly increasing', () => {
    const epoch = new EpochCounter(0n);
    expect(epoch.next()).toBe(1n);
    expect(epoch.next()).toBe(2n);
    expect(epoch.current).toBe(2n);
  });

  it('EpochCounter observe() folds in strictly greater epochs', () => {
    const epoch = new EpochCounter(5n);
    epoch.observe(9n);
    expect(epoch.current).toBe(9n);
    expect(() => epoch.observe(9n)).toThrow(EpochRegressionError);
    expect(() => epoch.observe(1n)).toThrow(EpochRegressionError);
    epoch.observe(10n);
    expect(epoch.current).toBe(10n);
  });

  it('EpochCounter rejects invalid construction and inputs', () => {
    expect(() => new EpochCounter(-1n)).toThrow(ValidationError);
    expect(() => new EpochCounter(1 as unknown as bigint)).toThrow(ValidationError);
    const epoch = new EpochCounter(0n);
    expect(() => epoch.observe(1 as unknown as bigint)).toThrow(ValidationError);
  });
});
