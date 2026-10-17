import { describe, expect, it } from 'vitest';

import {
  createCommandProposalEnvelope,
  validateCommandProposalEnvelope,
  assertProposalPayloadIsAuthorityFree,
  validateIdempotencyScope,
  canonicalScopeKey,
  resolveBeginOutcome,
  createInMemoryIdempotencyRegistrar,
  type IdempotencyRecord,
} from '../src/command-envelope.ts';
import { ValidationError, FinancialAuthorityError, UnsupportedVersionError } from '../src/errors.ts';
import { COMMAND_ENVELOPE_SCHEMA_VERSION } from '../src/version.ts';
import { asCorrelationId } from '../src/identifiers.ts';
import { USER_PRINCIPAL, testClock, testIds, T0_MS } from './fixtures.ts';

const CLEAN_PAYLOAD = Object.freeze({
  kind: 'intent',
  commandType: 'payments.intent.propose',
  note: 'proposal input only',
  amount: { currency: 'USD', minorUnits: '1000' },
});

function deps() {
  return { ids: testIds(), clock: testClock() };
}

describe('the command proposal envelope (the authority-firewall law)', () => {
  it('creates a frozen envelope carrying lineage, the INV-6 idempotency key and the pinned schema version', () => {
    const envelope = createCommandProposalEnvelope(
      {
        commandType: 'payments.intent.propose',
        payload: CLEAN_PAYLOAD,
        principalRef: USER_PRINCIPAL,
        idempotencyKey: 'ik-1',
      },
      deps(),
    );
    expect(envelope.id).toMatch(/^cmd_\d+_\d+$/);
    expect(envelope.commandType).toBe('payments.intent.propose');
    expect(envelope.payload).toEqual(CLEAN_PAYLOAD);
    expect(envelope.principalRef).toEqual({ principalType: 'user', principalId: 'alice' });
    expect(envelope.idempotencyKey).toBe('ik-1');
    expect(envelope.issuedAtMs).toBe(T0_MS);
    expect(envelope.schemaVersion).toBe(COMMAND_ENVELOPE_SCHEMA_VERSION);
    expect(Object.isFrozen(envelope)).toBe(true);
  });

  it('carries causation and correlation lineage when supplied (evidence lineage survives end to end)', () => {
    const { ids, clock } = deps();
    const first = createCommandProposalEnvelope(
      { commandType: 'a', payload: 1, principalRef: USER_PRINCIPAL, idempotencyKey: 'k1' },
      { ids, clock },
    );
    clock.advanceMs(1n);
    const second = createCommandProposalEnvelope(
      {
        commandType: 'b',
        payload: 2,
        principalRef: USER_PRINCIPAL,
        idempotencyKey: 'k2',
        causationId: first.id,
        correlationId: asCorrelationId('conv-1'),
      },
      { ids, clock },
    );
    expect(second.causationId).toBe(first.id);
    expect(second.correlationId).toBe('conv-1');
    expect(first.causationId).toBeUndefined();
  });

  it('REJECTS authority material riding the payload: secrets, signatures, mandates (fail closed)', () => {
    const forbidden: unknown[] = [
      { apiKey: 'sk_live_1' },
      { nested: { sessionToken: 'sess_x' } },
      { list: [{ signature: 'deadbeef' }] },
      { mandate: { actions: ['x'] } },
      { privateKey: '-----BEGIN-----' },
    ];
    for (const payload of forbidden) {
      expect(() => assertProposalPayloadIsAuthorityFree(payload)).toThrow(FinancialAuthorityError);
      expect(() =>
        createCommandProposalEnvelope(
          { commandType: 'x', payload, principalRef: USER_PRINCIPAL, idempotencyKey: 'k' },
          deps(),
        ),
      ).toThrow(FinancialAuthorityError);
    }
  });

  it('the firewall scan lists every offending path (deterministic, exhaustive)', () => {
    try {
      assertProposalPayloadIsAuthorityFree({ a: { secret: 'x' }, b: [{ credential: 'y' }] });
      throw new Error('expected FinancialAuthorityError');
    } catch (error) {
      expect(error).toBeInstanceOf(FinancialAuthorityError);
      const authorityError = error as FinancialAuthorityError;
      expect(authorityError.code).toBe('FINANCIAL_AUTHORITY_ON_COMMAND_SURFACE');
      const offenders = authorityError.details?.['offenders'] as string[];
      expect(offenders).toEqual(['payload.a.secret', 'payload.b[0].credential']);
    }
  });

  it('opaque REFERENCES remain legal: approvalArtifactRef and requestHash pass the scan', () => {
    expect(() =>
      assertProposalPayloadIsAuthorityFree({
        approvalArtifactRef: 'approval:hash_1',
        requestHash: 'abc',
        note: 'references are not authority material',
      }),
    ).not.toThrow();
  });

  it('validates envelope inputs: commandType shape, idempotency key REQUIRED, principal, bigint time', () => {
    expect(() =>
      createCommandProposalEnvelope(
        { commandType: '', payload: 1, principalRef: USER_PRINCIPAL, idempotencyKey: 'k' },
        deps(),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      createCommandProposalEnvelope(
        { commandType: 'x', payload: 1, principalRef: USER_PRINCIPAL, idempotencyKey: '' },
        deps(),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      createCommandProposalEnvelope(
        { commandType: 'x', payload: 1, principalRef: { principalType: '', principalId: '' }, idempotencyKey: 'k' },
        deps(),
      ),
    ).toThrow(ValidationError);
  });

  it('validateCommandProposalEnvelope re-validates materialized envelopes (foreign schema versions rejected)', () => {
    const envelope = createCommandProposalEnvelope(
      { commandType: 'x', payload: 1, principalRef: USER_PRINCIPAL, idempotencyKey: 'k' },
      deps(),
    );
    expect(validateCommandProposalEnvelope(envelope)).toBe(envelope);
    const foreign = { ...envelope, schemaVersion: 2 };
    expect(() => validateCommandProposalEnvelope(foreign)).toThrow(UnsupportedVersionError);
    const wrongTime = { ...envelope, issuedAtMs: 123 as unknown as bigint };
    expect(() => validateCommandProposalEnvelope(wrongTime)).toThrow(ValidationError);
  });

  it('deterministic: same inputs + same clock state => the same envelope', () => {
    const a = createCommandProposalEnvelope(
      { commandType: 'x', payload: { v: 1 }, principalRef: USER_PRINCIPAL, idempotencyKey: 'k' },
      deps(),
    );
    const b = createCommandProposalEnvelope(
      { commandType: 'x', payload: { v: 1 }, principalRef: USER_PRINCIPAL, idempotencyKey: 'k' },
      deps(),
    );
    expect(a).toEqual(b);
  });
});

describe('the idempotency decision table (INV-6)', () => {
  const scope = {
    commandType: 'payments.intent.propose',
    principal: USER_PRINCIPAL,
    key: 'ik-1',
  };

  it('canonicalScopeKey is the unambiguous JSON-array wire form', () => {
    expect(canonicalScopeKey(validateIdempotencyScope(scope))).toBe(
      '["payments.intent.propose","user","alice","ik-1"]',
    );
    expect(() => validateIdempotencyScope({ ...scope, key: '' })).toThrow(ValidationError);
  });

  it('no existing record => BEGIN', () => {
    expect(resolveBeginOutcome(undefined, 'h1')).toEqual({ kind: 'BEGIN' });
  });

  it('same key + different command hash => CONFLICT (an INV-6 violation attempt)', () => {
    const existing: IdempotencyRecord = {
      scope,
      commandHash: 'h1',
      status: 'COMPLETED',
      resultHash: 'r1',
    };
    expect(resolveBeginOutcome(existing, 'h2').kind).toBe('CONFLICT');
  });

  it('IN_FLIGHT + same hash => REPLAY (the caller waits; never a silent second execution)', () => {
    const existing: IdempotencyRecord = { scope, commandHash: 'h1', status: 'IN_FLIGHT' };
    expect(resolveBeginOutcome(existing, 'h1').kind).toBe('REPLAY');
  });

  it('COMPLETED + same hash => REPLAY with the recorded result hash', () => {
    const existing: IdempotencyRecord = { scope, commandHash: 'h1', status: 'COMPLETED', resultHash: 'r1' };
    const outcome = resolveBeginOutcome(existing, 'h1');
    expect(outcome.kind).toBe('REPLAY');
    if (outcome.kind === 'REPLAY') {
      expect(outcome.record.resultHash).toBe('r1');
    }
  });

  it('FAILED + same hash => BEGIN (a corrected retry re-arms; transient failures are retryable)', () => {
    const existing: IdempotencyRecord = { scope, commandHash: 'h1', status: 'FAILED' };
    expect(resolveBeginOutcome(existing, 'h1').kind).toBe('BEGIN');
  });

  it('the in-memory registrar implements the decision table; completed scopes are immutable; failed scopes re-arm', () => {
    const registrar = createInMemoryIdempotencyRegistrar();
    expect(registrar.begin(scope, 'h1')).toEqual({ kind: 'BEGIN' });
    expect(registrar.begin(scope, 'h1').kind).toBe('REPLAY'); // IN_FLIGHT
    expect(registrar.begin(scope, 'h2').kind).toBe('CONFLICT'); // different command
    registrar.complete(scope, 'r1');
    expect(registrar.begin(scope, 'h1').kind).toBe('REPLAY'); // COMPLETED
    expect(() => registrar.complete(scope, 'r2')).toThrow(ValidationError); // completed is immutable
    expect(() => registrar.fail(scope)).toThrow(ValidationError); // completed cannot fail
    // A failed scope re-arms (fresh key):
    const retryScope = { ...scope, key: 'ik-retry' };
    registrar.begin(retryScope, 'h1');
    registrar.fail(retryScope);
    expect(registrar.begin(retryScope, 'h1').kind).toBe('BEGIN'); // re-armed
  });

  it('an ambiguous completed outcome replays the SAME result (no blind retry after ambiguity)', () => {
    const registrar = createInMemoryIdempotencyRegistrar();
    registrar.begin(scope, 'h1');
    registrar.complete(scope, 'ambiguous-result-hash');
    const replay = registrar.begin(scope, 'h1');
    expect(replay.kind).toBe('REPLAY');
    if (replay.kind === 'REPLAY') {
      expect(replay.record.resultHash).toBe('ambiguous-result-hash');
    }
  });
});
