/**
 * The capability fabric registry (P2-W1; ADAPT of payswap.org@8a735bf
 * packages/connectors/src/registry.ts + graph.ts concepts).
 *
 * Registration enforces the chain completeness of the canonical hierarchy:
 * CapabilityDefinition -> ProviderImplementation -> ConnectedCapabilityInstance
 * -> CapabilityObservation, plus Connector Capability Packs whose sub-packs
 * map ONLY to capabilities actually exposed by registered instances. A
 * ProviderCatalogueEntry can NEVER be registered as an instance (INV-13 —
 * catalogue/instance separation).
 *
 * Determinism: registration order is preserved for all lookups; lookups
 * never fabricate reachable instances and never turn a catalogue claim into
 * an instance. The registry carries NO clock — observation ordering uses
 * the strictly-monotonic per-instance version numbers, not timestamps.
 *
 * NARROWING LAW bridge: registering an implementation whose restriction set
 * widens beyond the definition-level restrictions is rejected
 * (assertImplementationRestrictionsNarrowDefinition).
 */

import { ValidationError } from './errors.ts';
import { validateCapabilityDefinition } from './definition-validation.ts';
import type { CapabilityDefinition } from './capability-definition.ts';
import {
  validateProviderImplementation,
  assertImplementationRestrictionsNarrowDefinition,
} from './provider-implementation.ts';
import type { ProviderImplementation, ProviderIdentity } from './provider-implementation.ts';
import { validateProviderIdentity } from './provider-implementation.ts';
import {
  isProviderCatalogueEntry,
  validateConnectedCapabilityInstance,
  validateProviderCatalogueEntry,
} from './connected-instance.ts';
import type { ConnectedCapabilityInstance, ProviderCatalogueEntry } from './connected-instance.ts';
import { validateCapabilityObservation } from './observation.ts';
import type { CapabilityObservation } from './observation.ts';
import { flattenPackCapabilityRefs, validateConnectorCapabilityPack } from './packs.ts';
import type { ConnectorCapabilityPack } from './packs.ts';
import type { CorridorRouteInput } from './corridor-evaluation.ts';
import type { CorridorRestrictionSet } from './restrictions.ts';
import { cloneAndFreeze } from './shared.ts';

/** Raised when a registration breaks the chain invariants. */
export class CapabilityRegistryError extends ValidationError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message, details);
    this.name = 'CapabilityRegistryError';
  }
}

/** Which chain link a completeness gap belongs to. */
export type ChainLinkKind =
  | 'definition'
  | 'implementation'
  | 'instance'
  | 'observation'
  | 'pack';

/** One gap in the definition -> implementation -> instance -> observation chain. */
export interface ChainGap {
  readonly link: ChainLinkKind;
  readonly ref: string;
  readonly problem: string;
}

/** Result of a full chain-completeness sweep. */
export interface ChainCompletenessReport {
  readonly complete: boolean;
  readonly gaps: readonly ChainGap[];
}

/** The four-layer capability fabric registry (deterministic, in-memory). */
export class CapabilityFabricRegistry {
  private readonly definitions = new Map<string, CapabilityDefinition>();
  private readonly providers = new Map<string, ProviderIdentity>();
  private readonly implementations = new Map<string, ProviderImplementation>();
  private readonly instances = new Map<string, ConnectedCapabilityInstance>();
  private readonly observations = new Map<string, CapabilityObservation[]>();
  private readonly packs = new Map<string, ConnectorCapabilityPack>();
  private readonly catalogue = new Map<string, ProviderCatalogueEntry>();

  // -- layer 1: definitions -------------------------------------------------

  /** Registers a capability definition (layer 1). */
  registerDefinition(definition: CapabilityDefinition): CapabilityDefinition {
    const validated = validateCapabilityDefinition(definition);
    const key = `${validated.id}@${validated.version}`;
    if (this.definitions.has(key)) {
      throw new CapabilityRegistryError(
        `capability definition '${key}' is already registered`,
      );
    }
    this.definitions.set(key, validated);
    return validated;
  }

  definition(capabilityId: string, capabilityVersion?: string): CapabilityDefinition | undefined {
    if (capabilityVersion !== undefined) {
      return this.definitions.get(`${capabilityId}@${capabilityVersion}`);
    }
    for (const definition of this.definitions.values()) {
      if (definition.id === capabilityId) {
        return definition;
      }
    }
    return undefined;
  }

  allDefinitions(): readonly CapabilityDefinition[] {
    return [...this.definitions.values()];
  }

  // -- layer 2: providers + implementations ---------------------------------

  /** Registers a provider identity (any system kind). */
  registerProvider(provider: ProviderIdentity): ProviderIdentity {
    const validated = validateProviderIdentity(provider);
    const key = `${validated.providerName}@${validated.providerVersion}`;
    if (this.providers.has(key)) {
      throw new CapabilityRegistryError(`provider '${key}' is already registered`);
    }
    this.providers.set(key, validated);
    return validated;
  }

  allProviders(): readonly ProviderIdentity[] {
    return [...this.providers.values()];
  }

  /**
   * Registers a provider implementation (layer 2). Chain rules: the
   * referenced capability definition (exact version pin) must already be
   * registered, and the implementation's restriction set may only NARROW
   * the definition-level restrictions (narrowing law). Checks run BEFORE
   * insertion so a rejected registration leaves no partial state.
   */
  registerImplementation(implementation: ProviderImplementation): ProviderImplementation {
    const validated = validateProviderImplementation(implementation);
    const definition = this.definition(validated.capabilityId, validated.capabilityVersion);
    if (definition === undefined) {
      throw new CapabilityRegistryError(
        `implementation '${validated.implementationId}' references capability '${validated.capabilityId}@${validated.capabilityVersion}' which is not a registered CapabilityDefinition (chain rule: register the definition first — definition -> implementation -> instance -> observation)`,
      );
    }
    if (this.implementations.has(validated.implementationId)) {
      throw new CapabilityRegistryError(
        `implementation '${validated.implementationId}' is already registered`,
      );
    }
    const definitionRestrictions = definitionLevelRestrictions(definition);
    if (definitionRestrictions !== undefined) {
      assertImplementationRestrictionsNarrowDefinition(validated, definitionRestrictions);
    }
    this.implementations.set(validated.implementationId, validated);
    return validated;
  }

  implementation(implementationId: string): ProviderImplementation | undefined {
    return this.implementations.get(implementationId);
  }

  allImplementations(): readonly ProviderImplementation[] {
    return [...this.implementations.values()];
  }

  implementationsForDefinition(capabilityId: string): readonly ProviderImplementation[] {
    return this.allImplementations().filter(
      (implementation) => implementation.capabilityId === capabilityId,
    );
  }

  /** INV-15: implementations exposing a native optimization baseline. */
  nativeBaselineImplementations(): readonly ProviderImplementation[] {
    return this.allImplementations().filter(
      (implementation) => implementation.nativeOptimization !== undefined,
    );
  }

  // -- layer 3: connected instances + catalogue ------------------------------

  /**
   * Registers a connected capability instance (layer 3). Chain rules:
   * a ProviderCatalogueEntry is rejected outright (INV-13), and the
   * referenced implementation must already be registered with a matching
   * capability id.
   */
  registerInstance(instance: ConnectedCapabilityInstance): ConnectedCapabilityInstance {
    if (isProviderCatalogueEntry(instance)) {
      throw new CapabilityRegistryError(
        'INV-13: a ProviderCatalogueEntry is a platform-wide advertisement and can never be registered as a ConnectedCapabilityInstance — catalogue claims never authorize execution',
        { catalogueEntryId: instance.catalogueEntryId },
      );
    }
    const validated = validateConnectedCapabilityInstance(instance);
    if (this.instances.has(validated.instanceId)) {
      throw new CapabilityRegistryError(
        `connected capability instance '${validated.instanceId}' is already registered`,
      );
    }
    const implementation = this.implementation(validated.implementationId);
    if (implementation === undefined) {
      throw new CapabilityRegistryError(
        `connected capability instance '${validated.instanceId}' references implementation '${validated.implementationId}' which is not registered (chain rule: register the ProviderImplementation first)`,
      );
    }
    if (implementation.capabilityId !== validated.capabilityId) {
      throw new CapabilityRegistryError(
        `connected capability instance '${validated.instanceId}' references capability '${validated.capabilityId}' but its implementation '${validated.implementationId}' implements '${implementation.capabilityId}'`,
      );
    }
    this.instances.set(validated.instanceId, validated);
    return validated;
  }

  instance(instanceId: string): ConnectedCapabilityInstance | undefined {
    return this.instances.get(instanceId);
  }

  allInstances(): readonly ConnectedCapabilityInstance[] {
    return [...this.instances.values()];
  }

  instancesForCapability(capabilityId: string): readonly ConnectedCapabilityInstance[] {
    return this.allInstances().filter((instance) => instance.capabilityId === capabilityId);
  }

  /**
   * Registers a catalogue entry in the SEPARATE advertisement surface
   * (never linked to instances; legal discovery seed only — INV-13).
   */
  registerCatalogueEntry(entry: ProviderCatalogueEntry): ProviderCatalogueEntry {
    const validated = validateProviderCatalogueEntry(entry);
    if (this.catalogue.has(validated.catalogueEntryId)) {
      throw new CapabilityRegistryError(
        `catalogue entry '${validated.catalogueEntryId}' is already registered`,
      );
    }
    this.catalogue.set(validated.catalogueEntryId, validated);
    return validated;
  }

  allCatalogueEntries(): readonly ProviderCatalogueEntry[] {
    return [...this.catalogue.values()];
  }

  // -- layer 4: observations --------------------------------------------------

  /**
   * Records a capability observation (layer 4). Chain rules: the observed
   * instance must be registered, and per-instance observation versions must
   * be strictly monotonic (out-of-order events can never regress canonical
   * state).
   */
  recordObservation(observation: CapabilityObservation): CapabilityObservation {
    const validated = validateCapabilityObservation(observation);
    if (!this.instances.has(validated.instanceId)) {
      throw new CapabilityRegistryError(
        `observation ${validated.observationVersion} references instance '${validated.instanceId}' which is not registered (chain rule: register the ConnectedCapabilityInstance first)`,
      );
    }
    const history = this.observations.get(validated.instanceId) ?? [];
    const latest = history[history.length - 1];
    if (latest !== undefined && validated.observationVersion <= latest.observationVersion) {
      throw new CapabilityRegistryError(
        `observation versions must be strictly monotonic per instance: got ${validated.observationVersion} but latest is ${latest.observationVersion} for '${validated.instanceId}'`,
      );
    }
    this.observations.set(validated.instanceId, [...history, validated]);
    return validated;
  }

  observationsFor(instanceId: string): readonly CapabilityObservation[] {
    return [...(this.observations.get(instanceId) ?? [])];
  }

  latestObservationFor(instanceId: string): CapabilityObservation | undefined {
    const history = this.observations.get(instanceId) ?? [];
    return history[history.length - 1];
  }

  // -- packs -------------------------------------------------------------------

  /**
   * Registers a Connector Capability Pack. Chain rule: every capability
   * referenced anywhere in the pack tree must be a REGISTERED definition
   * AND exposed by at least one registered ConnectedCapabilityInstance
   * (sub-packs map ONLY to capabilities actually exposed by connected
   * instances).
   */
  registerPack(pack: ConnectorCapabilityPack): ConnectorCapabilityPack {
    const validated = validateConnectorCapabilityPack(pack);
    if (this.packs.has(validated.packId)) {
      throw new CapabilityRegistryError(
        `connector capability pack '${validated.packId}' is already registered`,
      );
    }
    const missing: string[] = [];
    for (const ref of flattenPackCapabilityRefs(validated)) {
      const key = `${ref.capabilityId}@${ref.capabilityVersion}`;
      if (!this.definitions.has(key)) {
        missing.push(`${key} (definition not registered)`);
        continue;
      }
      const exposed = this.instancesForCapability(ref.capabilityId).length > 0;
      if (!exposed) {
        missing.push(`${key} (no registered ConnectedCapabilityInstance exposes it)`);
      }
    }
    if (missing.length > 0) {
      throw new CapabilityRegistryError(
        `connector capability pack '${validated.packId}' maps to capabilities not exposed by any ConnectedCapabilityInstance (sub-packs map ONLY to capabilities actually exposed by connected instances): ${missing.join('; ')}`,
      );
    }
    this.packs.set(validated.packId, validated);
    return validated;
  }

  pack(packId: string): ConnectorCapabilityPack | undefined {
    return this.packs.get(packId);
  }

  allPacks(): readonly ConnectorCapabilityPack[] {
    return [...this.packs.values()];
  }
}

function definitionLevelRestrictions(
  definition: CapabilityDefinition,
): CorridorRestrictionSet | undefined {
  if (definition.executable === true && definition.execution.jurisdictionEligibility.declaredVia === 'RESTRICTION_SET') {
    return definition.execution.jurisdictionEligibility.restrictionSet;
  }
  return undefined;
}
