/**
 * @payswap/opportunities — the pinned wire shapes of the capability
 * fabric's observation + eligibility model (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/capability (P2-W1 — the Capability and Network
 * Authority's contract package). The opportunities package is a
 * DISCOVERY projection over evidence, and the evidence discipline it
 * follows is the capability lane's:
 *
 * - VERSIONED OBSERVATIONS: the authority's CapabilityObservation carries
 *   a monotonic per-instance `observationVersion` (a positive integer;
 *   the latest version is the current one). This package pins the SAME
 *   discipline for opportunity evidence: every SupportingObservation is
 *   versioned, and a higher version supersedes a lower one for the same
 *   observation id deterministically.
 * - TWO-AXIS AVAILABILITY: the authority's law — the capability's own
 *   state and the confirming source's reachability are SEPARATE axes;
 *   an UNREACHABLE or UNKNOWN source yields effective availability
 *   UNKNOWN (never success, never failure). The pinned resolver matrix
 *   below is behaviour-identical to the authority's
 *   resolveEffectiveAvailability (asserted pair-by-pair by
 *   test/pins.test.ts).
 * - ELIGIBILITY OBSERVATION: the authority's closed
 *   ELIGIBLE | NOT_ELIGIBLE | UNKNOWN vocabulary — UNKNOWN is an honest
 *   state, never failure and never success.
 * - INV-13 (catalogue never authorizes): the authority's
 *   ConnectedCapabilityInstance is the ONLY authorization scope; a
 *   catalogue entry (no instance, no authorization, no eligibility) can
 *   never ground an executable block. The Lab-composition sites prove
 *   opportunity families follow exactly this law.
 */

// ---------------------------------------------------------------------------
// The two-axis availability law (CREDITED to the capability lane — P2-W1)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability src/availability.ts
 * `CAPABILITY_STATES` (byte-identical).
 */
export const PINNED_CAPABILITY_STATES = Object.freeze([
  "AVAILABLE",
  "DEGRADED",
  "UNAVAILABLE",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability `CapabilityState`. */
export type PinnedCapabilityState = (typeof PINNED_CAPABILITY_STATES)[number];

/**
 * VALUE PIN — authority: @payswap/capability src/availability.ts
 * `SOURCE_AVAILABILITIES` (byte-identical).
 */
export const PINNED_SOURCE_AVAILABILITIES = Object.freeze([
  "REACHABLE",
  "UNREACHABLE",
  "UNKNOWN",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability `SourceAvailability`. */
export type PinnedSourceAvailability =
  (typeof PINNED_SOURCE_AVAILABILITIES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `EffectiveAvailability`. There is deliberately NO 'FAILED' member —
 * external ambiguity can never be converted into failure or success.
 */
export type PinnedEffectiveAvailability =
  | "AVAILABLE"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "UNKNOWN";

/**
 * VALUE PIN — authority: @payswap/capability
 * `resolveEffectiveAvailability` (behaviour-identical; the canonical
 * matrix asserted pair-by-pair by test/pins.test.ts):
 *
 * - source REACHABLE   -> the capability state governs;
 * - source UNREACHABLE -> UNKNOWN (the state cannot be confirmed);
 * - source UNKNOWN     -> UNKNOWN (never success, never failure).
 */
export function pinnedResolveEffectiveAvailability(
  state: PinnedCapabilityState,
  source: PinnedSourceAvailability,
): PinnedEffectiveAvailability {
  switch (source) {
    case "REACHABLE":
      return state;
    case "UNREACHABLE":
      return "UNKNOWN";
    case "UNKNOWN":
      return "UNKNOWN";
  }
}

// ---------------------------------------------------------------------------
// The observation discipline (versioned, evidence — never authorization)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/observation.ts
 * `EligibilityObservation` (byte-identical closed vocabulary).
 */
export type PinnedEligibilityObservation =
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "UNKNOWN";

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `ObservationProvenance` (subset: the source-of-record vocabulary the
 * discovery policy cites when explaining WHY evidence is trusted).
 */
export interface PinnedObservationProvenance {
  readonly providerName: string;
  readonly source:
    | "PROVIDER_API"
    | "PROVIDER_WEBHOOK"
    | "OPERATOR"
    | "INTERNAL";
  readonly capturedAt: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/observation.ts
 * `CapabilityObservation` (SUBSET: the identity, the monotonic
 * observation version, the two axes, the derived availability and the
 * eligibility observation; the authority's shape additionally carries
 * health, quota, terms and the INV-14 provider-state envelope — owned by
 * the capability lane, opaque here). OBSERVATIONS ARE EVIDENCE, NEVER
 * AUTHORIZATION (the authority's own law): an ELIGIBLE observation never
 * substitutes for protocol authorization.
 */
export interface PinnedCapabilityObservation {
  readonly instanceId: string;
  readonly observedAt: string;
  /** Monotonic per-instance observation version (positive integer). */
  readonly observationVersion: number;
  readonly capabilityState: PinnedCapabilityState;
  readonly sourceAvailability: PinnedSourceAvailability;
  /** DERIVED from the two axes — never caller-declared. */
  readonly availability: PinnedEffectiveAvailability;
  readonly eligibility: PinnedEligibilityObservation;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/connected-instance.ts
 * `ConnectedCapabilityInstance` (SUBSET: the identity + authorization +
 * eligibility surface; the ONLY authorization scope in the fabric). The
 * opportunities package pins this shape ONLY to state the contrast law:
 * a FinancialOpportunity is deliberately INCOMPATIBLE with it — an
 * opportunity carries no instanceId, no authorization and no permission
 * state, and there is no exported conversion (test-enforced).
 */
export interface PinnedConnectedInstanceScope {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly authorization: {
    readonly status: "ACTIVE" | "PENDING" | "REVOKED" | "EXPIRED" | "UNKNOWN";
  };
  readonly eligibility: {
    readonly eligible: boolean;
    readonly reasons: readonly string[];
  };
}

/**
 * VALUE PIN — authority: @payswap/capability INV-13
 * (catalogue-never-authorizes): a value that structurally CANNOT be a
 * connected instance (no instanceId / authorization / eligibility) is a
 * catalogue-shaped claim and may never ground an executable block. Pinned
 * as a pure predicate, behaviour-identical to the Lab's
 * pinnedLooksLikeConnectedInstance law (packages/lab/src/pins/
 * capability.ts — the same authority, one hop closer).
 */
export function pinnedLooksLikeConnectedInstance(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PinnedConnectedInstanceScope>;
  return (
    typeof record.instanceId === "string" &&
    record.instanceId.length > 0 &&
    record.authorization !== null &&
    typeof record.authorization === "object" &&
    typeof record.authorization.status === "string" &&
    record.eligibility !== null &&
    typeof record.eligibility === "object" &&
    typeof record.eligibility.eligible === "boolean"
  );
}
