/**
 * @payswap/merchant — the PINNED WIRE SHAPES of the capability fabric
 * (P5-W3, lane R3-W3; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports (the v1 leaf-in-flight law). Every
 * mirror below names its AUTHORITY — @payswap/capability, the Capability
 * and Network Authority's contract package (P2-W1). The
 * EXECUTION-MODE VOCABULARY is CREDITED TO THE CAPABILITY LANE: it is
 * pinned here byte-identical for cross-lane consistency (asserted by
 * test/pins.test.ts) and never re-declared with different members,
 * order or priority.
 *
 * Pins in this module (authority: @payswap/capability):
 * - PINNED_EXECUTION_MODES + PinnedExecutionMode (INV-15: no priority)
 * - PINNED_EXECUTION_MODE_VOCABULARY_VERSION
 * - PinnedAuthorizationState / PinnedPermissionState /
 *   PinnedInstanceEligibility (the connection/permission axis)
 * - PinnedConnectedInstance — the ONLY authorization scope (INV-13:
 *   a catalogue entry is never a connected instance; a merchant
 *   settlement route can only be scoped to a genuinely connected one)
 */

// ---------------------------------------------------------------------------
// Execution modes (CREDITED to the capability lane — P2-W1)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability src/execution-modes.ts
 * `EXECUTION_MODES` (byte-identical; cross-lane consistency
 * test-enforced; the vocabulary is the capability lane's — this package
 * only mirrors it and credits the lane). NONE of the modes bypasses
 * protocol authorization, policy, compliance, security, idempotency or
 * evidence. INV-15 baseline discipline: the vocabulary assigns NO
 * priority — PASS_THROUGH_NATIVE (the provider-native incumbent
 * baseline) is never structurally disadvantaged.
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
 * `EXECUTION_MODE_VOCABULARY_VERSION` ("1.0.0", byte-identical). An
 * execution-mode vocabulary carrying a different version is stale.
 */
export const PINNED_EXECUTION_MODE_VOCABULARY_VERSION = "1.0.0" as const;

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
 * identity + authorization/permission/eligibility surface the merchant
 * settlement paths need; the authority's shape additionally carries
 * credentialScope, geography and configuration — owned by the
 * capability lane, opaque here). This is the ONLY shape that can scope
 * provider execution (INV-13: catalogue claims never authorize).
 */
export interface PinnedConnectedInstance {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  /** The connected merchant account this instance is scoped to. */
  readonly accountRef: string;
  readonly tenantRef: string;
  readonly authorization: PinnedAuthorizationState;
  readonly permissionState: PinnedPermissionState;
  readonly eligibility: PinnedInstanceEligibility;
  readonly currencies: readonly string[];
}

/**
 * The catalogue-vs-instance law (INV-13, pinned as a pure predicate):
 * a value that structurally CANNOT be a connected instance (no
 * instanceId / authorization / eligibility) is a catalogue-shaped
 * claim and may never scope a merchant settlement route. The fail-closed
 * throwing guard lives in src/connectivity.ts.
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
