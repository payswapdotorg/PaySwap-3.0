import { describe, expect, it } from 'vitest';
import {
  accumulateRobustnessEvidence,
  defaultEvaluationSpec,
  evaluateRun,
  runSimulation,
} from '../src/index.ts';
import type { StrategyProgram, SimulatedWorld } from '../src/index.ts';
import { STRATEGY_PROGRAM, WORLD } from './fixtures.ts';

/**
 * Evaluator: HARD CONSTRAINTS PRECEDE OPTIMIZATION (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/lab/test/evaluator.test.ts, W2-004 — 9
 * tests ported) + robustness evidence. The 3.0 adaptation strengthens
 * robustness accumulation: evaluations of FOREIGN programs are rejected
 * (robustness is per-program), so the mixed run uses ONE program whose
 * constraints differ by scenario.
 */
const EVAL_WORLD: SimulatedWorld = Object.freeze({
  worldId: 'eval-world',
  baseCurrency: 'EUR',
  stepLatencyMs: 100,
  rails: [
    {
      railId: 'rail-cheap',
      currency: 'EUR',
      latencyMs: 900,
      fixedFeeMinor: 1n,
      variableFeeBps: 1n,
    },
    {
      railId: 'rail-pricey',
      currency: 'EUR',
      latencyMs: 200,
      fixedFeeMinor: 90n,
      variableFeeBps: 90n,
    },
  ],
  pools: [
    { poolId: 'pool-cheap', railId: 'rail-cheap', availableMinor: 1_000_000n },
    { poolId: 'pool-pricey', railId: 'rail-pricey', availableMinor: 1_000_000n },
  ],
});

const GOOD_PROGRAM: StrategyProgram = {
  ...STRATEGY_PROGRAM,
  routePreference: ['rail-pricey', 'rail-cheap'],
};

// A cheap-but-lawless program: routes on the cheapest rail, but lets the
// fraudulent demand through (compliance violation) and bypasses
// authorization on every settled demand.
const LAWLESS_PROGRAM: StrategyProgram = {
  ...STRATEGY_PROGRAM,
  programId: 'lawless',
  routePreference: ['rail-cheap'],
  fraudScreening: false,
  authorizationMode: 'DECLARED_BYPASS',
};

const SCENARIO = {
  scenarioId: 'eval-scenario',
  demands: [
    {
      demandId: 'd1',
      atStep: 0,
      amountMinor: 100n,
      currency: 'EUR',
      direction: 'OUTBOUND' as const,
      deadlineMs: 60_000,
      adversarial: 'FRAUD' as const,
    },
    {
      demandId: 'd2',
      atStep: 0,
      amountMinor: 300_000n,
      currency: 'EUR',
      direction: 'INBOUND' as const,
      deadlineMs: 60_000,
    },
  ],
  incidents: [],
};

describe('hard constraints are evaluated BEFORE optimization', () => {
  it('phases is an ordered tuple: HARD_CONSTRAINTS first, then OPTIMIZATION', () => {
    const run = runSimulation({
      scenario: SCENARIO,
      world: EVAL_WORLD,
      program: GOOD_PROGRAM,
      seed: 'eval-seed',
    });
    const evaluation = evaluateRun({
      run,
      program: GOOD_PROGRAM,
      spec: defaultEvaluationSpec(),
    });
    expect(evaluation.phases[0]?.phase).toBe('HARD_CONSTRAINTS');
    expect(evaluation.phases[1]?.phase).toBe('OPTIMIZATION');
  });

  it('a hard-constraint failure disqualifies a candidate even with a BETTER optimization score', () => {
    const spec = defaultEvaluationSpec();
    const goodRun = runSimulation({
      scenario: SCENARIO,
      world: EVAL_WORLD,
      program: GOOD_PROGRAM,
      seed: 'eval-seed',
    });
    const lawlessRun = runSimulation({
      scenario: SCENARIO,
      world: EVAL_WORLD,
      program: LAWLESS_PROGRAM,
      seed: 'eval-seed',
    });
    const good = evaluateRun({ run: goodRun, program: GOOD_PROGRAM, spec });
    const lawless = evaluateRun({ run: lawlessRun, program: LAWLESS_PROGRAM, spec });

    // The lawless program is genuinely CHEAPER on the optimization
    // objectives (cheapest rail, fewer hops)...
    expect(lawless.totalOptimizationScoreMinor).toBeLessThan(good.totalOptimizationScoreMinor);
    // ...but it fails the hard constraints and is disqualified.
    expect(lawless.passed).toBe(false);
    expect(lawless.passedHardConstraints).toBe(false);
    expect(good.passed).toBe(true);

    const failures = lawless.phases[0]?.results.filter((result) => !result.passed) ?? [];
    const failedIds = failures.map((result) => result.constraintId).sort();
    expect(failedIds).toEqual(['AUTHORIZATION', 'COMPLIANCE']);
    expect(lawless.phases[1]?.disqualificationNote).toContain('informational only');
  });

  it('evaluation is deterministic and content-digested', () => {
    const spec = defaultEvaluationSpec();
    const run = runSimulation({
      scenario: SCENARIO,
      world: EVAL_WORLD,
      program: GOOD_PROGRAM,
      seed: 'eval-seed',
    });
    const a = evaluateRun({ run, program: GOOD_PROGRAM, spec });
    const b = evaluateRun({ run, program: GOOD_PROGRAM, spec });
    expect(a).toEqual(b);
    expect(a.digest).toBe(b.digest);
  });

  it('the aggregate optimization score is exact integer minor units (INV-02)', () => {
    const run = runSimulation({
      scenario: SCENARIO,
      world: EVAL_WORLD,
      program: GOOD_PROGRAM,
      seed: 'eval-seed',
    });
    const evaluation = evaluateRun({
      run,
      program: GOOD_PROGRAM,
      spec: defaultEvaluationSpec(),
    });
    expect(typeof evaluation.totalOptimizationScoreMinor).toBe('bigint');
    for (const contribution of evaluation.phases[1]?.contributions ?? []) {
      expect(contribution.contributionMinor).toBe(
        contribution.observedMinor * contribution.weightBps,
      );
    }
  });
});

describe('domain-specific hard constraints (deadline, explicit credit)', () => {
  it('an undeclared credit draw violates EXPLICIT_CREDIT', () => {
    const world: SimulatedWorld = {
      ...WORLD,
      pools: [{ poolId: 'pool-cheap', railId: 'rail-eur', availableMinor: 10_000n }],
    };
    const program: StrategyProgram = {
      ...GOOD_PROGRAM,
      useNetworkCredit: false,
    };
    const run = runSimulation({
      scenario: SCENARIO,
      world,
      program,
      seed: 'eval-seed',
    });
    // No credit is possible without the declaration: d2 falls over to the
    // USD rail (or fails) — either way creditExposure stays 0.
    expect(run.metrics.creditExposureMinor).toBe(0n);
    const spec = {
      ...defaultEvaluationSpec(),
      hardConstraints: [
        { constraintId: 'EXPLICIT_CREDIT' as const, description: 'credit must be declared' },
      ],
    };
    const evaluation = evaluateRun({ run, program, spec });
    expect(evaluation.passed).toBe(true);

    // The mirror case: credit IS drawn and declared -> also passes.
    const creditProgram: StrategyProgram = {
      ...GOOD_PROGRAM,
      routePreference: ['rail-eur'],
      useNetworkCredit: true,
    };
    const creditRun = runSimulation({
      scenario: SCENARIO,
      world,
      program: creditProgram,
      seed: 'eval-seed',
    });
    const creditEvaluation = evaluateRun({
      run: creditRun,
      program: creditProgram,
      spec,
    });
    expect(creditEvaluation.passed).toBe(true);
  });

  it('a deadline miss violates the DEADLINE hard constraint when the spec declares it', () => {
    const tightScenario = {
      ...SCENARIO,
      demands: [
        {
          demandId: 'd-late',
          atStep: 0,
          amountMinor: 100_000n,
          currency: 'EUR',
          direction: 'OUTBOUND' as const,
          deadlineMs: 10,
        },
      ],
    };
    const run = runSimulation({
      scenario: tightScenario,
      world: EVAL_WORLD,
      program: GOOD_PROGRAM,
      seed: 'eval-seed',
    });
    expect(run.metrics.deadlineMisses).toBe(1);
    const spec = {
      ...defaultEvaluationSpec(),
      hardConstraints: [
        { constraintId: 'DEADLINE' as const, description: 'no deadline misses' },
      ],
    };
    const evaluation = evaluateRun({ run, program: GOOD_PROGRAM, spec });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.phases[0]?.results[0]?.constraintId).toBe('DEADLINE');
  });
});

describe('robustness evidence', () => {
  it('accumulates across scenarios and seeds, tracking worst case and spread', () => {
    const spec = defaultEvaluationSpec();
    const evaluations = ['seed-a', 'seed-b', 'seed-c'].flatMap((seed) =>
      [SCENARIO, { ...SCENARIO, scenarioId: 'eval-scenario-2' }].map((scenario) => {
        const run = runSimulation({ scenario, world: EVAL_WORLD, program: GOOD_PROGRAM, seed });
        return evaluateRun({ run, program: GOOD_PROGRAM, spec });
      }),
    );
    const robustness = accumulateRobustnessEvidence({
      programId: GOOD_PROGRAM.programId,
      programVersion: GOOD_PROGRAM.programVersion,
      evaluations,
    });
    expect(robustness.totalRuns).toBe(6);
    expect(robustness.passedRuns).toBe(6);
    expect(robustness.allPassed).toBe(true);
    expect(robustness.worstScoreMinor).not.toBeUndefined();
    expect(robustness.scoreSpreadMinor).not.toBeUndefined();
  });

  it('one failing run makes allPassed false — a single lucky run is not robustness', () => {
    // 3.0 adaptation: robustness is per-program (foreign evaluations are
    // rejected), so the mixed pass/fail uses ONE program whose DEADLINE
    // constraint differs by scenario (a tight deadline misses; a normal
    // one does not).
    const spec = {
      ...defaultEvaluationSpec(),
      hardConstraints: [
        ...defaultEvaluationSpec().hardConstraints,
        { constraintId: 'DEADLINE' as const, description: 'no deadline misses' },
      ],
    };
    const normalRun = runSimulation({
      scenario: SCENARIO,
      world: EVAL_WORLD,
      program: GOOD_PROGRAM,
      seed: 'seed-a',
    });
    const tightScenario = {
      ...SCENARIO,
      demands: [
        {
          demandId: 'd-late',
          atStep: 0,
          amountMinor: 100_000n,
          currency: 'EUR',
          direction: 'OUTBOUND' as const,
          deadlineMs: 10,
        },
      ],
    };
    const tightRun = runSimulation({
      scenario: tightScenario,
      world: EVAL_WORLD,
      program: GOOD_PROGRAM,
      seed: 'seed-a',
    });
    const robustness = accumulateRobustnessEvidence({
      programId: GOOD_PROGRAM.programId,
      programVersion: GOOD_PROGRAM.programVersion,
      evaluations: [
        evaluateRun({ run: normalRun, program: GOOD_PROGRAM, spec }),
        evaluateRun({ run: tightRun, program: GOOD_PROGRAM, spec }),
      ],
    });
    expect(robustness.totalRuns).toBe(2);
    expect(robustness.passedRuns).toBe(1);
    expect(robustness.allPassed).toBe(false);

    // And a foreign evaluation is refused outright (robustness is per-program).
    expect(() =>
      accumulateRobustnessEvidence({
        programId: 'some-other-program',
        programVersion: '1.0.0',
        evaluations: [evaluateRun({ run: normalRun, program: GOOD_PROGRAM, spec })],
      }),
    ).toThrow(/SAME program/);
  });

  it('robustness evidence is deterministic', () => {
    const spec = defaultEvaluationSpec();
    const build = () => {
      const run = runSimulation({
        scenario: SCENARIO,
        world: EVAL_WORLD,
        program: GOOD_PROGRAM,
        seed: 'seed-a',
      });
      return accumulateRobustnessEvidence({
        programId: GOOD_PROGRAM.programId,
        programVersion: GOOD_PROGRAM.programVersion,
        evaluations: [evaluateRun({ run, program: GOOD_PROGRAM, spec })],
      });
    };
    expect(build()).toEqual(build());
  });
});
