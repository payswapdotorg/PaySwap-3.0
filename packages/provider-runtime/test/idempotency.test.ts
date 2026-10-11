import { describe, expect, it } from 'vitest';
import {
  IdempotencyContractRegistry,
  deriveIdempotencyKey,
} from '../src/idempotency.ts';
import {
  InMemoryIdempotencyRegistrar,
  idempotencyScopeKey,
} from '../src/idempotency-registrar.ts';
import { IdempotencyKeyConflictError, ValidationError } from '../src/errors.ts';

const now = 1_000n;
const contract = {
  operationId: 'psp.create_transfer',
  keyScope: { connection: true, operation: true },
  keyDerivation: 'NAMESPACED_COMMAND_ID',
  replayBehavior: 'REPLAYS_ORIGINAL_RESULT',
  conflictReporting: 'PROVIDER_CONFLICT_SIGNAL',
} as const;
const evidenceFieldContract = {
  operationId: 'psp.create_payout',
  keyScope: { connection: true, operation: false },
  keyDerivation: 'CALLER_SUPPLIED_PROVIDER_FIELD',
  replayBehavior: 'HARMLESS_NOOP_ACKNOWLEDGEMENT',
  conflictReporting: 'LOCAL_CONFLICT_DETECTION',
  providerEvidenceField: 'customerTransactionId',
} as const;

function beginInput(overrides?: Partial<Parameters<InMemoryIdempotencyRegistrar['begin']>[0]>) {
  return {
    contract,
    connectionId: 'conn:1',
    commandId: 'cmd-1',
    correlationId: 'corr-1',
    idempotencyKey: 'payswap:cmd-1',
    command: { amount: 1000, currency: 'USD' },
    now,
    ...overrides,
  };
}

describe('the contract registry is per-operation and fail-closed', () => {
  it('registers contracts and requires them per operation (NO universal fallback)', () => {
    const registry = new IdempotencyContractRegistry();
    registry.register(contract);
    expect(registry.has('psp.create_transfer')).toBe(true);
    expect(registry.require('psp.create_transfer').operationId).toBe('psp.create_transfer');
    expect(() => registry.require('psp.other_operation')).toThrow(
      /NO universal fallback/,
    );
    expect(registry.list()).toHaveLength(1);
  });

  it('CALLER_SUPPLIED_PROVIDER_FIELD derivation requires the provider field name', () => {
    const registry = new IdempotencyContractRegistry();
    const { providerEvidenceField: _omit, ...withoutField } = evidenceFieldContract;
    expect(() => registry.register(withoutField)).toThrow(ValidationError);
    expect(() => registry.register(evidenceFieldContract)).not.toThrow();
    expect(registry.require('psp.create_payout').providerEvidenceField).toBe(
      'customerTransactionId',
    );
  });

  it('re-registering the IDENTICAL contract is idempotent; a different one throws', () => {
    const registry = new IdempotencyContractRegistry();
    registry.register(contract);
    expect(() => registry.register(contract)).not.toThrow();
    expect(() =>
      registry.register({ ...contract, replayBehavior: 'HARMLESS_NOOP_ACKNOWLEDGEMENT' }),
    ).toThrow(ValidationError);
  });

  it('malformed contracts fail closed', () => {
    const registry = new IdempotencyContractRegistry();
    expect(() => registry.register(null as never)).toThrow(ValidationError);
    expect(() =>
      registry.register({ ...contract, keyDerivation: 'MAGIC' as never }),
    ).toThrow(ValidationError);
    expect(() =>
      registry.register({ ...contract, replayBehavior: 'WHATEVER' as never }),
    ).toThrow(ValidationError);
    expect(() =>
      registry.register({ ...contract, conflictReporting: 'SILENT' as never }),
    ).toThrow(ValidationError);
  });
});

describe('key derivation follows each operation contract (never one mechanism)', () => {
  it('NAMESPACED_COMMAND_ID derives payswap:<commandId> deterministically', () => {
    expect(deriveIdempotencyKey(contract, 'cmd-1')).toBe('payswap:cmd-1');
    expect(deriveIdempotencyKey(contract, 'cmd-1')).toBe('payswap:cmd-1');
    expect(() => deriveIdempotencyKey(contract, '')).toThrow(ValidationError);
  });

  it('CALLER_SUPPLIED_PROVIDER_FIELD passes the command id through as provider evidence', () => {
    expect(deriveIdempotencyKey(evidenceFieldContract, 'cmd-77')).toBe('cmd-77');
  });

  it('the scope key folds ONLY the dimensions the provider contract names', () => {
    expect(idempotencyScopeKey(contract, 'conn:1', 'payswap:cmd-1')).toBe(
      'op:psp.create_transfer|conn:conn:1|key:payswap:cmd-1',
    );
    expect(idempotencyScopeKey(evidenceFieldContract, 'conn:1', 'cmd-77')).toBe(
      'conn:conn:1|key:cmd-77',
    );
  });
});

describe('the registrar: the INV-06 decision point (per-operation scope)', () => {
  it('BEGIN on first submission; REPLAY while IN_FLIGHT; CONFLICT on different body', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    expect(registrar.begin(beginInput()).kind).toBe('BEGIN');
    expect(registrar.begin(beginInput()).kind).toBe('REPLAY');
    const conflict = registrar.begin(
      beginInput({ command: { amount: 2000, currency: 'USD' } }),
    );
    expect(conflict.kind).toBe('CONFLICT');
  });

  it('COMPLETED replays the recorded provider references exactly (no second effect)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(beginInput());
    const record = registrar.complete({
      contract,
      connectionId: 'conn:1',
      idempotencyKey: 'payswap:cmd-1',
      providerReferences: ['trf_123'],
      now: now + 1n,
    });
    expect(record.status).toBe('COMPLETED');
    expect([...record.providerReferences]).toEqual(['trf_123']);
    const replay = registrar.begin(beginInput());
    expect(replay.kind).toBe('REPLAY');
    if (replay.kind === 'REPLAY') {
      expect(replay.record.status).toBe('COMPLETED');
      expect([...replay.record.providerReferences]).toEqual(['trf_123']);
    }
  });

  it('a different connection namespace does NOT collide (per-account key scope)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(beginInput());
    const other = registrar.begin(
      beginInput({ connectionId: 'conn:2', commandId: 'cmd-1', idempotencyKey: 'payswap:cmd-1' }),
    );
    expect(other.kind).toBe('BEGIN');
  });

  it('FAILED re-arms for retry under the same hash; COMPLETED never re-executes', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(beginInput());
    registrar.fail({ contract, connectionId: 'conn:1', idempotencyKey: 'payswap:cmd-1', now: now + 1n });
    expect(registrar.begin(beginInput()).kind).toBe('BEGIN');
    registrar.complete({
      contract,
      connectionId: 'conn:1',
      idempotencyKey: 'payswap:cmd-1',
      providerReferences: ['trf_1'],
      now: now + 2n,
    });
    expect(registrar.begin(beginInput()).kind).toBe('REPLAY');
  });

  it('complete is idempotent for the identical result and a conflict otherwise', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(beginInput());
    const input = { contract, connectionId: 'conn:1', idempotencyKey: 'payswap:cmd-1' };
    registrar.complete({ ...input, providerReferences: ['trf_1'], now: now + 1n });
    expect(() =>
      registrar.complete({ ...input, providerReferences: ['trf_1'], now: now + 2n }),
    ).not.toThrow();
    expect(() =>
      registrar.complete({ ...input, providerReferences: ['trf_2'], now: now + 3n }),
    ).toThrow(IdempotencyKeyConflictError);
  });

  it('AMBIGUOUS keeps the record occupied (duplicate commands never re-execute)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(beginInput());
    registrar.markAmbiguous({ contract, connectionId: 'conn:1', idempotencyKey: 'payswap:cmd-1', now: now + 1n });
    const replay = registrar.begin(beginInput());
    expect(replay.kind).toBe('REPLAY');
    if (replay.kind === 'REPLAY') {
      expect(replay.record.status).toBe('AMBIGUOUS');
      expect(replay.record.ambiguousSince).toBe(now + 1n);
    }
    // The AMBIGUOUS record still resolves to completed/failed through
    // reconciliation evidence — the registrar records the exits.
    registrar.complete({
      contract,
      connectionId: 'conn:1',
      idempotencyKey: 'payswap:cmd-1',
      providerReferences: ['trf_1'],
      now: now + 2n,
    });
    expect(registrar.begin(beginInput()).kind).toBe('REPLAY');
  });

  it('impossible state transitions throw (fail after complete; ambiguous after complete)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(beginInput());
    const input = { contract, connectionId: 'conn:1', idempotencyKey: 'payswap:cmd-1' };
    registrar.complete({ ...input, providerReferences: ['trf_1'], now: now + 1n });
    expect(() => registrar.fail({ ...input, now: now + 2n })).toThrow(ValidationError);
    expect(() => registrar.markAmbiguous({ ...input, now: now + 3n })).toThrow(ValidationError);
    expect(() => registrar.fail({ contract, connectionId: 'conn:404', idempotencyKey: 'x', now })).toThrow(
      ValidationError,
    );
    expect(() =>
      registrar.complete({ contract, connectionId: 'conn:404', idempotencyKey: 'x', providerReferences: [], now }),
    ).toThrow(ValidationError);
  });

  it('records persist the Wise §4.4 identifier set (command/correlation/key/refs)', () => {
    const registrar = new InMemoryIdempotencyRegistrar();
    registrar.begin(beginInput());
    registrar.complete({
      contract,
      connectionId: 'conn:1',
      idempotencyKey: 'payswap:cmd-1',
      providerReferences: ['trf_9'],
      now: now + 1n,
    });
    const record = registrar.list()[0];
    expect(record).toBeDefined();
    expect(record?.commandId).toBe('cmd-1');
    expect(record?.correlationId).toBe('corr-1');
    expect(record?.idempotencyKey).toBe('payswap:cmd-1');
    expect(record?.operationId).toBe('psp.create_transfer');
    expect(record?.lastTransitionAt).toBe(now + 1n);
    expect(record?.commandHash).toHaveLength(16);
  });
});
