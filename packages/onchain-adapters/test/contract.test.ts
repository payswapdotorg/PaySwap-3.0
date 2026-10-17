import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.ts';
import { UnsupportedLifecycleStageError } from '../src/errors.ts';
import { validateLifecycleDeclaration } from '../src/lifecycle/declaration.ts';
import { lifecycleStageDeclared } from '../src/contract/stages.ts';
import { evmAdapter, solanaAdapter, utxoAdapter } from './fixtures/adapters.ts';
import { NOW } from './fixtures/world.ts';

/**
 * The frozen family-adapter contract laws (ported from the old
 * contract.test.ts): every family declares its lifecycle EXPLICITLY;
 * unsupported stages fail closed; evidence is append-only.
 */
describe('the frozen family-adapter contract', () => {
  const families = [
    { name: 'EVM', adapter: () => evmAdapter() },
    { name: 'SOLANA', adapter: () => solanaAdapter() },
    { name: 'UTXO', adapter: () => utxoAdapter() },
  ] as const;

  for (const family of families) {
    it(`${family.name}: every lifecycle stage is EXPLICITLY declared true/false`, () => {
      const adapter = family.adapter();
      for (const stage of [
        'observe',
        'prepare',
        'simulate',
        'authorize',
        'broadcast',
        'observeResult',
        'finality',
        'reconcile',
        'evidence',
      ] as const) {
        expect(typeof adapter.lifecycle[stage]).toBe('boolean');
      }
      expect(lifecycleStageDeclared(adapter, 'observe')).toBe(true);
      expect(lifecycleStageDeclared(adapter, 'reconcile')).toBe(true);
    });

    it(`${family.name}: identity, family and environment are declared and consistent`, () => {
      const adapter = family.adapter();
      expect(adapter.adapterId).toBe(`adapter:${family.name.toLowerCase()}:test`);
      expect(adapter.family).toBe(family.name);
      expect(adapter.chainKey).toBeDefined();
      expect(adapter.environment.chainKey).toBe(adapter.chainKey);
      expect(adapter.environment.environmentClass).toBe('PRODUCTION');
    });

    it(`${family.name}: explicit semantics profile (fee + finality + reorg/fork)`, () => {
      const adapter = family.adapter();
      expect(adapter.semantics.family).toBe(family.name);
      expect(adapter.semantics.finality.finalityModel).toBe('PROBABILISTIC');
      if (adapter.semantics.fee.expressible === false) {
        expect(adapter.semantics.fee.reason.length).toBeGreaterThan(0);
      }
    });

    it(`${family.name}: evidence() returns append-only, frozen entries`, async () => {
      const adapter = family.adapter();
      expect(adapter.evidence()).toEqual([]);
      const probe = await adapter.observeChainHead({ at: new Date(NOW).toISOString() });
      expect(probe.kind).toBe('HEAD_OBSERVED');
      const entries = adapter.evidence();
      expect(entries.length).toBeGreaterThan(0);
      expect(Object.isFrozen(entries)).toBe(true);
      for (const entry of entries) {
        expect(Object.isFrozen(entry)).toBe(true);
        expect(entry.adapterId).toBe(adapter.adapterId);
      }
    });
  }

  it('an undeclared lifecycle stage never validates (fail closed)', () => {
    expect(() => validateLifecycleDeclaration(null)).toThrow(ValidationError);
    expect(() =>
      validateLifecycleDeclaration({
        observe: true,
        prepare: true,
        // simulate missing — never guessed
        authorize: true,
        broadcast: true,
        observeResult: true,
        finality: true,
        reconcile: true,
        evidence: true,
      }),
    ).toThrow(/EXPLICIT for every stage/);
    expect(() =>
      validateLifecycleDeclaration({
        observe: 'yes' as unknown as boolean,
        prepare: true,
        simulate: true,
        authorize: true,
        broadcast: true,
        observeResult: true,
        finality: true,
        reconcile: true,
        evidence: true,
      }),
    ).toThrow(ValidationError);
  });

  it('the UTXO family declares simulate UNSUPPORTED and fails closed when called', () => {
    const adapter = utxoAdapter();
    expect(adapter.lifecycle.simulate).toBe(false);
    expect(() => adapter.simulate()).toThrow(UnsupportedLifecycleStageError);
    // EVM and Solana DO declare simulation support.
    expect(evmAdapter().lifecycle.simulate).toBe(true);
    expect(solanaAdapter().lifecycle.simulate).toBe(true);
  });

  it('the operation lifecycle view exposes the pure state machine (IDLE before any stage)', () => {
    const adapter = evmAdapter();
    expect(adapter.operationLifecycle('exec-unseen')).toBe('IDLE');
  });
});
