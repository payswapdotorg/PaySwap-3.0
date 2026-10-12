/**
 * Capability state vs source availability (P2-W1; ADAPT of
 * payswap.org@8a735bf packages/capabilities/src/availability.ts).
 *
 * Canonical citation mapping (old -> new): old INV-C01/C02 (two axes) are
 * enforced here as the OBSERVATION discipline of canonical INV-4/INV-7 —
 * external provider state is observation evidence; an ambiguous or
 * unreachable source is NEVER success and NEVER failure.
 *
 * Two SEPARATE axes:
 * - CapabilityState — what the capability itself reports (its own health);
 * - SourceAvailability — whether the source that must confirm it is reachable.
 *
 * An unreachable or unknown source means the effective availability is
 * UNKNOWN: never success, never failure. UNKNOWN is not FAILED and always
 * requires reconciliation. This is a deterministic total function: every
 * (state, source) pair has exactly one result.
 */

export const CAPABILITY_STATES = ['AVAILABLE', 'DEGRADED', 'UNAVAILABLE'] as const;
export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export const SOURCE_AVAILABILITIES = ['REACHABLE', 'UNREACHABLE', 'UNKNOWN'] as const;
export type SourceAvailability = (typeof SOURCE_AVAILABILITIES)[number];

/**
 * The effective availability of a capability. Note: there is deliberately NO
 * 'FAILED' member — external ambiguity can never be converted into failure
 * or success (INV-4 family; see errors.ts ObservationAmbiguityError).
 */
export type EffectiveAvailability =
  | 'AVAILABLE'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

/**
 * Resolve the two axes into one effective availability.
 *
 * - source REACHABLE   -> the capability state governs;
 * - source UNREACHABLE -> UNKNOWN (the state cannot be confirmed);
 * - source UNKNOWN     -> UNKNOWN (never success, never failure).
 */
export function resolveEffectiveAvailability(
  state: CapabilityState,
  source: SourceAvailability,
): EffectiveAvailability {
  switch (source) {
    case 'REACHABLE':
      return state;
    case 'UNREACHABLE':
      return 'UNKNOWN';
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}

/** Structural guard for CapabilityState values from untyped sources. */
export function isCapabilityState(value: unknown): value is CapabilityState {
  return (
    value === 'AVAILABLE' || value === 'DEGRADED' || value === 'UNAVAILABLE'
  );
}

/** Structural guard for SourceAvailability values from untyped sources. */
export function isSourceAvailability(value: unknown): value is SourceAvailability {
  return value === 'REACHABLE' || value === 'UNREACHABLE' || value === 'UNKNOWN';
}
