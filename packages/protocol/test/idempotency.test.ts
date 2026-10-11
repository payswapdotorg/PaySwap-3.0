import { describe, expect, it } from 'vitest';
import {
  type BeginOutcome,
  IdempotencyStateError,
  InMemoryIdempotencyRegistrar,
  UnknownIdempotencyScopeError,
  ValidationError,
} from '../src/index.ts';

const principal = { principalType: 'user', principalId: 'u-1' };
function scope(commandType = 'money.reserve', key = 'k1') {
  return { commandType, principal, key };
}

describe('idempotency registrar (ported from old idempotency.test.ts; INV-06)', () => {
  it('begins a fresh scope', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    const outcome = registrar.begin(scope(), 'hash-a');
    expect(outcome.kind).toBe('BEGIN');
  });

  it('REPLAYs an in-flight duplicate with the same command hash (never a second execution)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(scope(), 'hash-a');
    const outcome: BeginOutcome = registrar.begin(scope(), 'hash-a');
    expect(outcome.kind).toBe('REPLAY');
    if (outcome.kind === 'REPLAY') {
      expect(outcome.record.status).toBe('IN_FLIGHT');
      expect(outcome.record.commandHash).toBe('hash-a');
    }
  });

  it('CONFLICTs on the same key with a different command hash', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(scope(), 'hash-a');
    const outcome = registrar.begin(scope(), 'hash-b');
    expect(outcome.kind).toBe('CONFLICT');
    if (outcome.kind === 'CONFLICT') {
      expect(outcome.record.commandHash).toBe('hash-a');
    }
  });

  it('completes a scope and replays the exact result hash', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(scope(), 'hash-a');
    registrar.complete(scope(), 'result-1');
    const outcome = registrar.begin(scope(), 'hash-a');
    expect(outcome.kind).toBe('REPLAY');
    if (outcome.kind === 'REPLAY') {
      expect(outcome.record.status).toBe('COMPLETED');
      expect(outcome.record.resultHash).toBe('result-1');
    }
  });

  it('rejects a different result hash on double-complete (results must be deterministic)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(scope(), 'hash-a');
    registrar.complete(scope(), 'result-1');
    expect(() => registrar.complete(scope(), 'result-2')).toThrow(IdempotencyStateError);
    // identical double-complete is idempotent
    expect(() => registrar.complete(scope(), 'result-1')).not.toThrow();
  });

  it('a FAILED scope re-arms on retry (BEGIN again under the same hash)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(scope(), 'hash-a');
    registrar.fail(scope());
    const outcome = registrar.begin(scope(), 'hash-a');
    expect(outcome.kind).toBe('BEGIN');
  });

  it('scopes are isolated by commandType and principal and key', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(scope('a'), 'hash-a');
    expect(registrar.begin(scope('b'), 'hash-a').kind).toBe('BEGIN');
    expect(registrar.begin(scope('a', 'k2'), 'hash-a').kind).toBe('BEGIN');
    expect(
      registrar.begin({ commandType: 'a', principal: { principalType: 'user', principalId: 'u-2' }, key: 'k1' }, 'hash-a').kind,
    ).toBe('BEGIN');
  });

  it('complete/fail on an unknown scope throw UnknownIdempotencyScopeError', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    expect(() => registrar.complete(scope(), 'r')).toThrow(UnknownIdempotencyScopeError);
    expect(() => registrar.fail(scope())).toThrow(UnknownIdempotencyScopeError);
  });

  it('cannot complete a FAILED record; cannot fail a non-IN_FLIGHT record', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(scope(), 'hash-a');
    registrar.fail(scope());
    expect(() => registrar.complete(scope(), 'r')).toThrow(IdempotencyStateError);
    expect(() => registrar.fail(scope())).toThrow(IdempotencyStateError);

    const registrar2 = new InMemoryIdempotencyRegistrar();
    registrar2.begin(scope(), 'hash-a');
    registrar2.complete(scope(), 'r');
    expect(() => registrar2.fail(scope())).toThrow(IdempotencyStateError);
  });

  it('validates scope shape and hashes', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    expect(() => registrar.begin({ commandType: '', principal, key: 'k' }, 'h')).toThrow(ValidationError);
    expect(() => registrar.begin({ commandType: 'c', principal, key: '' }, 'h')).toThrow(ValidationError);
    expect(() => registrar.begin(scope(), '')).toThrow(ValidationError);
    expect(() =>
      registrar.begin({ commandType: 'c', principal: { principalType: '', principalId: '' }, key: 'k' }, 'h'),
    ).toThrow(ValidationError);
  });

  it('returned records are frozen (callers cannot mutate registrar state)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(scope(), 'hash-a');
    registrar.complete(scope(), 'result-1');
    const outcome = registrar.begin(scope(), 'hash-a');
    if (outcome.kind === 'REPLAY') {
      expect(Object.isFrozen(outcome.record)).toBe(true);
      expect(Object.isFrozen(outcome.record.scope)).toBe(true);
    }
  });
});
