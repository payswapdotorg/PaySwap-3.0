/**
 * @payswap/execution-graph — replaceable search plug-ins (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/lab/src/search.ts, second half).
 *
 * The Director's learned-component seam: the deterministic and hand-designed
 * baselines ship with the package; evolutionary search, black-box
 * optimization, contextual bandits, offline policy learning, RL, planning
 * and hybrid portfolios all plug in HERE. A plug-in's output is advisory
 * candidate data — never authority (INV-09/INV-10).
 *
 * Deterministic economics of a block's bound simulated rail: an instance
 * binds to a simulated rail through its provider-neutral configuration key
 * `simulatedRailId` (simulator-only convention).
 */

import { ValidationError } from './errors.ts';
import type {
  ExecutionSearchInput,
  ExecutionSearchPlugin,
  ExecutableBlock,
  SearchedCandidate,
} from './search-contract.ts';
import type { SimulatedWorld } from './simulation-contract.ts';

const REFERENCE_AMOUNT_MINOR = 1_000_000n;

/** Deterministic rail economics lookup for a block's bound simulated rail. */
function simulatedRailFor(
  world: SimulatedWorld,
  block: ExecutableBlock,
):
  | { railId: string; fixedFeeMinor: bigint; variableFeeBps: bigint; latencyMs: number }
  | undefined {
  const railId = block.instance.configuration['simulatedRailId'];
  if (typeof railId !== 'string') {
    return undefined;
  }
  const rail = world.rails.find((candidate) => candidate.railId === railId);
  if (rail === undefined) {
    return undefined;
  }
  return {
    railId: rail.railId,
    fixedFeeMinor: rail.fixedFeeMinor,
    variableFeeBps: rail.variableFeeBps,
    latencyMs: rail.latencyMs,
  };
}

/**
 * The deterministic baseline search plug-in: cheapest-first greedy ordering
 * over executable blocks, plus the provider-native incumbent. Emits, for
 * every executable block set:
 * - the incumbent provider-native single-rail program (PASS_THROUGH_NATIVE,
 *   INV-15) when a native-baseline block is present;
 * - a greedy cheapest-first composed program (COMPOSED_PAYSWAP);
 * - a greedy multi-provider program with netting + explicit credit
 *   (OPTIMIZED_MULTI_PROVIDER).
 */
export const deterministicBaselineSearchPlugin: ExecutionSearchPlugin = {
  pluginId: 'deterministic-baseline',
  description:
    'deterministic generalist search: cheapest-first greedy ordering over executable blocks, plus the provider-native incumbent',
  search(input: ExecutionSearchInput): readonly SearchedCandidate[] {
    const { world, executableBlocks } = input;
    const bound = executableBlocks
      .map((block) => ({ block, rail: simulatedRailFor(world, block) }))
      .filter((entry) => entry.rail !== undefined)
      .sort((left, right) => {
        const leftRail = left.rail;
        const rightRail = right.rail;
        if (leftRail === undefined || rightRail === undefined) {
          return 0;
        }
        const leftCost =
          leftRail.fixedFeeMinor + (REFERENCE_AMOUNT_MINOR * leftRail.variableFeeBps) / 10_000n;
        const rightCost =
          rightRail.fixedFeeMinor + (REFERENCE_AMOUNT_MINOR * rightRail.variableFeeBps) / 10_000n;
        if (leftCost !== rightCost) {
          return leftCost < rightCost ? -1 : 1;
        }
        return leftRail.railId < rightRail.railId ? -1 : leftRail.railId > rightRail.railId ? 1 : 0;
      });

    const candidates: SearchedCandidate[] = [];

    // Incumbent provider-native candidate (INV-15): single rail, minimal
    // orchestration, the provider's own optimization does the work.
    const incumbentBlock = bound.find((entry) => entry.block.isIncumbentBaseline);
    const incumbentTarget = incumbentBlock ?? bound[0];
    if (incumbentTarget !== undefined && incumbentTarget.rail !== undefined) {
      candidates.push({
        candidateId: 'search.deterministic-baseline:incumbent-native',
        origin: 'deterministic-baseline',
        executionMode: 'PASS_THROUGH_NATIVE',
        program: {
          programId: 'search.deterministic-baseline.incumbent-native',
          programVersion: '1.0.0',
          routePreference: [incumbentTarget.rail.railId],
          useNetting: false,
          useNetworkCredit: false,
          delayToleranceSteps: 0,
          fraudScreening: true,
          privacyBounded: true,
          authorizationMode: 'PROTOCOL_AUTHORIZED',
        },
        instanceRefs: [incumbentTarget.block.instance.instanceId],
        pinnedObservations: [incumbentTarget.block.pinnedObservation],
        isIncumbentBaseline: true,
      });
    }

    if (bound.length > 0) {
      const preference = bound
        .map((entry) => entry.rail?.railId)
        .filter((railId): railId is string => railId !== undefined);
      const pins = bound.map((entry) => entry.block.pinnedObservation);
      const instanceRefs = bound.map((entry) => entry.block.instance.instanceId);

      // Generalist composed candidate: cheapest-first, no batching.
      candidates.push({
        candidateId: 'search.deterministic-baseline:composed-generalist',
        origin: 'deterministic-baseline',
        executionMode: 'COMPOSED_PAYSWAP',
        program: {
          programId: 'search.deterministic-baseline.composed-generalist',
          programVersion: '1.0.0',
          routePreference: preference,
          useNetting: false,
          useNetworkCredit: false,
          delayToleranceSteps: 0,
          fraudScreening: true,
          privacyBounded: true,
          authorizationMode: 'PROTOCOL_AUTHORIZED',
        },
        instanceRefs,
        pinnedObservations: pins,
        isIncumbentBaseline: false,
      });

      // Optimized multi-provider candidate: netting + explicit credit.
      candidates.push({
        candidateId: 'search.deterministic-baseline:optimized-multi-provider',
        origin: 'deterministic-baseline',
        executionMode: 'OPTIMIZED_MULTI_PROVIDER',
        program: {
          programId: 'search.deterministic-baseline.optimized-multi-provider',
          programVersion: '1.0.0',
          routePreference: preference,
          useNetting: true,
          useNetworkCredit: true,
          delayToleranceSteps: 2,
          fraudScreening: true,
          privacyBounded: true,
          authorizationMode: 'PROTOCOL_AUTHORIZED',
        },
        instanceRefs,
        pinnedObservations: pins,
        isIncumbentBaseline: false,
      });
    }

    return Object.freeze(candidates);
  },
};

/**
 * The hand-designed baseline search plug-in: latency-first preference with
 * netting, explicit credit and screening — a human-designed policy shape.
 */
export const handDesignedBaselineSearchPlugin: ExecutionSearchPlugin = {
  pluginId: 'hand-designed-baseline',
  description:
    'hand-designed policy: latency-first rail preference with netting, explicit credit and adversarial screening',
  search(input: ExecutionSearchInput): readonly SearchedCandidate[] {
    const { world, executableBlocks } = input;
    const bound = executableBlocks
      .map((block) => ({ block, rail: simulatedRailFor(world, block) }))
      .filter((entry) => entry.rail !== undefined)
      .sort((left, right) => {
        const leftRail = left.rail;
        const rightRail = right.rail;
        if (leftRail === undefined || rightRail === undefined) {
          return 0;
        }
        if (leftRail.latencyMs !== rightRail.latencyMs) {
          return leftRail.latencyMs < rightRail.latencyMs ? -1 : 1;
        }
        return leftRail.railId < rightRail.railId ? -1 : leftRail.railId > rightRail.railId ? 1 : 0;
      });

    if (bound.length === 0) {
      return [];
    }
    const preference = bound
      .map((entry) => entry.rail?.railId)
      .filter((railId): railId is string => railId !== undefined);

    return Object.freeze([
      {
        candidateId: 'search.hand-designed-baseline:latency-first',
        origin: 'hand-designed-baseline',
        executionMode: 'COMPOSED_PAYSWAP' as const,
        program: {
          programId: 'search.hand-designed-baseline.latency-first',
          programVersion: '1.0.0',
          routePreference: preference,
          useNetting: true,
          useNetworkCredit: true,
          delayToleranceSteps: 2,
          fraudScreening: true,
          privacyBounded: true,
          authorizationMode: 'PROTOCOL_AUTHORIZED',
        },
        instanceRefs: bound.map((entry) => entry.block.instance.instanceId),
        pinnedObservations: bound.map((entry) => entry.block.pinnedObservation),
        isIncumbentBaseline: false,
      },
    ]);
  },
};

// ---------------------------------------------------------------------------
// Plug-in registry (replaceable optimizers)
// ---------------------------------------------------------------------------

const registeredPlugins = new Map<string, ExecutionSearchPlugin>([
  [deterministicBaselineSearchPlugin.pluginId, deterministicBaselineSearchPlugin],
  [handDesignedBaselineSearchPlugin.pluginId, handDesignedBaselineSearchPlugin],
]);

/**
 * Register a search plug-in. Evolutionary search, black-box optimization,
 * contextual bandits, offline policy learning, RL, planning and hybrid
 * portfolios all plug in HERE — every other optimizer is replaceable.
 */
export function registerSearchPlugin(plugin: ExecutionSearchPlugin): void {
  if (plugin === null || typeof plugin !== 'object') {
    throw new ValidationError('a search plug-in must be an object');
  }
  if (typeof plugin.pluginId !== 'string' || plugin.pluginId.length === 0) {
    throw new ValidationError('search plugin id must not be empty');
  }
  registeredPlugins.set(plugin.pluginId, plugin);
}

/** All registered plug-ins, in registration order. */
export function listSearchPlugins(): readonly ExecutionSearchPlugin[] {
  return [...registeredPlugins.values()];
}

/** One plug-in by id. */
export function getSearchPlugin(pluginId: string): ExecutionSearchPlugin | undefined {
  return registeredPlugins.get(pluginId);
}

/**
 * Run a plug-in search deterministically. Every built-in plug-in only ever
 * surfaces candidates grounded in executable blocks (INV-13).
 */
export function runSearchPlugin(
  pluginId: string,
  input: ExecutionSearchInput,
): readonly SearchedCandidate[] {
  const plugin = registeredPlugins.get(pluginId);
  if (plugin === undefined) {
    throw new ValidationError(`unknown search plugin '${pluginId}'`);
  }
  return plugin.search(input);
}
