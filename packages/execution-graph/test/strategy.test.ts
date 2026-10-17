import { describe, expect, it } from 'vitest';
import {
  buildStrategyAdvisory,
  resolveStrategyDirectives,
  strategyAdvisoryDigest,
  validateStrategyDemandShape,
  validateStrategyProgram,
  ValidationError,
  isStrategyDirectiveKind,
} from '../src/index.ts';
import type { StrategyAdvisory, StrategyDemandShape } from '../src/index.ts';
import type { Equal, Expect } from './type-utils.js';
import { NOW, STRATEGY_PROGRAM } from './fixtures.ts';

/**
 * The STRATEGY MODEL (P3-W2 — NET-NEW for the 3.0 law): strategies answer
 * WHAT (settle-now, batch, net-later, hold-for-review); every strategy
 * artifact is structurally advisory (advisoryOnly/authoritative literals).
 */
function demand(overrides?: Partial<StrategyDemandShape>): StrategyDemandShape {
  return {
    demandId: 'd1',
    amountMinor: 100_000n,
    currency: 'EUR',
    direction: 'OUTBOUND',
    deadlineMs: 60_000,
    ...overrides,
  };
}

describe('the strategy model (P3-W2 — strategies answer WHAT)', () => {
  it('the directive vocabulary is closed and guarded', () => {
    expect(isStrategyDirectiveKind('SETTLE_NOW')).toBe(true);
    expect(isStrategyDirectiveKind('BATCH')).toBe(true);
    expect(isStrategyDirectiveKind('NET_LATER')).toBe(true);
    expect(isStrategyDirectiveKind('HOLD_FOR_REVIEW')).toBe(true);
    expect(isStrategyDirectiveKind('SETTLE_LATER')).toBe(false);
    expect(isStrategyDirectiveKind(7)).toBe(false);
  });

  it('zero delay tolerance prescribes SETTLE_NOW', () => {
    const directives = resolveStrategyDirectives(STRATEGY_PROGRAM, demand());
    expect(directives.map((entry) => entry.kind)).toEqual(['SETTLE_NOW']);
    expect(directives[0]!.rationale).toContain('delayToleranceSteps=0');
  });

  it('netting with deferral prescribes BATCH + NET_LATER with the window', () => {
    const program = { ...STRATEGY_PROGRAM, useNetting: true, delayToleranceSteps: 2 };
    const directives = resolveStrategyDirectives(program, demand());
    expect(directives.map((entry) => entry.kind)).toEqual(['BATCH', 'NET_LATER']);
    expect(directives[0]!.parameters.windowSteps).toBe(2);
    expect(directives[1]!.parameters.deferSteps).toBe(2);
  });

  it('deferral without netting prescribes NET_LATER alone', () => {
    const program = { ...STRATEGY_PROGRAM, useNetting: false, delayToleranceSteps: 1 };
    const directives = resolveStrategyDirectives(program, demand());
    expect(directives.map((entry) => entry.kind)).toEqual(['NET_LATER']);
    expect(directives[0]!.parameters.deferSteps).toBe(1);
  });

  it('approval-gated demands are HELD FOR REVIEW first (advisory hold)', () => {
    const directives = resolveStrategyDirectives(STRATEGY_PROGRAM, demand({ requiresApproval: true }));
    expect(directives.map((entry) => entry.kind)).toEqual(['HOLD_FOR_REVIEW', 'SETTLE_NOW']);
    expect(directives[0]!.parameters.reason).toContain('approval');
  });

  it('every directive is structurally advisory — advisoryOnly is the literal true', () => {
    const directives = resolveStrategyDirectives(
      { ...STRATEGY_PROGRAM, useNetting: true, delayToleranceSteps: 2 },
      demand(),
    );
    for (const directive of directives) {
      expect(directive.advisoryOnly).toBe(true);
    }
    type AlwaysAdvisory = Expect<
      Equal<(typeof directives)[number]['advisoryOnly'], true>
    >;
    void ({} as AlwaysAdvisory | void);
  });

  it('the advisory envelope is structurally non-authoritative and deterministic', () => {
    const program = { ...STRATEGY_PROGRAM, useNetting: true, delayToleranceSteps: 2 };
    const advisoryA: StrategyAdvisory = buildStrategyAdvisory(program, demand(), NOW);
    const advisoryB: StrategyAdvisory = buildStrategyAdvisory(program, demand(), NOW);
    expect(advisoryA).toEqual(advisoryB);
    expect(advisoryA.digest).toBe(advisoryB.digest);
    expect(advisoryA.digest).toBe(strategyAdvisoryDigest(program, advisoryA.directives));
    expect(advisoryA.authoritative).toBe(false);
    type NeverAuthoritative = Expect<Equal<StrategyAdvisory['authoritative'], false>>;
    void ({} as NeverAuthoritative | void);
    // The advisory id is content-derived (stable identity).
    expect(advisoryA.advisoryId).toBe(`strategy-advisory:${advisoryA.digest}`);
  });

  it('validates programs and demand shapes fail-closed', () => {
    expect(() =>
      validateStrategyProgram({ ...STRATEGY_PROGRAM, delayToleranceSteps: -1 }),
    ).toThrow(ValidationError);
    expect(() =>
      validateStrategyProgram({ ...STRATEGY_PROGRAM, authorizationMode: 'FORGED' as never }),
    ).toThrow(/DECLARED_BYPASS/);
    expect(() =>
      validateStrategyProgram({ ...STRATEGY_PROGRAM, routePreference: ['', 'x'] }),
    ).toThrow(ValidationError);
    expect(() =>
      validateStrategyDemandShape({ ...demand(), amountMinor: 0n }),
    ).toThrow(ValidationError);
    expect(() =>
      validateStrategyDemandShape({ ...demand(), deadlineMs: 0 }),
    ).toThrow(ValidationError);
    expect(validateStrategyProgram(STRATEGY_PROGRAM)).toBe(STRATEGY_PROGRAM);
    expect(validateStrategyDemandShape(demand())).toBeDefined();
  });
});
