/**
 * @payswap/execution-graph — executable capability discovery (P3-W2; ADAPT
 * of payswap.org@8a735bf packages/lab/src/search.ts, first half — the
 * plug-in registry is in search-plugins.ts).
 *
 * INV-13: provider-backed executable selection is grounded in a
 * ConnectedCapabilityInstance + a current CapabilityObservation, NEVER in
 * provider catalogue entries alone. Two-axis availability: an unreachable
 * or unknown source yields effective availability UNKNOWN — surfaced as
 * such (never success, never failure) and never executable (INV-04/07).
 * INV-15: an instance declaring a native routing baseline is returned as
 * the INCUMBENT BASELINE block — exactly like any other block, no ranking
 * advantage.
 *
 * LAW 1: every executable block pins the exact observation version it was
 * selected on.
 */

import { ValidationError } from './errors.ts';
import { pinObservation } from './observation-versions.ts';
import { resolveEffectiveAvailability } from './observation-versions.ts';
import type { ObservationVersionPin } from './observation-version-contract.ts';
import type {
  ExecutionSearchIndex,
  ExecutionSearchQuery,
  ExecutableBlock,
  SearchSelection,
  SearchSelectionResult,
} from './search-contract.ts';
import type { CapabilityObservation, ConnectedCapabilityInstance } from '@payswap/capability';

/** Build a search index snapshot (deterministic; inputs copied, never mutated). */
export function buildSearchIndex(input: {
  readonly instances?: readonly ConnectedCapabilityInstance[];
  readonly observations?: readonly CapabilityObservation[];
  readonly catalogueEntries?: ExecutionSearchIndex['catalogueEntries'];
}): ExecutionSearchIndex {
  return {
    instances: [...(input.instances ?? [])],
    observations: [...(input.observations ?? [])],
    catalogueEntries: [...(input.catalogueEntries ?? [])],
  };
}

/** Latest observation per instance (deterministic: highest version wins). */
function latestObservation(
  index: ExecutionSearchIndex,
  instanceId: string,
): CapabilityObservation | undefined {
  let latest: CapabilityObservation | undefined;
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

/** INV-15: incumbent baseline is declared on the instance configuration. */
function isIncumbentBaseline(instance: ConnectedCapabilityInstance): boolean {
  return instance.configuration['nativeRoutingBaseline'] === true;
}

function pinFor(observation: CapabilityObservation): ObservationVersionPin {
  return pinObservation(observation);
}

/**
 * Select executable blocks for a query. Every connected instance is resolved
 * against its LATEST observation; catalogue entries participate only to
 * explain rejections (INV-13). Two-axis derivation: the stored availability
 * must agree with a fresh derivation; a disagreement is surfaced as UNKNOWN,
 * never as success or failure.
 */
export function selectExecutableBlocks(
  index: ExecutionSearchIndex,
  query: ExecutionSearchQuery,
): SearchSelectionResult {
  if (index === null || typeof index !== 'object') {
    throw new ValidationError('a search index is required');
  }
  if (query === null || typeof query !== 'object' || typeof query.domain !== 'string') {
    throw new ValidationError('a search query with a domain is required');
  }
  const selections: SearchSelection[] = [];
  const executable: ExecutableBlock[] = [];

  // Catalogue entries NEVER yield executable blocks on their own (INV-13):
  // they are surfaced as explicit rejections explaining the missing
  // connected instance.
  const instanceCapabilityIds = new Set(index.instances.map((instance) => instance.capabilityId));
  for (const entry of index.catalogueEntries) {
    if (instanceCapabilityIds.has(entry.capabilityId)) {
      continue; // explained by the instance's own selection below
    }
    selections.push({
      status: 'REJECTED',
      catalogueEntry: entry,
      reason: 'CATALOGUE_ENTRY_ONLY',
      detail:
        'no ConnectedCapabilityInstance is bound to this capability: a catalogue claim alone can never authorize execution (INV-13)',
    });
  }

  for (const instance of index.instances) {
    if (query.capabilityId !== undefined && instance.capabilityId !== query.capabilityId) {
      continue;
    }
    if (query.currency !== undefined && !instance.currencies.includes(query.currency)) {
      selections.push({
        status: 'REJECTED',
        catalogueEntry: undefined,
        reason: 'CURRENCY_NOT_SUPPORTED',
        detail: `instance '${instance.instanceId}' does not support currency '${query.currency}'`,
      });
      continue;
    }
    if (
      query.country !== undefined &&
      !instance.geography.countries.includes(query.country)
    ) {
      selections.push({
        status: 'REJECTED',
        catalogueEntry: undefined,
        reason: 'GEOGRAPHY_NOT_SUPPORTED',
        detail: `instance '${instance.instanceId}' does not cover country '${query.country}'`,
      });
      continue;
    }
    if (instance.authorization.status !== 'ACTIVE') {
      selections.push({
        status: 'REJECTED',
        catalogueEntry: undefined,
        reason: 'AUTHORIZATION_NOT_ACTIVE',
        detail: `instance '${instance.instanceId}' authorization status is '${instance.authorization.status}'`,
      });
      continue;
    }
    if (instance.eligibility.eligible !== true) {
      selections.push({
        status: 'REJECTED',
        catalogueEntry: undefined,
        reason: 'NOT_ELIGIBLE',
        detail: `instance '${instance.instanceId}' not eligible: ${instance.eligibility.reasons.join(', ')}`,
      });
      continue;
    }
    if (instance.permissionState.missing.length > 0) {
      selections.push({
        status: 'REJECTED',
        catalogueEntry: undefined,
        reason: 'AUTHORIZATION_NOT_ACTIVE',
        detail: `instance '${instance.instanceId}' is missing permissions [${instance.permissionState.missing.join(', ')}]`,
      });
      continue;
    }

    const observation = latestObservation(index, instance.instanceId);
    if (observation === undefined) {
      selections.push({
        status: 'REJECTED',
        catalogueEntry: undefined,
        reason: 'NO_OBSERVATION',
        detail: `instance '${instance.instanceId}' has no current capability observation`,
      });
      continue;
    }

    // Two-axis derivation (INV-04/07). The stored availability must agree
    // with a fresh derivation; a disagreement is surfaced as UNKNOWN, never
    // as success or failure.
    const derived = resolveEffectiveAvailability(
      observation.capabilityState,
      observation.sourceAvailability,
    );
    if (derived !== observation.availability) {
      selections.push({
        status: 'UNKNOWN',
        instance,
        observation,
        effectiveAvailability: 'UNKNOWN',
        reason: 'AXES_INCONSISTENT',
        pinnedObservation: pinFor(observation),
      });
      continue;
    }
    if (derived === 'UNKNOWN') {
      selections.push({
        status: 'UNKNOWN',
        instance,
        observation,
        effectiveAvailability: 'UNKNOWN',
        reason:
          observation.sourceAvailability === 'UNREACHABLE'
            ? 'SOURCE_UNREACHABLE'
            : 'SOURCE_UNKNOWN',
        pinnedObservation: pinFor(observation),
      });
      continue;
    }
    if (derived === 'UNAVAILABLE') {
      selections.push({
        status: 'REJECTED',
        catalogueEntry: undefined,
        reason: 'EFFECTIVELY_UNAVAILABLE',
        detail: `instance '${instance.instanceId}' is two-axis UNAVAILABLE`,
      });
      continue;
    }

    const effectiveAvailability = derived === 'DEGRADED' ? 'DEGRADED' : 'AVAILABLE';
    const incumbent = isIncumbentBaseline(instance);
    const pinned = pinFor(observation);
    const block: ExecutableBlock = {
      instance,
      observation,
      effectiveAvailability,
      isIncumbentBaseline: incumbent,
      pinnedObservation: pinned,
    };
    executable.push(block);
    selections.push({
      status: 'EXECUTABLE',
      instance,
      observation,
      effectiveAvailability,
      isIncumbentBaseline: incumbent,
      pinnedObservation: pinned,
    });
  }

  return { selections: Object.freeze(selections), executable: Object.freeze(executable) };
}
