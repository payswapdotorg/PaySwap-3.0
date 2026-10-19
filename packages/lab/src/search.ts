/**
 * Lab search: executable capability discovery (P6-W1; the P6 rebuild of
 * the old payswap.org@8a735bf packages/lab search.ts).
 INV-13 (old INV-C05) — provider-backed executable selection is grounded
 * in a ConnectedCapabilityInstance + a current CapabilityObservation,
 * NEVER in provider catalogue definitions alone. A catalogue entry with no
 * connected instance is returned as an explicit REJECTED selection with
 * reason CATALOGUE_ENTRY_ONLY; it can never produce an executable block.
 *
 * THE TWO-AXIS LAW (old INV-C01/C02; canonical INV-4/INV-7 discipline):
 * the axes are kept separate and re-derived from (capabilityState,
 * sourceAvailability) via the pinned canonical resolver. An UNREACHABLE or
 * UNKNOWN source yields effective availability UNKNOWN — surfaced as such
 * (never success, never failure), never executable. A stored availability
 * disagreeing with the fresh derivation is flagged AXES_INCONSISTENT.

 * INV-15 (old INV-C08) — a definition declaring nativeOptimization with
 * benchmarkBaseline === true is an INCUMBENT BASELINE block: exactly like
 * any other block — it can win or lose on evidence; nothing here ranks
 * PaySwap composition above it.

 * THE ACCEPTED RENAME (P6-W1): the Lab search query's mode field is named
 * `execution` (the old name was `executionMode`; the vocabulary is
 * unchanged and credited to the capability lane).
 */

import type {
  PinnedCapabilityDefinition,
  PinnedConnectedInstance,
  PinnedExecutionMode,
  PinnedProviderCatalogueEntry,
} from "./pins/capability.ts";
import { pinnedIsIncumbentBaselineDefinition } from "./pins/capability.ts";
import type {
  PinnedCapabilityObservation,
  PinnedEffectiveAvailability,
} from "./pins/observation.ts";
import { resolvePinnedEffectiveAvailability } from "./pins/observation.ts";
import type { SimulatedWorld } from "./simulation-world.ts";
import type { SimulationProgram } from "./simulation-plan.ts";

// ---------------------------------------------------------------------------
// The query (the accepted executionMode -> execution field rename)
// ---------------------------------------------------------------------------

/**
 * A Lab search query. NOTE THE FIELD NAME: `execution` — the accepted
 * P6-W1 rename of the old `executionMode` field (the vocabulary is the
 * capability lane's pinned ExecutionMode).
 */
export interface LabSearchQuery {
  readonly domain: string;
  readonly currency?: string;
  readonly execution?: PinnedExecutionMode;
  readonly country?: string;
  readonly capabilityId?: string;
}

/** Why a capability did not yield an executable block. */
export type SearchRejectionReason =
  | "CATALOGUE_ENTRY_ONLY"
  | "NO_CONNECTED_INSTANCE"
  | "NO_OBSERVATION"
  | "AUTHORIZATION_NOT_ACTIVE"
  | "NOT_ELIGIBLE"
  | "CURRENCY_NOT_SUPPORTED"
  | "GEOGRAPHY_NOT_SUPPORTED"
  | "EFFECTIVELY_UNAVAILABLE";

/** The per-candidate selection outcome (executable, unknown or rejected). */
export type SearchSelection =
  | {
      readonly status: "EXECUTABLE";
      readonly definition: PinnedCapabilityDefinition;
      readonly instance: PinnedConnectedInstance;
      readonly observation: PinnedCapabilityObservation;
      readonly effectiveAvailability: "AVAILABLE" | "DEGRADED";
      /** INV-15: incumbent provider-native baseline block. */
      readonly isIncumbentBaseline: boolean;
    }
  | {
      readonly status: "UNKNOWN";
      readonly definition?: PinnedCapabilityDefinition;
      readonly instance: PinnedConnectedInstance;
      readonly observation: PinnedCapabilityObservation;
      /**
       * Two-axis UNKNOWN is surfaced verbatim — never converted into
       * success or failure (the two-axis law).
       */
      readonly effectiveAvailability: "UNKNOWN";
      readonly reason: "SOURCE_UNREACHABLE" | "SOURCE_UNKNOWN" | "AXES_INCONSISTENT";
    }
  | {
      readonly status: "REJECTED";
      readonly definition: PinnedCapabilityDefinition | undefined;
      readonly catalogueEntry: PinnedProviderCatalogueEntry | undefined;
      readonly reason: SearchRejectionReason;
      readonly detail: string;
    };

/** An executable block: a connected instance + its current observation. */
export interface ExecutableBlock {
  readonly definition: PinnedCapabilityDefinition;
  readonly instance: PinnedConnectedInstance;
  readonly observation: PinnedCapabilityObservation;
  readonly effectiveAvailability: "AVAILABLE" | "DEGRADED";
  readonly isIncumbentBaseline: boolean;
}

/** The Lab search index: a deterministic fabric snapshot. */
export interface LabSearchIndex {
  readonly definitions: readonly PinnedCapabilityDefinition[];
  readonly instances: readonly PinnedConnectedInstance[];
  readonly observations: readonly PinnedCapabilityObservation[];
  readonly catalogueEntries: readonly PinnedProviderCatalogueEntry[];
}

/** Builds a search index from fabric snapshots (defensive copies). */
export function buildLabSearchIndex(input: {
  definitions?: readonly PinnedCapabilityDefinition[];
  instances?: readonly PinnedConnectedInstance[];
  observations?: readonly PinnedCapabilityObservation[];
  catalogueEntries?: readonly PinnedProviderCatalogueEntry[];
}): LabSearchIndex {
  return {
    definitions: [...(input.definitions ?? [])],
    instances: [...(input.instances ?? [])],
    observations: [...(input.observations ?? [])],
    catalogueEntries: [...(input.catalogueEntries ?? [])],
  };
}

/** Latest observation per instance (deterministic: highest version wins). */
export function latestObservationFor(
  index: LabSearchIndex,
  instanceId: string,
): PinnedCapabilityObservation | undefined {
  let latest: PinnedCapabilityObservation | undefined;
  for (const observation of index.observations) {
    if (observation.instanceId !== instanceId) {
      continue;
    }
    if (
      latest === undefined ||
      observation.observationVersion > latest.observationVersion
    ) {
      latest = observation;
    }
  }
  return latest;
}

/**
 * Selects executable blocks for a query. Every definition is resolved
 * against connected instances and CURRENT observations; catalogue entries
 * participate only to explain rejections (INV-13).
 */
export function selectExecutableBlocks(
  index: LabSearchIndex,
  query: LabSearchQuery,
): {
  readonly selections: readonly SearchSelection[];
  readonly executable: readonly ExecutableBlock[];
} {
  const selections: SearchSelection[] = [];
  const executable: ExecutableBlock[] = [];

  const candidates: readonly (
    | PinnedCapabilityDefinition
    | PinnedProviderCatalogueEntry
  )[] = [...index.definitions, ...index.catalogueEntries];

  for (const candidate of candidates) {
    const isDefinition =
      "capabilityId" in candidate && "executionModes" in candidate;
    const capabilityId = candidate.capabilityId;

    if (isDefinition && query.capabilityId !== undefined) {
      const definition = candidate as PinnedCapabilityDefinition;
      if (definition.capabilityId !== query.capabilityId) {
        continue;
      }
    }
    if (isDefinition && query.execution !== undefined) {
      const definition = candidate as PinnedCapabilityDefinition;
      if (!definition.executionModes.includes(query.execution)) {
        continue;
      }
    }

    // Find a connected instance for this capability (INV-13: the instance,
    // not the catalogue, is the executable object).
    const instance = index.instances.find(
      (candidateInstance) => candidateInstance.capabilityId === capabilityId,
    );

    if (instance === undefined) {
      const catalogueEntry = isDefinition
        ? undefined
        : (candidate as PinnedProviderCatalogueEntry);
      selections.push({
        status: "REJECTED",
        definition: isDefinition
          ? (candidate as PinnedCapabilityDefinition)
          : undefined,
        catalogueEntry,
        reason: "CATALOGUE_ENTRY_ONLY",
        detail:
          "no ConnectedCapabilityInstance is bound to this capability: a catalogue claim alone can never authorize execution (INV-13)",
      });
      continue;
    }

    if (query.currency !== undefined && !instance.currencies.includes(query.currency)) {
      selections.push({
        status: "REJECTED",
        definition: isDefinition ? (candidate as PinnedCapabilityDefinition) : undefined,
        catalogueEntry: undefined,
        reason: "CURRENCY_NOT_SUPPORTED",
        detail: `instance '${instance.instanceId}' does not support currency '${query.currency}'`,
      });
      continue;
    }
    if (
      query.country !== undefined &&
      !instance.geography.countries.includes(query.country)
    ) {
      selections.push({
        status: "REJECTED",
        definition: isDefinition ? (candidate as PinnedCapabilityDefinition) : undefined,
        catalogueEntry: undefined,
        reason: "GEOGRAPHY_NOT_SUPPORTED",
        detail: `instance '${instance.instanceId}' does not cover country '${query.country}'`,
      });
      continue;
    }
    if (instance.authorization.status !== "ACTIVE") {
      selections.push({
        status: "REJECTED",
        definition: isDefinition ? (candidate as PinnedCapabilityDefinition) : undefined,
        catalogueEntry: undefined,
        reason: "AUTHORIZATION_NOT_ACTIVE",
        detail: `instance '${instance.instanceId}' authorization status is '${instance.authorization.status}'`,
      });
      continue;
    }
    if (!instance.eligibility.eligible) {
      selections.push({
        status: "REJECTED",
        definition: isDefinition ? (candidate as PinnedCapabilityDefinition) : undefined,
        catalogueEntry: undefined,
        reason: "NOT_ELIGIBLE",
        detail: `instance '${instance.instanceId}' not eligible: ${instance.eligibility.reasons.join(", ")}`,
      });
      continue;
    }

    const observation = latestObservationFor(index, instance.instanceId);
    if (observation === undefined) {
      selections.push({
        status: "REJECTED",
        definition: isDefinition ? (candidate as PinnedCapabilityDefinition) : undefined,
        catalogueEntry: undefined,
        reason: "NO_OBSERVATION",
        detail: `instance '${instance.instanceId}' has no current CapabilityObservation`,
      });
      continue;
    }

    // Two-axis derivation. The stored availability must agree with a fresh
    // derivation; a disagreement is surfaced as UNKNOWN, never as success
    // or failure.
    const derived: PinnedEffectiveAvailability =
      resolvePinnedEffectiveAvailability(
        observation.capabilityState,
        observation.sourceAvailability,
      );
    if (derived !== observation.availability) {
      selections.push({
        status: "UNKNOWN",
        ...(isDefinition ? { definition: candidate as PinnedCapabilityDefinition } : {}),
        instance,
        observation,
        effectiveAvailability: "UNKNOWN",
        reason: "AXES_INCONSISTENT",
      });
      continue;
    }
    if (derived === "UNKNOWN") {
      selections.push({
        status: "UNKNOWN",
        ...(isDefinition ? { definition: candidate as PinnedCapabilityDefinition } : {}),
        instance,
        observation,
        effectiveAvailability: "UNKNOWN",
        reason:
          observation.sourceAvailability === "UNREACHABLE"
            ? "SOURCE_UNREACHABLE"
            : "SOURCE_UNKNOWN",
      });
      continue;
    }
    if (derived === "UNAVAILABLE") {
      selections.push({
        status: "REJECTED",
        definition: isDefinition ? (candidate as PinnedCapabilityDefinition) : undefined,
        catalogueEntry: undefined,
        reason: "EFFECTIVELY_UNAVAILABLE",
        detail: `instance '${instance.instanceId}' is two-axis UNAVAILABLE`,
      });
      continue;
    }

    const definition = isDefinition
      ? (candidate as PinnedCapabilityDefinition)
      : undefined;
    if (definition === undefined) {
      // Catalogue entry that happens to match an instance: still rejected —
      // executable selection requires the canonical definition vocabulary.
      selections.push({
        status: "REJECTED",
        definition: undefined,
        catalogueEntry: candidate as PinnedProviderCatalogueEntry,
        reason: "CATALOGUE_ENTRY_ONLY",
        detail:
          "catalogue entry matched an instance but no canonical CapabilityDefinition is registered",
      });
      continue;
    }

    const isIncumbentBaseline =
      pinnedIsIncumbentBaselineDefinition(definition);
    const effectiveAvailability = derived === "DEGRADED" ? "DEGRADED" : "AVAILABLE";
    const block: ExecutableBlock = {
      definition,
      instance,
      observation,
      effectiveAvailability,
      isIncumbentBaseline,
    };
    executable.push(block);
    selections.push({
      status: "EXECUTABLE",
      definition,
      instance,
      observation,
      effectiveAvailability,
      isIncumbentBaseline,
    });
  }

  return {
    selections: Object.freeze(selections),
    executable: Object.freeze(executable),
  };
}

/** Input handed to a search plug-in. */
export interface LabSearchInput {
  readonly world: SimulatedWorld;
  readonly executableBlocks: readonly ExecutableBlock[];
  readonly query: LabSearchQuery;
}

/** A candidate program discovered by a search plug-in. */
export interface SearchedCandidate {
  readonly candidateId: string;
  /** Plug-in id or baseline origin label. */
  readonly origin: string;
  /** The accepted P6-W1 rename of the old executionMode field name. */
  readonly execution: PinnedExecutionMode;
  readonly program: SimulationProgram;
  readonly instanceRefs: readonly string[];
  /** INV-15: this candidate IS the incumbent provider-native baseline. */
  readonly isIncumbentBaseline: boolean;
}
