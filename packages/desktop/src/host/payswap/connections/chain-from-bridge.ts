/**
 * PaySwap Desktop (P21-D Gap A, ADR-0014 D6/D8/D12) — the
 * CHAIN-FROM-BRIDGE derivation: the host-side conversion of the
 * connection→capability bridge's instances into the four-layer corridor
 * route chains the route-planning engine's stages 2/3 consume
 * (definition → implementation → instance → observation).
 *
 * THE NAMED FOLLOW-ON from the 147-a bridge battery: the PRODUCT path —
 * not the test tier — derives the corridor capability chains from the
 * REAL connection bridge (the battery composed the P21-C fixture chains
 * itself and asserted the two-sided agreement; this derivation makes
 * the product compose them).
 *
 * THE DERIVATION LAWS:
 * - PURE + DETERMINISTIC: the same bridge derives byte-identical chains
 *   (the instants are the bridge's own evidence stamps, never ambient).
 * - FAIL-CLOSED: an empty bridge derives the empty chain set; an
 *   instance whose (providerId, keyClass) is outside the pinned
 *   definition catalog derives NO chain — never a guessed definition;
 *   an instance with no matching bridge observation derives NO chain.
 * - THE GRANT LAW (never widened): only a FULL_TEST Stripe key's chain
 *   carries the sandbox-executable definition (./chain-definitions.ts —
 *   the pinned catalog with the fixture-line provenance).
 * - THE INSTANCE is the bridge instance's own structural mirror — the
 *   ids (instanceId/capabilityId/implementationId) are the BRIDGE's own
 *   and align with the definition/implementation layers BY CONSTRUCTION
 *   (never id surgery against the fixtures).
 * - THE IMPLEMENTATION derives from the bridge instance's own fields
 *   (implementationId, providerName/providerVersion, corridors from its
 *   observed currencies — the bridge observes no geography, so no
 *   country is ever claimed — and the pinned per-provider adapter ref).
 * - THE OBSERVATION derives from the bridge's BridgeCapabilityObservation
 *   (freshness-stamped + versioned) through the pinned two-axis
 *   derivation (probe CONFIRMED ⇒ AVAILABLE + REACHABLE ⇒ AVAILABLE);
 *   the REAL observeCapability/validateCapabilityObservation contract is
 *   the authority (the host layer law forbids @payswap/* imports — the
 *   binding batteries drive the REAL validators against every derived
 *   chain, and the engine's stage-2/3 snapshot derivation re-validates
 *   the whole chain fail-closed at runtime).
 */

import type {
  BridgeCapabilityObservation,
  BridgeConnectedInstance,
  BridgeDerivation,
} from "./capability-bridge.js";
import type { PaySwapProbeProviderId } from "./probe-contracts.js";
import {
  connectionCapabilityDefinitionOf,
  pinnedConnectionAdapterRef,
  type PinnedConnectionCapabilityDefinition,
} from "./chain-definitions.js";

/**
 * The host-pinned observation scope (layer 4) — the
 * PinnedObservationScope/CapabilityObservation shape BY VALUE
 * (authorities: packages/route-planning/src/pins/capability.ts
 * `PinnedObservationScope` + packages/capability/src/observation.ts
 * `CapabilityObservation`; the two-axis availability is DERIVED, never
 * caller-fabricated — the pinned derivation below follows the REAL
 * resolveEffectiveAvailability law: REACHABLE ⇒ the capability's own
 * state).
 */
export interface ConnectionCapabilityObservationScope {
  readonly instanceId: string;
  readonly observedAt: string;
  readonly observationVersion: number;
  readonly capabilityState: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
  readonly sourceAvailability: "REACHABLE" | "UNREACHABLE" | "UNKNOWN";
  readonly availability: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
  readonly eligibility: "ELIGIBLE" | "NOT_ELIGIBLE" | "UNKNOWN";
  readonly health: { readonly status: string; readonly lastCheckedAt: string };
  readonly provenance: {
    readonly providerName: string;
    readonly source: "PROVIDER_API" | "PROVIDER_WEBHOOK" | "OPERATOR" | "INTERNAL";
    readonly capturedAt: string;
  };
}

/**
 * The host-pinned provider-implementation layer (layer 2) — the
 * ProviderImplementation shape BY VALUE (authority:
 * packages/capability/src/provider-implementation.ts; the corridor
 * scopes are ADVISORY claims — this derivation claims ONLY the
 * currencies the bridge observed, never a country).
 */
export interface ConnectionCapabilityImplementation {
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly version: string;
  readonly adapterRef: string;
  readonly corridors: readonly {
    readonly fromCountries?: readonly string[];
    readonly toCountries?: readonly string[];
    readonly currencies?: readonly string[];
  }[];
  readonly knownDeviations: readonly { readonly aspect: string; readonly deviation: string; readonly documented: true }[];
}

/**
 * One derived corridor route chain — the host-pinned
 * PinnedCorridorRouteChain shape (authority:
 * packages/route-planning/src/pins/capability.ts:306; the definition and
 * implementation layers are OPAQUE to route-planning — the REAL
 * capability machinery validates them at the corridor projection).
 * The instance layer is the bridge instance itself (a structural
 * superset of the ConnectedCapabilityInstance scope — INV-13
 * battery-proven by the connections-bridge battery against the REAL
 * assertConnectedInstance).
 */
export interface ConnectionCapabilityRouteChain {
  readonly definition: PinnedConnectionCapabilityDefinition;
  readonly implementation: ConnectionCapabilityImplementation;
  readonly instance: BridgeConnectedInstance;
  readonly observation: ConnectionCapabilityObservationScope;
}

/**
 * The observation of one bridge instance, derived from the bridge's own
 * BridgeCapabilityObservation (freshness-stamped + versioned). The
 * bridge converts ONLY probe-CONFIRMED evidence — the two-axis
 * derivation is therefore AVAILABLE + REACHABLE ⇒ AVAILABLE (the REAL
 * resolveEffectiveAvailability law); the eligibility records the
 * probe-confirmed connection standing (the corridor-level jurisdiction
 * law lives in the definition's restriction set, never here); the
 * health signal is the probe's own check instant.
 */
function observationOf(
  instance: BridgeConnectedInstance,
  evidence: BridgeCapabilityObservation | undefined,
): ConnectionCapabilityObservationScope | undefined {
  if (evidence === undefined || evidence.instanceId !== instance.instanceId) {
    // Fail-closed: no matching bridge observation ⇒ no chain (the
    // freshness/eligibility evidence is never fabricated).
    return undefined;
  }
  return Object.freeze({
    instanceId: evidence.instanceId,
    observedAt: evidence.observedAt,
    observationVersion: evidence.observationVersion,
    capabilityState: evidence.availability,
    sourceAvailability: "REACHABLE" as const,
    availability: evidence.availability,
    eligibility: "ELIGIBLE" as const,
    health: Object.freeze({ status: "HEALTHY", lastCheckedAt: evidence.observedAt }),
    provenance: Object.freeze({
      providerName: instance.providerName,
      source: "PROVIDER_API" as const,
      capturedAt: evidence.observedAt,
    }),
  });
}

/**
 * The implementation of one bridge instance, derived from the instance's
 * OWN fields: its implementationId, its providerName/providerVersion,
 * the definition's id/version (the exact version pin law), the pinned
 * per-provider adapter reference, and a corridor scope claiming ONLY the
 * currencies the bridge observed (the bridge observes no geography — a
 * country is never claimed).
 */
function implementationOf(
  instance: BridgeConnectedInstance,
  definition: PinnedConnectionCapabilityDefinition,
): ConnectionCapabilityImplementation {
  return Object.freeze({
    implementationId: instance.implementationId,
    providerName: instance.providerName,
    providerVersion: instance.providerVersion,
    capabilityId: definition.id,
    capabilityVersion: definition.version,
    version: "1.0.0",
    // (P22-H, ADR-0016 D2) The PSP adapter-ref table addresses PSP ids
    // only — the onchain rail's adapter ref is pinned by its OWN
    // derivation (onchain-chain-derivation.ts), never this bridge fold.
    adapterRef:
      instance.providerId === "stellar:testnet"
        ? "adapter:stellar/horizon@1"
        : pinnedConnectionAdapterRef(instance.providerId as PaySwapProbeProviderId),
    corridors:
      instance.currencies.length > 0
        ? Object.freeze([Object.freeze({ currencies: Object.freeze([...instance.currencies]) })])
        : Object.freeze([]),
    knownDeviations: Object.freeze([]),
  });
}

/**
 * Derive the corridor capability chains from the REAL connection bridge.
 * PURE: same bridge → byte-identical chains; the bridge's own
 * deterministic instance order is preserved. FAIL-CLOSED: an empty
 * bridge derives the empty set; an unknown (providerId, keyClass)
 * combination or a missing bridge observation derives NO chain — never
 * a guessed definition, never a fabricated observation.
 */
export function chainsFromBridge(bridge: BridgeDerivation): readonly ConnectionCapabilityRouteChain[] {
  const chains: ConnectionCapabilityRouteChain[] = [];
  for (const instance of bridge.instances) {
    // (P22-H, ADR-0016 D2) The PSP definition catalogue addresses PSP
    // ids only — the onchain rail chain derives from its OWN four-layer
    // hierarchy (onchain-chain-derivation.ts), never this bridge fold;
    // the rail instance (if one ever reached the bridge) is skipped
    // here honestly (its chain comes from the other derivation).
    if (instance.providerId === "stellar:testnet") {
      continue;
    }
    const definition = connectionCapabilityDefinitionOf(instance.providerId, instance.keyClass);
    if (definition === undefined) {
      continue;
    }
    const observation = observationOf(
      instance,
      bridge.observations.find((candidate) => candidate.instanceId === instance.instanceId),
    );
    if (observation === undefined) {
      continue;
    }
    chains.push(
      Object.freeze({
        definition,
        implementation: implementationOf(instance, definition),
        instance,
        observation,
      }),
    );
  }
  return Object.freeze(chains);
}
