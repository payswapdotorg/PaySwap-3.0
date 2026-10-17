import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  selectExecutableBlocks,
  registerSearchPlugin,
  listSearchPlugins,
  runSearchPlugin,
} from '../src/index.ts';
import type { ExecutionSearchPlugin } from '../src/index.ts';
import type { SimulatedWorld } from '../src/index.ts';
import {
  makeCatalogueEntry,
  makeInstance,
  makeObservation,
} from './fixtures.ts';

/**
 * Search: executable grounding (INV-13), two-axis UNKNOWN (INV-04/07) and
 * incumbent provider-native baselines (INV-15) (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/lab/test/search.test.ts, W2-004 — 18 tests
 * ported; the 3.0 index is instance-grounded, and selections carry the
 * LAW 1 observation pins).
 */
const QUERY = { domain: 'payment-routing' } as const;

/** The baseline world the plug-in economics bind to. */
const BASELINE_WORLD: SimulatedWorld = Object.freeze({
  worldId: 'baseline-world',
  baseCurrency: 'EUR',
  stepLatencyMs: 100,
  rails: [
    { railId: 'rail-a', currency: 'EUR', latencyMs: 300, fixedFeeMinor: 30n, variableFeeBps: 10n },
    { railId: 'rail-b', currency: 'EUR', latencyMs: 400, fixedFeeMinor: 20n, variableFeeBps: 10n },
    { railId: 'rail-c', currency: 'EUR', latencyMs: 500, fixedFeeMinor: 10n, variableFeeBps: 10n },
    { railId: 'rail-d', currency: 'EUR', latencyMs: 600, fixedFeeMinor: 40n, variableFeeBps: 10n },
  ],
  pools: [
    { poolId: 'pool-a', railId: 'rail-a', availableMinor: 1_000_000n },
    { poolId: 'pool-b', railId: 'rail-b', availableMinor: 1_000_000n },
    { poolId: 'pool-c', railId: 'rail-c', availableMinor: 1_000_000n },
    { poolId: 'pool-d', railId: 'rail-d', availableMinor: 1_000_000n },
  ],
});

function nativeInstance(railId = 'rail-a') {
  return makeInstance({
    instanceId: `inst-${railId}`,
    capabilityId: 'psp.native-routing',
    providerName: 'psp',
    currencies: ['EUR', 'USD'],
    configuration: { nativeRoutingBaseline: true, simulatedRailId: railId },
  });
}

function payoutInstance(capabilityId: string, railId: string) {
  return makeInstance({
    instanceId: `inst-${railId}`,
    capabilityId,
    providerName: 'psp',
    currencies: ['EUR', 'USD'],
    configuration: { simulatedRailId: railId },
  });
}

function nativeSearchIndex() {
  return buildSearchIndex({
    instances: [nativeInstance()],
    observations: [makeObservation({ instanceId: 'inst-rail-a' })],
  });
}

/** All four baseline rails bound to executable instances (native on rail-a). */
function fullBaselineSearchIndex() {
  const bindings: { capabilityId: string; railId: string; native: boolean }[] = [
    { capabilityId: 'psp.native-routing', railId: 'rail-a', native: true },
    { capabilityId: 'psp.payouts-b', railId: 'rail-b', native: false },
    { capabilityId: 'psp.payouts-c', railId: 'rail-c', native: false },
    { capabilityId: 'psp.payouts-d', railId: 'rail-d', native: false },
  ];
  return buildSearchIndex({
    instances: bindings.map((binding) =>
      binding.native
        ? nativeInstance(binding.railId)
        : payoutInstance(binding.capabilityId, binding.railId),
    ),
    observations: bindings.map((binding) =>
      makeObservation({ instanceId: `inst-${binding.railId}` }),
    ),
  });
}

describe('executable grounding (INV-13: instance + observation, never catalogue alone)', () => {
  it('a catalogue entry alone NEVER yields an executable block', () => {
    const index = buildSearchIndex({
      catalogueEntries: [makeCatalogueEntry({ capabilityId: 'psp.payouts' })],
    });
    const { selections, executable } = selectExecutableBlocks(index, QUERY);
    expect(executable).toEqual([]);
    expect(selections.length).toBe(1);
    const selection = selections[0];
    expect(selection?.status).toBe('REJECTED');
    if (selection?.status === 'REJECTED') {
      expect(selection.reason).toBe('CATALOGUE_ENTRY_ONLY');
      expect(selection.catalogueEntry?.catalogueEntryId).toBe('cat-1');
    }
  });

  it('an instance whose capability matches a catalogue entry is still evaluated on its own', () => {
    const index = buildSearchIndex({
      instances: [payoutInstance('psp.payouts', 'rail-b')],
      observations: [makeObservation({ instanceId: 'inst-rail-b' })],
      catalogueEntries: [makeCatalogueEntry({ capabilityId: 'psp.payouts' })],
    });
    const { selections, executable } = selectExecutableBlocks(index, QUERY);
    expect(executable.length).toBe(1); // the instance IS the executable object
    expect(
      selections.filter((selection) => selection.status === 'REJECTED'),
    ).toEqual([]); // the catalogue entry is explained, not duplicated
  });

  it('an instance without a current observation is not executable', () => {
    const index = buildSearchIndex({
      instances: [payoutInstance('psp.payouts', 'rail-b')],
    });
    const { executable, selections } = selectExecutableBlocks(index, QUERY);
    expect(executable).toEqual([]);
    const selection = selections[0];
    expect(selection?.status).toBe('REJECTED');
    if (selection?.status === 'REJECTED') {
      expect(selection.reason).toBe('NO_OBSERVATION');
    }
  });

  it('an ACTIVE instance with a current healthy observation IS executable', () => {
    const index = nativeSearchIndex();
    const { executable } = selectExecutableBlocks(index, QUERY);
    expect(executable.length).toBe(1);
    const block = executable[0];
    expect(block?.instance.instanceId).toBe('inst-rail-a');
    expect(block?.effectiveAvailability).toBe('AVAILABLE');
    expect(block?.instance.capabilityId).toBe('psp.native-routing');
  });

  it('the LATEST observation version wins', () => {
    const index = buildSearchIndex({
      instances: [nativeInstance()],
      observations: [
        makeObservation({ instanceId: 'inst-rail-a', observationVersion: 1, capabilityState: 'UNAVAILABLE' }),
        makeObservation({ instanceId: 'inst-rail-a', observationVersion: 2 }),
      ],
    });
    const { executable } = selectExecutableBlocks(index, QUERY);
    expect(executable.length).toBe(1);
    expect(executable[0]?.observation.observationVersion).toBe(2);
  });

  it('authorization, eligibility, currency and geography scope the instance', () => {
    const revoked = buildSearchIndex({
      instances: [
        makeInstance({
          instanceId: 'inst-x',
          capabilityId: 'psp.payouts',
          authorization: { status: 'REVOKED' },
          configuration: { simulatedRailId: 'rail-b' },
        }),
      ],
      observations: [makeObservation({ instanceId: 'inst-x' })],
    });
    expect(selectExecutableBlocks(revoked, QUERY).executable).toEqual([]);

    const ineligible = buildSearchIndex({
      instances: [
        makeInstance({
          instanceId: 'inst-y',
          capabilityId: 'psp.payouts',
          eligibility: { eligible: false, reasons: ['geo'] },
          configuration: { simulatedRailId: 'rail-b' },
        }),
      ],
      observations: [makeObservation({ instanceId: 'inst-y' })],
    });
    expect(selectExecutableBlocks(ineligible, QUERY).executable).toEqual([]);

    const currencyMiss = buildSearchIndex({
      instances: [
        makeInstance({
          instanceId: 'inst-z',
          capabilityId: 'psp.payouts',
          currencies: ['JPY'],
          configuration: { simulatedRailId: 'rail-b' },
        }),
      ],
      observations: [makeObservation({ instanceId: 'inst-z' })],
    });
    expect(
      selectExecutableBlocks(currencyMiss, { domain: 'payment-routing', currency: 'EUR' })
        .executable,
    ).toEqual([]);

    const countryMiss = buildSearchIndex({
      instances: [payoutInstance('psp.payouts', 'rail-b')],
      observations: [makeObservation({ instanceId: 'inst-rail-b' })],
    });
    expect(
      selectExecutableBlocks(countryMiss, { domain: 'payment-routing', country: 'JP' }).executable,
    ).toEqual([]);
  });

  it('LAW 1: executable blocks pin the exact observation version they were selected on', () => {
    const index = buildSearchIndex({
      instances: [nativeInstance()],
      observations: [
        makeObservation({ instanceId: 'inst-rail-a', observationVersion: 2 }),
        makeObservation({ instanceId: 'inst-rail-a', observationVersion: 5 }),
      ],
    });
    const { executable } = selectExecutableBlocks(index, QUERY);
    expect(executable[0]?.pinnedObservation.observationVersion).toBe(5);
    expect(executable[0]?.pinnedObservation.instanceId).toBe('inst-rail-a');
  });
});

describe('two-axis availability (INV-04/07: UNKNOWN is never success or failure)', () => {
  it('an UNREACHABLE source surfaces as UNKNOWN with the last-known state carried', () => {
    const index = buildSearchIndex({
      instances: [nativeInstance()],
      observations: [
        makeObservation({ instanceId: 'inst-rail-a', sourceAvailability: 'UNREACHABLE' }),
      ],
    });
    const { executable, selections } = selectExecutableBlocks(index, QUERY);
    expect(executable).toEqual([]); // never executable...
    const selection = selections[0];
    expect(selection?.status).toBe('UNKNOWN'); // ...but never REJECTED as failure either
    if (selection?.status === 'UNKNOWN') {
      expect(selection.effectiveAvailability).toBe('UNKNOWN');
      expect(selection.reason).toBe('SOURCE_UNREACHABLE');
      expect(selection.observation.capabilityState).toBe('AVAILABLE'); // last-known kept
      expect(selection.pinnedObservation.observationVersion).toBe(1);
    }
  });

  it('a source-UNKNOWN observation also surfaces as UNKNOWN', () => {
    const index = buildSearchIndex({
      instances: [nativeInstance()],
      observations: [
        makeObservation({ instanceId: 'inst-rail-a', sourceAvailability: 'UNKNOWN' }),
      ],
    });
    const { selections } = selectExecutableBlocks(index, QUERY);
    const selection = selections[0];
    expect(selection?.status).toBe('UNKNOWN');
    if (selection?.status === 'UNKNOWN') {
      expect(selection.reason).toBe('SOURCE_UNKNOWN');
    }
  });

  it('an observation whose stored availability disagrees with the axes is flagged UNKNOWN', () => {
    const inconsistent = {
      ...makeObservation({ instanceId: 'inst-rail-a', sourceAvailability: 'UNREACHABLE' }),
      availability: 'AVAILABLE' as const, // forged: derived must be UNKNOWN
    };
    const index = buildSearchIndex({
      instances: [nativeInstance()],
      observations: [inconsistent],
    });
    const { executable, selections } = selectExecutableBlocks(index, QUERY);
    expect(executable).toEqual([]);
    const selection = selections[0];
    expect(selection?.status).toBe('UNKNOWN');
    if (selection?.status === 'UNKNOWN') {
      expect(selection.reason).toBe('AXES_INCONSISTENT');
    }
  });

  it('a two-axis UNAVAILABLE capability is REJECTED (a definite negative, not UNKNOWN)', () => {
    const index = buildSearchIndex({
      instances: [nativeInstance()],
      observations: [
        makeObservation({ instanceId: 'inst-rail-a', capabilityState: 'UNAVAILABLE' }),
      ],
    });
    const { executable, selections } = selectExecutableBlocks(index, QUERY);
    expect(executable).toEqual([]);
    const selection = selections[0];
    expect(selection?.status).toBe('REJECTED');
    if (selection?.status === 'REJECTED') {
      expect(selection.reason).toBe('EFFECTIVELY_UNAVAILABLE');
    }
  });
});

describe('incumbent provider-native baselines (INV-15)', () => {
  it('an instance declaring nativeRoutingBaseline is flagged as the incumbent baseline', () => {
    const index = nativeSearchIndex();
    const { executable } = selectExecutableBlocks(index, QUERY);
    expect(executable[0]?.isIncumbentBaseline).toBe(true);
  });

  it('a non-native instance is NOT flagged as incumbent', () => {
    const index = buildSearchIndex({
      instances: [payoutInstance('psp.payouts', 'rail-b')],
      observations: [makeObservation({ instanceId: 'inst-rail-b' })],
    });
    const { executable } = selectExecutableBlocks(index, QUERY);
    expect(executable[0]?.isIncumbentBaseline).toBe(false);
  });
});

describe('search plug-ins (replaceable optimizers)', () => {
  it('the deterministic baseline plug-in emits the incumbent native, composed and optimized candidates', () => {
    const index = nativeSearchIndex();
    const candidates = runSearchPlugin('deterministic-baseline', {
      world: BASELINE_WORLD,
      executableBlocks: selectExecutableBlocks(index, QUERY).executable,
      query: QUERY,
    });
    const modes = candidates.map((candidate) => candidate.executionMode);
    expect(modes).toContain('PASS_THROUGH_NATIVE');
    expect(modes).toContain('COMPOSED_PAYSWAP');
    expect(modes).toContain('OPTIMIZED_MULTI_PROVIDER');
    const incumbent = candidates.find((candidate) => candidate.isIncumbentBaseline);
    expect(incumbent?.executionMode).toBe('PASS_THROUGH_NATIVE');
    expect(incumbent?.program.routePreference).toEqual(['rail-a']);
    // LAW 1: the candidate carries the observation pins it is grounded on.
    expect(incumbent?.pinnedObservations).toHaveLength(1);
    expect(incumbent?.pinnedObservations[0]?.instanceId).toBe('inst-rail-a');
  });

  it('the optimized candidate orders the rails cheapest-first deterministically', () => {
    const index = fullBaselineSearchIndex();
    const candidates = runSearchPlugin('deterministic-baseline', {
      world: BASELINE_WORLD,
      executableBlocks: selectExecutableBlocks(index, QUERY).executable,
      query: QUERY,
    });
    const optimized = candidates.find(
      (candidate) => candidate.candidateId === 'search.deterministic-baseline:optimized-multi-provider',
    );
    expect(optimized).toBeDefined();
    expect(optimized?.program.routePreference).toEqual(['rail-c', 'rail-b', 'rail-a', 'rail-d']);
    expect(optimized?.program.useNetting).toBe(true);
    expect(optimized?.program.useNetworkCredit).toBe(true);
    expect(optimized?.program.delayToleranceSteps).toBe(2);
  });

  it('the plug-in search is deterministic', () => {
    const index = fullBaselineSearchIndex();
    const run = () =>
      runSearchPlugin('deterministic-baseline', {
        world: BASELINE_WORLD,
        executableBlocks: selectExecutableBlocks(index, QUERY).executable,
        query: QUERY,
      });
    expect(run()).toEqual(run());
  });

  it('the hand-designed plug-in produces a netting, screening, latency-first candidate', () => {
    const index = nativeSearchIndex();
    const candidates = runSearchPlugin('hand-designed-baseline', {
      world: BASELINE_WORLD,
      executableBlocks: selectExecutableBlocks(index, QUERY).executable,
      query: QUERY,
    });
    expect(candidates.length).toBe(1);
    const program = candidates[0]?.program;
    expect(program?.useNetting).toBe(true);
    expect(program?.fraudScreening).toBe(true);
    expect(program?.privacyBounded).toBe(true);
  });

  it('custom optimizer plug-ins register and run (evolutionary/bandit/RL plug in here)', () => {
    const custom: ExecutionSearchPlugin = {
      pluginId: 'test-custom-optimizer',
      description: 'test plug-in',
      search: (input) =>
        input.executableBlocks.length === 0
          ? []
          : [
              {
                candidateId: 'custom:1',
                origin: 'test-custom-optimizer',
                executionMode: 'COMPOSED_PAYSWAP',
                program: {
                  programId: 'custom.program',
                  programVersion: '1.0.0',
                  routePreference: ['rail-b'],
                  useNetting: false,
                  useNetworkCredit: false,
                  delayToleranceSteps: 0,
                  fraudScreening: true,
                  privacyBounded: true,
                  authorizationMode: 'PROTOCOL_AUTHORIZED',
                },
                instanceRefs: input.executableBlocks.map((block) => block.instance.instanceId),
                pinnedObservations: input.executableBlocks.map(
                  (block) => block.pinnedObservation,
                ),
                isIncumbentBaseline: false,
              },
            ],
    };
    registerSearchPlugin(custom);
    expect(listSearchPlugins().map((plugin) => plugin.pluginId)).toContain(
      'test-custom-optimizer',
    );
    const index = nativeSearchIndex();
    const candidates = runSearchPlugin('test-custom-optimizer', {
      world: BASELINE_WORLD,
      executableBlocks: selectExecutableBlocks(index, QUERY).executable,
      query: QUERY,
    });
    expect(candidates.map((candidate) => candidate.candidateId)).toEqual(['custom:1']);
  });

  it('an unknown plug-in id is rejected', () => {
    expect(() =>
      runSearchPlugin('no-such-plugin', {
        world: BASELINE_WORLD,
        executableBlocks: [],
        query: QUERY,
      }),
    ).toThrow(/unknown search plugin/);
  });
});
