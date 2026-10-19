/**
 * @payswap/lab — the PINNED WIRE SHAPES of the capability observation
 * discipline (P6-W1, lane R4-W1; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports. Authority: @payswap/capability
 * src/availability.ts + src/observation.ts (P2-W1, accepted).
 *
 * THE TWO-AXIS LAW (old INV-C01/C02; canonical INV-4/INV-7 discipline):
 * - CapabilityState — what the capability itself reports (its own health);
 * - SourceAvailability — whether the source that must confirm it is
 *   reachable.
 *
 * An unreachable or unknown source means the effective availability is
 * UNKNOWN: never success, never failure. UNKNOWN is not FAILED and always
 * requires reconciliation. The pinned resolver below is the canonical
 * matrix, byte-identical in behaviour to the authority's
 * `resolveEffectiveAvailability` (asserted over all nine pairs by
 * test/pins.test.ts).
 */

// ---------------------------------------------------------------------------
// The two availability axes (CREDITED to the capability lane — P2-W1)
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

/**
 * STRUCTURAL PIN — authority: @payswap/capability `CapabilityState`.
 */
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

/**
 * STRUCTURAL PIN — authority: @payswap/capability `SourceAvailability`.
 */
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
export function resolvePinnedEffectiveAvailability(
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

/** Total predicate over the pinned capability-state axis. */
export function isPinnedCapabilityState(
  value: unknown,
): value is PinnedCapabilityState {
  return (
    typeof value === "string" &&
    (PINNED_CAPABILITY_STATES as readonly unknown[]).includes(value)
  );
}

/** Total predicate over the pinned source-availability axis. */
export function isPinnedSourceAvailability(
  value: unknown,
): value is PinnedSourceAvailability {
  return (
    typeof value === "string" &&
    (PINNED_SOURCE_AVAILABILITIES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The observation shape (STRUCTURAL PIN — authority: @payswap/capability
// src/observation.ts `CapabilityObservation`, subset)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/observation.ts `EligibilityObservation`.
 */
export type PinnedEligibilityObservation =
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "UNKNOWN";

/**
 * STRUCTURAL PIN — authority: @payswap/capability `HealthSignal`
 * (subset: the status the Lab search reads).
 */
export interface PinnedHealthSignal {
  readonly status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly lastCheckedAt: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `ObservationProvenance` (subset).
 */
export interface PinnedObservationProvenance {
  readonly providerName: string;
  readonly source: string;
  readonly capturedAt: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/observation.ts `CapabilityObservation` (SUBSET: the two axes, the
 * derived availability, eligibility/health/provenance and the monotonic
 * observation version; the authority's shape additionally carries quota,
 * terms and the INV-14 provider-state envelope — owned by the capability
 * lane, opaque here). The LATEST observation version per instance is the
 * current one; the Lab selection re-derives the effective availability and
 * surfaces any disagreement as UNKNOWN (never success, never failure).
 */
export interface PinnedCapabilityObservation {
  readonly instanceId: string;
  readonly observedAt: string;
  /** Monotonic per-instance observation version. */
  readonly observationVersion: number;
  /** Axis 1: what the capability itself reports. */
  readonly capabilityState: PinnedCapabilityState;
  /** Axis 2: whether the confirming source is reachable. */
  readonly sourceAvailability: PinnedSourceAvailability;
  /** The derived two-axis effective availability. */
  readonly availability: PinnedEffectiveAvailability;
  readonly eligibility: PinnedEligibilityObservation;
  readonly health: PinnedHealthSignal;
  readonly provenance: PinnedObservationProvenance;
}

/**
 * Constructs a pinned observation the way the authority's
 * `observeCapability` does: the two axes are the input, the derived
 * availability is computed HERE via the pinned canonical resolver (a
 * caller-supplied availability is ignored — the derivation is never
 * ambient, never stale). Deterministic pure function; no clock.
 */
export function pinObservation(input: {
  readonly instanceId: string;
  readonly observedAt: string;
  readonly observationVersion: number;
  readonly capabilityState: PinnedCapabilityState;
  readonly sourceAvailability: PinnedSourceAvailability;
  readonly eligibility: PinnedEligibilityObservation;
  readonly health: PinnedHealthSignal;
  readonly provenance: PinnedObservationProvenance;
}): PinnedCapabilityObservation {
  return {
    instanceId: input.instanceId,
    observedAt: input.observedAt,
    observationVersion: input.observationVersion,
    capabilityState: input.capabilityState,
    sourceAvailability: input.sourceAvailability,
    availability: resolvePinnedEffectiveAvailability(
      input.capabilityState,
      input.sourceAvailability,
    ),
    eligibility: input.eligibility,
    health: input.health,
    provenance: input.provenance,
  };
}
