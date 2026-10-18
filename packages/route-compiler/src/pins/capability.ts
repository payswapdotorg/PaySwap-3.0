/**
 * @payswap/route-compiler — the PINNED WIRE SHAPES of the capability
 * fabric (P5-W1, lane R3-W1).
 *
 * LAYER LAW: zero sibling imports (the v1 intelligence-layer
 * leaf-in-flight law). Every mirror below names its AUTHORITY —
 * @payswap/capability, the Capability and Network Authority's contract
 * package (P2-W1). The mirrors are deliberately SUBSET-typed: the route
 * compiler requires LESS than the authority, so any genuine authority
 * value remains structurally assignable to the pin, while a pin can never
 * widen an authority law. Vocabulary VALUES are pinned byte-identical and
 * their cross-lane consistency is asserted by test/pins.test.ts.
 *
 * Pins in this module (authority: @payswap/capability):
 * - PINNED_EXECUTION_MODES + PinnedExecutionMode (INV-15: no priority)
 * - PINNED_EXECUTION_MODE_VOCABULARY_VERSION
 * - PinnedAuthorizationState / PinnedPermissionState /
 *   PinnedInstanceEligibility (the connection/permission axis of the
 *   comparability gate)
 * - PinnedConnectedInstance (the ONLY authorization scope, INV-13)
 * - PinnedObservationProvenance + PinnedCapabilityObservation (the
 *   current-eligibility axis: two-axis availability, monotonic version)
 * - PinnedCorridorView / PinnedCorridorRouteEvaluation /
 *   PinnedCorridorRouteLineage (the corridor discovery projection — a
 *   projection, never an authority)
 */

/**
 * VALUE PIN — authority: @payswap/capability src/execution-modes.ts
 * `EXECUTION_MODES` (byte-identical; cross-lane consistency
 * test-enforced). NONE of the modes bypasses protocol authorization,
 * policy, compliance, security, idempotency or evidence. INV-15 baseline
 * discipline: the vocabulary assigns NO priority — PASS_THROUGH_NATIVE
 * (the provider-native incumbent baseline) is never structurally
 * disadvantaged.
 */
export const PINNED_EXECUTION_MODES = Object.freeze([
  "PASS_THROUGH_NATIVE",
  "COMPOSED_PAYSWAP",
  "OPTIMIZED_MULTI_PROVIDER",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability `ExecutionMode`. */
export type PinnedExecutionMode = (typeof PINNED_EXECUTION_MODES)[number];

/**
 * VALUE PIN — authority: @payswap/capability src/execution-modes.ts
 * `EXECUTION_MODE_VOCABULARY_VERSION`. Pinned byte-identical; an
 * execution mode vocabulary carrying a different version is stale.
 */
export const PINNED_EXECUTION_MODE_VOCABULARY_VERSION = "1.0.0" as const;

/**
 * VALUE PIN — authority: @payswap/capability src/observation.ts /
 * availability.ts `CAPABILITY_STATES`, `SOURCE_AVAILABILITIES` and
 * `EFFECTIVE_AVAILABILITIES` (byte-identical; the two-axis observation
 * law: an unreachable or unknown source yields UNKNOWN effective
 * availability — never success, never failure).
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

/** STRUCTURAL PIN — authority: @payswap/capability `CapabilityState` etc. */
export type PinnedCapabilityState = (typeof PINNED_CAPABILITY_STATES)[number];
export type PinnedSourceAvailability = (typeof PINNED_SOURCE_AVAILABILITIES)[number];
export type PinnedEffectiveAvailability = (typeof PINNED_EFFECTIVE_AVAILABILITIES)[number];

/** STRUCTURAL PIN — authority: @payswap/capability `EligibilityObservation`. */
export type PinnedEligibilityObservation = "ELIGIBLE" | "NOT_ELIGIBLE" | "UNKNOWN";

/** STRUCTURAL PIN — authority: @payswap/capability `HealthStatus`. */
export type PinnedHealthStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/connected-instance.ts `ConnectorAuthorizationState`.
 */
export interface PinnedAuthorizationState {
  readonly status: "ACTIVE" | "PENDING" | "REVOKED" | "EXPIRED" | "UNKNOWN";
  readonly grantedAt?: string;
  readonly revokedAt?: string;
  readonly authorizationRef?: string;
}

/** STRUCTURAL PIN — authority: @payswap/capability `ConnectorPermissionState`. */
export interface PinnedPermissionState {
  readonly granted: readonly string[];
  readonly requested: readonly string[];
  readonly missing: readonly string[];
}

/** STRUCTURAL PIN — authority: @payswap/capability `InstanceEligibility`. */
export interface PinnedInstanceEligibility {
  readonly eligible: boolean;
  /** Empty when eligible; otherwise the disqualifying reasons. */
  readonly reasons: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/connected-instance.ts `ConnectedCapabilityInstance` (SUBSET: the
 * identity + authorization/permission/eligibility surface the comparability
 * gate needs; the authority's shape additionally carries credentialScope,
 * geography, configuration and provider-neutral extension surfaces — owned
 * by the capability lane, opaque here). This is the ONLY shape that can
 * scope provider execution (INV-13: catalogue claims never authorize).
 */
export interface PinnedConnectedInstance {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  /** The connected account this instance is scoped to. */
  readonly accountRef: string;
  readonly tenantRef: string;
  readonly authorization: PinnedAuthorizationState;
  readonly permissionState: PinnedPermissionState;
  readonly eligibility: PinnedInstanceEligibility;
  readonly currencies: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/observation.ts
 * `ObservationProvenance`.
 */
export interface PinnedObservationProvenance {
  readonly providerName: string;
  readonly source: "PROVIDER_API" | "PROVIDER_WEBHOOK" | "OPERATOR" | "INTERNAL";
  readonly capturedAt: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/observation.ts
 * `CapabilityObservation` (SUBSET: the two-axis availability + eligibility
 * + health + provenance the current-eligibility requirement needs; quota,
 * terms and externalState envelopes are owned by the capability lane).
 * `observationVersion` is the MONOTONIC per-instance version — the exact
 * version the compiler decides on is preserved in lineage (the
 * observation-VERSION preservation law).
 */
export interface PinnedCapabilityObservation {
  readonly instanceId: string;
  readonly observedAt: string;
  /** Monotonic per-instance observation version. */
  readonly observationVersion: number;
  readonly capabilityState: PinnedCapabilityState;
  readonly sourceAvailability: PinnedSourceAvailability;
  /** The DERIVED two-axis effective availability (never caller-fabricated). */
  readonly availability: PinnedEffectiveAvailability;
  readonly eligibility: PinnedEligibilityObservation;
  readonly health: {
    readonly status: PinnedHealthStatus;
    readonly lastCheckedAt: string;
  };
  readonly provenance: PinnedObservationProvenance;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorRouteLineage`: the versions a corridor route evaluation derived
 * from — the canonical LINEAGE shape the compiler preserves verbatim
 * (capability definition version, implementation version, connected
 * instance, provider version, OBSERVATION VERSION, restriction sets).
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
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorTermsReference` (versioned pricing/delivery terms references —
 * opaque here; the credible-pricing requirement demands the reference be
 * present and versioned, never the terms' content).
 */
export interface PinnedCorridorTermsReference {
  readonly termsRef: string;
  readonly termsVersion: string;
  readonly deliveryEstimateLabel: "GUARANTEED" | "INDICATIVE";
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorRouteEvaluation` (SUBSET: routeId, eligibility verdict,
 * exclusion reasons, lineage, offered execution modes, terms refs; the
 * degraded/certified/required-fields members are owned by the capability
 * lane's projection and consumed through their own pins where needed).
 */
export interface PinnedCorridorRouteEvaluation {
  /** Deterministic route reference (the connected instance id). */
  readonly routeId: string;
  readonly eligible: boolean;
  /** Empty iff eligible; otherwise EVERY surfaced reason (never just the first). */
  readonly exclusionReasons: readonly {
    readonly code: string;
    readonly cause: string;
    readonly layer: string;
    readonly message: string;
  }[];
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
 * PROJECTION over capabilities — evidence, never an authority (a corridor
 * is not a currency pair and never a routing decision).
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
 * VALUE PIN — authority: @payswap/capability src/corridor-types.ts
 * `CORRIDOR_PROJECTION_VERSION` ("1.0.0", byte-identical) and the
 * funding/payout constraint exclusion codes the comparability gate
 * reconciles (byte-identical members of CORRIDOR_EXCLUSION_CODES).
 */
export const PINNED_CORRIDOR_PROJECTION_VERSION = "1.0.0" as const;

export const PINNED_PAYOUT_CONSTRAINT_CODES = Object.freeze([
  "FUNDING_METHOD_NOT_SERVED",
  "PAYOUT_METHOD_NOT_SERVED",
  "MISSING_REQUIRED_FIELDS",
  "CUTOFF_PASSED",
] as const);
