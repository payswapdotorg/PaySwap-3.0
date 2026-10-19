/**
 * Lab search PLUG-INS: the replaceable optimizers seam (P6-W1; the P6
 * rebuild of the old payswap.org@8a735bf packages/lab search.ts plug-in
 * section, W2-004 — LAB.md "Search").
 *
 * The Lab ships the deterministic and hand-designed baselines and treats
 * every other optimizer as REPLACEABLE: evolutionary search, black-box
 * optimization, contextual bandits, offline policy learning, RL, planning
 * and hybrid portfolios all plug in HERE (registerSearchPlugin). A
 * plug-in's output is advisory candidate data — never authority
 * (canonical INV-9/INV-10).
 *
 * INV-15: the deterministic baseline plug-in emits the incumbent
 * provider-native single-rail program (PASS_THROUGH_NATIVE) alongside the
 * composed and optimized candidates — the incumbent is never assumed
 * inferior (nor superior); all three modes compete on evidence.
 */

import type { PinnedExecutionMode } from "./pins/capability.ts";
import type { SimulationProgram } from "./simulation-plan.ts";
import type { SimulatedWorld } from "./simulation-world.ts";
import type {
  ExecutableBlock,
  LabSearchInput,
  SearchedCandidate,
} from "./search.ts";
import { LabSearchError } from "./errors.ts";

/** A replaceable search plug-in (the Director's learned-component seam). */
export interface LabSearchPlugin {
  readonly pluginId: string;
  readonly description: string;
  search(input: LabSearchInput): readonly SearchedCandidate[];
}

// ---------------------------------------------------------------------------
// Deterministic rail economics (the Lab-only binding convention)
// ---------------------------------------------------------------------------

const REFERENCE_AMOUNT_MINOR = 1_000_000n;

/**
 * Deterministic economics of a block's bound simulated rail: a connected
 * instance binds to a Lab-simulated rail through its provider-neutral
 * configuration key `simulatedRailId` (Lab-only convention).
 */
function simulatedRailFor(
  world: SimulatedWorld,
  block: ExecutableBlock,
):
  | {
      railId: string;
      fixedFeeMinor: bigint;
      variableFeeBps: bigint;
      latencyMs: number;
    }
  | undefined {
  const railId = block.instance.configuration["simulatedRailId"];
  if (typeof railId !== "string") {
    return undefined;
  }
  const rail = world.rails.find(
    (candidateRail) => candidateRail.railId === railId,
  );
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

function program(
  programId: string,
  routePreference: readonly string[],
  useNetting: boolean,
  useNetworkCredit: boolean,
  delayToleranceSteps: number,
): SimulationProgram {
  return {
    programId,
    programVersion: "1.0.0",
    routePreference: [...routePreference],
    useNetting,
    useNetworkCredit,
    delayToleranceSteps,
    fraudScreening: true,
    privacyBounded: true,
    authorizationMode: "PROTOCOL_AUTHORIZED",
  };
}

// ---------------------------------------------------------------------------
// Baseline 1 — deterministic/generalist + the incumbent native candidate
// ---------------------------------------------------------------------------

/**
 * The deterministic baseline search plug-in (LAB.md baseline 1:
 * "deterministic/generalist" plus the incumbent native candidate). Emits,
 * for every executable block set:
 * - the incumbent provider-native single-rail program (PASS_THROUGH_NATIVE,
 *   INV-15) when a native-optimization block is present;
 * - a greedy cheapest-first composed program (COMPOSED_PAYSWAP);
 * - a greedy multi-provider program with netting + explicit credit
 *   (OPTIMIZED_MULTI_PROVIDER).
 */
export const deterministicBaselineSearchPlugin: LabSearchPlugin = {
  pluginId: "deterministic-baseline",
  description:
    "deterministic generalist search: cheapest-first greedy ordering over executable blocks, plus the provider-native incumbent",
  search(input): readonly SearchedCandidate[] {
    const { world, executableBlocks } = input;
    const bound = executableBlocks
      .map((block) => ({ block, rail: simulatedRailFor(world, block) }))
      .filter((entry) => entry.rail !== undefined)
      .sort((left, right) => {
        if (left.rail === undefined || right.rail === undefined) {
          return 0;
        }
        const leftCost =
          left.rail.fixedFeeMinor +
          (REFERENCE_AMOUNT_MINOR * left.rail.variableFeeBps) / 10_000n;
        const rightCost =
          right.rail.fixedFeeMinor +
          (REFERENCE_AMOUNT_MINOR * right.rail.variableFeeBps) / 10_000n;
        if (leftCost !== rightCost) {
          return leftCost < rightCost ? -1 : 1;
        }
        return left.rail.railId < right.rail.railId
          ? -1
          : left.rail.railId > right.rail.railId
            ? 1
            : 0;
      });

    const candidates: SearchedCandidate[] = [];

    // Incumbent provider-native candidate (INV-15): single rail, minimal
    // orchestration, the provider's own optimization does the work.
    const incumbentBlock = bound.find((entry) => entry.block.isIncumbentBaseline);
    const incumbentTarget = incumbentBlock ?? bound[0];
    if (incumbentTarget !== undefined && incumbentTarget.rail !== undefined) {
      candidates.push({
        candidateId: "search.deterministic-baseline:incumbent-native",
        origin: "deterministic-baseline",
        execution: "PASS_THROUGH_NATIVE",
        program: program(
          "search.deterministic-baseline.incumbent-native",
          [incumbentTarget.rail.railId],
          false,
          false,
          0,
        ),
        instanceRefs: [incumbentTarget.block.instance.instanceId],
        isIncumbentBaseline: true,
      });
    }

    if (bound.length > 0) {
      const preference = bound
        .map((entry) => entry.rail?.railId)
        .filter((railId): railId is string => railId !== undefined);

      // Generalist composed candidate: cheapest-first, no batching.
      candidates.push({
        candidateId: "search.deterministic-baseline:composed-generalist",
        origin: "deterministic-baseline",
        execution: "COMPOSED_PAYSWAP",
        program: program(
          "search.deterministic-baseline.composed-generalist",
          preference,
          false,
          false,
          0,
        ),
        instanceRefs: bound.map((entry) => entry.block.instance.instanceId),
        isIncumbentBaseline: false,
      });

      // Optimized multi-provider candidate: netting + explicit credit.
      candidates.push({
        candidateId: "search.deterministic-baseline:optimized-multi-provider",
        origin: "deterministic-baseline",
        execution: "OPTIMIZED_MULTI_PROVIDER",
        program: program(
          "search.deterministic-baseline.optimized-multi-provider",
          preference,
          true,
          true,
          2,
        ),
        instanceRefs: bound.map((entry) => entry.block.instance.instanceId),
        isIncumbentBaseline: false,
      });
    }

    return Object.freeze(candidates);
  },
};

// ---------------------------------------------------------------------------
// Baseline 2 — hand-designed
// ---------------------------------------------------------------------------

/**
 * The hand-designed baseline search plug-in (LAB.md baseline 2:
 * "hand-designed"). Rule-based: latency-first preference with netting,
 * explicit credit and screening — a human-designed policy shape.
 */
export const handDesignedBaselineSearchPlugin: LabSearchPlugin = {
  pluginId: "hand-designed-baseline",
  description:
    "hand-designed policy: latency-first rail preference with netting, explicit credit and adversarial screening",
  search(input): readonly SearchedCandidate[] {
    const { world, executableBlocks } = input;
    const bound = executableBlocks
      .map((block) => ({ block, rail: simulatedRailFor(world, block) }))
      .filter((entry) => entry.rail !== undefined)
      .sort((left, right) => {
        if (left.rail === undefined || right.rail === undefined) {
          return 0;
        }
        if (left.rail.latencyMs !== right.rail.latencyMs) {
          return left.rail.latencyMs < right.rail.latencyMs ? -1 : 1;
        }
        return left.rail.railId < right.rail.railId
          ? -1
          : left.rail.railId > right.rail.railId
            ? 1
            : 0;
      });

    if (bound.length === 0) {
      return [];
    }
    const preference = bound
      .map((entry) => entry.rail?.railId)
      .filter((railId): railId is string => railId !== undefined);

    return Object.freeze([
      {
        candidateId: "search.hand-designed-baseline:latency-first",
        origin: "hand-designed-baseline",
        execution: "COMPOSED_PAYSWAP" as PinnedExecutionMode,
        program: program(
          "search.hand-designed-baseline.latency-first",
          preference,
          true,
          true,
          2,
        ),
        instanceRefs: bound.map((entry) => entry.block.instance.instanceId),
        isIncumbentBaseline: false,
      },
    ]);
  },
};

// ---------------------------------------------------------------------------
// Plug-in registry (replaceable optimizers, LAB.md "Search")
// ---------------------------------------------------------------------------

const builtinPlugins: readonly LabSearchPlugin[] = [
  deterministicBaselineSearchPlugin,
  handDesignedBaselineSearchPlugin,
];

const registeredPlugins = new Map<string, LabSearchPlugin>(
  builtinPlugins.map((plugin) => [plugin.pluginId, plugin]),
);

/**
 * Registers a search plug-in. Evolutionary search, black-box optimization,
 * contextual bandits, offline policy learning, RL, planning and hybrid
 * portfolios all plug in HERE — the Lab ships the deterministic and
 * hand-designed baselines and treats every other optimizer as replaceable.
 */
export function registerSearchPlugin(plugin: LabSearchPlugin): void {
  if (plugin.pluginId.length === 0) {
    throw new LabSearchError("search plugin id must not be empty");
  }
  registeredPlugins.set(plugin.pluginId, plugin);
}

/** Lists registered plug-ins (registration order). */
export function listSearchPlugins(): readonly LabSearchPlugin[] {
  return [...registeredPlugins.values()];
}

/** Looks up a registered plug-in. */
export function getSearchPlugin(
  pluginId: string,
): LabSearchPlugin | undefined {
  return registeredPlugins.get(pluginId);
}

/**
 * Runs a plug-in search deterministically. Both built-in plug-ins only ever
 * surface candidates that are grounded in executable blocks (INV-13).
 */
export function runSearchPlugin(
  pluginId: string,
  input: LabSearchInput,
): readonly SearchedCandidate[] {
  const plugin = registeredPlugins.get(pluginId);
  if (plugin === undefined) {
    throw new LabSearchError(`unknown search plugin '${pluginId}'`);
  }
  return plugin.search(input);
}
