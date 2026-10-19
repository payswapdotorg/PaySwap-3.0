/**
 * @payswap/lab — the PINNED WIRE SHAPES of the capability fabric
 * (P6-W1, lane R4-W1; commit 1/4 — the type-level pins).
 *
 * LAYER LAW (the v1 leaf-in-flight law): ZERO sibling imports. Every
 * mirror below names its AUTHORITY — @payswap/capability, the Capability
 * and Network Authority's contract package (P2-W1, accepted). The pins are
 * STRUCTURALLY COMPATIBLE with the authority's shapes: a real
 * ConnectedCapabilityInstance value is assignable to the pinned subset
 * here (subset typing — real values assignable; the TL wires the imports
 * at integration; this package imports NOTHING from siblings).
 *
 * THE ACCEPTED RENAMES (recorded in the P6-W1 work order):
 * - executionMode → execution      : the Lab search query's mode field is
 *   named `execution` in this package (the vocabulary itself is unchanged
 *   and remains CREDITED to the capability lane);
 * - ServiceAccess → DECLARED_CAPABILITY : the building-block kind that the
 *   old repo called SERVICE_ACCESS is pinned and re-declared here as
 *   DECLARED_CAPABILITY (a declared developer-service capability block).
 *
 * Pins in this module (authority: @payswap/capability):
 * - PINNED_EXECUTION_MODES + PinnedExecutionMode (INV-15: no priority)
 * - PINNED_EXECUTION_MODE_VOCABULARY_VERSION
 * - PINNED_CAPABILITY_CLASSES + PinnedCapabilityClass
 * - PinnedAuthorizationState / PinnedPermissionState /
 *   PinnedInstanceEligibility (the connection/permission axis)
 * - PinnedConnectedInstance — the ONLY executable grounding scope (INV-13:
 *   a catalogue entry is never a connected instance)
 * - PinnedProviderCatalogueEntry — the advertisement shape (never authority)
 * - PinnedCapabilityDefinition — the declared-capability vocabulary subset
 *   the Lab search indexes (including the INV-15 native-optimization
 *   baseline declaration)
 */

// ---------------------------------------------------------------------------
// Execution modes (CREDITED to the capability lane — P2-W1)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability src/execution-modes.ts
 * `EXECUTION_MODES` (byte-identical; cross-lane consistency is asserted by
 * test/pins.test.ts; the vocabulary is the capability lane's — this
 * package only mirrors it and credits the lane). NONE of the modes
 * bypasses protocol authorization, policy, compliance, security,
 * idempotency or evidence. INV-15 baseline discipline: the vocabulary
 * assigns NO priority — PASS_THROUGH_NATIVE (the provider-native incumbent
 * baseline) is never structurally disadvantaged.
 */
export const PINNED_EXECUTION_MODES = Object.freeze([
  "PASS_THROUGH_NATIVE",
  "COMPOSED_PAYSWAP",
  "OPTIMIZED_MULTI_PROVIDER",
] as const);

/**
 * STRUCTURAL PIN — authority: @payswap/capability `ExecutionMode`.
 * The Lab search query field carrying this type is named `execution`
 * (the accepted P6-W1 rename of the old `executionMode` field name — the
 * vocabulary members themselves are unchanged).
 */
export type PinnedExecutionMode = (typeof PINNED_EXECUTION_MODES)[number];

/**
 * VALUE PIN — authority: @payswap/capability src/execution-modes.ts
 * `EXECUTION_MODE_VOCABULARY_VERSION` ("1.0.0", byte-identical). An
 * execution-mode vocabulary carrying a different version is stale.
 */
export const PINNED_EXECUTION_MODE_VOCABULARY_VERSION = "1.0.0" as const;

/** Total predicate over the pinned execution-mode vocabulary. */
export function isPinnedExecutionMode(
  value: unknown,
): value is PinnedExecutionMode {
  return (
    typeof value === "string" &&
    (PINNED_EXECUTION_MODES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Capability classes (CREDITED to the capability lane — P2-W1)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability
 * src/capability-definition.ts `CAPABILITY_CLASSES` (byte-identical; the
 * old "FROZEN §11" vocabulary carried forward). The same model represents
 * banks, PSPs, cards, mobile money, Stripe/Connect, FX, credit/liquidity,
 * chains, wallets, DEXs, bridges, smart-contract protocols, data
 * providers, experts, agents and future services.
 */
export const PINNED_CAPABILITY_CLASSES = Object.freeze([
  "rail_movement",
  "liquidity",
  "fx",
  "credit",
  "lending",
  "merchant_acceptance",
  "identity_kyc_aml",
  "expert_resolution",
  "agent_behavior",
  "software_extension",
  "developer_service",
  "verification",
  "data_oracle",
] as const);

/**
 * STRUCTURAL PIN — authority: @payswap/capability `CapabilityClass`.
 * Used by the Lab building-block index to classify certified
 * smart-contract blocks and DECLARED_CAPABILITY blocks.
 */
export type PinnedCapabilityClass = (typeof PINNED_CAPABILITY_CLASSES)[number];

/** Total predicate over the pinned capability-class vocabulary. */
export function isPinnedCapabilityClass(
  value: unknown,
): value is PinnedCapabilityClass {
  return (
    typeof value === "string" &&
    (PINNED_CAPABILITY_CLASSES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Connection / permission / eligibility axis (INV-13)
// ---------------------------------------------------------------------------

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

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `ConnectorPermissionState`.
 */
export interface PinnedPermissionState {
  readonly granted: readonly string[];
  readonly requested: readonly string[];
  readonly missing: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability `InstanceEligibility`.
 */
export interface PinnedInstanceEligibility {
  readonly eligible: boolean;
  /** Empty when eligible; otherwise the disqualifying reasons. */
  readonly reasons: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/connected-instance.ts `ConnectedCapabilityInstance` (SUBSET: the
 * identity + authorization/permission/eligibility/geography/configuration
 * surface the Lab search needs; the authority's shape is a superset — real
 * instance values are assignable here). This is the ONLY shape that can
 * ground executable selection (INV-13: catalogue claims never authorize).
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
  readonly credentialScope: {
    readonly credentialRef: string;
    readonly credentialKind: string;
  };
  readonly geography: {
    readonly countries: readonly string[];
  };
  readonly currencies: readonly string[];
  readonly permissionState: PinnedPermissionState;
  readonly eligibility: PinnedInstanceEligibility;
  /** Provider-neutral configuration surface (opaque keys to primitives). */
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/connected-instance.ts `ProviderCatalogueEntry`. Deliberately
 * NON-overlapping with PinnedConnectedInstance: no instanceId, no
 * implementationId, no accountRef, no authorization, no credential scope,
 * no permission state, no eligibility (INV-13: a catalogue entry is a
 * platform-wide advertisement, never an executable scope).
 */
export interface PinnedProviderCatalogueEntry {
  readonly catalogueEntryId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly capabilityId: string;
  readonly summary: string;
  readonly advertisedScope: {
    readonly platformWide: true;
    readonly advertisedGeographies: readonly string[];
    readonly advertisedCurrencies: readonly string[];
  };
}

/**
 * The catalogue-vs-instance law (INV-13, pinned as a pure predicate): a
 * value that structurally CANNOT be a connected instance (no instanceId /
 * authorization / eligibility) is a catalogue-shaped claim and may never
 * ground an executable Lab block. The fail-closed throwing guards live in
 * src/search.ts.
 */
export function pinnedLooksLikeConnectedInstance(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PinnedConnectedInstance>;
  return (
    typeof record.instanceId === "string" &&
    record.instanceId.length > 0 &&
    record.authorization !== null &&
    typeof record.authorization === "object" &&
    typeof record.authorization.status === "string" &&
    record.eligibility !== null &&
    typeof record.eligibility === "object" &&
    typeof record.eligibility.eligible === "boolean" &&
    Array.isArray(record.currencies)
  );
}

// ---------------------------------------------------------------------------
// Declared capability definitions (the static search vocabulary)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/capability-definition.ts `CapabilityDefinition` (SUBSET: the fields
 * the Lab search and building-block index read; the authority's shape is a
 * superset carrying the full executable declaration — semantics, state
 * machine, preconditions, authorization requirements, side effects,
 * idempotency, compensation, user actions, provider vocabulary, external
 * objects, evidence, economics and jurisdiction constraints).
 *
 * `executionModes` is the DECLARED mode list: mandatory, never inferred,
 * no duplicates (validated by the capability lane's
 * validateDeclaredExecutionModes). A definition declaring
 * `nativeOptimization.benchmarkBaseline === true` is the INV-15 incumbent
 * provider-native baseline — exactly like any other block, no ranking
 * advantage.
 */
export interface PinnedCapabilityDefinition {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly summary: string;
  readonly kind: string;
  readonly requiredPermissions: readonly string[];
  readonly executionModes: readonly PinnedExecutionMode[];
  readonly nativeOptimization?: {
    readonly optimizationKind: string;
    readonly benchmarkBaseline: boolean;
  };
}

/**
 * The INV-15 incumbent-baseline predicate (pinned): a definition declares
 * the provider-native incumbent baseline exactly when its native
 * optimization declaration carries benchmarkBaseline === true. The Lab
 * treats that block exactly like every other block — it can win or lose
 * on evidence, and nothing here ranks PaySwap composition above it.
 */
export function pinnedIsIncumbentBaselineDefinition(
  definition: PinnedCapabilityDefinition,
): boolean {
  return definition.nativeOptimization?.benchmarkBaseline === true;
}
