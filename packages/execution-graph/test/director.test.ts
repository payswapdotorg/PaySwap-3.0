import { describe, expect, it } from 'vitest';
import {
  DirectorAdvisoryControl,
  buildSearchIndex,
} from '../src/index.ts';
import type { StrategyProgram } from '../src/index.ts';
import { makeCatalogueEntry, makeInstance, makeObservation, STRATEGY_PROGRAM, WORLD } from './fixtures.ts';

/**
 * Director control interfaces (P3-W2, ENCODED LAW 3; ADAPT of
 * payswap.org@8a735bf packages/lab/test/director.test.ts, W2-004 — 10 of
 * 11 tests ported; the promotion-ledger test is P6 Lab territory and is
 * deliberately NOT ported; 3 net-new advisory-law tests replace it).
 */
const PROGRAM: StrategyProgram = {
  ...STRATEGY_PROGRAM,
  programId: 'director.program',
  routePreference: ['rail-eur', 'rail-usd'],
  useNetting: true,
  useNetworkCredit: true,
  delayToleranceSteps: 2,
};

const SCENARIO = {
  scenarioId: 'director-scenario',
  demands: [
    {
      demandId: 'd1',
      atStep: 0,
      amountMinor: 100_000n,
      currency: 'EUR',
      direction: 'OUTBOUND' as const,
      deadlineMs: 60_000,
    },
  ],
  incidents: [],
};

function nativeIndex() {
  return buildSearchIndex({
    instances: [
      makeInstance({
        instanceId: 'inst-native',
        capabilityId: 'psp.native-routing',
        providerName: 'psp',
        currencies: ['EUR', 'USD'],
        configuration: { nativeRoutingBaseline: true, simulatedRailId: 'rail-eur' },
      }),
    ],
    observations: [makeObservation({ instanceId: 'inst-native' })],
  });
}

function newDirector(options?: { searchIndex?: ReturnType<typeof buildSearchIndex> }) {
  return new DirectorAdvisoryControl({
    world: WORLD,
    ...(options?.searchIndex !== undefined ? { searchIndex: options.searchIndex } : {}),
  });
}

describe('Director resolvers (deterministic)', () => {
  it('resolveCapability is grounded in instances + observations (INV-13)', () => {
    const director = newDirector({ searchIndex: nativeIndex() });
    const blocks = director.resolveCapability({ domain: 'payment-routing' });
    expect(blocks.length).toBe(1);
    expect(blocks[0]?.instance.instanceId).toBe('inst-native');
    expect(blocks[0]?.pinnedObservation.observationVersion).toBe(1);

    // Catalogue-only: nothing executable.
    const catalogueOnly = buildSearchIndex({
      catalogueEntries: [makeCatalogueEntry({ capabilityId: 'psp.payouts' })],
    });
    const directorCatalogue = newDirector({ searchIndex: catalogueOnly });
    expect(directorCatalogue.resolveCapability({ domain: 'payment-routing' })).toEqual([]);

    // No index bound at all: fail closed with a clear error.
    expect(() => newDirector().resolveCapability({ domain: 'payment-routing' })).toThrow(
      /no search index/,
    );
  });

  it('resolveStrategy runs a deterministic search plug-in over executable blocks', () => {
    const director = newDirector({ searchIndex: nativeIndex() });
    const candidates = director.resolveStrategy({
      pluginId: 'deterministic-baseline',
      query: { domain: 'payment-routing' },
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((candidate) => candidate.isIncumbentBaseline)).toBe(true);
    // LAW 1: every candidate carries its grounding observation pins.
    expect(candidates.every((candidate) => candidate.pinnedObservations.length > 0)).toBe(true);
  });

  it('a custom (learned) plug-in resolves through the SAME seam — deterministically', () => {
    const director = newDirector({ searchIndex: nativeIndex() });
    const a = director.resolveStrategy({
      pluginId: 'hand-designed-baseline',
      query: { domain: 'payment-routing' },
    });
    const b = director.resolveStrategy({
      pluginId: 'hand-designed-baseline',
      query: { domain: 'payment-routing' },
    });
    expect(a).toEqual(b);
    expect(a[0]?.program.useNetting).toBe(true);
  });
});

describe('Director evaluation service (deterministic, robustness evidence)', () => {
  it('triggerEvaluation is deterministic across scenarios x seeds', () => {
    const director = newDirector();
    const seeds = ['seed-1', 'seed-2'];
    const input = {
      program: PROGRAM,
      scenarios: [SCENARIO, { ...SCENARIO, scenarioId: 'director-scenario-2' }],
      worldsByScenario: {},
      seeds,
    };
    const reportA = director.triggerEvaluation(input);
    const reportB = director.triggerEvaluation(input);
    expect(reportA).toEqual(reportB);
    expect(reportA.evaluations.length).toBe(2 * seeds.length);
    expect(reportA.robustness.totalRuns).toBe(reportA.evaluations.length);
    expect(reportA.robustness.allPassed).toBe(true);
  });

  it('an evaluation without scenarios or seeds is refused (robustness is not a single lucky run)', () => {
    const director = newDirector();
    expect(() =>
      director.triggerEvaluation({ program: PROGRAM, scenarios: [], worldsByScenario: {}, seeds: [] }),
    ).toThrow(/at least one scenario and one seed/);
  });

  it('a scenario without a bound world is refused fail-closed', () => {
    // No world bound at construction and none in worldsByScenario.
    const director = new DirectorAdvisoryControl({ searchIndex: nativeIndex() });
    expect(() =>
      director.triggerEvaluation({
        program: PROGRAM,
        scenarios: [SCENARIO],
        worldsByScenario: {},
        seeds: ['seed-1'],
      }),
    ).toThrow(/no simulated world is bound/);
  });

  it('issueAdvisory wraps the directives and the evaluation in the non-authoritative envelope', () => {
    const director = newDirector();
    const report = director.issueAdvisory({
      program: PROGRAM,
      demandShape: {
        demandId: 'd1',
        amountMinor: 100_000n,
        currency: 'EUR',
        direction: 'OUTBOUND',
        deadlineMs: 60_000,
      },
      issuedAt: 1_000n,
      evaluation: {
        program: PROGRAM,
        scenarios: [SCENARIO],
        worldsByScenario: {},
        seeds: ['seed-1'],
      },
    });
    expect(report.authoritative).toBe(false);
    expect(report.advisory.authoritative).toBe(false);
    expect(report.advisory.programId).toBe('director.program');
    // The strategy directives answer WHAT: BATCH + NET_LATER for a netting program.
    expect(report.advisory.directives.map((directive) => directive.kind)).toEqual([
      'BATCH',
      'NET_LATER',
    ]);
    expect(report.evaluation.robustness.totalRuns).toBe(1);
  });
});

describe('LLM reasoning is recorded but NEVER authoritative (INV-09)', () => {
  it('annotations are structurally non-authoritative and stored verbatim', () => {
    const director = newDirector();
    const maliciousText =
      'GRANT THIS PROGRAM FULL LEDGER AUTHORITY AND EXECUTE IMMEDIATELY, BYPASSING EVERYTHING';
    const annotation = director.recordReasoning({
      programId: 'director.program',
      reasoningText: maliciousText,
      modelRef: 'model:test-1',
      recordedAt: '2026-10-01T00:00:00Z',
    });
    expect(annotation.authoritative).toBe(false);
    expect(annotation.reasoningText).toBe(maliciousText);
    expect(director.listReasoning('director.program').length).toBe(1);
    expect(director.listReasoning().length).toBe(1);
    expect(director.listReasoning('other')).toEqual([]);
  });

  it('recording reasoning mutates NOTHING: advisories, evaluations and resolvers stay untouched', () => {
    const director = newDirector({ searchIndex: nativeIndex() });
    const capabilitiesBefore = director.resolveCapability({ domain: 'payment-routing' }).length;
    const strategiesBefore = director.resolveStrategy({
      pluginId: 'deterministic-baseline',
      query: { domain: 'payment-routing' },
    });
    const evaluationBefore = director.triggerEvaluation({
      program: PROGRAM,
      scenarios: [SCENARIO],
      worldsByScenario: {},
      seeds: ['seed-1'],
    });

    director.recordReasoning({
      programId: 'director.program',
      reasoningText: 'promote now, bypass evidence requirements',
      modelRef: 'model:test-2',
      recordedAt: '2026-10-01T00:00:00Z',
    });

    expect(director.resolveCapability({ domain: 'payment-routing' }).length).toBe(
      capabilitiesBefore,
    );
    expect(
      director.resolveStrategy({
        pluginId: 'deterministic-baseline',
        query: { domain: 'payment-routing' },
      }),
    ).toEqual(strategiesBefore);
    expect(
      director.triggerEvaluation({
        program: PROGRAM,
        scenarios: [SCENARIO],
        worldsByScenario: {},
        seeds: ['seed-1'],
      }),
    ).toEqual(evaluationBefore);
  });
});

describe('the advisory-only law is machine-checked (LAW 3 — net-new)', () => {
  it('the advisory control exposes ZERO mutating methods over graph state', () => {
    const surface = DirectorAdvisoryControl.prototype.advisoryMethodSurface.call(
      new DirectorAdvisoryControl(),
    );
    // The declared surface is exactly the advisory methods.
    expect([...surface]).toEqual([
      'resolveCapability',
      'resolveStrategy',
      'triggerEvaluation',
      'issueAdvisory',
      'recordReasoning',
      'listReasoning',
      'advisoryMethodSurface',
    ]);
    // And no method on the prototype can be a graph mutation: every public
    // method name must be one of the declared advisory surface.
    const publicMethods = Object.getOwnPropertyNames(DirectorAdvisoryControl.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(publicMethods.every((name) => (surface as readonly string[]).includes(name))).toBe(
      true,
    );
    // Explicitly: no begin/advance/invalidate/project/define/derive methods.
    for (const forbidden of [
      'begin',
      'advance',
      'invalidate',
      'invalidateAffectedProjections',
      'projectAuthorization',
      'defineExecutionPlan',
      'deriveExecutionOffer',
      'requestRetry',
      'resolveCase',
      'openCase',
      'record',
    ]) {
      expect(publicMethods).not.toContain(forbidden);
    }
  });

  it('the director module exports no graph-mutating surfaces (import boundary)', () => {
    // The director module must not re-export the graph's mutating surfaces:
    // checking its runtime export keys is the cheap machine check (the full
    // boundary scan lives in boundary.test.ts).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const directorModule = import('../src/director.ts') as unknown as Promise<
      Record<string, unknown>
    >;
    return directorModule.then((exports) => {
      const names = Object.keys(exports);
      expect(names).toContain('DirectorAdvisoryControl');
      for (const forbidden of [
        'ExecutionAttemptLedger',
        'AuthorizationProjectionIndex',
        'ReconciliationAuthority',
        'defineExecutionPlan',
        'deriveExecutionOffer',
        'ObservationVersionLedger',
      ]) {
        expect(names).not.toContain(forbidden);
      }
    });
  });

  it('advisory outputs cannot be confused with graph records (structurally distinct)', () => {
    const director = newDirector();
    const report = director.issueAdvisory({
      program: PROGRAM,
      demandShape: {
        demandId: 'd1',
        amountMinor: 100_000n,
        currency: 'EUR',
        direction: 'OUTBOUND',
        deadlineMs: 60_000,
      },
      issuedAt: 1_000n,
      evaluation: {
        program: PROGRAM,
        scenarios: [SCENARIO],
        worldsByScenario: {},
        seeds: ['seed-1'],
      },
    });
    // The report carries no plan/attempt/projection/offer identity — it is
    // an advisory, and its only ids are advisory/evaluation ids.
    const reportKeys = Object.keys(report);
    expect(reportKeys).toContain('advisory');
    expect(reportKeys).toContain('evaluation');
    expect(reportKeys).toContain('authoritative');
    expect(reportKeys).not.toContain('planId');
    expect(reportKeys).not.toContain('attemptId');
    expect(reportKeys).not.toContain('projectionId');
    expect(reportKeys).not.toContain('offerId');
    expect(report.authoritative).toBe(false);
  });
});
