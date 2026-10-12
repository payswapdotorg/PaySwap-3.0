/**
 * Registry support: chain-completeness sweep and the corridor projection
 * bridge (P2-W1; see registry.ts).
 *
 * Standalone functions over the registry's PUBLIC surface (deterministic):
 * - chainCompleteness(registry): every registered implementation resolves
 *   its definition; every instance resolves its implementation and carries
 *   at least one observation; every pack ref is exposed by an instance.
 * - corridorRouteInputs(registry): one CorridorRouteInput per instance with
 *   a resolvable chain AND a latest observation — instances without fresh
 *   evidence are NOT fabricated into routes.
 */

import type { CorridorRouteInput } from './corridor-evaluation.ts';
import type { CapabilityFabricRegistry } from './registry.ts';
import type { ChainCompletenessReport, ChainGap } from './registry.ts';
import { flattenPackCapabilityRefs } from './packs.ts';
import { cloneAndFreeze } from './shared.ts';

/**
 * Deterministic route inputs for the corridor projection: one route per
 * registered instance carrying its latest observation (instances without
 * observations are NOT fabricated — the corridor projection requires fresh
 * evidence, so they are absent from the input list).
 */
export function corridorRouteInputs(
  registry: CapabilityFabricRegistry,
): readonly CorridorRouteInput[] {
  const routes: CorridorRouteInput[] = [];
  for (const instance of registry.allInstances()) {
    const implementation = registry.implementation(instance.implementationId);
    const definition = registry.definition(
      instance.capabilityId,
      implementation?.capabilityVersion,
    );
    const observation = registry.latestObservationFor(instance.instanceId);
    if (implementation === undefined || definition === undefined || observation === undefined) {
      continue;
    }
    routes.push({ definition, implementation, instance, observation });
  }
  return routes;
}

/**
 * Full chain-completeness sweep: every registered implementation resolves
 * its definition; every instance resolves its implementation and carries at
 * least one observation; every pack ref resolves and is exposed by an
 * instance.
 */
export function chainCompleteness(
  registry: CapabilityFabricRegistry,
): ChainCompletenessReport {
  const gaps: ChainGap[] = [];
  for (const implementation of registry.allImplementations()) {
    if (
      registry.definition(implementation.capabilityId, implementation.capabilityVersion) ===
      undefined
    ) {
      gaps.push({
        link: 'definition',
        ref: `${implementation.capabilityId}@${implementation.capabilityVersion}`,
        problem: `implementation '${implementation.implementationId}' references an unregistered definition`,
      });
    }
  }
  for (const instance of registry.allInstances()) {
    const implementation = registry.implementation(instance.implementationId);
    if (implementation === undefined) {
      gaps.push({
        link: 'implementation',
        ref: instance.implementationId,
        problem: `instance '${instance.instanceId}' references an unregistered implementation`,
      });
      continue;
    }
    if (registry.latestObservationFor(instance.instanceId) === undefined) {
      gaps.push({
        link: 'observation',
        ref: instance.instanceId,
        problem: 'instance has no recorded observation',
      });
    }
  }
  for (const pack of registry.allPacks()) {
    for (const ref of flattenPackCapabilityRefs(pack)) {
      const exposed = registry.instancesForCapability(ref.capabilityId).length > 0;
      if (!exposed) {
        gaps.push({
          link: 'pack',
          ref: `${ref.capabilityId}@${ref.capabilityVersion}`,
          problem: `pack '${pack.packId}' references a capability with no exposing instance`,
        });
      }
    }
  }
  return cloneAndFreeze({ complete: gaps.length === 0, gaps });
}
