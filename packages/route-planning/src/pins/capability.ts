/**
 * @payswap/route-planning — the PINNED WIRE SHAPES of the capability
 * fabric (P16-A, ADR-0009 D2).
 *
 * LAYER LAW: zero sibling imports. Every mirror below names its AUTHORITY
 * — @payswap/capability, the Capability and Network Authority's contract
 * package (P2-W1). The mirrors are deliberately SUBSET-typed (the
 * route-compiler pins/capability.ts discipline): any genuine authority
 * value remains structurally assignable to the pin, while a pin can never
 * widen an authority law. Vocabulary VALUES are pinned byte-identical and
 * their cross-lane consistency is asserted by test/pins-fidelity.test.ts.
 *
 * Pins in this module (authority: @payswap/capability):
 * - the corridor discovery projection (query / view / route evaluation /
 *   lineage / terms references / typed exclusions)
 * - the connected-instance SCOPE surface (INV-13 — the only authorization
 *   scope; a ProviderCatalogueEntry structurally cannot satisfy it)
 * - the observation surface (two-axis availability, monotonic version,
 *   quota) and the freshness policy
 * - the corridor restriction sets (amount limits, cutoffs, terms)
 * - the per-route four-layer chain the corridor port evaluates
 */

/**
 * VALUE PIN — authority: @payswap/capability src/execution-modes.ts
 * `EXECUTION_MODES` (byte-identical; INV-15: no priority — the
 * provider-native incumbent baseline is never structurally disadvantaged).
 */
export const PINNED_EXECUTION_MODES = Object.freeze([
  "PASS_THROUGH_NATIVE",
  "COMPOSED_PAYSWAP",
  "OPTIMIZED_MULTI_PROVIDER",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability `ExecutionMode`. */
export type PinnedExecutionMode = (typeof PINNED_EXECUTION_MODES)[number];

/**
 * VALUE PIN — authority: @payswap/capability src/availability.ts
 * `CAPABILITY_STATES`, `SOURCE_AVAILABILITIES`, `EFFECTIVE_AVAILABILITIES`
 * (byte-identical; the two-axis observation law — an unreachable or
 * unknown source yields UNKNOWN effective availability: never success,
 * never failure).
 */
export const PINNED_CAPABILITY_STATES = Object.freeze([
  "AVAILABLE",
  "DEGRADED",
  "UNAVAILABLE",
] as const);

export const PINNED_SOURCE_AVAILABILITIES = Object.freeze([
  "REACHABLE",
  "UNREACHABLE",
  "UNKNOWN",
] as const);

export const PINNED_EFFECTIVE_AVAILABILITIES = Object.freeze([
  "AVAILABLE",
  "DEGRADED",
  "UNAVAILABLE",
  "UNKNOWN",
] as const);

export type PinnedCapabilityState = (typeof PINNED_CAPABILITY_STATES)[number];
export type PinnedSourceAvailability = (typeof PINNED_SOURCE_AVAILABILITIES)[number];
export type PinnedEffectiveAvailability = (typeof PINNED_EFFECTIVE_AVAILABILITIES)[number];

/**
 * VALUE PIN — authority: @payswap/capability src/corridor-types.ts
 * `CORRIDOR_PROJECTION_VERSION` ("1.0.0", byte-identical).
 */
export const PINNED_CORRIDOR_PROJECTION_VERSION = "1.0.0" as const;

/**
 * VALUE PIN — authority: @payswap/capability src/corridor-types.ts
 * `CORRIDOR_EXCLUSION_CODES` member "STALE_OBSERVATION" (the one code the
 * snapshot's derived staleness verdict consults — the verdict is DERIVED
 * from the real projection's exclusion, never re-evaluated locally).
 */
export const PINNED_STALE_OBSERVATION_CODE = "STALE_OBSERVATION" as const;

/**
 * VALUE PIN — authority: @payswap/capability src/connected-instance.ts
 * the ACTIVE member of `ConnectorAuthorizationState["status"]` (only an
 * ACTIVE authorization can serve an eligible rail).
 */
export const PINNED_AUTHORIZATION_ACTIVE = "ACTIVE" as const;

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorQuery` (the Wise-style corridor query; `asOf` is DATA — the
 * projection never reads a clock).
 */
export interface PinnedCorridorQuery {
  readonly sourceCountry: string;
  readonly destinationCountry: string;
  readonly sourceCurrency: string;
  readonly destinationCurrency: string;
  readonly customerType: string;
  readonly sendAmount: { readonly currency: string; readonly minorUnits: string };
  readonly fundingMethod?: string;
  readonly payoutMethod?: string;
  readonly recipientType?: string;
  readonly presentedFieldIds?: readonly string[];
  /** Evaluation time as data (strict ISO-8601 UTC). */
  readonly asOf: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `ObservationFreshnessPolicy` (explicit, caller-supplied).
 */
export interface PinnedObservationFreshnessPolicy {
  readonly maxAgeSeconds: number;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorExclusion`: one surfaced exclusion reason — code + cause +
 * layer + message (+ optional detail), preserved VERBATIM by every
 * consumer (never just the first reason).
 */
export interface PinnedCorridorExclusion {
  readonly code: string;
  readonly cause: string;
  readonly layer: string;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorRouteLineage`: the versions a corridor route evaluation
 * derived from (definition, implementation, connected instance, provider,
 * OBSERVATION VERSION, restriction sets — the preservation law).
 */
export interface PinnedCorridorRouteLineage {
  readonly capabilityDefinitionId: string;
  readonly capabilityDefinitionVersion: string;
  readonly providerImplementationId: string;
  readonly implementationVersion: string;
  readonly connectedInstanceId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly observationVersion: number;
  readonly observedAt: string;
  readonly restrictionSetIds: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/restrictions.ts
 * `CorridorTermsReference` (versioned pricing/delivery terms references —
 * opaque here).
 */
export interface PinnedCorridorTermsReference {
  readonly termsRef: string;
  readonly termsVersion: string;
  readonly deliveryEstimateLabel: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorRouteEvaluation` (SUBSET: routeId, eligibility verdict,
 * exclusion reasons, effective availability, lineage, offered execution
 * modes, terms refs; degraded/certified/required-fields members are owned
 * by the capability lane's projection).
 */
export interface PinnedCorridorRouteEvaluation {
  /** Deterministic route reference (the connected instance id). */
  readonly routeId: string;
  readonly eligible: boolean;
  /** Empty iff eligible; otherwise EVERY surfaced reason (never just the first). */
  readonly exclusionReasons: readonly PinnedCorridorExclusion[];
  readonly effectiveAvailability: PinnedEffectiveAvailability;
  readonly lineage: PinnedCorridorRouteLineage;
  /** Modes the underlying executable capability declares (verbatim). */
  readonly offeredExecutionModes: readonly PinnedExecutionMode[];
  /** Versioned pricing/delivery terms references (opaque). */
  readonly termsRefs: readonly PinnedCorridorTermsReference[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorView` (the discovery projection's output): every evaluated
 * route plus the eligible subset, in deterministic input order. A
 * PROJECTION over capabilities — evidence, never an authority.
 */
export interface PinnedCorridorView {
  readonly projectionVersion: string;
  readonly query: {
    readonly sourceCountry: string;
    readonly destinationCountry: string;
    readonly sourceCurrency: string;
    readonly destinationCurrency: string;
    readonly asOf: string;
  };
  readonly routes: readonly PinnedCorridorRouteEvaluation[];
  readonly eligibleRoutes: readonly PinnedCorridorRouteEvaluation[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/connected-instance.ts `ConnectedCapabilityInstance` (SUBSET: the
 * identity + authorization/permission/eligibility/geography/currency
 * scope surface a rail snapshot discloses; credentialScope and
 * configuration are owned by the capability lane, opaque here). This is
 * the ONLY shape that can scope a rail (INV-13: a ProviderCatalogueEntry
 * lacks instanceId/accountRef/tenantRef/authorization/permissionState and
 * is therefore structurally unconstructible as this pin).
 */
export interface PinnedInstanceScope {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly accountRef: string;
  readonly tenantRef: string;
  readonly authorization: {
    readonly status: "ACTIVE" | "PENDING" | "REVOKED" | "EXPIRED" | "UNKNOWN";
    readonly grantedAt?: string;
    readonly revokedAt?: string;
    readonly authorizationRef?: string;
  };
  readonly permissionState: {
    readonly granted: readonly string[];
    readonly requested: readonly string[];
    readonly missing: readonly string[];
  };
  readonly eligibility: { readonly eligible: boolean; readonly reasons: readonly string[] };
  readonly geography: { readonly countries: readonly string[]; readonly regions?: readonly string[] };
  readonly currencies: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/observation.ts
 * `CapabilityObservation` (SUBSET: the two-axis availability + eligibility
 * + health + provenance + quota the snapshot discloses; terms and
 * externalState envelopes are owned by the capability lane).
 */
export interface PinnedObservationScope {
  readonly instanceId: string;
  readonly observedAt: string;
  /** Monotonic per-instance observation version. */
  readonly observationVersion: number;
  readonly capabilityState: PinnedCapabilityState;
  readonly sourceAvailability: PinnedSourceAvailability;
  /** The DERIVED two-axis effective availability (never caller-fabricated). */
  readonly availability: PinnedEffectiveAvailability;
  readonly eligibility: "ELIGIBLE" | "NOT_ELIGIBLE" | "UNKNOWN";
  readonly health: { readonly status: string; readonly lastCheckedAt: string };
  readonly quota?: { readonly limit?: number; readonly remaining?: number; readonly windowSeconds?: number };
  readonly provenance: {
    readonly providerName: string;
    readonly source: string;
    readonly capturedAt: string;
  };
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/restrictions.ts
 * `CorridorRestrictionSet` (SUBSET: the amount limits, cutoffs and terms
 * references a rail snapshot discloses; the served-dimension lists are
 * carried verbatim). Every dimension is OPTIONAL in the authority — an
 * absent dimension is UNRESTRICTED.
 */
export interface PinnedCorridorRestrictionSet {
  readonly restrictionSetId: string;
  readonly version: string;
  readonly sourceCountries?: readonly string[];
  readonly destinationCountries?: readonly string[];
  readonly currencies?: readonly string[];
  readonly customerTypes?: readonly string[];
  readonly fundingMethods?: readonly string[];
  readonly payoutMethods?: readonly string[];
  readonly recipientTypes?: readonly string[];
  readonly amountLimits?: {
    readonly min?: { readonly currency: string; readonly minorUnits: string };
    readonly max?: { readonly currency: string; readonly minorUnits: string };
  };
  readonly requiredFields: readonly {
    readonly fieldId: string;
    readonly description: string;
    readonly appliesTo: string;
  }[];
  readonly cutoffs: readonly {
    readonly cutoffId: string;
    readonly description: string;
    readonly appliesTo: string;
    readonly cutoffTimeUtc: string;
    readonly processingDayRule: string;
  }[];
  readonly terms?: PinnedCorridorTermsReference;
  readonly declaredBy: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/corridor-evaluation.ts `CorridorRouteInput` (the four-layer chain:
 * definition -> implementation -> instance -> observation). The
 * definition and implementation layers are OPAQUE here — validated by
 * the REAL capability machinery through the corridor port (never
 * re-interpreted locally); the instance and observation layers are the
 * pinned scope surfaces the snapshot discloses.
 */
export interface PinnedCorridorRouteChain {
  /** Opaque capability definition (layer 1) — the authority validates it. */
  readonly definition: unknown;
  /** Opaque provider implementation (layer 2) — the authority validates it. */
  readonly implementation: unknown;
  /** The connected-instance scope (layer 3 — INV-13 surface). */
  readonly instance: PinnedInstanceScope;
  /** The current observation (layer 4 — the freshness/eligibility evidence). */
  readonly observation: PinnedObservationScope;
}

/**
 * STRUCTURAL PIN — the per-side corridor evaluation the
 * CorridorProjectionPort returns: the pinned CorridorView PLUS the
 * per-route restriction sets (index-aligned with view.routes — the
 * amount-limit/cutoff detail the snapshot discloses, derived by the REAL
 * evaluation, never re-derived locally).
 */
export interface PinnedCorridorSideEvaluation {
  readonly view: PinnedCorridorView;
  readonly routeRestrictionSets: readonly (readonly PinnedCorridorRestrictionSet[])[];
}
